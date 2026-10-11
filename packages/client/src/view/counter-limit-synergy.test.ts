/**
 * `counterLimitsOf` derives a card's cap as the counters it holds plus the engine's `counterRoom`. Pinned against the
 * four Synergy environments of Trickster Takeover ("Max 1 [per player] synergy counters here") at 1, 2 and 3 players,
 * empty and holding one, so a change in how the engine reports the room shows here and not as a wrong "0/1" on the table.
 */
import { describe, expect, test } from "vitest";
import { getInstance, type GameState, type InstanceId } from "@mc/engine";
import { POOL_DEPS } from "../content/pool.js";
import { LocalEngineHost } from "../engine/local-host.js";
import { GOD_OF_LIES_CONFIG } from "../store/dev-god-of-lies-game.js";
import { SessionStore } from "../store/session-store.js";
import { counterLimitsOf } from "./counter-limit.js";

const SYNERGY_ENVIRONMENTS = ["Domineering Force", "Feigned Retreat", "Mounting Resistance", "Unified Front"];

const DECKS = ["core-spider-man-justice", "storm-leadership", "rogue-protection"];

async function gameOf(players: number): Promise<GameState> {
  const store = new SessionStore(new LocalEngineHost());
  await store.start({
    ...GOD_OF_LIES_CONFIG,
    players: DECKS.slice(0, players).map((starterDeckId) => ({ starterDeckId })),
  });
  if (!store.state.game) throw new Error(`no game: ${store.state.error}`);
  return store.state.game;
}

const environmentsOf = (game: GameState): readonly InstanceId[] =>
  Object.values(game.instances)
    .filter((instance) => SYNERGY_ENVIRONMENTS.includes(game.cardPool[instance.cardId]?.name ?? ""))
    .map((instance) => instance.instanceId);

describe("the synergy limit, read from the engine's counter room", () => {
  test.each([1, 2, 3])(
    "at %i player(s) each of the four environments reads its own cap, held or not",
    async (players) => {
      const game = await gameOf(players);
      const ids = environmentsOf(game);
      expect(ids).toHaveLength(4);
      const caps = ids.map((id) => counterLimitsOf(game, id, POOL_DEPS).synergy);
      // "Max 1 synergy counter here" for one hero; the pooled text scales per player, so every environment agrees.
      expect(new Set(caps).size).toBe(1);
      expect(caps[0]).toBe(players);
      // Holding a counter does not move the cap: held plus the room left stays the same number.
      const held = ids[0]!;
      const withOne: GameState = {
        ...game,
        instances: {
          ...game.instances,
          [held]: { ...getInstance(game, held)!, counters: { synergy: 1 } },
        },
      };
      expect(counterLimitsOf(withOne, held, POOL_DEPS).synergy).toBe(caps[0]);
    },
  );
});
