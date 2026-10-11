import type { AbilityRegistry, TargetQuery } from "@mc/engine";
import {
  activationIs,
  alterEgoAction,
  cannotAttach,
  chosen,
  constant,
  countOf,
  dealIndirectDamage,
  defeatingPlayer,
  defineAbilities,
  discard,
  each,
  exhaustCardsCost,
  exists,
  firstPlayer,
  forcedResponse,
  gainsKeyword,
  gainsKeywordX,
  gets,
  ifThen,
  inMode,
  modifyAttack,
  moveCards,
  on,
  perHero,
  playerOrElse,
  printedCostOf,
  putLinkedAllyIntoPlay,
  query,
  rule,
  self,
  spend,
  superlative,
  surge,
  totalPrintedResources,
  whenDefeated,
  whenRevealed,
  boost,
  attacksGainKeywords,
  you,
  zone,
} from "../../dsl/index.js";

/** "The cards you control" that print a cost: allies, supports and upgrades in play. */
const CARDS_YOU_CONTROL: TargetQuery = { categories: ["ally", "support", "upgrade"], controller: "you" };

/**
 * "When Defeated: The player who defeated this minion puts the set-aside [title] ally into play under their control."
 * (MC55 p. 4.) When no player defeated the minion (an encounter card's damage) the first player does it, by MC55 p. 23:
 * "If an encounter card requires a card ability to be resolved, a game function to be performed, or a choice to be
 * made but does not specify which player should act, the first player does so." Flagged in docs/phase7-wave9.md
 * section 4.2: the spec's plan says the first player "decides who takes it"; this takes the plain reading, the first
 * player takes it.
 */
const LINKED_ALLY_TAKEN = () => whenDefeated(putLinkedAllyIntoPlay(playerOrElse(defeatingPlayer, firstPlayer)));

/**
 * Modular encounter set `trickster_magic` (Trickster Takeover; docs/phase7-wave9.md sections 3.57, 3.71 and 8.4 item
 * 64). Keywords (Guard, Steady, Quickstrike, Retaliate 1, Victory 1) and the numbers are data.
 *
 * **The four minions (55056 to 55059)** each end with the same When Defeated: the player who defeated the minion puts
 * the set-aside ally of that title into play under their control (`putLinkedAllyIntoPlay`; the engine sets the four
 * allies aside at setup when the set is in the game, `packages/engine/src/linked.ts`).
 *
 * Absorbing Man: while engaged with you, +X ATK, X the printed cost of the highest-cost card you control
 *   (an ally, support or upgrade in play; with none, +0; a tie is one cost either way).
 * Titania: her attacks gain overkill.
 * Whirlwind: Forced Response, after he attacks you, you take 1 indirect damage for each side scheme in play.
 * Zzzax: When Revealed, discard the top 4 cards of your deck and take 1 indirect damage for each printed energy
 *   resource among them.
 *
 * The Trickster Tango (55060): the villain gains stalwart; Boost: an attack gains overkill.
 * Puppet Master (55061): in expert mode it gains hinder 1 per hero; allies cannot thwart it or defend against the
 * villain's attacks. **Love Triangle (55062)**: attaches to an ally you control, else it gains surge; the attached ally
 * cannot attack the villain or defend against its attacks; Alter-Ego Action: exhaust the ally and spend a mental
 * resource to discard it.
 *
 * Cards (7):
 * - 55056 Absorbing Man (minion)
 * - 55057 Titania (minion)
 * - 55058 Whirlwind (minion)
 * - 55059 Zzzax (minion)
 * - 55060 The Trickster Tango (side_scheme)
 * - 55061 Puppet Master (side_scheme)
 * - 55062 Love Triangle (attachment)
 */
export const TRICKSTER_MAGIC: AbilityRegistry = defineAbilities({
  "55056.absorbing-man-constant": constant(
    gets(
      "atk",
      printedCostOf(
        superlative("highest", each(CARDS_YOU_CONTROL), printedCostOf(chosen("candidate")), { ties: "first" }),
      ),
      { self: true },
      { while: exists(query("minion", { self: true, engagedWithPlayer: you })) },
    ),
  ),
  "55056.when-defeated": LINKED_ALLY_TAKEN(),

  "55057.titania-constant": constant(attacksGainKeywords(["overkill"], { attacker: { self: true } })),
  "55057.when-defeated": LINKED_ALLY_TAKEN(),

  "55058.whirlwind-forced-response": forcedResponse(
    on.enemyAttacks("self", { againstYou: true }),
    dealIndirectDamage(you, countOf(query("sideScheme"))),
  ),
  "55058.when-defeated": LINKED_ALLY_TAKEN(),

  "55059.when-revealed": whenRevealed(
    moveCards(zone("deck", you, { top: 4 }), "discard", "discarded"),
    dealIndirectDamage(you, totalPrintedResources(chosen("discarded"), ["energy"])),
  ),
  // The Zzzax ally has no subtitle, so it matches the Zzzax minion (RRG 1.8 "Unique Icon", pp. 45-46), which is still
  // in play while this resolves (p. 48). The engine does not hold the card a linked keyword names against the linked
  // card its own ability brings in (`packages/engine/src/linked-unique.test.ts`): the card's evident purpose, no ruling.
  "55059.when-defeated": LINKED_ALLY_TAKEN(),

  "55060.the-trickster-tango-constant": constant(gainsKeyword({ name: "stalwart" }, query("villain"))),
  "55060.boost": boost(ifThen(activationIs("attack"), modifyAttack({ overkill: true }))),

  "55061.puppet-master-constant": constant(
    gainsKeywordX("hinder", perHero(1), { self: true }, { while: inMode("expert") }),
  ),
  "55061.puppet-master-constant-2": constant(
    rule({ kind: "cannotThwart", thwarter: query("ally"), schemes: { self: true } }),
    rule({ kind: "cannotDefend", target: query("ally"), attacker: query("villain") }),
  ),

  // "Attach to an ally you control" is data (`attachesTo`); "Otherwise, this card gains surge" is the cannot-attach text.
  "55062.love-triangle-constant": cannotAttach(surge()),
  "55062.love-triangle-constant-2": constant(
    rule({ kind: "cannotAttack", attacker: { hostOfSelf: true }, target: query("villain") }),
    rule({ kind: "cannotDefend", target: { hostOfSelf: true }, attacker: query("villain") }),
  ),
  "55062.love-triangle-action": alterEgoAction(
    { cost: [exhaustCardsCost(query("ally", { hostOfSelf: true })), spend({ mental: 1 })] },
    discard(self),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason: none. */
export const TRICKSTER_MAGIC_SKIPPED: Readonly<Record<string, string>> = {};
