/**
 * A keyword's activation initiates now and resolves its steps once the ability around it has finished.
 *
 * FFG ruling January 11, 2024 - Ruling 137 (Planetary Invasion): the revealed minion's "Quickstrike keyword resolves,
 * initiating its attack. (The steps of the attack will then resolve at the next available opportunity.) The minion is
 * given a Tough status card immediately after this, because it's in the same sentence as the reveal effect".
 * Ruling 194 (May 23, 2024, Shadow of the Past): "her Quickstrike keyword resolves by initiating the attack (making it
 * so the attack resolves as soon as the ability that put her into play finishes). You'd finish resolving all text on
 * Shadow of the Past, then you'd resolve the rest of Belladonna's Quickstrike attack." Ruling 38 (November 19, 2024,
 * Drang III): the minions it puts into play all engage before their quickstrike and teamwork resolve. Teamwork shares
 * the model: ruling 129 (December 8, 2023: "Teamwork causes the minions to initiate their activations, and abilities
 * triggered by the initiations resolve before the activations do") and ruling 147 (February 15, 2024: "the character
 * enters play, their keyword resolves (resulting in an activation initiation), Interrupts to the activation and/or
 * Responses to them entering play resolve, then the activation resolves"). RRG 1.8 p. 4 ("resolve the ability one
 * sentence at a time") and "Quickstrike" (p. 36) / "Teamwork (Trait)" (p. 43) do not say otherwise.
 *
 * How. A quickstrike attack or teamwork activation made while an ability resolves carries that ability's root effects
 * frame (`Frame<"event">.stepsAfterAbility`; `enclosingAbilityRoot`: the innermost effects frame of an ability on the
 * stack, its root by `abilityRootFrameId`). Its event frame resolves where it always did up to its apply step: the
 * status check (a stunned or confused status card replaces it), "cannot activate", its "initiated" line and its
 * "when … attacks / schemes" interrupt window. Then, instead of applying, it moves beneath that root frame
 * (`awaitingAbility`, logged as `activationAwaitsAbility`), after any activation already waiting there, so they keep
 * the order they were initiated in. Once the ability has finished (its root frame has left the stack, the response
 * windows its sentences held have opened above it) the frame is on top again and its steps resolve as before.
 *
 * Engine readings, flagged:
 * - The "ability around it" is the innermost one on the stack, whatever lies between (the minion's reveal frame, a
 *   `forEach` pass, an event frame): a minion put into play, engaged or revealed by an ability's text. A minion
 *   revealed or engaged by a game step with no ability resolving (the villain phase's encounter cards) has none, and
 *   its activation resolves at once, as before.
 * - An ability with nothing left to resolve after the effect that initiated the activation (`abilityHasMore`: no
 *   later effect, branch, sentence or `forEach` pass) does not make it wait: its steps resolve at once, before the
 *   response windows that the ability's end opens, as the sentence hold leaves the responses to a sentence's last
 *   effect alone (`sentence-hold.ts`). So "reveal the top card of the encounter deck" and nothing else keeps the
 *   order of a villain-phase reveal (FAQ "Widow's Bite (#10)", RRG 1.8 p. 60; the owner's answers 30B and 32B).
 * - Ruling 38 says the quickstrikes of Drang III's minions resolve after they have all engaged. This engine reads
 *   "resolve" there as ruling 137 does: each attack is initiated as its minion engages (its "when … attacks"
 *   interrupts then), and its steps follow once Drang III's ability has finished.
 * - While it waits the activation is not "this activation" to `currentActivationFrameId`. Ruling 147's "dependent"
 *   effects ("this attack gains …" in a later sentence of the same ability) are not modelled for keyword activations;
 *   no printed card needs them.
 */

import { type Ctx, emit, setFrame } from "../ctx.js";
import type { FrameId } from "../ids.js";
import type { StackFrame } from "../stack.js";
import type { GameState } from "../state.js";
import type { Frame } from "./frames.js";
import { abilityRootFrameId } from "./thwart-session.js";

