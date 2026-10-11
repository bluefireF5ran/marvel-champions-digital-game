/**
 * "Each player exhausts their identity and takes 1 damage →" (`AbilityCost.eachPlayer`, docs/phase7-wave9.md §3.58): a
 * cost every player still in the game pays in kind, whoever initiates the ability.
 *
 * - **All or nothing.** RRG 1.8 "Cost" (p. 13): "If multiple costs for a single card or ability require payment, those
 *   costs must be paid simultaneously", and a cost that cannot be paid in full cannot be paid. One player who cannot
 *   pay their part (an identity already exhausted, one that could not take all the damage) makes the whole cost
 *   unpayable, and the fault names that player's identity.
 * - **Damage is taken, so a tough status card stops the cost.** RRG 1.8 "Cost" (p. 14): "If taking damage is a cost,
 *   that cost is not considered paid unless all of that damage was taken"; FAQ "Focused Rage (#27)" (p. 57): a cost a
 *   tough status card would prevent "cannot be paid". Checked for every player by the same `canTakeCostDamage` a "take
 *   N damage →" cost uses, and settled by the same `settleCostDamage` step: damage an interrupt prevents as it is paid
 *   leaves the ability's effects unresolved.
 * - **At once.** The identities are exhausted together and the damage is one simultaneous deal to every identity, in
 *   player order where an order shows, pushed above the frame being paid for so it resolves before the effects (RRG 1.8
 *   "Cost Arrow Icon", p. 14).
 */

import type { AbilityCost, EngineDeps } from "./abilities.js";
import { canTakeCostDamage } from "./cost-damage.js";
import type { InstanceId } from "./ids.js";
import { cardOf, getInstance, playerOrder } from "./query.js";
import type { Frame } from "./resolve/frames.js";
import type { EffectSpec } from "./spec.js";
import type { GameState } from "./state.js";

export type EachPlayerCost = NonNullable<AbilityCost["eachPlayer"]>;

/** The frame slot holding the identities an each-player cost's damage is dealt to. */
export const EACH_PLAYER_COST_SLOT = "cost.eachPlayer";

/** Every identity that pays an each-player cost: the players still in the game, in player order. */
export function eachPlayerCostIdentities(state: GameState): readonly InstanceId[] {
  return playerOrder(state).map((player) => player.identity.instanceId);
}

/**
 * Why an each-player cost cannot be paid right now, naming the first player (in player order) who cannot pay their
 * part, or null when every player can.
 */
export function eachPlayerCostFault(
  state: GameState,
  deps: EngineDeps,
  sourceId: InstanceId,
  cost: EachPlayerCost,
): { readonly code: "already_exhausted" | "insufficient_resources"; readonly message: string } | null {
  for (const identityId of eachPlayerCostIdentities(state)) {
    const name = cardOf(state, identityId)?.name ?? identityId;
    if (cost.exhaustIdentity && getInstance(state, identityId)?.exhausted) {
      return { code: "already_exhausted", message: `${name} is already exhausted, and each player must exhaust` };
    }
    const damage = cost.damageSelf ?? 0;
    if (damage > 0 && !canTakeCostDamage(state, deps, identityId, sourceId, damage)) {
      return {
        code: "insufficient_resources",
        message: `${name} cannot take all ${damage} damage this cost needs from each player`,
      };
    }
  }
  return null;
}

/**
 * The effects `payCost` pushes for an each-player cost's damage, with `EACH_PLAYER_COST_SLOT` bound to the identities:
 * `amount` to each of them at once (`taken`: no "deals N additional damage" bonus adds to it), then `settleCostDamage`
 * for all of it.
 */
export function eachPlayerCostDamageEffects(
  amount: number,
  identities: number,
  paidFor: Frame<"ability"> | Frame<"playCard"> | null,
): EffectSpec[] {
  const bind = "costDamage";
  return [
    {
      kind: "dealDamage",
      target: { kind: "slot", slot: EACH_PLAYER_COST_SLOT },
      amount: { kind: "const", value: amount },
      taken: true,
      bind,
    },
    { kind: "settleCostDamage", amount: amount * identities, bind, paidFor: paidFor?.frameId ?? null },
  ];
}
