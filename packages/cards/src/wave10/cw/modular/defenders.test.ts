import { CORE_CARDS, CW_CARDS, encounterSetId, trait } from "@mc/content";
import {
  applyCommand,
  createGame,
  hasKeyword,
  type GameEvent,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { coreScenario } from "../../../core/setup.js";
import { validateDefinition } from "../../../dsl/validate.js";
import { P1, P2, endTurn, firstLegal, identityOf, inst, settle, stackEncounterDeck } from "../../../testing/harness.js";
import { driveEventsPicking, encounterCardInVillainArea } from "../../../testing/staging.js";
import {
  BLANK,
  CAPTAIN_MARVEL,
  FILLER_A,
  FILLER_B,
  ONE_ICON,
  SPIDER_MAN,
  attacksBy,
  codeOf,
  heroForm,
  inPlayCard,
  piles,
  revealedCodes,
  types,
} from "../../../wave9/testing.js";
import { WAVE10_CARDS } from "../../cards.js";
import { WAVE10_DEPS, engageMinion } from "../../testing.js";
import { MODULAR_DEFENDERS, MODULAR_DEFENDERS_SKIPPED, STREET_DEFENDERS } from "./defenders.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * The Defenders modular set (56184 Luke Cage, 56185 Jessica Jones, 56186 Protect the Innocent, 56187 Street Defenders,
 * 56188 The Defenders), docs/phase7-wave10.md sections 3.6 and 3.23. The Civil War scenario builder does not exist
 * yet, so the set is tested inside Core's Rhino scenario against Core starter decks with the set's cards added to the
 * encounter deck by hand. Outside Civil War "the enemy leader" is the villain, Rhino (FFG ruling July 9, 2026), and
 * in a cooperative game there is no "your leader" (MC56 p. 6), so the "Otherwise" sentences resolve.
 */
const LUKE = "56184";
const JESSICA = "56185";
const PROTECT = "56186";
const STREET = "56187";
const DEFENDERS = "56188";
const SET = [LUKE, JESSICA, PROTECT, STREET, DEFENDERS];
const RHINO = "01094";
const SHOCKER = "01103"; // Core minion: ATK 2, SCH 1
const MERCENARY = "01101"; // Core minion: ATK 1, SCH 0
const BLANK_B = "01104"; // Hard to Keep Down: no boost icon
const REFS = [
  "56184.when-revealed",
  "56184.boost",
  "56185.when-revealed",
  "56185.boost",
  "56186.when-revealed",
  "56187.when-revealed",
  "56188.the-defenders-constant",
];

const dataOf = (code: string) => CW_CARDS.find((c) => (c.id as string) === code)! as unknown as Record<string, unknown>;

/** Rhino's game against the Core decks (hero form) with one copy of each of the set's cards in the encounter deck. */
function game(seats: readonly (typeof SPIDER_MAN | typeof CAPTAIN_MARVEL)[] = [SPIDER_MAN]): GameState {
  const config = coreScenario("rhino", {
    players: seats,
    seed: 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: [...CORE_CARDS, ...WAVE10_CARDS],
  } as never);
  const copies = CW_CARDS.filter(
    (c) => "encounterSetIds" in c && c.encounterSetIds.includes(encounterSetId("defenders")),
  ).flatMap((c) => Array.from({ length: c.quantityInSet }, () => c.id));
  const created = createGame({ ...config, encounterDeck: [...config.encounterDeck, ...copies] }, WAVE10_DEPS);
  if (!created.ok) throw new Error(created.error.message);
  const settled = settle(created.state, firstLegal, (s) => s.step.phase === "player", WAVE10_DEPS);
  return heroForm(settled, ...seats.map((_, i) => (i === 0 ? P1 : P2)));
}

/** Every player ends the turn and the villain phase runs on the stacked deck (top first: Rhino's boost, then the rest). */
function villainPhase(state: GameState, stack: readonly string[]) {
  return driveEventsPicking(
    WAVE10_DEPS,
    stackEncounterDeck(state, ...stack),
    firstLegal,
    ...state.players.map((p) => endTurn(p.playerId)),
  );
}

