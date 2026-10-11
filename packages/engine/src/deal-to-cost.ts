/**
 * "Deal a player 1 facedown encounter card →" (`AbilityCost.dealEncounterCardsTo`): a deal paid as a cost to a player
 * the payer picks. The pick is made with the cost (RRG 1.8 "Initiating Abilities", p. 24, step 3) as the picked
 * player's identity card, so it travels in `CostChoices` like every other cost pick and binds a slot of cards.
 */
import type { AbilityCost } from "./abilities.js";
import type { CostChoices } from "./commands.js";
import type { EngineErrorCode } from "./errors.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { playerOrder } from "./query.js";
import type { Bindings } from "./stack.js";
import type { GameState } from "./state.js";

type DealToCost = NonNullable<AbilityCost["dealEncounterCardsTo"]>;

/** The identity cards of the players the payer may pick, in player order: every player still in the game. */
export const dealToCostChoices = (state: GameState): readonly InstanceId[] =>
  playerOrder(state).map((player) => player.identity.instanceId);

/** The player a `dealEncounterCardsTo` cost deals to, read from the slot its pick bound; null when none is bound. */
export function dealToCostPlayer(state: GameState, cost: DealToCost, bindings: Bindings): PlayerId | null {
  const [identity] = bindings[cost.slot] ?? [];
  return playerOrder(state).find((player) => player.identity.instanceId === identity)?.playerId ?? null;
}

/**
 * Checks a `dealEncounterCardsTo` cost against the command's pick (`choices[slot]`; forced with one player in the
 * game) and returns the binding for it. Nothing is paid.
 */
export function planDealToCost(
  state: GameState,
  cost: DealToCost,
  choices: CostChoices,
): Bindings | { readonly code: EngineErrorCode; readonly message: string } {
  const candidates = dealToCostChoices(state);
  const slot = cost.slot;
  if (candidates.length === 0) return { code: "no_valid_target", message: `no player to deal a card to for ${slot}` };
  const named = choices[slot] ?? (candidates.length === 1 ? candidates : undefined);
  if (!named) return { code: "invalid_choice", message: `choose the player this cost deals a card to for ${slot}` };
  const [pick, ...extra] = named;
  if (!pick || extra.length > 0) return { code: "invalid_choice", message: `choose exactly one player for ${slot}` };
  if (!candidates.includes(pick))
    return { code: "no_valid_target", message: `${pick} is not the identity of a player in the game for ${slot}` };
  return { [slot]: [pick] };
}
