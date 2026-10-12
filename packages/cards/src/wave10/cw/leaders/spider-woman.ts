import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `cw/leaders/spider-woman` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md B8.4).
 *
 * Cards (7):
 * - 56168 Spider-Woman (villain)
 * - 56174 Finesse (attachment)
 * - 56175 Contaminant Immunity (attachment)
 * - 56176 Pheromones (treachery)
 * - 56177 Venom Blast (treachery)
 * - 56178 Inconspicuous (treachery)
 * - 56179 Self-propelled Glide (side_scheme)
 */
export const LEADERS_SPIDER_WOMAN: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const LEADERS_SPIDER_WOMAN_SKIPPED: Readonly<Record<string, string>> = {
  "56168.setup": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56168.spider-woman-forced-interrupt": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56169.when-revealed": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56169.spider-woman-forced-interrupt": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56170.setup": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56170.spider-woman-forced-interrupt": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56171.when-revealed": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56171.spider-woman-forced-interrupt": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56174.finesse-constant": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56174.finesse-forced-interrupt": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56175.contaminant-immunity-forced-interrupt": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56175.boost": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56176.when-revealed": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56176.boost": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56177.when-revealed-alter-ego": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56177.when-revealed-hero": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56178.when-revealed": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56178.boost": "wave 10 scripting in progress: cw/leaders/spider-woman",
  "56179.self-propelled-glide-forced-interrupt": "wave 10 scripting in progress: cw/leaders/spider-woman",
};
