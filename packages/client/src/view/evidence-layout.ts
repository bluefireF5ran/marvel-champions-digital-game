/**
 * Where the evidence grid's parts go inside a rect (`ui/evidence-grid.ts` draws them). Three means blocks, each a 3 by 3
 * of motive rows and opportunity columns: side by side when the rect is wide, stacked when it is narrow (a phone held
 * upright). Pure geometry, so the sizes a cell must keep (a readable code, a 44px-ish tap on a roomy screen) are tested.
 */

import type { Rect } from "./layout.js";

export interface EvidenceBlockLayout {
  readonly rect: Rect;
  /** The means card's name strip across the top. */
  readonly title: Rect;
  /** One per opportunity column, above the cells. */
  readonly columnHeads: readonly Rect[];
  /** One per motive row, left of the cells. */
  readonly rowHeads: readonly Rect[];
  /** `cells[motive][opportunity]`. */
  readonly cells: readonly (readonly Rect[])[];
}

export interface EvidenceGridLayout {
  readonly stacked: boolean;
  readonly blocks: readonly EvidenceBlockLayout[];
}

const GAP = 8;
const TITLE_HEIGHT = 24;
const HEAD_HEIGHT = 30;
/** Cells never shrink below this: under it the code and the cross-out mark stop reading. */
export const MIN_CELL_HEIGHT = 24;
const MAX_CELL_HEIGHT = 46;
/** Wide enough for three blocks side by side. */
export const SIDE_BY_SIDE_WIDTH = 600;

export function evidenceGridLayout(rect: Rect, blockCount = 3): EvidenceGridLayout {
  const stacked = rect.width < SIDE_BY_SIDE_WIDTH;
  const blocks: EvidenceBlockLayout[] = [];
  const blockWidth = stacked ? rect.width : (rect.width - GAP * (blockCount - 1)) / blockCount;
  const blockHeight = stacked ? (rect.height - GAP * (blockCount - 1)) / blockCount : rect.height;
  for (let index = 0; index < blockCount; index++) {
    const block: Rect = {
      x: stacked ? rect.x : rect.x + index * (blockWidth + GAP),
      y: stacked ? rect.y + index * (blockHeight + GAP) : rect.y,
      width: blockWidth,
      height: blockHeight,
    };
    const rowHeadWidth = Math.round(Math.min(112, Math.max(70, block.width * 0.32)));
    const cellWidth = (block.width - rowHeadWidth) / 3;
    const gridTop = block.y + TITLE_HEIGHT + HEAD_HEIGHT;
    const cellHeight = Math.min(MAX_CELL_HEIGHT, Math.max(MIN_CELL_HEIGHT, (block.y + block.height - gridTop) / 3));
    blocks.push({
      rect: block,
      title: { x: block.x, y: block.y, width: block.width, height: TITLE_HEIGHT },
      columnHeads: [0, 1, 2].map((column) => ({
        x: block.x + rowHeadWidth + column * cellWidth,
        y: block.y + TITLE_HEIGHT,
        width: cellWidth,
        height: HEAD_HEIGHT,
      })),
      rowHeads: [0, 1, 2].map((row) => ({
        x: block.x,
        y: gridTop + row * cellHeight,
        width: rowHeadWidth,
        height: cellHeight,
      })),
      cells: [0, 1, 2].map((row) =>
        [0, 1, 2].map((column) => ({
          x: block.x + rowHeadWidth + column * cellWidth,
          y: gridTop + row * cellHeight,
          width: cellWidth,
          height: cellHeight,
        })),
      ),
    });
  }
  return { stacked, blocks };
}

/** The height the grid wants when it has room to breathe, so a sheet can size itself around it. */
export function evidenceGridWantedHeight(width: number): number {
  return width < SIDE_BY_SIDE_WIDTH
    ? 3 * (TITLE_HEIGHT + HEAD_HEIGHT + 3 * 34) + 2 * GAP
    : TITLE_HEIGHT + HEAD_HEIGHT + 3 * MAX_CELL_HEIGHT;
}
