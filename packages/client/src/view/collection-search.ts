/**
 * The "search your collection" sheet (`EffectSpec searchCollection`, RRG 1.8 "Search", p. 39; Reluctant Foe 50171).
 *
 * Every option is a card definition (`ChoiceRef cardDefinition`) the engine listed in title order, and an identity card
 * is offered by its hero side. A list of names cannot tell Black Panther (T'Challa) from Black Panther (Shuri) and
 * does not fit fifty-nine rows, so the sheet is pages of cards: the hero side's scan with its name under it, a tap
 * to pick, a press-and-hold to read it in Inspect. Which cards are legal is the engine's list; this only lays it out.
 */
import type { AnyCard } from "@mc/content";
import type { PendingChoice } from "@mc/engine";
import type { CardFace } from "../art/art-source.js";
import { heroFaceDisplayName } from "./hero-names.js";
import type { Rect } from "./layout.js";

export interface CollectionRow {
  readonly optionId: string;
  readonly cardId: string;
  /** What the tile is captioned with: an identity's hero name, qualified when two heroes share it. */
  readonly name: string;
  /** The face the scan and Inspect show: an identity's hero side, any other card's front. */
  readonly face: CardFace;
}

/** The sheet's rows, or null when `choice` is not a collection search of cards the pool can name. */
export function collectionRows(
  choice: PendingChoice,
  lookup: (cardId: string) => AnyCard | undefined,
): readonly CollectionRow[] | null {
  if (choice.prompt.kind !== "searchCollection" || choice.options.length === 0) return null;
  const rows: CollectionRow[] = [];
  for (const option of choice.options) {
    if (option.ref.kind !== "cardDefinition") return null;
    const card = lookup(option.ref.cardId);
    rows.push({
      optionId: option.optionId,
      cardId: option.ref.cardId,
      name: card?.type === "hero_identity" ? heroFaceDisplayName(card) : (card?.name ?? option.label),
      face: card?.type === "hero_identity" ? { kind: "hero" } : { kind: "front" },
    });
  }
  return rows;
}

/** The smallest a collection tile's scan is drawn: under this a card's title cannot be read, and the name caption is all there is. */
const MIN_TILE_WIDTH = 96;
const CARD_ASPECT = 2.5 / 3.5;
/** The name caption under each scan. */
export const COLLECTION_CAPTION = 26;

export interface CollectionGrid {
  readonly cols: number;
  readonly rows: number;
  readonly perPage: number;
  /** One tile, scan and caption together. */
  readonly tile: { readonly width: number; readonly height: number };
}

/**
 * The page grid for `area`: as many tiles as fit with scans no narrower than `MIN_TILE_WIDTH`, the bigger scans on a tie. An area too small for even one tile still gets a one-tile page, so the sheet is never empty.
 */
export function collectionGrid(area: Rect, gap = 6): CollectionGrid {
  let best: CollectionGrid | null = null;
  for (let cols = 1; cols <= 12; cols++) {
    for (let rows = 1; rows <= 6; rows++) {
      const width = Math.min(
        (area.width - gap * (cols - 1)) / cols,
        ((area.height - gap * (rows - 1)) / rows - COLLECTION_CAPTION) * CARD_ASPECT,
      );
      if (width < MIN_TILE_WIDTH) continue;
      const candidate: CollectionGrid = {
        cols,
        rows,
        perPage: cols * rows,
        tile: { width, height: width / CARD_ASPECT + COLLECTION_CAPTION },
      };
      // The page that holds the most (a collection is dozens of cards); among equals, the bigger scans.
      if (
        !best ||
        candidate.perPage > best.perPage ||
        (candidate.perPage === best.perPage && candidate.tile.width > best.tile.width)
      )
        best = candidate;
    }
  }
  if (best) return best;
  const width = Math.max(40, Math.min(area.width, (area.height - COLLECTION_CAPTION) * CARD_ASPECT));
  return { cols: 1, rows: 1, perPage: 1, tile: { width, height: width / CARD_ASPECT + COLLECTION_CAPTION } };
}

/** How many pages `count` rows take. */
export const collectionPages = (count: number, perPage: number): number => Math.max(1, Math.ceil(count / perPage));

/** The rows on `page` (0-based, clamped), and the page actually shown. */
export function collectionPage<T>(
  rows: readonly T[],
  page: number,
  perPage: number,
): { rows: readonly T[]; page: number } {
  const shown = Math.min(Math.max(0, page), collectionPages(rows.length, perPage) - 1);
  return { rows: rows.slice(shown * perPage, (shown + 1) * perPage), page: shown };
}

/** The tile slots of one page: `rows` left to right, top to bottom, the grid centered across `area` and just under its top. */
export function collectionSlots(area: Rect, grid: CollectionGrid, count: number, gap = 6): readonly Rect[] {
  const filledRows = Math.ceil(count / grid.cols);
  const gridHeight = filledRows * grid.tile.height + gap * (filledRows - 1);
  const top = area.y + Math.min(8, Math.max(0, (area.height - gridHeight) / 2));
  return Array.from({ length: count }, (_unused, index) => {
    const row = Math.floor(index / grid.cols);
    const inRow = Math.min(grid.cols, count - row * grid.cols);
    const rowWidth = inRow * grid.tile.width + gap * (inRow - 1);
    return {
      x: area.x + (area.width - rowWidth) / 2 + (index - row * grid.cols) * (grid.tile.width + gap),
      y: top + row * (grid.tile.height + gap),
      width: grid.tile.width,
      height: grid.tile.height,
    };
  });
}
