/**
 * A friendly character made to attack its own player (`EffectSpec friendlyCharacterAttacks`; docs/phase7-wave4.md
 * §3.26; Old Rivals, `nebu` 22031, errata RRG 1.8 p. 67: "If the Gamora hero or ally is in play, she attacks you
 * (resolve her ATK against you without exhausting her)"). The attack is a player character's `attack` event marked with
 * the player it is made against (`attack.attackedPlayerId`). No boost card, and the attacker is not exhausted.
 *
 * **The attacked player may defend** (owner decision 2026-11-15, #525 item 1, replacing wave 4 §3.26's "no defense
 * step"; ruling October 26, 2023 (102): "Yes, players can defend against the attack from Old Rivals", and the
 * attacking character may defend against her own attack).
 * - Declare Defender (`declareFriendlyDefender`): as the attack's event frame applies, after its interrupt window, the
 *   attacked player is asked to declare a defender among the characters that could defend an enemy attack on them
 *   (`legalDefenders`, the Gamora ally herself included), or none. Engine reading (no source on a non-enemy attack's
 *   order): by analogy with RRG 1.8 "Attack (Enemy Activation)" p. 8 and FAQ Spider-Man (#1A) p. 57, "when attacks"
 *   interrupts resolve before the Declare Defender step; ruling 102 allows defending, and declaring first would close
 *   the window the defenses need. The defender is exhausted (unless a rule has it defend without exhausting) and
 *   becomes the attack's target; a hero makes a basic defense, so its DEF is taken off the damage
 *   (`attack.basicDefense`, RRG 1.8 "Attack (Enemy Activation)" step 4, p. 9), and an ally takes all of it (step 5).
 * - A "(defense)"-labeled ability the attacked player resolves during the attack makes their identity the defender if
 *   there is none (`declareLabeledFriendlyDefense`; RRG 1.8 "Defend, Defense", p. 15; ruling 102 Q3: "Can the Gamora
 *   player use a (defense) labelled ability …? Yes"). It is no basic defense (p. 16).
 * - Either way the defense is a real defense (card text, the golden rule and ruling 102; rules expert, 2026-11-15): a
 *   `defended` event is announced (`announceFriendlyDefense`), its source the attacker, so "when … defends"
 *   interrupts resolve before the damage and "after … defends" responses once the attack ends, as for an enemy attack
 *   (RRG 1.8 p. 16). A hero's basic defense is also announced as a basic power used.
 *
 * **She is not an enemy** (same ruling: "Gamora is not considered 'an enemy' during the attack since she is not a
 * minion or villain, so she's not a valid target for abilities that target enemies"). Generic trigger conditions keep
 * the enemy-only abilities out, with no card named here:
 * - "when an enemy attacks", "when the villain attacks" and boost-card abilities answer an `enemyAttack`, which this is
 *   not; "the attacking enemy" read off the stack (`TargetRef attackingEnemy`) names nothing;
 * - a defense "against an enemy attack" (Counter-Punch, True Grit, Excelsior) asks for an enemy source
 *   (`EventPattern.sourceIs`, the DSL's `defends(…, { againstEnemy: true })`), and so does damage "from an enemy
 *   attack" (Psionic Redirect: `damage(…, { fromEnemy: true })`);
 * - "the attacking enemy" or "that enemy" of a defense is its source if an enemy (`TargetRef eventSource` with a
 *   `filter`, the DSL's `eventSourceEnemy`), so Daredevil's "move 1 damage … to the attacking enemy" does nothing.
 *   "The attacking character" (Electrostatic Armor) is the plain source, Gamora.
 *
 * Engine reading, not settled by the ruling: a character whose defense has an additional cost (`RuleSpec
 * additionalPowerCost`) is not offered.
 */

