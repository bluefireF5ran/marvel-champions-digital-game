import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/aspect-basic/aggression` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (9):
 * - 56010 Two-Gun Kid (ally)
 * - 56011 Spider-Girl (ally)
 * - 56012 Air Cover (support)
 * - 56013 Aggressive Conditioning (upgrade)
 * - 56014 Suppressing Fire (upgrade)
 * - 56015 "Bring It!" (event)
 * - 56016 Coup de Grâce (event)
 * - 56017 Savage Strike (event)
 * - 56018 Audacity (resource)
 */
export const ASPECT_BASIC_AGGRESSION: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const ASPECT_BASIC_AGGRESSION_SKIPPED: Readonly<Record<string, string>> = {
  "56010.two-gun-kid-interrupt": "wave 10 scripting in progress: cw/aspect-basic/aggression",
  "56011.spider-girl-response": "wave 10 scripting in progress: cw/aspect-basic/aggression",
  "56012.air-cover-response": "wave 10 scripting in progress: cw/aspect-basic/aggression",
  "56013.aggressive-conditioning-constant": "wave 10 scripting in progress: cw/aspect-basic/aggression",
  "56014.suppressing-fire-interrupt": "wave 10 scripting in progress: cw/aspect-basic/aggression",
  "56015.bring-it-action": "wave 10 scripting in progress: cw/aspect-basic/aggression",
  "56016.coup-de-grace-action": "wave 10 scripting in progress: cw/aspect-basic/aggression",
  "56017.savage-strike-interrupt": "wave 10 scripting in progress: cw/aspect-basic/aggression",
  "56018.audacity-response": "wave 10 scripting in progress: cw/aspect-basic/aggression",
};
