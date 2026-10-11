/**
 * Where the mission area sits on the board, and how its cards share it (docs/phase7-wave8.md §3.33, MC45 p. 5).
 *
 * The area is a foot strip of the enemies zone: the table keeps its zones, and a game with no scenario play area
 * lays out exactly as before (`splitMissionArea` returns the zone whole). It is taken from the zone's bottom, as the
 * set-aside footer is taken from the log's (`view/encounter-pile-layout.ts`), and it never takes so much that the
 * villain band and a minion row lose their floor (`view/enemies-band.ts`): a short zone gives the area its own
 * minimum and the enemies what is left, drawn smaller. Pure geometry; what is in the area is the board model's.
 */

import { CARD_ASPECT, type Rect } from "./layout.js";

/** The area's share of the enemies zone, its floor (a card still readable) and its ceiling. */
const AREA_SHARE = 0.46;
const AREA_MIN_HEIGHT = 150;
const AREA_MAX_HEIGHT = 230;
/** The zone's gap between the enemies and the area. */
const AREA_GAP = 8;
/** A scheme's panel is wider than a card: art column, name and the threat meter beside it. */
const SCHEME_ASPECT = 2.1;
const SLOT_GAP = 8;

export interface MissionSplit {
  /** The enemies zone without the area's strip. */
  readonly enemies: Rect;
  /** The strip for the area, or null when there is no area to draw. */
  readonly area: Rect | null;
}

/** The enemies zone cut into the enemies and the mission area under them. With no area, the zone is returned whole. */
export function splitMissionArea(enemies: Rect, hasArea: boolean): MissionSplit {
  if (!hasArea) return { enemies, area: null };
  const height = Math.round(Math.min(AREA_MAX_HEIGHT, Math.max(AREA_MIN_HEIGHT, enemies.height * AREA_SHARE)));
  // Never the whole zone: the enemies keep at least a card's worth, and the area gives way past that.
  // A zone too short for both gives the area what is left past the gap, and the enemies zero, never a negative height.
  const taken = Math.min(height, Math.max(80, enemies.height - 120), Math.max(0, enemies.height - AREA_GAP));
  return {
    enemies: { ...enemies, height: Math.max(0, enemies.height - taken - AREA_GAP) },
    area: { x: enemies.x, y: enemies.y + enemies.height - taken, width: enemies.width, height: taken },
  };
}

export type MissionSlotKind = "scheme" | "card";

/** One rect per card of the area, in order, left to right: schemes wider than cards, all one height that fits `inner`. */
export function missionSlots(inner: Rect, kinds: readonly MissionSlotKind[]): readonly Rect[] {
  if (kinds.length === 0) return [];
  const units = kinds.reduce((sum, kind) => sum + (kind === "scheme" ? SCHEME_ASPECT : CARD_ASPECT), 0);
  const room = inner.width - SLOT_GAP * (kinds.length - 1);
  const height = Math.max(0, Math.min(inner.height, room / units));
  let x = inner.x;
  return kinds.map((kind): Rect => {
    const width = height * (kind === "scheme" ? SCHEME_ASPECT : CARD_ASPECT);
    const slot = { x, y: inner.y, width, height };
    x += width + SLOT_GAP;
    return slot;
  });
}

/** A neutral card's panel is wide: the longest it is drawn, as a multiple of its height. */
const NEUTRAL_ASPECT = 3.4;
/** The room under a neutral card for its one-line note, and the height and width of a rules card's tile. */
export const NEUTRAL_NOTE_HEIGHT = 22;
const REFERENCE_HEIGHT = 40;
const REFERENCE_WIDTH = 160;

export interface NeutralLayout {
  /** One wide rect per neutral card, in order, each with `NEUTRAL_NOTE_HEIGHT` of free room under it for its note. */
  readonly slots: readonly Rect[];
  /** One tile per rules card (`Scenario.referenceCards`), each a tap target for its Inspect sheet. */
  readonly refs: readonly Rect[];
}

/**
 * The neutral area on a wide table (`ScenarioPlayAreaPanel.neutral`): the cards side by side from the left, each as wide
 * as its share allows (never past `NEUTRAL_ASPECT` times its height), and the rules cards stacked in a column at the
 * right, which is where the strip's spare width is.
 */
export function neutralRow(inner: Rect, count: number, refCount: number): NeutralLayout {
  if (count <= 0) return { slots: [], refs: [] };
  const refColumn = refCount > 0 ? REFERENCE_WIDTH + SLOT_GAP : 0;
  const height = Math.max(0, inner.height - NEUTRAL_NOTE_HEIGHT);
  const share = (inner.width - refColumn - SLOT_GAP * (count - 1)) / count;
  const width = Math.max(0, Math.min(share, height * NEUTRAL_ASPECT));
  const slots = Array.from({ length: count }, (_, at): Rect => ({
    x: inner.x + at * (width + SLOT_GAP),
    y: inner.y,
    width,
    height,
  }));
  const refHeight =
    refCount > 0 ? Math.min(REFERENCE_HEIGHT, (inner.height - SLOT_GAP * (refCount - 1)) / refCount) : 0;
  const refs = Array.from({ length: refCount }, (_, at): Rect => ({
    x: inner.x + inner.width - REFERENCE_WIDTH,
    y: inner.y + at * (refHeight + SLOT_GAP),
    width: REFERENCE_WIDTH,
    height: refHeight,
  }));
  return { slots, refs };
}

/**
 * The neutral area on a phone, where it has a tab's room to itself: the cards one above the other at the full width,
 * each with its note under it, then the rules cards in a row at the foot.
 */
export function neutralStack(inner: Rect, count: number, refCount: number): NeutralLayout {
  if (count <= 0) return { slots: [], refs: [] };
  const refRow = refCount > 0 ? REFERENCE_HEIGHT + SLOT_GAP : 0;
  const each = (inner.height - refRow - SLOT_GAP * (count - 1)) / count;
  const height = Math.max(0, Math.min(each - NEUTRAL_NOTE_HEIGHT, 110));
  const slots = Array.from({ length: count }, (_, at): Rect => ({
    x: inner.x,
    y: inner.y + at * (height + NEUTRAL_NOTE_HEIGHT + SLOT_GAP),
    width: inner.width,
    height,
  }));
  const width = refCount > 0 ? (inner.width - SLOT_GAP * (refCount - 1)) / refCount : 0;
  const top = inner.y + inner.height - REFERENCE_HEIGHT;
  const refs = Array.from({ length: refCount }, (_, at): Rect => ({
    x: inner.x + at * (width + SLOT_GAP),
    y: top,
    width,
    height: REFERENCE_HEIGHT,
  }));
  return { slots, refs };
}

export interface NeutralTabSplit {
  /** The threat tab's schemes. */
  readonly schemes: Rect;
  /** The neutral area under them. */
  readonly area: Rect;
}

/**
 * On a phone the neutral area takes the foot of the Threat tab, which is the pod's shared threat and has the room: the
 * schemes keep at least a main scheme's height, the area the rest up to its ceiling.
 */
export function splitNeutralTab(threat: Rect): NeutralTabSplit {
  const schemesMin = 140;
  const height = Math.round(Math.min(330, Math.max(0, threat.height - schemesMin - AREA_GAP)));
  return {
    schemes: { ...threat, height: threat.height - height - AREA_GAP },
    area: { x: threat.x, y: threat.y + threat.height - height, width: threat.width, height },
  };
}
