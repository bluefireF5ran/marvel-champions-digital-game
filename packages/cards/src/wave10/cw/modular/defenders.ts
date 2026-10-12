import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/modular/defenders` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (5):
 * - 56184 Luke Cage (minion)
 * - 56185 Jessica Jones (minion)
 * - 56186 Protect the Innocent (treachery)
 * - 56187 Street Defenders (treachery)
 * - 56188 The Defenders (side_scheme)
 */
export const MODULAR_DEFENDERS: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_DEFENDERS_SKIPPED: Readonly<Record<string, string>> = {
  "56184.when-revealed": "wave 10 scripting in progress: cw/modular/defenders",
  "56184.boost": "wave 10 scripting in progress: cw/modular/defenders",
  "56185.when-revealed": "wave 10 scripting in progress: cw/modular/defenders",
  "56185.boost": "wave 10 scripting in progress: cw/modular/defenders",
  "56186.when-revealed": "wave 10 scripting in progress: cw/modular/defenders",
  "56187.when-revealed": "wave 10 scripting in progress: cw/modular/defenders",
  "56188.the-defenders-constant": "wave 10 scripting in progress: cw/modular/defenders",
};
