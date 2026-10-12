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
  endTurn,
  firstLegal,
  identityOf,
  inst,
  mainThreat,
  moveToHand,
  patchInstance,
  payWith,
  play,
  playerOf,
  stackEncounterDeck,
  toHero,
  type Picker,
} from "../../../testing/harness.js";
import { withForm } from "../../../testing/staging.js";
import { WAVE10_DEPS, engageMinion, hulklingGame, hulklingHeroGame, stagedInPlay } from "../../testing.js";
import { HULKLING_EVENTS, HULKLING_EVENTS_SKIPPED } from "./events.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Hulkling's events, docs/phase7-wave10-box-heroes.md B3.9, B3.11 and B7.2: Shapeshifter Strike 56037, Armored Defense
 * 56038, Impersonation 56039 and Shapeshifter 56040, played in the printed precon `hulkling-protection` against Core's
 * Rhino. Hero face: THW 1, ATK 1, DEF 1. Hulkling's own Chosen Shape (56029a) is another module: every game here
 * arranges its Shapeshift upgrade by surgery, and nothing relies on that ability firing.
 */
const STRIKE_A = "56037.shapeshifter-strike-action";
const DEFENSE_I = "56038.armored-defense-interrupt";
const IMPERSONATION_A = "56039.impersonation-action";
const SHAPESHIFTER_A = "56040.shapeshifter-action";
const STRIKE = "56037";
const DEFENSE = "56038";
const IMPERSONATION = "56039";
const SHAPESHIFTER = "56040";
const HULK_SHAPE = "56033";
const WINGED_SHAPE = "56032";
const ARMORED_SHAPE = "56034";
const HULK_R = "56033.hulk-shape-response";
const SPIDER_TRACER = "01007"; // Core upgrade, not a Shapeshift upgrade
const SHOCKER = "01103"; // Core minion without guard, ATK 2, 3 hit points
const MODOK = "01184"; // Core minion, 8 hit points
const ADVANCE = "01186"; // Core treachery: "The villain schemes", 0 boost icons

const villainOf = (s: GameState): InstanceId => s.activeVillainId!;
const ofType = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const withMainThreat = (s: GameState, threat: number): GameState =>
  patchInstance(s, s.mainScheme.instanceId, { threat });
const stunned = (s: GameState, id: InstanceId): GameState =>
  patchInstance(s, id, { statuses: { ...inst(s, id).statuses, stunned: 1 } });

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
/** A Spider-Tracer (a Core upgrade, not a Shapeshift upgrade) in play on Hulkling, taken from the top of the deck. */
const withTracer = (state: GameState) => {
  const top = playerOf(state, P1).deck[0]!;
  return stagedInPlay(patchInstance(state, top, { cardId: cardId(SPIDER_TRACER) }), SPIDER_TRACER, { attach: true });
};
const withShape = (code: string, opts: { exhausted?: boolean } = {}) => {
  const s = stagedInPlay(hulklingHeroGame(), code, { attach: true });
  return { ...s, state: opts.exhausted ? patchInstance(s.state, s.id, { exhausted: true }) : s.state };
};

describe("Hulkling events registry", () => {
  const printed = (code: string): string[] =>
    (CW_CARDS.find((c) => c.id === cardId(code)) as EventCard).abilities.map((a) => a.id as string);

  it("every ability validates, with the printed timing", () => {
    for (const id of [STRIKE_A, IMPERSONATION_A, SHAPESHIFTER_A])
      expect(validateDefinition(HULKLING_EVENTS[id]!), id).toEqual([]);
    for (const id of [STRIKE_A, IMPERSONATION_A, SHAPESHIFTER_A])
      expect(HULKLING_EVENTS[id]!.trigger, id).toMatchObject({ kind: "action", form: "hero" });
  });

  it("three of the four printed refs are registered; Armored Defense waits on an engine fix", () => {
    expect(Object.keys(HULKLING_EVENTS_SKIPPED)).toEqual([DEFENSE_I]);
    expect(HULKLING_EVENTS_SKIPPED[DEFENSE_I]).toContain("atEndOfAttack");
    expect(printed(STRIKE)).toEqual([STRIKE_A]);
    expect(printed(DEFENSE)).toEqual([DEFENSE_I]);
    expect(printed(IMPERSONATION)).toEqual([IMPERSONATION_A]);
    expect(printed(SHAPESHIFTER)).toEqual([SHAPESHIFTER_A]);
    expect(Object.keys(HULKLING_EVENTS).sort()).toEqual([STRIKE_A, IMPERSONATION_A, SHAPESHIFTER_A].sort());
  });
});

