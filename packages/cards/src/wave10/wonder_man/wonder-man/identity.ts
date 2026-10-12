import type { AbilityRegistry } from "@mc/engine";
import {
  after,
  andThen,
  cards,
  constant,
  defineAbilities,
  eventTarget,
  forcedResponse,
  gets,
  heal,
  moveCards,
  named,
  putIntoPlayFromSetAside,
  query,
  response,
  self,
  setup,
  tuckCards,
  tuckLimit,
  tuckedCount,
  tuckedUnderRef,
  yourIdentity,
} from "../../../dsl/index.js";

const IONIC_PHYSIOLOGY = named("Ionic Physiology");

/**
 * Wave 10 scripting module `wonder_man/wonder-man/identity` (docs/phase7-wave10-hero-packs.md H2, H3.12, H3.15, H8.4
 * line HS1).
 *
 * Cards (2):
 * - 58001a Wonder Man (hero_identity)
 * - 58002 Ionic Physiology (upgrade)
 *
 * The identity card's other face is 58001b Simon Williams (alter ego).
 *
 * **58001a.wonder-man-constant** (hero face): "Wonder Man gets +1 ATK for each card tucked under Ionic Physiology." The
 * count is read live from the card by name, so it is 0 with nothing tucked and follows every tuck and discard.
 *
 * **58001a.wonder-man-forced-response** (hero face): "Forced Response: After Wonder Man makes a basic attack, discard
 * each card tucked under Ionic Physiology." `basicPowerUsed` narrowed to the attack power: an event's attack is not a
 * basic attack and leaves the tucked cards where they are. Forced, so the bonus ends whether he likes it or not. March 6,
 * 2026 - Ruling 4 puts it last (step 6): Ionic Physiology tucks the event played during the attack (step 3), that
 * event's ATK adjusts the attack (step 2) and its tucked card is discarded with the rest after the attack.
 *
 * **58001b.simon-williams-constant** (alter-ego face): "You may include events with a printed [energy] resource icon
 * from any aspect in your deck." Deck building, carried by the card data (`deckbuilding.offAspectAllowance`) and
 * enforced by `validateDeck` (proved in `wave10/wonder-man-deck.test.ts`); the ref is an empty constant, as for
 * `56084.life-model-decoy-constant`.
 *
 * **58001b.setup**: "Setup: Put Ionic Physiology into play." Permanent, so it was set aside before setup step 1 (RRG
 * 1.8 "Permanent", p. 32) and is taken from there, attached to Wonder Man.
 *
 * **58002.ionic-physiology-constant**: "Max 3 cards tucked here." A tuck beyond three is refused (the engine's
 * `tuckLimit`).
 *
 * **58002.ionic-physiology-response**: "Response: After you play an event with a printed [energy] resource, tuck that
 * event from your discard pile under this card. Then, heal 1 damage from your identity." Errata (RRG 1.8 p. 70; March
 * 6, 2026 - Ruling 3 (1)): the cost arrow became "Then", so he may tuck at full hit points; the heal follows the tuck
 * only (RRG 1.8 "'Then'", p. 44). Plain "Response", so optional and heard in either form. A "printed energy resource" is
 * the event's own printed icon: a wild icon is not energy (RRG 1.8 "Printed", p. 35), and the resources that paid for
 * the event are never read (January 17, 2026 - Ruling 4 (1) lets a wild resource be energy for a card that reads the
 * resource spent, which is not this).
 */
export const WONDER_MAN_IDENTITY: AbilityRegistry = defineAbilities({
  "58001a.wonder-man-constant": constant(gets("atk", tuckedCount(IONIC_PHYSIOLOGY), { self: true })),
  "58001a.wonder-man-forced-response": forcedResponse(
    { ...after.basicPowerUsed("self"), eventIs: { power: "attack" } },
    moveCards(cards(tuckedUnderRef(IONIC_PHYSIOLOGY)), "discard"),
  ),

  "58001b.simon-williams-constant": constant(),
  "58001b.setup": setup(
    putIntoPlayFromSetAside("physiology", query("upgrade", { name: "Ionic Physiology" }), { attachTo: yourIdentity }),
  ),

  "58002.ionic-physiology-constant": constant(tuckLimit(3)),
  "58002.ionic-physiology-response": response(
    after.youPlayedCard(query("event", { printedResource: "energy" })),
    tuckCards(cards(eventTarget), self),
    andThen(heal(1, yourIdentity)),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. None. */
export const WONDER_MAN_IDENTITY_SKIPPED: Readonly<Record<string, string>> = {};
