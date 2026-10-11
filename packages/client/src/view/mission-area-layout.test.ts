import { describe, expect, test } from "vitest";
import { CARD_ASPECT } from "./layout.js";
import {
  missionSlots,
  neutralRow,
  neutralStack,
  NEUTRAL_NOTE_HEIGHT,
  splitMissionArea,
  splitNeutralTab,
} from "./mission-area-layout.js";

const zone = { x: 10, y: 50, width: 700, height: 400 };

describe("splitMissionArea", () => {
  test("a game with no area keeps the zone whole", () => {
    expect(splitMissionArea(zone, false)).toEqual({ enemies: zone, area: null });
  });

  test("the area is the foot of the zone and the enemies keep the rest, with a gap between", () => {
    const { enemies, area } = splitMissionArea(zone, true);
    expect(area).not.toBeNull();
    expect(area!.y + area!.height).toBe(zone.y + zone.height);
    expect(enemies.y).toBe(zone.y);
    expect(enemies.y + enemies.height).toBeLessThan(area!.y);
    expect(area!.width).toBe(zone.width);
  });

  test("a short zone never gives the enemies less than a card's worth", () => {
    const { enemies, area } = splitMissionArea({ ...zone, height: 230 }, true);
    expect(enemies.height).toBeGreaterThanOrEqual(100);
    expect(area!.height).toBeGreaterThanOrEqual(80);
  });
});

describe("splitMissionArea on a very short zone", () => {
  test.each([0, 10, 60, 87, 88, 100])("a %ipx zone gives no negative height and the area stays inside it", (height) => {
    const short = { ...zone, height };
    const { enemies, area } = splitMissionArea(short, true);
    expect(enemies.height).toBeGreaterThanOrEqual(0);
    expect(area!.height).toBeGreaterThanOrEqual(0);
    expect(area!.y).toBeGreaterThanOrEqual(short.y);
    expect(area!.y + area!.height).toBeLessThanOrEqual(short.y + short.height);
  });
});

describe("missionSlots", () => {
  const inner = { x: 0, y: 0, width: 600, height: 140 };

  test("a scheme takes a wider slot than a card, all one height, in order without overlap", () => {
    const [scheme, ally] = missionSlots(inner, ["scheme", "card"]);
    expect(scheme!.height).toBe(ally!.height);
    expect(scheme!.width).toBeGreaterThan(ally!.width);
    expect(ally!.x).toBeGreaterThan(scheme!.x + scheme!.width);
    expect(ally!.width / ally!.height).toBeCloseTo(CARD_ASPECT, 5);
  });

  test("too many cards shrink to fit the width instead of leaving the area", () => {
    const slots = missionSlots(inner, ["scheme", "card", "card", "card", "card", "card", "card"]);
    const last = slots[slots.length - 1]!;
    expect(last.x + last.width).toBeLessThanOrEqual(inner.x + inner.width + 0.001);
    expect(slots[0]!.height).toBeLessThan(inner.height);
  });

  test("nothing in the area is no slots", () => {
    expect(missionSlots(inner, [])).toEqual([]);
  });
});

const inside = (outer: { x: number; y: number; width: number; height: number }, r: typeof outer): boolean =>
  r.x >= outer.x - 0.001 &&
  r.y >= outer.y - 0.001 &&
  r.x + r.width <= outer.x + outer.width + 0.001 &&
  r.y + r.height <= outer.y + outer.height + 0.001;

describe("the neutral area's layouts", () => {
  const strip = { x: 0, y: 0, width: 800, height: 120 };

  test("a wide table: two wide cards from the left, a note's room under each, the rules cards in a column at the right", () => {
    const { slots, refs } = neutralRow(strip, 2, 2);
    expect(slots).toHaveLength(2);
    expect(refs).toHaveLength(2);
    for (const rect of [...slots, ...refs]) expect(inside(strip, rect)).toBe(true);
    expect(slots[0]!.height).toBe(strip.height - NEUTRAL_NOTE_HEIGHT);
    expect(slots[0]!.width).toBeGreaterThan(slots[0]!.height * 2);
    expect(slots[1]!.x).toBeGreaterThanOrEqual(slots[0]!.x + slots[0]!.width);
    expect(refs[0]!.x).toBeGreaterThanOrEqual(slots[1]!.x + slots[1]!.width);
    expect(refs[1]!.y).toBeGreaterThanOrEqual(refs[0]!.y + refs[0]!.height);
  });

  test("a narrower table shrinks the cards before it drops the rules cards", () => {
    const narrow = { x: 0, y: 0, width: 520, height: 120 };
    const { slots, refs } = neutralRow(narrow, 2, 2);
    for (const rect of [...slots, ...refs]) expect(inside(narrow, rect)).toBe(true);
    expect(slots[1]!.x + slots[1]!.width).toBeLessThanOrEqual(refs[0]!.x);
  });

  test("a phone: the cards stacked at full width, the rules cards in a row at the foot, all inside", () => {
    const tab = { x: 0, y: 0, width: 358, height: 250 };
    const { slots, refs } = neutralStack(tab, 2, 2);
    for (const rect of [...slots, ...refs]) expect(inside(tab, rect)).toBe(true);
    expect(slots[0]!.width).toBe(tab.width);
    expect(slots[1]!.y).toBeGreaterThanOrEqual(slots[0]!.y + slots[0]!.height + NEUTRAL_NOTE_HEIGHT);
    expect(refs[0]!.y).toBeGreaterThanOrEqual(slots[1]!.y + slots[1]!.height + NEUTRAL_NOTE_HEIGHT);
    expect(refs[1]!.x).toBeGreaterThan(refs[0]!.x + refs[0]!.width - 0.001);
  });

  test("no cards is nothing to lay out", () => {
    expect(neutralRow(strip, 0, 2)).toEqual({ slots: [], refs: [] });
    expect(neutralStack(strip, 0, 2)).toEqual({ slots: [], refs: [] });
  });

  test("the Threat tab keeps its schemes a main scheme's height and gives the area the foot", () => {
    const tab = { x: 16, y: 175, width: 358, height: 400 };
    const { schemes, area } = splitNeutralTab(tab);
    expect(schemes.height).toBeGreaterThanOrEqual(140);
    expect(area.y + area.height).toBe(tab.y + tab.height);
    expect(schemes.y + schemes.height).toBeLessThanOrEqual(area.y);
    const small = splitNeutralTab({ ...tab, height: 120 });
    expect(small.area.height).toBe(0);
  });
});
