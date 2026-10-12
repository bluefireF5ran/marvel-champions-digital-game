import { CORE_CARDS, CW_CARDS, encounterSetId, trait } from "@mc/content";
import {
  activeEncounterDeckId,
  applyCommand,
  createGame,
  hasKeyword,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { coreScenario } from "../../../core/setup.js";
import { validateDefinition } from "../../../dsl/validate.js";
import {
  P1,
  P2,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  mainThreat,
  patchInstance,
  playerOf,
  putOnTopOfDeck,
  settle,
  stackEncounterDeck,
} from "../../../testing/harness.js";
import { driveEventsPicking, encounterCardInVillainArea } from "../../../testing/staging.js";
import {
  BLANK,
  CAPTAIN_MARVEL,
  FILLER_A,
  FILLER_B,
  SPIDER_MAN,
  attacksBy,
  codeOf,
  heroAttacks,
  heroForm,
  inPlayCard,
} from "../../../wave9/testing.js";
import { WAVE10_CARDS } from "../../cards.js";
import { WAVE10_DEPS } from "../../testing.js";
import { MODULAR_ATLANTEANS, MODULAR_ATLANTEANS_SKIPPED } from "./atlanteans.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * The Atlanteans modular set (56165 Atlantean Guard, 56166 Atlanteans, 56167 Atlantis Attacks), docs/phase7-wave10.md
 * section 3.23. The Civil War scenario builder does not exist yet, so the set is tested inside Core's Rhino scenario
 * against Core starter decks, with the set's cards (and, for the interaction test, the Namor set's) added to the
 * encounter deck by hand. The player's deck top is set by surgery (`putOnTopOfDeck`) to the card types each test needs.
 */
const GUARD = "56165";
const ATLANTEANS = "56166";
const ATTACKS = "56167";
const RULER = "56164";
const SET = [GUARD, ATLANTEANS, ATTACKS];
const RHINO = "01094";
const REFS = ["56165.when-revealed", "56166.when-revealed", "56167.when-revealed"];
// Core cards of the starter decks, by card type.
const EVENT = "01003";
const EVENT_B = "01004";
const SUPPORT = "01006";
const UPGRADE = "01007";
const ALLY = "01002";
const RESOURCE = "01062";
// Core cards of the Captain Marvel starter deck.
const ALLY_2 = "01067";
const RESOURCE_2 = "01072";
const EVENT_2 = "01013";

const dataOf = (code: string) => CW_CARDS.find((c) => (c.id as string) === code)! as unknown as Record<string, unknown>;

// Spider-Man's and Captain Marvel's hand sizes. A hand over its size is discarded down at the end of the player phase and a
// short one is drawn up before the villain phase, so a test that reads the deck's top card sets the hand to exactly this.
const HERO_HAND = 5;
const ALTER_EGO_HAND = 6;

/** Every player's hand set to `size` cards: extra cards go to the bottom of the deck, missing ones come from there. */
function withHandSize(state: GameState, size: number): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      const keep = p.hand.slice(0, size);
      const spill = p.hand.slice(size);
      const deck = [...p.deck, ...spill];
      const missing = Math.max(0, size - keep.length);
      return {
        ...p,
        hand: [...keep, ...deck.slice(deck.length - missing)],
        deck: deck.slice(0, deck.length - missing),
      };
    }),
  };
}

/** Rhino's game against the Core decks (hero form), with the cards of these CW encounter sets added to the deck. */
function game(sets: readonly string[], seats: readonly (typeof SPIDER_MAN | typeof CAPTAIN_MARVEL)[]): GameState {
  const config = coreScenario("rhino", {
    players: seats,
    seed: 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: [...CORE_CARDS, ...WAVE10_CARDS],
  } as never);
  const copies = CW_CARDS.filter(
    (c) => "encounterSetIds" in c && sets.some((set) => c.encounterSetIds.includes(encounterSetId(set))),
  ).flatMap((c) => Array.from({ length: c.quantityInSet }, () => c.id));
  const created = createGame({ ...config, encounterDeck: [...config.encounterDeck, ...copies] }, WAVE10_DEPS);
  if (!created.ok) throw new Error(created.error.message);
  const settled = settle(created.state, firstLegal, (s) => s.step.phase === "player", WAVE10_DEPS);
  return withHandSize(heroForm(settled, ...seats.map((_, i) => (i === 0 ? P1 : P2))), HERO_HAND);
}
const atlanteansGame = (): GameState => game(["atlanteans"], [SPIDER_MAN]);
const toAlterEgo = (s: GameState): GameState =>
  withHandSize(
    {
      ...s,
      players: s.players.map((p) => ({ ...p, identity: { ...p.identity, form: "alterEgo" as const } })),
    } as GameState,
    ALTER_EGO_HAND,
  );

