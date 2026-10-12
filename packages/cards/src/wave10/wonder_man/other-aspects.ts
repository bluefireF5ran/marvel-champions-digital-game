import type { AbilityRegistry } from "@mc/engine";
import {
  FRIENDLY_CHARACTER,
  YOUR_HERO,
  atEndOfAttack,
  basicPowerStatIs,
  cancelConsequentialDamage,
  cards,
  chooseTarget,
  chosen,
  dealDamage,
  defineAbilities,
  discard,
  discardFromHand,
  eventDealt,
  eventSource,
  eventTarget,
  exhaustYourHero,
  forAnIdentityNotInThisGame,
  heroInterrupt,
  host,
  ifThen,
  interrupt,
  modifyBasicPower,
  modifyStat,
  moveCards,
  not,
  on,
  preventDamage,
  printsAbility,
  query,
  searchCollection,
  self,
  setup,
  sharesTraitWithHeroOf,
  statOf,
  when,
  yourIdentity,
} from "../../dsl/index.js";
import { ANGEL_PACK_CARDS } from "../../wave7/angel/pack-cards.js";

/**
 * Wave 10 scripting module `wonder_man/other-aspects` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (7):
 * - 58017 Bombs Away (event)
 * - 58019 Stronger Together (event)
 * - 58020 Unified Strike (event)
 * - 58030 Caught in the Crossfire (upgrade)
 * - 58031 Cameo (support)
 * - 58032 Coordinated Effort (upgrade)
 * - 58033 Disarming Defense (event)
 *
 * **58019.stronger-together-interrupt**: "Hero Interrupt: When a character other than your hero would take any amount of
 * damage, if that character shares a Trait with your hero, reduce that damage by your DEF." Any character on the table
 * (an ally, another player's identity, a minion or the villain) but not your own hero, read when the damage is about to
 * be taken; the trait test is against the printed traits of the hero side of your identity (`sharesTraitWithHeroOf`).
 * The amount is your hero's DEF at that moment, prevented from the damage (never below 0).
 *
 * **58020.unified-strike-interrupt**: "Hero Interrupt: When an ally uses a basic power, exhaust your hero -> add your
 * hero's matching power to that ally's power for this use. That ally does not take consequential damage for this use."
 * Any ally's basic attack or thwart (an ally has no basic defense). "Matching" is the stat powering the use, so a
 * thwart made with ATK adds the hero's ATK (docs/phase7-wave8.md section 4.1 Q54, as Sisterly Bond 43007). The ally
 * takes no consequential damage from this one use (`cancelConsequentialDamage`, as Cosmo).
 *
 * **58030.caught-in-the-crossfire-interrupt**: "Interrupt: When a friendly character attacks, deal 1 damage to attached
 * minion." Any friendly character's attack (every player's identity or ally, a basic attack or an attack ability),
 * whoever it attacks; the 1 damage lands before the attack resolves. The non-Elite attach line and Max 1 per minion
 * are card data.
 *
 * **58033.disarming-defense-interrupt**: "Hero Interrupt (defense): When your hero defends against an attack, it gets +2
 * DEF for that attack. If you take no damage from that attack, discard an attachment on the attacking enemy with the
 * text "Hero Action" or "Hero Response"." The DEF is the shape of Not Today 38016 and Desperate Defense 09015: +2 until
 * the attack ends, and the discard waits for the attack's own result (no damage dealt to the hero), then you choose
 * one of the attacker's attachments that prints one of those two labels (`printsAbility`, as Electromagnetic Blast
 * 49008; a blanked text box does not hide it). It is a discard. With no such attachment nothing happens.
 *
 * **58031.setup**: "Setup. Max 1 per deck. Setup: Search your collection for an identity-specific ally for an identity
 * not in this game. Shuffle that ally into your deck. Discard 2 cards from your hand and remove this card from the game."
 * The setup keyword puts Cameo into play at step 11 and its Setup resolves at step 16, after the mulligan (RRG 1.8
 * Appendix II, p. 51). The collection is the game's card pool (docs/phase7-wave7.md section 4.1 Q47 = A); the ally is
 * one with an identity's set icon whose identity card is not in this game (`forAnIdentityNotInThisGame`; the Wonder Man
 * insert: "an ally that belongs to another identity's set of cards"), and it must still have a copy outside the game,
 * so two players' Cameos cannot find the same one-copy ally. The sentences are not joined by "then": a search that
 * finds nothing (RRG 1.8 "Search", p. 39) still costs the 2 cards, chosen by you, and Cameo. A hand of fewer than 2
 * discards what it holds. The Max 1 per deck line and the dash cost are card data.
 *
 * Rulings on Cameo. March 19, 2026 - Ruling 6: "The deckbuilding uniqueness rule applies only during deck
 * construction. Any unique cards added during Setup (via Cameo, scenario rules, etc.) can share titles with cards in
 * player decks", so the search compares no titles, and the unique rule goes on applying in play (RRG 1.8 "Unique",
 * p. 46). January 26, 2026 - Ruling 2 (Captain Americat on another player's table) and June 2, 2026 - Ruling 1 (a
 * Cameo Jubilee functions "identically") treat the ally as any copy of its card: it is an ordinary instance of the
 * card, with that card's own scripts.
 *
 * **Left unscripted**: 58032 Coordinated Effort (needs the payment rule of H3.19, engine task HT16); see the skip map.
 *
 * No ruling in marvel-champions-rulings-post-rrg-1-7.md (December 17, 2025 to August 13, 2026) names 58019, 58020, 58030
 * or 58033.
 *
 * **Reprints, aliased** to the original's script: 58017 Bombs Away (reprint of 42029 `angel`). Checked in the test.
 */
