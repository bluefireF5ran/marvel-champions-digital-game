import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/hulkling/support-upgrades-allies` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (7):
 * - 56030 Wiccan (ally)
 * - 56031 Altman Residence (support)
 * - 56032 Winged Shape (upgrade)
 * - 56033 Hulk Shape (upgrade)
 * - 56034 Armored Shape (upgrade)
 * - 56035 Imitation Shape (upgrade)
 * - 56036 Alien Physiology (upgrade)
 */
export const HULKLING_SUPPORT_UPGRADES_ALLIES: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const HULKLING_SUPPORT_UPGRADES_ALLIES_SKIPPED: Readonly<Record<string, string>> = {
  "56030.wiccan-response": "wave 10 scripting in progress: cw/hulkling/support-upgrades-allies",
  "56031.altman-residence-action": "wave 10 scripting in progress: cw/hulkling/support-upgrades-allies",
  "56032.winged-shape-constant": "wave 10 scripting in progress: cw/hulkling/support-upgrades-allies",
  "56032.winged-shape-response": "wave 10 scripting in progress: cw/hulkling/support-upgrades-allies",
  "56033.hulk-shape-constant": "wave 10 scripting in progress: cw/hulkling/support-upgrades-allies",
  "56033.hulk-shape-response": "wave 10 scripting in progress: cw/hulkling/support-upgrades-allies",
  "56034.armored-shape-constant": "wave 10 scripting in progress: cw/hulkling/support-upgrades-allies",
  "56034.armored-shape-response": "wave 10 scripting in progress: cw/hulkling/support-upgrades-allies",
  "56035.imitation-shape-constant": "wave 10 scripting in progress: cw/hulkling/support-upgrades-allies",
  "56035.imitation-shape-forced-interrupt": "wave 10 scripting in progress: cw/hulkling/support-upgrades-allies",
  "56035.imitation-shape-response": "wave 10 scripting in progress: cw/hulkling/support-upgrades-allies",
  "56036.alien-physiology-resource": "wave 10 scripting in progress: cw/hulkling/support-upgrades-allies",
};
