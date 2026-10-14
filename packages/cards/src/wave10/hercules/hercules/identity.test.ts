import { HERCULES_CARDS, cardId, type HeroIdentityCard } from "@mc/content";
import {
  activeEncounterDeck,
  applyCommand,
  characterProfile,
  cardsInPlay,
  legalActions,
  locateCard,
  resolveValue,
  separateDeckOf,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { validateDefinition } from "../../../dsl/validate.js";
import {
  AMADEUS_CHO,
  DEFEAT_THE_HYDRA,
  EMBODY_PATHOS,
  GIFT,
  LABOR,
  LERNEAN_HYDRA,
  PROTECT_HUMANITY,
  drive,
  laborCodes,
  newLabors,
  theCard,
  withLaborOrder,
} from "../../../dsl/wave10-labor.testing.js";
import { P1, firstLegal, identityOf, inst, patchInstance, playerOf, type Picker } from "../../../testing/harness.js";
import { defeatWithAttack, withForm } from "../../../testing/staging.js";
import { codeOf } from "../../../wave9/testing.js";
import { WAVE10_DEPS, herculesGame, herculesHeroGame } from "../../testing.js";
import { HERCULES_IDENTITY, HERCULES_IDENTITY_SKIPPED, giftCardsYouControl } from "./identity.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Hercules (59001a hero, 59001b alter ego) against Core's Rhino, docs/phase7-wave10-hero-packs.md H2, H3.1, H3.2, H3.7,
 * H3.9 and H8.4 line HS9. The hand-built Leadership deck `HERCULES_DECK`. Hero face: THW 1, ATK 3, DEF 2, 14 hit points,
 * hand size 4; alter-ego face: REC 4, hand size 6. His Labor deck (59002 to 59004, encounter cards he owns) and Gift deck
 * (59005 to 59007) are built when he is seated; a Labor card is revealed with the alter-ego Action, and each one that
 * reaches the victory display earns a Gift while he is in hero form.
 *
 * Sources: the Hercules pack insert (docs/phase7-wave10-sources.md section 3, the only source of the Gift and Labor
 * rules); RRG 1.8 "Reveal" (p. 38), "Victory X" (p. 46), "Form, Change Form" (p. 21), "Find" (p. 19), "Ownership and
 * Control" (p. 31); RRG 1.8 FAQ p. 65 and March 6, 2026 - Ruling 3 (a Labor card that cannot enter play; owner's answer
 * to question 3 = B).
 */
const ATONEMENT = "59001a.atonement";
const CONSTANT = "59001b.hercules-constant";
const NEW_LABORS = "59001b.new-labors-of-hercules";
const NEMEAN = "59005";
const SHIELD = "59006";
const SWORD = "59007";
const APPEAL = "59035";
const GIFTS = [NEMEAN, SHIELD, SWORD];

const IDENTITY = HERCULES_CARDS.find((c) => c.id === cardId("59001a")) as HeroIdentityCard;
const giftDeck = (s: GameState): readonly InstanceId[] => separateDeckOf(s, P1, GIFT).deck;
const giftsInPlay = (s: GameState): InstanceId[] => cardsInPlay(s).filter((id) => GIFTS.includes(codeOf(s, id)));
const handSize = (s: GameState): number => playerOf(s, P1).hand.length;
const victoryCodes = (s: GameState): string[] => s.victoryDisplay.map((id) => codeOf(s, id));
const offered = (s: GameState, ability: string): boolean => {
  const listed = legalActions(s, P1, WAVE10_DEPS);
  return (
    listed.kind === "turn" &&
    listed.legal.some((a) => a.action.kind === "useAbility" && (a.action.abilityId as string) === ability)
  );
};
const run = (s: GameState, command: Parameters<typeof drive>[1], pick: Picker = firstLegal) =>
  drive(s, command, pick, WAVE10_DEPS);

/** Hercules in alter-ego form with the Labor deck in this order from the top. */
const alterEgo = (...order: readonly string[]): GameState => withLaborOrder(herculesGame(), ...order);

