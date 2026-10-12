import { describe, expect, test } from "vitest";
import { hit } from "../tokens.js";
import {
  builderGridColumns,
  builderGridHeight,
  builderLayoutRects,
  civilWarBuilderLayout,
  MODULAR_TILE_HEIGHT,
  type BuilderLayout,
  type BuilderStep,
} from "./civil-war-builder-layout.js";
import { rectsOverlap, type Rect } from "./layout.js";

const SIZES = [
  { name: "small phone", width: 360, height: 640 },
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 720 },
] as const;
const STEPS: readonly BuilderStep[] = [1, 2, 3, 4, 5];
const COUNTS = { side: 8, other: 5, otherSide: 8 };

const inside = (r: Rect, outer: Rect): boolean =>
  r.x >= outer.x - 0.01 &&
  r.y >= outer.y - 0.01 &&
  r.x + r.width <= outer.x + outer.width + 0.01 &&
  r.y + r.height <= outer.y + outer.height + 0.01;

/** Every content-space rect of the active step (unscrolled), for width checks and touch-target checks. */
function contentRects(l: BuilderLayout): Rect[] {
  switch (l.step) {
    case 1:
    case 2:
      return [...l.choiceCards];
    case 3:
      return [...l.stageRows.flatMap((r) => [r.label, ...r.cards]), l.stageSummary];
    case 4:
      return [l.modularCounter, ...l.modularSections.flatMap((s) => [s.label, ...s.tiles])];
    default:
      return [l.reviewBody, ...l.difficulty, ...l.gameMode, ...l.randomPins];
  }
}

describe("civilWarBuilderLayout: exact numbers", () => {
  test("phone 375x812: header, step bar, two-row foot, content region", () => {
    const l = civilWarBuilderLayout({ width: 375, height: 812, step: 3, setCounts: COUNTS });
    expect(l.mode).toBe("phone");
    expect(l.headerBar).toEqual({ x: 0, y: 0, width: 375, height: 64 });
    expect(l.back).toEqual({ x: 16, y: 10, width: 90, height: 44 });
    expect(l.foot).toEqual({ x: 0, y: 692, width: 375, height: 120 });
    expect(l.stepBar).toEqual({ x: 0, y: 648, width: 375, height: 44 });
    expect(l.rail).toBeNull();
    expect(l.review).toBeNull();
    expect(l.stepButtons[1]).toEqual({ x: 75, y: 648, width: 75, height: 44 });
    expect(l.content).toEqual({ x: 16, y: 72, width: 343, height: 568 });
    expect(l.random).toEqual({ x: 16, y: 700, width: 167.5, height: 44 });
    expect(l.randomBlind).toEqual({ x: 191.5, y: 700, width: 167.5, height: 44 });
    expect(l.start).toEqual({ x: 16, y: 752, width: 343, height: 52 });
  });

  test("phone: stage cards stack 2 by 2", () => {
    const l = civilWarBuilderLayout({ width: 375, height: 812, step: 3 });
    const [row1, row2] = l.stageRows;
    expect(row1!.cards.map((c) => [c.x, c.y])).toEqual([
      [16, 98],
      [191.5, 98],
      [16, 202],
      [191.5, 202],
    ]);
    expect(row1!.cards[0]!.width).toBe(167.5);
    expect(row2!.label.y).toBe(314);
    expect(l.stageSummary.y).toBe(556);
    expect(l.contentHeight).toBe(510);
    expect(l.scrollable).toBe(false);
  });

  test("tablet 768x1024: rail left, content right, stage rows of four, grid three tiles wide", () => {
    const l = civilWarBuilderLayout({ width: 768, height: 1024, step: 3, setCounts: COUNTS });
    expect(l.mode).toBe("tablet");
    expect(l.rail).toEqual({ x: 24, y: 88, width: 200, height: 844 });
    expect(l.stepBar).toBeNull();
    expect(l.review).toBeNull();
    expect(l.stepButtons[4]).toEqual({ x: 24, y: 376, width: 200, height: 64 });
    expect(l.content).toEqual({ x: 248, y: 88, width: 496, height: 844 });
    expect(l.foot).toEqual({ x: 0, y: 956, width: 768, height: 68 });
    expect(l.start).toEqual({ x: 504, y: 964, width: 240, height: 52 });
    expect(l.stageRows[0]!.cards.map((c) => c.y)).toEqual([114, 114, 114, 114]);
    expect(l.stageRows[0]!.cards[0]!.width).toBe(118);
    expect(l.modularColumns).toBe(3);
  });

  test("desktop 1280x720: rail, content, persistent review column, grid four tiles wide", () => {
    const l = civilWarBuilderLayout({ width: 1280, height: 720, step: 4, setCounts: COUNTS });
    expect(l.mode).toBe("desktop");
    expect(l.rail).toEqual({ x: 24, y: 88, width: 220, height: 540 });
    expect(l.review).toEqual({ x: 956, y: 88, width: 300, height: 540 });
    expect(l.content).toEqual({ x: 268, y: 88, width: 664, height: 540 });
    expect(l.foot).toEqual({ x: 0, y: 652, width: 1280, height: 68 });
    expect(l.modularColumns).toBe(4);
    expect(l.modularSections[0]!.tiles).toHaveLength(8);
    expect(l.modularSections[0]!.tiles[4]!.x).toBe(268);
  });

  test("grid width: 2 on phone, 3 on tablet, 4 on desktop, never more than 5", () => {
    expect(builderGridColumns(343, "phone")).toBe(2);
    expect(builderGridColumns(496, "tablet")).toBe(3);
    expect(builderGridColumns(664, "desktop")).toBe(4);
    expect(builderGridColumns(1600, "desktop")).toBe(5);
  });
});

