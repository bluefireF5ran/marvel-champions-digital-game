/**
 * docs/phase7-wave10.md §3.10: a defeated minion given to an enemy as a facedown boost card, the defeat destination
 * `{ kind: "boostCardOf", enemy }` of `EffectSpec setDefeatDestination`. Synthetic cards shaped like
 *
 * - Falcon (`cw` 56150): "When Defeated: Give this card to the enemy leader as a facedown boost card." (`wing`, with 2
 *   boost icons and "Boost: Place 1 boosted counter on the villain");
 * - Dangerous Recruits (`cw` 56091): "Forced Interrupt: When a minion is defeated, give it to the enemy leader as a
 *   facedown boost card." (`recruits`).
 *
 * Sources: RRG 1.8 "When Defeated Abilities" (p. 48): "A defeated card leaves play after its 'When Defeated' ability
 * is resolved"; "Boost, Boost Icon" (p. 11): "If an enemy is dealt a boost card outside of its own activation, that
 * boost card remains facedown on that enemy until that enemy activates", and a villain "still gets dealt another boost
 * card at the start of its activation as normal"; "Leaves Play" (p. 27); "Victory X" (p. 46); "Stun, Stunned"
 * (p. 41): a stunned enemy's attack does not happen, so it is not an activation that turns the card up.
 */

import type { CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { activeEncounterDeck, mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommandsPicking } from "./testing/drive.js";
import { stubAlly, stubEvent, stubMinion, stubSupport, stubTreachery } from "./testing/fixtures.js";
import { defaultPick, giveCard } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, minionEngagedWith, P1, playerCardIntoPlay } from "./testing/wave3.js";

const def = (definition: AbilityDefinition) => definition;
const one = { kind: "const", value: 1 } as const;
const theVillain: TargetRef = { kind: "villain" };
const toBoostOf = (enemy: TargetRef): EffectSpec => ({
  kind: "setDefeatDestination",
  to: { kind: "boostCardOf", enemy },
});

const WING_DEFEATED = stubAbility(
  "wing.defeated",
  def({ trigger: { kind: "whenDefeated" }, effects: [toBoostOf(theVillain)] }),
);
const WING_BOOST = stubAbility(
  "wing.boost",
  def({
    trigger: { kind: "boost" },
    effects: [{ kind: "addCounters", target: theVillain, counterType: "boosted", amount: one }],
  }),
);
const WING = stubMinion({
  id: "wing",
  atk: 1,
  sch: 1,
  hp: 2,
  boostIcons: 2,
  abilities: [WING_DEFEATED.ref, WING_BOOST.ref],
});
/** The same minion with Victory 1: its defeat places it in the victory display. */
const TROPHY = stubMinion({
  id: "trophy",
  atk: 1,
  sch: 1,
  hp: 2,
  boostIcons: 2,
  keywords: [{ name: "victory", value: 1 }],
  abilities: [WING_DEFEATED.ref],
});
/** "Give this card to [a card that is not in play] as a facedown boost card." */
const LOST_DEFEATED = stubAbility(
  "lost.defeated",
  def({ trigger: { kind: "whenDefeated" }, effects: [toBoostOf({ kind: "named", name: "nobody" })] }),
);
const LOST = stubMinion({ id: "lost", atk: 1, sch: 1, hp: 2, abilities: [LOST_DEFEATED.ref] });
const GRUNT = stubMinion({ id: "grunt", atk: 1, sch: 1, hp: 2, boostIcons: 3 });

