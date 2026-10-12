import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/modular/dangerous-recruits` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (5):
 * - 56087 Venom (minion)
 * - 56088 Bullseye (minion)
 * - 56089 Justice Like Lightning (treachery)
 * - 56090 Excessive Force (treachery)
 * - 56091 Dangerous Recruits (side_scheme)
 */
export const MODULAR_DANGEROUS_RECRUITS: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_DANGEROUS_RECRUITS_SKIPPED: Readonly<Record<string, string>> = {
  "56087.venom-constant": "wave 10 scripting in progress: cw/modular/dangerous-recruits",
  "56087.when-revealed": "wave 10 scripting in progress: cw/modular/dangerous-recruits",
  "56088.when-revealed": "wave 10 scripting in progress: cw/modular/dangerous-recruits",
  "56089.when-revealed": "wave 10 scripting in progress: cw/modular/dangerous-recruits",
  "56090.when-revealed": "wave 10 scripting in progress: cw/modular/dangerous-recruits",
  "56090.boost": "wave 10 scripting in progress: cw/modular/dangerous-recruits",
  "56091.dangerous-recruits-forced-interrupt": "wave 10 scripting in progress: cw/modular/dangerous-recruits",
};
