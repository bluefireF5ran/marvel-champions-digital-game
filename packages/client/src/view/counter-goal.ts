/**
 * The count a card's own text waits for on a kind of counter, so the table reads "3/5 charm" against the goal instead
 * of a bare "3 charm" (Hypnotic Gaze: "If there are 5 or more charm counters here, remove each charm counter from here
 * and flip this card"). Read from the card's `stateCheck` abilities on the face in play, the way `break-point.ts` reads
 * a damage threshold: display only, the ability still decides when anything happens.
 *
 * Engine ask: expose this beside `selfDamageThreshold` (a card's own counter thresholds), and this module can go.
 */
import { activeAbilityRefs, resolveValue, type EngineDeps, type GameState, type InstanceId } from "@mc/engine";

/** Counter kind to the number of them the card's own state check waits for; empty for a card that waits for none. */
export function counterGoalsOf(state: GameState, id: InstanceId, deps: EngineDeps): Readonly<Record<string, number>> {
  const goals: Record<string, number> = {};
  const context = { selfInstanceId: id, controllerId: null, event: null, bindings: {}, deps };
  for (const ref of activeAbilityRefs(state, id, deps)) {
    const trigger = deps.abilities[ref.id]?.trigger;
    if (trigger?.kind !== "stateCheck") continue;
    const when = trigger.when;
    if (
      when.kind === "compare" &&
      when.op === "atLeast" &&
      when.left.kind === "counters" &&
      when.left.of.kind === "self"
    ) {
      goals[when.left.counterType] = resolveValue(state, when.right, context, deps);
    }
  }
  return goals;
}
