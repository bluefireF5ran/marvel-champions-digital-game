import {
  CORE_CARDS,
  TT_CARDS,
  WAVE9_CARDS,
  WAVE9_STARTER_DECKS,
  cardId,
  encounterSetId,
  type AnyCard,
  type DeckContents,
} from "@mc/content";
import {
  createGame,
  validateDeck,
  type Command,
  type EngineDeps,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { coreScenario } from "../../core/setup.js";
import {
  chosen,
  defineAbilities,
  encounterSetAside,
  mergeRegistries,
  putIntoPlay,
  query,
  selectCards,
  whenRevealed,
  you,
} from "../../dsl/index.js";
import { validateDefinition } from "../../dsl/validate.js";
import {
  P1,
  endTurn,
  firstLegal,
  inst,
  moveToHand,
  patchInstance,
  playerOf,
  settle,
  stackEncounterDeck,
  type Picker,
} from "../../testing/harness.js";
import { driveEventsPicking } from "../../testing/staging.js";
import { engageMinion } from "../../wave6/mut_gen/project-wideawake-testing.js";
import { WAVE8_ABILITIES } from "../../wave8/index.js";
import { BLANK, FILLER_A, SPIDER_MAN, codeOf, heroForm, types } from "../testing.js";
import { TT_ASPECT_BASIC, TT_ASPECT_BASIC_SKIPPED } from "./aspect-basic.js";
import { TRICKSTER_MAGIC } from "./trickster-magic.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * The four linked allies of Trickster Magic (55063 to 55066; docs/phase7-wave9.md sections 3.57, 3.70, 3.71 and 8.4
 * item 65) on the real cards. Rhino (Core, standard) against Core Spider-Man, the set's cards in the encounter deck
 * so the engine sets the allies aside at setup. An ally is put into play by surgery (a relabeled deck card), except
 * for Zzzax's "after enters play", which enters from the set-aside area through a treachery made for this test.
 * The minions' When Defeated that brings each ally into play is tested in `trickster-magic.test.ts`.
 */
const REFS = [
  "55063.absorbing-man-constant",
  "55063.absorbing-man-interrupt",
  "55064.titania-constant",
  "55064.titania-constant-2",
  "55065.whirlwind-constant",
  "55065.whirlwind-interrupt",
  "55066.zzzax-constant",
  "55066.zzzax-response",
];
const ABSORBING = "55063";
const TITANIA = "55064";
const WHIRLWIND = "55065";
const ZZZAX = "55066";
const ALLIES = [ABSORBING, TITANIA, WHIRLWIND, ZZZAX];
const TITANIA_MINION = "55057";
const PUPPET = "55061";

const AUNT_MAY = "01006"; // support, cost 1
const PEPPER_POTTS = "01033"; // support, cost 3
const AVENGERS_MANSION = "01091"; // support, cost 4
const MERCENARY = "01101"; // Core minion: 1 ATK, 3 hit points
const BLACK_CAT = "01002";
const SPIDER_WOMAN = "01011";
const HELLCAT = "01020";

/** A treachery made for this test: When Revealed it puts the set-aside Zzzax ally into play under you. */
const SUMMON = "99002";
const SUMMON_CARD = {
  ...CORE_CARDS.find((c) => (c.id as string) === BLANK)!,
  id: cardId(SUMMON),
  name: "Summon",
  abilities: [{ id: "99002.when-revealed" }],
} as unknown as AnyCard;
const SUMMON_REGISTRY = defineAbilities({
  "99002.when-revealed": whenRevealed(
    selectCards("ally", encounterSetAside(query("ally", { name: "Zzzax" }))),
    putIntoPlay(chosen("ally"), you),
  ),
});

const DEPS: EngineDeps = {
  abilities: mergeRegistries(WAVE8_ABILITIES, TRICKSTER_MAGIC, TT_ASPECT_BASIC, SUMMON_REGISTRY),
};
const POOL: readonly AnyCard[] = [...CORE_CARDS, ...TT_CARDS, SUMMON_CARD];
const TT_BY_ID = new Map(TT_CARDS.map((c) => [c.id as string, c as unknown as Record<string, unknown>]));
const dataOf = (code: string) => TT_BY_ID.get(code)!;
const coreCard = (code: string) =>
  CORE_CARDS.find((c) => (c.id as string) === code) as unknown as Record<string, unknown>;
