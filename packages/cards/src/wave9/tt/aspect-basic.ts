import type { AbilityRegistry } from "@mc/engine";
import {
  attacksGainKeywords,
  chooseCards,
  chooseTarget,
  chosen,
  constant,
  defineAbilities,
  each,
  exhaust,
  excludedFromAllyLimit,
  interrupt,
  min,
  modifyBasicPower,
  moveCards,
  cards,
  on,
  printedCostOf,
  query,
  removeThreat,
  response,
  after,
  shuffleDeck,
  varOf,
  you,
  zone,
} from "../../dsl/index.js";

/** "Does not count against your ally limit." Each of the four prints it after "Linked ([title] minion). Victory 0." */
const NOT_COUNTED = () => constant(excludedFromAllyLimit(query("ally", { self: true })));

/**
 * The four linked allies of Trickster Magic (`tt` 55063 to 55066; docs/phase7-wave9.md sections 3.57, 3.70, 3.71 and 8.4
 * item 65). "Linked ([title] minion)" and "Victory 0" are data: the engine sets each ally aside at setup when its
 * minion (55056 to 55059) is in the game, and the minion's When Defeated puts it into play under the defeating player
 * (`tt/trickster-magic`). None is ever in a deck. "Does not count against your ally limit" is the first ref of each.
 *
 * Absorbing Man (55063): Interrupt, when he attacks or thwarts (his basic power), exhaust an upgrade or support
 *   you control; he gets +X to that power for this use, X that card's printed cost, to a maximum of +3. The exhaust is
 *   an effect, not a cost: with nothing ready to exhaust he gets +0 and still acts.
 * Titania (55064): her attacks gain overkill and piercing.
 * Whirlwind (55065): Interrupt, when he attacks, remove 1 threat from each scheme in play; +1 ATK for that attack
 *   for each threat removed this way.
 * Zzzax (55066): Response, after he enters play, search the top 5 cards of your deck for a card with a printed
 *   energy resource, add it to your hand, and shuffle.
 *
 * Cards (4):
 * - 55063 Absorbing Man (ally)
 * - 55064 Titania (ally)
 * - 55065 Whirlwind (ally)
 * - 55066 Zzzax (ally)
 */
export const TT_ASPECT_BASIC: AbilityRegistry = defineAbilities({
  "55063.absorbing-man-constant": NOT_COUNTED(),
  "55063.absorbing-man-interrupt": interrupt(
    on.basicPowerUsing("self", { power: ["attack", "thwart"] }),
    chooseTarget("fuel", query(["upgrade", "support"], { controller: "you", exhausted: false })),
    exhaust(chosen("fuel")),
    modifyBasicPower(min(printedCostOf(chosen("fuel")), 3)),
  ),

  "55064.titania-constant": NOT_COUNTED(),
  "55064.titania-constant-2": constant(attacksGainKeywords(["overkill", "piercing"], { attacker: { self: true } })),

  "55065.whirlwind-constant": NOT_COUNTED(),
  "55065.whirlwind-interrupt": interrupt(
    on.basicPowerUsing("self", { power: "attack" }),
    removeThreat(1, each(query("scheme")), { bind: "removed" }),
    modifyBasicPower(varOf("removed.amount")),
  ),

  "55066.zzzax-constant": NOT_COUNTED(),
  "55066.zzzax-response": response(
    after.entersPlay("self"),
    chooseCards("found", zone("deck", you, { top: 5, filter: query([], { printedResource: "energy" }) }), {
      min: 1,
      max: 1,
    }),
    moveCards(cards(chosen("found")), "hand"),
    shuffleDeck(),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. */
export const TT_ASPECT_BASIC_SKIPPED: Readonly<Record<string, string>> = {};
