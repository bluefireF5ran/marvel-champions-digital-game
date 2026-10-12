import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/modular/mighty-avengers` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (5):
 * - 56073 Yellowjacket (minion)
 * - 56074 Wasp (minion)
 * - 56075 U.S. Agent (minion)
 * - 56076 Mighty Avengers (treachery)
 * - 56077 Earth's Mightiest Heroes (side_scheme)
 */
export const MODULAR_MIGHTY_AVENGERS: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_MIGHTY_AVENGERS_SKIPPED: Readonly<Record<string, string>> = {
  "56073.when-revealed": "wave 10 scripting in progress: cw/modular/mighty-avengers",
  "56073.boost": "wave 10 scripting in progress: cw/modular/mighty-avengers",
  "56074.when-revealed": "wave 10 scripting in progress: cw/modular/mighty-avengers",
  "56074.boost": "wave 10 scripting in progress: cw/modular/mighty-avengers",
  "56075.when-revealed": "wave 10 scripting in progress: cw/modular/mighty-avengers",
  "56075.boost": "wave 10 scripting in progress: cw/modular/mighty-avengers",
  "56076.when-revealed": "wave 10 scripting in progress: cw/modular/mighty-avengers",
  "56077.earths-mightiest-heroes-constant": "wave 10 scripting in progress: cw/modular/mighty-avengers",
};
