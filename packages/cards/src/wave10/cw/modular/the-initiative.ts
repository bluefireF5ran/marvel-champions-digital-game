import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/modular/the-initiative` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (5):
 * - 56078 Doc Samson (minion)
 * - 56079 Hellcat (minion)
 * - 56080 Drafted (attachment)
 * - 56081 Mighty Avengers (treachery)
 * - 56082 The Fifty State Initiative (side_scheme)
 */
export const MODULAR_THE_INITIATIVE: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_THE_INITIATIVE_SKIPPED: Readonly<Record<string, string>> = {
  "56078.when-revealed": "wave 10 scripting in progress: cw/modular/the-initiative",
  "56078.boost": "wave 10 scripting in progress: cw/modular/the-initiative",
  "56079.when-revealed": "wave 10 scripting in progress: cw/modular/the-initiative",
  "56079.boost": "wave 10 scripting in progress: cw/modular/the-initiative",
  "56080.drafted-constant": "wave 10 scripting in progress: cw/modular/the-initiative",
  "56080.when-revealed": "wave 10 scripting in progress: cw/modular/the-initiative",
  "56081.when-revealed": "wave 10 scripting in progress: cw/modular/the-initiative",
  "56082.when-defeated": "wave 10 scripting in progress: cw/modular/the-initiative",
};
