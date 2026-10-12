import type { AbilityRegistry } from "@mc/engine";
import {
  adjustBoostCount,
  attachCard,
  boost,
  chosen,
  constant,
  dealDamage,
  defeatingPlayer,
  defineAbilities,
  discard,
  each,
  encounterCards,
  exists,
  forcedInterrupt,
  gainsKeyword,
  ifThen,
  inPlay,
  not,
  on,
  oneCopyOf,
  placeThreat,
  preventDamage,
  query,
  selectCards,
  self,
  shuffleEncounterDeck,
  surge,
  whenDefeated,
  whenRevealed,
} from "../../../dsl/index.js";

const MARIA_HILL = "Maria Hill";
const DECOY = "Life Model Decoy";
/** The enemy a Life Model Decoy is attached to ("attached character"). */
const HOST_ENEMY = query("enemy", { hostOfSelf: true });

/**
 * Modular encounter set `maria_hill_modular` (Civil War, Registration side; docs/phase7-wave10.md section 3.23).
 * Retaliate 2, Hinder 1[per_hero], the hazard icon and Life Model Decoy's attach hosts (a minion or the enemy leader)
 * are data.
 *
 * **Maria Hill (56083)**: When Revealed: a copy of Life Model Decoy from the encounter deck or discard pile is
 * attached to her, then the encounter deck is shuffled (RRG 1.8 "Search", p. 39). The copies are identical, so
 * "the enemy team searches" has nothing to decide and no prompt is shown (docs/phase7-wave10.md section 3.5: one
 * candidate, no prompt). Limit 1 per character: she takes no second one.
 *
 * **Life Model Decoy (56084)**: "The enemy team attaches this card to a minion or their leader" is the data host
 * (`attachesTo`: a minion or the enemy leader, which cooperatively is the villain; owner's answer to question 13 = A,
 * 2026-10-11). Several hosts are the first player's choice, as for any encounter attachment (owner's answer to
 * question 6). The attached enemy gains stalwart. Forced Interrupt: when it would take damage from an attack, that
 * damage is prevented and this card is discarded.
 *
 * **Executive Order (56085)**: When Revealed: 2 threat on each scheme; surge when Maria Hill is in play. Boost: three
 * more boost icons when Maria Hill is in play.
 *
 * **S.H.I.E.L.D. Helicarrier (56086)**: When Defeated: the player who defeated it deals 1 damage to each character they
 * control and to each minion engaged with them (the scheme is gone, so a defeat by no player deals none).
 *
 * Cards (4):
 * - 56083 Maria Hill (minion)
 * - 56084 Life Model Decoy (attachment)
 * - 56085 Executive Order (treachery)
 * - 56086 S.H.I.E.L.D. Helicarrier (side_scheme)
 */
export const MODULAR_MARIA_HILL: AbilityRegistry = defineAbilities({
  "56083.when-revealed": whenRevealed(
    selectCards("decoy", oneCopyOf(encounterCards(["deck", "discard"], query("attachment", { name: DECOY })))),
    ifThen(
      not(exists(query("minion", { name: MARIA_HILL, hasAttachment: query("attachment", { name: DECOY }) }))),
      attachCard(chosen("decoy"), self),
    ),
    shuffleEncounterDeck(),
  ),

  "56084.life-model-decoy-constant-2": constant(gainsKeyword({ name: "stalwart" }, HOST_ENEMY)),
  "56084.life-model-decoy-forced-interrupt": forcedInterrupt(
    on.damage("host", { fromAttack: true }),
    preventDamage(),
    discard(self),
  ),

  "56085.when-revealed": whenRevealed(placeThreat(2, each(query("scheme"))), ifThen(inPlay(MARIA_HILL), surge())),
  "56085.boost": boost(ifThen(inPlay(MARIA_HILL), adjustBoostCount(3))),

  "56086.when-defeated": whenDefeated(
    dealDamage(1, each(query("character", { controlledBy: defeatingPlayer })), { by: defeatingPlayer }),
    dealDamage(1, each(query("minion", { engagedWithPlayer: defeatingPlayer })), { by: defeatingPlayer }),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const MODULAR_MARIA_HILL_SKIPPED: Readonly<Record<string, string>> = {
  "56084.life-model-decoy-constant":
    "the attach sentence is the data host (attachesTo), but its '(Limit 1 per character.)' needs playRestrictions { maxPerHost: 1 } on 56084 in packages/content/src/data/cw/cards.ts (card-data-pipeline); no script can state it, because the data host is applied at the reveal without reading any ability",
};
