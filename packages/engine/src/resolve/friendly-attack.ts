/**
 * A friendly character made to attack its own player (`EffectSpec friendlyCharacterAttacks`; docs/phase7-wave4.md
 * §3.26; Old Rivals, `nebu` 22031, errata RRG 1.8 p. 67: "If the Gamora hero or ally is in play, she attacks you
 * (resolve her ATK against you without exhausting her)").
 *
 * **The attacked player may defend** (owner decision 2026-11-15, #525 item 1, replacing wave 4 §3.26's "no defense
 * step"; ruling October 26, 2023 (102): "Yes, players can defend against the attack from Old Rivals", and the
 * attacking character may defend against her own attack). Before the attack is made, the attacked player is asked to
 * declare a defender among the characters that could defend an enemy attack on them (`legalDefenders`, the Gamora ally
 * herself included), or none. The declared defender is exhausted (unless a rule has it defend without exhausting) and
 * becomes the attack's target; a hero makes a basic defense, so its DEF is taken off the damage (`attack.basicDefense`,
 * RRG 1.8 "Attack (Enemy Activation)" step 4, p. 9), and an ally takes all of it (step 5). Still no boost card and no
 * exhausting of the attacker.
 *
 * **She is not an enemy** (same ruling: "Gamora is not considered 'an enemy' during the attack since she is not a
 * minion or villain, so she's not a valid target for abilities that target enemies"). The attack is a player
 * character's `attack` event, not an `enemyAttack`, so "the attacking enemy" (`TargetRef attackingEnemy`) names
 * nothing during it and no "when an enemy attacks" ability answers it.
 *
 * Engine readings, not settled by the ruling:
 * - the defender is declared before the attack's own interrupt window opens, not after it as for an enemy attack
 *   (p. 9, step 2 after step 1);
 * - no `defended` event is announced (it names an enemy), so "after you defend" abilities do not answer this defense;
 *   a hero's basic defense is still announced as a basic power used (`basicPowerUsed`/`basicPowerUsing` "defense");
 * - a character whose defense has an additional cost (`RuleSpec additionalPowerCost`) is not offered.
 */

import { type Ctx, emit, requestChoice, setFrame } from "../ctx.js";
import type { EngineDeps } from "../abilities.js";
import type { InstanceId, PlayerId } from "../ids.js";
import { characterProfile, getPlayer } from "../query.js";
import { additionalPowerCostFor } from "../rules.js";
import { cardsInPlay, categoriesOf, controllerOf, type EffectContext, resolvePlayers, resolveRef } from "../select.js";
import type { EffectSpec } from "../spec.js";
import type { GameState } from "../state.js";
import { displayNameOf } from "../visibility.js";
import { legalDefenders } from "./enemy-activation.js";
import type { Frame } from "./frames.js";

type FriendlyAttack = Extract<EffectSpec, { kind: "friendlyCharacterAttacks" }>;

/** The frame binding the defender answer is kept in, per instruction: the defender, or empty for no defense. */
export const friendlyDefenderSlot = (cursor: number): string => `friendlyAttack.defender.${cursor}`;

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

/**
 * The Declare Defender question of a friendly attack, asked of the attacked player before the instruction applies.
 * Returns true while it is open or was just answered (the answer kept in `friendlyDefenderSlot`).
 */
export function askFriendlyDefender(
  ctx: Ctx,
  frame: Frame<"effects">,
  effect: FriendlyAttack,
  context: EffectContext,
  stunned: (id: InstanceId) => boolean,
): boolean {
  const slot = friendlyDefenderSlot(frame.cursor);
  if (frame.bindings[slot]) return false;
  const attack = friendlyAttackOf(ctx.state, ctx.deps, effect, context);
  if (!attack || stunned(attack.attacker)) return false;
  const defenders = friendlyDefenders(ctx.state, ctx.deps, attack.playerId, attack.attacker);
  if (defenders.length === 0) return false;
  if (frame.answer === null) {
    requestChoice(ctx, {
      playerId: attack.playerId,
      prompt: {
        kind: "declareDefender",
        attack: {
          enemyInstanceId: attack.attacker,
          targetPlayerId: attack.playerId,
          targetCharacterInstanceId: getPlayer(ctx.state, attack.playerId)!.identity.instanceId,
        },
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
  const picked = defenders.filter((id) => frame.answer?.includes(id));
  if (picked.length === 0)
    emit(ctx, { type: "defenseDeclined", attackInstanceId: attack.attacker, playerId: attack.playerId });
  setFrame(ctx, { ...frame, answer: null, bindings: { ...frame.bindings, [slot]: picked.slice(0, 1) } });
  return true;
}
