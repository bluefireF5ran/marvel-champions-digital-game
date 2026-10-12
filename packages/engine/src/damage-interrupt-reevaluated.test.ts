/**
 * Interrupts to damage that would be taken, when an earlier interrupt of the same window changes the pending amount:
 * each one still to resolve answers the damage as it now stands. Its triggering condition is read again against the
 * new amount, and "that damage" reads the new amount. Synthetic abilities shaped like Cosmic Flight (`cw` 56100:
 * "Forced Interrupt: When Captain Marvel would take more than 3 damage from an attack, reduce that amount to 3. Then,
 * discard this card."), of which two copies can be attached.
 *
 * Sources: RRG 1.8 "Interrupt" (p. 25): "If an interrupt changes (via a replacement effect) or cancels an imminent
 * triggering condition, further interrupts to the original triggering condition cannot be triggered." RRG 1.8
 * "Replacement Effect" (p. 37): "When an effect is replaced, it is no longer considered imminent and no further
 * interrupts or responses to that effect can be triggered." RRG 1.8 "'Then'" (p. 44): the text before "then" must
 * resolve for the text after it to. The reading (the changed amount is what is now imminent, so a condition the new
 * amount does not meet is not triggered) is the owner's decision of 2026-10-12 (question 29 = B); it is an
 * interpretation of those entries, not an FFG ruling on a card.
 */

import { flat } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { replay, startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import { mustInstance } from "./query.js";
import type { EffectSpec, TargetRef, ValueSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubEvent, stubVillain } from "./testing/fixtures.js";
import { defaultPick, giveCard } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, P1 } from "./testing/wave3.js";

const n = (value: number): ValueSpec => ({ kind: "const", value });
const theVillain: TargetRef = { kind: "villain" };
const mark = (counterType: string, amount: ValueSpec): EffectSpec => ({
  kind: "addCounters",
  target: theVillain,
  counterType,
  amount,
});

const forcedInterrupt = (id: string, atLeast: number | null, effects: readonly EffectSpec[]) => {
  const definition: AbilityDefinition = {
    trigger: {
      kind: "interrupt",
      forced: true,
      on: { on: "dealDamage", selfIs: "target", ...(atLeast === null ? {} : { eventAtLeast: { amount: atLeast } }) },
    },
    effects,
  };
  return stubAbility(id, definition);
};

/** "When this would take more than 3 damage, reduce that amount to 3. Then, mark this." Two of them, as two copies. */
const cap = (id: string) =>
  forcedInterrupt(`${id}.interrupt`, 4, [
    { kind: "reduceDamageTo", amount: n(3) },
    { kind: "then", effects: [mark(id, n(1))] },
  ]);
const CAP_A = cap("capA");
const CAP_B = cap("capB");
/** "When this would take any amount of damage, place that many `seen` counters here." It reads "that damage". */
const ECHO = forcedInterrupt("echo.interrupt", null, [mark("seen", { kind: "eventAmount" })]);
/** "When this would take any amount of damage, prevent all of it." */
const WARD = forcedInterrupt("ward.interrupt", null, [{ kind: "preventDamage" }, mark("warded", n(1))]);

type StubRef = (typeof CAP_A)["ref"];
const villain = (id: string, abilities: readonly StubRef[]) =>
  stubVillain({ id, stages: [{ hp: flat(40), atk: 1, sch: 1, abilities }] });
const TWO_CAPS = villain("two-caps", [CAP_A.ref, CAP_B.ref]);
const CAP_AND_ECHO = villain("cap-echo", [CAP_A.ref, ECHO.ref]);
const CAP_AND_WARD = villain("cap-ward", [CAP_A.ref, WARD.ref]);
const VILLAINS = [TWO_CAPS, CAP_AND_ECHO, CAP_AND_WARD];

const hit = (amount: number) => {
  const ability = stubAbility(`hit-${amount}.action`, {
    trigger: { kind: "action" },
    effects: [{ kind: "attack", target: theVillain, amount: n(amount) }],
  });
  return { card: stubEvent({ id: `hit-${amount}`, cost: 0, abilities: [ability.ref] }), ability };
};
const HIT_3 = hit(3);
const HIT_5 = hit(5);
const HIT_7 = hit(7);
const HITS = [HIT_3, HIT_5, HIT_7];

const deps: EngineDeps = depsOf(CAP_A, CAP_B, ECHO, WARD, ...HITS.map((h) => h.ability));

