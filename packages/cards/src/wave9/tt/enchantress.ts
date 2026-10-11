import { trait } from "@mc/content";
import type { AbilityRegistry, EffectSpec } from "@mc/engine";
import {
  addCounters,
  after,
  anyOf,
  attachCard,
  canTakeStatus,
  choiceFoundNothing,
  chooseCards,
  chooseTarget,
  chosen,
  confuse,
  constant,
  defineAbilities,
  discard,
  discardAtRandom,
  discardFromHand,
  draw,
  each,
  eachPlayer,
  encounterCards,
  encounterSetAside,
  eventAmount,
  exhaust,
  exhaustThis,
  exists,
  flipCard,
  forEachPlayer,
  forcedAction,
  forcedInterrupt,
  forcedResponse,
  gainsKeyword,
  gainsTrait,
  giveBoostCard,
  heal,
  identityOf,
  ifThen,
  inMode,
  instead,
  moveCards,
  not,
  on,
  perHero,
  placeThreat,
  putIntoPlay,
  query,
  ready,
  refCount,
  removeThreat,
  revealCard,
  rule,
  searchAndReveal,
  selectCards,
  self,
  setup,
  shuffleEncounterDeck,
  stateCheck,
  stun,
  takeDamage,
  theMainScheme,
  theVillain,
  thatPlayer,
  countersOn,
  dealDamage,
  dealIndirectDamage,
  varAtLeast,
  valueAtLeast,
  whenRevealed,
  you,
  zone,
} from "../../dsl/index.js";

const ENCHANTMENT = trait("ENCHANTMENT");
const ENTHRALLED = trait("ENTHRALLED");
const DEFIANT = trait("DEFIANT");

const ENCHANTRESS_VILLAIN = query("villain", { name: "Enchantress" });
const FUTURE_OF_DESPAIR = query("sideScheme", { name: "Future of Despair" });
const CROWN = query("attachment", { name: "Crown of the Enchantress" });
const HYPNOTIC_GAZE = query([], { name: "Hypnotic Gaze" });
/** "The Enchantment card in your play area": the Gaze (or Trance) attached to your identity. */
const YOUR_ENCHANTMENT = each(query("attachment", { trait: ENCHANTMENT, host: identityOf(you) }));
/** "A card you control": a player card in play (encounter cards are under the scenario's control, RRG "Control", p. 11). */
const CARD_YOU_CONTROL = query(["ally", "support", "upgrade"], { controller: "you" });
/** Your identity, if a status card of this type could be given to it now (RRG "Otherwise": cannot at least partly resolve). */
const YOUR_IDENTITY_CAN_BE = (status: "stunned" | "confused"): ReturnType<typeof query> =>
  query("identity", { controller: "you", ...canTakeStatus(status) });

/** "Forced Response: After Enchantress attacks you, place 1 charm counter on the Enchantment card in your play area." */
const enchantressForcedResponse = () =>
  forcedResponse(after.enemyAttacks("self", { againstYou: true }), addCounters("charm", 1, YOUR_ENCHANTMENT));

/**
 * "Put the set-aside Future of Despair into play, then place an additional N[per_hero] threat on it." It is put into
 * play, not revealed: its own When Revealed does not trigger (RRG "When Revealed", p. 52; see the module header).
 */
const putFutureOfDespairIntoPlay = (additionalPerHero: number): readonly EffectSpec[] => [
  selectCards("despair", encounterSetAside(FUTURE_OF_DESPAIR)),
  putIntoPlay(chosen("despair")),
  placeThreat(perHero(additionalPerHero), chosen("despair")),
];

/**
 * "Forced Interrupt: When a charm counter would be placed on the Enchantment card in your play area, if your identity
 * has the Enthralled trait, place 1 threat here instead." (Prime Real Estate 1B, Sovereign Sorceress 2B.) The
 * placement is per counter: N counters become N threat on the main scheme (docs/phase7-wave9.md section 3.55).
 */
const charmBecomesThreat = () =>
  forcedInterrupt(
    on.countersWouldBePlaced(
      "charm",
      query("attachment", { trait: ENCHANTMENT, host: each(query("identity", { trait: ENTHRALLED })) }),
    ),
    instead(placeThreat(eventAmount, self)),
  );

