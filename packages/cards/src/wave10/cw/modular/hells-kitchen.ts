import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/modular/hells-kitchen` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (5):
 * - 56189 Daredevil (minion)
 * - 56190 Iron Fist (minion)
 * - 56191 Resistance Fighter (attachment)
 * - 56192 Street Defenders (treachery)
 * - 56193 Defend Hell's Kitchen (side_scheme)
 */
export const MODULAR_HELLS_KITCHEN: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_HELLS_KITCHEN_SKIPPED: Readonly<Record<string, string>> = {
  "56189.when-revealed": "wave 10 scripting in progress: cw/modular/hells-kitchen",
  "56189.boost": "wave 10 scripting in progress: cw/modular/hells-kitchen",
  "56190.when-revealed": "wave 10 scripting in progress: cw/modular/hells-kitchen",
  "56190.boost": "wave 10 scripting in progress: cw/modular/hells-kitchen",
  "56191.resistance-fighter-constant": "wave 10 scripting in progress: cw/modular/hells-kitchen",
  "56191.resistance-fighter-constant-2": "wave 10 scripting in progress: cw/modular/hells-kitchen",
  "56191.boost": "wave 10 scripting in progress: cw/modular/hells-kitchen",
  "56192.when-revealed": "wave 10 scripting in progress: cw/modular/hells-kitchen",
  "56193.defend-hells-kitchen-constant": "wave 10 scripting in progress: cw/modular/hells-kitchen",
};
