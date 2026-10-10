/**
 * What stops a character attacking, in the card's own name: "Encased in Ice" rather than the engine's one message for
 * every attack it refuses ("a guard minion blocks attacks against the villain", `basicAttackPaying`). Whether an attack
 * is legal is the engine's answer and stays so; this only names the cause of a refusal the engine already made, from
 * the attachments on the attacker whose text says its host cannot attack (`cannotAttack` with `attacker: { hostOfSelf }`).
 *
 * Engine ask: the refusal should carry its own reason and the card that causes it (the rule's source), so the client
 * can word any bar (Distracting Taunts, Fear of Kang) and not just an attachment on the attacker. Until then this reads
 * the one pattern it can tell without evaluating a rule.
 */
import {
  activeAbilityRefs,
  cardOf,
  currentName,
  getInstance,
  type EngineDeps,
  type GameState,
  type InstanceId,
  type LegalActions,
} from "@mc/engine";
import type { Highlights } from "./highlights.js";

/** The engine's message for any attack `canAttack` refuses, whatever refused it (`basicAttackPaying`). */
export const ATTACK_REFUSED_MESSAGE = "a guard minion blocks attacks against the villain";

/** The attachments on `id` whose text bars the card they are on from attacking. */
export function attackBarsOn(state: GameState, id: InstanceId, deps: EngineDeps): readonly InstanceId[] {
  const attachments = getInstance(state, id)?.attachments ?? [];
  return attachments.filter((attachmentId) =>
    activeAbilityRefs(state, attachmentId, deps).some((ref) => {
      const trigger = deps.abilities[ref.id]?.trigger;
      return (
        trigger?.kind === "constant" &&
        (trigger.rules ?? []).some((rule) => rule.kind === "cannotAttack" && rule.attacker?.hostOfSelf === true)
      );
    }),
  );
}

const nameOf = (state: GameState, id: InstanceId): string =>
  currentName(state, id) ?? cardOf(state, id)?.name ?? "A card";

/** "Encased in Ice", or "Encased in Ice, Frozen Over" for two: what bars `id` from attacking; null when nothing does. */
export function attackBarName(state: GameState, id: InstanceId, deps: EngineDeps): string | null {
  const bars = attackBarsOn(state, id, deps);
  return bars.length > 0 ? [...new Set(bars.map((bar) => nameOf(state, bar)))].join(", ") : null;
}

/**
 * The reason to show for an attack by `attackerId` the engine refused with `message`: the bar's name when the attacker
 * is barred and the message is the engine's catch-all, the engine's own message otherwise.
 */
export function attackRefusalWording(
  state: GameState,
  deps: EngineDeps,
  attackerId: InstanceId,
  message: string,
): string {
  if (message !== ATTACK_REFUSED_MESSAGE) return message;
  const bar = attackBarName(state, attackerId, deps);
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
      blocked.set(target.instanceId, attackRefusalWording(state, deps, entry.action.instanceId, target.message));
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
