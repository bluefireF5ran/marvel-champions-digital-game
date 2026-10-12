import type { AbilityRegistry } from "@mc/engine";
import { trait } from "@mc/content";
import {
  anyOf,
  cards,
  chooseCards,
  chosen,
  constant,
  defineAbilities,
  forEachPlayer,
  eachPlayer,
  heroAction,
  moveCards,
  ofClassification,
  query,
  ready,
  reduceCostOfCards,
  shuffleDeck,
  teamUpCharacters,
  thatPlayer,
  whenDefeated,
  playOnlyIf,
  youHaveTrait,
  you,
  zone,
} from "../../dsl/index.js";
import { BASIC } from "../../core/aspects/basic.js";
import { BKW_PACK_CARDS } from "../../wave1/bkw/pack-cards.js";
import { SPDR_EVENTS } from "../../wave5/spdr/events.js";

/**
 * Wave 10 scripting module `hercules/basic` (docs/phase7-wave10-hero-packs.md H8.4).
 *
 * Cards (10):
 * - 59025 Gilgamesh (ally)
 * - 59026 Ancient Rivalry (event)
 * - 59027 Limitless Stamina (event)
 * - 59028 Evaluate Threat (player_side_scheme)
 * - 59029 Energy (resource)
 * - 59030 Genius (resource)
 * - 59031 Strength (resource)
 * - 59032 Avengers Compound (support)
 * - 59033 Helicarrier (support)
 * - 59034 Quincarrier (support)
 *
 * **59025.gilgamesh-constant** stays skipped: "As an additional cost to play this card, if you do not have the Eternal
 * trait, confuse your identity." is `additionalCostToPlay(costIf(youHaveTrait(ETERNAL), {}, giveStatusCost(yourIdentity,
 * "confused")))`, and `validateDefinition` refuses a conditional part in an additional cost to play (see SKIPPED).
 *
 * **59026.ancient-rivalry-action**: "Hero Action: Search your discard pile for an identity-specific upgrade and add it
 * to your hand. Ready Hercules and Thor." The Team-Up characters are readied (`teamUpCharacters`) whether or not the
 * search finds an upgrade; it is a separate sentence, not a "then". "Identity-specific" is the classification
 * (RRG 1.8 "Classifications", p. 12), any identity's, not only Hercules's or Thor's set.
 *
 * **59028.evaluate-threat-constant / .when-defeated**: "Play only if your identity has the Avenger or S.H.I.E.L.D.
 * trait." (a `playOnlyIf`, read at the play, as the schema cannot express an OR of two traits; see Moon Girl 28018).
 * "When Defeated: Each player may search their deck and discard pile for an Avenger or S.H.I.E.L.D. card and add it to
 * their hand. (Shuffle.) Reduce the cost to play each of those cards by 2 until the end of the phase." Each player in
 * turn order picks up to one card (`min: 0`, "may"), the deck is shuffled, and `reduceCostOfCards` binds a reduction
 * of 2 to each card taken. Rulings June 2, 2026 - Ruling 2 (4): the reduction is for the next time the card is played
 * that phase, even if it is bounced (discarded and returned to hand); July 9, 2026 - Ruling 3 (3): for the next time
 * it is played, not repeatedly (docs/phase7-wave10-hero-packs.md H3.11).
 *
 * **Reprints, aliased** to the original's script: 59027 Limitless Stamina (31023), 59033 Helicarrier (01092), 59034 Quincarrier (08023). Checked in the test.
 * 59032 Avengers Compound reprints 58034 (`wonder_man/basic`), which is not scripted yet: it stays skipped, and whoever scripts 58034 aliases 59032 to it here.
 */
const AVENGER = trait("Avenger");
const SHIELD = trait("S.H.I.E.L.D.");
const AVENGER_OR_SHIELD = { anyOf: [{ trait: AVENGER }, { trait: SHIELD }] };

export const HERCULES_BASIC: AbilityRegistry = defineAbilities({
  "59026.ancient-rivalry-action": heroAction(
    chooseCards("found", zone("discard", you, { filter: query("upgrade", ofClassification("identitySpecific")) }), {
      min: 1,
      max: 1,
    }),
    moveCards(cards(chosen("found")), "hand"),
    ready(teamUpCharacters()),
  ),

  "59028.evaluate-threat-constant": constant(playOnlyIf(anyOf(youHaveTrait(AVENGER), youHaveTrait(SHIELD)))),
  "59028.when-defeated": whenDefeated(
    forEachPlayer(
      eachPlayer,
      chooseCards("found", zone(["deck", "discard"], thatPlayer, { filter: AVENGER_OR_SHIELD }), {
        min: 0,
        max: 1,
        chooser: thatPlayer,
      }),
      moveCards(cards(chosen("found")), "hand"),
      shuffleDeck(thatPlayer),
      reduceCostOfCards(chosen("found"), 2, "phase"),
    ),
  ),

  "59027.limitless-stamina-constant": SPDR_EVENTS["31023.limitless-stamina-constant"]!,
  "59027.limitless-stamina-action": SPDR_EVENTS["31023.limitless-stamina-action"]!,
  "59033.helicarrier-action": BASIC["01092.helicarrier-action"]!,
  "59034.quincarrier-resource": BKW_PACK_CARDS["08023.quincarrier-resource"]!,
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const HERCULES_BASIC_SKIPPED: Readonly<Record<string, string>> = {
  "59025.gilgamesh-constant":
    'missing DSL/engine primitive: a conditional (costIf) additional cost to play. additionalCostToPlay(costIf(youHaveTrait(ETERNAL), {}, giveStatusCost(yourIdentity, "confused"))) is refused by validateDefinition (dsl/validate.ts: "an additional cost to play has no resources, either/or or conditional part"); the engine\'s playCostWith/additionalPlayCostOf would also need to resolve the conditional against the identity\'s traits',
  "59032.avengers-compound-action":
    "wave 10 scripting in progress: hercules/basic (reprint of 58034: alias wonder_man/basic's script once it is scripted)",
};
