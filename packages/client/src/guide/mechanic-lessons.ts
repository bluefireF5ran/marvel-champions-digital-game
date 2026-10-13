/**
 * The hero-mechanic "Try it" lessons (guided mode §3.14, `docs/guided-mode.md`): one short `Lesson` per mechanic, played
 * against `guide/mechanic-tryit-config.ts`'s own opening on the same `GuideController` and `LessonStep` shapes the
 * aspect lessons use (`guide/aspect-lessons.ts`). Each is a scripted situation: the lesson names the one thing to do,
 * the player does it with the real controls, and the step advances when the engine's own state or events say it
 * happened, never on a click the client counted itself.
 *
 * Copy is original, written for a player who has read the mechanic's glossary entry once. Mid-sentence terms use
 * `[[id|label]]` markup (`view/term-text-model.ts`); `tip`, `short` and `doThis` are plain text. Input stays loose
 * (`FULL_GATE` lists every basic action), the way the aspect lessons keep it: a player free to keep playing is never
 * blocked while a step waits for them to get around to the mechanic.
 */
import { abilityId, cardId, type CardId } from "@mc/content";
import {
  cardInHand,
  cardPlayed,
  defenderDeclared,
  eventSeen,
  formIs,
  type Lesson,
  type LessonObservation,
  type LessonPredicate,
  villainActivationPast,
} from "../view/lesson-model.js";
import { evidenceInputOf, faceupEvidenceOf } from "../view/evidence-model.js";
import type { MechanicTryItId } from "./mechanic-tryits.js";

const FULL_GATE = ["attack", "thwart", "recover", "changeForm", "endTurn"] as const;

/** True once an event of `type` has been seen this lesson and no choice is left open: the ability behind it has settled. */
function seenAndSettled(type: Parameters<typeof eventSeen>[0]): LessonPredicate {
  const seen = eventSeen(type);
  return (observation: LessonObservation) => seen(observation) && observation.game.pendingChoice === null;
}

/** True once the game has reached the player phase of `round`: the "end your turn and come back" wait. */
function playerPhaseOfRound(round: number): LessonPredicate {
  return ({ game }) => game.round >= round && game.step.phase === "player";
}

/** The one Phoenix Force upgrade (either side) on the table, if any. */
function phoenixForceOf(observation: LessonObservation) {
  return Object.values(observation.game.instances).find((i) => i.cardId.startsWith("34002"));
}

/**
 * True once the perspective player holds no Phoenix Firebird any more. The lesson's last counters need one, but a
 * Firebird is also a card that can pay for another (a legal spend the lesson cannot forbid), so a player who paid for
 * the first with the second would otherwise wait forever on a card that is gone (QA playthrough B, QB-11).
 */
function noFirebirdLeft(observation: LessonObservation): boolean {
  const player = observation.game.players.find((p) => p.playerId === observation.perspectiveId);
  if (!player) return false;
  return !player.hand.some((id) => observation.game.instances[id]?.cardId === FIREBIRD);
}

/**
 * Storm: swap the Weather in play, then use its Special. The opening is solo Storm in alter-ego form with Clear
 * Skies already in play (setup's pick), so the lesson flips her first and then asks for Weather Control. The swap
 * and the new Weather's Special are one ability (`wave6/storm/storm/identity.ts`): the `cardsSwapped` event is the
 * swap, and the ability is settled once any choice its Special asks for (Thunderstorm's target) is answered.
 */
const STORM_TRYIT: Lesson = {
  id: "mechanic-tryit-storm",
  title: "Storm: the Weather deck",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Storm keeps a Weather deck",
        body:
          "Storm's four Weather cards wait in a facedown [[weatherDeck|Weather deck]] beside her identity. One Weather " +
          "is always in play, and it changes every character on the table, enemies too. Setup already put one into play.",
      },
      mode: "acknowledge",
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Storm",
        body:
          "Weather Control is printed on Storm's hero side, so [[flip|flip]] from Ororo to Storm first. Flipping is " +
          "free once each turn.",
        doThis: "Flip to Storm",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "weather-control",
      anchor: { kind: "zone", id: "identity" },
      copy: {
        title: "Use Weather Control",
        body:
          "Weather Control swaps the Weather in play for one you pick from the deck, then resolves the new Weather's " +
          "Special. Use it once each round. Pick any Weather you like, and answer whatever its Special asks.",
        tip: "A Special only resolves when another ability says so.",
        short: "Use Weather Control, then pick a Weather.",
        doThis: "Tap Storm, then Weather Control",
      },
      mode: "await",
      completes: seenAndSettled("cardsSwapped"),
      gate: FULL_GATE,
    },
    {
      id: "special-resolved",
      copy: {
        title: "Swapped, and the Special resolved",
        body:
          "The new Weather is in play and its Special has happened once. Its other text stays on for as long as it " +
          "is in play. Match the Weather to the turn: Hurricane clears threat, Thunderstorm hits an enemy, Clear " +
          "Skies draws a card, and Blizzard silences a minion.",
      },
      mode: "acknowledge",
    },
  ],
};

const DOWN_TIME = cardId("34024");
const FIREBIRD = cardId("34013");
const ENERGY = cardId("34025");
const PSIONIC_BOND = abilityId("34001a.psionic-bond");

/**
 * Phoenix: take Phoenix Force from 4 power counters to none. The opening is Jean Grey in alter-ego form with Phoenix
 * Force Restrained (setup puts it into play with 4 counters, `wave6/phoenix/phoenix/identity.ts`). Round 1 spends two
 * (Psionic Bond paying for Down Time, then Phoenix Firebird's "remove a counter" choice), round 2 spends the last two
 * (Psionic Bond paying for the second Firebird, then its own choice), and removing the last counter flips the card:
 * the lesson reads the flipped card, never a count the client kept itself.
 */
const PHOENIX_TRYIT: Lesson = {
  id: "mechanic-tryit-phoenix",
  title: "Phoenix: Restrained and Unleashed",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Phoenix Force holds her back",
        body:
          "[[phoenixForce|Phoenix Force]] is a permanent upgrade on your identity. It starts RESTRAINED with 4 power " +
          "counters. Take the last counter away and it flips to UNLEASHED: +2 ATK and -2 THW. Spend them on purpose.",
      },
      mode: "acknowledge",
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Phoenix",
        body:
          "Psionic Bond and Phoenix Firebird both need her hero side, so [[flip|flip]] from Jean Grey to Phoenix. " +
          "Phoenix Force is not a form card: it flips by its own rule, never with this button.",
        doThis: "Flip to Phoenix",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "psionic-bond",
      anchor: { kind: "card", code: DOWN_TIME },
      copy: {
        title: "Pay with a power counter",
        body:
          "Down Time [[cost|costs]] 1. Psionic Bond pays it for free by removing one power counter from Phoenix Force, " +
          "once each phase. Watch her counters drop from 4 to 3.",
        tip: "Psionic Bond pays with a counter, not a card.",
        doThis: "Play Down Time",
        doThisTabbed: "Tap Down Time, then Play",
        payWith: [{ kind: "identityAbility", abilityId: PSIONIC_BOND, doThis: "Tap Psionic Bond to spend a counter" }],
      },
      mode: "await",
      completes: cardPlayed(DOWN_TIME),
      gate: FULL_GATE,
    },
    {
      id: "firebird-remove",
      anchor: { kind: "card", code: FIREBIRD },
      copy: {
        title: "Phoenix Firebird: remove a counter",
        body:
          "Phoenix Firebird has two choices: remove 1 power counter to ready Phoenix, or place 2 counters on Phoenix " +
          "Force. Energy pays its cost. Choose to remove one.",
        tip: "Pick Remove 1 power counter.",
        doThis: "Play Firebird, then choose Remove",
        doThisTabbed: "Tap Firebird, then Play",
        payWith: [{ kind: "handCard", code: ENERGY, doThis: "Tap Energy, then Pay" }],
      },
      mode: "await",
      completes: (observation) => {
        const force = phoenixForceOf(observation);
        return force !== undefined && (force.counters.power ?? 0) <= 2 && observation.game.pendingChoice === null;
      },
      gate: FULL_GATE,
    },
    {
      id: "end-turn",
      anchor: { kind: "action", id: "endTurn" },
      copy: {
        title: "Two counters left",
        body:
          "Phoenix Force is down to 2 counters, still RESTRAINED. End your turn: Rhino acts, and round 2 begins with " +
          "the last Firebird still in your hand.",
        doThis: "End your turn",
      },
      mode: "await",
      completes: playerPhaseOfRound(2),
      gate: FULL_GATE,
    },
    {
      id: "firebird-flip",
      anchor: { kind: "card", code: FIREBIRD },
      copy: {
        title: "Take the last counter",
        body:
          "Psionic Bond pays Firebird's cost with one counter, and Firebird removes the other. When the last one " +
          "leaves, Phoenix Force flips by itself.",
        tip: "Choose Remove 1 power counter again.",
        doThis: "Play Firebird with Psionic Bond, then choose Remove",
        doThisTabbed: "Tap Firebird, then Play",
        payWith: [{ kind: "identityAbility", abilityId: PSIONIC_BOND, doThis: "Tap Psionic Bond to spend a counter" }],
      },
      mode: "await",
      // Either the flip, or no Firebird left to take the last counters with (it paid for the other one).
      completes: (observation) => phoenixForceOf(observation)?.flipped === true || noFirebirdLeft(observation),
      gate: FULL_GATE,
    },
    {
      // Only shown when the player spent a Firebird as a payment, so the last counters are still on the card: the
      // lesson says so and carries on to what Unleashed means rather than waiting on a card that is gone. It passes
      // by itself when Phoenix Force did flip.
      id: "firebird-spent",
      copy: {
        title: "Out of Firebirds",
        body:
          "A Firebird can pay for another card, and the second one went that way, so there is none left to take the " +
          "last counters. Phoenix Force flips by itself when its last counter goes. Here is what happens then.",
      },
      mode: "acknowledge",
      completes: (observation) => phoenixForceOf(observation)?.flipped === true,
    },
    {
      id: "unleashed",
      copy: {
        title: "Unleashed",
        body:
          "When Phoenix Force is UNLEASHED it gives +2 ATK and -2 THW, and Phoenix cards that check for the trait hit " +
          "harder. Placing counters back (Firebird's other choice, Cyclops, White Hot Room) flips it back once it holds " +
          "4 or more.",
      },
      mode: "acknowledge",
    },
  ],
};

/**
 * True once the player's turn has ended and Rhino's attack is being (or has been) dealt with: the defend prompt is
 * up, the villain phase is under way, or the round has already moved on. The tutorial's `villainActivationPast` can't
 * be used here: it is also true all through the player phase, and these lessons are not gated on the villain phase.
 */
function turnEnded(): LessonPredicate {
  return ({ game }) =>
    game.pendingChoice?.prompt.kind === "declareDefender" || game.step.phase === "villain" || game.round >= 2;
}

