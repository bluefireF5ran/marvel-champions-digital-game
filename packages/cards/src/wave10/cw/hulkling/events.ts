import type { AbilityRegistry } from "@mc/engine";
import { trait } from "@mc/content";
import {
  aScheme,
  attackAnEnemy,
  chooseCards,
  chooseOne,
  chosen,
  cards,
  changeForm,
  defineAbilities,
  heroAction,
  ifThen,
  moveCards,
  option,
  query,
  ready,
  each,
  shuffleDeck,
  thwart,
  threatOn,
  valueAtLeast,
  valueEquals,
  zone,
  you,
} from "../../../dsl/index.js";

const SHAPESHIFT = trait("Shapeshift");

/**
 * Wave 10 scripting module `cw/hulkling/events` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (4):
 * - 56037 Shapeshifter Strike (event)
 * - 56038 Armored Defense (event)
 * - 56039 Impersonation (event)
 * - 56040 Shapeshifter (event)
 *
 * **56037.shapeshifter-strike-action**: "Hero Action (attack): Deal 5 damage to an enemy. Ready your Shapeshift
 * upgrade." The ready is part of the event's own effect, so it comes before the event is played, and the shape's
 * "after you play an event" response is heard afterwards with the shape ready (one shape can answer twice in a turn).
 * With no Shapeshift upgrade in play the ready does nothing.
 *
 * **56038.armored-defense-interrupt**: SKIPPED. "Hero Interrupt (defense): When an enemy attacks, deal damage to it
 * equal to your DEF. After this attack, give Hulkling a tough status card." The intended script is
 * `heroInterrupt(when.enemyAttacks(query("enemy")), { label: "defense" }, dealDamage(statOf(yourIdentity, "def"),
 * eventSource), atEndOfAttack(giveTough(yourIdentity)))`. It works while the attacker survives, but the tough card is
 * lost when the damage defeats the attacker, which the ruling January 11, 2026, Ruling 1 says must still give it.
 * Note B3.11 also says the label's defender takes DEF off the attack; the RRG (pp. 15-16) says the label alone does not,
 * only the basic defense at Declare Defender does, and the engine follows the RRG.
 *
 * **56039.impersonation-action**: "Hero Action (thwart): Remove 4 threat from a scheme. If this removes the last
 * threat from that scheme, you may change to alter-ego form." The last threat is read after the thwart, and only when
 * the scheme had threat to remove. The change is a card effect, not the player's own once-a-round change (RRG 1.8
 * "Form, Change Form", p. 21).
 *
 * **56040.shapeshifter-action**: "Hero Action: Search your deck and discard pile for a Shapeshift upgrade and add it to
 * your hand. (Shuffle.)" The deck is shuffled whether or not an upgrade was found (RRG 1.8 "Search", p. 39).
 */
export const HULKLING_EVENTS: AbilityRegistry = defineAbilities({
  "56037.shapeshifter-strike-action": heroAction(
    { label: "attack" },
    attackAnEnemy(5),
    ready(each(query("upgrade", { controller: "you", trait: SHAPESHIFT }))),
  ),

  "56039.impersonation-action": heroAction(
    { label: "thwart" },
    aScheme("scheme"),
    ifThen(valueAtLeast(threatOn(chosen("scheme")), 1), [
      thwart(4, chosen("scheme")),
      ifThen(valueEquals(threatOn(chosen("scheme")), 0), [
        chooseOne(option("Change to alter-ego form", changeForm(you, "alterEgo")), option("Do not")),
      ]),
    ]),
  ),

  "56040.shapeshifter-action": heroAction(
    chooseCards("found", zone(["deck", "discard"], you, { filter: query("upgrade", { trait: SHAPESHIFT }) }), {
      min: 1,
      max: 1,
    }),
    moveCards(cards(chosen("found")), "hand"),
    shuffleDeck(),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. None. */
export const HULKLING_EVENTS_SKIPPED: Readonly<Record<string, string>> = {
  "56038.armored-defense-interrupt":
    'waits on an engine fix: atEndOfAttack effects are dropped when the attacker leaves play, so "after this attack, give Hulkling a tough status card" is lost when the damage dealt back defeats a minion (ruling January 11, 2026, Ruling 1 requires the tough card); docs/phase7-wave10-box-heroes.md B3.11 / B8.2 task 5',
};
