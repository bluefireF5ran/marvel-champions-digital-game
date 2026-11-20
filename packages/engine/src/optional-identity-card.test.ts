/**
 * `PlayerCard.optionalForIdentity` (#890 item 13): an identity-specific card outside the identity's set, for a house
 * rule's card for an official hero ("Don't Make Me Angry!" for Hulk, the `hulk-angry-bf` community pack). The official
 * starter deck stays legal without it, a deck for that identity may include it, and a deck for another identity may not.
 * Real data: Quicksilver (14001a) and his starter deck; Scarlet Witch (15001a) as the other identity.
 */
import {
  WAVE2_CARDS,
  WAVE2_STARTER_DECKS,
  type AnyCard,
  type CardId,
  type DeckContents,
  type PlayerCard,
} from "@mc/content";
import { describe, expect, it } from "vitest";
import { requiredIdentitySet, validateDeck } from "./deck.js";

const QUICKSILVER = "14001a";
const SCARLET_WITCH = "15001a";

const starterOf = (identity: string): DeckContents => {
  const starter = WAVE2_STARTER_DECKS.find((deck) => (deck.identityCardId as string) === identity);
  if (!starter) throw new Error(`no starter deck for ${identity}`);
  return { identityCardId: starter.identityCardId, aspects: starter.aspects, cards: starter.cards };
};
const identity = WAVE2_CARDS.find((card) => (card.id as string) === QUICKSILVER);
if (identity?.type !== "hero_identity") throw new Error("no Quicksilver identity");

/** A basic upgrade of the pool, relabeled as Quicksilver's house-rule card: "Permanent. Setup." */
const base = WAVE2_CARDS.find((card) => card.type === "upgrade" && "aspect" in card && card.aspect === "basic") as
  | PlayerCard
  | undefined;
if (!base) throw new Error("no basic upgrade");
const HOUSE: PlayerCard = {
  ...base,
  id: "x.house.01" as CardId,
  name: "House Card",
  aspect: `hero:${QUICKSILVER}` as PlayerCard["aspect"],
  unique: false,
  deckLimit: 1,
  quantityInSet: 1,
  optionalForIdentity: true,
} as PlayerCard;
const POOL: readonly AnyCard[] = [...WAVE2_CARDS, HOUSE];

const codes = (deck: DeckContents) => {
  const verdict = validateDeck(deck, POOL);
  return verdict.ok ? [] : verdict.problems.map((p) => p.code);
};

describe("optionalForIdentity: a house rule's identity-specific card (#890 item 13)", () => {
  it("is not one of the cards the identity's set requires", () => {
    expect(requiredIdentitySet(identity, POOL).map((e) => e.cardId)).not.toContain(HOUSE.id);
  });

  it("the official starter deck stays legal without it", () => {
    expect(codes(starterOf(QUICKSILVER))).toEqual([]);
  });

  it("a deck for that identity may include it", () => {
    const deck = starterOf(QUICKSILVER);
    const withHouse: DeckContents = { ...deck, cards: [...deck.cards, { cardId: HOUSE.id, quantity: 1 }] };
    expect(codes(withHouse).filter((code) => code !== "deck_size")).toEqual([]);
  });

  it("a deck for another identity may not", () => {
    const deck = starterOf(SCARLET_WITCH);
    const withHouse: DeckContents = { ...deck, cards: [...deck.cards, { cardId: HOUSE.id, quantity: 1 }] };
    expect(codes(withHouse).length).toBeGreaterThan(0);
  });
});
