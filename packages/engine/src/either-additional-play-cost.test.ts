/**
 * An either/or additional cost to play a card, with a flip of another card as one branch (#890 item 11), on synthetic
 * cards shaped like Sentinel's Rocket Punch (the `sentinel-tw` community pack: "As an additional cost to play this
 * event, exhaust Arms (Intact) or destroy it", where destroying flips the Component to its Destroyed side and deals 2
 * damage to Sentinel).
 *
 * The branch is the player's pick, named in the play command's `costSelection.branch`; absent, the first branch that
 * can be paid (`selectCost`). An exhausted Arms cannot be exhausted, so only destroying it pays (the author's ruling,
 * 2026-11-19: an exhausted Intact Component can still be destroyed).
 *
 * Sources: RRG 1.8 "Cost" (p. 13), "Flip" (p. 20).
 */

import { describe, expect, it } from "vitest";
import type { AbilityCost, EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { replay } from "./engine.js";
import type { InstanceId } from "./ids.js";
import { mustInstance, mustPlayer } from "./query.js";
import type { TargetQuery, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommandsPicking } from "./testing/drive.js";
import { stubEvent, stubUpgrade } from "./testing/fixtures.js";
import { defaultPick, giveCard } from "./testing/scenario.js";
import { gameAtFirstTurn, P1, playerCardIntoPlay } from "./testing/wave3.js";

const yourIdentity: TargetRef = { kind: "identityOf", player: { kind: "controller" } };
const ARMS: TargetQuery = { categories: ["upgrade"], name: "Arms (Intact)", controller: "you" };
/** "Exhaust Arms (Intact) or destroy it": exhaust it, or flip it and take 2 damage. */
const EXHAUST_OR_DESTROY: AbilityCost = {
  either: [
    { exhaustCards: { slot: "arms", query: ARMS, min: 1, max: 1 } },
    { flipCards: { slot: "arms", query: ARMS, min: 1, max: 1 }, damageSelf: 2 },
  ],
};

const ARMS_CARD = {
  ...stubUpgrade({ id: "arms", cost: 0 }),
  name: "Arms (Intact)",
  flipSide: { name: "Arms (Destroyed)", traits: [], keywords: [], text: { printed: "", current: "" }, abilities: [] },
};
const PUNCH_COST = stubAbility("punch.constant", {
  trigger: { kind: "constant", additionalCostToPlay: {} },
  cost: EXHAUST_OR_DESTROY,
  effects: [],
});
const PUNCH_ACTION = stubAbility("punch.action", {
  trigger: { kind: "action" },
  effects: [{ kind: "addCounters", target: yourIdentity, counterType: "punched", amount: { kind: "const", value: 1 } }],
});
const PUNCH = stubEvent({ id: "punch", cost: 0, abilities: [PUNCH_COST.ref, PUNCH_ACTION.ref] });

const CARDS = [ARMS_CARD, PUNCH];
const deps: EngineDeps = depsOf(PUNCH_COST, PUNCH_ACTION);

function start(armsExhausted = false): { state: GameState; arms: InstanceId; punch: InstanceId } {
  const base = gameAtFirstTurn({ cards: CARDS, deps, deck: [...CARDS, ...CARDS, ...CARDS].map((c) => c.id) });
  const hero: GameState = {
    ...base,
    players: base.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" } })),
  };
  const put = playerCardIntoPlay(hero, ARMS_CARD.id);
  const state: GameState = armsExhausted
    ? {
        ...put.state,
        instances: { ...put.state.instances, [put.id]: { ...mustInstance(put.state, put.id), exhausted: true } },
      }
    : put.state;
  const given = giveCard(state, P1, PUNCH.id);
  return { state: given.state, arms: put.id, punch: given.id };
}

const playOf = (id: InstanceId, branch?: number): Command => ({
  type: "playCard",
  playerId: P1,
  cardInstanceId: id,
  payment: [],
  attachToInstanceId: null,
  ...(branch !== undefined ? { costSelection: { branch } } : {}),
});
function run(state: GameState, command: Command) {
  const { state: after, session } = runCommandsPicking(state, deps, defaultPick, command);
  const replayed = replay(session.log, deps);
  if (!replayed.ok) throw new Error(replayed.error.message);
  expect(replayed.state).toEqual(after);
  return after;
}
const identity = (state: GameState) => mustInstance(state, mustPlayer(state, P1).identity.instanceId);

describe("#890 item 11 an either/or additional cost to play, one branch a flip of another card", () => {
  it("absent a pick, the first payable branch is paid: Arms exhausts, and the event resolves", () => {
    const { state, arms, punch } = start();
    const after = run(state, playOf(punch));
    expect(mustInstance(after, arms).exhausted).toBe(true);
    expect(mustInstance(after, arms).flipped).toBe(false);
    expect(identity(after).counters.punched).toBe(1);
  });

  it("the player may pick the second branch: Arms flips to its Destroyed side and the identity takes 2 damage", () => {
    const { state, arms, punch } = start();
    const damageBefore = identity(state).damage;
    const after = run(state, playOf(punch, 1));
    expect(mustInstance(after, arms).flipped).toBe(true);
    expect(mustInstance(after, arms).exhausted).toBe(false);
    expect(identity(after).damage).toBe(damageBefore + 2);
    expect(identity(after).counters.punched).toBe(1);
  });

  it("an exhausted Arms cannot be exhausted, so destroying it is the branch paid", () => {
    const { state, arms, punch } = start(true);
    const after = run(state, playOf(punch));
    expect(mustInstance(after, arms).flipped).toBe(true);
    expect(identity(after).counters.punched).toBe(1);
  });
});
