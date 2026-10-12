import { trait } from "@mc/content";
import type { AbilityRegistry } from "@mc/engine";
import {
  boost,
  chosen,
  constant,
  dealDamage,
  defineAbilities,
  discardEncounterUntil,
  encounterCards,
  gainsKeyword,
  ifThen,
  isAlterEgo,
  placeThreat,
  printedStatOf,
  putIntoPlay,
  query,
  selectCards,
  self,
  theMainScheme,
  whenRevealed,
  yourIdentity,
  you,
} from "../../../dsl/index.js";

const SHIELD_MINION = query("minion", { trait: trait("S.H.I.E.L.D.") });

/**
 * Modular encounter set `martial_law` (Civil War, Registration side; docs/phase7-wave10.md section 3.23). Hinder
 * 1[per_hero] on S.H.I.E.L.D. Patrol is a data keyword.
 *
 * **S.H.I.E.L.D. Soldier (56109)**: When Revealed: the topmost S.H.I.E.L.D. minion in the encounter discard pile (the
 * most recently discarded) is put into play engaged with the revealing player; nothing happens when there is none.
 * Boost: this boost card itself is put into play engaged with the activated player.
 *
 * **Rapid Response (56110)**: When Revealed: cards are discarded from the encounter deck until a minion is discarded;
 * in alter-ego form the main scheme gets threat equal to that minion's SCH, in hero form the hero is dealt damage equal
 * to its ATK (the printed values; the minion is in the discard pile, RRG 1.8 "Printed", p. 35).
 *
 * **S.H.I.E.L.D. Patrol (56111)**: each minion gains guard while it is in play.
 *
 * Cards (3):
 * - 56109 S.H.I.E.L.D. Soldier (minion)
 * - 56110 Rapid Response (treachery)
 * - 56111 S.H.I.E.L.D. Patrol (side_scheme)
 */
export const MODULAR_MARTIAL_LAW: AbilityRegistry = defineAbilities({
  "56109.when-revealed": whenRevealed(
    selectCards("topmost", encounterCards(["discard"], SHIELD_MINION, { topmostOnly: true })),
    putIntoPlay(chosen("topmost"), you),
  ),
  "56109.boost": boost(putIntoPlay(self, you)),

  "56110.when-revealed": whenRevealed(
    discardEncounterUntil(query("minion"), "found"),
    ifThen(
      isAlterEgo(),
      placeThreat(printedStatOf(chosen("found"), "sch"), theMainScheme),
      dealDamage(printedStatOf(chosen("found"), "atk"), yourIdentity),
    ),
  ),

  "56111.shield-patrol-constant": constant(gainsKeyword({ name: "guard" }, query("minion"))),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_MARTIAL_LAW_SKIPPED: Readonly<Record<string, string>> = {};
