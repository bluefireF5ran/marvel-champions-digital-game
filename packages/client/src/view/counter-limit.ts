/**
 * The most a card may hold of a kind of counter, so the table reads "0/1 synergy" against the cap instead of a bare
 * "0" ("Permanent. Max 1 [per player] synergy counters here", the four Synergy environments of Trickster Takeover; a
 * full one logs `countersNotPlaced`). Read through the engine's own `counterRoom` (held plus the room left), the way
 * `counter-goal.ts` reads a threshold: display only, the engine still refuses the placement.
 *
 * Engine ask: expose the limit itself (`counterLimitOf(state, deps, id, counterType)`) beside `counterRoom`, and this
 * module can go.
 */
import { cardOf, counterRoom, getInstance, type EngineDeps, type GameState, type InstanceId } from "@mc/engine";

/** Counter kind to its cap, for the kinds the card holds or defines that a `counterLimit` rule names; else empty. */
export function counterLimitsOf(state: GameState, id: InstanceId, deps: EngineDeps): Readonly<Record<string, number>> {
  const held = getInstance(state, id)?.counters ?? {};
  const kinds = new Set([...(cardOf(state, id)?.definedCounterTypes ?? []), ...Object.keys(held)]);
  const limits: Record<string, number> = {};
  for (const kind of kinds) {
    const room = counterRoom(state, deps, id, kind);
    if (Number.isFinite(room)) limits[kind] = (held[kind] ?? 0) + room;
  }
  return limits;
}
