/**
 * docs/phase7-wave10-hero-packs.md H3.3: where a card of an identity's separate deck of encounter cards goes when it
 * leaves play, or cannot enter it (Hercules's Labor cards). Synthetic cards only (`testing/owned-encounter-deck.ts`).
 *
 * RRG 1.8 FAQ, "Hercules Hero Pack – Labor Cards" (p. 65): "Q: What happens if a labor card fails to find a target when
 * it is revealed? A: That Labor card is discarded. Any time a Labor card leaves play other than being placed in the
 * victory display, place it on the bottom of the Labor deck." Ruling March 6, 2026 – Ruling 3 (2): "If a Labor card
 * cannot enter play, place it on the bottom of the Labor deck." The two agree on where the card ends; the FAQ is the
 * later text and also says it is discarded, which the owner chose to honor (docs/phase7-wave10.md §4.0, question
 * 3 = B): the discard is logged (`revealedCardDiscarded`), then the card goes to the bottom of its deck
 * (`returnedToSeparateDeck`).
 *
 * RRG 1.8 "Victory X" (p. 46): "An attachment or upgrade with the victory X keyword is placed in the victory display
 * when the card to which it is attached is defeated"; "A card with both the victory X and uses (X 'type') keywords is
 * placed in the victory display when its last all-purpose counter is removed from it."
 */

