/**
 * What waits for the end of a sentence: the response windows raised while an `EffectSpec sentence` resolves.
 *
 * FFG ruling December 8, 2023 - Ruling 126 (post-RRG 1.5), Gamma Blast: "You must resolve the first sentence of Gamma
 * Blast in full before resolving the Response on Gamma form." Ruling 137 (January 11, 2024): "In most cases, yes, a
 * sentence in an ability must fully resolve before responses to that sentence can occur." RRG 1.8 p. 4 ("resolve the
 * ability one sentence at a time") and "'And'" (p. 7, effects joined by "and" resolve simultaneously); the RRG's
 * "Response" (p. 37) and "Triggering Condition" (p. 45) entries do not say when within an ability the window opens.
 *
 * How. `pushWindow` hands a response window to the innermost `sentence` frame on the stack (`holdingSentence`) while
 * that frame still has an effect after the one resolving (`cursor < effects.length`); the window's conditions are
 * appended to `Frame<"effects">.heldSentenceResponses`, and the frame opens them, one window per occurrence in the
 * order they were raised, as it finishes (`releaseSentenceResponses`). Interrupts never wait.
 *
 * Engine reading: the responses to the sentence's last effect are not held. They open as that effect resolves, as
 * before, so the end of an attack keeps its RRG 1.8 p. 5 order (delayed effects, retaliate, responses, consequential
 * damage); the sentence has nothing left to resolve after it, and the held windows open right after. A reveal in
 * progress holds every response window until its end (`reveal-hold.ts`), which `pushWindow` checks first.
 */

import { type Ctx, updateFrame } from "../ctx.js";
import type { TriggerEvent } from "../trigger-events.js";
import type { Frame } from "./frames.js";
import { holdResponsesForReveal } from "./reveal-hold.js";
import { pushWindow } from "./window.js";

/** The innermost sentence frame on the stack, while it is resolving an effect before its last. */
function holdingSentence(ctx: Ctx): Frame<"effects"> | undefined {
  const stack = ctx.state.stack;
  const at = stack.findIndex((f) => f.kind === "effects" && f.sentence === true);
  if (at < 0) return undefined;
  const sentence = stack[at] as Frame<"effects">;
  return sentence.cursor < sentence.effects.length ? sentence : undefined;
}

/**
 * Hands the response window of `events` (the conditions of one occurrence, the window's own event last) to the
 * sentence resolving. False, with nothing done, when no sentence holds it.
 */
export function holdResponsesForSentence(ctx: Ctx, events: readonly TriggerEvent[]): boolean {
  const sentence = holdingSentence(ctx);
  if (!sentence || events.length === 0) return false;
  updateFrame(ctx, sentence.frameId, (f) =>
    f.kind === "effects" ? { ...f, heldSentenceResponses: [...(f.heldSentenceResponses ?? []), events] } : f,
  );
  return true;
}

/** The sentence `frame` has resolved (popped already): the response windows it held open now, oldest first. */
export function releaseSentenceResponses(ctx: Ctx, frame: Frame<"effects">): void {
  const held = frame.heldSentenceResponses ?? [];
  if (held.length === 0) return;
  // An enclosing sentence, or a reveal, still resolving takes them in turn, in the order they were raised.
  const open = held.filter((events) => !holdResponsesForSentence(ctx, events) && !holdResponsesForReveal(ctx, events));
  // Pushed newest first, so the oldest window is on top and resolves first.
  for (const events of [...open].reverse()) {
    const event = events[events.length - 1];
    if (event) pushWindow(ctx, event, "response", null, events.slice(0, -1));
  }
}
