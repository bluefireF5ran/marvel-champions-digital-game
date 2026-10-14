import type { AbilityRegistry } from "@mc/engine";
import {
  after,
  alterEgoResponse,
  constant,
  declareDefender,
  damageAnEnemy,
  defineAbilities,
  exhaustThis,
  gainKeywordUntil,
  gets,
  giveTough,
  heroInterrupt,
  on,
  query,
  removeCounter,
  response,
  self,
  spend,
  YOUR_HERO,
  YOUR_IDENTITY,
  yourIdentity,
} from "../../../dsl/index.js";
import { DRS_PACK_CARDS } from "../../../wave1/drs/pack-cards.js";
import { MSM_PACK_CARDS } from "../../../wave1/msm/pack-cards.js";
import { ADAM_WARLOCK_PACK_CARDS } from "../../../wave4/mts/adam-warlock-pack-cards.js";
import { ANGEL_EVENTS } from "../../../wave7/angel/events.js";

/** "When an enemy attacks" with no "you": any enemy's attack as it is initiated (Powerful Punch's shape). */
const AN_ENEMY_ATTACKS = on.enemyAttacks(query("enemy"));

/**
 * Wave 10 scripting module `cw/aspect-basic/protection` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (11):
 * - 56041 Patriot (ally)
 * - 56042 Brother Voodoo (ally)
 * - 56043 Hidden Base (support)
 * - 56044 The Night Nurse (support)
 * - 56045 Excelsior (upgrade)
 * - 56046 Defensive Conditioning (upgrade)
 * - 56047 "I Can Do This All Day" (event)
 * - 56048 Taunt (event)
 * - 56049 Tackle (event)
 * - 56050 Cuts Both Ways (event)
 * - 56051 Preservation (resource)
 *
 * **Reprints, aliased** (same printed text as the source card, checked in the tests): Brother Voodoo 56042 (`drs`
 * 09012), The Night Nurse 56044 (09019), Taunt 56048 (`angel` 42016), Tackle 56049 (`msm` 05015), Preservation 56051
 * (`mts` 21064).
 *
 * **56041.patriot-response**: "After you engage a minion" is `minionEngaged` with the controller as the player (the
 * reading Thor's "Have at Thee!" settled). Optional; the tough card goes on Patriot, not the hero.
 *
 * **56043.hidden-base-response**: an alter-ego response, so it answers a change to alter-ego form only (a change to
 * hero form is heard while the identity is a hero, when an alter-ego ability is not live); the tough card goes on your identity.
 *
 * **56045.excelsior-response**: "After your hero defends" (`after.defends`); the 2 damage is not an attack. The
 * energy resource is a cost: with none to spend the response is not offered.
 *
 * **56046.defensive-conditioning-constant**: "You get +3 hit points" (the identity) and "your hero gets +1 DEF"
 * (hero face only), for whichever player controls it (data: play under any player's control, max 1 per player).
 *
 * **56047.i-can-do-this-all-day-interrupt**: when any enemy attacks (not only one against you), declare your
 * identity the defender without exhausting. A redirected attack was not "initiated against you" (ruling of July 9,
 * 2026, Ruling 1), which the engine keeps apart.
 *
 * **56050.cuts-both-ways-interrupt**: retaliate 1 on your identity until the end of the phase (`gainKeywordUntil`).
 */
export const ASPECT_BASIC_PROTECTION: AbilityRegistry = defineAbilities({
  "56041.patriot-response": response({ on: "minionEngaged", playerIs: "controller" }, giveTough(self)),

  "56042.brother-voodoo-response": DRS_PACK_CARDS["09012.brother-voodoo-response"]!,

  "56043.hidden-base-response": alterEgoResponse(
    after.youChangeForm(),
    { cost: [exhaustThis, removeCounter("stronghold")] },
    giveTough(yourIdentity),
  ),

  "56044.the-night-nurse-action": DRS_PACK_CARDS["09019.the-night-nurse-action"]!,

  "56045.excelsior-response": response(after.defends(YOUR_HERO), { cost: spend({ energy: 1 }) }, damageAnEnemy(2)),

  "56046.defensive-conditioning-constant": constant(gets("hp", 3, YOUR_IDENTITY), gets("def", 1, YOUR_HERO)),

  "56047.i-can-do-this-all-day-interrupt": heroInterrupt(
    AN_ENEMY_ATTACKS,
    { label: "defense" },
    declareDefender(yourIdentity),
  ),

  "56048.taunt-action": ANGEL_EVENTS["42016.taunt-action"]!,

  "56049.tackle-action": MSM_PACK_CARDS["05015.tackle-action"]!,

  "56050.cuts-both-ways-interrupt": heroInterrupt(
    AN_ENEMY_ATTACKS,
    { label: "defense" },
    gainKeywordUntil({ name: "retaliate", value: 1 }, yourIdentity, "endOfPhase"),
  ),

  "56051.preservation-response": ADAM_WARLOCK_PACK_CARDS["21064.preservation-response"]!,
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. None. */
export const ASPECT_BASIC_PROTECTION_SKIPPED: Readonly<Record<string, string>> = {};
