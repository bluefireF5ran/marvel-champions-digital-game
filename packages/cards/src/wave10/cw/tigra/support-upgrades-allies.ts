import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/tigra/support-upgrades-allies` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (6):
 * - 56002 Moon Knight (ally)
 * - 56003 Precinct HQ (support)
 * - 56004 Cat's Head Amulet (upgrade)
 * - 56005 Sharp Claws (upgrade)
 * - 56006 Cat-Like Reflexes (upgrade)
 * - 56007 Hunted (upgrade)
 */
export const TIGRA_SUPPORT_UPGRADES_ALLIES: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const TIGRA_SUPPORT_UPGRADES_ALLIES_SKIPPED: Readonly<Record<string, string>> = {
  "56002.moon-knight-forced-response": "wave 10 scripting in progress: cw/tigra/support-upgrades-allies",
  "56003.precinct-hq-action": "wave 10 scripting in progress: cw/tigra/support-upgrades-allies",
  "56004.cats-head-amulet-resource": "wave 10 scripting in progress: cw/tigra/support-upgrades-allies",
  "56005.sharp-claws-interrupt": "wave 10 scripting in progress: cw/tigra/support-upgrades-allies",
  "56006.cat-like-reflexes-interrupt": "wave 10 scripting in progress: cw/tigra/support-upgrades-allies",
  "56007.hunted-constant": "wave 10 scripting in progress: cw/tigra/support-upgrades-allies",
  "56007.hunted-interrupt": "wave 10 scripting in progress: cw/tigra/support-upgrades-allies",
};
