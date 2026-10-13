/**
 * The excess of the damage **dealt** (`excessAsDealtOf`, the result `excessAsDealt`), beside the excess of the damage
 * taken that overkill spills (`excessDamageOf`, the result `excessDealt`; `excess-equals-overkill.test.ts`).
 *
 * Owner answer 31B (2026-10-12, docs/phase7-wave10.md §4.0): one card, Prince of Power, counts "excess damage dealt"
 * on the damage dealt, per February 8, 2026 - Ruling 2 ("Dealt: 6. Excess dealt: 6 - 3 = 3. Taken: 6 - 1 = 5. Excess
 * taken: 5 - 3 = 2 (overkill to villain) … Prince of Power heals 3"). Everything else stays on the damage taken (RRG
 * 1.8 "Overkill", p. 31), so every test here also pins that `excessDealt` and the overkill spill did not move.
 * Owner answer 42B (same day): Follow Through's "+1 excess damage" applies to this value too, whenever it is above 0.
 *
 * What "dealt" is where the ruling is silent: RRG 1.8 "Damage" (p. 14), "When the amount of damage a character takes is
 * modified (such as by damage being prevented), the amount of damage dealt is not modified"; "Prevent" (p. 35); "Tough"
 * (p. 44); "Excess Damage" (p. 19); ruling January 26, 2026 (3), "Excess damage can be dealt even if the target does
 * not take that damage." Synthetic cards only.
 */

