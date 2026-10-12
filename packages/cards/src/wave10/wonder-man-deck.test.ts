import { CORE_STARTER_DECKS, cardId, type AnyCard, type DeckContents, type HeroIdentityCard } from "@mc/content";
import { cardOfferedToDeck, validateDeck, type DeckProblem } from "@mc/engine";
import { describe, expect, it } from "vitest";
import { HERO_PACK_CARDS, WONDER_MAN_DECK, heroPackSeat } from "./testing.js";

/**
 * docs/phase7-wave10-hero-packs.md §H3.15: Wonder Man's deck-building rule on the real identity. Simon Williams
 * 58001b, Ionic Energy Being: "You may include events with a printed [energy] resource icon from any aspect in your
 * deck." (`deckbuilding.offAspectAllowance: { cardType: "event", printedResource: "energy" }` on 58001a.)
 *
 * The deck is the hand-built Justice list of `heroPackSeat` (40 cards) with one card's copies set. That builder takes
 * what `cardOfferedToDeck` offers, so since this rule landed it holds the pack's off-aspect energy events too; the
 * cases set a quantity rather than add a line, and hold either way.
 * Sources: the printed alter-ego text; RRG 1.8 Appendix I "Deck Customization" (p. 50): "Any 'deckbuilding
 * requirements' on the player's identity card must be followed"; "Printed" (p. 35), for a wild icon.
 */
const byId = new Map(HERO_PACK_CARDS.map((card) => [card.id as string, card]));
const card = (id: string): AnyCard => {
  const found = byId.get(id);
  if (!found) throw new Error(`no card ${id}`);
  return found;
};
const WONDER_MAN = card("58001a") as HeroIdentityCard;
const SPIDER_MAN = card("01001a") as HeroIdentityCard;

const justiceDeck = (): DeckContents => {
  const seat = heroPackSeat(WONDER_MAN_DECK);
  const counts = new Map<string, number>();
  for (const id of seat.deck) counts.set(id as string, (counts.get(id as string) ?? 0) + 1);
  return {
    identityCardId: seat.identityCardId,
    aspects: seat.aspects ?? [],
    cards: [...counts].map(([id, quantity]) => ({ cardId: cardId(id), quantity })),
  };
};
const spiderManDeck = (): DeckContents => {
  const deck = CORE_STARTER_DECKS.find((d) => d.id === "core-spider-man-justice");
  if (!deck) throw new Error("no Spider-Man starter deck");
  return { identityCardId: deck.identityCardId, aspects: deck.aspects, cards: deck.cards };
};
/** The deck holding exactly `quantity` copies of the card, whether or not it listed it. */
const withCard = (deck: DeckContents, id: string, quantity: number): DeckContents => ({
  ...deck,
  cards: [...deck.cards.filter((line) => line.cardId !== cardId(id)), { cardId: cardId(id), quantity }],
});
const problemsOf = (deck: DeckContents, pool: readonly AnyCard[] = HERO_PACK_CARDS): readonly DeckProblem[] => {
  const verdict = validateDeck(deck, pool);
  return verdict.ok ? [] : verdict.problems;
};
const icons = (c: AnyCard): Readonly<Record<string, number | undefined>> =>
  "resourceIcons" in c ? (c.resourceIcons as Record<string, number | undefined>) : {};
const RULE =
  " Wonder Man (Simon Williams)'s deckbuilding rule lets in only event cards with a printed energy resource from other aspects, and this card is not one.";
const refused = (name: string, aspect: string, hint = ""): string =>
  `${name} is a ${aspect} card, but this deck's aspect is Justice; beyond its identity set a deck may only use its chosen aspect and basic cards.${hint}`;

const BOMBS_AWAY = "58017"; // Aggression event, [energy]
const STRONGER_TOGETHER = "58019"; // Protection event, [energy]
const UNIFIED_STRIKE = "58020"; // Leadership event, [energy]
const CHASE_THEM_DOWN = "01052"; // Core Aggression event, no energy icon
const HULK = "01050"; // Core Aggression ally, [energy]

