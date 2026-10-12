import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/tigra/obligation-nemesis` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (6):
 * - 56023 In Too Deep (obligation)
 * - 56024 The Hood (minion)
 * - 56025 Criminal Underworld (side_scheme)
 * - 56026 The Hood's Mantle (attachment)
 * - 56027 Madame Masque (minion)
 * - 56028 Jigsaw (minion)
 */
export const TIGRA_OBLIGATION_NEMESIS: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const TIGRA_OBLIGATION_NEMESIS_SKIPPED: Readonly<Record<string, string>> = {
  "56023.obligation": "wave 10 scripting in progress: cw/tigra/obligation-nemesis",
  "56024.the-hood-forced-response": "wave 10 scripting in progress: cw/tigra/obligation-nemesis",
  "56025.criminal-underworld-constant": "wave 10 scripting in progress: cw/tigra/obligation-nemesis",
  "56026.the-hoods-mantle-response": "wave 10 scripting in progress: cw/tigra/obligation-nemesis",
  "56026.boost": "wave 10 scripting in progress: cw/tigra/obligation-nemesis",
  "56027.when-revealed": "wave 10 scripting in progress: cw/tigra/obligation-nemesis",
  "56027.boost": "wave 10 scripting in progress: cw/tigra/obligation-nemesis",
  "56028.jigsaw-forced-response": "wave 10 scripting in progress: cw/tigra/obligation-nemesis",
};
