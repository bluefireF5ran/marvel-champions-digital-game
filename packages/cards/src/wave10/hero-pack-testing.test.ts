import { HERCULES_CARDS, WONDER_MAN_CARDS, cardId } from "@mc/content";
import { createGame, validateDeck } from "@mc/engine";
import { vi } from "vitest";
import { CAPTAIN_AMERICA_SCENARIO, IRON_MAN_SCENARIO, WAVE10_DEPS } from "./testing.js";
import {
  HERCULES_DECK,
  HERO_PACK_CARDS,
  WONDER_MAN_DECK,
  heroPackConfig,
  heroPackSeat,
  herculesCivilWarGame,
  herculesGame,
  herculesHeroGame,
  wonderManCivilWarGame,
  wonderManGame,
  wonderManHeroGame,
} from "./testing.js";
import { P1, playerOf } from "../testing/harness.js";

vi.setConfig({ testTimeout: 120_000 });

/** The hero pack test helpers of `testing.ts`: hand-built decks (no starter deck exists) and the games seated with them. */

describe("heroPackSeat", () => {
  it.each([
    [WONDER_MAN_DECK, "58001a", WONDER_MAN_CARDS.map((c) => c.id as string), "justice"],
    [HERCULES_DECK, "59001a", HERCULES_CARDS.map((c) => c.id as string), "leadership"],
  ] as const)("%s seats a legal 40-card deck led by its own cards", (deckId, identityId, packIds, aspect) => {
    const seat = heroPackSeat(deckId);
    expect(seat.identityCardId).toBe(identityId);
    expect(seat.aspects).toEqual([aspect]);
    const counts = new Map<string, number>();
    for (const id of seat.deck) counts.set(id as string, (counts.get(id as string) ?? 0) + 1);
    const verdict = validateDeck(
      {
        identityCardId: seat.identityCardId,
        aspects: seat.aspects ?? [],
        cards: [...counts].map(([id, quantity]) => ({ cardId: cardId(id), quantity })),
      },
      HERO_PACK_CARDS,
    );
    // Hercules' Labor deck (encounter cards marked `separateDeck: "Labor"`) is one the engine builds since HT1.
    expect(verdict.ok ? [] : verdict.problems.map((p) => p.message)).toEqual([]);
    expect(verdict).toEqual({ ok: true });
    // The pack's own cards come first: the deck holds the pack's set and aspect cards.
    const own = seat.deck.filter((id) => packIds.includes(id as string));
    expect(own.length).toBeGreaterThan(15);
    // Gift and Labor cards are built by setup, never listed in the player deck.
    for (const id of ["59002", "59003", "59004", "59005", "59006", "59007"]) expect(seat.deck).not.toContain(id);
  });
});

describe("Wonder Man games", () => {
  it("opens against Core's Rhino with a full alter-ego hand, and in hero form", () => {
    const state = wonderManGame();
    expect(state.step.phase).toBe("player");
    expect(playerOf(state, P1).hand.length).toBeGreaterThan(0);
    expect(wonderManHeroGame().players[0]).toBeDefined();
  });

  it("opens in a Civil War scenario", () => {
    expect(wonderManCivilWarGame(IRON_MAN_SCENARIO).step.phase).toBe("player");
    expect(wonderManCivilWarGame(CAPTAIN_AMERICA_SCENARIO).step.phase).toBe("player");
  });
});

describe("Hercules games", () => {
  it("opens against Core's Rhino with a full alter-ego hand and his Labor and Gift decks of 3, and in hero form", () => {
    const created = createGame(heroPackConfig(HERCULES_DECK), WAVE10_DEPS);
    expect(created.ok ? null : created.error.message).toBeNull();
    const state = herculesGame();
    expect(state.step.phase).toBe("player");
    const player = playerOf(state, P1);
    expect(player.identity.form).toBe("alterEgo");
    expect(player.hand).toHaveLength(6);
    expect(player.separateDecks.Labor).toMatchObject({ discard: [] });
    expect(player.separateDecks.Labor?.deck).toHaveLength(3);
    expect(player.separateDecks.Gift?.deck).toHaveLength(3);
    expect(playerOf(herculesHeroGame(), P1).identity.form).toBe("hero");
  });

  it("opens in a Civil War scenario", () => {
    for (const scenarioId of [IRON_MAN_SCENARIO, CAPTAIN_AMERICA_SCENARIO]) {
      const state = herculesCivilWarGame(scenarioId);
      expect(state.step.phase).toBe("player");
      expect(playerOf(state, P1).separateDecks.Labor?.deck).toHaveLength(3);
    }
  });
});
