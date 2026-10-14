import { WONDER_MAN_CARDS, type AnyCard } from "@mc/content";
import {
  applyCommand,
  characterProfile,
  type Command,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { drive } from "../../../dsl/wave10-labor.testing.js";
import { validateDefinition } from "../../../dsl/validate.js";
import {
  P1,
  changeForm,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  instancesOf,
  moveToHand,
  patchInstance,
  play,
  playerOf,
  use,
  type Picker,
} from "../../../testing/harness.js";
import { WAVE10_DEPS, stagedInPlay, wonderManGame, wonderManHeroGame } from "../../testing.js";
import {
  WONDER_MAN_SUPPORT_UPGRADES_ALLIES,
  WONDER_MAN_SUPPORT_UPGRADES_ALLIES_SKIPPED,
} from "./support-upgrades-allies.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Wonder Man's support and upgrades (58007 Wonder Fans, 58008 Jet Belt, 58009 Mr. Hollywood, 58010 Signature Sunglasses, 58011 "What Are
 * You?", 58009 Mr. Hollywood), docs/phase7-wave10-hero-packs.md H3.12 and H8.4 line
 * HS3, in real games against Core's Rhino with the hand-built Justice deck `WONDER_MAN_DECK`. Ionic Physiology (58002)
 * is in play from setup; cards are tucked under it by surgery where a case needs them already there, and a card goes to
 * the discard pile by surgery where it needs to be there. No ruling since RRG 1.7 names these cards.
 */
const FANS_ACTION = "58007.wonder-fans-action";
const BELT_EVENT = "58008.jet-belt-resource";
const BELT_TUCKED = "58008.jet-belt-hero-resource";
const HOLLYWOOD = "58009.mr-hollywood-resource";
const SUNGLASSES = "58010.signature-sunglasses-response";
const WHAT_ARE_YOU = "58011.what-are-you-forced-interrupt";
const R = WONDER_MAN_SUPPORT_UPGRADES_ALLIES;

const PHYSIOLOGY = "58002";
const ALTRUISM = "58003"; // event, [energy], cost 0
const BLAST = "58004"; // event, [energy], cost 1
const STRUCK = "58005"; // event, [energy], cost 1
const ENERGY = "58023"; // resource, [energy] x2
const BENEVOLENCE = "58016"; // event, [physical]
const FANS = "58007";
const BELT = "58008";
const SUNGLASSES_CARD = "58010";
const WHAT_CARD = "58011";

const data = (code: string) => WONDER_MAN_CARDS.find((c) => (c.id as string) === code)! as AnyCard;
const codeOf = (s: GameState, id: InstanceId): string => inst(s, id).cardId as string;
const accepted = (s: GameState, command: Command): boolean => applyCommand(s, command, WAVE10_DEPS).ok;
const run = (s: GameState, command: Command, pick: Picker = firstLegal) => drive(s, command, pick, WAVE10_DEPS);
const physiologyOf = (s: GameState): InstanceId => instancesOf(s, PHYSIOLOGY)[0]!;
const tucked = (s: GameState): InstanceId[] => [...inst(s, physiologyOf(s)).tucked];
const discardOf = (s: GameState): InstanceId[] => [...playerOf(s, P1).discard];
const handOf = (s: GameState): InstanceId[] => [...playerOf(s, P1).hand];
const hero = (s: GameState) => characterProfile(s, identityOf(s), WAVE10_DEPS)!;

/** Surgery: the first copy of each code, wherever it is in P1's deck or hand, moved to the top of the discard pile. */
function toDiscard(state: GameState, ...codes: readonly string[]): { state: GameState; ids: InstanceId[] } {
  const given = moveToHand(state, P1, ...codes);
  const ids = [...given.ids];
  return {
    ids,
    state: {
      ...given.state,
      players: given.state.players.map((p) =>
        p.playerId === P1 ? { ...p, hand: p.hand.filter((i) => !ids.includes(i)), discard: [...p.discard, ...ids] } : p,
      ),
    },
  };
}
/** Surgery: `n` cards of the deck (never the named codes) tucked under Ionic Physiology. */
function withTucked(
  state: GameState,
  n: number,
  avoid: readonly string[] = [],
): { state: GameState; ids: InstanceId[] } {
  const ids = playerOf(state, P1)
    .deck.filter((i) => !avoid.includes(codeOf(state, i)))
    .slice(0, n);
  const stripped: GameState = {
    ...state,
    players: state.players.map((p) => (p.playerId === P1 ? { ...p, deck: p.deck.filter((i) => !ids.includes(i)) } : p)),
  };
  return { state: patchInstance(stripped, physiologyOf(state), { tucked: [...tucked(state), ...ids] }), ids };
}
/**
 * Answers each prompt with the first of `wanted` (text or an instance id, in order, each used once) that an option
 * of the prompt contains; a prompt none of them fits is answered as `firstLegal` (declining anything optional).
 */
function choosing(...wanted: readonly string[]): Picker {
  const left = [...wanted];
  return (state) => {
    const choice = state.pendingChoice;
    if (!choice) return [];
    for (const [index, want] of left.entries()) {
      const hit = choice.options.find((o) =>
        /^id+$/.test(want)
          ? o.optionId === want
          : String(o.label).includes(want) || JSON.stringify(o.ref).includes(`"${want}"`),
      );
      if (!hit) continue;
      left.splice(index, 1);
      return [hit.optionId];
    }
    return firstLegal(state);
  };
}
/** The options the pending choice offers, as text. */
const offered = (s: GameState): string[] => (s.pendingChoice?.options ?? []).map((o) => JSON.stringify(o));
const firstChoice = (s: GameState, command: Command): GameState => {
  const result = applyCommand(s, command, WAVE10_DEPS);
  if (!result.ok) throw new Error(`${command.type} rejected: ${result.error.code}: ${result.error.message}`);
  return result.state;
};
const ofType = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe("Wonder Man support and upgrades registry", () => {
  it("every ability validates", () => {
    for (const [id, definition] of Object.entries(R)) expect(validateDefinition(definition), id).toEqual([]);
  });

  it("printed timing: alter-ego action, two hero resources, a plain response, a forced interrupt", () => {
    expect(R[FANS_ACTION]!.trigger).toMatchObject({ kind: "action", form: "alterEgo" });
    expect(R[BELT_EVENT]!.trigger).toMatchObject({ kind: "resource", form: "hero" });
    expect(R[BELT_TUCKED]!.trigger).toMatchObject({ kind: "resource", form: "hero" });
    expect(R[SUNGLASSES]!.trigger).toMatchObject({ kind: "response" });
    expect((R[SUNGLASSES]!.trigger as { forced?: boolean }).forced).toBeFalsy();
    expect(R[WHAT_ARE_YOU]!.trigger).toMatchObject({ kind: "interrupt", forced: true });
  });

  it("every printed ref is registered or skipped with a reason; none is skipped", () => {
    const refs = ["58007", "58008", "58009", "58010", "58011"].flatMap((c) =>
      (data(c) as unknown as { abilities: { id: unknown }[] }).abilities.map((a) => a.id as string),
    );
    expect(refs.sort()).toEqual([FANS_ACTION, BELT_EVENT, BELT_TUCKED, HOLLYWOOD, SUNGLASSES, WHAT_ARE_YOU].sort());
    expect(Object.keys(R).sort()).toEqual(refs.sort());
    expect(WONDER_MAN_SUPPORT_UPGRADES_ALLIES_SKIPPED).toEqual({});
  });
});

describe(`${FANS_ACTION}: Alter-Ego Action, exhaust Wonder Fans, choose to tuck an energy event or draw 1`, () => {
  function table(discard: readonly string[], held = 0) {
    const d = toDiscard(wonderManGame(), ...discard);
    const t = withTucked(d.state, held, [ALTRUISM, BLAST, STRUCK, BENEVOLENCE, ENERGY]);
    const fans = stagedInPlay(t.state, FANS);
    return { ...fans, discarded: d.ids, held: t.ids, command: use(P1, fans.id, FANS_ACTION) };
  }

  it("tuck: the chosen event goes from the discard pile under Ionic Physiology; Wonder Fans is exhausted", () => {
    const t = table([ALTRUISM, BLAST]);
    const { state } = run(t.state, t.command, choosing("Tuck", t.discarded[1]!));
    expect(tucked(state)).toEqual([t.discarded[1]]);
    expect(discardOf(state)).toContain(t.discarded[0]);
    expect(discardOf(state)).not.toContain(t.discarded[1]);
    expect(inst(state, t.id).exhausted).toBe(true);
  });

  it("draw: draws 1 card and tucks nothing", () => {
    const t = table([ALTRUISM]);
    const { state } = run(t.state, t.command, choosing("Draw"));
    expect(handOf(state)).toHaveLength(handOf(t.state).length + 1);
    expect(tucked(state)).toEqual([]);
    expect(discardOf(state)).toContain(t.discarded[0]);
  });

  it("both options are offered with an energy event in the discard pile and room under Ionic Physiology", () => {
    const t = table([BLAST], 2);
    const choice = firstChoice(t.state, t.command);
    expect(offered(choice).filter((o) => o.includes("Tuck") || o.includes("Draw"))).toHaveLength(2);
  });

  it("with 3 cards already tucked the tuck is not offered: only drawing is", () => {
    const t = table([BLAST], 3);
    expect(tucked(t.state)).toHaveLength(3);
    const choice = firstChoice(t.state, t.command);
    expect(offered(choice).some((o) => o.includes("Tuck"))).toBe(false);
    const { state } = run(t.state, t.command);
    expect(tucked(state)).toHaveLength(3);
    expect(handOf(state)).toHaveLength(handOf(t.state).length + 1);
  });

  it("a physical event and an energy resource card in the discard pile are not eligible: the tuck is not offered, drawing resolves without asking", () => {
    const t = table([BENEVOLENCE, ENERGY]);
    const choice = firstChoice(t.state, t.command);
    expect(choice.pendingChoice).toBeFalsy();
    expect(handOf(choice)).toHaveLength(handOf(t.state).length + 1);
    expect(tucked(choice)).toEqual([]);
    expect(discardOf(choice)).toEqual(expect.arrayContaining(t.discarded));
    expect(inst(choice, t.id).exhausted).toBe(true);
  });

  it("an alter-ego action: refused in hero form and when exhausted", () => {
    const t = table([BLAST]);
    expect(accepted(t.state, t.command)).toBe(true);
    const fans = stagedInPlay(wonderManHeroGame(), FANS);
    expect(accepted(fans.state, use(P1, fans.id, FANS_ACTION))).toBe(false);
    expect(accepted(patchInstance(t.state, t.id, { exhausted: true }), t.command)).toBe(false);
  });
});

describe(`${BELT_EVENT} and ${BELT_TUCKED}: Jet Belt generates energy`, () => {
  function table(held = 0) {
    const t = withTucked(wonderManHeroGame(), held, [ALTRUISM, BLAST, STRUCK, FANS]);
    const belt = stagedInPlay(t.state, BELT, { attach: true });
    return { ...belt, held: t.ids };
  }
  /** `code` alone in hand, and the command playing it paid by Jet Belt's `ability`. */
  function paying(
    state: GameState,
    belt: InstanceId,
    code: string,
    ability: string,
    costChoices?: Record<string, InstanceId[]>,
  ) {
    const given = moveToHand(state, P1, code);
    const id = given.ids[0]!;
    const payment = {
      ability: { instanceId: belt, abilityId: ability as never, ...(costChoices ? { costChoices } : {}) },
    };
    const command = { ...play(P1, id, []), payment: [payment] } as Command;
    return { state: given.state, id, command };
  }

  it("for an event: exhausting Jet Belt pays 1 energy toward Ionic Blast (cost 1), which then deals its damage", () => {
    const t = table();
    const p = paying(t.state, t.id, BLAST, BELT_EVENT);
    const { state } = run(p.state, p.command);
    expect(inst(state, t.id).exhausted).toBe(true);
    expect(discardOf(state)).toContain(p.id);
    expect(inst(state, state.activeVillainId!).damage).toBe(3);
  });

  it("for an event only: it cannot pay for a support (Wonder Fans)", () => {
    const t = table();
    const p = paying(t.state, t.id, FANS, BELT_EVENT);
    expect(accepted(p.state, p.command)).toBe(false);
  });

  it("an energy resource for an event: Jet Belt overpays Active Altruism (cost 0) by 1, which removes 2 more threat", () => {
    const t = table();
    const staged = patchInstance(t.state, t.state.mainScheme.instanceId, { threat: 10 });
    const p = paying(staged, t.id, ALTRUISM, BELT_EVENT);
    const { state } = run(p.state, p.command);
    expect(inst(state, state.mainScheme.instanceId).threat).toBe(7);
  });

  it("is a Hero Resource: refused in alter-ego form, and refused once Jet Belt is exhausted", () => {
    const t = table();
    const p = paying(t.state, t.id, BLAST, BELT_EVENT);
    expect(accepted(patchInstance(p.state, t.id, { exhausted: true }), p.command)).toBe(false);
    const alter = stagedInPlay(wonderManGame(), BELT, { attach: true });
    const q = paying(alter.state, alter.id, FANS, BELT_EVENT);
    expect(accepted(q.state, q.command)).toBe(false);
  });

  it("discarding a tucked card: exhausts Jet Belt, discards the chosen tucked card, and pays 1 energy for any card (a support)", () => {
    const t = table(3);
    const p = paying(t.state, t.id, FANS, BELT_TUCKED, { discarded: [t.held[1]!] });
    expect(hero(p.state).atk).toBe(4);
    const { state } = run(p.state, p.command);
    expect(inst(state, t.id).exhausted).toBe(true);
    expect(tucked(state)).toEqual([t.held[0], t.held[2]]);
    expect(discardOf(state)).toContain(t.held[1]);
    expect(playerOf(state, P1).playArea).toContain(p.id);
    expect(hero(state).atk).toBe(3);
  });

  it("discarding a tucked card also pays for an event", () => {
    const t = table(1);
    const p = paying(t.state, t.id, BLAST, BELT_TUCKED, { discarded: [t.held[0]!] });
    const { state } = run(p.state, p.command);
    expect(tucked(state).includes(t.held[0]!)).toBe(false);
    expect(discardOf(state)).toContain(t.held[0]);
    expect(inst(state, state.activeVillainId!).damage).toBe(3);
  });

  it("with nothing tucked the second ability cannot be used", () => {
    const t = table(0);
    const p = paying(t.state, t.id, FANS, BELT_TUCKED);
    expect(accepted(p.state, p.command)).toBe(false);
  });
});

describe(`${HOLLYWOOD}: Resource, generate an energy resource to overpay for a card (limit once per card)`, () => {
  const MR_HOLLYWOOD = "58009";
  function table(...hand: readonly string[]) {
    const given = moveToHand(wonderManHeroGame(), P1, ...hand);
    const cardsInHand = [...given.ids];
    const stripped: GameState = {
      ...given.state,
      players: given.state.players.map((p) => (p.playerId === P1 ? { ...p, hand: cardsInHand } : p)),
    };
    const upgrade = stagedInPlay(stripped, MR_HOLLYWOOD, { attach: true });
    const pay = { ability: { instanceId: upgrade.id, abilityId: HOLLYWOOD as never } };
    const playing = (id: InstanceId, paid: readonly InstanceId[], ...more: (typeof pay)[]) =>
      play(P1, id, paid, { abilities: more.map((m) => ({ ability: m.ability })) as never });
    return { state: upgrade.state, hollywood: upgrade.id, hand: cardsInHand, pay, playing };
  }
  const threatOf = (s: GameState) => inst(s, s.mainScheme.instanceId).threat;

  it("is a resource ability that only overpays, once per paid card", () => {
    expect(R[HOLLYWOOD]).toMatchObject({
      trigger: { kind: "resource" },
      generates: { energy: 1 },
      overpayOnly: true,
      limit: { count: 1, per: "paidCard" },
    });
  });

  it("never counts toward the cost: Starstruck (cost 1) with only Mr. Hollywood is refused", () => {
    const t = table(STRUCK);
    expect(accepted(t.state, t.playing(t.hand[0]!, [], t.pay))).toBe(false);
  });

  it("overpays an energy: Active Altruism (cost 0) with Mr. Hollywood removes 3 threat instead of 1", () => {
    const t = table(ALTRUISM);
    const staged = patchInstance(t.state, t.state.mainScheme.instanceId, { threat: 9 });
    const plain = run(staged, play(P1, t.hand[0]!));
    expect(threatOf(plain.state)).toBe(8);
    const paid = run(staged, t.playing(t.hand[0]!, [], t.pay));
    expect(threatOf(paid.state)).toBe(6);
    expect(discardOf(paid.state)).toContain(t.hand[0]);
  });

  it("the energy is overpaid on top of a physical payer: Starstruck is paid by Heroic Benevolence and still stuns (energy overpaid)", () => {
    const t = table(STRUCK, BENEVOLENCE);
    const [struck, payer] = t.hand as [InstanceId, InstanceId];
    const plain = run(t.state, play(P1, struck, [payer]));
    expect(inst(plain.state, plain.state.activeVillainId!).statuses.stunned).toBe(0);
    const paid = run(t.state, t.playing(struck, [payer], t.pay));
    expect(inst(paid.state, paid.state.activeVillainId!).statuses.stunned).toBe(1);
  });

  it("is used once per paid card: twice for one card is refused, once for each of two cards is not", () => {
    const t = table(ALTRUISM, ALTRUISM);
    const [first, second] = t.hand as [InstanceId, InstanceId];
    const staged = patchInstance(t.state, t.state.mainScheme.instanceId, { threat: 9 });
    expect(accepted(staged, t.playing(first, [], t.pay, t.pay))).toBe(false);
    const one = run(staged, t.playing(first, [], t.pay));
    const two = run(one.state, t.playing(second, [], t.pay));
    expect(threatOf(two.state)).toBe(3);
    expect(inst(two.state, t.hollywood).exhausted).toBe(false);
  });

  it("is offered only while a card is being played: not for an ability's cost", () => {
    const fans = stagedInPlay(wonderManGame(), FANS);
    const given = stagedInPlay(fans.state, MR_HOLLYWOOD, { attach: true });
    const command = {
      ...use(P1, fans.id, FANS_ACTION),
      payment: [{ ability: { instanceId: given.id, abilityId: HOLLYWOOD as never } }],
    } as Command;
    expect(accepted(given.state, use(P1, fans.id, FANS_ACTION))).toBe(true);
    expect(accepted(given.state, command)).toBe(false);
  });
});

describe(`${SUNGLASSES}: Response, after you change form, tuck an energy event or resource, or take a tucked card`, () => {
  function table(discard: readonly string[], held = 0) {
    const d = toDiscard(wonderManGame(), ...discard);
    const t = withTucked(d.state, held, [ALTRUISM, BLAST, STRUCK, BENEVOLENCE, ENERGY]);
    const glasses = stagedInPlay(t.state, SUNGLASSES_CARD, { attach: true });
    return { ...glasses, discarded: d.ids, held: t.ids, command: changeForm(P1) };
  }
  /** The state once the Response has been taken: the next prompt is the choice (or, with one option only, its cards). */
  function afterTaking(t: ReturnType<typeof table>): GameState {
    const step = firstChoice(t.state, t.command);
    const next = applyCommand(
      step,
      {
        type: "resolveChoice",
        playerId: P1,
        choiceId: step.pendingChoice!.choiceId,
        selectedOptionIds: choosing(SUNGLASSES)(step) as never,
      },
      WAVE10_DEPS,
    );
    if (!next.ok) throw new Error(next.error.message);
    return next.state;
  }
  const cardsOffered = (s: GameState): string[] => (s.pendingChoice?.options ?? []).map((o) => o.optionId as string);

  it("is offered after changing to hero form and, if declined, changes nothing", () => {
    const t = table([BLAST], 1);
    const choice = firstChoice(t.state, t.command);
    expect(offered(choice).some((o) => o.includes(SUNGLASSES))).toBe(true);
    const { state } = run(t.state, t.command);
    expect(tucked(state)).toEqual(t.held);
    expect(discardOf(state)).toContain(t.discarded[0]);
  });

  it("tuck: an energy event goes from the discard pile under Ionic Physiology", () => {
    const t = table([BENEVOLENCE, BLAST]);
    const { state } = run(t.state, t.command, choosing(SUNGLASSES, "Tuck", t.discarded[1]!));
    expect(tucked(state)).toEqual([t.discarded[1]]);
    expect(discardOf(state)).toContain(t.discarded[0]);
  });

  it("tuck: an energy resource card is as good (Energy)", () => {
    const t = table([ENERGY]);
    const { state } = run(t.state, t.command, choosing(SUNGLASSES, "Tuck", t.discarded[0]!));
    expect(tucked(state)).toEqual([t.discarded[0]]);
  });

  it("a physical event is not eligible, so the tuck is not offered: with a card tucked only taking is", () => {
    const t = table([BENEVOLENCE], 1);
    const next = afterTaking(t);
    expect(next.pendingChoice?.prompt.kind).toBe("chooseCards");
    expect(cardsOffered(next)).toEqual(t.held);
  });

  it("neither option doable (nothing tucked, nothing eligible in the discard pile): the response is not offered", () => {
    const t = table([BENEVOLENCE], 0);
    const result = applyCommand(t.state, t.command, WAVE10_DEPS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(offered(result.state).some((o) => o.includes(SUNGLASSES))).toBe(false);
    const { state } = run(t.state, t.command, choosing(SUNGLASSES));
    expect(tucked(state)).toEqual([]);
    expect(discardOf(state)).toContain(t.discarded[0]);
    // At the limit with nothing eligible to take either way, taking keeps it offered.
    const full = table([BENEVOLENCE], 3);
    const offeredAtLimit = firstChoice(full.state, full.command);
    expect(offered(offeredAtLimit).some((o) => o.includes(SUNGLASSES))).toBe(true);
  });

  it("take: a chosen tucked card is added to your hand", () => {
    const t = table([], 3);
    const { state } = run(t.state, t.command, choosing(SUNGLASSES, "Add a card", t.held[2]!));
    expect(handOf(state)).toContain(t.held[2]);
    expect(tucked(state)).toEqual([t.held[0], t.held[1]]);
  });

  it("at the limit (3 tucked) only taking a card is offered: the one option is taken, and it asks for a tucked card", () => {
    const t = table([BLAST], 3);
    const next = afterTaking(t);
    expect(next.pendingChoice?.prompt.kind).toBe("chooseCards");
    expect(cardsOffered(next).sort()).toEqual([...t.held].sort());
  });

  it("with nothing tucked, only tucking is offered: the one option is taken, and it asks for the energy event", () => {
    const t = table([BLAST, BENEVOLENCE], 0);
    const next = afterTaking(t);
    expect(next.pendingChoice?.prompt.kind).toBe("chooseCards");
    expect(cardsOffered(next)).toEqual([t.discarded[0]]);
  });

  it("is heard after either change: from hero form back to alter-ego form as well", () => {
    const d = toDiscard(wonderManHeroGame(), BLAST);
    const glasses = stagedInPlay(d.state, SUNGLASSES_CARD, { attach: true });
    const { state } = run(glasses.state, changeForm(P1), choosing(SUNGLASSES, "Tuck", d.ids[0]!));
    expect(playerOf(state, P1).identity.form).toBe("alterEgo");
    expect(tucked(state)).toEqual([d.ids[0]]);
  });
});

describe(`${WHAT_ARE_YOU}: Forced Interrupt, when Wonder Man would be defeated, set his dial to 4 and change to alter-ego form`, () => {
  const QUIET = "01186"; // Advance, a treachery
  /** Wonder Man in hero form with 11 damage and the upgrade attached, the villain's coming cards harmless. */
  function table(opts: { held?: number; discard?: readonly string[]; hero?: boolean } = {}) {
    const d = toDiscard(opts.hero === false ? wonderManGame() : wonderManHeroGame(), ...(opts.discard ?? []));
    const t = withTucked(d.state, opts.held ?? 0, [ALTRUISM, BLAST, STRUCK, WHAT_CARD]);
    const what = stagedInPlay(t.state, WHAT_CARD, { attach: true });
    const encounter = Object.values(what.state.encounterDecks)
      .flatMap((deck) => deck.deck.slice(0, 12))
      .reduce((acc, id) => patchInstance(acc, id, { cardId: QUIET as never }), what.state);
    const hurt = patchInstance(encounter, identityOf(encounter), { damage: 11 });
    return { ...what, state: hurt, discarded: d.ids, held: t.ids };
  }
  const survive = (t: ReturnType<typeof table>, pick: Picker = firstLegal) => run(t.state, endTurn(P1), pick);

  it("instead of being defeated: dial set to 4 (8 damage), alter-ego form, and the card is removed from the game", () => {
    const t = table();
    const { state, events } = survive(t);
    expect(state.outcome).toBeFalsy();
    expect(playerOf(state, P1).identity.form).toBe("alterEgo");
    expect(inst(state, identityOf(state)).damage).toBe(8);
    expect(state.removedFromGame).toContain(t.id);
    expect(inst(state, identityOf(state)).attachments).not.toContain(t.id);
    expect(ofType(events, "abilityResolved").some((e) => e.abilityId === WHAT_ARE_YOU)).toBe(true);
  });

  it("tucks events with a printed energy resource from the discard pile until there are 3 tucked: 1 tucked, 4 in the discard pile, 2 more", () => {
    const t = table({ held: 1, discard: [ALTRUISM, BLAST, STRUCK, ALTRUISM] });
    const { state } = survive(t, choosing(...t.discarded.slice(0, 3)));
    expect(tucked(state)).toHaveLength(3);
    expect(tucked(state).slice(0, 1)).toEqual(t.held);
    expect(discardOf(state).filter((i) => t.discarded.includes(i))).toHaveLength(2);
    expect(state.removedFromGame).toContain(t.id);
  });

  it("with nothing tucked, up to 3 events are tucked", () => {
    const t = table({ discard: [ALTRUISM, BLAST, STRUCK] });
    const { state } = survive(t, choosing(...t.discarded));
    expect(tucked(state)).toEqual(expect.arrayContaining(t.discarded));
    expect(tucked(state)).toHaveLength(3);
  });

  it("with 3 already tucked nothing more can be tucked, and the card still does the rest", () => {
    const t = table({ held: 3, discard: [BLAST] });
    const { state } = survive(t, choosing(...t.discarded));
    expect(tucked(state)).toEqual(t.held);
    expect(discardOf(state)).toContain(t.discarded[0]);
    expect(inst(state, identityOf(state)).damage).toBe(8);
    expect(state.removedFromGame).toContain(t.id);
  });

  it("the tucking is a may: declined, nothing is tucked and the rest still happens", () => {
    const t = table({ discard: [BLAST] });
    const { state } = survive(t);
    expect(tucked(state)).toEqual([]);
    expect(discardOf(state)).toContain(t.discarded[0]);
    expect(playerOf(state, P1).identity.form).toBe("alterEgo");
    expect(state.removedFromGame).toContain(t.id);
  });

  it("only events with a printed energy resource: a physical event and an energy resource card are left in the discard pile", () => {
    const t = table({ discard: [BENEVOLENCE, ENERGY] });
    const { state } = survive(t, choosing(...t.discarded));
    expect(tucked(state)).toEqual([]);
    expect(discardOf(state)).toEqual(expect.arrayContaining(t.discarded));
  });

  it("is for Wonder Man: in alter-ego form it does not replace the defeat", () => {
    const t = table({ hero: false });
    expect(playerOf(t.state, P1).identity.form).toBe("alterEgo");
    const { state } = survive(t);
    expect(state.removedFromGame).not.toContain(t.id);
    expect(inst(state, identityOf(state)).damage).not.toBe(8);
  });
});
