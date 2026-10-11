/**
 * "Max 1 [per player] synergy counters here." (`RuleSpec counterLimit`, docs/phase7-wave9.md §3.61): a constant on the
 * card that holds the counters, so it binds every placement on it, whoever places them and by what means. Unlike the
 * "(to a maximum of X)" of one placing ability (`EffectSpec addCounters.upTo`), which is local to that ability (ruling
 * June 2, 2026 (1)).
 */

import type { EngineDeps } from "./abilities.js";
import type { InstanceId } from "./ids.js";
import { getInstance } from "./query.js";
import { activeRules, matchesQuery, resolveValue } from "./select.js";
import type { GameState } from "./state.js";

/**
 * How many more counters of `counterType` the card may take: the least room any `counterLimit` rule in force leaves it
 * (never below 0), or infinity when none names it. The type is the one the counters are stored under on that card.
 */
export function counterRoom(state: GameState, deps: EngineDeps, id: InstanceId, counterType: string): number {
  let room = Number.POSITIVE_INFINITY;
  for (const { rule, context } of activeRules(state, deps, "counterLimit")) {
    if (rule.counterType !== counterType || !matchesQuery(state, id, rule.card, context)) continue;
    const held = getInstance(state, id)?.counters[counterType] ?? 0;
    room = Math.min(room, Math.max(0, Math.floor(resolveValue(state, rule.max, context, deps)) - held));
  }
  return room;
}
