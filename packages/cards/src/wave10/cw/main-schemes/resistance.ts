import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/main-schemes/resistance` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (1):
 * - 56141a Superhero Resistance (main_scheme)
 */
export const MAIN_SCHEMES_RESISTANCE: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MAIN_SCHEMES_RESISTANCE_SKIPPED: Readonly<Record<string, string>> = {
  "56141a.setup": "wave 10 scripting in progress: cw/main-schemes/resistance",
  "56141b.gathering-support-constant": "wave 10 scripting in progress: cw/main-schemes/resistance",
  "56141b.when-revealed": "wave 10 scripting in progress: cw/main-schemes/resistance",
  "56142b.secret-avengers-constant": "wave 10 scripting in progress: cw/main-schemes/resistance",
  "56172a.setup": "wave 10 scripting in progress: cw/main-schemes/resistance",
  "56172b.open-rebellion-constant": "wave 10 scripting in progress: cw/main-schemes/resistance",
  "56172b.open-rebellion-forced-interrupt": "wave 10 scripting in progress: cw/main-schemes/resistance",
  "56173b.when-revealed": "wave 10 scripting in progress: cw/main-schemes/resistance",
  "56199a.setup": "wave 10 scripting in progress: cw/main-schemes/resistance",
  "56199b.rallying-call-constant": "wave 10 scripting in progress: cw/main-schemes/resistance",
  "56199b.rallying-call-constant-2": "wave 10 scripting in progress: cw/main-schemes/resistance",
  "56200a.setup": "wave 10 scripting in progress: cw/main-schemes/resistance",
  "56200b.going-underground-constant": "wave 10 scripting in progress: cw/main-schemes/resistance",
  "56200b.going-underground-constant-2": "wave 10 scripting in progress: cw/main-schemes/resistance",
  "56201b.guerilla-warfare-forced-response": "wave 10 scripting in progress: cw/main-schemes/resistance",
  "56202b.superhero-jailbreak-forced-response": "wave 10 scripting in progress: cw/main-schemes/resistance",
};
