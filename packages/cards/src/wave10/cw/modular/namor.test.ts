import { CORE_CARDS, CW_CARDS, encounterSetId, trait } from "@mc/content";
import {
  activeEncounterDeckId,
  applyCommand,
  createGame,
  hasKeyword,
  keywordsOf,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { coreScenario } from "../../../core/setup.js";
import { validateDefinition } from "../../../dsl/validate.js";
import {
  P1,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  moveToHand,
  patchInstance,
  settle,
  stackEncounterDeck,
  use,
} from "../../../testing/harness.js";
import { driveEventsPicking, encounterCardInVillainArea } from "../../../testing/staging.js";
import {
  BLANK,
  FILLER_A,
  ONE_ICON,
  SPIDER_MAN,
  attacksBy,
  codeOf,
  heroAttacks,
  heroForm,
  inDiscard,
  inPlayCard,
  schemesBy,
  types,
} from "../../../wave9/testing.js";
import { WAVE10_CARDS } from "../../cards.js";
import { WAVE10_DEPS, engageMinion } from "../../testing.js";
import { MODULAR_NAMOR, MODULAR_NAMOR_SKIPPED } from "./namor.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * The Namor modular set (56160 Namor, 56161 Neptune's Trident, 56162 Horn of Proteus, 56163 Imperius Rex!, 56164 Ruler
 * of Atlantis), docs/phase7-wave10.md section 3.23. The Civil War scenario builder does not exist yet, so the set is
 * tested inside Core's Rhino scenario against the Core Spider-Man starter deck, with the set's five cards added to the
 * encounter deck by hand (`namorGame`, `withNamor` and `attachTo` are local helpers, to be promoted to
 * `wave10/testing.ts` with the builder).
 */
const NAMOR = "56160";
const TRIDENT = "56161";
const HORN = "56162";
const IMPERIUS = "56163";
const RULER = "56164";
const SET = [NAMOR, TRIDENT, HORN, IMPERIUS, RULER];
const RHINO = "01094";
const SHOCKER = "01103"; // Core minion, no Atlantis trait
const REFS = [
  "56160.when-revealed",
  "56161.neptunes-trident-constant",
  "56161.neptunes-trident-action",
  "56162.horn-of-proteus-forced-interrupt",
  "56162.horn-of-proteus-action",
  "56163.when-revealed",
  "56163.boost",
  "56164.ruler-of-atlantis-constant",
];
// Core cards of the Spider-Man deck with one printed resource of a type, to pay a Hero Action with.
const ENERGY = "01002";
const ENERGY_2 = "01006";
const PHYSICAL = "01003";
/** Core treachery "I'm Tough!"-style filler with no boost icons, for a third blank boost card (Advance has only two copies). */
const BLANK_B = "01104";
const MENTAL = "01004";

const dataOf = (code: string) => CW_CARDS.find((c) => (c.id as string) === code)! as unknown as Record<string, unknown>;

/** Rhino's game against Spider-Man (hero form) with one copy of each of the set's cards in the encounter deck. */
function namorGame(): GameState {
  const config = coreScenario("rhino", {
    players: [SPIDER_MAN],
    seed: 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: [...CORE_CARDS, ...WAVE10_CARDS],
  } as never);
  const copies = CW_CARDS.filter(
    (c) => "encounterSetIds" in c && c.encounterSetIds.includes(encounterSetId("namor_modular")),
  ).flatMap((c) => Array.from({ length: c.quantityInSet }, () => c.id));
  const created = createGame({ ...config, encounterDeck: [...config.encounterDeck, ...copies] }, WAVE10_DEPS);
  if (!created.ok) throw new Error(created.error.message);
  return heroForm(settle(created.state, firstLegal, (s) => s.step.phase === "player", WAVE10_DEPS));
}
const alterEgoGame = (): GameState => {
  const s = namorGame();
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, identity: { ...p.identity, form: "alterEgo" as const } })),
  } as GameState;
};

