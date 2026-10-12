import { cardId } from "@mc/content";
import { createGame, type EngineDeps, type GameSetupConfig, type GameState, type PlayerSetup } from "@mc/engine";
import { coreScenario } from "../core/setup.js";
import { firstLegal, settle, type Picker } from "../testing/harness.js";
import { withForm } from "../testing/staging.js";
import { WAVE10_CARDS } from "./cards.js";
import { WAVE10_DEPS } from "./index.js";
import { wave10Scenario, wave10StarterDeckSetup, type Wave10ScenarioOptions } from "./setup.js";

/**
 * Shared helpers for the Civil War tests.
 *
 * Player-side modules (`cw/tigra`, `cw/hulkling`, `cw/aspect-basic`) use `cwGame` and its kin: one of the box's two
 * precons against Core's Rhino, a fully scripted villain, with every script registered so far. Leader, main scheme and
 * modular set modules use `civilWarGame` and its kin at the end of this file: the same precons in a real Civil War
 * scenario built by `wave10Scenario`. A module not yet scripted leaves its cards without abilities; a test that needs one borrows a Core card
 * instead (`swap`), so the deck is no longer the legal precon and the game is created with deck legality unchecked.
 */
export { WAVE10_DEPS };
export { encounterTopCodes, engageMinion, stackedEncounter, stagedInPlay } from "../wave9/falcon/testing.js";

export const TIGRA_DECK = "tigra-aggression";
export const HULKLING_DECK = "hulkling-protection";
export const CORE_SPIDER_MAN = "core-spider-man-justice";

/** A starter deck as a seat, optionally with named cards swapped in for others (the first copy of each; size kept). */
export function cwSeat(starterDeckId: string, swap: Readonly<Record<string, string>> = {}): PlayerSetup {
  const seat = wave10StarterDeckSetup(starterDeckId);
  const remaining = { ...swap };
  const deck = seat.deck.map((id) => {
    const replacement = remaining[id as string];
    if (replacement === undefined) return id;
    delete remaining[id as string];
    return cardId(replacement);
  });
  return { ...seat, deck };
}

export interface CwGameOptions {
  readonly swap?: Readonly<Record<string, string>>;
  readonly seed?: number;
  /** A second seat (the Core Spider-Man starter deck) beside the Civil War hero. */
  readonly twoPlayers?: boolean;
  /** Extra dependencies (a module's own registry on top of the wave's), default `WAVE10_DEPS`. */
  readonly deps?: EngineDeps;
}

/** A game past setup (alter-ego form, full hand) for a Civil War precon against Core's Rhino. */
export function cwGame(starterDeckId: string, opts: CwGameOptions = {}): GameState {
  const seed = opts.seed ?? 1;
  const deps = opts.deps ?? WAVE10_DEPS;
  const base = coreScenario("rhino", {
    players: [{ starterDeckId: CORE_SPIDER_MAN }],
    seed,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: WAVE10_CARDS,
  } as never);
  const second = base.players[0]!;
  const created = createGame(
    {
      ...base,
      requireLegalDecks: false,
      players: opts.twoPlayers ? [cwSeat(starterDeckId, opts.swap), second] : [cwSeat(starterDeckId, opts.swap)],
    },
    deps,
  );
  if (!created.ok) throw new Error(created.error.message);
  return settle(created.state, firstLegal, (s) => s.step.phase === "player", deps);
}

/** The same game with the first seat in hero form. */
export const cwHeroGame = (starterDeckId: string, opts: CwGameOptions = {}): GameState =>
  withForm(cwGame(starterDeckId, opts), { heroForm: 0 });

export const tigraGame = (opts: CwGameOptions = {}): GameState => cwGame(TIGRA_DECK, opts);
export const tigraHeroGame = (opts: CwGameOptions = {}): GameState => cwHeroGame(TIGRA_DECK, opts);
export const hulklingGame = (opts: CwGameOptions = {}): GameState => cwGame(HULKLING_DECK, opts);
export const hulklingHeroGame = (opts: CwGameOptions = {}): GameState => cwHeroGame(HULKLING_DECK, opts);

export const IRON_MAN_SCENARIO = "registration-iron-man";
export const CAPTAIN_MARVEL_SCENARIO = "registration-captain-marvel";
export const CAPTAIN_AMERICA_SCENARIO = "resistance-captain-america";
export const SPIDER_WOMAN_SCENARIO = "resistance-spider-woman";

/**
 * The choices of a Civil War test game: `wave10Scenario`'s own (difficulty, the three or four `modularSetIds`, the
 * `mainSchemeStageIds` pair, `gameMode`), each defaulting to the leader's preconstructed scenario, plus the seats.
 */
export interface CivilWarGameOptions
  extends
    CwGameOptions,
    Pick<
      Wave10ScenarioOptions,
      | "difficulty"
      | "modularSetIds"
      | "mainSchemeStageIds"
      | "difficultySets"
      | "gameMode"
      | "firstPlayerIndex"
      | "stack"
    > {
  /** The first seat's starter deck: `TIGRA_DECK` (default) or `HULKLING_DECK`. */
  readonly starterDeckId?: string;
}

/**
 * The `GameSetupConfig` of a Civil War scenario seated with the Tigra or Hulkling precon (and the Core Spider-Man
 * deck as a second seat with `twoPlayers`). A `swap` makes the deck no longer the legal precon, so deck legality is
 * then unchecked.
 */
export function civilWarConfig(scenarioId: string, opts: CivilWarGameOptions = {}): GameSetupConfig {
  const { swap, seed, twoPlayers, deps: _deps, starterDeckId, ...choices } = opts;
  const first = cwSeat(starterDeckId ?? TIGRA_DECK, swap);
  const config = wave10Scenario(scenarioId, {
    ...choices,
    seed: seed ?? 1,
    players: [
      { identityCardId: first.identityCardId, deck: first.deck, ...(first.aspects ? { aspects: first.aspects } : {}) },
      ...(twoPlayers ? [{ starterDeckId: CORE_SPIDER_MAN }] : []),
    ],
  });
  return swap && Object.keys(swap).length > 0 ? { ...config, requireLegalDecks: false } : config;
}

/**
 * A Civil War game as `createGame` returns it: setup's first choice (the mulligan) is pending and no card ability has
 * resolved yet, so the leader's and stage 1A's "Setup" text is still ahead. For a test of what setup does.
 */
export function civilWarSetup(scenarioId: string, opts: CivilWarGameOptions = {}): GameState {
  const created = createGame(civilWarConfig(scenarioId, opts), opts.deps ?? WAVE10_DEPS);
  if (!created.ok) throw new Error(`${created.error.code}: ${created.error.message}`);
  return created.state;
}

/**
 * A Civil War game past setup (the first player's turn, alter-ego form, full hand), every setup choice answered with
 * its first legal option. Pass `pick` to answer them yourself (which Iron Man attachment the Setup reveals).
 */
export function civilWarGame(scenarioId: string, opts: CivilWarGameOptions = {}, pick: Picker = firstLegal): GameState {
  const deps = opts.deps ?? WAVE10_DEPS;
  return settle(civilWarSetup(scenarioId, opts), pick, (s) => s.step.phase === "player", deps);
}

/** The same game with the first seat in hero form. */
export const civilWarHeroGame = (
  scenarioId: string,
  opts: CivilWarGameOptions = {},
  pick: Picker = firstLegal,
): GameState => withForm(civilWarGame(scenarioId, opts, pick), { heroForm: 0 });
