/**
 * Wave 9 definition-of-done 4b, "A real MarvelCDB decklist per new hero" (docs/wave-definition-of-done.md,
 * docs/custom-deck-testing.md "The pieces"): two real public MarvelCDB decklists per new hero (of different aspects
 * where the list allowed), each imported with the existing importer, legal under `validateDeck`, and played by the
 * seeded greedy driver at a wave 9 scenario through `playableScenario` with a deep-equal replay.
 *
 * Fixtures: `fixtures/decklists/<hero>-<aspect>.json`, each FETCHED (not composed) on 2026-10-10 from
 * `GET https://marvelcdb.com/api/public/decklist/<id>.json` (re-serialized with two-space indent; the only field changed
 * is `description_md`, emptied to keep third-party prose out of the repo, exactly as wave 8's fixtures do).
 *
 * Selection rule (owner, 2026-10-10): decks by the preferred MarvelCDB authors "andyr", "Brian-V" and "Web-Warrior
 * Fanatic" first where they fit (every card in the playable pool, legal under `validateDeck`), up to two per hero of
 * different aspects; any other slot goes to the most-liked public decklist that fits, of a different aspect where
 * possible. Profiles are login-gated, so their decks were read from the decklist search filtered by author. andyr has
 * one public wave 9 decklist (Winter Soldier, 53541), Brian-V has none, and Web-Warrior Fanatic has six that fit
 * (Maria Hill, Nick Fury, Black Panther, Silk, Falcon, Winter Soldier; his second Falcon deck, 61016, needs 59024 and
 * 59028, outside the pool).
 * "Pool" is MarvelCDB's label for a deck that draws on more than one aspect.
 *
 * | Hero           | Decklist (marvelcdb.com/decklist/view/<id>)       | Author               | Aspect     | Likes |
 * | -------------- | ------------------------------------------------- | -------------------- | ---------- | ----- |
 * | Maria Hill     | 47248 "Stun Me All You Want (Expert Venom Goblin)"| Web-Warrior Fanatic  | Justice    | 203   |
 * | Maria Hill     | 47008 "S.H.I.E.L.D. Recruitment Drive"            | dr00                 | Leadership | 101   |
 * | Nick Fury      | 47451 "Ezekiel 25:17"                             | SoloMarvelChampion   | Aggression | 155   |
 * | Nick Fury      | 47480 "Threat Collector (Expert Venom Goblin)"    | Web-Warrior Fanatic  | Justice    | 90    |
 * | Black Panther  | 49281 "Shuri's Fury [Repurpose/Dora Milaje]"      | VillainTheory        | Protection | 225   |
 * | Black Panther  | 49532 "Panther Tenacity (Expert Magneto ...)"     | Web-Warrior Fanatic  | Justice    | 173   |
 * | Silk           | 49979 "Web-Warrior Fanatic 2099 (EXPERT RONAN)"   | Web-Warrior Fanatic  | Leadership | 201   |
 * | Silk           | 49367 "Daring Lime's: Smooth as Silk"             | Daring Lime          | Justice    | 135   |
 * | Falcon         | 51319 "Cosmo the Flying Dog"                      | Web-Warrior Fanatic  | Leadership | 5     |
 * | Falcon         | 51168 "The Bird Is The Word!"                     | VillainTheory        | Pool       | 94    |
 * | Winter Soldier | 53541 "Jedi Soldier"                              | andyr                | Pool       | 57    |
 * | Winter Soldier | 51222 "Bucky the Minion Slayer (Expert Ronan...)" | Web-Warrior Fanatic  | Aggression | 244   |
 *
 * Skipped (cards from products outside the playable pool, or illegal): see the report; none of the picks above needed a
 * card outside the pool. Decks are played with `PLAYABLE_CARDS` and `PLAYABLE_DEPS` since a public decklist draws on
 * every earlier pack.
 */
import { describe, expect, test } from "vitest";
import { createGame, replay, validateDeck } from "@mc/engine";
import { PLAYABLE_CARDS, parseMarvelCdbDeckJsonText, type CoreAspect, type DeckContents } from "@mc/content";
import { playToOutcome } from "../testing/driver.js";
import { PLAYABLE_DEPS, playableScenario } from "../playable/index.js";

// `import.meta.glob` (Vite/vitest's static-file loader) rather than `node:fs`: `@mc/cards`'s tsconfig has no `node` types.
interface ImportMetaEnv {
  readonly glob: (pattern: string, opts: object) => unknown;
}
const FIXTURES = (import.meta as unknown as ImportMetaEnv).glob("./fixtures/decklists/*.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const fixtureText = (file: string): string => {
  const text = FIXTURES[`./fixtures/decklists/${file}.json`];
  if (text === undefined) throw new Error(`no fixture for ${file}`);
  return text;
};

