import { describe, expect, test } from "vitest";
import type { SessionConfig } from "../engine/host.js";
import { cardsRandomizer } from "./civil-war-random.js";
import { rematchActionsOf, rematchConfigOf } from "./game-over-model.js";

const PLAYERS = [{ starterDeckId: "core-spider-man-justice" }];
const RHINO: SessionConfig = { scenarioId: "rhino", difficulty: "standard", players: PLAYERS, seed: 5 };
const IRON = "registration-iron-man";
const CUSTOM: SessionConfig = {
  scenarioId: IRON,
  difficulty: "standard",
  players: PLAYERS,
  seed: 5,
  mainSchemeStageIds: ["a", "b"],
  modularSetIds: ["s1", "s2", "s3"],
  gameMode: "cooperative",
  blind: true,
};
const RANDOM: SessionConfig = { ...CUSTOM, randomScenario: true };

describe("the Game Over rematch actions", () => {
  test("an ordinary game keeps its two buttons and their words", () => {
    expect(rematchActionsOf(RHINO).map((a) => a.label)).toEqual(["Run it back", "Same seed, same hands"]);
    expect(rematchActionsOf(null).map((a) => a.kind)).toEqual(["fresh", "sameSeed"]);
  });

  test("a custom Civil War game offers Play again, and New random scenario only when it began as Random", () => {
    expect(rematchActionsOf(CUSTOM).map((a) => a.label)).toEqual(["Play again", "Same seed, same hands"]);
    expect(rematchActionsOf(RANDOM).map((a) => [a.kind, a.label])).toEqual([
      ["fresh", "Play again"],
      ["newRandom", "New random scenario"],
      ["sameSeed", "Same seed, same hands"],
    ]);
  });

  test("Play again keeps the leader, stages, sets and blind, with a new seed; Same seed changes nothing", () => {
    expect(rematchConfigOf(RANDOM, "fresh", 99, cardsRandomizer)).toEqual({ ...RANDOM, seed: 99 });
    expect(rematchConfigOf(RANDOM, "sameSeed", 99, cardsRandomizer)).toBe(RANDOM);
  });

  test("New random scenario re-rolls the picks, keeps the set count, blind and seats, and stays random", () => {
    const next = rematchConfigOf(RANDOM, "newRandom", 7, cardsRandomizer);
    const roll = cardsRandomizer({ seed: 7, modularCount: 3 });
    expect(next.scenarioId).toBe(roll.leaderId);
    expect(next.mainSchemeStageIds).toEqual(roll.stageIds);
    expect(next.modularSetIds).toEqual(roll.modularSetIds);
    expect(next.modularSetIds).toHaveLength(3);
    expect(next).toMatchObject({ blind: true, randomScenario: true, players: PLAYERS, seed: 8 });
  });

  test("a refused roll falls back to the same picks with a new seed", () => {
    const refuse = () => {
      throw new Error("no");
    };
    expect(rematchConfigOf(RANDOM, "newRandom", 7, refuse)).toEqual({ ...RANDOM, seed: 7 });
  });
});
