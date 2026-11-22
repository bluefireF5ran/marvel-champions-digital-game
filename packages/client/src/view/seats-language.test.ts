/**
 * Take your seats, Deck check and the name-conflict sheet in Spanish (#390): the view models these screens draw read
 * in the chosen language, and English stays as it was.
 */
import { afterEach, describe, expect, test } from "vitest";
import { useEnglish, useSpanish } from "../i18n/test-language.js";
import { listAnd } from "../i18n/translate.js";
import { aspectName, aspectStampOf } from "./aspect-stamp.js";
import { deckCountText, deckListSortLabel } from "./deck-stats.js";
import { deckCountTagOf, heroDeckRowOf, type HeroDeckRowFacts } from "./hero-deck-groups.js";
import { conflictNoticeOf } from "./name-conflicts.js";

const base: HeroDeckRowFacts = {
  deckId: "d",
  name: "Captain Marvel",
  sourceKind: "precon",
  testedCredit: null,
  cardCount: 40,
  blockedBy: null,
  lock: null,
  warning: null,
  activeSeat: false,
  otherSeat: null,
};

afterEach(() => useEnglish());

describe("Take your seats in Spanish", () => {
  test("a deck row reads in Spanish", () => {
    useSpanish();
    expect(heroDeckRowOf(base)).toMatchObject({
      source: "Precon",
      cards: "40 cartas",
      status: "Válido",
      action: "Asignar",
    });
    expect(heroDeckRowOf({ ...base, activeSeat: true })).toMatchObject({
      status: "En este asiento",
      action: "Asignado",
    });
    expect(heroDeckRowOf({ ...base, otherSeat: 2 }).status).toBe("En el asiento 2");
    expect(heroDeckRowOf({ ...base, cardCount: 1 }).cards).toBe("1 carta");
  });

  test("deck count tags and the conflict notice take the plural", () => {
    useSpanish();
    expect(deckCountTagOf(3, 1)).toBe("+1 MAZO");
    expect(deckCountTagOf(3, 2)).toBe("+2 MAZOS");
    expect(deckCountTagOf(2)).toBe("2 MAZOS");
    expect(conflictNoticeOf(1)).toBe("1 carta no se puede jugar con estos Héroes");
    expect(conflictNoticeOf(3)).toBe("3 cartas no se pueden jugar con estos Héroes");
  });

  test("aspects use the Spanish card names ('Pool is Masacrismo, basic is Básico)", () => {
    useSpanish();
    expect(aspectName("aggression")).toBe("Agresividad");
    expect(aspectName("leadership")).toBe("Liderazgo");
    expect(aspectName("pool")).toBe("Masacrismo");
    expect(aspectName("basic")).toBe("Básico");
    expect(aspectStampOf("justice").label).toBe("Justicia");
  });

  test("lists join with y, and e before an i sound", () => {
    useSpanish();
    expect(listAnd(["Justicia", "Liderazgo", "Protección"])).toBe("Justicia, Liderazgo y Protección");
    expect(listAnd(["Agresividad", "Iron Man"])).toBe("Agresividad e Iron Man");
  });
});

describe("Deck check in Spanish", () => {
  test("the card count and sort read in Spanish", () => {
    useSpanish();
    expect(deckCountText({ countedCards: 40, permanentCards: 0 })).toBe("40 cartas");
    expect(deckCountText({ countedCards: 40, permanentCards: 2 })).toBe("40 cartas + 2 permanentes");
    expect(deckListSortLabel("cost")).toBe("Orden: Coste");
  });
});

describe("English is unchanged", () => {
  test("the same words as before", () => {
    expect(heroDeckRowOf(base)).toMatchObject({ source: "Precon", cards: "40 cards", status: "Legal", action: "Seat" });
    expect(deckCountText({ countedCards: 40, permanentCards: 1 })).toBe("40 cards + 1 permanent");
    expect(listAnd(["a", "b", "c"])).toBe("a, b and c");
    expect(conflictNoticeOf(1)).toBe("1 card can't be played with these heroes");
  });
});
