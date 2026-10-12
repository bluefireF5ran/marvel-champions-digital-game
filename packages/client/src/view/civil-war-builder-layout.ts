/**
 * Civil War scenario builder geometry (docs/phase7-wave10-client.md sections 2.2, 2.8 and 6.2). A pure function from
 * the viewport and the item counts of each section to rectangles. No Phaser, no state.
 *
 * Three arrangements, chosen by `formFactorFor`:
 *
 * - **phone** (`phone`, `phoneLandscape`): one step per screen. Header (Back, title), the active step's scroll region,
 *   a bottom step bar (five segments), and a sticky foot with Random / Random and blind above the full-width Start
 *   (one row of three when the viewport is wide enough, as in phone landscape).
 * - **tablet** (`tabletPortrait`, `tabletLandscape`): the step rail down the left, the active step beside it, the same
 *   sticky foot (one row) across the bottom.
 * - **desktop**: as tablet, plus a persistent review column on the right so every change is visible as it is made.
 *
 * Start is in the foot at every size and never scrolls. Everything that can be longer than its region (the active
 * step's content) is laid out in *content space*: rectangles are unscrolled positions that begin at `content.y` and
 * are clipped to `content` (a declared scroll region); `contentHeight` says how tall the stack is and `scrollable`
 * whether it exceeds the region. Fixed rectangles (header, rail, step bar, review column, foot) never scroll.
 *
 * `insets` are device safe areas (notch, home indicator); the header and foot grow by them and the side gutters grow
 * by the left/right insets.
 */
import { hit } from "../tokens.js";
import { formFactorFor, type FormFactor, type Rect } from "./layout.js";

export const HEADER_HEIGHT = 64;
export const BUILDER_STEP_COUNT = 5;
export const STEP_RAIL_WIDTH_TABLET = 200;
export const STEP_RAIL_WIDTH_DESKTOP = 220;
/** One entry in the left step rail (title plus the step's current pick as one line). */
export const STEP_RAIL_ITEM_HEIGHT = 64;
export const REVIEW_COLUMN_WIDTH = 300;
export const SECTION_LABEL_HEIGHT = 26;
export const SECTION_GAP = 16;
export const ROW_GAP = 8;
/** The large Side / Leader cards. */
export const CHOICE_CARD_HEIGHT = 160;
/** A stage card: small card face, name, target threat, one-line gist. */
export const STAGE_CARD_HEIGHT = 96;
export const MODULAR_TILE_HEIGHT = 64;
export const MODULAR_TILE_MIN_WIDTH = 150;
export const MODULAR_MAX_COLUMNS = 5;
/** The read-only body of the review step, above its option rows. */
export const REVIEW_BODY_HEIGHT = 240;
/** A difficulty card: its name and a two-line description. */
export const DIFFICULTY_HEIGHT = 76;
/** The "Preconstructed" reset button. */
export const PRECONSTRUCTED_HEIGHT = 44;
const FOOT_PAD = 8;
const TWO_ROW_FOOT_BELOW_WIDTH = 520;

export type BuilderStep = 1 | 2 | 3 | 4 | 5;
export type BuilderMode = "phone" | "tablet" | "desktop";

export interface BuilderInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface BuilderLayoutInput {
  readonly width: number;
  readonly height: number;
  /** The active step; defaults to 1. */
  readonly step?: BuilderStep;
  /** Tiles per modular section: the side's own sets, other products' sets, and the other side's sets. */
  readonly setCounts?: { readonly side: number; readonly other: number; readonly otherSide: number };
  /** The "other side's sets" section expanded (its tiles disabled but visible). Default false: one line. */
  readonly otherSideExpanded?: boolean;
  /** Tiles in the "Extra sets (not counted)" row under the grid. Default 0 (row absent). */
  readonly extraSets?: number;
  readonly insets?: Partial<BuilderInsets>;
}

export interface StageRowLayout {
  readonly label: Rect;
  /** Four cards: one row on tablet and desktop, 2 by 2 on phone. */
  readonly cards: readonly Rect[];
}

export interface ModularSectionLayout {
  readonly key: "side" | "other" | "otherSide" | "extra";
  readonly label: Rect;
  readonly tiles: readonly Rect[];
}

