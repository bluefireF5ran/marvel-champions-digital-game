import { afterEach, describe, expect, it, vi } from "vitest";
import { artLanguageNow, setArtLanguage } from "../art/art-source.js";
import { CARD_LANGUAGES, preferredCardLanguage } from "../art/card-language.js";
import { onLanguageChange } from "../language-change.js";
import { defaultSettings } from "../settings.js";
import { en } from "./en.js";
import { applyLanguageSetting, appLanguageNow, resetAppLanguageForTests } from "./app-language.js";
import { CATALOGS, fill, messageFrom, placeholdersOf, t, type MessageKey } from "./translate.js";

describe("translated app text (#390)", () => {
  it("gives the picked language's message", () => {
    expect(t("title.newGame", undefined, "es")).toBe("Nueva partida");
    expect(t("title.newGame", undefined, "en")).toBe("New game");
  });

  it("falls back to English for a key the language has no translation for", () => {
    expect(messageFrom({ "title.campaign": "Campaña" }, "title.newGame")).toBe("New game");
    expect(messageFrom({ "title.campaign": "Campaña" }, "title.campaign")).toBe("Campaña");
  });

  it("fills {name} placeholders and leaves an unknown one as it is", () => {
    expect(fill("{who} took {n} damage", { who: "Rhino", n: 3 })).toBe("Rhino took 3 damage");
    expect(fill("{who} took {n} damage", { who: "Rhino" })).toBe("Rhino took {n} damage");
    expect(fill("{constructor}", {})).toBe("{constructor}"); // only the params' own names
    expect(placeholdersOf("{b} and {a}, {a}")).toEqual(["a", "b"]);
  });
});

describe("every catalog against English", () => {
  for (const lang of CARD_LANGUAGES) {
    const catalog = CATALOGS[lang] as Record<string, string | undefined>;

    it(`${lang} has no key English lacks`, () => {
      expect(Object.keys(catalog).filter((key) => !(key in en))).toEqual([]);
    });

    it(`${lang} keeps each message's {placeholders}`, () => {
      const mismatched = Object.entries(catalog)
        .filter(([key, text]) => text !== undefined && key in en)
        .filter(([key, text]) => placeholdersOf(text!).join() !== placeholdersOf(en[key as MessageKey]).join())
        .map(([key]) => key);
      expect(mismatched).toEqual([]);
    });

    it(`${lang} has no empty message`, () => {
      expect(Object.entries(catalog).filter(([, text]) => text !== undefined && text.trim() === "")).toEqual([]);
    });
  }
});

describe("text language is not clamped to the card scans (#390)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetAppLanguageForTests();
    setArtLanguage("en");
  });

  it("defaults to English before the session applies the setting", () => {
    expect(appLanguageNow()).toBe("en");
    expect(t("title.newGame")).toBe("New game");
  });

  it("follows the setting when the bundle carries only English scans, while art stays English", () => {
    vi.stubGlobal("__CARD_LANGS__", "en");
    applyLanguageSetting("es");
    expect(appLanguageNow()).toBe("es");
    expect(artLanguageNow()).toBe("en");
    expect(t("title.newGame")).toBe("Nueva partida");
  });

  it("announces once per switch with native-like availability (text only)", () => {
    vi.stubGlobal("__CARD_LANGS__", "en");
    const seen: string[] = [];
    const off = onLanguageChange(() => seen.push(t("title.newGame")));
    applyLanguageSetting("es");
    applyLanguageSetting("es");
    expect(seen).toEqual(["Nueva partida"]);
    applyLanguageSetting("en");
    expect(seen).toEqual(["Nueva partida", "New game"]);
    off();
  });

  it("announces once per switch on the web (art and text), with the new text already in place", () => {
    vi.stubGlobal("__CARD_LANGS__", "en,es");
    const seen: string[] = [];
    const off = onLanguageChange(() => seen.push(`${appLanguageNow()}/${artLanguageNow()}`));
    applyLanguageSetting("es");
    applyLanguageSetting("es");
    expect(seen).toEqual(["es/es"]);
    applyLanguageSetting("en");
    expect(seen).toEqual(["es/es", "en/en"]);
    off();
  });

  it("a Spanish browser gets Spanish by default even when only English scans are carried", () => {
    expect(preferredCardLanguage(["es-MX", "en"], ["en"])).toBe("en"); // the art-clamped choice the default no longer uses
    expect(preferredCardLanguage(["es-MX", "en"], CARD_LANGUAGES)).toBe("es");
    vi.stubGlobal("__CARD_LANGS__", "en");
    vi.stubGlobal("navigator", { languages: ["es-ES"] });
    expect(defaultSettings().cardLanguage).toBe("es");
  });

  it("a Spanish build starts in Spanish whatever the browser says; an English build follows the browser", () => {
    vi.stubGlobal("__CARD_LANG__", "es");
    vi.stubGlobal("__CARD_LANGS__", "es");
    vi.stubGlobal("navigator", { languages: ["fr-FR"] });
    expect(defaultSettings().cardLanguage).toBe("es");
    vi.stubGlobal("navigator", { languages: ["en-US"] });
    expect(defaultSettings().cardLanguage).toBe("es");
    vi.stubGlobal("__CARD_LANG__", "en");
    expect(defaultSettings().cardLanguage).toBe("en");
    vi.stubGlobal("navigator", { languages: ["fr-FR"] });
    expect(defaultSettings().cardLanguage).toBe("en");
  });
});
