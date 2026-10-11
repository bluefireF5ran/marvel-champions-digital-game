import { describe, expect, it } from "vitest";
import {
  evidenceGridLayout,
  evidenceGridWantedHeight,
  MIN_CELL_HEIGHT,
  SIDE_BY_SIDE_WIDTH,
} from "./evidence-layout.js";

const inside = (inner: { x: number; y: number; width: number; height: number }, outer: typeof inner): boolean =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5;

describe("evidenceGridLayout", () => {
  it("puts three blocks side by side on a wide rect and stacks them on a narrow one", () => {
    const wide = evidenceGridLayout({ x: 0, y: 0, width: 900, height: 200 });
    expect(wide.stacked).toBe(false);
    expect(new Set(wide.blocks.map((block) => block.rect.y)).size).toBe(1);
    const narrow = evidenceGridLayout({ x: 0, y: 0, width: SIDE_BY_SIDE_WIDTH - 1, height: 480 });
    expect(narrow.stacked).toBe(true);
    expect(new Set(narrow.blocks.map((block) => block.rect.x)).size).toBe(1);
  });

  it("keeps every part inside its block and every cell at a readable size", () => {
    for (const rect of [
      { x: 10, y: 20, width: 900, height: 210 },
      { x: 0, y: 0, width: 360, height: 470 },
      { x: 0, y: 0, width: 700, height: 150 },
    ]) {
      const layout = evidenceGridLayout(rect);
      for (const block of layout.blocks) {
        expect(inside(block.rect, rect)).toBe(true);
        for (const part of [block.title, ...block.columnHeads, ...block.rowHeads, ...block.cells.flat()]) {
          expect(inside(part, block.rect)).toBe(true);
        }
        for (const cell of block.cells.flat()) {
          expect(cell.height).toBeGreaterThanOrEqual(MIN_CELL_HEIGHT);
          expect(cell.width).toBeGreaterThanOrEqual(40);
        }
      }
    }
  });

  it("wants less height side by side than stacked", () => {
    expect(evidenceGridWantedHeight(900)).toBeLessThan(evidenceGridWantedHeight(360));
  });
});
