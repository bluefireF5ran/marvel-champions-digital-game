/**
 * "You cannot have more than 1 Shapeshift upgrade in play." (Teddy Altman, `cw` 56029b;
 * docs/phase7-wave10-box-heroes.md B3.4): `RuleSpec cannotEnterPlay` with `player`, read from the constant of an
 * identity's alter-ego face. Synthetic cards: an identity whose alter-ego says it of Form upgrades, three Form
 * upgrades, and one upgrade without the trait.
 *
 * Ruling January 11, 2026 - Ruling 1: "Teddy Altman's constant ability prevents playing another Shapeshift upgrade
 * while already having one in play (cannot play a second and discard down)." RRG 1.8 "'Cannot'" (p. 11), "Enters
 * Play" (p. 18), "You, Your" (p. 49). The unscoped rule is driven by `cannot-enter-play.test.ts`.
 */

import { trait, type CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { replay, sessionApply, startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { legalActions } from "./legal.js";
import { locateCard, mustInstance, mustPlayer } from "./query.js";
import { cannotEnterPlay, enterPlayBarMessage } from "./rules.js";
import { cardsInPlay, controllerOf } from "./select.js";
import type { TargetQuery } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubEvent, stubIdentity, stubUpgrade } from "./testing/fixtures.js";
import { DEFAULT_DECK, giveCard, newGame } from "./testing/scenario.js";
import { P1, P2, playerCardIntoPlay } from "./testing/wave3.js";

const FORM = trait("FORM");
const you = { kind: "controller" } as const;
const FORM_UPGRADE: TargetQuery = { categories: ["upgrade"], trait: FORM };

/** "You cannot have more than 1 Form upgrade in play." */
const ONE_FORM = stubAbility("morph.one-form", {
  trigger: {
    kind: "constant",
    rules: [
      {
        kind: "cannotEnterPlay",
        cards: FORM_UPGRADE,
        player: you,
        while: { kind: "exists", query: { ...FORM_UPGRADE, controller: "you" } },
      },
    ],
  },
  effects: [],
});
const MORPH = stubIdentity({
  id: "morph",
  hp: 10,
  atk: 2,
  thw: 2,
  def: 2,
  rec: 3,
  heroHandSize: 5,
  alterEgoHandSize: 6,
  alterEgoAbilities: [ONE_FORM.ref],
});
const WINGS = stubUpgrade({ id: "wings", cost: 0, traits: [FORM] });
const BULK = stubUpgrade({ id: "bulk", cost: 0, traits: [FORM] });
const SCALES = stubUpgrade({ id: "scales", cost: 0, traits: [FORM] });
const GADGET = stubUpgrade({ id: "gadget", cost: 0 });

/** "Put each Form upgrade in your discard pile into play." */
const RECALL_ACTION = stubAbility("recall.action", {
  trigger: { kind: "action" },
  effects: [
    {
      kind: "selectCards",
      slot: "found",
      cards: { kind: "zone", zone: "discard", player: you, filter: FORM_UPGRADE },
    },
    { kind: "putIntoPlay", card: { kind: "slot", slot: "found" }, controller: you },
  ],
});
const RECALL = stubEvent({ id: "recall", cost: 0, abilities: [RECALL_ACTION.ref] });

const deps: EngineDeps = depsOf(ONE_FORM, RECALL_ACTION);
const CARDS = [WINGS, BULK, SCALES, GADGET, RECALL];

const of = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const heroForm = (state: GameState, player: PlayerId = P1): GameState => ({
  ...state,
  players: state.players.map((p) =>
    p.playerId === player ? { ...p, identity: { ...p.identity, form: "hero" as const, heroFormIndex: 0 } } : p,
  ),
});
const start = (players = 1): GameState =>
  newGame({
    identity: MORPH,
    players,
    extraCards: CARDS,
    deck: [...DEFAULT_DECK, ...CARDS.map((card) => card.id)],
    deps,
  });
const playCommand = (player: PlayerId, id: InstanceId): Command => ({
  type: "playCard",
  playerId: player,
  cardInstanceId: id,
  payment: [],
  attachToInstanceId: null,
});
/** Tries to play `card` from `player`'s hand (surgery puts it there). */
function play(state: GameState, card: CardId, player: PlayerId = P1) {
  const given = giveCard(state, player, card);
  const result = sessionApply(startSession(given.state), playCommand(player, given.id), deps);
  if (!result.ok) return { ok: false as const, error: result.error, id: given.id, before: given.state };
  const driven = driveSession(result.session, deps);
  return { ok: true as const, id: given.id, state: driven.session.state, session: driven.session };
}
const playable = (state: GameState, id: InstanceId, player: PlayerId = P1): boolean => {
  const listed = legalActions(state, player, deps);
  if (listed.kind !== "turn") throw new Error(listed.kind);
  return listed.legal.some((a) => a.action.kind === "playCard" && a.action.instanceId === id);
};
const forms = (state: GameState, player: PlayerId = P1) =>
  cardsInPlay(state).filter(
    (id) => controllerOf(state, id) === player && state.cardPool[mustInstance(state, id).cardId]?.type === "upgrade",
  ).length;

describe("box-heroes B3.4: an identity face's 'you cannot have more than 1 [trait] upgrade in play'", () => {
  it("alter-ego with one Form upgrade in play: a second is not a legal play, and the refusal names the face", () => {
    const held = playerCardIntoPlay(start(), WINGS.id);
    const tried = play(held.state, BULK.id);
    expect(tried.ok).toBe(false);
    if (tried.ok) return;
    expect(tried.error.code).toBe("no_valid_target");
    expect(tried.error.message).toBe("morph (alter-ego): bulk cannot enter play");
    expect(mustPlayer(tried.before, P1).hand).toContain(tried.id);
    expect(playable(tried.before, tried.id)).toBe(false);
    expect(cannotEnterPlay(tried.before, deps, tried.id, P1)).toBe(true);
    expect(enterPlayBarMessage(tried.before, deps, tried.id, P1)).toBe("morph (alter-ego): bulk cannot enter play");
    // Asked for no player, a rule limited to one player stops nothing.
    expect(cannotEnterPlay(tried.before, deps, tried.id)).toBe(false);
  });

  it("alter-ego with none in play: the first is offered and enters play, and then the next is refused", () => {
    const given = giveCard(start(), P1, WINGS.id);
    expect(playable(given.state, given.id)).toBe(true);
    const first = play(given.state, WINGS.id);
    if (!first.ok) throw new Error(first.error.message);
    expect(cardsInPlay(first.state)).toContain(first.id);
    expect(forms(first.state)).toBe(1);
    expect(play(first.state, BULK.id).ok).toBe(false);
    const replayed = replay(first.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(first.state);
  });

  it("an upgrade without the trait is played beside a Form upgrade", () => {
    const held = playerCardIntoPlay(start(), WINGS.id);
    const run = play(held.state, GADGET.id);
    expect(run.ok).toBe(true);
    if (run.ok) expect(forms(run.state)).toBe(2);
  });

  it("in hero form the face is down: a second and a third are played, and the rule discards nothing on the flip back", () => {
    const held = playerCardIntoPlay(heroForm(start()), WINGS.id);
    const second = play(held.state, BULK.id);
    if (!second.ok) throw new Error(second.error.message);
    const third = play(second.state, SCALES.id);
    if (!third.ok) throw new Error(third.error.message);
    expect(forms(third.state)).toBe(3);
    const back = driveSession(startSession(third.state), deps, [{ type: "changeForm", playerId: P1 }]).session.state;
    expect(mustPlayer(back, P1).identity.form).toBe("alterEgo");
    expect(forms(back)).toBe(3);
  });

  it("an effect that would put a second into play does nothing to it: it stays in the discard pile", () => {
    const held = playerCardIntoPlay(start(), WINGS.id);
    const given = giveCard(held.state, P1, BULK.id);
    const discarded: GameState = {
      ...given.state,
      players: given.state.players.map((p) =>
        p.playerId === P1
          ? { ...p, hand: p.hand.filter((id) => id !== given.id), discard: [given.id, ...p.discard] }
          : p,
      ),
    };
    const recall = giveCard(discarded, P1, RECALL.id);
    const run = driveSession(startSession(recall.state), deps, [playCommand(P1, recall.id)]);
    expect(locateCard(run.session.state, given.id)).toEqual({ kind: "discard", playerId: P1 });
    expect(of(run.events, "putIntoPlayRefused")).toEqual([
      { type: "putIntoPlayRefused", instanceId: given.id, playerId: P1, reason: "cannotEnterPlay" },
    ]);
    // With none in play the same effect puts it into play.
    const empty = giveCard(
      {
        ...discarded,
        players: discarded.players.map((p) => ({ ...p, playArea: p.playArea.filter((id) => id !== held.id) })),
      },
      P1,
      RECALL.id,
    );
    const free = driveSession(startSession(empty.state), deps, [playCommand(P1, empty.id)]);
    expect(cardsInPlay(free.session.state)).toContain(given.id);
  });

  it("two players: one player's Form upgrade stops only that player's second", () => {
    const held = playerCardIntoPlay(start(2), WINGS.id, P1);
    // Player 2 has the same sentence and no Form upgrade: theirs is not stopped by player 1's.
    const theirs = giveCard(held.state, P2, WINGS.id);
    expect(cannotEnterPlay(theirs.state, deps, theirs.id, P2)).toBe(false);
    expect(cannotEnterPlay(theirs.state, deps, theirs.id, P1)).toBe(true);
    const turn = driveSession(startSession(theirs.state), deps, [{ type: "endTurn", playerId: P1 }]).session.state;
    expect(playable(turn, theirs.id, P2)).toBe(true);
    const played = sessionApply(startSession(turn), playCommand(P2, theirs.id), deps);
    if (!played.ok) throw new Error(played.error.message);
    const after = driveSession(played.session, deps).session.state;
    expect(forms(after, P1)).toBe(1);
    expect(forms(after, P2)).toBe(1);
    // And now their own second is stopped, in their face's name.
    const next = giveCard(after, P2, BULK.id);
    const refused = sessionApply(startSession(next.state), playCommand(P2, next.id), deps);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.message).toBe("morph (alter-ego) p2: bulk cannot enter play");
  });
});
