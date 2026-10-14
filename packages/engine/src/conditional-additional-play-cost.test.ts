/**
 * A conditional part in an additional cost to play a card (`additionalCostToPlay` with `AbilityCost.conditional`,
 * decided by `playCostWith`), on synthetic cards shaped like Gilgamesh (`hercules` 59025: "As an additional cost to
 * play this card, if you do not have the Eternal trait, confuse your identity.").
 *
 * Sources: RRG 1.8 "Cost" (p. 13): "A player must pay all additional costs simultaneously with the cost that is being
 * added to … if they cannot pay for all of the costs at once, then they do not pay any of the costs and the effect
 * associated with the costs does not occur." "Initiating Abilities" (p. 24), step 3: the cost is determined before it
 * is paid. "Confuse, Confused" (p. 12): "If an ability 'confuses' a character, give that character a confused status
 * card." "Status Cards" (p. 41): "A character cannot have more than one status card of each type at a time.
 * Characters with the steady keyword can have one additional confused status card". "Stalwart": the character cannot
 * be confused. RRG FAQ "Superhuman Strength (#28)" (p. 57): an effect that cannot affect a character that "cannot be
 * stunned because it is already stunned or is stalwart" cannot resolve.
 *
 * Reading built (A), flagged for the owner: "confuse your identity" as a cost is paid by placing a confused status
 * card, so an identity that cannot be given one (it holds its limit, or is stalwart) cannot pay it and the card cannot
 * be played. (B) would be that the cost is paid whether or not a card is placed.
 */

import { trait } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityCost, AbilityDefinition, EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { applyCommand, replay } from "./engine.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { legalActions } from "./legal.js";
import { mustInstance, mustPlayer } from "./query.js";
import type { Predicate, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommandsPicking } from "./testing/drive.js";
import { stubAlly, stubEvent, stubSupport } from "./testing/fixtures.js";
import { defaultPick, giveCard } from "./testing/scenario.js";
import { gameAtFirstTurn, P1, P2, playerCardIntoPlay } from "./testing/wave3.js";

const ELDER = trait("ELDER");
const yourIdentity: TargetRef = { kind: "identityOf", player: { kind: "controller" } };
const YOUR_IDENTITY = { categories: ["identity"], controller: "you" } as const;
const YOU_ARE_ELDER: Predicate = { kind: "hasTrait", of: yourIdentity, trait: ELDER };
const CONFUSE_YOURSELF: AbilityCost = { giveStatus: { status: "confused", to: yourIdentity } };
/** "…, if you do not have the [Elder] trait, confuse your identity." */
const UNLESS_ELDER: AbilityCost = { conditional: { condition: YOU_ARE_ELDER, then: {}, else: CONFUSE_YOURSELF } };

const additional = (id: string, cost: AbilityCost) =>
  stubAbility(id, { trigger: { kind: "constant", additionalCostToPlay: {} }, cost, effects: [] });
const constant = (id: string, parts: Omit<Extract<AbilityDefinition["trigger"], { kind: "constant" }>, "kind">) =>
  stubAbility(id, { trigger: { kind: "constant", ...parts }, effects: [] } satisfies AbilityDefinition);

const VETERAN_COST = additional("veteran.constant", UNLESS_ELDER);
const VETERAN = stubAlly({ id: "veteran", cost: 0, atk: 2, thw: 2, hp: 4, abilities: [VETERAN_COST.ref] });
/** The same with a printed cost of 2. */
const ELITE_COST = additional("elite.constant", UNLESS_ELDER);
const ELITE = stubAlly({ id: "elite", cost: 2, atk: 2, thw: 2, hp: 4, abilities: [ELITE_COST.ref] });

/** "Your identity gains the [Elder] trait." */
const CREST_RULE = constant("crest.constant", { traitGrants: [{ trait: ELDER, target: YOUR_IDENTITY }] });
const CREST = stubSupport({ id: "crest", cost: 0, abilities: [CREST_RULE.ref] });
/** "Your identity gains steady." / "… gains stalwart." */
const ANCHOR_RULE = constant("anchor.constant", {
  keywordGrants: [{ keyword: { name: "steady" }, target: YOUR_IDENTITY }],
});
const ANCHOR = stubSupport({ id: "anchor", cost: 0, abilities: [ANCHOR_RULE.ref] });
const BULWARK_RULE = constant("bulwark.constant", {
  keywordGrants: [{ keyword: { name: "stalwart" }, target: YOUR_IDENTITY }],
});
const BULWARK = stubSupport({ id: "bulwark", cost: 0, abilities: [BULWARK_RULE.ref] });

/**
 * An event with the additional cost and an Action whose own cost is conditional too ("discard the top 2 cards of your
 * deck, the top card instead if you control the crest"), recording the Action's pick.
 */