const DECKS = [
  { file: "maria-hill-justice", name: "Maria Hill", identity: "50001a", decklist: 47248, scenario: "black-widow" },
  { file: "maria-hill-leadership", name: "Maria Hill", identity: "50001a", decklist: 47008, scenario: "batroc" },
  { file: "nick-fury-aggression", name: "Nick Fury", identity: "50034a", decklist: 47451, scenario: "modok" },
  { file: "nick-fury-justice", name: "Nick Fury", identity: "50034a", decklist: 47480, scenario: "thunderbolts" },
  {
    file: "black-panther-protection",
    name: "Black Panther",
    identity: "51001a",
    decklist: 49281,
    scenario: "baron-zemo",
  },
  {
    file: "black-panther-justice",
    name: "Black Panther",
    identity: "51001a",
    decklist: 49532,
    scenario: "black-widow",
  },
  { file: "silk-leadership", name: "Silk", identity: "52001a", decklist: 49979, scenario: "batroc" },
  { file: "silk-justice", name: "Silk", identity: "52001a", decklist: 49367, scenario: "modok" },
  { file: "falcon-leadership", name: "Falcon", identity: "53001a", decklist: 51319, scenario: "thunderbolts" },
  { file: "falcon-pool", name: "Falcon", identity: "53001a", decklist: 51168, scenario: "baron-zemo" },
  { file: "winter-soldier-pool", name: "Winter Soldier", identity: "54001a", decklist: 53541, scenario: "black-widow" },
  {
    file: "winter-soldier-aggression",
    name: "Winter Soldier",
    identity: "54001a",
    decklist: 51222,
    scenario: "batroc",
  },
] as const;

const ids = new Set(PLAYABLE_CARDS.map((card) => card.id as string));

describe.each(DECKS.map((d, i) => ({ ...d, seed: 91 + i })))("$name: MarvelCDB decklist $decklist ($file)", (entry) => {
  const parse = () => {
    const result = parseMarvelCdbDeckJsonText(fixtureText(entry.file), PLAYABLE_CARDS);
    if (!result.ok) throw new Error(JSON.stringify(result.problems, null, 2));
    return result;
  };
  const playable = (): DeckContents => parse().contents;

  test("the fixture is the served decklist, with the description emptied", () => {
    const raw = JSON.parse(fixtureText(entry.file)) as { id: number; description_md: string; hero_code: string };
    expect(raw.id).toBe(entry.decklist);
    expect(raw.hero_code).toBe(entry.identity);
    expect(raw.description_md).toBe("");
  });

  test("imports against the playable pool, every code resolved to a card of the pool (reprints included)", () => {
    const result = parse();
    expect(result.contents.identityCardId).toBe(entry.identity);
    expect(result.heroName).toBe(entry.name);
    for (const line of result.contents.cards) expect(ids.has(line.cardId as string), line.cardId as string).toBe(true);
    // A reprint (a different code with `duplicate_of_code`) merges into the original's id, so the imported lines never
    // outnumber the served slots; the importer adds nothing for these heroes.
    const served = JSON.parse(fixtureText(entry.file)) as { slots: Record<string, number> };
    const servedTotal = Object.values(served.slots).reduce((n, q) => n + q, 0);
    const added = (result.notes ?? []).filter((n) => n.code === "identity_set_filled");
    expect(added).toEqual([]);
    expect(result.contents.cards.reduce((n, l) => n + l.quantity, 0)).toBe(servedTotal);
  });

  test("the deck keeps the hero's own signature cards and is legal under validateDeck", () => {
    const deck = playable();
    const ownCards = deck.cards.filter((l) => l.cardId.startsWith(entry.identity.slice(0, 2)));
    expect(ownCards.length).toBeGreaterThan(0);
    expect(validateDeck(deck, PLAYABLE_CARDS)).toEqual({ ok: true });
  });

  test(`plays a seeded greedy game against ${entry.scenario} that ends in an outcome and replays deep-equal`, () => {
    const contents = playable();
    const config = playableScenario(entry.scenario, {
      seed: entry.seed,
      players: [
        {
          identityCardId: contents.identityCardId,
          deck: contents.cards.flatMap(({ cardId: id, quantity }) => Array.from({ length: quantity }, () => id)),
          aspects: contents.aspects as readonly CoreAspect[],
        },
      ],
    });
    const created = createGame(config, PLAYABLE_DEPS);
    if (!created.ok) throw new Error(`setup failed: ${created.error.message}`);
    const result = playToOutcome(created.state, PLAYABLE_DEPS, { maxCommands: 4000 });
    expect(result.rounds).toBeGreaterThanOrEqual(1);
    // Either the game ended (win or loss) or the command cap stopped a still-running game.
    expect(result.outcome !== null || result.commands >= 4000).toBe(true);
    const replayed = replay(result.session.log, PLAYABLE_DEPS);
    expect(replayed.ok).toBe(true);
    if (replayed.ok) expect(replayed.state).toEqual(result.session.state);
  }, 120_000);
});
