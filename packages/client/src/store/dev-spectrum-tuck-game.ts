/**
 * The `?screen=spectrum-tuck` dev jump (`scenes/boot-dev-jump.ts`, #525 item 11): a real solo Falcon game stopped on
 * Spectrum's tuck prompt after Falcon's Flock (in play) and two hand cards paid for her, so the card choice offers the
 * Flock with the hand cards and carries the out-of-play warning. Played forward through the store with
 * `SessionConfig.stack` and the engine's own example commands, never a state edit.
 */
import { abilityId } from "@mc/content";
import type { GameState, InstanceId } from "@mc/engine";
import type { SessionConfig } from "../engine/host.js";
import { codeOf, ids, nextTurn } from "./dev-game-steps.js";
import type { SessionStore } from "./session-store.js";

const FLOCK = "53006";
const SPECTRUM = "53018";
const ENERGY = "53025";
const GENIUS = "53026";
const STRENGTH = "53027";

export const SPECTRUM_TUCK_CONFIG: SessionConfig = {
  scenarioId: "rhino",
  difficulty: "standard",
  players: [{ starterDeckId: "falcon-leadership" }],
  seed: 5201,
  stack: { players: { 0: ids(FLOCK, SPECTRUM, ENERGY, GENIUS, STRENGTH, "53024") } },
};

/** Spectrum's tuck choice is open. */
export function spectrumTuckReached(game: GameState): boolean {
  const prompt = game.pendingChoice?.prompt;
  return prompt?.kind === "chooseCards" && prompt.note !== undefined;
}

export async function startSpectrumTuckGame(store: SessionStore): Promise<void> {
  await store.start(SPECTRUM_TUCK_CONFIG);
  const handOf = (code: string): InstanceId | undefined => {
    const game = store.state.game;
    return game?.players[0]?.hand.find((id) => codeOf(game, id) === code);
  };
  let turn = await nextTurn(store);
  const flip = turn?.legal.find((entry) => entry.action.kind === "changeForm");
  if (flip) await store.dispatch(flip.example);
  turn = await nextTurn(store);
  // Falcon's Flock, paid with the [energy] card.
  const flock = turn?.legal.find((e) => e.action.kind === "playCard" && handOf(FLOCK) === e.action.instanceId);
  const energy = handOf(ENERGY);
  if (flock?.example.type !== "playCard" || !energy) return;
  await store.dispatch({ ...flock.example, payment: [{ fromHand: energy }] });
  turn = await nextTurn(store);
  const game = store.state.game;
  const flockId = game?.players[0]?.playArea.find((id) => codeOf(game, id) === FLOCK);
  const spectrum = turn?.legal.find((e) => e.action.kind === "playCard" && handOf(SPECTRUM) === e.action.instanceId);
  const genius = handOf(GENIUS);
  const strength = handOf(STRENGTH);
  if (spectrum?.example.type !== "playCard" || !flockId || !genius || !strength) return;
  // The Flock's resource ability (1 [energy]) plus Genius and Strength (2 each) = Spectrum's 5.
  await store.dispatch({
    ...spectrum.example,
    payment: [
      { ability: { instanceId: flockId, abilityId: abilityId("53006.falcons-flock-resource") } },
      { fromHand: genius },
      { fromHand: strength },
    ],
  });
  // Spectrum's granted response may ask first whether to trigger; take it.
  for (let step = 0; step < 5; step++) {
    const now = store.state.game;
    const actions = store.state.legal?.actions;
    if (!now || actions?.kind !== "choice" || spectrumTuckReached(now)) return;
    const { choice } = actions;
    await store.resolveChoice(choice.options.slice(0, Math.max(1, choice.minSelections)).map((o) => o.optionId));
  }
}
