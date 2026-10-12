import { CW_CARDS, cardId, type EventCard } from "@mc/content";
import {
  replay,
  sessionApply,
  startSession,
  type Command,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { validateDefinition } from "../../../dsl/validate.js";
import {
  P1,
  firstLegal,
  identityOf,
  inst,
  mainThreat,
  moveToHand,
  patchInstance,
  payWith,
  play,
  playerOf,
  type Picker,
} from "../../../testing/harness.js";
import { WAVE10_DEPS, engageMinion, tigraGame, tigraHeroGame } from "../../testing.js";
import { TIGRA_EVENTS, TIGRA_EVENTS_SKIPPED } from "./events.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Tigra's events, docs/phase7-wave10-box-heroes.md B3.8 and B7.1: Tooth and Claw 56008 and Feline Senses 56009, played
 * from the hand in the printed precon `tigra-aggression` against Core's Rhino. Question 16 = A (owner, 2026-10-11,
 * provisional): Tooth and Claw's two sentences are independent, so both 4s may name one enemy.
 */
const COST_CONSTANT = "56008.tooth-and-claw-constant";
const TOOTH_AND_CLAW = "56008.tooth-and-claw-action";
const FELINE_SENSES = "56009.feline-senses-action";
const TOOTH = "56008";
const FELINE = "56009";
const MERCENARY = "01101"; // Core minion with guard, 3 hit points
const SHOCKER = "01103"; // Core minion without guard, 3 hit points
const MODOK = "01184"; // Core minion, 8 hit points

const villainOf = (s: GameState): InstanceId => s.activeVillainId!;
const damageOf = (s: GameState, id: InstanceId): number => inst(s, id).damage;
const ofType = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const withMainThreat = (s: GameState, threat: number): GameState =>
  patchInstance(s, s.mainScheme.instanceId, { threat });

/** Applies `command`, answering each choice with `pick`; the log replays to the same state. */
function drive(state: GameState, command: Command, pick: Picker = firstLegal) {
  let session = startSession(state);
  const events: GameEvent[] = [];
  const first = sessionApply(session, command, WAVE10_DEPS);
  if (!first.ok) throw new Error(`${command.type} rejected: ${first.error.code}: ${first.error.message}`);
  session = first.session;
  events.push(...first.events);
  for (let guard = 0; session.state.pendingChoice && !session.state.outcome; guard++) {
    if (guard > 100) throw new Error(`choices did not settle (${session.state.pendingChoice.prompt.kind})`);
    const choice = session.state.pendingChoice;
    const next = sessionApply(
      session,
      {
        type: "resolveChoice",
        playerId: choice.playerId,
        choiceId: choice.choiceId,
        selectedOptionIds: pick(session.state),
      },
      WAVE10_DEPS,
    );
    if (!next.ok) throw new Error(`resolveChoice rejected: ${next.error.code}: ${next.error.message}`);
    session = next.session;
    events.push(...next.events);
  }
  const replayed = replay(session.log, WAVE10_DEPS);
  if (!replayed.ok) throw new Error(replayed.error.message);
  expect(replayed.state).toEqual(session.state);
  return { state: session.state, events };
}
const rejected = (state: GameState, command: Command): boolean =>
  !sessionApply(startSession(state), command, WAVE10_DEPS).ok;

/** Answers target choices with `targets` in order (taking the first listed one on offer); anything else as `firstLegal`. */
const picks =
  (...targets: readonly InstanceId[]): Picker =>
  (state) => {
    const choice = state.pendingChoice;
    const wanted = targets[0];
    const hit =
      choice && wanted !== undefined
        ? choice.options.find((o) => o.ref.kind === "card" && o.ref.instanceId === wanted)
        : undefined;
    if (hit) {
      targets = targets.slice(1);
      return [hit.optionId];
    }
    return firstLegal(state);
  };

/** `code` in P1's hand and the command that plays it, paying `cost` with other hand cards. */
function staged(state: GameState, code: string, cost: number) {
  const given = moveToHand(state, P1, code);
  const [id] = given.ids as [InstanceId];
  return { state: given.state, id, command: play(P1, id, payWith(given.state, P1, cost, [id])) };
}
const minions = (state: GameState, count: number): GameState => {
  let s = state;
  for (let n = 0; n < count; n++) s = engageMinion(s, MODOK, `modok-${n}`);
  return s;
};

