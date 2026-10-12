import { WONDER_MAN_CARDS, cardId, type EventCard } from "@mc/content";
import {
  legalActions,
  paymentFor,
  replay,
  sessionApply,
  startSession,
  tryPayment,
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
 * Energy Siphon 58006 (H3.14) is the module's fourth card: spent with its Hero Interrupt it takes 1 to 3 damage, named
 * in the payment, and generates that much more [energy].
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

describe(`${ENERGY_SIPHON_INTERRUPT}: Hero Interrupt, when you spend this card, take up to 3 damage: 1 additional [energy] for each damage taken`, () => {
  const identity = (s: GameState): InstanceId => playerOf(s, P1).identity.instanceId;
  const ENERGY_POOL = (n: number) => ({ physical: 0, mental: 0, energy: n, wild: 0 });
  /** The Siphon spent with its interrupt taking `damage`, as a payment entry. */
  const siphoned = (siphon: InstanceId, damage?: number) => ({
    fromHand: siphon,
    whenSpent: {
      abilityId: ENERGY_SIPHON_INTERRUPT as never,
      ...(damage === undefined ? {} : { costSelection: { damageSelf: damage } }),
    },
  });
  /** `event` and one Energy Siphon alone in hand, and the command playing it with the Siphon taking `damage`. */
  function siphoning(base: GameState, event: string, damage?: number) {
    const t = staged(base, event, [SIPHON]);
    const [siphon] = t.paying as [InstanceId];
    const command: Command = { ...t.command, payment: [siphoned(siphon, damage)] } as Command;
    return { ...t, siphon, command };
  }
  const generatedBy = (events: readonly GameEvent[]) =>
    events.flatMap((e) => (e.type === "resourcesGenerated" ? [[e.abilityId, e.amount, e.pool]] : []));
  const siphonSources = (state: GameState, id: InstanceId, siphon: InstanceId) =>
    (paymentFor(state, P1, { kind: "playCard", instanceId: id }, {}, WAVE10_DEPS)?.sources ?? []).filter(
      (source) => source.instanceId === siphon,
    );

  it("is registered as a when-spent resource in hero form, taking 1 to 3 damage, and nothing of the module is skipped", () => {
    const definition = WONDER_MAN_EVENTS[ENERGY_SIPHON_INTERRUPT]!;
    expect(validateDefinition(definition)).toEqual([]);
    expect(definition.trigger).toEqual({ kind: "resource", whenSpent: true, form: "hero" });
    expect(definition.cost).toEqual({
      damageSelf: { choose: { min: { kind: "const", value: 1 }, max: { kind: "const", value: 3 } } },
    });
    expect(WONDER_MAN_EVENTS_SKIPPED).toEqual({});
  });

  it.each([
    [1, 2, 5],
    [2, 3, 7],
    [3, 4, 9],
  ])(
    "taking %i damage: exactly that on Wonder Man, %i [energy] in all, and Ionic Blast (cost 1) deals %i",
    (damage, energy, dealt) => {
      const t = siphoning(wonderManHeroGame(), BLAST, damage);
      const { state, events } = drive(t.state, t.command);
      expect(damageOf(state, identity(state))).toBe(damage);
      expect(generatedBy(events)).toEqual([[ENERGY_SIPHON_INTERRUPT, damage, ENERGY_POOL(damage)]]);
      const played = events.find((e) => e.type === "cardPlayed" && e.instanceId === t.id);
      expect(played).toMatchObject({ resourcesPaid: energy, paid: ENERGY_POOL(energy) });
      expect(damageOf(state, villainOf(state))).toBe(dealt);
      expect(playerOf(state, P1).discard).toEqual(expect.arrayContaining([t.id, t.siphon]));
    },
  );

  it("the damage is taken as the card is spent, before the event resolves", () => {
    const t = siphoning(wonderManHeroGame(), BLAST, 2);
    const { state, events } = drive(t.state, t.command);
    const taken = events.findIndex((e) => e.type === "damageDealt" && e.targetInstanceId === identity(state));
    const dealt = events.findIndex((e) => e.type === "damageDealt" && e.targetInstanceId === villainOf(state));
    expect(taken).toBeGreaterThan(-1);
    expect(dealt).toBeGreaterThan(taken);
  });

  it("the cap is 3 and the least is 1: taking 4 or 0 is refused, and nothing is taken", () => {
    const four = siphoning(wonderManHeroGame(), BLAST, 4);
    expect(rejected(four.state, four.command)).toBe(true);
    const none = siphoning(wonderManHeroGame(), BLAST, 0);
    expect(rejected(none.state, none.command)).toBe(true);
    expect(damageOf(four.state, identity(four.state))).toBe(0);
  });

  it("the payment prompt offers the plain spending (1 [energy]) and one option per amount (2, 3 and 4 [energy])", () => {
    const t = siphoning(wonderManHeroGame(), BLAST);
    const option = (n: number) => `hand:${t.siphon}:${ENERGY_SIPHON_INTERRUPT}@#damageSelf=${n}`;
    expect(
      siphonSources(t.state, t.id, t.siphon).map((s) => [s.optionId, s.pool, s.costSelection, s.spendsHandCard]),
    ).toEqual([
      [`hand:${t.siphon}`, ENERGY_POOL(1), undefined, undefined],
      [option(1), ENERGY_POOL(2), { damageSelf: 1 }, true],
      [option(2), ENERGY_POOL(3), { damageSelf: 2 }, true],
      [option(3), ENERGY_POOL(4), { damageSelf: 3 }, true],
    ]);
    const attempt = tryPayment(t.state, P1, { kind: "playCard", instanceId: t.id }, [option(3)], {}, WAVE10_DEPS);
    expect(attempt.ok).toBe(true);
    if (attempt.ok) expect(attempt.command).toMatchObject({ payment: [siphoned(t.siphon, 3)] });
  });

  it("the suggested payment is the plain spending when that pays: no damage is suggested", () => {
    const t = siphoning(wonderManHeroGame(), BLAST);
    const query = paymentFor(t.state, P1, { kind: "playCard", instanceId: t.id }, {}, WAVE10_DEPS)!;
    expect(query.suggested).toEqual([`hand:${t.siphon}`]);
    const actions = legalActions(t.state, P1, WAVE10_DEPS);
    if (actions.kind !== "turn") throw new Error(actions.kind);
    const legal = actions.legal.find((a) => a.action.kind === "playCard" && a.action.instanceId === t.id);
    expect(legal?.example).toMatchObject({ payment: [{ fromHand: t.siphon }] });
  });

  it("a card only the interrupt can pay for (Firebird, cost 2) is offered, taking the least damage that pays (1)", () => {
    const t = siphoning(wonderManHeroGame(), FIREBIRD);
    expect(rejected(t.state, play(P1, t.id, [t.siphon]))).toBe(true);
    const actions = legalActions(t.state, P1, WAVE10_DEPS);
    if (actions.kind !== "turn") throw new Error(actions.kind);
    const legal = actions.legal.find((a) => a.action.kind === "playCard" && a.action.instanceId === t.id);
    expect(legal?.example).toMatchObject({ payment: [siphoned(t.siphon, 1)] });
    const { state } = drive(t.state, legal!.example);
    expect(damageOf(state, identity(state))).toBe(1);
    expect(playerOf(state, P1).playArea).toContain(t.id);
  });

  it("with no amount named it takes the least (1): 2 [energy] in all", () => {
    const t = siphoning(wonderManHeroGame(), BLAST);
    const { state, events } = drive(t.state, t.command);
    expect(damageOf(state, identity(state))).toBe(1);
    expect(generatedBy(events)).toEqual([[ENERGY_SIPHON_INTERRUPT, 1, ENERGY_POOL(1)]]);
    expect(damageOf(state, villainOf(state))).toBe(5);
  });

  it("with a tough status card the damage could not be taken: the interrupt is not offered and is refused, the status card stays", () => {
    const base = wonderManHeroGame();
    const tough = patchInstance(base, identity(base), { statuses: { stunned: 0, confused: 0, tough: 1 } });
    const t = siphoning(tough, BLAST, 1);
    expect(siphonSources(t.state, t.id, t.siphon).map((s) => s.optionId)).toEqual([`hand:${t.siphon}`]);
    expect(rejected(t.state, t.command)).toBe(true);
    // The plain spending still pays.
    const { state } = drive(t.state, play(P1, t.id, [t.siphon]));
    expect(statusesOf(state, identity(state)).tough).toBe(1);
    expect(damageOf(state, identity(state))).toBe(0);
  });

  it("the card names no limit by hit points: with 1 hit point left all three amounts are still offered", () => {
    const base = wonderManHeroGame();
    const t = siphoning(patchInstance(base, identity(base), { damage: 11 }), BLAST);
    expect(siphonSources(t.state, t.id, t.siphon).map((s) => s.costSelection?.damageSelf)).toEqual([
      undefined,
      1,
      2,
      3,
    ]);
  });

  it("is a Hero Interrupt: in alter-ego form only the plain spending is offered, and the interrupt is refused", () => {
    const t = siphoning(wonderManGame(), FANS, 1);
    expect(siphonSources(t.state, t.id, t.siphon).map((s) => s.optionId)).toEqual([`hand:${t.siphon}`]);
    expect(rejected(t.state, t.command)).toBe(true);
    const { state } = drive(t.state, play(P1, t.id, [t.siphon]));
    expect(playerOf(state, P1).playArea).toContain(t.id);
    expect(damageOf(state, identity(state))).toBe(0);
  });

  it("spent plainly it is 1 [energy], unchanged: it pays the cost of 1 of Starstruck exactly, no damage, nothing overpaid, no stun", () => {
    const t = staged(wonderManHeroGame(), STRUCK, [SIPHON]);
    const { state, events } = drive(t.state, t.command);
    expect(playerOf(state, P1).discard).toEqual(expect.arrayContaining([t.id, ...t.paying]));
    expect(statusesOf(state, villainOf(state)).stunned).toBe(0);
    expect(damageOf(state, identity(state))).toBe(0);
    expect(generatedBy(events)).toEqual([]);
  });

  it("overpaying Starstruck through the interrupt stuns: 1 damage taken, 2 [energy] for a cost of 1", () => {
    const t = siphoning(wonderManHeroGame(), STRUCK, 1);
    const { state } = drive(t.state, t.command);
    expect(damageOf(state, identity(state))).toBe(1);
    expect(statusesOf(state, villainOf(state)).stunned).toBe(1);
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
