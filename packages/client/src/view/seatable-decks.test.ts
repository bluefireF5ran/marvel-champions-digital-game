import { describe, expect, test } from "vitest";
import { POOL_CARDS, POOL_DEPS, POOL_VERSION } from "../content/pool.js";
import { Unlocks, DEFAULT_UNLOCK_PREFS, NO_PROGRESS } from "../progression/unlocks.js";
import {
  isCommunityDeckId,
  testedDeckLockOf,
  testedEntryOf,
  testedSearchFieldsOf,
  testedSubtitleOf,
} from "./community-decks-model.js";
import { heroSourceMatches } from "./roster-filter.js";
import { seatOptions } from "./seats.js";
import { seatableDeckOptionsOf, testedCatalog } from "./seatable-decks.js";
import { withTestedShelf } from "./roster-shelves.js";
import { pruneSeats } from "./setup-draft.js";

const options = seatableDeckOptionsOf([], POOL_CARDS, POOL_VERSION, POOL_DEPS);
const cardsById = new Map(POOL_CARDS.map((card) => [card.id as string, card]));
const tested = options.filter((o) => isCommunityDeckId(o.deck.id as string));
const fresh = new Unlocks({ progress: NO_PROGRESS, prefs: DEFAULT_UNLOCK_PREFS });
const everything = new Unlocks({ progress: NO_PROGRESS, prefs: DEFAULT_UNLOCK_PREFS, devUnlockAll: true });

describe("tested decks as seat options", () => {
  test("every catalog deck is listed after the precons, legal and seatable", () => {
    expect(tested).toHaveLength(testedCatalog().length);
    expect(tested.length).toBeGreaterThan(60);
    for (const o of tested) expect(o.seatable, `${o.deck.name}: ${o.blockedReason}`).toBe(true);
    expect(options.findIndex((o) => isCommunityDeckId(o.deck.id as string))).toBeGreaterThan(
      options.findIndex((o) => o.deck.source.kind === "precon"),
    );
  });

  test("a seated tested deck survives pruning (Table setup resolves it the same way)", () => {
    const id = tested[0]!.deck.id as string;
    const draft = pruneSeats(
      { seats: [id], activeSeatIndex: 0 } as unknown as Parameters<typeof pruneSeats>[0],
      new Set(options.map((o) => o.deck.id as string)),
      options[0]!.deck.id as string,
    );
    expect(draft.seats).toEqual([id]);
  });

  test("they follow the unique-hero rule across seats", () => {
    const spider = tested.find((o) => o.deck.name.startsWith("Spider-Man and Friends"))!;
    const precon = options.find(
      (o) => o.deck.source.kind === "precon" && o.deck.identityCardId === spider.deck.identityCardId,
    )!;
    const seats = seatOptions(options, [precon.deck.id as string], cardsById);
    expect(seats.find((s) => s.deckId === spider.deck.id)?.blockedBy).toMatch(/already at the table/);
  });

  test("the progression gate applies to their hero and card waves, not to precon rules", () => {
    const spider = tested.find((o) => (o.deck.id as string) === "community:103")!;
    const magneto = tested.find((o) => (o.deck.id as string) === "community:43978")!;
    expect(testedDeckLockOf(spider.deck, testedCatalog(), POOL_CARDS, fresh)).toBeNull();
    expect(testedDeckLockOf(magneto.deck, testedCatalog(), POOL_CARDS, fresh)).toMatch(/unlock/i);
    expect(testedDeckLockOf(magneto.deck, testedCatalog(), POOL_CARDS, everything)).toBeNull();
    expect(
      testedDeckLockOf(options[0]!.deck, testedCatalog(), POOL_CARDS, fresh),
      "a precon is not a tested deck",
    ).toBeNull();
  });

  test("tiles say who wrote them, and search finds author and hero", () => {
    const spider = tested.find((o) => (o.deck.id as string) === "community:103")!;
    expect(testedSubtitleOf(spider.deck, testedCatalog())).toBe("by nungunz · MarvelCDB");
    expect(testedSearchFieldsOf(spider.deck, testedCatalog())).toEqual(
      expect.arrayContaining(["nungunz", "tested", "marvelcdb"]),
    );
    expect(testedEntryOf(options[0]!.deck, testedCatalog())).toBeNull();
    expect(testedSubtitleOf(options[0]!.deck, testedCatalog())).toBeNull();
  });

  test("the source chips partition them as designed", () => {
    const one = tested[0]!.deck;
    expect(heroSourceMatches(one, "tested")).toBe(true);
    expect(heroSourceMatches(one, "userBuilt")).toBe(true);
    expect(heroSourceMatches(one, "imported")).toBe(false);
    expect(heroSourceMatches(one, "precon")).toBe(false);
  });
});

describe("withTestedShelf", () => {
  test("splits the community decks off 'Your decks' onto their own last shelf, and leaves other shelves alone", () => {
    const shelves = [
      { id: "your-decks", title: "Your decks", items: ["mine", "community:1"] },
      { id: "core", title: "Core", items: ["precon"] },
    ];
    const split = withTestedShelf(shelves, (item) => item.startsWith("community:"));
    expect(split.map((s) => [s.id, s.items])).toEqual([
      ["your-decks", ["mine"]],
      ["core", ["precon"]],
      ["tested-decks", ["community:1"]],
    ]);
    const only = withTestedShelf([{ id: "your-decks", title: "Your decks", items: ["community:1"] }], (item) =>
      item.startsWith("community:"),
    );
    expect(only.map((s) => s.id)).toEqual(["tested-decks"]);
  });
});
