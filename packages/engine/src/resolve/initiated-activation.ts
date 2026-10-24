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
 * Responses to them entering play resolve, then the activation resolves"). Quickstrike initiates the attack; the
 * attack's steps resolve after the enclosing ability (ruling Feb 15, 2024 #147; May 23, 2024 #194). The keyword counts
 * as resolved only once the attack has fully resolved (RRG 1.8 'Activation', p. 6): what answers after the keyword (the
 * responses to its minion entering play or engaging that wait above the ability's root) moves beneath the waiting
 * activation as it parks (`answersAfterKeyword`, `Frame<"event">.heldForAbility`), so it resolves after the attack.
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
 *   abilities on those minions, then any Response abilities"; RRG 1.8 p. 38 agrees): a keyword made in a pass of the
 *   loop is held by the frame running the loop (`keywordFramesFor`), with every response to its minion entering play or
 *   engaging (the `cardEntersPlay` frame keeps only its interrupts and its apply step, `responsesLater`), and
 *   initiates only once every pass has resolved (`releaseLoopFrames`), so no "when … attacks" window opens mid-loop.
 *   Two or more held keywords are ordered by the first player (`orderLoopKeywords`, discard order by default). The
 *   loop is the innermost ability's own (`loopOwner`); only `forEachDiscarded` is marked (`eachTimePass`). The rules
 *   expert's model A (2026-10-24), pending the owner's confirmation.
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
 * - While it waits the activation is "this attack" to `currentActivationFrameId` (ruling 147: a later sentence's
 *   "dependent" effects resolve with the initiated activation) and attacking to `attackInProgress` and "the attacking
 *   enemy" (RRG 1.8 FAQ "Nova (#12)", p. 59; ruling August 7, 2025). Engine reading awaiting the owner: a later,
 *   non-dependent sentence's "the attacking enemy" names it too. The defense lookups (`currentEnemyAttackFrame`, the
 *   defender, the attacked player and character) skip it (`awaitingAbility` in `stack.ts`): it has no attack procedure
 *   yet, and an outer attack in progress is the one being defended.
 */

import { type Ctx, emit, pushFrames, requestChoice, setFrame, updateFrame } from "../ctx.js";
import type { FrameId, InstanceId } from "../ids.js";
import { getInstance } from "../query.js";
import { cardsInPlay } from "../select.js";
import type { StackFrame } from "../stack.js";
import type { GameState } from "../state.js";
import { simultaneousOrderer } from "../villain/authority.js";
import { displayNameOf } from "../visibility.js";
import { base, type Frame } from "./frames.js";
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

/** Whether `f` is an effects frame of the same ability resolution as `of`. */
const sameAbility = (f: StackFrame | undefined, of: Frame<"effects">): f is Frame<"effects"> =>
  f?.kind === "effects" && f.abilityId === of.abilityId && f.selfInstanceId === of.selfInstanceId;

/**
 * The frame running the "each time" loop of the innermost ability resolving now, while one of the loop's passes
 * resolves (`Frame<"effects">.eachTimePass`): the frame of that ability beneath the passes. Undefined when the innermost
 * ability is not in such a loop: a response ability resolving inside a pass of another ability's loop holds nothing on
 * that loop.
 */
function loopOwner(state: GameState): Frame<"effects"> | undefined {
  const stack = state.stack;
  const innermostAt = stack.findIndex((f) => f.kind === "effects" && f.abilityId !== undefined);
  const innermost = stack[innermostAt];
  if (innermost?.kind !== "effects") return undefined;
  let at = innermostAt;
  while (sameAbility(stack[at], innermost) && (stack[at] as Frame<"effects">).eachTimePass !== true) at++;
  if (!sameAbility(stack[at], innermost)) return undefined;
  while (sameAbility(stack[at], innermost) && (stack[at] as Frame<"effects">).eachTimePass === true) at++;
  const owner = stack[at];
  return sameAbility(owner, innermost) ? owner : undefined;
}

/** A minion's entering play engaged with a player, or an in-play minion's engagement. */
function answersAMinion(state: GameState, frame: StackFrame): boolean {
  if (frame.kind !== "event") return false;
  if (frame.event.kind === "minionEngaged") return true;
  return frame.event.kind === "cardEntersPlay" && getInstance(state, frame.event.instanceId)?.engagedWith != null;
}

/**
 * An event frame split for an "each time" loop: the part resolved in the pass (its interrupt window and its apply
 * step, `responsesLater`) and the part held for the end of the loop (its responses, as a frame of the same event at
 * `stage: "responses"`). A frame that is only an announcement is held whole.
 */
function splitResponses(ctx: Ctx, frame: StackFrame): { readonly now?: StackFrame; readonly later?: StackFrame } {
  if (!answersAMinion(ctx.state, frame)) return { now: frame };
  if (frame.kind !== "event" || frame.stage !== "interrupts") return { later: frame };
  const { responsesLater: _later, ...rest } = frame;
  return { now: { ...frame, responsesLater: true }, later: { ...rest, ...base(ctx), stage: "responses" } };
}

/**
 * The frames that follow a minion put into play or engaged now: `entered` (its `cardEntersPlay`, or an in-play
 * minion's engagement, each carrying its interrupts and its responses), `keywords` (its quickstrike and teamwork) and
 * `after` (the announcements of its engagement, "after you engage a minion"). Returns the frames to push now, in that
 * order.
 *
 * Inside a pass of an "each time" loop (`loopOwner`) only the interrupts and the entering itself resolve in the pass;
 * the keywords, and every response to the minion entering play or engaging, are held by the frame running the loop and
 * pushed once every pass has resolved (`releaseLoopFrames`). FFG ruling 38, November 19, 2024, Drang III: "you will
 * resolve any 'Interrupt' abilities on the minions immediately after they engage a player; and after they've all
 * engaged, resolve all Quickstrike and Teamwork abilities on those minions, then any Response abilities". RRG 1.8
 * "Reveal" (p. 38) holds a revealed card's responses the same way. A cost being paid holds nothing.
 */
export function keywordFramesFor(
  ctx: Ctx,
  keywords: readonly StackFrame[],
  after: readonly StackFrame[] = [],
  entered: readonly StackFrame[] = [],
): readonly StackFrame[] {
  const owner = loopOwner(ctx.state);
  if (!owner || owner.costEffectsPending !== undefined) return [...entered, ...keywords, ...after];
  if (keywords.length + after.length === 0 && !entered.some((f) => answersAMinion(ctx.state, f))) return entered;
  const split = entered.map((frame) => splitResponses(ctx, frame));
  const held = owner.heldLoopFrames ?? { keywords: [], after: [] };
  const later = [...split.flatMap((part) => (part.later ? [part.later] : [])), ...after];
  updateFrame(ctx, owner.frameId, (f) =>
    f.kind === "effects"
      ? { ...f, heldLoopFrames: { keywords: [...held.keywords, ...keywords], after: [...held.after, ...later] } }
      : f,
  );
  return split.flatMap((part) => (part.now ? [part.now] : []));
}

/** The minion a held keyword frame belongs to: a quickstrike attack's enemy, a teamwork step's minion. */
function keywordMinion(frame: StackFrame): InstanceId | null {
  if (frame.kind === "event" && frame.event.kind === "enemyAttack") return frame.event.enemyInstanceId;
  if (frame.kind === "effects") return frame.selfInstanceId;
  return null;
}

/** "Quickstrike" or "Teamwork", for the order prompt. */
const keywordLabel = (frame: StackFrame): string => (frame.kind === "event" ? "Quickstrike" : "Teamwork");

/**
 * `frame` resumes with frames its loop held (`keywordFramesFor`): its keywords, then the responses. Two or more keywords
 * are ordered by the first player (RRG 1.8 "Simultaneous Resolution", p. 40; "Activation", p. 6: "If multiple
 * activations are initiated this way, the first player decides the order"; ruling December 8, 2023 - Ruling 129:
 * teamwork activations initiate simultaneously and resolve one at a time "in the order that you choose"); the options
 * are listed in the order the minions were discarded, the default. A response held for a card that did not enter play
 * after all (its entering was cancelled) is dropped. True when it pushed or asked.
 */
export function releaseLoopFrames(ctx: Ctx, frame: Frame<"effects">): boolean {
  const held = frame.heldLoopFrames;
  if (!held) return false;
  let keywords = held.keywords;
  if (keywords.length >= 2) {
    if (!frame.answer) {
      requestChoice(ctx, {
        playerId: simultaneousOrderer(ctx.state),
        authority: "firstPlayerOrders",
        prompt: { kind: "orderLoopKeywords" },
        options: keywords.map((f, index) => {
          const minion = keywordMinion(f);
          return {
            optionId: String(index),
            label: minion ? `${keywordLabel(f)}: ${displayNameOf(ctx.state, minion)}` : keywordLabel(f),
            ref: minion ? ({ kind: "card", instanceId: minion } as const) : ({ kind: "none" } as const),
          };
        }),
        minSelections: keywords.length,
        maxSelections: keywords.length,
        frameId: frame.frameId,
        ordered: true,
      });
      return true;
    }
    const picked = frame.answer.map(Number).filter((i) => Number.isInteger(i) && keywords[i] !== undefined);
    const order = [...new Set(picked)];
    keywords = [...order.map((i) => keywords[i]!), ...keywords.filter((_, i) => !order.includes(i))];
  }
  const inPlay = cardsInPlay(ctx.state);
  const after = held.after.filter(
    (f) => f.kind !== "event" || f.event.kind !== "cardEntersPlay" || inPlay.includes(f.event.instanceId),
  );
  const { heldLoopFrames: _held, ...rest } = frame;
  setFrame(ctx, { ...rest, answer: null });
  pushFrames(ctx, [...keywords, ...after]);
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

/** A keyword activation, or an "(attack)" ability's attack, waiting beneath the root frame `root`. */
const waitingActivation = (f: StackFrame | undefined, root: FrameId): boolean =>
  f?.kind === "event" &&
  ((f.awaitingAbility === true && f.stepsAfterAbility === root) || (f.attackWaiting === true && f.attackOf === root));

/** An announcement held beneath the root frame `root` after its keyword activations (`heldForAbility`). */
const heldFor = (f: StackFrame | undefined, root: FrameId): boolean => f?.kind === "event" && f.heldForAbility === root;

/**
 * A response frame not yet begun that answers the minion `enemy` entering play or engaging: what follows its keywords
 * (`keywordFramesFor`'s held responses, the announcement of its engagement).
 */
function answersAfterKeyword(f: StackFrame, enemy: InstanceId): boolean {
  if (f.kind !== "event" || f.stage !== "responses" || f.heldForAbility !== undefined) return false;
  const event = f.event;
  return (
    (event.kind === "minionEngaged" && event.minionInstanceId === enemy) ||
    (event.kind === "cardEntersPlay" && event.instanceId === enemy)
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
  // What answers after this keyword, waiting above the root: the minion's responses to entering play or engaging
  // (held from an "each time" loop, or the announcement of its engagement). The keyword counts as resolved only once its
  // activation has fully resolved (RRG 1.8 "Activation", p. 6), so they move beneath it, after every activation
  // waiting for this ability (`heldForAbility`).
  const enemy =
    frame.event.kind === "enemyAttack" || frame.event.kind === "enemyScheme" ? frame.event.enemyInstanceId : null;
  const between = stack.slice(at + 1, rootAt);
  const answering = between.filter((f): f is Frame<"event"> => enemy !== null && answersAfterKeyword(f, enemy));
  const rest = stack.filter((f) => f.frameId !== frame.frameId && !answering.includes(f as Frame<"event">));
  // After the activations, and an "(attack)" ability's attacks, already waiting for the same ability.
  let place = rest.findIndex((f) => f.frameId === root) + 1;
  while (place < rest.length && waitingActivation(rest[place], root!)) place++;
  const waiting: Frame<"event"> = { ...frame, awaitingAbility: true };
  const held = answering.map((f): Frame<"event"> => ({ ...f, heldForAbility: root! }));
  // The activation at `place`, then the announcements already held there, then these.
  const withActivation = [...rest.slice(0, place), waiting, ...rest.slice(place)];
  let heldAt = place + 1;
  while (heldAt < withActivation.length && heldFor(withActivation[heldAt], root!)) heldAt++;
  ctx.state = {
    ...ctx.state,
    stack: [...withActivation.slice(0, heldAt), ...held, ...withActivation.slice(heldAt)],
  };
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
