import type { AbilityDefinition, AbilityRegistry, EffectSpec } from "@mc/engine";
import {
  chooseCards,
  chooseTarget,
  chosen,
  cards,
  defeatingPlayer,
  defineAbilities,
  discard,
  enemyTeamChooses,
  ifThen,
  moveCards,
  placeThreat,
  query,
  selectCards,
  theMainScheme,
  totalPrintedResources,
  whenDefeated,
  whenRevealed,
  you,
  youHaveTrait,
  zone,
} from "../../../dsl/index.js";
import {
  UNREGISTERED,
  UNREGISTERED_SUPER_ACTION,
  UNREGISTERED_SUPER_CONSTANT,
  dealUnregisteredSuperTo,
} from "./cape-killer.js";

/**
 * "Discard 1 card from your hand (at random if you have the Unregistered trait)": the card is bound to slot `card`
 * (nothing when the hand is empty). Shared with Paladin (56117), Bounty Hunting (56115, 56119) and its readers.
 */
export const discardOneFromHand = (): EffectSpec[] => [
  ifThen(
    youHaveTrait(UNREGISTERED),
    selectCards("card", zone("hand", you, { random: 1 })),
    chooseCards("card", zone("hand", you), { min: 1, max: 1 }),
  ),
  moveCards(cards(chosen("card")), "discard"),
];

/**
 * **Bounty Hunting (56115; the same card is 56119 in Paladin's set, docs/phase7-wave10.md section 1.8)**: When
 * Revealed: the discarded card's printed resource icons (a wild icon counts as one) are the threat placed on the main
 * scheme; an empty hand discards nothing and places none. Exported for the Paladin module to register under 56119.
 */
export const BOUNTY_HUNTING: AbilityDefinition = whenRevealed(
  discardOneFromHand(),
  placeThreat(totalPrintedResources(chosen("card")), theMainScheme),
);

const AN_ALLY_YOU_CONTROL = query("ally", { controller: "you" });
const AN_UPGRADE_YOU_CONTROL = query("upgrade", { controller: "you" });

/**
 * Modular encounter set `heroes_for_hire` (Civil War, Registration side; docs/phase7-wave10.md sections 3.5, 3.16 and
 * 3.23). Hinder 1[per_hero] on Heroes for Hire is a data keyword.
 *
 * **Colleen Wing (56112)** and **Shang-Chi (56113)**: When Revealed: you choose an ally (an upgrade) you control, or
 * the first player does for the enemy team when you have the Unregistered trait (owner's answer to question 6 = A);
 * it is discarded. With none, nothing happens.
 *
 * **Unregistered Super (56114)**: the same card as 56106, the one shared definition (see `cape-killer.ts`).
 *
 * **Bounty Hunting (56115)**: see `BOUNTY_HUNTING`.
 *
 * **Heroes for Hire (56116)**: When Defeated: the enemy team deals the defeating player a copy of Unregistered Super.
 *
 * Cards (5):
 * - 56112 Colleen Wing (minion)
 * - 56113 Shang-Chi (minion)
 * - 56114 Unregistered Super (obligation)
 * - 56115 Bounty Hunting (treachery)
 * - 56116 Heroes for Hire (side_scheme)
 */
export const MODULAR_HEROES_FOR_HIRE: AbilityRegistry = defineAbilities({
  "56112.when-revealed": whenRevealed(
    ifThen(
      youHaveTrait(UNREGISTERED),
      chooseTarget("ally", AN_ALLY_YOU_CONTROL, { chooser: enemyTeamChooses }),
      chooseTarget("ally", AN_ALLY_YOU_CONTROL),
    ),
    discard(chosen("ally")),
  ),

  "56113.when-revealed": whenRevealed(
    ifThen(
      youHaveTrait(UNREGISTERED),
      chooseTarget("upgrade", AN_UPGRADE_YOU_CONTROL, { chooser: enemyTeamChooses }),
      chooseTarget("upgrade", AN_UPGRADE_YOU_CONTROL),
    ),
    discard(chosen("upgrade")),
  ),

  "56114.unregistered-super-constant": UNREGISTERED_SUPER_CONSTANT,
  "56114.unregistered-super-action": UNREGISTERED_SUPER_ACTION,

  "56115.when-revealed": BOUNTY_HUNTING,

  "56116.when-defeated": whenDefeated(dealUnregisteredSuperTo(defeatingPlayer)),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_HEROES_FOR_HIRE_SKIPPED: Readonly<Record<string, string>> = {};
