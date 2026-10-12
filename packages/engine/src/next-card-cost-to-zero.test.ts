/**
 * docs/phase7-wave10-hero-packs.md H3.10: `EffectSpec reduceNextCardCost.toZero` (`LastingEffectBody
 * costReduction.toZero`). Synthetic cards shaped like Recruitment Drive (`hercules` 59023): "Action: Discard
 * Recruitment Drive and choose a player → reduce the resource cost of the next ally that player plays this phase to 0."
 *
 * RRG 1.8 "Lasting Effects" (p. 26): the effect expires at its timing point whether or not it was used. "Modifiers"
 * (p. 29): "if a value is below zero, it is treated as zero". H3.10's reading of what another card adds to the cost
 * (paid on top of the 0) is pinned in the last test; `EffectSpec reduceNextCardCost.toZero` records the open
 * alternative.
 */

import type { CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import { playCostOf } from "./actions.js";
import type { Command, Payment } from "./commands.js";
import { replay, sessionApply, startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { mustPlayer } from "./query.js";
import type { EffectSpec, ValueSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubAlly, stubEvent, stubSupport } from "./testing/fixtures.js";
import { giveCard, RESOURCE } from "./testing/scenario.js";
import { gameAtFirstTurn, P1, P2, playerCardIntoPlay } from "./testing/wave3.js";

const n = (value: number): ValueSpec => ({ kind: "const", value });
const you = { kind: "controller" } as const;
const ALLIES = { categories: ["ally"] } as const;

const action = (id: string, ...effects: EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
/** "Reduce the resource cost of the next ally you play this phase to 0." */
const DRIVE = action("drive", {
  kind: "reduceNextCardCost",
  player: you,
  amount: n(0),
  toZero: true,
  duration: "phase",
  cardFilter: ALLIES,
});
/** "Reduce the cost of the next card you play this phase by 1." */
const TRIM = action("trim", { kind: "reduceNextCardCost", player: you, amount: n(1), duration: "phase" });
/** "The next ally you play this phase costs 2 additional resources." */
const TOLL = action("toll", {
  kind: "reduceNextCardCost",
  player: you,
  amount: n(-2),
  duration: "phase",
  cardFilter: ALLIES,
});
const PLAIN = action("plain");
const EVENTS = [DRIVE, TRIM, TOLL, PLAIN];
/** "Allies cost 1 additional resource to play." */
const TAX_CONSTANT = stubAbility("tax.constant", {
  trigger: { kind: "constant", costModifiers: [{ delta: 1, appliesTo: ALLIES }] },
  effects: [],
});
const TAX = stubSupport({ id: "tax", cost: 0, abilities: [TAX_CONSTANT.ref] });
/** "Allies cost 1 less to play." */
const AID_CONSTANT = stubAbility("aid.constant", {
  trigger: { kind: "constant", costModifiers: [{ delta: -1, appliesTo: ALLIES }] },
  effects: [],
});
const AID = stubSupport({ id: "aid", cost: 0, abilities: [AID_CONSTANT.ref] });

const THUNDER = stubAlly({ id: "thunder", cost: 4, atk: 2, thw: 2, hp: 4 });
const SQUIRE = stubAlly({ id: "squire", cost: 2, atk: 1, thw: 1, hp: 2 });
const TOOL = stubSupport({ id: "tool", cost: 2 });

const deps: EngineDeps = depsOf(TAX_CONSTANT, AID_CONSTANT, ...EVENTS.map((e) => e.ability));

const of = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const reductions = (state: GameState) => state.lastingEffects.filter((e) => e.kind === "costReduction");
const apply = (state: GameState, ...commands: readonly Command[]) => {
  const { session, events } = driveSession(startSession(state), deps, commands);
  return { state: session.state, events, session };
};
const playFree = (state: GameState, card: { card: { id: CardId } }, player: PlayerId = P1) => {
  const given = giveCard(state, player, card.card.id);
  return apply(given.state, {
    type: "playCard",
    playerId: player,
    cardInstanceId: given.id,
    payment: [],
    attachToInstanceId: null,
  }).state;
};
function start(players: 1 | 2 = 1): GameState {
  return gameAtFirstTurn({
    cards: [THUNDER, SQUIRE, TOOL, TAX, AID, ...EVENTS.map((e) => e.card)],
    deps,
    players,
    deck: [THUNDER.id, THUNDER.id, SQUIRE.id, TOOL.id, TAX.id, AID.id, ...EVENTS.map((e) => e.card.id)],
  });
}
/** Plays `card` from `player`'s hand, paying exactly `cost` resource cards. */
function play(
  state: GameState,
  card: CardId,
  cost: number,
  player: PlayerId = P1,
  exclude: readonly InstanceId[] = [],
) {
  const given = giveCard(state, player, card, exclude);
  let current = given.state;
  const payment: Payment[] = [];
  const used: InstanceId[] = [];
  for (let i = 0; i < cost; i++) {
    const resource = giveCard(current, player, RESOURCE.id, used);
    current = resource.state;
    used.push(resource.id);
    payment.push({ fromHand: resource.id });
  }
  const command: Command = {
    type: "playCard",
    playerId: player,
    cardInstanceId: given.id,
    payment,
    attachToInstanceId: null,
  };
  const result = sessionApply(startSession(current), command, deps);
  if (!result.ok) return { ok: false as const, error: result.error, id: given.id };
  const driven = driveSession(result.session, deps);
  return {
    ok: true as const,
    id: given.id,
    state: driven.session.state,
    events: [...result.events, ...driven.events],
    session: driven.session,
  };
}
const mustPlay = (...args: Parameters<typeof play>) => {
  const result = play(...args);
  if (!result.ok) throw new Error(result.error.message);
  return result;
};
/** What a client reads as the price of a copy of `card` in `player`'s hand. */
const priceOf = (state: GameState, card: CardId, player: PlayerId = P1) => {
  const given = giveCard(state, player, card);
  return playCostOf(given.state, player, given.id, deps);
};

describe("H3.10 `reduceNextCardCost` to 0", () => {
  it("is one lasting effect for the named player until the end of the phase", () => {
    expect(reductions(playFree(start(), DRIVE))).toMatchObject([
      {
        kind: "costReduction",
        playerId: P1,
        amount: 0,
        toZero: true,
        cardFilter: ALLIES,
        duration: { kind: "endOfPhase" },
      },
    ]);
  });

  it("a cost-4 ally costs 0, is played with no resources and uses the effect; a second ally that phase costs its full cost", () => {
    const driven = playFree(start(), DRIVE);
    expect(priceOf(driven, THUNDER.id)).toMatchObject({ printed: 4, current: 0, reduction: 4 });
    const first = mustPlay(driven, THUNDER.id, 0);
    expect(mustPlayer(first.state, P1).playArea).toContain(first.id);
    expect(of(first.events, "cardPlayed").find((e) => e.instanceId === first.id)).toMatchObject({ resourcesPaid: 0 });
    expect(of(first.events, "lastingEffectEnded").map((e) => e.reason)).toEqual(["consumed"]);
    expect(reductions(first.state)).toEqual([]);
    expect(priceOf(first.state, SQUIRE.id)).toMatchObject({ printed: 2, current: 2, reduction: 0 });
    expect(play(first.state, SQUIRE.id, 1).ok).toBe(false);
    const second = mustPlay(first.state, SQUIRE.id, 2);
    const replayed = replay(second.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(second.state);
  });

  it("a card that is not an ally is priced in full and leaves the effect waiting", () => {
    const driven = playFree(start(), DRIVE);
    expect(priceOf(driven, TOOL.id)).toMatchObject({ printed: 2, current: 2, reduction: 0 });
    const tool = mustPlay(driven, TOOL.id, 2);
    expect(reductions(tool.state)).toHaveLength(1);
    expect(priceOf(tool.state, THUNDER.id)).toMatchObject({ current: 0 });
  });

  it("unused at the end of the phase it is gone, and next round the ally costs its full cost", () => {
    const driven = playFree(start(), DRIVE);
    const round = apply(driven, { type: "endTurn", playerId: P1 });
    expect(round.state.round).toBe(2);
    expect(reductions(round.state)).toEqual([]);
    expect(of(round.events, "lastingEffectEnded").map((e) => e.reason)).toContain("expired");
    expect(priceOf(round.state, THUNDER.id)).toMatchObject({ printed: 4, current: 4, reduction: 0 });
  });

  it("it is the named player's: another player's ally costs its full cost and does not use it", () => {
    const driven = playFree(start(2), DRIVE);
    const theirs = apply(driven, { type: "endTurn", playerId: P1 }).state;
    expect(theirs.step.phase).toBe("player");
    expect(priceOf(theirs, THUNDER.id, P2)).toMatchObject({ printed: 4, current: 4, reduction: 0 });
    const full = mustPlay(theirs, THUNDER.id, 4, P2);
    expect(reductions(full.state)).toHaveLength(1);
  });

  it("other reductions change nothing: 0 with a 'costs 1 less' in play and a 'next card costs 1 less' waiting, and both waiting effects are used", () => {
    const aided = playerCardIntoPlay(playFree(playFree(start(), DRIVE), TRIM), AID.id).state;
    expect(reductions(aided)).toHaveLength(2);
    expect(priceOf(aided, THUNDER.id)).toMatchObject({ printed: 4, current: 0 });
    const played = mustPlay(aided, THUNDER.id, 0);
    expect(reductions(played.state)).toEqual([]);
  });

  it("H3.10: what another card adds is paid on top of the 0: 1 with 'allies cost 1 additional resource', 2 more with 'the next ally costs 2 additional resources'", () => {
    const taxed = playerCardIntoPlay(playFree(start(), DRIVE), TAX.id).state;
    expect(priceOf(taxed, THUNDER.id)).toMatchObject({ printed: 4, current: 1, reduction: 4 });
    expect(play(taxed, THUNDER.id, 0).ok).toBe(false);
    expect(play(taxed, THUNDER.id, 1).ok).toBe(true);
    const tolled = playFree(taxed, TOLL);
    expect(priceOf(tolled, THUNDER.id)).toMatchObject({ printed: 4, current: 3 });
    expect(play(tolled, THUNDER.id, 2).ok).toBe(false);
    const paid = mustPlay(tolled, THUNDER.id, 3);
    expect(reductions(paid.state)).toEqual([]);
  });

  it("the waiting effect survives a serialization round trip", () => {
    const driven = playFree(start(), DRIVE);
    const loaded = JSON.parse(JSON.stringify(driven)) as GameState;
    expect(loaded).toEqual(driven);
    expect(priceOf(loaded, THUNDER.id)).toMatchObject({ printed: 4, current: 0 });
    expect(play(loaded, THUNDER.id, 0).ok).toBe(true);
  });
});
