import { communityDecks, type CommunityDeck } from "@mc/cards";
import { validateDeck } from "@mc/engine";
import { describe, expect, test } from "vitest";
import { POOL_CARDS, POOL_DEPS, POOL_VERSION } from "../content/pool.js";
import { Unlocks, DEFAULT_UNLOCK_PREFS, NO_PROGRESS } from "../progression/unlocks.js";
import {
  addCommunityDeck,
  communityCredit,
  communityDeckAsDeck,
  communityDeckLock,
  communityEntryOf,
  communityMetaLine,
  communityNotesOf,
  communityOfferMatches,
  communityOffers,
  communityOffersForHero,
  communityStatusText,
  communityUpdatedText,
  isCommunityDeckId,
  type CommunityDeckGate,
} from "./community-decks-model.js";

const catalog = communityDecks();
const entry = (marvelcdbId: number): CommunityDeck => {
  const found = catalog.find((deck) => deck.marvelcdbId === marvelcdbId);
  if (!found) throw new Error(`decklist ${marvelcdbId} is not in the catalog`);
  return found;
};
/** Spider-Man, Core cards only. */
const SPIDER_MAN = 103;
/** Nova (wave 5). */
const NOVA = 19596;
/** Magneto (wave 8). */
const MAGNETO = 43978;

const OPEN: CommunityDeckGate = { heroLock: () => null, waveLock: () => null };
const fresh = new Unlocks({ progress: NO_PROGRESS, prefs: DEFAULT_UNLOCK_PREFS });
const everything = new Unlocks({ progress: NO_PROGRESS, prefs: DEFAULT_UNLOCK_PREFS, devUnlockAll: true });

const offersWith = (gate: CommunityDeckGate, savedDecks: Parameters<typeof communityOffers>[0]["savedDecks"] = []) =>
  communityOffers({ catalog, savedDecks, pool: POOL_CARDS, poolVersion: POOL_VERSION, deps: POOL_DEPS, gate });
const env = { poolVersion: POOL_VERSION, now: () => "2026-10-10T12:00:00.000Z", newId: () => "copy-1" };

describe("community deck offers", () => {
  test("every catalog deck is offered, legal in the client's pool, with every card scripted", () => {
    const offers = offersWith(OPEN);
    expect(offers).toHaveLength(catalog.length);
    for (const offer of offers) {
      expect(offer.option.legal, `${offer.entry.name}: ${offer.option.blockedReason}`).toBe(true);
      expect(offer.option.unscripted, offer.entry.name).toEqual([]);
      expect(offer.lock).toBeNull();
      expect(communityStatusText(offer)).toBe("Tested");
      expect(isCommunityDeckId(offer.option.deck.id as string)).toBe(true);
    }
  });

  test("a new player is offered a Core-only deck and not a later wave's hero", () => {
    const offers = new Map(offersWith(fresh).map((offer) => [offer.entry.marvelcdbId, offer]));
    expect(offers.get(SPIDER_MAN)!.lock).toBeNull();
    expect(offers.get(NOVA)!.lock).toMatch(/unlock/i);
    expect(offers.get(MAGNETO)!.lock).toMatch(/unlock/i);
    expect(communityStatusText(offers.get(MAGNETO)!)).toBe("Locked");
    expect(communityMetaLine(offers.get(MAGNETO)!)).toContain(offers.get(MAGNETO)!.lock!);
  });

  test("with everything unlocked, decks from Core, wave 5 and wave 8 are all offered", () => {
    const offers = new Map(offersWith(everything).map((offer) => [offer.entry.marvelcdbId, offer]));
    for (const id of [SPIDER_MAN, NOVA, MAGNETO]) expect(offers.get(id)!.lock, String(id)).toBeNull();
  });

  test("an open hero is still locked while one of the deck's cards comes from a shut wave", () => {
    const shutCycle = POOL_CARDS.find((card) => card.id === entry(NOVA).contents.cards[0]!.cardId)!.cycleId as string;
    const gate: CommunityDeckGate = {
      heroLock: () => null,
      waveLock: (cycleId) => (cycleId === shutCycle ? "Beat someone to unlock that wave" : null),
    };
    expect(communityDeckLock(entry(NOVA), POOL_CARDS, gate)).toMatch(/^Beat someone to unlock that wave \(.+\)$/);
    expect(communityDeckLock(entry(NOVA), POOL_CARDS, OPEN)).toBeNull();
  });

  test("the list line names the hero, aspect, author and that it is tested", () => {
    const offer = offersWith(OPEN).find((o) => o.entry.marvelcdbId === NOVA)!;
    expect(communityCredit(offer.entry)).toBe("by CVdantespeak");
    expect(communityMetaLine(offer)).toBe("by CVdantespeak · Tested · Nova · Leadership");
  });

  test("search finds a deck by its author, and narrows by hero, aspect and availability", () => {
    const offers = offersWith(fresh);
    const byAuthor = offers.filter((offer) => communityOfferMatches(offer, { text: "web-warrior" }));
    expect(byAuthor.length).toBeGreaterThan(0);
    expect(byAuthor.every((offer) => offer.entry.author === "Web-Warrior Fanatic")).toBe(true);
    expect(
      offers.filter((offer) => communityOfferMatches(offer, { text: "nova" })).map((o) => o.entry.marvelcdbId),
    ).toEqual([NOVA]);
    const justice = offers.filter((offer) => communityOfferMatches(offer, { text: "", aspect: "justice" }));
    expect(justice.every((offer) => offer.entry.aspects.includes("justice" as never))).toBe(true);
    const available = offers.filter((offer) => communityOfferMatches(offer, { text: "", availableOnly: true }));
    expect(available.every((offer) => offer.lock === null)).toBe(true);
    expect(available.length).toBeLessThan(offers.length);
    expect(communityOffersForHero(offers, "09001a").map((offer) => offer.entry.marvelcdbId)).toEqual([1771, 34506]);
  });
});

