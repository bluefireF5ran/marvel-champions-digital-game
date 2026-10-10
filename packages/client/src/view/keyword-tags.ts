/**
 * The keyword tags a character tile carries beyond what its scan prints.
 *
 * A tile is a few dozen characters wide, so the active tag is one row of whole words: when the full list does not
 * fit, it keeps the first tag and says how many more there are ("handspring +1"), and the full list is Inspect's. It
 * is never wrapped, so a word is never broken and the stat badges above keep their place. A keyword the card prints
 * but that does nothing right now (Guard on a held minion) is a separate, dimmed note that says "off" in words.
 */
import { cardStatColumn } from "./layout.js";

/** Roughly one uppercase 9 px caption character, letter spacing included (`foot-strip-layout`'s own estimate). */
const CHAR_WIDTH = 7.2;
/** Left bar, padding and a little slack, the same `12` `drawFootStrip` takes off a one-row strip's width. */
const STRIP_PADDING = 12;

/** How many caption characters a one-row strip `width` wide holds. */
export function tagCapacity(width: number): number {
  return Math.max(4, Math.floor((width - STRIP_PADDING) / CHAR_WIDTH));
}

/**
 * The tag for the keywords a card has right now and does not print, one row: "guard · handspring", or the first with
 * "+N" when the list does not fit `capacity` characters. Keywords in `inactive` are left out (`inactiveKeywordNote`
 * says them). Null when there is nothing to say.
 */
export function activeKeywordTag(
  granted: readonly string[],
  inactive: readonly string[],
  capacity: number,
): string | null {
  const tags = granted.filter((name) => !inactive.includes(name));
  if (tags.length === 0) return null;
  const joined = tags.join(" · ");
  return joined.length <= capacity || tags.length === 1 ? joined : `${tags[0]} +${tags.length - 1}`;
}

/** "guard off": what a held minion's printed Guard does right now, in words. Null when no keyword is off. */
export function inactiveKeywordNote(inactive: readonly string[]): string | null {
  return inactive.length === 0 ? null : `${inactive.join(" · ")} off`;
}

/** The smallest stat badge a tile may be squeezed to by an optional strip before the strip is left off. */
const STAT_BADGE_MIN = 18;

/**
 * Whether a tile with `reserved` pixels of strips already under its art can take one more `rowHeight` tall and still
 * keep its stat badges at a readable size (`cardStatColumn`). The tag is the least of the strips: the table needs the
 * numbers more, and the full keyword list is in Inspect.
 */
export function stripKeepsStats(
  innerHeight: number,
  innerWidth: number,
  reserved: number,
  rowHeight: number,
  statCount: number,
  withHp: boolean,
): boolean {
  if (statCount === 0) return true;
  const column = cardStatColumn(
    { x: 0, y: 0, width: innerWidth, height: innerHeight - reserved - rowHeight },
    statCount,
    withHp,
  );
  return (column.badges[0]?.size ?? 0) >= STAT_BADGE_MIN;
}
