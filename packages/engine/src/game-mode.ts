/**
 * The game mode (docs/phase7-wave10.md §1.9, §3.4; MC56 pp. 6, 14, 20): one team against the scenario (cooperative), or
 * two teams against each other's leader (competitive). It is its own field and not a `PlayModes` flag: `PlayModes` is
 * how hard one table's game is, and a competitive game is two tables with a mode each.
 *
 * Competitive mode is not built. `createGame` refuses it, so `"competitive"` is on a state only when a test puts it
 * there; what reads the mode (`Predicate gameMode`) is already the code a competitive game will run.
 */

import type { GameState } from "./state.js";

export type GameMode = "cooperative" | "competitive";

/** What `createGame` says, with the code `mode_unavailable`, to a setup that asks for competitive mode. */
export const COMPETITIVE_MODE_UNAVAILABLE_MESSAGE =
  "Competitive mode is coming soon. Play this scenario cooperatively for now.";

/** The mode of a game. `GameState.gameMode` is absent in a cooperative game, which is every game before the field. */
export const gameModeOf = (state: GameState): GameMode => state.gameMode ?? "cooperative";
