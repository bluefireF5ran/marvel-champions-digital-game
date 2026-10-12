import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/modular/atlanteans` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (3):
 * - 56165 Atlantean Guard (minion)
 * - 56166 Atlanteans (treachery)
 * - 56167 Atlantis Attacks (side_scheme)
 */
export const MODULAR_ATLANTEANS: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_ATLANTEANS_SKIPPED: Readonly<Record<string, string>> = {
  "56165.when-revealed": "wave 10 scripting in progress: cw/modular/atlanteans",
  "56166.when-revealed": "wave 10 scripting in progress: cw/modular/atlanteans",
  "56167.when-revealed": "wave 10 scripting in progress: cw/modular/atlanteans",
};
