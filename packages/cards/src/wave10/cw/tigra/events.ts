import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/tigra/events` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (2):
 * - 56008 Tooth and Claw (event)
 * - 56009 Feline Senses (event)
 */
export const TIGRA_EVENTS: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const TIGRA_EVENTS_SKIPPED: Readonly<Record<string, string>> = {
  "56008.tooth-and-claw-constant": "wave 10 scripting in progress: cw/tigra/events",
  "56008.tooth-and-claw-action": "wave 10 scripting in progress: cw/tigra/events",
  "56009.feline-senses-action": "wave 10 scripting in progress: cw/tigra/events",
};
