import type { AbilityRegistry } from "@mc/engine";
import {
  aScheme,
  anAttackableEnemy,
  attackAnEnemy,
  chooseTarget,
  chosen,
  constant,
  costModifier,
  countOf,
  defineAbilities,
  dealDamage,
  heroAction,
  ifThen,
  query,
  scaled,
  stun,
  thwart,
  threatOn,
  valueAtLeast,
  valueEquals,
} from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/tigra/events` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (2):
 * - 56008 Tooth and Claw (event)
 * - 56009 Feline Senses (event)
 *
 * **56008.tooth-and-claw-constant**: "Reduce the cost to play this event by 1 for each minion engaged with you." Active
 * from the hand; the cost never goes below 0.
 *
 * **56008.tooth-and-claw-action**: "Hero Action (attack): Deal 4 damage to an enemy. Deal 4 damage to an enemy." The
 * labeled ability is one attack (RRG 1.8 "Attack (Player Ability Type)", p. 10); its two sentences are independent
 * instances of 4 damage, each choosing its enemy as it resolves, so both may name one enemy (owner's answer 2026-10-11,
 * question 16 = A; provisional). The second choice is made after the first damage, so an enemy the first instance
 * defeated, or a guard it removed, is already reflected.
 *
 * **56009.feline-senses-action**: "Hero Action (thwart): Remove 3 threat from a scheme. If this removes the last threat
 * from that scheme, stun a minion." The last threat is read after the thwart (Creole Charmer's shape), and only when the
 * scheme had threat to remove: a confused hero, or a crisis icon, removes nothing, so nothing is stunned. The minion
 * may be any minion in play.
 */
export const TIGRA_EVENTS: AbilityRegistry = defineAbilities({
  "56008.tooth-and-claw-constant": constant(
    costModifier({
      delta: scaled(countOf(query("minion", { engagedWith: "you" })), { times: -1 }),
      appliesTo: query("event", { self: true }),
      activeIn: "hand",
    }),
  ),

  "56008.tooth-and-claw-action": heroAction(
    { label: "attack" },
    attackAnEnemy(4, { slot: "first" }),
    anAttackableEnemy("second"),
    dealDamage(4, chosen("second")),
  ),

  "56009.feline-senses-action": heroAction(
    { label: "thwart" },
    aScheme("scheme"),
    ifThen(valueAtLeast(threatOn(chosen("scheme")), 1), [
      thwart(3, chosen("scheme")),
      ifThen(valueEquals(threatOn(chosen("scheme")), 0), [
        chooseTarget("minion", query("minion")),
        stun(chosen("minion")),
      ]),
    ]),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. None. */
export const TIGRA_EVENTS_SKIPPED: Readonly<Record<string, string>> = {};
