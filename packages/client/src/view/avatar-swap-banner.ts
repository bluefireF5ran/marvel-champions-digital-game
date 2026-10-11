/**
 * The announcement for an Avatar of Loki being replaced (God of Lies, docs/phase7-wave9.md sections 3.59 and 3.60): the
 * Avatar shatters, its counters go to Loki's shared dial and another Avatar takes the villain slot. Without it the
 * villain panel changes name between two frames and the table has to work out why. It is the board's own full-table
 * banner (`MotionController.announce`, the one a hero going down uses), so it needs no animation of its own and respects
 * reduced motion the way that banner does. Names come from the command's own `villainReplaced` event, because the state
 * the board reads after the command already holds the new Avatar.
 */
import { getCard, type GameEvent, type GameState } from "@mc/engine";
import { cardName } from "./names.js";

export interface AvatarSwapAnnouncement {
  readonly title: string;
  readonly detail: string;
}

/** One announcement per Avatar swapped out by the events of a command, in order; none outside a game with a neutral villain. */
export function avatarSwapAnnouncements(
  events: readonly GameEvent[],
  state: GameState,
): readonly AvatarSwapAnnouncement[] {
  const neutral = state.pod?.neutral;
  if (!neutral) return [];
  const announcements: AvatarSwapAnnouncement[] = [];
  events.forEach((event, at) => {
    if (event.type !== "villainReplaced" || event.reason !== "swap") return;
    const from = getCard(state, event.fromCardId)?.name ?? "The Avatar";
    const to = getCard(state, event.toCardId)?.name ?? "another Avatar";
    // The damage the shatter put on Loki's dial, the nearest `sharedVillainDamaged` before the swap.
    let damage = 0;
    for (let i = at - 1; i >= 0 && damage === 0; i--) {
      const earlier = events[i]!;
      if (earlier.type === "sharedEventEmitted" && earlier.event.type === "sharedVillainDamaged") {
        damage = earlier.event.amount;
      }
    }
    announcements.push({
      title: `${from} shatters`,
      detail:
        damage > 0
          ? `${to} takes its place. ${cardName(state, neutral.villainInstanceId)} takes ${damage} damage`
          : `${to} takes its place`,
    });
  });
  return announcements;
}