describe("Tigra events registry", () => {
  const printed = (code: string): string[] =>
    (CW_CARDS.find((c) => c.id === cardId(code)) as EventCard).abilities.map((a) => a.id as string);

  it("every ability validates, with the printed timing", () => {
    for (const id of [COST_CONSTANT, TOOTH_AND_CLAW, FELINE_SENSES])
      expect(validateDefinition(TIGRA_EVENTS[id]!), id).toEqual([]);
    expect(TIGRA_EVENTS[COST_CONSTANT]!.trigger).toMatchObject({ kind: "constant" });
    expect(TIGRA_EVENTS[TOOTH_AND_CLAW]!.trigger).toMatchObject({ kind: "action", form: "hero" });
    expect(TIGRA_EVENTS[FELINE_SENSES]!.trigger).toMatchObject({ kind: "action", form: "hero" });
  });

  it("all three printed refs are registered and none is skipped", () => {
    expect(TIGRA_EVENTS_SKIPPED).toEqual({});
    expect(printed(TOOTH)).toEqual([COST_CONSTANT, TOOTH_AND_CLAW]);
    expect(printed(FELINE)).toEqual([FELINE_SENSES]);
    expect(Object.keys(TIGRA_EVENTS).sort()).toEqual([COST_CONSTANT, FELINE_SENSES, TOOTH_AND_CLAW].sort());
  });
});

describe(`${COST_CONSTANT}: reduce the cost to play this event by 1 for each minion engaged with you`, () => {
  it.each([
    [0, 4],
    [1, 3],
    [2, 2],
    [3, 1],
    [4, 0],
    [5, 0],
  ])("with %i engaged minion(s) it costs %i", (engaged, cost) => {
    const base = minions(tigraHeroGame(), engaged);
    const exact = staged(base, TOOTH, cost);
    const { state: after } = drive(exact.state, exact.command);
    expect(playerOf(after, P1).discard).toContain(exact.id);
    expect(playerOf(after, P1).hand).toHaveLength(playerOf(exact.state, P1).hand.length - 1 - cost);
    if (cost > 0) {
      const short = staged(base, TOOTH, cost - 1);
      expect(rejected(short.state, short.command)).toBe(true);
    }
  });

  it("only minions engaged with you count: one engaged with the other player does not reduce it", () => {
    const two = tigraHeroGame({ twoPlayers: true });
    const base = engageMinion(two, MODOK, "theirs", "p2" as never);
    const full = staged(base, TOOTH, 4);
    expect(playerOf(drive(full.state, full.command).state, P1).discard).toContain(full.id);
    const short = staged(base, TOOTH, 3);
    expect(rejected(short.state, short.command)).toBe(true);
  });
});

describe(`${TOOTH_AND_CLAW}: Hero Action (attack): deal 4 damage to an enemy, then 4 damage to an enemy (question 16 = A)`, () => {
  it("is a Hero Action: refused in alter-ego form", () => {
    const { state, command } = staged(tigraGame(), TOOTH, 4);
    expect(rejected(state, command)).toBe(true);
  });

  it("both instances may name the villain: 8 damage in two instances of 4, the event discarded", () => {
    const { state, id, command } = staged(tigraHeroGame(), TOOTH, 4);
    const villain = villainOf(state);
    const { state: after, events } = drive(state, command, picks(villain, villain));
    expect(damageOf(after, villain)).toBe(8);
    expect(ofType(events, "damageDealt").map((d) => [d.targetInstanceId, d.amount])).toEqual([
      [villain, 4],
      [villain, 4],
    ]);
    expect(playerOf(after, P1).discard).toContain(id);
  });

  it("the two instances may name two different enemies: 4 each", () => {
    const base = engageMinion(tigraHeroGame(), MODOK, "modok");
    const { state, command } = staged(base, TOOTH, 3);
    const villain = villainOf(state);
    const { state: after } = drive(state, command, picks(villain, "modok" as InstanceId));
    expect(damageOf(after, villain)).toBe(4);
    expect(damageOf(after, "modok" as InstanceId)).toBe(4);
  });

  it("the second enemy is chosen after the first damage: a defeated guard minion lets the villain be named", () => {
    const base = engageMinion(tigraHeroGame(), MERCENARY, "merc");
    const { state, command } = staged(base, TOOTH, 3);
    const villain = villainOf(state);
    const offered: InstanceId[][] = [];
    const watching: Picker = (s) => {
      const choice = s.pendingChoice;
      if (choice?.prompt.kind === "chooseTarget")
        offered.push(choice.options.flatMap((o) => (o.ref.kind === "card" ? [o.ref.instanceId] : [])));
      return picks("merc" as InstanceId, villain)(s);
    };
    const { state: after } = drive(state, command, watching);
    expect(offered[0]).toEqual(["merc"]);
    expect(offered[1]).toContain(villain);
    expect(playerOf(after, P1).playArea).not.toContain("merc");
    expect(damageOf(after, villain)).toBe(4);
  });
});

