import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../dsl/index.js";

/**
 * Wave 10 scripting module `hercules/all-versus-all` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (5):
 * - 59041 All Versus All (side_scheme)
 * - 59042 Hecate (minion)
 * - 59043 Kyknos (minion)
 * - 59044 Bewitched Officer (minion)
 * - 59045 Roving Mobs (side_scheme)
 */
export const HERCULES_ALL_VERSUS_ALL: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const HERCULES_ALL_VERSUS_ALL_SKIPPED: Readonly<Record<string, string>> = {
  "59041.all-versus-all-forced-response": "wave 10 scripting in progress: hercules/all-versus-all",
  "59041.when-defeated": "wave 10 scripting in progress: hercules/all-versus-all",
  "59042.hecate-constant": "wave 10 scripting in progress: hercules/all-versus-all",
  "59042.hecate-forced-response": "wave 10 scripting in progress: hercules/all-versus-all",
  "59043.kyknos-forced-response": "wave 10 scripting in progress: hercules/all-versus-all",
  "59044.bewitched-officer-constant": "wave 10 scripting in progress: hercules/all-versus-all",
  "59045.when-defeated": "wave 10 scripting in progress: hercules/all-versus-all",
};
