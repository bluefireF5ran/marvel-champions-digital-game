import { CW_CARDS } from "@mc/content";
import {
  activeEncounterDeckId,
  applyCommand,
  traitsOf,
  type EngineDeps,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { validateDefinition } from "../../../dsl/validate.js";
import { constant, forcedResponse, gainsTrait, on } from "../../../dsl/abilities.js";
import { dealDamage } from "../../../dsl/effects.js";
import { defineAbilities } from "../../../dsl/validate.js";
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
  type Picker,
} from "../../../testing/harness.js";
import { driveEventsPicking, withForm } from "../../../testing/staging.js";
import { attacksBy, codeOf, piles, revealedCodes, types, without } from "../../../wave9/testing.js";
import { WAVE10_CARDS } from "../../cards.js";
import { IRON_MAN_SCENARIO, WAVE10_DEPS, civilWarHeroGame } from "../../testing.js";
import {
  MODULAR_CAPE_KILLER,
  MODULAR_CAPE_KILLER_SKIPPED,
  UNREGISTERED,
  UNREGISTERED_SUPER_ACTION,
  UNREGISTERED_SUPER_CONSTANT,
} from "./cape-killer.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * The Cape-Killer modular set (56105 Cape-Killer x2, 56106 Unregistered Super, 56107 Bring Them In, 56108 Arrest
 * Order), docs/phase7-wave10.md sections 3.5, 3.16 and 3.23. Every test is a real game in the `registration-iron-man`
 * scenario with Cape-Killer, Heroes for Hire and Paladin as its modular sets (so two copies of Unregistered Super, 56106
 * and 56114, are in the encounter deck), seated with the Tigra precon (and the Core Spider-Man deck with `twoPlayers`).
 * Iron Man's attachments and his side scheme Stark Tower (a hazard icon, which would deal one more card) are taken off
 * by `game`, so his activation is ATK 1 and SCH 1 and a villain phase deals exactly one card to each player. Iron Man
 * activates once against each player, drawing a boost card each time (Advance, then Assault: no icon, no ability), so a
 * stack reads "boost cards, then the dealt cards in turn order".
 */
const CAPE = "56105";
const SUPER = "56106";
const SUPER_B = "56114";
const BRING = "56107";
const ARREST = "56108";
const COLLEEN = "56112"; // a Hero for Hire minion, not S.H.I.E.L.D.
const BOUNTY = "56115"; // Bounty Hunting: discards a card and adds threat, nothing that touches a minion
const ADVANCE = "01186"; // a Core treachery with no boost icon and no boost ability
const SETS = ["cape_killer", "heroes_for_hire", "paladin"];
const REFS = [
  "56105.cape-killer-forced-interrupt",
  "56106.unregistered-super-constant",
  "56106.unregistered-super-action",
  "56107.when-revealed",
  "56108.when-defeated",
];
const TOOTH_AND_CLAW = "56008"; // Tigra event, identity-specific, 1 printed resource
const SUPPRESSING_FIRE = "56014"; // an Aggression card: not identity-specific
const HUNTING = "56097b";

const dataOf = (code: string) => CW_CARDS.find((c) => (c.id as string) === code)! as unknown as Record<string, unknown>;
const leaderOf = (s: GameState): InstanceId => s.activeVillainId!;
const hero = (s: GameState, player: PlayerId = P1) => identityOf(s, player);
const hasTrait = (s: GameState, id: InstanceId) => traitsOf(s, id, WAVE10_DEPS).includes(UNREGISTERED);
const playArea = (s: GameState, player: PlayerId = P1) => s.players.find((p) => p.playerId === player)!.playArea;
const handOf = (s: GameState, player: PlayerId = P1) => s.players.find((p) => p.playerId === player)!.hand;
const discardOf = (s: GameState, player: PlayerId = P1) => s.players.find((p) => p.playerId === player)!.discard;
const copiesIn = (s: GameState, code: string) => instancesOf(s, code);

