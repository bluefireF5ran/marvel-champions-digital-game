import type { AbilityRegistry, EventPattern } from "@mc/engine";
import { discardThisObligation } from "../../../core/obligations.js";
import {
  additionalAttackCost,
  alterEgoAction,
  boost,
  constant,
  controllerOf,
  dealEncounterCard,
  dealIndirectDamage,
  defineAbilities,
  discardFromHandCost,
  discardTuckedCost,
  eitherCost,
  enemyActivates,
  eventTarget,
  each,
  exhaustYourHero,
  exists,
  find,
  forcedResponse,
  ifThen,
  named,
  on,
  query,
  revealCard,
  rule,
  whenRevealed,
  you,
} from "../../../dsl/index.js";

const IONIC_PHYSIOLOGY = named("Ionic Physiology");
const GRIM_REAPER = query("minion", { name: "Grim Reaper" });
/** "Grim Reaper activates against you": the player resolving the card. */
const grimActivates = (opts: { readonly afterCurrentActivation?: boolean } = {}) =>
  enemyActivates(each(GRIM_REAPER), { against: you, ...opts });
/** "After Grim Reaper attacks and defeats an ally": the enemy attack's `defeated` result against an ally. */
const REAPER_DEFEATS_ALLY: EventPattern = {
  ...on.enemyAttacks("self"),
  targetIs: query("ally"),
  requireResults: { defeated: 1 },
};

/**
 * Wave 10 scripting module `wonder_man/wonder-man/obligation-nemesis` (docs/phase7-wave10-hero-packs.md H8.4 line HS4,
 * H3.16).
 *
 * Cards (5):
 * - 58025 Pacifism (obligation)
 * - 58026 Grim Reaper (minion)
 * - 58027 Brother vs. Brother (side_scheme)
 * - 58028 Scythe Strike (treachery)
 * - 58029 Death Cannot Die (treachery)
 *
 * No ruling since RRG 1.7 names these cards.
 *
 * **58025**: "Give to the Simon Williams player" is data, and the card stays in that player's play area (RRG 1.8
 * "Obligation", p. 30). "Wonder Man cannot attack" is the player's identity: every attack, basic or an "(attack)"
 * ability, is refused, and an ally's attack is untouched. The Alter-Ego Action pays "Exhaust Simon Williams or discard 3
 * cards tucked under Ionic Physiology" (one `eitherCost`: exactly one branch is paid, the player's choice; the discard
 * branch needs three tucked cards) and the card is discarded, not removed from the game.
 *
 * **58026**: Quickstrike is data. "That ally's controller" is read from the defeated ally; the Forced Response needs
 * the ally defeated by Grim Reaper's own attack.
 *
 * **58027**: the amplify icon and the starting threat are data. "As an additional cost to attack Grim Reaper, you must
 * discard 1 card from your hand" is the engine's `additionalAttackCost` (H3.16): Grim Reaper is not a legal target of
 * a player who cannot pay, and the cost is paid once per attack.
 *
 * **58028**: with Grim Reaper in play he activates against the revealing player (an attack on a hero, a scheme on an
 * alter-ego); otherwise that player takes 2 indirect damage.
 *
 * **58029**: Grim Reaper activates against the revealing player, or, if he is not in play, he is found (set aside, deck
 * or discard) and revealed instead. The Boost makes him activate against the attacked player "after this activation"
 * (queued behind the activation now resolving), only if he is in play.
 */
export const WONDER_MAN_OBLIGATION_NEMESIS: AbilityRegistry = defineAbilities({
  "58025.pacifism-constant": constant(
    rule({ kind: "cannotAttack", attacker: query("identity", { name: "Wonder Man" }), target: query("enemy") }),
  ),
  "58025.pacifism-action": alterEgoAction(
    { cost: eitherCost(exhaustYourHero, discardTuckedCost(IONIC_PHYSIOLOGY, { min: 3 })) },
    discardThisObligation,
  ),

  "58026.grim-reaper-forced-response": forcedResponse(
    REAPER_DEFEATS_ALLY,
    dealEncounterCard(controllerOf(eventTarget)),
  ),

  "58027.brother-vs-brother-constant": constant(
    additionalAttackCost(query("enemy", { name: "Grim Reaper" }), discardFromHandCost(1, 1)),
  ),

  "58028.when-revealed": whenRevealed(ifThen(exists(GRIM_REAPER), grimActivates(), dealIndirectDamage(you, 2))),

  "58029.when-revealed": whenRevealed(ifThen(exists(GRIM_REAPER), grimActivates(), revealCard(find(GRIM_REAPER), you))),
  "58029.boost": boost(ifThen(exists(GRIM_REAPER), grimActivates({ afterCurrentActivation: true }))),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. None. */
export const WONDER_MAN_OBLIGATION_NEMESIS_SKIPPED: Readonly<Record<string, string>> = {};
