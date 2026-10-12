import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/modular/paladin` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (4):
 * - 56117 Paladin (minion)
 * - 56118 Paladin's Pistol (attachment)
 * - 56119 Bounty Hunting (treachery)
 * - 56120 Government Contractor (side_scheme)
 */
export const MODULAR_PALADIN: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_PALADIN_SKIPPED: Readonly<Record<string, string>> = {
  "56117.when-revealed": "wave 10 scripting in progress: cw/modular/paladin",
  "56118.paladins-pistol-forced-interrupt": "wave 10 scripting in progress: cw/modular/paladin",
  "56119.when-revealed": "wave 10 scripting in progress: cw/modular/paladin",
  "56120.government-contractor-constant": "wave 10 scripting in progress: cw/modular/paladin",
};
