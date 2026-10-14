import type { AbilityRegistry } from "@mc/engine";
import { trait } from "@mc/content";
import {
  additionalCostToPlay,
  anyOf,
  cards,
  chooseCards,
  chooseOneBy,
  option,
  chosen,
  constant,
  costIf,
  defineAbilities,
  forEachPlayer,
  eachPlayer,
  giveStatusCost,
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
  yourIdentity,
  zone,
} from "../../dsl/index.js";
import { BASIC } from "../../core/aspects/basic.js";
import { BKW_PACK_CARDS } from "../../wave1/bkw/pack-cards.js";
import { SPDR_EVENTS } from "../../wave5/spdr/events.js";
import { WONDER_MAN_BASIC } from "../wonder_man/basic.js";

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
 * **59025.gilgamesh-constant**: "As an additional cost to play this card, if you do not have the Eternal trait, confuse
 * your identity." An additional cost with a conditional part, picked by the board for the player playing him: nothing
 * while their identity has the Eternal trait, else a confused status card given to their identity as the card is paid
 * for (RRG 1.8 "Confuse, Confused", p. 12: an ability that "confuses" a character gives it a confused status card).
 * The cost is paid with the resource cost or not at all (RRG 1.8 "Cost", p. 13), so an identity that cannot be given
 * another confused status card (it already holds one, or two with steady; a stalwart identity; "Status Cards", p. 41)
 * cannot play Gilgamesh, and he is listed unplayable with that reason. Read for a play only: put into play by an
 * effect, he costs nothing (RRG 1.8 "Play, Put into Play", p. 32).
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
 * turn order first decides whether to search (`chooseOneBy`, the "may"). A player who declines is shown nothing, and
 * their deck is not shuffled (RRG 1.8 "Search", p. 39: only a searched deck is shuffled). A player who searches takes
 * exactly one matching card (`min: 1`: a search that finds a legal card must take it, as Air Cover; with no match
 * nothing is taken), the deck is shuffled whether or not a card was found (a search that looks through a deck shuffles
 * it), and `reduceCostOfCards` binds a reduction of 2 to the card taken. Rulings June 2, 2026 - Ruling 2 (4): the reduction is for the next time the card is played
 * that phase, even if it is bounced (discarded and returned to hand); July 9, 2026 - Ruling 3 (3): for the next time
 * it is played, not repeatedly (docs/phase7-wave10-hero-packs.md H3.11).
 *
 * **Reprints, aliased** to the original's script: 59027 Limitless Stamina (31023), 59032 Avengers Compound (58034, `wonder_man/basic`), 59033 Helicarrier (01092), 59034 Quincarrier (08023). Checked in the test.
 */
const ETERNAL = trait("Eternal");
const AVENGER = trait("Avenger");
const SHIELD = trait("S.H.I.E.L.D.");
const AVENGER_OR_SHIELD = { anyOf: [{ trait: AVENGER }, { trait: SHIELD }] };

export const HERCULES_BASIC: AbilityRegistry = defineAbilities({
  "59025.gilgamesh-constant": additionalCostToPlay(
    costIf(youHaveTrait(ETERNAL), {}, giveStatusCost(yourIdentity, "confused")),
  ),

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
      chooseOneBy(
        thatPlayer,
        option(
          "Search your deck and discard pile",
          chooseCards("found", zone(["deck", "discard"], thatPlayer, { filter: AVENGER_OR_SHIELD }), {
            min: 1,
            max: 1,
            chooser: thatPlayer,
          }),
          moveCards(cards(chosen("found")), "hand"),
          shuffleDeck(thatPlayer),
          reduceCostOfCards(chosen("found"), 2, "phase"),
        ),
        option("Do not search"),
      ),
    ),
  ),

  "59027.limitless-stamina-constant": SPDR_EVENTS["31023.limitless-stamina-constant"]!,
  "59027.limitless-stamina-action": SPDR_EVENTS["31023.limitless-stamina-action"]!,
  "59033.helicarrier-action": BASIC["01092.helicarrier-action"]!,
  "59032.avengers-compound-action": WONDER_MAN_BASIC["58034.avengers-compound-action"]!,
  "59034.quincarrier-resource": BKW_PACK_CARDS["08023.quincarrier-resource"]!,
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const HERCULES_BASIC_SKIPPED: Readonly<Record<string, string>> = {};