/** Takes every choice: each optional response offered (Atonement among them), and the flip when `flip`. */
interface Seen {
  readonly offeredIn: string[];
  flipOffered: boolean;
}
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

/** Hercules in hero form with Defeat the Hydra attached to the Lernean Hydra (12 hit points), which has 11 damage. */
function hydraAtTheBrink(): GameState {
  const start = alterEgo(DEFEAT_THE_HYDRA, PROTECT_HUMANITY, EMBODY_PATHOS);
  const attached = run(start, newLabors(start)).state;
  return withForm(patchInstance(attached, theCard(attached, LERNEAN_HYDRA), { damage: 11 }), { heroForm: 0 });
}
const attackHydra = (s: GameState) =>
  ({
    type: "basicAttack",
    playerId: P1,
    attackerInstanceId: identityOf(s, P1),
    targetInstanceId: theCard(s, LERNEAN_HYDRA),
  }) as const;

/** The ruling's case: the Lernean Hydra is a facedown boost card on the villain, where a find cannot look (RRG 1.8 "Find", p. 19). */
function withHydraAsBoostCard(state: GameState): GameState {
  const hydra = theCard(state, LERNEAN_HYDRA);
  const villain = state.activeVillainId!;
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, setAside: p.setAside.filter((id) => id !== hydra) })),
    instances: {
      ...state.instances,
      [hydra]: { ...inst(state, hydra), faceup: false },
      [villain]: { ...inst(state, villain), boostCards: [hydra] },
    },
  };
}

/** Surgery: `code`'s Gift card taken out of the Gift deck and attached to the identity under his control. */
function withGift(state: GameState, code: string): GameState {
  const id = giftDeck(state).find((i) => codeOf(state, i) === code);
  if (!id) throw new Error(`no ${code} in the Gift deck`);
  const host = identityOf(state, P1);
  const moved: GameState = {
    ...state,
    players: state.players.map((p) =>
      p.playerId === P1
        ? {
            ...p,
            separateDecks: {
              ...p.separateDecks,
              [GIFT]: { ...p.separateDecks[GIFT]!, deck: p.separateDecks[GIFT]!.deck.filter((i) => i !== id) },
            },
          }
        : p,
    ),
  };
  const placed = patchInstance(moved, id, { faceup: true, controllerId: P1, attachedTo: host });
  return patchInstance(placed, host, { attachments: [...inst(placed, host).attachments, id] });
}

/** Surgery: Appeal to Athena in P1's play area, as a revealed obligation sits (faceup, controlled by nobody). */
function withAppeal(state: GameState): GameState {
  const piles = activeEncounterDeck(state);
  const id =
    piles.deck.find((i) => codeOf(state, i) === APPEAL) ??
    playerOf(state, P1).setAside.find((i) => codeOf(state, i) === APPEAL);
  if (!id) throw new Error("no Appeal to Athena");
  const placed: GameState = {
    ...state,
    encounterDecks: {
      ...state.encounterDecks,
      [Object.keys(state.encounterDecks).find((k) => state.encounterDecks[k] === piles)!]: {
        ...piles,
        deck: piles.deck.filter((i) => i !== id),
      },
    },
    players: state.players.map((p) => (p.playerId === P1 ? { ...p, playArea: [...p.playArea, id] } : p)),
  };
  return patchInstance(placed, id, { faceup: true, controllerId: null });
}

const giftCount = (s: GameState): number =>
  resolveValue(s, giftCardsYouControl, {
    selfInstanceId: null,
    controllerId: P1,
    event: null,
    bindings: {},
    deps: WAVE10_DEPS,
  });

