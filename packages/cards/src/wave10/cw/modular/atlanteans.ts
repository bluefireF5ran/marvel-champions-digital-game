import type { AbilityRegistry, TargetRef, ValueSpec } from "@mc/engine";
import {
  addAccelerationToken,
  chosen,
  dealIndirectDamage,
  defineAbilities,
  ifThen,
  isAlterEgo,
  moveCards,
  perHero,
  placeThreat,
  self,
  theMainScheme,
  topOfDeck,
  whenRevealed,
  you,
} from "../../../dsl/index.js";

/** "For each different card type discarded this way": the engine's `distinctCardTypes` over the milled cards. */
const distinctTypesOf = (cardsRef: TargetRef): ValueSpec => ({ kind: "distinctCardTypes", cards: cardsRef });

/**
 * Modular encounter set `atlanteans` (Civil War, Resistance side; docs/phase7-wave10.md section 3.23). Guard on the
 * Atlantean Guard and Hinder 1[per_hero] on Atlantis Attacks are data keywords.
 *
 * **Atlantean Guard (56165)**: When Revealed: the revealing player discards the top 3 cards of their deck.
 *
 * **Atlanteans (56166)**: When Revealed: discard the top 3 cards of your deck, then by form: alter-ego, 1 threat on
 * the main scheme per different card type discarded; hero, take that many indirect damage. A deck of fewer than 3
 * discards what it has (RRG 1.8 "Player Deck", p. 33).
 *
 * **Atlantis Attacks (56167)**: When Revealed: discard the top 1[per_hero] cards of your deck and place 1
 * acceleration token on this scheme per different card type discarded.
 *
 * Cards (3):
 * - 56165 Atlantean Guard (minion)
 * - 56166 Atlanteans (treachery)
 * - 56167 Atlantis Attacks (side_scheme)
 */
export const MODULAR_ATLANTEANS: AbilityRegistry = defineAbilities({
  "56165.when-revealed": whenRevealed(moveCards(topOfDeck(3, you), "discard")),

  "56166.when-revealed": whenRevealed(
    moveCards(topOfDeck(3, you), "discard", "milled"),
    ifThen(
      isAlterEgo(),
      placeThreat(distinctTypesOf(chosen("milled")), theMainScheme),
      dealIndirectDamage(you, distinctTypesOf(chosen("milled"))),
    ),
  ),

  "56167.when-revealed": whenRevealed(
    moveCards(topOfDeck(perHero(1), you), "discard", "milled"),
    addAccelerationToken(self, distinctTypesOf(chosen("milled"))),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_ATLANTEANS_SKIPPED: Readonly<Record<string, string>> = {};