export const WONDER_MAN_OTHER_ASPECTS: AbilityRegistry = defineAbilities({
  "58017.bombs-away-action": ANGEL_PACK_CARDS["42029.bombs-away-action"]!,

  "58019.stronger-together-interrupt": heroInterrupt(
    when.damage(query("character", { not: YOUR_HERO, ...sharesTraitWithHeroOf() })),
    preventDamage(statOf(yourIdentity, "def")),
  ),

  "58020.unified-strike-interrupt": heroInterrupt(
    on.basicPowerUsing(query("ally"), { power: ["attack", "thwart"] }),
    { cost: exhaustYourHero },
    ifThen(
      basicPowerStatIs("atk"),
      modifyBasicPower(statOf(yourIdentity, "atk")),
      modifyBasicPower(statOf(yourIdentity, "thw")),
    ),
    cancelConsequentialDamage(eventTarget),
  ),

  "58030.caught-in-the-crossfire-interrupt": interrupt(on.attacks(FRIENDLY_CHARACTER), dealDamage(1, host)),

  "58031.setup": setup(
    searchCollection({ categories: ["ally"], ...forAnIdentityNotInThisGame }, "ally"),
    moveCards(cards(chosen("ally")), "deckShuffle"),
    discardFromHand(2),
    moveCards(cards(self), "removedFromGame"),
  ),

  "58033.disarming-defense-interrupt": heroInterrupt(
    when.defends(YOUR_HERO),
    { label: "defense" },
    modifyStat("def", 2, yourIdentity, "endOfAttack"),
    atEndOfAttack(
      ifThen(not(eventDealt("damage")), [
        chooseTarget(
          "attachment",
          query("attachment", { host: eventSource, ...printsAbility(["action", "response"], "hero") }),
        ),
        discard(chosen("attachment")),
      ]),
    ),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const WONDER_MAN_OTHER_ASPECTS_SKIPPED: Readonly<Record<string, string>> = {
  "58032.coordinated-effort-constant":
    "waits on engine task HT16 (docs/phase7-wave10-hero-packs.md H3.19): no RuleSpec lets any player help pay the costs of an ability printed on the attached card (costsPayableByAnyPlayer)",
};
