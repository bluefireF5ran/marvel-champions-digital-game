import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/modular/maria-hill` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (4):
 * - 56083 Maria Hill (minion)
 * - 56084 Life Model Decoy (attachment)
 * - 56085 Executive Order (treachery)
 * - 56086 S.H.I.E.L.D. Helicarrier (side_scheme)
 */
export const MODULAR_MARIA_HILL: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_MARIA_HILL_SKIPPED: Readonly<Record<string, string>> = {
  "56083.when-revealed": "wave 10 scripting in progress: cw/modular/maria-hill",
  "56084.life-model-decoy-constant": "wave 10 scripting in progress: cw/modular/maria-hill",
  "56084.life-model-decoy-constant-2": "wave 10 scripting in progress: cw/modular/maria-hill",
  "56084.life-model-decoy-forced-interrupt": "wave 10 scripting in progress: cw/modular/maria-hill",
  "56085.when-revealed": "wave 10 scripting in progress: cw/modular/maria-hill",
  "56085.boost": "wave 10 scripting in progress: cw/modular/maria-hill",
  "56086.when-defeated": "wave 10 scripting in progress: cw/modular/maria-hill",
};
