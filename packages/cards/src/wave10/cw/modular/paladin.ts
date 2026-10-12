import type { AbilityRegistry } from "@mc/engine";
import {
  atEndOfAttack,
  constant,
  defineAbilities,
  discard,
  forcedInterrupt,
  gainsTrait,
  modifyAttack,
  on,
  query,
  self,
  whenRevealed,
} from "../../../dsl/index.js";
import { UNREGISTERED } from "./cape-killer.js";
import { BOUNTY_HUNTING, discardOneFromHand } from "./heroes-for-hire.js";

/**
 * Modular encounter set `paladin` (Civil War, Registration side; docs/phase7-wave10.md sections 3.16 and 3.23).
 * Quickstrike and Toughness on Paladin and Hinder 1[per_hero] on Government Contractor are data keywords.
 *
 * **Paladin (56117)**: When Revealed: discard 1 card from your hand, at random if you have the Unregistered trait.
 *
 * **Paladin's Pistol (56118)**: "Attach to Paladin. Otherwise, attach to the enemy leader." and its +2 ATK are card
 * data (an `ifAble` host); the ref scripts only the Forced Interrupt: when the attached character attacks, that
 * attack gains ranged and overkill, and this card is discarded at the end of that attack.
 *
 * **Bounty Hunting (56119)**: the same card as 56115, the one shared definition (see `heroes-for-hire.ts`).
 *
 * **Government Contractor (56120)**: while it is in play every identity has the Unregistered trait (the grant the
 * main scheme Hunting Rebel Heroes hears when this card is revealed, docs/phase7-wave10.md section 3.16).
 *
 * Cards (4):
 * - 56117 Paladin (minion)
 * - 56118 Paladin's Pistol (attachment)
 * - 56119 Bounty Hunting (treachery)
 * - 56120 Government Contractor (side_scheme)
 */
export const MODULAR_PALADIN: AbilityRegistry = defineAbilities({
  "56117.when-revealed": whenRevealed(discardOneFromHand()),

  "56118.paladins-pistol-forced-interrupt": forcedInterrupt(
    on.enemyAttacks("host"),
    modifyAttack({ keywords: ["ranged", "overkill"] }),
    atEndOfAttack(discard(self)),
  ),

  "56119.when-revealed": BOUNTY_HUNTING,

  "56120.government-contractor-constant": constant(gainsTrait(UNREGISTERED, query("identity"))),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_PALADIN_SKIPPED: Readonly<Record<string, string>> = {};
