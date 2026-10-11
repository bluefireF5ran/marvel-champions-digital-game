/**
 * Rules QA, calibration follow-up (item 4): do Mounting Resistance 55054 and Unified Front 55055 (God of Lies Synergy
 * environments, MC55 pp. 18-21) do what they print, in a real game state?
 *
 * Why they sat idle in the earlier scan: both are "Permanent. Max 1 [per hero] synergy counters here." and every ability
 * costs a synergy counter. A counter reaches them only from the scenario's own cards: Fenris Wolf's When Defeated places one
 * on Mounting Resistance, Laufey's on Unified Front (55042, 55044; tt/god-of-lies.ts), and a Fading Figment, the Mangog and
 * Door Between Worlds place them too. The scan's purposeful player never defeated those minions, so the counters stayed at 0
 * and the environments had nothing to pay with. Nothing was broken: with no counter they are correctly inert.
 *
 * These tests play the real scenario (`openScenario("god-of-lies")`, the full encounter deck, Single Group Mode, one
 * player), reveal the minion through a real villain phase, defeat it with a real attack, and then use the environment with
 * real commands. Staged by surgery: the hero in hero form, the encounter deck's top card (a villain-phase deal), a
 * non-treachery on top so Laufey's Forced Response cannot stun the attacker, and the main scheme's threat.
 */
import { cardsInPlay, replay, sessionApply, startSession, type GameState, type InstanceId } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import {
  P1,
  identityOf,
  moveToHand,
  patchInstance,
  play,
  resourceAbility,
  stackEncounterDeck,
} from "../testing/harness.js";
import { defeatWithAttack } from "../testing/staging.js";
import { DEPS, act, openScenario, villainPhaseDealing } from "./qa-gaps.shared.js";
import { SPIDER_MAN, codeOf, heroForm } from "./testing.js";

vi.setConfig({ testTimeout: 300_000 });

const MOUNTING = "55054";
const UNIFIED = "55055";
const need = (s: GameState, code: string): InstanceId => {
  const id = cardsInPlay(s).find((i) => codeOf(s, i) === code);
  if (!id) throw new Error(`${code} is not in play`);
  return id;
};
const synergy = (s: GameState, code: string): number => s.instances[need(s, code)]!.counters["synergy"] ?? 0;

/** Round 2, player phase: the minion `code` was dealt in round 1's villain phase and is in play. */
const withMinion = (code: string): GameState => {
  const start = heroForm(openScenario("god-of-lies", 1, { seed: 1, seats: [SPIDER_MAN] }), P1);
  const { state } = villainPhaseDealing(start, [code]);
  expect(state.step.phase).toBe("player");
  return state;
};

/** The minion defeated by a real attack, with a non-treachery (55048 New Jotunheim) on top of the encounter deck. */
const afterDefeat = (code: string): GameState => {
  const state = stackEncounterDeck(withMinion(code), "55048");
  return defeatWithAttack(DEPS, state, need(state, code));
};

const pickInterrupt = (abilityId: string) => (s: GameState) => {
  const choice = s.pendingChoice!;
  const ours = choice.options.find((o) => (o.optionId as string).includes(abilityId));
  return ours ? [ours.optionId as string] : [choice.options[0]!.optionId as string];
};

const replays = (commands: readonly import("@mc/engine").Command[], start: GameState): GameState => {
  let session = startSession(start);
  for (const c of commands) {
    const r = sessionApply(session, c, DEPS);
    if (!r.ok) throw new Error(r.error.message);
    session = r.session;
  }
  const back = replay(session.log, DEPS);
  if (!back.ok) throw new Error(back.error.message);
  expect(back.state).toEqual(session.state);
  return session.state;
};

