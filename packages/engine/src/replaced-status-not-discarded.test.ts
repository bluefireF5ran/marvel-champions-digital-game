/**
 * Replacing a status card (`giveStatus.replacing`, DSL `replaceStatus`, Vapors of Valtorr) does not discard the
 * replaced card: no `statusDiscarded` announcement, so an "after a tough status card is discarded" response (Colossus's
 * Iron Will, `mut_gen` 32004) does not answer it. The replaced card still leaves, logged `statusRemoved` with reason
 * `replaced`. Contributor's rules call 2026-10-16 (bluefireF5ran), by analogy to FFG ruling May 10, 2024 (post-RRG
 * 1.5 #181), which says a replacement is not a placement but does not cover discarding. A plain discard of the same
 * card is still announced.
 */

import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps } from "./abilities.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { mustInstance } from "./query.js";
import type { EffectSpec, TargetQuery, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommandsPicking } from "./testing/drive.js";
import { stubEvent, stubSupport } from "./testing/fixtures.js";
import { defaultPick, giveCard } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, P1, playerCardIntoPlay } from "./testing/wave3.js";

const yourHero: TargetQuery = { categories: ["identity"], controller: "you" };
const hero: TargetRef = { kind: "identityOf", player: { kind: "controller" } };
const def = (definition: AbilityDefinition) => definition;

// Iron Will's shape: "After a tough status card is discarded from your hero, …" (here: count it).
const IRON_WILL_RESPONSE = stubAbility(
  "iron-will.response",
  def({
    trigger: {
      kind: "response",
      forced: false,
      on: { on: "statusDiscarded", targetIs: yourHero, eventIs: { status: "tough" } },
    },
    effects: [
      { kind: "addCounters", target: { kind: "self" }, counterType: "heard", amount: { kind: "const", value: 1 } },
    ],
  }),
);
const IRON_WILL = stubSupport({ id: "iron-will", cost: 0, abilities: [IRON_WILL_RESPONSE.ref] });

const event = (id: string, effects: readonly EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
const TOUGHEN = event("toughen", [{ kind: "giveStatus", target: hero, status: "tough" }]);
// Vapors of Valtorr's shape: "Replace that status card with a different status card."
const REPLACE = event("replace", [{ kind: "giveStatus", target: hero, status: "stunned", replacing: "tough" }]);
const STRIP = event("strip", [{ kind: "removeStatus", target: hero, status: "tough" }]);
const EVENTS = [TOUGHEN, REPLACE, STRIP];

const deps: EngineDeps = depsOf(IRON_WILL_RESPONSE, ...EVENTS.map((e) => e.ability));

function start(): GameState {
  let state = gameAtFirstTurn({
    deps,
    cards: [IRON_WILL, ...EVENTS.map((e) => e.card)],
    deck: [IRON_WILL.id, ...EVENTS.flatMap((e) => copiesOf(e.card.id, 4))],
  });
  state = playerCardIntoPlay(state, IRON_WILL.id).state;
  return { ...state, players: state.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" } })) };
}

const acceptTriggers = (state: GameState): readonly string[] => {
  const choice = state.pendingChoice;
  if (choice?.prompt.kind === "chooseTriggers") return choice.options.map((o) => o.optionId);
  return defaultPick(state);
};

function play(state: GameState, card: string) {
  const given = giveCard(state, P1, card);
  return runCommandsPicking(given.state, deps, acceptTriggers, {
    type: "playCard",
    playerId: P1,
    cardInstanceId: given.id,
    payment: [],
    attachToInstanceId: null,
  });
}

const heroId = (state: GameState): InstanceId => state.players[0]!.identity.instanceId;
const heard = (state: GameState): number => {
  const id = state.players[0]!.playArea.find((i) => mustInstance(state, i).cardId === IRON_WILL.id)!;
  return mustInstance(state, id).counters["heard"] ?? 0;
};
const announced = (events: readonly GameEvent[]): number =>
  events.filter((e) => e.type === "triggerEvent" && e.event.kind === "statusDiscarded").length;

describe("replacing a status card is not discarding it (contributor's rules call 2026-10-16 (bluefireF5ran))", () => {
  it("the replaced tough card leaves unannounced, so Iron Will does not answer", () => {
    const tough = play(start(), TOUGHEN.card.id).state;
    expect(mustInstance(tough, heroId(tough)).statuses.tough).toBe(1); // setup check
    const result = play(tough, REPLACE.card.id);
    const after = mustInstance(result.state, heroId(result.state));
    expect(after.statuses.tough).toBe(0);
    expect(after.statuses.stunned).toBe(1);
    expect(result.events).toContainEqual({
      type: "statusRemoved",
      instanceId: heroId(result.state),
      status: "tough",
      reason: "replaced",
    });
    expect(announced(result.events)).toBe(0);
    expect(heard(result.state)).toBe(0);
  });

  it("a plain discard of the same card is still announced and answered", () => {
    const tough = play(start(), TOUGHEN.card.id).state;
    const result = play(tough, STRIP.card.id);
    expect(mustInstance(result.state, heroId(result.state)).statuses.tough).toBe(0);
    expect(heard(result.state)).toBe(1);
  });
});