/** The scenario past setup in hero form, with every attachment taken off Iron Man (and his tough card). */
function game(opts: { readonly twoPlayers?: boolean; readonly sets?: string[] } = {}): GameState {
  const start = civilWarHeroGame(IRON_MAN_SCENARIO, {
    modularSetIds: opts.sets ?? SETS,
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
  };
  // Iron Man's side scheme Stark Tower (hazard icon) is taken out of play: a hazard icon deals one more card.
  current = { ...current, villainArea: current.villainArea.filter((i) => codeOf(current, i) !== "56072") };
  const heroes = opts.twoPlayers ? withForm(current, { heroForm: 0 }, P2) : current;
  // The hero hand size is 5: a hand of 6 would be a forced discard at the end of the turn, one of 4 a draw.
  return {
    ...heroes,
    players: heroes.players.map((p) => ({ ...p, hand: p.hand.slice(0, 5), deck: [...p.hand.slice(5), ...p.deck] })),
  };
}

const ASSAULT = "01187"; // like Advance, a Core treachery with no boost icon and no boost ability
const FILLERS = [ADVANCE, ASSAULT];

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
  playArea(s, player).find((i) => codeOf(s, i).startsWith("5610"))!;

/** Surgery: `code`'s deck copy (the `which`th) engaged with `player`, in play (no reveal, no When Revealed, no quickstrike). */
function engaged(state: GameState, code: string, player: PlayerId = P1, which = 0) {
  const deckId = activeEncounterDeckId(state);
  const pile = state.encounterDecks[deckId]!;
  const id = [...pile.deck, ...pile.discard].filter((i) => codeOf(state, i) === code)[which];
  if (!id) throw new Error(`no ${code} in the encounter deck or discard`);
  return {
    id,
    state: {
      ...state,
      encounterDecks: {
        ...state.encounterDecks,
        [deckId]: { deck: pile.deck.filter((i) => i !== id), discard: pile.discard.filter((i) => i !== id) },
      },
      players: state.players.map((p) => (p.playerId === player ? { ...p, playArea: [...p.playArea, id] } : p)),
      instances: { ...state.instances, [id]: { ...state.instances[id]!, engagedWith: player, faceup: true } },
    },
  };
}

/** Surgery: the encounter discard pile exactly these instances, newest first. */
function discardPileIs(state: GameState, ...ids: InstanceId[]): GameState {
  const deckId = activeEncounterDeckId(state);
  const pile = state.encounterDecks[deckId]!;
  return {
    ...state,
    encounterDecks: {
      ...state.encounterDecks,
      [deckId]: { deck: pile.deck.filter((i) => !ids.includes(i)), discard: ids },
    },
  };
}

/** The players in turn order, from the first player. */
function seats(state: GameState): PlayerId[] {
  const at = state.players.findIndex((p) => p.playerId === state.firstPlayerId);
  return [...state.players.slice(at), ...state.players.slice(0, at)].map((p) => p.playerId);
}

/**
 * Every player ends the turn and the villain phase runs. Iron Man activates once against each player, each time
 * drawing a boost card (Advance, then Assault: no icon, no ability), then each player is dealt `dealt` in turn order.
 */
const villainPhase = (state: GameState, ...dealt: string[]) => villainPhasePicking(state, firstLegal, ...dealt);
const villainPhasePicking = (state: GameState, pick: Picker, ...dealt: string[]) =>
  driveEventsPicking(
    WAVE10_DEPS,
    stackEncounterDeck(state, ...FILLERS.slice(0, state.players.length), ...dealt),
    pick,
    ...seats(state).map((p) => endTurn(p)),
  );

/**
 * As `firstLegal`, but each of `defenders` defends the attack against them with their identity, which exhausts it. The
 * way to have an identity exhausted when the encounter cards are revealed: everything readies at the end of the player
 * phase (RRG 1.8 "Ready", p. 36), so an identity exhausted by surgery before the turn ends is ready again by then.
 */
const identityDefendsFor =
  (...defenders: PlayerId[]): Picker =>
  (s) => {
    const choice = s.pendingChoice!;
    const identity = identityOf(s, choice.playerId) as string;
    return choice.prompt.kind === "declareDefender" &&
      defenders.includes(choice.playerId) &&
      choice.options.some((o) => (o.optionId as string) === identity)
      ? [identity]
      : firstLegal(s);
  };

/** Player `player`'s hero thwarts `scheme` with a real basic thwart. */
const thwart = (state: GameState, scheme: InstanceId, player: PlayerId = P1) =>
  driveEventsPicking(WAVE10_DEPS, state, firstLegal, ...(player === P1 ? [] : [endTurn(P1)]), {
    type: "basicThwart",
    playerId: player,
    thwarterInstanceId: hero(state, player),
    schemeInstanceId: scheme,
  });

describe("registry", () => {
  it("registers the five refs of the four cards, each a valid definition, and skips nothing", () => {
    expect(Object.keys(MODULAR_CAPE_KILLER).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(MODULAR_CAPE_KILLER)) expect(validateDefinition(def), id).toEqual([]);
    expect(MODULAR_CAPE_KILLER_SKIPPED).toEqual({});
  });

  it("the data names exactly these refs for the four cards", () => {
    const refs = [CAPE, SUPER, BRING, ARREST].flatMap((c) =>
      ((dataOf(c).abilities ?? []) as { id: string }[]).map((a) => a.id),
    );
    expect(refs.sort()).toEqual([...REFS].sort());
  });

  it("carries the printed timing of each ability", () => {
    const reg = MODULAR_CAPE_KILLER;
    expect(reg["56105.cape-killer-forced-interrupt"]!.trigger).toMatchObject({ kind: "interrupt", forced: true });
    expect(reg["56106.unregistered-super-constant"]!.trigger).toMatchObject({ kind: "constant" });
    expect(reg["56106.unregistered-super-action"]!.trigger).toMatchObject({ kind: "action", form: "alterEgo" });
    expect(reg["56107.when-revealed"]!.trigger).toMatchObject({ kind: "whenRevealed" });
    expect(reg["56108.when-defeated"]!.trigger).toMatchObject({ kind: "whenDefeated" });
    expect(reg["56106.unregistered-super-constant"]).toBe(UNREGISTERED_SUPER_CONSTANT);
    expect(reg["56106.unregistered-super-action"]).toBe(UNREGISTERED_SUPER_ACTION);
  });

  it("setup: the encounter deck holds both copies of Cape-Killer and both printings of Unregistered Super", () => {
    const s = game();
    expect([CAPE, SUPER, SUPER_B, BRING, ARREST].map((c) => copiesIn(s, c).length)).toEqual([2, 1, 1, 1, 1]);
  });
});

describe("Cape-Killer (56105)", () => {
  it("is data: a S.H.I.E.L.D. minion, ATK 2, SCH 1, 4 hit points, 2 boost icons and Quickstrike", () => {
    const card = dataOf(CAPE);
    expect([card.type, card.atk, card.sch, card.hp, card.boostIcons]).toEqual(["minion", 2, 1, 4, 2]);
    expect(card.keywords).toEqual([{ name: "quickstrike" }]);
  });

  it("attacks a hero without the Unregistered trait for his printed ATK 2", () => {
    const cape = engaged(game(), CAPE);
    const run = villainPhase(cape.state, ARREST);
    expect(attacksBy(run.state, run.events, CAPE)).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    // Iron Man's own attack (ATK 1, no boost icon) is the rest.
    expect(inst(run.state, hero(run.state)).damage).toBe(2 + 1);
  });

  it("FORCED INTERRUPT: attacks an Unregistered hero with +2 ATK (4 in all)", () => {
    const start = inPlayAreaOf(game(), SUPER);
    expect(hasTrait(start, hero(start))).toBe(true);
    const run = villainPhase(engaged(start, CAPE).state, ARREST);
    expect(attacksBy(run.state, run.events, CAPE)).toMatchObject([{ baseAtk: 4, boostIcons: 0, damageDealt: 4 }]);
    expect(inst(run.state, hero(run.state)).damage).toBe(4 + 1);
  });

  it("the +2 is for the attacked identity only: with player 1 Unregistered, he gets it against player 1, not player 2", () => {
    const start = inPlayAreaOf(game({ twoPlayers: true }), SUPER);
    expect([P1, P2].map((p) => hasTrait(start, hero(start, p)))).toEqual([true, false]);
    const run1 = villainPhase(engaged(start, CAPE, P1).state, ARREST, BOUNTY);
    expect(attacksBy(run1.state, run1.events, CAPE)).toMatchObject([{ baseAtk: 4, damageDealt: 4 }]);
    const run2 = villainPhase(engaged(start, CAPE, P2).state, ARREST, BOUNTY);
    expect(attacksBy(run2.state, run2.events, CAPE)).toMatchObject([{ baseAtk: 2, damageDealt: 2 }]);
    expect(inst(run2.state, hero(run2.state, P2)).damage).toBe(2 + 1);
    expect(inst(run2.state, hero(run2.state, P1)).damage).toBe(1);
  });
});

describe("Unregistered Super (56106, the same card as 56114)", () => {
  it("is data: an obligation with one acceleration icon and 1 boost icon", () => {
    const card = dataOf(SUPER);
    expect([card.type, card.schemeIcons, card.boostIcons]).toEqual(["obligation", ["acceleration"], 1]);
  });

  it("CONSTANT: revealed, it stays in the revealing player's area and their identity (only theirs) gains the trait", () => {
    const start = game({ twoPlayers: true });
    expect([P1, P2].map((p) => hasTrait(start, hero(start, p)))).toEqual([false, false]);
    const run = villainPhase(start, SUPER, ARREST);
    const id = superOf(run.state);
    expect(codeOf(run.state, id)).toBe(SUPER);
    expect(revealedCodes(run.state, run.events)).toEqual([SUPER, ARREST]);
    expect(playArea(run.state, P2)).not.toContain(id);
    expect([P1, P2].map((p) => hasTrait(run.state, hero(run.state, p)))).toEqual([true, false]);
    // In alter-ego form the identity has the trait too.
    const alterEgo = withForm(run.state, "alterEgo");
    expect(hasTrait(alterEgo, hero(alterEgo))).toBe(true);
  });

  it("CONSTANT: its acceleration icon adds 1 to step one of the villain phase while it is in play", () => {
    const stepOne = (state: GameState) => {
      const run = villainPhase(state, ARREST);
      return types(run.events, "threatPlaced").find((e) => e.schemeInstanceId === state.mainScheme.instanceId)!.amount;
    };
    const base = game();
    expect(stepOne(inPlayAreaOf(base, SUPER))).toBe(stepOne(base) + 1);
  });

  it("CONSTANT: a revealed 56106 is heard as a card that gives a hero the trait (Hunting Rebel Heroes' response)", () => {
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
      SUPER,
      ARREST,
    );
    const run = driveEventsPicking(deps, staged, firstLegal, ...seats(staged).map((p) => endTurn(p)));
    const fromScheme = types(run.events, "damageDealt")
      .filter((e) => e.sourceInstanceId === run.state.mainScheme.instanceId)
      .map((e) => [e.targetInstanceId, e.amount]);
    // Player 1 revealed Unregistered Super: their hero takes 2 although Hunting Rebel Heroes already gave both the trait.
    expect(fromScheme).toEqual([[hero(run.state, P1), 2]]);
  });

  it("ALTER-EGO ACTION: discarding an identity-specific card from hand discards the card and the obligation", () => {
    const start = inPlayAreaOf(withForm(game(), "alterEgo"), SUPER);
    const id = superOf(start);
    const card = handOf(start).find((i) => codeOf(start, i) === TOOTH_AND_CLAW)!;
    const result = applyCommand(
      start,
      use(P1, id, "56106.unregistered-super-action", [], { discard: [card] }),
      WAVE10_DEPS,
    );
    if (!result.ok) throw new Error(result.error.message);
    const after = driveEventsPicking(WAVE10_DEPS, result.state, firstLegal).state;
    expect(playArea(after)).not.toContain(id);
    expect(handOf(after)).not.toContain(card);
    expect(discardOf(after)).toContain(card);
    expect(piles(after).discard).toContain(id);
    expect(hasTrait(after, hero(after))).toBe(false);
    expect(handOf(after)).toHaveLength(handOf(start).length - 1);
  });

  it("ALTER-EGO ACTION: a card that is not identity-specific cannot pay", () => {
    const start = inPlayAreaOf(withForm(game(), "alterEgo"), SUPER);
    const id = superOf(start);
    const aggression = handOf(start).find((i) => codeOf(start, i) === SUPPRESSING_FIRE)!;
    const refused = applyCommand(
      start,
      use(P1, id, "56106.unregistered-super-action", [], { discard: [aggression] }),
      WAVE10_DEPS,
    );
    expect(refused.ok).toBe(false);
    expect(playArea(start)).toContain(id);
  });

  it("ALTER-EGO ACTION: it cannot be used in hero form", () => {
    const start = inPlayAreaOf(game(), SUPER);
    const id = superOf(start);
    const card = handOf(start).find((i) => codeOf(start, i) === TOOTH_AND_CLAW)!;
    const refused = applyCommand(
      start,
      use(P1, id, "56106.unregistered-super-action", [], { discard: [card] }),
      WAVE10_DEPS,
    );
    expect(refused.ok).toBe(false);
  });
});

