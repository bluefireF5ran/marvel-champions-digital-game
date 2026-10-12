import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `hercules/hercules/support-upgrades-allies` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (7):
 * - 59008 Amadeus Cho (ally)
 * - 59012 Olympus (support)
 * - 59013 Gauntlets of Hercules (upgrade)
 * - 59014 Golden Mace (upgrade)
 * - 59015 Herc's Helm (upgrade)
 * - 59016 Lion of Olympus (upgrade)
 * - 59017 Prince of Power (upgrade)
 */
export const HERCULES_SUPPORT_UPGRADES_ALLIES: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const HERCULES_SUPPORT_UPGRADES_ALLIES_SKIPPED: Readonly<Record<string, string>> = {
  "59008.amadeus-cho-forced-interrupt": "wave 10 scripting in progress: hercules/hercules/support-upgrades-allies",
  "59008.amadeus-cho-action": "wave 10 scripting in progress: hercules/hercules/support-upgrades-allies",
  "59012.olympus-resource": "wave 10 scripting in progress: hercules/hercules/support-upgrades-allies",
  "59013.gauntlets-of-hercules-interrupt": "wave 10 scripting in progress: hercules/hercules/support-upgrades-allies",
  "59014.golden-mace-interrupt": "wave 10 scripting in progress: hercules/hercules/support-upgrades-allies",
  "59015.hercs-helm-interrupt": "wave 10 scripting in progress: hercules/hercules/support-upgrades-allies",
  "59016.lion-of-olympus-constant": "wave 10 scripting in progress: hercules/hercules/support-upgrades-allies",
  "59017.prince-of-power-response": "wave 10 scripting in progress: hercules/hercules/support-upgrades-allies",
};
