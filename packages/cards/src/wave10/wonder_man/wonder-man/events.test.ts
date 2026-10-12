import { WONDER_MAN_CARDS, cardId, type EventCard } from "@mc/content";
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
  inst,
  mainThreat,
  moveToHand,
  patchInstance,
  play,
  playerOf,
  type Picker,
} from "../../../testing/harness.js";
import { WAVE10_DEPS, engageMinion, wonderManGame, wonderManHeroGame } from "../../testing.js";
import { WONDER_MAN_EVENTS, WONDER_MAN_EVENTS_SKIPPED } from "./events.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Wonder Man's events, docs/phase7-wave10-hero-packs.md H3.13 and H8.4 line HS2: Active Altruism 58003, Ionic Blast
 * 58004 and Starstruck 58005, played from the hand in the hand-built Justice deck `WONDER_MAN_DECK` against Core's
 * Rhino. Ionic Physiology is not scripted by this module (the identity module owns it), so nothing here depends on it:
 * Wonder Man's ATK is his printed 1 and no event is tucked after it resolves.
 *
 * Each case seats exactly the event and the cards that pay for it in the hand, so the overpayment is the one the
 * test names. Payers: Energy 58023 (2 [energy]), Energy Siphon 58006 (1 [energy] when spent plainly), Battlefield
 * Benevolence 58016 (1 [physical]), Firebird 58012 and Hawkeye 58013 (1 [energy] each), Scarlet Witch 58014 (1
 * [mental]) and Wonder Fans 58007 (1 [wild]).
 */
const ACTIVE_ALTRUISM = "58003.active-altruism-action";
const ENERGY_SIPHON_INTERRUPT = "58006.energy-siphon-interrupt";
const IONIC_BLAST = "58004.ionic-blast-action";
const STARSTRUCK = "58005.starstruck-action";
const ALTRUISM = "58003";
const BLAST = "58004";
const STRUCK = "58005";
const ENERGY = "58023"; // 2 [energy]
const SIPHON = "58006"; // 1 [energy]
const BENEVOLENCE = "58016"; // 1 [physical]
const FIREBIRD = "58012"; // 1 [energy]
const HAWKEYE = "58013"; // 1 [energy]
const WITCH = "58014"; // 1 [mental]
const FANS = "58007"; // 1 [wild]
const MODOK = "01184"; // Core minion, 8 hit points, no guard

const villainOf = (s: GameState): InstanceId => s.activeVillainId!;
const damageOf = (s: GameState, id: InstanceId): number => inst(s, id).damage;
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

/** The event and exactly the cards that pay for it in P1's hand, and the command that plays it paying with all of them. */
function staged(base: GameState, event: string, payers: readonly string[]) {
  const given = moveToHand(base, P1, event, ...payers);
  const [id, ...paying] = given.ids as [InstanceId, ...InstanceId[]];
  const state: GameState = {
    ...given.state,
    players: given.state.players.map((p) => (p.playerId === P1 ? { ...p, hand: [id, ...paying] } : p)),
  };
  return { state, id, paying, command: play(P1, id, paying) };
}
const statusesOf = (s: GameState, id: InstanceId) => inst(s, id).statuses;

describe("Wonder Man events registry", () => {
  const printed = (code: string): string[] =>
    (WONDER_MAN_CARDS.find((c) => c.id === cardId(code)) as EventCard).abilities.map((a) => a.id as string);

  it("every ability validates, as a Hero Action with its printed label", () => {
    for (const id of [ACTIVE_ALTRUISM, IONIC_BLAST, STARSTRUCK])
      expect(validateDefinition(WONDER_MAN_EVENTS[id]!), id).toEqual([]);
    for (const id of [ACTIVE_ALTRUISM, IONIC_BLAST, STARSTRUCK])
      expect(WONDER_MAN_EVENTS[id]!.trigger, id).toMatchObject({ kind: "action", form: "hero" });
  });

  it("the three event refs are registered and none is skipped", () => {
    expect(printed(ALTRUISM)).toEqual([ACTIVE_ALTRUISM]);
    expect(printed(BLAST)).toEqual([IONIC_BLAST]);
    expect(printed(STRUCK)).toEqual([STARSTRUCK]);
    for (const id of [ACTIVE_ALTRUISM, IONIC_BLAST, STARSTRUCK]) {
      expect(WONDER_MAN_EVENTS_SKIPPED[id]).toBeUndefined();
      expect(WONDER_MAN_EVENTS[id]).toBeDefined();
    }
  });
});

