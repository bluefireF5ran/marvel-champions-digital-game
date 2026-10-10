/**
 * The Briefing's "Your call" card pictures (`campaign-briefing-model.ts`): which cards each option shows, their shapes,
 * and where a row puts them. The side-scheme rows are NeXt Evolution's own, read from the real definition.
 */
import { NEXT_EVOL_CAMPAIGN_DEFINITION } from "@mc/cards";
import type { CardId } from "@mc/content";
import { describe, expect, test } from "vitest";
import { CARDS_BY_ID } from "../content/pool.js";
import {
  CARD_OPTION_GRID,
  cardOptionCell,
  cardPickOptionsOf,
  pickCardShapeOf,
  pickRowLayout,
  sideSchemePickCards,
} from "./campaign-briefing-model.js";
import { callGridOf } from "./campaign-call-layout.js";
import { sideSchemeRowsOf } from "./campaign-side-scheme-model.js";

const cardName = (id: CardId): string => CARDS_BY_ID.get(id as string)?.name ?? (id as string);
const typeOf = (id: string): string | undefined => CARDS_BY_ID.get(id)?.type;
const ROWS = sideSchemeRowsOf(NEXT_EVOL_CAMPAIGN_DEFINITION, cardName);

describe("the cards a side-scheme option shows", () => {
  test("every one of the six rows shows its scheme, the environment it earns and the encounter card it brings", () => {
    expect(ROWS).toHaveLength(6);
    for (const row of ROWS) {
      const cards = sideSchemePickCards(row, typeOf);
      expect(cards.map((card) => [card.key, card.caption])).toEqual([
        ["scheme", "Scheme"],
        ["environment", "Earns"],
        ["encounter", "Brings"],
      ]);
      // Each picture is a real card Inspect can open.
      for (const card of cards) expect(CARDS_BY_ID.get(card.cardId as string)?.name).toBe(card.name);
    }
  });

  test("a scheme is drawn sideways, the environment on its back upright, the encounter card by its own type", () => {
    const shapes = (title: string) =>
      sideSchemePickCards(
        ROWS.find((row) => row.name === title)!,
        typeOf,
      ).map((card) => `${card.name}:${card.shape}`);
    expect(shapes("Mission Prep")).toEqual([
      "Mission Prep:landscape",
      "Mission Prepped:portrait",
      "Scrambler:portrait",
    ]);
    // Prepare Defenses brings a side scheme (Under Pressure), which is sideways too.
    expect(shapes("Prepare Defenses")).toEqual([
      "Prepare Defenses:landscape",
      "Prepared Defenses:portrait",
      "Under Pressure:landscape",
    ]);
    expect(pickCardShapeOf("main_scheme")).toBe("landscape");
    expect(pickCardShapeOf(undefined)).toBe("portrait");
  });

  test("a card the definition does not name is left out rather than drawn empty", () => {
    const cards = sideSchemePickCards(
      { scheme: { cardId: "" as CardId, name: "Unknown" }, environment: null, encounterCard: ROWS[0]!.encounterCard },
      typeOf,
    );
    expect(cards.map((card) => card.key)).toEqual(["encounter"]);
  });
});

describe("a plain pick whose options are cards", () => {
  const cardOf = (id: string) => CARDS_BY_ID.get(id);

  test("every option that is a card gets its picture", () => {
    const options = [ROWS[0]!.encounterCard!.cardId as string, ROWS[5]!.encounterCard!.cardId as string];
    const cards = cardPickOptionsOf(options, cardOf)!;
    expect([...cards.keys()]).toEqual(options);
    expect(cards.get(options[0]!)).toMatchObject({ name: "Vanisher", shape: "portrait", caption: "" });
    expect(cards.get(options[1]!)).toMatchObject({ name: "Under Pressure", shape: "landscape" });
  });

  test("a list with any option that is not a card stays plain buttons", () => {
    expect(cardPickOptionsOf(["Mission Prep", "Gear Up"], cardOf)).toBeNull();
    expect(cardPickOptionsOf([ROWS[0]!.encounterCard!.cardId as string, "crime"], cardOf)).toBeNull();
    expect(cardPickOptionsOf([], cardOf)).toBeNull();
  });

  test("the option cell keeps a full-height picture and a touch-target button inside the grid cell", () => {
    const grid = callGridOf({ count: 3, x: 16, y: 100, width: 358, ...CARD_OPTION_GRID });
    for (const cell of grid.rects) {
      const { art, button } = cardOptionCell(cell, "portrait");
      expect(art.height).toBe(cell.height);
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.x).toBeGreaterThan(art.x + art.width);
      expect(button.x + button.width).toBeLessThanOrEqual(cell.x + cell.width);
      expect(button.y).toBeGreaterThanOrEqual(cell.y);
      expect(button.y + button.height).toBeLessThanOrEqual(cell.y + cell.height);
    }
  });
});

describe("where a pick row puts its pictures", () => {
  const shapes = ["landscape", "portrait", "portrait"] as const;
  const overlaps = (a: { x: number; width: number }, b: { x: number; width: number }): boolean =>
    a.x < b.x + b.width && b.x < a.x + a.width;

  test("a wide column is one line: picture, caption, picture, caption, then Pick, nothing overlapping", () => {
    for (const width of [680, 696, 790, 1100]) {
      for (const set of [shapes, ["landscape", "portrait", "landscape"] as const]) {
        const layout = pickRowLayout(width, set);
        if (!layout.wide) continue;
        expect(layout.title).toBeNull();
        const boxes = [...layout.cards.flatMap((cell) => [cell.art, cell.caption]), layout.pick!];
        boxes.forEach((box, index) => {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width);
          expect(box.y + box.height).toBeLessThanOrEqual(layout.height);
          for (const other of boxes.slice(index + 1)) expect(overlaps(box, other)).toBe(false);
        });
      }
    }
    expect(pickRowLayout(790, shapes).wide).toBe(true);
  });

  test("a phone or a narrow column stacks: the title and Pick over the pictures, captions under each", () => {
    for (const width of [326, 358, 547]) {
      const layout = pickRowLayout(width, shapes, { pickWidth: 84 });
      expect(layout.wide).toBe(false);
      expect(layout.title!.x + layout.title!.width).toBeLessThan(layout.pick!.x);
      expect(layout.pick!.height).toBeGreaterThanOrEqual(44);
      layout.cards.forEach((cell, index) => {
        expect(cell.art.y).toBeGreaterThanOrEqual(layout.pick!.y + layout.pick!.height);
        expect(cell.caption.y).toBeGreaterThanOrEqual(cell.art.y + cell.art.height);
        expect(cell.caption.y + cell.caption.height).toBeLessThanOrEqual(layout.height);
        expect(cell.art.x + cell.art.width).toBeLessThanOrEqual(width);
        const next = layout.cards[index + 1];
        if (next) expect(overlaps(cell.caption, next.caption)).toBe(false);
      });
    }
  });

  test("every picture is big enough to tap", () => {
    for (const width of [326, 358, 547, 696, 790]) {
      for (const cell of pickRowLayout(width, shapes).cards) {
        expect(cell.art.width).toBeGreaterThanOrEqual(44);
        expect(cell.art.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("the settled row has no Pick and keeps its heading over the pictures at any width", () => {
    const layout = pickRowLayout(900, shapes, { withPick: false, stacked: true, titleHeight: 30 });
    expect(layout.wide).toBe(false);
    expect(layout.pick).toBeNull();
    expect(layout.cards[0]!.art.y).toBeGreaterThanOrEqual(8 + 30);
  });
});
