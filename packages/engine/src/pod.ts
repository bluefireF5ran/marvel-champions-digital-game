/**
 * Epic Multiplayer groundwork (docs/phase7-wave9.md §3.64 to §3.67; MC55 pp. 4, 9, 10 and 18 to 21): the record of the
 * pod a game is one group of, and the pod's shared villain and shared main scheme.
 *
 * One `GameState` is one group. A scenario played in Single Group Mode (MC55 p. 10: "the only group in your pod is your
 * own group of 1–4 players") is a pod of one group whose engine is its own coordinator. Everything here is pure: no
 * `Ctx`, no card names, no randomness, so the reducer can move into a pod coordinator unchanged.
 */

import type { CardId, ScalingValue } from "@mc/content";
import { groupId, type GroupId, type InstanceId } from "./ids.js";

export { groupId, type GroupId };

/** The one group of a game with no pod, and of Single Group Mode. */
export const SINGLE_GROUP = groupId("g1");

/**
 * The pod's shared villain and shared main scheme (docs/phase7-wave9.md §3.66): the one place their hit points and
 * threat live. A group holds a copy; whoever coordinates the pod owns the original. The thresholds are fixed at setup
 * from the whole game's counts (MC55 p. 4; the neutral scheme's own text), and the two latches (`villainFlipped`,
 * `status`) let an event be answered the same way however often it is asked.
 */
export interface SharedPodState {
  /** The shared villain's hit points, fixed at setup. */
  readonly villainHp: number;
  readonly villainDamage: number;
  /** The shared villain flips once it has this many hit points or fewer left; null when it never flips. */
  readonly villainFlipAtRemaining: number | null;
  readonly villainFlipped: boolean;
  readonly schemeThreat: number;
  /** The shared scheme's target threat, fixed at setup. */
  readonly schemeTarget: number;
  /**
   * `schemeCompleted`: the shared scheme reached its target and the shared villain is not yet defeated (MC55 p. 21:
   * groups in a player phase finish it, and win if the villain is defeated before those phases end). `won` and `lost`
   * are final.
   */
  readonly status: "playing" | "schemeCompleted" | "won" | "lost";
}

/** Why threat was placed on the shared scheme (MC55 p. 21, the "two ways"). */
export type SharedThreatCause = "schemeCompleted" | "identityDefeated";

/** A change a group asks of the shared record. */
export type SharedEvent =
  | { readonly type: "sharedVillainDamaged"; readonly groupId: GroupId; readonly amount: number }
  | {
      readonly type: "sharedSchemeThreatPlaced";
      readonly groupId: GroupId;
      readonly amount: number;
      readonly cause: SharedThreatCause;
    };

/** What a shared event brought about, for every group of the pod to apply. */
export type SharedResult = "sharedVillainFlipped" | "sharedVillainDefeated" | "sharedSchemeCompleted";

const NOTHING: readonly SharedResult[] = [];

/**
 * The one reducer of the shared record: total and pure. Damage is capped at the hit points left. The flip is reported
 * once; damage that crosses the flip line and reaches 0 in one event reports the defeat only. Threat reaching the
 * target reports the completion once; damage still applies after it (the race of MC55 p. 21), and reaching 0 then is a
 * win. Nothing changes once the status is `won` or `lost`.
 */
export function applySharedEvent(
  shared: SharedPodState,
  event: SharedEvent,
): { readonly shared: SharedPodState; readonly results: readonly SharedResult[] } {
  const amount = Number.isFinite(event.amount) ? Math.max(0, Math.floor(event.amount)) : 0;
  if (amount === 0 || shared.status === "won" || shared.status === "lost") return { shared, results: NOTHING };
  if (event.type === "sharedVillainDamaged") {
    const dealt = Math.min(amount, Math.max(0, shared.villainHp - shared.villainDamage));
    if (dealt === 0) return { shared, results: NOTHING };
    const villainDamage = shared.villainDamage + dealt;
    const remaining = shared.villainHp - villainDamage;
    if (remaining === 0)
      return { shared: { ...shared, villainDamage, status: "won" }, results: ["sharedVillainDefeated"] };
    const flips =
      !shared.villainFlipped && shared.villainFlipAtRemaining !== null && remaining <= shared.villainFlipAtRemaining;
    return flips
      ? { shared: { ...shared, villainDamage, villainFlipped: true }, results: ["sharedVillainFlipped"] }
      : { shared: { ...shared, villainDamage }, results: NOTHING };
  }
  const schemeThreat = shared.schemeThreat + amount;
  return shared.status === "playing" && schemeThreat >= shared.schemeTarget
    ? { shared: { ...shared, schemeThreat, status: "schemeCompleted" }, results: ["sharedSchemeCompleted"] }
    : { shared: { ...shared, schemeThreat }, results: NOTHING };
}