/** Hypnotic Gaze, the same card five times: the Defiant grant and the flip at five charm counters. */
const gazeDefiant = () => constant(gainsTrait(DEFIANT, query("identity", { hostOfSelf: true })));
/**
 * "If there are 5 or more charm counters here, remove each charm counter from here and flip this card." The card says
 * only "flip"; MC55 p. 7 says the Trance side's When Revealed triggers as normal, hence the reveal
 * (docs/phase7-wave9.md section 3.54).
 */
const gazeFlip = () =>
  stateCheck(
    valueAtLeast(countersOn(self, "charm"), 5),
    { kind: "removeCounters", target: self, counterType: "charm" },
    flipCard(self, { reveal: true }),
  );
const tranceEnthralled = () => constant(gainsTrait(ENTHRALLED, query("identity", { hostOfSelf: true })));

/**
 * Trance of Greed: "Draw 1 card, then play that card (paying its cost). If you cannot, take 1 damage." The DSL has no
 * builder for a paid play of a named card (`playFromHandIgnoringCost` takes `card`; the paid builder does not), so the
 * engine's `playFromHand { card, costReduction: 0 }` is written out. "If you cannot": nothing was drawn, or the drawn
 * card is still in the hand (a resource card, a card whose cost or play restriction blocks it, a payment declined).
 */
const playDrawnCard: EffectSpec = {
  kind: "playFromHand",
  player: you,
  card: chosen("drawn"),
  costReduction: { kind: "const", value: 0 },
};

/**
 * Enchantress, the Trickster Takeover scenario frame (docs/phase7-wave9.md sections 2.8, 3.53 to 3.56 and 8.4 item
 * 66; MC55 pp. 6 to 7). First half: the villain, both main schemes, Future of Despair, the five Hypnotic Gazes and their
 * Trance reverse sides. The encounter cards 55012 to 55026 are the second half.
 *
 * **The villain (55001 to 55003)**: each stage's Forced Response puts a charm counter on the Enchantment card in the
 * attacked player's play area. Stage II (standard mode only) and stage III put the set-aside Future of Despair into
 * play and add 3 or 4 threat per hero to it (2 + 3 = 5, 2 + 4 = 6 per hero, MC55 p. 22 FAQ). Steady and Toughness are
 * data.
 *
 * **Prime Real Estate (55004, 55005)**: 1A's Setup sets Future of Despair aside (the scenario record does not list it
 * in `setAsideCardIds`, so the Setup does, which is what the card says) and attaches a random set-aside Hypnotic Gaze to
 * each identity, in player order, with its reverse side hidden (`attachCard` `hideReverse`). The five Gazes are
 * set aside by the scenario builder (Permanent, no Setup keyword), so "set each remaining Hypnotic Gaze aside" is
 * already done. Both stages' Forced Interrupt turns each charm counter bound for an Enthralled identity's Enchantment
 * into 1 threat on the main scheme. 2A: stun each identity if the Crown is in play; otherwise search for it and reveal it.
 *
 * **Future of Despair (55006)**: Enchantress gains stalwart and cannot take damage. Its When Revealed (a charm counter
 * on each Enchantment card in play) is scripted as printed, but the villain puts the card into play without revealing
 * it, so by the RRG the When Revealed never triggers in this scenario (owner question in the handoff).
 *
 * **Hypnotic Gaze and Trance (55007 to 55011)**: the Gaze (Defiant) flips at five charm counters, removing them all,
 * and the Trance's When Revealed resolves for the Gaze's player. Each Trance grants Enthralled and has a Forced Action
 * (exhaust this card) the player must take before the player phase ends. Each When Revealed is "X. Otherwise, Y": Y
 * resolves when X cannot (a card to discard, a status card that can be given, an identity that can be exhausted).
 *
 * Cards (23 of the module's group; the first 11 ids are scripted here):
 * - 55001 Enchantress (villain)
 * - 55004a Prime Real Estate (main_scheme)
 * - 55006 Future of Despair (side_scheme)
 * - 55007a Hypnotic Gaze (attachment)
 * - 55008a Hypnotic Gaze (attachment)
 * - 55009a Hypnotic Gaze (attachment)
 * - 55010a Hypnotic Gaze (attachment)
 * - 55011a Hypnotic Gaze (attachment)
 * - 55012 Alluring Call (attachment)
 * - 55013 Kiss of Temptation (attachment)
 * - 55014 Love Concoction (attachment)
 * - 55015 Seduced (attachment)
 * - 55016 Crown of the Enchantress (attachment)
 * - 55017 Enthralled Lackey (minion)
 * - 55018 Enthralled Brute (minion)
 * - 55019 Sindr (minion)
 * - 55020 Ulik (minion)
 * - 55021 Law of Attraction (side_scheme)
 * - 55022 Spellbound (side_scheme)
 * - 55023 "Do My Bidding" (treachery)
 * - 55024 Magical Restraints (treachery)
 * - 55025 Spell Blast (treachery)
 * - 55026 Spell Shards (treachery)
 */
