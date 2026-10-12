import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `hercules/hercules/obligation-nemesis` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (6):
 * - 59035 Appeal to Athena (obligation)
 * - 59036 Ares (minion)
 * - 59037 Lernean Hydra (minion)
 * - 59038 Olympic Feud (side_scheme)
 * - 59039 Ares's Axe (attachment)
 * - 59040 God of War (treachery)
 */
export const HERCULES_OBLIGATION_NEMESIS: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const HERCULES_OBLIGATION_NEMESIS_SKIPPED: Readonly<Record<string, string>> = {
  "59035.appeal-to-athena-constant": "wave 10 scripting in progress: hercules/hercules/obligation-nemesis",
  "59035.appeal-to-athena-action": "wave 10 scripting in progress: hercules/hercules/obligation-nemesis",
  "59036.ares-forced-response": "wave 10 scripting in progress: hercules/hercules/obligation-nemesis",
  "59037.lernean-hydra-forced-response": "wave 10 scripting in progress: hercules/hercules/obligation-nemesis",
  "59038.when-revealed": "wave 10 scripting in progress: hercules/hercules/obligation-nemesis",
  "59039.aress-axe-forced-response": "wave 10 scripting in progress: hercules/hercules/obligation-nemesis",
  "59040.god-of-war-constant": "wave 10 scripting in progress: hercules/hercules/obligation-nemesis",
};