/**
 * The shared record once the pod has lost: every player phase ended with the shared scheme complete and the shared
 * villain undefeated (MC55 p. 21). A record already `won` or `lost` is returned as it is.
 */
export const sharedLost = (shared: SharedPodState): SharedPodState =>
  shared.status === "won" || shared.status === "lost" ? shared : { ...shared, status: "lost" };

/**
 * The named moments (`TriggerEvent momentRaised`) the engine raises as a result of a shared event is applied in a
 * group's game, for the first player, with the neutral card as the source. A neutral card's own line answers one with a
 * forced response naming it.
 *
 * - `sharedVillainFlipped`: raised after the shared villain's new face was revealed and its When Revealed resolved.
 * - `sharedVillainDefeated`: the shared villain has no hit points left.
 * - `sharedSchemeCompleted`: raised when the pod has lost to the shared scheme, which is at once outside the player
 *   phase and at the end of a player phase the completion happened in (MC55 p. 21; docs/phase7-wave9.md §4.1 Q9 = A).
 */
export const POD_MOMENT = {
  sharedVillainFlipped: "pod.sharedVillainFlipped",
  sharedVillainDefeated: "pod.sharedVillainDefeated",
  sharedSchemeCompleted: "pod.sharedSchemeCompleted",
} as const;

/** Where this group keeps its view of the pod's two neutral cards (docs/phase7-wave9.md §3.59). */
export interface PodNeutralArea {
  /** The closed in-play scenario area holding them (`GameState.scenarioPlayAreas`). */
  readonly area: string;
  readonly villainInstanceId: InstanceId;
  readonly mainSchemeInstanceId: InstanceId;
}

/**
 * The pod this game is one group of (docs/phase7-wave9.md §3.64). The three counts are those of the start of the
 * scenario and never change (the Epic Multiplayer Reminder card: "the number of groups that began the scenario in that
 * pod"; RRG 1.8 "Per Player Icon", p. 32: "If a player is eliminated, this value does not change").
 */
export interface PodState {
  readonly groupId: GroupId;
  /** Who applies shared events: this engine (Single Group Mode) or a pod coordinator outside it (Epic). */
  readonly coordinator: "local" | "remote";
  /** A per group icon on a card in this group's game area counts these (MC55 p. 4). */
  readonly groupsInPodAtStart: number;
  /** A per group icon on a card in no group's game area counts these (MC55 p. 4). */
  readonly groupsInGameAtStart: number;
  /** The per player icons of the shared villain count these (the neutral scheme's own text). */
  readonly playersInGameAtStart: number;
  /** The shared villain and scheme; null in a scenario with no neutral cards. */
  readonly shared: SharedPodState | null;
  /** Shared events this group has emitted, and inbound events it has applied. */
  readonly outboundSeq: number;
  readonly inboundSeq: number;
  /**
   * Every group of this pod, this one included, in the pod's own order: what "choose a group in your pod" offers and
   * what "each group in your pod" runs over (docs/phase7-wave9.md §3.67). Absent in a pod of one group, where it is
   * this group alone. Read through `podGroupIds`.
   */
  readonly groupIdsInPod?: readonly GroupId[];
  /** The neutral cards as this group sees them. Absent with no neutral cards. */
  readonly neutral?: PodNeutralArea;
  /**
   * Results of shared events waiting for the resolution in progress to finish (MC55 p. 20: "first finishing any
   * actions or abilities that are currently resolving"), oldest first. Absent when none waits.
   */
  readonly pendingResults?: readonly SharedResult[];
  /**
   * The shared scheme was completed during this group's player phase, which is played to its end (MC55 p. 21: "each
   * group in the middle of a player phase may finish that phase as normal"). Absent otherwise.
   */
  readonly finalPlayerPhase?: true;
}

/** The pod's neutral cards as a setup config names them (`Scenario.neutralCards`). */
export interface PodNeutralSetup {
  /** The name of the closed in-play scenario area setup creates for them. */
  readonly area: string;
  /** A villain card: its starting side's first stage prints the shared villain's hit points. */
  readonly villainCardId: CardId;
  /** A main scheme card: its first stage prints the shared scheme's target threat. */
  readonly mainSchemeCardId: CardId;
  /**
   * "If [the shared villain] has N or fewer remaining hit points, flip this card": N as the villain card's text prints
   * it, scaled like its hit points. Absent for a shared villain that never flips.
   */
  readonly villainFlipAtRemaining?: ScalingValue;
}

