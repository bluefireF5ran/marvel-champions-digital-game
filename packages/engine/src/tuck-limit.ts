/**
 * "Max 3 cards tucked here." (`RuleSpec tuckLimit`, docs/phase7-wave10-hero-packs.md §H3.12): a constant on the card
 * the cards are tucked under, so it binds every tuck under it, whoever tucks and by what card. The tuck-side twin of
 * `counter-limit.ts`.
 */

import type { EngineDeps } from "./abilities.js";
import type { InstanceId } from "./ids.js";
import { getInstance } from "./query.js";
import { activeRules, matchesQuery, resolveValue } from "./select.js";
import type { GameState } from "./state.js";

/**
 * How many more cards may be tucked under the card: the least room any `tuckLimit` rule in force leaves it (never
 * below 0), or infinity when none names it. Every card under it counts, faceup or facedown.
 */
export function tuckRoom(state: GameState, deps: EngineDeps, id: InstanceId): number {
  let room = Number.POSITIVE_INFINITY;
  for (const { rule, context } of activeRules(state, deps, "tuckLimit")) {
    if (!matchesQuery(state, id, rule.card, context)) continue;
    const held = getInstance(state, id)?.tucked.length ?? 0;
    room = Math.min(room, Math.max(0, Math.floor(resolveValue(state, rule.max, context, deps)) - held));
  }
  return room;
}

/**
 * The maximum itself (`tuckRoom` plus the cards already there), or null for a card with no `tuckLimit` in force: what
 * a client shows as "2 / 3" beside the card.
 */
export function tuckLimitOf(state: GameState, deps: EngineDeps, id: InstanceId): number | null {
  const room = tuckRoom(state, deps, id);
  return Number.isFinite(room) ? room + (getInstance(state, id)?.tucked.length ?? 0) : null;
}