import { describe, expect, it } from "vitest";
import type { EngineDeps, RuleSpec } from "./abilities.js";
import type { InstanceId } from "./ids.js";
import { mustInstance } from "./query.js";
import { cardsInPlay } from "./select.js";
import type { EffectSpec, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { stubEvent, stubMinion, stubSupport } from "./testing/fixtures.js";
import { copiesOf, gameAtFirstTurn, minionEngagedWith, playerCardIntoPlay, playFree } from "./testing/wave3.js";
import { EXCESS_AS_DEALT_RESULT } from "./trigger-events.js";

const n = (value: number) => ({ kind: "const", value }) as const;
const self: TargetRef = { kind: "self" };
const theMinion: TargetRef = { kind: "each", query: { categories: ["minion"] } };
const recorder: TargetRef = { kind: "each", query: { categories: ["support"], name: "recorder" } };

const constantRule = (id: string, rule: RuleSpec) =>
  stubAbility(`${id}.constant`, { trigger: { kind: "constant", rules: [rule] }, effects: [] });
const minion = (id: string, hp: number, ...abilities: readonly ReturnType<typeof stubAbility>[]) =>
  stubMinion({ id, atk: 1, sch: 1, hp, abilities: abilities.map((a) => a.ref) });

/** Thumbelina's shape: 3 hit points, takes 1 less from each attack. */
const SHRINKING = constantRule("thumbelina", {
  kind: "reduceDamageTaken",
  target: { self: true },
  amount: 1,
  fromAttack: true,
});
const THUMBELINA = minion("thumbelina", 3, SHRINKING);
const GRUNT = minion("grunt", 3);
/** "Takes 1 additional damage from each attack." */
const BRITTLE_RULE = constantRule("brittle", {
  kind: "increaseDamageTaken",
  target: { self: true },
  amount: 1,
  fromAttack: true,
});
const BRITTLE = minion("brittle", 3, BRITTLE_RULE);
/** "This minion cannot take damage." */
const IMMUNE_RULE = constantRule("immune", { kind: "cannotTakeDamage", target: { self: true } });
const IMMUNE = minion("immune", 3, IMMUNE_RULE);
/** "Forced Interrupt: When this minion would take any amount of damage, prevent 2 of that damage." */
const PADDED_INTERRUPT = stubAbility("padded.forced-interrupt", {
  trigger: { kind: "interrupt", forced: true, on: { on: "dealDamage", selfIs: "target" } },
  effects: [{ kind: "preventDamage", amount: n(2) }],
});
const PADDED = minion("padded", 3, PADDED_INTERRUPT);
/** "… prevent all of that damage." */
const WARDED_INTERRUPT = stubAbility("warded.forced-interrupt", {
  trigger: { kind: "interrupt", forced: true, on: { on: "dealDamage", selfIs: "target" } },
  effects: [{ kind: "preventDamage" }],
});
const WARDED = minion("warded", 3, WARDED_INTERRUPT);
const MINIONS = [THUMBELINA, GRUNT, BRITTLE, IMMUNE, PADDED, WARDED];

/** Follow Through's shape: "When your hero's attack deals any amount of excess damage, increase that amount by 1." */
const FOLLOW_THROUGH_RULE = constantRule("follow-through", {
  kind: "excessDamageBonus",
  attacker: { categories: ["hero"], controller: "you" },
  amount: 1,
});
const FOLLOW_THROUGH = stubSupport({ id: "follow-through", cost: 0, abilities: [FOLLOW_THROUGH_RULE.ref] });

/** Prince of Power's shape: "After [a character] attacks and defeats an enemy, … for each point of excess damage dealt." */
const PRINCE = stubAbility("recorder.forced-response", {
  trigger: { kind: "response", forced: true, on: { on: "attack", requireResults: { defeated: 1 } } },
  effects: [
    {
      kind: "addCounters",
      target: self,
      counterType: "afterDefeat",
      amount: { kind: "eventResult", key: EXCESS_AS_DEALT_RESULT },
    },
  ],
});
const RECORDER = stubSupport({ id: "recorder", cost: 0, abilities: [PRINCE.ref] });

const record = (counterType: string, name: string): EffectSpec => ({
  kind: "addCounters",
  target: recorder,
  counterType,
  amount: { kind: "var", name },
});
const actionEvent = (id: string, effects: readonly EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
/** An attack for `amount` with overkill, recording both excess values of the attack as its ability reads them. */
const strike = (amount: number) =>
  actionEvent(`strike-${amount}`, [
    { kind: "attack", target: theMinion, amount: n(amount), overkill: true, bind: "hit" },
    record("taken", "hit.excessDealt"),
    record("dealt", `hit.${EXCESS_AS_DEALT_RESULT}`),
  ]);
const SIX = strike(6);
const FOUR = strike(4);
const THREE = strike(3);
const TWO = strike(2);
const EVENTS = [SIX, FOUR, THREE, TWO];

const deps: EngineDeps = depsOf(
  SHRINKING,
  BRITTLE_RULE,
  IMMUNE_RULE,
  PADDED_INTERRUPT,
  WARDED_INTERRUPT,
  FOLLOW_THROUGH_RULE,
  PRINCE,
  ...EVENTS.map((e) => e.ability),
);

interface Options {
  readonly tough?: boolean;
  readonly followThrough?: boolean;
}
function start(
  enemy: (typeof MINIONS)[number],
  options: Options = {},
): { state: GameState; recorder: InstanceId; minion: InstanceId } {
  const base = gameAtFirstTurn({
    cards: [RECORDER, FOLLOW_THROUGH, ...MINIONS, ...EVENTS.map((e) => e.card)],
    deps,
    encounter: MINIONS.flatMap((m) => copiesOf(m.id, 2)),
    deck: [RECORDER.id, FOLLOW_THROUGH.id, ...EVENTS.flatMap((e) => copiesOf(e.card.id, 2))],
  });
  let state: GameState = {
    ...base,
    players: base.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" } })),
  };
  const placed = playerCardIntoPlay(state, RECORDER.id);
  state = placed.state;
  if (options.followThrough) state = playerCardIntoPlay(state, FOLLOW_THROUGH.id).state;
  const engaged = minionEngagedWith(state, enemy.id);
  state = engaged.state;
  if (options.tough) {
    const instance = mustInstance(state, engaged.id);
    state = {
      ...state,
      instances: { ...state.instances, [engaged.id]: { ...instance, statuses: { ...instance.statuses, tough: 1 } } },
    };
  }
  return { state, recorder: placed.id, minion: engaged.id };
}

interface Outcome {
  /** `<bind>.excessDealt`: the excess of the damage taken, the value overkill spills. */
  readonly taken: number;
  /** `<bind>.excessAsDealt`: the excess of the damage dealt. */
  readonly dealt: number;
  /** `eventResult("excessAsDealt")` in an "after … attacks and defeats" response; 0 when the minion survived. */
  readonly afterDefeat: number;
  /** Overkill damage on the villain. */
  readonly spilled: number;
  /** Damage left on the minion, or null once it has left play. */
  readonly minionDamage: number | null;
  readonly tough: number;
}
function resolve(setup: ReturnType<typeof start>, event: (typeof EVENTS)[number]): Outcome {
  const after = playFree(setup.state, deps, event.card.id).state;
  const counters = mustInstance(after, setup.recorder).counters;
  const survivor = cardsInPlay(after).includes(setup.minion) ? mustInstance(after, setup.minion) : null;
  return {
    taken: counters["taken"] ?? 0,
    dealt: counters["dealt"] ?? 0,
    afterDefeat: counters["afterDefeat"] ?? 0,
    spilled: mustInstance(after, after.villains[0]!.instanceId).damage,
    minionDamage: survivor?.damage ?? null,
    tough: survivor?.statuses.tough ?? 0,
  };
}

describe("excess of the damage dealt (`excessAsDealt`), beside the excess of the damage taken (`excessDealt`)", () => {
  it("February 8, 2026 - Ruling 2: 6 dealt to a 3-hit-point minion that takes 1 less: 5 taken, 2 excess taken spills, 3 excess dealt", () => {
    expect(resolve(start(THUMBELINA), SIX)).toEqual({
      taken: 2,
      dealt: 3,
      afterDefeat: 3,
      spilled: 2,
      minionDamage: null,
      tough: 0,
    });
  });

  it("no reduction: both values are equal (6 against 3 hit points: 3 and 3)", () => {
    expect(resolve(start(GRUNT), SIX)).toMatchObject({ taken: 3, dealt: 3, afterDefeat: 3, spilled: 3 });
  });

  it("exactly lethal as dealt and as taken (3 against 3 hit points): neither has any excess", () => {
    expect(resolve(start(GRUNT), THREE)).toEqual({
      taken: 0,
      dealt: 0,
      afterDefeat: 0,
      spilled: 0,
      minionDamage: null,
      tough: 0,
    });
  });

  it("exactly lethal as taken only (4 dealt, 3 taken, 3 hit points): 1 excess dealt, none taken, nothing spills", () => {
    expect(resolve(start(THUMBELINA), FOUR)).toEqual({
      taken: 0,
      dealt: 1,
      afterDefeat: 1,
      spilled: 0,
      minionDamage: null,
      tough: 0,
    });
  });

  it("not lethal (2 against 3 hit points): no excess of either kind", () => {
    expect(resolve(start(GRUNT), TWO)).toMatchObject({
      taken: 0,
      dealt: 0,
      afterDefeat: 0,
      spilled: 0,
      minionDamage: 2,
    });
  });

  // RRG 1.8 "Tough" (p. 44): the status card prevents the damage, and prevented damage is still dealt (p. 14, p. 35).
  it("a tough status card: the 6 was dealt (3 excess dealt) and none taken: no excess taken, no spill, no defeat", () => {
    expect(resolve(start(GRUNT, { tough: true }), SIX)).toEqual({
      taken: 0,
      dealt: 3,
      afterDefeat: 0,
      spilled: 0,
      minionDamage: 0,
      tough: 0,
    });
  });

  it("'cannot take damage': dealt and not taken, so 3 excess dealt and none taken", () => {
    expect(resolve(start(IMMUNE), SIX)).toMatchObject({ taken: 0, dealt: 3, spilled: 0, minionDamage: 0 });
  });

  it("an interrupt that prevents 2 of the 6: 4 taken (1 excess taken, 1 spilled), still 3 excess dealt", () => {
    expect(resolve(start(PADDED), SIX)).toMatchObject({ taken: 1, dealt: 3, afterDefeat: 3, spilled: 1 });
  });

  it("an interrupt that prevents all of it: nothing taken, the 6 was still dealt (3 excess dealt)", () => {
    expect(resolve(start(WARDED), SIX)).toMatchObject({
      taken: 0,
      dealt: 3,
      afterDefeat: 0,
      spilled: 0,
      minionDamage: 0,
    });
  });

  // RRG 1.8 "Damage" (p. 14): a change to the damage taken does not change the damage dealt, in either direction.
  it("a minion that takes 1 more: 3 dealt is 4 taken (1 excess taken, 1 spilled) and no excess dealt", () => {
    expect(resolve(start(BRITTLE), THREE)).toMatchObject({ taken: 1, dealt: 0, afterDefeat: 0, spilled: 1 });
  });

  // Owner answer 42B (2026-10-12): the bonus answers either excess, and raises each measure that is above 0.
  describe("'increase that amount of excess damage by 1' applies to each excess that is above 0 (answer 42B)", () => {
    it("both in excess: both values go up by 1 (6 dealt, 5 taken, 3 hit points: 3 taken-excess, 4 dealt-excess)", () => {
      expect(resolve(start(THUMBELINA, { followThrough: true }), SIX)).toMatchObject({
        taken: 3,
        dealt: 4,
        afterDefeat: 4,
        spilled: 3,
      });
    });

    it("only the damage dealt in excess (4 dealt, 3 taken): the excess dealt goes from 1 to 2; none taken, nothing spills", () => {
      expect(resolve(start(THUMBELINA, { followThrough: true }), FOUR)).toEqual({
        taken: 0,
        dealt: 2,
        afterDefeat: 2,
        spilled: 0,
        minionDamage: null,
        tough: 0,
      });
    });

    it("only the damage taken in excess (3 dealt, 4 taken): the excess taken goes from 1 to 2 and spills; still none dealt", () => {
      expect(resolve(start(BRITTLE, { followThrough: true }), THREE)).toMatchObject({
        taken: 2,
        dealt: 0,
        afterDefeat: 0,
        spilled: 2,
      });
    });

    it("a tough status card: the excess dealt goes from 3 to 4, and still nothing is taken, spilled or defeated", () => {
      expect(resolve(start(GRUNT, { tough: true, followThrough: true }), SIX)).toEqual({
        taken: 0,
        dealt: 4,
        afterDefeat: 0,
        spilled: 0,
        minionDamage: 0,
        tough: 0,
      });
    });

    it("an interrupt that prevents 2 of the 6: 1 excess taken becomes 2, 3 excess dealt becomes 4, each raised once", () => {
      expect(resolve(start(PADDED, { followThrough: true }), SIX)).toMatchObject({
        taken: 2,
        dealt: 4,
        afterDefeat: 4,
        spilled: 2,
      });
    });

    it("no excess of either kind: it does not apply (2 against 3 hit points, and exactly lethal 3)", () => {
      expect(resolve(start(GRUNT, { followThrough: true }), TWO)).toMatchObject({ taken: 0, dealt: 0, spilled: 0 });
      expect(resolve(start(GRUNT, { followThrough: true }), THREE)).toMatchObject({ taken: 0, dealt: 0, spilled: 0 });
    });
  });
});
