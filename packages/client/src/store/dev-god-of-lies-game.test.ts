import { sharedVillain } from "@mc/engine";
import { describe, expect, test } from "vitest";
import { LocalEngineHost } from "../engine/local-host.js";
import { readyFixtureState, startGodOfLiesGame } from "./dev-god-of-lies-game.js";
import { SessionStore } from "./session-store.js";

describe("the God of Lies dev fixtures", () => {
  test("start: round 1's turn, nothing shattered, Loki whole", async () => {
    const store = new SessionStore(new LocalEngineHost());
    await startGodOfLiesGame(store, "start");
    const game = store.state.game!;
    expect(game.round).toBe(1);
    expect(sharedVillain(game)).toMatchObject({ hp: 20, damage: 0, flipped: false });
    expect(store.state.legal?.actions.kind).toBe("turn");
  });

  test("ready: the Avatar is one hit from falling with 2 shatter counters, the hero in hero form", async () => {
    const game = await readyFixtureState(new SessionStore(new LocalEngineHost()));
    const avatar = game.instances[game.activeVillainId]!;
    expect(avatar.counters["shatter"]).toBe(2);
    expect(avatar.damage).toBe(14);
    expect(game.players[0]!.identity.form).toBe("hero");
    expect(sharedVillain(game)!.damage).toBe(0);
  });
});