/** True once the defend decision is made (an event this lesson saw), or the chance has passed without one. */
function defenseDecided(): LessonPredicate {
  const declared = defenderDeclared();
  return (observation) => {
    if (declared(observation)) return true;
    if (observation.game.pendingChoice?.prompt.kind === "declareDefender") return false;
    return (
      observation.game.round >= 2 || (observation.game.step.phase === "villain" && villainActivationPast()(observation))
    );
  };
}

/** Shadowcat's mass form upgrade (Solid, or Phased once flipped), if it is on the table. */
function massFormOf(observation: LessonObservation) {
  return Object.values(observation.game.instances).find((i) => i.cardId.startsWith("32031"));
}

/**
 * Shadowcat: the mass form is a separate upgrade with its own flips, not the hero/alter-ego flip. Phase Control (an
 * alter-ego action) flips Solid to Phased; she flips to hero form so Rhino attacks her; defending while Phased takes
 * no damage, and Phased flips itself back to Solid after the defense (`wave6/mut_gen/shadowcat/identity.ts`). Every
 * check reads the upgrade's own `flipped` state, so the two kinds of flip can never be mistaken for each other.
 */
const SHADOWCAT_TRYIT: Lesson = {
  id: "mechanic-tryit-shadowcat",
  title: "Shadowcat: Solid and Phased",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Two flips, not one",
        body:
          "Shadowcat has a mass form upgrade on her identity: Solid on one side, Phased on the other. It flips on its " +
          "own rules, so it is not the [[flip|hero and alter-ego flip]] you already know, and that button never touches it.",
      },
      mode: "acknowledge",
    },
    {
      id: "phase-control",
      anchor: { kind: "zone", id: "identity" },
      copy: {
        title: "Phase Control",
        body:
          "Kitty Pryde's Phase Control flips the mass form from Solid to Phased. It is an action, so use it once each " +
          "round. It leaves her hero and alter-ego form exactly as it was.",
        short: "Use Phase Control to go Phased.",
        doThis: "Tap Kitty Pryde, then use her action",
      },
      mode: "await",
      completes: (observation) => massFormOf(observation)?.flipped === true,
      gate: FULL_GATE,
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Now flip to Shadowcat",
        body:
          "Rhino only attacks heroes; against an alter-ego he schemes. Flip to hero form so he comes for Shadowcat, " +
          "who is Phased. That second flip is the other kind, and it is separate.",
        doThis: "Flip to Shadowcat",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "end-turn",
      anchor: { kind: "action", id: "endTurn" },
      copy: {
        title: "Let him attack",
        body:
          "End your turn (if you are over your hand size, discard the extras first). Rhino attacks Shadowcat in his " +
          "villain phase, and you choose who defends.",
        doThis: "End your turn",
      },
      mode: "await",
      completes: turnEnded(),
      gate: FULL_GATE,
    },
    {
      id: "declare-defender",
      anchor: { kind: "choice", id: "defend" },
      copy: {
        title: "Defend while Phased",
        body:
          "While Shadowcat is [[defend|defending]] and Phased she cannot take damage. Defend with her and Rhino's " +
          "hit does nothing.",
        short: "Defend with Shadowcat: Phased takes no damage.",
        doThis: "Pick Shadowcat to defend",
      },
      mode: "await",
      completes: defenseDecided(),
    },
    {
      id: "back-to-solid",
      copy: {
        title: "Phased flipped back to Solid",
        body:
          "She took no damage, and after she defended the Phased side flipped itself back to Solid. Solid is a " +
          "resource for attack and defense events, and flipping it from there is your choice. Phase Control is ready " +
          "again next round.",
      },
      mode: "acknowledge",
    },
  ],
};

const CHARGED_CARD = cardId("37006");
const MOLECULAR_ACCELERATION = cardId("37010");
const GAMBIT_ENERGY = cardId("37022");

/**
 * Gambit: charge counters, and why "up to 3" still needs one. The opening is Remy LeBeau with no counters. Charge de
 * Card (a hero action) places one; paying for Charged Card with Molecular Acceleration places another when it is
 * spent, so Throw de Card (the interrupt on playing an ATTACK event) has 2 to remove and the player chooses how many
 * (`wave6/gambit/gambit/identity.ts`; with none on him it is never offered). The play step completes on the engine's
 * own `counterRemoved` event for a charge counter, so declining Throw de Card leaves the step waiting for it.
 */
const GAMBIT_TRYIT: Lesson = {
  id: "mechanic-tryit-gambit",
  title: "Gambit: charge counters",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Gambit runs on charge counters",
        body:
          "Charge counters sit on Gambit's identity card. His Throw de Card ability removes up to 3 of them when you " +
          'play an attack event, and the attack deals 1 extra damage for each. "Up to 3" still needs at least 1: ' +
          "with none on him it is not offered at all.",
      },
      mode: "acknowledge",
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Gambit",
        body: "Charge de Card is printed on his hero side, so [[flip|flip]] from Remy LeBeau to Gambit first.",
        doThis: "Flip to Gambit",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "charge-de-card",
      anchor: { kind: "zone", id: "identity" },
      copy: {
        title: "Place a charge counter",
        body:
          "Charge de Card places 1 charge counter on Gambit. It is an action you can use once each round. Right now " +
          "he has none, which is why Throw de Card would have nothing to remove.",
        short: "Use Charge de Card to place a counter.",
        doThis: "Tap Gambit, then Charge de Card",
      },
      mode: "await",
      completes: ({ game, perspectiveId }) => {
        const player = game.players.find((p) => p.playerId === perspectiveId);
        return (player ? (game.instances[player.identity.instanceId]?.counters.charge ?? 0) : 0) >= 1;
      },
      gate: FULL_GATE,
    },
    {
      id: "charged-card",
      anchor: { kind: "card", code: CHARGED_CARD },
      copy: {
        title: "Play Charged Card, then throw it",
        body:
          "Charged Card is an attack event that [[cost|costs]] 2. Molecular Acceleration places a charge counter on " +
          "Gambit when you spend it, so pay with it and Energy. Then Throw de Card can remove up to 3: " +
          "confirm Molecular Acceleration, then Gambit, and pick how many.",
        tip: "More counters removed means more damage, and more keywords on Charged Card.",
        short: "Pay with Molecular Acceleration, then use Throw de Card.",
        doThis: "Play Charged Card, then use Throw de Card",
        doThisTabbed: "Tap Charged Card, then Play",
        payWith: [
          { kind: "handCard", code: MOLECULAR_ACCELERATION, doThis: "Tap Molecular Acceleration to spend it" },
          { kind: "handCard", code: GAMBIT_ENERGY, doThis: "Tap Energy, then Pay" },
        ],
      },
      mode: "await",
      completes: (observation) => {
        const played = cardPlayed(CHARGED_CARD)(observation);
        const spent = observation.lastEvents.some((e) => e.type === "counterRemoved" && e.counterType === "charge");
        return played && spent && observation.game.pendingChoice === null;
      },
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "Counters spent, damage added",
        body:
          "Each counter you removed added 1 damage to the attack, and the counters are gone from Gambit. Charge de " +
          "Card, Molecular Acceleration and a few other cards put them back, so the cycle repeats.",
      },
      mode: "acknowledge",
    },
  ],
};

/** The Touched upgrade, if it is attached to something right now (it is set aside the rest of the time). */
function touchedOf(observation: LessonObservation) {
  return Object.values(observation.game.instances).find((i) => i.cardId === "38002" && i.attachedTo !== null);
}

/**
 * Rogue: Touched goes on another character, and what that character is decides what she gains. Skin Contact (a hero
 * action, once each round) finds Touched and attaches it to a character she chooses: with only Rhino in play in round
 * 1 that is a villain host, so she gains retaliate 1 (and his traits until the end of the round)
 * (`wave6/rogue/rogue/identity.ts`). The step reads the upgrade's own `attachedTo`, so it completes however Touched got
 * there.
 */
const ROGUE_TRYIT: Lesson = {
  id: "mechanic-tryit-rogue",
  title: "Rogue: Touched",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Touched is on loan",
        body:
          "Touched is Rogue's own upgrade, and it goes on someone else. What she gains depends on who wears it: a " +
          "minion gives her attacks overkill, a villain gives her retaliate 1, an ally makes her AERIAL, and a hero " +
          "gives her stalwart. See [[touched|Touched]] for the details.",
      },
      mode: "acknowledge",
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Rogue",
        body: "Skin Contact is printed on her hero side, so [[flip|flip]] from Anna Marie to Rogue first.",
        doThis: "Flip to Rogue",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "skin-contact",
      anchor: { kind: "zone", id: "identity" },
      copy: {
        title: "Use Skin Contact",
        body:
          "Skin Contact attaches Touched to another character and gives you each of that character's traits until " +
          "the end of the round. Only Rhino is in play, so pick him. It is an action you can use once each round.",
        short: "Use Skin Contact, then pick Rhino.",
        doThis: "Tap Rogue, then Skin Contact",
      },
      mode: "await",
      completes: (observation) => touchedOf(observation) !== undefined && observation.game.pendingChoice === null,
      gate: FULL_GATE,
    },
    {
      id: "villain-host",
      anchor: { kind: "zone", id: "villain" },
      copy: {
        title: "Touched is on Rhino",
        body:
          "Rhino is a villain, so Rogue gains retaliate 1 while Touched stays on him, plus his traits for the rest " +
          "of the round. When a player phase begins with her in hero form, Touched is set aside again, ready to go " +
          "on someone else.",
      },
      mode: "acknowledge",
    },
  ],
};

const BULLETPROOF_PROTECTOR = cardId("32009");
const TITANIUM_MUSCLES = cardId("32005");
const STEEL_FIST = cardId("32008");
const COLOSSUS_ENERGY = cardId("32022");
const COLOSSUS_GENIUS = cardId("32023");

/** How many tough status cards the perspective player's identity holds right now. */
function toughOnIdentity({ game, perspectiveId }: LessonObservation): number {
  const player = game.players.find((p) => p.playerId === perspectiveId);
  return player ? (game.instances[player.identity.instanceId]?.statuses.tough ?? 0) : 0;
}

/**
 * Colossus: two tough status cards at once, and what Titanium Muscles does with them. He can hold one more tough card
 * than anyone else (`wave6/mut_gen/colossus/identity.ts`). Steel Skin gives the first when he flips, Bulletproof
 * Protector trades it for two, and Titanium Muscles' hero resource then generates one [physical] resource per tough
 * card, so two pay for Steel Fist's cost of 2. The last step completes on the engine's own `resourcesGenerated` event
 * for 2, so it reads what Titanium Muscles really produced, never a count the client kept.
 */