/** Every player ends the turn and the villain phase runs on the stacked deck (top first: Rhino's boost, then the rest). */
function villainPhase(state: GameState, stack: readonly string[]) {
  return driveEventsPicking(WAVE10_DEPS, stackEncounterDeck(state, ...stack), firstLegal, endTurn(P1));
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
/** Namor put straight into play engaged with P1 (surgery, no reveal): the set's real card instance. */
function withNamor(state: GameState): { readonly state: GameState; readonly id: InstanceId } {
  const taken = takeFromEncounter(state, NAMOR);
  const id = taken.id;
  const placed: GameState = {
    ...taken.state,
    players: taken.state.players.map((p) => (p.playerId === P1 ? { ...p, playArea: [...p.playArea, id] } : p)),
  };
  return { id, state: patchInstance(placed, id, { faceup: true, engagedWith: P1, controllerId: null }) };
}
/** The set's `code` attached faceup to `host` (surgery: no reveal). */
function attachTo(state: GameState, code: string, host: InstanceId): { state: GameState; id: InstanceId } {
  const taken = takeFromEncounter(state, code);
  const attached = patchInstance(taken.state, taken.id, { faceup: true, attachedTo: host });
  return {
    id: taken.id,
    state: patchInstance(attached, host, { attachments: [...inst(attached, host).attachments, taken.id] }),
  };
}
const villainOf = (s: GameState): InstanceId => s.activeVillainId!;
const attachedCodes = (s: GameState, host: InstanceId) => inst(s, host).attachments.map((a) => codeOf(s, a));
const hero = (s: GameState) => identityOf(s, P1);
const flips = (events: readonly GameEvent[]) => types(events, "boostCardFlipped").length;
const toughOn = (s: GameState, id: InstanceId) => inst(s, id).statuses.tough;
const withTough = (s: GameState, id: InstanceId): GameState =>
  patchInstance(s, id, { statuses: { ...inst(s, id).statuses, tough: 1 } });
const useCommand = (state: GameState, card: InstanceId, ref: string, codes: readonly string[]) => {
  const given = moveToHand(state, P1, ...codes);
  const command = use(
    P1,
    card,
    ref,
    given.ids.map((fromHand) => ({ fromHand })),
  );
  return { state: given.state, command };
};
const heroAction = (state: GameState, card: InstanceId, ref: string, ...codes: readonly string[]) => {
  const given = useCommand(state, card, ref, codes);
  return driveEventsPicking(WAVE10_DEPS, given.state, firstLegal, given.command);
};
/** The hero action attempted with a payment that does not cover it: the engine's rejection. */
const heroActionRefused = (state: GameState, card: InstanceId, ref: string, ...codes: readonly string[]) => {
  const given = useCommand(state, card, ref, codes);
  return applyCommand(given.state, given.command, WAVE10_DEPS);
};

describe("registry", () => {
  it("registers the eight refs of the five cards, each a valid definition, and skips nothing", () => {
    expect(Object.keys(MODULAR_NAMOR).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(MODULAR_NAMOR)) expect(validateDefinition(def), id).toEqual([]);
    expect(MODULAR_NAMOR_SKIPPED).toEqual({});
  });

  it("the data names exactly these refs for the five cards", () => {
    const refs = SET.flatMap((code) => ((dataOf(code).abilities ?? []) as { id: string }[]).map((a) => a.id));
    expect(refs.sort()).toEqual([...REFS].sort());
  });

  it("carries the printed timing of each ability", () => {
    expect(MODULAR_NAMOR["56160.when-revealed"]!.trigger).toMatchObject({ kind: "whenRevealed" });
    expect(MODULAR_NAMOR["56161.neptunes-trident-constant"]!.trigger).toMatchObject({ kind: "constant" });
    expect(MODULAR_NAMOR["56161.neptunes-trident-action"]!.trigger).toMatchObject({ kind: "action" });
    expect(MODULAR_NAMOR["56162.horn-of-proteus-forced-interrupt"]!.trigger).toMatchObject({
      kind: "interrupt",
      forced: true,
    });
    expect(MODULAR_NAMOR["56162.horn-of-proteus-action"]!.trigger).toMatchObject({ kind: "action" });
    expect(MODULAR_NAMOR["56163.when-revealed"]!.trigger).toMatchObject({ kind: "whenRevealed" });
    expect(MODULAR_NAMOR["56163.boost"]!.trigger).toMatchObject({ kind: "boost" });
    expect(MODULAR_NAMOR["56164.ruler-of-atlantis-constant"]!.trigger).toMatchObject({ kind: "constant" });
  });

  it("setup: one copy of each card is in the encounter deck", () => {
    const s = namorGame();
    const all = Object.keys(s.instances).map((i) => codeOf(s, i as InstanceId));
    expect(SET.map((code) => all.filter((c) => c === code).length)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("Namor (56160)", () => {
  it("is data: an Elite Atlantis unique minion, ATK 1, SCH 1, 6 hit points, 3 boost icons, Stalwart, Toughness, Villainous", () => {
    const card = dataOf(NAMOR);
    expect([card.type, card.atk, card.sch, card.hp, card.boostIcons, card.unique]).toEqual([
      "minion",
      1,
      1,
      6,
      3,
      true,
    ]);
    expect(card.traits).toEqual([trait("ATLANTIS"), trait("ELITE")]);
    expect(card.keywords).toEqual([{ name: "stalwart" }, { name: "toughness" }, { name: "villainous" }]);
  });

  it("WHEN REVEALED (hero form): he engages the revealing player and attacks: ATK 1 + 1 boost icon = 2 damage", () => {
    // Rhino's boost, Namor dealt to the player, Namor's own boost card.
    const run = villainPhase(namorGame(), [BLANK, NAMOR, ONE_ICON, FILLER_A]);
    expect(inst(run.state, inPlayCard(run.state, NAMOR)!).engagedWith).toBe(P1);
    expect(attacksBy(run.state, run.events, NAMOR)).toMatchObject([{ baseAtk: 1, boostIcons: 1, damageDealt: 2 }]);
    expect(schemesBy(run.state, run.events, NAMOR)).toEqual([]);
    expect(attacksBy(run.state, run.events, RHINO)).toHaveLength(1);
    expect(flips(run.events)).toBe(2);
  });

  it("WHEN REVEALED (alter-ego form): he schemes against the revealing player: SCH 1 + 1 icon = 2 threat", () => {
    const run = villainPhase(alterEgoGame(), [BLANK, NAMOR, ONE_ICON, FILLER_A]);
    expect(schemesBy(run.state, run.events, NAMOR)).toMatchObject([{ baseSch: 1, boostIcons: 1, threatPlaced: 2 }]);
    expect(attacksBy(run.state, run.events, NAMOR)).toEqual([]);
  });

  it("has Stalwart, Toughness and Villainous, and Toughness: a hero's attack on a tough Namor discards the status card and deals no damage", () => {
    const placed = withNamor(namorGame());
    expect(keywordsOf(placed.state, placed.id, WAVE10_DEPS).map((k) => k.name)).toEqual(
      expect.arrayContaining(["stalwart", "toughness", "villainous"]),
    );
    expect(hasKeyword(placed.state, placed.id, "toughness", WAVE10_DEPS)).toBe(true);
    const toughened = withTough(placed.state, placed.id);
    const run = heroAttacks(WAVE10_DEPS, toughened, placed.id);
    expect(toughOn(run.state, placed.id)).toBe(0);
    expect(inst(run.state, placed.id).damage).toBe(0);
  });
});

describe("Neptune's Trident (56161)", () => {
  it("is data: a Weapon attachment, +1 ATK, 1 boost icon, attaches to Namor otherwise the enemy leader", () => {
    const card = dataOf(TRIDENT);
    expect([card.type, card.statModifiers, card.boostIcons, card.traits]).toEqual([
      "attachment",
      { atk: 1 },
      1,
      [trait("WEAPON")],
    ]);
    expect(card.attachesTo).toEqual({
      kind: "ifAble",
      preferred: { kind: "namedCard", name: "Namor" },
      otherwise: { kind: "leader", of: "enemy" },
    });
  });

  it("REVEALED with Namor in play it attaches to him", () => {
    const placed = withNamor(namorGame());
    // Rhino's boost, Namor's boost, then the Trident dealt to the player.
    const run = villainPhase(placed.state, [BLANK, BLANK, TRIDENT]);
    expect(attachedCodes(run.state, placed.id)).toEqual([TRIDENT]);
    expect(attachedCodes(run.state, villainOf(run.state))).toEqual([]);
  });

  it("REVEALED with Namor not in play it attaches to the enemy leader (the villain)", () => {
    const run = villainPhase(namorGame(), [BLANK, TRIDENT, FILLER_A]);
    expect(attachedCodes(run.state, villainOf(run.state))).toEqual([TRIDENT]);
  });

  it("CONSTANT: the attached enemy's attacks gain piercing; without the Trident the tough status card is discarded instead", () => {
    const start = namorGame();
    const tough = withTough(start, hero(start));
    // Control: Rhino ATK 2 on a tough hero discards the tough status card; the hero takes no damage.
    const control = villainPhase(tough, [BLANK, FILLER_A]);
    expect(attacksBy(control.state, control.events, RHINO)).toMatchObject([{ baseAtk: 2 }]);
    expect(toughOn(control.state, hero(control.state))).toBe(0);
    expect(inst(control.state, hero(control.state)).damage).toBe(0);
    // The Trident on Rhino: ATK 2 + 1 piercing; the tough status card is discarded and the damage lands anyway.
    const { state } = attachTo(tough, TRIDENT, villainOf(tough));
    const run = villainPhase(state, [BLANK, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 3, damageDealt: 3 }]);
    expect(toughOn(run.state, hero(run.state))).toBe(0);
    expect(inst(run.state, hero(run.state)).damage).toBe(3);
  });

  it("CONSTANT: only the attached enemy gains piercing: Namor (Trident on a stunned Rhino) cannot hurt a tough hero", () => {
    const placed = withNamor(namorGame());
    const stunned = patchInstance(placed.state, villainOf(placed.state), {
      statuses: { ...inst(placed.state, villainOf(placed.state)).statuses, stunned: 1 },
    });
    const { state } = attachTo(withTough(stunned, hero(stunned)), TRIDENT, villainOf(stunned));
    const run = villainPhase(state, [BLANK, BLANK, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toEqual([]);
    expect(attacksBy(run.state, run.events, NAMOR)).toMatchObject([{ baseAtk: 1 }]);
    expect(inst(run.state, hero(run.state)).damage).toBe(0);
    expect(toughOn(run.state, hero(run.state))).toBe(0);
  });

  it("CONSTANT: on Namor the Trident gives his own attack piercing: ATK 1 + 1 lands 2 on a tough hero", () => {
    const placed = withNamor(namorGame());
    const stunned = patchInstance(placed.state, villainOf(placed.state), {
      statuses: { ...inst(placed.state, villainOf(placed.state)).statuses, stunned: 1 },
    });
    const { state } = attachTo(withTough(stunned, hero(stunned)), TRIDENT, placed.id);
    const run = villainPhase(state, [BLANK, BLANK, FILLER_A]);
    expect(attacksBy(run.state, run.events, NAMOR)).toMatchObject([{ baseAtk: 2 }]);
    expect(inst(run.state, hero(run.state)).damage).toBe(2);
    expect(toughOn(run.state, hero(run.state))).toBe(0);
  });

  it("HERO ACTION: spend an energy and a physical resource, discard this card", () => {
    const placed = withNamor(namorGame());
    const { state, id } = attachTo(placed.state, TRIDENT, placed.id);
    const run = heroAction(state, id, "56161.neptunes-trident-action", ENERGY, PHYSICAL);
    expect(inPlayCard(run.state, TRIDENT)).toBeUndefined();
    expect(inDiscard(run.state, TRIDENT)).toEqual([id]);
    expect(attachedCodes(run.state, placed.id)).toEqual([]);
  });

  it("HERO ACTION: two energy resources do not pay for it; the card stays", () => {
    const placed = withNamor(namorGame());
    const { state, id } = attachTo(placed.state, TRIDENT, placed.id);
    const refused = heroActionRefused(state, id, "56161.neptunes-trident-action", ENERGY, ENERGY_2);
    expect(refused.ok).toBe(false);
    expect(attachedCodes(state, placed.id)).toEqual([TRIDENT]);
  });

  it("BOOST: 1 icon on the activating enemy's attack (Rhino ATK 2 + 1)", () => {
    const run = villainPhase(namorGame(), [TRIDENT, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
  });
});

describe("Horn of Proteus (56162)", () => {
  it("is data: an Item attachment, +1 SCH, 1 boost icon, attaches to Namor otherwise the enemy leader", () => {
    const card = dataOf(HORN);
    expect([card.type, card.statModifiers, card.boostIcons, card.traits]).toEqual([
      "attachment",
      { sch: 1 },
      1,
      [trait("ITEM")],
    ]);
    expect(card.attachesTo).toEqual({
      kind: "ifAble",
      preferred: { kind: "namedCard", name: "Namor" },
      otherwise: { kind: "leader", of: "enemy" },
    });
  });

  it("REVEALED with Namor in play it attaches to him; without Namor it attaches to the villain", () => {
    const placed = withNamor(namorGame());
    const withHim = villainPhase(placed.state, [BLANK, BLANK, HORN]);
    expect(attachedCodes(withHim.state, placed.id)).toEqual([HORN]);
    const without = villainPhase(namorGame(), [BLANK, HORN, FILLER_A]);
    expect(attachedCodes(without.state, villainOf(without.state))).toEqual([HORN]);
  });

  it("FORCED INTERRUPT: when the attached minion schemes it is given a tough status card first (Namor, SCH 1 + 1)", () => {
    const placed = withNamor(alterEgoGame());
    const { state } = attachTo(placed.state, HORN, placed.id);
    expect(toughOn(state, placed.id)).toBe(0);
    const run = villainPhase(state, [BLANK, ONE_ICON, FILLER_A]);
    expect(schemesBy(run.state, run.events, NAMOR)).toMatchObject([{ baseSch: 2, boostIcons: 1, threatPlaced: 3 }]);
    expect(toughOn(run.state, placed.id)).toBe(1);
  });

  it("FORCED INTERRUPT: the villain it is attached to gets the tough status card when he schemes", () => {
    const start = alterEgoGame();
    const { state } = attachTo(start, HORN, villainOf(start));
    const run = villainPhase(state, [BLANK, FILLER_A]);
    expect(schemesBy(run.state, run.events, RHINO)).toHaveLength(1);
    expect(toughOn(run.state, villainOf(run.state))).toBe(1);
  });

  it("FORCED INTERRUPT: not when the attached enemy attacks, and not when another enemy schemes", () => {
    const placed = withNamor(namorGame());
    const { state } = attachTo(placed.state, HORN, placed.id);
    const attacks = villainPhase(state, [BLANK, BLANK, FILLER_A]);
    expect(attacksBy(attacks.state, attacks.events, NAMOR)).toHaveLength(1);
    expect(toughOn(attacks.state, placed.id)).toBe(0);
    // Alter-ego: Rhino schemes, Namor (no Horn) schemes; the Horn sits on a Shocker instead.
    const namor = withNamor(alterEgoGame());
    const ego = engageMinion(namor.state, SHOCKER, "shocker");
    const { state: horned } = attachTo(ego, HORN, "shocker" as InstanceId);
    const schemes = villainPhase(horned, [BLANK, BLANK, BLANK_B, FILLER_A]);
    expect(schemesBy(schemes.state, schemes.events, RHINO)).toHaveLength(1);
    expect(toughOn(schemes.state, villainOf(schemes.state))).toBe(0);
    expect(toughOn(schemes.state, namor.id)).toBe(0);
  });

  it("FORCED INTERRUPT: an enemy that already has a tough status card still has just one", () => {
    const placed = withNamor(alterEgoGame());
    const { state } = attachTo(withTough(placed.state, placed.id), HORN, placed.id);
    const run = villainPhase(state, [BLANK, ONE_ICON, FILLER_A]);
    expect(toughOn(run.state, placed.id)).toBe(1);
  });

  it("HERO ACTION: spend a mental and a physical resource, discard this card", () => {
    const placed = withNamor(namorGame());
    const { state, id } = attachTo(placed.state, HORN, placed.id);
    const run = heroAction(state, id, "56162.horn-of-proteus-action", MENTAL, PHYSICAL);
    expect(inPlayCard(run.state, HORN)).toBeUndefined();
    expect(inDiscard(run.state, HORN)).toEqual([id]);
  });

  it("HERO ACTION: an energy and a physical resource do not pay for it; the card stays", () => {
    const placed = withNamor(namorGame());
    const { state, id } = attachTo(placed.state, HORN, placed.id);
    const refused = heroActionRefused(state, id, "56162.horn-of-proteus-action", ENERGY, PHYSICAL);
    expect(refused.ok).toBe(false);
    expect(attachedCodes(state, placed.id)).toEqual([HORN]);
  });

  it("BOOST: 1 icon on the activating enemy's attack (Rhino ATK 2 + 1)", () => {
    const run = villainPhase(namorGame(), [HORN, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
  });
});

describe("Imperius Rex! (56163)", () => {
  it("is data: a treachery with 1 boost icon and a star", () => {
    const card = dataOf(IMPERIUS);
    expect([card.type, card.boostIcons, card.starIcon, card.keywords]).toEqual(["treachery", 1, true, []]);
  });

  it("WHEN REVEALED with Namor in play: he activates again against you (two attacks by Namor, one by Rhino)", () => {
    const placed = withNamor(namorGame());
    // Rhino's boost; Namor's own activation boost; Imperius Rex! dealt; Namor's second activation boost.
    const run = villainPhase(placed.state, [BLANK, BLANK, IMPERIUS, ONE_ICON, FILLER_A]);
    expect(attacksBy(run.state, run.events, NAMOR)).toMatchObject([
      { baseAtk: 1, boostIcons: 0, damageDealt: 1 },
      { baseAtk: 1, boostIcons: 1, damageDealt: 2 },
    ]);
    expect(attacksBy(run.state, run.events, RHINO)).toHaveLength(1);
    expect(inDiscard(run.state, IMPERIUS)).toHaveLength(1);
  });

  it("WHEN REVEALED with Namor in play and an alter-ego player: he schemes instead", () => {
    const placed = withNamor(alterEgoGame());
    const run = villainPhase(placed.state, [BLANK, BLANK, IMPERIUS, ONE_ICON, FILLER_A]);
    expect(schemesBy(run.state, run.events, NAMOR)).toMatchObject([
      { baseSch: 1, boostIcons: 0, threatPlaced: 1 },
      { baseSch: 1, boostIcons: 1, threatPlaced: 2 },
    ]);
    expect(schemesBy(run.state, run.events, RHINO)).toHaveLength(1);
  });

  it("WHEN REVEALED with Namor not in play: the enemy leader (Rhino) activates against you, once more than usual", () => {
    // Rhino's boost; Imperius Rex! dealt; Rhino's second activation boost.
    const run = villainPhase(namorGame(), [BLANK, IMPERIUS, ONE_ICON, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([
      { baseAtk: 2, boostIcons: 0, damageDealt: 2 },
      { baseAtk: 2, boostIcons: 1, damageDealt: 3 },
    ]);
    expect(attacksBy(run.state, run.events, NAMOR)).toEqual([]);
    expect(inPlayCard(run.state, NAMOR)).toBeUndefined();
  });

  it("WHEN REVEALED does not bring Namor into play", () => {
    const run = villainPhase(namorGame(), [BLANK, IMPERIUS, BLANK, FILLER_A]);
    expect(inPlayCard(run.state, NAMOR)).toBeUndefined();
  });

  it("BOOST: the activating enemy gets an additional boost card (Rhino turns two: 1 icon from this card, 1 from the next)", () => {
    const run = villainPhase(namorGame(), [IMPERIUS, ONE_ICON, FILLER_A]);
    expect(flips(run.events)).toBe(2);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 2, damageDealt: 4 }]);
  });

  it("BOOST: on Namor's activation it is Namor who gets the additional card", () => {
    const placed = withNamor(namorGame());
    // Rhino's boost; Namor's boost is Imperius Rex!, then his additional card.
    const run = villainPhase(placed.state, [BLANK, IMPERIUS, ONE_ICON, FILLER_A]);
    expect(flips(run.events)).toBe(3);
    expect(attacksBy(run.state, run.events, NAMOR)).toMatchObject([{ baseAtk: 1, boostIcons: 2, damageDealt: 3 }]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ boostIcons: 0 }]);
  });
});

describe("Ruler of Atlantis (56164)", () => {
  it("is data: a side scheme with 3 threat (none per player), an amplify icon, 2 boost icons and Hinder 1 per hero", () => {
    const card = dataOf(RULER);
    expect([card.type, card.startingThreat, card.amplifyIcons, card.boostIcons, card.keywords]).toEqual([
      "side_scheme",
      { base: 3, perPlayer: 0 },
      1,
      2,
      [{ name: "hinder", value: 0, perPlayer: 1 }],
    ]);
  });

  it("REVEALED it enters play with 3 threat plus 1 for Hinder (one hero)", () => {
    const run = villainPhase(namorGame(), [BLANK, RULER, FILLER_A]);
    expect(inst(run.state, inPlayCard(run.state, RULER)!).threat).toBe(4);
  });

  it("CONSTANT: Namor, an Atlantis minion, cannot take damage: an attack on him is refused (control: without it he takes 2)", () => {
    const placed = withNamor(namorGame());
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

  it("CONSTANT: a minion without the Atlantis trait and the villain still take damage", () => {
    const withShocker = engageMinion(namorGame(), SHOCKER, "shocker");
    const { state } = encounterCardInVillainArea(withShocker, RULER, 4);
    const shocker = heroAttacks(WAVE10_DEPS, state, "shocker" as InstanceId);
    expect(inst(shocker.state, "shocker" as InstanceId).damage).toBe(2);
    const villain = heroAttacks(WAVE10_DEPS, encounterCardInVillainArea(namorGame(), RULER, 4).state, villainOf(state));
    expect(inst(villain.state, villainOf(villain.state)).damage).toBe(2);
  });

  it("CONSTANT: once Ruler of Atlantis is gone Namor takes damage again", () => {
    const placed = withNamor(namorGame());
    const { state, id } = encounterCardInVillainArea(placed.state, RULER, 4);
    const gone = patchInstance(state, id, { threat: 0 });
    const cleared: GameState = { ...gone, villainArea: gone.villainArea.filter((i) => i !== id) };
    const run = heroAttacks(WAVE10_DEPS, cleared, placed.id);
    expect(inst(run.state, placed.id).damage).toBe(2);
  });

  it("BOOST: 2 icons on the activating enemy's attack (Rhino ATK 2 + 2)", () => {
    const run = villainPhase(namorGame(), [RULER, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 2, damageDealt: 4 }]);
  });
});
