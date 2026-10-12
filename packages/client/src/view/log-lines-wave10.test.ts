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

describe("choiceResolved on the enemy team's behalf (MC56 p. 6)", () => {
  const behalf = { kind: "enemyTeam", teamId: "team-1", facingPlayerId: null } as never;
  const requested = (): GameEvent =>
    ({
      type: "choiceRequested",
      choice: {
        choiceId: "c1",
        playerId: me,
        prompt: { kind: "chooseTarget" },
        minSelections: 1,
        maxSelections: 1,
        options: [
          { optionId: "a", label: "Stark Tower", ref: { kind: "none" } },
          { optionId: "b", label: "Avengers Mansion", ref: { kind: "none" } },
        ],
        frameId: null,
        ordered: false,
        soleDecider: false,
        authority: "enemyTeam",
        onBehalfOf: behalf,
      },
    }) as unknown as GameEvent;
  const resolved = (ids: string[], playerId: PlayerId = me): GameEvent =>
    ({
      type: "choiceResolved",
      choiceId: "c1",
      playerId,
      selectedOptionIds: ids,
      onBehalfOf: behalf,
    }) as unknown as GameEvent;
  const line = (event: GameEvent, events: GameEvent[]) =>
    logLine(event, state, me, POOL_DEPS, false, undefined, { events, at: events.indexOf(event) })?.text;

  test("names who decided and what the enemy team chose", () => {
    const done = resolved(["a"]);
    expect(line(done, [requested(), done])).toBe("The enemy team (decided by You) chose Stark Tower.");
    const other = resolved(["a", "b"], "player-ana" as PlayerId);
    expect(line(other, [requested(), other])).toBe(
      "The enemy team (decided by player-ana) chose Stark Tower and Avengers Mansion.",
    );
  });

  test("without the request in view, only who decided", () => {
    expect(text(resolved(["a"]))).toBe("The enemy team's choice was decided by You.");
  });

  test("an ordinary choice resolving is not logged", () => {
    expect(
      text({ type: "choiceResolved", choiceId: "c1", playerId: me, selectedOptionIds: ["a"] } as unknown as GameEvent),
    ).toBeUndefined();
  });
});
