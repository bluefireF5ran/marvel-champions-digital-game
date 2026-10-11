/**
 * What the table may say of a double-sided card whose other face no player may look at (`CardInstance.reverseHidden`:
 * the Hypnotic Gaze of Trickster Takeover, whose Trance side stays unread until the card flips; docs/phase7-wave9.md
 * §3.54; MC55 p. 7).
 *
 * The protection is in layers, and this module is the question every view asks:
 *
 *  1. the engine session seals each snapshot (`sealHiddenReverses`), so a hidden card is named by its stand-in and the
 *     real card id never reaches the client (`engine/session-core.ts`; the store seals again, idempotently);
 *  2. a view that would draw or read a card's *other* face asks `otherFaceVisible` first (`faceOf`, the Inspect model,
 *     the log's flip line), because the stand-in is a real card whose `flipSide` is some other Trance, not the answer;
 *  3. Inspect says the reverse is hidden until it flips (`reverseHiddenNote`).
 */
import { otherFaceVisible, sealHiddenReverses, type GameState, type InstanceId } from "@mc/engine";

export { otherFaceVisible };

/** The line Inspect carries on a card whose reverse is still hidden. */
export const REVERSE_HIDDEN_NOTE = "Its other side is hidden until it flips.";

/** `REVERSE_HIDDEN_NOTE` for a card whose other face may not be looked at, else null. */
export const reverseHiddenNote = (state: GameState, id: InstanceId): string | null =>
  otherFaceVisible(state, id) ? null : REVERSE_HIDDEN_NOTE;

/**
 * The state as the client holds it: `sealHiddenReverses`, and without the state-check memo of each hidden card.
 * `GameState.stateChecks` is keyed "<instance>:<ability id>", and the ability id of a hidden Gaze is its real front's
 * ("i88:55008a.hypnotic-gaze-constant-2"), which names which Gaze it is. The client reads none of it.
 *
 * Engine ask: `sealHiddenReverses` should rewrite or drop those keys itself.
 */
export function sealForTable<S extends Pick<GameState, "instances" | "cardPool" | "stateChecks">>(state: S): S {
  const sealed = sealHiddenReverses(state);
  const hidden = new Set(
    Object.values(state.instances)
      .filter((instance) => instance.reverseHidden === true)
      .map((instance) => `${instance.instanceId}:`),
  );
  if (hidden.size === 0) return sealed;
  const stateChecks = Object.fromEntries(
    Object.entries(sealed.stateChecks).filter(([key]) => ![...hidden].some((prefix) => key.startsWith(prefix))),
  );
  return { ...sealed, stateChecks };
}
