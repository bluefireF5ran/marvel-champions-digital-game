import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `hercules/hercules/events` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (3):
 * - 59009 The Gift of Battle (event)
 * - 59010 Son of Zeus (event)
 * - 59011 Wisdom of Athena (event)
 */
export const HERCULES_EVENTS: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const HERCULES_EVENTS_SKIPPED: Readonly<Record<string, string>> = {
  "59009.the-gift-of-battle-constant": "wave 10 scripting in progress: hercules/hercules/events",
  "59009.the-gift-of-battle-action": "wave 10 scripting in progress: hercules/hercules/events",
  "59010.son-of-zeus-action": "wave 10 scripting in progress: hercules/hercules/events",
  "59011.wisdom-of-athena-constant": "wave 10 scripting in progress: hercules/hercules/events",
  "59011.wisdom-of-athena-action": "wave 10 scripting in progress: hercules/hercules/events",
};
