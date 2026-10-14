import { trait } from "@mc/content";
import type { AbilityDefinition, AbilityRegistry, EffectSpec, PlayerRef } from "@mc/engine";
import {
  alterEgoAction,
  chosen,
  constant,
  dealAsEncounterCard,
  defeatingPlayer,
  defineAbilities,
  discardFromHandCost,
  each,
  encounterCards,
  exhaust,
  exists,
  oneCopyOf,
  forcedInterrupt,
  gainsTrait,
  ifThen,
  modifyAttack,
  ofClassification,
  on,
  query,
  selectCards,
  shuffleEncounterDeck,
  whenDefeated,
  whenRevealed,
  you,
  YOUR_IDENTITY,
  youHaveTrait,
} from "../../../dsl/index.js";
import { discardThisObligation } from "../../../core/obligations.js";

/** The trait the Civil War cards give heroes and identities; the engine reads it off the granting constant. */
export const UNREGISTERED = trait("UNREGISTERED");
const SHIELD = trait("S.H.I.E.L.D.");

/** An Unregistered identity that can be exhausted: a ready one (RRG 1.8 "Exhaust", p. 19). */
const READY_UNREGISTERED_IDENTITY = query("identity", { trait: UNREGISTERED, exhausted: false });
/** A copy of Unregistered Super, whichever of its two printings (56106 or 56114; docs/phase7-wave10.md section 1.8). */
const UNREGISTERED_SUPER = query("obligation", { name: "Unregistered Super" });

/**
 * "The enemy team searches the encounter deck and discard pile for a copy of Unregistered Super and deals it to
 * `player` as a facedown encounter card." The two printings (56106, 56114) are one card and the copies are identical,
 * so "the enemy team searches" has nothing to decide and no prompt is shown (docs/phase7-wave10.md section 3.5: where
 * the candidates are copies of one card there is no prompt, as for Maria Hill's Life Model Decoy). The first match is
 * dealt. The searched decks are shuffled after (RRG 1.8 "Search", p. 39), also when no copy is left. Shared with
 * Heroes for Hire (56116).
 */
export const dealUnregisteredSuperTo = (player: PlayerRef): EffectSpec[] => [
  selectCards("found", oneCopyOf(encounterCards(["deck", "discard"], UNREGISTERED_SUPER))),
  dealAsEncounterCard(chosen("found"), player),
  shuffleEncounterDeck(),
];

/**
 * **Unregistered Super (56106; the same card is 56114 in Heroes for Hire, docs/phase7-wave10.md section 1.8)**: an
 * obligation that stays in the revealing player's area. Its constant gives that player's identity the Unregistered
 * trait, the grant the main scheme Hunting Rebel Heroes' "another card is revealed that gives heroes the trait" hears
 * (section 3.16). Alter-Ego Action: discard an identity-specific card from your hand (RRG 1.8 "Identity-Specific
 * Card", p. 23) to discard this card. It prints an acceleration icon too, which is card data. Exported as the two
 * shared definitions for the Heroes for Hire module to register under 56114.
 */
export const UNREGISTERED_SUPER_CONSTANT: AbilityDefinition = constant(gainsTrait(UNREGISTERED, YOUR_IDENTITY));
export const UNREGISTERED_SUPER_ACTION: AbilityDefinition = alterEgoAction(
  { cost: discardFromHandCost(1, 1, undefined, ofClassification("identitySpecific")) },
  discardThisObligation,
);

/**
 * Modular encounter set `cape_killer` (Civil War, Registration side; docs/phase7-wave10.md sections 3.5, 3.16 and
 * 3.23).
 *
 * **Cape-Killer (56105)**: Quickstrike is data. Forced Interrupt: when he attacks you and your identity has the
 * Unregistered trait, +2 ATK for that attack (an attack is always against an identity).
 *
 * **Bring Them In (56107)**: When Revealed: each Unregistered identity (every player's) is exhausted. "Otherwise" the
 * enemy team deals you a copy of Unregistered Super: when the first sentence "cannot at least partially resolve" (RRG
 * 1.8 "Otherwise", p. 31). "An exhausted card cannot be exhausted again until it is ready" (RRG 1.8 "Exhaust", p. 19),
 * and an effect that cannot affect its target does not resolve (RRG 1.8 FAQ, p. 57, Superhuman Strength against an
 * enemy "already stunned"). So the sentence resolves only when at least one Unregistered identity is ready: with none
 * Unregistered, or with every Unregistered identity already exhausted, the copy is dealt. One ready and one exhausted
 * is a partial resolution, and no copy is dealt.
 *
 * **Arrest Order (56108)**: When Defeated: the defeating player is dealt the topmost S.H.I.E.L.D. minion of the
 * encounter discard pile (the newest-first array's first match) as a facedown encounter card.
 *
 * Cards (4):
 * - 56105 Cape-Killer (minion)
 * - 56106 Unregistered Super (obligation)
 * - 56107 Bring Them In (treachery)
 * - 56108 Arrest Order (side_scheme)
 */
export const MODULAR_CAPE_KILLER: AbilityRegistry = defineAbilities({
  "56105.cape-killer-forced-interrupt": forcedInterrupt(
    on.enemyAttacks("self", { againstYou: true }),
    ifThen(youHaveTrait(UNREGISTERED), modifyAttack({ atkBonus: 2 })),
  ),

  "56106.unregistered-super-constant": UNREGISTERED_SUPER_CONSTANT,
  "56106.unregistered-super-action": UNREGISTERED_SUPER_ACTION,

  "56107.when-revealed": whenRevealed(
    ifThen(
      exists(READY_UNREGISTERED_IDENTITY),
      exhaust(each(READY_UNREGISTERED_IDENTITY)),
      dealUnregisteredSuperTo(you),
    ),
  ),

  "56108.when-defeated": whenDefeated(
    selectCards("minion", encounterCards(["discard"], query("minion", { trait: SHIELD }), { topmostOnly: true })),
    dealAsEncounterCard(chosen("minion"), defeatingPlayer),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_CAPE_KILLER_SKIPPED: Readonly<Record<string, string>> = {};
