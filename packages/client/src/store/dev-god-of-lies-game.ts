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
 * - `&at=swap`: the `ready` state plus one real basic attack on the Avatar, so the shatter has run: Loki's dial has the
 *   damage, a different Avatar is in the villain slot and the log shows the swap. (The first version of this mode
 *   played on with greedy basic attacks from round 1 and lost to Worlds Collide before the Avatar ever fell.) Same
 *   state surgery as `ready`, so it does not replay from a log either.
 */
import { maxHitPoints, sharedVillain, type GameState } from "@mc/engine";
import { POOL_DEPS } from "../content/pool.js";
import { DevStateHost } from "../engine/dev-state-host.js";
import { appSession, useDevHost } from "../session.js";
import type { SessionConfig } from "../engine/host.js";
import { SessionStore } from "./session-store.js";
import { nextTurn } from "./dev-game-steps.js";

export const GOD_OF_LIES_CONFIG: SessionConfig = {
  scenarioId: "god-of-lies",
  difficulty: "standard",
  players: [{ starterDeckId: "core-spider-man-justice" }],
  seed: 7,
};

/** Loki's dial has taken damage: the Avatar fell and the Shatter the Illusion ability ran. */
export const lokiHasTakenDamage = (game: GameState): boolean => (sharedVillain(game)?.damage ?? 0) > 0;

/** Starts `GOD_OF_LIES_CONFIG`; `until: "ready"` / `"swap"` build the state-surgery fixtures described above. */
export async function startGodOfLiesGame(
  store: SessionStore,
  until: "start" | "swap" | "ready" = "start",
): Promise<void> {
  if (until === "ready") return startReadyGame(store, false);
  if (until === "swap") return startReadyGame(store, true);
  await store.start(GOD_OF_LIES_CONFIG);
  await nextTurn(store);
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

/** The one real basic attack of the `swap` fixture, made through `store` (the hero is in hero form, not exhausted). */
async function attackTheAvatar(store: SessionStore): Promise<void> {
  const turn = await nextTurn(store);
  const attack = turn?.legal.find((entry) => entry.action.kind === "basicAttack");
  if (!attack) throw new Error("the ready fixture offers no basic attack");
  await store.dispatch(attack.example);
  await nextTurn(store);
}

/**
 * The ready state with one real basic attack made on the Avatar, played through a store on a `DevStateHost`: the attack
 * does 1 damage, the Avatar's last hit point, so it flips, shatters and is swapped, all by the engine's own rules.
 * Returns the state after the swap.
 */
export async function swapFixtureState(store: SessionStore): Promise<GameState> {
  const playing = new SessionStore(new DevStateHost(await readyFixtureState(store), POOL_DEPS));
  await playing.start(GOD_OF_LIES_CONFIG);
  await attackTheAvatar(playing);
  const game = playing.state.game;
  if (!game) throw new Error("the God of Lies swap fixture lost its game");
  return game;
}

async function startReadyGame(store: SessionStore, swapped: boolean): Promise<void> {
  const state = await readyFixtureState(store);
  useDevHost(new DevStateHost(state, POOL_DEPS));
  // The host swap makes a new store: the one before it is stale (the spec reads this one).
  const live = appSession().store;
  (window as unknown as { __mcGodOfLies?: unknown }).__mcGodOfLies = { store: live };
  await live.start(GOD_OF_LIES_CONFIG);
  // The attack goes through the app's own store, so the log shows the shatter and the swap like a game played by hand.
  if (swapped) await attackTheAvatar(live);
}
