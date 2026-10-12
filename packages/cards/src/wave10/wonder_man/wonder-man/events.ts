import type { AbilityRegistry } from "@mc/engine";
import {
  aScheme,
  attackAnEnemy,
  chosen,
  defineAbilities,
  heroAction,
  ifThen,
  scaled,
  statOf,
  stun,
  sum,
  thwart,
  varAtLeast,
  varOf,
  yourIdentity,
} from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `wonder_man/wonder-man/events` (docs/phase7-wave10-hero-packs.md H8.4 line HS2, H3.13).
 *
 * Cards (4):
 * - 58003 Active Altruism (event)
 * - 58004 Ionic Blast (event)
 * - 58005 Starstruck (event)
 * - 58006 Energy Siphon (resource)
 *
 * **Overpaying (H3.13).** The three events read `overpaid.energy` from their own play frame: "Resources generated
 * beyond the specified cost are considered to have been overpaid for that cost" (RRG 1.8 "Cost", p. 13), and a wild
 * resource may be named as any type, also when overpaying (January 17, 2026 - Ruling 4 (1)). The printed "to a
 * maximum of N [energy]" caps the energy counted, so it caps the bonus at twice N (the cap is applied to the product).
 *
 * **58003.active-altruism-action**: "Hero Action (thwart): Remove 1 threat from a scheme. Remove 2 additional threat
 * from that scheme for each [energy] resource you overpaid for this card (to a maximum of [energy][energy])." One
 * thwart of 1 + 2 per energy overpaid (at most 5) from the one chosen scheme: the additional threat belongs to the
 * same thwart, so a confused hero or a crisis icon applies once to the whole amount.
 *
 * **58004.ionic-blast-action**: "Hero Action (attack): Deal 3 damage to an enemy. Deal 2 additional damage to that
 * enemy for each [energy] resource you overpaid for this card (to a maximum of [energy][energy][energy])." One attack
 * of 3 + 2 per energy overpaid (at most 9): the additional damage is the same instance, so it is one hit for Toughness,
 * Retaliate and the rest.
 *
 * **58005.starstruck-action**: "Hero Action (attack): Deal damage to an enemy equal to your ATK. If you overpaid for
 * this card with a [energy] resource, stun that enemy." The stun follows the damage, so it needs no stun on an enemy
 * the attack defeated (a defeated enemy has left play).
 *
 * **58006.energy-siphon-interrupt** is left unscripted: "Hero Interrupt: When you spend this card, take up to 3 damage ->
 * this card generates 1 additional [energy] resource for each damage taken this way" needs the damage chosen as the
 * card is spent and read by its own generation. Probed: `whenSpentGenerate(generatesAmount("energy",
 * varOf("cost.damageSelf")), { cost: takeAnyDamageCost(3) })` is accepted in a payment but generates 0, asks no amount
 * and takes no damage (`Payment.whenSpent` has no damage selection and `resourceCostVars` binds only
 * `cost.removeThreat`). Spec H3.14 listed it as reusable; it needs an engine task beside HT11. Its plain spending
 * (1 [energy]) already works as a resource card and the events below are paid with it.
 */
export const WONDER_MAN_EVENTS: AbilityRegistry = defineAbilities({
  "58003.active-altruism-action": heroAction(
    { label: "thwart" },
    aScheme("scheme"),
    thwart(sum(1, scaled(varOf("overpaid.energy"), { times: 2, max: 4 })), chosen("scheme")),
  ),

  "58004.ionic-blast-action": heroAction(
    { label: "attack" },
    attackAnEnemy(sum(3, scaled(varOf("overpaid.energy"), { times: 2, max: 6 }))),
  ),

  "58005.starstruck-action": heroAction(
    { label: "attack" },
    attackAnEnemy(statOf(yourIdentity, "atk")),
    ifThen(varAtLeast("overpaid.energy"), stun(chosen("enemy"))),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const WONDER_MAN_EVENTS_SKIPPED: Readonly<Record<string, string>> = {
  "58006.energy-siphon-interrupt":
    "engine gap, no H8.2 task yet: a take-any-damage cost (takeAnyDamageCost) on a whenSpent resource is not asked, takes no damage and cannot be read by its generation (cost.damageSelf is not bound for a payment, unlike removeThreat)",
};
