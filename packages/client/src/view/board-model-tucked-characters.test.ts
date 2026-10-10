/**
 * Cards tucked under an identity or a minion (RRG 1.8 "Tuck", p. 45): Silk's identity (`silk-protection`) and Zaran in
 * the Batroc scenario. The view model reads `CardInstance.tucked` and never names a card; a facedown tucked card stays
 * a card back. Inspect lists them and steps through them.
 */
import { beforeAll, describe, expect, test } from "vitest";
import { activeEncounterDeck, type GameState, type InstanceId } from "@mc/engine";
import { LocalEngineHost } from "../engine/local-host.js";
import { SessionStore } from "../store/session-store.js";
import { POOL_DEPS } from "../content/pool.js";
import { boardModel, tuckedLine } from "./board-model.js";
import { inspectModel } from "./inspect-model.js";
import { placementNotes, tuckedSiblings } from "./inspect-notes.js";

let state: GameState;
let me: NonNullable<SessionStore["state"]["perspectiveId"]>;

beforeAll(async () => {
  const store = new SessionStore(new LocalEngineHost());
  await store.start({
    scenarioId: "batroc",
    difficulty: "standard",
    players: [{ starterDeckId: "silk-protection" }],
    seed: 4,
  });
  state = store.state.game!;
  me = store.state.perspectiveId!;
}, 120_000);

/** `host` with the first two set-aside cards under it, the second facedown. */
function withTucked(host: InstanceId): { staged: GameState; first: InstanceId; second: InstanceId } {
  const [first, second] = state.encounterSetAside.slice(0, 2) as [InstanceId, InstanceId];
  const staged: GameState = {
    ...state,
    instances: {
      ...state.instances,
      [host]: { ...state.instances[host]!, tucked: [first, second] },
      [first]: { ...state.instances[first]!, faceup: true },
      [second]: { ...state.instances[second]!, faceup: false },
    },
  };
  return { staged, first, second };
}

describe("an identity with cards tucked under it", () => {
  test("shows the count, and names a faceup card but never a facedown one", () => {
    const identity = state.players[0]!.identity.instanceId;
    const { staged, first, second } = withTucked(identity);
    const panel = boardModel(staged, me, POOL_DEPS).me;
    expect(panel.tuckedCount).toBe(2);
    expect(panel.tucked.map((card) => card.instanceId)).toEqual([first, second]);
    expect(panel.tucked.map((card) => card.faceup)).toEqual([true, false]);
    expect(panel.tucked[1]).toMatchObject({ name: "Facedown card", art: null });
    expect(tuckedLine(panel, false)).toBe("UNDER 2");
    expect(tuckedLine(panel, true)).toBe(`UNDER 2 · ${panel.tucked[0]!.name}, Facedown card`);
  });

  test("an identity with nothing under it says nothing", () => {
    const panel = boardModel(state, me, POOL_DEPS).me;
    expect(panel).toMatchObject({ tucked: [], tuckedCount: 0 });
    expect(tuckedLine(panel, true)).toBe("");
  });

  test("Inspect lists them under the host, and ◂ ▸ steps host then tucked cards", () => {
    const identity = state.players[0]!.identity.instanceId;
    const { staged, first, second } = withTucked(identity);
    const notes = placementNotes(staged, identity);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/^Under it: .+, Facedown card$/);
    expect(inspectModel(staged, identity, null, me, POOL_DEPS).areaNotes).toEqual(notes);
    expect(tuckedSiblings(staged, identity)).toEqual([identity, first, second]);
    // From a tucked card the same list, and its own sheet says where it is.
    expect(tuckedSiblings(staged, first)).toEqual([identity, first, second]);
    expect(placementNotes(staged, first)[0]).toMatch(/^Tucked under .+: not in play$/);
    expect(tuckedSiblings(state, identity)).toEqual([]);
  });
});

describe("a minion with a card tucked under it", () => {
  test("the minion's own tile carries the count", async () => {
    // Thunderbolts puts two minions on the table at setup (one held, one engaged).
    const store = new SessionStore(new LocalEngineHost());
    await store.start({
      scenarioId: "thunderbolts",
      difficulty: "standard",
      players: [{ starterDeckId: "core-spider-man-justice" }],
      seed: 5,
    });
    const game = store.state.game!;
    const seat = store.state.perspectiveId!;
    const minion = boardModel(game, seat, POOL_DEPS).minions[0]!.instanceId;
    const [first, second] = activeEncounterDeck(game).deck.slice(0, 2) as [InstanceId, InstanceId];
    const staged: GameState = {
      ...game,
      instances: {
        ...game.instances,
        [minion]: { ...game.instances[minion]!, tucked: [first, second] },
        [first]: { ...game.instances[first]!, faceup: true },
      },
    };
    const panel = boardModel(staged, seat, POOL_DEPS).minions.find((m) => m.instanceId === minion)!;
    expect(panel.tuckedCount).toBe(2);
    expect(panel.tucked[0]!.instanceId).toBe(first);
  }, 120_000);
});
