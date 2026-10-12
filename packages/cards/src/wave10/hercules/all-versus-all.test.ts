import { CORE_CARDS, HERCULES_CARDS, encounterSetId, trait } from "@mc/content";
import {
  activeEncounterDeckId,
  createGame,
  type GameEvent,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { coreScenario } from "../../core/setup.js";
import { validateDefinition } from "../../dsl/validate.js";
import {
  P1,
  P2,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  mainThreat,
  patchInstance,
  settle,
  stackEncounterDeck,
} from "../../testing/harness.js";
import { defeatWithAttack, driveEventsPicking, encounterCardInVillainArea } from "../../testing/staging.js";
import {
  BLANK,
  CAPTAIN_MARVEL,
  FILLER_A,
  FILLER_B,
  SPIDER_MAN,
  attacksBy,
  codeOf,
  heroForm,
  heroThwarts,
  inDiscard,
  inPlayCard,
  piles,
} from "../../wave9/testing.js";
import { WAVE10_CARDS } from "../cards.js";
import { WAVE10_DEPS, engageMinion } from "../testing.js";
import { HERCULES_ALL_VERSUS_ALL, HERCULES_ALL_VERSUS_ALL_SKIPPED } from "./all-versus-all.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * The All Versus All modular set (Hercules pack: 59041 All Versus All, 59042 Hecate, 59043 Kyknos, 59044 Bewitched
 * Officer, 59045 Roving Mobs), docs/phase7-wave10-hero-packs.md H8.4 line HS16. The set is tested inside Core's Rhino
 * scenario against Core starter decks, with the set's cards added to the encounter deck by hand (Hercules himself is
 * not seated: his Labor deck needs an engine task that has not landed).
 */
const AVA = "59041";
const HECATE = "59042";
const KYKNOS = "59043";
const OFFICER = "59044";
const MOBS = "59045";
const SET = [AVA, HECATE, KYKNOS, OFFICER, MOBS];
const RHINO = "01094";
const SHOCKER = "01103"; // Core minion, ATK 2, SCH 1, 3 hit points
const REFS = [
  "59041.all-versus-all-forced-response",
  "59041.when-defeated",
  "59042.hecate-forced-response",
  "59043.kyknos-forced-response",
  "59044.bewitched-officer-constant",
  "59045.when-defeated",
];
const HECATE_SPLIT = ["59042.when-revealed", "59042.when-defeated"];

const dataOf = (code: string) =>
  HERCULES_CARDS.find((c) => (c.id as string) === code)! as unknown as Record<string, unknown>;

/** Rhino's game against the Core decks (hero form) with one copy of each All Versus All card added to the encounter deck. */
function game(seats: readonly (typeof SPIDER_MAN | typeof CAPTAIN_MARVEL)[] = [SPIDER_MAN]): GameState {
  const config = coreScenario("rhino", {
    players: seats,
    seed: 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: [...CORE_CARDS, ...WAVE10_CARDS, ...HERCULES_CARDS],
  } as never);
  const copies = HERCULES_CARDS.filter(
    (c) => "encounterSetIds" in c && c.encounterSetIds.includes(encounterSetId("all_versus_all")),
  ).flatMap((c) => Array.from({ length: c.quantityInSet }, () => c.id));
  const created = createGame({ ...config, encounterDeck: [...config.encounterDeck, ...copies] }, WAVE10_DEPS);
  if (!created.ok) throw new Error(created.error.message);
  const settled = settle(created.state, firstLegal, (s) => s.step.phase === "player", WAVE10_DEPS);
  return heroForm(settled, ...seats.map((_, i) => (i === 0 ? P1 : P2)));
}
const toAlterEgo = (s: GameState): GameState =>
  ({
    ...s,
    players: s.players.map((p) => ({ ...p, identity: { ...p.identity, form: "alterEgo" as const } })),
  }) as GameState;

/** Every player ends the turn and the villain phase runs on the stacked deck (top first: Rhino's boost, then the rest). */
function villainPhase(state: GameState, stack: readonly string[]) {
  return driveEventsPicking(
    WAVE10_DEPS,
    stackEncounterDeck(state, ...stack),
    firstLegal,
    ...state.players.map((p) => endTurn(p.playerId)),
  );
}

