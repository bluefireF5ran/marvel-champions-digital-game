/**
 * docs/phase7-wave9.md §3.61: `RuleSpec counterLimit`, a maximum on the counters a card holds. Synthetic cards shaped
 * like the Synergy environments (`tt` 55052 to 55055): "Permanent. Max 1 [per player] synergy counters here."
 *
 * Sources: RRG 1.8 "Max, Maximum" (p. 28); "Move" (p. 30): "If there is no valid source or destination for a move, the
 * move cannot be made"; "'Would'" (p. 48) and "Replacement Effect" (p. 37) for the window in front of a placement
 * (docs/phase7-wave9.md §3.55). Ruling June 2, 2026 (1) is about the other maximum, the "(to a maximum of X)" of one
 * placing ability (`addCounters.upTo`), which stays local to that ability.
 */

import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import { counterRoom } from "./counter-limit.js";
import { replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { mustInstance } from "./query.js";
import type { EffectSpec, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { stubEnvironment, stubEvent, stubTreachery } from "./testing/fixtures.js";
import { copiesOf, encounterCardInVillainArea, gameAtFirstTurn, playFree } from "./testing/wave3.js";

const self: TargetRef = { kind: "self" };
const n = (value: number) => ({ kind: "const", value }) as const;
const named = (name: string): TargetRef => ({ kind: "each", query: { name } });

/** "Max 1 [per player] synergy counters here." */
const FRONT_LIMIT = stubAbility("front.constant", {
  trigger: {
    kind: "constant",
    rules: [
      {
        kind: "counterLimit",
        card: { self: true },
        counterType: "synergy",
        max: { kind: "perPlayer", base: 0, perPlayer: 1 },
      },
    ],
  },
  effects: [],
});
/** "Forced Response: After a synergy counter is placed here, place that many seen counters here." */
const FRONT_SEEN = stubAbility("front.seen", {
  trigger: {
    kind: "response",
    forced: true,
    on: { on: "countersPlaced", selfIs: "target", eventIs: { counterType: "synergy" } },
  },
  effects: [{ kind: "addCounters", target: self, counterType: "seen", amount: { kind: "eventAmount" } }],
});
const FRONT = stubEnvironment({ id: "front", abilities: [FRONT_LIMIT.ref, FRONT_SEEN.ref] });
/** An environment with no maximum, to move counters from and to. */
const STORE = stubEnvironment({ id: "store" });
/** "Forced Interrupt: When a synergy counter would be placed on the front, place that many warned counters here." */
const WARDEN_INTERRUPT = stubAbility("warden.interrupt", {
  trigger: {
    kind: "interrupt",
    forced: true,
    on: { on: "countersPlaced", eventIs: { counterType: "synergy" }, targetIs: { name: "front" } },
  },
  effects: [{ kind: "addCounters", target: self, counterType: "warned", amount: { kind: "eventAmount" } }],
});
const WARDEN = stubEnvironment({ id: "warden", abilities: [WARDEN_INTERRUPT.ref] });
const FILLER = stubTreachery({ id: "filler", boostIcons: 0 });

const event = (id: string, effects: readonly EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
const place = (count: number) =>
  event(`place-${count}`, [
    { kind: "addCounters", target: named("front"), counterType: "synergy", amount: n(count), bind: "placed" },
    // "Then place 1 tally counter on the store for each counter placed this way."
    {
      kind: "addCounters",
      target: named("store"),
      counterType: "tally",
      amount: { kind: "var", name: "placed.amount" },
    },
  ]);
const PLACE_1 = place(1);
const PLACE_3 = place(3);
/** A counter of another type: the maximum is on synergy counters only. */
const OTHER = event("other", [{ kind: "addCounters", target: named("front"), counterType: "other", amount: n(5) }]);
/** "Move 3 synergy counters from the store to the front." */
const SHIFT = event("shift", [
  { kind: "moveCounters", from: named("store"), to: named("front"), counterType: "synergy", amount: n(3) },
]);
/** "Move each synergy counter from the front to the store." (no maximum there) */
const DRAIN = event("drain", [
  { kind: "moveCounters", from: named("front"), to: named("store"), counterType: "synergy" },
]);
const EVENTS = [PLACE_1, PLACE_3, OTHER, SHIFT, DRAIN];

const deps: EngineDeps = depsOf(FRONT_LIMIT, FRONT_SEEN, WARDEN_INTERRUPT, ...EVENTS.map((e) => e.ability));
/** The same cards with nothing that hears a counter about to be placed. */
const quietDeps: EngineDeps = depsOf(FRONT_LIMIT, FRONT_SEEN, ...EVENTS.map((e) => e.ability));

interface Table {
  readonly state: GameState;
  readonly front: InstanceId;
  readonly store: InstanceId;
  readonly warden: InstanceId | null;
}
function table(players: 1 | 2 | 3 | 4, options: { warden?: boolean; held?: number; stored?: number } = {}): Table {
  const start = gameAtFirstTurn({
    players,
    cards: [FRONT, STORE, WARDEN, FILLER, ...EVENTS.map((e) => e.card)],
    deps: options.warden ? deps : quietDeps,
    deck: EVENTS.flatMap((e) => copiesOf(e.card.id, 2)),
    encounter: [FRONT.id, STORE.id, WARDEN.id, ...copiesOf(FILLER.id, 20)],
  });
  const front = encounterCardInVillainArea(start, FRONT.id);
  const store = encounterCardInVillainArea(front.state, STORE.id);
  const warden = options.warden ? encounterCardInVillainArea(store.state, WARDEN.id) : null;
  const base = warden?.state ?? store.state;
  const state: GameState = {
    ...base,
    instances: {
      ...base.instances,
      [front.id]: { ...mustInstance(base, front.id), counters: { synergy: options.held ?? 0 } },
      [store.id]: { ...mustInstance(base, store.id), counters: { synergy: options.stored ?? 0 } },
    },
  };
  return { state, front: front.id, store: store.id, warden: warden?.id ?? null };
}
const counters = (state: GameState, id: InstanceId, type: string) => mustInstance(state, id).counters[type] ?? 0;
const notPlaced = (events: readonly GameEvent[]) =>
  events.flatMap((e) =>
    e.type === "countersNotPlaced"
      ? [{ on: e.instanceId, type: e.counterType, amount: e.amount, from: e.fromInstanceId }]
      : [],
  );
const play = (t: Table, card: (typeof EVENTS)[number], using: EngineDeps = quietDeps) => {
  const played = playFree(t.state, using, card.card.id);
  const replayed = replay(played.session.log, using);
  expect(replayed.ok && replayed.state).toEqual(played.session.state);
  return played;
};

describe("§3.61 `RuleSpec counterLimit`: a maximum on the counters a card holds", () => {
  it("one player: the first counter is placed, the next is not and is logged; nothing is announced for it", () => {
    const t = table(1);
    expect(counterRoom(t.state, quietDeps, t.front, "synergy")).toBe(1);
    const first = play(t, PLACE_1);
    expect(counters(first.state, t.front, "synergy")).toBe(1);
    expect(counters(first.state, t.front, "seen")).toBe(1);
    expect(notPlaced(first.events)).toEqual([]);
    expect(counterRoom(first.state, quietDeps, t.front, "synergy")).toBe(0);

    const second = play({ ...t, state: first.state }, PLACE_1);
    expect(counters(second.state, t.front, "synergy")).toBe(1);
    expect(notPlaced(second.events)).toEqual([{ on: t.front, type: "synergy", amount: 1, from: undefined }]);
    // No `countersPlaced` for none: the "after a counter is placed here" response did not answer, and "placed this
    // way" is 0.
    expect(counters(second.state, t.front, "seen")).toBe(1);
    expect(counters(second.state, t.store, "tally")).toBe(1);
    expect(second.events.some((e) => e.type === "counterAdded" && e.counterType === "synergy")).toBe(false);
  });

  it("three players: the maximum is 3; at 2, a placement of 3 places 1, announced as 1", () => {
    const t = table(3, { held: 2 });
    expect(counterRoom(t.state, quietDeps, t.front, "synergy")).toBe(1);
    const { state, events } = play(t, PLACE_3);
    expect(counters(state, t.front, "synergy")).toBe(3);
    expect(notPlaced(events)).toEqual([{ on: t.front, type: "synergy", amount: 2, from: undefined }]);
    expect(counters(state, t.front, "seen")).toBe(1);
    expect(counters(state, t.store, "tally")).toBe(1);
  });

  it("four players at 4: nothing is placed", () => {
    const t = table(4, { held: 4 });
    const { state, events } = play(t, PLACE_3);
    expect(counters(state, t.front, "synergy")).toBe(4);
    expect(notPlaced(events)).toEqual([{ on: t.front, type: "synergy", amount: 3, from: undefined }]);
    expect(counters(state, t.front, "seen")).toBe(0);
  });

  it("the maximum is on that type and that card: another type, and a card without the rule, take any number", () => {
    const t = table(1, { held: 1 });
    const other = play(t, OTHER);
    expect(counters(other.state, t.front, "other")).toBe(5);
    expect(notPlaced(other.events)).toEqual([]);
    expect(counterRoom(t.state, quietDeps, t.store, "synergy")).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("§3.61 counters moved onto a card with a maximum", () => {
  it("only the counters it has room for move; the rest stay on the card they were on (RRG p. 30)", () => {
    const t = table(2, { held: 1, stored: 3 });
    const { state, events } = play(t, SHIFT);
    expect(counters(state, t.front, "synergy")).toBe(2);
    expect(counters(state, t.store, "synergy")).toBe(2);
    expect(notPlaced(events)).toEqual([{ on: t.front, type: "synergy", amount: 2, from: t.store }]);
    expect(events.filter((e) => e.type === "countersMoved")).toEqual([
      { type: "countersMoved", from: t.store, to: t.front, counterType: "synergy", amount: 1 },
    ]);
    // The arrival is a placement of 1.
    expect(counters(state, t.front, "seen")).toBe(1);
  });

  it("a full card takes none: nothing moves and nothing is announced", () => {
    const t = table(1, { held: 1, stored: 3 });
    const { state, events } = play(t, SHIFT);
    expect(counters(state, t.front, "synergy")).toBe(1);
    expect(counters(state, t.store, "synergy")).toBe(3);
    expect(notPlaced(events)).toEqual([{ on: t.front, type: "synergy", amount: 3, from: t.store }]);
    expect(events.some((e) => e.type === "countersMoved")).toBe(false);
    expect(counters(state, t.front, "seen")).toBe(0);
  });

  it("moving off the card is not limited", () => {
    const t = table(2, { held: 2, stored: 5 });
    const { state, events } = play(t, DRAIN);
    expect(counters(state, t.front, "synergy")).toBe(0);
    expect(counters(state, t.store, "synergy")).toBe(7);
    expect(notPlaced(events)).toEqual([]);
  });
});

describe("§3.61 with a 'would be placed' interrupt (§3.55)", () => {
  it("the window is for the counters that would be placed: 1 of 3, and the rest is logged before it", () => {
    const t = table(3, { warden: true, held: 2 });
    const { state, events } = play(t, PLACE_3, deps);
    expect(counters(state, t.warden!, "warned")).toBe(1);
    expect(counters(state, t.front, "synergy")).toBe(3);
    expect(notPlaced(events)).toEqual([{ on: t.front, type: "synergy", amount: 2, from: undefined }]);
    expect(counters(state, t.front, "seen")).toBe(1);
    expect(counters(state, t.store, "tally")).toBe(1);
  });

  it("a placement the maximum stops entirely is not imminent: the interrupt does not answer it", () => {
    const t = table(1, { warden: true, held: 1 });
    const { state, events } = play(t, PLACE_1, deps);
    expect(counters(state, t.warden!, "warned")).toBe(0);
    expect(counters(state, t.front, "synergy")).toBe(1);
    expect(notPlaced(events)).toEqual([{ on: t.front, type: "synergy", amount: 1, from: undefined }]);
  });
});
