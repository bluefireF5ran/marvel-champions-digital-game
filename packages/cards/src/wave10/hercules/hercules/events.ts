import type { AbilityRegistry } from "@mc/engine";
import {
  aScheme,
  attackAnEnemy,
  chooseTarget,
  chosen,
  constant,
  costModifier,
  defineAbilities,
  draw,
  giveTough,
  heroAction,
  ifThen,
  query,
  ready,
  scaled,
  thwart,
  valueAtLeast,
  yourIdentity,
} from "../../../dsl/index.js";
import { giftCardsYouControl } from "./identity.js";

/**
 * Wave 10 scripting module `hercules/hercules/events` (docs/phase7-wave10-hero-packs.md H3.9, H8.4 line HS11).
 *
 * Cards (3):
 * - 59009 The Gift of Battle (event)
 * - 59010 Son of Zeus (event)
 * - 59011 Wisdom of Athena (event)
 *
 * Every count of "Gift cards you control" is the shared `giftCardsYouControl` of the identity module, which reads 0
 * while Appeal to Athena is in the player's play area.
 *
 * **59009.the-gift-of-battle-constant** and **59011.wisdom-of-athena-constant**: "Reduce the cost to play this card by
 * 1 for each Gift card you control." Active from the hand (RRG 1.8 "In Play and Out of Play", p. 23); the cost never
 * goes below 0, so three Gifts make either event free.
 *
 * **59009.the-gift-of-battle-action**: "Hero Action (attack): Deal 5 damage to an enemy." One attack of 5 (not the
 * hero's ATK); an enemy that cannot take damage is not a legal target.
 *
 * **59010.son-of-zeus-action**: "Hero Action: Ready Hercules. If you control at least: 1 Gift card, ready an
 * identity-specific upgrade you control. 2 Gift cards, gain a tough status card. 3 Gift cards, draw 1 card." The
 * bullets are cumulative ("at least"), so three Gifts give all three. "Gain" a status card is the hero receiving it
 * (RRG 1.8 "Status Cards", p. 41). The upgrade is chosen among identity-specific upgrades the player controls, a Gift
 * card or one of the kit's own (RRG 1.8 "Classifications", p. 12).
 *
 * **59011.wisdom-of-athena-action**: "Hero Action (thwart): Remove 4 threat from a scheme." One thwart of 4.
 */
export const HERCULES_EVENTS: AbilityRegistry = defineAbilities({
  "59009.the-gift-of-battle-constant": constant(
    costModifier({
      delta: scaled(giftCardsYouControl, { times: -1 }),
      appliesTo: query("event", { self: true }),
      activeIn: "hand",
    }),
  ),
  "59009.the-gift-of-battle-action": heroAction({ label: "attack" }, attackAnEnemy(5)),

  "59010.son-of-zeus-action": heroAction(
    {},
    ready(yourIdentity),
    ifThen(valueAtLeast(giftCardsYouControl, 1), [
      chooseTarget("upgrade", query("upgrade", { controller: "you", classification: "identitySpecific" })),
      ready(chosen("upgrade")),
    ]),
    ifThen(valueAtLeast(giftCardsYouControl, 2), giveTough(yourIdentity)),
    ifThen(valueAtLeast(giftCardsYouControl, 3), draw(1)),
  ),

  "59011.wisdom-of-athena-constant": constant(
    costModifier({
      delta: scaled(giftCardsYouControl, { times: -1 }),
      appliesTo: query("event", { self: true }),
      activeIn: "hand",
    }),
  ),
  "59011.wisdom-of-athena-action": heroAction({ label: "thwart" }, aScheme("scheme"), thwart(4, chosen("scheme"))),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. None. */
export const HERCULES_EVENTS_SKIPPED: Readonly<Record<string, string>> = {};
