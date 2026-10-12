import { cardId } from "@mc/content";
import { createGame, type EngineDeps, type GameState, type PlayerSetup } from "@mc/engine";
import { coreScenario } from "../core/setup.js";
import { firstLegal, settle } from "../testing/harness.js";
import { withForm } from "../testing/staging.js";
import { WAVE10_CARDS } from "./cards.js";
import { WAVE10_DEPS } from "./index.js";
import { wave10StarterDeckSetup } from "./setup.js";

/**
 * Shared helpers for the Civil War player-side tests (every module under `cw/tigra`, `cw/hulkling` and
 * `cw/aspect-basic`): one of the box's two precons against Core's Rhino, with every script registered so far. The
 * Civil War scenario builders do not exist yet (docs/phase7-wave10.md section 8.2 task 3), and Rhino is a fully scripted
 * villain. A module not yet scripted leaves its cards without abilities; a test that needs one borrows a Core card
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
