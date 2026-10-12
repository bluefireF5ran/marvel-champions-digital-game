/**
 * docs/phase7-wave10-hero-packs.md H3.2: revealing the top card of an identity's separate deck of encounter cards, and
 * an attachment revealed with no "attach to" text. Synthetic cards only (`testing/owned-encounter-deck.ts`).
 *
 * Hercules 59001b: "New Labors of Hercules — Action: If there is no labor card in play, reveal the top card of the
 * labor deck." RRG 1.8 "Reveal" (p. 38): "If a player is instructed by card text to reveal an encounter card from the
 * encounter deck or any other game area, this same resolution procedure applies." Step 2: an obligation "enters play
 * in the play area of the player revealing it"; an attachment with no attach-to text is placed "on the table in front
 * of the player revealing it. (It is not in play.)" Ruling February 20, 2026 – Ruling 4: "If an attachment lacks
 * 'attach to' text, it attaches when its 'When Revealed' ability triggers". RRG 1.8 "Quickstrike" (p. 36): "After a
 * minion with the quickstrike keyword engages a player whose identity is in hero form, that minion attacks that
 * player"; "Surge" (p. 42).
 */

import { describe, expect, it } from "vitest";
import { applyCommand, replay } from "./engine.js";
import { legalActions } from "./legal.js";
import { activeEncounterDeck, locateCard, maxHitPoints, mustInstance, mustPlayer } from "./query.js";
import { cardsInPlay, resolveValue } from "./select.js";
import type { GameState } from "./state.js";
import { runCommands } from "./testing/drive.js";
import {
  OGRE,
  P1,
  REVEAL,
  REVEAL_AS_HERO,
  SURGING_OGRE,
  SWIFT_OGRE,
  TASK,
  TASK_BEAST,
  TASK_PLOT,
  TASK_WATCH,
  PLOT,
  asHero,
  cardIdsOf,
  deps,
  ofType,
  only,
  storyOf,
  taskDeck,
  taskGame,
  use,
} from "./testing/owned-encounter-deck.js";

const mainThreat = (state: GameState) => mustInstance(state, state.mainScheme.instanceId).threat;
const offered = (state: GameState, abilityId: string): boolean => {
  const actions = legalActions(state, P1, deps);
  return (
    actions.kind === "turn" &&
    actions.legal.some((a) => a.action.kind === "useAbility" && a.action.abilityId === abilityId)
  );
};
const verdict = (state: GameState): string => {
  const result = applyCommand(state, use(state, REVEAL), deps);
  return result.ok ? "ok" : result.error.code;
};
const context = (state: GameState) => ({
  selfInstanceId: mustPlayer(state, P1).identity.instanceId,
  controllerId: P1,
  event: null,
  bindings: {},
  deps,
});
const taskCount = (state: GameState): number =>
  resolveValue(state, { kind: "deckCount", player: { kind: "controller" }, separateDeck: TASK }, context(state), deps);