describe("Energy Siphon 58006 (resource)", () => {
  it("its ability is skipped with a reason (engine gap), nothing of it is registered", () => {
    expect(Object.keys(WONDER_MAN_EVENTS_SKIPPED)).toEqual([ENERGY_SIPHON_INTERRUPT]);
    expect(WONDER_MAN_EVENTS[ENERGY_SIPHON_INTERRUPT]).toBeUndefined();
  });

  it("spent plainly it is 1 [energy]: it pays the cost of 1 of Starstruck exactly, nothing overpaid, no stun", () => {
    const t = staged(wonderManHeroGame(), STRUCK, [SIPHON]);
    const { state } = drive(t.state, t.command);
    expect(playerOf(state, P1).discard).toEqual(expect.arrayContaining([t.id, ...t.paying]));
    expect(statusesOf(state, villainOf(state)).stunned).toBe(0);
  });
});

describe(`${ACTIVE_ALTRUISM}: remove 1 threat, 2 more for each [energy] overpaid (at most 2)`, () => {
  const run = (payers: readonly string[], threat = 10) => {
    const t = staged(withMainThreat(wonderManHeroGame(), threat), ALTRUISM, payers);
    const { state } = drive(t.state, t.command);
    return { t, state };
  };

  it("cost 0 paid with nothing: 1 threat; the event is discarded", () => {
    const { t, state } = run([]);
    expect(mainThreat(state)).toBe(9);
    expect(playerOf(state, P1).discard).toContain(t.id);
  });

  it("paid with a [physical] card: nothing is [energy], 1 threat; the card is spent anyway", () => {
    const { t, state } = run([BENEVOLENCE]);
    expect(mainThreat(state)).toBe(9);
    expect(playerOf(state, P1).discard).toEqual(expect.arrayContaining([t.id, ...t.paying]));
  });

  it("1 [energy] overpaid: 3 threat", () => {
    expect(mainThreat(run([SIPHON]).state)).toBe(7);
  });

  it("2 [energy] overpaid (one card, two icons): 5 threat", () => {
    expect(mainThreat(run([ENERGY]).state)).toBe(5);
  });

  it("the maximum is 2 [energy]: 3 and 4 [energy] overpaid still remove 5", () => {
    expect(mainThreat(run([ENERGY, SIPHON]).state)).toBe(5);
    expect(mainThreat(run([ENERGY, SIPHON, FIREBIRD]).state)).toBe(5);
  });

  it("only [energy] counts: an [energy] and a [mental] card overpay 1 [energy] (3 threat)", () => {
    expect(mainThreat(run([SIPHON, WITCH]).state)).toBe(7);
  });

  it("a wild resource may be named as [energy] when overpaying (January 17, 2026 - Ruling 4 (1)): 3 threat", () => {
    expect(mainThreat(run([FANS]).state)).toBe(7);
  });

  it("the whole amount is one thwart of one scheme: threat removed stops at the scheme's threat", () => {
    expect(mainThreat(run([ENERGY], 3).state)).toBe(0);
  });

  it("is a Hero Action: refused in alter-ego form", () => {
    const t = staged(wonderManGame(), ALTRUISM, []);
    expect(rejected(t.state, t.command)).toBe(true);
  });
});

