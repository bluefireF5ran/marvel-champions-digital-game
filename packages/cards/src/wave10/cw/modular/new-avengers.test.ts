import { CW_CARDS } from "@mc/content";
import { activeEncounterDeckId, type GameState, type InstanceId } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { validateDefinition } from "../../../dsl/validate.js";
import {
  P1,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  patchInstance,
  stackEncounterDeck,
} from "../../../testing/harness.js";
import { driveEventsPicking, encounterCardInVillainArea } from "../../../testing/staging.js";
import { attacksBy, codeOf, flippedBoosts, inDiscardPile, piles, types } from "../../../wave9/testing.js";
import { SPIDER_WOMAN_SCENARIO, WAVE10_DEPS, civilWarHeroGame } from "../../testing.js";
import { MODULAR_NEW_AVENGERS, MODULAR_NEW_AVENGERS_SKIPPED } from "./new-avengers.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * The New Avengers modular set (56150 Falcon, 56151 Hercules, 56152 Goliath, 56153 Freedom Fighters, 56154 New
 * Avengers), docs/phase7-wave10.md sections 3.9, 3.10 and 3.23. Every test is a real game in the
 * `resistance-spider-woman` scenario with New Avengers picked as a modular set (Captain America's own scenario is not
 * relied on: its leader is unscripted). Cooperatively the enemy leader is Spider-Woman (MC56 p. 6). She starts with
 * Finesse and no skill counter; a boost card is not a revealed card, so her interrupt does not place any.
 *
 * The villain phase draws the villain's boost card first, then deals each player a card (RRG 1.8 "Villain Phase"), so a
 * stack reads "boost, dealt". Advance 01186 prints no boost icon and no Boost ability. Self-propelled Glide 56179
 * (Spider-Woman's own side scheme) is the harmless card to deal. Freedom Fighters (56153) is not scripted yet, so it
 * has no behavioral test; its two refs are in the skipped map with their reason.
 */
const FALCON = "56150";
const HERCULES = "56151";
const GOLIATH = "56152";
const FIGHTERS = "56153";
const NEW_AVENGERS = "56154";
const SPIDER_WOMAN = "56168";
const ADVANCE = "01186";
const GLIDE = "56179";
const DEFEND = "56193"; // Hell's Kitchen's side scheme: a second harmless card to deal
const SET = [FALCON, HERCULES, GOLIATH, FIGHTERS, NEW_AVENGERS];
const REFS = [
  "56150.when-defeated",
  "56150.boost",
  "56151.when-defeated",
  "56151.boost",
  "56152.when-defeated",
  "56152.boost",
  "56154.when-defeated",
];
const SKIPPED_REFS = ["56153.when-revealed", "56153.boost"];

const dataOf = (code: string) => CW_CARDS.find((c) => (c.id as string) === code)! as unknown as Record<string, unknown>;
const leaderOf = (s: GameState): InstanceId => s.activeVillainId!;
const boostsOn = (s: GameState) => inst(s, leaderOf(s)).boostCards;
const hero = (s: GameState) => identityOf(s, P1);
const discardCodes = (s: GameState) => piles(s).discard.map((id) => codeOf(s, id));
const status = (s: GameState, id: InstanceId, name: "stunned" | "confused" | "tough") => inst(s, id).statuses[name];
const withStatus = (s: GameState, id: InstanceId, name: "stunned" | "confused" | "tough", n = 1): GameState =>
  patchInstance(s, id, { statuses: { ...inst(s, id).statuses, [name]: n } });

/**
 * The Spider-Woman scenario with New Avengers as a modular set, past setup, hero form, Spider-Woman not tough. Stage 1A
 * revealed Self-propelled Glide; it is back in the encounter deck because the stacks deal it as the harmless filler card.
 */
function game(): GameState {
  const start = civilWarHeroGame(SPIDER_WOMAN_SCENARIO, {
    modularSetIds: ["new_avengers", "defenders", "hells_kitchen"],
    leaderSideScheme: "discarded",
  });
  return withStatus(start, leaderOf(start), "tough", 0);
}

/** Surgery: the encounter deck's own copy of minion `code`, engaged with player 1 (no reveal, no When Revealed). */
function engaged(state: GameState, code: string): { readonly state: GameState; readonly id: InstanceId } {
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
      players: state.players.map((p) => (p.playerId === P1 ? { ...p, playArea: [...p.playArea, id] } : p)),
      instances: { ...state.instances, [id]: { ...state.instances[id]!, engagedWith: P1, faceup: true } },
    },
  };
}

