import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/aspect-basic/basic` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (6):
 * - 56019 Yellowjacket (ally)
 * - 56020 Energy (resource)
 * - 56021 Genius (resource)
 * - 56022 Strength (resource)
 * - 56052 Iron Lad (ally)
 * - 56053 Assess the Situation (event)
 */
export const ASPECT_BASIC_BASIC: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const ASPECT_BASIC_BASIC_SKIPPED: Readonly<Record<string, string>> = {
  "56019.yellowjacket-response": "wave 10 scripting in progress: cw/aspect-basic/basic",
  "56052.iron-lad-interrupt": "wave 10 scripting in progress: cw/aspect-basic/basic",
  "56053.assess-the-situation-action": "wave 10 scripting in progress: cw/aspect-basic/basic",
};
