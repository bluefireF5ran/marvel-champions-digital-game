import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/competitive/standard-pvp` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (10):
 * - 56125 Righteous Cause (treachery)
 * - 56126 Whatever It Takes (treachery)
 * - 56127 Targeted Strike (treachery)
 * - 56128a Choosing Sides (side_scheme)
 * - 56128b Now It's Personal (obligation)
 * - 56203 Righteous Cause (treachery)
 * - 56204 Whatever It Takes (treachery)
 * - 56205 Targeted Strike (treachery)
 * - 56206a Choosing Sides (side_scheme)
 * - 56206b Now It's Personal (obligation)
 */
export const COMPETITIVE_STANDARD_PVP: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const COMPETITIVE_STANDARD_PVP_SKIPPED: Readonly<Record<string, string>> = {
  "56125.when-revealed": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56126.when-revealed-alter-ego": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56126.when-revealed-hero": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56127.when-revealed": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56127.boost": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56128a.choosing-sides-constant": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56128a.choosing-sides-forced-response": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56128b.now-its-personal-constant": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56128b.now-its-personal-action": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56203.when-revealed": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56204.when-revealed-alter-ego": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56204.when-revealed-hero": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56205.when-revealed": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56205.boost": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56206a.choosing-sides-constant": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56206a.choosing-sides-forced-response": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56206b.now-its-personal-constant": "wave 10 scripting in progress: cw/competitive/standard-pvp",
  "56206b.now-its-personal-action": "wave 10 scripting in progress: cw/competitive/standard-pvp",
};