const COLOSSUS_TRYIT: Lesson = {
  id: "mechanic-tryit-colossus",
  title: "Colossus: two tough cards",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Colossus holds two",
        body:
          "A tough status card stops one hit, and most characters can only wear one. Colossus can have 1 additional " +
          "[[tough|tough status card]], so two. Titanium Muscles turns each one into a [physical] resource.",
      },
      mode: "acknowledge",
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Colossus",
        body:
          "Steel Skin gives Colossus a tough status card after you change to his hero side. Confirm it when " +
          "the prompt asks, or he stays bare.",
        tip: "Confirm Steel Skin when asked.",
        doThis: "Flip to Colossus, then confirm Steel Skin",
      },
      mode: "await",
      completes: (observation) => toughOnIdentity(observation) >= 1,
      gate: FULL_GATE,
    },
    {
      id: "bulletproof-protector",
      anchor: { kind: "card", code: BULLETPROOF_PROTECTOR },
      copy: {
        title: "Two at once",
        body:
          "Bulletproof Protector costs nothing: discard a tough card from your hero, then choose to give him 2. " +
          "That is one more than he had, and exactly his limit.",
        tip: "Choose Give your hero 2 tough status cards.",
        doThis: "Play Bulletproof Protector, then choose 2 tough cards",
        doThisTabbed: "Tap Bulletproof Protector, then Play",
      },
      mode: "await",
      completes: (observation) => toughOnIdentity(observation) === 2 && observation.game.pendingChoice === null,
      gate: FULL_GATE,
    },
    {
      id: "titanium-muscles",
      anchor: { kind: "card", code: TITANIUM_MUSCLES },
      copy: {
        title: "Play Titanium Muscles",
        body:
          "Titanium Muscles [[cost|costs]] 2 and gives Colossus +1 ATK. Pay with Energy and Genius. Its own hero " +
          "resource is what you came for: it generates a [physical] resource for each tough card he has.",
        doThis: "Play Titanium Muscles",
        doThisTabbed: "Tap Titanium Muscles, then Play",
        payWith: [
          { kind: "handCard", code: COLOSSUS_ENERGY, doThis: "Tap Energy to spend it" },
          { kind: "handCard", code: COLOSSUS_GENIUS, doThis: "Tap Genius, then Pay" },
        ],
      },
      mode: "await",
      completes: cardPlayed(TITANIUM_MUSCLES),
      gate: FULL_GATE,
    },
    {
      id: "two-resources",
      anchor: { kind: "card", code: STEEL_FIST },
      copy: {
        title: "Two tough cards, two resources",
        body:
          "Steel Fist costs 2. Titanium Muscles can be used as a resource while you pay: tap Steel Fist, and it shows " +
          "up in the payment row as a tile marked In play. With two tough cards on Colossus it generates two " +
          "[physical] resources, exactly enough. Inspect on Titanium Muscles says the same. When Steel Fist offers " +
          "to discard a tough card, you may decline.",
        tip: "Titanium Muscles gives one resource per tough card.",
        doThis: "Play Steel Fist, paying with Titanium Muscles",
        doThisTabbed: "Tap Steel Fist, then Play",
        payWith: [
          {
            kind: "cardAbility",
            code: TITANIUM_MUSCLES,
            abilityId: abilityId("32005.titanium-muscles-resource"),
            doThis: "Tap Titanium Muscles to pay with it",
          },
        ],
      },
      mode: "await",
      completes: (observation) => {
        const generated = observation.lastEvents.some((e) => e.type === "resourcesGenerated" && e.amount === 2);
        return generated && cardPlayed(STEEL_FIST)(observation) && observation.game.pendingChoice === null;
      },
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "That is the engine",
        body:
          "Each tough card still stops one damage event by itself, and piercing strips them all. Keep him topped up " +
          "with Steel Skin, Perseverance and Bulletproof Protector, and Titanium Muscles pays you back for it.",
      },
      mode: "acknowledge",
    },
  ],
};

/** True while the perspective player's identity shows hero face `index` (a three-face identity's own numbering). */
function heroFaceIs(index: number): LessonPredicate {
  return ({ game, perspectiveId }) => {
    const identity = game.players.find((p) => p.playerId === perspectiveId)?.identity;
    return identity?.form === "hero" && identity.heroFormIndex === index;
  };
}

/**
 * Psylocke: flip a Psi-Knife to its Psi-Katana side. The opening is Betsy Braddock with both permanent blades already
 * attached, Knife side up (her Setup, `wave7/psylocke/psylocke/identity.ts`). Using a basic power offers Psi-Energy
 * Control as an interrupt, so the flip happens before the attack's value is read: a Katana adds +1 ATK and piercing to
 * a basic attack (`wave7/psylocke/psylocke/support-upgrades-allies.ts`), and shows the restricted keyword.
 */
const PSYLOCKE_TRYIT: Lesson = {
  id: "mechanic-tryit-psylocke",
  title: "Psylocke: Psi-Knife and Psi-Katana",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Two blades, two sides",
        body:
          "Psylocke starts with two permanent [[psiBlades|Psi-Knife]] upgrades already attached. Each is double-sided: " +
          "the Knife side gives +1 THW, the Katana side gives +1 ATK and piercing to a basic attack.",
      },
      mode: "acknowledge",
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Psylocke",
        body: "Psi-Energy Control is printed on her hero side, so [[flip|flip]] from Betsy Braddock to Psylocke first.",
        doThis: "Flip to Psylocke",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "attack",
      anchor: { kind: "action", id: "attack" },
      copy: {
        title: "Attack, and flip a blade",
        body:
          "Attack Rhino with her basic power. Psi-Energy Control may flip one blade before the attack resolves: accept " +
          "it to flip a Psi-Knife to its Katana side, so this attack gets +1 ATK and piercing.",
        tip: "Accept Psi-Energy Control when it is offered.",
        short: "Attack, then accept Psi-Energy Control.",
        doThis: "Attack, then accept Psi-Energy Control",
      },
      mode: "await",
      completes: seenAndSettled("cardFlipped"),
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "The Katana is restricted",
        body:
          "The flipped blade now shows its Psi-Katana side, which is [[restricted|restricted]]: it counts toward your " +
          "limit of two restricted cards. Flip it back with Psi-Energy Control on a later basic power, or flip the " +
          "other blade instead.",
      },
      mode: "acknowledge",
    },
  ],
};

/**
 * Angel: change between three faces. Warren Worthington III (alter-ego), Angel (hero face 0) and Archangel (hero face
 * 1, `wave7/angel/angel/identity.ts`): the engine's `changeForm` names the face (`to: { heroForm: n }`), which the
 * board's "Which form?" picker asks for. A change between two hero faces spends the once-per-round change too, so the
 * second change waits for round 2.
 */
const ANGEL_TRYIT: Lesson = {
  id: "mechanic-tryit-angel",
  title: "Angel: three faces",
  steps: [
    {
      id: "intro",
      copy: {
        title: "One identity, three faces",
        body:
          "Angel's identity folds into three faces: Warren Worthington III, Angel and Archangel. See " +
          "[[threeFaceIdentity|Three-sided identities]]. Each hero face has its own stats.",
      },
      mode: "acknowledge",
    },
    {
      id: "to-archangel",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Change to Archangel",
        body:
          "[[flip|Flip]] from Warren and the board asks which hero face. Pick Archangel: stronger ATK, no THW, and an " +
          "[[acceleration|acceleration]] icon that adds threat each round.",
        tip: "Pick Archangel in the Which form? list.",
        short: "Change form, then pick Archangel.",
        doThis: "Flip, then pick Archangel",
      },
      mode: "await",
      completes: heroFaceIs(1),
      gate: FULL_GATE,
    },
    {
      id: "end-turn",
      anchor: { kind: "action", id: "endTurn" },
      copy: {
        title: "Once each round",
        body:
          "A change between any two faces uses your once-per-round change, hero face to hero face included. End your " +
          "turn and the next round gives you another.",
        doThis: "End your turn",
      },
      mode: "await",
      completes: playerPhaseOfRound(2),
      gate: FULL_GATE,
    },
    {
      id: "to-angel",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Change to Angel",
        body: "Change form again and pick Angel. He is back to THW 2 and ATK 1.",
        short: "Change form, then pick Angel.",
        doThis: "Flip, then pick Angel",
      },
      mode: "await",
      completes: heroFaceIs(0),
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "Read the face showing",
        body: "Cards that name a face read the one showing now. Pick the face that fits the turn.",
      },
      mode: "acknowledge",
    },
  ],
};

const BUILD_SUPPORT = cardId("40027");
const PSIMITAR = cardId("40029");

/**
 * Cable: player side schemes and their limit. Soldier X's Setup (`wave7/next_evol/cable/identity.ts`) put Call for
 * Backup into play, so the lesson flips him and thwarts it; Build Support from his hand is a second player side scheme,
 * and with 1 or 2 players only one may be in play (RRG p. 34), so playing it asks which to discard, a plain discard and
 * not a defeat (`playerSideSchemeLimitDiscard`).
 */
const CABLE_TRYIT: Lesson = {
  id: "mechanic-tryit-cable",
  title: "Cable: player side schemes",
  steps: [
    {
      id: "intro",
      copy: {
        title: "A scheme of your own",
        body:
          "Cable's Soldier X setup put Call for Backup into play. A [[playerSideScheme|player side scheme]] sits beside " +
          "the main scheme with threat on it, and you thwart it like any side scheme.",
      },
      mode: "acknowledge",
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Cable",
        body: "Basic powers are used in hero form, so [[flip|flip]] from Nathan Summers to Cable first.",
        doThis: "Flip to Cable",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "thwart",
      anchor: { kind: "action", id: "thwart" },
      copy: {
        title: "Thwart Call for Backup",
        body:
          "Thwart the side scheme with Cable. Remove all its threat to defeat it and its When Defeated text happens. " +
          "One thwart will not finish it, and that is fine.",
        short: "Thwart Call for Backup.",
        doThis: "Tap Thwart, then Call for Backup",
      },
      mode: "await",
      completes: seenAndSettled("threatRemoved"),
      gate: FULL_GATE,
    },
    {
      id: "limit",
      anchor: { kind: "card", code: BUILD_SUPPORT },
      copy: {
        title: "The limit is one",
        body:
          "With 1 or 2 players only one player side scheme can be in play. Play Build Support and discard one of the " +
          "two. That discard is not a defeat, so no When Defeated text happens.",
        tip: "Either scheme may go.",
        doThis: "Play Build Support, then pick one to discard",
        doThisTabbed: "Tap Build Support, then Play",
        payWith: [{ kind: "handCard", code: PSIMITAR, doThis: "Tap Psimitar, then Pay" }],
      },
      mode: "await",
      completes: seenAndSettled("playerSideSchemeLimitDiscard"),
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "Defeat them instead",
        body:
          "Defeating a player side scheme is how you cash in its When Defeated text, and Cable readies after he defeats " +
          "one. Discarding at the limit just clears the room.",
      },
      mode: "acknowledge",
    },
  ],
};