describe(`${STRIKE_A}: Hero Action (attack): deal 5 damage to an enemy, ready your Shapeshift upgrade`, () => {
  it("is a Hero Action: refused in alter-ego form", () => {
    const { state, command } = staged(hulklingGame(), STRIKE, 2);
    expect(rejected(state, command)).toBe(true);
  });

  it("deals exactly 5 to the chosen enemy, readies the exhausted shape, and discards the event", () => {
    const shape = withShape(ARMORED_SHAPE, { exhausted: true });
    const { state, id, command } = staged(engageMinion(shape.state, MODOK, "modok"), STRIKE, 2);
    const { state: after, events } = drive(state, command, picks("modok" as InstanceId));
    expect(inst(after, "modok" as InstanceId).damage).toBe(5);
    expect(inst(after, villainOf(after)).damage).toBe(0);
    // M.O.D.O.K.'s retaliate 2 hits Hulkling afterwards; the Strike's own damage is the single 5.
    expect(ofType(events, "damageDealt").map((d) => [d.targetInstanceId, d.amount])).toEqual([
      ["modok", 5],
      [identityOf(after), 2],
    ]);
    expect(inst(after, shape.id).exhausted).toBe(false);
    expect(playerOf(after, P1).discard).toContain(id);
  });

  it("with no Shapeshift upgrade in play the damage is still dealt and nothing is readied", () => {
    const upgrade = withTracer(hulklingHeroGame());
    const spent = patchInstance(upgrade.state, upgrade.id, { exhausted: true });
    const { state, command } = staged(spent, STRIKE, 2);
    const villain = villainOf(state);
    const { state: after } = drive(state, command, picks(villain));
    expect(inst(after, villain).damage).toBe(5);
    expect(inst(after, upgrade.id).exhausted).toBe(true);
  });

  it("readies only the Shapeshift upgrade, not another exhausted upgrade or Hulkling", () => {
    const shape = withShape(WINGED_SHAPE, { exhausted: true });
    const other = withTracer(shape.state);
    let s = patchInstance(other.state, other.id, { exhausted: true });
    s = patchInstance(s, identityOf(s), { exhausted: true });
    const { state, command } = staged(s, STRIKE, 2);
    const { state: after } = drive(state, command, picks(villainOf(state)));
    expect(inst(after, shape.id).exhausted).toBe(false);
    expect(inst(after, other.id).exhausted).toBe(true);
    expect(inst(after, identityOf(after)).exhausted).toBe(true);
  });

  it("the readied shape answers the Strike itself: Hulk Shape deals 2 more and exhausts again", () => {
    const shape = withShape(HULK_SHAPE, { exhausted: true });
    const { state, command } = staged(shape.state, STRIKE, 2);
    const villain = villainOf(state);
    const accept: Picker = (s) => {
      const choice = s.pendingChoice!;
      const hit = choice.options.find((o) => o.optionId.endsWith(`:${HULK_R}`));
      return hit ? [hit.optionId] : picks(villain)(s);
    };
    const { state: after } = drive(state, command, accept);
    expect(inst(after, villain).damage).toBe(7);
    expect(inst(after, shape.id).exhausted).toBe(true);
  });
});

/**
 * Armored Defense is not registered (see HULKLING_EVENTS_SKIPPED): the two tests marked below fail against the engine.
 * The block stays, skipped, as the acceptance test for the engine fix; unskip it together with the script in events.ts.
 */