const RECRUITS_INTERRUPT = stubAbility(
  "recruits.interrupt",
  def({
    trigger: {
      kind: "interrupt",
      forced: true,
      on: { on: "characterDefeated", targetIs: { categories: ["minion"] } },
    },
    effects: [toBoostOf(theVillain)],
  }),
);
const RECRUITS = stubSupport({ id: "recruits", cost: 0, abilities: [RECRUITS_INTERRUPT.ref] });
/** "Forced Response: After an enemy is given a facedown boost card, place 1 heard counter here." */
const TALLY_RESPONSE = stubAbility(
  "tally.response",
  def({
    trigger: { kind: "response", forced: true, on: { on: "boostCardGiven" } },
    effects: [{ kind: "addCounters", target: { kind: "self" }, counterType: "heard", amount: one }],
  }),
);
const TALLY = stubSupport({ id: "tally", cost: 0, abilities: [TALLY_RESPONSE.ref] });
/** "Forced Response: After a minion leaves play, place 1 left counter here." */
const WATCH_RESPONSE = stubAbility(
  "watch.response",
  def({
    trigger: {
      kind: "response",
      forced: true,
      on: { on: "cardLeavesPlay", targetIs: { categories: ["minion"] } },
    },
    effects: [{ kind: "addCounters", target: { kind: "self" }, counterType: "left", amount: one }],
  }),
);
const WATCH = stubSupport({ id: "watch", cost: 0, abilities: [WATCH_RESPONSE.ref] });
const ZAP_ACTION = stubAbility(
  "zap.action",
  def({
    trigger: { kind: "action" },
    effects: [
      {
        kind: "dealDamage",
        target: { kind: "each", query: { categories: ["minion"] } },
        amount: { kind: "const", value: 5 },
      },
    ],
  }),
);
const ZAP = stubEvent({ id: "zap", cost: 0, abilities: [ZAP_ACTION.ref] });
const STRIKER = stubAlly({ id: "striker", cost: 0, atk: 3, thw: 1, hp: 9 });
const BLANK = stubTreachery({ id: "blank", boostIcons: 1 });

const baseAbilities = [WING_DEFEATED, WING_BOOST, LOST_DEFEATED, RECRUITS_INTERRUPT, ZAP_ACTION];
const deps: EngineDeps = depsOf(...baseAbilities);
/** A game in which abilities hear `boostCardGiven` and `cardLeavesPlay`. */
const listening: EngineDeps = depsOf(...baseAbilities, TALLY_RESPONSE, WATCH_RESPONSE);
const CARDS = [WING, TROPHY, LOST, GRUNT, RECRUITS, TALLY, WATCH, ZAP, STRIKER, BLANK];

interface Table {
  readonly state: GameState;
  readonly striker: InstanceId;
  readonly villain: InstanceId;
  /** The minions engaged with player 1, in the order asked for. */
  readonly minions: readonly InstanceId[];
}

/** p1 in hero form with a 3 ATK ally; `minions` engaged; the rest of the encounter deck is 1-icon blanks. */
function table(minions: readonly CardId[], using: EngineDeps = deps): Table {
  const base = gameAtFirstTurn({
    cards: CARDS,
    deps: using,
    deck: [STRIKER.id, RECRUITS.id, TALLY.id, WATCH.id, ZAP.id],
    encounter: [...minions, ...copiesOf(BLANK.id, 14)],
  });
  let state: GameState = {
    ...base,
    players: base.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" } })),
  };
  const striker = playerCardIntoPlay(state, STRIKER.id);
  state = striker.state;
  const ids: InstanceId[] = [];
  for (const card of minions) {
    const engaged = minionEngagedWith(state, card);
    state = engaged.state;
    ids.push(engaged.id);
  }
  const villain = Object.values(state.instances).find((i) => i.cardId === "villain")!.instanceId;
  return { state, striker: striker.id, villain, minions: ids };
}

const withInPlay = (t: Table, card: CardId): Table & { readonly added: InstanceId } => {
  const added = playerCardIntoPlay(t.state, card);
  return { ...t, state: added.state, added: added.id };
};

/** Nobody defends; everything else as `defaultPick`. */
const undefended = (state: GameState): readonly string[] =>
  state.pendingChoice?.prompt.kind === "declareDefender" ? ["decline"] : defaultPick(state);

const attack = (t: Table, target: InstanceId): Command => ({
  type: "basicAttack",
  playerId: P1,
  attackerInstanceId: t.striker,
  targetInstanceId: target,
});
const endTurn: Command = { type: "endTurn", playerId: P1 };
const run = (t: Table, using: EngineDeps, ...commands: readonly Command[]) =>
  runCommandsPicking(t.state, using, undefended, ...commands);
/** Plays the 0-cost "deal 5 damage to each minion". */
function zap(t: Table, using: EngineDeps = deps) {
  const given = giveCard(t.state, P1, ZAP.id);
  return runCommandsPicking(given.state, using, undefended, {
    type: "playCard",
    playerId: P1,
    cardInstanceId: given.id,
    payment: [],
    attachToInstanceId: null,
  });
}

