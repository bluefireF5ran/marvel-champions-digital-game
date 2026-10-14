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
  heroForm,
  inDiscard,
  inPlayCard,
  piles,
} from "../../../wave9/testing.js";
import { WAVE10_CARDS } from "../../cards.js";
import { WAVE10_DEPS, engageMinion } from "../../testing.js";
import { MODULAR_MARTIAL_LAW, MODULAR_MARTIAL_LAW_SKIPPED } from "./martial-law.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * The Martial Law modular set (56109 S.H.I.E.L.D. Soldier, 56110 Rapid Response, 56111 S.H.I.E.L.D. Patrol),
 * docs/phase7-wave10.md section 3.23. The Civil War scenario builder does not exist yet, so the set is tested inside
 * Core's Rhino scenario against Core starter decks, with the set's cards added to the encounter deck by hand.
 */
const SOLDIER = "56109";
const RAPID = "56110";
const PATROL = "56111";
const SET = [SOLDIER, RAPID, PATROL];
const RHINO = "01094";
const SHOCKER = "01103"; // Core minion, no S.H.I.E.L.D. trait: ATK 2, SCH 1
const SANDMAN = "01102"; // Core minion: ATK 3, SCH 2
const MERCENARY = "01101"; // Core minion: ATK 1, SCH 0
const REFS = ["56109.when-revealed", "56109.boost", "56110.when-revealed", "56111.shield-patrol-constant"];

const dataOf = (code: string) => CW_CARDS.find((c) => (c.id as string) === code)! as unknown as Record<string, unknown>;

