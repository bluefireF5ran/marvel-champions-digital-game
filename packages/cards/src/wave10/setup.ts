import { CORE_STARTER_DECKS, WAVE10_STARTER_DECKS, type CardId } from "@mc/content";
import type { PlayerSetup } from "@mc/engine";

/**
 * A wave 10 hero (`tigra-aggression`, `hulkling-protection`) or Core starter deck as a player seat, quantities
 * expanded. The Civil War scenario builders (the four preconstructed scenarios, custom and random ones) are added by
 * docs/phase7-wave10.md section 8.2 task 3; until then tests seat these decks against Core's Rhino.
 */
export function wave10StarterDeckSetup(starterDeckId: string): PlayerSetup {
  const starter = [...WAVE10_STARTER_DECKS, ...CORE_STARTER_DECKS].find((d) => d.id === starterDeckId);
  if (!starter) throw new Error(`no wave 10 or Core starter deck ${starterDeckId}`);
  return {
    identityCardId: starter.identityCardId as CardId,
    aspects: starter.aspects,
    deck: starter.cards.flatMap(({ cardId: id, quantity }) => Array.from({ length: quantity }, () => id)),
  };
}