describe("H3.2 revealing the top card of a separate deck of encounter cards", () => {
  it("an obligation on top: it leaves the deck, enters its revealer's play area with its 3 counters, and its When Revealed resolves", () => {
    const start = taskGame([TASK_WATCH, TASK_BEAST, TASK_PLOT]);
    expect(offered(start, REVEAL.ref.id)).toBe(true);
    expect(taskCount(start)).toBe(3);
    const { state, events } = runCommands(start, deps, use(start, REVEAL));
    const watch = only(state, TASK_WATCH);
    expect(cardIdsOf(state, taskDeck(state))).toEqual([TASK_BEAST.id, TASK_PLOT.id]);
    expect(taskCount(state)).toBe(2);
    expect(locateCard(state, watch)).toEqual({ kind: "playArea", playerId: P1 });
    expect(mustInstance(state, watch)).toMatchObject({
      ownerId: P1,
      controllerId: null,
      faceup: true,
      counters: { labor: 3 },
    });
    expect(mainThreat(state)).toBe(1);
    // Out of the deck to the revealing player, turned faceup, into play, its counters, then its When Revealed.
    expect(storyOf(events, watch)).toEqual([
      "cardMoved",
      "encounterCardRevealed",
      "cardMoved",
      "counterAdded",
      "abilityResolved",
    ]);
    const moves = ofType(events, "cardMoved").filter((e) => e.instanceId === watch);
    expect(moves.map((e) => [e.from?.kind, e.to.kind])).toEqual([
      ["separateDeck", "dealtEncounter"],
      ["dealtEncounter", "playArea"],
    ]);
    expect(ofType(events, "encounterCardRevealed")).toEqual([
      { type: "encounterCardRevealed", instanceId: watch, cardId: TASK_WATCH.id, playerId: P1 },
    ]);
    // The rest of the deck stays facedown.
    for (const id of taskDeck(state)) expect(mustInstance(state, id).faceup).toBe(false);
  });

  it("is not offered a second time while a Task card is in play, nor in hero form, nor with the deck empty", () => {
    const start = taskGame([TASK_WATCH, TASK_BEAST, TASK_PLOT]);
    const revealed = runCommands(start, deps, use(start, REVEAL)).state;
    expect(offered(revealed, REVEAL.ref.id)).toBe(false);
    expect(verdict(revealed)).toBe("no_valid_target");
    expect(taskDeck(revealed)).toHaveLength(2);

    // Hero form: the alter-ego action is not his to use.
    expect(offered(asHero(start), REVEAL.ref.id)).toBe(false);
    expect(verdict(asHero(start))).not.toBe("ok");

    // An empty deck has no top card to reveal.
    const empty: GameState = {
      ...start,
      players: start.players.map((p) =>
        p.playerId === P1 ? { ...p, separateDecks: { ...p.separateDecks, [TASK]: { deck: [], discard: [] } } } : p,
      ),
    };
    expect(taskCount(empty)).toBe(0);
    expect(offered(empty, REVEAL.ref.id)).toBe(false);
    expect(verdict(empty)).toBe("no_valid_target");
  });

  it("an attachment with no attach line waits in front of its revealer, out of play, until its own When Revealed attaches it", () => {
    const start = taskGame([TASK_BEAST, TASK_WATCH, TASK_PLOT], { encounter: [OGRE.id] });
    const { state, events } = runCommands(start, deps, use(start, REVEAL));
    const beast = only(state, TASK_BEAST);
    const ogre = only(state, OGRE);
    // The probe in its When Revealed saw the card out of play: no 5 threat.
    expect(mainThreat(state)).toBe(0);
    const moves = ofType(events, "cardMoved").filter((e) => e.instanceId === beast);
    expect(moves.map((e) => [e.from?.kind, e.to.kind])).toEqual([
      ["separateDeck", "dealtEncounter"],
      ["dealtEncounter", "attachment"],
    ]);
    // Attached, it is in play on the minion it found, under no player's control.
    expect(cardsInPlay(state)).toContain(beast);
    expect(mustInstance(state, beast)).toMatchObject({
      ownerId: P1,
      controllerId: null,
      faceup: true,
      attachedTo: ogre,
    });
    expect(mustInstance(state, ogre)).toMatchObject({ engagedWith: P1, attachments: [beast] });
    expect(maxHitPoints(state, ogre, deps)).toBe(12);
    expect(mustPlayer(state, P1).dealtEncounter).toEqual([]);
    expect(cardIdsOf(state, taskDeck(state))).toEqual([TASK_WATCH.id, TASK_PLOT.id]);
    expect(activeEncounterDeck(state).deck).not.toContain(ogre);
  });

  it("an attachment that finds a side scheme attaches to it as the scheme enters play", () => {
    const start = taskGame([TASK_PLOT, TASK_WATCH, TASK_BEAST], { encounter: [PLOT.id] });
    const { state } = runCommands(start, deps, use(start, REVEAL));
    const plot = only(state, PLOT);
    const task = only(state, TASK_PLOT);
    expect(state.villainArea).toContain(plot);
    expect(mustInstance(state, plot)).toMatchObject({ threat: 3, attachments: [task] });
    expect(mustInstance(state, task)).toMatchObject({ ownerId: P1, controllerId: null, attachedTo: plot });
  });

  it("a minion the reveal brings in with quickstrike attacks a hero at once, and not an alter-ego", () => {
    // Alter-ego form: the minion engages and does not attack (RRG 1.8 "Quickstrike", p. 36).
    const quiet = taskGame([TASK_BEAST], { encounter: [SWIFT_OGRE.id] });
    const calm = runCommands(quiet, deps, use(quiet, REVEAL));
    const calmIdentity = mustPlayer(calm.state, P1).identity.instanceId;
    expect(mustInstance(calm.state, calmIdentity).damage).toBe(0);
    expect(mustInstance(calm.state, only(calm.state, SWIFT_OGRE)).engagedWith).toBe(P1);

    // Hero form: ATK 2 against DEF 2 undefended is 2 damage.
    const hero = asHero(taskGame([TASK_BEAST], { encounter: [SWIFT_OGRE.id] }));
    const struck = runCommands(hero, deps, use(hero, REVEAL_AS_HERO)).state;
    const identity = mustPlayer(struck, P1).identity.instanceId;
    expect(mustInstance(struck, identity).damage).toBe(2);
    const ogre = only(struck, SWIFT_OGRE);
    expect(mustInstance(struck, ogre).attachments).toEqual([only(struck, TASK_BEAST)]);
    expect(maxHitPoints(struck, ogre, deps)).toBe(12);
  });

  it("a minion the reveal brings in with surge deals its revealer one facedown encounter card", () => {
    const start = taskGame([TASK_BEAST], { encounter: [SURGING_OGRE.id] });
    const before = activeEncounterDeck(start).deck.length;
    const { state } = runCommands(start, deps, use(start, REVEAL));
    const dealt = mustPlayer(state, P1).dealtEncounter;
    expect(dealt).toHaveLength(1);
    expect(mustInstance(state, dealt[0]!).faceup).toBe(false);
    // The minion and the surge's card left the encounter deck.
    expect(activeEncounterDeck(state).deck).toHaveLength(before - 2);
    expect(mustInstance(state, only(state, SURGING_OGRE)).attachments).toEqual([only(state, TASK_BEAST)]);
  });

  it("replays to the same state", () => {
    const start = taskGame([TASK_BEAST, TASK_WATCH, TASK_PLOT], { encounter: [OGRE.id] });
    const { session } = runCommands(start, deps, use(start, REVEAL), { type: "endTurn", playerId: P1 });
    const replayed = replay(session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(session.state);
  });
});