export const ENCHANTRESS: AbilityRegistry = defineAbilities({
  // The villain.
  "55001.enchantress-forced-response": enchantressForcedResponse(),
  "55002.enchantress-forced-response": enchantressForcedResponse(),
  "55002.when-revealed": whenRevealed(ifThen(inMode("standard"), putFutureOfDespairIntoPlay(3))),
  "55003.enchantress-forced-response": enchantressForcedResponse(),
  "55003.when-revealed": whenRevealed(putFutureOfDespairIntoPlay(4)),

  // Prime Real Estate 1A / 1B and Sovereign Sorceress 2A / 2B.
  "55004a.setup": setup(
    moveCards(encounterCards(["deck", "discard"], FUTURE_OF_DESPAIR), "encounterSetAside"),
    forEachPlayer(
      eachPlayer,
      selectCards("gaze", encounterSetAside(HYPNOTIC_GAZE, { random: 1 })),
      attachCard(chosen("gaze"), identityOf(thatPlayer), { hideReverse: true }),
    ),
  ),
  "55004b.prime-real-estate-forced-interrupt": charmBecomesThreat(),
  "55005a.when-revealed": whenRevealed(
    ifThen(
      exists(CROWN),
      stun(each(query("identity"))),
      // "Search the encounter deck and discard pile for Crown of the Enchantress and reveal it. (Shuffle.)"
      searchAndReveal("Crown of the Enchantress"),
    ),
  ),
  "55005b.sovereign-sorceress-forced-interrupt": charmBecomesThreat(),

  // Future of Despair.
  "55006.future-of-despair-constant": constant(
    gainsKeyword({ name: "stalwart" }, ENCHANTRESS_VILLAIN),
    rule({ kind: "cannotTakeDamage", target: ENCHANTRESS_VILLAIN }),
  ),
  "55006.when-revealed": whenRevealed(addCounters("charm", 1, each(query("attachment", { trait: ENCHANTMENT })))),

  // The five Hypnotic Gazes: Defiant, and the flip at five charm counters.
  "55007a.hypnotic-gaze-constant": gazeDefiant(),
  "55007a.hypnotic-gaze-constant-2": gazeFlip(),
  "55008a.hypnotic-gaze-constant": gazeDefiant(),
  "55008a.hypnotic-gaze-constant-2": gazeFlip(),
  "55009a.hypnotic-gaze-constant": gazeDefiant(),
  "55009a.hypnotic-gaze-constant-2": gazeFlip(),
  "55010a.hypnotic-gaze-constant": gazeDefiant(),
  "55010a.hypnotic-gaze-constant-2": gazeFlip(),
  "55011a.hypnotic-gaze-constant": gazeDefiant(),
  "55011a.hypnotic-gaze-constant-2": gazeFlip(),

  // Trance of Envy.
  "55007b.trance-of-envy-constant": tranceEnthralled(),
  "55007b.when-revealed": whenRevealed(
    chooseTarget("card", CARD_YOU_CONTROL),
    discard(chosen("card")),
    ifThen(choiceFoundNothing(), moveCards(zone("deck", you, { top: 8 }), "discard")),
  ),
  "55007b.trance-of-envy-forced-action": forcedAction(
    { cost: exhaustThis },
    giveBoostCard(theVillain),
    ready(identityOf(you)),
  ),

  // Trance of Greed.
  "55008b.trance-of-greed-constant": tranceEnthralled(),
  "55008b.when-revealed": whenRevealed(
    ifThen(exists(YOUR_IDENTITY_CAN_BE("confused")), confuse(identityOf(you)), takeDamage(2)),
  ),
  "55008b.trance-of-greed-forced-action": forcedAction(
    { cost: exhaustThis },
    draw(1, you, { bind: "drawn" }),
    playDrawnCard,
    selectCards("held", zone("hand", you, { filter: { inSlot: "drawn" } })),
    ifThen(anyOf(not(varAtLeast("drawn.count")), valueAtLeast(refCount(chosen("held")), 1)), takeDamage(1)),
  ),

  // Trance of Pride.
  "55009b.trance-of-pride-constant": tranceEnthralled(),
  "55009b.when-revealed": whenRevealed(
    ifThen(
      exists(query("identity", { controller: "you", exhausted: false })),
      exhaust(identityOf(you)),
      discardAtRandom(1),
    ),
  ),
  "55009b.trance-of-pride-forced-action": forcedAction(
    { cost: exhaustThis },
    placeThreat(1, theMainScheme),
    chooseTarget("scheme", query("sideScheme")),
    removeThreat(2, chosen("scheme")),
  ),

  // Trance of Sloth.
  "55010b.trance-of-sloth-constant": tranceEnthralled(),
  "55010b.when-revealed": whenRevealed(
    ifThen(exists(YOUR_IDENTITY_CAN_BE("stunned")), stun(identityOf(you)), placeThreat(2, theMainScheme)),
  ),
  "55010b.trance-of-sloth-forced-action": forcedAction(
    { cost: exhaustThis },
    heal(1, theVillain),
    draw(1),
    discardFromHand(1),
  ),

  // Trance of Wrath.
  "55011b.trance-of-wrath-constant": tranceEnthralled(),
  "55011b.when-revealed": whenRevealed(
    chooseCards("found", encounterCards(["deck"], undefined, 5), { min: 1, max: 1 }),
    revealCard(chosen("found"), you),
    shuffleEncounterDeck(),
  ),
  "55011b.trance-of-wrath-forced-action": forcedAction(
    { cost: exhaustThis },
    dealIndirectDamage(you, 1),
    chooseTarget("minion", query("minion")),
    dealDamage(2, chosen("minion")),
  ),
});

