import type { Rect } from "./layout.js";

/** The strip that says "UNDER n", the same height as a foot strip's one row. */
export const TUCKED_HEADER_HEIGHT = 16;
const TUCKED_GAP = 3;
const TUCKED_ROW_MAX_HEIGHT = 50;
const TUCKED_ROW_MIN_HEIGHT = 24;

export interface TuckedRowLayout {
  /** The "UNDER n" strip along the top of `room`. */
  readonly header: Rect;
  /** One small card per tucked card, left to right, in tuck order. */
  readonly cards: readonly Rect[];
  /** `header` plus the row: what the layout took of `room`. */
  readonly height: number;
}

/**
 * The cards tucked under a wide character panel (an identity: Silk's up to four), as a header over a row of small cards
 * that all fit in `room`'s width: the row's cards shrink together rather than overlap or drop one. Null when `room` is
 * too short to hold a readable row, and the panel falls back to the header's count alone.
 * `cardAspect` is a card's width over its height.
 */
export function tuckedRowLayout(room: Rect, count: number, cardAspect: number): TuckedRowLayout | null {
  if (count <= 0) return null;
  let height = Math.min(TUCKED_ROW_MAX_HEIGHT, Math.floor(room.height - TUCKED_HEADER_HEIGHT - TUCKED_GAP));
  if (height < TUCKED_ROW_MIN_HEIGHT) return null;
  let width = Math.round(height * cardAspect);
  const rowWidth = width * count + TUCKED_GAP * (count - 1);
  if (rowWidth > room.width) {
    width = Math.floor((room.width - TUCKED_GAP * (count - 1)) / count);
    height = Math.round(width / cardAspect);
    if (height < TUCKED_ROW_MIN_HEIGHT) return null;
  }
  const top = room.y + TUCKED_HEADER_HEIGHT + TUCKED_GAP;
  return {
    header: { x: room.x, y: room.y, width: room.width, height: TUCKED_HEADER_HEIGHT },
    cards: Array.from({ length: count }, (_unused, index) => ({
      x: room.x + index * (width + TUCKED_GAP),
      y: top,
      width,
      height,
    })),
    height: TUCKED_HEADER_HEIGHT + TUCKED_GAP + height,
  };
}