export interface BuilderLayout {
  readonly formFactor: FormFactor;
  readonly mode: BuilderMode;
  readonly step: BuilderStep;
  readonly headerBar: Rect;
  readonly back: Rect;
  readonly title: Rect;
  /** Tablet / desktop: the left step rail. Null on phone. */
  readonly rail: Rect | null;
  /** Phone: the bottom step bar. Null on tablet / desktop. */
  readonly stepBar: Rect | null;
  /** Five touch targets, one per step: rail items, or step bar segments. */
  readonly stepButtons: readonly Rect[];
  /** The active step's scroll region. */
  readonly content: Rect;
  /** Height of the active step's stacked content; the region scrolls when it exceeds `content.height`. */
  readonly contentHeight: number;
  readonly scrollable: boolean;
  /** Desktop only: the persistent review column. Null elsewhere. */
  readonly review: Rect | null;
  readonly foot: Rect;
  readonly random: Rect;
  readonly randomBlind: Rect;
  readonly start: Rect;

  /** Steps 1 and 2: two large cards (side by side, or stacked when the region is narrow). */
  readonly choiceCards: readonly Rect[];
  /** Step 3: two rows of four stage cards, and the summary sentence under them. */
  readonly stageRows: readonly StageRowLayout[];
  readonly stageSummary: Rect;
  /** Step 4: the counter line, the sections' labels and tiles, and the column count. */
  readonly modularCounter: Rect;
  readonly modularColumns: number;
  readonly modularSections: readonly ModularSectionLayout[];
  /** Step 5: the review body and the option rows (all content space). */
  readonly reviewBody: Rect;
  /**
   * True where step 5 repeats the summary (phone and tablet, which have no review column); false on desktop, whose
   * right-hand column is the always-visible summary, so `reviewBody` there is only the Preconstructed button's row.
   */
  readonly summaryInStep: boolean;
  /** The "Preconstructed" reset button (content space). */
  readonly preconstructed: Rect;
  readonly difficulty: readonly [Rect, Rect];
  /** Cooperative (enabled) and "Competitive - coming soon" (disabled; still a full touch target). */
  readonly gameMode: readonly [Rect, Rect];
}

/** Tiles in a grid of `columns`: the height of `count` tiles laid out row by row. Grows with the count. */
export function builderGridHeight(count: number, columns: number): number {
  if (count <= 0) return 0;
  const rows = Math.ceil(count / columns);
  return rows * MODULAR_TILE_HEIGHT + (rows - 1) * ROW_GAP;
}

/** How many tiles wide the modular grid is in a region `width` wide. Phone is always two. */
export function builderGridColumns(width: number, mode: BuilderMode): number {
  if (mode === "phone") return 2;
  const fit = Math.floor((width + ROW_GAP) / (MODULAR_TILE_MIN_WIDTH + ROW_GAP));
  return Math.max(2, Math.min(MODULAR_MAX_COLUMNS, fit));
}

/** Every fixed (non-scrolling) rectangle, for a no-overlap test. The foot's buttons sit inside `foot` by design. */
export function builderLayoutRects(layout: BuilderLayout): readonly Rect[] {
  return [
    layout.back,
    layout.title,
    ...(layout.rail ? [layout.rail] : []),
    ...(layout.stepBar ? [layout.stepBar] : []),
    layout.content,
    ...(layout.review ? [layout.review] : []),
    layout.foot,
  ];
}

const grid = (x: number, y: number, width: number, columns: number, count: number): Rect[] => {
  const tileW = (width - (columns - 1) * ROW_GAP) / columns;
  return Array.from({ length: count }, (_, i) => ({
    x: x + (i % columns) * (tileW + ROW_GAP),
    y: y + Math.floor(i / columns) * (MODULAR_TILE_HEIGHT + ROW_GAP),
    width: tileW,
    height: MODULAR_TILE_HEIGHT,
  }));
};

