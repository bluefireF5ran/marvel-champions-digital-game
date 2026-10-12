import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/modular/martial-law` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (3):
 * - 56109 S.H.I.E.L.D. Soldier (minion)
 * - 56110 Rapid Response (treachery)
 * - 56111 S.H.I.E.L.D. Patrol (side_scheme)
 */
export const MODULAR_MARTIAL_LAW: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_MARTIAL_LAW_SKIPPED: Readonly<Record<string, string>> = {
  "56109.when-revealed": "wave 10 scripting in progress: cw/modular/martial-law",
  "56109.boost": "wave 10 scripting in progress: cw/modular/martial-law",
  "56110.when-revealed": "wave 10 scripting in progress: cw/modular/martial-law",
  "56111.shield-patrol-constant": "wave 10 scripting in progress: cw/modular/martial-law",
};
