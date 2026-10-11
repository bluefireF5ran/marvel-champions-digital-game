/**
 * An attack or scheme a card effect makes is announced as an activation, so "when [enemy] activates against you"
 * interrupts it as it interrupts step two of the villain phase.
 *
 * Sources: RRG 1.8 "Activation" (p. 6): "Some card abilities can also cause enemies to attack or scheme. These are
 * also considered activations"; owner ruling docs/phase7-wave5.md §4.1 Q67 ("when/after X activates against you"
 * matches card-caused activations too); RRG 1.8 "Cancel" (p. 12) and "'Then'" (p. 44) for a cancelled one.
 */

import { flat } from "@mc/content";
import type { CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { replay, startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import { playerId, type InstanceId } from "./ids.js";
import { mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility, type StubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubMainScheme, stubSupport, stubTreachery, stubVillain } from "./testing/fixtures.js";
import { defaultPick, giveCards, newGame, RESOURCE, runWith } from "./testing/scenario.js";

const p1 = playerId("p1");
const copies = (id: CardId, n: number): readonly CardId[] => Array.from({ length: n }, () => id);
const theVillain = { kind: "villain" } as const;
const you = { kind: "controller" } as const;
const mark = (amount: number): EffectSpec => ({
  kind: "dealDamage",
  target: theVillain,
  amount: { kind: "const", value: amount },
});

/** "Forced Interrupt: When the villain activates against you, deal 1 damage to it." */
const WARY = stubAbility("wary.forced-interrupt", {
  trigger: {
    kind: "interrupt",
    forced: true,
    on: { on: "enemyActivating", targetIs: { categories: ["villain"] }, playerIs: "controller" },
  },
  effects: [mark(1)],
});
/** "Forced Interrupt: When an enemy would activate, cancel that activation." */
const BIND = stubAbility("bind.forced-interrupt", {
  trigger: { kind: "interrupt", forced: true, on: { on: "enemyActivating" } },
  effects: [{ kind: "cancelTriggeringEvent" }],
});
/** "Forced Interrupt: When an enemy would activate against you, flip to alter-ego form." */
const DUCK = stubAbility("duck.forced-interrupt", {
  trigger: { kind: "interrupt", forced: true, on: { on: "enemyActivating" } },
  effects: [{ kind: "changeForm", player: you, to: "alterEgo" }],
});

const action = (id: string, effects: readonly EffectSpec[]) =>
  stubAbility(id, { trigger: { kind: "action" }, effects });
const made: EffectSpec = {
  kind: "if",
  condition: { kind: "varAtLeast", name: "a.made", amount: 1 },
  then: [mark(5)],
};
/** "The villain attacks you with +2 ATK. If it attacked, deal 5 damage to it." */
const ATTACKS = action("attacks.action", [
  { kind: "enemyAttack", enemies: theVillain, against: you, atkBonus: { kind: "const", value: 2 }, bind: "a" },
  made,
]);
/** "The villain schemes with +1 SCH." */
const SCHEMES = action("schemes.action", [
  { kind: "enemyScheme", enemies: theVillain, against: you, schBonus: { kind: "const", value: 1 }, bind: "a" },
  made,
]);
/** "The villain activates against you (+2 ATK or +1 SCH)." */
const ACTIVATES = action("activates.action", [
  {
    kind: "enemyActivation",
    enemies: theVillain,
    against: you,
    atkBonus: { kind: "const", value: 2 },
    schBonus: { kind: "const", value: 1 },
    bind: "a",
  },
  made,
]);

/** The same attack resolved once more against the player (`additionalResolution`): not another activation. */
const AGAIN = action("again.action", [
  { kind: "enemyAttack", enemies: theVillain, against: you, additionalResolution: true, bind: "a" },
  made,
]);

const ALL = [WARY, BIND, DUCK, ATTACKS, SCHEMES, ACTIVATES, AGAIN] as const;
const SUPPORT = new Map(
  ALL.map((a) => [a, stubSupport({ id: a.ref.id.split(".")[0]!, cost: 0, abilities: [a.ref] })] as const),
);
const BLANK = stubTreachery({ id: "blank", boostIcons: 0 });
const deps: EngineDeps = depsOf(...ALL);

interface Setup {
  readonly state: GameState;
  readonly inPlay: ReadonlyMap<StubAbility, InstanceId>;
  readonly villain: InstanceId;
}

/** Villain ATK 1, SCH 1, boost cards with no icons; the hero in hero form with `abilities`' supports in play. */
function setup(...abilities: readonly StubAbility[]): Setup {
  const supports = abilities.map((a) => SUPPORT.get(a as (typeof ALL)[number])!);
  const state = newGame({
    villain: stubVillain({ id: "villain", stages: [{ hp: flat(30), atk: 1, sch: 1 }] }),
    mainScheme: stubMainScheme({
      id: "main",
      stages: [{ startingThreat: flat(0), targetThreat: flat(40), acceleration: flat(0) }],
    }),
    extraCards: [BLANK, ...SUPPORT.values()],
    deck: [...supports.map((s) => s.id), ...copies(RESOURCE.id, 20)],
    encounterDeck: copies(BLANK.id, 20),
    deps,
  });
  const given = giveCards(state, p1, ...supports.map((s) => s.id));
  const ids = given.ids as readonly InstanceId[];
  const ready = runWith(
    deps,
    given.state,
    { type: "changeForm", playerId: p1 },
    ...ids.map((id): Command => ({
      type: "playCard",
      playerId: p1,
      cardInstanceId: id,
      payment: [],
      attachToInstanceId: null,
    })),
  );
  return {
    state: ready,
    inPlay: new Map(abilities.map((a, index) => [a, ids[index]!] as const)),
    villain: Object.values(ready.instances).find((i) => i.cardId === "villain")!.instanceId,
  };
}

function use(s: Setup, ability: StubAbility) {
  const command: Command = {
    type: "useAbility",
    playerId: p1,
    cardInstanceId: s.inPlay.get(ability)!,
    abilityId: ability.ref.id as Extract<Command, { type: "useAbility" }>["abilityId"],
    payment: [],
  };
  const { session, events } = driveSession(startSession(s.state), deps, [command], defaultPick);
  return { state: session.state, events, session };
}

const of = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const damage = (state: GameState, s: Setup): number => mustInstance(state, s.villain).damage;
const threat = (state: GameState): number => mustInstance(state, state.mainScheme.instanceId).threat;

describe("a card-made activation is announced to 'when [enemy] activates against you'", () => {
  it("with nothing listening, the attack is pushed as before and no activation is announced", () => {
    const s = setup(ATTACKS);
    const { state, events } = use(s, ATTACKS);
    expect(of(events, "attackResolved")).toMatchObject([{ baseAtk: 3 }]);
    expect(damage(state, s)).toBe(5);
    expect(
      of(events, "triggerEvent").some((e) => e.event.kind === "enemyActivating"),
      "no announcement without a listener",
    ).toBe(false);
  });

  it("'X attacks you': the forced interrupt resolves before the attack, which keeps its +ATK and reports back", () => {
    const s = setup(ATTACKS, WARY);
    const { state, events, session } = use(s, ATTACKS);
    // 1 from the interrupt, 5 from "if it attacked".
    expect(damage(state, s)).toBe(6);
    expect(of(events, "attackResolved")).toMatchObject([{ enemyInstanceId: s.villain, baseAtk: 3 }]);
    const interrupt = events.findIndex((e) => e.type === "damageDealt" && e.targetInstanceId === s.villain);
    const attack = events.findIndex((e) => e.type === "attackResolved");
    expect(interrupt).toBeGreaterThanOrEqual(0);
    expect(interrupt).toBeLessThan(attack);
    const replayed = replay(session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(session.state);
  });

  it("'X schemes' in hero form is still a scheme: interrupted, then SCH with its bonus is placed", () => {
    const s = setup(SCHEMES, WARY);
    const { state, events } = use(s, SCHEMES);
    expect(of(events, "schemeResolved")).toMatchObject([{ baseSch: 2, threatPlaced: 2 }]);
    expect(of(events, "attackResolved")).toHaveLength(0);
    expect(threat(state)).toBe(2);
    expect(damage(state, s)).toBe(6);
  });

  it("a cancelled activation makes no attack, and the effect that made it hears that it did not happen", () => {
    const s = setup(ATTACKS, BIND);
    const { state, events } = use(s, ATTACKS);
    expect(of(events, "attackResolved")).toHaveLength(0);
    expect(damage(state, s)).toBe(0);
    expect(mustInstance(state, mustPlayer(state, p1).identity.instanceId).damage).toBe(0);
  });

  it("'X activates against you' reads the form after the interrupts: flipped to alter-ego, the villain schemes", () => {
    const s = setup(ACTIVATES, DUCK);
    const { state, events } = use(s, ACTIVATES);
    expect(mustPlayer(state, p1).identity.form).toBe("alterEgo");
    expect(of(events, "attackResolved")).toHaveLength(0);
    expect(of(events, "schemeResolved")).toMatchObject([{ baseSch: 2, threatPlaced: 2 }]);
    expect(damage(state, s)).toBe(5);
  });

  it("an additional resolution of the same attack is not announced as another activation", () => {
    const s = setup(AGAIN, WARY);
    const { state, events } = use(s, AGAIN);
    expect(of(events, "attackResolved")).toHaveLength(1);
    // No 1 from the interrupt: only the 5 from "if it attacked".
    expect(damage(state, s)).toBe(5);
  });

  it("'X attacks you' stays an attack when an interrupt flips the player to alter-ego form", () => {
    const s = setup(ATTACKS, DUCK);
    const { state, events } = use(s, ATTACKS);
    expect(mustPlayer(state, p1).identity.form).toBe("alterEgo");
    expect(of(events, "schemeResolved")).toHaveLength(0);
    expect(of(events, "attackResolved")).toMatchObject([{ baseAtk: 3 }]);
    expect(damage(state, s)).toBe(5);
  });
});
