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
 *
 * `&at=` picks a variant for the two "must play it" prompts (owner rulings 62B and 63B, `playFromHand.mustPay`): the
 * deck is stacked (`SetupStack`, never a state edit) so the hand and the draws are known.
 * - `call-pay` / `call-none`: round 1's turn with Alluring Call on the identity and a hand that can (Daredevil, Jessica
 *   Jones and the resource cards that pay for them) or cannot (resource cards, and Haymaker in alter-ego form) play a
 *   card;
 * - `greed-pay` / `greed-none`: round 4's turn with the Gaze flipped to Trance of Greed and its Forced Action owed; the
 *   card it draws is a Daredevil that the hand can pay for, or a Haymaker in alter-ego form that cannot be played.
 */
import { cardId } from "@mc/content";
import type { GameState } from "@mc/engine";
import type { SessionConfig } from "../engine/host.js";
import { nextTurn } from "./dev-game-steps.js";
import type { SessionStore } from "./session-store.js";

export type EnchantressAt = "start" | "call-pay" | "call-none" | "greed-pay" | "greed-none";

const baseConfig = (encounter: readonly string[], players?: readonly string[]): SessionConfig => ({
  scenarioId: "enchantress",
  difficulty: "standard",
  players: [{ starterDeckId: "core-spider-man-justice" }],
  seed: 2,
  stack: {
    encounter: encounter.map((code) => cardId(code)),
    ...(players ? { players: { 0: players.map((code) => cardId(code)) } } : {}),
  },
});

// Advance, Crown of the Enchantress, Assault, Kiss of Temptation, Advance, Seduced, Assault, Love Concoction.
const ROUNDS = ["01186", "55016", "01187", "55013", "01186", "55015", "01187", "55014"];

export const ENCHANTRESS_CONFIG: SessionConfig = baseConfig(ROUNDS);

/** The top of the player's deck, first card first (the opening hand is the first six). */
const HAND_PAYS = ["01058", "01059", "01088", "01089", "01090", "01062"]; // Daredevil 4, Jessica Jones 3, 4 resources
const HAND_NONE = ["01062", "01062", "01088", "01089", "01090", "01087"]; // 5 resource cards and Haymaker

/**
 * The Spider-Man starter deck in a fixed order (`core-spider-man-justice`), with Daredevil (cost 4) at `daredevilAt`: the
 * card the Trance of Greed draws on round 4 (counted by playing the fixture forward, as the doc above says).
 */
const DECK_ORDER = [
  // Three cards the Kiss discards first, then the five resource cards that stay in hand and pay for Daredevil.
  ..."01002 01003 01003 01062 01062 01088 01089 01090".split(" "),
  ..."01004 01004 01005 01005 01005 01006 01007 01007 01008 01008 01009 01009".split(" "),
  ..."01059 01060 01060 01061 01061 01063 01063 01064 01064 01065 01065".split(" "),
  ..."01083 01084 01085 01086 01087 01091 01092 01093".split(" "),
];
const GREED_DAREDEVIL_AT = 8;
const GREED_PAY_STACK = [...DECK_ORDER.slice(0, GREED_DAREDEVIL_AT), "01058", ...DECK_ORDER.slice(GREED_DAREDEVIL_AT)];

export function enchantressConfigFor(at: EnchantressAt): SessionConfig {
  if (at === "greed-pay") return baseConfig(ROUNDS, GREED_PAY_STACK);
  if (at === "call-pay") return baseConfig(["01186", "55012"], HAND_PAYS);
  if (at === "call-none") return baseConfig(["01186", "55012"], HAND_NONE);
  return ENCHANTRESS_CONFIG;
}

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

/** Starts the game and plays it forward; `at` stops it at one of the "must play it" prompts (see the file comment). */
export async function startEnchantressGame(store: SessionStore, at: EnchantressAt = "start"): Promise<void> {
  await store.start(enchantressConfigFor(at));
  if (at === "call-pay" || at === "call-none") {
    // Answer the mulligan (keep the dealt hand), end round 1's turn: the villain phase reveals the Call onto the identity.
    const turn = await nextTurn(store);
    const end = turn?.legal.find((entry) => entry.action.kind === "endTurn");
    if (end) await store.dispatch(end.example);
    await nextTurn(store);
    return;
  }
  for (let step = 0; step < 100; step++) {
    const turn = await nextTurn(store);
    const game = store.state.game;
    if (!turn || !game || game.outcome) return;
    if (enchantressFixtureReachedBoundary(game)) break;
    const flip = turn.legal.find((entry) => entry.action.kind === "changeForm");
    if (flip && game.players[0]!.identity.form === "alterEgo") {
      await store.dispatch(flip.example);
      continue;
    }
    const end = turn.legal.find((entry) => entry.action.kind === "endTurn");
    if (!end) return;
    await store.dispatch(end.example);
  }
  if (at === "start") return;
  // Greed: use the Kiss on round 3 and again on round 4 (its fifth counter flips the Gaze), then stop with the Trance owed.
  for (let use = 0; use < 2; use++) {
    const turn = await nextTurn(store);
    const forced = turn?.legal.find(
      (entry) => entry.action.kind === "useAbility" && /forced-action/.test(entry.action.abilityId),
    );
    if (!turn || !forced) return;
    await store.dispatch(forced.example);
    const next = await nextTurn(store);
    if (use === 1 || !next) break;
    const end = next.legal.find((entry) => entry.action.kind === "endTurn");
    if (!end) return;
    await store.dispatch(end.example);
  }
}
