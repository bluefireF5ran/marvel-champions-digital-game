import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../dsl/index.js";

/**
 * Wave 10 scripting module `wonder_man/basic` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (4):
 * - 58022 Swordsman (ally)
 * - 58023 Energy (resource)
 * - 58024 Jarvis (support)
 * - 58034 Avengers Compound (support)
 */
export const WONDER_MAN_BASIC: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const WONDER_MAN_BASIC_SKIPPED: Readonly<Record<string, string>> = {
  "58022.swordsman-constant": "wave 10 scripting in progress: wonder_man/basic",
  "58022.swordsman-response": "wave 10 scripting in progress: wonder_man/basic",
  "58024.jarvis-response": "wave 10 scripting in progress: wonder_man/basic",
  "58034.avengers-compound-action": "wave 10 scripting in progress: wonder_man/basic",
};
