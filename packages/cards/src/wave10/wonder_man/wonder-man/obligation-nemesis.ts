import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `wonder_man/wonder-man/obligation-nemesis` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (5):
 * - 58025 Pacifism (obligation)
 * - 58026 Grim Reaper (minion)
 * - 58027 Brother vs. Brother (side_scheme)
 * - 58028 Scythe Strike (treachery)
 * - 58029 Death Cannot Die (treachery)
 */
export const WONDER_MAN_OBLIGATION_NEMESIS: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const WONDER_MAN_OBLIGATION_NEMESIS_SKIPPED: Readonly<Record<string, string>> = {
  "58025.pacifism-constant": "wave 10 scripting in progress: wonder_man/wonder-man/obligation-nemesis",
  "58025.pacifism-action": "wave 10 scripting in progress: wonder_man/wonder-man/obligation-nemesis",
  "58026.grim-reaper-forced-response": "wave 10 scripting in progress: wonder_man/wonder-man/obligation-nemesis",
  "58027.brother-vs-brother-constant": "wave 10 scripting in progress: wonder_man/wonder-man/obligation-nemesis",
  "58028.when-revealed": "wave 10 scripting in progress: wonder_man/wonder-man/obligation-nemesis",
  "58029.when-revealed": "wave 10 scripting in progress: wonder_man/wonder-man/obligation-nemesis",
  "58029.boost": "wave 10 scripting in progress: wonder_man/wonder-man/obligation-nemesis",
};
