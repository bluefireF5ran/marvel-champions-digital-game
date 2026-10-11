/**
 * Every deck a seat can take: the precons, the player's saved decks, and the tested community decks
 * (`@mc/cards`'s `communityDecks`). The community decks are offers, never stored, so any screen that turns a seated deck
 * id back into a deck (Take your seats, Table setup) has to ask for them here or it would drop the seat.
 */
import { communityDecks, type CommunityDeck } from "@mc/cards";
import type { Deck } from "@mc/content";
import type { CardPool, EngineDeps } from "@mc/engine";
import { testedDeckOptions } from "./community-decks-model.js";
import { deckOptionsOf, type DeckOption } from "./deck-list-model.js";

let catalog: readonly CommunityDeck[] | null = null;
/** The catalog, read once: it is fixed data. */
export const testedCatalog = (): readonly CommunityDeck[] => (catalog ??= communityDecks());

let tested: { readonly key: string; readonly pool: CardPool; readonly options: readonly DeckOption[] } | null = null;

/** Precons, then saved decks, then the tested community decks. The tested options are validated once per pool. */
export function seatableDeckOptionsOf(
  savedDecks: readonly Deck[],
  pool: CardPool,
  poolVersion: string,
  deps: EngineDeps,
): readonly DeckOption[] {
  if (tested?.key !== poolVersion || tested.pool !== pool) {
    tested = { key: poolVersion, pool, options: testedDeckOptions(testedCatalog(), pool, poolVersion, deps) };
  }
  return [...deckOptionsOf(savedDecks, pool, poolVersion, deps), ...tested.options];
}
