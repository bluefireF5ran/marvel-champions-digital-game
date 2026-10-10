import { AOS_EVIDENCE_COMBINATIONS, type EvidenceCombination } from "@mc/content";
import {
  applyCommand,
  createGame,
  evidenceRowId,
  hasKeyword,
  maxHitPoints,
  openEvidenceRows,
  remainingHitPoints,
  type Command,
  type EngineDeps,
  type GameEvent,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { mergeRegistries } from "../../dsl/index.js";
import {
  P1,
  P2,
  endTurn,
  applyOk,
  firstLegal,
  identityOf,
  inst,
  moveToHand,
  patchInstance,
  play,
  playerOf,
  settle,
  stackEncounterDeck,
  use,
  type Picker,
} from "../../testing/harness.js";
import { WAVE8_ABILITIES } from "../../wave8/index.js";
import { wave9Scenario } from "../setup.js";
import { BLANK, IRON_MAN, SPIDER_MAN, codeOf, inPlayCard, piles, without } from "../testing.js";
import { BARON_ZEMO } from "./baron-zemo.js";
import { EXECUTIVE_BOARD } from "./executive-board.js";

vi.setConfig({ testTimeout: 300_000 });

const DEPS: EngineDeps = { abilities: mergeRegistries(WAVE8_ABILITIES, BARON_ZEMO, EXECUTIVE_BOARD) };

// Wave 9 cards
const MEDICAL = "50181a";
const SURVEILLANCE = "50182a";
const TACTICAL = "50183a";
const MEMBERS = [MEDICAL, SURVEILLANCE, TACTICAL];
const SWORD = "50170";
const AGENT = "50172";
const DIVIDED = "50173";
const UNDERMINE = "50174";
const MIGHT = "50176";
const ENDS = "50177";
const INTERFERENCE_ENERGY = "50184a";
// Core cards
const WEB_KICK = "01005"; // event (attack): 8 damage to an enemy, cost 3
const HAYMAKER = "01087"; // event (attack): 3 damage to an enemy, cost 2
const BLACK_CAT = "01002"; // ally, cost 2
// Resource cards in the Spider-Man starter deck, by the type they pay in
const ENERGY = ["01007", "01007", "01006", "01006"];
const PHYSICAL = ["01003", "01003", "01008", "01008", "01009"];
const MENTAL = ["01004", "01004", "01061", "01061", "01064"];

const GRID = AOS_EVIDENCE_COMBINATIONS;
const GUESSES = ["means", "motive", "opportunity"] as const;

// ---------------------------------------------------------------------------------------------------------------
// A small driver: every step is an op on the state, so a game replays from its ops (the replay tests below)
// ---------------------------------------------------------------------------------------------------------------

type Op = (s: GameState) => GameState;

interface Sim {
  state: GameState;
  log: GameEvent[];
  /** Everything done to the game since `open`, in order. */
  ops: Op[];
}

interface Plan {
  /** An optional trigger whose id contains one of these texts is taken; every other optional trigger is declined. */
  readonly take?: readonly string[];
  /** A `chooseOption` option whose label starts with one of these texts; with none, a "Do not ..." option, else the first. */
  readonly options?: readonly string[];
  /** Targets chosen when offered, in order of preference. */
  readonly targets?: readonly InstanceId[];
  readonly defender?: InstanceId;
  /** The row accused. */
  readonly accuse?: EvidenceCombination;
  /** Hand cards paid when a payment is asked for. */
  readonly pay?: number;
  readonly player?: PlayerId;
}

const planner =
  (plan: Plan): Picker =>
  (s) => {
    const choice = s.pendingChoice!;
    const offered = choice.options;
    switch (choice.prompt.kind) {
      case "chooseTriggers": {
        const hit = offered.find((o) => (plan.take ?? []).some((t) => (o.optionId as string).includes(t)));
        return hit ? [hit.optionId] : [];
      }
      case "declareDefender": {
        const hit = plan.defender
          ? offered.find((o) => o.ref.kind === "card" && o.ref.instanceId === plan.defender)
          : undefined;
        return hit ? [hit.optionId] : ["decline"];
      }
      case "chooseOption": {
        for (const wanted of plan.options ?? []) {
          const hit = offered.find((o) => o.label.startsWith(wanted));
          if (hit) return [hit.optionId];
        }
        const decline = offered.find((o) => o.label.startsWith("Do not"));
        return decline ? [decline.optionId] : firstLegal(s);
      }
      case "chooseTarget": {
        for (const target of plan.targets ?? []) {
          const hit = offered.find((o) => o.ref.kind === "card" && o.ref.instanceId === target);
          if (hit) return [hit.optionId];
        }
        return firstLegal(s);
      }
      case "choosePlayer": {
        const hit = plan.player ? offered.find((o) => (o.optionId as string) === plan.player) : undefined;
        return hit ? [hit.optionId] : firstLegal(s);
      }
      case "accuse": {
        const row = plan.accuse ?? GRID[0]!;
        const hit = offered.find((o) => (o.optionId as string) === evidenceRowId(row));
        if (!hit) throw new Error("the accused row is not offered");
        return [hit.optionId];
      }
      case "spendResources":
      case "payForAbility":
        return offered
          .map((o) => o.optionId)
          .filter((id) => id.startsWith("hand:"))
          .slice(0, plan.pay ?? 0);
      default:
        return firstLegal(s);
    }
  };

/** The scenario past setup, to the first player turn, with the two cards no script reaches yet out of the deck. */
function open(
  players: readonly (typeof SPIDER_MAN | typeof IRON_MAN)[],
  difficulty: "standard" | "expert" = "standard",
  firstPlayerIndex?: number,
  /** The two cards no script reached when the first games were written; game E plays them, so it keeps them. */
  keepUnscripted = false,
): Sim {
  const config = wave9Scenario("baron-zemo", {
    players,
    seed: 1,
    difficulty,
    ...(firstPlayerIndex !== undefined ? { firstPlayerIndex } : {}),
  });
  const created = createGame(config, DEPS);
  if (!created.ok) throw new Error(created.error.message);
  // Games A to D never stack Reluctant Foe (50171) or Battle of Wits (50175): they stay out of the encounter deck so
  // those games' seeded draws are what they were. Game E keeps them.
  const settled = settle(created.state, firstLegal, (s) => s.step.phase === "player", DEPS);
  const state = keepUnscripted ? settled : without(without(settled, "50171"), "50175");
  return { state, log: [], ops: [] };
}

/** An op that is not a command: a card given to a hand, an encounter deck stacked. */
const stage = (sim: Sim, op: Op) => {
  sim.state = op(sim.state);
  sim.ops.push(op);
};

/**
 * Runs commands, answering each prompt by `plan` (a `Plan` or a picker), until nothing is pending or `until` holds of a
 * pending prompt: the game is left on that prompt. Returns only the events produced.
 */
function act(sim: Sim, plan: Plan | Picker, ...commands: readonly Command[]): GameEvent[] {
  return actUntil(sim, plan, () => false, ...commands);
}

function actUntil(
  sim: Sim,
  plan: Plan | Picker,
  until: (s: GameState) => boolean,
  ...commands: readonly Command[]
): GameEvent[] {
  const pick = typeof plan === "function" ? plan : planner(plan);
  const run: Op = (start) => {
    let current = start;
    const events: GameEvent[] = [];
    const settleOne = () => {
      while (current.pendingChoice && !current.outcome && !until(current)) {
        const choice = current.pendingChoice;
        const r = applyOk(
          current,
          {
            type: "resolveChoice",
            playerId: choice.playerId,
            choiceId: choice.choiceId,
            selectedOptionIds: pick(current),
          },
          DEPS,
        );
        current = r.state;
        events.push(...r.events);
      }
    };
    settleOne();
    for (const command of commands) {
      const r = applyOk(current, command, DEPS);
      current = r.state;
      events.push(...r.events);
      settleOne();
    }
    lastEvents = events;
    return current;
  };
  let lastEvents: GameEvent[] = [];
  sim.state = run(sim.state);
  sim.log = [...sim.log, ...lastEvents];
  sim.ops.push((s) => run(s));
  return [...lastEvents];
}

const ofType = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

const give = (sim: Sim, player: PlayerId, ...codes: string[]) =>
  stage(sim, (s) => moveToHand(s, player, ...codes).state);
const stack = (sim: Sim, ...codes: string[]) => stage(sim, (s) => stackEncounterDeck(s, ...codes));
/** Sets a count of secret counters on a Board Member (by code of its environment face), a seeding of the table. */
const setSecrets = (sim: Sim, counts: Readonly<Record<string, number>>) =>
  stage(sim, (s) =>
    Object.entries(counts).reduce(
      (acc, [code, n]) => patchInstance(acc, memberOf(acc, code), { counters: n > 0 ? { secret: n } : {} }),
      s,
    ),
  );

/** Zemo's own Unmasked-face interrupt is the prompt: it comes before his boost cards are drawn. */
const atZemoInterrupt = (s: GameState): boolean =>
  s.pendingChoice?.prompt.kind === "chooseOption" &&
  s.pendingChoice.options.some((o) => o.label.startsWith("Give Baron Zemo an additional boost card"));

const handIds = (sim: Sim, code: string, player: PlayerId = P1): InstanceId[] =>
  playerOf(sim.state, player).hand.filter((i) => codeOf(sim.state, i) === code);
/** `n` hand cards of these codes (not `except`), as a payment. */
const hand = (sim: Sim, codes: readonly string[], player: PlayerId = P1): InstanceId[] => {
  const taken: InstanceId[] = [];
  for (const code of codes) {
    const id = handIds(sim, code, player).find((i) => !taken.includes(i));
    if (!id) throw new Error(`no ${code} in the hand`);
    taken.push(id);
  }
  return taken;
};
const fromHand = (ids: readonly InstanceId[]) => ids.map((fromHand) => ({ fromHand }));

const villainOf = (sim: Sim): InstanceId => sim.state.villains[0]!.instanceId;
const mainOf = (sim: Sim): InstanceId => sim.state.mainScheme.instanceId;
const mainThreat = (sim: Sim): number => inst(sim.state, mainOf(sim)).threat;
const damageOn = (sim: Sim, id: InstanceId): number => inst(sim.state, id).damage;
const stageNumber = (sim: Sim): number => sim.state.mainScheme.stageIndex + 1;
const toHero = (player: PlayerId = P1): Command => ({ type: "changeForm", playerId: player });
const attack = (
  by: InstanceId,
  target: InstanceId,
  paid: readonly InstanceId[] = [],
  player: PlayerId = P1,
): Command => ({
  type: "basicAttack",
  playerId: player,
  attackerInstanceId: by,
  targetInstanceId: target,
  ...(paid.length > 0 ? { payment: fromHand(paid) } : {}),
});
const thwart = (
  by: InstanceId,
  scheme: InstanceId,
  paid: readonly InstanceId[] = [],
  player: PlayerId = P1,
): Command => ({
  type: "basicThwart",
  playerId: player,
  thwarterInstanceId: by,
  schemeInstanceId: scheme,
  ...(paid.length > 0 ? { payment: fromHand(paid) } : {}),
});
/** The error a command would be rejected with, or null when it is legal (the state is not changed). */
const rejection = (sim: Sim, command: Command): string | null => {
  const r = applyCommand(sim.state, command, DEPS);
  return r.ok ? null : r.error.code;
};

/** A Board Member card: the environment in the villain area, or its attachment face once flipped. */
const memberOf = (s: GameState, code: string): InstanceId => {
  const aid = `${code.slice(0, -1)}b`;
  const found = (Object.keys(s.instances) as InstanceId[]).find((i) => {
    const c = codeOf(s, i);
    return (c === code && s.villainArea.includes(i)) || (c === aid && s.instances[i]!.attachedTo !== null);
  });
  if (!found) throw new Error(`no ${code} in play`);
  return found;
};
const secrets = (sim: Sim, code: string): number => inst(sim.state, memberOf(sim.state, code)).counters["secret"] ?? 0;
const counts = (sim: Sim): number[] => MEMBERS.map((code) => secrets(sim, code));
const isAttachment = (sim: Sim, code: string): boolean =>
  codeOf(sim.state, memberOf(sim.state, code)) === `${code.slice(0, -1)}b`;
const attachments = (sim: Sim): string[] => MEMBERS.filter((code) => isAttachment(sim, code));

const aimOf = (s: GameState): readonly string[] => (s.hiddenPiles?.["aim"] ?? []).map((c) => c as string);
const shieldLeft = (s: GameState): number => (s.hiddenPiles?.["shield"] ?? []).length;
const gainedCards = (s: GameState): readonly string[] =>
  (s.revealedPileCards?.["shield"] ?? []).map((c) => c as string);
/** The row the A.I.M. pile makes: the mole's. */
const moleRow = (s: GameState): EvidenceCombination => {
  const aim = new Set(aimOf(s));
  return GRID.find((row) => GUESSES.every((g) => aim.has(row[g] as string)))!;
};
const differing = (row: EvidenceCombination, mole: EvidenceCombination) =>
  [...GUESSES, "boardMember" as const].filter((f) => row[f] !== mole[f]);
/** An open row differing from the mole's in exactly the fields named. */
const rowDiffering = (s: GameState, ...fields: readonly string[]): EvidenceCombination => {
  const mole = moleRow(s);
  const open = openEvidenceRows(s, GRID);
  const row = open.find((r) => {
    const d = differing(r, mole);
    return d.length === fields.length && fields.every((f) => d.includes(f as (typeof d)[number]));
  });
  if (!row) throw new Error(`no open row differing in ${fields.join(", ")}`);
  return row;
};

/** An open row that names a wrong Board Member and one wrong card (two wrong guesses): the "wrong member" accusation. */
const wrongMemberRow = (s: GameState): EvidenceCombination => {
  const mole = moleRow(s);
  const row = openEvidenceRows(s, GRID).find((r) => {
    const d = differing(r, mole);
    return d.length === 2 && d.includes("boardMember");
  });
  if (!row) throw new Error("no open row names a wrong member and one wrong card");
  return row;
};

// ---------------------------------------------------------------------------------------------------------------
// Zone invariants (the same shape as batroc-scenario.test.ts)
// ---------------------------------------------------------------------------------------------------------------

function zoneIndex(s: GameState): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const add = (id: InstanceId, label: string) => index.set(id, [...(index.get(id) ?? []), label]);
  for (const p of s.players) {
    for (const zone of ["hand", "deck", "discard", "playArea", "dealtEncounter", "resolving", "setAside"] as const)
      for (const id of p[zone]) add(id, `${p.playerId}.${zone}`);
    for (const [name, sep] of Object.entries(p.separateDecks)) {
      for (const id of sep.deck) add(id, `${p.playerId}.sep.${name}.deck`);
      for (const id of sep.discard) add(id, `${p.playerId}.sep.${name}.discard`);
    }
    add(p.identity.instanceId, `${p.playerId}.identity`);
  }
  for (const [deckId, pile] of Object.entries(s.encounterDecks)) {
    for (const id of pile.deck) add(id, `enc.${deckId}.deck`);
    for (const id of pile.discard) add(id, `enc.${deckId}.discard`);
  }
  for (const id of s.encounterSetAside) add(id, "encounterSetAside");
  for (const id of s.villainArea) add(id, "villainArea");
  for (const id of s.victoryDisplay) add(id, "victoryDisplay");
  for (const id of s.removedFromGame) add(id, "removedFromGame");
  for (const [id, instance] of Object.entries(s.instances)) {
    for (const t of instance.tucked) add(t, `tuckedUnder.${id}`);
    for (const b of instance.boostCards) add(b, `boostOn.${id}`);
  }
  return index;
}

