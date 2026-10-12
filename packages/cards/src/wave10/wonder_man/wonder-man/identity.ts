import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `wonder_man/wonder-man/identity` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (2):
 * - 58001a Wonder Man (hero_identity)
 * - 58002 Ionic Physiology (upgrade)
 */
export const WONDER_MAN_IDENTITY: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const WONDER_MAN_IDENTITY_SKIPPED: Readonly<Record<string, string>> = {
  "58001a.wonder-man-constant": "wave 10 scripting in progress: wonder_man/wonder-man/identity",
  "58001a.wonder-man-forced-response": "wave 10 scripting in progress: wonder_man/wonder-man/identity",
  "58001b.simon-williams-constant": "wave 10 scripting in progress: wonder_man/wonder-man/identity",
  "58001b.setup": "wave 10 scripting in progress: wonder_man/wonder-man/identity",
  "58002.ionic-physiology-constant": "wave 10 scripting in progress: wonder_man/wonder-man/identity",
  "58002.ionic-physiology-response": "wave 10 scripting in progress: wonder_man/wonder-man/identity",
};
