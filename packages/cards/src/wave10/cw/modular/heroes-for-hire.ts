import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/modular/heroes-for-hire` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (5):
 * - 56112 Colleen Wing (minion)
 * - 56113 Shang-Chi (minion)
 * - 56114 Unregistered Super (obligation)
 * - 56115 Bounty Hunting (treachery)
 * - 56116 Heroes for Hire (side_scheme)
 */
export const MODULAR_HEROES_FOR_HIRE: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_HEROES_FOR_HIRE_SKIPPED: Readonly<Record<string, string>> = {
  "56112.when-revealed": "wave 10 scripting in progress: cw/modular/heroes-for-hire",
  "56113.when-revealed": "wave 10 scripting in progress: cw/modular/heroes-for-hire",
  "56114.unregistered-super-constant": "wave 10 scripting in progress: cw/modular/heroes-for-hire",
  "56114.unregistered-super-action": "wave 10 scripting in progress: cw/modular/heroes-for-hire",
  "56115.when-revealed": "wave 10 scripting in progress: cw/modular/heroes-for-hire",
  "56116.when-defeated": "wave 10 scripting in progress: cw/modular/heroes-for-hire",
};