const SPECIALIZED_TRAINING = cardId("43021");
const CLAW_MASTERY = cardId("43005");
const X23_GENIUS = cardId("43023");
const X23_ENERGY = cardId("43022");
const SPECIALISTS = ["43034", "43035", "43036", "43037"];

/** True once the perspective player controls one of the four Specialists. */
const specialistTaken: LessonPredicate = ({ game, perspectiveId }) =>
  Object.values(game.instances).some(
    (i) => SPECIALISTS.includes(i.cardId as string) && i.controllerId === perspectiveId,
  );

/**
 * X-23: Specialists. Specialized Training is a basic player side scheme with 5 threat solo. One turn clears it: Claw
 * Mastery takes X-23's ATK from 1 to 3, and Animal Instinct adds that ATK to a basic thwart, 2 + 3 = 5. When Training
 * is defeated she chooses a set-aside Specialist and it enters play attached to her (`wave7/x23/pack-cards.ts`).
 */
const X23_TRYIT: Lesson = {
  id: "mechanic-tryit-x23",
  title: "X-23: Specialists",
  steps: [
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to X-23",
        body: "Her hero cards need hero form, so [[flip|flip]] from Laura Kinney to X-23 first.",
        doThis: "Flip to X-23",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "play-training",
      anchor: { kind: "card", code: SPECIALIZED_TRAINING },
      copy: {
        title: "Play Specialized Training",
        body:
          "It's a [[playerSideScheme|player side scheme]] with 5 threat. Defeat it and each hero without a " +
          "Specialist takes one of four set-aside [[specialists|Specialists]], a permanent upgrade.",
        tip: "Genius pays for it on its own.",
        doThis: "Play Specialized Training",
        doThisTabbed: "Tap Specialized Training, then Play",
        payWith: [{ kind: "handCard", code: X23_GENIUS, doThis: "Tap Genius, then Pay" }],
      },
      mode: "await",
      completes: cardPlayed(SPECIALIZED_TRAINING),
      gate: FULL_GATE,
    },
    {
      id: "claw-mastery",
      anchor: { kind: "card", code: CLAW_MASTERY },
      copy: {
        title: "Sharpen her claws",
        body: "X-23's THW is only 2. Claw Mastery gives her +2 ATK this round, and Animal Instinct will turn ATK into THW.",
        tip: "Energy pays for it on its own.",
        doThis: "Play Claw Mastery",
        doThisTabbed: "Tap Claw Mastery, then Play",
        payWith: [{ kind: "handCard", code: X23_ENERGY, doThis: "Tap Energy, then Pay" }],
      },
      mode: "await",
      completes: cardPlayed(CLAW_MASTERY),
      gate: FULL_GATE,
    },
    {
      id: "thwart",
      anchor: { kind: "action", id: "thwart" },
      copy: {
        title: "Thwart it in one go",
        body:
          "Thwart Specialized Training. When asked, play Animal Instinct: she adds her 3 ATK to her 2 THW, " +
          "exactly the 5 threat.",
        short: "Thwart it, and play Animal Instinct when asked.",
        doThis: "Tap Thwart, then Specialized Training",
      },
      mode: "await",
      completes: eventSeen("threatRemoved"),
      gate: FULL_GATE,
    },
    {
      id: "pick-specialist",
      anchor: { kind: "zone", id: "identity" },
      copy: {
        title: "Choose a Specialist",
        body:
          "Training is defeated. Pick one Specialist: it enters play attached to X-23 and stays. Each one adds " +
          "1 to a stat, or 4 hit points, and has a response that draws a card.",
        short: "Pick a Specialist.",
        doThis: "Choose a Specialist",
      },
      mode: "await",
      completes: specialistTaken,
    },
    {
      id: "result",
      copy: {
        title: "A permanent edge",
        body:
          "The Specialist stays for the whole game. Specialized Training sits in your victory display with it, " +
          "so Training is worth playing early.",
      },
      mode: "acknowledge",
    },
  ],
};

/** The Frostbite upgrades attached to an enemy: Iceman's "Freeze!" has resolved once one is. */
function frostbiteAttached({ game }: LessonObservation): boolean {
  return Object.values(game.instances).some((i) => i.cardId.startsWith("46002") && i.attachedTo !== null);
}

/**
 * Iceman: "Freeze!" on a basic attack. The opening is Bobby Drake with six Frostbite upgrades set aside. "Freeze!" is
 * an interrupt on a basic attack or defense (`wave8/iceman/iceman/identity.ts`), offered once the attack is made, so
 * the lesson flips him, attacks Rhino, and the step finishes once a Frostbite is attached to him.
 */
const ICEMAN_TRYIT: Lesson = {
  id: "mechanic-tryit-iceman",
  title: "Iceman: Frostbite",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Six Frostbites, set aside",
        body:
          "Iceman begins with six Frostbite upgrades set aside. [[frostbite|Frostbite]] weakens the enemy it is " +
          "attached to, and it goes back to the set-aside pile when that enemy activates or leaves play.",
      },
      mode: "acknowledge",
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Iceman",
        body: '"Freeze!" is printed on his hero side, so [[flip|flip]] from Bobby Drake to Iceman first.',
        doThis: "Flip to Iceman",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "attack",
      anchor: { kind: "action", id: "attack" },
      copy: {
        title: "Attack, and Freeze! the villain",
        body:
          'Attack Rhino with a basic attack. "Freeze!" is offered as an interrupt: accept it, and a Frostbite ' +
          "attaches to Rhino before your damage lands. Defending does the same.",
        tip: 'Accept "Freeze!" when it is offered.',
        short: 'Attack, then accept "Freeze!".',
        doThis: 'Attack, then accept "Freeze!"',
      },
      mode: "await",
      completes: (observation) => frostbiteAttached(observation) && observation.game.pendingChoice === null,
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "Rhino is weaker",
        body:
          "Frostbite gives Rhino -1 SCH and -1 ATK. Cards like Take That! and Surprise Move need an enemy with an " +
          "upgrade attached, and a Frostbite counts.",
      },
      mode: "acknowledge",
    },
  ],
};

const LIMBO = cardId("45032");
const COLOSSUS = cardId("45031");

/** Colossus left the top of the deck for the table by the deck-top play (`cardPlayed` carries `from: "deckTop"`). */
const playedFromDeckTop: LessonPredicate = (observation) =>
  observation.lastEvents.some((event) => event.type === "cardPlayed" && event.from === "deckTop");

/**
 * Magik: the faceup top card, playing it, and Limbo. Illyana's hand is stacked with Limbo, a resource card and four
 * cards that pay for things, and Colossus (cost 3) is the top card (`mechanic-tryit-config.ts`). Her hero side plays
 * with the top card faceup and lets her play it once per phase as if it were in her hand, for 1 less
 * (`wave8/aoa/magik/identity.ts`); the engine logs that play as `cardPlayed { from: "deckTop" }`. Limbo's Action then
 * swaps a card in her hand with the new top card (`wave8/aoa/magik/support-upgrades-allies.ts`), logged as
 * `cardsSwapped`. Each step is done once its event has happened and no choice is left open.
 */
const MAGIK_TRYIT: Lesson = {
  id: "mechanic-tryit-magik",
  title: "Magik: the faceup top card",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Magik plays with her deck showing",
        body:
          "In hero form the top card of Magik's deck is [[faceupTopCard|faceup]]. Her upgrades read its resource " +
          "icon, and once per phase she may play it as if it were in her hand, for 1 less.",
      },
      mode: "acknowledge",
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Magik",
        body: "Her faceup deck is printed on her hero side, so [[flip|flip]] from Illyana Rasputin to Magik first.",
        doThis: "Flip to Magik",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "play-top",
      anchor: { kind: "card", code: COLOSSUS },
      copy: {
        title: "Play the top card",
        body:
          "Colossus is faceup on your deck. Tap him there: he costs 3, but 1 less from the top, so pay 2 with " +
          "Blood Rage and Test the Defense.",
        tip: "Tap the faceup card on your deck.",
        short: "Play Colossus from the deck.",
        doThis: "Tap Colossus on your deck",
      },
      mode: "await",
      completes: playedFromDeckTop,
      gate: FULL_GATE,
    },
    {
      id: "next-card",
      copy: {
        title: "The next card shows",
        body:
          "The moment Colossus left, the next card turned faceup. That was your one play from the top this phase: " +
          "tap the deck again and it tells you so.",
      },
      mode: "acknowledge",
    },
    {
      id: "play-limbo",
      anchor: { kind: "zone", id: "hand" },
      copy: {
        title: "Play Limbo",
        body: "Play Limbo from your hand, paying its 1 with The Power of Aggression.",
        tip: "Pay for Limbo with a resource card.",
        short: "Play Limbo.",
        doThis: "Play Limbo, pay with The Power of Aggression",
      },
      mode: "await",
      completes: cardPlayed(LIMBO),
      gate: FULL_GATE,
    },
    {
      id: "swap",
      anchor: { kind: "zone", id: "playArea" },
      copy: {
        title: "Choose what shows",
        body:
          "Tap Limbo, then LIMBO — EXHAUST. Pick the hand card to swap; the game then asks you to confirm the top " +
          "card, which is its only option. Your pick goes on top, so you decide what Magik's upgrades read.",
        tip: "Swap any card in your hand with the top card.",
        short: "Use Limbo, then pick a card.",
        doThis: "Tap Limbo, then LIMBO — EXHAUST",
      },
      mode: "await",
      completes: seenAndSettled("cardsSwapped"),
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "A new card shows",
        body:
          "The card you swapped in is now faceup on top of your deck, so what her upgrades read has changed. Limbo " +
          "also swaps at the start of the villain phase, and Stepping Disc and Illyana's pull put Magik spells back on top.",
      },
      mode: "acknowledge",
    },
  ],
};

/**
 * Magneto: Magnetic Pull. The deck is stacked so the pull discards two cards and stops at Magneto's Helmet
 * (`mechanic-tryit-config.ts`). The ability is on his hero side (`wave8/magneto/magneto/identity.ts`); the step is
 * settled once a card has been discarded from the deck and no choice is left open.
 */
const MAGNETO_TRYIT: Lesson = {
  id: "mechanic-tryit-magneto",
  title: "Magneto: Magnetic Pull",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Pull the metal to you",
        body:
          "[[magneticPull|Magnetic Pull]] discards cards from the top of your deck until a MAGNETIC card is " +
          "discarded, then adds that card to your hand. Other cards read what was discarded.",
      },
      mode: "acknowledge",
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Magneto",
        body: "Magnetic Pull is printed on his hero side, so [[flip|flip]] from Erik Lehnsherr to Magneto first.",
        doThis: "Flip to Magneto",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "pull",
      anchor: { kind: "zone", id: "identity" },
      copy: {
        title: "Use Magnetic Pull",
        body:
          "Tap Magneto, then Magnetic Pull. You can use it once each round. The cards it discards before the " +
          "MAGNETIC one are gone to the discard pile.",
        tip: "Magnetic Pull is once each round.",
        short: "Use Magnetic Pull.",
        doThis: "Tap Magneto, then Magnetic Pull",
      },
      mode: "await",
      completes: seenAndSettled("cardDiscardedFromDeck"),
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "Three discarded, one in hand",
        body:
          "Magneto's Helmet is MAGNETIC, so the pull stopped there and added it to your hand. It was still " +
          "discarded, so it counts: Magneto's Armor reads all three icons and Old Grievances counts three cards.",
      },
      mode: "acknowledge",
    },
  ],
};

