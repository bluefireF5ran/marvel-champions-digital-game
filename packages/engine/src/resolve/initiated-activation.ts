/**
 * A keyword's activation initiates once the effect that made it has finished, and resolves its steps once the ability
 * around it has finished.
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
 * - "Each time" loops (ruling 38, Drang III: "after they've all engaged, resolve all Quickstrike and Teamwork
 *   abilities on those minions, then any Response abilities"): a keyword made in a pass of the loop is held by the
 *   frame running the loop (`keywordFramesFor`), with the announcement of its minion's engagement, and initiates only
 *   once every pass has resolved (`releaseLoopFrames`), so no "when … attacks" window opens mid-loop. Only the
 *   `forEachDiscarded` loop is marked (`Frame<"effects">.eachTimePass`). The rules expert's model A (2026-10-24),
 *   pending the owner's confirmation.
 * - While a cost is being paid nothing waits (`payingCost`): RRG 1.8 "Initiating Abilities" (p. 24) and "Cost Arrow
 *   Icon" (p. 14); ruling February 28, 2026 - Ruling 1 (Come Get Me, Bub!).
 * - A stunned status card given after the attack initiated does not cancel it: the stun replaces an attack that
 *   "would" be made (RRG 1.8 "Stun, Stunned", p. 41; "Interrupt", p. 24), checked once, at initiation (Moon Knight
 *   56002: the minion attacks and keeps its stun and confuse).
 * - Shadow of the Past (01190) follows ruling 194, which supersedes the reasoning of the Galaxy's Most Wanted rulebook
 *   FAQ ("Each sentence of Shadow of the Past is resolved one at a time, meaning Blackjack O'Hare's quickstrike attack
 *   will occur before Vendetta enters play"): Vendetta now enters play before the attack's steps. Its answer still
 *   holds: amplify adds icons to boost cards turned faceup (RRG 1.8 "Amplify Icon", p. 7), and a minion's attack is
 *   dealt none, so Vendetta's amplify does not change Blackjack O'Hare's attack.
 * - While it waits the activation is not "this activation" to `currentActivationFrameId`. Ruling 147's "dependent"
 *   effects ("this attack gains …" in a later sentence of the same ability) are not modelled for keyword activations;
 *   no printed card needs them.
 */

import { type Ctx, emit, pushFrames, setFrame, updateFrame } from "../ctx.js";
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
  if (root === undefined || payingCost(state, root)) return frame;
  return { ...frame, stepsAfterAbility: root };
}

/**
 * Whether the ability whose root frame is `root` is still paying its cost. A quickstrike triggered while a cost is
 * paid resolves in full before the effect (RRG 1.8 "Initiating Abilities", p. 24, step 5 before the effect;
 * "Cost Arrow Icon", p. 14: "Responses to the text preceding the cost arrow icon resolve before the text following
 * the icon resolves"; ruling February 28, 2026 - Ruling 1, "Come Get Me, Bub!"), so it does not wait.
 */
function payingCost(state: GameState, root: FrameId): boolean {
  const at = state.stack.findIndex((f) => f.frameId === root);
  return state.stack.slice(0, at + 1).some((f) => f.kind === "effects" && f.costEffectsPending !== undefined);
}

/**
 * The frame running the "each time" loop a pass of which is resolving now (`Frame<"effects">.eachTimePass`): the
 * frame beneath the passes. Undefined outside such a loop.
 */
function loopOwner(state: GameState): Frame<"effects"> | undefined {
  const stack = state.stack;
  let at = stack.findIndex((f) => f.kind === "effects" && f.eachTimePass === true);
  if (at < 0) return undefined;
  while (at < stack.length) {
    const f = stack[at];
    if (f?.kind !== "effects" || f.eachTimePass !== true) break;
    at++;
  }
  const owner = stack[at];
  return owner?.kind === "effects" ? owner : undefined;
}

/**
 * The quickstrike and teamwork frames of a minion put into play or engaged now (`keywords`), and the announcements of
 * its engagement (`after`). Inside a pass of an "each time" loop they are held by the frame running the loop, which
 * pushes them once every pass has resolved (`releaseLoopFrames`; FFG ruling 38, November 19, 2024, Drang III: the
 * minions' interrupts resolve "immediately after they engage a player; and after they've all engaged, resolve all
 * Quickstrike and Teamwork abilities on those minions, then any Response abilities"), and nothing is returned.
 * Otherwise they are returned, in that order, to be pushed where they are. A cost being paid holds nothing.
 *
 * Engine reading: the responses to each minion's entering play still resolve in its own pass, with its
 * `cardEntersPlay` (one event frame carries its interrupts and responses); only the announcements of the engagement
 * ("after you engage a minion") wait for the loop.
 */
export function keywordFramesFor(
  ctx: Ctx,
  keywords: readonly StackFrame[],
  after: readonly StackFrame[] = [],
): readonly StackFrame[] {
  const owner = keywords.length + after.length > 0 ? loopOwner(ctx.state) : undefined;
  if (!owner || owner.costEffectsPending !== undefined) return [...keywords, ...after];
  const held = owner.heldLoopFrames ?? { keywords: [], after: [] };
  updateFrame(ctx, owner.frameId, (f) =>
    f.kind === "effects"
      ? { ...f, heldLoopFrames: { keywords: [...held.keywords, ...keywords], after: [...held.after, ...after] } }
      : f,
  );
  return [];
}

/** `frame` resumes with frames its loop held (`keywordFramesFor`): they are pushed, keywords first, and true is returned. */
export function releaseLoopFrames(ctx: Ctx, frame: Frame<"effects">): boolean {
  const held = frame.heldLoopFrames;
  if (!held) return false;
  const { heldLoopFrames: _held, ...rest } = frame;
  setFrame(ctx, rest);
  pushFrames(ctx, [...held.keywords, ...held.after]);
  return true;
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
