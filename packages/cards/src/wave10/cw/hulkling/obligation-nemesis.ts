import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/hulkling/obligation-nemesis` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (5):
 * - 56054 Complicated Lineage (obligation)
 * - 56055 Super Skrull (minion)
 * - 56056 Skrull Business (side_scheme)
 * - 56057 Fantastic Powers (attachment)
 * - 56058 You're Coming With Me! (treachery)
 */
export const HULKLING_OBLIGATION_NEMESIS: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const HULKLING_OBLIGATION_NEMESIS_SKIPPED: Readonly<Record<string, string>> = {
  "56054.obligation": "wave 10 scripting in progress: cw/hulkling/obligation-nemesis",
  "56055.super-skrull-forced-interrupt": "wave 10 scripting in progress: cw/hulkling/obligation-nemesis",
  "56056.skrull-business-forced-response": "wave 10 scripting in progress: cw/hulkling/obligation-nemesis",
  "56057.fantastic-powers-constant": "wave 10 scripting in progress: cw/hulkling/obligation-nemesis",
  "56057.when-revealed": "wave 10 scripting in progress: cw/hulkling/obligation-nemesis",
  "56058.when-revealed-alter-ego": "wave 10 scripting in progress: cw/hulkling/obligation-nemesis",
  "56058.when-revealed-hero": "wave 10 scripting in progress: cw/hulkling/obligation-nemesis",
};