describe.skip(`${DEFENSE_I}: Hero Interrupt (defense): when an enemy attacks, deal damage to it equal to your DEF; after the attack, give Hulkling a tough status card`, () => {
  /** Hulkling in hero form (with `shape` if given), the villain's boost card neutral, and Armored Defense in hand. */
  function game(opts: { shape?: string; stunVillain?: boolean; minion?: boolean; alterEgo?: boolean } = {}) {
    let s = opts.alterEgo ? hulklingGame() : hulklingHeroGame();
    if (opts.shape) s = stagedInPlay(s, opts.shape, { attach: true }).state;
    if (opts.minion) s = engageMinion(s, SHOCKER, "shocker");
    if (opts.stunVillain) s = stunned(s, villainOf(s));
    s = stackEncounterDeck(s, ADVANCE, ADVANCE);
    const given = moveToHand(s, P1, DEFENSE);
    return { state: given.state, id: given.ids[0] as InstanceId };
  }
  /**
   * Plays Armored Defense (paying 1) when it is offered, if `accept`. At the Declare Defender step the basic defense is
   * taken (`basic`) or declined; everything else as `firstLegal`.
   */
  const defending = (
    id: InstanceId,
    seen: { offered: boolean },
    opts: { accept?: boolean; basic?: boolean } = {},
  ): Picker => {
    return (s) => {
      const choice = s.pendingChoice!;
      const option = choice.options.find((o) => o.optionId === `${id}:${DEFENSE_I}`);
      if (choice.prompt.kind === "chooseTriggers" && option) {
        seen.offered = true;
        return opts.accept === false ? [] : [option.optionId];
      }
      if (choice.prompt.kind === "payForCard") return choice.options.slice(0, 1).map((o) => o.optionId);
      if (choice.prompt.kind === "declareDefender" && opts.basic) {
        const hero = choice.options.find((o) => o.optionId !== "decline");
        if (hero) return [hero.optionId];
      }
      return firstLegal(s);
    };
  };
  const damageTaken = (before: GameState, after: GameState) =>
    inst(after, identityOf(after)).damage - inst(before, identityOf(before)).damage;
  const villainHits = (events: readonly GameEvent[], s: GameState) =>
    ofType(events, "damageDealt")
      .filter((d) => d.targetInstanceId === villainOf(s))
      .map((d) => d.amount);

  it("against the villain: it takes damage equal to DEF (2 with Hulk Shape), Hulkling becomes the defender and gets tough after the attack", () => {
    const g = game({ shape: HULK_SHAPE });
    const control = drive(g.state, endTurn(), defending(g.id, { offered: false }, { accept: false })).state;
    const undefended = damageTaken(g.state, control);
    expect(undefended).toBe(2);
    expect(inst(control, villainOf(control)).damage).toBe(0);

    const seen = { offered: false };
    const { state: after, events } = drive(g.state, endTurn(), defending(g.id, seen));
    expect(seen.offered).toBe(true);
    expect(villainHits(events, after)).toEqual([2]);
    // The label alone does not subtract DEF (RRG 1.8 "Defend, Defense", pp. 15-16): the basic defense was declined.
    expect(damageTaken(g.state, after)).toBe(undefended);
    expect(inst(after, identityOf(after)).statuses.tough).toBe(1);
    expect(playerOf(after, P1).discard).toContain(g.id);
  });

  it("the tough card comes after the damage: the attack is not reduced by it", () => {
    const g = game({ shape: HULK_SHAPE });
    const { state: after } = drive(g.state, endTurn(), defending(g.id, { offered: false }));
    expect(inst(after, identityOf(after)).statuses.tough).toBe(1);
    expect(inst(after, identityOf(after)).damage).toBe(2);
  });

  it("Hulkling is still offered the basic defense, and taking it subtracts his DEF (base 1) from the attack", () => {
    const g = game();
    const { state: after, events } = drive(g.state, endTurn(), defending(g.id, { offered: false }, { basic: true }));
    expect(villainHits(events, after)).toEqual([1]);
    expect(damageTaken(g.state, after)).toBe(1);
    expect(inst(after, identityOf(after)).exhausted).toBe(true);
    expect(inst(after, identityOf(after)).statuses.tough).toBe(1);
  });

  it("with Armored Shape (DEF 3) the villain takes 3, then retaliate 1", () => {
    const g = game({ shape: ARMORED_SHAPE });
    const { state: after, events } = drive(g.state, endTurn(), defending(g.id, { offered: false }));
    expect(villainHits(events, after)).toEqual([3, 1]);
  });

  it("declined, nothing happens: no damage to the enemy, no tough card, the event stays in hand", () => {
    const g = game({ shape: HULK_SHAPE });
    const seen = { offered: false };
    const { state: after } = drive(g.state, endTurn(), defending(g.id, seen, { accept: false }));
    expect(seen.offered).toBe(true);
    expect(inst(after, villainOf(after)).damage).toBe(0);
    expect(inst(after, identityOf(after)).statuses.tough).toBe(0);
    expect(playerOf(after, P1).hand).toContain(g.id);
  });

  it("a minion that survives the damage still attacks, and Hulkling gets the tough card when the attack ends", () => {
    const g = game({ stunVillain: true, minion: true });
    const control = drive(g.state, endTurn(), defending(g.id, { offered: false }, { accept: false })).state;
    const { state: after } = drive(g.state, endTurn(), defending(g.id, { offered: false }));
    expect(inst(after, "shocker" as InstanceId).damage).toBe(1);
    expect(damageTaken(g.state, after)).toBe(damageTaken(g.state, control));
    expect(damageTaken(g.state, after)).toBe(2);
    expect(inst(after, identityOf(after)).statuses.tough).toBe(1);
  });

  it("a minion defeated by the damage ends its attack, and Hulkling still gets the tough card (ruling January 11, 2026)", () => {
    const g = game({ shape: ARMORED_SHAPE, stunVillain: true, minion: true });
    const seen = { offered: false };
    const { state: after } = drive(g.state, endTurn(), defending(g.id, seen));
    expect(seen.offered).toBe(true);
    expect(playerOf(after, P1).discard).toContain(g.id);
    expect(playerOf(after, P1).playArea).not.toContain("shocker");
    expect(inst(after, identityOf(after)).damage).toBe(0);
    expect(inst(after, identityOf(after)).statuses.tough).toBe(1);
  });

  it("is a Hero Interrupt: not offered in alter-ego form", () => {
    const g = game({ alterEgo: true, stunVillain: true, minion: true });
    const seen = { offered: false };
    const { state: after } = drive(g.state, endTurn(), defending(g.id, seen));
    expect(seen.offered).toBe(false);
    expect(inst(after, identityOf(after)).statuses.tough).toBe(0);
    expect(playerOf(after, P1).hand).toContain(g.id);
  });

  it("may be played during an attack on another player", () => {
    const base = withForm(hulklingHeroGame({ twoPlayers: true }), { heroForm: 0 }, "p2" as never);
    const armored = stagedInPlay(base, HULK_SHAPE, { attach: true }).state;
    let s = engageMinion(armored, MODOK, "theirs", "p2" as never);
    s = stunned(s, villainOf(s));
    s = stackEncounterDeck(s, ADVANCE, ADVANCE);
    const given = moveToHand(s, P1, DEFENSE);
    const id = given.ids[0] as InstanceId;
    const seen = { offered: false };
    const { state: first } = drive(given.state, endTurn());
    const { state: after } = drive(first, endTurn("p2" as never), defending(id, seen));
    expect(seen.offered).toBe(true);
    // The villain's attack on the second player comes first and is the one answered.
    expect(inst(after, villainOf(after)).damage).toBe(2);
    expect(inst(after, identityOf(after, P1)).statuses.tough).toBe(1);
  });
});

