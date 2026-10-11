/**
 * God of Lies log lines (docs/phase7-wave9.md sections 3.59 to 3.61, 3.66): the Avatar's shatter and swap, Loki's shared
 * hit points and Worlds Collide's shared threat. The first test plays the real fixture's shatter and reads the log the
 * player would, so a line that names the wrong card or says nothing shows here.
 */
import type { GameEvent } from "@mc/engine";
import { describe, expect, test } from "vitest";
import { POOL_DEPS } from "../content/pool.js";
import { DevStateHost } from "../engine/dev-state-host.js";
import { LocalEngineHost } from "../engine/local-host.js";
import { GOD_OF_LIES_CONFIG, readyFixtureState } from "../store/dev-god-of-lies-game.js";
import { SessionStore } from "../store/session-store.js";
import { appendEvents, emptyLog, logLine } from "./log-lines.js";

async function shatterGame(): Promise<{ readonly store: SessionStore; readonly events: readonly GameEvent[] }> {
  const state = await readyFixtureState(new SessionStore(new LocalEngineHost()));
  const store = new SessionStore(new DevStateHost(state, POOL_DEPS));
  await store.start(GOD_OF_LIES_CONFIG);
  const events: GameEvent[] = [];
  const turn = store.state.legal!.actions;
  if (turn.kind !== "turn") throw new Error("the fixture is not at a turn");
  await store.dispatch(turn.legal.find((entry) => entry.action.kind === "basicAttack")!.example);
  events.push(...(store.state.lastEvents ?? []));
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
  return { store, events };
}

describe("the shatter, read as a log", () => {
  test("the pod's events each have a line, and the lines tell the story in order", async () => {
    const { store, events } = await shatterGame();
    const game = store.state.game!;
    const me = store.state.perspectiveId!;
    const lines = events
      .filter((event) => ["sharedEventEmitted", "villainFlipped", "villainReplaced"].includes(event.type))
      .map((event) => logLine(event, game, me, POOL_DEPS)?.text);
    expect(lines).not.toContain(undefined);
    expect(lines[0]).toBe("An Avatar of Loki would be defeated: it flips to a Fading Figment.");
    expect(lines).toContain("Loki, God of Lies takes 7 damage.");
    expect(lines.some((line) => /^Loki the \w+ swaps to Loki the \w+\.$/.test(line ?? ""))).toBe(true);
    // The change of state itself repeats the event before it and says nothing.
    const changed = events.find((event) => event.type === "sharedStateChanged")!;
    expect(logLine(changed, game, me, POOL_DEPS)).toBeNull();
  });

  test("the whole burst is kept in the log, in order", async () => {
    const { store, events } = await shatterGame();
    const log = appendEvents(emptyLog(), events, store.state.game!, store.state.perspectiveId!, POOL_DEPS);
    const text = log.lines.map((line) => line.text);
    expect(text.findIndex((line) => line.startsWith("An Avatar of Loki would be defeated"))).toBeLessThan(
      text.findIndex((line) => line === "Loki, God of Lies takes 7 damage."),
    );
    expect(text.some((line) => /synergy counter/.test(line))).toBe(true);
  });
});

describe("shared results", () => {
  test("a dial set to a number says so", async () => {
    const { store } = await shatterGame();
    const game = store.state.game!;
    const text = logLine(
      { type: "hitPointsSet", instanceId: game.activeVillainId, remaining: 15, damage: 0 },
      game,
      store.state.perspectiveId!,
      POOL_DEPS,
    )?.text;
    expect(text).toMatch(/^Loki the \w+'s hit points are set to 15\.$/);
  });

  test("a flip, a completed scheme and a defeat each say what it means", async () => {
    const { store } = await shatterGame();
    const game = store.state.game!;
    const me = store.state.perspectiveId!;
    const line = (result: "sharedVillainFlipped" | "sharedVillainDefeated" | "sharedSchemeCompleted") =>
      logLine({ type: "sharedResultApplied", result }, game, me, POOL_DEPS)?.text;
    expect(line("sharedVillainFlipped")).toBe("Loki, God of Lies flips: defeat him to win the game.");
    expect(line("sharedVillainDefeated")).toBe("Loki, God of Lies is defeated.");
    expect(line("sharedSchemeCompleted")).toBe(
      "Worlds Collide is complete: defeat Loki, God of Lies or the players lose.",
    );
  });

  test("threat on the shared scheme says why it went there", async () => {
    const { store } = await shatterGame();
    const game = store.state.game!;
    const me = store.state.perspectiveId!;
    const placed = (cause: "schemeCompleted" | "identityDefeated") =>
      logLine(
        {
          type: "sharedEventEmitted",
          seq: 2,
          event: { type: "sharedSchemeThreatPlaced", groupId: "g1", amount: 1, cause } as never,
        },
        game,
        me,
        POOL_DEPS,
      )?.text;
    expect(placed("schemeCompleted")).toBe("Worlds Collide gets 1 threat instead of the scheme completing.");
    expect(placed("identityDefeated")).toBe("Worlds Collide gets 1 threat instead of a hero's defeat.");
  });
});
