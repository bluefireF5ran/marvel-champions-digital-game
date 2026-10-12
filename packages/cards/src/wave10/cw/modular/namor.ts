import { trait } from "@mc/content";
import type { AbilityRegistry } from "@mc/engine";
import {
  attacksGainKeywords,
  boost,
  constant,
  defineAbilities,
  discard,
  enemyActivates,
  enemyLeader,
  exists,
  forcedInterrupt,
  giveTough,
  heroAction,
  host,
  ifThen,
  modifyAttack,
  named,
  on,
  query,
  rule,
  self,
  spend,
  whenRevealed,
  you,
} from "../../../dsl/index.js";

const NAMOR = "Namor";
const ATLANTIS = trait("ATLANTIS");
/** The enemy a Neptune's Trident or a Horn of Proteus is attached to ("attached character"). */
const HOST_ENEMY = query("enemy", { hostOfSelf: true });

/**
 * Modular encounter set `namor_modular` (Civil War, Resistance side; docs/phase7-wave10.md section 3.23). Stalwart,
 * Toughness, Villainous, both attachments' "Attach to Namor. Otherwise, attach to the enemy leader.", their stat
 * modifiers (+1 ATK, +1 SCH), Hinder 1[per_hero] and the amplify icon are data keywords and data fields.
 *
 * **Namor (56160)**: When Revealed: he activates against you (he engages the revealing player first, as any revealed
 * minion does), attacking a player in hero form and scheming against one in alter-ego form (RRG 1.8 "Activation", p. 6).
 *
 * **Neptune's Trident (56161)**: the attached enemy's attacks gain piercing. Hero Action: spend an [energy] and a
 * [physical] resource to discard this card.
 *
 * **Horn of Proteus (56162)**: Forced Interrupt: when the attached enemy schemes, it is given a tough status card
 * (before the scheme resolves). Hero Action: spend a [mental] and a [physical] resource to discard this card.
 *
 * **Imperius Rex! (56163)**: When Revealed: Namor activates against you if he is in play, otherwise the enemy leader
 * does (in a cooperative game the villain; MC56 p. 6). Boost: the activating enemy gets an additional boost card.
 *
 * **Ruler of Atlantis (56164)**: each Atlantis minion cannot take damage.
 *
 * Cards (5):
 * - 56160 Namor (minion)
 * - 56161 Neptune's Trident (attachment)
 * - 56162 Horn of Proteus (attachment)
 * - 56163 Imperius Rex! (treachery)
 * - 56164 Ruler of Atlantis (side_scheme)
 */
export const MODULAR_NAMOR: AbilityRegistry = defineAbilities({
  "56160.when-revealed": whenRevealed(enemyActivates(self, { against: you })),

  "56161.neptunes-trident-constant": constant(attacksGainKeywords(["piercing"], { attacker: HOST_ENEMY })),
  "56161.neptunes-trident-action": heroAction({ cost: spend({ energy: 1, physical: 1 }) }, discard(self)),

  "56162.horn-of-proteus-forced-interrupt": forcedInterrupt(on.enemySchemes("host"), giveTough(host)),
  "56162.horn-of-proteus-action": heroAction({ cost: spend({ mental: 1, physical: 1 }) }, discard(self)),

  "56163.when-revealed": whenRevealed(
    ifThen(
      exists(query("minion", { name: NAMOR })),
      enemyActivates(named(NAMOR), { against: you }),
      enemyActivates(enemyLeader, { against: you }),
    ),
  ),
  "56163.boost": boost(modifyAttack({ extraBoostCards: 1 })),

  "56164.ruler-of-atlantis-constant": constant(
    rule({ kind: "cannotTakeDamage", target: query("minion", { trait: ATLANTIS }) }),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_NAMOR_SKIPPED: Readonly<Record<string, string>> = {};
