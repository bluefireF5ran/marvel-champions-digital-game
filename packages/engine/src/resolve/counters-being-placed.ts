/**
 * The "would be placed" interrupt window in front of an effect's placement of counters (`TriggerEvent countersPlaced`
 * with `imminent`; docs/phase7-wave9.md §3.55): "Forced Interrupt: When a charm counter would be placed on the
 * Enchantment card in your play area, if your identity has the Enthralled trait, place 1 threat here instead." RRG 1.8
 * "'Would'" (p. 48), "Interrupt" (p. 25), "Replacement Effect" (p. 37).
 *
 * Like every other optional announcement the event goes on the stack only when an ability could answer it: a registry
 * with no interrupt on counters being placed reads nothing, and a placement no interrupt matches is made at once
 * exactly as before.
 */

import type { EngineDeps } from "../abilities.js";
import type { Ctx } from "../ctx.js";
import { addCounters } from "../effects.js";
import type { FrameId, InstanceId, PlayerId } from "../ids.js";
import { cardsInPlay } from "../select.js";
import type { TriggerEvent } from "../trigger-events.js";
import { addFrameVars, pushEvents } from "./frames.js";
import { hasCandidates, heard } from "./triggers.js";

type CountersPlaced = Extract<TriggerEvent, { kind: "countersPlaced" }>;

const LISTENS_FOR_COUNTERS_BEING_PLACED = new WeakMap<EngineDeps, boolean>();

/**
 * Whether any interrupt in the registry triggers on counters being placed; cached per registry. Counters are placed
 * in every game, so nothing more is read for a registry with no such ability.
 */
function listensForCountersBeingPlaced(deps: EngineDeps): boolean {
  const cached = LISTENS_FOR_COUNTERS_BEING_PLACED.get(deps);
  if (cached !== undefined) return cached;
  const listens = Object.values(deps.abilities).some((definition) => {
    const trigger = definition.trigger;
    if (trigger.kind !== "interrupt") return false;
    const kinds = typeof trigger.on.on === "string" ? [trigger.on.on] : trigger.on.on;
    return kinds.includes("countersPlaced");
  });
  LISTENS_FOR_COUNTERS_BEING_PLACED.set(deps, listens);
  return listens;
}

/** One placement of an `addCounters` effect: `count` counters of `counterType` (as stored) on `instanceId`. */
export interface CounterPlacement {
  readonly instanceId: InstanceId;
  readonly counterType: string;
  readonly count: number;
}

/**
 * Makes the placements of one effect, in order: each at once, announced as placed when an ability listens, unless an
 * interrupt hears that the counters would be placed, in which case the placement waits for that window (`imminent`) and
 * is made, and announced, once it has resolved. Once one placement of the effect waits, those after it wait behind it,
 * so they land in the order the effect named them and each window reads the game as the one before left it.
 *
 * Returns how many counters were placed at once. `countOn` is the placing frame's "placed this way" variable
 * (`<bind>.amount`): the caller adds the returned number to it, and a waiting placement adds its own if it lands.
 */
export function placeCountersOrAnnounce(
  ctx: Ctx,
  placements: readonly CounterPlacement[],
  playerId: PlayerId | null,
  countOn?: { readonly frameId: FrameId; readonly name: string },
): number {
  const listens = listensForCountersBeingPlaced(ctx.deps);
  const events: TriggerEvent[] = [];
  let waiting = false;
  let placed = 0;
  for (const { instanceId, counterType, count } of placements) {
    if (count <= 0) continue;
    const landed: CountersPlaced = {
      kind: "countersPlaced",
      targetInstanceId: instanceId,
      counterType,
      amount: count,
      playerId,
    };
    const imminent: CountersPlaced = { ...landed, imminent: countOn ? { countOn } : {} };
    if (waiting || (listens && hasCandidates(ctx.state, ctx.deps, imminent, "interrupt"))) {
      waiting = true;
      events.push(imminent);
      continue;
    }
    addCounters(ctx, instanceId, counterType, count);
    placed += count;
    // One announcement per placement, with the number placed (docs/phase7-wave6.md §3.2, §4.1 Q8).
    if (heard(ctx.state, ctx.deps, landed)) events.push(landed);
  }
  if (events.length > 0) pushEvents(ctx, events);
  return placed;
}

/**
 * A placement whose interrupts have resolved without replacing it: the counters are placed now and the placement is
 * announced. Returns whether any were placed; a card that left play during the window takes none.
 */
export function applyCountersBeingPlaced(ctx: Ctx, event: CountersPlaced): boolean {
  if (!cardsInPlay(ctx.state).includes(event.targetInstanceId)) return false;
  addCounters(ctx, event.targetInstanceId, event.counterType, event.amount);
  const countOn = event.imminent?.countOn;
  if (countOn) addFrameVars(ctx, countOn.frameId, { [countOn.name]: event.amount });
  const { imminent: _made, ...landed } = event;
  if (heard(ctx.state, ctx.deps, landed)) pushEvents(ctx, [landed]);
  return true;
}
