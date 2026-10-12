import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/hulkling/identity` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (1):
 * - 56029a Hulkling (hero_identity)
 */
export const HULKLING_IDENTITY: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const HULKLING_IDENTITY_SKIPPED: Readonly<Record<string, string>> = {
  "56029a.chosen-shape": "wave 10 scripting in progress: cw/hulkling/identity",
  "56029b.teddy-altman-constant": "wave 10 scripting in progress: cw/hulkling/identity",
  "56029b.shape-changer": "wave 10 scripting in progress: cw/hulkling/identity",
};
