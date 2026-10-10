/**
 * Black Widow's setup minion (MC50 p. 9: each player chooses an A.I.M. minion to put into play engaged): each tile
 * reads its own printed stats from the engine. A.I.M. Scientist (50083) prints ATK 0 / SCH 0 / HP 2, which looks like
 * a zeroed tile next to the Grunt (50073: ATK 1 / SCH 1 / HP 5) but is the card; damage reads "2/1".
 */
import { describe, expect, test } from "vitest";
import type { PlayerId } from "@mc/engine";
import { LocalEngineHost } from "../engine/local-host.js";
import { SessionStore } from "../store/session-store.js";
import { POOL_DEPS } from "../content/pool.js";
import { boardModel } from "./board-model.js";

async function withSetupMinion(name: string) {
  const store = new SessionStore(new LocalEngineHost());
  await store.start({
    scenarioId: "black-widow",
    difficulty: "standard",
    players: [{ starterDeckId: "core-spider-man-justice" }],
    seed: 3,
  });
  const choice = store.state.game!.pendingChoice!;
  await store.resolveChoice([choice.options.find((o) => o.label === name)!.optionId]);
  const me = store.state.perspectiveId as PlayerId;
  const [panel] = boardModel(store.state.game!, me, POOL_DEPS).minions;
  return panel!;
}

const stats = (panel: Awaited<ReturnType<typeof withSetupMinion>>) =>
  Object.fromEntries(panel.stats.map((s) => [s.label, s.value]));

describe("a Black Widow setup minion's tile", () => {
  test("A.I.M. Grunt: ATK 1, SCH 1, HP 5/5", async () => {
    const panel = await withSetupMinion("A.I.M. Grunt");
    expect(panel.name).toBe("A.I.M. Grunt");
    expect(stats(panel)).toEqual({ ATK: "1", SCH: "1", HP: "5/5" });
  });

  test("A.I.M. Scientist: printed ATK 0, SCH 0, HP 2/2, with no buff chips", async () => {
    const panel = await withSetupMinion("A.I.M. Scientist");
    expect(stats(panel)).toEqual({ ATK: "0", SCH: "0", HP: "2/2" });
    expect(panel.stats.every((s) => s.bonus === 0)).toBe(true);
    expect(panel.hp).toEqual({ current: 2, max: 2 });
  });
});