const SECOND_HALF = "second half, not scripted yet";

/** Refs of this module's cards deliberately left unscripted, each with its written reason. */
export const ENCHANTRESS_SKIPPED: Readonly<Record<string, string>> = {
  "55012.alluring-call-action": SECOND_HALF,
  "55012.alluring-call-forced-action": SECOND_HALF,
  "55012.boost": SECOND_HALF,
  "55013.boost": SECOND_HALF,
  "55013.kiss-of-temptation-action": SECOND_HALF,
  "55013.kiss-of-temptation-forced-action": SECOND_HALF,
  "55014.boost": SECOND_HALF,
  "55014.love-concoction-action": SECOND_HALF,
  "55014.love-concoction-forced-action": SECOND_HALF,
  "55015.seduced-action": `${SECOND_HALF}; waits on engine task 50 (cannotAttack basicOnly)`,
  "55015.seduced-constant": `${SECOND_HALF}; waits on engine task 50 (cannotAttack basicOnly)`,
  "55016.crown-of-the-enchantress-action": `${SECOND_HALF}; waits on engine task 41 (AbilityCost eachPlayer)`,
  "55016.crown-of-the-enchantress-constant": `${SECOND_HALF}; waits on engine task 41 (AbilityCost eachPlayer)`,
  "55016.crown-of-the-enchantress-forced-response": `${SECOND_HALF}; waits on engine task 41 (AbilityCost eachPlayer)`,
  "55017.boost": SECOND_HALF,
  "55017.enthralled-lackey-forced-response": SECOND_HALF,
  "55018.boost": SECOND_HALF,
  "55018.enthralled-brute-constant": SECOND_HALF,
  "55019.sindr-constant": SECOND_HALF,
  "55019.when-revealed": SECOND_HALF,
  "55020.ulik-constant": SECOND_HALF,
  "55020.ulik-forced-response": SECOND_HALF,
  "55020.when-defeated": SECOND_HALF,
  "55021.boost": SECOND_HALF,
  "55021.when-revealed": SECOND_HALF,
  "55022.when-defeated": SECOND_HALF,
  "55023.when-revealed": SECOND_HALF,
  "55024.when-revealed": SECOND_HALF,
  "55025.when-revealed": SECOND_HALF,
  "55026.boost": SECOND_HALF,
  "55026.when-revealed": SECOND_HALF,
};
