import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../dsl/index.js";
import { NEXT_EVOL_PRECON_CABLE_DECK } from "../../wave7/next_evol/precon-cable-deck.js";
import { THOR_PACK_CARDS } from "../../wave1/thor/pack-cards.js";

/**
 * Wave 10 scripting module `hercules/leadership` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (7):
 * - 59018 Deathcry (ally)
 * - 59019 Namora (ally)
 * - 59020 Thor (ally)
 * - 59021 Teamwork (event)
 * - 59022 Call for Backup (player_side_scheme)
 * - 59023 Recruitment Drive (support)
 * - 59024 "Avenge Me!" (upgrade)
 *
 * **Reprints, aliased** to the original's script: 59021 Teamwork (reprint of `thor` 06032) and 59022 Call for Backup (reprint of 40018). Checked in the test.
 */
export const HERCULES_LEADERSHIP: AbilityRegistry = defineAbilities({
  "59021.teamwork-interrupt": THOR_PACK_CARDS["06032.teamwork-constant"]!,
  "59022.when-defeated": NEXT_EVOL_PRECON_CABLE_DECK["40018.when-defeated"]!,
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const HERCULES_LEADERSHIP_SKIPPED: Readonly<Record<string, string>> = {
  "59018.deathcry-interrupt": "wave 10 scripting in progress: hercules/leadership",
  "59019.namora-constant": "wave 10 scripting in progress: hercules/leadership",
  "59020.thor-forced-response": "wave 10 scripting in progress: hercules/leadership",
  "59023.recruitment-drive-constant": "wave 10 scripting in progress: hercules/leadership",
  "59023.recruitment-drive-action": "wave 10 scripting in progress: hercules/leadership",
  "59024.avenge-me-interrupt": "wave 10 scripting in progress: hercules/leadership",
};