import { describe, expect, it } from "vitest";
import { applyCommand, replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { activeEncounterDeck, locateCard, maxHitPoints, mustInstance, mustPlayer } from "./query.js";
import { cardsInPlay } from "./select.js";
import type { GameState } from "./state.js";
import { runCommands } from "./testing/drive.js";
import {
  CLEAR_SCHEMES,
  DEFEAT_MINIONS,
  DISCARD_MINIONS,
  DISCARD_TASKS,
  OGRE,
  P1,
  PLOT,
  REVEAL,
  SPEND_LABOR,
  TASK,
  TASK_BEAST,
  TASK_PLOT,
  TASK_WATCH,
  cardIdsOf,
  deps,
  ofType,
  only,
  taskDeck,
  taskGame,
  use,
} from "./testing/owned-encounter-deck.js";

const TASK_ZONE = { kind: "separateDeck", playerId: P1, name: TASK } as const;
/** No pile a discard could reach holds the card. */
function inNoDiscardPile(state: GameState, id: InstanceId): boolean {
  const player = mustPlayer(state, P1);
  const piles = [
    ...player.discard,
    ...player.hand,
    ...player.deck,
    ...Object.values(player.separateDecks).flatMap((deck) => deck.discard),
    ...Object.values(state.encounterDecks).flatMap((deck) => [...deck.deck, ...deck.discard]),
  ];
  return !piles.includes(id);
}
const returns = (events: readonly GameEvent[]) =>
  ofType(events, "returnedToSeparateDeck").map((e) => [e.cardId, e.name, e.instead]);

describe("H3.3 a card of a separate deck of encounter cards that cannot enter play", () => {
  it("an attachment whose When Revealed finds no host is discarded, said so in the log, and placed on the bottom of its deck", () => {
    // No Big minion anywhere: nothing for the attachment to find.
    const start = taskGame([TASK_BEAST, TASK_WATCH, TASK_PLOT]);
    const { state, events } = runCommands(start, deps, use(start, REVEAL));
    const beast = only(state, TASK_BEAST);
    // Back to three cards, the unattached one last.
    expect(cardIdsOf(state, taskDeck(state))).toEqual([TASK_WATCH.id, TASK_PLOT.id, TASK_BEAST.id]);
    expect(locateCard(state, beast)).toEqual(TASK_ZONE);
    expect(mustInstance(state, beast)).toMatchObject({ ownerId: P1, controllerId: null, faceup: false });
    expect(inNoDiscardPile(state, beast)).toBe(true);
    expect(cardsInPlay(state)).not.toContain(beast);
    expect(state.victoryDisplay).toEqual([]);
    // The discard is announced, then replaced by the bottom of the deck, then the card moves.
    expect(ofType(events, "revealedCardDiscarded")).toEqual([
      { type: "revealedCardDiscarded", instanceId: beast, cardId: TASK_BEAST.id, playerId: P1, reason: "notAttached" },
    ]);
    expect(ofType(events, "returnedToSeparateDeck")).toEqual([
      {
        type: "returnedToSeparateDeck",
        instanceId: beast,
        cardId: TASK_BEAST.id,
        playerId: P1,
        name: TASK,
        instead: "separateDiscard",
      },
    ]);
    const story = events
      .filter((e) => "instanceId" in e && e.instanceId === beast)
      .map((e) => (e.type === "cardMoved" ? `cardMoved:${e.to.kind}` : e.type));
    expect(story.slice(-3)).toEqual(["revealedCardDiscarded", "returnedToSeparateDeck", "cardMoved:separateDeck"]);
    // It never entered play, so nothing left play.
    expect(ofType(events, "cardDiscardedFromPlay")).toEqual([]);
  });

  it("the reveal may be used again at once, and turns up the next card", () => {
    const start = taskGame([TASK_BEAST, TASK_WATCH, TASK_PLOT]);
    const first = runCommands(start, deps, use(start, REVEAL)).state;
    const { state } = runCommands(first, deps, use(first, REVEAL));
    const watch = only(state, TASK_WATCH);
    expect(locateCard(state, watch)).toEqual({ kind: "playArea", playerId: P1 });
    expect(mustInstance(state, watch).counters).toEqual({ labor: 3 });
    expect(cardIdsOf(state, taskDeck(state))).toEqual([TASK_PLOT.id, TASK_BEAST.id]);
  });
});

describe("H3.3 the three ways to the victory display", () => {
  it("its minion defeated: the attachment is in the victory display, the minion in the encounter discard pile", () => {
    const start = taskGame([TASK_BEAST, TASK_WATCH, TASK_PLOT], { encounter: [OGRE.id] });
    const attached = runCommands(start, deps, use(start, REVEAL)).state;
    const beast = only(attached, TASK_BEAST);
    const ogre = only(attached, OGRE);
    expect(maxHitPoints(attached, ogre, deps)).toBe(12);
    const { state, events } = runCommands(attached, deps, use(attached, DEFEAT_MINIONS));
    expect(state.victoryDisplay).toEqual([beast]);
    expect(locateCard(state, beast)).toEqual({ kind: "victoryDisplay" });
    expect(activeEncounterDeck(state).discard).toContain(ogre);
    expect(mustInstance(state, beast)).toMatchObject({ ownerId: P1, controllerId: null, attachedTo: null });
    expect(cardIdsOf(state, taskDeck(state))).toEqual([TASK_WATCH.id, TASK_PLOT.id]);
    expect(returns(events)).toEqual([]);
    // With no Task card in play the reveal is open again.
    expect(applyCommand(state, use(state, REVEAL), deps).ok).toBe(true);
  });

  it("its side scheme defeated: the attachment is in the victory display", () => {
    const start = taskGame([TASK_PLOT, TASK_WATCH, TASK_BEAST], { encounter: [PLOT.id] });
    const attached = runCommands(start, deps, use(start, REVEAL)).state;
    const task = only(attached, TASK_PLOT);
    const plot = only(attached, PLOT);
    expect(mustInstance(attached, plot)).toMatchObject({ threat: 3, attachments: [task] });
    const { state, events } = runCommands(attached, deps, use(attached, CLEAR_SCHEMES));
    expect(state.victoryDisplay).toEqual([task]);
    expect(activeEncounterDeck(state).discard).toContain(plot);
    expect(cardIdsOf(state, taskDeck(state))).toEqual([TASK_WATCH.id, TASK_BEAST.id]);
    expect(returns(events)).toEqual([]);
  });

  it("its last counter removed: the obligation is in the victory display, and never in a discard pile", () => {
    const start = taskGame([TASK_WATCH, TASK_BEAST, TASK_PLOT]);
    let state = runCommands(start, deps, use(start, REVEAL)).state;
    const watch = only(state, TASK_WATCH);
    const all: GameEvent[] = [];
    for (const left of [2, 1]) {
      const spent = runCommands(state, deps, use(state, SPEND_LABOR));
      state = spent.state;
      all.push(...spent.events);
      expect(mustInstance(state, watch).counters).toEqual({ labor: left });
      expect(locateCard(state, watch)).toEqual({ kind: "playArea", playerId: P1 });
    }
    const last = runCommands(state, deps, use(state, SPEND_LABOR));
    all.push(...last.events);
    expect(last.state.victoryDisplay).toEqual([watch]);
    expect(mustPlayer(last.state, P1).playArea).not.toContain(watch);
    expect(inNoDiscardPile(last.state, watch)).toBe(true);
    expect(cardIdsOf(last.state, taskDeck(last.state))).toEqual([TASK_BEAST.id, TASK_PLOT.id]);
    expect(returns(all)).toEqual([]);
    const moves = ofType(all, "cardMoved").filter((e) => e.instanceId === watch);
    expect(moves.map((e) => e.to.kind)).toEqual(["victoryDisplay"]);
  });
});

describe("H3.3 every other departure ends on the bottom of the deck", () => {
  it("its minion discarded, not defeated: the attachment is on the bottom of the deck and the victory display is unchanged", () => {
    const start = taskGame([TASK_BEAST, TASK_WATCH, TASK_PLOT], { encounter: [OGRE.id] });
    const attached = runCommands(start, deps, use(start, REVEAL)).state;
    const beast = only(attached, TASK_BEAST);
    const ogre = only(attached, OGRE);
    const { state, events } = runCommands(attached, deps, use(attached, DISCARD_MINIONS));
    expect(cardIdsOf(state, taskDeck(state))).toEqual([TASK_WATCH.id, TASK_PLOT.id, TASK_BEAST.id]);
    expect(state.victoryDisplay).toEqual([]);
    expect(activeEncounterDeck(state).discard).toContain(ogre);
    expect(inNoDiscardPile(state, beast)).toBe(true);
    expect(mustInstance(state, beast)).toMatchObject({
      ownerId: P1,
      controllerId: null,
      faceup: false,
      attachedTo: null,
    });
    expect(returns(events)).toEqual([[TASK_BEAST.id, TASK, "separateDiscard"]]);
  });

  it("a player card discards the attachment or the obligation: bottom of the deck, facedown, its counters gone", () => {
    const beastGame = taskGame([TASK_BEAST, TASK_WATCH, TASK_PLOT], { encounter: [OGRE.id] });
    const attached = runCommands(beastGame, deps, use(beastGame, REVEAL)).state;
    const off = runCommands(attached, deps, use(attached, DISCARD_TASKS));
    const ogre = only(off.state, OGRE);
    expect(cardIdsOf(off.state, taskDeck(off.state))).toEqual([TASK_WATCH.id, TASK_PLOT.id, TASK_BEAST.id]);
    // The minion stays in play, back at its printed 6 hit points.
    expect(cardsInPlay(off.state)).toContain(ogre);
    expect(mustInstance(off.state, ogre).attachments).toEqual([]);
    expect(maxHitPoints(off.state, ogre, deps)).toBe(6);
    expect(off.state.victoryDisplay).toEqual([]);
    expect(returns(off.events)).toEqual([[TASK_BEAST.id, TASK, "separateDiscard"]]);

    const watchGame = taskGame([TASK_WATCH, TASK_BEAST, TASK_PLOT]);
    const inPlay = runCommands(watchGame, deps, use(watchGame, REVEAL)).state;
    const watch = only(inPlay, TASK_WATCH);
    const { state, events } = runCommands(inPlay, deps, use(inPlay, DISCARD_TASKS));
    expect(cardIdsOf(state, taskDeck(state))).toEqual([TASK_BEAST.id, TASK_PLOT.id, TASK_WATCH.id]);
    expect(mustInstance(state, watch)).toMatchObject({ faceup: false, counters: {}, controllerId: null });
    expect(state.victoryDisplay).toEqual([]);
    expect(inNoDiscardPile(state, watch)).toBe(true);
    expect(returns(events)).toEqual([[TASK_WATCH.id, TASK, "separateDiscard"]]);
    expect(ofType(events, "cardDiscardedFromPlay").map((e) => e.instanceId)).toEqual([watch]);
    // Revealed again later, it starts over with its 3 counters.
    const again: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === P1 ? { ...p, separateDecks: { ...p.separateDecks, [TASK]: { deck: [watch], discard: [] } } } : p,
      ),
    };
    const back = runCommands(again, deps, use(again, REVEAL)).state;
    expect(mustInstance(back, watch)).toMatchObject({ faceup: true, counters: { labor: 3 }, controllerId: null });
  });

  it("replays a game that failed a reveal, sent a card to the victory display and another to the bottom of the deck", () => {
    const start = taskGame([TASK_PLOT, TASK_BEAST, TASK_WATCH], { encounter: [OGRE.id] });
    // No side scheme: Plot is discarded to the bottom. Then Beast finds the ogre, and the ogre is defeated.
    const failed = runCommands(start, deps, use(start, REVEAL));
    const second = runCommands(failed.state, deps, use(failed.state, REVEAL));
    const { session, events } = runCommands(
      start,
      deps,
      use(start, REVEAL),
      use(failed.state, REVEAL),
      use(second.state, DEFEAT_MINIONS),
      use(second.state, REVEAL),
      use(second.state, DISCARD_TASKS),
    );
    const state = session.state;
    expect(state.victoryDisplay).toEqual([only(state, TASK_BEAST)]);
    expect(cardIdsOf(state, taskDeck(state))).toEqual([TASK_PLOT.id, TASK_WATCH.id]);
    expect(returns(events)).toEqual([
      [TASK_PLOT.id, TASK, "separateDiscard"],
      [TASK_WATCH.id, TASK, "separateDiscard"],
    ]);
    const replayed = replay(session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(session.state);
  });
});