describe(`${IONIC_BLAST}: 3 damage, 2 more for each [energy] overpaid (at most 3)`, () => {
  const run = (payers: readonly string[]) => {
    const t = staged(wonderManHeroGame(), BLAST, payers);
    const { state } = drive(t.state, t.command);
    return { t, state, villain: villainOf(state) };
  };

  it("cost 1 paid with one [physical] card exactly: 3 damage; the event is discarded", () => {
    const { t, state, villain } = run([BENEVOLENCE]);
    expect(damageOf(state, villain)).toBe(3);
    expect(playerOf(state, P1).discard).toEqual(expect.arrayContaining([t.id, ...t.paying]));
  });

  it("paid with one [energy] exactly: the cost is met, nothing is overpaid, 3 damage", () => {
    const { state, villain } = run([SIPHON]);
    expect(damageOf(state, villain)).toBe(3);
  });

  it("the insert's example: Energy (2 [energy]) and a [physical] card, the [physical] pays: 2 [energy] overpaid, 7 damage", () => {
    const { state, villain } = run([ENERGY, BENEVOLENCE]);
    expect(damageOf(state, villain)).toBe(7);
  });

  it("two [energy] icons for cost 1: 1 overpaid, 5 damage", () => {
    const { state, villain } = run([ENERGY]);
    expect(damageOf(state, villain)).toBe(5);
  });

  it("four [energy] icons: 3 overpaid, 9 damage", () => {
    const { state, villain } = run([ENERGY, SIPHON, FIREBIRD]);
    expect(damageOf(state, villain)).toBe(9);
  });

  it("five [energy] icons: 4 overpaid, still capped at 3 [energy]: 9 damage", () => {
    const { state, villain } = run([ENERGY, SIPHON, FIREBIRD, HAWKEYE]);
    expect(damageOf(state, villain)).toBe(9);
  });

  it("the damage is dealt to the chosen enemy only, as one attack", () => {
    const base = engageMinion(wonderManHeroGame(), MODOK, "modok");
    const t = staged(base, BLAST, [ENERGY, BENEVOLENCE]);
    const { state } = drive(t.state, t.command, picks("modok" as InstanceId));
    expect(damageOf(state, "modok" as InstanceId)).toBe(7);
    expect(damageOf(state, villainOf(state))).toBe(0);
  });

  it("is a Hero Action: refused in alter-ego form", () => {
    const t = staged(wonderManGame(), BLAST, [BENEVOLENCE]);
    expect(rejected(t.state, t.command)).toBe(true);
  });

  it("unpaid (cost 1): refused", () => {
    const t = staged(wonderManHeroGame(), BLAST, []);
    expect(rejected(t.state, t.command)).toBe(true);
  });
});

describe(`${STARSTRUCK}: damage equal to your ATK; stun that enemy if overpaid with [energy]`, () => {
  const run = (payers: readonly string[]) => {
    const t = staged(wonderManHeroGame(), STRUCK, payers);
    const { state } = drive(t.state, t.command);
    return { t, state, villain: villainOf(state) };
  };

  it("paid exactly with one [energy]: damage equal to his ATK of 1, no stun", () => {
    const { state, villain } = run([SIPHON]);
    expect(damageOf(state, villain)).toBe(1);
    expect(statusesOf(state, villain).stunned).toBe(0);
  });

  it("overpaid with a [mental] card (1 overpaid): not [energy], no stun", () => {
    const { state, villain } = run([WITCH, BENEVOLENCE]);
    expect(damageOf(state, villain)).toBe(1);
    expect(statusesOf(state, villain).stunned).toBe(0);
  });

  it("overpaid with [energy] (Energy, 2 icons for cost 1): the enemy is stunned, after the damage", () => {
    const { t, state, villain } = run([ENERGY]);
    expect(damageOf(state, villain)).toBe(1);
    expect(statusesOf(state, villain).stunned).toBe(1);
    expect(playerOf(state, P1).discard).toContain(t.id);
  });

  it("a wild resource overpaid is named [energy] (January 17, 2026 - Ruling 4 (1)): stunned", () => {
    const { state, villain } = run([FANS, BENEVOLENCE]);
    expect(statusesOf(state, villain).stunned).toBe(1);
  });

  it("stuns the enemy attacked, not another one", () => {
    const base = engageMinion(wonderManHeroGame(), MODOK, "modok");
    const t = staged(base, STRUCK, [ENERGY]);
    const { state } = drive(t.state, t.command, picks("modok" as InstanceId));
    expect(damageOf(state, "modok" as InstanceId)).toBe(1);
    expect(statusesOf(state, "modok" as InstanceId).stunned).toBe(1);
    expect(statusesOf(state, villainOf(state)).stunned).toBe(0);
    expect(damageOf(state, villainOf(state))).toBe(0);
  });

  it("is a Hero Action: refused in alter-ego form", () => {
    const t = staged(wonderManGame(), STRUCK, [SIPHON]);
    expect(rejected(t.state, t.command)).toBe(true);
  });
});
