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
  not,
  query,
  each,
  resolveBoostAbilitiesOf,
  setDefeatDestination,
  stun,
  surge,
  varAtLeast,
  whenDefeated,
  whenRevealed,
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
 * Question 10 of docs/phase7-wave10.md section 4.0 (owner, 2026-10-11): when Freedom Fighters resolves a minion's Boost
 * ability, "this card gains [boost][boost]" (Falcon, Hercules, Goliath) does `"nothing"` (answer A: the minion in play
 * is not a boost card of the activation). Changing this to `"joinActivation"` (answer B: the icons are added to the
 * activation Freedom Fighters is boosting) is the whole switch; the Boost definition below reads it.
 */
export const FREEDOM_FIGHTERS_BORROWED_ICONS: "nothing" | "joinActivation" = "nothing";

/** "When Revealed: Resolve the 'Boost' ability of each minion in play. If no 'Boost' abilities were resolved this way, this card gains surge." */
export const FREEDOM_FIGHTERS_WHEN_REVEALED: AbilityDefinition = whenRevealed(
  resolveBoostAbilitiesOf(each(query("minion")), { bind: "boosts" }),
  ifThen(not(varAtLeast("boosts.count")), surge()),
);

/** "Boost: Resolve the 'Boost' ability of each minion engaged with you." `icons` is question 10's option (a test builds B with it). */
export const freedomFightersBoost = (
  icons: "nothing" | "joinActivation" = FREEDOM_FIGHTERS_BORROWED_ICONS,
): AbilityDefinition =>
  boost(resolveBoostAbilitiesOf(each(query("minion", { engagedWith: "you" })), { borrowedBoostIcons: icons }));

/** Freedom Fighters' Boost with the constant's answer. */
export const FREEDOM_FIGHTERS_BOOST: AbilityDefinition = freedomFightersBoost();

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
 * **Freedom Fighters (56153, and 56157 in Secret Avengers: one card, one definition)**: When Revealed resolves the
 * Boost ability of each minion in play and counts how many resolved (a minion with no Boost ability does not count);
 * with none, the card gains surge. Its Boost resolves the Boost ability of each minion engaged with the player the
 * activation is against. Both use `resolveBoostAbilitiesOf` (section 3.11); the icons a borrowed ability gains follow
 * `FREEDOM_FIGHTERS_BORROWED_ICONS`.
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

  "56153.when-revealed": FREEDOM_FIGHTERS_WHEN_REVEALED,
  "56153.boost": FREEDOM_FIGHTERS_BOOST,

  "56154.when-defeated": whenDefeated(moveCards(encounterCards(["discard"], query("minion")), "encounterDeckShuffle")),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_NEW_AVENGERS_SKIPPED: Readonly<Record<string, string>> = {};
