/**
 * Log lines touched by wave 10 (docs/phase7-wave10.md §3.2): a main scheme advance names the stage's printed number,
 * not its index in the card. The two differ on a card holding several stages of one number (Civil War's `registration`
 * and `resistance`), where a game plays two chosen stages out of eight.
 */

import { beforeAll, describe, expect, test } from "vitest";
import type { GameEvent, GameState, PlayerId } from "@mc/engine";
import { POOL_DEPS } from "../content/pool.js";
import { LocalEngineHost } from "../engine/local-host.js";
import { SessionStore } from "../store/session-store.js";
import { logLine } from "./log-lines.js";

let state: GameState;
let me: PlayerId;

beforeAll(async () => {
  const store = new SessionStore(new LocalEngineHost());
  await store.start({
    scenarioId: "klaw",
    difficulty: "standard",
    players: [{ starterDeckId: "core-spider-man-justice" }],
    seed: 3,
  });
  state = store.state.game!;
  me = store.state.perspectiveId!;
}, 30_000);

const text = (event: GameEvent, game: GameState = state): string | undefined =>
  logLine(event, game, me, POOL_DEPS)?.text;

describe("mainSchemeAdvanced", () => {
  test("a card whose stages are numbered in order reads as before", () => {
    expect(text({ type: "mainSchemeAdvanced", stageIndex: 1 })).toBe("The main scheme advances to stage 2.");
  });

  test("the printed stage number is named when it is not the index plus one", () => {
    const card = state.cardPool[state.mainScheme.cardId]!;
    if (card.type !== "main_scheme") throw new Error("not a main scheme");
    const [first, second] = card.stages;
    // Eight stages numbered as the Civil War cards are: index 6 is a stage 2.
    const numbers = [1, 2, 1, 2, 1, 1, 2, 2];
    const stages = numbers.map((stageNumber, index) => ({ ...(index === 0 ? first : second!), stageNumber }));
    const game: GameState = {
      ...state,
      cardPool: { ...state.cardPool, [card.id]: { ...card, stages: [stages[0]!, ...stages.slice(1)] } },
    };
    expect(text({ type: "mainSchemeAdvanced", stageIndex: 6 }, game)).toBe("The main scheme advances to stage 2.");
  });
});