describe("Bring Them In (56107)", () => {
  it("is data: a treachery with 1 boost icon", () => {
    const card = dataOf(BRING);
    expect([card.type, card.boostIcons]).toEqual(["treachery", 1]);
  });

  it("WHEN REVEALED with no Unregistered identity: the enemy team's search has nothing to decide (two printings, one card), and player 2 is dealt one copy", () => {
    const start = game({ twoPlayers: true });
    const kinds: string[] = [];
    const run = driveEventsPicking(
      WAVE10_DEPS,
      stackEncounterDeck(start, ADVANCE, ASSAULT, ARREST, BRING),
      (s) => {
        kinds.push(`${s.pendingChoice!.prompt.kind}:${s.pendingChoice!.authority}`);
        return firstLegal(s);
      },
      ...seats(start).map((p) => endTurn(p)),
    );
    expect(kinds.filter((k) => k.startsWith("chooseCards") || k.endsWith("enemyTeam"))).toEqual([]);
    const dealt = types(run.events, "cardMoved").filter((e) => e.to.kind === "dealtEncounter");
    const codes = dealt.map((e) => [codeOf(run.state, e.instanceId), (e.to as { playerId: string }).playerId]);
    expect(codes.slice(0, 2)).toEqual([
      [ARREST, P1],
      [BRING, P2],
    ]);
    expect(codes).toHaveLength(3);
    // Exactly one of the two printings was dealt to the revealing player; the other is still in the encounter deck.
    const [copy, to] = codes[2]!;
    expect([SUPER, SUPER_B]).toContain(copy);
    expect(to).toBe(P2);
    const other = copy === SUPER ? SUPER_B : SUPER;
    expect(piles(run.state).deck.map((i) => codeOf(run.state, i))).toContain(other);
    expect(piles(run.state).deck.map((i) => codeOf(run.state, i))).not.toContain(copy);
    expect(types(run.events, "cardExhausted")).toEqual([]);
  });

  it("WHEN REVEALED with one copy in the deck: it is dealt to the revealing player and revealed at once, giving them the trait", () => {
    const start = game({ sets: ["cape_killer", "paladin", "the_initiative"] });
    expect(copiesIn(start, SUPER_B)).toHaveLength(0);
    const run = villainPhase(start, BRING);
    const dealt = types(run.events, "cardMoved").filter((e) => e.to.kind === "dealtEncounter");
    expect(dealt.map((e) => codeOf(run.state, e.instanceId))).toEqual([BRING, SUPER]);
    expect(revealedCodes(run.state, run.events)).toEqual([BRING, SUPER]);
    expect(codeOf(run.state, superOf(run.state))).toBe(SUPER);
    expect(hasTrait(run.state, hero(run.state))).toBe(true);
    expect(piles(run.state).discard.map((i) => codeOf(run.state, i))).toContain(BRING);
  });

  it("WHEN REVEALED with no copy of Unregistered Super left: nothing is dealt and the card is simply discarded", () => {
    const start = game({ sets: ["cape_killer", "paladin", "the_initiative"] });
    const gone = without(start, SUPER);
    const run = villainPhase(gone, BRING);
    expect(types(run.events, "cardMoved").filter((e) => e.to.kind === "dealtEncounter")).toHaveLength(1);
    expect(piles(run.state).discard.map((i) => codeOf(run.state, i))).toContain(BRING);
  });

  it("WHEN REVEALED with an Unregistered identity: only that identity is exhausted; nothing is searched or dealt", () => {
    const start = inPlayAreaOf(game({ twoPlayers: true }), SUPER);
    const run = villainPhase(start, BRING, ARREST);
    expect(revealedCodes(run.state, run.events)).toEqual([BRING, ARREST]);
    expect(types(run.events, "cardExhausted").map((e) => e.instanceId)).toEqual([hero(run.state, P1)]);
    expect(types(run.events, "cardMoved").filter((e) => e.to.kind === "dealtEncounter")).toHaveLength(2);
    expect(piles(run.state).deck.map((i) => codeOf(run.state, i))).toContain(SUPER_B);
  });

  it("WHEN REVEALED: the only Unregistered identity is already exhausted (it defended), so it cannot be exhausted (RRG 1.8 'Exhaust' p. 19) and 'Otherwise' deals a copy of Unregistered Super (RRG 1.8 'Otherwise' p. 31)", () => {
    const start = inPlayAreaOf(game(), SUPER);
    const run = villainPhasePicking(start, identityDefendsFor(P1), BRING);
    // Exhausted once, by defending: Bring Them In found it exhausted and exhausted nothing.
    expect(types(run.events, "cardExhausted").map((e) => e.instanceId)).toEqual([hero(start)]);
    const dealt = types(run.events, "cardMoved").filter((e) => e.to.kind === "dealtEncounter");
    expect(dealt.map((e) => [codeOf(run.state, e.instanceId), (e.to as { playerId: string }).playerId])).toEqual([
      [BRING, P1],
      [SUPER_B, P1],
    ]);
    expect(
      playArea(run.state)
        .map((i) => codeOf(run.state, i))
        .filter((c) => c === SUPER || c === SUPER_B),
    ).toEqual([SUPER, SUPER_B]);
    expect(piles(run.state).deck.map((i) => codeOf(run.state, i))).not.toContain(SUPER_B);
    expect(types(run.events, "deckShuffled")).toHaveLength(1);
  });

  it("control for the above: the same Unregistered identity, not defending and so ready, is exhausted and no copy is dealt", () => {
    const start = inPlayAreaOf(game(), SUPER);
    const run = villainPhase(start, BRING);
    expect(types(run.events, "cardExhausted").map((e) => e.instanceId)).toEqual([hero(start)]);
    expect(types(run.events, "cardMoved").filter((e) => e.to.kind === "dealtEncounter")).toHaveLength(1);
    expect(piles(run.state).deck.map((i) => codeOf(run.state, i))).toContain(SUPER_B);
  });

  it("WHEN REVEALED: one Unregistered identity ready and one already exhausted is a partial resolution: the ready one is exhausted and no copy is dealt", () => {
    const start = inPlayAreaOf(inPlayAreaOf(game({ twoPlayers: true }), SUPER, P1), SUPER_B, P2);
    expect([hasTrait(start, hero(start, P1)), hasTrait(start, hero(start, P2))]).toEqual([true, true]);
    const run = villainPhasePicking(start, identityDefendsFor(P2), BRING, ARREST);
    expect(revealedCodes(run.state, run.events)).toEqual([BRING, ARREST]);
    // Player 2's identity by defending, then player 1's by Bring Them In.
    expect(types(run.events, "cardExhausted").map((e) => e.instanceId)).toEqual([hero(start, P2), hero(start, P1)]);
    expect(types(run.events, "cardMoved").filter((e) => e.to.kind === "dealtEncounter")).toHaveLength(2);
    expect(types(run.events, "deckShuffled")).toEqual([]);
  });
});

