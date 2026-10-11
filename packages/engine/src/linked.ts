/**
 * "Linked (Card Title)" (RRG 1.8 p. 27): which card a linked card's parentheses name.
 *
 * The parentheses hold a title, and on some cards a title and a card type: "Linked (Show of Empathy)", "Linked
 * (Captain America upgrade)", "Linked (Titania minion)". The type matters: the named Titania is the minion, not the
 * ally of the same title that carries the keyword (docs/phase7-wave9.md §3.57).
 *
 * Two shapes of the keyword are read:
 *
 * - **A title and a card type as two fields** (`cardTitle`, `cardType`): the named card has that title and that type.
 * - **The parentheses as printed** in `cardTitle` alone: a card of exactly that title is named; so is a card whose
 *   title followed by its own card type's printed word is that text ("Captain America upgrade" names the upgrade
 *   titled Captain America, and no ally or identity of that title).
 */

import type { AnyCard, CardType, KeywordInstance } from "@mc/content";

type LinkedKeyword = Extract<KeywordInstance, { name: "linked" }>;

/** A card type as a linked keyword's parentheses print it. A player side scheme is printed "side scheme". */
const PRINTED_TYPE_WORD: Readonly<Record<CardType, string>> = {
  hero_identity: "identity",
  ally: "ally",
  event: "event",
  support: "support",
  upgrade: "upgrade",
  resource: "resource",
  player_side_scheme: "side scheme",
  villain: "villain",
  minion: "minion",
  attachment: "attachment",
  main_scheme: "main scheme",
  side_scheme: "side scheme",
  treachery: "treachery",
  obligation: "obligation",
  environment: "environment",
  evidence: "evidence",
};

/** The card type a linked keyword names beside its title, when the data carries one. */
function linkedCardTypeOf(keyword: LinkedKeyword): string | undefined {
  const cardType = (keyword as { readonly cardType?: unknown }).cardType;
  return typeof cardType === "string" ? cardType : undefined;
}

/** A stable key for "the same parentheses": two linked cards with the same key are brought in by the same card. */
export function linkedNameKey(keyword: LinkedKeyword): string | undefined {
  if (keyword.cardTitle === undefined) return undefined;
  const cardType = linkedCardTypeOf(keyword);
  return cardType === undefined ? keyword.cardTitle : `${keyword.cardTitle}\u0000${cardType}`;
}

/** Whether `card` is the card this linked keyword's parentheses name. A keyword with no title names nothing. */
export function linkedKeywordNames(keyword: LinkedKeyword, card: AnyCard): boolean {
  if (keyword.cardTitle === undefined) return false;
  const cardType = linkedCardTypeOf(keyword);
  if (cardType !== undefined) return card.name === keyword.cardTitle && card.type === cardType;
  return card.name === keyword.cardTitle || `${card.name} ${PRINTED_TYPE_WORD[card.type]}` === keyword.cardTitle;
}

/** A card's linked keywords (none for a card type without keywords). */
export function linkedKeywordsOf(card: AnyCard): readonly LinkedKeyword[] {
  if (!("keywords" in card)) return [];
  return card.keywords.filter((keyword): keyword is LinkedKeyword => keyword.name === "linked");
}
