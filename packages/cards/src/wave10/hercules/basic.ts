import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../dsl/index.js";
import { BASIC } from "../../core/aspects/basic.js";
import { BKW_PACK_CARDS } from "../../wave1/bkw/pack-cards.js";
import { SPDR_EVENTS } from "../../wave5/spdr/events.js";

/**
 * Wave 10 scripting module `hercules/basic` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (10):
 * - 59025 Gilgamesh (ally)
 * - 59026 Ancient Rivalry (event)
 * - 59027 Limitless Stamina (event)
 * - 59028 Evaluate Threat (player_side_scheme)
 * - 59029 Energy (resource)
 * - 59030 Genius (resource)
 * - 59031 Strength (resource)
 * - 59032 Avengers Compound (support)
 * - 59033 Helicarrier (support)
 * - 59034 Quincarrier (support)
 *
 * **Reprints, aliased** to the original's script: 59027 Limitless Stamina (31023), 59033 Helicarrier (01092), 59034 Quincarrier (08023). Checked in the test.
 * 59032 Avengers Compound reprints 58034 (`wonder_man/basic`), which is not scripted yet: it stays skipped, and whoever scripts 58034 aliases 59032 to it here.
 */
export const HERCULES_BASIC: AbilityRegistry = defineAbilities({
  "59027.limitless-stamina-constant": SPDR_EVENTS["31023.limitless-stamina-constant"]!,
  "59027.limitless-stamina-action": SPDR_EVENTS["31023.limitless-stamina-action"]!,
  "59033.helicarrier-action": BASIC["01092.helicarrier-action"]!,
  "59034.quincarrier-resource": BKW_PACK_CARDS["08023.quincarrier-resource"]!,
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const HERCULES_BASIC_SKIPPED: Readonly<Record<string, string>> = {
  "59025.gilgamesh-constant": "wave 10 scripting in progress: hercules/basic",
  "59026.ancient-rivalry-action": "wave 10 scripting in progress: hercules/basic",
  "59028.evaluate-threat-constant": "wave 10 scripting in progress: hercules/basic",
  "59028.when-defeated": "wave 10 scripting in progress: hercules/basic",
  "59032.avengers-compound-action":
    "wave 10 scripting in progress: hercules/basic (reprint of 58034: alias wonder_man/basic's script once it is scripted)",
};
