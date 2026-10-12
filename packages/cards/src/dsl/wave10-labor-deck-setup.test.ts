/**
 * docs/phase7-wave10-hero-packs.md H3.1 (engine task HT1): Hercules seats, and setup builds his Labor deck of encounter
 * cards and his Gift deck of player cards, with the real cards in a real game (Core's Rhino).
 *
 * The Hercules insert, "The Gift and Labor Decks": "he begins each game with two special 3-card decks. To create the
 * GIFT and LABOR decks, shuffle the three GIFT cards together to form the GIFT deck and the three LABOR cards to form
 * the LABOR deck. Then, place both of these decks facedown in your play area." RRG 1.8 "Deck" (p. 15): "Certain
 * identities or scenarios may add other decks to the game". RRG 1.8 "Ownership and Control" (p. 31): "A card's owner
 * is the player whose deck contained the card at the start of setup", so the Hercules player owns all six; the three
 * Labor cards are encounter cards (two attachments and an obligation) and no player controls them.
 *
 * The engine's own cases (synthetic cards, a second player, elimination) are in
 * `packages/engine/src/separate-deck-encounter.test.ts`.
 */

import { HERCULES_CARDS, cardId } from "@mc/content";
import {
  createGame,
  faceVisible,
  isOwnedEncounterCard,
  locateCard,
  playerCardOwnerOf,
  replay,
  separateDeckOf,
  startSession,
  sessionApply,
  validateDeck,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { P1, firstLegal, inst, playerOf } from "../testing/harness.js";
import { codeOf } from "../wave9/testing.js";
import { HERCULES_DECK, HERO_PACK_CARDS, WAVE10_DEPS, heroPackConfig, heroPackSeat } from "../wave10/testing.js";

vi.setConfig({ testTimeout: 120_000 });

const LABOR = "Labor";
const GIFT = "Gift";
const LABOR_CARDS = ["59002", "59003", "59004"];
const GIFT_CARDS = ["59005", "59006", "59007"];
const APPEAL_TO_ATHENA = "59035";

/** The game as `createGame` leaves it (the mulligan pending), and its setup log. */
function created(seed = 1): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const result = createGame(heroPackConfig(HERCULES_DECK, { seed }), WAVE10_DEPS);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result;
}

/** Past setup: the opening hand kept, the first player's first turn. */
function opened(seed = 1): GameState {
  let session = startSession(created(seed).state);
  for (let guard = 0; session.state.pendingChoice && session.state.step.phase !== "player"; guard++) {
    if (guard > 100) throw new Error("setup did not settle");
    const choice = session.state.pendingChoice;
    const applied = sessionApply(
      session,
      {
        type: "resolveChoice",
        playerId: choice.playerId,
        choiceId: choice.choiceId,
        selectedOptionIds: firstLegal(session.state),
      },
      WAVE10_DEPS,
    );
    if (!applied.ok) throw new Error(applied.error.message);
    session = applied.session;
  }
  return session.state;
}

const codes = (state: GameState, ids: readonly InstanceId[]): string[] => ids.map((id) => codeOf(state, id)).sort();
const everyInstanceOf = (state: GameState, code: string): InstanceId[] =>
  (Object.keys(state.instances) as InstanceId[]).filter((id) => codeOf(state, id) === code);

