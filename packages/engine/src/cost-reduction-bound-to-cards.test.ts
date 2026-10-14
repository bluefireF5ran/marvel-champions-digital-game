/**
 * docs/phase7-wave10-hero-packs.md H3.11: `EffectSpec reduceNextCardCost.cards` (`LastingEffectBody
 * costReduction.cardInstanceId`), a cost reduction bound to the cards a search found. Synthetic cards shaped like
 * Evaluate Threat (`hercules` 59028): "When Defeated: Each player may search their deck and discard pile for an Avenger
 * or S.H.I.E.L.D. card and add it to their hand. Reduce the cost to play each of those cards by 2 until the end of the
 * phase."
 *
 * Rulings June 2, 2026 – Ruling 2 (4): "Evaluate Threat reduces the cost for the next time it is played that phase,
 * even if bounced"; July 9, 2026 – Ruling 3 (3): "Evaluate Threat reduces cost for the **next time** it is played, not
 * repeatedly." RRG 1.8 "Lasting Effects" (p. 26): the effect expires at its timing point whether or not it was used.
 */

import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import { playCostOf } from "./actions.js";
import type { Command, Payment } from "./commands.js";
import { replay, sessionApply, startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec, ValueSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubAlly, stubEvent } from "./testing/fixtures.js";
import { defaultPick, giveCard, RESOURCE } from "./testing/scenario.js";
import { gameAtFirstTurn, P1, P2 } from "./testing/wave3.js";

const n = (value: number): ValueSpec => ({ kind: "const", value });
const you = { kind: "controller" } as const;
const thatPlayer = { kind: "scoped" } as const;
const found = { kind: "slot", slot: "found" } as const;

/** One player's part: search your deck for a scout, add it to your hand, and its cost is 2 less this phase. */
const search = (player: typeof you | typeof thatPlayer): EffectSpec[] => [
  {
    kind: "chooseCards",
    slot: "found",
    from: { kind: "zone", zone: "deck", player, filter: { name: "scout" } },
    chooser: player,
    min: 0,
    max: 1,
  },
  { kind: "moveCards", cards: { kind: "ref", ref: found }, to: "hand" },
  { kind: "reduceNextCardCost", player, amount: n(2), duration: "phase", cards: found },
];
const action = (id: string, ...effects: EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
/** "Search your deck for a scout and add it to your hand. Reduce the cost to play that card by 2 until the end of the phase." */
const REPORT = action("report", ...search(you));
/** "Each player may search their deck for a scout …. Reduce the cost to play each of those cards by 2 …" */
const BRIEFING = action("briefing", { kind: "forEachPlayer", players: { kind: "each" }, effects: search(thatPlayer) });
const EVENTS = [REPORT, BRIEFING];

const SCOUT = stubAlly({ id: "scout", cost: 3, atk: 2, thw: 1, hp: 2 });
const RUNNER = stubAlly({ id: "runner", cost: 3, atk: 1, thw: 1, hp: 2 });

const deps: EngineDeps = depsOf(...EVENTS.map((e) => e.ability));

const of = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const reductions = (state: GameState) => state.lastingEffects.filter((e) => e.kind === "costReduction");
/** Answers a card search with the first card offered, everything else by default. */
const takeFirst = (state: GameState): readonly string[] => {
  const choice = state.pendingChoice;
  return choice?.prompt.kind === "chooseCards" ? choice.options.slice(0, 1).map((o) => o.optionId) : defaultPick(state);
};
const apply = (state: GameState, ...commands: readonly Command[]) => {
  const { session, events } = driveSession(startSession(state), deps, commands, takeFirst);
  return { state: session.state, events, session };
};
function start(players: 1 | 2 = 1): GameState {
  return gameAtFirstTurn({
    cards: [SCOUT, RUNNER, ...EVENTS.map((e) => e.card)],
    deps,
    players,
    deck: [SCOUT.id, SCOUT.id, RUNNER.id, ...EVENTS.map((e) => e.card.id)],
  });
}
/** No scout in any hand: both copies are in each deck for the search. */
function scoutsInDeck(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      const scouts = p.hand.filter((id) => mustInstance(state, id).cardId === SCOUT.id);
      return { ...p, hand: p.hand.filter((id) => !scouts.includes(id)), deck: [...scouts, ...p.deck] };
    }),
  };
}
/** Plays the search event; returns the state and the scout each player found. */
function searched(event: (typeof EVENTS)[number], players: 1 | 2 = 1) {
  const base = scoutsInDeck(start(players));
  const given = giveCard(base, P1, event.card.id);
  const run = apply(given.state, {
    type: "playCard",
    playerId: P1,
    cardInstanceId: given.id,
    payment: [],
    attachToInstanceId: null,
  });
  const scoutOf = (player: PlayerId): InstanceId =>
    mustPlayer(run.state, player).hand.find((id) => mustInstance(run.state, id).cardId === SCOUT.id)!;
  return { ...run, scoutOf };
}
/** Plays the card instance `id` from `player`'s hand, paying exactly `cost` resource cards. */
function play(state: GameState, id: InstanceId, cost: number, player: PlayerId = P1) {
  let current = state;
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
    cardInstanceId: id,
    payment,
    attachToInstanceId: null,
  };
  const result = sessionApply(startSession(current), command, deps);
  if (!result.ok) return { ok: false as const, error: result.error };
  const driven = driveSession(result.session, deps);
  return {
    ok: true as const,
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
const priceOf = (state: GameState, id: InstanceId, player: PlayerId = P1) => playCostOf(state, player, id, deps);
/** Surgery: the card goes from wherever its owner has it to that zone of theirs. */
function moveTo(state: GameState, id: InstanceId, zone: "hand" | "discard"): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      const without = {
        ...p,
        hand: p.hand.filter((i) => i !== id),
        discard: p.discard.filter((i) => i !== id),
        playArea: p.playArea.filter((i) => i !== id),
      };
      return mustInstance(state, id).ownerId === p.playerId ? { ...without, [zone]: [...without[zone], id] } : without;
    }),
  };
}