describe("Hercules identity registry", () => {
  it("every ability validates, with the printed timing", () => {
    for (const id of [ATONEMENT, CONSTANT, NEW_LABORS])
      expect(validateDefinition(HERCULES_IDENTITY[id]!), id).toEqual([]);
    expect(HERCULES_IDENTITY[ATONEMENT]!.trigger).toMatchObject({ kind: "response", form: "hero" });
    expect((HERCULES_IDENTITY[ATONEMENT]!.trigger as { forced?: boolean }).forced).toBeFalsy();
    expect(HERCULES_IDENTITY[CONSTANT]!.trigger).toEqual({ kind: "constant" });
    expect(HERCULES_IDENTITY[NEW_LABORS]!.trigger).toMatchObject({ kind: "action", form: "alterEgo" });
  });

  it("all three printed refs are registered and none is skipped", () => {
    expect(HERCULES_IDENTITY_SKIPPED).toEqual({});
    const printed = [...IDENTITY.hero.abilities, ...IDENTITY.alterEgo.abilities].map((a) => a.id as string);
    expect(printed.sort()).toEqual([ATONEMENT, CONSTANT, NEW_LABORS].sort());
    expect(Object.keys(HERCULES_IDENTITY).sort()).toEqual(printed.sort());
  });

  it("data: hero THW 1, ATK 3, DEF 2, 14 hit points, hand size 4; alter ego REC 4, hand size 6; a Labor and a Gift deck", () => {
    expect(IDENTITY.hp).toBe(14);
    expect(IDENTITY.hero).toMatchObject({ thw: 1, atk: 3, def: 2, handSize: 4 });
    expect(IDENTITY.alterEgo).toMatchObject({ rec: 4, handSize: 6 });
    expect(IDENTITY.separateDecks?.map((d) => [d.name, d.cardFamily, d.cards.length])).toEqual([
      ["Labor", "encounter", 3],
      ["Gift", "player", 3],
    ]);
  });
});

describe(`${CONSTANT}: Hercules begins the game with a labor deck and a gift deck`, () => {
  it("setup: the Labor deck holds three facedown encounter cards he owns, the Gift deck three facedown upgrades he owns", () => {
    const s = herculesGame();
    expect(playerOf(s, P1).identity.form).toBe("alterEgo");
    expect(laborCodes(s).sort()).toEqual([DEFEAT_THE_HYDRA, EMBODY_PATHOS, PROTECT_HUMANITY].sort());
    expect(
      giftDeck(s)
        .map((i) => codeOf(s, i))
        .sort(),
    ).toEqual(GIFTS);
    for (const id of [...separateDeckOf(s, P1, LABOR).deck, ...giftDeck(s)]) {
      expect(inst(s, id)).toMatchObject({ ownerId: P1, faceup: false });
      expect(inst(s, id).controllerId).toBe(separateDeckOf(s, P1, GIFT).deck.includes(id) ? P1 : null);
    }
    expect(separateDeckOf(s, P1, LABOR).discard).toEqual([]);
    expect(separateDeckOf(s, P1, GIFT).discard).toEqual([]);
    // Neither deck is touched by drawing: a full alter-ego hand, a 40-card deck less the hand.
    expect(handSize(s)).toBe(6);
    // The encounter deck holds Appeal to Athena and none of the Labor cards.
    const pile = activeEncounterDeck(s);
    const codes = [...pile.deck, ...pile.discard].map((i) => codeOf(s, i));
    expect(codes).toContain(APPEAL);
    for (const code of [DEFEAT_THE_HYDRA, EMBODY_PATHOS, PROTECT_HUMANITY]) expect(codes).not.toContain(code);
  });

  it("the constant has no rule of its own", () => {
    expect(HERCULES_IDENTITY[CONSTANT]).toEqual({ trigger: { kind: "constant" }, effects: [] });
  });
});

