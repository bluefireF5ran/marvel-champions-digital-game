import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/leaders/captain-marvel` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (8):
 * - 56092 Captain Marvel (villain)
 * - 56098 Energy Channel (attachment)
 * - 56099 Captain Marvel's Helmet (attachment)
 * - 56100 Cosmic Flight (attachment)
 * - 56101 Photonic Blast (treachery)
 * - 56102 Crisis Interdiction (treachery)
 * - 56103 Energy Absorption (treachery)
 * - 56104 Alpha Flight Station (side_scheme)
 */
export const LEADERS_CAPTAIN_MARVEL: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const LEADERS_CAPTAIN_MARVEL_SKIPPED: Readonly<Record<string, string>> = {
  "56092.setup": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56092.captain-marvel-forced-response": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56093.when-revealed": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56093.captain-marvel-forced-response": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56094.setup": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56094.captain-marvel-forced-response": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56095.when-revealed": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56095.captain-marvel-forced-response": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56098.energy-channel-forced-response": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56099.captain-marvels-helmet-constant": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56099.captain-marvels-helmet-response": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56099.boost": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56100.cosmic-flight-forced-interrupt": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56100.boost": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56101.when-revealed-alter-ego": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56101.when-revealed-hero": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56102.when-revealed-alter-ego": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56102.when-revealed-hero": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56103.when-revealed": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56103.boost": "wave 10 scripting in progress: cw/leaders/captain-marvel",
  "56104.when-defeated": "wave 10 scripting in progress: cw/leaders/captain-marvel",
};
