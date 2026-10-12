import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/hulkling/events` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (4):
 * - 56037 Shapeshifter Strike (event)
 * - 56038 Armored Defense (event)
 * - 56039 Impersonation (event)
 * - 56040 Shapeshifter (event)
 */
export const HULKLING_EVENTS: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const HULKLING_EVENTS_SKIPPED: Readonly<Record<string, string>> = {
  "56037.shapeshifter-strike-action": "wave 10 scripting in progress: cw/hulkling/events",
  "56038.armored-defense-interrupt": "wave 10 scripting in progress: cw/hulkling/events",
  "56039.impersonation-action": "wave 10 scripting in progress: cw/hulkling/events",
  "56040.shapeshifter-action": "wave 10 scripting in progress: cw/hulkling/events",
};
