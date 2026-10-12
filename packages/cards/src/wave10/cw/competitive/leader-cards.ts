import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/competitive/leader-cards` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (16):
 * - 56129 The Futurist (event)
 * - 56130 Target Lock (event)
 * - 56131 High-Tech Suit (upgrade)
 * - 56132 Suit Up (resource)
 * - 56133 Provoked Response (upgrade)
 * - 56134 You Started This (event)
 * - 56135 Alpha Flight Recruit (upgrade)
 * - 56136 Raw Power (resource)
 * - 56207 No, You Move! (upgrade)
 * - 56208 Fighting Dirty (event)
 * - 56209 Recruited by Cap (event)
 * - 56210 The People's Hero (resource)
 * - 56211 Double Agent (event)
 * - 56212 Spider-Blast (event)
 * - 56213 Hard to Hit (upgrade)
 * - 56214 Secret Contact (resource)
 */
export const COMPETITIVE_LEADER_CARDS: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const COMPETITIVE_LEADER_CARDS_SKIPPED: Readonly<Record<string, string>> = {
  "56129.the-futurist-action": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56130.target-lock-action": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56131.high-tech-suit-constant": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56131.high-tech-suit-action": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56132.suit-up-response": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56133.provoked-response-forced-interrupt": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56134.you-started-this-action": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56135.alpha-flight-recruit-response": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56136.raw-power-response": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56207.no-you-move-forced-interrupt": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56208.fighting-dirty-action": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56209.recruited-by-cap-action": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56210.the-peoples-hero-response": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56211.double-agent-action": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56212.spider-blast-action": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56213.hard-to-hit-constant": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56213.hard-to-hit-forced-response": "wave 10 scripting in progress: cw/competitive/leader-cards",
  "56214.secret-contact-response": "wave 10 scripting in progress: cw/competitive/leader-cards",
};