describe("§H3.15 Wonder Man: events with a printed energy resource icon from any aspect", () => {
  it("the identity carries the rule, and the cards the cases use are what they are said to be", () => {
    expect(WONDER_MAN.deckbuilding).toEqual({ offAspectAllowance: { cardType: "event", printedResource: "energy" } });
    expect(problemsOf(justiceDeck())).toEqual([]);
    expect(
      [BOMBS_AWAY, STRONGER_TOGETHER, UNIFIED_STRIKE, CHASE_THEM_DOWN, HULK].map((id) => {
        const c = card(id) as AnyCard & { aspect: string };
        return [id, c.type, c.aspect, (icons(c).energy ?? 0) > 0];
      }),
    ).toEqual([
      [BOMBS_AWAY, "event", "aggression", true],
      [STRONGER_TOGETHER, "event", "protection", true],
      [UNIFIED_STRIKE, "event", "leadership", true],
      [CHASE_THEM_DOWN, "event", "aggression", false],
      [HULK, "ally", "aggression", true],
    ]);
  });

  it("an off-aspect energy event is legal at 3 copies, and so are his pack's three together", () => {
    expect(problemsOf(withCard(justiceDeck(), BOMBS_AWAY, 3))).toEqual([]);
    const all = [BOMBS_AWAY, STRONGER_TOGETHER, UNIFIED_STRIKE].reduce(
      (deck, id) => withCard(deck, id, 3),
      justiceDeck(),
    );
    expect(all.cards.reduce((n, line) => n + line.quantity, 0)).toBeLessThanOrEqual(50);
    expect(problemsOf(all)).toEqual([]);
  });

  it("the same event is illegal for a hero without the rule", () => {
    expect(SPIDER_MAN.deckbuilding).toBeUndefined();
    const problems = problemsOf(withCard(spiderManDeck(), BOMBS_AWAY, 3));
    expect(problems.map((p) => [p.code, p.cardIds, p.message])).toEqual([
      ["aspect_restriction", [BOMBS_AWAY], refused("Bombs Away", "Aggression")],
    ]);
  });

  it("an off-aspect event without a printed energy resource is illegal for Wonder Man", () => {
    const problems = problemsOf(withCard(justiceDeck(), CHASE_THEM_DOWN, 1));
    expect(problems.map((p) => [p.code, p.cardIds, p.message])).toEqual([
      ["aspect_restriction", [CHASE_THEM_DOWN], refused("Chase Them Down", "Aggression", RULE)],
    ]);
  });

  it("an off-aspect card with an energy resource that is not an event is illegal", () => {
    const problems = problemsOf(withCard(justiceDeck(), HULK, 1));
    expect(problems.map((p) => [p.code, p.cardIds, p.message])).toEqual([
      ["aspect_restriction", [HULK], refused("Hulk (Bruce Banner)", "Aggression", RULE)],
    ]);
  });

  it("an off-aspect event printing only a wild icon is illegal: a wild icon is not an energy icon", () => {
    const wildOnly = { ...card(STRONGER_TOGETHER), resourceIcons: { wild: 1 } } as AnyCard;
    const pool = HERO_PACK_CARDS.map((c) => (c.id === wildOnly.id ? wildOnly : c));
    const problems = problemsOf(withCard(justiceDeck(), STRONGER_TOGETHER, 3), pool);
    expect(problems.map((p) => [p.code, p.message])).toEqual([
      ["aspect_restriction", refused("Stronger Together", "Protection", RULE)],
    ]);
    expect(cardOfferedToDeck(wildOnly, WONDER_MAN, ["justice"])).toEqual({ offered: false });
  });

  it("the deck builder offers the three events through the rule, and nothing else off-aspect", () => {
    for (const id of [BOMBS_AWAY, STRONGER_TOGETHER, UNIFIED_STRIKE])
      expect(cardOfferedToDeck(card(id), WONDER_MAN, ["justice"]), id).toEqual({ offered: true, via: "allowance" });
    expect(cardOfferedToDeck(card(CHASE_THEM_DOWN), WONDER_MAN, ["justice"])).toEqual({ offered: false });
    expect(cardOfferedToDeck(card(HULK), WONDER_MAN, ["justice"])).toEqual({ offered: false });
    expect(cardOfferedToDeck(card(BOMBS_AWAY), SPIDER_MAN, ["justice"])).toEqual({ offered: false });
    // In an Aggression deck Bombs Away is an ordinary choice.
    expect(cardOfferedToDeck(card(BOMBS_AWAY), WONDER_MAN, ["aggression"])).toEqual({ offered: true });
  });
});