describe(`${IMPERSONATION_A}: Hero Action (thwart): remove 4 threat from a scheme; if that removes the last threat, you may change to alter-ego form`, () => {
  const form = (s: GameState) => playerOf(s, P1).identity.form;
  /** Accepts the change of form when it is offered (an option labelled with alter-ego), else declines. */
  const changing =
    (accept: boolean): Picker =>
    (s) => {
      const choice = s.pendingChoice!;
      if (choice.prompt.kind === "chooseOption") {
        const hit = choice.options.find((o) => /alter-ego/i.test(o.label));
        if (hit && accept) return [hit.optionId];
        const no = choice.options.find((o) => !/alter-ego/i.test(o.label));
        return no ? [no.optionId] : [];
      }
      return firstLegal(s);
    };

  it("is a Hero Action: refused in alter-ego form", () => {
    const { state, command } = staged(withMainThreat(hulklingGame(), 4), IMPERSONATION, 2);
    expect(rejected(state, command)).toBe(true);
  });

  it("with threat left over it removes 4, offers no change of form, and Hulkling stays in hero form", () => {
    const { state, id, command } = staged(withMainThreat(hulklingHeroGame(), 9), IMPERSONATION, 2);
    const { state: after } = drive(state, command, changing(true));
    expect(mainThreat(after)).toBe(5);
    expect(form(after)).toBe("hero");
    expect(playerOf(after, P1).discard).toContain(id);
  });

  it("removing exactly the last 4 lets you change to alter-ego form, and accepting does", () => {
    const { state, command } = staged(withMainThreat(hulklingHeroGame(), 4), IMPERSONATION, 2);
    const { state: after } = drive(state, command, changing(true));
    expect(mainThreat(after)).toBe(0);
    expect(form(after)).toBe("alterEgo");
  });

  it("it is a may: declining leaves Hulkling in hero form", () => {
    const { state, command } = staged(withMainThreat(hulklingHeroGame(), 4), IMPERSONATION, 2);
    const { state: after } = drive(state, command, changing(false));
    expect(mainThreat(after)).toBe(0);
    expect(form(after)).toBe("hero");
  });

  it("a scheme with fewer than 4 threat is emptied and the change is offered", () => {
    const { state, command } = staged(withMainThreat(hulklingHeroGame(), 1), IMPERSONATION, 2);
    const { state: after } = drive(state, command, changing(true));
    expect(mainThreat(after)).toBe(0);
    expect(form(after)).toBe("alterEgo");
  });

  it("a scheme with no threat has none removed, so no change of form is offered", () => {
    const { state, command } = staged(withMainThreat(hulklingHeroGame(), 0), IMPERSONATION, 2);
    const { state: after } = drive(state, command, changing(true));
    expect(form(after)).toBe("hero");
  });

  it("a confused hero removes no threat (the confusion is spent), so no change of form is offered", () => {
    const base = withMainThreat(hulklingHeroGame(), 3);
    const confused = patchInstance(base, identityOf(base), {
      statuses: { ...inst(base, identityOf(base)).statuses, confused: 1 },
    });
    const { state, command } = staged(confused, IMPERSONATION, 2);
    const { state: after } = drive(state, command, changing(true));
    expect(mainThreat(after)).toBe(3);
    expect(form(after)).toBe("hero");
    expect(inst(after, identityOf(after)).statuses.confused).toBe(0);
  });

  it("the change by the card does not use up your own change of form that round (RRG 1.8 p. 21)", () => {
    const { state, command } = staged(withMainThreat(hulklingHeroGame(), 4), IMPERSONATION, 2);
    const { state: flipped } = drive(state, command, changing(true));
    expect(form(flipped)).toBe("alterEgo");
    const { state: back } = drive(flipped, toHero());
    expect(form(back)).toBe("hero");
  });
});