export function civilWarBuilderLayout(input: BuilderLayoutInput): BuilderLayout {
  const { width, height } = input;
  const step: BuilderStep = input.step ?? 1;
  const formFactor = formFactorFor(width, height);
  const mode: BuilderMode =
    formFactor === "phone" || formFactor === "phoneLandscape"
      ? "phone"
      : formFactor === "desktop"
        ? "desktop"
        : "tablet";
  const inset = { top: 0, right: 0, bottom: 0, left: 0, ...input.insets };
  const gutter = mode === "phone" ? 16 : 24;
  const gl = gutter + inset.left;
  const gr = gutter + inset.right;

  const headerHeight = HEADER_HEIGHT + inset.top;
  const headerBar: Rect = { x: 0, y: 0, width, height: headerHeight };
  const controlY = inset.top + (HEADER_HEIGHT - hit.target) / 2;
  const back: Rect = { x: 16 + inset.left, y: controlY, width: 90, height: hit.target };
  const title: Rect = {
    x: back.x + back.width + 8,
    y: controlY,
    width: Math.max(0, width - 16 - inset.right - (back.x + back.width + 8)),
    height: hit.target,
  };

  // Sticky foot: Random, Random and blind, Start. Two rows on a narrow phone, one row elsewhere.
  const twoRows = width < TWO_ROW_FOOT_BELOW_WIDTH;
  const footContent = twoRows ? hit.target + ROW_GAP + hit.primary : hit.primary;
  const footHeight = FOOT_PAD * 2 + footContent + inset.bottom;
  const foot: Rect = { x: 0, y: height - footHeight, width, height: footHeight };
  const footInner: Rect = { x: gl, y: foot.y + FOOT_PAD, width: width - gl - gr, height: footContent };
  let random: Rect;
  let randomBlind: Rect;
  let start: Rect;
  if (twoRows) {
    const half = (footInner.width - ROW_GAP) / 2;
    random = { x: footInner.x, y: footInner.y, width: half, height: hit.target };
    randomBlind = { x: footInner.x + half + ROW_GAP, y: footInner.y, width: half, height: hit.target };
    start = { x: footInner.x, y: footInner.y + hit.target + ROW_GAP, width: footInner.width, height: hit.primary };
  } else {
    const startW = Math.min(240, footInner.width * 0.4);
    const small = Math.min(200, (footInner.width - startW - ROW_GAP * 2) / 2);
    random = { x: footInner.x, y: footInner.y, width: small, height: hit.primary };
    randomBlind = { x: random.x + small + ROW_GAP, y: footInner.y, width: small, height: hit.primary };
    start = { x: footInner.x + footInner.width - startW, y: footInner.y, width: startW, height: hit.primary };
  }

  let rail: Rect | null = null;
  let stepBar: Rect | null = null;
  let review: Rect | null = null;
  let stepButtons: Rect[];
  let content: Rect;
  if (mode === "phone") {
    stepBar = { x: 0, y: foot.y - hit.target, width, height: hit.target };
    const seg = width / BUILDER_STEP_COUNT;
    stepButtons = Array.from({ length: BUILDER_STEP_COUNT }, (_, i) => ({
      x: i * seg,
      y: stepBar!.y,
      width: seg,
      height: hit.target,
    }));
    const top = headerHeight + ROW_GAP;
    content = { x: gl, y: top, width: width - gl - gr, height: Math.max(0, stepBar.y - ROW_GAP - top) };
  } else {
    const railWidth = mode === "desktop" ? STEP_RAIL_WIDTH_DESKTOP : STEP_RAIL_WIDTH_TABLET;
    const top = headerHeight + gutter;
    const bodyHeight = foot.y - gutter - top;
    rail = { x: gl, y: top, width: railWidth, height: bodyHeight };
    stepButtons = Array.from({ length: BUILDER_STEP_COUNT }, (_, i) => ({
      x: rail!.x,
      y: rail!.y + i * (STEP_RAIL_ITEM_HEIGHT + ROW_GAP),
      width: railWidth,
      height: STEP_RAIL_ITEM_HEIGHT,
    }));
    let right = width - gr;
    if (mode === "desktop") {
      review = { x: right - REVIEW_COLUMN_WIDTH, y: top, width: REVIEW_COLUMN_WIDTH, height: bodyHeight };
      right = review.x - gutter;
    }
    const left = rail.x + rail.width + gutter;
    content = { x: left, y: top, width: right - left, height: bodyHeight };
  }

  // Content space, from content.y. Rectangles below are unscrolled positions inside `content`'s width.
  const cx = content.x;
  const cw = content.width;
  const stacked = cw < 480;
  const choiceCards: Rect[] = stacked
    ? [0, 1].map((i) => ({
        x: cx,
        y: content.y + i * (CHOICE_CARD_HEIGHT + ROW_GAP),
        width: cw,
        height: CHOICE_CARD_HEIGHT,
      }))
    : [0, 1].map((i) => ({
        x: cx + i * ((cw - ROW_GAP) / 2 + ROW_GAP),
        y: content.y,
        width: (cw - ROW_GAP) / 2,
        height: CHOICE_CARD_HEIGHT,
      }));
  const choiceHeight = stacked ? CHOICE_CARD_HEIGHT * 2 + ROW_GAP : CHOICE_CARD_HEIGHT;

  // Step 3: two rows of four stage cards (one row on tablet / desktop, 2 by 2 on phone).
  const perLine = mode === "phone" ? 2 : 4;
  const cardW = (cw - (perLine - 1) * ROW_GAP) / perLine;
  let sy = content.y;
  const stageRows: StageRowLayout[] = [0, 1].map(() => {
    const label: Rect = { x: cx, y: sy, width: cw, height: SECTION_LABEL_HEIGHT };
    const cardsTop = sy + SECTION_LABEL_HEIGHT;
    const cards = Array.from({ length: 4 }, (_, i) => ({
      x: cx + (i % perLine) * (cardW + ROW_GAP),
      y: cardsTop + Math.floor(i / perLine) * (STAGE_CARD_HEIGHT + ROW_GAP),
      width: cardW,
      height: STAGE_CARD_HEIGHT,
    }));
    const lines = 4 / perLine;
    sy = cardsTop + lines * STAGE_CARD_HEIGHT + (lines - 1) * ROW_GAP + SECTION_GAP;
    return { label, cards };
  });
  const stageSummary: Rect = { x: cx, y: sy, width: cw, height: SECTION_LABEL_HEIGHT };
  const stagesHeight = stageSummary.y + stageSummary.height - content.y;

  // Step 4: counter line, then the sections.
  const columns = builderGridColumns(cw, mode);
  const counts = input.setCounts ?? { side: 8, other: 0, otherSide: 8 };
  const modularCounter: Rect = { x: cx, y: content.y, width: cw, height: SECTION_LABEL_HEIGHT };
  let my = modularCounter.y + modularCounter.height + ROW_GAP;
  const modularSections: ModularSectionLayout[] = [];
  const addSection = (key: ModularSectionLayout["key"], count: number, oneLine = false): void => {
    if (count <= 0) return;
    const label: Rect = { x: cx, y: my, width: cw, height: oneLine ? hit.target : SECTION_LABEL_HEIGHT };
    my += label.height;
    if (oneLine) {
      modularSections.push({ key, label, tiles: [] });
      my += SECTION_GAP;
      return;
    }
    my += ROW_GAP;
    const tiles = grid(cx, my, cw, columns, count);
    my += builderGridHeight(count, columns) + SECTION_GAP;
    modularSections.push({ key, label, tiles });
  };
  addSection("side", counts.side);
  addSection("other", counts.other);
  // Collapsed: one touch-target line, no tiles. Expanded: the tiles are laid out (the scene draws them disabled).
  addSection("otherSide", counts.otherSide, !input.otherSideExpanded);
  addSection("extra", input.extraSets ?? 0);
  const modularHeight = Math.max(0, my - SECTION_GAP - content.y);

  // Step 5: review body, then difficulty (Standard / Expert) and game mode (Cooperative / Competitive soon).
  const summaryInStep = mode !== "desktop";
  const reviewBody: Rect = {
    x: cx,
    y: content.y,
    width: cw,
    height: summaryInStep ? REVIEW_BODY_HEIGHT : PRECONSTRUCTED_HEIGHT,
  };
  const preconstructed: Rect = summaryInStep
    ? {
        x: reviewBody.x + 12,
        y: reviewBody.y + reviewBody.height - 52,
        width: Math.min(220, reviewBody.width - 24),
        height: PRECONSTRUCTED_HEIGHT,
      }
    : { x: cx, y: reviewBody.y, width: Math.min(220, cw), height: PRECONSTRUCTED_HEIGHT };
  const optionTop = reviewBody.y + reviewBody.height + SECTION_GAP;
  const half = (cw - ROW_GAP) / 2;
  const pair = (y: number, h: number): readonly [Rect, Rect] => [
    { x: cx, y, width: half, height: h },
    { x: cx + half + ROW_GAP, y, width: half, height: h },
  ];
  const difficulty = pair(optionTop, DIFFICULTY_HEIGHT);
  const gameMode = pair(optionTop + DIFFICULTY_HEIGHT + ROW_GAP, hit.target);
  const reviewStepHeight = gameMode[0].y + hit.target - content.y;

  const contentHeight =
    step === 1 || step === 2 ? choiceHeight : step === 3 ? stagesHeight : step === 4 ? modularHeight : reviewStepHeight;

  return {
    formFactor,
    mode,
    step,
    headerBar,
    back,
    title,
    rail,
    stepBar,
    stepButtons,
    content,
    contentHeight,
    scrollable: contentHeight > content.height,
    review,
    foot,
    random,
    randomBlind,
    start,
    choiceCards,
    stageRows,
    stageSummary,
    modularCounter,
    modularColumns: columns,
    modularSections,
    reviewBody,
    summaryInStep,
    preconstructed,
    difficulty,
    gameMode,
  };
}
