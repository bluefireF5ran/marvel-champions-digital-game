/**
 * Civil War (`cw`, MC56) precons against the whole playable pool (docs/phase7-wave10.md §8.1): Tigra and Hulkling are
 * legal under `validateDeck`, start from exactly their signature cards (`requiredIdentitySet`), and nothing of the
 * box can be seated yet (no ability script exists for it). The 16 leader-specific basic cards are competitive-only,
 * so a cooperative deck that lists one is refused (`competitive_card`).
 */
import { PLAYABLE_CARDS, WAVE10_STARTER_DECKS, cardId, type DeckContents, type HeroIdentityCard } from "@mc/content";
import { requiredIdentitySet, unscriptedCards, validateDeck } from "@mc/engine";
import { describe, expect, it } from "vitest";
import { PLAYABLE_DEPS } from "./playable/index.js";

const contents = (id: string): DeckContents => {
  const deck = WAVE10_STARTER_DECKS.find((d) => d.id === id)!;
  return { identityCardId: deck.identityCardId, aspects: deck.aspects, cards: deck.cards };
};
const LEADER_CARDS = [
  ...["56129", "56130", "56131", "56132"],
  ...["56133", "56134", "56135", "56136"],
  ...["56207", "56208", "56209", "56210"],
  ...["56211", "56212", "56213", "56214"],
];

describe("cw precons", () => {
  it.each([
    ["tigra-aggression", "56001a"],
    ["hulkling-protection", "56029a"],
  ])("%s is legal, and its identity starts from its own signature cards", (id, identityId) => {
    const deck = contents(id);
    expect(validateDeck(deck, PLAYABLE_CARDS)).toEqual({ ok: true });
    const identity = PLAYABLE_CARDS.find((c) => c.id === identityId) as HeroIdentityCard;
    const listed = new Map(deck.cards.map((e) => [e.cardId as string, e.quantity]));
    const required = requiredIdentitySet(identity, PLAYABLE_CARDS);
    expect(required.length).toBeGreaterThan(0);
    for (const entry of required)
      expect([entry.cardId, listed.get(entry.cardId)]).toEqual([entry.cardId, entry.quantity]);
  });

  it("cannot be seated yet: the box has no ability scripts", () => {
    for (const id of ["tigra-aggression", "hulkling-protection"])
      expect(unscriptedCards(contents(id), PLAYABLE_CARDS, PLAYABLE_DEPS).length, id).toBeGreaterThan(0);
  });

  it.each(LEADER_CARDS)(
    "a cooperative deck listing the leader-specific card %s is refused as a competitive card",
    (id) => {
      const deck = contents("tigra-aggression");
      const [first, ...rest] = deck.cards;
      const swapped: DeckContents = { ...deck, cards: [{ cardId: cardId(id), quantity: 1 }, ...rest] };
      expect(first).toBeDefined();
      const verdict = validateDeck(swapped, PLAYABLE_CARDS);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.problems.map((p) => p.code)).toContain("competitive_card");
    },
  );
});