/** The root effects frame of the innermost ability resolving on the stack, or undefined when none is. */
export function enclosingAbilityRoot(state: GameState): FrameId | undefined {
  const innermost = state.stack.find((f): f is Frame<"effects"> => f.kind === "effects" && f.abilityId !== undefined);
  return innermost ? abilityRootFrameId(state, innermost) : undefined;
}

/**
 * `frame`, an enemy activation event frame a keyword initiates (quickstrike's attack, teamwork's activation), marked
 * to resolve its steps after the ability resolving now. Unchanged when no ability is resolving.
 */
export function stepsAfterEnclosingAbility(state: GameState, frame: StackFrame): StackFrame {
  if (frame.kind !== "event") return frame;
  if (frame.event.kind !== "enemyAttack" && frame.event.kind !== "enemyScheme") return frame;
  const root = enclosingAbilityRoot(state);
  return root === undefined ? frame : { ...frame, stepsAfterAbility: root };
}

/**
 * Whether the ability whose root frame is `stack[rootAt]` still has an effect to resolve: one of its effects frames
 * between the activation (`stack[at]`) and its root, the root included, has not reached its last effect. A branch, a
 * `forEach` pass not yet begun and a later sentence all count.
 */
function abilityHasMore(stack: readonly StackFrame[], at: number, rootAt: number): boolean {
  const root = stack[rootAt];
  if (root?.kind !== "effects") return false;
  return stack
    .slice(at + 1, rootAt + 1)
    .some(
      (f) =>
        f.kind === "effects" &&
        f.abilityId === root.abilityId &&
        f.selfInstanceId === root.selfInstanceId &&
        f.cursor < f.effects.length,
    );
}

/**
 * The apply step of an activation marked `stepsAfterAbility`. While its ability is still on the stack it moves beneath
 * the ability's root frame and true is returned: nothing more of it resolves until it is on top again. Otherwise (it
 * has waited, or the ability is gone) the marks are cleared and the cleared frame is returned for the apply step.
 */
export function awaitEnclosingAbility(ctx: Ctx, frame: Frame<"event">): true | Frame<"event"> {
  const root = frame.stepsAfterAbility;
  const { stepsAfterAbility: _root, awaitingAbility: _waiting, ...cleared } = frame;
  const stack = ctx.state.stack;
  const at = stack.findIndex((f) => f.frameId === frame.frameId);
  const rootAt = root === undefined ? -1 : stack.findIndex((f) => f.frameId === root);
  if (frame.awaitingAbility || frame.cancelled || rootAt < 0 || rootAt < at || !abilityHasMore(stack, at, rootAt)) {
    setFrame(ctx, cleared);
    return cleared;
  }
  const rest = stack.filter((f) => f.frameId !== frame.frameId);
  let place = rest.findIndex((f) => f.frameId === root) + 1;
  // After the activations, and an "(attack)" ability's attacks, already waiting for the same ability.
  while (place < rest.length) {
    const below = rest[place];
    if (below?.kind !== "event") break;
    const waiting =
      (below.awaitingAbility === true && below.stepsAfterAbility === root) ||
      (below.attackWaiting === true && below.attackOf === root);
    if (!waiting) break;
    place++;
  }
  const waiting: Frame<"event"> = { ...frame, awaitingAbility: true };
  ctx.state = { ...ctx.state, stack: [...rest.slice(0, place), waiting, ...rest.slice(place)] };
  const event = frame.event;
  if (event.kind === "enemyAttack" || event.kind === "enemyScheme")
    emit(ctx, {
      type: "activationAwaitsAbility",
      activationFrameId: frame.frameId,
      abilityFrameId: root!,
      enemyInstanceId: event.enemyInstanceId,
      activation: event.kind === "enemyAttack" ? "attack" : "scheme",
    });
  return true;
}