describe(`${SHAPESHIFTER_A}: Hero Action: search your deck and discard pile for a Shapeshift upgrade, add it to your hand, shuffle`, () => {
  const relocate = (s: GameState, id: InstanceId, to: "deck" | "discard"): GameState => ({
    ...s,
    players: s.players.map((p) => {
      if (p.playerId !== P1) return p;
      const rest = {
        ...p,
        hand: p.hand.filter((i) => i !== id),
        deck: p.deck.filter((i) => i !== id),
        discard: p.discard.filter((i) => i !== id),
      };
      return to === "discard" ? { ...rest, discard: [...rest.discard, id] } : { ...rest, deck: [id, ...rest.deck] };
    }),
  });
  /** A Shapeshift upgrade in the discard pile (`fromDiscard`), one on top of the deck (`fromDeck`), and a non-Shapeshift upgrade on top. */
  function game() {
    let s = hulklingHeroGame();
    const [a, b, c] = playerOf(s, P1).deck as [InstanceId, InstanceId, InstanceId];
    s = patchInstance(s, a, { cardId: cardId(WINGED_SHAPE) });
    s = patchInstance(s, b, { cardId: cardId(HULK_SHAPE) });
    s = patchInstance(s, c, { cardId: cardId(SPIDER_TRACER) });
    s = relocate(relocate(relocate(s, a, "discard"), b, "deck"), c, "deck");
    return { state: s, fromDiscard: a, fromDeck: b, other: c };
  }

  it("is a Hero Action: refused in alter-ego form", () => {
    const { state, command } = staged(hulklingGame(), SHAPESHIFTER, 0);
    expect(rejected(state, command)).toBe(true);
  });

  it("offers only Shapeshift upgrades of deck and discard pile; the pick is added to the hand and the deck shuffled", () => {
    const g = game();
    const { state, id, command } = staged(g.state, SHAPESHIFTER, 0);
    const offered: InstanceId[] = [];
    const watching: Picker = (s) => {
      const choice = s.pendingChoice!;
      if (choice.prompt.kind === "chooseCards") {
        for (const o of choice.options) if (o.ref.kind === "card") offered.push(o.ref.instanceId);
        const hit = choice.options.find((o) => o.ref.kind === "card" && o.ref.instanceId === g.fromDiscard);
        if (hit) return [hit.optionId];
      }
      return firstLegal(s);
    };
    const { state: after, events } = drive(state, command, watching);
    expect(offered).toEqual(expect.arrayContaining([g.fromDeck, g.fromDiscard]));
    expect(offered).not.toContain(g.other);
    for (const o of offered) expect(inst(state, o).cardId).toMatch(/^5603[2-5]$/);
    expect(playerOf(after, P1).hand).toContain(g.fromDiscard);
    expect(playerOf(after, P1).discard).not.toContain(g.fromDiscard);
    expect(playerOf(after, P1).deck).toContain(g.fromDeck);
    expect(playerOf(after, P1).deck).toContain(g.other);
    expect(playerOf(after, P1).discard).toContain(id);
    expect(ofType(events, "deckShuffled")).toHaveLength(1);
  });

  it("the pick may come from the deck", () => {
    const g = game();
    const { state, command } = staged(g.state, SHAPESHIFTER, 0);
    const { state: after } = drive(state, command, picks(g.fromDeck));
    expect(playerOf(after, P1).hand).toContain(g.fromDeck);
    expect(playerOf(after, P1).discard).toContain(g.fromDiscard);
  });

  it("with no Shapeshift upgrade to find nothing is added and the deck is still shuffled", () => {
    let s = hulklingHeroGame();
    const p = playerOf(s, P1);
    for (const id of [...p.hand, ...p.deck, ...p.discard])
      if (/^5603[2-5]$/.test(inst(s, id).cardId as string)) s = patchInstance(s, id, { cardId: cardId(SPIDER_TRACER) });
    const { state, command } = staged(s, SHAPESHIFTER, 0);
    const handBefore = playerOf(state, P1).hand.length;
    const { state: after, events } = drive(state, command);
    expect(playerOf(after, P1).hand).toHaveLength(handBefore - 1);
    expect(ofType(events, "deckShuffled")).toHaveLength(1);
  });
});
