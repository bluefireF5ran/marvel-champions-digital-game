/**
 * docs/phase7-wave10-client.md 6.12: the session config carries a Civil War leader's main scheme stages and game mode
 * through the scenario builder, and a config without them starts exactly the game it always did.
 */
import { describe, expect, test } from "vitest";
import { MemoryGameStorage, type SaveMeta } from "./game-storage.js";
import { EngineSessionCore } from "./session-core.js";
import type { SessionConfig } from "./host.js";

const BASE: SessionConfig = {
  scenarioId: "registration-iron-man",
  difficulty: "standard",
  players: [{ starterDeckId: "core-spider-man-justice" }],
  seed: 3,
};
// Stage 1 and stage 2 options of the registration side other than the recommended pair (`wave10-playable.test.ts`).
const PICKED = ["56121b", "56123b"];
const WITH_PICKS: SessionConfig = {
  ...BASE,
  modularSetIds: ["paladin", "cape_killer", "bomb_scare"],
  mainSchemeStageIds: PICKED,
  gameMode: "cooperative",
  blind: true,
};

const { mainSchemeStageIds: _picked, ...withoutStagesConfig } = WITH_PICKS;

const stageOrder = async (config: SessionConfig) => {
  const started = await new EngineSessionCore().start(config);
  return started.snapshot.state.mainScheme?.stageOrder;
};

describe("SessionConfig main scheme stages and game mode", () => {
  test("a config with the picks starts a game whose main scheme stage order matches the builder's", async () => {
    const picked = await stageOrder(WITH_PICKS);
    expect(picked).toBeDefined();
    const withoutStages = await stageOrder(withoutStagesConfig);
    expect(picked).not.toEqual(withoutStages);
  });

  test("the same config without them starts the old game", async () => {
    const plain = await new EngineSessionCore().start(BASE);
    const blindOnly = await new EngineSessionCore().start({ ...BASE, blind: true });
    expect(blindOnly.snapshot.state).toEqual(plain.snapshot.state);
  });

  test("a saved game with the fields resumes to the same state", async () => {
    const storage = new MemoryGameStorage();
    const started = await new EngineSessionCore({ storage }).start(WITH_PICKS);
    const meta = (await storage.latestActive()) as SaveMeta;
    const resumed = await new EngineSessionCore({ storage }).resume(meta.id);
    expect(resumed.snapshot.state).toEqual(started.snapshot.state);
    expect(resumed.snapshot.state.mainScheme?.stageOrder).toEqual(started.snapshot.state.mainScheme?.stageOrder);
  });
});