describe("Arrest Order (56108)", () => {
  /** Arrest Order in play with 1 threat, and the encounter discard pile: Colleen Wing (not S.H.I.E.L.D.) on top of two Cape-Killers. */
  function withOrder(twoPlayers = false) {
    const base = game({ twoPlayers });
    const capes = copiesIn(base, CAPE);
    const colleen = copiesIn(base, COLLEEN)[0]!;
    const placed = discardPileIs(base, colleen, capes[0]!, capes[1]!);
    const deckId = activeEncounterDeckId(placed);
    const scheme = piles(placed).deck.find((i) => codeOf(placed, i) === ARREST)!;
    const state: GameState = {
      ...placed,
      encounterDecks: {
        ...placed.encounterDecks,
        [deckId]: { ...piles(placed), deck: piles(placed).deck.filter((i) => i !== scheme) },
      },
      villainArea: [...placed.villainArea, scheme],
      instances: { ...placed.instances, [scheme]: { ...placed.instances[scheme]!, threat: 1, faceup: true } },
    };
    return { state, scheme, colleen, capes };
  }
  const dealtTo = (events: ReturnType<typeof thwart>["events"]) =>
    types(events, "cardMoved")
      .filter((e) => e.to.kind === "dealtEncounter")
      .map((e) => [e.instanceId, (e.to as { playerId: string }).playerId]);

  it("is data: a side scheme with 3 threat, a crisis icon and 2 boost icons", () => {
    const card = dataOf(ARREST);
    expect([card.type, card.startingThreat, card.icons, card.boostIcons]).toEqual([
      "side_scheme",
      { base: 3, perPlayer: 0 },
      ["crisis"],
      2,
    ]);
  });

  it("WHEN DEFEATED: the defeating player is dealt the topmost S.H.I.E.L.D. minion of the discard pile, passing over a non-S.H.I.E.L.D. one", () => {
    const { state, scheme, colleen, capes } = withOrder();
    const done = thwart(state, scheme);
    expect(types(done.events, "schemeDefeated").map((e) => e.instanceId)).toEqual([scheme]);
    expect(dealtTo(done.events)).toEqual([[capes[0], P1]]);
    // Arrest Order went to the discard pile on top; Colleen and the second Cape-Killer stay under it, in order.
    expect(piles(done.state).discard).toEqual([scheme, colleen, capes[1]]);
    // The dealt Cape-Killer is revealed in the villain phase, entering play engaged with player 1.
    const next = villainPhase(done.state, ARREST);
    expect(revealedCodes(next.state, next.events)).toContain(CAPE);
    expect(inst(next.state, capes[0]!)).toMatchObject({ engagedWith: P1, faceup: true });
  });

  it("WHEN DEFEATED by player 2: that player is dealt it", () => {
    const { state, scheme, capes } = withOrder(true);
    const done = thwart(state, scheme, P2);
    expect(dealtTo(done.events)).toEqual([[capes[0], P2]]);
  });

  it("WHEN DEFEATED with no S.H.I.E.L.D. minion in the discard pile: nothing is dealt", () => {
    const { state, scheme, colleen } = withOrder();
    const done = thwart(discardPileIs(state, colleen), scheme);
    expect(types(done.events, "schemeDefeated").map((e) => e.instanceId)).toEqual([scheme]);
    expect(dealtTo(done.events)).toEqual([]);
    expect(piles(done.state).discard).toEqual([scheme, colleen]);
  });
});
