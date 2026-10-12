import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/aspect-basic/protection` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (11):
 * - 56041 Patriot (ally)
 * - 56042 Brother Voodoo (ally)
 * - 56043 Hidden Base (support)
 * - 56044 The Night Nurse (support)
 * - 56045 Excelsior (upgrade)
 * - 56046 Defensive Conditioning (upgrade)
 * - 56047 "I Can Do This All Day" (event)
 * - 56048 Taunt (event)
 * - 56049 Tackle (event)
 * - 56050 Cuts Both Ways (event)
 * - 56051 Preservation (resource)
 */
export const ASPECT_BASIC_PROTECTION: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const ASPECT_BASIC_PROTECTION_SKIPPED: Readonly<Record<string, string>> = {
  "56041.patriot-response": "wave 10 scripting in progress: cw/aspect-basic/protection",
  "56042.brother-voodoo-response": "wave 10 scripting in progress: cw/aspect-basic/protection",
  "56043.hidden-base-response": "wave 10 scripting in progress: cw/aspect-basic/protection",
  "56044.the-night-nurse-action": "wave 10 scripting in progress: cw/aspect-basic/protection",
  "56045.excelsior-response": "wave 10 scripting in progress: cw/aspect-basic/protection",
  "56046.defensive-conditioning-constant": "wave 10 scripting in progress: cw/aspect-basic/protection",
  "56047.i-can-do-this-all-day-interrupt": "wave 10 scripting in progress: cw/aspect-basic/protection",
  "56048.taunt-action": "wave 10 scripting in progress: cw/aspect-basic/protection",
  "56049.tackle-action": "wave 10 scripting in progress: cw/aspect-basic/protection",
  "56050.cuts-both-ways-interrupt": "wave 10 scripting in progress: cw/aspect-basic/protection",
  "56051.preservation-response": "wave 10 scripting in progress: cw/aspect-basic/protection",
};
