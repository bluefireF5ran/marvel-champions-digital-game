import { describe, expect, test } from "vitest";
import { tuckedRowLayout, TUCKED_HEADER_HEIGHT } from "./tucked-row-layout.js";

const ASPECT = 0.716;
const room = { x: 100, y: 200, width: 120, height: 90 };

describe("tuckedRowLayout", () => {
  test("one header over a row, every card inside the room, in order", () => {
    const layout = tuckedRowLayout(room, 4, ASPECT)!;
    expect(layout.header).toMatchObject({ x: 100, y: 200, width: 120, height: TUCKED_HEADER_HEIGHT });
    expect(layout.cards).toHaveLength(4);
    layout.cards.forEach((card, index) => {
      expect(card.x).toBeGreaterThanOrEqual(room.x);
      expect(card.x + card.width).toBeLessThanOrEqual(room.x + room.width);
      expect(card.y).toBeGreaterThanOrEqual(layout.header.y + layout.header.height);
      expect(card.y + card.height).toBeLessThanOrEqual(room.y + room.height);
      if (index > 0) expect(card.x).toBeGreaterThanOrEqual(layout.cards[index - 1]!.x + layout.cards[index - 1]!.width);
    });
    expect(layout.height).toBeLessThanOrEqual(room.height);
  });

  test("a short room, or none tucked, has no row", () => {
    expect(tuckedRowLayout({ ...room, height: 40 }, 2, ASPECT)).toBeNull();
    expect(tuckedRowLayout(room, 0, ASPECT)).toBeNull();
  });

  test("a narrow room shrinks the cards together instead of overlapping them", () => {
    const wide = tuckedRowLayout(room, 2, ASPECT)!;
    const narrow = tuckedRowLayout({ ...room, width: 70 }, 4, ASPECT);
    expect(narrow === null || narrow.cards[0]!.width < wide.cards[0]!.width).toBe(true);
  });
});