describe(`${NEW_LABORS}: if there is no labor card in play, reveal the top card of the labor deck`, () => {
  it("offered in alter-ego form with no Labor card in play; Protect Humanity on top: the Labor deck holds 2, the obligation is in his play area with 3 labor counters", () => {
    const start = alterEgo(PROTECT_HUMANITY, DEFEAT_THE_HYDRA, EMBODY_PATHOS);
    expect(offered(start, NEW_LABORS)).toBe(true);
    const { state } = run(start, newLabors(start));
    const labor = theCard(state, PROTECT_HUMANITY);
    expect(laborCodes(state)).toEqual([DEFEAT_THE_HYDRA, EMBODY_PATHOS]);
    expect(locateCard(state, labor)).toEqual({ kind: "playArea", playerId: P1 });
    expect(inst(state, labor)).toMatchObject({ ownerId: P1, controllerId: null, counters: { labor: 3 } });
    expect(locateCard(state, theCard(state, AMADEUS_CHO))).toEqual({ kind: "playArea", playerId: P1 });
  });

  it("a second use is refused while a Labor card is in play", () => {
    const start = alterEgo(PROTECT_HUMANITY, DEFEAT_THE_HYDRA, EMBODY_PATHOS);
    const { state } = run(start, newLabors(start));
    expect(offered(state, NEW_LABORS)).toBe(false);
    const again = applyCommand(state, newLabors(state), WAVE10_DEPS);
    expect(again.ok).toBe(false);
    expect(laborCodes(state)).toEqual([DEFEAT_THE_HYDRA, EMBODY_PATHOS]);
  });

  it("not offered in hero form, nor with the Labor deck empty", () => {
    const start = alterEgo(PROTECT_HUMANITY, DEFEAT_THE_HYDRA, EMBODY_PATHOS);
    expect(offered(withForm(start, { heroForm: 0 }), NEW_LABORS)).toBe(false);
    const empty: GameState = {
      ...start,
      players: start.players.map((p) =>
        p.playerId === P1 ? { ...p, separateDecks: { ...p.separateDecks, [LABOR]: { deck: [], discard: [] } } } : p,
      ),
    };
    expect(offered(empty, NEW_LABORS)).toBe(false);
  });

  it("Defeat the Hydra on top: it finds Hercules's set-aside Lernean Hydra, which is engaged with him at 12 hit points", () => {
    const start = alterEgo(DEFEAT_THE_HYDRA, PROTECT_HUMANITY, EMBODY_PATHOS);
    const { state } = run(start, newLabors(start));
    const hydra = theCard(state, LERNEAN_HYDRA);
    expect(inst(state, hydra)).toMatchObject({
      engagedWith: P1,
      damage: 0,
      attachments: [theCard(state, DEFEAT_THE_HYDRA)],
    });
    expect(laborCodes(state)).toEqual([PROTECT_HUMANITY, EMBODY_PATHOS]);
    expect(offered(state, NEW_LABORS)).toBe(false);
  });
});

