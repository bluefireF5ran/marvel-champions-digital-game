import { trait } from "@mc/content";
import type { AbilityRegistry, ValueSpec } from "@mc/engine";
import {
  allOf,
  alterEgoAction,
  changeForm,
  chooseOne,
  chosen,
  constant,
  countOf,
  defineAbilities,
  exists,
  heroResponse,
  ifElse,
  inPlayAreaOf,
  not,
  on,
  oncePerPhase,
  option,
  putIntoPlay,
  query,
  ready,
  revealTopOfSeparateDeck,
  selectCards,
  separateDeckCards,
  separateDeckCountOf,
  valueAtLeast,
  you,
  yourIdentity,
} from "../../../dsl/index.js";

const GIFT = trait("GIFT");
const LABOR = trait("LABOR");

/** A Labor card in play (a revealed card waiting to attach is not in play). */
const LABOR_CARD = query([], { trait: LABOR });

/**
 * "The number of Gift cards you control" as Hercules's kit reads it (docs/phase7-wave10-hero-packs.md H3.9): 0 while an
 * obligation named Appeal to Athena is in the player's play area (59035: "When counting Gift cards you control, you are
 * considered to control none"), else the Gift upgrades the player controls. Shared by the Gift-scaling cards (59009 to
 * 59014) and by Appeal to Athena's own module. The sentence is read by nothing outside this kit, so there is no engine
 * rule behind it; the Gift cards' own bonuses (hit points, steady, retaliate, piercing) are not counts and are unaffected.
 */
export const giftCardsYouControl: ValueSpec = ifElse(
  exists(query("obligation", { name: "Appeal to Athena", ...inPlayAreaOf() })),
  0,
  countOf(query("upgrade", { trait: GIFT, controller: "you" })),
);

/**
 * Wave 10 scripting module `hercules/hercules/identity` (docs/phase7-wave10-hero-packs.md H2, H3.1, H3.2, H3.7, H3.9,
 * H8.4 line HS9).
 *
 * Cards (1):
 * - 59001a Hercules (hero_identity)
 *
 * The card's other face is 59001b Hercules (alter ego). The pack insert is the only source of the Labor and Gift rules
 * (docs/phase7-wave10-sources.md section 3).
 *
 * **59001a.atonement** (hero face): "Response: After a labor card is added to the victory display, put the top card of
 * the gift deck into play. Ready Hercules. You may flip to alter-ego form. (Limit once per phase.)" Heard on the hero
 * face only, so a Labor card finished while he is in alter-ego form earns no Gift (the insert: "while in hero form"). A
 * Labor card that goes back to the bottom of its deck is not "added to the victory display" and is not heard
 * (`on.leavesPlay` with `to: "victoryDisplay"`; the printed text says "added", the insert "enters"). With the Gift deck
 * empty nothing enters play and he still readies and may flip. The flip is the card's own and does not use the
 * player's change of form for the round (RRG 1.8 "Form, Change Form", p. 21). The limit is once per phase, so it is
 * heard again in the next phase.
 *
 * **59001b.hercules-constant** (alter-ego face): "Hercules begins the game with a labor deck and a gift deck." Carried
 * by the card data (`separateDecks`, built facedown and shuffled at setup, both owned by the Hercules player); the ref
 * is an empty constant, as for `56084.life-model-decoy-constant`.
 *
 * **59001b.new-labors-of-hercules** (alter-ego face): "Action: If there is no labor card in play, reveal the top card
 * of the labor deck." Unusable while a card with the Labor trait is in play and with the Labor deck empty. The card
 * revealed is an encounter card owned by Hercules, resolved under the reveal procedure (RRG 1.8 "Reveal", p. 38).
 */
export const HERCULES_IDENTITY: AbilityRegistry = defineAbilities({
  "59001a.atonement": heroResponse(
    on.leavesPlay(LABOR_CARD, { to: "victoryDisplay" }),
    { limit: oncePerPhase },
    selectCards("gift", separateDeckCards("Gift", you, 1)),
    putIntoPlay(chosen("gift")),
    ready(yourIdentity),
    chooseOne(option("Flip to alter-ego form", changeForm(you, "alterEgo")), option("Do not flip")),
  ),

  "59001b.hercules-constant": constant(),
  "59001b.new-labors-of-hercules": alterEgoAction(
    { while: allOf(not(exists(LABOR_CARD)), valueAtLeast(separateDeckCountOf("Labor"), 1)) },
    revealTopOfSeparateDeck("Labor"),
  ),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. None. */
export const HERCULES_IDENTITY_SKIPPED: Readonly<Record<string, string>> = {};