const SET_COPIES = TT_CARDS.filter(
  (c) => "encounterSetIds" in c && c.encounterSetIds.includes(encounterSetId("trickster_magic")),
);

function setupGame(): GameState {
  const config = coreScenario("rhino", {
    players: [SPIDER_MAN],
    seed: 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: POOL,
  });
  const copies = SET_COPIES.flatMap((c) => Array.from({ length: c.quantityInSet }, () => c.id));
  const created = createGame({ ...config, encounterDeck: [...config.encounterDeck, ...copies, cardId(SUMMON)] }, DEPS);
  if (!created.ok) throw new Error(created.error.message);
  return settle(created.state, firstLegal, (s) => s.step.phase === "player", DEPS);
}

const asideCodes = (s: GameState): string[] => s.encounterSetAside.map((id) => codeOf(s, id));
const victoryCodes = (s: GameState): string[] => s.victoryDisplay.map((id) => codeOf(s, id));
const playAreaCodes = (s: GameState, p: PlayerId = P1): string[] => playerOf(s, p).playArea.map((id) => codeOf(s, id));
const idIn = (s: GameState, code: string): InstanceId => playerOf(s, P1).playArea.find((id) => codeOf(s, id) === code)!;

/** A copy of `code` put straight into player 1's play area (relabels a spare deck card; surgery, no enter-play). */
function intoPlay(state: GameState, code: string, spare = 1) {
  const owner = playerOf(state, P1);
  const id = owner.deck[owner.deck.length - spare]!;
  const relabeled = patchInstance(state, id, {
    cardId: cardId(code),
    faceup: true,
    controllerId: P1,
    exhausted: false,
  });
  return {
    id,
    state: {
      ...relabeled,
      players: relabeled.players.map((p) =>
        p.playerId === P1 ? { ...p, deck: p.deck.filter((i) => i !== id), playArea: [...p.playArea, id] } : p,
      ),
    },
  };
}
/** A copy of `code` in player 1's hand (relabels a spare deck card). */
function intoHand(state: GameState, code: string): { state: GameState; ids: readonly InstanceId[] } {
  const owner = playerOf(state, P1);
  const id = owner.deck[owner.deck.length - 10]!;
  return moveToHand(patchInstance(state, id, { cardId: cardId(code) }), P1, code);
}
const withInPlay = (state: GameState, codes: readonly string[]): GameState =>
  codes.reduce((s, code, i) => intoPlay(s, code, i + 1).state, state);

/** Takes the optional ability whose id contains `ability` whenever it is offered; every other prompt as `firstLegal`. */
const usingAbility =
  (ability: string): Picker =>
  (s) => {
    const choice = s.pendingChoice!;
    const hit = choice.options.find((o) => o.optionId.includes(ability));
    return hit ? [hit.optionId] : firstLegal(s);
  };
const defendingWith =
  (defender: InstanceId): Picker =>
  (s) => {
    const choice = s.pendingChoice!;
    if (choice.prompt.kind !== "declareDefender") return firstLegal(s);
    return choice.options.some((o) => o.optionId === defender) ? [defender] : ["decline"];
  };

/** `ally` (ready, in play) attacks `target`; `pick` answers every prompt. */
const allyAttacks = (state: GameState, ally: InstanceId, target: InstanceId, pick: Picker) =>
  driveEventsPicking(DEPS, state, pick, {
    type: "basicAttack",
    playerId: P1,
    attackerInstanceId: ally,
    targetInstanceId: target,
  });
const allyThwarts = (state: GameState, ally: InstanceId, scheme: InstanceId, pick: Picker) =>
  driveEventsPicking(DEPS, state, pick, {
    type: "basicThwart",
    playerId: P1,
    thwarterInstanceId: ally,
    schemeInstanceId: scheme,
  } as Command);

