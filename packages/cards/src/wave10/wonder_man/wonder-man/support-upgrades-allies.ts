import type { AbilityRegistry } from "@mc/engine";
import {
  YOUR_HERO,
  alterEgoAction,
  cards,
  changeForm,
  chooseCards,
  chooseOne,
  chosen,
  defineAbilities,
  discardTuckedCost,
  draw,
  exhaustThis,
  forcedInterrupt,
  heroResource,
  ifThen,
  instead,
  moveCards,
  named,
  option,
  query,
  repeatTimes,
  response,
  self,
  setRemainingHitPoints,
  tuckCards,
  tuckedCount,
  tuckedUnder,
  valueAtLeast,
  valueAtMost,
  when,
  after,
  yourIdentity,
  zone,
} from "../../../dsl/index.js";

const IONIC_PHYSIOLOGY = named("Ionic Physiology");
/** "An event with a printed [energy] resource": the printed icon, a wild icon is not energy (RRG 1.8 "Printed", p. 35). */
/** Room for one more tuck under Ionic Physiology ("Max 3 cards tucked here"); an option that tucks is not offered without it. */
const HAS_ROOM = valueAtMost(tuckedCount(IONIC_PHYSIOLOGY), 2);
const ENERGY_EVENT = query("event", { printedResource: "energy" });
/** "An event or resource card with a printed [energy] resource". */
const ENERGY_EVENT_OR_RESOURCE = query(["event", "resource"], { printedResource: "energy" });

/**
 * Wave 10 scripting module `wonder_man/wonder-man/support-upgrades-allies` (docs/phase7-wave10-hero-packs.md H3.12,
 * H8.4 line HS3).
 *
 * Cards (5):
 * - 58007 Wonder Fans (support)
 * - 58008 Jet Belt (upgrade)
 * - 58009 Mr. Hollywood (upgrade), skipped: waits on engine task HT11
 * - 58010 Signature Sunglasses (upgrade)
 * - 58011 "What Are You?" (upgrade)
 *
 * No ruling since RRG 1.7 names these cards. Every tuck goes under Ionic Physiology (`named`, as the identity module
 * reads it), whose "Max 3 cards tucked here" refuses a tuck beyond three (docs/phase7-wave10-hero-packs.md H3.12). An
 * option that tucks is offered only while Ionic Physiology has room, and an option that takes a tucked card only while
 * one is there (`when:`). Known gap: the DSL has no predicate for "the discard pile holds a matching card", so a tuck
 * option is still offered with no eligible card in the discard pile and then resolves nothing; a zone-reading predicate
 * would close it.
 *
 * **58007.wonder-fans-action**: "Alter-Ego Action: Exhaust Wonder Fans -> choose: tuck 1 event with a printed [energy]
 * resource from your discard pile under Ionic Physiology; or draw 1 card." The exhaust is the cost, so the choice is
 * made once it is paid; the drawing option is always there.
 *
 * **58008.jet-belt-resource**: "Hero Resource: Exhaust Jet Belt -> generate a [energy] resource for an event." Only an
 * event may be paid for with it. **58008.jet-belt-hero-resource**: "Hero Resource: Exhaust Jet Belt and discard a card
 * tucked under Ionic Physiology -> generate a [energy] resource." For any card; the discarded tucked card is part of the
 * cost, so the ability is not offered with nothing tucked, and the bonus ATK of Wonder Man shrinks at once.
 *
 * **58010.signature-sunglasses-response**: "Response: After you change form, choose: tuck an event or resource card with
 * a printed [energy] resource from your discard pile under Ionic Physiology; or add a card tucked under Ionic
 * Physiology to your hand." A plain Response heard after either change of form (RRG 1.8 "Form, Change Form", p. 21).
 * Printed resource means the bottom-left icon (RRG 1.8 "Printed", p. 35), so a wild icon is not energy.
 *
 * **58011.what-are-you-forced-interrupt**: "Forced Interrupt: When Wonder Man would be defeated, instead set his hit
 * point dial to 4 and change him to alter-ego form. You may tuck events with a printed [energy] resource from your
 * discard pile under Ionic Physiology until there are 3 cards tucked there. Remove this card from the game." A
 * replacement (RRG 1.8 "'Would'", p. 48; "Replacement Effect", p. 37); hero form only, since the card names Wonder
 * Man. The tucking is up to three passes, each an optional pick, run only while there is room (a pass with the
 * limit already reached is skipped), and the card removes itself last, whatever was tucked.
 */
export const WONDER_MAN_SUPPORT_UPGRADES_ALLIES: AbilityRegistry = defineAbilities({
  "58007.wonder-fans-action": alterEgoAction(
    { cost: exhaustThis },
    chooseOne(
      option(
        "Tuck 1 event with a printed energy resource from your discard pile under Ionic Physiology",
        { when: HAS_ROOM },
        chooseCards("tuck", zone("discard", undefined, { filter: ENERGY_EVENT }), { min: 1, max: 1 }),
        tuckCards(cards(chosen("tuck")), IONIC_PHYSIOLOGY),
      ),
      option("Draw 1 card", draw(1)),
    ),
  ),

  "58008.jet-belt-resource": heroResource({ energy: 1 }, { cost: exhaustThis, generatesFor: query("event") }),
  "58008.jet-belt-hero-resource": heroResource(
    { energy: 1 },
    { cost: [exhaustThis, discardTuckedCost(IONIC_PHYSIOLOGY)] },
  ),

  "58010.signature-sunglasses-response": response(
    after.youChangeForm(),
    chooseOne(
      option(
        "Tuck an event or resource with a printed energy resource from your discard pile under Ionic Physiology",
        { when: HAS_ROOM },
        chooseCards("tuck", zone("discard", undefined, { filter: ENERGY_EVENT_OR_RESOURCE }), { min: 1, max: 1 }),
        tuckCards(cards(chosen("tuck")), IONIC_PHYSIOLOGY),
      ),
      option(
        "Add a card tucked under Ionic Physiology to your hand",
        { when: valueAtLeast(tuckedCount(IONIC_PHYSIOLOGY), 1) },
        chooseCards("take", tuckedUnder(IONIC_PHYSIOLOGY), { min: 1, max: 1 }),
        moveCards(cards(chosen("take")), "hand"),
      ),
    ),
  ),

  "58011.what-are-you-forced-interrupt": forcedInterrupt(
    when.defeated(YOUR_HERO),
    { would: true },
    instead(
      setRemainingHitPoints(4, yourIdentity),
      changeForm(undefined, "alterEgo"),
      repeatTimes(
        3,
        ifThen(HAS_ROOM, [
          chooseCards("tuck", zone("discard", undefined, { filter: ENERGY_EVENT }), { min: 0, max: 1 }),
          tuckCards(cards(chosen("tuck")), IONIC_PHYSIOLOGY),
        ]),
      ),
      moveCards(cards(self), "removedFromGame"),
    ),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. */
export const WONDER_MAN_SUPPORT_UPGRADES_ALLIES_SKIPPED: Readonly<Record<string, string>> = {
  "58009.mr-hollywood-resource":
    "waits on engine task HT11 (a resource that can only be overpaid), docs/phase7-wave10-hero-packs.md H3.14",
};
