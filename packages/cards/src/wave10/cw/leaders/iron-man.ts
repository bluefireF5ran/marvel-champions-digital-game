import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/leaders/iron-man` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (9):
 * - 56059 Iron Man (villain)
 * - 56065 Powered Gauntlets (attachment)
 * - 56066 Rocket Boots (attachment)
 * - 56067 Mark V Helmet (attachment)
 * - 56068 Arc Reactor (attachment)
 * - 56069 Mark V Armor (attachment)
 * - 56070 Repulsor Blast (treachery)
 * - 56071 Supersonic Punch (treachery)
 * - 56072 Stark Tower (side_scheme)
 */
export const LEADERS_IRON_MAN: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const LEADERS_IRON_MAN_SKIPPED: Readonly<Record<string, string>> = {
  "56059.iron-man-constant": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56059.setup": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56060.iron-man-constant": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56060.when-revealed": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56061.iron-man-constant": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56061.setup": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56062.iron-man-constant": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56062.when-revealed": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56065.powered-gauntlets-constant": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56065.powered-gauntlets-response": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56065.boost": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56066.rocket-boots-constant": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56066.rocket-boots-response": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56066.boost": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56067.mark-v-helmet-constant": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56067.mark-v-helmet-constant-2": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56067.mark-v-helmet-response": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56068.arc-reactor-constant": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56068.arc-reactor-constant-2": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56068.arc-reactor-response": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56069.mark-v-armor-forced-interrupt": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56069.boost": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56070.when-revealed-alter-ego": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56070.when-revealed-hero": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56071.when-revealed-alter-ego": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56071.when-revealed-hero": "wave 10 scripting in progress: cw/leaders/iron-man",
  "56072.when-defeated": "wave 10 scripting in progress: cw/leaders/iron-man",
};