/** Rhino's game against the Core decks (hero form) with one copy of each Martial Law card (three Soldiers) added. */
function game(seats: readonly (typeof SPIDER_MAN | typeof CAPTAIN_MARVEL)[] = [SPIDER_MAN]): GameState {
  const config = coreScenario("rhino", {
    players: seats,
    seed: 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: [...CORE_CARDS, ...WAVE10_CARDS],
  } as never);
  const copies = CW_CARDS.filter(
    (c) => "encounterSetIds" in c && c.encounterSetIds.includes(encounterSetId("martial_law")),
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

/** One copy of `code` moved from the encounter deck to the top of its discard pile (the discard array runs newest-first, so the first element is topmost). */
function discarded(state: GameState, code: string): { readonly state: GameState; readonly id: InstanceId } {
  const pile = piles(state);
  const id = pile.deck.find((i) => codeOf(state, i) === code)!;
  return {
    id,
    state: {
      ...state,
      encounterDecks: {
        ...state.encounterDecks,
        [activeEncounterDeckId(state)]: { deck: pile.deck.filter((i) => i !== id), discard: [id, ...pile.discard] },
      },
    },
  };
}
const hero = (s: GameState, player: PlayerId = P1) => identityOf(s, player);
const engagedWith = (s: GameState, id: InstanceId) => inst(s, id).engagedWith;
const inPlayIds = (s: GameState, code: string) =>
  Object.keys(s.instances).filter(
    (i) => codeOf(s, i as InstanceId) === code && inst(s, i as InstanceId).engagedWith !== null,
  ) as InstanceId[];

describe("registry", () => {
  it("registers the four refs of the three cards, each a valid definition, and skips nothing", () => {
    expect(Object.keys(MODULAR_MARTIAL_LAW).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(MODULAR_MARTIAL_LAW)) expect(validateDefinition(def), id).toEqual([]);
    expect(MODULAR_MARTIAL_LAW_SKIPPED).toEqual({});
  });

  it("the data names exactly these refs for the three cards", () => {
    const refs = SET.flatMap((code) => ((dataOf(code).abilities ?? []) as { id: string }[]).map((a) => a.id));
    expect(refs.sort()).toEqual([...REFS].sort());
  });

  it("carries the printed timing of each ability", () => {
    expect(MODULAR_MARTIAL_LAW["56109.when-revealed"]!.trigger).toMatchObject({ kind: "whenRevealed" });
    expect(MODULAR_MARTIAL_LAW["56109.boost"]!.trigger).toMatchObject({ kind: "boost" });
    expect(MODULAR_MARTIAL_LAW["56110.when-revealed"]!.trigger).toMatchObject({ kind: "whenRevealed" });
    expect(MODULAR_MARTIAL_LAW["56111.shield-patrol-constant"]!.trigger).toMatchObject({ kind: "constant" });
  });

  it("setup: the encounter deck holds three Soldiers, one Rapid Response and one Patrol", () => {
    const s = game();
    const all = Object.keys(s.instances).map((i) => codeOf(s, i as InstanceId));
    expect(SET.map((code) => all.filter((c) => c === code).length)).toEqual([3, 1, 1]);
  });
});

describe("S.H.I.E.L.D. Soldier (56109)", () => {
  it("is data: a S.H.I.E.L.D. minion, ATK 1, SCH 1, 3 hit points, no boost icon and a star icon", () => {
    const card = dataOf(SOLDIER);
    expect([card.type, card.atk, card.sch, card.hp, card.boostIcons, card.starIcon, card.unique]).toEqual([
      "minion",
      1,
      1,
      3,
      0,
      true,
      false,
    ]);
    expect(card.traits).toEqual([trait("S.H.I.E.L.D.")]);
  });

  it("WHEN REVEALED: the topmost S.H.I.E.L.D. minion in the encounter discard pile enters play engaged with you", () => {
    // Two Soldiers in the discard pile with a non-S.H.I.E.L.D. minion above them: the later Soldier is topmost.
    const first = discarded(game(), SOLDIER);
    const second = discarded(first.state, SOLDIER);
    const shocker = discarded(second.state, SHOCKER);
    const run = villainPhase(shocker.state, [BLANK, SOLDIER, FILLER_A]);
    const revealed = inPlayIds(run.state, SOLDIER).filter((i) => i !== first.id && i !== second.id);
    expect(revealed).toHaveLength(1);
    expect(engagedWith(run.state, revealed[0]!)).toBe(P1);
    expect(engagedWith(run.state, second.id)).toBe(P1);
    expect(inPlayIds(run.state, SOLDIER)).toHaveLength(2);
    // The earlier Soldier and the Shocker stay where they were.
    expect(piles(run.state).discard).toContain(first.id);
    expect(piles(run.state).discard).toContain(shocker.id);
    expect(piles(run.state).discard).not.toContain(second.id);
    expect(inPlayCard(run.state, SHOCKER)).toBeUndefined();
  });

  it("WHEN REVEALED: with no S.H.I.E.L.D. minion in the discard pile only the revealed Soldier is in play", () => {
    const { state } = discarded(game(), SHOCKER);
    const run = villainPhase(state, [BLANK, SOLDIER, FILLER_A]);
    expect(inPlayIds(run.state, SOLDIER)).toHaveLength(1);
    expect(inPlayCard(run.state, SHOCKER)).toBeUndefined();
    expect(inDiscard(run.state, SHOCKER)).toHaveLength(1);
  });

  it("WHEN REVEALED: a Soldier put into play this way does not resolve a When Revealed of its own", () => {
    const { state, id } = discarded(game(), SOLDIER);
    const run = villainPhase(state, [BLANK, SOLDIER, FILLER_A]);
    // The discarded one entered play; the third Soldier in the deck was not revealed, so nothing more was put into play.
    expect(engagedWith(run.state, id)).toBe(P1);
    expect(inPlayIds(run.state, SOLDIER)).toHaveLength(2);
  });

  it("BOOST: the Soldier enters play engaged with the player the villain activated against (Rhino ATK 2, no icons)", () => {
    const run = villainPhase(game(), [SOLDIER, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    const soldiers = inPlayIds(run.state, SOLDIER);
    expect(soldiers).toHaveLength(1);
    expect(engagedWith(run.state, soldiers[0]!)).toBe(P1);
    expect(inDiscard(run.state, SOLDIER)).toHaveLength(0);
  });

  it("BOOST: in a two-player game it engages the second player when it is their activation's boost card", () => {
    // P1's boost is blank, P2's is the Soldier; then each player is dealt a filler attachment.
    const run = villainPhase(game([SPIDER_MAN, CAPTAIN_MARVEL]), [BLANK, SOLDIER, FILLER_A, FILLER_B]);
    const soldiers = inPlayIds(run.state, SOLDIER);
    expect(soldiers).toHaveLength(1);
    expect(engagedWith(run.state, soldiers[0]!)).toBe(P2);
  });
});

describe("Rapid Response (56110)", () => {
  it("is data: a treachery with 1 boost icon and no star", () => {
    const card = dataOf(RAPID);
    expect([card.type, card.boostIcons, card.starIcon, card.keywords]).toEqual(["treachery", 1, undefined, []]);
  });

  it("WHEN REVEALED (alter-ego): discards until a minion is discarded; threat equal to its SCH (Sandman 2)", () => {
    const start = toAlterEgo(game());
    const control = villainPhase(start, [BLANK, FILLER_B, FILLER_A, SANDMAN]);
    const run = villainPhase(start, [BLANK, RAPID, FILLER_A, SANDMAN, FILLER_B]);
    expect(inDiscard(run.state, FILLER_A)).toHaveLength(1);
    expect(inDiscard(run.state, SANDMAN)).toHaveLength(1);
    expect(inPlayCard(run.state, SANDMAN)).toBeUndefined();
    expect(mainThreat(run.state) - mainThreat(control.state)).toBe(2);
    expect(inst(run.state, hero(run.state)).damage).toBe(0);
  });

  it("WHEN REVEALED (hero): the hero is dealt damage equal to the minion's ATK (Sandman 3) and no threat is placed", () => {
    const start = game();
    const control = villainPhase(start, [BLANK, FILLER_B, FILLER_A, SANDMAN]);
    const run = villainPhase(start, [BLANK, RAPID, FILLER_A, SANDMAN, FILLER_B]);
    expect(inDiscard(run.state, SANDMAN)).toHaveLength(1);
    expect(inst(run.state, hero(run.state)).damage - inst(control.state, hero(control.state)).damage).toBe(3);
    expect(mainThreat(run.state)).toBe(mainThreat(control.state));
  });

  it("WHEN REVEALED reads the printed values: a minion with SCH 0 places no threat, one with ATK 1 deals 1", () => {
    const ego = toAlterEgo(game());
    const egoControl = villainPhase(ego, [BLANK, FILLER_B, MERCENARY]);
    const egoRun = villainPhase(ego, [BLANK, RAPID, MERCENARY, FILLER_B]);
    expect(inDiscard(egoRun.state, MERCENARY)).toHaveLength(1);
    expect(mainThreat(egoRun.state)).toBe(mainThreat(egoControl.state));
    const start = game();
    const control = villainPhase(start, [BLANK, FILLER_B, MERCENARY]);
    const run = villainPhase(start, [BLANK, RAPID, MERCENARY, FILLER_B]);
    expect(inst(run.state, hero(run.state)).damage - inst(control.state, hero(control.state)).damage).toBe(1);
  });

  it("WHEN REVEALED: the minion that was discarded is not put into play or engaged", () => {
    const run = villainPhase(game(), [BLANK, RAPID, SANDMAN, FILLER_B]);
    expect(engagedWith(run.state, inDiscard(run.state, SANDMAN)[0]!)).toBeNull();
  });

  it("BOOST: 1 icon on the activating enemy's attack (Rhino ATK 2 + 1) and no card is discarded", () => {
    const run = villainPhase(game(), [RAPID, SANDMAN, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
    expect(inDiscard(run.state, SANDMAN)).toHaveLength(0);
  });
});

describe("S.H.I.E.L.D. Patrol (56111)", () => {
  it("is data: a side scheme with 3 threat (none per player), 3 boost icons, an amplify icon and Hinder 1 per hero", () => {
    const card = dataOf(PATROL);
    expect([card.type, card.startingThreat, card.boostIcons, card.amplifyIcons, card.keywords]).toEqual([
      "side_scheme",
      { base: 3, perPlayer: 0 },
      3,
      1,
      [{ name: "hinder", value: 0, perPlayer: 1 }],
    ]);
  });

  it("REVEALED it enters play with 3 threat plus 1 for Hinder (one hero)", () => {
    const run = villainPhase(game(), [BLANK, PATROL, FILLER_A]);
    expect(inst(run.state, inPlayCard(run.state, PATROL)!).threat).toBe(4);
  });

  it("CONSTANT: each minion gains guard while it is in play; none does without it", () => {
    const withShocker = engageMinion(game(), SHOCKER, "shocker");
    const shocker = "shocker" as InstanceId;
    expect(hasKeyword(withShocker, shocker, "guard", WAVE10_DEPS)).toBe(false);
    const { state, id } = encounterCardInVillainArea(withShocker, PATROL, 4);
    expect(hasKeyword(state, shocker, "guard", WAVE10_DEPS)).toBe(true);
    // The villain is no minion.
    expect(hasKeyword(state, state.activeVillainId!, "guard", WAVE10_DEPS)).toBe(false);
    // Once the scheme is gone the minion loses it again.
    const gone: GameState = { ...state, villainArea: state.villainArea.filter((i) => i !== id) };
    expect(hasKeyword(gone, shocker, "guard", WAVE10_DEPS)).toBe(false);
  });

  it("CONSTANT: every minion has it, a Hydra Mercenary as much as a Shocker", () => {
    const two = engageMinion(engageMinion(game(), SHOCKER, "shocker"), MERCENARY, "mercenary");
    const { state } = encounterCardInVillainArea(two, PATROL, 4);
    expect(hasKeyword(state, "shocker" as InstanceId, "guard", WAVE10_DEPS)).toBe(true);
    expect(hasKeyword(state, "mercenary" as InstanceId, "guard", WAVE10_DEPS)).toBe(true);
  });

  it("CONSTANT: a guard minion engaged stops an attack on the villain, and not an attack on the minion", () => {
    const withShocker = engageMinion(game(), SHOCKER, "shocker");
    const attackVillain = (s: GameState) =>
      applyCommand(
        s,
        { type: "basicAttack", playerId: P1, attackerInstanceId: hero(s), targetInstanceId: s.activeVillainId! },
        WAVE10_DEPS,
      );
    expect(attackVillain(withShocker).ok).toBe(true);
    const { state } = encounterCardInVillainArea(withShocker, PATROL, 4);
    expect(attackVillain(state).ok).toBe(false);
    const onMinion = applyCommand(
      state,
      { type: "basicAttack", playerId: P1, attackerInstanceId: hero(state), targetInstanceId: "shocker" as InstanceId },
      WAVE10_DEPS,
    );
    expect(onMinion.ok).toBe(true);
  });

  it("CONSTANT: a minion that enters play after the scheme has guard too (a Soldier put into play by its boost)", () => {
    const { state } = encounterCardInVillainArea(game(), PATROL, 4);
    const run = villainPhase(state, [SOLDIER, FILLER_A]);
    const [soldier] = inPlayIds(run.state, SOLDIER);
    expect(hasKeyword(run.state, soldier!, "guard", WAVE10_DEPS)).toBe(true);
  });

  it("BOOST: 3 icons on the activating enemy's attack (Rhino ATK 2 + 3)", () => {
    const run = villainPhase(game(), [PATROL, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 3, damageDealt: 5 }]);
  });
});