import { type Ctx, emit, requestChoice, setFrame } from "../ctx.js";
import type { EngineDeps } from "../abilities.js";
import type { FrameId, InstanceId, PlayerId } from "../ids.js";
import { characterProfile, getPlayer } from "../query.js";
import { exhaustCard } from "../effects.js";
import { additionalPowerCostFor, cannotDefend, defendsWithoutExhausting } from "../rules.js";
import { cardsInPlay, categoriesOf, controllerOf, type EffectContext, resolvePlayers, resolveRef } from "../select.js";
import type { EffectSpec } from "../spec.js";
import { defendedActivationFrameId } from "../stack.js";
import type { GameState } from "../state.js";
import { displayNameOf } from "../visibility.js";
import { announceBasicDefense, legalDefenders } from "./enemy-activation.js";
import { addFrameSlots, announce, type Frame } from "./frames.js";

type FriendlyAttack = Extract<EffectSpec, { kind: "friendlyCharacterAttacks" }>;

/**
 * The attacker and the attacked player of a friendly attack, if one can be made: a hero-form identity or an ally a
 * player controls, with an ATK, against a player still in the game. A stunned attacker is the caller's to read: it
 * makes no attack (RRG 1.8 "Stun", p. 41).
 */
export function friendlyAttackOf(
  state: GameState,
  deps: EngineDeps,
  effect: FriendlyAttack,
  context: EffectContext,
): { readonly attacker: InstanceId; readonly playerId: PlayerId } | null {
  const inPlay = cardsInPlay(state);
  const [attacker] = resolveRef(state, effect.attacker, context).filter((id) => {
    if (!inPlay.includes(id) || controllerOf(state, id) === null) return false;
    const categories = categoriesOf(state, id);
    return categories.includes("hero") || categories.includes("ally");
  });
  const [playerId] = resolvePlayers(state, effect.player, context);
  const player = playerId ? getPlayer(state, playerId) : undefined;
  if (!attacker || !playerId || !player || player.eliminated) return null;
  if (characterProfile(state, attacker, deps)?.missing.includes("atk")) return null;
  return { attacker, playerId };
}

/** The characters that may defend the friendly attack on `playerId` (file header). */
export const friendlyDefenders = (
  state: GameState,
  deps: EngineDeps,
  playerId: PlayerId,
  attacker: InstanceId,
): readonly InstanceId[] =>
  legalDefenders(state, playerId, deps, attacker).filter((id) => !additionalPowerCostFor(state, deps, id, "defend"));

/** The attack event frame's slot naming the character defending a friendly attack (Declare Defender or a label). */
export const FRIENDLY_DEFENDER_SLOT = "friendlyAttack.defending";

/**
 * The Declare Defender step of a friendly attack (file header), as its event frame reaches its apply stage: after its
 * interrupt window, before its damage. Returns true while the question is open, or once the answer was taken and the
 * defense announced on top of the attack (so the frame waits for them); false when there is nothing to ask: no
 * friendly attack, the step already taken (`FRIENDLY_DEFENDER_SLOT` set, empty when declined), or nobody to offer.
 */
