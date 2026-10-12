import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/leaders/captain-america` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (8):
 * - 56137 Captain America (villain)
 * - 56143 Cap's Shield (attachment)
 * - 56144 Cap's Helmet (attachment)
 * - 56145 Super-Soldier Serum (attachment)
 * - 56146 Shield Block (treachery)
 * - 56147 Shield Toss (treachery)
 * - 56148 Heroic Strike (treachery)
 * - 56149 Fearless Determination (side_scheme)
 */
export const LEADERS_CAPTAIN_AMERICA: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const LEADERS_CAPTAIN_AMERICA_SKIPPED: Readonly<Record<string, string>> = {
  "56137.setup": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56137.captain-america-forced-response": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56138.when-revealed": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56138.captain-america-forced-response": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56139.setup": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56139.captain-america-forced-response": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56140.when-revealed": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56140.captain-america-forced-response": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56143.caps-shield-constant": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56143.caps-shield-forced-response": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56144.caps-helmet-constant": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56144.caps-helmet-response": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56144.boost": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56145.super-soldier-serum-forced-interrupt": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56145.boost": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56146.when-revealed": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56147.when-revealed-alter-ego": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56147.when-revealed-hero": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56148.when-revealed-alter-ego": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56148.when-revealed-hero": "wave 10 scripting in progress: cw/leaders/captain-america",
  "56149.when-defeated": "wave 10 scripting in progress: cw/leaders/captain-america",
};
