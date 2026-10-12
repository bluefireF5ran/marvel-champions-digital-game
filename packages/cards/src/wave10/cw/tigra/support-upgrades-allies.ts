import type { AbilityRegistry } from "@mc/engine";
import {
  YOUR_IDENTITY,
  aScheme,
  alterEgoAction,
  after,
  chooseCards,
  chooseOne,
  chooseTarget,
  chosen,
  confuse,
  countOf,
  defineAbilities,
  encounterCards,
  exhaustThis,
  forcedResponse,
  generatesAmount,
  heroInterrupt,
  interrupt,
  modifyAttack,
  modifyStat,
  discardThis,
  on,
  option,
  preventDamage,
  putIntoPlay,
  query,
  removeThreat,
  resource,
  scaled,
  shuffleEncounterDeck,
  stun,
  when,
  yourIdentity,
  you,
} from "../../../dsl/index.js";

/** The minions engaged with you: Precinct HQ, Cat's Head Amulet. */
const ENGAGED_MINIONS = () => countOf(query("minion", { engagedWith: "you" }));

/**
 * Wave 10 scripting module `cw/tigra/support-upgrades-allies` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (6):
 * - 56002 Moon Knight (ally)
 * - 56003 Precinct HQ (support)
 * - 56004 Cat's Head Amulet (upgrade)
 * - 56005 Sharp Claws (upgrade)
 * - 56006 Cat-Like Reflexes (upgrade)
 * - 56007 Hunted (upgrade), skipped (below)
 *
 * **56002.moon-knight-forced-response**: "Forced Response: After Moon Knight enters play, search the encounter deck and
 * discard pile for a minion and put it into play engaged with you. Stun and confuse that minion." Forced, so with a
 * minion to find one is taken; the search ends with a shuffle of the encounter deck whether or not one was found (RRG 1.8
 * "Search", p. 39), the shape of Core's Masters of Mayhem 01133. Question 18 = A (owner, 2026-10-11, provisional): the
 * minion engages, and a quickstrike minion attacks you first if you are in hero form (February 28, 2026 rulings 1 and
 * 4), and is then stunned and confused.
 *
 * **56003.precinct-hq-action**: "Alter-Ego Action: Exhaust Precinct HQ -> remove 1 threat from a scheme. Remove 1
 * additional threat for each minion engaged with you." One removal of 1 + N threat from one scheme; not a thwart.
 *
 * **56004.cats-head-amulet-resource**: "Resource: Exhaust Cat's Head Amulet -> generate a [physical] resource for each
 * minion engaged with you (to a maximum of [physical][physical][physical])." At no engaged minion it generates nothing
 * and may still be used (RRG 1.8 "Resource Ability", p. 37).
 *
 * **56005.sharp-claws-interrupt**: "Interrupt: When you make a basic attack, exhaust Sharp Claws -> Tigra gets +1 ATK
 * for this attack. Choose: this attack gains overkill / piercing." The choice is made as the interrupt resolves.
 *
 * **56006.cat-like-reflexes-interrupt**: "Hero Interrupt: When you would take any amount of damage, discard Cat-Like
 * Reflexes -> prevent 3 of that damage. You may confuse a minion engaged with you." The confusion is optional and is
 * not tied to the damage being prevented.
 *
 * **56007 Hunted** (both refs) waits on box-heroes B8.2 task 1 (B3.1): its additional cost to play searches the
 * encounter deck and discard pile and puts a minion into play. `attachCost` searches only the payer's own piles, no
 * cost puts a card into play, and the upgrade has no data host to attach to.
 */
export const TIGRA_SUPPORT_UPGRADES_ALLIES: AbilityRegistry = defineAbilities({
  "56002.moon-knight-forced-response": forcedResponse(
    after.entersPlay("self"),
    chooseCards("minion", encounterCards(["deck", "discard"], query("minion")), { min: 1, max: 1 }),
    putIntoPlay(chosen("minion"), you),
    stun(chosen("minion")),
    confuse(chosen("minion")),
    shuffleEncounterDeck(),
  ),

  "56003.precinct-hq-action": alterEgoAction(
    { cost: exhaustThis },
    aScheme("scheme"),
    removeThreat(scaled(ENGAGED_MINIONS(), { plus: 1 }), chosen("scheme")),
  ),

  "56004.cats-head-amulet-resource": resource(generatesAmount("physical", ENGAGED_MINIONS(), 3), {
    cost: exhaustThis,
  }),

  "56005.sharp-claws-interrupt": interrupt(
    when.attacks(YOUR_IDENTITY, { basic: true }),
    { cost: exhaustThis },
    modifyStat("atk", 1, yourIdentity, "endOfAttack"),
    chooseOne(
      option("This attack gains overkill", modifyAttack({ keywords: ["overkill"] })),
      option("This attack gains piercing", modifyAttack({ keywords: ["piercing"] })),
    ),
  ),

  "56006.cat-like-reflexes-interrupt": heroInterrupt(
    on.damage(YOUR_IDENTITY),
    { cost: discardThis },
    preventDamage(3),
    chooseTarget("minion", query("minion", { engagedWith: "you" }), { optional: true }),
    confuse(chosen("minion")),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. */
export const TIGRA_SUPPORT_UPGRADES_ALLIES_SKIPPED: Readonly<Record<string, string>> = {
  "56007.hunted-constant":
    "waits on box-heroes B8.2 task 1 (B3.1): an additional cost to play that puts a searched minion into play",
  "56007.hunted-interrupt":
    "waits on box-heroes B8.2 task 1 (B3.1): the upgrade cannot be played, so nothing is attached to defeat",
};