/** `GameSetupConfig.pod`: the pod record a scenario builder asks for. */
export interface PodSetup {
  readonly groupId: GroupId;
  readonly coordinator: "local" | "remote";
  readonly groupsInPod: number;
  readonly groupsInGame: number;
  readonly playersInGame: number;
  /** `PodState.groupIdsInPod`: needed with more than one group in the pod, and then `groupsInPod` long. */
  readonly groupIdsInPod?: readonly GroupId[];
  readonly neutral?: PodNeutralSetup;
}

/**
 * A group as an effect names it (docs/phase7-wave9.md §3.67): `"self"` is the group whose game this is, and inside an
 * `inGroup` block the group the block is resolving in; `{ var }` is the group `chooseGroup` bound under that name.
 */
export type GroupRef = "self" | { readonly var: string };

/** Every group of the pod this game is a group of, this one included, in the pod's order. */
export const podGroupIds = (state: {
  readonly pod?: PodState;
  readonly startingPlayerCount: number;
}): readonly GroupId[] => {
  const pod = podOf(state);
  return pod.groupIdsInPod ?? [pod.groupId];
};

/** The var a chosen group is bound under: its place in `podGroupIds`. `<bind>.made` is 1 once a group is bound. */
export const groupVar = (bind: string): string => `${bind}.group`;

/** The group a ref names, or undefined for a var that holds no group. */
export function resolveGroup(
  state: { readonly pod?: PodState; readonly startingPlayerCount: number },
  group: GroupRef,
  vars: Readonly<Record<string, number>>,
): GroupId | undefined {
  if (group === "self") return podOf(state).groupId;
  const index = vars[groupVar(group.var)];
  return index === undefined ? undefined : podGroupIds(state)[index];
}

/**
 * The `inGroup` blocks of an ability, in the order its text holds them (a depth-first read of its effects, whatever
 * holds them). A block is named to another group by its place here, counting from 1 (`GameEvent podEffectRequested`),
 * and the receiving group reads the same list from the same registry.
 */
export function podBlocksOf(effects: unknown): readonly { readonly kind: "inGroup" }[] {
  if (Array.isArray(effects)) return effects.flatMap(podBlocksOf);
  if (effects === null || typeof effects !== "object") return [];
  const record = effects as Readonly<Record<string, unknown>>;
  const inner = Object.values(record).flatMap(podBlocksOf);
  return record.kind === "inGroup" ? [record as { readonly kind: "inGroup" }, ...inner] : inner;
}

/**
 * The pod of a game: its record, or the single-group default for a game that has none (one local group whose players
 * are the whole game). The only reader of `GameState.pod`.
 */
export function podOf(state: { readonly pod?: PodState; readonly startingPlayerCount: number }): PodState {
  return (
    state.pod ?? {
      groupId: SINGLE_GROUP,
      coordinator: "local",
      groupsInPodAtStart: 1,
      groupsInGameAtStart: 1,
      playersInGameAtStart: state.startingPlayerCount,
      shared: null,
      outboundSeq: 0,
      inboundSeq: 0,
    }
  );
}

const wholeAtLeastOne = (value: number): boolean => Number.isInteger(value) && value >= 1;

/** What is wrong with a pod setup for a table of `playerCount`, or null. */
export function podSetupFault(pod: PodSetup, playerCount: number): string | null {
  if (pod.groupId === "") return "a pod group needs an id";
  if (!wholeAtLeastOne(pod.groupsInPod) || !wholeAtLeastOne(pod.groupsInGame) || !wholeAtLeastOne(pod.playersInGame))
    return "a pod's group and player counts are whole numbers of 1 or more";
  if (pod.groupsInPod > pod.groupsInGame)
    return `a pod of ${pod.groupsInPod} groups cannot be part of a game of ${pod.groupsInGame}`;
  if (pod.playersInGame < playerCount)
    return `a game of ${pod.playersInGame} players cannot hold a group of ${playerCount}`;
  // A local coordinator applies shared events itself and cannot hear another group's.
  if (pod.coordinator === "local" && pod.groupsInGame > 1)
    return "a local pod coordinator cannot serve more than one group; use a remote coordinator";
  const ids = pod.groupIdsInPod;
  if (ids === undefined ? pod.groupsInPod > 1 : ids.length !== pod.groupsInPod)
    return `a pod of ${pod.groupsInPod} groups names each of them once in groupIdsInPod`;
  if (ids && (!ids.includes(pod.groupId) || new Set(ids).size !== ids.length))
    return "groupIdsInPod names every group of the pod once, this one included";
  if (pod.groupsInGame === 1 && pod.playersInGame !== playerCount)
    return `a game of one group has that group's ${playerCount} players, not ${pod.playersInGame}`;
  return null;
}