const of = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const flips = (events: readonly GameEvent[]) =>
  of(events, "boostCardFlipped").map((e) => ({ instanceId: e.instanceId, boostIcons: e.boostIcons }));
const boosts = (state: GameState, id: InstanceId) => mustInstance(state, id).boostCards;
const counter = (state: GameState, id: InstanceId, type: string) => mustInstance(state, id).counters[type] ?? 0;
const heroDamage = (state: GameState) => mustInstance(state, mustPlayer(state, P1).identity.instanceId).damage;

describe("§3.10 a defeated minion given to an enemy as a facedown boost card", () => {
  it("When Defeated: the minion leaves play facedown onto the villain, not into a discard pile", () => {
    const t = table([WING.id]);
    const [wing] = t.minions as [InstanceId];
    const { state, events, session } = run(t, deps, attack(t, wing));
    expect(of(events, "characterDefeated")).toEqual([{ type: "characterDefeated", instanceId: wing, cardId: WING.id }]);
    expect(of(events, "boostCardDealt")).toEqual([
      { type: "boostCardDealt", enemyInstanceId: t.villain, instanceId: wing, outsideActivation: true },
    ]);
    expect(boosts(state, t.villain)).toEqual([wing]);
    expect(mustInstance(state, wing)).toMatchObject({ faceup: false, damage: 0, engagedWith: null });
    expect(mustPlayer(state, P1).playArea).not.toContain(wing);
    expect(activeEncounterDeck(state).discard).not.toContain(wing);
    expect(of(events, "cardDiscardedFromPlay")).toEqual([]);
    // Outside the villain's activation it waits facedown (RRG 1.8 p. 11).
    expect(flips(events)).toEqual([]);
    const replayed = replay(session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(session.state);
  });

  it("the villain's next attack turns it up first (2 icons, its Boost ability), then the card it is dealt: 2 + 2 + 1", () => {
    const t = table([WING.id]);
    const [wing] = t.minions as [InstanceId];
    const { state, events } = run(t, deps, attack(t, wing), endTurn);
    const [first, second] = flips(events);
    expect(flips(events)).toHaveLength(2);
    expect(first).toEqual({ instanceId: wing, boostIcons: 2 });
    expect(second?.boostIcons).toBe(1);
    expect(mustInstance(state, second!.instanceId).cardId).toBe(BLANK.id);
    expect(counter(state, t.villain, "boosted")).toBe(1);
    expect(heroDamage(state)).toBe(5);
    // Applied to the activation, it is discarded to its own discard pile, faceup.
    expect(boosts(state, t.villain)).toEqual([]);
    expect(activeEncounterDeck(state).discard).toContain(wing);
    expect(mustInstance(state, wing).faceup).toBe(true);
  });

  it("a stunned villain does not attack, so the card stays facedown until the activation after", () => {
    const t = table([WING.id]);
    const [wing] = t.minions as [InstanceId];
    const stunned: Table = {
      ...t,
      state: {
        ...t.state,
        instances: {
          ...t.state.instances,
          [t.villain]: { ...mustInstance(t.state, t.villain), statuses: { stunned: 1, confused: 0, tough: 0 } },
        },
      },
    };
    const first = run(stunned, deps, attack(stunned, wing), endTurn);
    expect(flips(first.events)).toEqual([]);
    expect(boosts(first.state, t.villain)).toEqual([wing]);
    expect(mustInstance(first.state, wing).faceup).toBe(false);
    expect(mustInstance(first.state, t.villain).statuses.stunned).toBe(0);
    expect(heroDamage(first.state)).toBe(0);
    const second = runCommandsPicking(first.state, deps, undefended, endTurn);
    expect(flips(second.events)[0]).toEqual({ instanceId: wing, boostIcons: 2 });
    expect(flips(second.events)).toHaveLength(2);
    expect(heroDamage(second.state)).toBe(5);
  });

  it("two such minions defeated by one effect are both given, in the order their When Defeated abilities resolve", () => {
    const t = table([WING.id, WING.id]);
    const { state, events, session } = zap(t);
    const dealt = of(events, "boostCardDealt").map((e) => e.instanceId);
    expect([...dealt].sort()).toEqual([...t.minions].sort());
    expect(boosts(state, t.villain)).toEqual(dealt);
    expect(t.minions.map((id) => mustInstance(state, id).faceup)).toEqual([false, false]);
    expect(activeEncounterDeck(state).discard.filter((id) => t.minions.includes(id))).toEqual([]);
    const replayed = replay(session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(session.state);
    // The next attack turns up both and the dealt card: 2 + 2 + 2 + 1.
    const next = runCommandsPicking(state, deps, undefended, endTurn);
    expect(flips(next.events).map((f) => f.boostIcons)).toEqual([2, 2, 1]);
    expect(counter(next.state, t.villain, "boosted")).toBe(2);
    expect(heroDamage(next.state)).toBe(7);
  });

  it("Forced Interrupt 'when a minion is defeated, give it …': a minion with no ability of its own is given", () => {
    const t = withInPlay(table([GRUNT.id]), RECRUITS.id);
    const [grunt] = t.minions as [InstanceId];
    const { state, events } = run(t, deps, attack(t, grunt));
    expect(of(events, "characterDefeated")).toHaveLength(1);
    expect(boosts(state, t.villain)).toEqual([grunt]);
    expect(mustInstance(state, grunt).faceup).toBe(false);
    expect(activeEncounterDeck(state).discard).not.toContain(grunt);
  });

  it("the interrupt and the minion's own When Defeated together give the card once", () => {
    const t = withInPlay(table([WING.id]), RECRUITS.id);
    const [wing] = t.minions as [InstanceId];
    const { state, events } = run(t, deps, attack(t, wing));
    expect(of(events, "boostCardDealt")).toHaveLength(1);
    expect(boosts(state, t.villain)).toEqual([wing]);
  });

  it("with no such ability in play a defeated minion is discarded", () => {
    const t = table([GRUNT.id]);
    const [grunt] = t.minions as [InstanceId];
    const { state, events } = run(t, deps, attack(t, grunt));
    expect(of(events, "boostCardDealt")).toEqual([]);
    expect(boosts(state, t.villain)).toEqual([]);
    expect(activeEncounterDeck(state).discard).toContain(grunt);
  });

  it("naming no card in play, the destination is not set and the minion is discarded", () => {
    const t = table([LOST.id]);
    const [lost] = t.minions as [InstanceId];
    const { state, events } = run(t, deps, attack(t, lost));
    expect(of(events, "boostCardDealt")).toEqual([]);
    expect(activeEncounterDeck(state).discard).toContain(lost);
    expect(mustInstance(state, lost).faceup).toBe(true);
  });

  it("a Victory 1 minion still goes to the victory display (RRG 1.8 'Victory X', p. 46)", () => {
    const t = table([TROPHY.id]);
    const [trophy] = t.minions as [InstanceId];
    const { state, events } = run(t, deps, attack(t, trophy));
    expect(state.victoryDisplay).toEqual([trophy]);
    expect(boosts(state, t.villain)).toEqual([]);
    expect(of(events, "boostCardDealt")).toEqual([]);
  });

  it("is announced as a boost card given outside an activation, and as a minion leaving play", () => {
    const tally = withInPlay(table([WING.id], listening), TALLY.id);
    const t = withInPlay(tally, WATCH.id);
    const [wing] = t.minions as [InstanceId];
    const { state, events, session } = run(t, listening, attack(t, wing));
    const given = events.flatMap((e) =>
      e.type === "triggerEvent" && e.phase === "resolved" && e.event.kind === "boostCardGiven" ? [e.event] : [],
    );
    expect(given).toEqual([
      { kind: "boostCardGiven", enemyInstanceId: t.villain, boostInstanceId: wing, activation: null, playerId: null },
    ]);
    expect(counter(state, tally.added, "heard")).toBe(1);
    expect(counter(state, t.added, "left")).toBe(1);
    const left = events.flatMap((e) =>
      e.type === "triggerEvent" && e.phase === "resolved" && e.event.kind === "cardLeavesPlay" ? [e.event.to] : [],
    );
    expect(left).toEqual(["boost"]);
    expect(boosts(state, t.villain)).toEqual([wing]);
    const replayed = replay(session.log, listening);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(session.state);
  });
});
