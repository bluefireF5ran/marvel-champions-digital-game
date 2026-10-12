import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/modular/cape-killer` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (4):
 * - 56105 Cape-Killer (minion)
 * - 56106 Unregistered Super (obligation)
 * - 56107 Bring Them In (treachery)
 * - 56108 Arrest Order (side_scheme)
 */
export const MODULAR_CAPE_KILLER: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_CAPE_KILLER_SKIPPED: Readonly<Record<string, string>> = {
  "56105.cape-killer-forced-interrupt": "wave 10 scripting in progress: cw/modular/cape-killer",
  "56106.unregistered-super-constant": "wave 10 scripting in progress: cw/modular/cape-killer",
  "56106.unregistered-super-action": "wave 10 scripting in progress: cw/modular/cape-killer",
  "56107.when-revealed": "wave 10 scripting in progress: cw/modular/cape-killer",
  "56108.when-defeated": "wave 10 scripting in progress: cw/modular/cape-killer",
};