describe("civilWarBuilderLayout: step 5 never repeats the review column's summary", () => {
  test("desktop: the summary lives in the column; step 5 holds only Preconstructed, difficulty and game mode", () => {
    const l = civilWarBuilderLayout({ width: 1280, height: 720, step: 5 });
    expect(l.summaryInStep).toBe(false);
    expect(l.review).not.toBeNull();
    expect(l.reviewBody).toEqual({ x: 268, y: 88, width: 664, height: 44 });
    expect(l.preconstructed).toEqual({ x: 268, y: 88, width: 220, height: 44 });
    expect(l.difficulty[0]).toEqual({ x: 268, y: 148, width: 328, height: 76 });
    expect(l.difficulty[1]).toEqual({ x: 604, y: 148, width: 328, height: 76 });
    expect(l.gameMode[0]).toEqual({ x: 268, y: 232, width: 328, height: 44 });
    expect(l.randomPins[0]).toEqual({ x: 268, y: 232 + 44 + 8, width: (328 * 2 + 8 - 16) / 3, height: 44 });
    expect(l.contentHeight).toBe(240);
  });

  test("phone and tablet: no side panel, so step 5 keeps the summary above the same controls", () => {
    for (const size of [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
    ]) {
      const l = civilWarBuilderLayout({ ...size, step: 5 });
      expect(l.review).toBeNull();
      expect(l.summaryInStep).toBe(true);
      expect(l.reviewBody.height).toBe(240);
      expect(l.preconstructed.y).toBe(l.reviewBody.y + 240 - 52);
      expect(l.difficulty[0].y).toBe(l.reviewBody.y + 240 + 16);
      expect(l.difficulty[0].height).toBe(76);
    }
  });
});

describe("civilWarBuilderLayout: every size and step", () => {
  for (const size of SIZES) {
    for (const step of STEPS) {
      const l = civilWarBuilderLayout({ ...size, step, setCounts: COUNTS, otherSideExpanded: true });
      const viewport: Rect = { x: 0, y: 0, width: size.width, height: size.height };

      test(`${size.name} step ${step}: fixed regions do not overlap`, () => {
        const rects = builderLayoutRects(l);
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) expect(rectsOverlap(rects[i]!, rects[j]!)).toBe(false);
        }
        expect(l.stepButtons).toHaveLength(5);
        for (let i = 0; i < 5; i++) {
          for (let j = i + 1; j < 5; j++) expect(rectsOverlap(l.stepButtons[i]!, l.stepButtons[j]!)).toBe(false);
        }
      });

      test(`${size.name} step ${step}: fixed regions inside the viewport, content inside the scroll region's width`, () => {
        for (const r of [...builderLayoutRects(l), ...l.stepButtons, l.random, l.randomBlind, l.start]) {
          expect(inside(r, viewport)).toBe(true);
        }
        for (const r of contentRects(l)) {
          expect(r.x).toBeGreaterThanOrEqual(l.content.x - 0.01);
          expect(r.x + r.width).toBeLessThanOrEqual(l.content.x + l.content.width + 0.01);
          expect(r.y).toBeGreaterThanOrEqual(l.content.y);
        }
        expect(l.scrollable).toBe(l.contentHeight > l.content.height);
      });

      test(`${size.name} step ${step}: touch targets are at least ${hit.target}px and Start is always visible`, () => {
        const targets = [l.back, ...l.stepButtons, l.random, l.randomBlind, l.start, ...l.difficulty, ...l.gameMode];
        for (const r of targets) {
          expect(r.height).toBeGreaterThanOrEqual(hit.target);
          expect(r.width).toBeGreaterThanOrEqual(hit.target);
        }
        for (const r of [...l.choiceCards, ...l.stageRows.flatMap((x) => x.cards)]) {
          expect(r.height).toBeGreaterThanOrEqual(hit.target);
          expect(r.width).toBeGreaterThanOrEqual(hit.target);
        }
        for (const t of l.modularSections.flatMap((s) => s.tiles)) {
          expect(t.height).toBeGreaterThanOrEqual(hit.target);
          expect(t.width).toBeGreaterThanOrEqual(hit.target);
        }
        expect(l.start.height).toBeGreaterThanOrEqual(hit.primary);
        expect(inside(l.start, l.foot)).toBe(true);
        expect(inside(l.start, viewport)).toBe(true);
        for (const other of [l.random, l.randomBlind]) expect(rectsOverlap(l.start, other)).toBe(false);
        expect(rectsOverlap(l.random, l.randomBlind)).toBe(false);
        expect(l.start.y + l.start.height).toBe(size.height - 8);
      });
    }
  }
});

