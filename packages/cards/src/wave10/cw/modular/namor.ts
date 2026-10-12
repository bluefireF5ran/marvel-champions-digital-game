import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/modular/namor` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (5):
 * - 56160 Namor (minion)
 * - 56161 Neptune's Trident (attachment)
 * - 56162 Horn of Proteus (attachment)
 * - 56163 Imperius Rex! (treachery)
 * - 56164 Ruler of Atlantis (side_scheme)
 */
export const MODULAR_NAMOR: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_NAMOR_SKIPPED: Readonly<Record<string, string>> = {
  "56160.when-revealed": "wave 10 scripting in progress: cw/modular/namor",
  "56161.neptunes-trident-constant": "wave 10 scripting in progress: cw/modular/namor",
  "56161.neptunes-trident-action": "wave 10 scripting in progress: cw/modular/namor",
  "56162.horn-of-proteus-forced-interrupt": "wave 10 scripting in progress: cw/modular/namor",
  "56162.horn-of-proteus-action": "wave 10 scripting in progress: cw/modular/namor",
  "56163.when-revealed": "wave 10 scripting in progress: cw/modular/namor",
  "56163.boost": "wave 10 scripting in progress: cw/modular/namor",
  "56164.ruler-of-atlantis-constant": "wave 10 scripting in progress: cw/modular/namor",
};
