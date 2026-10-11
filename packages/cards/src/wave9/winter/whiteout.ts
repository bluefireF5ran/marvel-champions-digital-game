import type { AbilityRegistry } from "@mc/engine";
import {
  attachCard,
  attackableAsMinion,
  boost,
  chosen,
  constant,
  damageOn,
  dealDamage,
  defineAbilities,
  discard,
  encounterCards,
  enemyActivates,
  eventTarget,
  exhaust,
  find,
  forcedResponse,
  hasStatus,
  host,
  ifThen,
  named,
  not,
  on,
  oneCopyOf,
  query,
  refCount,
  revealCard,
  rule,
  selectCards,
  self,
  shuffleEncounterDeck,
  stateCheck,
  stun,
  sum,
  surge,
  takeDamage,
  valueAtLeast,
  varAtLeast,
  whenRevealed,
  you,
  yourIdentity,
} from "../../dsl/index.js";

const BLIZZARD = "Blizzard";

/**
 * Wave 9 scripting module `winter/whiteout` (docs/phase7-wave9.md sections 3.50, 7.12, 8.4): the Whiteout encounter
 * set, an Elite Thunderbolt set whose minion joins the Thunderbolts pool. Villainous and Victory 1 on Blizzard are data.
 *
 * **Blizzard (54034)**: Forced Response after he attacks a character: the first Encased in Ice found in the encounter
 * deck or discard pile attaches to the attacked character (the defending ally when one defended), otherwise that
 * character is stunned. The deck is shuffled either way ("(Shuffle.)"); no stun when a copy was found but could not be
 * attached.
 *
 * **Encased in Ice (54035)**: the attached character cannot attack any enemy but this card (`self: false` in the
 * target query is load-bearing: without it the host could not attack the ice); any player can attack the card as if it
 * were a minion (damage is placed on it, it is never defeated); a state check at 3 or more damage deals all but 3 to
 * the host (as moved damage, RRG "Move" p. 30) and discards the card.
 *
 * **Slippery Conditions (54036)**: Forced Response after an ally enters play: exhaust it.
 *
 * **Whiteout (54037)**: finds and reveals Blizzard (engaging the revealing player when already in play), who
 * activates against that player; surge when no enemy activated. Boost: the revealing player is stunned; when already
 * stunned, 1 damage.
 *
 * Cards (4):
 * - 54034 Blizzard (minion)
 * - 54035 Encased in Ice (attachment)
 * - 54036 Slippery Conditions (side_scheme)
 * - 54037 Whiteout (treachery)
 */
export const WHITEOUT: AbilityRegistry = defineAbilities({
  "54034.blizzard-forced-response": forcedResponse(
    on.enemyAttacks("self"),
    selectCards("found", oneCopyOf(encounterCards(["deck", "discard"], { name: "Encased in Ice" }))),
    ifThen(valueAtLeast(refCount(chosen("found")), 1), attachCard(chosen("found"), eventTarget), stun(eventTarget)),
    shuffleEncounterDeck(),
  ),

  "54035.encased-in-ice-constant": constant(
    rule({ kind: "cannotAttack", attacker: { hostOfSelf: true }, target: query("enemy", { self: false }) }),
    attackableAsMinion(),
  ),
  "54035.encased-in-ice-constant-2": stateCheck(
    valueAtLeast(damageOn(self), 3),
    dealDamage(sum(damageOn(self), -3), host),
    discard(self),
  ),

  "54036.slippery-conditions-forced-response": forcedResponse(on.entersPlay(query("ally")), exhaust(eventTarget)),

  "54037.when-revealed": whenRevealed(
    revealCard(find(query("minion", { name: BLIZZARD })), you),
    enemyActivates(named(BLIZZARD), { against: you, bind: "activated" }),
    ifThen(not(varAtLeast("activated.made")), surge()),
  ),
  "54037.boost": boost(ifThen(hasStatus(yourIdentity, "stunned"), takeDamage(1), stun(yourIdentity))),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. */
export const WHITEOUT_SKIPPED: Readonly<Record<string, string>> = {};