/** True once a villain carries a stunned status card. */
function villainStunned({ game }: LessonObservation): boolean {
  return game.villains.some((villain) => (game.instances[villain.instanceId]?.statuses.stunned ?? 0) > 0);
}

/**
 * Jubilee: events that read the resource types paid. Firecracker (cost 2) stuns "if you paid for this card using 2
 * different resource types". Plasmoid Energy makes an [energy] and a [mental] at once, so that one card pays for it
 * with two types (`mechanic-tryit-config.ts`). The step is done once Rhino is stunned.
 */
const JUBILEE_TRYIT: Lesson = {
  id: "mechanic-tryit-jubilee",
  title: "Jubilee: different resource types",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Jubilee's events read how you paid",
        body:
          "Many of Jubilee's events do more when you [[paidWith|pay with different resource types]]. Firecracker " +
          "stuns if two different types paid for it. Plasmoid Energy makes two types at once.",
      },
      mode: "acknowledge",
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Jubilee",
        body: "Her events are hero events, so [[flip|flip]] from Jubilation Lee to Jubilee first.",
        doThis: "Flip to Jubilee",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "firecracker",
      anchor: { kind: "zone", id: "hand" },
      copy: {
        title: "Play Firecracker with Plasmoid Energy",
        body:
          "Play Firecracker (cost 2) and pay with Plasmoid Energy: it makes an energy and a mental resource, two " +
          "different types. Choose Rhino as the target.",
        tip: "Pay for Firecracker with Plasmoid Energy.",
        short: "Play Firecracker, paid by Plasmoid Energy.",
        doThis: "Play Firecracker, pay with Plasmoid Energy",
      },
      mode: "await",
      completes: (observation) => villainStunned(observation) && observation.game.pendingChoice === null,
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "Rhino is stunned",
        body:
          "Two different types paid, so Firecracker stunned him. Resources beyond a card's cost did not pay, so they " +
          "add no types. The game asks what a wild counts as only when your answer changes the result.",
      },
      anchor: { kind: "zone", id: "villain" },
      mode: "acknowledge",
    },
  ],
};

/**
 * Bishop: Energy Absorption. The deck's top two cards are Stored Energy (`mechanic-tryit-config.ts`). Rhino attacks a
 * hero in the villain phase, so the lesson flips Bishop, ends his turn, and the player takes the hit (the board asks
 * about a defender first) and accepts the Response. The step is settled once cards have been discarded from the deck
 * and no choice is left open.
 */
const BISHOP_TRYIT: Lesson = {
  id: "mechanic-tryit-bishop",
  title: "Bishop: Energy Absorption",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Bishop turns damage into cards",
        body:
          "When an attack damages Bishop, [[energyAbsorption|Energy Absorption]] discards that many cards from the " +
          "top of your deck. Every resource card among them goes to your hand.",
      },
      mode: "acknowledge",
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Bishop",
        body:
          "Rhino only attacks a hero, and Energy Absorption is printed on the hero side. [[flip|Flip]] from Lucas " +
          "Bishop to Bishop.",
        doThis: "Flip to Bishop",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "take-a-hit",
      anchor: { kind: "action", id: "endTurn" },
      copy: {
        title: "End your turn and take the hit",
        body:
          "End your turn (discard a card if the game asks). Rhino attacks Bishop: choose no defense, then accept " +
          "Energy Absorption when it is offered.",
        tip: "Accept Energy Absorption after the hit.",
        short: "End turn, take the hit, accept Energy Absorption.",
        doThis: "End turn, take the hit, accept Energy Absorption",
      },
      mode: "await",
      completes: seenAndSettled("cardDiscardedFromDeck"),
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "Resource cards came to your hand",
        body:
          "The cards that were not resources stay in your discard pile. His upgrades read the resource cards you " +
          "hold: Bishop's Rifle deals damage for each one, so a hit now stocks them.",
      },
      mode: "acknowledge",
    },
  ],
};

/** True once a Bamf! upgrade is attached to something. */
function bamfAttached({ game }: LessonObservation): boolean {
  return Object.values(game.instances).some((i) => i.cardId.startsWith("48006") && i.attachedTo !== null);
}

/** True once Bamf! was discarded from play in the last command and no choice is left open (the teleport defense). */
function bamfSpent({ game, lastEvents }: LessonObservation): boolean {
  return (
    game.pendingChoice === null &&
    lastEvents.some((event) => event.type === "cardDiscardedFromPlay" && String(event.cardId).startsWith("48006"))
  );
}

/**
 * Nightcrawler: Bamf!. The hand holds one Bamf! (cost 0, `mechanic-tryit-config.ts`). It attaches to an enemy, and its
 * Hero Interrupt (defense) fires when that enemy attacks: discard it to declare Nightcrawler the defender without
 * exhausting him (`wave8/ncrawler/nightcrawler/support-upgrades-allies.ts`). The interrupt fires while the attack is
 * being initiated, which logs no `defenderDeclared`, so the step is done when Bamf! is discarded from play and no
 * choice is left open.
 */
const NIGHTCRAWLER_TRYIT: Lesson = {
  id: "mechanic-tryit-nightcrawler",
  title: "Nightcrawler: Bamf!",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Bamf! lands on an enemy",
        body:
          "[[bamf|Bamf!]] is an upgrade that attaches to an enemy. When that enemy attacks, you can discard it to " +
          "teleport Nightcrawler in as the defender, and he doesn't exhaust.",
      },
      mode: "acknowledge",
    },
    {
      id: "attach",
      anchor: { kind: "zone", id: "hand" },
      copy: {
        title: "Attach Bamf! to Rhino",
        body: "Play Bamf! from your hand as Kurt Wagner. It costs nothing and attaches to Rhino, the only enemy.",
        tip: "Bamf! can be played in either form.",
        short: "Play Bamf! onto Rhino.",
        doThis: "Play Bamf!",
      },
      mode: "await",
      completes: bamfAttached,
      gate: FULL_GATE,
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Nightcrawler",
        body: "Bamf!'s interrupt is a Hero Interrupt, so [[flip|flip]] from Kurt Wagner to Nightcrawler before Rhino attacks.",
        doThis: "Flip to Nightcrawler",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "defend",
      anchor: { kind: "action", id: "endTurn" },
      copy: {
        title: "End your turn and teleport in",
        body:
          "End your turn. When Rhino attacks, Bamf! is offered: accept it, and Nightcrawler defends without " +
          "exhausting. That is a basic defense, so his DEF applies.",
        tip: "Accept Bamf! when Rhino attacks.",
        short: "End turn, then accept Bamf!.",
        doThis: "End turn, then accept Bamf!",
      },
      mode: "await",
      completes: bamfSpent,
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "Bamf! is spent",
        body:
          "Bamf! was discarded, and Nightcrawler took the hit with his own DEF. Rapid Teleportation can bring a " +
          "copy back from your discard pile, and Tally Ho! returns it when it makes him the defender.",
      },
      mode: "acknowledge",
    },
  ],
};

/** Nick Fury's suit form upgrade (Assault / Stealth, 50035a/b) in play, if any. */
function suitFormOf({ game }: LessonObservation) {
  return Object.values(game.instances).find((i) => i.cardId.startsWith("50035") && i.attachedTo !== null);
}

/** True while the suit form shows its Stealth face (the instance's `flipped` side, `wave9/aos/nick-fury/testing.ts`). */
const stealthShowing: LessonPredicate = (observation) => suitFormOf(observation)?.flipped === true;

/** True once the last command dealt damage to the villain and no choice (Break Cover, Assault) is left open. */
const villainHitAndSettled: LessonPredicate = ({ game, lastEvents }) =>
  game.pendingChoice === null &&
  lastEvents.some(
    (event) =>
      event.type === "damageDealt" && game.villains.some((villain) => villain.instanceId === event.targetInstanceId),
  );

/**
 * Nick Fury: Stealth and Assault. The opening is Nick Fury in alter-ego form with his suit form upgrade attached,
 * Assault up (`mechanic-tryit-config.ts`). Infiltrate (an alter-ego action) turns it to Stealth; as a hero, an enemy
 * that would attack him schemes instead and 1 threat of that scheme lands on the suit (`wave9/aos/nick-fury/
 * support-upgrades-allies.ts`). In round 2 his attack makes Break Cover (a forced interrupt) turn the suit to Assault,
 * and Assault offers to remove up to 3 threat from it for +1 damage each. Gather Intel (a basic thwart puts 1 threat
 * on the suit) is left to the glossary: round 1 has no threat on the main scheme to thwart.
 */
const NICK_FURY_TRYIT: Lesson = {
  id: "mechanic-tryit-nick-fury",
  title: "Nick Fury: Stealth and Assault",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Threat on your own suit",
        body:
          "Nick's [[suitForm|suit form]] is an upgrade with two sides. [[stealthSuit|Stealth]] makes an enemy's attack " +
          "on him a scheme and banks some of that threat on the suit. Assault spends it as extra damage.",
      },
      mode: "acknowledge",
    },
    {
      id: "infiltrate",
      anchor: { kind: "zone", id: "identity" },
      copy: {
        title: "Infiltrate: show Stealth",
        body:
          "Setup put the suit in play with Assault up. Infiltrate is an alter-ego action that turns it to Stealth. " +
          "It is free, and it is not your once-per-turn form change.",
        tip: "Tap Nick Fury, then Infiltrate.",
        short: "Use Infiltrate.",
        doThis: "Tap Nick Fury, then Infiltrate",
      },
      mode: "await",
      completes: stealthShowing,
      gate: FULL_GATE,
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Nick Fury",
        body: "Stealth only works in hero form, so [[flip|flip]] from the alter ego to the hero.",
        doThis: "Flip to hero form",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "stealth",
      anchor: { kind: "action", id: "endTurn" },
      copy: {
        title: "End your turn and let Rhino come",
        body:
          "End your turn (discard a card if the game asks). Rhino would attack Nick, so he schemes instead. Some " +
          "of that threat goes on the suit, not the main scheme.",
        tip: "Stealth only guards Nick himself, not an ally.",
        short: "End turn, then watch Stealth.",
        doThis: "End your turn",
      },
      mode: "await",
      completes: playerPhaseOfRound(2),
      gate: FULL_GATE,
    },
    {
      id: "assault",
      anchor: { kind: "action", id: "attack" },
      copy: {
        title: "Attack: Break Cover, then Assault",
        body:
          "Attacking forces Break Cover, which turns the suit to Assault. Then Assault offers to remove up to 3 threat " +
          "from the suit for 1 extra damage each. Accept it and spend what Stealth banked.",
        tip: "Break Cover resolves first, so the threat is spendable.",
        short: "Attack, then accept Assault.",
        doThis: "Attack Rhino, then accept Assault",
      },
      mode: "await",
      completes: villainHitAndSettled,
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "Banked threat became damage",
        body:
          "The suit is on Assault now; Infiltrate turns it back to Stealth only from the alter ego. A basic thwart " +
          "also banks 1 threat on the suit (Gather Intel), so thwarting feeds your next attack.",
      },
      mode: "acknowledge",
    },
  ],
};

