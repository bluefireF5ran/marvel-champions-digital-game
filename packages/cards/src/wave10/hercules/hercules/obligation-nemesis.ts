import { trait } from "@mc/content";
import type { AbilityRegistry } from "@mc/engine";
import {
  after,
  alterEgoAction,
  chooseOne,
  chosen,
  constant,
  countOf,
  defineAbilities,
  discard,
  discardEncounterUntil,
  dealEncounterCard,
  each,
  enemyAttack,
  eitherCost,
  eventDamageTaken,
  exhaustYourHero,
  forcedResponse,
  heal,
  ifThen,
  made,
  moveCards,
  cards,
  not,
  on,
  option,
  placeThreat,
  query,
  revealCard,
  self,
  spend,
  spendResources,
  whenRevealed,
  you,
  FRIENDLY_CHARACTER,
} from "../../../dsl/index.js";

const OLYMPUS = trait("OLYMPUS");

/**
 * Wave 10 scripting module `hercules/hercules/obligation-nemesis` (docs/phase7-wave10-hero-packs.md H3.9, H8.4 line
 * HS13).
 *
 * Cards (6):
 * - 59035 Appeal to Athena (obligation)
 * - 59036 Ares (minion)
 * - 59037 Lernean Hydra (minion)
 * - 59038 Olympic Feud (side_scheme)
 * - 59039 Ares's Axe (attachment)
 * - 59040 God of War (treachery)
 *
 * **59035**: given to the Hercules player when revealed (RRG 1.8 "Obligation", p. 30) and it stays in that player's
 * play area, since it prints no When Revealed. "When counting Gift cards you control, you are considered to control
 * none" is read by nothing outside Hercules's kit (H3.9): the shared `giftCardsYouControl` value of his identity module
 * looks for this card in the player's play area, so the constant carries no rule of its own (an empty `constant()`
 * keeps the coverage exact). Its Alter-Ego Action pays "Exhaust Hercules or spend [mental][mental]" (one `eitherCost`:
 * exactly one branch is paid, the player's choice), then removes the obligation from the game.
 *
 * **59036**: "yourself" is the player Ares is engaged with. The response hears every scheme of his, including one that
 * places no threat (SCH 0).
 *
 * **59037** (owner's answer to question 22 = A, 2026-10-11, provisional): "a character you control" is read as the
 * player whose character attacked, so an attack by any player's character that damages the Hydra gives that player
 * the choice, and the Hydra heals 2 damage unless they spend a [physical] resource. An attack that deals no damage
 * triggers nothing. The spend is not offered to a player who cannot pay.
 *
 * **59038**: the starting threat (2) is data; the When Revealed adds one threat for each Olympus card in play. The
 * side scheme itself has no traits, so it is not counted.
 *
 * **59039**: "Attach to Ares. Otherwise, attach to the villain" is data (`attachesTo`) and the +2 ATK is its stat
 * modifier. The Forced Response reads the attack's damage taken by any friendly character (an identity or an ally,
 * any player's): none taken (all defended and prevented, or no attack was made because the attacker was stunned: a stunned attacker is not considered to have
 * attacked, RRG 1.8 "Stun", p. 41) discards the card.
 *
 * **59040**: each minion attacks the player it is engaged with, whatever that player's form (the reminder text);
 * a minion whose attack a stun card replaced did not activate (RRG "Stun", p. 41). With no attack made, the encounter
 * deck is discarded from the top until a minion is discarded and the revealing player reveals that minion.
 */
export const HERCULES_OBLIGATION_NEMESIS: AbilityRegistry = defineAbilities({
  "59035.appeal-to-athena-constant": constant(),
  "59035.appeal-to-athena-action": alterEgoAction(
    { cost: eitherCost(exhaustYourHero, spend({ mental: 2 })) },
    moveCards(cards(self), "removedFromGame"),
  ),

  "59036.ares-forced-response": forcedResponse(on.enemySchemes("self"), dealEncounterCard(you)),

  "59037.lernean-hydra-forced-response": forcedResponse(
    after.attacks(query("character"), { byYou: true, damages: true, target: { self: true } }),
    chooseOne(
      option("Spend a [physical] resource", spendResources({ physical: 1 }, "paid")),
      option("Lernean Hydra heals 2 damage", heal(2, self)),
    ),
  ),

  "59038.when-revealed": whenRevealed(placeThreat(countOf(query([], { trait: OLYMPUS })), self)),

  "59039.aress-axe-forced-response": forcedResponse(
    on.enemyAttacks({ hostOfSelf: true }),
    ifThen(not(eventDamageTaken(each(FRIENDLY_CHARACTER))), discard(self)),
  ),

  // The treachery prints no "When Revealed" label, so the data names the ability a constant; a treachery's text is
  // what resolves when it is revealed (RRG 1.8 "Treachery"), hence whenRevealed.
  "59040.god-of-war-constant": whenRevealed(
    enemyAttack(each(query("minion", { engagedWith: "any" })), { bind: "war" }),
    ifThen(not(made("war")), [discardEncounterUntil(query("minion"), "found"), revealCard(chosen("found"), you)]),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. */
export const HERCULES_OBLIGATION_NEMESIS_SKIPPED: Readonly<Record<string, string>> = {};