/** Player 1's hero, readied by surgery, defeats `target` with a real basic attack. */
function defeat(state: GameState, target: InstanceId) {
  const ready = patchInstance(patchInstance(state, target, { damage: 999 }), hero(state), { exhausted: false });
  return driveEventsPicking(WAVE10_DEPS, ready, firstLegal, {
    type: "basicAttack",
    playerId: P1,
    attackerInstanceId: hero(state),
    targetInstanceId: target,
  });
}

/** The first player ends the turn and the villain phase runs on the stacked deck (boost card first, then the dealt card). */
const villainPhase = (state: GameState, ...stack: string[]) =>
  driveEventsPicking(WAVE10_DEPS, stackEncounterDeck(state, ...stack), firstLegal, endTurn(P1));

const flipped = (s: GameState, events: Parameters<typeof flippedBoosts>[0]) =>
  flippedBoosts(events).map((f) => [codeOf(s, f.instanceId), f.boostIcons]);

describe("registry", () => {
  it("registers the seven refs of the scripted cards, each a valid definition", () => {
    expect(Object.keys(MODULAR_NEW_AVENGERS).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(MODULAR_NEW_AVENGERS)) expect(validateDefinition(def), id).toEqual([]);
  });

  it("skips exactly Freedom Fighters' two refs, each with its reason (the engine primitive of section 3.11)", () => {
    expect(Object.keys(MODULAR_NEW_AVENGERS_SKIPPED).sort()).toEqual([...SKIPPED_REFS].sort());
    for (const reason of Object.values(MODULAR_NEW_AVENGERS_SKIPPED))
      expect(reason).toContain("spec 8.2 task 8 (§3.11)");
  });

  it("the data names exactly these refs, registered or skipped, for the five cards", () => {
    const refs = SET.flatMap((code) => ((dataOf(code).abilities ?? []) as { id: string }[]).map((a) => a.id));
    expect(refs.sort()).toEqual([...REFS, ...SKIPPED_REFS].sort());
  });

  it("carries the printed timing of each ability", () => {
    for (const ref of ["56150.when-defeated", "56151.when-defeated", "56152.when-defeated", "56154.when-defeated"])
      expect(MODULAR_NEW_AVENGERS[ref]!.trigger, ref).toMatchObject({ kind: "whenDefeated" });
    for (const ref of ["56150.boost", "56151.boost", "56152.boost"])
      expect(MODULAR_NEW_AVENGERS[ref]!.trigger, ref).toMatchObject({ kind: "boost" });
  });

  it("the three Teamwork minions share one When Defeated definition", () => {
    expect(MODULAR_NEW_AVENGERS["56151.when-defeated"]).toBe(MODULAR_NEW_AVENGERS["56150.when-defeated"]);
    expect(MODULAR_NEW_AVENGERS["56152.when-defeated"]).toBe(MODULAR_NEW_AVENGERS["56150.when-defeated"]);
  });

  it("setup: the encounter deck holds one copy of each card", () => {
    const s = game();
    const all = Object.keys(s.instances).map((i) => codeOf(s, i as InstanceId));
    expect(SET.map((code) => all.filter((c) => c === code).length)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe.each([
  [FALCON, "Falcon", 2, 2, 3],
  [HERCULES, "Hercules", 3, 1, 4],
] as const)("%s %s: Teamwork minion", (code, _name, atk, sch, hp) => {
  it("is data: a unique Avenger minion with Teamwork (Avenger), no boost icon, a star icon and no Victory", () => {
    const card = dataOf(code);
    expect([card.type, card.atk, card.sch, card.hp, card.boostIcons, card.starIcon, card.unique]).toEqual([
      "minion",
      atk,
      sch,
      hp,
      0,
      true,
      true,
    ]);
    expect(card.keywords).toEqual([{ name: "teamwork", sharedTrait: expect.anything() }]);
  });

  it("WHEN DEFEATED: Spider-Woman holds it facedown, undamaged and unengaged, and it is in no pile", () => {
    const minion = engaged(game(), code);
    const { state, events } = defeat(minion.state, minion.id);
    expect(types(events, "characterDefeated").map((e) => e.instanceId)).toEqual([minion.id]);
    expect(types(events, "boostCardDealt")).toEqual([
      { type: "boostCardDealt", enemyInstanceId: leaderOf(state), instanceId: minion.id, outsideActivation: true },
    ]);
    expect(boostsOn(state)).toEqual([minion.id]);
    expect(inst(state, minion.id)).toMatchObject({ faceup: false, damage: 0, engagedWith: null });
    expect(discardCodes(state)).not.toContain(code);
    expect(state.players.flatMap((p) => [...p.playArea, ...p.discard, ...p.hand, ...p.deck])).not.toContain(minion.id);
    expect(flippedBoosts(events)).toEqual([]);
  });

  it("a stunned Spider-Woman does not activate: the card stays facedown until her next activation", () => {
    const minion = engaged(game(), code);
    const given = defeat(minion.state, minion.id).state;
    const first = villainPhase(withStatus(given, leaderOf(given), "stunned"), GLIDE);
    expect(flippedBoosts(first.events)).toEqual([]);
    expect(status(first.state, leaderOf(first.state), "stunned")).toBe(0);
    expect(boostsOn(first.state)).toEqual([minion.id]);
    expect(inst(first.state, minion.id).faceup).toBe(false);
    const second = villainPhase(first.state, ADVANCE, DEFEND);
    expect(flipped(second.state, second.events)).toEqual([
      [code, 0],
      [ADVANCE, 0],
    ]);
    expect(boostsOn(second.state)).toEqual([]);
  });
});

describe("Falcon (56150) Boost: you are confused; if you were already confused, this card gains two boost icons", () => {
  it("as the villain's boost card: you become confused and it adds no icon", () => {
    const start = game();
    expect(status(start, hero(start), "confused")).toBe(0);
    const { state, events } = villainPhase(start, FALCON, GLIDE);
    expect(attacksBy(state, events, SPIDER_WOMAN)).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    expect(types(events, "statusGiven").filter((e) => e.instanceId === hero(state))).toEqual([
      { type: "statusGiven", instanceId: hero(state), status: "confused" },
    ]);
    expect(status(state, hero(state), "confused")).toBe(1);
    expect(inst(state, hero(state)).damage).toBe(2);
  });

  it("as the villain's boost card with you already confused: it gains two icons (ATK 2 + 2) and you stay confused once", () => {
    const start = withStatus(game(), hero(game()), "confused");
    const { state, events } = villainPhase(start, FALCON, GLIDE);
    expect(attacksBy(state, events, SPIDER_WOMAN)).toMatchObject([{ baseAtk: 2, boostIcons: 2, damageDealt: 4 }]);
    expect(types(events, "statusGiven").filter((e) => e.instanceId === hero(state))).toEqual([]);
    expect(status(state, hero(state), "confused")).toBe(1);
    expect(inst(state, hero(state)).damage).toBe(4);
  });

  it("turned up from the leader's held cards at her next activation: first, with its Boost resolving, then the dealt card", () => {
    const falcon = engaged(game(), FALCON);
    const given = defeat(falcon.state, falcon.id).state;
    const { state, events } = villainPhase(given, ADVANCE, GLIDE);
    expect(flipped(state, events)).toEqual([
      [FALCON, 0],
      [ADVANCE, 0],
    ]);
    expect(status(state, hero(state), "confused")).toBe(1);
    expect(attacksBy(state, events, SPIDER_WOMAN)).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    expect(boostsOn(state)).toEqual([]);
    expect(inst(state, falcon.id).faceup).toBe(true);
    // The discard pile is newest-first: Self-propelled Glide stays in play, so the boost cards are on top.
    expect(
      piles(state)
        .discard.slice(0, 2)
        .map((id) => codeOf(state, id)),
    ).toEqual([ADVANCE, FALCON]);
  });
});

describe("Hercules (56151) Boost: you are stunned; if you were already stunned, this card gains two boost icons", () => {
  it("as the villain's boost card: you become stunned and it adds no icon", () => {
    const start = game();
    const { state, events } = villainPhase(start, HERCULES, GLIDE);
    expect(attacksBy(state, events, SPIDER_WOMAN)).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    expect(types(events, "statusGiven").filter((e) => e.instanceId === hero(state))).toEqual([
      { type: "statusGiven", instanceId: hero(state), status: "stunned" },
    ]);
    expect(status(state, hero(state), "stunned")).toBe(1);
  });

  it("as the villain's boost card with you already stunned: it gains two icons (ATK 2 + 2) and you stay stunned once", () => {
    const start = withStatus(game(), hero(game()), "stunned");
    const { state, events } = villainPhase(start, HERCULES, GLIDE);
    expect(attacksBy(state, events, SPIDER_WOMAN)).toMatchObject([{ baseAtk: 2, boostIcons: 2, damageDealt: 4 }]);
    expect(types(events, "statusGiven").filter((e) => e.instanceId === hero(state))).toEqual([]);
    expect(status(state, hero(state), "stunned")).toBe(1);
  });

  it("turned up from the leader's held cards at her next activation", () => {
    const hercules = engaged(game(), HERCULES);
    const given = defeat(hercules.state, hercules.id).state;
    const { state, events } = villainPhase(given, ADVANCE, GLIDE);
    expect(flipped(state, events)).toEqual([
      [HERCULES, 0],
      [ADVANCE, 0],
    ]);
    expect(status(state, hero(state), "stunned")).toBe(1);
    expect(boostsOn(state)).toEqual([]);
  });
});

describe("Goliath (56152) Boost: give the enemy leader a tough status card; if they were already tough, two boost icons", () => {
  it("is data: a unique Avenger Giant minion, ATK 2, SCH 1, 5 hit points, no boost icon and no Victory", () => {
    const card = dataOf(GOLIATH);
    expect([card.type, card.atk, card.sch, card.hp, card.boostIcons, card.starIcon, card.unique]).toEqual([
      "minion",
      2,
      1,
      5,
      0,
      true,
      true,
    ]);
    expect(card.keywords).toEqual([{ name: "teamwork", sharedTrait: expect.anything() }]);
  });

  it("WHEN DEFEATED: Spider-Woman holds it facedown and it is in no pile", () => {
    const goliath = engaged(game(), GOLIATH);
    const { state } = defeat(goliath.state, goliath.id);
    expect(boostsOn(state)).toEqual([goliath.id]);
    expect(inst(state, goliath.id)).toMatchObject({ faceup: false, damage: 0, engagedWith: null });
    expect(discardCodes(state)).not.toContain(GOLIATH);
  });

  it("as the villain's boost card: Spider-Woman is given a tough status card and it adds no icon", () => {
    const start = game();
    expect(status(start, leaderOf(start), "tough")).toBe(0);
    const { state, events } = villainPhase(start, GOLIATH, GLIDE);
    expect(attacksBy(state, events, SPIDER_WOMAN)).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    expect(types(events, "statusGiven").filter((e) => e.instanceId === leaderOf(state))).toEqual([
      { type: "statusGiven", instanceId: leaderOf(state), status: "tough" },
    ]);
    expect(status(state, leaderOf(state), "tough")).toBe(1);
  });

  it("as the villain's boost card with her already tough: it gains two icons (ATK 2 + 2) and she stays tough once", () => {
    const start = withStatus(game(), leaderOf(game()), "tough");
    const { state, events } = villainPhase(start, GOLIATH, GLIDE);
    expect(attacksBy(state, events, SPIDER_WOMAN)).toMatchObject([{ baseAtk: 2, boostIcons: 2, damageDealt: 4 }]);
    expect(types(events, "statusGiven").filter((e) => e.instanceId === leaderOf(state))).toEqual([]);
    expect(status(state, leaderOf(state), "tough")).toBe(1);
  });

  it("Goliath leaves your own status cards alone", () => {
    const { state } = villainPhase(game(), GOLIATH, GLIDE);
    expect(status(state, hero(state), "confused")).toBe(0);
    expect(status(state, hero(state), "stunned")).toBe(0);
    expect(status(state, hero(state), "tough")).toBe(0);
  });
});

describe("two Teamwork minions defeated before one activation", () => {
  it("Spider-Woman holds both in the order given; the activation turns up both, then the dealt boost card", () => {
    const falcon = engaged(game(), FALCON);
    const hercules = engaged(falcon.state, HERCULES);
    const one = defeat(hercules.state, falcon.id).state;
    const two = defeat(one, hercules.id).state;
    expect(boostsOn(two)).toEqual([falcon.id, hercules.id]);
    expect([falcon.id, hercules.id].map((id) => inst(two, id).faceup)).toEqual([false, false]);
    const { state, events } = villainPhase(two, ADVANCE, GLIDE);
    expect(flipped(state, events)).toEqual([
      [FALCON, 0],
      [HERCULES, 0],
      [ADVANCE, 0],
    ]);
    expect([status(state, hero(state), "confused"), status(state, hero(state), "stunned")]).toEqual([1, 1]);
    expect(boostsOn(state)).toEqual([]);
    expect(
      piles(state)
        .discard.slice(0, 3)
        .map((id) => codeOf(state, id)),
    ).toEqual([ADVANCE, HERCULES, FALCON]);
  });

  it("each Boost reads its own status: already confused, Falcon gains two icons; not stunned, Hercules gains none", () => {
    const falcon = engaged(game(), FALCON);
    const hercules = engaged(falcon.state, HERCULES);
    const given = defeat(defeat(hercules.state, falcon.id).state, hercules.id).state;
    const { state, events } = villainPhase(withStatus(given, hero(given), "confused"), ADVANCE, GLIDE);
    // Already confused: Falcon gains two icons. You were not stunned: Hercules gains none.
    expect(attacksBy(state, events, SPIDER_WOMAN)).toMatchObject([{ baseAtk: 2, boostIcons: 2, damageDealt: 4 }]);
  });
});

describe("New Avengers (56154)", () => {
  it("is data: a side scheme with 3 threat (none per player), 2 boost icons and Hinder 1 per hero", () => {
    const card = dataOf(NEW_AVENGERS);
    expect([card.type, card.startingThreat, card.boostIcons, card.keywords]).toEqual([
      "side_scheme",
      { base: 3, perPlayer: 0 },
      2,
      [{ name: "hinder", value: 0, perPlayer: 1 }],
    ]);
  });

  const defeatScheme = (state: GameState, scheme: InstanceId) =>
    driveEventsPicking(WAVE10_DEPS, patchInstance(state, hero(state), { exhausted: false }), firstLegal, {
      type: "basicThwart",
      playerId: P1,
      thwarterInstanceId: hero(state),
      schemeInstanceId: scheme,
    });

  it("WHEN DEFEATED: each minion in the encounter discard pile goes back into the encounter deck; other cards stay", () => {
    const staged = inDiscardPile(
      inDiscardPile(inDiscardPile(inDiscardPile(game(), FALCON), HERCULES), GOLIATH),
      ADVANCE,
    );
    expect(discardCodes(staged).sort()).toEqual([ADVANCE, FALCON, GOLIATH, HERCULES].sort());
    const scheme = encounterCardInVillainArea(staged, NEW_AVENGERS, 1);
    const deckBefore = piles(scheme.state).deck.length;
    const run = defeatScheme(scheme.state, scheme.id);
    expect(types(run.events, "schemeDefeated").map((e) => e.instanceId)).toEqual([scheme.id]);
    // The three minions are in the deck; Advance and the scheme itself are the only cards in the discard pile.
    expect(discardCodes(run.state).sort()).toEqual([ADVANCE, NEW_AVENGERS].sort());
    expect(piles(run.state).deck.length).toBe(deckBefore + 3);
    const deckCodes = piles(run.state).deck.map((id) => codeOf(run.state, id));
    for (const code of [FALCON, HERCULES, GOLIATH]) expect(deckCodes.filter((c) => c === code)).toHaveLength(1);
    // Reshuffled: the three do not sit on top in the order they were put in.
    expect(deckCodes.slice(0, 3)).not.toEqual([FALCON, HERCULES, GOLIATH]);
  });

  it("WHEN DEFEATED with no minion in the discard pile: the deck is unchanged in size", () => {
    const staged = inDiscardPile(game(), ADVANCE);
    const scheme = encounterCardInVillainArea(staged, NEW_AVENGERS, 1);
    const deckBefore = piles(scheme.state).deck.length;
    const run = defeatScheme(scheme.state, scheme.id);
    expect(piles(run.state).deck.length).toBe(deckBefore);
    expect(discardCodes(run.state).sort()).toEqual([ADVANCE, NEW_AVENGERS].sort());
  });

  it("WHEN DEFEATED: a Teamwork minion held facedown by the leader is not in the discard pile, so it is not shuffled", () => {
    const falcon = engaged(game(), FALCON);
    const given = defeat(falcon.state, falcon.id).state;
    const scheme = encounterCardInVillainArea(given, NEW_AVENGERS, 1);
    const run = defeatScheme(scheme.state, scheme.id);
    expect(boostsOn(run.state)).toEqual([falcon.id]);
    expect(piles(run.state).deck).not.toContain(falcon.id);
  });

  it("BOOST: 2 icons on the activating enemy's attack (Spider-Woman ATK 2 + 2)", () => {
    const run = villainPhase(game(), NEW_AVENGERS, GLIDE);
    expect(attacksBy(run.state, run.events, SPIDER_WOMAN)).toMatchObject([
      { baseAtk: 2, boostIcons: 2, damageDealt: 4 },
    ]);
  });
});

describe("Freedom Fighters (56153)", () => {
  it("is data: a treachery with a boost star and no boost icon; its abilities wait on an engine primitive", () => {
    const card = dataOf(FIGHTERS);
    expect([card.type, card.boostIcons, card.starIcon]).toEqual(["treachery", 0, true]);
    for (const ref of SKIPPED_REFS) expect(ref in MODULAR_NEW_AVENGERS).toBe(false);
  });
});
