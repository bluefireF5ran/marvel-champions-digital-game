/**
 * Test-local cards for the pod's shared villain and shared scheme (docs/phase7-wave9.md §3.59, §3.66), shaped like
 * `tt` 55027a/b (Loki, God of Lies) and 55028a/b (Worlds Collide), and the scripts that reach them.
 */

import { flat, perGroupOnly, perPlayerOnly, type AnyCard } from "@mc/content";
import type { EngineDeps } from "../abilities.js";
import type { InstanceId } from "../ids.js";
import { POD_MOMENT, SINGLE_GROUP, type PodSetup, type SharedThreatCause } from "../pod.js";
import { mustInstance } from "../query.js";
import type { EffectSpec, TargetRef } from "../spec.js";
import type { GameState } from "../state.js";
import { depsOf, stubAbility, type StubAbility } from "./abilities.js";
import { stubEnvironment, stubEvent, stubMainScheme, stubTreachery, stubVillain } from "./fixtures.js";

const n = (value: number) => ({ kind: "const", value }) as const;
const named = (name: string): TargetRef => ({ kind: "each", query: { name } });

/** An environment the test scripts leave marks on, so the order things resolved in can be read off its counters. */
export const LEDGER = stubEnvironment({ id: "ledger" });
const mark = (counterType: string): EffectSpec => ({
  kind: "addCounters",
  target: named("ledger"),
  counterType,
  amount: n(1),
});

/** Side B: "When Revealed: [mark the ledger]. If [the shared villain] is defeated, all players win the game." */
export const SHARED_REVEALED = stubAbility("shared-villain.when-revealed", {
  trigger: { kind: "whenRevealed" },
  effects: [mark("revealed")],
});
export const SHARED_DEFEATED = stubAbility("shared-villain.defeated", {
  trigger: {
    kind: "response",
    forced: true,
    on: { on: "momentRaised", eventIs: { name: POD_MOMENT.sharedVillainDefeated } },
  },
  effects: [mark("defeated"), { kind: "endGame", result: "win" }],
});
/** Answers the flip's moment, after the When Revealed. */
export const SHARED_FLIPPED = stubAbility("shared-villain.flipped", {
  trigger: {
    kind: "response",
    forced: true,
    on: { on: "momentRaised", eventIs: { name: POD_MOMENT.sharedVillainFlipped } },
  },
  effects: [
    {
      kind: "addCounters",
      target: named("ledger"),
      counterType: "flipHeardAfterRevealed",
      amount: { kind: "counters", of: named("ledger"), counterType: "revealed" },
    },
  ],
});
const dashed = { atk: 0, sch: 0, dashedStats: ["atk", "sch"] } as const;
export const SHARED_VILLAIN = stubVillain({
  id: "shared-villain",
  stages: [{ hp: perPlayerOnly(20), ...dashed }],
  back: {
    name: "shared-villain",
    stages: [
      { hp: perPlayerOnly(20), ...dashed, abilities: [SHARED_REVEALED.ref, SHARED_DEFEATED.ref, SHARED_FLIPPED.ref] },
    ],
  },
});

/** "If this stage is completed, the players lose the game." */
export const SHARED_COMPLETED = stubAbility("shared-scheme.completed", {
  trigger: {
    kind: "response",
    forced: true,
    on: { on: "momentRaised", eventIs: { name: POD_MOMENT.sharedSchemeCompleted } },
  },
  effects: [mark("lost"), { kind: "endGame", result: "loss", reason: "cardAbility" }],
});
export const SHARED_SCHEME = stubMainScheme({
  id: "shared-scheme",
  stages: [
    {
      startingThreat: flat(0),
      targetThreat: perGroupOnly(2),
      acceleration: flat(0),
      abilities: [SHARED_COMPLETED.ref],
    },
  ],
});

export const NEUTRAL = {
  area: "neutral",
  villainCardId: SHARED_VILLAIN.id,
  mainSchemeCardId: SHARED_SCHEME.id,
  villainFlipAtRemaining: perPlayerOnly(10),
};
export const singleGroup = (players: number): PodSetup => ({
  groupId: SINGLE_GROUP,
  coordinator: "local",
  groupsInPod: 1,
  groupsInGame: 1,
  playersInGame: players,
  neutral: NEUTRAL,
});

export const sharedEvent = (
  event: "villainDamaged" | "schemeThreatPlaced",
  amount: number,
  cause?: SharedThreatCause,
): EffectSpec => ({ kind: "sharedEvent", event, amount: n(amount), ...(cause ? { cause } : {}) });

export interface PodScript {
  readonly card: AnyCard;
  readonly ability: StubAbility;
}
/** A free event: its effects, then a mark on the ledger so "after the whole ability" can be read. */
export const podEvent = (id: string, effects: readonly EffectSpec[]): PodScript => {
  const ability = stubAbility(`${id}.action`, {
    trigger: { kind: "action" },
    reaches: { scenarioPlayArea: NEUTRAL.area },
    effects: [...effects, mark("after")],
  });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
/** A treachery whose When Revealed is the effects. */
export const podTreachery = (id: string, effects: readonly EffectSpec[]): PodScript => {
  const ability = stubAbility(`${id}.when-revealed`, {
    trigger: { kind: "whenRevealed" },
    reaches: { scenarioPlayArea: NEUTRAL.area },
    effects,
  });
  return { card: stubTreachery({ id, boostIcons: 0, abilities: [ability.ref] }), ability };
};

export const NEUTRAL_ABILITIES = [SHARED_REVEALED, SHARED_DEFEATED, SHARED_FLIPPED, SHARED_COMPLETED];
/** The registry with the neutral cards' own lines scripted. */
export const scriptedDeps = (...scripts: readonly PodScript[]): EngineDeps =>
  depsOf(...NEUTRAL_ABILITIES, ...scripts.map((s) => s.ability));
/** The registry with no neutral card scripted: the engine's own conclusion of the pod. */
export const unscriptedDeps = (...scripts: readonly PodScript[]): EngineDeps =>
  depsOf(...scripts.map((s) => s.ability));

export const ledgerMarks = (state: GameState): Readonly<Record<string, number>> => {
  const id = Object.keys(state.instances).find((key) => state.instances[key]?.cardId === LEDGER.id) as InstanceId;
  return mustInstance(state, id).counters;
};