const SUPPORT_STAFF = cardId("50008");
const COMMAND_TEAM = cardId("50016");
const REINFORCEMENTS = cardId("50005");

/** True once a card `code` is in the perspective player's play area. */
const inPlayArea =
  (code: CardId): LessonPredicate =>
  ({ game, perspectiveId }) => {
    const player = game.players.find((p) => p.playerId === perspectiveId);
    return !!player?.playArea.some((id) => game.instances[id]?.cardId === code);
  };

/**
 * Maria Hill: Reassignment. The opening is Maria Hill in alter-ego form with a hand of Support Staff (cost 1) and
 * Command Team (cost 2), both S.H.I.E.L.D. supports with Uses counters, and Reinforcements to pay for them
 * (`mechanic-tryit-config.ts`). Reassignment is an action printed on her hero side (`wave9/aos/maria-hill/identity.ts`):
 * it moves 1 counter from a S.H.I.E.L.D. support to another, once per round, and the counter becomes the type the
 * destination uses. It is only usable with two such supports in play, one of them holding a counter; the lesson is done
 * on the engine's own `countersMoved` event once the ability has settled.
 */
const MARIA_HILL_TRYIT: Lesson = {
  id: "mechanic-tryit-maria-hill",
  title: "Maria Hill: Reassignment",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Move counters between supports",
        body:
          "Maria's deck is built on [[shieldSupports|S.H.I.E.L.D. supports]]. Many of them run on counters, and " +
          "Reassignment moves one [[allPurposeCounters|counter]] from one such support to another.",
      },
      mode: "acknowledge",
    },
    {
      id: "support-staff",
      anchor: { kind: "card", code: SUPPORT_STAFF },
      copy: {
        title: "Play Support Staff",
        body: "Support Staff costs 1 and has the S.H.I.E.L.D. trait, with 3 staff counters. Pay with Reinforcements.",
        tip: "Discard Reinforcements to pay.",
        short: "Play Support Staff.",
        doThis: "Tap Support Staff, then Play",
        payWith: [{ kind: "handCard", code: REINFORCEMENTS, doThis: "Tap Reinforcements, then Pay" }],
      },
      mode: "await",
      completes: inPlayArea(SUPPORT_STAFF),
      gate: FULL_GATE,
    },
    {
      id: "command-team",
      anchor: { kind: "card", code: COMMAND_TEAM },
      copy: {
        title: "Play Command Team",
        body: "Command Team costs 2 and is a second S.H.I.E.L.D. support, with 3 command counters. Pay with two more.",
        tip: "Discard two Reinforcements to pay.",
        short: "Play Command Team.",
        doThis: "Tap Command Team, then Play",
        payWith: [
          { kind: "handCard", code: REINFORCEMENTS, doThis: "Tap Reinforcements, then Pay" },
          { kind: "handCard", code: REINFORCEMENTS, doThis: "Tap another Reinforcements, then Pay" },
        ],
      },
      mode: "await",
      completes: inPlayArea(COMMAND_TEAM),
      gate: FULL_GATE,
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Maria Hill",
        body: "Reassignment is printed on her hero side, so [[flip|flip]] from the alter ego to the hero.",
        doThis: "Flip to hero form",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "reassignment",
      anchor: { kind: "zone", id: "identity" },
      copy: {
        title: "Use Reassignment",
        body:
          "Pick the support to take a counter from, then the one to give it to. The counter takes the type its new " +
          "card uses. You may do this once each round.",
        tip: "It needs two supports and a counter to move.",
        short: "Use Reassignment.",
        doThis: "Tap Maria Hill, then Reassignment",
      },
      mode: "await",
      completes: seenAndSettled("countersMoved"),
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "One counter moved",
        body:
          "A support with no counters left is discarded, so move from one that has spare. Anything that places an " +
          "all-purpose counter, like Nick Fury or S.H.I.E.L.D. Director, feeds the same supports.",
      },
      mode: "acknowledge",
    },
  ],
};

/** The perspective player's identity instance. */
function identityOfPerspective({ game, perspectiveId }: LessonObservation) {
  const player = game.players.find((p) => p.playerId === perspectiveId);
  return player ? game.instances[player.identity.instanceId] : undefined;
}

/** True once at least one card is tucked under the perspective player's identity (Silk Sense's response resolved). */
const somethingTucked: LessonPredicate = (observation) =>
  (identityOfPerspective(observation)?.tucked.length ?? 0) > 0 && observation.game.pendingChoice === null;

/**
 * Silk: tucked cards. The encounter deck is stacked (`mechanic-tryit-config.ts`) so round 1's villain phase reveals
 * Advance, a treachery. As Silk, "after you resolve a treachery card" offers Silk Sense, which tucks that card under her
 * identity from the encounter discard pile (`wave9/silk/silk/identity.ts`). In round 2 she flips to Cindy Moon, whose
 * action discards a tucked card to draw 2 (once per round). Both steps read the identity's own `tucked` list and the
 * engine's `cardDrawn` event.
 */
const SILK_TRYIT: Lesson = {
  id: "mechanic-tryit-silk",
  title: "Silk: tucked cards",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Silk keeps what she beats",
        body:
          "A [[tuckedCards|tucked]] card sits faceup under another card, out of play. Silk tucks the minions, side " +
          "schemes and treacheries she deals with, and Cindy Moon cashes them in for cards. She holds up to 4.",
      },
      mode: "acknowledge",
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Silk",
        body: "Silk Sense is printed on her hero side, so [[flip|flip]] from Cindy Moon to Silk before the villain phase.",
        doThis: "Flip to Silk",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "tuck",
      anchor: { kind: "action", id: "endTurn" },
      copy: {
        title: "End your turn and tuck the treachery",
        body:
          "End your turn (discard a card if the game asks), and choose no defense. The encounter card revealed is a " +
          "treachery. After you resolve it, accept Silk Sense to tuck it under Silk.",
        tip: "Accept Silk Sense after the treachery.",
        short: "End turn, then accept Silk Sense.",
        doThis: "End turn, then accept Silk Sense",
      },
      mode: "await",
      completes: somethingTucked,
      gate: FULL_GATE,
    },
    {
      id: "flip-back",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip back to Cindy Moon",
        body: "The cash-in is printed on her alter-ego side. [[flip|Flip]] from Silk to Cindy Moon.",
        doThis: "Flip to Cindy Moon",
      },
      mode: "await",
      completes: (observation) => formIs("alterEgo")(observation) && observation.game.step.phase === "player",
      gate: FULL_GATE,
    },
    {
      id: "cindy-moon",
      anchor: { kind: "zone", id: "identity" },
      copy: {
        title: "Discard a tucked card, draw 2",
        body:
          "Cindy Moon's action discards a tucked card as its cost, then draws 2 cards. Use it once each round. With " +
          "nothing tucked it cannot be used.",
        tip: "The tucked card goes to the encounter discard pile.",
        short: "Use Cindy Moon's action.",
        doThis: "Tap Cindy Moon, then her action",
      },
      mode: "await",
      completes: ({ game, lastEvents, perspectiveId }) =>
        game.pendingChoice === null &&
        lastEvents.filter((event) => event.type === "cardDrawn" && event.playerId === perspectiveId).length >= 2,
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "Tucked, then traded",
        body:
          "Tucked cards are not in play, and they leave if Silk's identity card does. A fifth tucked card forces you to " +
          "keep only 4, so cash them in before the cap bites.",
      },
      mode: "acknowledge",
    },
  ],
};

const REDWING = cardId("53002");

/** True once Redwing's action settled: the ally is back in hand after having been played, and the villain took damage. */
const redwingSentHome: LessonPredicate = (observation) => {
  const { game, lastEvents } = observation;
  return (
    game.pendingChoice === null &&
    lastEvents.some(
      (event) => event.type === "damageDealt" && game.villains.some((v) => v.instanceId === event.targetInstanceId),
    ) &&
    cardInHand(REDWING)(observation)
  );
};

/**
 * Falcon: the faceup top card. As Falcon, the encounter deck's top card is faceup for everyone during the player
 * phase (`wave9/falcon/falcon/identity.ts`); the stacked opening makes it Charge (2 boost icons). Redwing's hero
 * action returns him to hand and discards that card, then deals damage to an enemy equal to its icons (star and
 * boost, `support-upgrades-allies.ts`). Because the card is faceup, the lesson can say what the hit will be; the step
 * is done when Redwing is back in hand and the villain took damage in the same action.
 */
const FALCON_TRYIT: Lesson = {
  id: "mechanic-tryit-falcon",
  title: "Falcon: the faceup top card",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Falcon sees what's coming",
        body:
          "As Falcon, the [[encounterTopFaceup|top encounter card is faceup]] during your turn. It isn't revealed, and " +
          "nothing triggers. Several of his cards [[discardedIcons|discard it for its icons]]. Redwing is the simplest.",
      },
      mode: "acknowledge",
    },
    {
      id: "redwing",
      anchor: { kind: "card", code: REDWING },
      copy: {
        title: "Play Redwing",
        body: "Redwing is an ally that costs 2. Pay with The Triskelion and Resource Reserve.",
        tip: "Redwing goes back to your hand later.",
        short: "Play Redwing.",
        doThis: "Tap Redwing, then Play",
        payWith: [
          { kind: "handCard", code: cardId("53022"), doThis: "Tap The Triskelion, then Pay" },
          { kind: "handCard", code: cardId("53021"), doThis: "Tap Resource Reserve, then Pay" },
        ],
      },
      mode: "await",
      completes: inPlayArea(REDWING),
      gate: FULL_GATE,
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Falcon",
        body:
          "The faceup card and Redwing's action are both for the hero. [[flip|Flip]] from Sam Wilson to Falcon, then " +
          "look at the top of the encounter deck.",
        doThis: "Flip to Falcon",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "send-redwing",
      anchor: { kind: "card", code: REDWING },
      copy: {
        title: "Redwing: discard it for damage",
        body:
          "Redwing's action returns him to your hand and discards the top encounter card. Choose damage to an enemy: " +
          "it equals the icons on the discarded card, so look first. A faceup card with no icons can't be used.",
        tip: "Pick Rhino as the target.",
        short: "Use Redwing's action on Rhino.",
        doThis: "Tap Redwing, then his action",
      },
      mode: "await",
      completes: redwingSentHome,
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "Icons became damage",
        body:
          "Redwing is back in hand, ready to play again. The next top card is faceup now. Bird's-Eye View and " +
          "Battlefield Awareness read the same icons for threat removal and a power bonus.",
      },
      mode: "acknowledge",
    },
  ],
};