describe("registry", () => {
  it("registers the 8 refs of the four cards, each a valid definition, and skips nothing", () => {
    expect(Object.keys(TT_ASPECT_BASIC).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(TT_ASPECT_BASIC)) expect(validateDefinition(def), id).toEqual([]);
    expect(TT_ASPECT_BASIC_SKIPPED).toEqual({});
  });

  it("the data names exactly these refs for the four cards", () => {
    const refs = ALLIES.flatMap((code) => ((dataOf(code).abilities ?? []) as { id: string }[]).map((a) => a.id));
    expect(refs.sort()).toEqual([...REFS].sort());
  });

  it("setup: the four allies are set aside once each, owned by nobody, and in no deck or hand", () => {
    const s = setupGame();
    expect(asideCodes(s).sort()).toEqual([...ALLIES].sort());
    expect(s.encounterSetAside.every((id) => s.instances[id]!.ownerId === null)).toBe(true);
    const p = playerOf(s, P1);
    expect([...p.hand, ...p.deck].some((id) => ALLIES.includes(codeOf(s, id)))).toBe(false);
  });
});

describe("the four allies' data", () => {
  it.each([
    [ABSORBING, "Carl Creel", 3, 1, 1, 3, { attack: 2, thwart: 2 }, "Absorbing Man minion"],
    [TITANIA, "Mary MacPherran", 4, 3, 2, 5, { attack: 2, thwart: 1 }, "Titania minion"],
    [WHIRLWIND, "David Cannon", 4, 0, 1, 3, { attack: 1, thwart: 1 }, "Whirlwind minion"],
    [ZZZAX, undefined, 3, 1, 3, 4, { attack: 1, thwart: 2 }, "Zzzax minion"],
  ] as const)(
    "%s (%s): cost %i, ATK %i, THW %i, %i hit points, %j, Linked (%s), Victory 0, basic aspect",
    (code, subtitle, cost, atk, thw, hp, consequential, linked) => {
      const card = dataOf(code) as unknown as {
        type: string;
        subtitle?: string;
        cost: number;
        atk: number;
        thw: number;
        hp: number;
        unique: boolean;
        aspect: string;
        consequentialDamage: unknown;
        keywords: { name: string; cardTitle?: string; value?: number }[];
      };
      expect([card.type, card.subtitle, card.cost, card.atk, card.thw, card.hp, card.unique, card.aspect]).toEqual([
        "ally",
        subtitle,
        cost,
        atk,
        thw,
        hp,
        true,
        "basic",
      ]);
      expect(card.consequentialDamage).toEqual(consequential);
      expect(card.keywords).toEqual([
        { name: "linked", cardTitle: linked },
        { name: "victory", value: 0 },
      ]);
    },
  );
});

describe("the allies cannot be in a deck", () => {
  const precon = WAVE9_STARTER_DECKS.find((d) => d.id === "maria-hill-leadership")!;
  const base: DeckContents = { identityCardId: precon.identityCardId, aspects: precon.aspects, cards: precon.cards };

  it("the precon is legal; adding any one of the four reports exactly `linked_card`", () => {
    expect(validateDeck(base, WAVE9_CARDS)).toEqual({ ok: true });
    for (const code of ALLIES) {
      const deck = { ...base, cards: [...base.cards, { cardId: cardId(code), quantity: 1 }] };
      const verdict = validateDeck(deck, WAVE9_CARDS);
      expect(verdict.ok, code).toBe(false);
      if (verdict.ok) continue;
      expect(verdict.problems.map((p) => p.code)).toEqual(["linked_card"]);
      expect(verdict.problems[0]!.cardIds).toEqual([cardId(code)]);
    }
  });
});