/**
 * The deck's top cards set to `codes` (top first) for the player. A card taken from the hand is replaced by the deck's
 * bottom card, so the hand stays as full as it was: a short hand would draw at the end of the player phase, and take
 * the top of the deck before the villain phase reads it.
 */
function withTop(state: GameState, player: PlayerId, ...codes: readonly string[]): GameState {
  const handSize = playerOf(state, player).hand.length;
  const stacked = putOnTopOfDeck(state, player, ...codes).state;
  return {
    ...stacked,
    players: stacked.players.map((p) => {
      if (p.playerId !== player) return p;
      const missing = Math.max(0, handSize - p.hand.length);
      return {
        ...p,
        hand: [...p.hand, ...p.deck.slice(p.deck.length - missing)],
        deck: p.deck.slice(0, p.deck.length - missing),
      };
    }),
  };
}
const discardCodes = (s: GameState, player: PlayerId = P1) => playerOf(s, player).discard.map((i) => codeOf(s, i));

/** Every player ends the turn and the villain phase runs on the stacked deck (top first: Rhino's boost, then the rest). */
function villainPhase(state: GameState, stack: readonly string[]) {
  return driveEventsPicking(
    WAVE10_DEPS,
    stackEncounterDeck(state, ...stack),
    firstLegal,
    ...state.players.map((p) => endTurn(p.playerId)),
  );
}

/** The first copy of `code` in the encounter deck or discard pile removed from it (by surgery). */
function takeFromEncounter(state: GameState, code: string): { readonly state: GameState; readonly id: InstanceId } {
  const deckId = activeEncounterDeckId(state);
  const pile = state.encounterDecks[deckId]!;
  const id = [...pile.deck, ...pile.discard].find((i) => codeOf(state, i) === code);
  if (!id) throw new Error(`no ${code} in the encounter deck or discard`);
  return {
    id,
    state: {
      ...state,
      encounterDecks: {
        ...state.encounterDecks,
        [deckId]: { deck: pile.deck.filter((i) => i !== id), discard: pile.discard.filter((i) => i !== id) },
      },
    },
  };
}
/** A minion of the set put straight into play engaged with P1 (surgery, no reveal): the set's real card instance. */
function withMinion(state: GameState, code: string): { readonly state: GameState; readonly id: InstanceId } {
  const taken = takeFromEncounter(state, code);
  const placed: GameState = {
    ...taken.state,
    players: taken.state.players.map((p) => (p.playerId === P1 ? { ...p, playArea: [...p.playArea, taken.id] } : p)),
  };
  return {
    id: taken.id,
    state: patchInstance(placed, taken.id, { faceup: true, engagedWith: P1, controllerId: null }),
  };
}
const hero = (s: GameState, player: PlayerId = P1) => identityOf(s, player);
const tokens = (s: GameState, id: InstanceId) => inst(s, id).counters.acceleration ?? 0;

describe("registry", () => {
  it("registers the three refs of the three cards, each a valid definition, and skips nothing", () => {
    expect(Object.keys(MODULAR_ATLANTEANS).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(MODULAR_ATLANTEANS)) expect(validateDefinition(def), id).toEqual([]);
    expect(MODULAR_ATLANTEANS_SKIPPED).toEqual({});
  });

  it("the data names exactly these refs for the three cards", () => {
    const refs = SET.flatMap((code) => ((dataOf(code).abilities ?? []) as { id: string }[]).map((a) => a.id));
    expect(refs.sort()).toEqual([...REFS].sort());
  });

  it("carries the printed timing of each ability", () => {
    for (const ref of REFS) expect(MODULAR_ATLANTEANS[ref]!.trigger).toMatchObject({ kind: "whenRevealed" });
  });

  it("setup: the encounter deck holds three Atlantean Guards, one Atlanteans and one Atlantis Attacks", () => {
    const s = atlanteansGame();
    const all = Object.keys(s.instances).map((i) => codeOf(s, i as InstanceId));
    expect(SET.map((code) => all.filter((c) => c === code).length)).toEqual([3, 1, 1]);
  });
});