/** True once the last command resolved ability `id` and no choice is left open. */
function abilityResolvedAndSettled(id: string): LessonPredicate {
  return ({ game, lastEvents }) =>
    game.pendingChoice === null &&
    lastEvents.some((event) => event.type === "abilityResolved" && event.abilityId === id);
}

/**
 * Black Panther: Inventor, then a Special. Shuri (alter ego) uses Inventor to find a Black Panther or Tech upgrade and play
 * it for 2 less (`wave9/bp/black-panther/identity.ts`); the action exhausts her, so the lesson ends the turn and flips in
 * round 2. As Black Panther, a basic attack answers with a Response that resolves the "Special" ability on one Black Panther
 * upgrade. Both steps read the engine's `abilityResolved` for the identity's own ability, so any upgrade chosen counts.
 */
const BLACK_PANTHER_TRYIT: Lesson = {
  id: "mechanic-tryit-black-panther",
  title: "Black Panther: Inventor and Specials",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Shuri builds, Black Panther uses",
        body:
          "Shuri's [[shuriInventor|Inventor]] fetches a Black Panther or Tech upgrade from your deck for 2 less. As " +
          "Black Panther, each basic power can then resolve that upgrade's Special.",
      },
      mode: "acknowledge",
    },
    {
      id: "inventor",
      anchor: { kind: "zone", id: "identity" },
      copy: {
        title: "Use Inventor",
        body:
          "Inventor exhausts Shuri, then lets you pick a Black Panther or Tech upgrade from your deck. It costs 2 " +
          "less, so each of these is free. Panther Claws hits hardest.",
        tip: "You pay any cost that is left.",
        short: "Use Inventor, then pick an upgrade.",
        doThis: "Tap Shuri, then Inventor",
      },
      mode: "await",
      completes: abilityResolvedAndSettled("51001b.inventor"),
      gate: FULL_GATE,
    },
    {
      id: "end-turn",
      anchor: { kind: "action", id: "endTurn" },
      copy: {
        title: "End your turn",
        body: "Inventor exhausted Shuri, so Black Panther can't attack this turn. End it and come back next round.",
        short: "End your turn.",
        doThis: "End your turn",
      },
      mode: "await",
      completes: playerPhaseOfRound(2),
      gate: FULL_GATE,
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Black Panther",
        body: "The Special response is printed on the hero side. [[flip|Flip]] from Shuri to Black Panther.",
        doThis: "Flip to Black Panther",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "special",
      anchor: { kind: "action", id: "attack" },
      copy: {
        title: "Attack, then resolve a Special",
        body:
          "Make a basic attack on Rhino. After it, accept the Response and pick your upgrade: its Special resolves " +
          "once. Most Specials also let you discard the upgrade for a bigger effect.",
        tip: "A Special is not a basic power.",
        short: "Attack, then accept the Response.",
        doThis: "Attack Rhino, then accept the Response",
      },
      mode: "await",
      completes: abilityResolvedAndSettled("51001a.black-panther-response"),
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "The Special resolved",
        body:
          "The upgrade stays unless you discarded it. Clawed Strike, On the Prowl and Wakanda Forever! also resolve " +
          "Specials, so a good upgrade pays off all game.",
      },
      mode: "acknowledge",
    },
  ],
};

/** The Chief Tactical Officer's secret counters (front face), or null once the card has flipped or is not in play. */
function tacticalSecrets({ game }: LessonObservation): number | null {
  const card = Object.values(game.instances).find((i) => i.cardId === "50183a");
  return card ? (card.counters?.secret ?? 0) : null;
}

/** True once the players hold faceup evidence (a card came out of the S.H.I.E.L.D. envelope). */
const evidenceGained: LessonPredicate = ({ game }) => {
  const input = evidenceInputOf(game);
  return input !== null && faceupEvidenceOf(input).length > 0;
};

/** True while the accusation prompt is open. */
const accusePromptOpen: LessonPredicate = ({ game }) => game.pendingChoice?.prompt.kind === "accuse";

/**
 * Baron Zemo: the evidence and the accusation (MC50 pp. 18 and 19). A solo Spider-Man game against Zemo whose seed
 * and stacked hand (`mechanic-tryit-config.ts`) let one round do all of it through the real prompts: the Chief Tactical
 * Officer's hero action twice (two [physical] each) clears its 2 secret counters, stage 1B's Response at the end of the
 * player phase places 2 on it and gains 2 evidence cards, and the same Response offers stage 2A, where the accusation
 * is made. Every step reads the engine: the secret counters on the environment, the faceup evidence through the sealed
 * `evidenceInputOf`, the open `accuse` prompt, and the accusation itself on `GameState.accusation`. The practice
 * answer in the last steps is a constant the lesson test pins to the seed's A.I.M. envelope; the client never reads
 * a hidden pile. The Evidence view is a scene, not game state, so the steps that point at it are acknowledgements.
 */
const ZEMO_TRYIT: Lesson = {
  id: "mechanic-tryit-zemo",
  title: "Baron Zemo: the accusation",
  steps: [
    {
      id: "intro",
      copy: {
        title: "A mole on the Board",
        body:
          "Three [[evidenceCards|evidence cards]] in a sealed A.I.M. envelope name the mole. Every card you gain from " +
          "the S.H.I.E.L.D. envelope crosses out combinations, until you can make the [[accusation|accusation]].",
      },
      mode: "acknowledge",
    },
    {
      id: "read-the-grid",
      copy: {
        title: "Read the Evidence view",
        body:
          "Open EVIDENCE on the board, or press E. It shows both envelopes by size, the evidence you hold faceup, " +
          "and a grid of 27 combinations. Faceup evidence crosses out every row that uses it. Close it when done.",
        tip: "Tap a card there to read it in Inspect.",
      },
      mode: "acknowledge",
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Spider-Man",
        body: "The board members' actions are Hero Actions, so [[flip|flip]] from Peter Parker to Spider-Man.",
        doThis: "Flip to Spider-Man",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "first-secret",
      copy: {
        title: "Uncover a secret",
        body:
          "Chief Tactical Officer has 2 secret counters. Its Hero Action spends two [physical] resources to remove " +
          "one and deal 2 damage to an enemy. Pay with Strength, which makes two.",
        tip: "Tap the Chief Tactical Officer card.",
        short: "Use the Tactical Officer once.",
        doThis: "Use the Chief Tactical Officer, pay with Strength",
      },
      mode: "await",
      completes: (observation) => (tacticalSecrets(observation) ?? 0) <= 1 && observation.game.pendingChoice === null,
      gate: FULL_GATE,
    },
    {
      id: "second-secret",
      copy: {
        title: "Uncover the last one",
        body: "Do it again, paying with both Web-Shooters. A board member with no secrets left is what gains evidence.",
        tip: "Spend one [physical] from each Web-Shooter.",
        short: "Use the Tactical Officer again.",
        doThis: "Use the Chief Tactical Officer, pay with both Web-Shooters",
      },
      mode: "await",
      completes: (observation) => tacticalSecrets(observation) === 0 && observation.game.pendingChoice === null,
      gate: FULL_GATE,
    },
    {
      id: "gain-evidence",
      anchor: { kind: "action", id: "endTurn" },
      copy: {
        title: "End the turn and gain evidence",
        body:
          "End your turn. Stage 1B's Response offers to place 2 secret counters on a board member with none, to gain 2 " +
          "evidence cards. Accept it and pick the Tactical Officer.",
        tip: "Put the counters back on the bare member.",
        short: "End turn, then gain evidence.",
        doThis: "End turn, accept the Response, pick the Tactical Officer",
      },
      mode: "await",
      completes: evidenceGained,
      gate: FULL_GATE,
    },
    {
      id: "advance",
      copy: {
        title: "The grid shrank",
        body:
          "The new evidence is faceup, and every combination that uses it is crossed out. The same Response offers to " +
          "advance to stage 2A for the accusation. Early is costly in a real game; this is practice, so advance.",
        tip: "Advance to stage 2A.",
        short: "Choose to advance.",
        doThis: "Choose Advance to stage 2A",
      },
      mode: "await",
      completes: accusePromptOpen,
      gate: FULL_GATE,
    },
    {
      id: "accuse",
      copy: {
        title: "Name the mole",
        body:
          "The sheet lists only the combinations left open, each under its board member. Pick one and confirm: it " +
          "is final. In this practice game the envelope holds Security Scanner, Ideology and Authority.",
        tip: "Security Scanner, Ideology, Authority.",
        short: "Accuse Security Scanner, Ideology, Authority.",
        doThis: "Pick that row, then Accuse",
      },
      mode: "await",
      completes: ({ game }) => game.accusation !== undefined && game.accusation !== null,
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "Four guesses checked",
        body:
          "Means, motive, opportunity and board member were each checked against the envelope. Each wrong one puts " +
          "a secret counter on every board member, and a right one costs nothing. Only be early when Zemo is close.",
      },
      mode: "acknowledge",
    },
  ],
};

const STARSTRUCK = cardId("58005");
const WONDER_MAN_ENERGY = cardId("58023");
const IONIC_PHYSIOLOGY_CODE = "58002";

/** The tucked cards under Wonder Man's Ionic Physiology, read from the engine's own list (empty if it is not in play). */
function ionicTucked(observation: LessonObservation): number {
  const ionic = Object.values(observation.game.instances).find((i) => i.cardId === IONIC_PHYSIOLOGY_CODE);
  return ionic?.tucked.length ?? 0;
}

/**
 * Wonder Man: overpay, tuck, then attack. The opening is Simon Williams with Ionic Physiology already attached and a
 * stacked hand (`mechanic-tryit-config.ts`). Starstruck costs 1 and Energy makes 2 [energy], so paying with Energy
 * alone overpays by 1 [energy], which stuns the enemy (`wave10/wonder_man/wonder-man/events.ts`). Ionic Physiology's
 * Response then tucks the played event (`identity.ts`), for +1 ATK, and a basic attack lands with that bonus before
 * the Forced Response discards the tucked card. The steps read the upgrade's own `tucked` list, never a count of
 * the client's.
 */