const RALLY_COST = additional("rally.constant", UNLESS_ELDER);
const RALLY_ACTION = stubAbility("rally.action", {
  trigger: { kind: "action" },
  cost: {
    conditional: {
      condition: { kind: "exists", query: { categories: ["support"], name: "crest", controller: "you" } },
      then: { discardFromDeck: 1 },
      else: { discardFromDeck: 2 },
    },
  },
  effects: [
    {
      kind: "addCounters",
      target: yourIdentity,
      counterType: "rallied",
      amount: { kind: "const", value: 1 },
    },
    {
      kind: "addCounters",
      target: yourIdentity,
      counterType: "branch",
      amount: { kind: "var", name: "cost.condition" },
    },
  ],
});
const RALLY = stubEvent({ id: "rally", cost: 0, abilities: [RALLY_COST.ref, RALLY_ACTION.ref] });

const CARDS = [VETERAN, ELITE, CREST, ANCHOR, BULWARK, RALLY];
const deps: EngineDeps = depsOf(
  VETERAN_COST,
  ELITE_COST,
  CREST_RULE,
  ANCHOR_RULE,
  BULWARK_RULE,
  RALLY_COST,
  RALLY_ACTION,
);

function start(players: 1 | 2 = 1): GameState {
  return gameAtFirstTurn({ cards: CARDS, deps, players, deck: CARDS.map((c) => c.id) });
}
const identityOf = (state: GameState, player: PlayerId = P1): InstanceId =>
  mustPlayer(state, player).identity.instanceId;
const confused = (state: GameState, player: PlayerId = P1): number =>
  mustInstance(state, identityOf(state, player)).statuses.confused;
function withConfused(state: GameState, count: number): GameState {
  const id = identityOf(state);
  const instance = mustInstance(state, id);
  return {
    ...state,
    instances: { ...state.instances, [id]: { ...instance, statuses: { ...instance.statuses, confused: count } } },
  };
}

const playOf = (id: InstanceId, extra: Partial<Extract<Command, { type: "playCard" }>> = {}): Command => ({
  type: "playCard",
  playerId: P1,
  cardInstanceId: id,
  payment: [],
  attachToInstanceId: null,
  ...extra,
});
function run(state: GameState, ...commands: readonly Command[]) {
  const { state: after, events, session } = runCommandsPicking(state, deps, defaultPick, ...commands);
  const replayed = replay(session.log, deps);
  if (!replayed.ok) throw new Error(replayed.error.message);
  expect(replayed.state).toEqual(after);
  return { state: after, events };
}
function playAction(state: GameState, card: InstanceId) {
  const actions = legalActions(state, P1, deps);
  if (actions.kind !== "turn") throw new Error(`expected P1's turn, got ${actions.kind}`);
  const isPlay = (a: { action: { kind: string; instanceId?: InstanceId } }) =>
    a.action.kind === "playCard" && a.action.instanceId === card;
  return { legal: actions.legal.find(isPlay), illegal: actions.illegal.find(isPlay) };
}
const inPlay = (state: GameState, id: InstanceId): boolean => mustPlayer(state, P1).playArea.includes(id);

describe("a conditional additional cost to play: decided for the player playing the card", () => {
  it("without the trait: offered, and playing it confuses the identity as the card is paid for", () => {
    const { state, id } = giveCard(start(), P1, VETERAN.id);
    expect(playAction(state, id).legal).toBeDefined();
    const { state: after, events } = run(state, playOf(id));
    expect(confused(after)).toBe(1);
    expect(inPlay(after, id)).toBe(true);
    // Paid before the card enters play (RRG 1.8 "Cost Arrow Icon", p. 14).
    const given = events.findIndex((e) => e.type === "statusGiven" && e.instanceId === identityOf(after));
    const entered = events.findIndex((e) => e.type === "cardMoved" && e.instanceId === id && e.to.kind === "playArea");
    expect(given).toBeGreaterThan(-1);
    expect(entered).toBeGreaterThan(given);
  });

  it("with the trait: the other branch (nothing) is the cost, and the identity is not confused", () => {
    const crest = playerCardIntoPlay(start(), CREST.id).state;
    const { state, id } = giveCard(crest, P1, VETERAN.id);
    expect(playAction(state, id).legal).toBeDefined();
    const { state: after } = run(state, playOf(id));
    expect(confused(after)).toBe(0);
    expect(inPlay(after, id)).toBe(true);
  });

  it("the trait is the playing player's own: another player's does not excuse it", () => {
    const crest = playerCardIntoPlay(start(2), CREST.id, P2).state;
    const { state, id } = giveCard(crest, P1, VETERAN.id);
    const { state: after } = run(state, playOf(id));
    expect(confused(after)).toBe(1);
    expect(confused(after, P2)).toBe(0);
  });

  it("with a printed cost: the resources and the status card are paid together", () => {
    const given = giveCard(start(), P1, ELITE.id);
    const { state, id } = given;
    const { legal } = playAction(state, id);
    expect(legal?.needsPayment).toBe(true);
    const { state: after } = run(state, legal!.example);
    expect(confused(after)).toBe(1);
    expect(inPlay(after, id)).toBe(true);
    expect(mustPlayer(after, P1).hand.length).toBeLessThan(mustPlayer(state, P1).hand.length - 1);
  });
});