function start(v: (typeof VILLAINS)[number]): GameState {
  const state = gameAtFirstTurn({
    cards: [...VILLAINS, ...HITS.map((h) => h.card)],
    deps,
    villain: v,
    deck: HITS.flatMap((h) => copiesOf(h.card.id, 3)),
  });
  return { ...state, players: state.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" } })) };
}

/** Plays `card` for free. Simultaneous forced interrupts are ordered as `order` lists their abilities. */
function play(state: GameState, card: (typeof HITS)[number]["card"], order: readonly string[] = []) {
  const given = giveCard(state, P1, card.id);
  const ordered: string[][] = [];
  const pick = (s: GameState): readonly string[] => {
    const choice = s.pendingChoice!;
    if (choice.prompt.kind !== "orderTriggers") return defaultPick(s);
    const ids = choice.options.map((o) => o.optionId as string);
    ordered.push(ids.map((id) => id.split(":")[1]!));
    const rank = (id: string) => {
      const at = order.indexOf(id.split(":")[1]!);
      return at < 0 ? order.length : at;
    };
    return [...ids].sort((a, b) => rank(a) - rank(b));
  };
  const command: Command = {
    type: "playCard",
    playerId: P1,
    cardInstanceId: given.id,
    payment: [],
    attachToInstanceId: null,
  };
  const { session, events } = driveSession(startSession(given.state), deps, [command], pick);
  return { session, state: session.state, events, ordered };
}

const villainOf = (state: GameState) => mustInstance(state, state.villains[0]!.instanceId);
const lapsed = (events: readonly GameEvent[]) =>
  events.flatMap((e) =>
    e.type === "interruptConditionLapsed" ? [[e.abilityId as string, "amount" in e.event ? e.event.amount : null]] : [],
  );
const resolved = (events: readonly GameEvent[]) =>
  events.flatMap((e) =>
    e.type === "abilityResolved" && e.abilityId.endsWith(".interrupt") ? [e.abilityId as string] : [],
  );
const capped = (events: readonly GameEvent[]) => events.flatMap((e) => (e.type === "damageCapped" ? [e.amount] : []));

describe("two 'would take more than 3, reduce to 3' interrupts on one hit", () => {
  it("a hit of 7: the first player orders the two; the first reduces it to 3 and resolves its 'then'; the second no longer has its condition and does not resolve", () => {
    const run = play(start(TWO_CAPS), HIT_7.card, ["capB.interrupt", "capA.interrupt"]);
    expect(run.ordered).toHaveLength(1);
    expect([...run.ordered[0]!].sort()).toEqual(["capA.interrupt", "capB.interrupt"]);
    expect(villainOf(run.state).damage).toBe(3);
    expect(villainOf(run.state).counters).toEqual({ capB: 1 });
    expect(capped(run.events)).toEqual([4]);
    expect(resolved(run.events)).toEqual(["capB.interrupt"]);
    // The log says which one lapsed and against what: the 3 now pending.
    expect(lapsed(run.events)).toEqual([["capA.interrupt", 3]]);
  });

  it("the other order: the other one resolves", () => {
    const run = play(start(TWO_CAPS), HIT_7.card, ["capA.interrupt", "capB.interrupt"]);
    expect(villainOf(run.state).damage).toBe(3);
    expect(villainOf(run.state).counters).toEqual({ capA: 1 });
    expect(lapsed(run.events)).toEqual([["capB.interrupt", 3]]);
  });

  it("a second hit, of 5: again exactly one resolves (each hit is its own triggering condition)", () => {
    const first = play(start(TWO_CAPS), HIT_7.card, ["capA.interrupt"]);
    const second = play(first.state, HIT_5.card, ["capB.interrupt"]);
    expect(villainOf(second.state).damage).toBe(6);
    expect(villainOf(second.state).counters).toEqual({ capA: 1, capB: 1 });
    expect(capped(second.events)).toEqual([2]);
    expect(lapsed(second.events)).toEqual([["capA.interrupt", 3]]);
  });

  it("a hit of exactly 3: neither has its condition, nothing is asked, nothing lapses", () => {
    const run = play(start(TWO_CAPS), HIT_3.card);
    expect(run.ordered).toEqual([]);
    expect(villainOf(run.state).damage).toBe(3);
    expect(villainOf(run.state).counters).toEqual({});
    expect(lapsed(run.events)).toEqual([]);
    expect(resolved(run.events)).toEqual([]);
  });

  it("replays to the same state", () => {
    const run = play(start(TWO_CAPS), HIT_7.card, ["capB.interrupt", "capA.interrupt"]);
    const replayed = replay(run.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(run.state);
  });
});

describe("'that damage' is the damage now pending", () => {
  it("reduced first: the interrupt after it reads 3, not the 7 the window opened with", () => {
    const run = play(start(CAP_AND_ECHO), HIT_7.card, ["capA.interrupt", "echo.interrupt"]);
    expect(villainOf(run.state).damage).toBe(3);
    expect(villainOf(run.state).counters).toEqual({ capA: 1, seen: 3 });
    expect(lapsed(run.events)).toEqual([]);
  });

  it("read first: it reads the 7, and the reduction after it still has its condition", () => {
    const run = play(start(CAP_AND_ECHO), HIT_7.card, ["echo.interrupt", "capA.interrupt"]);
    expect(villainOf(run.state).damage).toBe(3);
    expect(villainOf(run.state).counters).toEqual({ capA: 1, seen: 7 });
  });
});

describe("damage an earlier interrupt prevented in full leaves nothing to answer", () => {
  it("prevented first: 'would take more than 3' is not met by 0, so the reduction does not resolve", () => {
    const run = play(start(CAP_AND_WARD), HIT_7.card, ["ward.interrupt", "capA.interrupt"]);
    expect(villainOf(run.state).damage).toBe(0);
    expect(villainOf(run.state).counters).toEqual({ warded: 1 });
    expect(lapsed(run.events)).toEqual([["capA.interrupt", 0]]);
  });

  it("reduced first: both resolve, 7 to 3 and then the 3 prevented", () => {
    const run = play(start(CAP_AND_WARD), HIT_7.card, ["capA.interrupt", "ward.interrupt"]);
    expect(villainOf(run.state).damage).toBe(0);
    expect(villainOf(run.state).counters).toEqual({ capA: 1, warded: 1 });
    expect(lapsed(run.events)).toEqual([]);
  });
});
