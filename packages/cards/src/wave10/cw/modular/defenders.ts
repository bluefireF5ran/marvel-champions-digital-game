import type { AbilityDefinition, AbilityRegistry } from "@mc/engine";
import {
  boost,
  constant,
  defineAbilities,
  each,
  enemyActivates,
  enemyLeader,
  exists,
  gainsKeyword,
  giveTough,
  hasStatus,
  ifThen,
  query,
  refCount,
  confuse,
  stun,
  surge,
  valueAtLeast,
  whenRevealed,
  yourIdentity,
  yourLeader,
  you,
} from "../../../dsl/index.js";

const MINION = query("minion");

/**
 * "Stun your leader. Otherwise, you are stunned." (MC56 p. 6: an ability that refers to "your leader" cannot be resolved
 * in a cooperative game, where the "Otherwise" sentence resolves instead; the leader is read, not the game mode.)
 */
const stunYourLeaderOtherwiseYou = ifThen(valueAtLeast(refCount(yourLeader), 1), stun(yourLeader), stun(yourIdentity));
const confuseYourLeaderOtherwiseYou = ifThen(
  valueAtLeast(refCount(yourLeader), 1),
  confuse(yourLeader),
  confuse(yourIdentity),
);

/**
 * **Street Defenders** (56187; the same card is 56192 in Hell's Kitchen, docs/phase7-wave10.md section 1.8): When
 * Revealed: each minion activates against the player it is engaged with, none of them given a boost card. Otherwise
 * (no minion in play), the enemy leader activates against you, also with no boost card ("it" is whichever enemy
 * activates). Exported as one definition for the Hell's Kitchen module to register under 56192.
 */
export const STREET_DEFENDERS: AbilityDefinition = whenRevealed(
  ifThen(
    exists(MINION),
    enemyActivates(each(MINION), { noBoost: true }),
    enemyActivates(enemyLeader, { against: you, noBoost: true }),
  ),
);

/**
 * Modular encounter set `defenders` (Civil War, Resistance side; docs/phase7-wave10.md sections 3.6 and 3.23). Hinder
 * 1[per_hero] on The Defenders is a data keyword.
 *
 * **Luke Cage (56184)** and **Jessica Jones (56185)**: When Revealed and Boost: stun (confuse) your leader; otherwise
 * you are stunned (confused). A boost "you" is the player the activation is against. Cooperatively there is no
 * "your leader", so the player takes the status.
 *
 * **Protect the Innocent (56186)**: the enemy leader's tough status is read first; every minion and then the enemy
 * leader are given a tough status card, and this card gains surge if the leader was already tough.
 *
 * **The Defenders (56188)**: each minion gains guard while it is in play.
 *
 * Cards (5):
 * - 56184 Luke Cage (minion)
 * - 56185 Jessica Jones (minion)
 * - 56186 Protect the Innocent (treachery)
 * - 56187 Street Defenders (treachery)
 * - 56188 The Defenders (side_scheme)
 */
export const MODULAR_DEFENDERS: AbilityRegistry = defineAbilities({
  "56184.when-revealed": whenRevealed(stunYourLeaderOtherwiseYou),
  "56184.boost": boost(stunYourLeaderOtherwiseYou),

  "56185.when-revealed": whenRevealed(confuseYourLeaderOtherwiseYou),
  "56185.boost": boost(confuseYourLeaderOtherwiseYou),

  "56186.when-revealed": whenRevealed(
    ifThen(hasStatus(enemyLeader, "tough"), surge()),
    giveTough(enemyLeader),
    giveTough(each(MINION)),
  ),

  "56187.when-revealed": STREET_DEFENDERS,

  "56188.the-defenders-constant": constant(gainsKeyword({ name: "guard" }, MINION)),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_DEFENDERS_SKIPPED: Readonly<Record<string, string>> = {};