describe("every ally: not counted against the ally limit, and its defeat goes to the victory display", () => {
  it("with three other allies in play and a linked ally beside them, a fourth ally can still be played with nothing discarded", () => {
    // Three other allies is the limit; Titania's ally is the fourth only if she counted.
    const three = withInPlay(heroForm(setupGame()), [TITANIA, BLACK_CAT, SPIDER_WOMAN]);
    const hellcat = intoHand(three, HELLCAT);
    const cardsToPay = playerOf(hellcat.state, P1)
      .hand.filter((id) => id !== hellcat.ids[0])
      .slice(0, 3);
    const played = driveEventsPicking(DEPS, hellcat.state, firstLegal, {
      type: "playCard",
      playerId: P1,
      cardInstanceId: hellcat.ids[0]!,
      payment: cardsToPay.map((fromHand) => ({ fromHand })),
      attachToInstanceId: null,
    });
    expect(
      playAreaCodes(played.state)
        .filter((c) => [TITANIA, BLACK_CAT, SPIDER_WOMAN, HELLCAT].includes(c))
        .sort(),
    ).toEqual([TITANIA, BLACK_CAT, SPIDER_WOMAN, HELLCAT].sort());
    expect(played.state.pendingChoice).toBeNull();
  });

  it.each(ALLIES)(
    "%s, defeated, goes to the victory display (Victory 0), not a discard pile, and never returns",
    (code) => {
      const hp = (dataOf(code) as { hp: number }).hp;
      const staged = intoPlay(heroForm(setupGame()), code);
      const hurt = patchInstance(staged.state, staged.id, { damage: hp - 1 });
      const run = driveEventsPicking(
        DEPS,
        stackEncounterDeck(hurt, BLANK, FILLER_A),
        defendingWith(staged.id),
        endTurn(P1),
      );
      expect(run.state.victoryDisplay).toEqual([staged.id]);
      expect(victoryCodes(run.state)).toEqual([code]);
      expect(playAreaCodes(run.state)).not.toContain(code);
      expect(run.state.encounterSetAside).not.toContain(staged.id);
      expect(playerOf(run.state, P1).discard.map((id) => codeOf(run.state, id))).not.toContain(code);
    },
  );
});

describe("Absorbing Man (55063)", () => {
  /** Absorbing Man attacks Titania's minion (8 hit points) with these supports in play; the interrupt is taken. */
  function attackWith(supports: readonly string[], pick: Picker = usingAbility("55063.absorbing-man-interrupt")) {
    const base = withInPlay(heroForm(setupGame()), [ABSORBING, ...supports]);
    const staged = engageMinion(base, TITANIA_MINION, P1);
    const run = allyAttacks(staged.state, idIn(staged.state, ABSORBING), staged.id, pick);
    return { run, minion: staged.id, supports: supports.map((code) => idIn(staged.state, code)) };
  }

  it("INTERRUPT: exhausts a support and gets +X ATK, X its printed cost (Aunt May 1)", () => {
    const { run, minion, supports } = attackWith([AUNT_MAY]);
    expect(inst(run.state, supports[0]!).exhausted).toBe(true);
    expect(inst(run.state, minion).damage).toBe(1 + 1);
  });

  it("INTERRUPT: Pepper Potts (3) is +3, and Avengers Mansion (4) is capped at +3", () => {
    expect(inst(attackWith([PEPPER_POTTS]).run.state, attackWith([PEPPER_POTTS]).minion).damage).toBe(4);
    const capped = attackWith([AVENGERS_MANSION]);
    expect(inst(capped.run.state, capped.minion).damage).toBe(4);
  });

  it("INTERRUPT: with nothing to exhaust he gets +0 and still attacks", () => {
    const { run, minion } = attackWith([]);
    expect(inst(run.state, minion).damage).toBe(1);
  });

  it("INTERRUPT: an exhausted support is not chosen; the ready one is", () => {
    const base = withInPlay(heroForm(setupGame()), [ABSORBING, AUNT_MAY, PEPPER_POTTS]);
    const may = idIn(base, AUNT_MAY);
    const tired = patchInstance(base, idIn(base, PEPPER_POTTS), { exhausted: true });
    const staged = engageMinion(tired, TITANIA_MINION, P1);
    const run = allyAttacks(
      staged.state,
      idIn(staged.state, ABSORBING),
      staged.id,
      usingAbility("55063.absorbing-man-interrupt"),
    );
    expect(inst(run.state, may).exhausted).toBe(true);
    expect(inst(run.state, staged.id).damage).toBe(2);
  });

  it("INTERRUPT: when he thwarts, +X THW (Pepper Potts 3: 1 + 3 = 4 threat removed)", () => {
    const base = withInPlay(heroForm(setupGame()), [ABSORBING, PEPPER_POTTS]);
    const scheme = base.mainScheme.instanceId;
    const loaded = patchInstance(base, scheme, { threat: 8 });
    const run = allyThwarts(loaded, idIn(loaded, ABSORBING), scheme, usingAbility("55063.absorbing-man-interrupt"));
    expect(inst(run.state, scheme).threat).toBe(4);
  });

  it("INTERRUPT: declined, nothing is exhausted and he attacks for his printed ATK", () => {
    const base = withInPlay(heroForm(setupGame()), [ABSORBING, AUNT_MAY]);
    const staged = engageMinion(base, TITANIA_MINION, P1);
    const run = allyAttacks(staged.state, idIn(staged.state, ABSORBING), staged.id, firstLegal);
    expect(inst(run.state, idIn(run.state, AUNT_MAY)).exhausted).toBe(false);
    expect(inst(run.state, staged.id).damage).toBe(1);
  });
});