describe("Atlantean Guard (56165)", () => {
  it("is data: an Atlantis minion, ATK 2, SCH 1, 3 hit points, 1 boost icon, Guard", () => {
    const card = dataOf(GUARD);
    expect([card.type, card.atk, card.sch, card.hp, card.boostIcons, card.unique]).toEqual([
      "minion",
      2,
      1,
      3,
      1,
      false,
    ]);
    expect(card.traits).toEqual([trait("ATLANTIS")]);
    expect(card.keywords).toEqual([{ name: "guard" }]);
  });

  it("WHEN REVEALED: engages the revealing player and they discard exactly the top 3 cards of their deck", () => {
    const start = withTop(atlanteansGame(), P1, EVENT, SUPPORT, UPGRADE);
    const run = villainPhase(start, [BLANK, GUARD, FILLER_A]);
    const guard = inPlayCard(run.state, GUARD)!;
    expect(inst(run.state, guard).engagedWith).toBe(P1);
    expect(discardCodes(run.state).sort()).toEqual([EVENT, SUPPORT, UPGRADE].sort());
  });

  it("WHEN REVEALED: it does not activate (unlike Namor); it acts from the next villain phase on", () => {
    const run = villainPhase(withTop(atlanteansGame(), P1, EVENT, SUPPORT, UPGRADE), [BLANK, GUARD, BLANK, FILLER_A]);
    expect(attacksBy(run.state, run.events, GUARD)).toEqual([]);
    expect(attacksBy(run.state, run.events, RHINO)).toHaveLength(1);
  });

  it("WHEN REVEALED: only the revealing player's deck is discarded from (two players, the second is dealt it)", () => {
    const start = withTop(
      withTop(game(["atlanteans"], [SPIDER_MAN, CAPTAIN_MARVEL]), P1, EVENT, SUPPORT, UPGRADE),
      P2,
      ALLY_2,
      RESOURCE_2,
      EVENT_2,
    );
    // Rhino's boost for each player's activation, then P1's dealt card, then P2's (the Guard).
    const run = villainPhase(start, [BLANK, BLANK, FILLER_A, GUARD, FILLER_B]);
    expect(inst(run.state, inPlayCard(run.state, GUARD)!).engagedWith).toBe(P2);
    expect(discardCodes(run.state, P2).sort()).toEqual([ALLY_2, RESOURCE_2, EVENT_2].sort());
    expect(discardCodes(run.state, P1)).toEqual([]);
  });

  it("has Guard: with it engaged, a basic attack on the villain is refused; attacking the Guard is allowed", () => {
    const placed = withMinion(atlanteansGame(), GUARD);
    expect(hasKeyword(placed.state, placed.id, "guard", WAVE10_DEPS)).toBe(true);
    const villain = placed.state.activeVillainId!;
    const refused = applyCommand(
      placed.state,
      { type: "basicAttack", playerId: P1, attackerInstanceId: hero(placed.state), targetInstanceId: villain },
      WAVE10_DEPS,
    );
    expect(refused.ok).toBe(false);
    const run = heroAttacks(WAVE10_DEPS, placed.state, placed.id);
    expect(inst(run.state, placed.id).damage).toBe(2);
  });

  it("BOOST: 1 icon on the activating enemy's attack (Rhino ATK 2 + 1) and nothing is discarded from the deck", () => {
    const start = withTop(atlanteansGame(), P1, EVENT, SUPPORT, UPGRADE);
    const run = villainPhase(start, [GUARD, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
    expect(discardCodes(run.state)).toEqual([]);
    expect(inPlayCard(run.state, GUARD)).toBeUndefined();
  });
});

describe("Atlanteans (56166)", () => {
  it("is data: a treachery with 2 boost icons", () => {
    const card = dataOf(ATLANTEANS);
    expect([card.type, card.boostIcons, card.keywords]).toEqual(["treachery", 2, []]);
  });

  it("WHEN REVEALED (alter-ego): 3 different card types discarded place 3 threat on the main scheme", () => {
    const start = withTop(toAlterEgo(atlanteansGame()), P1, EVENT, SUPPORT, UPGRADE);
    const control = villainPhase(start, [BLANK, FILLER_B, FILLER_A]);
    const run = villainPhase(start, [BLANK, ATLANTEANS, FILLER_A]);
    expect(discardCodes(run.state).sort()).toEqual([EVENT, SUPPORT, UPGRADE].sort());
    expect(mainThreat(run.state) - mainThreat(control.state)).toBe(3);
  });

  it("WHEN REVEALED (alter-ego): the same card type three times counts once: 1 threat", () => {
    const start = withTop(toAlterEgo(atlanteansGame()), P1, EVENT, EVENT_B, EVENT);
    const control = villainPhase(start, [BLANK, FILLER_B, FILLER_A]);
    const run = villainPhase(start, [BLANK, ATLANTEANS, FILLER_A]);
    expect(discardCodes(run.state)).toHaveLength(3);
    expect(mainThreat(run.state) - mainThreat(control.state)).toBe(1);
  });

  it("WHEN REVEALED (alter-ego): two event cards and a support are 2 different types: 2 threat", () => {
    const start = withTop(toAlterEgo(atlanteansGame()), P1, EVENT, SUPPORT, EVENT_B);
    const control = villainPhase(start, [BLANK, FILLER_B, FILLER_A]);
    const run = villainPhase(start, [BLANK, ATLANTEANS, FILLER_A]);
    expect(mainThreat(run.state) - mainThreat(control.state)).toBe(2);
  });

  it("WHEN REVEALED (alter-ego): the hero takes no damage", () => {
    const start = withTop(toAlterEgo(atlanteansGame()), P1, EVENT, SUPPORT, UPGRADE);
    const run = villainPhase(start, [BLANK, ATLANTEANS, FILLER_A]);
    expect(inst(run.state, hero(run.state)).damage).toBe(0);
  });

  it("WHEN REVEALED (hero): 3 different card types are 3 indirect damage on the hero and no threat", () => {
    const start = withTop(atlanteansGame(), P1, ALLY, RESOURCE, UPGRADE);
    const control = villainPhase(start, [BLANK, FILLER_B, FILLER_A]);
    const run = villainPhase(start, [BLANK, ATLANTEANS, FILLER_A]);
    expect(discardCodes(run.state).sort()).toEqual([ALLY, RESOURCE, UPGRADE].sort());
    expect(inst(run.state, hero(run.state)).damage - inst(control.state, hero(control.state)).damage).toBe(3);
    expect(mainThreat(run.state)).toBe(mainThreat(control.state));
  });

  it("WHEN REVEALED (hero): two cards of one type and one of another are 2 indirect damage", () => {
    const start = withTop(atlanteansGame(), P1, UPGRADE, SUPPORT, UPGRADE);
    const control = villainPhase(start, [BLANK, FILLER_B, FILLER_A]);
    const run = villainPhase(start, [BLANK, ATLANTEANS, FILLER_A]);
    expect(inst(run.state, hero(run.state)).damage - inst(control.state, hero(control.state)).damage).toBe(2);
  });

  it("BOOST: 2 icons on the activating enemy's attack (Rhino ATK 2 + 2) and nothing is discarded from the deck", () => {
    const run = villainPhase(withTop(atlanteansGame(), P1, EVENT, SUPPORT, UPGRADE), [ATLANTEANS, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 2, damageDealt: 4 }]);
    expect(discardCodes(run.state)).toEqual([]);
  });

  it("is a treachery: it is discarded after resolving", () => {
    const run = villainPhase(withTop(atlanteansGame(), P1, EVENT, SUPPORT, UPGRADE), [BLANK, ATLANTEANS, FILLER_A]);
    expect(inPlayCard(run.state, ATLANTEANS)).toBeUndefined();
  });
});

describe("Atlantis Attacks (56167)", () => {
  it("is data: a side scheme with 3 threat (none per player), 3 boost icons and Hinder 1 per hero", () => {
    const card = dataOf(ATTACKS);
    expect([card.type, card.startingThreat, card.boostIcons, card.keywords]).toEqual([
      "side_scheme",
      { base: 3, perPlayer: 0 },
      3,
      [{ name: "hinder", value: 0, perPlayer: 1 }],
    ]);
  });

  it("WHEN REVEALED (one hero): discards the top card of the deck and places 1 acceleration token", () => {
    const start = withTop(atlanteansGame(), P1, UPGRADE, EVENT, SUPPORT);
    const run = villainPhase(start, [BLANK, ATTACKS, FILLER_A]);
    const scheme = inPlayCard(run.state, ATTACKS)!;
    expect(discardCodes(run.state)).toEqual([UPGRADE]);
    expect(tokens(run.state, scheme)).toBe(1);
    expect(inst(run.state, scheme).threat).toBe(4);
  });

  it("WHEN REVEALED (two heroes): the revealing player discards 2 cards; 2 different types are 2 tokens", () => {
    const start = withTop(
      withTop(game(["atlanteans"], [SPIDER_MAN, CAPTAIN_MARVEL]), P1, EVENT, SUPPORT, UPGRADE),
      P2,
      ALLY_2,
      RESOURCE_2,
      EVENT_2,
    );
    const run = villainPhase(start, [BLANK, BLANK, ATTACKS, FILLER_A]);
    const scheme = inPlayCard(run.state, ATTACKS)!;
    expect(discardCodes(run.state, P1).sort()).toEqual([EVENT, SUPPORT].sort());
    expect(discardCodes(run.state, P2)).toEqual([]);
    expect(tokens(run.state, scheme)).toBe(2);
    // 3 starting threat plus 1 Hinder per hero.
    expect(inst(run.state, scheme).threat).toBe(5);
  });

  it("WHEN REVEALED (two heroes): 2 cards of the same type are 1 token", () => {
    const start = withTop(game(["atlanteans"], [SPIDER_MAN, CAPTAIN_MARVEL]), P1, EVENT, EVENT_B, SUPPORT);
    const run = villainPhase(start, [BLANK, BLANK, ATTACKS, FILLER_A]);
    expect(discardCodes(run.state, P1).sort()).toEqual([EVENT, EVENT_B].sort());
    expect(tokens(run.state, inPlayCard(run.state, ATTACKS)!)).toBe(1);
  });

  it("the token is on the side scheme, not on the main scheme", () => {
    const run = villainPhase(withTop(atlanteansGame(), P1, ALLY, EVENT, SUPPORT), [BLANK, ATTACKS, FILLER_A]);
    expect(tokens(run.state, run.state.mainScheme.instanceId)).toBe(0);
  });

  it("BOOST: 3 icons on the activating enemy's attack (Rhino ATK 2 + 3), no card discarded from the deck", () => {
    const run = villainPhase(withTop(atlanteansGame(), P1, EVENT, SUPPORT, UPGRADE), [ATTACKS, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 3, damageDealt: 5 }]);
    expect(discardCodes(run.state)).toEqual([]);
  });
});

