/**
 * The debrief of a God of Lies game describes Loki, God of Lies (the pod's shared dial), not the Avatar that happens to
 * be in the villain slot, and a loss to the shared scheme names Worlds Collide (docs/phase7-wave9.md section 3.66).
 */
import { describe, expect, test } from "vitest";
import { sharedScheme, sharedVillain, type GameState } from "@mc/engine";
import { POOL_DEPS } from "../content/pool.js";
import { LocalEngineHost } from "../engine/local-host.js";
import { GOD_OF_LIES_CONFIG } from "../store/dev-god-of-lies-game.js";
import { SessionStore } from "../store/session-store.js";
import { gameOverModel } from "./game-over-model.js";

async function fixture() {
  const store = new SessionStore(new LocalEngineHost());
  await store.start(GOD_OF_LIES_CONFIG);
  const game = store.state.game!;
  return { game, record: store.state.record, config: store.state.config };
}

describe("the God of Lies debrief", () => {
  test("a loss to Worlds Collide names Loki's dial and the shared scheme, never an Avatar's stage", async () => {
    const { game, record, config } = await fixture();
    const worlds = sharedScheme(game)!.instanceId!;
    const lost: GameState = {
      ...game,
      outcome: { result: "loss", reason: "cardAbility", sourceInstanceId: worlds },
      pod: { ...game.pod!, shared: { ...game.pod!.shared!, schemeThreat: 2 } },
    };
    const loki = sharedVillain(lost)!;
    const model = gameOverModel(lost, record, config, POOL_DEPS);
    const all = [
      model.headline,
      model.summary,
      model.finalBlow?.title,
      model.finalBlow?.body,
      model.cause,
      ...model.stats.map((s) => `${s.label} ${s.value} ${s.note}`),
    ].join("\n");

    expect(model.tone).toBe("loss");
    expect(model.headline).toBe("Loki, God of Lies wins this one");
    expect(model.summary).toContain(`Loki, God of Lies at ${loki.remaining} of ${loki.hp} hit points left`);
    expect(model.finalBlow?.title).toBe("Worlds Collide ended the game");
    expect(model.finalBlow?.body).toBe("The shared threat reached 2 of 2 threat. The players lose the game.");
    expect(model.cause).toBe("Worlds Collide: 2 of 2 threat. The players lose the game.");
    expect(model.stats[0]).toMatchObject({
      label: "Loki, God of Lies",
      value: `${loki.remaining} of ${loki.hp} HP left`,
    });
    expect(all).not.toMatch(/Stage [IV]+|Avatar|Loki the /);
    expect(model.villainInstanceId).toBe(loki.instanceId);
  });

  test("a win by defeating Loki reads as his defeat, with the dial's damage", async () => {
    const { game, record, config } = await fixture();
    const shared = game.pod!.shared!;
    const won: GameState = {
      ...game,
      outcome: { result: "win", reason: "villainDefeated" },
      pod: { ...game.pod!, shared: { ...shared, villainDamage: shared.villainHp } },
    };
    const model = gameOverModel(won, record, config, POOL_DEPS);
    expect(model.tone).toBe("win");
    expect(model.kicker).toBe("The shared villain fell");
    expect(model.headline).toBe("Loki, God of Lies defeated");
    expect(model.stats[0]).toMatchObject({ label: "Loki, God of Lies", value: "Defeated" });
    expect(model.stats[0]!.note).toBe(`${shared.villainHp} damage dealt to Loki, God of Lies`);
    expect(model.finalBlow?.title).toBe("Loki, God of Lies reached 0 hit points");
  });
});