export function declareFriendlyDefender(ctx: Ctx, frame: Frame<"event">): boolean {
  const event = frame.event;
  if (event.kind !== "attack" || event.attackedPlayerId === undefined || frame.cancelled) return false;
  if (frame.slots[FRIENDLY_DEFENDER_SLOT] !== undefined) return false;
  const attacker = event.attackerInstanceId;
  const playerId = event.attackedPlayerId;
  const identity = getPlayer(ctx.state, playerId)?.identity.instanceId;
  const defenders = cardsInPlay(ctx.state).includes(attacker)
    ? friendlyDefenders(ctx.state, ctx.deps, playerId, attacker)
    : [];
  if (!identity || defenders.length === 0) {
    setFrame(ctx, { ...frame, slots: { ...frame.slots, [FRIENDLY_DEFENDER_SLOT]: [] } });
    return false;
  }
  if (frame.answer === null) {
    requestChoice(ctx, {
      playerId,
      prompt: {
        kind: "declareDefender",
        attack: { enemyInstanceId: attacker, targetPlayerId: playerId, targetCharacterInstanceId: identity },
      },
      options: [
        { optionId: "decline", label: "No defense", ref: { kind: "none" } },
        ...defenders.map((id) => ({
          optionId: id,
          label: displayNameOf(ctx.state, id),
          ref: { kind: "card", instanceId: id } as const,
        })),
      ],
      minSelections: 1,
      maxSelections: 1,
      frameId: frame.frameId,
    });
    return true;
  }
  const [defender] = defenders.filter((id) => frame.answer?.includes(id));
  if (!defender) {
    emit(ctx, { type: "defenseDeclined", attackInstanceId: attacker, playerId });
    setFrame(ctx, { ...frame, answer: null, slots: { ...frame.slots, [FRIENDLY_DEFENDER_SLOT]: [] } });
    return false;
  }
  const defenderPlayer = controllerOf(ctx.state, defender) ?? playerId;
  const withoutExhausting = defendsWithoutExhausting(ctx.state, ctx.deps, defender);
  emit(ctx, {
    type: "defenderDeclared",
    attackInstanceId: attacker,
    defenderInstanceId: defender,
    playerId,
    ...(withoutExhausting ? { withoutExhausting: true as const } : {}),
  });
  if (!withoutExhausting) exhaustCard(ctx, defender);
  const heroDefends = defender === getPlayer(ctx.state, defenderPlayer)?.identity.instanceId;
  // The defender takes the attack (RRG 1.8 "Attack (Enemy Activation)" step 5, p. 9); a hero's DEF comes off it.
  setFrame(ctx, {
    ...frame,
    answer: null,
    event: { ...event, targetInstanceId: defender, ...(heroDefends ? { basicDefense: true as const } : {}) },
  });
  // The defense is announced on top of the attack, as an enemy attack's is (`setDefender`), so "when … defends"
  // resolves before the attack's damage and "after … defends" once the attack ends; a hero's defense is also its basic
  // defense power, announced last so it resolves first, as `declareDefenderByEffect` orders them.
  announceFriendlyDefense(ctx, frame.frameId, defender, attacker, defenderPlayer, heroDefends);
  if (heroDefends) announceBasicDefense(ctx, defender, defenderPlayer);
  return true;
}

/**
 * Announces the defense of a friendly attack (file header): `defender` is recorded on the attack's event frame and a
 * `defended` event is announced, its source the attacker. Pushed above the attack, so "when … defends" interrupts
 * resolve before the attack deals its damage; its responses wait for the attack to end (`defersResponsesToActivation`).
 */
export function announceFriendlyDefense(
  ctx: Ctx,
  attackFrameId: FrameId,
  defender: InstanceId,
  attacker: InstanceId,
  defenderPlayer: PlayerId,
  basic: boolean,
): void {
  addFrameSlots(ctx, attackFrameId, { [FRIENDLY_DEFENDER_SLOT]: [defender] });
  announce(ctx, {
    kind: "defended",
    defenderInstanceId: defender,
    enemyInstanceId: attacker,
    playerId: defenderPlayer,
    basic,
  });
}

/**
 * A "(defense)"-labeled ability `playerId` resolves during a friendly attack on them makes their identity the defender
 * if the attack has none (RRG 1.8 "Defend, Defense", p. 15; ruling Oct 26, 2023 (102) Q3: the attacked player may use
 * a "(defense)" ability against her attack). The identity is already the attack's target, so only the defense is
 * recorded and announced; it is no basic defense (p. 16), so no DEF comes off. The enemy-attack twin is
 * `declareLabeledDefense`.
 */
export function declareLabeledFriendlyDefense(ctx: Ctx, playerId: PlayerId): void {
  const activation = defendedActivationFrameId(ctx.state.stack);
  const frame = activation ? ctx.state.stack.find((f) => f.frameId === activation) : undefined;
  if (frame?.kind !== "event" || frame.event.kind !== "attack" || frame.event.attackedPlayerId !== playerId) return;
  if ((frame.slots[FRIENDLY_DEFENDER_SLOT] ?? []).length > 0) return;
  const identity = getPlayer(ctx.state, playerId)?.identity.instanceId;
  const attacker = frame.event.attackerInstanceId;
  if (!identity || cannotDefend(ctx.state, ctx.deps, identity, attacker)) return;
  announceFriendlyDefense(ctx, frame.frameId, identity, attacker, playerId, false);
}
