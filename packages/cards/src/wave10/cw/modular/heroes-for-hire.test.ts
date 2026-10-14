import { CW_CARDS } from "@mc/content";
import {
  activeEncounterDeckId,
  applyCommand,
  SINGLE_TEAM,
  traitsOf,
  type EngineDeps,
  type GameState,
  type InstanceId,
  type PendingChoice,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { constant, forcedResponse, gainsTrait, on } from "../../../dsl/abilities.js";
import { dealDamage } from "../../../dsl/effects.js";
import { defineAbilities, validateDefinition } from "../../../dsl/validate.js";
import { grantedTo, query } from "../../../dsl/values.js";
import {
  P1,
  P2,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  instancesOf,
  patchInstance,
  stackEncounterDeck,
  use,
} from "../../../testing/harness.js";
import { driveEventsPicking, withForm } from "../../../testing/staging.js";
import { codeOf, piles, revealedCodes, types, without } from "../../../wave9/testing.js";
import { WAVE10_CARDS } from "../../cards.js";
import { IRON_MAN_SCENARIO, WAVE10_DEPS, civilWarHeroGame, stagedInPlay } from "../../testing.js";
import {
  MODULAR_CAPE_KILLER,
  UNREGISTERED,
  UNREGISTERED_SUPER_ACTION,
  UNREGISTERED_SUPER_CONSTANT,
} from "./cape-killer.js";
import { BOUNTY_HUNTING, MODULAR_HEROES_FOR_HIRE, MODULAR_HEROES_FOR_HIRE_SKIPPED } from "./heroes-for-hire.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * The Heroes for Hire modular set (56112 Colleen Wing, 56113 Shang-Chi, 56114 Unregistered Super, 56115 Bounty
 * Hunting, 56116 Heroes for Hire), docs/phase7-wave10.md sections 3.5, 3.16 and 3.23. Every test is a real game in the
 * `registration-iron-man` scenario with Cape-Killer, Heroes for Hire and Paladin as its modular sets, seated with the
 * Tigra precon (and the Core Spider-Man deck with `twoPlayers`). Iron Man's attachments and his side scheme Stark Tower
 * (a hazard icon, which would deal one more card) are taken off by `game`, so his activation is ATK 1 and SCH 1 and a
 * villain phase deals exactly one card to each player. Iron Man activates once against each player, drawing a boost
 * card each time (Advance, then Assault: no icon, no ability), so a stack reads "boost cards, then the dealt cards in
 * turn order". Where "the enemy team" chooses, player 2 is the first player and player 1 the revealing one.
 */
const COLLEEN = "56112";
const SHANG_CHI = "56113";
const SUPER = "56106";
const SUPER_B = "56114";
const BOUNTY = "56115";
const HEROES = "56116";
const ARREST = "56108"; // a side scheme with a crisis icon: enters play, does nothing else
const ADVANCE = "01186";
const ASSAULT = "01187";
const MOON_KNIGHT = "56002"; // Tigra's ally
const TWO_GUN_KID = "56010"; // an Aggression ally
const AMULET = "56004"; // identity-specific upgrades
const SHARP_CLAWS = "56005";
const SETS = ["cape_killer", "heroes_for_hire", "paladin"];
const REFS = [
  "56112.when-revealed",
  "56113.when-revealed",
  "56114.unregistered-super-constant",
  "56114.unregistered-super-action",
  "56115.when-revealed",
  "56116.when-defeated",
];
const HUNTING = "56097b";
/** The printed resource icons of the Tigra cards in the starting hand. */
const ICONS: Readonly<Record<string, number>> = { "56007": 1, "56008": 1, "56013": 1, "56014": 1, "56022": 2 };

const dataOf = (code: string) => CW_CARDS.find((c) => (c.id as string) === code)! as unknown as Record<string, unknown>;
const leaderOf = (s: GameState): InstanceId => s.activeVillainId!;
const hero = (s: GameState, player: PlayerId = P1) => identityOf(s, player);
const hasTrait = (s: GameState, id: InstanceId) => traitsOf(s, id, WAVE10_DEPS).includes(UNREGISTERED);
const playArea = (s: GameState, player: PlayerId = P1) => s.players.find((p) => p.playerId === player)!.playArea;
const handOf = (s: GameState, player: PlayerId = P1) => s.players.find((p) => p.playerId === player)!.hand;
const discardOf = (s: GameState, player: PlayerId = P1) => s.players.find((p) => p.playerId === player)!.discard;
const copiesIn = (s: GameState, code: string) => instancesOf(s, code);
const deckCodes = (s: GameState) => piles(s).deck.map((i) => codeOf(s, i));