describe("Titania (55064)", () => {
  it("CONSTANT: her attacks gain overkill: the excess over a minion's hit points hurts the villain", () => {
    const base = withInPlay(heroForm(setupGame()), [TITANIA]);
    const staged = engageMinion(base, MERCENARY, P1);
    const worn = patchInstance(staged.state, staged.id, { damage: 1 });
    const villain = worn.villains[0]!.instanceId;
    const run = allyAttacks(worn, idIn(worn, TITANIA), staged.id, firstLegal);
    // Hydra Mercenary has 3 hit points and 1 damage; 3 ATK deals 2 and spills 1 to the villain.
    expect(inst(run.state, villain).damage).toBe(1);
  });

  it("CONSTANT: her attacks gain piercing: a tough status card does not stop the damage", () => {
    const base = withInPlay(heroForm(setupGame()), [TITANIA]);
    const staged = engageMinion(base, TITANIA_MINION, P1);
    const toughMinion = patchInstance(staged.state, staged.id, {
      statuses: { ...inst(staged.state, staged.id).statuses, tough: 1 },
    });
    const run = allyAttacks(toughMinion, idIn(toughMinion, TITANIA), staged.id, firstLegal);
    expect(inst(run.state, staged.id).damage).toBe(3);
    // Piercing discards the tough status card before the damage is dealt.
    expect(inst(run.state, staged.id).statuses.tough).toBe(0);
  });

  it("CONSTANT: only her attacks: another ally's attack on a tough minion is stopped by the tough card", () => {
    const base = withInPlay(heroForm(setupGame()), [BLACK_CAT]);
    const staged = engageMinion(base, TITANIA_MINION, P1);
    const toughMinion = patchInstance(staged.state, staged.id, {
      statuses: { ...inst(staged.state, staged.id).statuses, tough: 1 },
    });
    const run = allyAttacks(toughMinion, idIn(toughMinion, BLACK_CAT), staged.id, firstLegal);
    expect(inst(run.state, staged.id).damage).toBe(0);
  });
});

describe("Whirlwind (55065)", () => {
  /** Whirlwind (0 ATK) attacks Titania's minion with `main` threat on the main scheme and, if given, Puppet Master's. */
  function attackWith(main: number, puppet?: number, pick: Picker = usingAbility("55065.whirlwind-interrupt")) {
    const base = withInPlay(heroForm(setupGame()), [WHIRLWIND]);
    const minion = engageMinion(patchInstance(base, base.mainScheme.instanceId, { threat: main }), TITANIA_MINION, P1);
    let state = minion.state;
    let side: InstanceId | undefined;
    if (puppet !== undefined) {
      const pile = state.encounterDecks[Object.keys(state.encounterDecks)[0]!]!;
      side = pile.deck.find((i) => codeOf(state, i) === PUPPET)!;
      state = {
        ...state,
        encounterDecks: {
          ...state.encounterDecks,
          [Object.keys(state.encounterDecks)[0]!]: { ...pile, deck: pile.deck.filter((i) => i !== side) },
        },
        villainArea: [...state.villainArea, side],
        instances: { ...state.instances, [side]: { ...state.instances[side]!, threat: puppet, faceup: true } },
      };
    }
    const run = allyAttacks(state, idIn(state, WHIRLWIND), minion.id, pick);
    return { run, minion: minion.id, side };
  }
  const threatOf = (r: { run: { state: GameState } }, id: InstanceId) => inst(r.run.state, id).threat;

  it("INTERRUPT: removes 1 threat from each scheme in play; +1 ATK for each threat removed (main scheme and Puppet Master: 2)", () => {
    const r = attackWith(4, 3);
    expect(threatOf(r, r.run.state.mainScheme.instanceId)).toBe(3);
    expect(threatOf(r, r.side!)).toBe(2);
    expect(inst(r.run.state, r.minion).damage).toBe(2);
  });

  it("INTERRUPT: a scheme with no threat removes nothing and adds nothing (main scheme 4, Puppet Master 0: +1)", () => {
    const r = attackWith(4, 0);
    expect(threatOf(r, r.run.state.mainScheme.instanceId)).toBe(3);
    expect(inst(r.run.state, r.minion).damage).toBe(1);
  });

  it("INTERRUPT: no threat anywhere is a 0 ATK attack", () => {
    const r = attackWith(0);
    expect(inst(r.run.state, r.minion).damage).toBe(0);
  });

  it("INTERRUPT: declined, nothing is removed and the 0 ATK attack deals nothing", () => {
    const r = attackWith(4, 3, firstLegal);
    expect(threatOf(r, r.run.state.mainScheme.instanceId)).toBe(4);
    expect(threatOf(r, r.side!)).toBe(3);
    expect(inst(r.run.state, r.minion).damage).toBe(0);
  });
});