describe(`${FELINE_SENSES}: Hero Action (thwart): remove 3 threat from a scheme; if that removes the last threat, stun a minion`, () => {
  const stunnedOf = (s: GameState, id: InstanceId): number => inst(s, id).statuses.stunned;
  const withMinions = (threat: number, player = tigraHeroGame()): GameState =>
    engageMinion(engageMinion(withMainThreat(player, threat), SHOCKER, "shocker"), MODOK, "modok");

  it("is a Hero Action: refused in alter-ego form", () => {
    const { state, command } = staged(withMainThreat(tigraGame(), 5), FELINE, 2);
    expect(rejected(state, command)).toBe(true);
  });

  it("with threat left over it removes 3 and stuns nobody", () => {
    const { state, id, command } = staged(withMinions(5), FELINE, 2);
    const { state: after } = drive(state, command);
    expect(mainThreat(after)).toBe(2);
    expect(stunnedOf(after, "shocker" as InstanceId)).toBe(0);
    expect(stunnedOf(after, "modok" as InstanceId)).toBe(0);
    expect(playerOf(after, P1).discard).toContain(id);
  });

  it("removing exactly the last 3 stuns the minion chosen, and only that one", () => {
    const { state, command } = staged(withMinions(3), FELINE, 2);
    const { state: after } = drive(state, command, picks("modok" as InstanceId));
    expect(mainThreat(after)).toBe(0);
    expect(stunnedOf(after, "modok" as InstanceId)).toBe(1);
    expect(stunnedOf(after, "shocker" as InstanceId)).toBe(0);
  });

  it("a scheme with fewer than 3 threat is emptied and a minion is stunned", () => {
    const { state, command } = staged(withMinions(1), FELINE, 2);
    const { state: after } = drive(state, command, picks("shocker" as InstanceId));
    expect(mainThreat(after)).toBe(0);
    expect(stunnedOf(after, "shocker" as InstanceId)).toBe(1);
    expect(stunnedOf(after, "modok" as InstanceId)).toBe(0);
  });

  it("with no minion in play the last threat is still removed and nothing breaks", () => {
    const { state, command } = staged(withMainThreat(tigraHeroGame(), 3), FELINE, 2);
    const { state: after } = drive(state, command);
    expect(mainThreat(after)).toBe(0);
  });

  it("a scheme with no threat has none removed, so no minion is stunned", () => {
    const { state, command } = staged(withMinions(0), FELINE, 2);
    const { state: after } = drive(state, command);
    expect(mainThreat(after)).toBe(0);
    expect(stunnedOf(after, "shocker" as InstanceId)).toBe(0);
    expect(stunnedOf(after, "modok" as InstanceId)).toBe(0);
  });

  it("a confused hero removes no threat (the confusion is spent), so nothing is stunned", () => {
    const base = withMinions(2);
    const confused = patchInstance(base, identityOf(base, P1), {
      statuses: { ...inst(base, identityOf(base, P1)).statuses, confused: 1 },
    });
    const { state, command } = staged(confused, FELINE, 2);
    const { state: after } = drive(state, command);
    expect(mainThreat(after)).toBe(2);
    expect(stunnedOf(after, "shocker" as InstanceId)).toBe(0);
    expect(inst(after, identityOf(after, P1)).statuses.confused).toBe(0);
  });
});
