import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../dsl/index.js";
import { ANGEL_PACK_CARDS } from "../../wave7/angel/pack-cards.js";

/**
 * Wave 10 scripting module `wonder_man/other-aspects` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (7):
 * - 58017 Bombs Away (event)
 * - 58019 Stronger Together (event)
 * - 58020 Unified Strike (event)
 * - 58030 Caught in the Crossfire (upgrade)
 * - 58031 Cameo (support)
 * - 58032 Coordinated Effort (upgrade)
 * - 58033 Disarming Defense (event)
 *
 * **Reprints, aliased** to the original's script: 58017 Bombs Away (reprint of 42029 `angel`). Checked in the test.
 */
export const WONDER_MAN_OTHER_ASPECTS: AbilityRegistry = defineAbilities({
  "58017.bombs-away-action": ANGEL_PACK_CARDS["42029.bombs-away-action"]!,
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const WONDER_MAN_OTHER_ASPECTS_SKIPPED: Readonly<Record<string, string>> = {
  "58019.stronger-together-interrupt": "wave 10 scripting in progress: wonder_man/other-aspects",
  "58020.unified-strike-interrupt": "wave 10 scripting in progress: wonder_man/other-aspects",
  "58030.caught-in-the-crossfire-interrupt": "wave 10 scripting in progress: wonder_man/other-aspects",
  "58031.setup": "wave 10 scripting in progress: wonder_man/other-aspects",
  "58032.coordinated-effort-constant": "wave 10 scripting in progress: wonder_man/other-aspects",
  "58033.disarming-defense-interrupt": "wave 10 scripting in progress: wonder_man/other-aspects",
};
