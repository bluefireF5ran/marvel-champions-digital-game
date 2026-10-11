/**
 * What the table may say of a double-sided card whose other face no player may look at (`CardInstance.reverseHidden`:
 * the Hypnotic Gaze of Trickster Takeover, whose Trance side stays unread until the card flips; docs/phase7-wave9.md
 * §3.54; MC55 p. 7).
 *
 * The protection is in layers, and this module is the question every view asks:
 *
 *  1. the engine session seals each snapshot (`sealForTable`), so a hidden card is named by its stand-in and the
 *     real card id never reaches the client (`engine/session-core.ts`; the store seals again, idempotently);
 *  2. a view that would draw or read a card's *other* face asks `otherFaceVisible` first (`faceOf`, the Inspect model,
 *     the log's flip line), because the stand-in is a real card whose `flipSide` is some other Trance, not the answer;
 *  3. Inspect says the reverse is hidden until it flips (`reverseHiddenNote`).
 */
import {
  otherFaceVisible,
  sealHiddenInformation,
  type GameState,
  type InstanceId,
  type SealedGameState,
} from "@mc/engine";

export { otherFaceVisible };

/** The line Inspect carries on a card whose reverse is still hidden. */
export const REVERSE_HIDDEN_NOTE = "Its other side is hidden until it flips.";

/** `REVERSE_HIDDEN_NOTE` for a card whose other face may not be looked at, else null. */
export const reverseHiddenNote = (state: GameState, id: InstanceId): string | null =>
  otherFaceVisible(state, id) ? null : REVERSE_HIDDEN_NOTE;

/**
 * The state as the client holds it, and the one place it is sealed: the engine's `sealHiddenInformation`. Everything
 * no player may read is taken out before the state leaves the engine session, and again as the store takes it in.
 *
 *  - A hidden reverse: each such card is named by its stand-in everywhere the state names it, the ability ids in its
 *    bookkeeping included (`GameState.stateChecks` is keyed "<instance>:<ability id>", and a printed ability's id is
 *    its card's own).
 *  - A hidden pile (the Agents of S.H.I.E.L.D. evidence envelopes, MC50 p. 5: "without looking at them"): the state
 *    has no `hiddenPiles` key, only each pile's size (`hiddenPileSizes`).
 *  - The sealed values of the campaign log the game was built from (`campaign.log.hidden`, the cards the envelope
 *    was filled with): each keeps its kind and its size and names nothing.
 *
 * The result is typed `SealedGameState`, which has no `hiddenPiles` key, so a screen cannot read a pile by mistake. It
 * is still a state the engine's queries, `preview()` and a speculative `applyCommand` accept as it is (the view models
 * run all three and throw the result away): a pile's size reads the same as in the engine session, and a preview that
 * would take a card out of a pile stops at hidden information. The authority (the engine session, its save and its
 * replay) keeps the full state; this one cannot be resumed or replayed from.
 *
 * Sealing a sealed state returns it as it is.
 */
export const sealForTable = (state: GameState): SealedGameState => sealHiddenInformation(state);
