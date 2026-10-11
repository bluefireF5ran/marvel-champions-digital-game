/**
 * The `?screen=board&fixture=enchantress` dev jump (`scenes/boot.ts`): a real Enchantress game (Trickster Takeover,
 * Spider-Man, Justice) stopped at round 3's player turn, for the three mechanics the client had to learn with that
 * scenario (hidden reverse sides, Forced Actions, each-player costs). Played forward through the store with a stacked
 * encounter deck and the engine's own commands, never a state edit, so it replays byte for byte like any saved game.
 *
 * The stack puts a quiet card (no boost icon) under each card that matters; a round draws the attack's boost, then the
 * reveal:
 *
 * - round 1: Crown of the Enchantress attaches to Enchantress (its Hero Action costs each player an exhausted identity
 *   and 1 damage);
 * - round 2: Kiss of Temptation attaches to the hero's identity: its Forced Action (exhaust: place a charm counter, draw
 *   1, discard 1) is owed on every turn it is ready;
 * - round 3 (where this stops): the Gaze holds 2 charm counters, still hidden; the Kiss is owed, so End Turn is refused.
 *   Using the Kiss each turn (and Enchantress's attack) brings the Gaze to its fifth counter on round 4;
 * - round 4: Seduced is revealed (no basic attacks).
 */
import { cardId } from "@mc/content";
import type { GameState } from "@mc/engine";
import type { SessionConfig } from "../engine/host.js";
import { nextTurn } from "./dev-game-steps.js";
import type { SessionStore } from "./session-store.js";

export const ENCHANTRESS_CONFIG: SessionConfig = {
  scenarioId: "enchantress",
  difficulty: "standard",
  players: [{ starterDeckId: "core-spider-man-justice" }],
  seed: 2,
  stack: {
    encounter: [
      // Advance, Crown of the Enchantress, Assault, Kiss of Temptation, Advance, Seduced, Assault, Love Concoction.
      ...["01186", "55016", "01187", "55013", "01186", "55015", "01187", "55014"].map((code) => cardId(code)),
    ],
  },
};

/** The Kiss of Temptation's card code, attached to the hero's identity at the boundary. */
export const KISS = "55013";
export const CROWN = "55016";
export const SEDUCED = "55015";

/** Round 3, the hero's turn, with the Kiss of Temptation on the identity and the Crown on Enchantress. */
export function enchantressFixtureReachedBoundary(game: GameState): boolean {
  const me = game.players[0];
  if (!me || game.round < 3) return false;
  const onMe = game.instances[me.identity.instanceId]?.attachments ?? [];
  return onMe.some((id) => (game.instances[id]?.cardId as string) === KISS);
}

/** Starts `ENCHANTRESS_CONFIG`, changes to hero form on round 1 (so Enchantress attacks), and ends turns to round 3. */
export async function startEnchantressGame(store: SessionStore): Promise<void> {
  await store.start(ENCHANTRESS_CONFIG);
  for (let step = 0; step < 100; step++) {
    const turn = await nextTurn(store);
    const game = store.state.game;
    if (!turn || !game || game.outcome) return;
    if (enchantressFixtureReachedBoundary(game)) return;
    const flip = turn.legal.find((entry) => entry.action.kind === "changeForm");
    if (flip && game.players[0]!.identity.form === "alterEgo") {
      await store.dispatch(flip.example);
      continue;
    }
    const end = turn.legal.find((entry) => entry.action.kind === "endTurn");
    if (!end) return;
    await store.dispatch(end.example);
  }
}