const hero = (s: GameState, player: PlayerId = P1) => identityOf(s, player);
const villain = (s: GameState): InstanceId => s.activeVillainId!;
const statuses = (s: GameState, id: InstanceId) => inst(s, id).statuses;
const withTough = (s: GameState, id: InstanceId): GameState => ({
  ...s,
  instances: { ...s.instances, [id]: { ...s.instances[id]!, statuses: { ...s.instances[id]!.statuses, tough: 1 } } },
});
const flips = (events: readonly GameEvent[]) => types(events, "boostCardFlipped").length;
const inPlayIds = (s: GameState, code: string) =>
  Object.keys(s.instances).filter(
    (i) => codeOf(s, i as InstanceId) === code && inst(s, i as InstanceId).engagedWith !== null,
  ) as InstanceId[];

describe("registry", () => {
  it("registers the seven refs of the five cards, each a valid definition, and skips nothing", () => {
    expect(Object.keys(MODULAR_DEFENDERS).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(MODULAR_DEFENDERS)) expect(validateDefinition(def), id).toEqual([]);
    expect(MODULAR_DEFENDERS_SKIPPED).toEqual({});
  });

  it("the data names exactly these refs for the five cards", () => {
    const refs = SET.flatMap((code) => ((dataOf(code).abilities ?? []) as { id: string }[]).map((a) => a.id));
    expect(refs.sort()).toEqual([...REFS].sort());
  });

  it("carries the printed timing of each ability", () => {
    for (const ref of ["56184.when-revealed", "56185.when-revealed", "56186.when-revealed", "56187.when-revealed"])
      expect(MODULAR_DEFENDERS[ref]!.trigger, ref).toMatchObject({ kind: "whenRevealed" });
    expect(MODULAR_DEFENDERS["56184.boost"]!.trigger).toMatchObject({ kind: "boost" });
    expect(MODULAR_DEFENDERS["56185.boost"]!.trigger).toMatchObject({ kind: "boost" });
    expect(MODULAR_DEFENDERS["56188.the-defenders-constant"]!.trigger).toMatchObject({ kind: "constant" });
  });

  it("Street Defenders is one exported definition (for Hell's Kitchen's 56192 to alias)", () => {
    expect(MODULAR_DEFENDERS["56187.when-revealed"]).toBe(STREET_DEFENDERS);
  });

  it("setup: the encounter deck holds one copy of each card", () => {
    const s = game();
    const all = Object.keys(s.instances).map((i) => codeOf(s, i as InstanceId));
    expect(SET.map((code) => all.filter((c) => c === code).length)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("Luke Cage (56184)", () => {
  it("is data: a unique Defender minion, ATK 2, SCH 1, 4 hit points, no boost icon and a star icon", () => {
    const card = dataOf(LUKE);
    expect([card.type, card.atk, card.sch, card.hp, card.boostIcons, card.starIcon, card.unique]).toEqual([
      "minion",
      2,
      1,
      4,
      0,
      true,
      true,
    ]);
    expect(card.traits).toEqual([trait("DEFENDER")]);
  });

  it("WHEN REVEALED (question: no 'your leader' in a cooperative game): you are stunned, Rhino is not, and Luke Cage engages you", () => {
    const run = villainPhase(game(), [BLANK, LUKE, FILLER_A]);
    expect(statuses(run.state, hero(run.state)).stunned).toBe(1);
    expect(statuses(run.state, villain(run.state)).stunned).toBe(0);
    expect(inst(run.state, inPlayCard(run.state, LUKE)!).engagedWith).toBe(P1);
    // Rhino's own attack came first (ATK 2, no icons); revealing Luke Cage added nothing else.
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    expect(inst(run.state, hero(run.state)).damage).toBe(2);
  });

  it("WHEN REVEALED: in a two-player game only the revealing player is stunned", () => {
    const run = villainPhase(game([SPIDER_MAN, CAPTAIN_MARVEL]), [BLANK, BLANK_B, LUKE, FILLER_A]);
    expect(statuses(run.state, hero(run.state, P1)).stunned).toBe(1);
    expect(statuses(run.state, hero(run.state, P2)).stunned).toBe(0);
  });

  it("BOOST: the player the villain activated against is stunned; Luke Cage does not enter play", () => {
    const run = villainPhase(game(), [LUKE, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    expect(statuses(run.state, hero(run.state)).stunned).toBe(1);
    expect(statuses(run.state, villain(run.state)).stunned).toBe(0);
    expect(inPlayCard(run.state, LUKE)).toBeUndefined();
  });

  it("a hero who is not boosted by him is not stunned (control)", () => {
    const run = villainPhase(game(), [BLANK, FILLER_A]);
    expect(statuses(run.state, hero(run.state)).stunned).toBe(0);
  });
});

describe("Jessica Jones (56185)", () => {
  it("is data: a unique Defender minion, ATK 1, SCH 2, 3 hit points, no boost icon and a star icon", () => {
    const card = dataOf(JESSICA);
    expect([card.type, card.atk, card.sch, card.hp, card.boostIcons, card.starIcon, card.unique]).toEqual([
      "minion",
      1,
      2,
      3,
      0,
      true,
      true,
    ]);
    expect(card.traits).toEqual([trait("DEFENDER")]);
  });

  it("WHEN REVEALED (no 'your leader' in a cooperative game): you are confused, Rhino is not, and Jessica engages you", () => {
    const run = villainPhase(game(), [BLANK, JESSICA, FILLER_A]);
    expect(statuses(run.state, hero(run.state)).confused).toBe(1);
    expect(statuses(run.state, villain(run.state)).confused).toBe(0);
    expect(statuses(run.state, hero(run.state)).stunned).toBe(0);
    expect(inst(run.state, inPlayCard(run.state, JESSICA)!).engagedWith).toBe(P1);
  });

  it("WHEN REVEALED: a player already confused still has just one confused status card", () => {
    const start = game();
    const confused = {
      ...start,
      instances: {
        ...start.instances,
        [hero(start)]: { ...start.instances[hero(start)]!, statuses: { stunned: 0, confused: 1, tough: 0 } },
      },
    } as GameState;
    const run = villainPhase(confused, [BLANK, JESSICA, FILLER_A]);
    expect(statuses(run.state, hero(run.state)).confused).toBe(1);
  });

  it("BOOST: the player the villain activated against is confused; Jessica does not enter play", () => {
    const run = villainPhase(game(), [JESSICA, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    expect(statuses(run.state, hero(run.state)).confused).toBe(1);
    expect(statuses(run.state, villain(run.state)).confused).toBe(0);
    expect(inPlayCard(run.state, JESSICA)).toBeUndefined();
  });
});

describe("Protect the Innocent (56186)", () => {
  it("is data: a treachery with 1 boost icon", () => {
    const card = dataOf(PROTECT);
    expect([card.type, card.boostIcons, card.starIcon, card.keywords]).toEqual(["treachery", 1, undefined, []]);
  });

  it("WHEN REVEALED: the enemy leader (Rhino) is given a tough status card and, not having been tough, this card does not surge", () => {
    const start = game();
    expect(statuses(start, villain(start)).tough).toBe(0);
    const run = villainPhase(start, [BLANK, PROTECT, FILLER_A, FILLER_B]);
    expect(statuses(run.state, villain(run.state)).tough).toBe(1);
    expect(statuses(run.state, hero(run.state)).tough).toBe(0);
    expect(revealedCodes(run.state, run.events)).toEqual([PROTECT]);
    expect(
      piles(run.state)
        .deck.slice(0, 2)
        .map((i) => codeOf(run.state, i)),
    ).toEqual([FILLER_A, FILLER_B]);
  });

  it("WHEN REVEALED: Rhino already tough has one tough status card still, and this card gains surge (the next card is revealed too)", () => {
    const start = game();
    const run = villainPhase(withTough(start, villain(start)), [BLANK, PROTECT, FILLER_A, FILLER_B]);
    expect(statuses(run.state, villain(run.state)).tough).toBe(1);
    expect(revealedCodes(run.state, run.events)).toEqual([PROTECT, FILLER_A]);
  });

  it("WHEN REVEALED: each minion in play is given a tough status card too, whoever it is engaged with", () => {
    const withTwo = engageMinion(engageMinion(game(), SHOCKER, "shocker"), MERCENARY, "mercenary");
    // Only Rhino is given a boost card (a minion without Villainous is not); then Protect the Innocent is dealt.
    const run = villainPhase(withTwo, [BLANK, PROTECT, FILLER_A]);
    expect(statuses(run.state, "shocker" as InstanceId).tough).toBe(1);
    expect(statuses(run.state, "mercenary" as InstanceId).tough).toBe(1);
    expect(statuses(run.state, villain(run.state)).tough).toBe(1);
    expect(statuses(run.state, hero(run.state)).tough).toBe(0);
    expect(revealedCodes(run.state, run.events)).toEqual([PROTECT]);
  });

  it("WHEN REVEALED: a minion that was already tough does not make this card surge; only the enemy leader does", () => {
    const withShocker = withTough(engageMinion(game(), SHOCKER, "shocker"), "shocker" as InstanceId);
    const run = villainPhase(withShocker, [BLANK, PROTECT, FILLER_A]);
    expect(statuses(run.state, "shocker" as InstanceId).tough).toBe(1);
    expect(statuses(run.state, villain(run.state)).tough).toBe(1);
    expect(revealedCodes(run.state, run.events)).toEqual([PROTECT]);
  });

  it("BOOST: 1 icon on the activating enemy's attack (Rhino ATK 2 + 1), and nobody is given a tough status card", () => {
    const run = villainPhase(game(), [PROTECT, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
    expect(statuses(run.state, villain(run.state)).tough).toBe(0);
  });
});

describe("Street Defenders (56187)", () => {
  it("is data: a treachery with 2 boost icons", () => {
    const card = dataOf(STREET);
    expect([card.type, card.boostIcons, card.starIcon, card.keywords]).toEqual(["treachery", 2, undefined, []]);
  });

  it("WHEN REVEALED with no minion in play: the enemy leader (Rhino) activates against you with no boost card", () => {
    // Rhino's villain-phase boost is blank; the one icon card behind the treachery must stay on the deck.
    const run = villainPhase(game(), [BLANK, STREET, ONE_ICON, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([
      { baseAtk: 2, boostIcons: 0, damageDealt: 2 },
      { baseAtk: 2, boostIcons: 0, damageDealt: 2 },
    ]);
    expect(flips(run.events)).toBe(1);
    expect(inst(run.state, hero(run.state)).damage).toBe(4);
    expect(codeOf(run.state, piles(run.state).deck[0]!)).toBe(ONE_ICON);
  });

  it("WHEN REVEALED with a minion engaged with you: that minion activates (no boost) and Rhino does not", () => {
    const withShocker = engageMinion(game(), SHOCKER, "shocker");
    // Only Rhino is given a boost card in the villain phase (the Shocker is not Villainous); then Street Defenders.
    const run = villainPhase(withShocker, [BLANK, STREET, ONE_ICON, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    expect(attacksBy(run.state, run.events, SHOCKER)).toMatchObject([
      { baseAtk: 2, boostIcons: 0, damageDealt: 2 },
      { baseAtk: 2, boostIcons: 0, damageDealt: 2 },
    ]);
    expect(flips(run.events)).toBe(1);
    expect(inst(run.state, hero(run.state)).damage).toBe(6);
    expect(codeOf(run.state, piles(run.state).deck[0]!)).toBe(ONE_ICON);
  });

  it("WHEN REVEALED: every minion in play activates once more, and Rhino does not", () => {
    const two = engageMinion(engageMinion(game(), SHOCKER, "shocker"), MERCENARY, "mercenary");
    const run = villainPhase(two, [BLANK, STREET, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toHaveLength(1);
    expect(attacksBy(run.state, run.events, SHOCKER)).toHaveLength(2);
    expect(attacksBy(run.state, run.events, MERCENARY)).toHaveLength(2);
    expect(flips(run.events)).toBe(1);
    // 2 (Rhino) + 2 + 2 (Shocker) + 1 + 1 (Mercenary).
    expect(inst(run.state, hero(run.state)).damage).toBe(8);
  });

  it("WHEN REVEALED: a minion engaged with the other player activates against that player, not the revealer", () => {
    const start = engageMinion(game([SPIDER_MAN, CAPTAIN_MARVEL]), SHOCKER, "shocker", P2);
    // Rhino against P1 and against P2 (two boost cards), then Street Defenders dealt to P1 and a filler to P2.
    const run = villainPhase(start, [BLANK, BLANK_B, STREET, FILLER_A]);
    const shocker = attacksBy(run.state, run.events, SHOCKER);
    expect(shocker).toHaveLength(2);
    expect(shocker.every((a) => a.targetInstanceId === hero(run.state, P2))).toBe(true);
    expect(inst(run.state, hero(run.state, P1)).damage).toBe(2);
    expect(inst(run.state, hero(run.state, P2)).damage).toBe(6);
  });

  it("BOOST: 2 icons on the activating enemy's attack (Rhino ATK 2 + 2)", () => {
    const run = villainPhase(game(), [STREET, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 2, damageDealt: 4 }]);
    expect(attacksBy(run.state, run.events, RHINO)).toHaveLength(1);
  });
});

describe("The Defenders (56188)", () => {
  it("is data: a side scheme with 3 threat (none per player), 3 boost icons, an acceleration icon and Hinder 1 per hero", () => {
    const card = dataOf(DEFENDERS);
    expect([card.type, card.startingThreat, card.boostIcons, card.icons, card.keywords]).toEqual([
      "side_scheme",
      { base: 3, perPlayer: 0 },
      3,
      ["acceleration"],
      [{ name: "hinder", value: 0, perPlayer: 1 }],
    ]);
  });

  it("REVEALED it enters play with 3 threat plus 1 for Hinder (one hero)", () => {
    const run = villainPhase(game(), [BLANK, DEFENDERS, FILLER_A]);
    expect(inst(run.state, inPlayCard(run.state, DEFENDERS)!).threat).toBe(4);
  });

  it("CONSTANT: each minion gains guard while it is in play; none does without it, and the villain never does", () => {
    const withShocker = engageMinion(game(), SHOCKER, "shocker");
    const shocker = "shocker" as InstanceId;
    expect(hasKeyword(withShocker, shocker, "guard", WAVE10_DEPS)).toBe(false);
    const { state, id } = encounterCardInVillainArea(withShocker, DEFENDERS, 4);
    expect(hasKeyword(state, shocker, "guard", WAVE10_DEPS)).toBe(true);
    expect(hasKeyword(state, state.activeVillainId!, "guard", WAVE10_DEPS)).toBe(false);
    const gone: GameState = { ...state, villainArea: state.villainArea.filter((i) => i !== id) };
    expect(hasKeyword(gone, shocker, "guard", WAVE10_DEPS)).toBe(false);
  });

  it("CONSTANT: a guard minion stops an attack on the villain, and not an attack on the minion", () => {
    const withShocker = engageMinion(game(), SHOCKER, "shocker");
    const attack = (s: GameState, target: InstanceId) =>
      applyCommand(
        s,
        { type: "basicAttack", playerId: P1, attackerInstanceId: hero(s), targetInstanceId: target },
        WAVE10_DEPS,
      );
    expect(attack(withShocker, withShocker.activeVillainId!).ok).toBe(true);
    const { state } = encounterCardInVillainArea(withShocker, DEFENDERS, 4);
    expect(attack(state, state.activeVillainId!).ok).toBe(false);
    expect(attack(state, "shocker" as InstanceId).ok).toBe(true);
  });

  it("CONSTANT: a minion revealed after the scheme has guard too (Luke Cage)", () => {
    const { state } = encounterCardInVillainArea(game(), DEFENDERS, 4);
    const run = villainPhase(state, [BLANK, LUKE, FILLER_A]);
    const [luke] = inPlayIds(run.state, LUKE);
    expect(hasKeyword(run.state, luke!, "guard", WAVE10_DEPS)).toBe(true);
  });

  it("BOOST: 3 icons on the activating enemy's attack (Rhino ATK 2 + 3)", () => {
    const run = villainPhase(game(), [DEFENDERS, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 3, damageDealt: 5 }]);
  });
});
