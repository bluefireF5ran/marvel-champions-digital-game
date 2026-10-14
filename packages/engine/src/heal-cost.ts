/**
 * "Heal 2 damage from an enemy → confuse that enemy" (`AbilityCost.healCharacter`; docs/phase7-wave10-hero-packs.md
 * H3.17): healing damage from a character the payer picks, as a cost. Which characters may be picked, the check of the
 * command's pick, and the payment. `planCost` and `payCost` (`actions.ts`) call these; `legalActions` offers one
 * variant per candidate (`legal.ts`).
 */

import type { AbilityCost, EngineDeps } from "./abilities.js";
import type { CostChoices } from "./commands.js";
import type { Ctx } from "./ctx.js";
import { healDamage } from "./effects.js";
import type { EngineErrorCode } from "./errors.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { getInstance } from "./query.js";
import { cannotBeHealed } from "./rules.js";
import { cardsInPlay, categoriesOf, type EffectContext, matchesQuery } from "./select.js";
import type { Bindings } from "./stack.js";
import type { GameState } from "./state.js";

type HealCost = NonNullable<AbilityCost["healCharacter"]>;

interface CostFault {
  readonly code: EngineErrorCode;
  readonly message: string;
}

/**
 * The characters a heal cost lets the payer pick: in play, matching the cost's query (read with the payer as "you" and
 * the ability's card as "self"), holding at least `amount` damage, and able to be healed by this card. Any player's
 * character and an enemy alike: see `AbilityCost.healCharacter`.
 */
export function healCostChoices(
  state: GameState,
  deps: EngineDeps,
  sourceId: InstanceId,
  playerId: PlayerId,
  cost: HealCost,
  bindings: Bindings = {},
): readonly InstanceId[] {
  const context: EffectContext = { selfInstanceId: sourceId, controllerId: playerId, event: null, bindings, deps };
  return cardsInPlay(state).filter(
    (id) =>
      categoriesOf(state, id).includes("character") &&
      (getInstance(state, id)?.damage ?? 0) >= cost.amount &&
      matchesQuery(state, id, cost.query, context) &&
      !cannotBeHealed(state, deps, id, sourceId),
  );
}

/**
 * Checks a heal cost against the command's pick (`choices[slot]`; forced with one candidate) and returns the binding
 * for it. Nothing is paid.
 */
export function planHealCost(
  state: GameState,
  deps: EngineDeps,
  sourceId: InstanceId,
  playerId: PlayerId,
  cost: HealCost,
  choices: CostChoices,
  bindings: Bindings,
): Bindings | CostFault {
  const candidates = healCostChoices(state, deps, sourceId, playerId, cost, bindings);
  const slot = cost.slot;
  if (candidates.length === 0) {
    return { code: "no_valid_target", message: `no character has ${cost.amount} damage to heal for ${slot}` };
  }
  const named = choices[slot] ?? (candidates.length === 1 ? candidates : undefined);
  if (!named) return { code: "invalid_choice", message: `choose the character to heal for ${slot}` };
  const [pick, ...extra] = named;
  if (!pick || extra.length > 0) return { code: "invalid_choice", message: `choose exactly one card for ${slot}` };
  if (!candidates.includes(pick)) {
    return { code: "no_valid_target", message: `${pick} is not a legal choice for ${slot}` };
  }
  return { [slot]: [pick] };
}

/** Pays a heal cost as planned: `amount` damage is healed from the picked character, by the ability's card. */
export function payHealCost(ctx: Ctx, sourceId: InstanceId, cost: HealCost, bindings: Bindings): void {
  const [pick] = bindings[cost.slot] ?? [];
  if (pick !== undefined) healDamage(ctx, pick, cost.amount, sourceId);
}
