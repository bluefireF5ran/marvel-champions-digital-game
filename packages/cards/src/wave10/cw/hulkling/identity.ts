import { trait } from "@mc/content";
import type { AbilityRegistry } from "@mc/engine";
import {
  after,
  alterEgoAction,
  cannotEnterPlay,
  cards,
  chooseCards,
  chosen,
  constant,
  defineAbilities,
  discard,
  eventTarget,
  exists,
  forcedResponse,
  moveCards,
  oncePerRound,
  query,
  ready,
  rule,
  shuffleDeck,
  each,
  you,
  yourIdentity,
  zone,
} from "../../../dsl/index.js";

const SHAPESHIFT = trait("Shapeshift");
const YOUR_SHAPES = query("upgrade", { trait: SHAPESHIFT, controller: "you" });

/**
 * Wave 10 scripting module `cw/hulkling/identity` (docs/phase7-wave10.md section 8.4, docs/phase7-wave10-box-heroes.md
 * B3.4, B3.9, B7.2).
 *
 * Cards (1):
 * - 56029a Hulkling (hero_identity)
 *
 * The card's other face is 56029b Teddy Altman (alter ego).
 *
 * **56029a.chosen-shape** (hero face): "Forced Response: After a Shapeshift upgrade enters play under your control,
 * discard each other Shapeshift upgrade you control and ready Hulkling." Forced, so the upgrade that entered is never
 * discarded and the ready happens even when there was no other shape to discard. A shape that enters under another
 * player's control is not heard. Only the hero face has the ability, so a shape entering in alter-ego form discards
 * nothing (it cannot enter at all: see Teddy Altman's constant).
 *
 * **56029b.teddy-altman-constant** (alter-ego face): "You cannot have more than 1 Shapeshift upgrade in play." Written as
 * a per-player `cannotEnterPlay` that applies while a Shapeshift upgrade is already under the player's control: a second
 * shape cannot be played or put into play, and nothing is discarded to make room. Ruling January 11, 2026 - Ruling 1:
 * "Teddy Altman's constant ability prevents playing another Shapeshift upgrade while already having one in play (cannot
 * play a second and discard down)." The rule binds only the player whose identity it is.
 *
 * **56029b.shape-changer** (alter-ego face): "Action: Search your deck and discard pile for a Shapeshift upgrade and
 * add it to your hand. (Limit once per round.)" The limit belongs to the card. The search is compulsory when a shape is
 * there (no "may"); the deck is shuffled afterwards, also when nothing is found (RRG 1.8 "Search", p. 39).
 */
export const HULKLING_IDENTITY: AbilityRegistry = defineAbilities({
  "56029a.chosen-shape": forcedResponse(
    after.entersPlay(YOUR_SHAPES),
    discard(each(query("upgrade", { trait: SHAPESHIFT, controller: "you", excluding: eventTarget }))),
    ready(yourIdentity),
  ),

  "56029b.teddy-altman-constant": constant(
    rule(cannotEnterPlay(query("upgrade", { trait: SHAPESHIFT }), { while: exists(YOUR_SHAPES), player: you })),
  ),

  "56029b.shape-changer": alterEgoAction(
    { limit: oncePerRound },
    chooseCards("found", zone(["deck", "discard"], you, { filter: query("upgrade", { trait: SHAPESHIFT }) }), {
      min: 1,
      max: 1,
    }),
    moveCards(cards(chosen("found")), "hand"),
    shuffleDeck(),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. None. */
export const HULKLING_IDENTITY_SKIPPED: Readonly<Record<string, string>> = {};
