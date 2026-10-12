import { WONDER_MAN_CARDS, cardId } from "@mc/content";
import {
  activeEncounterDeck,
  activeEncounterDeckId,
  applyCommand,
  legalActions,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { abilityRefIds } from "../../../ability-refs.js";
import { validateDefinition } from "../../../dsl/validate.js";
import {
  P1,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  moveToHand,
  patchInstance,
  play,
  playerOf,
  use,
  type Picker,
} from "../../../testing/harness.js";
import { driveEventsPicking } from "../../../testing/staging.js";
import { WAVE10_DEPS, wonderManGame, wonderManHeroGame } from "../../testing.js";
import {
  WONDER_MAN_OBLIGATION_NEMESIS as REGISTRY,
  WONDER_MAN_OBLIGATION_NEMESIS_SKIPPED as SKIPPED,
} from "./obligation-nemesis.js";

vi.setConfig({ testTimeout: 180_000 });

/**
 * Wonder Man's obligation and nemesis set (58025 Pacifism; 58026 Grim Reaper, 58027 Brother vs. Brother, 58028 Scythe
 * Strike, 58029 Death Cannot Die), docs/phase7-wave10-hero-packs.md H8.4 line HS4 and H3.16, in real games with the
 * hand-built Justice deck `WONDER_MAN_DECK` against Core's Rhino (ATK 2, SCH 1). The nemesis set is set aside and the
 * obligation is in the encounter deck; cards are moved by surgery or staged on top of the encounter deck for a real
 * reveal. Core's Advance 01186 (0 boost icons) fills the boost cards, Hydra Mercenary 01101 (ATK 1, SCH 0) is a plain
 * minion and Black Cat 01002 (2 hit points) an ally. No ruling since RRG 1.7 names these cards.
 */
const PACIFISM = "58025";
const REAPER = "58026";
const BROTHER = "58027";
const SCYTHE = "58028";
const DEATH = "58029";
const REFS = [
  "58025.pacifism-constant",
  "58025.pacifism-action",
  "58026.grim-reaper-forced-response",
  "58027.brother-vs-brother-constant",
  "58028.when-revealed",
  "58029.when-revealed",
  "58029.boost",
];
const ACTION = "58025.pacifism-action";
const ADVANCE = "01186";
const MERC = "01101";
const BLACK_CAT = "01002";
const IONIC_BLAST = "58004";
const HAWKEYE = "58013";

const data = (code: string) => WONDER_MAN_CARDS.find((c) => (c.id as string) === code)! as any;
const codeOf = (s: GameState, id: InstanceId): string => inst(s, id).cardId as string;
const piles = (s: GameState) => activeEncounterDeck(s);
const damageOf = (s: GameState, id: InstanceId = identityOf(s)): number => inst(s, id).damage;
const mainThreat = (s: GameState): number => inst(s, s.mainScheme.instanceId).threat;
const ofType = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const hand = (s: GameState): readonly InstanceId[] => playerOf(s, P1).hand;

/** The first copy of `code` set aside for P1, or else in the encounter deck or its discard pile. */
function copyOf(s: GameState, code: string): InstanceId {
  const aside = playerOf(s, P1).setAside.find((i) => codeOf(s, i) === code);
  const found =
    aside ?? piles(s).deck.find((i) => codeOf(s, i) === code) ?? piles(s).discard.find((i) => codeOf(s, i) === code);
  if (!found) throw new Error(`no ${code}`);
  return found;
}
const takeAside = (s: GameState, id: InstanceId): GameState => ({
  ...s,
  players: s.players.map((p) => (p.playerId === P1 ? { ...p, setAside: p.setAside.filter((i) => i !== id) } : p)),
});

/** The set-aside Grim Reaper engaged with P1, faceup, as if revealed earlier. */
function withReaper(start: GameState, damage = 0): { state: GameState; id: InstanceId } {
  const id = copyOf(start, REAPER);
  const s = takeAside(start, id);
  return {
    id,
    state: {
      ...s,
      players: s.players.map((p) => (p.playerId === P1 ? { ...p, playArea: [...p.playArea, id] } : p)),
      instances: {
        ...s.instances,
        [id]: { ...s.instances[id]!, faceup: true, controllerId: null, engagedWith: P1, damage },
      },
    },
  };
}
/** Brother vs. Brother in the villain area with 2 threat, faceup (surgery: no reveal). */
function withBrother(start: GameState): { state: GameState; id: InstanceId } {
  const id = copyOf(start, BROTHER);
  const s = takeAside(start, id);
  return {
    id,
    state: {
      ...s,
      villainArea: [...s.villainArea, id],
      instances: { ...s.instances, [id]: { ...s.instances[id]!, threat: 2, faceup: true } },
    },
  };
}
/** The obligation in the play area of P1, as a revealed obligation sits: faceup, controlled by nobody. */
function withPacifism(start: GameState): { state: GameState; id: InstanceId } {
  const id = copyOf(start, PACIFISM);
  const s: GameState = {
    ...start,
    encounterDecks: {
      ...start.encounterDecks,
      [activeEncounterDeckId(start)]: { ...piles(start), deck: piles(start).deck.filter((i) => i !== id) },
    },
    players: start.players.map((p) => (p.playerId === P1 ? { ...p, playArea: [...p.playArea, id] } : p)),
  };
  return { id, state: patchInstance(s, id, { faceup: true, controllerId: null }) };
}
/** Surgery: `n` cards of the deck tucked under Ionic Physiology. */
function withTucked(state: GameState, n: number): { state: GameState; ids: InstanceId[] } {
  const physiology = Object.values(state.instances).find((i) => i.cardId === cardId("58002"))!.instanceId;
  const ids = playerOf(state, P1).deck.slice(0, n);
  const stripped: GameState = {
    ...state,
    players: state.players.map((p) => (p.playerId === P1 ? { ...p, deck: p.deck.filter((i) => !ids.includes(i)) } : p)),
  };
  return { state: patchInstance(stripped, physiology, { tucked: [...inst(state, physiology).tucked, ...ids] }), ids };
}
/** A Core ally (retagged from the first hand card) in the play area, ready. */
function allyInPlay(start: GameState, code: string): { state: GameState; id: InstanceId } {
  const id = hand(start)[0]!;
  const retagged = patchInstance(start, id, { cardId: cardId(code), faceup: true, controllerId: P1 });
  return {
    id,
    state: {
      ...retagged,
      players: retagged.players.map((p) =>
        p.playerId === P1 ? { ...p, hand: p.hand.filter((i) => i !== id), playArea: [...p.playArea, id] } : p,
      ),
    },
  };
}

/** The top 16 non-pack cards of the encounter deck made into Advance (0 boost icons), harmless as boost cards. */
const fillers = (state: GameState): GameState =>
  piles(state)
    .deck.slice(0, 16)
    .filter((id) => !codeOf(state, id).startsWith("58"))
    .reduce((acc, id) => patchInstance(acc, id, { cardId: cardId(ADVANCE) }), state);
/**
 * The encounter deck stacked for a villain phase: `boosts` Advance cards (one boost card for each activation before the
 * player's reveal), then the given cards (set-aside pack cards, or Core codes retagged from a spare Advance) in order.
 */
function stacked(start: GameState, boosts: number, ...codes: readonly string[]): GameState {
  let s = fillers(start);
  const taken: InstanceId[] = [];
  const ids = codes.map((code) => {
    const aside = playerOf(s, P1).setAside.find((i) => codeOf(s, i) === code && !taken.includes(i));
    if (aside) {
      s = takeAside(s, aside);
      taken.push(aside);
      return aside;
    }
    const own = piles(s).deck.find((i) => !taken.includes(i) && codeOf(s, i) === code);
    if (own && code.startsWith("58")) {
      taken.push(own);
      return own;
    }
    const spare = piles(s).deck.find((i) => !taken.includes(i) && codeOf(s, i) === ADVANCE);
    if (!spare) throw new Error(`no spare card for ${code}`);
    s = patchInstance(s, spare, { cardId: cardId(code) });
    taken.push(spare);
    return spare;
  });
  const left = piles(s).deck.filter((i) => !taken.includes(i));
  const boostIds = left.filter((i) => !codeOf(s, i).startsWith("58")).slice(0, boosts);
  const rest = left.filter((i) => !boostIds.includes(i));
  return {
    ...s,
    encounterDecks: {
      ...s.encounterDecks,
      [activeEncounterDeckId(s)]: { ...piles(s), deck: [...boostIds, ...ids, ...rest] },
    },
  };
}

/** Declines to defend unless told otherwise; orders enemies as offered; otherwise the first legal answer. */
const pick: Picker = (s) => {
  const prompt = s.pendingChoice!.prompt;
  if (prompt.kind === "declareDefender") return ["decline"];
  if (prompt.kind === "orderEnemies") return s.pendingChoice!.options.map((o) => o.optionId);
  return firstLegal(s);
};
const endRound = (s: GameState, picker: Picker = pick) => driveEventsPicking(WAVE10_DEPS, s, picker, endTurn(P1));
const accepted = (s: GameState, command: Parameters<typeof applyCommand>[1]) =>
  applyCommand(s, command, WAVE10_DEPS).ok;
const reaperOf = (s: GameState) =>
  Object.values(s.instances).find((i) => i.cardId === cardId(REAPER) && i.engagedWith === P1);

describe("registry", () => {
  it("registers every printed ref; nothing is skipped", () => {
    const printed = [PACIFISM, REAPER, BROTHER, SCYTHE, DEATH].flatMap((c) => abilityRefIds(data(c)));
    expect([...printed].sort()).toEqual([...REFS].sort());
    expect(Object.keys(REGISTRY).sort()).toEqual([...REFS].sort());
    expect(Object.keys(SKIPPED)).toEqual([]);
  });
  it.each([...REFS])("%s validates", (ref) => {
    expect(validateDefinition(REGISTRY[ref]!)).toEqual([]);
  });
  it("timing: a constant, an Alter-Ego Action, a Forced Response, a constant rule, When Reveals and a Boost", () => {
    expect(REGISTRY["58025.pacifism-constant"]!.trigger).toMatchObject({ kind: "constant" });
    expect(REGISTRY[ACTION]!.trigger).toMatchObject({ kind: "action", form: "alterEgo" });
    expect(REGISTRY["58026.grim-reaper-forced-response"]!.trigger).toMatchObject({ kind: "response", forced: true });
    expect(REGISTRY["58027.brother-vs-brother-constant"]!.trigger).toMatchObject({ kind: "constant" });
    expect(REGISTRY["58028.when-revealed"]!.trigger).toMatchObject({ kind: "whenRevealed" });
    expect(REGISTRY["58029.when-revealed"]!.trigger).toMatchObject({ kind: "whenRevealed" });
    expect(REGISTRY["58029.boost"]!.trigger).toMatchObject({ kind: "boost" });
  });
});

describe("the printed cards", () => {
  it("Pacifism: an obligation in no encounter set, 2 boost icons, given to the Simon Williams player", () => {
    expect(data(PACIFISM)).toMatchObject({ type: "obligation", boostIcons: 2, encounterSetIds: [] });
    expect(data(PACIFISM).text.current).toContain("Give to the Simon Williams player.");
  });
  it("Grim Reaper: unique Cyborg minion, ATK 2, SCH 2, 3 hit points, quickstrike, 2 boost icons, nemesis minion", () => {
    expect(data(REAPER)).toMatchObject({ type: "minion", unique: true, atk: 2, sch: 2, hp: 3, boostIcons: 2 });
    expect(data(REAPER)).toMatchObject({ nemesisMinion: true, keywords: [{ name: "quickstrike" }] });
    expect(data(REAPER).traits).toEqual(["CYBORG"]);
  });
  it("Brother vs. Brother: one amplify icon, 2 threat per player, no scheme icons, 3 boost icons", () => {
    expect(data(BROTHER)).toMatchObject({
      type: "side_scheme",
      amplifyIcons: 1,
      startingThreat: { base: 0, perPlayer: 2 },
      boostIcons: 3,
    });
    expect(data(BROTHER).icons).toEqual([]);
  });
  it("Scythe Strike 2 boost icons; Death Cannot Die two copies, 0 boost icons and a boost star", () => {
    expect(data(SCYTHE)).toMatchObject({ type: "treachery", boostIcons: 2 });
    expect(data(DEATH)).toMatchObject({ type: "treachery", quantityInSet: 2, boostIcons: 0, starIcon: true });
  });
  it("setup: the obligation is in the encounter deck once, the nemesis cards are set aside", () => {
    const s = wonderManGame();
    expect(piles(s).deck.filter((i) => codeOf(s, i) === PACIFISM)).toHaveLength(1);
    expect(playerOf(s, P1).setAside.map((i) => codeOf(s, i))).toEqual([REAPER, BROTHER, SCYTHE, DEATH, DEATH]);
  });
});

describe("58025 Pacifism", () => {
  it("revealed in the villain phase it goes to the Simon Williams player's play area and stays there", () => {
    const start = wonderManGame();
    const id = copyOf(start, PACIFISM);
    const { state } = endRound(stacked(start, 1, PACIFISM));
    expect(playerOf(state, P1).playArea).toContain(id);
    expect(piles(state).discard).not.toContain(id);
  });

  it("Wonder Man cannot attack: a basic attack is refused, and so is the Attack event Ionic Blast", () => {
    const held = withPacifism(wonderManHeroGame());
    const blast = moveToHand(held.state, P1, IONIC_BLAST);
    const villain = held.state.activeVillainId!;
    expect(
      accepted(blast.state, {
        type: "basicAttack",
        playerId: P1,
        attackerInstanceId: identityOf(blast.state),
        targetInstanceId: villain,
      }),
    ).toBe(false);
    expect(accepted(blast.state, play(P1, blast.ids[0]!, [hand(blast.state).find((i) => i !== blast.ids[0])!]))).toBe(
      false,
    );
    // Control: without the obligation both are fine.
    const free = moveToHand(wonderManHeroGame(), P1, IONIC_BLAST);
    expect(
      accepted(free.state, {
        type: "basicAttack",
        playerId: P1,
        attackerInstanceId: identityOf(free.state),
        targetInstanceId: free.state.activeVillainId!,
      }),
    ).toBe(true);
    expect(accepted(free.state, play(P1, free.ids[0]!, [hand(free.state).find((i) => i !== free.ids[0])!]))).toBe(true);
  });

  it("an ally's attack is not Wonder Man's: Hawkeye can still attack", () => {
    const held = withPacifism(wonderManHeroGame());
    const ally = moveToHand(held.state, P1, HAWKEYE);
    const inPlay = {
      ...ally.state,
      players: ally.state.players.map((p) =>
        p.playerId === P1
          ? { ...p, hand: p.hand.filter((i) => i !== ally.ids[0]), playArea: [...p.playArea, ally.ids[0]!] }
          : p,
      ),
    };
    const ready = patchInstance(inPlay, ally.ids[0]!, { faceup: true, controllerId: P1 });
    expect(
      accepted(ready, {
        type: "basicAttack",
        playerId: P1,
        attackerInstanceId: ally.ids[0]!,
        targetInstanceId: ready.activeVillainId!,
      }),
    ).toBe(true);
  });

  it("Alter-Ego Action, exhausting Simon Williams: he exhausts and the obligation is discarded", () => {
    const held = withPacifism(wonderManGame());
    const { state } = driveEventsPicking(
      WAVE10_DEPS,
      held.state,
      firstLegal,
      use(P1, held.id, ACTION, [], undefined, { branch: 0 }),
    );
    expect(inst(state, identityOf(state)).exhausted).toBe(true);
    expect(piles(state).discard).toContain(held.id);
    expect(playerOf(state, P1).playArea).not.toContain(held.id);
    expect(state.removedFromGame).not.toContain(held.id);
  });

  it("Alter-Ego Action, discarding 3 tucked cards: they are discarded, Simon Williams stays ready", () => {
    const tucked = withTucked(wonderManGame(), 3);
    const held = withPacifism(tucked.state);
    const { state } = driveEventsPicking(
      WAVE10_DEPS,
      held.state,
      firstLegal,
      use(P1, held.id, ACTION, [], { discarded: tucked.ids }, { branch: 1 }),
    );
    expect(inst(state, identityOf(state)).exhausted).toBe(false);
    expect(piles(state).discard).toContain(held.id);
    expect(playerOf(state, P1).discard).toEqual(expect.arrayContaining(tucked.ids));
  });

  it("with only 2 cards tucked the discard branch is refused, and the exhaust branch is still there", () => {
    const tucked = withTucked(wonderManGame(), 2);
    const held = withPacifism(tucked.state);
    expect(accepted(held.state, use(P1, held.id, ACTION, [], { discarded: tucked.ids }, { branch: 1 }))).toBe(false);
    expect(accepted(held.state, use(P1, held.id, ACTION, [], undefined, { branch: 0 }))).toBe(true);
  });

  it("with Simon Williams exhausted the exhaust branch cannot be paid; the tucked-cards branch still can", () => {
    const tucked = withTucked(wonderManGame(), 3);
    const held = withPacifism(tucked.state);
    const tired = patchInstance(held.state, identityOf(held.state), { exhausted: true });
    expect(accepted(tired, use(P1, held.id, ACTION, [], undefined, { branch: 0 }))).toBe(false);
    expect(accepted(tired, use(P1, held.id, ACTION, [], { discarded: tucked.ids }, { branch: 1 }))).toBe(true);
  });

  it("in hero form it is an Alter-Ego Action and cannot be used", () => {
    const held = withPacifism(wonderManHeroGame());
    expect(accepted(held.state, use(P1, held.id, ACTION, [], undefined, { branch: 0 }))).toBe(false);
  });
});

describe("58026 Grim Reaper: after he attacks and defeats an ally, deal that ally's controller a facedown card", () => {
  /** Hero form, Rhino stunned so that only Grim Reaper attacks; Black Cat (2 hit points) in play, ready to defend. */
  function table(opts: { readonly ally?: boolean } = {}) {
    let s = wonderManHeroGame();
    const v = s.activeVillainId!;
    s = patchInstance(s, v, { statuses: { ...inst(s, v).statuses, stunned: 1 } });
    const cat = opts.ally === false ? undefined : allyInPlay(s, BLACK_CAT);
    if (cat) s = cat.state;
    const reaper = withReaper(s);
    return { s: reaper.state, reaper: reaper.id, cat: cat?.id };
  }
  const defendWith =
    (id: InstanceId): Picker =>
    (s) =>
      s.pendingChoice!.prompt.kind === "declareDefender" ? [id] : pick(s);
  const dealt = (state: GameState) =>
    Object.values(state.instances).filter((i) => i.cardId === cardId(MERC) && i.engagedWith === P1);

  it("the ally defends and is defeated (ATK 2 on 2 hit points): a facedown card is dealt and revealed", () => {
    const t = table();
    // Grim Reaper's boost card, the card he deals, then the player's own card for the round.
    const { state, events } = endRound(stacked(t.s, 0, MERC, ADVANCE), defendWith(t.cat!));
    expect(playerOf(state, P1).playArea).not.toContain(t.cat);
    expect(playerOf(state, P1).discard).toContain(t.cat);
    expect(dealt(state)).toHaveLength(1);
    expect(
      ofType(events, "abilityResolved").filter((e) => e.abilityId === "58026.grim-reaper-forced-response"),
    ).toHaveLength(1);
  });

  it("the ally survives (Reaper's damage is tough-absorbed): nothing is dealt", () => {
    const t = table();
    const tough = patchInstance(t.s, t.cat!, { statuses: { ...inst(t.s, t.cat!).statuses, tough: 1 } });
    const { state } = endRound(stacked(tough, 0, ADVANCE, ADVANCE), defendWith(t.cat!));
    expect(playerOf(state, P1).playArea).toContain(t.cat);
    expect(dealt(state)).toHaveLength(0);
  });

  it("the hero is damaged, not an ally defeated: nothing is dealt", () => {
    const t = table({ ally: false });
    const { state } = endRound(stacked(t.s, 0, ADVANCE, ADVANCE));
    expect(damageOf(state)).toBe(2);
    expect(dealt(state)).toHaveLength(0);
  });
});

describe("58027 Brother vs. Brother: as an additional cost to attack Grim Reaper, discard 1 card from your hand", () => {
  function table(handSize: number) {
    let s = wonderManHeroGame();
    const reaper = withReaper(s);
    const brother = withBrother(reaper.state);
    s = brother.state;
    s = {
      ...s,
      players: s.players.map((p) =>
        p.playerId === P1 ? { ...p, hand: p.hand.slice(0, handSize), deck: [...p.hand.slice(handSize), ...p.deck] } : p,
      ),
    };
    return { s, reaper: reaper.id };
  }
  const attack = (s: GameState, target: InstanceId) =>
    ({ type: "basicAttack", playerId: P1, attackerInstanceId: identityOf(s), targetInstanceId: target }) as const;

  it("a basic attack on Grim Reaper discards a card from hand and then attacks", () => {
    const t = table(2);
    const before = hand(t.s);
    const result = applyCommand(t.s, attack(t.s, t.reaper), WAVE10_DEPS);
    if (!result.ok) throw new Error(result.error.message);
    let state = result.state;
    while (state.pendingChoice) {
      const next = applyCommand(
        state,
        {
          type: "resolveChoice",
          playerId: P1,
          choiceId: state.pendingChoice.choiceId,
          selectedOptionIds: firstLegal(state),
        },
        WAVE10_DEPS,
      );
      if (!next.ok) throw new Error(next.error.message);
      state = next.state;
    }
    expect(hand(state)).toHaveLength(before.length - 1);
    expect(inst(state, t.reaper).damage).toBeGreaterThan(0);
  });

  it("with an empty hand Grim Reaper is not a legal target; the villain is", () => {
    const t = table(0);
    expect(accepted(t.s, attack(t.s, t.reaper))).toBe(false);
    expect(accepted(t.s, attack(t.s, t.s.activeVillainId!))).toBe(true);
    const legal = legalActions(t.s, P1, WAVE10_DEPS);
    if (legal.kind !== "turn") throw new Error("expected a turn");
    const targets = legal.legal.find((a) => a.example.type === "basicAttack")?.targets ?? [];
    expect(targets).not.toContain(t.reaper);
  });

  it("without the side scheme in play attacking Grim Reaper costs nothing", () => {
    let s = wonderManHeroGame();
    s = withReaper(s).state;
    s = { ...s, players: s.players.map((p) => (p.playerId === P1 ? { ...p, hand: [] } : p)) };
    expect(accepted(s, attack(s, reaperOf(s)!.instanceId))).toBe(true);
  });
});

describe("58028 Scythe Strike", () => {
  it("with Grim Reaper in play he activates against you: an extra scheme of 2 in alter-ego form", () => {
    const reaper = withReaper(wonderManGame());
    // Rhino's boost card, then the player's reveal (only the villain draws boost cards, not a minion).
    const control = endRound(stacked(reaper.state, 1, MERC));
    const { state } = endRound(stacked(reaper.state, 1, SCYTHE));
    expect(mainThreat(state) - mainThreat(control.state)).toBe(2);
    expect(damageOf(state)).toBe(0);
  });

  it("with Grim Reaper in play in hero form he attacks you: an extra 2 damage", () => {
    const reaper = withReaper(wonderManHeroGame());
    const control = endRound(stacked(reaper.state, 1, MERC));
    const { state } = endRound(stacked(reaper.state, 1, SCYTHE));
    expect(damageOf(state) - damageOf(control.state)).toBe(2);
  });

  it("with Grim Reaper not in play, the player takes 2 indirect damage (to their only character)", () => {
    const { state } = endRound(stacked(wonderManGame(), 1, SCYTHE));
    expect(damageOf(state)).toBe(2);
    expect(reaperOf(state)).toBeUndefined();
  });
});

describe("58029 Death Cannot Die", () => {
  it("with Grim Reaper in play he activates against you, once: an extra scheme of 2", () => {
    const reaper = withReaper(wonderManGame());
    const control = endRound(stacked(reaper.state, 1, MERC));
    const { state } = endRound(stacked(reaper.state, 1, DEATH));
    expect(mainThreat(state) - mainThreat(control.state)).toBe(2);
  });

  it("with Grim Reaper not in play he is found and revealed, engaged with the revealing player; nothing activates", () => {
    const start = wonderManGame();
    const control = endRound(stacked(start, 1, MERC));
    const { state } = endRound(stacked(start, 1, DEATH));
    const found = reaperOf(state);
    expect(found).toBeDefined();
    expect(playerOf(state, P1).playArea).toContain(found!.instanceId);
    // Revealed, not activated: its scheme (SCH 2) is not added to the threat this round.
    expect(mainThreat(state)).toBe(mainThreat(control.state));
  });

  it("the Boost: Grim Reaper in play activates against the attacked player after this activation", () => {
    const reaper = withReaper(wonderManGame());
    // Rhino's boost card is Death Cannot Die; the player then reveals a plain minion.
    const control = endRound(stacked(reaper.state, 1, MERC));
    const stackedBoost = stacked(reaper.state, 0, DEATH, MERC);
    const { state } = endRound(stackedBoost);
    expect(mainThreat(state) - mainThreat(control.state)).toBe(2);
  });

  it("the Boost with Grim Reaper not in play does nothing", () => {
    const control = endRound(stacked(wonderManGame(), 1, MERC));
    const { state } = endRound(stacked(wonderManGame(), 0, DEATH, MERC));
    expect(mainThreat(state)).toBe(mainThreat(control.state));
    expect(reaperOf(state)).toBeUndefined();
  });
});