describe(`${ATONEMENT}: after a labor card is added to the victory display, put the top card of the gift deck into play`, () => {
  it("Hercules defeats the Hydra's minion in the player phase: Gift deck 3 to 2, one Gift in play, 4 cards drawn, Hercules ready, the flip offered and taken", () => {
    const start = hydraAtTheBrink();
    const top = giftDeck(start)[0]!;
    const hand = handSize(start);
    const seen = fresh();
    const { state } = run(start, attackHydra(start), eager(seen, true));
    expect(victoryCodes(state)).toEqual([DEFEAT_THE_HYDRA]);
    expect(seen.offeredIn).toEqual(["player"]);
    expect(giftDeck(state)).toHaveLength(2);
    expect(giftsInPlay(state)).toEqual([top]);
    expect(inst(state, top)).toMatchObject({ controllerId: P1, ownerId: P1, faceup: true });
    expect(locateCard(state, top)).toEqual({ kind: "attachment", hostInstanceId: identityOf(state, P1) });
    expect(handSize(state)).toBe(hand + 4);
    expect(inst(state, identityOf(state, P1)).exhausted).toBe(false);
    expect(seen.flipOffered).toBe(true);
    // The flip is the card's, so his own change of form for the round is still unused.
    expect(playerOf(state, P1).identity).toMatchObject({ form: "alterEgo", changedFormThisRound: false });
  });

  it("the flip declined: he stays in hero form, ready, with the Gift in play", () => {
    const { state } = run(hydraAtTheBrink(), attackHydra(hydraAtTheBrink()), eager(fresh(), false));
    expect(playerOf(state, P1).identity.form).toBe("hero");
    expect(inst(state, identityOf(state, P1)).exhausted).toBe(false);
    expect(giftsInPlay(state)).toHaveLength(1);
  });

  it("Response is optional: declined, no Gift enters play and he stays exhausted", () => {
    const start = hydraAtTheBrink();
    const decline: Picker = (s) => (s.pendingChoice?.prompt.kind === "chooseTriggers" ? [] : firstLegal(s));
    const { state } = run(start, attackHydra(start), decline);
    expect(victoryCodes(state)).toEqual([DEFEAT_THE_HYDRA]);
    expect(giftsInPlay(state)).toEqual([]);
    expect(giftDeck(state)).toHaveLength(3);
    expect(inst(state, identityOf(state, P1)).exhausted).toBe(true);
  });

  it("a Labor card that returns to the bottom of its deck is not 'added to the victory display': Defeat the Hydra with no target earns no Gift (question 3 = B)", () => {
    const start = withHydraAsBoostCard(alterEgo(DEFEAT_THE_HYDRA, PROTECT_HUMANITY, EMBODY_PATHOS));
    const hand = handSize(start);
    const seen = fresh();
    const { state } = run(start, newLabors(start), eager(seen, true));
    expect(laborCodes(state)).toEqual([PROTECT_HUMANITY, EMBODY_PATHOS, DEFEAT_THE_HYDRA]);
    expect(state.victoryDisplay).toEqual([]);
    expect(seen.offeredIn).toEqual([]);
    expect(giftDeck(state)).toHaveLength(3);
    expect(giftsInPlay(state)).toEqual([]);
    expect(handSize(state)).toBe(hand);
  });

  it("only the hero face carries it: the response is printed on 59001a and the alter-ego face prints none", () => {
    expect(IDENTITY.hero.abilities.map((a) => a.id as string)).toEqual([ATONEMENT]);
    expect(IDENTITY.alterEgo.abilities.map((a) => a.id as string)).not.toContain(ATONEMENT);
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
    const { state } = run(emptied, attackHydra(emptied), eager(seen, true));
    expect(seen.offeredIn).toEqual(["player"]);
    expect(giftsInPlay(state)).toEqual([]);
    expect(handSize(state)).toBe(hand);
    expect(inst(state, identityOf(state, P1)).exhausted).toBe(false);
    expect(seen.flipOffered).toBe(true);
    expect(playerOf(state, P1).identity.form).toBe("alterEgo");
  });

  it("defeat by a plain basic attack with the stock deps is heard through the real registry (no test scripts)", () => {
    const start = hydraAtTheBrink();
    const state = defeatWithAttack(WAVE10_DEPS, start, theCard(start, LERNEAN_HYDRA));
    expect(victoryCodes(state)).toEqual([DEFEAT_THE_HYDRA]);
  });
});

describe("giftCardsYouControl: the Gift cards he controls, none while Appeal to Athena is in his play area", () => {
  it("0 with no Gift in play, 1 with one, 3 with all three", () => {
    const start = herculesHeroGame();
    expect(giftCount(start)).toBe(0);
    const one = withGift(start, NEMEAN);
    expect(giftCount(one)).toBe(1);
    const three = withGift(withGift(one, SHIELD), SWORD);
    expect(giftCount(three)).toBe(3);
    expect(characterProfile(three, identityOf(three, P1), WAVE10_DEPS)).toBeDefined();
  });

  it("Appeal to Athena in his play area: 0 however many Gift cards he controls", () => {
    const three = withGift(withGift(withGift(herculesHeroGame(), NEMEAN), SHIELD), SWORD);
    expect(giftCount(withAppeal(three))).toBe(0);
    expect(giftCount(withAppeal(withGift(herculesHeroGame(), SHIELD)))).toBe(0);
  });
});
