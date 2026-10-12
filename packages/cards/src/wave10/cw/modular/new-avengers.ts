import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/modular/new-avengers` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (5):
 * - 56150 Falcon (minion)
 * - 56151 Hercules (minion)
 * - 56152 Goliath (minion)
 * - 56153 Freedom Fighters (treachery)
 * - 56154 New Avengers (side_scheme)
 */
export const MODULAR_NEW_AVENGERS: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_NEW_AVENGERS_SKIPPED: Readonly<Record<string, string>> = {
  "56150.when-defeated": "wave 10 scripting in progress: cw/modular/new-avengers",
  "56150.boost": "wave 10 scripting in progress: cw/modular/new-avengers",
  "56151.when-defeated": "wave 10 scripting in progress: cw/modular/new-avengers",
  "56151.boost": "wave 10 scripting in progress: cw/modular/new-avengers",
  "56152.when-defeated": "wave 10 scripting in progress: cw/modular/new-avengers",
  "56152.boost": "wave 10 scripting in progress: cw/modular/new-avengers",
  "56153.when-revealed": "wave 10 scripting in progress: cw/modular/new-avengers",
  "56153.boost": "wave 10 scripting in progress: cw/modular/new-avengers",
  "56154.when-defeated": "wave 10 scripting in progress: cw/modular/new-avengers",
};
