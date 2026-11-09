/**
 * The language app text is shown in (issue #390), apart from the language card art is drawn in. Both come from the one
 * setting, `Settings.cardLanguage`, but only art is limited to the scans a bundle carries (`art-source.ts`'s
 * `setArtLanguage` clamps it): text catalogs ship in every build, so text follows the player's choice as asked.
 */
import { setArtLanguage, artLanguageNow } from "../art/art-source.js";
import { BASE_CARD_LANGUAGE, type CardLanguage } from "../art/card-language.js";
import { announceLanguageChange } from "../language-change.js";

/** English until the session applies the setting (and under Vitest). */
let appLanguage: CardLanguage = BASE_CARD_LANGUAGE;

export function appLanguageNow(): CardLanguage {
  return appLanguage;
}

/**
 * Applies `Settings.cardLanguage`: text switches to it as asked, card art to it or, where the bundle lacks its scans,
 * to the build language. Announces (`language-change.ts`) once when either changed: `setArtLanguage` announces for art,
 * so text alone announces here only when art stayed (a native build).
 */
export function applyLanguageSetting(requested: CardLanguage): void {
  const textChanged = requested !== appLanguage;
  // Set before art announces, so what redraws in that announcement already reads the new text.
  appLanguage = requested;
  const artBefore = artLanguageNow();
  setArtLanguage(requested);
  if (textChanged && artLanguageNow() === artBefore) announceLanguageChange();
}

/** Test seam: back to the initial language, silently. */
export function resetAppLanguageForTests(): void {
  appLanguage = BASE_CARD_LANGUAGE;
}
