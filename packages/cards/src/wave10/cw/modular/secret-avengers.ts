import type { AbilityDefinition, AbilityRegistry } from "@mc/engine";
import {
  boost,
  boostCardOf,
  chooseCards,
  chooseTarget,
  chosen,
  competitiveOnly,
  defineAbilities,
  discard,
  each,
  encounterCards,
  enemyLeader,
  enemyTeamChooses,
  exhaust,
  giveBoostCard,
  ifThen,
  inCompetitiveMode,
  query,
  setDefeatDestination,
  surge,
  exists,
  whenDefeated,
  whenRevealed,
} from "../../../dsl/index.js";

/**
 * Teamwork's "When Defeated: Give this card to the enemy leader as a facedown boost card." (Black Panther and
 * Spectrum here; docs/phase7-wave10.md section 3.10), the same definition New Avengers' three minions use. The
 * defeated minion is held facedown by the enemy leader and is turned up as a boost card at the leader's next
 * activation (RRG 1.8 "Boost, Boost Icon", p. 11).
 */
const GIVEN_TO_THE_ENEMY_LEADER: AbilityDefinition = whenDefeated(setDefeatDestination(boostCardOf(enemyLeader)));

const AN_ALLY_YOU_CONTROL = query("ally", { controller: "you" });

/**
 * Modular encounter set `secret_avengers` (Civil War, Resistance side; docs/phase7-wave10.md sections 3.5, 3.9, 3.10,
 * 3.4 and 3.23). Teamwork (Avenger), Hinder 1[per_hero], the boost icons and stars are data.
 *
 * **Black Panther (56155)**, **Spectrum (56156)**: When Defeated gives the card to the enemy leader as a facedown boost
 * card (neither has Victory). Boost: Black Panther exhausts each upgrade the player activated against controls;
 * Spectrum exhausts a character that player controls, of their choice.
 *
 * **Freedom Fighters (56157)**: not scripted. The same card as New Avengers' 56153; both abilities resolve "the
 * 'Boost' ability of each minion", which needs the engine primitive `resolveBoostAbilitiesOf` (spec 8.2 task 8,
 * section 3.11).
 *
 * **Switching Sides (56158)**: When Revealed: the revealing player discards an ally they control; with none, no ally
 * leaves play and the card gains surge. The competitive sentence ("any player on the enemy team may spend resources
 * equal to that ally's cost to put it into play under their control") is written in full as a competitive-only
 * marker; it follows the discard, does nothing cooperatively, and the surge sentence (no ally was there to discard) reads
 * the same in both modes.
 *
 * **Secret Avengers (56159)**: When Defeated: "the enemy team searches the top 5 cards of the encounter deck for a
 * card" is the first player's choice among them, in a prompt marked as the enemy team's (owner's answer to question 6
 * = A, 2026-10-11; MC56 p. 6, the grim rule). That card is given to the enemy leader as a facedown boost card. The
 * other four stay where they were, in order: the text does not shuffle.
 *
 * Cards (5):
 * - 56155 Black Panther (minion)
 * - 56156 Spectrum (minion)
 * - 56157 Freedom Fighters (treachery)
 * - 56158 Switching Sides (treachery)
 * - 56159 Secret Avengers (side_scheme)
 */
export const MODULAR_SECRET_AVENGERS: AbilityRegistry = defineAbilities({
  "56155.when-defeated": GIVEN_TO_THE_ENEMY_LEADER,
  "56155.boost": boost(exhaust(each(query("upgrade", { controller: "you" })))),

  "56156.when-defeated": GIVEN_TO_THE_ENEMY_LEADER,
  "56156.boost": boost(chooseTarget("tired", query("character", { controller: "you" })), exhaust(chosen("tired"))),

  "56158.when-revealed": whenRevealed(
    // Read before the discard: with an ally to discard none is missing, with none "no ally left play this way".
    ifThen(
      exists(AN_ALLY_YOU_CONTROL),
      [chooseTarget("ally", AN_ALLY_YOU_CONTROL), discard(chosen("ally"))],
      [surge()],
    ),
    ifThen(inCompetitiveMode(), [
      competitiveOnly(
        "In competitive mode, any player on the enemy team may spend resources equal to that ally's cost to put it into play under their control.",
      ),
    ]),
  ),

  "56159.when-defeated": whenDefeated(
    chooseCards("found", encounterCards(["deck"], undefined, 5), { min: 1, max: 1, chooser: enemyTeamChooses }),
    giveBoostCard(enemyLeader, { card: chosen("found") }),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_SECRET_AVENGERS_SKIPPED: Readonly<Record<string, string>> = {
  "56157.when-revealed": "waits on spec 8.2 task 8 (§3.11); same card as 56153",
  "56157.boost": "waits on spec 8.2 task 8 (§3.11); same card as 56153",
};
