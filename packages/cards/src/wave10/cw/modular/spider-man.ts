import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/modular/spider-man` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (4):
 * - 56180 Spider-Man (minion)
 * - 56181 Tangled Up (attachment)
 * - 56182 Spectacular! (treachery)
 * - 56183 Neighborhood Hero (side_scheme)
 */
export const MODULAR_SPIDER_MAN: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_SPIDER_MAN_SKIPPED: Readonly<Record<string, string>> = {
  "56180.when-revealed": "wave 10 scripting in progress: cw/modular/spider-man",
  "56181.tangled-up-forced-interrupt": "wave 10 scripting in progress: cw/modular/spider-man",
  "56181.boost": "wave 10 scripting in progress: cw/modular/spider-man",
  "56182.when-revealed": "wave 10 scripting in progress: cw/modular/spider-man",
  "56183.when-revealed": "wave 10 scripting in progress: cw/modular/spider-man",
};
