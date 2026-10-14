import type { AbilityRegistry } from "@mc/engine";
import {
  alterEgoAction,
  cards,
  chooseCards,
  chosen,
  constant,
  countOf,
  defineAbilities,
  draw,
  exists,
  hasAttachment,
  losesKeyword,
  min,
  moveCards,
  on,
  oncePerRound,
  query,
  response,
  shuffleDeck,
  you,
  zone,
} from "../../../dsl/index.js";

const HUNTED = query("upgrade", { name: "Hunted" });
const ENGAGED_MINIONS = query("minion", { engagedWith: "you" });

/**
 * Wave 10 scripting module `cw/tigra/identity` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md
 * B3.7, B3.8, B7.1).
 *
 * Cards (1):
 * - 56001a Tigra (hero_identity)
 *
 * The card's other face is 56001b Greer Nelson (alter ego).
 *
 * **56001a.tigra-constant** (hero face): "Each minion with a copy of Hunted attached loses guard." A copy is defined by
 * title (RRG 1.8 "Copy", p. 13), so a Hunted another player controls counts; the minion loses every instance of guard,
 * printed or granted (RRG "'Loses'", p. 27). Hero face only: in alter-ego form the minion has guard again.
 *
 * **56001a.on-the-hunt** (hero face): "Response: After the player phase begins, draw 1 card for each minion engaged
 * with you (to a maximum of 3)." The maximum belongs to this one draw (ruling March 30, 2026 - Ruling 1). With no minion
 * engaged the response would change nothing, so it is not offered. In a multiplayer game it answers the one start of
 * the player phase, whoever the first player is.
 *
 * **56001b.undercover-work** (alter-ego face): "Action: Search your deck and discard pile for a copy of Hunted and add
 * it to your hand. (Limit once per round.)" The limit belongs to the card and survives flipping. The search is
 * compulsory when a copy is there (no "may"); the deck is shuffled afterwards, also when nothing is found (RRG 1.8
 * "Search", p. 39).
 */
export const TIGRA_IDENTITY: AbilityRegistry = defineAbilities({
  "56001a.tigra-constant": constant(losesKeyword({ name: "guard" }, query("minion", hasAttachment(HUNTED)))),

  "56001a.on-the-hunt": response(
    on.phaseBeginning("player"),
    { while: exists(ENGAGED_MINIONS) },
    draw(min(countOf(ENGAGED_MINIONS), 3)),
  ),

  "56001b.undercover-work": alterEgoAction(
    { limit: oncePerRound },
    chooseCards("found", zone(["deck", "discard"], you, { filter: HUNTED }), { min: 1, max: 1 }),
    moveCards(cards(chosen("found")), "hand"),
    shuffleDeck(),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. None. */
export const TIGRA_IDENTITY_SKIPPED: Readonly<Record<string, string>> = {};