/** The scenario past setup in hero form, with every attachment taken off Iron Man (and his tough card) and Stark Tower gone. */
function game(
  opts: {
    readonly twoPlayers?: boolean;
    readonly sets?: string[];
    readonly seed?: number;
    readonly p2First?: boolean;
  } = {},
): GameState {
  const start = civilWarHeroGame(IRON_MAN_SCENARIO, {
    modularSetIds: opts.sets ?? SETS,
    ...(opts.seed ? { seed: opts.seed } : {}),
    ...(opts.p2First ? { firstPlayerIndex: 1 } : {}),
    ...(opts.twoPlayers ? { twoPlayers: true } : {}),
  });
  const iron = leaderOf(start);
  let current = patchInstance(start, iron, { attachments: [], statuses: { ...inst(start, iron).statuses, tough: 0 } });
  const deckId = activeEncounterDeckId(current);
  const pile = current.encounterDecks[deckId]!;
  const old = inst(start, iron).attachments;
  for (const id of old) current = patchInstance(current, id, { attachedTo: null });
  current = {
    ...current,
    encounterDecks: { ...current.encounterDecks, [deckId]: { deck: pile.deck, discard: [...old, ...pile.discard] } },
    villainArea: current.villainArea.filter((i) => codeOf(current, i) !== "56072"),
  };
  const heroes = opts.twoPlayers ? withForm(current, { heroForm: 0 }, P2) : current;
  // The hero hand size is 5: a hand of 6 would be a forced discard at the end of the turn, one of 4 a draw.
  return {
    ...heroes,
    players: heroes.players.map((p) => ({ ...p, hand: p.hand.slice(0, 5), deck: [...p.hand.slice(5), ...p.deck] })),
  };
}

/** Surgery: `code`'s first copy in the encounter deck moved into `player`'s play area, faceup (an obligation revealed to them). */
function inPlayAreaOf(state: GameState, code: string, player: PlayerId = P1): GameState {
  const deckId = activeEncounterDeckId(state);
  const pile = state.encounterDecks[deckId]!;
  const id = pile.deck.find((i) => codeOf(state, i) === code)!;
  return {
    ...state,
    encounterDecks: { ...state.encounterDecks, [deckId]: { ...pile, deck: pile.deck.filter((i) => i !== id) } },
    players: state.players.map((p) => (p.playerId === player ? { ...p, playArea: [...p.playArea, id] } : p)),
    instances: { ...state.instances, [id]: { ...state.instances[id]!, faceup: true } },
  };
}
const superOf = (s: GameState, player: PlayerId = P1) =>
  playArea(s, player).find((i) => ["56106", "56114"].includes(codeOf(s, i)))!;

/** The players in turn order, from the first player. */
function seats(state: GameState): PlayerId[] {
  const at = state.players.findIndex((p) => p.playerId === state.firstPlayerId);
  return [...state.players.slice(at), ...state.players.slice(0, at)].map((p) => p.playerId);
}

const FILLERS = [ADVANCE, ASSAULT];
/** Every player ends the turn and the villain phase runs; `dealt` are the cards dealt in turn order (see the header). */
const villainPhase = (state: GameState, pick = firstLegal, ...dealt: string[]) =>
  driveEventsPicking(
    WAVE10_DEPS,
    stackEncounterDeck(state, ...FILLERS.slice(0, state.players.length), ...dealt),
    pick,
    ...seats(state).map((p) => endTurn(p)),
  );

/** A picker that answers a prompt offering `code`'s card with it, and records every prompt it was asked. */
function choosing(code: string, asked: PendingChoice[] = [], states: GameState[] = []) {
  return (s: GameState): readonly string[] => {
    const choice = s.pendingChoice!;
    // Only the effect's own prompt: a defender or the hand-size discard also list these cards.
    if (!["chooseTarget", "chooseCards"].includes(choice.prompt.kind)) return firstLegal(s);
    const option = choice.options.find((o) => o.ref.kind === "card" && codeOf(s, o.ref.instanceId) === code);
    if (!option) return firstLegal(s);
    asked.push(choice);
    states.push(s);
    return [option.optionId];
  };
}

