import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `wonder_man/wonder-man/support-upgrades-allies` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (5):
 * - 58007 Wonder Fans (support)
 * - 58008 Jet Belt (upgrade)
 * - 58009 Mr. Hollywood (upgrade)
 * - 58010 Signature Sunglasses (upgrade)
 * - 58011 "What Are You?" (upgrade)
 */
export const WONDER_MAN_SUPPORT_UPGRADES_ALLIES: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const WONDER_MAN_SUPPORT_UPGRADES_ALLIES_SKIPPED: Readonly<Record<string, string>> = {
  "58007.wonder-fans-action": "wave 10 scripting in progress: wonder_man/wonder-man/support-upgrades-allies",
  "58008.jet-belt-resource": "wave 10 scripting in progress: wonder_man/wonder-man/support-upgrades-allies",
  "58008.jet-belt-hero-resource": "wave 10 scripting in progress: wonder_man/wonder-man/support-upgrades-allies",
  "58009.mr-hollywood-resource": "wave 10 scripting in progress: wonder_man/wonder-man/support-upgrades-allies",
  "58010.signature-sunglasses-response": "wave 10 scripting in progress: wonder_man/wonder-man/support-upgrades-allies",
  "58011.what-are-you-forced-interrupt": "wave 10 scripting in progress: wonder_man/wonder-man/support-upgrades-allies",
};
