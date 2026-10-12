/**
 * Rules QA finding F1 (docs/phase7-wave10-qa-players.md): a scheme with no threat is no target for a removal of threat,
 * so an ability that only removes threat cannot be initiated while no scheme holds any.
 *
 * RRG 1.8 "Target" (p. 42): "If an ability or game function requires one or more targets, that ability or game function
 * can only be initiated if it has at least one valid target"; "A target is valid for an ability or game function if any
 * part of that ability can affect that target", "adding/removing threat" being among the listed effects on a target;
 * the exception on the same page gives a basic thwart's valid target as "a scheme with threat on it". "Thwart" (p. 44):
 * "A character can only initiate a basic thwart if there is a scheme with at least one threat for the character to
 * remove or if that character is confused." "Confuse, Confused" (p. 13): "A confused character can attempt to thwart or
 * use a thwart ability even if it has no valid target for a thwart." "Cost" (p. 13): no cost is paid for an ability
 * that cannot be initiated. Synthetic cards only.
 */

import type { CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { applyCommand } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { legalActions } from "./legal.js";
import { mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec, TargetRef, ValueSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommandsPicking } from "./testing/drive.js";
import { stubEvent, stubMinion, stubSideScheme, stubSupport } from "./testing/fixtures.js";
import { defaultPick, giveCard } from "./testing/scenario.js";
import {
  encounterCardInVillainArea,
  gameAtFirstTurn,
  minionEngagedWith,
  P1,
  playerCardIntoPlay,
} from "./testing/wave3.js";

const n = (value: number): ValueSpec => ({ kind: "const", value });
const you = { kind: "controller" } as const;
const slot = (name: string): TargetRef => ({ kind: "slot", slot: name });
const mainScheme: TargetRef = { kind: "mainScheme" };
const aScheme: EffectSpec = { kind: "chooseTarget", slot: "scheme", query: { categories: ["scheme"] }, chooser: you };
const anEnemy: EffectSpec = { kind: "chooseTarget", slot: "enemy", query: { categories: ["enemy"] }, chooser: you };
const aMinion: EffectSpec = { kind: "chooseTarget", slot: "minion", query: { categories: ["minion"] }, chooser: you };
const threatOf = (ref: TargetRef): ValueSpec => ({ kind: "threat", of: ref });

const event = (id: string, label: "thwart" | null, ...effects: EffectSpec[]) => {
  const definition: AbilityDefinition = {
    trigger: { kind: "action" },
    ...(label ? { label: [label] as const } : {}),
    effects,
  };
  const ability = stubAbility(`${id}.action`, definition);
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};

/** "Hero Action (thwart): Remove 3 threat from a scheme." */
const FOR_ORDER = event("for-order", "thwart", aScheme, { kind: "thwart", target: slot("scheme"), amount: n(3) });
/** "Action: Remove 2 threat from a scheme." No label. */
const TIDY = event("tidy", null, aScheme, { kind: "removeThreat", target: slot("scheme"), amount: n(2) });
/**
 * "Hero Action (thwart): Remove 3 threat from a scheme. If this removes the last threat from that scheme, stun a
 * minion.", scripted the way the cards are: the removal inside a branch that reads the chosen scheme.
 */
const SENSES = event("senses", "thwart", aScheme, {
  kind: "if",
  condition: { kind: "compare", left: threatOf(slot("scheme")), op: "atLeast", right: n(1) },
  then: [
    { kind: "thwart", target: slot("scheme"), amount: n(3) },
    {
      kind: "if",
      condition: { kind: "compare", left: threatOf(slot("scheme")), op: "equalTo", right: n(0) },
      then: [aMinion, { kind: "giveStatus", target: slot("minion"), status: "stunned" }],
    },
  ],
});
/** The same text unbranched, the removal binding what it removed and the stun given only when it removed any. */
const SENSES_BOUND = event(
  "senses-bound",
  "thwart",
  aScheme,
  { kind: "thwart", target: slot("scheme"), amount: n(3), bind: "removed" },
  {
    kind: "if",
    condition: { kind: "compare", left: threatOf(slot("scheme")), op: "equalTo", right: n(0) },
    then: [
      {
        kind: "if",
        condition: { kind: "varAtLeast", name: "removed.amount", amount: 1 },
        then: [aMinion, { kind: "giveStatus", target: slot("minion"), status: "stunned" }],
      },
    ],
  },
);
/** "Action: Remove 1 threat from the main scheme. If threat was removed this way, draw 1 card." A named scheme, bound. */
const NAMED_THEN_DRAW = event(
  "named-then-draw",
  null,
  { kind: "removeThreat", target: mainScheme, amount: n(1), bind: "removed" },
  {
    kind: "if",
    condition: { kind: "varAtLeast", name: "removed.amount", amount: 1 },
    then: [{ kind: "draw", player: you, amount: n(1) }],
  },
);
/** "Action: Remove 2 threat from a scheme and deal 1 damage to an enemy." Two parts, each with its own target. */
const TWO_PARTS = event(
  "two-parts",
  null,
  aScheme,
  anEnemy,
  { kind: "removeThreat", target: slot("scheme"), amount: n(2) },
  { kind: "dealDamage", target: slot("enemy"), amount: n(1) },
);
/** "Action: Remove 1 threat from the main scheme." A named scheme, no choice. */
const NAMED = event("named", null, { kind: "removeThreat", target: mainScheme, amount: n(1) });
/** "Action: Remove 1 threat from the main scheme. Draw 1 card." */
const NAMED_AND_DRAW = event(
  "named-and-draw",
  null,
  { kind: "removeThreat", target: mainScheme, amount: n(1) },
  { kind: "draw", player: you, amount: n(1) },
);
/** "Action: Remove a total of 3 threat from among schemes." */
const SPREAD = event("spread", null, {
  kind: "divide",
  what: "threat",
  amount: n(3),
  among: { categories: ["scheme"] },
  chooser: you,
});
const EVENTS = [FOR_ORDER, TIDY, SENSES, SENSES_BOUND, TWO_PARTS, NAMED, NAMED_AND_DRAW, NAMED_THEN_DRAW, SPREAD];

/** "Action: Exhaust this card → remove 1 threat from a scheme." */
const HQ_ACTION = stubAbility("hq.action", {
  trigger: { kind: "action" },
  cost: { exhaustSelf: true },
  effects: [aScheme, { kind: "removeThreat", target: slot("scheme"), amount: n(1) }],
});
const HQ = stubSupport({ id: "hq", cost: 1, abilities: [HQ_ACTION.ref] });
const PLOT = stubSideScheme({ id: "plot", startingThreat: 3, boostIcons: 0 });
const THUG = stubMinion({ id: "thug", hp: 3, atk: 1, sch: 1, boostIcons: 0 });

const deps: EngineDeps = depsOf(HQ_ACTION, ...EVENTS.map((e) => e.ability));

const mainOf = (state: GameState): InstanceId => state.mainScheme!.instanceId;
const villainOf = (state: GameState): InstanceId => state.villains[0]!.instanceId;
const withThreat = (state: GameState, id: InstanceId, threat: number): GameState => ({
  ...state,
  instances: { ...state.instances, [id]: { ...mustInstance(state, id), threat } },
});
/** The first turn, with the main scheme holding `threat`. */
function table(threat: number): GameState {
  const state = gameAtFirstTurn({
    cards: [HQ, PLOT, THUG, ...EVENTS.map((e) => e.card)],
    deps,
    encounter: [PLOT.id, THUG.id],
    deck: [HQ.id, ...EVENTS.map((e) => e.card.id)],
  });
  return withThreat(state, mainOf(state), threat);
}
const playCommand = (id: InstanceId): Command => ({
  type: "playCard",
  playerId: P1,
  cardInstanceId: id,
  payment: [],
  attachToInstanceId: null,
});
/** The refusal of playing `card` now (code and message), or null when the play is accepted. */
function refusal(state: GameState, card: { card: { id: CardId } }) {
  const given = giveCard(state, P1, card.card.id);
  const result = applyCommand(given.state, playCommand(given.id), deps);
  return result.ok ? null : { code: result.error.code, message: result.error.message };
}
/** How `legalActions` lists playing `card`: "legal", or the reason and message it is illegal with. */
function listed(state: GameState, card: { card: { id: CardId } }) {
  const given = giveCard(state, P1, card.card.id);
  const actions = legalActions(given.state, P1, deps);
  if (actions.kind !== "turn") throw new Error(`expected the player's turn, got ${actions.kind}`);
  const isIt = (a: { action: { kind: string; instanceId?: InstanceId } }) =>
    a.action.kind === "playCard" && a.action.instanceId === given.id;
  if (actions.legal.some(isIt)) return "legal";
  const entry = actions.illegal.find(isIt);
  return entry ? { reason: entry.reason, message: entry.message } : "unlisted";
}
/** Plays `card`, answering a target choice with `pick` when it is offered, and reports what each choice offered. */
function play(state: GameState, card: { card: { id: CardId } }, pick?: InstanceId) {
  const given = giveCard(state, P1, card.card.id);
  const offered: Record<string, readonly string[]> = {};
  const run = runCommandsPicking(
    given.state,
    deps,
    (current) => {
      const choice = current.pendingChoice;
      if (choice?.prompt.kind === "chooseTarget") {
        offered[choice.prompt.slot] = choice.options.map((o) => o.optionId);
        if (pick && choice.options.some((o) => o.optionId === pick)) return [pick];
      }
      if (choice?.prompt.kind === "divide") offered.divide = choice.options.map((o) => o.optionId.split("#")[0]!);
      return defaultPick(current);
    },
    playCommand(given.id),
  );
  return { ...run, offered };
}
const count = (events: readonly GameEvent[], type: GameEvent["type"]): number =>
  events.filter((e) => e.type === type).length;
const NO_TARGET = { code: "no_valid_target", message: "this event has no valid target" };
const NOT_LISTED = { reason: "no_valid_target", message: "this event has no valid target" };

describe("F1: a removal of threat needs a scheme with threat on it (RRG 1.8 'Target', p. 42)", () => {
  it("'(thwart): Remove 3 threat from a scheme' cannot be played with no threat anywhere, and can with 1", () => {
    expect(refusal(table(0), FOR_ORDER)).toEqual(NO_TARGET);
    expect(listed(table(0), FOR_ORDER)).toEqual(NOT_LISTED);
    expect(listed(table(1), FOR_ORDER)).toBe("legal");
    const { state, events } = play(table(1), FOR_ORDER);
    expect(mustInstance(state, mainOf(state)).threat).toBe(0);
    expect(count(events, "threatRemoved")).toBe(1);
  });

  it("the unlabeled 'Remove 2 threat from a scheme' follows the same rule", () => {
    expect(refusal(table(0), TIDY)).toEqual(NO_TARGET);
    expect(listed(table(0), TIDY)).toEqual(NOT_LISTED);
    expect(mustInstance(play(table(5), TIDY).state, mainOf(table(5))).threat).toBe(3);
  });

  it("'Exhaust → remove 1 threat from a scheme' cannot be used with no threat, and nothing is exhausted", () => {
    const hq = playerCardIntoPlay(table(0), HQ.id);
    const use: Command = {
      type: "useAbility",
      playerId: P1,
      cardInstanceId: hq.id,
      abilityId: HQ_ACTION.ref.id,
      payment: [],
    };
    const refused = applyCommand(hq.state, use, deps);
    expect(refused.ok ? null : refused.error).toMatchObject({
      code: "no_valid_target",
      message: "that ability has no valid target",
    });
    expect(mustInstance(hq.state, hq.id).exhausted).toBe(false);
    const actions = legalActions(hq.state, P1, deps);
    expect(actions.kind === "turn" && actions.legal.some((a) => a.action.kind === "useAbility")).toBe(false);
    const used = runCommandsPicking(withThreat(hq.state, mainOf(hq.state), 1), deps, defaultPick, use).state;
    expect(mustInstance(used, mainOf(used)).threat).toBe(0);
    expect(mustInstance(used, hq.id).exhausted).toBe(true);
  });

  it("'Remove 3 threat from a scheme. If this removes the last threat, stun a minion' still needs threat, however it reads the last threat", () => {
    for (const card of [SENSES, SENSES_BOUND]) {
      const engaged = minionEngagedWith(table(0), THUG.id);
      expect(refusal(engaged.state, card)).toEqual(NO_TARGET);
      const threatened = withThreat(engaged.state, mainOf(engaged.state), 2);
      const { state } = play(threatened, card);
      expect(mustInstance(state, mainOf(state)).threat).toBe(0);
      expect(mustInstance(state, engaged.id).statuses.stunned).toBe(1);
    }
  });

  it("'Remove 2 threat from a scheme and deal 1 damage to an enemy' has a valid target with no threat: the damage is dealt, no scheme is chosen", () => {
    const start = table(0);
    expect(listed(start, TWO_PARTS)).toBe("legal");
    const { state, events, offered } = play(start, TWO_PARTS);
    expect(offered.scheme).toBeUndefined();
    expect(events.filter((e) => e.type === "choiceFoundNothing").map((e) => e.slot)).toEqual(["scheme"]);
    expect(count(events, "threatRemoved")).toBe(0);
    expect(mustInstance(state, villainOf(state)).damage).toBe(1);
  });

  it("a named scheme: 'Remove 1 threat from the main scheme' needs threat there; with 'Draw 1 card' it has another part", () => {
    expect(refusal(table(0), NAMED)).toEqual(NO_TARGET);
    // Threat on a side scheme is not threat on the scheme the card names.
    const elsewhere = encounterCardInVillainArea(table(0), PLOT.id, 3);
    expect(refusal(elsewhere.state, NAMED)).toEqual(NO_TARGET);
    expect(mustInstance(play(table(2), NAMED).state, mainOf(table(2))).threat).toBe(1);
    const start = giveCard(table(0), P1, NAMED_AND_DRAW.card.id).state;
    const hand = mustPlayer(start, P1).hand.length;
    const drawn = play(start, NAMED_AND_DRAW);
    expect(count(drawn.events, "threatRemoved")).toBe(0);
    // The event left the hand and one card was drawn.
    expect(mustPlayer(drawn.state, P1).hand).toHaveLength(hand);
    // A draw that depends on the removal is no part of its own.
    expect(refusal(start, NAMED_THEN_DRAW)).toEqual(NO_TARGET);
    expect(listed(table(1), NAMED_THEN_DRAW)).toBe("legal");
  });

  it("only schemes holding threat are offered: the side scheme, not the empty main scheme", () => {
    const plot = encounterCardInVillainArea(table(0), PLOT.id, 3);
    const { state, offered } = play(plot.state, TIDY);
    expect(offered.scheme).toEqual([plot.id]);
    expect(mustInstance(state, plot.id).threat).toBe(1);
    expect(mustInstance(state, mainOf(state)).threat).toBe(0);
  });

  it("a division of threat: not playable with no threat, and its points go only to schemes holding some", () => {
    expect(refusal(table(0), SPREAD)).toEqual(NO_TARGET);
    const plot = encounterCardInVillainArea(table(0), PLOT.id, 3);
    const one = play(plot.state, SPREAD);
    // One candidate takes it all with no choice (as before); the empty main scheme is not one.
    expect(one.offered.divide).toBeUndefined();
    expect(one.state.villainArea).not.toContain(plot.id);
    const both = play(withThreat(plot.state, mainOf(plot.state), 4), SPREAD);
    expect(new Set(both.offered.divide)).toEqual(new Set([plot.id, mainOf(plot.state)]));
  });

  it("a confused hero may still attempt the thwart with no threat, and the confused card is discarded (RRG 1.8 p. 13)", () => {
    const start = table(0);
    const hero = mustPlayer(start, P1).identity.instanceId;
    const confused: GameState = {
      ...start,
      instances: {
        ...start.instances,
        [hero]: { ...mustInstance(start, hero), statuses: { ...mustInstance(start, hero).statuses, confused: 1 } },
      },
    };
    expect(listed(confused, FOR_ORDER)).toBe("legal");
    const { state, events } = play(confused, FOR_ORDER);
    expect(mustInstance(state, hero).statuses.confused).toBe(0);
    expect(count(events, "threatRemoved")).toBe(0);
    // The unlabeled removal is no thwart: confusion does not let it be played.
    expect(refusal(confused, TIDY)).toEqual(NO_TARGET);
  });

  it("a basic thwart follows the same rule", () => {
    const start = table(0);
    const hero = mustPlayer(start, P1).identity.instanceId;
    const thwart: Command = {
      type: "basicThwart",
      playerId: P1,
      thwarterInstanceId: hero,
      schemeInstanceId: mainOf(start),
    };
    const heroForm: GameState = {
      ...start,
      players: start.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" as const } })),
    };
    const refused = applyCommand(heroForm, thwart, deps);
    expect(refused.ok ? null : refused.error).toMatchObject({
      code: "no_valid_target",
      message: "scheme has no threat to remove",
    });
    expect(applyCommand(withThreat(heroForm, mainOf(start), 1), thwart, deps).ok).toBe(true);
  });
});
