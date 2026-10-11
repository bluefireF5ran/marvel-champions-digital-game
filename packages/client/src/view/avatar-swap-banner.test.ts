import { describe, expect, test } from "vitest";
import { POOL_DEPS } from "../content/pool.js";
import { DevStateHost } from "../engine/dev-state-host.js";
import { LocalEngineHost } from "../engine/local-host.js";
import { GOD_OF_LIES_CONFIG, readyFixtureState } from "../store/dev-god-of-lies-game.js";
import { SessionStore } from "../store/session-store.js";
import { avatarSwapAnnouncements } from "./avatar-swap-banner.js";

describe("the Avatar swap announcement", () => {
  test("the shatter names the Avatar that fell, its replacement and the damage Loki took", async () => {
    const state = await readyFixtureState(new SessionStore(new LocalEngineHost()));
    const store = new SessionStore(new DevStateHost(state, POOL_DEPS));
    await store.start(GOD_OF_LIES_CONFIG);
    const turn = store.state.legal!.actions;
    if (turn.kind !== "turn") throw new Error("the fixture is not at a turn");
    const { pod: _pod, ...withoutPod } = store.state.game!;
    await store.dispatch(turn.legal.find((entry) => entry.action.kind === "basicAttack")!.example);
    const events = [...(store.state.lastEvents ?? [])];
    for (let guard = 0; guard < 20; guard++) {
      const actions = store.state.legal?.actions;
      if (actions?.kind !== "choice") break;
      await store.resolveChoice(
        actions.choice.options
          .slice(0, actions.choice.minSelections)
          .map((option: { optionId: string }) => option.optionId),
      );
      events.push(...(store.state.lastEvents ?? []));
    }
    const [swap, ...rest] = avatarSwapAnnouncements(events, store.state.game!);
    expect(rest).toEqual([]);
    expect(swap!.title).toMatch(/^Loki the \w+ shatters$/);
    expect(swap!.detail).toMatch(/^Loki the \w+ takes its place\. Loki, God of Lies takes 7 damage$/);
    expect(swap!.title).not.toContain(swap!.detail.split(" takes")[0]!);
    // A game with no neutral villain, and a command with no swap, announce nothing.
    expect(avatarSwapAnnouncements(events, withoutPod)).toEqual([]);
    expect(avatarSwapAnnouncements([], store.state.game!)).toEqual([]);
  }, 60_000);
});
