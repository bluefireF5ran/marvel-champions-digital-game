import { trait } from "@mc/content";
import type { AbilityRegistry } from "@mc/engine";
import {
  boost,
  chooseCards,
  chosen,
  constant,
  countOf,
  defineAbilities,
  discard,
  encounterCards,
  enemyActivates,
  exhaustCardsCost,
  find,
  forcedInterrupt,
  gainsTrait,
  gets,
  heroAction,
  host,
  ifThen,
  modifyAttack,
  named,
  not,
  on,
  placeThreat,
  preventDamage,
  query,
  replaceAttachHost,
  revealCard,
  self,
  shuffleEncounterDeck,
  statOf,
  surge,
  varAtLeast,
  whenRevealed,
  you,
} from "../../dsl/index.js";

const TECH = trait("TECH");
const AERIAL = trait("AERIAL");
const FIXER = "Fixer";
/** "Attached enemy": the enemy the scripted attachment is attached to. */
const ATTACHED = query("enemy", { hostOfSelf: true });

/**
 * Modular encounter set `techno` (Falcon, a Thunderbolt set; docs/phase7-wave9.md sections 3.48, 3.49, 8.4).
 * Villainous and Victory 1 on Fixer, the "Attach to Fixer. Otherwise, attach to the villain." lines of Jet Pack and
 * Tech-Pac, and Tech-Pac's +1 ATK / +1 SCH box are data.
 *
 * **Fixer (53038)**: Forced Interrupt when a non-scenario-specific Tech attachment would be attached to the villain:
 * it is attached to Fixer instead, and its text that says "the villain" refers to Fixer (`villainAlias`). Fixer's own
 * printed attach targets (Jet Pack, Tech-Pac) already prefer him, so this is for the other Tech attachments (High-Tech
 * Armament 54030, Energy Truncheon 51040) and for any that would otherwise go to the villain.
 *
 * **Jet Pack (53039)**: the attached enemy gains Aerial; Forced Interrupt when the attached character would take 3 or
 * more damage: prevent all of it and discard Jet Pack.
 *
 * **Tech-Pac (53040)**: the attached enemy gets +1 ATK for each other Tech attachment it has; Hero Action: exhaust any
 * number of characters you control (identity and allies) whose combined THW is greater than the attached enemy's SCH,
 * then discard this card.
 *
 * **Technological Innovation (53041)**: When Revealed: search the encounter deck and discard pile for a Tech
 * attachment and reveal it, shuffle, then place 1 additional threat for each Tech card in play (counted after the
 * revealed attachment has entered play).
 *
 * **Techno (53042)**: finds and reveals Fixer (engaging you when already in play), who activates against you; surge
 * when nobody activated. Boost: the activation, if an attack, gains piercing.
 *
 * Cards (5):
 * - 53038 Fixer (minion)
 * - 53039 Jet Pack (attachment)
 * - 53040 Tech-Pac (attachment)
 * - 53041 Technological Innovation (side_scheme)
 * - 53042 Techno (treachery)
 */
export const TECHNO: AbilityRegistry = defineAbilities({
  "53038.fixer-forced-interrupt": forcedInterrupt(
    on.cardWouldBeAttached(query("attachment", { trait: TECH, scenarioSpecific: false }), { to: query("villain") }),
    replaceAttachHost(self, { villainAlias: true }),
  ),

  "53039.jet-pack-constant": constant(gainsTrait(AERIAL, ATTACHED)),
  "53039.jet-pack-forced-interrupt": forcedInterrupt(
    { ...on.damage("host"), eventAtLeast: { amount: 3 } },
    preventDamage(),
    discard(self),
  ),

  "53040.tech-pac-constant": constant(
    gets("atk", countOf(query("attachment", { trait: TECH, host, self: false })), ATTACHED),
  ),
  "53040.tech-pac-action": heroAction(
    {
      cost: exhaustCardsCost(query(["identity", "ally"]), {
        max: "any",
        combined: { stat: "thw", moreThan: statOf(host, "sch") },
      }),
    },
    discard(self),
  ),

  "53041.when-revealed": whenRevealed(
    chooseCards("found", encounterCards(["deck", "discard"], query("attachment", { trait: TECH })), {
      min: 1,
      max: 1,
    }),
    revealCard(chosen("found"), you),
    shuffleEncounterDeck(),
    placeThreat(countOf(query([], { trait: TECH })), self),
  ),

  "53042.when-revealed": whenRevealed(
    revealCard(find(query("minion", { name: FIXER })), you),
    enemyActivates(named(FIXER), { against: you, bind: "activated" }),
    ifThen(not(varAtLeast("activated.made")), surge()),
  ),
  "53042.boost": boost(modifyAttack({ keywords: ["piercing"] })),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. */
export const TECHNO_SKIPPED: Readonly<Record<string, string>> = {};
