/**
 * The `?screen=board&fixture=god-of-lies` dev jump (`scenes/boot.ts`): a real God of Lies game (Trickster Takeover,
 * Spider-Man, Justice; Single Group Mode with the neutral play area, `pod.ts`) played forward through the store with
 * the engine's own commands, never a state edit, so it replays byte for byte like any saved game.
 *
 * - `&at=start` (the default): round 1's player turn, Loki, God of Lies and Worlds Collide in the neutral area, the
 *   Avatar in the villain slot, the four Synergy environments at 0 of 1.
 * - `&at=ready`: round 1, Spider-Man in hero form and the Avatar one hit from falling with 2 shatter counters on it.
 *   Attacking it places 5 more, flips it to its Fading Figment and shatters it: Loki's shared dial takes all 7, a
 *   different Avatar is swapped in and the Synergy environment named on the Figment's reverse takes a counter. Built by
 *   state surgery on a real game's first turn (`DevStateHost`), so unlike the other two it does not replay from a log.
 * - `&at=swap`: plays on with basic attacks until the first Avatar is swapped out; the greedy hero usually loses to
 *   Worlds Collide first (a 2-threat target), so this is for the log and the game over screen.
 */
import { getInstance, maxHitPoints, sharedVillain, type GameState } from "@mc/engine";
import { POOL_DEPS } from "../content/pool.js";
import { DevStateHost } from "../engine/dev-state-host.js";
import { appSession, useDevHost } from "../session.js";
import type { SessionConfig } from "../engine/host.js";
import { nextTurn } from "./dev-game-steps.js";
import type { SessionStore } from "./session-store.js";

export const GOD_OF_LIES_CONFIG: SessionConfig = {
  scenarioId: "god-of-lies",
  difficulty: "standard",
  players: [{ starterDeckId: "core-spider-man-justice" }],
  seed: 7,
};

/** Loki's dial has taken damage: the Avatar fell and the Shatter the Illusion ability ran. */
export const lokiHasTakenDamage = (game: GameState): boolean => (sharedVillain(game)?.damage ?? 0) > 0;

/** Starts `GOD_OF_LIES_CONFIG`; with `until: "swap"`, plays on with basic attacks until the first Avatar is swapped out. */
export async function startGodOfLiesGame(
  store: SessionStore,
  until: "start" | "swap" | "ready" = "start",
): Promise<void> {
  if (until === "ready") return startReadyGame(store);
  await store.start(GOD_OF_LIES_CONFIG);
  if (until === "start") {
    await nextTurn(store);
    return;
  }
  for (let step = 0; step < 400; step++) {
    const turn = await nextTurn(store);
    const game = store.state.game;
    if (!turn || !game || game.outcome) return;
    if (lokiHasTakenDamage(game)) return;
    const hero = game.players[0]!;
    const flip = turn.legal.find((entry) => entry.action.kind === "changeForm");
    if (flip && hero.identity.form === "alterEgo") {
      await store.dispatch(flip.example);
      continue;
    }
    const attack = turn.legal.find((entry) => entry.action.kind === "basicAttack");
    if (attack && !getInstance(game, hero.identity.instanceId)?.exhausted) {
      await store.dispatch(attack.example);
      continue;
    }
    const end = turn.legal.find((entry) => entry.action.kind === "endTurn");
    if (!end) return;
    await store.dispatch(end.example);
  }
}

/** The Avatar one hit from falling with 2 shatter counters, the hero in hero form: state surgery on a real first turn. */
export async function readyFixtureState(store: SessionStore): Promise<GameState> {
  await store.start(GOD_OF_LIES_CONFIG);
  const turn = await nextTurn(store);
  const flip = turn?.legal.find((entry) => entry.action.kind === "changeForm");
  if (flip) await store.dispatch(flip.example);
  await nextTurn(store);
  const game = store.state.game;
  if (!game) throw new Error("the God of Lies game did not start");
  const avatar = game.activeVillainId;
  const instance = game.instances[avatar]!;
  const instances = {
    ...game.instances,
    [avatar]: {
      ...instance,
      damage: (maxHitPoints(game, avatar, POOL_DEPS) ?? 15) - 1,
      counters: { ...instance.counters, shatter: 2 },
    },
  };
  return { ...game, instances } as GameState;
}

async function startReadyGame(store: SessionStore): Promise<void> {
  const state = await readyFixtureState(store);
  useDevHost(new DevStateHost(state, POOL_DEPS));
  // The host swap makes a new store: the one before it is stale (the spec reads this one).
  (window as unknown as { __mcGodOfLies?: unknown }).__mcGodOfLies = { store: appSession().store };
  await appSession().store.start(GOD_OF_LIES_CONFIG);
}
