import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/modular/secret-avengers` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (5):
 * - 56155 Black Panther (minion)
 * - 56156 Spectrum (minion)
 * - 56157 Freedom Fighters (treachery)
 * - 56158 Switching Sides (treachery)
 * - 56159 Secret Avengers (side_scheme)
 */
export const MODULAR_SECRET_AVENGERS: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_SECRET_AVENGERS_SKIPPED: Readonly<Record<string, string>> = {
  "56155.when-defeated": "wave 10 scripting in progress: cw/modular/secret-avengers",
  "56155.boost": "wave 10 scripting in progress: cw/modular/secret-avengers",
  "56156.when-defeated": "wave 10 scripting in progress: cw/modular/secret-avengers",
  "56156.boost": "wave 10 scripting in progress: cw/modular/secret-avengers",
  "56157.when-revealed": "wave 10 scripting in progress: cw/modular/secret-avengers",
  "56157.boost": "wave 10 scripting in progress: cw/modular/secret-avengers",
  "56158.when-revealed": "wave 10 scripting in progress: cw/modular/secret-avengers",
  "56159.when-defeated": "wave 10 scripting in progress: cw/modular/secret-avengers",
};