describe("Zzzax (55066)", () => {
  type Kind = "energy" | "mental" | "physical";
  const iconsOf = (code: string) => (coreCard(code).resourceIcons ?? {}) as Record<string, number>;
  /** The deck with cards printing exactly one resource of these kinds on top, in order. */
  function deckTop(state: GameState, ...kinds: readonly Kind[]): { state: GameState; ids: InstanceId[] } {
    const owner = playerOf(state, P1);
    const ids: InstanceId[] = [];
    for (const kind of kinds) {
      const id = owner.deck.find((i) => {
        const icons = iconsOf(codeOf(state, i));
        return !ids.includes(i) && Object.keys(icons).length === 1 && icons[kind] === 1;
      });
      if (!id) throw new Error(`no further ${kind} card in the deck`);
      ids.push(id);
    }
    return {
      ids,
      state: {
        ...state,
        players: state.players.map((p) =>
          p.playerId === P1 ? { ...p, deck: [...ids, ...p.deck.filter((i) => !ids.includes(i))] } : p,
        ),
      },
    };
  }
  /** The Zzzax ally enters play from the set-aside area (the treachery reveals), then every prompt is answered by `pick`. */
  function enters(state: GameState, pick: Picker) {
    // Alter-ego Rhino schemes with one boost card; player 1 is then dealt the summoning treachery.
    return driveEventsPicking(DEPS, stackEncounterDeck(state, BLANK, SUMMON, FILLER_A), pick, endTurn(P1));
  }

  it("RESPONSE: after he enters play, you search the top 5 for a printed energy card and add it to your hand", () => {
    const stacked = deckTop(setupGame(), "mental", "physical", "energy", "mental", "physical");
    const run = enters(stacked.state, (s) => {
      const options = s.pendingChoice!.options;
      const hit =
        options.find((o) => o.optionId === stacked.ids[2]) ??
        options.find((o) => o.optionId.includes("zzzax-response"));
      return hit ? [hit.optionId] : firstLegal(s);
    });
    expect(playAreaCodes(run.state)).toContain(ZZZAX);
    expect(playerOf(run.state, P1).hand).toContain(stacked.ids[2]);
  });

  it("RESPONSE: only the top 5 are searched: an energy card sixth from the top is not found", () => {
    const stacked = deckTop(setupGame(), "mental", "physical", "mental", "physical", "mental", "energy");
    const sixth = stacked.ids[5]!;
    const offered: string[][] = [];
    const run = enters(stacked.state, (s) => {
      offered.push(s.pendingChoice!.options.map((o) => o.optionId));
      return firstLegal(s);
    });
    expect(offered.flat()).not.toContain(sixth);
    expect(playerOf(run.state, P1).hand).not.toContain(sixth);
  });

  it("RESPONSE: the deck is shuffled afterwards (even when the search finds nothing)", () => {
    const stacked = deckTop(setupGame(), "mental", "physical", "mental", "physical", "mental");
    const run = enters(stacked.state, usingAbility("zzzax-response"));
    expect(playAreaCodes(run.state)).toContain(ZZZAX);
    expect(types(run.events, "deckShuffled").length).toBeGreaterThan(0);
  });
});