describe("H3.1 Hercules's Labor and Gift decks at setup (real cards)", () => {
  it("the data marks each Labor card as an encounter card of the Labor deck, in no encounter set", () => {
    for (const code of LABOR_CARDS) {
      const card = HERCULES_CARDS.find((c) => c.id === cardId(code)) as unknown as Record<string, unknown>;
      expect([code, card.separateDeck, card.encounterSetIds]).toEqual([code, LABOR, []]);
    }
    const types = LABOR_CARDS.map((code) => HERCULES_CARDS.find((c) => c.id === cardId(code))?.type);
    expect(types).toEqual(["attachment", "attachment", "obligation"]);
  });

  it("validateDeck accepts his 40-card deck: the Labor deck is no longer an unsupported kind", () => {
    const seat = heroPackSeat(HERCULES_DECK);
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
    expect(verdict).toEqual({ ok: true });
  });

  it("builds both decks: 3 Labor and 3 Gift cards, no discard pile in use, a 40-card player deck and a hand of 6", () => {
    const state = opened();
    const player = playerOf(state, P1);
    expect(Object.keys(player.separateDecks).sort()).toEqual([GIFT, LABOR]);
    const labor = separateDeckOf(state, P1, LABOR);
    const gift = separateDeckOf(state, P1, GIFT);
    expect(codes(state, labor.deck)).toEqual(LABOR_CARDS);
    expect(codes(state, gift.deck)).toEqual(GIFT_CARDS);
    expect(labor.discard).toEqual([]);
    expect(gift.discard).toEqual([]);
    // Alter-ego hand of 6 at the first turn; the two decks are no part of the 40.
    expect(player.hand).toHaveLength(6);
    expect(player.hand.length + player.deck.length).toBe(40);
    for (const code of [...LABOR_CARDS, ...GIFT_CARDS]) {
      expect(everyInstanceOf(state, code)).toHaveLength(1);
      const [id] = everyInstanceOf(state, code) as [InstanceId];
      expect(player.deck).not.toContain(id);
      expect(player.hand).not.toContain(id);
    }
  });

  it("a Labor card is owned by the Hercules player and controlled by nobody; a Gift card is his in both senses", () => {
    const state = opened();
    for (const id of separateDeckOf(state, P1, LABOR).deck) {
      expect(inst(state, id)).toMatchObject({
        ownerId: P1,
        controllerId: null,
        faceup: false,
        home: { kind: "separateDeck", name: LABOR },
      });
      expect(locateCard(state, id)).toEqual({ kind: "separateDeck", playerId: P1, name: LABOR });
      expect(isOwnedEncounterCard(state, id)).toBe(true);
      expect(playerCardOwnerOf(state, id)).toBeNull();
    }
    for (const id of separateDeckOf(state, P1, GIFT).deck) {
      expect(inst(state, id)).toMatchObject({
        ownerId: P1,
        controllerId: P1,
        faceup: false,
        home: { kind: "separateDeck", name: GIFT },
      });
      expect(isOwnedEncounterCard(state, id)).toBe(false);
      expect(playerCardOwnerOf(state, id)).toBe(P1);
    }
  });

  it("both decks are facedown to every viewer, the Hercules player included", () => {
    const state = opened();
    const ids = [...separateDeckOf(state, P1, LABOR).deck, ...separateDeckOf(state, P1, GIFT).deck];
    for (const id of ids) {
      expect(faceVisible(state, id)).toBe(false);
      expect(faceVisible(state, id, { deps: WAVE10_DEPS })).toBe(false);
      expect(faceVisible(state, id, { viewer: P1, deps: WAVE10_DEPS })).toBe(false);
    }
  });

  it("his obligation is Appeal to Athena alone: no Labor card is in the encounter deck or its discard pile", () => {
    const state = created().state;
    const encounter = Object.values(state.encounterDecks).flatMap((piles) => [...piles.deck, ...piles.discard]);
    const inEncounter = encounter.map((id) => codeOf(state, id));
    expect(inEncounter.filter((code) => code === APPEAL_TO_ATHENA)).toHaveLength(1);
    for (const code of LABOR_CARDS) expect(inEncounter).not.toContain(code);
    expect(codes(state, separateDeckOf(state, P1, LABOR).deck)).toEqual(LABOR_CARDS);
  });

  it("each deck is shuffled by the seed at setup, and the same seed builds the same game", () => {
    const first = created(7);
    const shuffled = first.events.flatMap((e) =>
      e.type === "deckShuffled" && e.zone.kind === "separateDeck" ? [e.zone.name] : [],
    );
    expect(shuffled.sort()).toEqual([GIFT, LABOR]);
    expect(created(7).state).toEqual(first.state);
    // The order is the seed's, not the data's: some seed among a few deals the Labor deck in another order.
    const orders = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
        const state = created(seed).state;
        return separateDeckOf(state, P1, LABOR)
          .deck.map((id) => codeOf(state, id))
          .join(",");
      }),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("the game is plain data and replays: a saved state equals itself, and the log reproduces the opened game", () => {
    const start = created(3).state;
    expect(JSON.parse(JSON.stringify(start))).toEqual(start);
    let session = startSession(start);
    for (let guard = 0; session.state.pendingChoice && session.state.step.phase !== "player"; guard++) {
      if (guard > 100) throw new Error("setup did not settle");
      const choice = session.state.pendingChoice;
      const applied = sessionApply(
        session,
        {
          type: "resolveChoice",
          playerId: choice.playerId,
          choiceId: choice.choiceId,
          selectedOptionIds: firstLegal(session.state),
        },
        WAVE10_DEPS,
      );
      if (!applied.ok) throw new Error(applied.error.message);
      session = applied.session;
    }
    const replayed = replay(session.log, WAVE10_DEPS);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(session.state);
    expect(codes(replayed.state, separateDeckOf(replayed.state, P1, LABOR).deck)).toEqual(LABOR_CARDS);
  });
});
