/**
 * "Forced Action" abilities on the board (RRG 1.8 "Action" p. 6 and "Forced Action" p. 20; docs/phase7-wave9.md §3.53):
 * an Action the player must use during their turn if able, a Trance or a Temptation attached to their identity. The
 * phase cannot end until it is used: `endTurn` is refused (`forced_action_outstanding`) and, for one that became owed
 * after the last turn, the engine opens a `chooseOption { forcedAction: true }` prompt.
 *
 * The engine decides what is owed (`outstandingForcedActions`: in play, text not blank, cost payable, a target exists).
 * This module only reads that answer back out of what the client already holds:
 *
 *  - a forced ability the engine lists as *legal* for this seat right now is owed, because `outstandingForcedActions`
 *    and `legalActions` evaluate the same `useAbility` (an exhausted card, an unpayable cost or a blanked text box is in
 *    neither);
 *  - the End Turn refusal carries the engine's own code, and the owed cards are named from the abilities above.
 */
import type { AbilityId } from "@mc/content";
import {
  activeAbilityRefs,
  type EngineDeps,
  type GameState,
  type InstanceId,
  type LegalActions,
  type PendingChoice,
} from "@mc/engine";
import type { Highlights } from "./highlights.js";
import { legalEntriesOf } from "./highlights.js";
import { faceUpName } from "./names.js";

/** The `EngineErrorCode` End Turn is refused with while a Forced Action is owed. */
export const FORCED_ACTION_CODE = "forced_action_outstanding";

/** Whether this ability is a "Forced Action" (`AbilityTriggerSpec action.forced`). */
export const isForcedAbility = (deps: EngineDeps, abilityId: AbilityId): boolean => {
  const trigger = deps.abilities[abilityId]?.trigger;
  return trigger?.kind === "action" && trigger.forced === true;
};

/** The Forced Action abilities a card in play has (its active face), whether or not they can be used right now. */
export function forcedAbilitiesOf(state: GameState, id: InstanceId, deps: EngineDeps): readonly AbilityId[] {
  return activeAbilityRefs(state, id, deps)
    .map((ref) => ref.id)
    .filter((abilityId) => isForcedAbility(deps, abilityId));
}

/** An owed Forced Action: the card and its ability. */
export interface OwedForcedAction {
  readonly instanceId: InstanceId;
  readonly abilityId: AbilityId;
}

/** The Forced Actions this seat owes right now, as the engine lists them usable (see the file comment). */
export function owedForcedActions(actions: LegalActions | null, deps: EngineDeps): readonly OwedForcedAction[] {
  if (actions?.kind !== "turn") return [];
  return legalEntriesOf(actions).flatMap((entry) =>
    entry.action.kind === "useAbility" && isForcedAbility(deps, entry.action.abilityId)
      ? [{ instanceId: entry.action.instanceId, abilityId: entry.action.abilityId }]
      : [],
  );
}

/** "Trance of Sloth", or "Trance of Sloth, Kiss of Temptation": the cards owed, each named once. */
export function owedNames(state: GameState, owed: readonly OwedForcedAction[]): string {
  return [...new Set(owed.map((action) => faceUpName(state, action.instanceId)))].join(", ");
}

/** "Use first: Trance of Sloth": End Turn's reason while Forced Actions are owed (the dimmed button's words). */
export const endTurnOwedReason = (state: GameState, owed: readonly OwedForcedAction[]): string =>
  `Use first: ${owedNames(state, owed)}`;

/**
 * `marks` with the owed Forced Actions marked (`Highlights.owed`: the card, with the words the board writes on it) and End
 * Turn's refusal worded as a short reason naming the cards. Nothing changes when none is owed.
 */
export function withForcedActions(
  marks: Highlights,
  actions: LegalActions | null,
  state: GameState,
  deps: EngineDeps,
): Highlights {
  const owed = owedForcedActions(actions, deps);
  if (owed.length === 0) return marks;
  const basics = marks.basics.map((basic) =>
    basic.action === "endTurn" && !basic.enabled && basic.code === FORCED_ACTION_CODE
      ? { ...basic, reason: endTurnOwedReason(state, owed) }
      : basic,
  );
  return { ...marks, basics, owed: new Set(owed.map((action) => action.instanceId)) };
}

/** Whether an open choice is the end-of-phase "you must use one of these" prompt. */
export const isForcedActionChoice = (choice: PendingChoice): boolean =>
  choice.prompt.kind === "chooseOption" && choice.prompt.forcedAction === true;
