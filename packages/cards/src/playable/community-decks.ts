/**
 * Community decks: every public MarvelCDB decklist this repo has saved and proven (`docs/custom-deck-testing.md`), as
 * one catalog a client can recommend from. These are decks by named MarvelCDB authors, not official precons.
 *
 * **The catalog is the fixture files themselves.** Each `fixtures/**` JSON under `playable/` and under any `wave<N>/`
 * folder is one saved `GET https://marvelcdb.com/api/public/decklist/<id>.json` response, and the same files are what
 * the tests read: `marvelcdb-decklists.test.ts` proves every catalog entry (imports against the playable pool, legal
 * under `validateDeck`, plays a seeded game to an outcome that replays deep-equal), so a deck cannot be listed here
 * without being tested there.
 *
 * **Adding a deck is dropping its fixture into a wave's `fixtures/` folder.** A new wave's folder joins through the
 * `../wave*` pattern with no change here. The saved JSON carries the author's MarvelCDB user id but not their name,
 * so an author is named by one line in `COMMUNITY_DECK_AUTHORS`; until then the deck is credited to
 * "MarvelCDB user <id>". To keep a saved decklist out of the catalog, name its id in `NOT_RECOMMENDED`.
 */
import {
  PLAYABLE_CARDS,
  parseMarvelCdbDeckJson,
  type CardId,
  type CoreAspect,
  type DeckContents,
  type ImportProblem,
} from "@mc/content";

// `import.meta.glob` is Vite's static-file loader (the client build and vitest both run it); `@mc/cards`'s tsconfig
// carries no Vite types, hence the cast (the same pattern as the tests that read these fixtures).
interface ImportMetaGlob {
  readonly glob: (patterns: readonly string[], opts: object) => unknown;
}
const FIXTURES = (import.meta as unknown as ImportMetaGlob).glob(
  ["./fixtures/*.json", "../wave*/**/fixtures/**/*.json"],
  { import: "default", eager: true },
) as Record<string, unknown>;

/**
 * MarvelCDB user id → the author's name as MarvelCDB shows it. Recorded by hand when a decklist is saved (the public
 * decklist JSON has only `user_id`). Brian-V and Web-Warrior Fanatic are authors the owner named as good sources
 * (2026-10-10, marvelcdb.com/user/profile/2326 and /34979); the rest are the names the wave 5 custom-deck tests and
 * the wave 9 decklist table (`../wave9/custom-decks-marvelcdb.test.ts`) recorded at fetch time.
 */
export const COMMUNITY_DECK_AUTHORS: Readonly<Record<number, string>> = {
  5: "dr00",
  720: "jamjams32",
  2326: "Brian-V",
  10006: "CVdantespeak",
  14578: "SoloMarvelChampion",
  16053: "VillainTheory",
  18564: "Raftman",
  19903: "LeahLorenna",
  28541: "andyr",
  34979: "Web-Warrior Fanatic",
  37731: "Tzars",
  38537: "Daring Lime",
  47191: "JuanMC",
};

/** MarvelCDB decklist ids saved as fixtures that the game should not recommend. */
const NOT_RECOMMENDED: ReadonlySet<number> = new Set<number>([]);

export interface CommunityDeck {
  readonly marvelcdbId: number;
  /** The deck's name on MarvelCDB. */
  readonly name: string;
  readonly heroName: string;
  readonly identityCardId: CardId;
  readonly aspects: readonly CoreAspect[];
  /** The author's MarvelCDB name, or "MarvelCDB user <id>" while `COMMUNITY_DECK_AUTHORS` has no line for them. */
  readonly author: string;
  readonly authorId: number;
  /** False while `author` is the "MarvelCDB user <id>" placeholder. */
  readonly authorNamed: boolean;
  /** `https://marvelcdb.com/decklist/view/<id>`. */
  readonly url: string;
  /** The decklist's MarvelCDB version ("1.0", "2.0"). */
  readonly version: string;
  /** ISO 8601, MarvelCDB's `date_creation` and `date_update` as they were when the fixture was saved. */
  readonly publishedAt: string | null;
  readonly updatedAt: string | null;
  /** MarvelCDB's own tags ("solo", "multiplayer", "theme", "beginner"). */
  readonly tags: readonly string[];
  /** The author's write-up, as Markdown. Empty when the fixture was saved without it. */
  readonly description: string;
  readonly contents: DeckContents;
  /** The fixture file, relative to this module. */
  readonly fixture: string;
}

/** A saved decklist that did not import against the playable pool, so it is not offered. */
export interface SkippedCommunityDeck {
  readonly fixture: string;
  readonly heroCode: string | null;
  readonly problems: readonly ImportProblem[];
}

export const communityDeckUrl = (marvelcdbId: number): string => `https://marvelcdb.com/decklist/view/${marvelcdbId}`;

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const isoDate = (value: unknown): string | null =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;

function build(): { readonly decks: readonly CommunityDeck[]; readonly skipped: readonly SkippedCommunityDeck[] } {
  const decks = new Map<number, CommunityDeck>();
  const skipped: SkippedCommunityDeck[] = [];
  for (const fixture of Object.keys(FIXTURES).sort()) {
    const raw = FIXTURES[fixture] as Record<string, unknown> | null;
    const marvelcdbId = raw?.["id"];
    if (!raw || typeof marvelcdbId !== "number" || NOT_RECOMMENDED.has(marvelcdbId) || decks.has(marvelcdbId)) continue;
    const result = parseMarvelCdbDeckJson(raw, PLAYABLE_CARDS);
    if (!result.ok) {
      skipped.push({ fixture, heroCode: text(raw["hero_code"]) || null, problems: result.problems });
      continue;
    }
    const authorId = typeof raw["user_id"] === "number" ? raw["user_id"] : 0;
    const named = COMMUNITY_DECK_AUTHORS[authorId];
    decks.set(marvelcdbId, {
      marvelcdbId,
      name: (result.deckName ?? text(raw["name"])).trim(),
      heroName: result.heroName ?? text(raw["hero_name"]),
      identityCardId: result.contents.identityCardId,
      aspects: result.contents.aspects,
      author: named ?? `MarvelCDB user ${authorId}`,
      authorId,
      authorNamed: named !== undefined,
      url: communityDeckUrl(marvelcdbId),
      version: text(raw["version"]),
      publishedAt: isoDate(raw["date_creation"]),
      updatedAt: isoDate(raw["date_update"]),
      tags: text(raw["tags"])
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
      description: text(raw["description_md"]),
      contents: result.contents,
      fixture,
    });
  }
  const ordered = [...decks.values()].sort(
    (a, b) => (a.identityCardId as string).localeCompare(b.identityCardId as string) || a.marvelcdbId - b.marvelcdbId,
  );
  return { decks: ordered, skipped };
}

let built: ReturnType<typeof build> | null = null;

/** Every community deck, by hero (identity card id) and then MarvelCDB id. Parsed once, on first use. */
export function communityDecks(): readonly CommunityDeck[] {
  return (built ??= build()).decks;
}

/** Saved decklists left out because they did not import against the playable pool (a hero or card not released here yet). */
export function skippedCommunityDecks(): readonly SkippedCommunityDeck[] {
  return (built ??= build()).skipped;
}
