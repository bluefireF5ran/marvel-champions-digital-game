/**
 * docs/phase7-wave10-hero-packs.md H3.7 (engine task HT7): `on.leavesPlay(who, { to })`, a leaves-play trigger that
 * asks where the card went, with the real Hercules cards in a real game against Core's Rhino. The scripts are this
 * test's own; the pack's modules are scripted elsewhere.
 *
 * Hercules 59001a: "Atonement — Response: After a labor card is added to the victory display, put the top card of the
 * gift deck into play. Ready Hercules. You may flip to alter-ego form. (Limit once per phase.)" Gift cards 59005 to
 * 59007: "Response: After this card enters play, draw 4 cards."
 *
 * RRG 1.8 "Victory X" (p. 46): "An attachment or upgrade with the victory X keyword is placed in the victory display
 * when the card to which it is attached is defeated"; "A card with both the victory X and uses (X 'type') keywords is
 * placed in the victory display when its last all-purpose counter is removed from it." RRG 1.8 "Form, Change Form"
 * (p. 21): a card effect's change of form does not use the player's own change for the round.
 */

import { trait } from "@mc/content";
import {
  cardsInPlay,
  locateCard,
  separateDeckOf,
  type AbilityDefinition,
  type EngineDeps,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import {
  action,
  allOf,
  changeForm,
  chooseOne,
  chosen,
  draw,
  each,
  forcedInterrupt,
  heroResponse,
  on,
  oncePerPhase,
  option,
  putIntoPlay,
  query,
  ready,
  removeCountersFrom,
  response,
  revealTopOfSeparateDeck,
  selectCards,
  separateDeckCards,
  separateDeckCountOf,
  valueAtLeast,
  you,
  yourIdentity,
} from "./index.js";
import { P1, endTurn, firstLegal, identityOf, inst, patchInstance, playerOf, type Picker } from "../testing/harness.js";
import { withForm } from "../testing/staging.js";
import { codeOf } from "../wave9/testing.js";
import { herculesGame } from "../wave10/testing.js";
import {
  DEFEAT_THE_HYDRA,
  DISCARD_MINIONS,
  EMBODY_PATHOS,
  GIFT,
  LABOR,
  LABOR_SCRIPTS,
  LERNEAN_HYDRA,
  PROTECT_HUMANITY,
  REMOVE_LABOR_COUNTER,
  TEST_ACTIONS,
  depsWith,
  drive,
  newLabors,
  noLaborInPlay,
  theCard,
  withLaborOrder,
} from "./wave10-labor.testing.js";

vi.setConfig({ testTimeout: 120_000 });

const LABOR_CARD = query([], { trait: trait("LABOR") });
const ATONEMENT = "59001a.atonement";
const GIFT_RESPONSES = [
  "59005.nemean-lion-skin-response",
  "59006.shield-of-perseus-response",
  "59007.sword-of-peleus-response",
];
const REVEAL_AS_HERO = "test.reveal-labor-as-hero";
const COUNTER_AT_DEAL = "test.remove-labor-counter-at-deal";

const SCRIPTS: Readonly<Record<string, AbilityDefinition>> = {
  ...LABOR_SCRIPTS,
  ...TEST_ACTIONS,
  // The card's own text, as its module will write it.
  [ATONEMENT]: heroResponse(
    on.leavesPlay(LABOR_CARD, { to: "victoryDisplay" }),
    { limit: oncePerPhase },
    selectCards("gift", separateDeckCards(GIFT, you, 1)),
    putIntoPlay(chosen("gift")),
    ready(yourIdentity),
    chooseOne(option("Flip to alter-ego form", changeForm(you, "alterEgo")), option("Do not")),
  ),
  ...Object.fromEntries(GIFT_RESPONSES.map((id) => [id, response(on.entersPlay("self"), draw(4))])),
  // Test only. "Action: If there is no labor card in play, reveal the top card of the labor deck", in any form.
  [REVEAL_AS_HERO]: action(
    { while: allOf(noLaborInPlay, valueAtLeast(separateDeckCountOf(LABOR), 1)) },
    revealTopOfSeparateDeck(LABOR),
  ),
  // Test only. "Forced Interrupt: When encounter cards are dealt, remove 1 labor counter from each Labor card."
  [COUNTER_AT_DEAL]: forcedInterrupt(on.villainStepStarting(), removeCountersFrom(each(LABOR_CARD), "labor", 1)),
};
const DEPS: EngineDeps = depsWith(SCRIPTS);

/** Surgery on the card pool: both faces of Hercules also print the test abilities named. */
function withTestAbilities(state: GameState, ids: readonly string[]): GameState {
  const cardId = playerOf(state, P1).identity.cardId;
  const card = state.cardPool[cardId];
  if (card?.type !== "hero_identity") throw new Error("no identity card");
  const refs = ids.map((id) => ({ id: id as never }));
  const hero = { ...card.hero, abilities: [...card.hero.abilities, ...refs] };
  const alterEgo = { ...card.alterEgo, abilities: [...card.alterEgo.abilities, ...refs] };
  return { ...state, cardPool: { ...state.cardPool, [cardId]: { ...card, hero, alterEgo } } };
}

const game = (order: readonly string[], extra: readonly string[] = []): GameState =>
  withTestAbilities(withLaborOrder(herculesGame({ deps: DEPS }), ...order), [
    ...Object.keys(TEST_ACTIONS),
    REVEAL_AS_HERO,
    ...extra,
  ]);

const giftDeck = (state: GameState): readonly InstanceId[] => separateDeckOf(state, P1, GIFT).deck;
const giftsInPlay = (state: GameState): InstanceId[] =>
  cardsInPlay(state).filter((id) => ["59005", "59006", "59007"].includes(codeOf(state, id)));
const handSize = (state: GameState): number => playerOf(state, P1).hand.length;
const testAction = (state: GameState, ability: string) =>
  ({
    type: "useAbility",
    playerId: P1,
    cardInstanceId: identityOf(state, P1),
    abilityId: ability as never,
    payment: [],
  }) as const;

interface Seen {
  /** The phase of each window that offered Atonement. */
  readonly offeredIn: string[];
  /** Whether the flip was offered. */
  flipOffered: boolean;
}
/**
 * Uses every optional response offered (Atonement, a Gift card's draw), and answers Atonement's "you may flip" with
 * `flip`. Records what was offered.
 */
const eager =
  (seen: Seen, flip: boolean): Picker =>
  (state) => {
    const choice = state.pendingChoice;
    if (!choice) return [];
    if (choice.prompt.kind === "chooseTriggers") {
      const abilities = choice.options.filter((o) => o.ref.kind === "ability");
      if (abilities.some((o) => o.ref.kind === "ability" && o.ref.abilityId === ATONEMENT))
        seen.offeredIn.push(state.step.phase);
      return abilities.slice(0, Math.max(1, choice.minSelections)).map((o) => o.optionId);
    }
    if (choice.prompt.kind === "chooseOption" && choice.options.some((o) => o.label === "Flip to alter-ego form")) {
      seen.flipOffered = true;
      return [choice.options[flip ? 0 : 1]!.optionId];
    }
    return firstLegal(state);
  };
const fresh = (): Seen => ({ offeredIn: [], flipOffered: false });

/** Hercules in hero form with Defeat the Hydra on the Lernean Hydra (12 hit points), which has 11 damage. */
function hydraAtTheBrink(order: readonly string[] = [DEFEAT_THE_HYDRA, PROTECT_HUMANITY, EMBODY_PATHOS]): GameState {
  const start = game(order);
  const attached = drive(start, newLabors(start), firstLegal, DEPS).state;
  const hydra = theCard(attached, LERNEAN_HYDRA);
  return withForm(patchInstance(attached, hydra, { damage: 11 }), { heroForm: 0 });
}
const attackHydra = (state: GameState) =>
  ({
    type: "basicAttack",
    playerId: P1,
    attackerInstanceId: identityOf(state, P1),
    targetInstanceId: theCard(state, LERNEAN_HYDRA),
  }) as const;

describe("H3.7 Atonement: after a labor card is added to the victory display (real cards)", () => {
  it("Hercules defeats the Hydra's minion: Gift deck 3 to 2, one Gift in play, 4 cards drawn, Hercules ready, the flip offered and taken", () => {
    const start = hydraAtTheBrink();
    const top = giftDeck(start)[0]!;
    const hand = handSize(start);
    expect(giftDeck(start)).toHaveLength(3);
    const seen = fresh();
    const { state } = drive(start, attackHydra(start), eager(seen, true), DEPS);
    expect(state.victoryDisplay.map((id) => codeOf(state, id))).toEqual([DEFEAT_THE_HYDRA]);
    expect(seen.offeredIn).toEqual(["player"]);
    expect(giftDeck(state)).toHaveLength(2);
    expect(giftsInPlay(state)).toEqual([top]);
    expect(inst(state, top)).toMatchObject({ controllerId: P1, ownerId: P1, faceup: true });
    expect(locateCard(state, top)).toEqual({ kind: "attachment", hostInstanceId: identityOf(state, P1) });
    expect(handSize(state)).toBe(hand + 4);
    // He exhausted to attack.
    expect(inst(state, identityOf(state, P1)).exhausted).toBe(false);
    expect(seen.flipOffered).toBe(true);
    // The flip is the card's, so his own change of form for the round is still unused.
    expect(playerOf(state, P1).identity).toMatchObject({ form: "alterEgo", changedFormThisRound: false });
  });

  it("the flip declined: he stays in hero form, ready", () => {
    const start = hydraAtTheBrink();
    const { state } = drive(start, attackHydra(start), eager(fresh(), false), DEPS);
    expect(playerOf(state, P1).identity.form).toBe("hero");
    expect(inst(state, identityOf(state, P1)).exhausted).toBe(false);
    expect(giftsInPlay(state)).toHaveLength(1);
  });

  it("in alter-ego form the response is not offered (it is on the hero face)", () => {
    const start = hydraAtTheBrink();
    const alterEgo = withForm(patchInstance(start, theCard(start, LERNEAN_HYDRA), { damage: 0 }), "alterEgo");
    // A card effect defeats nothing here: the minion is discarded, and with it the attachment returns to its deck.
    // So finish Protect Humanity instead, the one Labor card an alter-ego can see finished.
    const off = drive(alterEgo, testAction(alterEgo, DISCARD_MINIONS), firstLegal, DEPS).state;
    expect(off.victoryDisplay).toEqual([]);
    const revealed = drive(off, newLabors(off), firstLegal, DEPS).state;
    const labor = theCard(revealed, PROTECT_HUMANITY);
    const atOne = patchInstance(revealed, labor, { counters: { labor: 1 } });
    const seen = fresh();
    const { state } = drive(atOne, testAction(atOne, REMOVE_LABOR_COUNTER), eager(seen, true), DEPS);
    expect(state.victoryDisplay.map((id) => codeOf(state, id))).toEqual([PROTECT_HUMANITY]);
    expect(seen.offeredIn).toEqual([]);
    expect(giftDeck(state)).toHaveLength(3);
    expect(giftsInPlay(state)).toEqual([]);
  });

  it("a Labor card that leaves play for its deck is not heard: the Hydra's minion discarded", () => {
    const start = hydraAtTheBrink();
    const seen = fresh();
    const { state } = drive(start, testAction(start, DISCARD_MINIONS), eager(seen, true), DEPS);
    expect(state.victoryDisplay).toEqual([]);
    expect(separateDeckOf(state, P1, LABOR).deck).toHaveLength(3);
    expect(seen.offeredIn).toEqual([]);
    expect(giftDeck(state)).toHaveLength(3);
  });

  it("a second Labor card finished in the same phase: no response (limit once per phase)", () => {
    const start = hydraAtTheBrink();
    const seen = fresh();
    const first = drive(start, attackHydra(start), eager(seen, false), DEPS).state;
    expect(giftDeck(first)).toHaveLength(2);
    // Protect Humanity is next: revealed, then its three counters removed.
    let state = drive(first, testAction(first, REVEAL_AS_HERO), eager(seen, false), DEPS).state;
    const labor = theCard(state, PROTECT_HUMANITY);
    expect(inst(state, labor).counters).toEqual({ labor: 3 });
    const hand = handSize(state);
    for (let i = 0; i < 3; i++) {
      state = drive(state, testAction(state, REMOVE_LABOR_COUNTER), eager(seen, false), DEPS).state;
    }
    expect(state.victoryDisplay.map((id) => codeOf(state, id))).toEqual([PROTECT_HUMANITY, DEFEAT_THE_HYDRA]);
    expect(seen.offeredIn).toEqual(["player"]);
    expect(giftDeck(state)).toHaveLength(2);
    expect(giftsInPlay(state)).toHaveLength(1);
    expect(handSize(state)).toBe(hand);
  });

  it("with the Gift deck empty: Hercules readies and may flip, nothing enters play, no cards drawn", () => {
    const staged = hydraAtTheBrink();
    const emptied: GameState = {
      ...staged,
      players: staged.players.map((p) =>
        p.playerId === P1 ? { ...p, separateDecks: { ...p.separateDecks, [GIFT]: { deck: [], discard: [] } } } : p,
      ),
    };
    const hand = handSize(emptied);
    const seen = fresh();
    const { state } = drive(emptied, attackHydra(emptied), eager(seen, true), DEPS);
    expect(seen.offeredIn).toEqual(["player"]);
    expect(giftsInPlay(state)).toEqual([]);
    expect(handSize(state)).toBe(hand);
    expect(inst(state, identityOf(state, P1)).exhausted).toBe(false);
    expect(seen.flipOffered).toBe(true);
    expect(playerOf(state, P1).identity.form).toBe("alterEgo");
  });

  it("Protect Humanity's last counter removed in the villain phase: the response is offered then", () => {
    const start = game([PROTECT_HUMANITY, DEFEAT_THE_HYDRA, EMBODY_PATHOS], [COUNTER_AT_DEAL]);
    const revealed = drive(start, newLabors(start), firstLegal, DEPS).state;
    const labor = theCard(revealed, PROTECT_HUMANITY);
    const hero = withForm(patchInstance(revealed, labor, { counters: { labor: 1 } }), { heroForm: 0 });
    const seen = fresh();
    const { state } = drive(hero, endTurn(P1), eager(seen, false), DEPS);
    expect(state.victoryDisplay.map((id) => codeOf(state, id))).toContain(PROTECT_HUMANITY);
    expect(seen.offeredIn).toEqual(["villain"]);
    expect(giftDeck(state)).toHaveLength(2);
    expect(giftsInPlay(state)).toHaveLength(1);
  });
});