describe("the picked branch cannot be paid: the card cannot be played, and nothing is paid", () => {
  it("an identity already confused: listed illegal with the cost's reason, the command refused, the state untouched", () => {
    const { state, id } = giveCard(withConfused(start(), 1), P1, VETERAN.id);
    const { legal, illegal } = playAction(state, id);
    expect(legal).toBeUndefined();
    expect(illegal?.reason).toBe("no_valid_target");
    expect(illegal?.message).toBe(`${identityOf(state)} cannot be given another confused status card`);
    const result = applyCommand(state, playOf(id), deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("no_valid_target");
  });

  it("…with a printed cost: no resources are spent either", () => {
    const { state, id } = giveCard(withConfused(start(), 1), P1, ELITE.id);
    expect(playAction(state, id).legal).toBeUndefined();
    const payment = mustPlayer(state, P1)
      .hand.filter((card) => card !== id)
      .slice(0, 2)
      .map((card) => ({ fromHand: card }));
    expect(payment).toHaveLength(2);
    const result = applyCommand(state, playOf(id, { payment }), deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("no_valid_target");
  });

  it("…and the trait lifts it: already confused with the trait, the card is played and no card is added", () => {
    const crest = playerCardIntoPlay(withConfused(start(), 1), CREST.id).state;
    const { state, id } = giveCard(crest, P1, VETERAN.id);
    expect(playAction(state, id).legal).toBeDefined();
    const { state: after } = run(state, playOf(id));
    expect(confused(after)).toBe(1);
    expect(inPlay(after, id)).toBe(true);
  });

  // RRG 1.8 "Status Cards" (p. 41): a steady character "can have one additional confused status card".
  it("a steady identity holding one confused card has room for the second, and none for a third", () => {
    const anchored = playerCardIntoPlay(start(), ANCHOR.id).state;
    const one = giveCard(withConfused(anchored, 1), P1, VETERAN.id);
    expect(playAction(one.state, one.id).legal).toBeDefined();
    expect(confused(run(one.state, playOf(one.id)).state)).toBe(2);

    const two = giveCard(withConfused(anchored, 2), P1, VETERAN.id);
    expect(playAction(two.state, two.id).legal).toBeUndefined();
    expect(applyCommand(two.state, playOf(two.id), deps).ok).toBe(false);
  });

  it("a stalwart identity cannot be confused, so it cannot pay", () => {
    const { state, id } = giveCard(playerCardIntoPlay(start(), BULWARK.id).state, P1, VETERAN.id);
    expect(playAction(state, id).legal).toBeUndefined();
    expect(playAction(state, id).illegal?.reason).toBe("no_valid_target");
    expect(applyCommand(state, playOf(id), deps).ok).toBe(false);
  });
});

describe("with an event whose Action has a conditional cost of its own: each is decided, neither replaces the other", () => {
  const deckSize = (state: GameState) => mustPlayer(state, P1).deck.length;
  const counters = (state: GameState) => mustInstance(state, identityOf(state)).counters;

  it("no trait, no crest: confused, and the Action's own 'else' branch is paid (2 cards) and recorded", () => {
    const { state, id } = giveCard(start(), P1, RALLY.id);
    const { state: after } = run(state, playOf(id));
    expect(confused(after)).toBe(1);
    expect(deckSize(after)).toBe(deckSize(state) - 2);
    expect(counters(after)["rallied"]).toBe(1);
    expect(counters(after)["branch"] ?? 0).toBe(0);
  });

  it("the crest gives the trait and is the Action's condition: not confused, 1 card, the Action's pick recorded as 1", () => {
    const crest = playerCardIntoPlay(start(), CREST.id).state;
    const { state, id } = giveCard(crest, P1, RALLY.id);
    const { state: after } = run(state, playOf(id));
    expect(confused(after)).toBe(0);
    expect(deckSize(after)).toBe(deckSize(state) - 1);
    expect(counters(after)["branch"]).toBe(1);
  });

  it("already confused: the event cannot be played and its Action's cost is not paid", () => {
    const { state, id } = giveCard(withConfused(start(), 1), P1, RALLY.id);
    expect(playAction(state, id).legal).toBeUndefined();
    const result = applyCommand(state, playOf(id), deps);
    expect(result.ok).toBe(false);
  });
});
