/**
 * A seat that sat a scenario out (owner decision 66B) is not a defeat: the record takes back the elimination the
 * sit-out is built on, and the debrief of a win reads it as "Sat out", counts the heroes who played, and lists no
 * hero down.
 */
import { describe, expect, test } from "vitest";
import { CORE_DEPS, coreScenario } from "@mc/cards";
import { createGame, type GameEvent, type GameState } from "@mc/engine";
import { emptyRecord, recordEvents } from "../engine/game-record.js";
import { gameOverModel } from "./game-over-model.js";

function twoSeatGame(): GameState {
  const result = createGame(
    coreScenario("rhino", {
      players: [{ starterDeckId: "core-spider-man-justice" }, { starterDeckId: "core-she-hulk-aggression" }],
      seed: 2026,
    }),
    CORE_DEPS,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

describe("a seat that sat the scenario out", () => {
  const start = twoSeatGame();
  const sitter = start.players[1]!.playerId;
  const events: GameEvent[] = [
    { type: "playerEliminated", playerId: sitter },
    { type: "playerSatOut", playerId: sitter, startingPlayerCount: 1 },
  ];
  const state: GameState = {
    ...start,
    startingPlayerCount: 1,
    players: start.players.map((player) =>
      player.playerId === sitter ? { ...player, eliminated: true, sittingOut: true } : player,
    ),
    outcome: { result: "win", reason: "villainDefeated" },
  };
  const record = recordEvents(emptyRecord(), events, state);

  test("the record keeps no defeat for it, and marks it as sat out", () => {
    const seat = record.seats.find((entry) => entry.playerId === sitter)!;
    expect(seat.defeatedInRound).toBeNull();
    expect(seat.satOut).toBe(true);
    expect(record.lastEliminated).toBeNull();
    expect(record.rounds.flatMap((round) => round.heroesDefeated)).toEqual([]);
  });

  test("a plain elimination is still a defeat", () => {
    const plain = recordEvents(emptyRecord(), [events[0]!], state);
    expect(plain.seats.find((entry) => entry.playerId === sitter)!.defeatedInRound).not.toBeNull();
  });

  test("the debrief of a win counts the heroes who played and shows no hero down", () => {
    const model = gameOverModel(state, record, null, CORE_DEPS);
    expect(model.tone).toBe("win");
    expect(model.meta).toMatch(/1 hero$/);
    const down = model.stats.find((stat) => stat.label === "Heroes down")!;
    expect(down.value).toBe("0 of 1");
    expect(down.note).toBe("Every hero stood to the end");
    const seat = model.seats.find((entry) => entry.name !== model.seats[0]!.name)!;
    expect(seat).toMatchObject({ detail: "Sat out", defeated: false, satOut: true });
    expect(model.seats[0]!.satOut).toBe(false);
  });
});
