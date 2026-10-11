/**
 * What stops a character attacking, in the card's own name: "Encased in Ice" or "Seduced" rather than the engine's one
 * message for every attack it refuses ("a guard minion blocks attacks against the villain", `basicAttackPaying`).
 * Whether an attack is legal is the engine's answer and stays so; this only names the cause of a refusal the engine
 * already made, by asking the engine which rule forbids it (`attackForbiddenBy`: the card whose text says so).
 */
import {
  attackForbiddenBy,
  cardOf,
  cardsInPlay,
  currentName,
  isAttackTarget,
  type EngineDeps,
  type GameState,
  type InstanceId,
  type LegalActions,
} from "@mc/engine";
import type { Highlights } from "./highlights.js";

/** The engine's message for any attack `canAttack` refuses, whatever refused it (`basicAttackPaying`). */
export const ATTACK_REFUSED_MESSAGE = "a guard minion blocks attacks against the villain";

/** The cards whose text forbids a basic attack by `id` on some target in play, in play order. */
export function attackBarsOn(state: GameState, id: InstanceId, deps: EngineDeps): readonly InstanceId[] {
  const bars: InstanceId[] = [];
  for (const target of cardsInPlay(state)) {
    if (target === id || !isAttackTarget(state, target, deps)) continue;
    const by = attackForbiddenBy(state, id, target, deps, true)?.byInstanceId;
    if (by && !bars.includes(by)) bars.push(by);
  }
  return bars;
}

const nameOf = (state: GameState, id: InstanceId): string =>
  currentName(state, id) ?? cardOf(state, id)?.name ?? "A card";

/** "Encased in Ice", or "Encased in Ice, Frozen Over" for two: what bars `id` from attacking; null when nothing does. */
export function attackBarName(state: GameState, id: InstanceId, deps: EngineDeps): string | null {
  const bars = attackBarsOn(state, id, deps);
  return bars.length > 0 ? [...new Set(bars.map((bar) => nameOf(state, bar)))].join(", ") : null;
}

/**
 * The reason to show for an attack by `attackerId` the engine refused with `message`: the forbidding card's name when
 * a rule forbids it (`attackForbiddenBy`, on `targetId` when given) and the message is the engine's catch-all, the
 * engine's own message otherwise (a message that already names its card, "Seduced: you cannot make basic attacks").
 */
export function attackRefusalWording(
  state: GameState,
  deps: EngineDeps,
  attackerId: InstanceId,
  message: string,
  targetId?: InstanceId,
): string {
  if (message !== ATTACK_REFUSED_MESSAGE) return message;
  const by = targetId ? attackForbiddenBy(state, attackerId, targetId, deps, true)?.byInstanceId : null;
  const bar = by ? nameOf(state, by) : attackBarName(state, attackerId, deps);
  return bar ? `${bar} stops ${nameOf(state, attackerId)} attacking it` : message;
}

/** The Inspect line on a character whose attacks an attachment limits: "Limited by Encased in Ice". Null when nothing does. */
export function attackBarNote(state: GameState, deps: EngineDeps, id: InstanceId): string | null {
  const bar = attackBarName(state, id, deps);
  return bar ? `Limited by ${bar}` : null;
}

/**
 * `marks` with the engine's one refusal message replaced, for each barred attacker, by what bars it: the reason on the
 * dimmed Attack button and on each enemy it cannot be aimed at. A target another attacker may still hit keeps no block,
 * as `highlights` has it.
 */
export function withAttackBarWording(
  marks: Highlights,
  actions: LegalActions | null,
  state: GameState,
  deps: EngineDeps,
): Highlights {
  if (actions?.kind !== "turn" && actions?.kind !== "notYourTurn") return marks;
  const entries = [...actions.legal, ...actions.illegal].filter((entry) => entry.action.kind === "basicAttack");
  if (entries.length === 0) return marks;
  const blocked = new Map(marks.blocked);
  for (const entry of entries) {
    if (entry.action.kind !== "basicAttack") continue;
    for (const target of entry.blockedTargets) {
      if (marks.anyTarget.has(target.instanceId)) continue;
      blocked.set(
        target.instanceId,
        attackRefusalWording(state, deps, entry.action.instanceId, target.message, target.instanceId),
      );
    }
  }
  const refused = actions.illegal.find((entry) => entry.action.kind === "basicAttack");
  const basics = marks.basics.map((basic) => {
    if (basic.action !== "attack" || basic.enabled || !refused || refused.action.kind !== "basicAttack") return basic;
    if (basic.reason !== refused.message) return basic;
    return { ...basic, reason: attackRefusalWording(state, deps, refused.action.instanceId, refused.message) };
  });
  return { ...marks, blocked, basics };
}
