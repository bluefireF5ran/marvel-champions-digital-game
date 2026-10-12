/**
 * RRG 1.8 "Main Scheme" (p. 27): "If the amount of threat on a main scheme is equal to or greater than its target
 * threat value, that main scheme is completed and the main scheme deck advances." A state, so a target that falls to
 * the threat already on the stage completes it at once, not at the next threat placement (docs/phase7-wave10.md §3.15:
 * "Reduce the target threat value of this scheme by 1 for each facedown card under it").
 *
 * `checkSchemeTargetsFell` (`resolve/state-checks.ts`) watches the derived target between frames, so every way a
 * target moves is covered by one check: a card tucked under the scheme, a modifier entering or leaving play, a
 * modifier's condition or counted value changing. Synthetic cards only.
 */

import { flat } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import { replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import { mainSchemeValue, mustInstance } from "./query.js";
import type { EffectSpec, TargetRef, ValueSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { stubAlly, stubEvent, stubMainScheme, stubSupport, stubVillain } from "./testing/fixtures.js";
import { gameAtFirstTurn, P1, P2, playerCardIntoPlay, playFree } from "./testing/wave3.js";

const n = (value: number): ValueSpec => ({ kind: "const", value });
const MAIN: TargetRef = { kind: "mainScheme" };
const ON_MAIN = { categories: ["mainScheme"] } as const;
const tuckedHere: ValueSpec = { kind: "refCount", of: { kind: "tuckedUnder", of: { kind: "self" } } };

/** "Reduce the target threat value of this scheme by 1 for each facedown card under it." */
const PRISON_CONSTANT = stubAbility("prison.constant", {
  trigger: {
    kind: "constant",
    modifiers: [{ stat: "targetThreat", amount: { kind: "product", values: [n(-1), tuckedHere] }, target: ON_MAIN }],
  },
  effects: [],
});
const stage = (abilities = [PRISON_CONSTANT.ref]) => ({
  startingThreat: flat(7),
  targetThreat: flat(9),
  acceleration: flat(0),
  abilities,
});
/** One stage: 7 threat, target 9, and its completion loses the game. */
const PRISON = stubMainScheme({ id: "prison", stages: [stage()] });
/** The same stage with another after it: its completion advances. */
const PRISON_THEN = stubMainScheme({
  id: "prison-then",
  stages: [stage(), { startingThreat: flat(1), targetThreat: flat(30), acceleration: flat(0) }],
});
/** No ability of its own; 7 threat, target 9. */
const BARE = stubMainScheme({ id: "bare", stages: [stage([])] });
/** Target 4 per player. */
const CROWD = stubMainScheme({
  id: "crowd",
  stages: [{ startingThreat: flat(5), targetThreat: { base: 0, perPlayer: 4 }, acceleration: flat(0) }],
});
const TYRANT = stubVillain({ id: "tyrant", stages: [{ hp: flat(30), atk: 0, sch: 0 }] });

const ALLY_A = stubAlly({ id: "inmate-a", cost: 0, atk: 1, thw: 1, hp: 2 });
const ALLY_B = stubAlly({ id: "inmate-b", cost: 0, atk: 1, thw: 1, hp: 2 });

const action = (id: string, ...effects: EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
const jail = (id: string, name: string) =>
  action(id, {
    kind: "tuckCards",
    cards: { kind: "ref", ref: { kind: "named", name } },
    under: MAIN,
    facedown: true,
  });
const JAIL_A = jail("jail-a", ALLY_A.name);
const JAIL_B = jail("jail-b", ALLY_B.name);
const PLACE_ONE = action("place-one", { kind: "placeThreat", target: MAIN, amount: n(1) });

/** "Reduce the target threat value of the main scheme by 2." */
const SHORTCUT_CONSTANT = stubAbility("shortcut.constant", {
  trigger: { kind: "constant", modifiers: [{ stat: "targetThreat", amount: -2, target: ON_MAIN }] },
  effects: [],
});
const SHORTCUT = stubSupport({ id: "shortcut", cost: 0, abilities: [SHORTCUT_CONSTANT.ref] });
/** "Increase the target threat value of the main scheme by 4." */
const DELAY_CONSTANT = stubAbility("delay.constant", {
  trigger: { kind: "constant", modifiers: [{ stat: "targetThreat", amount: 4, target: ON_MAIN }] },
  effects: [],
});
const DELAY = stubSupport({ id: "delay", cost: 0, abilities: [DELAY_CONSTANT.ref] });
const END_DELAY = action("end-delay", { kind: "discardFromPlay", target: { kind: "each", query: { name: DELAY.id } } });
/** "Reduce the target threat value of the main scheme by 1 for each counter here." */
const CLOCK_CONSTANT = stubAbility("clock.constant", {
  trigger: {
    kind: "constant",
    modifiers: [
      {
        stat: "targetThreat",
        amount: {
          kind: "product",
          values: [n(-1), { kind: "counters", of: { kind: "self" }, counterType: "tick" }],
        },
        target: ON_MAIN,
      },
    ],
  },
  effects: [],
});
const CLOCK = stubSupport({ id: "clock", cost: 0, abilities: [CLOCK_CONSTANT.ref] });
const TICK = action("tick", {
  kind: "addCounters",
  target: { kind: "named", name: CLOCK.name },
  counterType: "tick",
  amount: n(2),
});
const GAS = action("gas", {
  kind: "dealDamage",
  target: { kind: "each", query: { categories: ["identity"] } },
  amount: n(1),
});
const EVENTS = [JAIL_A, JAIL_B, PLACE_ONE, END_DELAY, TICK, GAS];

const deps: EngineDeps = depsOf(
  PRISON_CONSTANT,
  SHORTCUT_CONSTANT,
  DELAY_CONSTANT,
  CLOCK_CONSTANT,
  ...EVENTS.map((e) => e.ability),
);

function start(mainScheme = PRISON, players: 1 | 2 = 1): GameState {
  return gameAtFirstTurn({
    cards: [ALLY_A, ALLY_B, SHORTCUT, DELAY, CLOCK, ...EVENTS.map((e) => e.card)],
    deps,
    villain: TYRANT,
    mainScheme,
    players,
    deck: [ALLY_A.id, ALLY_B.id, SHORTCUT.id, DELAY.id, CLOCK.id, ...EVENTS.map((e) => e.card.id)],
  });
}
const of = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const target = (state: GameState) => mainSchemeValue(state, "targetThreat", deps);
const threat = (state: GameState) => mustInstance(state, state.mainScheme.instanceId).threat;
const withThreat = (state: GameState, amount: number): GameState => ({
  ...state,
  instances: {
    ...state.instances,
    [state.mainScheme.instanceId]: { ...mustInstance(state, state.mainScheme.instanceId), threat: amount },
  },
});
/** Both allies in P1's play area. */
function inmates(mainScheme = PRISON) {
  const a = playerCardIntoPlay(start(mainScheme), ALLY_A.id);
  return playerCardIntoPlay(a.state, ALLY_B.id).state;
}

describe('RRG 1.8 "Main Scheme" (p. 27): a target threat that falls to the threat on the stage completes it at once', () => {
  it("7 threat, target 9: one card tucked under the scheme makes the target 8 and nothing completes", () => {
    const base = inmates();
    expect([threat(base), target(base)]).toEqual([7, 9]);
    const run = playFree(base, deps, JAIL_A.card.id);
    expect(mustInstance(run.state, run.state.mainScheme.instanceId).tucked).toHaveLength(1);
    expect([threat(run.state), target(run.state)]).toEqual([7, 8]);
    expect(of(run.events, "mainSchemeCompleted")).toHaveLength(0);
    expect(run.state.outcome).toBeNull();
    const key = `${run.state.mainScheme.instanceId}:0:B`;
    expect(run.state.schemeTargetsSeen).toEqual({ [key]: 8 });
  });

  it("a second makes it 7: the final stage is completed and the players lose, with no threat placed", () => {
    const first = playFree(inmates(), deps, JAIL_A.card.id);
    const run = playFree(first.state, deps, JAIL_B.card.id);
    expect([threat(run.state), target(run.state)]).toEqual([7, 7]);
    expect(of(run.events, "threatPlaced")).toHaveLength(0);
    expect(of(run.events, "mainSchemeCompleted")).toEqual([{ type: "mainSchemeCompleted", stageIndex: 0 }]);
    expect(run.state.outcome).toMatchObject({ result: "loss" });
    const replayed = replay(run.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(run.state);
  });

  it("a stage with another after it advances: the new stage has its own starting threat and target", () => {
    const first = playFree(inmates(PRISON_THEN), deps, JAIL_A.card.id);
    const run = playFree(first.state, deps, JAIL_B.card.id);
    expect(of(run.events, "mainSchemeCompleted")).toEqual([{ type: "mainSchemeCompleted", stageIndex: 0 }]);
    expect(run.state.outcome).toBeNull();
    expect(run.state.mainScheme.stageIndex).toBe(1);
    expect([threat(run.state), target(run.state)]).toEqual([1, 30]);
  });

  it("threat placed still completes as before: 8 threat on a target of 8", () => {
    const first = playFree(inmates(), deps, JAIL_A.card.id);
    const run = playFree(first.state, deps, PLACE_ONE.card.id);
    expect([threat(run.state), target(run.state)]).toEqual([8, 8]);
    expect(of(run.events, "mainSchemeCompleted")).toHaveLength(1);
    expect(run.state.outcome).toMatchObject({ result: "loss" });
  });
});

describe("every way the target moves is the same check", () => {
  it("a modifier entering play: '-2 target threat' played at 7 threat on 9 completes the stage", () => {
    const run = playFree(start(BARE), deps, SHORTCUT.id);
    expect([threat(run.state), target(run.state)]).toEqual([7, 7]);
    expect(of(run.events, "mainSchemeCompleted")).toHaveLength(1);
    expect(run.state.outcome).toMatchObject({ result: "loss" });
  });

  it("a modifier entering play that leaves the target above the threat: 6 threat on 9 - 2 completes nothing", () => {
    const run = playFree(withThreat(start(BARE), 6), deps, SHORTCUT.id);
    expect([threat(run.state), target(run.state)]).toEqual([6, 7]);
    expect(run.state.outcome).toBeNull();
  });

  it("a modifier leaving play: '+4 target threat' discarded with 10 threat on 9 + 4 completes the stage", () => {
    const delayed = playerCardIntoPlay(start(BARE), DELAY.id);
    const base = withThreat(delayed.state, 10);
    expect(target(base)).toBe(13);
    const run = playFree(base, deps, END_DELAY.card.id);
    expect([threat(run.state), target(run.state)]).toEqual([10, 9]);
    expect(of(run.events, "mainSchemeCompleted")).toHaveLength(1);
    expect(run.state.outcome).toMatchObject({ result: "loss" });
  });

  it("the value a modifier counts changing: 2 counters on '-1 per counter here' take 9 to 7", () => {
    const clock = playerCardIntoPlay(start(BARE), CLOCK.id);
    expect(target(clock.state)).toBe(9);
    const run = playFree(clock.state, deps, TICK.card.id);
    expect(mustInstance(run.state, clock.id).counters.tick).toBe(2);
    expect([threat(run.state), target(run.state)]).toEqual([7, 7]);
    expect(run.state.outcome).toMatchObject({ result: "loss" });
  });

  it("a per player target counts the players who started (RRG 1.8 p. 32): 4 per player stays 8 with one eliminated", () => {
    const base = start(CROWD, 2);
    expect([threat(base), target(base)]).toEqual([5, 8]);
    const hero = base.players.find((p) => p.playerId === P2)!.identity.instanceId;
    const doomed: GameState = {
      ...base,
      instances: { ...base.instances, [hero]: { ...mustInstance(base, hero), damage: 9 } },
    };
    const run = playFree(doomed, deps, GAS.card.id, P1);
    expect(of(run.events, "playerEliminated").map((e) => e.playerId)).toEqual([P2]);
    expect([threat(run.state), target(run.state)]).toEqual([5, 8]);
    expect(of(run.events, "mainSchemeCompleted")).toHaveLength(0);
    expect(run.state.outcome).toBeNull();
  });
});

describe("the check is an edge: only a fall that crosses the threat on the stage", () => {
  it("a stage already at its target that was not completed is not completed by a further fall", () => {
    // 9 threat on a target of 9 by surgery: a stage left standing there (a card ability replaced its completion).
    const base = withThreat(inmates(), 9);
    const run = playFree(base, deps, JAIL_A.card.id);
    expect([threat(run.state), target(run.state)]).toEqual([9, 8]);
    expect(of(run.events, "mainSchemeCompleted")).toHaveLength(0);
    expect(run.state.outcome).toBeNull();
  });

  it("a target that rises is only remembered", () => {
    const run = playFree(start(BARE), deps, DELAY.id);
    expect(target(run.state)).toBe(13);
    expect(Object.values(run.state.schemeTargetsSeen ?? {})).toEqual([13]);
    expect(run.state.outcome).toBeNull();
  });
});
