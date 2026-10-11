/**
 * The damage at which a card in play breaks, for the "2/5" the board and Inspect show beside it: the engine's own
 * `selfDamageThreshold` (an `if` in the card's text that asks whether it holds N or more damage), and, where that finds
 * nothing, the same question asked of a state check: Encased in Ice (`winter` 54035) prints "when there are 3 or more
 * damage on this card, deal the excess to the attached character and discard it" as a `stateCheck` whose condition is
 * the count, which `selfDamageThreshold` does not read.
 *
 * Display only: the ability still decides when anything happens. Engine ask: `selfDamageThreshold` should read a
 * `stateCheck` trigger's `when` as well, and this fallback can then go.
 */
import {
  activeAbilityRefs,
  resolveValue,
  selfDamageThreshold,
  type EngineDeps,
  type GameState,
  type InstanceId,
} from "@mc/engine";

/** The damage count a card's `stateCheck` waits for on itself, or null when none of its state checks does. */
export function stateCheckDamageThreshold(state: GameState, id: InstanceId, deps: EngineDeps): number | null {
  const context = { selfInstanceId: id, controllerId: null, event: null, bindings: {}, deps };
  for (const ref of activeAbilityRefs(state, id, deps)) {
    const trigger = deps.abilities[ref.id]?.trigger;
    if (trigger?.kind !== "stateCheck") continue;
    const when = trigger.when;
    if (when.kind === "damagedAtLeast" && when.of.kind === "self") return when.amount;
    if (
      when.kind === "compare" &&
      when.op === "atLeast" &&
      when.left.kind === "damage" &&
      when.left.of.kind === "self"
    ) {
      return resolveValue(state, when.right, context, deps);
    }
  }
  return null;
}

/** The damage at which this card's own text acts on it, from an `if` or a state check; null when it has no such point. */
export const breakPointOf = (state: GameState, id: InstanceId, deps: EngineDeps): number | null =>
  selfDamageThreshold(state, id, deps) ?? stateCheckDamageThreshold(state, id, deps);