const WONDER_MAN_TRYIT: Lesson = {
  id: "mechanic-tryit-wonderMan",
  title: "Wonder Man: Ionic Physiology",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Wonder Man tucks his energy events",
        body:
          "[[ionicPhysiology|Ionic Physiology]] is already attached to Wonder Man. After you play an event with a " +
          "printed [energy] resource, it can tuck that event under itself, up to 3. Each tucked card is +1 ATK, " +
          "until he makes a basic attack and they are discarded. Some of his events also do more when " +
          "[[overpaying|overpaid]].",
      },
      mode: "acknowledge",
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to Wonder Man",
        body: "His events are hero actions, so [[flip|flip]] from Simon Williams to Wonder Man first.",
        doThis: "Flip to Wonder Man",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "starstruck",
      anchor: { kind: "card", code: STARSTRUCK },
      copy: {
        title: "Overpay for Starstruck",
        body:
          "Starstruck [[cost|costs]] 1, and Energy makes 2 [energy]. The extra [energy] is overpaid, and Starstruck " +
          "stuns the enemy when you overpay it with [energy]. Pay with Energy alone, then choose Rhino.",
        tip: "Resources beyond the cost are overpaid, not wasted.",
        short: "Play Starstruck, paying with Energy.",
        doThis: "Play Starstruck, paying with Energy",
        doThisTabbed: "Tap Starstruck, then Play",
        payWith: [{ kind: "handCard", code: WONDER_MAN_ENERGY, doThis: "Tap Energy, then Pay" }],
      },
      mode: "await",
      completes: cardPlayed(STARSTRUCK),
      gate: FULL_GATE,
    },
    {
      id: "tuck",
      anchor: { kind: "zone", id: "identity" },
      copy: {
        title: "Tuck Starstruck",
        body:
          "Starstruck has a printed [energy] resource, so Ionic Physiology offers to tuck it from your discard pile " +
          "and heal 1 damage from you. Accept it: Starstruck now sits under Ionic Physiology, and Wonder Man has " +
          "+1 ATK.",
        tip: "Accept Ionic Physiology when it is offered.",
        short: "Accept Ionic Physiology to tuck Starstruck.",
        doThis: "Accept Ionic Physiology",
      },
      mode: "await",
      completes: (observation) => ionicTucked(observation) >= 1 && observation.game.pendingChoice === null,
      gate: FULL_GATE,
    },
    {
      id: "attack",
      anchor: { kind: "action", id: "attack" },
      copy: {
        title: "Attack with the bonus",
        body:
          "Make a basic attack on Rhino. It uses Wonder Man's ATK with the +1 from the tucked card. After the attack, " +
          "every card tucked under Ionic Physiology is discarded, so the bonus lasts for one attack.",
        tip: "An event's attack does not discard the tucked cards, only a basic attack does.",
        short: "Attack Rhino with a basic attack.",
        doThis: "Attack Rhino",
      },
      mode: "await",
      completes: (observation) =>
        Object.values(observation.game.instances).some((i) => i.cardId === IONIC_PHYSIOLOGY_CODE) &&
        ionicTucked(observation) === 0 &&
        eventSeen("damageDealt")(observation) &&
        observation.game.pendingChoice === null,
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "Tucked, spent, and played again",
        body:
          "The attack hit harder with the tucked card, which is now discarded. Fill Ionic Physiology to 3 before a " +
          "basic attack for the biggest hit. Mr. Hollywood only overpays, so pair it with an event that pays out for " +
          "[energy] beyond its cost.",
      },
      mode: "acknowledge",
    },
  ],
};

const GIFT_OF_BATTLE = cardId("59009");
const HERCULES_PAYER = cardId("59023");
const WISDOM_PAYER = cardId("59024");
const EMBODY_PATHOS_CODE = "59003";
const GIFT_CODES: readonly string[] = ["59005", "59006", "59007"];

/** True once the Labor card Embody Pathos is attached to a scheme and nothing is left open (its find prompt is answered). */
const laborAttached: LessonPredicate = ({ game }) =>
  game.pendingChoice === null &&
  Object.values(game.instances).some((i) => i.cardId === EMBODY_PATHOS_CODE && i.attachedTo !== null);

/** True once the Labor card sits in the victory display, the state's own list: the Labor is finished. */
const laborFinished: LessonPredicate = ({ game }) =>
  game.victoryDisplay.some((id) => game.instances[id]?.cardId === EMBODY_PATHOS_CODE);

/** True once a Gift card is attached (in play) and the Response's follow-up choices are answered. */
const giftEntered: LessonPredicate = ({ game }) =>
  game.pendingChoice === null &&
  Object.values(game.instances).some((i) => GIFT_CODES.includes(i.cardId) && i.attachedTo !== null);

/**
 * Hercules: a Labor card to a Gift card. The opening is Hercules in alter-ego form. This seed puts Embody Pathos on top
 * of the Labor deck and Nemean Lion Skin on top of the Gift deck (`mechanic-tryit-config.ts`). New Labors of Hercules
 * (an alter-ego action) reveals the Labor and attaches it to a side scheme; only his thwarts can remove its threat
 * (`wave10/hercules/hercules/gift-labor.ts`). Finishing it puts it in the victory display, which Atonement answers
 * with the top Gift card, and The Gift of Battle then costs 1 less for the Gift he controls. Every step reads the
 * state's own victory display, attachments and played-card events.
 */
const HERCULES_TRYIT: Lesson = {
  id: "mechanic-tryit-hercules",
  title: "Hercules: Labor and Gift",
  steps: [
    {
      id: "intro",
      copy: {
        title: "Two decks beside Hercules",
        body:
          "Hercules brings a facedown Labor deck and a facedown Gift deck ([[laborGiftDecks|Labor and Gift decks]]). " +
          "A Labor card is an obstacle you reveal and must finish. Finishing one earns the top Gift card, a permanent " +
          "upgrade, and some of his cards get cheaper or stronger for each Gift card you control.",
      },
      mode: "acknowledge",
    },
    {
      id: "new-labors",
      anchor: { kind: "zone", id: "identity" },
      copy: {
        title: "Reveal a Labor card",
        body:
          "New Labors of Hercules is an alter-ego action that reveals the top Labor card when none is in play. This " +
          "one is Embody Pathos, which attaches to a side scheme you choose: pick Bomb Scare. Only Hercules's own " +
          "thwarts can remove threat from that scheme.",
        tip: "Allies and other heroes cannot thwart a scheme with Embody Pathos.",
        short: "Use New Labors of Hercules, then pick Bomb Scare.",
        doThis: "Tap Hercules, then New Labors of Hercules",
      },
      mode: "await",
      completes: laborAttached,
      gate: FULL_GATE,
    },
    {
      id: "flip",
      anchor: { kind: "action", id: "flip" },
      copy: {
        title: "Flip to hero form",
        body:
          "Atonement, which earns the Gift, is printed on his hero side, so [[flip|flip]] to hero form before you " +
          "finish the Labor. Finishing it as an alter ego earns nothing.",
        doThis: "Flip to Hercules",
      },
      mode: "await",
      completes: formIs("hero"),
      gate: FULL_GATE,
    },
    {
      id: "finish-labor",
      anchor: { kind: "action", id: "thwart" },
      copy: {
        title: "Finish the Labor",
        body:
          "Remove all the threat from the side scheme. The scheme has [[assault|assault]], so his basic thwart uses " +
          "his ATK of 3. Wisdom of Athena removes 4 more, and three of your other cards pay for it. It may take " +
          "two turns: end your turn if you must.",
        tip: "A finished Labor goes to the victory display.",
        short: "Thwart Bomb Scare until it is gone.",
        doThis: "Thwart the side scheme until it is gone",
        payWith: [{ kind: "handCard", code: WISDOM_PAYER, doThis: "Tap each Avenge Me! to pay for Wisdom of Athena" }],
      },
      mode: "await",
      completes: laborFinished,
      gate: FULL_GATE,
    },
    {
      id: "atonement",
      anchor: { kind: "zone", id: "identity" },
      copy: {
        title: "Atonement earns a Gift",
        body:
          "After a Labor card is added to the victory display, Atonement puts the top Gift card into play, readies " +
          "Hercules, and lets you flip. Accept it, and stay in hero form when it asks. Nemean Lion Skin is a " +
          "permanent upgrade that also draws 4 cards.",
        tip: "Atonement can happen once each phase.",
        short: "Accept Atonement and do not flip.",
        doThis: "Accept Atonement, then choose Do not flip",
      },
      mode: "await",
      completes: giftEntered,
      gate: FULL_GATE,
    },
    {
      id: "gift-of-battle",
      anchor: { kind: "card", code: GIFT_OF_BATTLE },
      copy: {
        title: "A Gift cuts the cost",
        body:
          "The Gift of Battle costs 3, reduced by 1 for each Gift card you control. With one Gift in play it costs " +
          "2. Pay with two cards and choose Rhino for 5 damage.",
        tip: "Gauntlets of Hercules, Golden Mace and Olympus also read your Gift cards.",
        short: "Play The Gift of Battle for 2.",
        doThis: "Play The Gift of Battle for 2",
        doThisTabbed: "Tap The Gift of Battle, then Play",
        payWith: [
          { kind: "handCard", code: HERCULES_PAYER, doThis: "Tap Recruitment Drive to pay" },
          { kind: "handCard", code: HERCULES_PAYER, doThis: "Tap a second Recruitment Drive, then Pay" },
        ],
      },
      mode: "await",
      completes: (observation) => cardPlayed(GIFT_OF_BATTLE)(observation) && observation.game.pendingChoice === null,
      gate: FULL_GATE,
    },
    {
      id: "result",
      copy: {
        title: "One Labor, one Gift",
        body:
          "Each Labor you finish adds a Gift, and a Labor that fails to find a target goes back to the bottom of its " +
          "deck. The more Gifts you hold, the cheaper and stronger the cards that read them.",
      },
      mode: "acknowledge",
    },
  ],
};

/** One `Lesson` per mechanic with a "Try it" game, keyed like `guide/mechanic-tryit-config.ts`'s own record. */
export const MECHANIC_TRYIT_LESSONS: Readonly<Record<MechanicTryItId, Lesson>> = {
  storm: STORM_TRYIT,
  phoenix: PHOENIX_TRYIT,
  shadowcat: SHADOWCAT_TRYIT,
  gambit: GAMBIT_TRYIT,
  rogue: ROGUE_TRYIT,
  colossus: COLOSSUS_TRYIT,
  psylocke: PSYLOCKE_TRYIT,
  angel: ANGEL_TRYIT,
  cable: CABLE_TRYIT,
  x23: X23_TRYIT,
  iceman: ICEMAN_TRYIT,
  magik: MAGIK_TRYIT,
  magneto: MAGNETO_TRYIT,
  jubilee: JUBILEE_TRYIT,
  bishop: BISHOP_TRYIT,
  nightcrawler: NIGHTCRAWLER_TRYIT,
  nickFury: NICK_FURY_TRYIT,
  mariaHill: MARIA_HILL_TRYIT,
  silk: SILK_TRYIT,
  falcon: FALCON_TRYIT,
  blackPanther: BLACK_PANTHER_TRYIT,
  zemo: ZEMO_TRYIT,
  wonderMan: WONDER_MAN_TRYIT,
  hercules: HERCULES_TRYIT,
};
