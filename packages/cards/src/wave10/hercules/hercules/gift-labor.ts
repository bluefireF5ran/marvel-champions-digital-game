import type { AbilityRegistry } from "@mc/engine";
import { defineAbilities } from "../../../dsl/index.js";

/**
 * Wave 10 scripting module `hercules/hercules/gift-labor` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (6):
 * - 59002 Defeat the Hydra (attachment)
 * - 59003 Embody Pathos (attachment)
 * - 59004 Protect Humanity (obligation)
 * - 59005 Nemean Lion Skin (upgrade)
 * - 59006 Shield of Perseus (upgrade)
 * - 59007 Sword of Peleus (upgrade)
 */
export const HERCULES_GIFT_LABOR: AbilityRegistry = defineAbilities({});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const HERCULES_GIFT_LABOR_SKIPPED: Readonly<Record<string, string>> = {
  "59002.defeat-the-hydra-constant": "wave 10 scripting in progress: hercules/hercules/gift-labor",
  "59002.when-revealed": "wave 10 scripting in progress: hercules/hercules/gift-labor",
  "59003.embody-pathos-constant": "wave 10 scripting in progress: hercules/hercules/gift-labor",
  "59003.when-revealed": "wave 10 scripting in progress: hercules/hercules/gift-labor",
  "59004.obligation": "wave 10 scripting in progress: hercules/hercules/gift-labor",
  "59004.when-revealed": "wave 10 scripting in progress: hercules/hercules/gift-labor",
  "59004.protect-humanity-forced-interrupt": "wave 10 scripting in progress: hercules/hercules/gift-labor",
  "59005.nemean-lion-skin-constant": "wave 10 scripting in progress: hercules/hercules/gift-labor",
  "59005.nemean-lion-skin-response": "wave 10 scripting in progress: hercules/hercules/gift-labor",
  "59006.shield-of-perseus-constant": "wave 10 scripting in progress: hercules/hercules/gift-labor",
  "59006.shield-of-perseus-response": "wave 10 scripting in progress: hercules/hercules/gift-labor",
  "59007.sword-of-peleus-constant": "wave 10 scripting in progress: hercules/hercules/gift-labor",
  "59007.sword-of-peleus-response": "wave 10 scripting in progress: hercules/hercules/gift-labor",
};