/** The closing invariants of every game: no unanswered prompt, no card instance in two zones. */
function expectInvariants(sim: Sim) {
  const s = sim.state;
  expect(s.pendingChoice).toBeNull();
  const twice = [...zoneIndex(s)].filter(([, labels]) => labels.length > 1);
  expect(twice).toEqual([]);
}

/** The same game played again from its first op: the same state, deep-equal (the engine is deterministic by seed). */
function replayOf(sim: Sim, again: () => Sim): GameState {
  const fresh = again();
  return sim.ops.reduce((s, op) => op(s), fresh.state);
}

// ---------------------------------------------------------------------------------------------------------------
// Game A: solo, standard, Spider-Man, to a win
// ---------------------------------------------------------------------------------------------------------------

describe("Baron Zemo scenario, game A: solo (Spider-Man), standard, seed 1, played to a win", () => {
  const a = open([SPIDER_MAN]);
  const zemo = () => villainOf(a);
  const spider = () => identityOf(a.state, P1);

  it("setup (MC50 p. 18): masked Zemo (12 fixed hit points), stage 1A, three Board Members with 2 secret counters, evidence in two hidden piles", () => {
    expect(codeOf(a.state, zemo())).toBe("50165a");
    expect(maxHitPoints(a.state, zemo(), DEPS)).toBe(12);
    expect(codeOf(a.state, mainOf(a))).toBe("50167a");
    expect(stageNumber(a)).toBe(1);
    expect(mainThreat(a)).toBe(2); // 2[per_hero]
    expect(counts(a)).toEqual([2, 2, 2]);
    expect(attachments(a)).toEqual([]);
    // 50167a Setup: one evidence card of each kind in the A.I.M. pile, the other six in the S.H.I.E.L.D. pile.
    expect(aimOf(a.state)).toHaveLength(3);
    expect(shieldLeft(a.state)).toBe(6);
    expect(gainedCards(a.state)).toEqual([]);
    expect(openEvidenceRows(a.state, GRID)).toHaveLength(GRID.length);
    expect(playerOf(a.state, P1).identity.form).toBe("alterEgo");
    expect(a.state.pendingChoice).toBeNull();
  });

  it("round 1, player phase: the Tactical Board Member twice (2 [physical] each, 2 damage to Zemo each) empties it", () => {
    act(a, {}, toHero());
    give(a, P1, ...PHYSICAL.slice(0, 4));
    const tactical = memberOf(a.state, TACTICAL);
    for (let n = 0; n < 2; n++) {
      const pay = fromHand(hand(a, PHYSICAL.slice(n * 2, n * 2 + 2)));
      const events = act(a, { targets: [zemo()] }, use(P1, tactical, "50183a.chief-tactical-officer-action", pay));
      expect(ofType(events, "damageDealt")).toMatchObject([{ targetInstanceId: zemo(), amount: 2 }]);
    }
    expect(secrets(a, TACTICAL)).toBe(0);
    expect(damageOn(a, zemo())).toBe(4);
  });

  it("round 1: Swinging Web Kick for the last 8 hit points -> Zemo 'would be defeated', his hit points reset to 12 and 3 secret counters leave the environments", () => {
    give(a, P1, WEB_KICK, ...ENERGY.slice(0, 3));
    const kick = handIds(a, WEB_KICK)[0]!;
    const pay = hand(a, ENERGY.slice(0, 3));
    const medical = memberOf(a.state, MEDICAL);
    const events = act(a, { targets: [zemo(), medical] }, play(P1, kick, pay));
    expect(ofType(events, "damageDealt")).toMatchObject([{ targetInstanceId: zemo(), amount: 8 }]);
    expect(ofType(events, "hitPointsSet")).toHaveLength(1);
    expect(ofType(events, "characterDefeated")).toEqual([]);
    expect(a.state.villains[0]!.defeated).toBe(false);
    expect(damageOn(a, zemo())).toBe(0);
    expect(remainingHitPoints(a.state, zemo(), DEPS)).toBe(12);
    expect(counts(a)).toEqual([0, 1, 0]);
  });

  it("round 1: end of the player phase, the Response: 2 secret counters on the bare Tactical environment gain 2 evidence cards, crossing out their rows", () => {
    const rows = openEvidenceRows(a.state, GRID).length;
    stack(a, BLANK, AGENT, "01188", "01189");
    const tactical = memberOf(a.state, TACTICAL);
    const events = act(
      a,
      { take: ["zemos-manipulations"], options: ["Place 2 secret counters"], targets: [tactical] },
      endTurn(),
    );
    // Two cards from the S.H.I.E.L.D. pile are gained (faceup, kept by the players); their rows are crossed out.
    expect(shieldLeft(a.state)).toBe(4);
    const gained = gainedCards(a.state);
    expect(gained).toHaveLength(2);
    const left = openEvidenceRows(a.state, GRID);
    expect(left.length).toBeLessThan(rows);
    for (const row of left) for (const g of GUESSES) expect(gained).not.toContain(row[g]);
    // The mole's row is never crossed out: its three cards are in the A.I.M. pile.
    expect(left).toContainEqual(moleRow(a.state));
    expect(stageNumber(a)).toBe(1); // the advance was declined
    // Villain phase: Zemo (ATK 2) attacks the hero; the S.H.I.E.L.D. Agent is revealed and Quickstrikes (ATK 1).
    expect(ofType(events, "attackResolved").map((e) => [codeOf(a.state, e.enemyInstanceId), e.damageDealt])).toEqual([
      ["50165a", 2],
      [AGENT, 1],
    ]);
    expect(damageOn(a, spider())).toBe(3);
    expect(mainThreat(a)).toBe(4); // 2 + acceleration 2[per_hero]
    // Tactical 2 from the Response; the Agent's Forced Interrupt (activation) put 1 on the fewest, Medical (0).
    expect(counts(a)).toEqual([1, 1, 2]);
    expect(a.state.round).toBe(2);
  });

  it("round 2: Haymaker defeats the Agent (3 hit points); its Forced Interrupt on defeat adds 1 to the fewest", () => {
    const agent = inPlayCard(a.state, AGENT)!;
    expect(inst(a.state, agent).engagedWith).toBe(P1);
    give(a, P1, HAYMAKER, ...ENERGY.slice(0, 2));
    act(a, { targets: [agent] }, play(P1, handIds(a, HAYMAKER)[0]!, hand(a, ENERGY.slice(0, 2))));
    expect(piles(a.state).discard).toContain(agent);
    // The tie for the fewest secret counters (Medical 1, Surveillance 1) is the first player's pick: Medical.
    expect(counts(a)).toEqual([2, 1, 2]);
    expect(a.state.outcome).toBeNull();
  });

  it("round 2: Black Cat enters play; at the end of the player phase no environment is bare, so only the advance is offered (declined)", () => {
    give(a, P1, BLACK_CAT, ...PHYSICAL.slice(0, 2));
    act(a, {}, play(P1, handIds(a, BLACK_CAT)[0]!, hand(a, PHYSICAL.slice(0, 2))));
    expect(inPlayCard(a.state, BLACK_CAT)).toBeDefined();
    stack(a, BLANK, DIVIDED, "01188", "01189");
    const asked: string[][] = [];
    const watch: Picker = (s) => {
      if (s.pendingChoice!.prompt.kind === "chooseOption") asked.push(s.pendingChoice!.options.map((o) => o.label));
      return planner({ take: ["zemos-manipulations"] })(s);
    };
    act(a, watch, endTurn());
    expect(asked).toEqual([["Advance to stage 2A to make the accusation", "Do not advance"]]);
    expect(stageNumber(a)).toBe(1);
    // Divided Loyalties: 3 threat and Hinder 1[per_hero] (RRG 1.8 "Hinder X", enters play with X more threat).
    const divided = inPlayCard(a.state, DIVIDED)!;
    expect(inst(a.state, divided).threat).toBe(4);
    expect(mainThreat(a)).toBe(6);
    expect(damageOn(a, spider())).toBe(5);
    expect(counts(a)).toEqual([2, 1, 2]);
    expect(a.state.round).toBe(3);
  });

  it("round 3: Divided Loyalties makes Black Cat's attack cost 1 more resource (refused unpaid); the Surveillance Board Member, the hero and a paid Black Cat thwart defeat it", () => {
    const cat = inPlayCard(a.state, BLACK_CAT)!;
    const divided = inPlayCard(a.state, DIVIDED)!;
    give(a, P1, ...MENTAL.slice(0, 2), PHYSICAL[4]!);
    expect(rejection(a, attack(cat, zemo()))).toBe("insufficient_resources");
    expect(rejection(a, thwart(cat, divided))).toBe("insufficient_resources");
    expect(inst(a.state, cat).exhausted).toBe(false);
    // Chief Surveillance Officer: 2 [mental] -> remove 1 secret counter from it, then remove 2 threat from a scheme.
    const surveillance = memberOf(a.state, SURVEILLANCE);
    const pay = fromHand(hand(a, MENTAL.slice(0, 2)));
    const used = act(a, { targets: [divided] }, use(P1, surveillance, "50182a.chief-surveillance-officer-action", pay));
    expect(ofType(used, "threatRemoved")).toMatchObject([{ schemeInstanceId: divided, amount: 2 }]);
    expect(secrets(a, SURVEILLANCE)).toBe(0);
    expect(inst(a.state, divided).threat).toBe(2);
    // The hero's own thwart costs nothing extra; the ally's costs one resource of any type.
    act(a, {}, thwart(spider(), divided));
    expect(inst(a.state, divided).threat).toBe(1);
    const handBefore = playerOf(a.state, P1).hand.length;
    const paid = hand(a, [PHYSICAL[4]!]);
    const events = act(a, { targets: [memberOf(a.state, MEDICAL)] }, thwart(cat, divided, paid));
    expect(ofType(events, "additionalPowerCostPaid")).toMatchObject([{ power: "thwart" }]);
    expect(playerOf(a.state, P1).hand.length).toBe(handBefore - 1);
    expect(piles(a.state).discard).toContain(divided);
    // Divided Loyalties' When Defeated: 1[per_hero] secret counter removed from among the environments (Medical 2 -> 1).
    expect(counts(a)).toEqual([1, 0, 2]);
  });

  it("round 3: the Response gains 2 more evidence on the bare Surveillance environment and advances to the accusation; a correct accusation", () => {
    const mole = moleRow(a.state);
    const before = gainedCards(a.state);
    const plan: Plan = {
      take: ["zemos-manipulations"],
      options: ["Place 2 secret counters", "Advance to stage 2A", "Give Baron Zemo"],
      accuse: mole,
      targets: [memberOf(a.state, SURVEILLANCE)],
      defender: inPlayCard(a.state, BLACK_CAT)!,
    };
    // Finding the Sword (3A) shuffles the encounter deck (RRG "Find"): the villain phase is stacked once it has.
    const events = actUntil(a, plan, atZemoInterrupt, endTurn());
    // 1B Response: Surveillance (bare) took 2 counters and 2 evidence cards joined the 2 gained in round 1.
    expect(gainedCards(a.state)).toHaveLength(4);
    expect(gainedCards(a.state).slice(0, 2)).toEqual(before);
    expect(shieldLeft(a.state)).toBe(2);
    // 2A: the first player accused the mole's row; 2B identified the mole (the A.I.M. pile turns faceup) and found no wrong guess.
    expect(a.state.accusation).toMatchObject({ accused: mole, mole, wrong: [] });
    expect(a.state.revealedPileCards?.["aim"]).toHaveLength(3);
    expect(stageNumber(a)).toBe(3);
    // 3A: Zemo flips to his Unmasked face with 18 hit points per hero and Baron Zemo's Sword attached.
    expect(a.state.villains[0]!.side).toBe("B");
    expect(maxHitPoints(a.state, zemo(), DEPS)).toBe(18);
    expect(remainingHitPoints(a.state, zemo(), DEPS)).toBe(18);
    const sword = a.state.instances[zemo()]!.attachments.find((i) => codeOf(a.state, i) === SWORD);
    expect(sword).toBeDefined();
    // 3B: the mole (Tactical) flips to its attachment with its 2 secret counters; 1[per_hero] threat per counter on it.
    expect(mole.boardMember).toBe(TACTICAL);
    expect(attachments(a)).toEqual([TACTICAL]);
    expect(inst(a.state, memberOf(a.state, TACTICAL)).attachedTo).toBe(zemo());
    expect(counts(a)).toEqual([1, 2, 2]);
    expect(ofType(events, "threatPlaced").map((e) => e.amount)).toEqual([2, 2]);
    expect(mainThreat(a)).toBe(4); // the villain phase's acceleration (stage 3: 2[per_hero]) and 3B's 2
    expect(a.state.outcome).toBeNull();
  });

  it("round 3, villain phase: the Unmasked Zemo's interrupt offers a counter or a boost; Black Cat defends, dies, and the Sword's response places a counter", () => {
    expect(atZemoInterrupt(a.state)).toBe(true);
    expect(a.state.pendingChoice!.options.map((o) => o.label)).toEqual([
      "Place 1 secret counter on a Board Member card",
      "Give Baron Zemo an additional boost card for this activation",
    ]);
    stack(a, BLANK, BLANK, AGENT, "01188");
    const cat = inPlayCard(a.state, BLACK_CAT)!;
    const events = act(a, { options: ["Give Baron Zemo"], defender: cat });
    // Both boost cards are Zemo's: only the villain is given boost cards, once per activation (RRG "Activation").
    expect(ofType(events, "boostCardFlipped").map((e) => e.enemyInstanceId)).toEqual([zemo(), zemo()]);
    // ATK 2, +2 from the Sword, +1 from the Tactical Officer's Aid: 5 damage, all on the defender.
    expect(ofType(events, "attackResolved")[0]).toMatchObject({ enemyInstanceId: zemo(), baseAtk: 5, damageDealt: 5 });
    expect(ofType(events, "characterDefeated").map((e) => e.instanceId)).toContain(cat);
    expect(inPlayCard(a.state, BLACK_CAT)).toBeUndefined();
    // The Sword's Forced Response (it defeated a character) and the Agent's Forced Interrupt (its quickstrike attack is an
    // activation) each placed 1 secret counter: Medical 1 -> 2, then the tie at 2 went to the first player's pick, Medical.
    expect(counts(a)).toEqual([3, 2, 2]);
    expect(ofType(events, "attackResolved")[1]).toMatchObject({
      enemyInstanceId: inPlayCard(a.state, AGENT),
      damageDealt: 1,
    });
    expect(damageOn(a, spider())).toBe(6);
    expect(a.state.round).toBe(4);
    expect(a.state.outcome).toBeNull();
  });

  it("round 4: the hero attacks (2) and two Swinging Web Kicks (8 each) deal the Unmasked Zemo's 18 hit points: he is defeated and the players win", () => {
    give(a, P1, WEB_KICK, WEB_KICK, "01088", "01089", "01090", "01062", "01062", "01064");
    act(a, { targets: [zemo()] }, attack(spider(), zemo()));
    expect(damageOn(a, zemo())).toBe(2);
    for (let n = 0; n < 2; n++) {
      const kick = handIds(a, WEB_KICK)[0]!;
      const pay = hand(
        a,
        [
          ["01088", "01089", "01090"],
          ["01062", "01062", "01064"],
        ][n]!,
      );
      act(a, { targets: [zemo()] }, play(P1, kick, pay));
    }
    expect(a.state.villains[0]!.defeated).toBe(true);
    expect(a.state.outcome).toMatchObject({ result: "win" });
  });

  it("invariants: no prompt pending, no card in two zones", () => {
    expectInvariants(a);
  });

  it("replay: the game again from its first op ends in the same state", () => {
    expect(replayOf(a, () => open([SPIDER_MAN]))).toEqual(a.state);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Game B: solo, a wrong accusation that continues, then a loss by three Board Member attachments
// ---------------------------------------------------------------------------------------------------------------

describe("Baron Zemo scenario, game B: solo (Spider-Man), a wrong accusation that goes on, lost to three attachments", () => {
  const b = open([SPIDER_MAN]);
  const zemo = () => villainOf(b);
  const accusedBy = {
    row: undefined as EvidenceCombination | undefined,
    mole: undefined as EvidenceCombination | undefined,
  };

  it("round 1 (Spider-Man): the table is stripped of secret counters; the Response advances; the accusation names a wrong member and a wrong card", () => {
    act(b, {}, toHero());
    setSecrets(b, { [MEDICAL]: 0, [SURVEILLANCE]: 0, [TACTICAL]: 0 });
    accusedBy.mole = moleRow(b.state);
    accusedBy.row = wrongMemberRow(b.state);
    const plan: Plan = {
      take: ["zemos-manipulations"],
      options: ["Advance to stage 2A", "Give Baron Zemo"],
      accuse: accusedBy.row,
    };
    const events = actUntil(b, plan, atZemoInterrupt, endTurn());
    const mole = accusedBy.mole!;
    const row = accusedBy.row!;
    // The row names a wrong member (Surveillance, the accused) and one wrong card: two wrong guesses.
    expect(row.boardMember).toBe(SURVEILLANCE);
    expect(mole.boardMember).toBe(TACTICAL);
    expect(b.state.accusation?.wrong).toEqual(differing(row, mole));
    expect(b.state.accusation?.wrong).toHaveLength(2);
    // 2B: 1 secret counter on each Board Member card per wrong guess (2 each), then 3 more on the accused (5, which flips it).
    // 3B flips the mole as well, with the 2 counters it holds; the third member stays an environment at 2.
    expect(counts(b)).toEqual([2, 5, 2]);
    expect(attachments(b)).toEqual([SURVEILLANCE, TACTICAL]);
    // Threat: 3B's 1[per_hero] for each of the 5 + 2 secret counters on the attachments, and the acceleration 2[per_hero] of the villain phase that follows.
    expect(mainThreat(b)).toBe(9);
    expect(stageNumber(b)).toBe(3);
    expect(b.state.outcome).toBeNull();
    expect(events.length).toBeGreaterThan(0);
  });

  it("round 1, villain phase: Zemo's interrupt puts a counter on the third member; he hits the hero for 5; A.I.M. Interference puts a counter on every Board Member card, flips the third and loses the game", () => {
    expect(atZemoInterrupt(b.state)).toBe(true);
    const medical = memberOf(b.state, MEDICAL);
    stack(b, BLANK, INTERFERENCE_ENERGY, "01188");
    const events = act(b, { options: ["Place 1 secret counter"], targets: [medical] });
    // Zemo (ATK 2, +2 the Sword, +1 the Tactical Officer's Aid) hits the hero for 5; his interrupt had put 1 counter on Medical (3).
    expect(ofType(events, "attackResolved")).toMatchObject([{ enemyInstanceId: zemo(), baseAtk: 5, damageDealt: 5 }]);
    expect(ofType(events, "boostCardFlipped")).toHaveLength(1); // the counter was chosen instead of the additional boost card
    // A.I.M. Interference: Incite 1 (1 threat), then 1 secret counter on each Board Member card, in turn.
    expect(ofType(events, "encounterCardRevealed").map((e) => codeOf(b.state, e.instanceId))).toEqual([
      INTERFERENCE_ENERGY,
    ]);
    expect(mainThreat(b)).toBe(10);
    // Medical 3 -> 4 flips it: three Board Member attachments are in play and the players lose at once, before the
    // other two cards were given their counter (their prevent-or-place choice was never reached).
    expect(attachments(b)).toEqual(MEMBERS);
    expect(counts(b)).toEqual([4, 5, 2]);
    expect(b.state.outcome).toMatchObject({ result: "loss", reason: "cardAbility" });
    expect(b.state.pendingChoice).toBeNull();
  });

  it("invariants: no prompt pending, no card in two zones", () => {
    expectInvariants(b);
  });

  it("replay: the game again from its first op ends in the same state", () => {
    expect(replayOf(b, () => open([SPIDER_MAN]))).toEqual(b.state);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Game C: two players, the first player chooses
// ---------------------------------------------------------------------------------------------------------------

describe("Baron Zemo scenario, game C: two players (Spider-Man, Iron Man), P2 first player, through the accusation", () => {
  const c = open([SPIDER_MAN, IRON_MAN], "standard", 1);
  const zemo = () => villainOf(c);

  it("setup: P2 is the first player; the per-hero values double (2 threat per hero), Zemo's masked hit points do not", () => {
    expect(c.state.firstPlayerId).toBe(P2);
    expect(c.state.players).toHaveLength(2);
    expect(mainThreat(c)).toBe(4);
    expect(maxHitPoints(c.state, zemo(), DEPS)).toBe(12);
    expect(counts(c)).toEqual([2, 2, 2]);
    expect(aimOf(c.state)).toHaveLength(3);
    expect(shieldLeft(c.state)).toBe(6);
  });

  it("round 1: Peter plays Aunt May and exhausts her; the first player (P2) alone is offered the Response and the accusation", () => {
    act(c, {}, endTurn(P2));
    give(c, P1, "01006", "01007");
    act(c, {}, play(P1, handIds(c, "01006")[0]!, hand(c, ["01007"])));
    const aunt = inPlayCard(c.state, "01006")!;
    act(c, {}, use(P1, aunt, "01006.aunt-may-action"));
    expect(inst(c.state, aunt).exhausted).toBe(true);
    const asked: { player: string; kind: string }[] = [];
    const mole = moleRow(c.state);
    const row = rowDiffering(c.state, "means");
    const pick: Picker = (st) => {
      const choice = st.pendingChoice!;
      asked.push({ player: choice.playerId, kind: choice.prompt.kind });
      return planner({ take: ["zemos-manipulations"], options: ["Advance to stage 2A"], accuse: row })(st);
    };
    actUntil(c, pick, atZemoInterrupt, endTurn(P1));
    // The Response and the accusation are asked of the first player alone (RRG 1.8 "First Player", p. 19).
    const response = asked.filter(
      (q) => q.kind === "chooseTriggers" || q.kind === "chooseOption" || q.kind === "accuse",
    );
    expect(response.map((q) => q.player)).toEqual([P2, P2, P2]);
    // One wrong card: 1 secret counter on each Board Member card; 3B flips the mole (Medical) with its 3.
    expect(c.state.accusation).toMatchObject({ accused: row, mole, wrong: ["means"] });
    expect(mole.boardMember).toBe(MEDICAL);
    expect(counts(c)).toEqual([3, 3, 3]);
    expect(attachments(c)).toEqual([MEDICAL]);
    // Per hero: stage 3A starts with 2 x 2 threat, 3B places 2 per counter on the attachment (3 counters).
    expect(mainThreat(c)).toBe(10);
    // 3A: the Unmasked Zemo has 18 hit points per hero.
    expect(remainingHitPoints(c.state, zemo(), DEPS)).toBe(36);
    expect(maxHitPoints(c.state, zemo(), DEPS)).toBe(36);
    expect(c.state.outcome).toBeNull();
  });

  it("round 1, villain phase: Zemo activates against each hero and each chooses (interrupt of the player activated against); Undermine Support and Might Makes Right are dealt", () => {
    const interrupts: string[] = [];
    const prompts: string[] = [];
    const pick: Picker = (st) => {
      const choice = st.pendingChoice!;
      if (atZemoInterrupt(st)) interrupts.push(choice.playerId);
      prompts.push(choice.playerId + ":" + choice.prompt.kind + ":" + choice.options.map((o) => o.label).join("|"));
      return planner({ options: ["Give Baron Zemo"], pay: 1 })(st);
    };
    expect(atZemoInterrupt(c.state)).toBe(true);
    stack(c, BLANK, BLANK, "01187", "01187", UNDERMINE, MIGHT);
    const events = act(c, pick);
    // Each hero is activated against once, and the player activated against chooses (P2 first, in player order).
    expect(interrupts).toEqual([P2, P1]);
    // Both chose the additional boost card: 4 boost cards in all (2 per activation).
    expect(ofType(events, "boostCardFlipped")).toHaveLength(4);
    // Alter-ego heroes: Zemo schemes twice for 3 each (his SCH 3; the mole's Aid adds ATK only).
    expect(ofType(events, "schemeResolved").map((e) => e.threatPlaced)).toEqual([3, 3]);
    // The first player is dealt first: Undermine Support to P2 (3 threat + Hinder 1[per_hero] = 5), Might Makes Right to P1.
    expect(ofType(events, "encounterCardRevealed").map((e) => [codeOf(c.state, e.instanceId), e.playerId])).toEqual([
      [UNDERMINE, P2],
      [MIGHT, P1],
    ]);
    expect(inst(c.state, inPlayCard(c.state, UNDERMINE)!).threat).toBe(5);
    // Might Makes Right (Alter-Ego): 2 secret counters on the environment with the fewest: Surveillance and Tactical
    // tied at 3, a tie the first player (P2) settles; the counters took Tactical to 5, which flipped it.
    expect(counts(c)).toEqual([3, 3, 5]);
    expect(attachments(c)).toEqual([MEDICAL, TACTICAL]);
    expect(mainThreat(c)).toBe(16); // 10 + 3 + 3
    expect(c.state.round).toBe(2);
    expect(c.state.outcome).toBeNull();
  });

  it("round 2: Aunt May is exhausted again; with Undermine Support in play readying her costs a resource (paid by P1), and the Response is gone with stage 1", () => {
    // The first player token passed to P1 at the end of round 1.
    expect(c.state.firstPlayerId).toBe(P1);
    const aunt = inPlayCard(c.state, "01006")!;
    act(c, {}, use(P1, aunt, "01006.aunt-may-action"));
    expect(inst(c.state, aunt).exhausted).toBe(true);
    act(c, {}, endTurn(P1));
    stack(c, BLANK, BLANK, "01187", "01187", ENDS, AGENT);
    const asked: string[] = [];
    const pick: Picker = (st) => {
      const choice = st.pendingChoice!;
      asked.push(choice.playerId + ":" + choice.prompt.kind);
      return planner({ options: ["Give Baron Zemo", "Discard an ally"], targets: [aunt], pay: 1 })(st);
    };
    const events = act(c, pick, toHero(P2), endTurn(P2));
    // Step 3 of the player phase's end readies every card: Undermine Support asks P1 for 1 resource to ready the support.
    expect(asked).toContain("p1:spendResources");
    expect(asked).not.toContain("p2:spendResources");
    expect(ofType(events, "encounterCardRevealed").map((e) => [codeOf(c.state, e.instanceId), e.playerId])).toEqual([
      [ENDS, P1],
      [AGENT, P2],
    ]);
    // The Ends Justify the Means, second choice: Aunt May (printed cost 1) is discarded and 1 secret counter leaves the
    // environments (only Surveillance is still one): 3 -> 2, which the Agent's Forced Interrupt (its quickstrike attack on
    // Iron Man is an activation) put back to 3. P1 is the first player now, and splits the removal.
    expect(playerOf(c.state, P1).discard).toContain(aunt);
    expect(counts(c)).toEqual([3, 3, 5]);
    expect(damageOn(c, identityOf(c.state, P2))).toBe(7); // Zemo 6, the Agent 1
    expect(codeOf(c.state, inPlayCard(c.state, AGENT)!)).toBe(AGENT);
    expect(inst(c.state, inPlayCard(c.state, AGENT)!).engagedWith).toBe(P2);
    // Acceleration 2[per_hero] = 4, one scheme (3) against Peter; Zemo attacked Iron Man (hero form) instead.
    expect(ofType(events, "attackResolved")[0]).toMatchObject({ enemyInstanceId: villainOf(c), baseAtk: 6 });
    expect(mainThreat(c)).toBe(23);
    expect(c.state.round).toBe(3);
    expect(c.state.outcome).toBeNull();
  });

  it("invariants: no prompt pending, no card in two zones", () => {
    expectInvariants(c);
  });

  it("replay: the game again from its first op ends in the same state", () => {
    expect(replayOf(c, () => open([SPIDER_MAN, IRON_MAN], "standard", 1))).toEqual(c.state);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Game D: expert mode, the opening and the stage flip (50166a / 50166b)
// ---------------------------------------------------------------------------------------------------------------

describe("Baron Zemo scenario, game D: solo, expert, the opening and the flip to 50166b", () => {
  const d = open([SPIDER_MAN], "expert");
  const zemo = () => villainOf(d);

  it("setup: Zemo is the B card 50166a with 16 hit points and SCH 4; a Board Member joins him at 3 secret counters", () => {
    expect(codeOf(d.state, zemo())).toBe("50166a");
    expect(d.state.villains[0]!.side).toBe("A");
    expect(maxHitPoints(d.state, zemo(), DEPS)).toBe(16);
    expect(counts(d)).toEqual([2, 2, 2]);
    expect(attachments(d)).toEqual([]);
    expect(aimOf(d.state)).toHaveLength(3);
    expect(shieldLeft(d.state)).toBe(6);
    expect(stageNumber(d)).toBe(1);
  });

  it("round 1: the Response advances; a correct accusation flips the Steady Zemo (18 hit points per hero) and the mole", () => {
    const mole = moleRow(d.state);
    const plan: Plan = { take: ["zemos-manipulations"], options: ["Advance to stage 2A"], accuse: mole };
    actUntil(d, plan, atZemoInterrupt, endTurn());
    expect(d.state.accusation).toMatchObject({ wrong: [] });
    expect(stageNumber(d)).toBe(3);
    expect(codeOf(d.state, zemo())).toBe("50166a");
    expect(d.state.villains[0]!.side).toBe("B");
    expect(maxHitPoints(d.state, zemo(), DEPS)).toBe(18);
    expect(remainingHitPoints(d.state, zemo(), DEPS)).toBe(18);
    expect(hasKeyword(d.state, zemo(), "steady", DEPS)).toBe(true);
    expect(d.state.instances[zemo()]!.attachments.some((i) => codeOf(d.state, i) === SWORD)).toBe(true);
    expect(attachments(d)).toEqual([mole.boardMember]);
    expect(secrets(d, mole.boardMember as string)).toBe(2);
    // 50166b's interrupt is 2 counters, not 1.
    expect(d.state.pendingChoice!.options.map((o) => o.label)).toEqual([
      "Place 2 secret counters on a Board Member card",
      "Give Baron Zemo an additional boost card for this activation",
    ]);
  });

  it("round 1, villain phase: 2 counters take a third member from 2 to 4, and in expert mode it joins Zemo at 3", () => {
    const moleCard = d.state.accusation!.mole!.boardMember as string;
    const other = MEMBERS.find((code) => code !== moleCard)!;
    stack(d, BLANK, UNDERMINE);
    act(d, { options: ["Place 2 secret counters"], targets: [memberOf(d.state, other)] });
    expect(attachments(d).sort()).toEqual([moleCard, other].sort());
    expect(secrets(d, other)).toBe(4);
    // The counters stay on the card through the flip (owner answer Q1 = A); the Aid's Forced Response answers each placing once.
    expect(d.state.outcome).toBeNull();
    expect(d.state.round).toBe(2);
    expect(inPlayCard(d.state, UNDERMINE)).toBeDefined();
    // 3B's 2 (the mole's counters) and the acceleration 2[per_hero], then Zemo's scheme (SCH 4).
    expect(mainThreat(d)).toBe(8);
  });

  it("replay: the game again from its first op ends in the same state", () => {
    expect(replayOf(d, () => open([SPIDER_MAN], "expert"))).toEqual(d.state);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Game E: solo, standard, Reluctant Foe and Battle of Wits, each stacked and played in a real round
// ---------------------------------------------------------------------------------------------------------------

describe("Baron Zemo scenario, game E: solo (Spider-Man), standard, seed 1, Reluctant Foe and Battle of Wits", () => {
  const e = open([SPIDER_MAN], "standard", undefined, true);
  const CAPTAIN_MARVEL = "01010a";
  const FOE = "50171";
  const WITS = "50175";
  const finding: Picker = (s) =>
    s.pendingChoice!.prompt.kind === "searchCollection" ? [CAPTAIN_MARVEL] : planner({})(s);
  const hero = () =>
    (Object.keys(e.state.instances) as InstanceId[]).find((i) => codeOf(e.state, i) === CAPTAIN_MARVEL)!;
  const foe = () => (Object.keys(e.state.instances) as InstanceId[]).find((i) => codeOf(e.state, i) === FOE)!;

  it("round 1: Zemo's boost card, then Reluctant Foe is revealed: Captain Marvel enters play engaged with Spider-Man", () => {
    stack(e, BLANK, FOE);
    act(e, finding, endTurn(P1));
    expect(inst(e.state, foe()).attachedTo).toBe(hero());
    expect(inst(e.state, hero()).engagedWith).toBe(P1);
    expect(hasKeyword(e.state, hero(), "villainous", DEPS)).toBe(true);
    expect(maxHitPoints(e.state, hero(), DEPS)).toBe(12);
    expect(e.state.round).toBe(2);
  });

  it("round 2: Spider-Man defeats it: Captain Marvel and Reluctant Foe are removed from the game", () => {
    stage(e, (s) => patchInstance(s, hero(), { damage: 11 }));
    const events = act(e, planner({}), toHero(), attack(identityOf(e.state, P1), hero()));
    expect(ofType(events, "characterDefeated").map((x) => x.instanceId)).toEqual([hero()]);
    expect(e.state.removedFromGame).toEqual(expect.arrayContaining([hero(), foe()]));
    expect(playerOf(e.state, P1).discard).not.toContain(hero());
    expectInvariants(e);
  });

  it("round 2 villain phase: Battle of Wits makes Zemo scheme; X of 3 [mental] resources, paid at once, prevents 3 threat and removes 3 secret counters", () => {
    give(e, P1, ...MENTAL.slice(0, 2));
    const before = { secrets: counts(e).reduce((a, b) => a + b, 0) };
    stack(e, BLANK, WITS);
    const asked: string[][] = [];
    const payments: number[] = [];
    const plan = planner({});
    const events = act(
      e,
      (s) => {
        const choice = s.pendingChoice!;
        // "Spend X": the largest X offered, then the payment the engine lists first (the fewest cards that pay it).
        if (choice.prompt.kind === "chooseNumber") {
          asked.push(choice.options.map((o) => o.label));
          return [choice.options.at(-1)!.optionId];
        }
        if (choice.prompt.kind === "spendResources") {
          payments.push(choice.minSelections);
          return choice.options.slice(0, choice.minSelections).map((o) => o.optionId);
        }
        return plan(s);
      },
      endTurn(P1),
    );
    // Zemo's SCH is 3: one prompt for X (0 to 3), one payment, and all 3 threat prevented together.
    expect(asked).toEqual([["0", "1", "2", "3"]]);
    expect(payments).toHaveLength(1);
    expect(ofType(events, "threatPrevented").map((x) => x.amount)).toEqual([3]);
    expect(counts(e).reduce((a, b) => a + b, 0)).toBe(before.secrets - 3);
    expectInvariants(e);
  });

  it("replay: the game again from its first op ends in the same state", () => {
    expect(replayOf(e, () => open([SPIDER_MAN], "standard", undefined, true))).toEqual(e.state);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// What the games do not prove
// ---------------------------------------------------------------------------------------------------------------

describe("not played in a whole game", () => {
  it.todo("campaign mode: the envelopes arrive from the campaign log, the Setup counters and the 1-card gain differ");
  it.todo(
    "A.I.M. Interference's payment (spending X resources to prevent X counters): unit tests only (executive-board.test.ts)",
  );
  it.todo(
    "Baron Zemo's Sword Hero Action (3 [physical] or 3 [energy]): unit tests only (baron-zemo-encounter.test.ts)",
  );
  it.todo("a Board Member Hero Action's Medical (heal) mode: unit tests only (executive-board.test.ts)");
});