const thwart = (state: GameState, scheme: InstanceId, player: PlayerId = P1) =>
  driveEventsPicking(WAVE10_DEPS, state, firstLegal, ...(player === P1 ? [] : [endTurn(P1)]), {
    type: "basicThwart",
    playerId: player,
    thwarterInstanceId: hero(state, player),
    schemeInstanceId: scheme,
  });

const dealtTo = (events: readonly import("@mc/engine").GameEvent[], state: GameState) =>
  types(events, "cardMoved")
    .filter((e) => e.to.kind === "dealtEncounter")
    .map((e) => [codeOf(state, e.instanceId), (e.to as { playerId: string }).playerId]);

describe("registry", () => {
  it("registers the six refs of the five cards, each a valid definition, and skips nothing", () => {
    expect(Object.keys(MODULAR_HEROES_FOR_HIRE).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(MODULAR_HEROES_FOR_HIRE)) expect(validateDefinition(def), id).toEqual([]);
    expect(MODULAR_HEROES_FOR_HIRE_SKIPPED).toEqual({});
  });

  it("the data names exactly these refs for the five cards", () => {
    const refs = [COLLEEN, SHANG_CHI, SUPER_B, BOUNTY, HEROES].flatMap((c) =>
      ((dataOf(c).abilities ?? []) as { id: string }[]).map((a) => a.id),
    );
    expect(refs.sort()).toEqual([...REFS].sort());
  });

  it("carries the printed timing of each ability", () => {
    const reg = MODULAR_HEROES_FOR_HIRE;
    for (const ref of ["56112.when-revealed", "56113.when-revealed", "56115.when-revealed"])
      expect(reg[ref]!.trigger, ref).toMatchObject({ kind: "whenRevealed" });
    expect(reg["56114.unregistered-super-constant"]!.trigger).toMatchObject({ kind: "constant" });
    expect(reg["56114.unregistered-super-action"]!.trigger).toMatchObject({ kind: "action", form: "alterEgo" });
    expect(reg["56116.when-defeated"]!.trigger).toMatchObject({ kind: "whenDefeated" });
  });

  it("56114 is Cape-Killer's Unregistered Super 56106 and 56115 is the one Bounty Hunting definition, the shared copies", () => {
    expect(MODULAR_HEROES_FOR_HIRE["56114.unregistered-super-constant"]).toBe(UNREGISTERED_SUPER_CONSTANT);
    expect(MODULAR_HEROES_FOR_HIRE["56114.unregistered-super-action"]).toBe(UNREGISTERED_SUPER_ACTION);
    expect(MODULAR_CAPE_KILLER["56106.unregistered-super-constant"]).toBe(UNREGISTERED_SUPER_CONSTANT);
    expect(MODULAR_HEROES_FOR_HIRE["56115.when-revealed"]).toBe(BOUNTY_HUNTING);
  });

  it("setup: the encounter deck holds one copy of each card", () => {
    const s = game();
    expect([COLLEEN, SHANG_CHI, SUPER_B, BOUNTY, HEROES].map((c) => copiesIn(s, c).length)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("Colleen Wing (56112)", () => {
  /** Player 1 controls Moon Knight and Two-Gun Kid. */
  function withAllies(state: GameState) {
    const moon = stagedInPlay(state, MOON_KNIGHT);
    const kid = stagedInPlay(moon.state, TWO_GUN_KID);
    return { state: kid.state, moon: moon.id, kid: kid.id };
  }

  it("is data: a unique Hero for Hire minion, ATK 2, SCH 1, 3 hit points and 2 boost icons", () => {
    const card = dataOf(COLLEEN);
    expect([card.type, card.atk, card.sch, card.hp, card.boostIcons, card.unique]).toEqual([
      "minion",
      2,
      1,
      3,
      2,
      true,
    ]);
  });

  it("WHEN REVEALED: you choose an ally you control, and it is discarded; the other stays", () => {
    const { state, moon, kid } = withAllies(game());
    const asked: PendingChoice[] = [];
    const run = villainPhase(state, choosing(TWO_GUN_KID, asked), COLLEEN);
    expect(asked.map((c) => [c.playerId, c.authority])).toEqual([[P1, "player"]]);
    expect(asked[0]!.options.map((o) => o.optionId).sort()).toEqual([moon, kid].sort());
    expect(discardOf(run.state)).toContain(kid);
    expect(playArea(run.state)).not.toContain(kid);
    expect(playArea(run.state)).toContain(moon);
    expect(revealedCodes(run.state, run.events)).toEqual([COLLEEN]);
    expect(inst(run.state, instancesOf(run.state, COLLEEN)[0]!)).toMatchObject({ engagedWith: P1, faceup: true });
  });

  it("WHEN REVEALED with the Unregistered trait: the first player chooses for the enemy team, in a prompt marked as theirs", () => {
    const { state, moon, kid } = withAllies(inPlayAreaOf(game({ twoPlayers: true, p2First: true }), SUPER));
    expect(hasTrait(state, hero(state))).toBe(true);
    const asked: PendingChoice[] = [];
    const states: GameState[] = [];
    const run = villainPhase(state, choosing(MOON_KNIGHT, asked, states), ARREST, COLLEEN);
    expect(asked).toHaveLength(1);
    const choice = asked[0]!;
    expect([choice.playerId, choice.authority]).toEqual([P2, "enemyTeam"]);
    expect(choice.onBehalfOf).toEqual({ kind: "enemyTeam", teamId: SINGLE_TEAM, facingPlayerId: P1 });
    expect(choice.options.map((o) => o.optionId).sort()).toEqual([moon, kid].sort());
    // The revealing player is refused; the first player's pick discards that ally.
    const refused = applyCommand(
      states[0]!,
      { type: "resolveChoice", playerId: P1, choiceId: choice.choiceId, selectedOptionIds: [moon] },
      WAVE10_DEPS,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.message).toBe("p2 must make this choice");
    expect(discardOf(run.state)).toContain(moon);
    expect(playArea(run.state)).toContain(kid);
  });

  it("WHEN REVEALED: only the revealing player's allies are offered, and with none nothing is discarded", () => {
    const start = withAllies(game({ twoPlayers: true, p2First: true })).state;
    const mine = villainPhase(start, firstLegal, ARREST, COLLEEN);
    // Player 2 (first player) is dealt Arrest Order; player 1 reveals Colleen and chooses between their own two allies.
    expect(discardOf(mine.state).filter((i) => ["56002", "56010"].includes(codeOf(mine.state, i)))).toHaveLength(1);
    const none = villainPhase(game(), firstLegal, COLLEEN);
    expect(types(none.events, "cardDiscardedFromPlay")).toEqual([]);
    expect(inst(none.state, instancesOf(none.state, COLLEEN)[0]!).engagedWith).toBe(P1);
  });

  it("WHEN REVEALED with the Unregistered trait and no ally: there is nothing to choose, so no prompt", () => {
    const asked: PendingChoice[] = [];
    const run = villainPhase(
      inPlayAreaOf(game({ twoPlayers: true, p2First: true }), SUPER),
      choosing(MOON_KNIGHT, asked),
      ARREST,
      COLLEEN,
    );
    expect(asked).toEqual([]);
    expect(types(run.events, "cardDiscardedFromPlay")).toEqual([]);
  });
});

describe("Shang-Chi (56113)", () => {
  /** Cat's Head Amulet and Sharp Claws attached to player 1's identity. */
  function withUpgrades(state: GameState) {
    const a = stagedInPlay(state, AMULET, { attach: true });
    const b = stagedInPlay(a.state, SHARP_CLAWS, { attach: true });
    return { state: b.state, amulet: a.id, claws: b.id };
  }

  it("is data: a unique Hero for Hire minion, ATK 2, SCH 2, 4 hit points and 2 boost icons", () => {
    const card = dataOf(SHANG_CHI);
    expect([card.type, card.atk, card.sch, card.hp, card.boostIcons, card.unique]).toEqual([
      "minion",
      2,
      2,
      4,
      2,
      true,
    ]);
  });

  it("WHEN REVEALED: you choose an upgrade you control, and it is discarded; the other stays", () => {
    const { state, amulet, claws } = withUpgrades(game());
    const asked: PendingChoice[] = [];
    const run = villainPhase(state, choosing(SHARP_CLAWS, asked), SHANG_CHI);
    expect(asked.map((c) => [c.playerId, c.authority])).toEqual([[P1, "player"]]);
    expect(asked[0]!.options.map((o) => o.optionId).sort()).toEqual([amulet, claws].sort());
    expect(inst(run.state, hero(run.state)).attachments).toEqual([amulet]);
    expect(discardOf(run.state)).toContain(claws);
    expect(revealedCodes(run.state, run.events)).toEqual([SHANG_CHI]);
  });

  it("WHEN REVEALED with the Unregistered trait: the first player chooses for the enemy team", () => {
    const { state, amulet, claws } = withUpgrades(inPlayAreaOf(game({ twoPlayers: true, p2First: true }), SUPER));
    const asked: PendingChoice[] = [];
    const run = villainPhase(state, choosing(AMULET, asked), ARREST, SHANG_CHI);
    expect(asked).toHaveLength(1);
    expect([asked[0]!.playerId, asked[0]!.authority]).toEqual([P2, "enemyTeam"]);
    expect(asked[0]!.onBehalfOf).toEqual({ kind: "enemyTeam", teamId: SINGLE_TEAM, facingPlayerId: P1 });
    expect(asked[0]!.options.map((o) => o.optionId).sort()).toEqual([amulet, claws].sort());
    expect(inst(run.state, hero(run.state)).attachments).toEqual([claws]);
    expect(discardOf(run.state)).toContain(amulet);
  });

  it("WHEN REVEALED with no upgrade: nothing is discarded", () => {
    const run = villainPhase(game(), firstLegal, SHANG_CHI);
    expect(types(run.events, "cardDiscardedFromPlay")).toEqual([]);
    expect(inst(run.state, instancesOf(run.state, SHANG_CHI)[0]!).engagedWith).toBe(P1);
  });
});

describe("Unregistered Super (56114, the same card as 56106)", () => {
  it("is data: an obligation with one acceleration icon and 1 boost icon, as 56106", () => {
    const card = dataOf(SUPER_B);
    expect([card.type, card.schemeIcons, card.boostIcons]).toEqual(["obligation", ["acceleration"], 1]);
  });

  it("CONSTANT: revealed, it stays in the revealing player's area and their identity (only theirs) gains the trait", () => {
    const start = game({ twoPlayers: true });
    expect([P1, P2].map((p) => hasTrait(start, hero(start, p)))).toEqual([false, false]);
    const run = villainPhase(start, firstLegal, SUPER_B, ARREST);
    expect(codeOf(run.state, superOf(run.state))).toBe(SUPER_B);
    expect([P1, P2].map((p) => hasTrait(run.state, hero(run.state, p)))).toEqual([true, false]);
  });

  it("CONSTANT: its acceleration icon adds 1 to step one of the villain phase", () => {
    const stepOne = (state: GameState) => {
      const run = villainPhase(state, firstLegal, ARREST);
      return types(run.events, "threatPlaced").find((e) => e.schemeInstanceId === state.mainScheme.instanceId)!.amount;
    };
    const base = game();
    expect(stepOne(inPlayAreaOf(base, SUPER_B))).toBe(stepOne(base) + 1);
  });

  it("CONSTANT: a revealed 56114 is heard as a card that gives a hero the trait (Hunting Rebel Heroes' response)", () => {
    const start = game({ twoPlayers: true });
    const card = WAVE10_CARDS.find((c) => c.id === start.mainScheme.cardId);
    if (card?.type !== "main_scheme") throw new Error("no main scheme card");
    const stageIndex = card.stages.findIndex((stage) => (stage.printedCardId as string | undefined) === HUNTING);
    expect(stageIndex).toBeGreaterThanOrEqual(0);
    const scripts = defineAbilities({
      "56097b.hunting-rebel-heroes-constant": constant(gainsTrait(UNREGISTERED, query("hero"))),
      "56097b.hunting-rebel-heroes-forced-response": forcedResponse(
        on.cardRevealedGranting(UNREGISTERED, { to: query("hero"), another: true }),
        dealDamage(2, grantedTo(UNREGISTERED, query("hero"))),
      ),
    });
    const deps: EngineDeps = { ...WAVE10_DEPS, abilities: { ...WAVE10_DEPS.abilities, ...scripts } };
    const staged = stackEncounterDeck(
      { ...start, mainScheme: { ...start.mainScheme, stageIndex } },
      ADVANCE,
      ASSAULT,
      SUPER_B,
      ARREST,
    );
    const run = driveEventsPicking(deps, staged, firstLegal, ...seats(staged).map((p) => endTurn(p)));
    const fromScheme = types(run.events, "damageDealt")
      .filter((e) => e.sourceInstanceId === run.state.mainScheme.instanceId)
      .map((e) => [e.targetInstanceId, e.amount]);
    expect(fromScheme).toEqual([[hero(run.state, P1), 2]]);
  });

  it("ALTER-EGO ACTION: discarding an identity-specific card from hand discards the card and the obligation", () => {
    const start = inPlayAreaOf(withForm(game(), "alterEgo"), SUPER_B);
    const id = superOf(start);
    const card = handOf(start).find((i) => codeOf(start, i) === "56008")!;
    const result = applyCommand(
      start,
      use(P1, id, "56114.unregistered-super-action", [], { discard: [card] }),
      WAVE10_DEPS,
    );
    if (!result.ok) throw new Error(result.error.message);
    const after = driveEventsPicking(WAVE10_DEPS, result.state, firstLegal).state;
    expect(playArea(after)).not.toContain(id);
    expect(discardOf(after)).toContain(card);
    expect(piles(after).discard).toContain(id);
    expect(hasTrait(after, hero(after))).toBe(false);
  });

  it("ALTER-EGO ACTION: a card that is not identity-specific cannot pay", () => {
    const start = inPlayAreaOf(withForm(game(), "alterEgo"), SUPER_B);
    const aggression = handOf(start).find((i) => codeOf(start, i) === "56014")!;
    const refused = applyCommand(
      start,
      use(P1, superOf(start), "56114.unregistered-super-action", [], { discard: [aggression] }),
      WAVE10_DEPS,
    );
    expect(refused.ok).toBe(false);
  });
});

describe("Bounty Hunting (56115, the same card as 56119)", () => {
  /** The threat the revealed Bounty Hunting placed on the main scheme (the card's own placements, as source). */
  const placedBy = (state: GameState, events: readonly import("@mc/engine").GameEvent[]) => {
    const id = instancesOf(state, BOUNTY)[0]!;
    return types(events, "threatPlaced")
      .filter((e) => e.sourceInstanceId === id)
      .map((e) => e.amount);
  };

  it("is data: a treachery with 1 boost icon", () => {
    const card = dataOf(BOUNTY);
    expect([card.type, card.boostIcons]).toEqual(["treachery", 1]);
  });

  it("WHEN REVEALED: you choose the card to discard, and its printed resource icons (2 for Strength) are the threat", () => {
    const start = game();
    const strength = handOf(start).find((i) => codeOf(start, i) === "56022")!;
    const asked: PendingChoice[] = [];
    const run = villainPhase(start, choosing("56022", asked), BOUNTY);
    expect(asked.map((c) => [c.playerId, c.authority])).toEqual([[P1, "player"]]);
    expect(asked[0]!.options).toHaveLength(5);
    expect(discardOf(run.state)).toContain(strength);
    expect(handOf(run.state)).toHaveLength(4);
    expect(placedBy(run.state, run.events)).toEqual([2]);
  });

  it("WHEN REVEALED: a card with one icon places 1 threat", () => {
    const start = game();
    const claw = handOf(start).find((i) => codeOf(start, i) === "56007")!;
    const run = villainPhase(start, choosing("56007"), BOUNTY);
    expect(discardOf(run.state)).toContain(claw);
    expect(placedBy(run.state, run.events)).toEqual([1]);
  });

  it("WHEN REVEALED with the Unregistered trait: a random card is discarded with no choice, and its icons are the threat", () => {
    const start = inPlayAreaOf(game(), SUPER);
    const before = handOf(start);
    const asked: string[] = [];
    const run = villainPhase(
      start,
      (s) => {
        asked.push(`${s.pendingChoice!.prompt.kind}`);
        return firstLegal(s);
      },
      BOUNTY,
    );
    expect(asked.filter((k) => k === "chooseCards")).toEqual([]);
    const gone = before.filter((i) => !handOf(run.state).includes(i));
    expect(gone).toHaveLength(1);
    expect(discardOf(run.state)).toContain(gone[0]);
    expect(placedBy(run.state, run.events)).toEqual([ICONS[codeOf(run.state, gone[0]!)]!]);
  });

  it("WHEN REVEALED with the Unregistered trait: a different seed can discard a different card (it is the game's random)", () => {
    const picks = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const start = inPlayAreaOf(game({ seed }), SUPER);
      const run = villainPhase(start, firstLegal, BOUNTY);
      const gone = handOf(start).filter((i) => !handOf(run.state).includes(i));
      expect(gone).toHaveLength(1);
      picks.add(codeOf(run.state, gone[0]!));
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it("WHEN REVEALED with an empty hand: nothing is discarded and no threat is placed", () => {
    const start = game();
    const emptied = {
      ...start,
      players: start.players.map((p) => ({ ...p, hand: [], deck: [], discard: [] })),
    };
    const run = villainPhase(emptied, firstLegal, BOUNTY);
    expect(placedBy(run.state, run.events).reduce((a, b) => a + b, 0)).toBe(0);
    expect(piles(run.state).discard.map((i) => codeOf(run.state, i))).toContain(BOUNTY);
  });
});

describe("Heroes for Hire (56116)", () => {
  /** Heroes for Hire in play with 1 threat. */
  function withScheme(state: GameState) {
    const deckId = activeEncounterDeckId(state);
    const pile = piles(state);
    const scheme = pile.deck.find((i) => codeOf(state, i) === HEROES)!;
    return {
      scheme,
      state: {
        ...state,
        encounterDecks: { ...state.encounterDecks, [deckId]: { ...pile, deck: pile.deck.filter((i) => i !== scheme) } },
        villainArea: [...state.villainArea, scheme],
        instances: { ...state.instances, [scheme]: { ...state.instances[scheme]!, threat: 1, faceup: true } },
      } as GameState,
    };
  }

  it("is data: a side scheme with 3 threat, a hazard icon, Hinder 1 per hero and 2 boost icons", () => {
    const card = dataOf(HEROES);
    expect([card.type, card.startingThreat, card.icons, card.keywords, card.boostIcons]).toEqual([
      "side_scheme",
      { base: 3, perPlayer: 0 },
      ["hazard"],
      [{ name: "hinder", value: 0, perPlayer: 1 }],
      2,
    ]);
  });

  it("WHEN DEFEATED: the enemy team deals the defeating player a copy of Unregistered Super (no prompt: the copies are one card)", () => {
    const { state, scheme } = withScheme(game());
    const done = thwart(state, scheme);
    expect(types(done.events, "schemeDefeated").map((e) => e.instanceId)).toEqual([scheme]);
    const dealt = dealtTo(done.events, done.state);
    expect(dealt).toHaveLength(1);
    expect([SUPER, SUPER_B]).toContain(dealt[0]![0]);
    expect(dealt[0]![1]).toBe(P1);
    // The other printing stays in the encounter deck; the dealt one is no longer in it.
    const other = dealt[0]![0] === SUPER ? SUPER_B : SUPER;
    expect(deckCodes(done.state)).toContain(other);
    expect(deckCodes(done.state)).not.toContain(dealt[0]![0]);
    // It is revealed in the villain phase and stays in their area, giving the trait.
    const reset = patchInstance(done.state, done.state.mainScheme.instanceId, { threat: 0 });
    const next = villainPhase(reset, firstLegal, ARREST);
    expect(revealedCodes(next.state, next.events)).toEqual([dealt[0]![0], ARREST]);
    expect(hasTrait(next.state, hero(next.state))).toBe(true);
  });

  it("WHEN DEFEATED by player 2: that player is dealt it", () => {
    const { state, scheme } = withScheme(game({ twoPlayers: true }));
    const done = thwart(state, scheme, P2);
    const dealt = dealtTo(done.events, done.state);
    expect(dealt.map(([, to]) => to)).toEqual([P2]);
    expect([SUPER, SUPER_B]).toContain(dealt[0]![0]);
  });

  it("WHEN DEFEATED with no copy of Unregistered Super in the deck or discard pile: nothing is dealt", () => {
    const { state, scheme } = withScheme(game());
    const gone = without(without(state, SUPER), SUPER_B);
    const done = thwart(gone, scheme);
    expect(types(done.events, "schemeDefeated").map((e) => e.instanceId)).toEqual([scheme]);
    expect(dealtTo(done.events, done.state)).toEqual([]);
  });
});
