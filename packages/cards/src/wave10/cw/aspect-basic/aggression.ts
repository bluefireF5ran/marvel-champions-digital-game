import { trait } from "@mc/content";
import type { AbilityRegistry } from "@mc/engine";
import {
  canAttachTo,
  cards,
  chooseCards,
  chooseTarget,
  chosen,
  constant,
  defineAbilities,
  eventTarget,
  exhaustThis,
  gets,
  heroInterrupt,
  interrupt,
  modifyAttack,
  modifyStat,
  moveCards,
  on,
  query,
  removeCounter,
  resolveAttackAgainst,
  response,
  self,
  shuffleDeck,
  when,
  YOUR_HERO,
  YOUR_IDENTITY,
  yourIdentity,
  you,
  zone,
} from "../../../dsl/index.js";
import { SPIDER_WOMAN_KIT } from "../../../wave2/trors/spider-woman-kit.js";
import { DRAX_PACK_CARDS } from "../../../wave3/drax/drax-pack-cards.js";
import { ADAM_WARLOCK_PACK_CARDS } from "../../../wave4/mts/adam-warlock-pack-cards.js";
import { ICEMAN_ASPECT_BASIC } from "../../../wave8/iceman/aspect-basic.js";

/**
 * Wave 10 scripting module `cw/aspect-basic/aggression` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (9):
 * - 56010 Two-Gun Kid (ally)
 * - 56011 Spider-Girl (ally)
 * - 56012 Air Cover (support)
 * - 56013 Aggressive Conditioning (upgrade)
 * - 56014 Suppressing Fire (upgrade)
 * - 56015 "Bring It!" (event)
 * - 56016 Coup de Grace (event)
 * - 56017 Savage Strike (event)
 * - 56018 Audacity (resource)
 *
 * **Reprints, aliased** (same printed text as the source card, checked in the tests): Spider-Girl 56011 (`trors`
 * 04040), Suppressing Fire 56014 (`iceman` 46014), "Bring It!" 56015 (`drax` 19030), Audacity 56018 (`mts` 21046).
 *
 * **56010.two-gun-kid-interrupt**: an interrupt to his own basic attack (`when.attacks("self", { basic: true })`).
 * The second enemy is a pick among the enemies he can attack right now (guard applies, as to Wasp: RRG FAQ "Wasp") other
 * than the one already attacked; the attack is then resolved against it as well (`resolveAttackAgainst`), so each
 * enemy's retaliate answers, and the consequential damage is taken once, for the one attack.
 *
 * **56012.air-cover-response**: after any minion enters play; the search takes the upgrade's own "attach to" text and
 * "Max 1 per minion" against that minion (`canAttachTo(eventTarget)`), and finding nothing is allowed (a search).
 *
 * **56013.aggressive-conditioning-constant**: "You get +3 hit points" (the identity) and "your hero gets +1 ATK", for
 * whichever player controls it (data: play under any player's control, max 1 per player).
 *
 * **56017.savage-strike-interrupt**: +6 ATK and piercing for that one basic attack (Sharp Claws' shape).
 */
export const ASPECT_BASIC_AGGRESSION: AbilityRegistry = defineAbilities({
  "56010.two-gun-kid-interrupt": interrupt(
    when.attacks("self", { basic: true }),
    chooseTarget("second", query("enemy", { attackableBy: self, excluding: eventTarget })),
    resolveAttackAgainst(chosen("second")),
  ),

  "56011.spider-girl-response": SPIDER_WOMAN_KIT["04040.spider-girl-response"]!,

  "56012.air-cover-response": response(
    on.entersPlay(query("minion")),
    { cost: [exhaustThis, removeCounter("fuel")] },
    chooseCards(
      "found",
      zone(["deck", "discard"], you, {
        filter: query("upgrade", { trait: trait("TACTIC"), ...canAttachTo(eventTarget) }),
      }),
      { min: 0, max: 1 },
    ),
    moveCards(cards(chosen("found")), "hand"),
    shuffleDeck(),
  ),

  "56013.aggressive-conditioning-constant": constant(gets("hp", 3, YOUR_IDENTITY), gets("atk", 1, YOUR_HERO)),

  "56014.suppressing-fire-interrupt": ICEMAN_ASPECT_BASIC["46014.suppressing-fire-interrupt"]!,

  "56015.bring-it-action": DRAX_PACK_CARDS["19030.bring-it-action"]!,

  "56017.savage-strike-interrupt": heroInterrupt(
    when.attacks(YOUR_IDENTITY, { basic: true }),
    modifyStat("atk", 6, yourIdentity, "endOfAttack"),
    modifyAttack({ keywords: ["piercing"] }),
  ),

  "56018.audacity-response": ADAM_WARLOCK_PACK_CARDS["21046.audacity-response"]!,
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const ASPECT_BASIC_AGGRESSION_SKIPPED: Readonly<Record<string, string>> = {
  "56016.coup-de-grace-action": "waits on box-heroes B8.2 task 2 (B3.2)",
};