describe("civilWarBuilderLayout: scrolling and sections", () => {
  test("the grid height grows with the set count and the step scrolls when it no longer fits", () => {
    expect(builderGridHeight(0, 2)).toBe(0);
    expect(builderGridHeight(2, 2)).toBe(MODULAR_TILE_HEIGHT);
    expect(builderGridHeight(3, 2)).toBe(MODULAR_TILE_HEIGHT * 2 + 8);
    expect(builderGridHeight(8, 2)).toBeGreaterThan(builderGridHeight(4, 2));

    const few = civilWarBuilderLayout({
      width: 360,
      height: 640,
      step: 4,
      setCounts: { side: 2, other: 0, otherSide: 0 },
    });
    const many = civilWarBuilderLayout({
      width: 360,
      height: 640,
      step: 4,
      setCounts: { side: 8, other: 12, otherSide: 8 },
      otherSideExpanded: true,
    });
    expect(few.scrollable).toBe(false);
    expect(many.contentHeight).toBeGreaterThan(few.contentHeight);
    expect(many.scrollable).toBe(true);
    expect(many.content.height).toBe(few.content.height);
  });

  test("the other side's sets are one touch-target line until expanded", () => {
    const shut = civilWarBuilderLayout({ width: 768, height: 1024, step: 4, setCounts: COUNTS });
    const open = civilWarBuilderLayout({
      width: 768,
      height: 1024,
      step: 4,
      setCounts: COUNTS,
      otherSideExpanded: true,
    });
    const shutRow = shut.modularSections.find((s) => s.key === "otherSide")!;
    expect(shutRow.tiles).toHaveLength(0);
    expect(shutRow.label.height).toBeGreaterThanOrEqual(hit.target);
    expect(open.modularSections.find((s) => s.key === "otherSide")!.tiles).toHaveLength(8);
    expect(open.contentHeight).toBeGreaterThan(shut.contentHeight);
  });

  test("sections come in order and never overlap inside the content space", () => {
    const l = civilWarBuilderLayout({
      width: 1280,
      height: 720,
      step: 4,
      setCounts: COUNTS,
      otherSideExpanded: true,
      extraSets: 1,
    });
    expect(l.modularSections.map((s) => s.key)).toEqual(["side", "other", "otherSide", "extra"]);
    const rects = [l.modularCounter, ...l.modularSections.flatMap((s) => [s.label, ...s.tiles])];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) expect(rectsOverlap(rects[i]!, rects[j]!)).toBe(false);
    }
  });

  test("safe-area insets push the header and foot out and keep Start clear of the home indicator", () => {
    const l = civilWarBuilderLayout({
      width: 375,
      height: 812,
      step: 1,
      insets: { top: 47, bottom: 34, left: 0, right: 0 },
    });
    expect(l.headerBar.height).toBe(111);
    expect(l.back.y).toBeGreaterThanOrEqual(47);
    expect(l.start.y + l.start.height).toBe(812 - 34 - 8);
    expect(l.content.y).toBeGreaterThanOrEqual(111);
  });
});