/** `code` removed from the encounter deck and discard pile (surgery), the set's real card instance. */
function take(state: GameState, code: string): { readonly state: GameState; readonly id: InstanceId } {
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
/** A set minion put straight into play engaged with `player` (surgery: no reveal). */
function minionInPlay(state: GameState, code: string, player: PlayerId = P1) {
  const taken = take(state, code);
  const placed: GameState = {
    ...taken.state,
    players: taken.state.players.map((p) =>
      p.playerId === player ? { ...p, playArea: [...p.playArea, taken.id] } : p,
    ),
  };
  return {
    id: taken.id,
    state: patchInstance(placed, taken.id, { faceup: true, engagedWith: player, controllerId: null }),
  };
}
/** All Versus All put straight into the villain area with `threat` on it (surgery: no reveal). */
const avaInPlay = (state: GameState, threat = 4) => encounterCardInVillainArea(state, AVA, threat);
/** `code` moved from the encounter deck to the top of the encounter discard pile. */
function discarded(state: GameState, code: string): GameState {
  const taken = take(state, code);
  const deckId = activeEncounterDeckId(state);
  const pile = taken.state.encounterDecks[deckId]!;
  return {
    ...taken.state,
    encounterDecks: { ...taken.state.encounterDecks, [deckId]: { ...pile, discard: [taken.id, ...pile.discard] } },
  };
}
/** `code` moved from the encounter deck to the set-aside area. */
function setAside(state: GameState, code: string): GameState {
  const taken = take(state, code);
  return { ...taken.state, encounterSetAside: [...taken.state.encounterSetAside, taken.id] };
}
const hero = (s: GameState, player: PlayerId = P1) => identityOf(s, player);
const threatOn = (s: GameState, code: string) => inst(s, inPlayCard(s, code)!).threat;
const villainOf = (s: GameState): InstanceId => s.activeVillainId!;
const withTough = (s: GameState, id: InstanceId): GameState =>
  patchInstance(s, id, { statuses: { ...inst(s, id).statuses, tough: 1 } });
const ready = (s: GameState, id: InstanceId): GameState => patchInstance(s, id, { exhausted: false });
const stunned = (s: GameState, id: InstanceId): GameState =>
  patchInstance(s, id, { statuses: { ...inst(s, id).statuses, stunned: 1 } });
const attackedEvents = (events: readonly GameEvent[]) =>
  events.flatMap((e) =>
    e.type === "triggerEvent" && e.phase === "resolved" && e.event.kind === "characterAttacked" ? [e.event] : [],
  );

describe("registry", () => {
  it("registers the six refs, each a valid definition, and skips only Hecate's When Revealed and When Defeated (split from one printed ability)", () => {
    expect(Object.keys(HERCULES_ALL_VERSUS_ALL).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(HERCULES_ALL_VERSUS_ALL)) expect(validateDefinition(def), id).toEqual([]);
    expect(Object.keys(HERCULES_ALL_VERSUS_ALL_SKIPPED)).toEqual(HECATE_SPLIT);
    for (const id of HECATE_SPLIT) expect(HERCULES_ALL_VERSUS_ALL[id]).toBeUndefined();
  });

  it("the data names exactly the registered refs plus the skipped one for the five cards", () => {
    const refs = SET.flatMap((code) => ((dataOf(code).abilities ?? []) as { id: string }[]).map((a) => a.id));
    expect(refs.sort()).toEqual([...REFS, ...HECATE_SPLIT].sort());
  });

  it("carries the printed timing of each ability", () => {
    expect(HERCULES_ALL_VERSUS_ALL["59041.all-versus-all-forced-response"]!.trigger).toMatchObject({
      kind: "response",
      forced: true,
    });
    expect(HERCULES_ALL_VERSUS_ALL["59041.when-defeated"]!.trigger).toMatchObject({ kind: "whenDefeated" });
    expect(HERCULES_ALL_VERSUS_ALL["59042.hecate-forced-response"]!.trigger).toMatchObject({
      kind: "response",
      forced: true,
    });
    expect(HERCULES_ALL_VERSUS_ALL["59043.kyknos-forced-response"]!.trigger).toMatchObject({
      kind: "response",
      forced: true,
    });
    expect(HERCULES_ALL_VERSUS_ALL["59044.bewitched-officer-constant"]!.trigger).toMatchObject({ kind: "constant" });
    expect(HERCULES_ALL_VERSUS_ALL["59045.when-defeated"]!.trigger).toMatchObject({ kind: "whenDefeated" });
  });

  it("setup: the encounter deck holds one copy of each card", () => {
    const s = game();
    const all = Object.keys(s.instances).map((i) => codeOf(s, i as InstanceId));
    expect(SET.map((code) => all.filter((c) => c === code).length)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("All Versus All (59041)", () => {
  it("is data: a side scheme with 2 threat (none per player), Hinder 2 per hero, a hazard icon and 2 boost icons", () => {
    const card = dataOf(AVA);
    expect([card.type, card.startingThreat, card.icons, card.boostIcons, card.keywords]).toEqual([
      "side_scheme",
      { base: 2, perPlayer: 0 },
      ["hazard"],
      2,
      [{ name: "hinder", value: 0, perPlayer: 2 }],
    ]);
  });

  it("REVEALED it enters play with 2 threat plus 2 for Hinder (one hero)", () => {
    const run = villainPhase(game(), [BLANK, AVA, FILLER_A]);
    expect(threatOn(run.state, AVA)).toBe(4);
  });

  it("REVEALED with two heroes it enters play with 2 threat plus 4 for Hinder", () => {
    const run = villainPhase(game([SPIDER_MAN, CAPTAIN_MARVEL]), [BLANK, BLANK, AVA, FILLER_A, FILLER_B]);
    expect(threatOn(run.state, AVA)).toBe(6);
  });

  it("FORCED RESPONSE: after a minion is defeated by a hero's attack, 2 threat is placed on it", () => {
    const { state } = avaInPlay(engageMinion(game(), SHOCKER, "shocker"), 4);
    const run = defeatWithAttack(WAVE10_DEPS, state, "shocker" as InstanceId);
    expect(inDiscard(run, SHOCKER)).toHaveLength(1);
    expect(threatOn(run, AVA)).toBe(6);
  });

  it("FORCED RESPONSE: damage that does not defeat anyone places no threat (Shocker takes 2 of 3 hit points)", () => {
    const { state } = avaInPlay(engageMinion(game(), SHOCKER, "shocker"), 4);
    const run = driveEventsPicking(WAVE10_DEPS, state, firstLegal, {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: hero(state),
      targetInstanceId: "shocker" as InstanceId,
    });
    expect(inst(run.state, "shocker" as InstanceId).damage).toBe(2);
    expect(threatOn(run.state, AVA)).toBe(4);
  });

  it("FORCED RESPONSE: each defeated character places its own 2 threat (two Shockers: 4 more)", () => {
    const { state } = avaInPlay(engageMinion(game(), SHOCKER, "shocker"), 4);
    const second = engageMinion(state, SHOCKER, "shocker2");
    const one = defeatWithAttack(WAVE10_DEPS, second, "shocker" as InstanceId);
    const two = defeatWithAttack(WAVE10_DEPS, ready(one, hero(one)), "shocker2" as InstanceId);
    expect(threatOn(two, AVA)).toBe(8);
  });

  it("WHEN DEFEATED: it is set aside, not discarded and not in the victory display", () => {
    const { state, id } = avaInPlay(game(), 1);
    const run = heroThwarts(WAVE10_DEPS, state, id);
    expect(inPlayCard(run.state, AVA)).toBeUndefined();
    expect(run.state.encounterSetAside).toEqual([id]);
    expect(piles(run.state).discard).not.toContain(id);
    expect(piles(run.state).deck).not.toContain(id);
    expect(run.state.victoryDisplay).not.toContain(id);
    expect(run.state.villainArea).not.toContain(id);
  });

  it("WHEN DEFEATED: with 2 threat on it, a thwart of 1 leaves it in play", () => {
    const { state, id } = avaInPlay(game(), 2);
    const run = heroThwarts(WAVE10_DEPS, state, id);
    expect(inst(run.state, id).threat).toBe(1);
    expect(run.state.encounterSetAside).toEqual([]);
  });

  it("BOOST: 2 icons on the activating enemy's attack (Rhino ATK 2 + 2)", () => {
    const run = villainPhase(game(), [AVA, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 2, damageDealt: 4 }]);
  });
});

describe("Hecate (59042)", () => {
  it("is data: a unique Olympus minion, ATK 0, SCH 2, 4 hit points, 2 boost icons", () => {
    const card = dataOf(HECATE);
    expect([card.type, card.atk, card.sch, card.hp, card.boostIcons, card.unique]).toEqual([
      "minion",
      0,
      2,
      4,
      2,
      true,
    ]);
    expect(card.traits).toEqual([trait("OLYMPUS")]);
  });

  it("FORCED RESPONSE (hero form): after she attacks, 2 threat on All Versus All; her ATK 0 deals no damage", () => {
    const { state } = avaInPlay(minionInPlay(game(), HECATE).state, 4);
    const control = villainPhase(avaInPlay(game(), 4).state, [BLANK, FILLER_A, FILLER_B]);
    const run = villainPhase(state, [BLANK, FILLER_A, FILLER_B]);
    expect(attacksBy(run.state, run.events, HECATE)).toMatchObject([{ baseAtk: 0, damageDealt: 0 }]);
    expect(threatOn(run.state, AVA) - threatOn(control.state, AVA)).toBe(2);
    expect(mainThreat(run.state)).toBe(mainThreat(control.state));
  });

  it("FORCED RESPONSE (alter-ego form): after she schemes, 2 threat on All Versus All and SCH 2 on the main scheme", () => {
    const { state } = avaInPlay(minionInPlay(toAlterEgo(game()), HECATE).state, 4);
    const control = villainPhase(avaInPlay(toAlterEgo(game()), 4).state, [BLANK, FILLER_A, FILLER_B]);
    const run = villainPhase(state, [BLANK, FILLER_A, FILLER_B]);
    expect(threatOn(run.state, AVA) - threatOn(control.state, AVA)).toBe(2);
    expect(mainThreat(run.state) - mainThreat(control.state)).toBe(2);
  });

  it("FORCED RESPONSE: with All Versus All not in play nothing is placed anywhere", () => {
    const control = villainPhase(game(), [BLANK, FILLER_A, FILLER_B]);
    const run = villainPhase(minionInPlay(game(), HECATE).state, [BLANK, FILLER_A, FILLER_B]);
    expect(attacksBy(run.state, run.events, HECATE)).toHaveLength(1);
    expect(inPlayCard(run.state, AVA)).toBeUndefined();
    expect(mainThreat(run.state)).toBe(mainThreat(control.state));
  });

  it("BOOST: 2 icons on the activating enemy's attack (Rhino ATK 2 + 2)", () => {
    const run = villainPhase(game(), [HECATE, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 2, damageDealt: 4 }]);
  });

  it("is skipped: When Revealed and When Defeated are two refs not yet scripted", () => {
    // A revealed Hecate does not find All Versus All until the refs are scripted; this pins today's behavior.
    const run = villainPhase(game(), [BLANK, HECATE, FILLER_A]);
    expect(inPlayCard(run.state, HECATE)).toBeDefined();
    expect(inPlayCard(run.state, AVA)).toBeUndefined();
    for (const id of HECATE_SPLIT)
      expect(HERCULES_ALL_VERSUS_ALL_SKIPPED[id]).toContain("split from 59042.hecate-constant");
  });
});

describe("Kyknos (59043)", () => {
  it("is data: a unique Brute Olympus minion, ATK 3, SCH 0, 7 hit points, Retaliate 1, Toughness, Victory 0, 3 boost icons", () => {
    const card = dataOf(KYKNOS);
    expect([card.type, card.atk, card.sch, card.hp, card.boostIcons, card.unique]).toEqual([
      "minion",
      3,
      0,
      7,
      3,
      true,
    ]);
    expect(card.traits).toEqual([trait("BRUTE"), trait("OLYMPUS")]);
    expect(card.keywords).toEqual([
      { name: "retaliate", value: 1 },
      { name: "toughness" },
      { name: "victory", value: 0 },
    ]);
  });

  it("FORCED RESPONSE with All Versus All in play: after he attacks, 2 threat on it and none on the main scheme", () => {
    const control = villainPhase(avaInPlay(game(), 4).state, [BLANK, FILLER_A, FILLER_B]);
    const run = villainPhase(avaInPlay(minionInPlay(game(), KYKNOS).state, 4).state, [BLANK, FILLER_A, FILLER_B]);
    expect(attacksBy(run.state, run.events, KYKNOS)).toMatchObject([{ baseAtk: 3, damageDealt: 3 }]);
    expect(threatOn(run.state, AVA) - threatOn(control.state, AVA)).toBe(2);
    expect(mainThreat(run.state)).toBe(mainThreat(control.state));
  });

  it("FORCED RESPONSE without All Versus All in play (otherwise): 1 threat on the main scheme", () => {
    const control = villainPhase(game(), [BLANK, FILLER_A]);
    const run = villainPhase(minionInPlay(game(), KYKNOS).state, [BLANK, FILLER_A]);
    expect(attacksBy(run.state, run.events, KYKNOS)).toHaveLength(1);
    expect(mainThreat(run.state) - mainThreat(control.state)).toBe(1);
    expect(inPlayCard(run.state, AVA)).toBeUndefined();
  });

  it("FORCED RESPONSE (alter-ego form): his SCH 0 scheme still activates him, so 2 threat on All Versus All", () => {
    const control = villainPhase(avaInPlay(toAlterEgo(game()), 4).state, [BLANK, FILLER_A, FILLER_B]);
    const state = avaInPlay(minionInPlay(toAlterEgo(game()), KYKNOS).state, 4).state;
    const run = villainPhase(state, [BLANK, FILLER_A, FILLER_B]);
    expect(threatOn(run.state, AVA) - threatOn(control.state, AVA)).toBe(2);
    expect(mainThreat(run.state)).toBe(mainThreat(control.state));
  });

  it("FORCED RESPONSE (alter-ego form) without All Versus All in play: 1 threat on the main scheme", () => {
    const control = villainPhase(toAlterEgo(game()), [BLANK, FILLER_A]);
    const run = villainPhase(minionInPlay(toAlterEgo(game()), KYKNOS).state, [BLANK, FILLER_A]);
    expect(mainThreat(run.state) - mainThreat(control.state)).toBe(1);
  });

  it("FORCED RESPONSE (two players): engaged with the second player, still 2 threat once on All Versus All", () => {
    const base = game([SPIDER_MAN, CAPTAIN_MARVEL]);
    const stack = [BLANK, BLANK, FILLER_A, FILLER_B];
    const control = villainPhase(avaInPlay(base, 6).state, stack);
    const run = villainPhase(avaInPlay(minionInPlay(base, KYKNOS, P2).state, 6).state, stack);
    expect(attacksBy(run.state, run.events, KYKNOS)).toMatchObject([{ baseAtk: 3 }]);
    expect(inst(run.state, hero(run.state, P2)).damage - inst(control.state, hero(control.state, P2)).damage).toBe(3);
    expect(threatOn(run.state, AVA) - threatOn(control.state, AVA)).toBe(2);
    expect(mainThreat(run.state)).toBe(mainThreat(control.state));
  });

  it("BOOST: 3 icons on the activating enemy's attack (Rhino ATK 2 + 3)", () => {
    const run = villainPhase(game(), [KYKNOS, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 3, damageDealt: 5 }]);
  });
});

describe("Bewitched Officer (59044)", () => {
  it("is data: an Aerial Dragon Enthralled minion, ATK 3, SCH 1, 5 hit points, Retaliate 1, 2 boost icons", () => {
    const card = dataOf(OFFICER);
    expect([card.type, card.atk, card.sch, card.hp, card.boostIcons, card.unique, card.keywords]).toEqual([
      "minion",
      3,
      1,
      5,
      2,
      false,
      [{ name: "retaliate", value: 1 }],
    ]);
    expect(card.traits).toEqual([trait("AERIAL"), trait("DRAGON"), trait("ENTHRALLED")]);
  });

  it("CONSTANT: its attack gains piercing: ATK 3 lands in full on a tough hero, whose tough status card is discarded", () => {
    const start = game();
    const quiet = stunned(withTough(start, hero(start)), villainOf(start));
    const run = villainPhase(minionInPlay(quiet, OFFICER).state, [BLANK, FILLER_A]);
    expect(attacksBy(run.state, run.events, OFFICER)).toMatchObject([{ baseAtk: 3, damageDealt: 3 }]);
    expect(inst(run.state, hero(run.state)).damage).toBe(3);
    expect(inst(run.state, hero(run.state)).statuses.tough).toBe(0);
  });

  it("CONSTANT: another minion's attack does not (control: a Shocker's ATK 2 is stopped by the tough status card)", () => {
    const start = game();
    const quiet = stunned(withTough(start, hero(start)), villainOf(start));
    const run = villainPhase(engageMinion(quiet, SHOCKER, "shocker"), [BLANK, FILLER_A]);
    expect(attacksBy(run.state, run.events, SHOCKER)).toMatchObject([{ baseAtk: 2 }]);
    expect(inst(run.state, hero(run.state)).damage).toBe(0);
    expect(inst(run.state, hero(run.state)).statuses.tough).toBe(0);
  });

  it("CONSTANT: its attack gains ranged, and Rhino's and a Shocker's do not", () => {
    const withBoth = engageMinion(minionInPlay(game(), OFFICER).state, SHOCKER, "shocker");
    const officer = Object.keys(withBoth.instances).find(
      (i) => codeOf(withBoth, i as InstanceId) === OFFICER && inst(withBoth, i as InstanceId).engagedWith === P1,
    ) as InstanceId;
    const run = villainPhase(withBoth, [BLANK, FILLER_A]);
    const attacked = attackedEvents(run.events);
    expect(attacked.find((a) => a.attackerInstanceId === officer)!.ranged).toBe(true);
    expect(attacked.find((a) => a.attackerInstanceId === ("shocker" as InstanceId))!.ranged).toBeUndefined();
    expect(attacked.find((a) => a.attackerInstanceId === villainOf(withBoth))!.ranged).toBeUndefined();
  });

  it("BOOST: 2 icons on the activating enemy's attack (Rhino ATK 2 + 2)", () => {
    const run = villainPhase(game(), [OFFICER, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 2, damageDealt: 4 }]);
  });
});

describe("Roving Mobs (59045)", () => {
  /** Roving Mobs in the villain area with `threat`, and a hero thwart that defeats it. */
  const defeatMobs = (state: GameState, threat = 1) => {
    const placed = encounterCardInVillainArea(state, MOBS, threat);
    return { ...heroThwarts(WAVE10_DEPS, placed.state, placed.id), mobs: placed.id };
  };

  it("is data: a side scheme with 3 threat (none per player), a crisis icon, Victory 0 and 2 boost icons", () => {
    const card = dataOf(MOBS);
    expect([card.type, card.startingThreat, card.icons, card.boostIcons, card.keywords]).toEqual([
      "side_scheme",
      { base: 3, perPlayer: 0 },
      ["crisis"],
      2,
      [{ name: "victory", value: 0 }],
    ]);
  });

  it("REVEALED it enters play with 3 threat and no Hinder", () => {
    const run = villainPhase(game(), [BLANK, MOBS, FILLER_A]);
    expect(threatOn(run.state, MOBS)).toBe(3);
  });

  it("WHEN DEFEATED with All Versus All in the deck: it is found and revealed (2 threat plus 2 Hinder), the deck shuffled", () => {
    const run = defeatMobs(game());
    const ava = inPlayCard(run.state, AVA)!;
    expect(ava).toBeDefined();
    expect(inst(run.state, ava).threat).toBe(4);
    expect(piles(run.state).deck).not.toContain(ava);
    expect(run.state.victoryDisplay).toContain(run.mobs);
  });

  it("WHEN DEFEATED with All Versus All in the encounter discard pile: it is found there and revealed", () => {
    const run = defeatMobs(discarded(game(), AVA));
    expect(inst(run.state, inPlayCard(run.state, AVA)!).threat).toBe(4);
    expect(inDiscard(run.state, AVA)).toHaveLength(0);
  });

  it("WHEN DEFEATED with All Versus All set aside (it was defeated earlier): it is found there and revealed", () => {
    const aside = setAside(game(), AVA);
    expect(aside.encounterSetAside).toHaveLength(1);
    const run = defeatMobs(aside);
    expect(inst(run.state, inPlayCard(run.state, AVA)!).threat).toBe(4);
    expect(run.state.encounterSetAside).toEqual([]);
  });

  it("WHEN DEFEATED with All Versus All already in play: nothing is revealed and its threat is unchanged", () => {
    const placed = avaInPlay(game(), 5);
    const run = defeatMobs(placed.state);
    expect(inst(run.state, placed.id).threat).toBe(5);
    expect(run.state.villainArea.filter((i) => codeOf(run.state, i) === AVA)).toEqual([placed.id]);
  });

  it("WHEN DEFEATED with All Versus All nowhere to be found: nothing happens", () => {
    const gone = take(game(), AVA).state;
    const run = defeatMobs(gone);
    expect(inPlayCard(run.state, AVA)).toBeUndefined();
    expect(run.state.victoryDisplay).toContain(run.mobs);
  });

  it("WHEN DEFEATED finds the All Versus All that a real defeat set aside, and it is the same card", () => {
    const { state, id: ava } = avaInPlay(game(), 1);
    const aside = heroThwarts(WAVE10_DEPS, state, ava);
    expect(aside.state.encounterSetAside).toEqual([ava]);
    const again = defeatMobs(ready(aside.state, hero(aside.state)));
    expect(inPlayCard(again.state, AVA)).toBe(ava);
    expect(inst(again.state, ava).threat).toBe(4);
    expect(again.state.encounterSetAside).toEqual([]);
  });

  it("BOOST: 2 icons on the activating enemy's attack (Rhino ATK 2 + 2)", () => {
    const run = villainPhase(game(), [MOBS, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 2, damageDealt: 4 }]);
  });
});
