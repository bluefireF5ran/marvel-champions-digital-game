import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../dsl/index.js";

/**
 * Wave 10 scripting module `wonder_man/justice` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (7):
 * - 58012 Firebird (ally)
 * - 58013 Hawkeye (ally)
 * - 58014 Scarlet Witch (ally)
 * - 58015 Sentry (ally)
 * - 58016 Battlefield Benevolence (event)
 * - 58018 Everywhere All at Once (event)
 * - 58021 Heroic Conditioning (upgrade)
 */
export const WONDER_MAN_JUSTICE: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const WONDER_MAN_JUSTICE_SKIPPED: Readonly<Record<string, string>> = {
  "58012.firebird-constant": "wave 10 scripting in progress: wonder_man/justice",
  "58012.firebird-interrupt": "wave 10 scripting in progress: wonder_man/justice",
  "58013.hawkeye-constant": "wave 10 scripting in progress: wonder_man/justice",
  "58013.hawkeye-response": "wave 10 scripting in progress: wonder_man/justice",
  "58014.scarlet-witch-forced-response": "wave 10 scripting in progress: wonder_man/justice",
  "58015.sentry-forced-response": "wave 10 scripting in progress: wonder_man/justice",
  "58016.battlefield-benevolence-action": "wave 10 scripting in progress: wonder_man/justice",
  "58018.everywhere-all-at-once-action": "wave 10 scripting in progress: wonder_man/justice",
  "58021.heroic-conditioning-constant": "wave 10 scripting in progress: wonder_man/justice",
};
