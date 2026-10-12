import type { AbilityDefinition, AbilityRegistry } from "@mc/engine";
import {
  adjustBoostCount,
  boost,
  boostCardOf,
  confuse,
  defineAbilities,
  encounterCards,
  enemyLeader,
  giveTough,
  hasStatus,
  ifThen,
  moveCards,
  query,
  setDefeatDestination,
  stun,
  whenDefeated,
  yourIdentity,
} from "../../../dsl/index.js";

/**
 * Teamwork's "When Defeated: Give this card to the enemy leader as a facedown boost card." (Falcon, Hercules and
 * Goliath here; docs/phase7-wave10.md section 3.10), one definition for the three. The defeated minion leaves play as
 * defeated and is held facedown by the enemy leader, and is turned up as a boost card at the leader's next activation
 * (RRG 1.8 "Boost, Boost Icon", p. 11), in addition to the one dealt then.
 */
const GIVEN_TO_THE_ENEMY_LEADER: AbilityDefinition = whenDefeated(setDefeatDestination(boostCardOf(enemyLeader)));

/**
 * Modular encounter set `new_avengers` (Civil War, Resistance side; docs/phase7-wave10.md sections 3.9, 3.10, 3.11 and
 * 3.23). Teamwork (Avenger), Hinder 1[per_hero], the boost stars and the hazard icon are data.
 *
 * **Falcon (56150)**, **Hercules (56151)**, **Goliath (56152)**: When Defeated gives the card to the enemy leader as a
 * facedown boost card. None has Victory, so none goes to the victory display. Each Boost reads the status before it
 * gives its own, so "if you were already confused / stunned" (Goliath: "if they were already tough") looks at the
 * state before the card's own status is given (the same shape as Doc Samson and Hellcat); then the card gains two boost
 * icons for the count it is boosting.
 *
 * **Freedom Fighters (56153)**: not scripted. Both abilities resolve "the 'Boost' ability of each minion", which needs
 * the engine primitive `resolveBoostAbilitiesOf` (spec 8.2 task 8, section 3.11; the owner's answer to question 10 is
 * A, "this card gains [boost]" in a borrowed ability does nothing, with B kept as a named switch).
 *
 * **New Avengers (56154)**: When Defeated: each minion in the encounter discard pile is shuffled into the encounter
 * deck.
 *
 * Cards (5):
 * - 56150 Falcon (minion)
 * - 56151 Hercules (minion)
 * - 56152 Goliath (minion)
 * - 56153 Freedom Fighters (treachery)
 * - 56154 New Avengers (side_scheme)
 */
export const MODULAR_NEW_AVENGERS: AbilityRegistry = defineAbilities({
  "56150.when-defeated": GIVEN_TO_THE_ENEMY_LEADER,
  "56150.boost": boost(ifThen(hasStatus(yourIdentity, "confused"), adjustBoostCount(2)), confuse(yourIdentity)),

  "56151.when-defeated": GIVEN_TO_THE_ENEMY_LEADER,
  "56151.boost": boost(ifThen(hasStatus(yourIdentity, "stunned"), adjustBoostCount(2)), stun(yourIdentity)),

  "56152.when-defeated": GIVEN_TO_THE_ENEMY_LEADER,
  "56152.boost": boost(ifThen(hasStatus(enemyLeader, "tough"), adjustBoostCount(2)), giveTough(enemyLeader)),

  "56154.when-defeated": whenDefeated(moveCards(encounterCards(["discard"], query("minion")), "encounterDeckShuffle")),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_NEW_AVENGERS_SKIPPED: Readonly<Record<string, string>> = {
  "56153.when-revealed": "waits on spec 8.2 task 8 (§3.11): the engine primitive resolveBoostAbilitiesOf",
  "56153.boost": "waits on spec 8.2 task 8 (§3.11): the engine primitive resolveBoostAbilitiesOf",
};