describe("adding a community deck", () => {
  test("makes an editable, legal copy that keeps the decklist's name, MarvelCDB id and link", () => {
    const source = entry(SPIDER_MAN);
    const copy = addCommunityDeck(source, env);
    expect(copy.id).toBe("copy-1");
    expect(copy.name).toBe(source.name);
    expect(copy.source).toEqual({
      kind: "imported",
      site: "marvelcdb",
      marvelcdbDeckId: "103",
      url: "https://marvelcdb.com/decklist/view/103",
      importedAt: "2026-10-10T12:00:00.000Z",
    });
    expect(copy.cards).toEqual(source.contents.cards);
    expect(copy.cards).not.toBe(source.contents.cards);
    expect(validateDeck(copy, POOL_CARDS)).toEqual({ ok: true });
    // An imported deck is never locked (`Unlocks.deckLock`): once added, it seats like any deck the player imported.
    expect(fresh.deckLock(copy)).toBeNull();
  });

  test("a second copy gets a numbered name, and the offer then says the player has it", () => {
    const first = addCommunityDeck(entry(SPIDER_MAN), env);
    const second = addCommunityDeck(entry(SPIDER_MAN), { ...env, existingNames: [first.name] });
    expect(second.name).toBe(`${first.name} (2)`);
    const offer = offersWith(OPEN, [first]).find((o) => o.entry.marvelcdbId === SPIDER_MAN)!;
    expect(offer.added).toBe(true);
    expect(communityMetaLine(offer)).toContain("· Tested · in your decks · ");
    expect(offersWith(OPEN, [first]).filter((o) => o.added)).toHaveLength(1);
  });

  test("the copy and the offer both lead back to the catalog entry, and other decks do not", () => {
    const source = entry(NOVA);
    expect(communityEntryOf(addCommunityDeck(source, env), catalog)).toBe(source);
    expect(communityEntryOf(communityDeckAsDeck(source, POOL_VERSION), catalog)).toBe(source);
    const pasted = { ...addCommunityDeck(source, env), source: { kind: "userBuilt", createdAt: "" } as const };
    expect(communityEntryOf(pasted, catalog)).toBeNull();
  });
});

describe("what the detail rail says", () => {
  test("the last update is the decklist's own MarvelCDB date", () => {
    expect(
      communityUpdatedText({ updatedAt: "2026-09-30T20:53:16+00:00", publishedAt: "2019-11-06T15:28:15+00:00" }),
    ).toBe("Sep 30, 2026");
    expect(communityUpdatedText({ updatedAt: null, publishedAt: "2019-11-06T15:28:15+00:00" })).toBe("Nov 6, 2019");
    expect(communityUpdatedText({ updatedAt: null, publishedAt: null })).toBeNull();
    for (const deck of catalog) expect(communityUpdatedText(deck), deck.name).not.toBeNull();
  });

  test("the author's notes come out as plain paragraphs", () => {
    const notes = communityNotesOf(
      [
        "## Game plan",
        "",
        "Get **[Nick Fury](/card/01084)** out early,",
        "then _swing_ with `Swinging Web Kick`.",
        "",
        "- Mulligan for <b>Helicarrier</b>",
        "1. Keep ~~nothing~~ resources &amp; allies",
        "",
        "---",
        "![banner](https://example.com/a.png)",
        "> Solo, expert.",
      ].join("\r\n"),
    );
    expect(notes).toEqual([
      "Game plan",
      "Get Nick Fury out early, then swing with Swinging Web Kick.",
      "• Mulligan for Helicarrier",
      "• Keep nothing resources & allies",
      "Solo, expert.",
    ]);
    expect(communityNotesOf("")).toEqual([]);
  });

  test("every saved write-up reads as text with no Markdown or HTML left in it", () => {
    const withNotes = catalog.filter((deck) => deck.description.trim().length > 0);
    expect(withNotes.length).toBeGreaterThan(20);
    for (const deck of withNotes) {
      const notes = communityNotesOf(deck.description);
      expect(notes.length, deck.name).toBeGreaterThan(0);
      for (const paragraph of notes) expect(paragraph, deck.name).not.toMatch(/\]\(|<\/?[a-z][^>]*>|^#{1,6}\s/i);
    }
  });
});
