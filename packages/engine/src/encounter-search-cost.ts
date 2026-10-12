/**
 * "As an additional cost to play this upgrade, search the encounter deck and discard pile for a minion and put it into
 * play engaged with you" (Hunted, `cw` 56007; docs/phase7-wave10-box-heroes.md B3.1): searching the encounter deck for
 * a card and putting it into play as part of a cost (`AbilityCost.searchEncounterIntoPlay`,
 * `EncounterSearchIntoPlayCost`). Which cards the payer may pick, checking the pick, and the step that pays it.
 * `planCost` and `payCost` (`actions.ts`) call these; `legalActions` offers one variant per candidate (`legal.ts`).
 */

import type { EncounterSearchIntoPlayCost, EngineDeps } from "./abilities.js";
import type { CostChoices } from "./commands.js";
import type { EngineErrorCode } from "./errors.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { activeEncounterDeck } from "./query.js";
import { type EffectContext, matchesQuery } from "./select.js";
import type { EffectSpec } from "./spec.js";
import type { Bindings } from "./stack.js";
import type { GameState } from "./state.js";

interface CostFault {
  readonly code: EngineErrorCode;
  readonly message: string;
}

const pileNames = (zones: EncounterSearchIntoPlayCost["zones"]): string =>
  zones.map((zone) => (zone === "deck" ? "the encounter deck" : "the encounter discard pile")).join(" or ");

/**
 * The cards the payer may search out: those of the active encounter deck's `zones` that match the cost's query and
 * could enter play in the payer's area, the deck's first, each pile in its own order.
 */
export function encounterSearchCostCandidates(
  state: GameState,
  deps: EngineDeps,
  sourceId: InstanceId,
  playerId: PlayerId,
  search: EncounterSearchIntoPlayCost,
): readonly InstanceId[] {
  const piles = activeEncounterDeck(state);
  const context: EffectContext = { selfInstanceId: sourceId, controllerId: playerId, event: null, bindings: {}, deps };
  const query = { ...search.query, canEnterPlay: { kind: "controller" as const } };
  return [
    ...(search.zones.includes("deck") ? piles.deck : []),
    ...(search.zones.includes("discard") ? piles.discard : []),
  ]
    .filter((id, index, all) => all.indexOf(id) === index)
    .filter((id) => matchesQuery(state, id, query, context));
}

/**
 * Checks the cost against the command's pick (`choices[slot]`; forced with one candidate) and returns the binding
 * paying it will use. Nothing is paid, and nothing is shuffled.
 */
export function planEncounterSearchCost(
  state: GameState,
  deps: EngineDeps,
  sourceId: InstanceId,
  playerId: PlayerId,
  search: EncounterSearchIntoPlayCost,
  choices: CostChoices,
): Bindings | CostFault {
  const candidates = encounterSearchCostCandidates(state, deps, sourceId, playerId, search);
  const { slot } = search;
  if (candidates.length === 0) {
    return { code: "no_valid_target", message: `${pileNames(search.zones)} holds no card to search for (${slot})` };
  }
  const named = choices[slot] ?? (candidates.length === 1 ? candidates : undefined);
  if (!named) return { code: "invalid_choice", message: `choose the card this cost searches for (${slot})` };
  const [pick, ...extra] = named;
  if (!pick || extra.length > 0) return { code: "invalid_choice", message: `choose exactly one card for ${slot}` };
  if (!candidates.includes(pick)) {
    return { code: "no_valid_target", message: `${pick} is not a card this cost can search for (${slot})` };
  }
  return { [slot]: [pick] };
}

/**
 * The step that pays the cost, pushed above the frame being paid for with the pick bound to `slot`: the encounter deck
 * is shuffled when it was searched, then the card is put into play under the payer (`EncounterSearchIntoPlayCost` says
 * why in that order).
 */
export function encounterSearchCostEffects(search: EncounterSearchIntoPlayCost): readonly EffectSpec[] {
  return [
    ...(search.zones.includes("deck") ? [{ kind: "shuffleEncounterDeck" as const }] : []),
    { kind: "putIntoPlay", card: { kind: "slot", slot: search.slot }, controller: { kind: "controller" } },
  ];
}
