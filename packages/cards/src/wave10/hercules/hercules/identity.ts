import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `hercules/hercules/identity` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (1):
 * - 59001a Hercules (hero_identity)
 */
export const HERCULES_IDENTITY: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const HERCULES_IDENTITY_SKIPPED: Readonly<Record<string, string>> = {
  "59001a.atonement": "wave 10 scripting in progress: hercules/hercules/identity",
  "59001b.hercules-constant": "wave 10 scripting in progress: hercules/hercules/identity",
  "59001b.new-labors-of-hercules": "wave 10 scripting in progress: hercules/hercules/identity",
};