describe("Mounting Resistance 55054: 'Interrupt: When a friendly character thwarts, remove 1 synergy counter from here -> that thwart removes 4 additional threat' (MC55 p. 18)", () => {
  it("starts in play with no counters and offers nothing while it holds none: a thwart removes only its own 1", () => {
    // Before any minion arrives: Fenris Wolf's Patrol would block thwarting the main scheme while it is engaged.
    const state = heroForm(openScenario("god-of-lies", 1, { seed: 1, seats: [SPIDER_MAN] }), P1);
    expect(synergy(state, MOUNTING)).toBe(0);
    const main = state.mainScheme.instanceId;
    const staged = patchInstance(state, main, { threat: 6 });
    const thwart = {
      type: "basicThwart" as const,
      playerId: P1,
      thwarterInstanceId: identityOf(staged),
      schemeInstanceId: main,
    };
    const { state: after } = act(staged, (s) => [s.pendingChoice!.options[0]!.optionId as string], thwart);
    expect(after.instances[main]!.threat, "Spider-Man's THW is 1").toBe(5);
    expect(synergy(after, MOUNTING)).toBe(0);
  });

  it("Fenris Wolf's defeat places 1 synergy counter on it; the next thwart takes the interrupt and removes 1 + 4 threat", () => {
    const defeated = afterDefeat("55042");
    expect(
      synergy(defeated, MOUNTING),
      "Fenris Wolf 55042: 'place 1 synergy counter on their Mounting Resistance'",
    ).toBe(1);
    for (const other of ["55052", "55053", UNIFIED]) expect(synergy(defeated, other)).toBe(0);
    const main = defeated.mainScheme.instanceId;
    // The killing blow exhausted the hero (RRG "Exhaust"); the end-of-phase ready is stood in for by surgery.
    const staged = patchInstance(patchInstance(defeated, main, { threat: 6 }), identityOf(defeated), {
      exhausted: false,
    });
    const command = {
      type: "basicThwart" as const,
      playerId: P1,
      thwarterInstanceId: identityOf(staged),
      schemeInstanceId: main,
    };
    const { state: after } = act(staged, pickInterrupt("55054.mounting-resistance-interrupt"), command);
    expect(synergy(after, MOUNTING), "the cost: 1 counter removed").toBe(0);
    expect(after.instances[main]!.threat, "6 - 1 (THW) - 4 (Mounting Resistance)").toBe(1);
    replays([command], staged);
  });

  it("the interrupt is optional: declining it leaves the counter and removes only 1 threat", () => {
    const defeated = afterDefeat("55042");
    const main = defeated.mainScheme.instanceId;
    // The killing blow exhausted the hero (RRG "Exhaust"); the end-of-phase ready is stood in for by surgery.
    const staged = patchInstance(patchInstance(defeated, main, { threat: 6 }), identityOf(defeated), {
      exhausted: false,
    });
    const decline = (s: GameState) => {
      const choice = s.pendingChoice!;
      return choice.options.filter((o) => (o.optionId as string).includes("decline")).map((o) => o.optionId as string);
    };
    const { state: after } = act(staged, decline, {
      type: "basicThwart",
      playerId: P1,
      thwarterInstanceId: identityOf(staged),
      schemeInstanceId: main,
    });
    expect(synergy(after, MOUNTING)).toBe(1);
    expect(after.instances[main]!.threat).toBe(5);
  });
});

describe("Unified Front 55055: 'Resource: Remove 1 synergy counter from here -> generate [wild][wild] resources' (MC55 p. 18)", () => {
  it("Laufey's defeat places 1 synergy counter on it; paying Aunt May (cost 1, paid with the 2 wild) with the Resource ability plays her from a hand that pays nothing", () => {
    const defeated = afterDefeat("55044");
    expect(synergy(defeated, UNIFIED), "Laufey 55044: 'place 1 synergy counter on their Unified Front'").toBe(1);
    for (const other of ["55052", "55053", MOUNTING]) expect(synergy(defeated, other)).toBe(0);
    const front = need(defeated, UNIFIED);
    const hand = moveToHand(defeated, P1, "01006"); // Aunt May, cost 1: no draw, no other effect on entering play
    const cat = hand.ids[0]!;
    const handBefore = hand.state.players[0]!.hand.length;
    const command = play(P1, cat, [], { abilities: [resourceAbility(front, "55055.unified-front-resource")] });
    const after = replays([command], hand.state);
    expect(synergy(after, UNIFIED), "the cost: 1 counter removed").toBe(0);
    expect(after.players[0]!.playArea).toContain(cat);
    expect(after.players[0]!.hand.length, "Aunt May left the hand and no other card was spent").toBe(handBefore - 1);
  });

  it("with no counter the Resource ability pays nothing: Aunt May cannot be played on it", () => {
    const state = withMinion("55044");
    expect(synergy(state, UNIFIED)).toBe(0);
    const front = need(state, UNIFIED);
    const hand = moveToHand(state, P1, "01006");
    const command = play(P1, hand.ids[0]!, [], { abilities: [resourceAbility(front, "55055.unified-front-resource")] });
    const r = sessionApply(startSession(hand.state), command, DEPS);
    expect(r.ok).toBe(false);
  });
});
