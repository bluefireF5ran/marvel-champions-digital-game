/**
 * Undo (the action bar's own button): takes back the active hero's last move this turn — a card played, an ability
 * used, a basic power, a change of form — with every choice that move's own resolution asked of them, so a fat
 * finger or a move made in the wrong order can be put right.
 *
 * RRG 1.8 has no such rule; this is a digital convenience, offered only where taking a move back changes nothing
 * the player didn't already know. It reuses Back out's rewind (`view/back-out.ts`, `SessionStore.rewindTo`) and its
 * test for hidden information, and draws three hard lines on top of it:
 *
 * - **Only the hero's own moves.** Every command in the move must be the active player's own; another seat's Action
 *   or answer in between stops the undo there.
 * - **Only this turn.** Ending the turn ends undo for that hero: a move whose events start or end a turn, change the
 *   game step or start a round can't be taken back, so neither can anything before it.
 * - **Only the hand the player is holding.** A move that drew, revealed, looked at, dealt or shuffled anything (a
 *   redrawn hand such as Deadpool's, a search, a card off the top of a deck) can't be taken back, and so neither can
 *   anything before it: the player keeps what they learned, so they can't undo to fish for a better draw.
 */
import type { Command, GameEvent, GameState, PlayerId } from "@mc/engine";
import { revealsHiddenInformation, type BackOutTrailEntry } from "./back-out.js";

/** The commands that start a move of the hero's own; `resolveChoice`s after one belong to it. */
const MOVE_COMMAND_TYPES: ReadonlySet<Command["type"]> = new Set([
  "playCard",
  "useAbility",
  "basicAttack",
  "basicThwart",
  "basicRecover",
  "changeForm",
]);

/** Events that mark a turn, step or round boundary: a move that carries one belongs to no single turn. */
const BOUNDARY_EVENT_TYPES: ReadonlySet<GameEvent["type"]> = new Set([
  "turnStarted",
  "turnEnded",
  "stepChanged",
  "roundStarted",
]);

export type UndoOffer =
  /** `target` is the command count to rewind to (`SessionStore.rewindTo`), `command` the move it takes back. */
  | { readonly kind: "available"; readonly target: number; readonly command: Command }
  | { readonly kind: "unavailable"; readonly reason: string };

/** Says why nothing earlier can be undone, the reason the disabled Undo button shows. */
export const UNDO_REASONS = {
  nothing: "Nothing to undo this turn",
  revealed: "Can't undo: new cards were drawn or seen",
  otherPlayer: "Can't undo another player's move",
  boundary: "Can't undo past the start of the turn",
} as const;

/**
 * Whether Undo applies right now for `perspectiveId`, and what it would rewind to. Null when the button has no
 * business being offered at all: it isn't that player's turn, a choice is open (the choice sheet's own Back out
 * covers that), or the game is over.
 */
export function undoOf(
  trail: readonly BackOutTrailEntry[],
  game: Pick<GameState, "outcome" | "pendingChoice" | "step">,
  perspectiveId: PlayerId,
): UndoOffer | null {
  if (game.outcome || game.pendingChoice) return null;
  const { step } = game;
  if (step.phase !== "player" || step.kind !== "turn" || step.ended || step.activePlayerId !== perspectiveId) {
    return null;
  }
  let cursor = trail.length;
  if (cursor === 0) return { kind: "unavailable", reason: UNDO_REASONS.nothing };
  // The move's own answers, back to the command that started it.
  while (cursor > 0 && trail[cursor - 1]!.command.type === "resolveChoice") cursor -= 1;
  const start = cursor - 1;
  const opening = trail[start];
  if (!opening || !MOVE_COMMAND_TYPES.has(opening.command.type)) {
    // The trail reaches back to whatever began this turn (the last turn's End turn, the villain phase), or to a
    // resume with nothing played since.
    return { kind: "unavailable", reason: UNDO_REASONS.nothing };
  }
  const move = trail.slice(start);
  if (move.some((entry) => entry.playerId !== perspectiveId)) {
    return { kind: "unavailable", reason: UNDO_REASONS.otherPlayer };
  }
  if (move.some((entry) => entry.events.some((event) => BOUNDARY_EVENT_TYPES.has(event.type)))) {
    return { kind: "unavailable", reason: UNDO_REASONS.boundary };
  }
  if (move.some((entry) => entry.events.some(revealsHiddenInformation))) {
    return { kind: "unavailable", reason: UNDO_REASONS.revealed };
  }
  return { kind: "available", target: start, command: opening.command };
}
