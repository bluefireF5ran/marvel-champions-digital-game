import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/modular/cloak-and-dagger` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (5):
 * - 56194 Cloak (minion)
 * - 56195 Dagger (minion)
 * - 56196 Darkforce (attachment)
 * - 56197 Lightforce (treachery)
 * - 56198 Cloak and Dagger (side_scheme)
 */
export const MODULAR_CLOAK_AND_DAGGER: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_CLOAK_AND_DAGGER_SKIPPED: Readonly<Record<string, string>> = {
  "56194.when-revealed": "wave 10 scripting in progress: cw/modular/cloak-and-dagger",
  "56194.boost": "wave 10 scripting in progress: cw/modular/cloak-and-dagger",
  "56195.when-revealed": "wave 10 scripting in progress: cw/modular/cloak-and-dagger",
  "56195.boost": "wave 10 scripting in progress: cw/modular/cloak-and-dagger",
  "56196.darkforce-constant": "wave 10 scripting in progress: cw/modular/cloak-and-dagger",
  "56196.darkforce-forced-response": "wave 10 scripting in progress: cw/modular/cloak-and-dagger",
  "56197.when-revealed": "wave 10 scripting in progress: cw/modular/cloak-and-dagger",
  "56198.when-defeated": "wave 10 scripting in progress: cw/modular/cloak-and-dagger",
};