describe("with the Namor set (56164 Ruler of Atlantis)", () => {
  const both = () => game(["atlanteans", "namor_modular"], [SPIDER_MAN]);

  it("an Atlantean Guard cannot take damage while Ruler of Atlantis is in play (control: without it, 2 damage)", () => {
    const placed = withMinion(both(), GUARD);
    const control = heroAttacks(WAVE10_DEPS, placed.state, placed.id);
    expect(inst(control.state, placed.id).damage).toBe(2);
    const { state } = encounterCardInVillainArea(placed.state, RULER, 4);
    const refused = applyCommand(
      state,
      { type: "basicAttack", playerId: P1, attackerInstanceId: hero(state), targetInstanceId: placed.id },
      WAVE10_DEPS,
    );
    expect(refused.ok).toBe(false);
    expect(inst(state, placed.id).damage).toBe(0);
  });

  it("a Guard revealed under Ruler of Atlantis still engages and discards the top 3 cards", () => {
    const placed = encounterCardInVillainArea(both(), RULER, 4);
    const start = withTop(placed.state, P1, EVENT, SUPPORT, UPGRADE);
    const run = villainPhase(start, [BLANK, GUARD, FILLER_A]);
    expect(inst(run.state, inPlayCard(run.state, GUARD)!).engagedWith).toBe(P1);
    expect(discardCodes(run.state).sort()).toEqual([EVENT, SUPPORT, UPGRADE].sort());
  });
});
