import { trait } from "@mc/content";
import type { AbilityRegistry } from "@mc/engine";
import { obligation } from "../../../core/obligations.js";
import {
  adjustBoostCount,
  after,
  attachCard,
  boost,
  constant,
  defineAbilities,
  discard,
  each,
  enemyActivates,
  exists,
  find,
  forcedResponse,
  heroResponse,
  ifThen,
  named,
  not,
  placeThreat,
  query,
  revealCard,
  rule,
  self,
  spend,
  surge,
  theVillain,
  varAtLeast,
  whenRevealed,
  you,
} from "../../../dsl/index.js";

const CRIMINAL = trait("CRIMINAL");
const UNDERWORLD = "Criminal Underworld";
const UNDERWORLD_IN_PLAY = query("sideScheme", { name: UNDERWORLD });
const THE_HOOD_IN_PLAY = query("minion", { name: "The Hood" });
const ENGAGED_WITH_YOU = each(query("minion", { engagedWith: "you" }));

/**
 * Wave 10 scripting module `cw/tigra/obligation-nemesis` (docs/phase7-wave10.md section 8.4,
 * docs/phase7-wave10-box-heroes.md B3.14, B3.15).
 *
 * Cards (6):
 * - 56023 In Too Deep (obligation)
 * - 56024 The Hood (minion)
 * - 56025 Criminal Underworld (side_scheme)
 * - 56026 The Hood's Mantle (attachment)
 * - 56027 Madame Masque (minion)
 * - 56028 Jigsaw (minion)
 *
 * **56023.obligation**: the Core obligation frame (`core/obligations.ts`): the flip is optional, then the player
 * chooses between exhausting Greer Nelson to remove the card and the second option, whose discard comes last. "Each
 * minion engaged with you activates against you" is one `enemyActivates`; the player orders the activations (RRG 1.8
 * "Activation", p. 6). A minion whose attack a stunned card replaced, or whose scheme a confused card replaced, did not
 * activate (RRG "Stun", p. 41), so `activated.made` counts only real activations and the card gains surge when it is 0.
 *
 * **56024.the-hood-forced-response**, **56028.jigsaw-forced-response**: the threat goes on Criminal Underworld when it
 * is in play; with it out of play there is nothing to place on. Jigsaw's needs the attack to have damaged a character.
 *
 * **56025.criminal-underworld-constant**: every Criminal minion, whatever its set, cannot take damage; an attack on
 * one is still an attack.
 *
 * **56026**: "Attach to The Hood. Otherwise, attach to the villain" is data (`attachesTo`); the boost attaches the card
 * the same way. The Hero Response is Citizen V's Sword's shape (`aos` 50132): the attacker is the responding player's
 * own identity, here a basic attack, and one energy and one physical resource are spent.
 *
 * **56027**: "Otherwise" is read as "Criminal Underworld is not in play" (B3.14): the When Revealed places the threat or
 * finds the side scheme (set aside, deck or discard) and reveals it; the boost places it or adds two boost icons to
 * the card for this count. The data carries the corrected text ("Underworld").
 */
export const TIGRA_OBLIGATION_NEMESIS: AbilityRegistry = defineAbilities({
  "56023.obligation": obligation("Greer Nelson", {
    label:
      "Each minion engaged with you activates against you. If no minions activate this way, In Too Deep gains surge",
    effects: [
      enemyActivates(ENGAGED_WITH_YOU, { against: you, bind: "activated" }),
      ifThen(not(varAtLeast("activated.made")), surge()),
    ],
  }),

  "56024.the-hood-forced-response": forcedResponse(
    after.enemyAttacks("self"),
    ifThen(exists(UNDERWORLD_IN_PLAY), placeThreat(1, named(UNDERWORLD))),
  ),

  "56025.criminal-underworld-constant": constant(
    rule({ kind: "cannotTakeDamage", target: query("minion", { trait: CRIMINAL }) }),
  ),

  "56026.the-hoods-mantle-response": heroResponse(
    after.attacks(query("identity"), { byYou: true, basic: true, target: { hostOfSelf: true } }),
    { cost: spend({ energy: 1, physical: 1 }) },
    discard(self),
  ),
  "56026.boost": boost(
    ifThen(exists(THE_HOOD_IN_PLAY), attachCard(self, named("The Hood")), attachCard(self, theVillain)),
  ),

  "56027.when-revealed": whenRevealed(
    ifThen(
      exists(UNDERWORLD_IN_PLAY),
      placeThreat(2, named(UNDERWORLD)),
      revealCard(find(query("sideScheme", { name: UNDERWORLD })), you),
    ),
  ),
  "56027.boost": boost(ifThen(exists(UNDERWORLD_IN_PLAY), placeThreat(2, named(UNDERWORLD)), adjustBoostCount(2))),

  "56028.jigsaw-forced-response": forcedResponse(
    after.enemyAttacks("self", { damages: true }),
    ifThen(exists(UNDERWORLD_IN_PLAY), placeThreat(2, named(UNDERWORLD))),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. None. */
export const TIGRA_OBLIGATION_NEMESIS_SKIPPED: Readonly<Record<string, string>> = {};
