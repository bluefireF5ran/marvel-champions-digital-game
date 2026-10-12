import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `wonder_man/wonder-man/events` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (4):
 * - 58003 Active Altruism (event)
 * - 58004 Ionic Blast (event)
 * - 58005 Starstruck (event)
 * - 58006 Energy Siphon (resource)
 */
export const WONDER_MAN_EVENTS: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const WONDER_MAN_EVENTS_SKIPPED: Readonly<Record<string, string>> = {
  "58003.active-altruism-action": "wave 10 scripting in progress: wonder_man/wonder-man/events",
  "58004.ionic-blast-action": "wave 10 scripting in progress: wonder_man/wonder-man/events",
  "58005.starstruck-action": "wave 10 scripting in progress: wonder_man/wonder-man/events",
  "58006.energy-siphon-interrupt": "wave 10 scripting in progress: wonder_man/wonder-man/events",
};