describe("H3.11 a cost reduction bound to the cards a search found", () => {
  it("is one lasting effect naming the found card, until the end of the phase; a found cost-3 ally costs 1", () => {
    const { state, scoutOf } = searched(REPORT);
    const scout = scoutOf(P1);
    expect(reductions(state)).toMatchObject([
      { kind: "costReduction", playerId: P1, amount: 2, cardInstanceId: scout, duration: { kind: "endOfPhase" } },
    ]);
    expect(reductions(state)[0]).not.toHaveProperty("cardFilter");
    expect(priceOf(state, scout)).toMatchObject({ printed: 3, current: 1, reduction: 2 });
    expect(play(state, scout, 0).ok).toBe(false);
    const played = mustPlay(state, scout, 1);
    expect(of(played.events, "cardPlayed").find((e) => e.instanceId === scout)).toMatchObject({ resourcesPaid: 1 });
    expect(of(played.events, "lastingEffectEnded").map((e) => e.reason)).toEqual(["consumed"]);
    const replayed = replay(played.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(played.state);
  });

  it("it is that card's alone: another copy and another ally cost 3, and playing one of them leaves it waiting", () => {
    const { state, scoutOf } = searched(REPORT);
    const scout = scoutOf(P1);
    const copy = giveCard(state, P1, SCOUT.id, [scout]);
    expect(priceOf(copy.state, copy.id)).toMatchObject({ printed: 3, current: 3, reduction: 0 });
    const runner = giveCard(copy.state, P1, RUNNER.id);
    expect(priceOf(runner.state, runner.id)).toMatchObject({ printed: 3, current: 3, reduction: 0 });
    expect(play(runner.state, copy.id, 1).ok).toBe(false);
    const full = mustPlay(runner.state, copy.id, 3);
    expect(reductions(full.state)).toHaveLength(1);
    expect(priceOf(full.state, scout)).toMatchObject({ current: 1 });
  });

  it("discarded and returned to hand the same phase, then played: still 1 (ruling June 2, 2026 – Ruling 2 (4))", () => {
    const { state, scoutOf } = searched(REPORT);
    const scout = scoutOf(P1);
    const discarded = moveTo(state, scout, "discard");
    expect(reductions(discarded)).toHaveLength(1);
    const back = moveTo(discarded, scout, "hand");
    expect(priceOf(back, scout)).toMatchObject({ printed: 3, current: 1, reduction: 2 });
    expect(mustPlay(back, scout, 1).state.lastingEffects.filter((e) => e.kind === "costReduction")).toEqual([]);
  });

  it("played, returned to hand and played again the same phase: 1, then 3 (ruling July 9, 2026 – Ruling 3 (3))", () => {
    const { state, scoutOf } = searched(REPORT);
    const scout = scoutOf(P1);
    const first = mustPlay(state, scout, 1);
    expect(mustPlayer(first.state, P1).playArea).toContain(scout);
    const bounced = moveTo(first.state, scout, "hand");
    expect(priceOf(bounced, scout)).toMatchObject({ printed: 3, current: 3, reduction: 0 });
    expect(play(bounced, scout, 1).ok).toBe(false);
    expect(play(bounced, scout, 3).ok).toBe(true);
  });

  it("not played that phase: the reduction is gone at its end, and the card costs 3 next phase", () => {
    const { state, scoutOf } = searched(REPORT);
    const scout = scoutOf(P1);
    const round = apply(state, { type: "endTurn", playerId: P1 });
    expect(round.state.round).toBe(2);
    expect(reductions(round.state)).toEqual([]);
    expect(of(round.events, "lastingEffectEnded").map((e) => e.reason)).toContain("expired");
    if (mustPlayer(round.state, P1).hand.includes(scout))
      expect(priceOf(round.state, scout)).toMatchObject({ printed: 3, current: 3, reduction: 0 });
    else expect(priceOf(moveTo(round.state, scout, "hand"), scout)).toMatchObject({ current: 3 });
  });

  it("two players each find a card: each card has its own reduction, used by the player who plays it", () => {
    const { state, scoutOf } = searched(BRIEFING, 2);
    const [mine, theirs] = [scoutOf(P1), scoutOf(P2)];
    expect(reductions(state).map((e) => e.cardInstanceId)).toEqual([mine, theirs]);
    expect(priceOf(state, mine)).toMatchObject({ printed: 3, current: 1 });
    expect(priceOf(state, theirs, P2)).toMatchObject({ printed: 3, current: 1 });
    // P1 plays theirs for 1: P2's card keeps its reduction, and P2 plays it for 1 on their turn of the same phase.
    const first = mustPlay(state, mine, 1);
    expect(reductions(first.state).map((e) => e.cardInstanceId)).toEqual([theirs]);
    const copy = giveCard(first.state, P1, SCOUT.id, [mine]);
    expect(priceOf(copy.state, copy.id)).toMatchObject({ current: 3 });
    const turn = apply(first.state, { type: "endTurn", playerId: P1 }).state;
    expect(turn.step.phase).toBe("player");
    expect(play(turn, theirs, 0, P2).ok).toBe(false);
    const second = mustPlay(turn, theirs, 1, P2);
    expect(reductions(second.state)).toEqual([]);
  });

  it("a search that takes no card makes no reduction", () => {
    const base = scoutsInDeck(start());
    const emptied: GameState = {
      ...base,
      players: base.players.map((p) => ({
        ...p,
        deck: p.deck.filter((id) => mustInstance(base, id).cardId !== SCOUT.id),
      })),
    };
    const given = giveCard(emptied, P1, REPORT.card.id);
    const run = apply(given.state, {
      type: "playCard",
      playerId: P1,
      cardInstanceId: given.id,
      payment: [],
      attachToInstanceId: null,
    });
    expect(reductions(run.state)).toEqual([]);
  });

  it("the waiting reduction survives a serialization round trip", () => {
    const { state, scoutOf } = searched(REPORT);
    const loaded = JSON.parse(JSON.stringify(state)) as GameState;
    expect(loaded).toEqual(state);
    expect(priceOf(loaded, scoutOf(P1))).toMatchObject({ printed: 3, current: 1 });
  });
});
