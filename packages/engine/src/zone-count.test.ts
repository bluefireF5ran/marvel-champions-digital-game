/**
 * `ValueSpec zoneCount`: the cards in a player's hand, deck or discard pile, optionally only those matching a query.
 * `exists` and `count` read cards in play, so before this no predicate could say "your discard pile holds an event
 * with a printed [energy] resource", and an option that takes such a card was offered with nothing to take.
 *
 * Sources: RRG 1.8 "Choose (Option)" (p. 12): an option that cannot be done is not chosen; "In Play and Out of Play"
 * (p. 23): a hand, a deck and a discard pile are out of play. Synthetic cards only.
 */

import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { applyCommand } from "./engine.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { mustInstance, mustPlayer } from "./query.js";
import { evaluate, resolveValue, type EffectContext } from "./select.js";
import type { EffectSpec, PlayerRef, PlayerZone, Predicate, TargetQuery, ValueSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommands } from "./testing/drive.js";
import { stubAlly, stubEvent, stubSupport } from "./testing/fixtures.js";
import { giveCards } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, P1, P2, playerCardIntoPlay } from "./testing/wave3.js";

const you: PlayerRef = { kind: "controller" };
const ENERGY_EVENT: TargetQuery = { categories: ["event"], printedResource: "energy" };
const count = (zone: PlayerZone | readonly PlayerZone[], player: PlayerRef = you, filter?: TargetQuery): ValueSpec => ({
  kind: "zoneCount",
  zone,
  player,
  ...(filter ? { filter } : {}),
});
const holds = (zone: PlayerZone, filter: TargetQuery): Predicate => ({
  kind: "compare",
  left: count(zone, you, filter),
  op: "atLeast",
  right: { kind: "const", value: 1 },
});
const damage = (value: number): EffectSpec => ({
  kind: "dealDamage",
  target: { kind: "villain" },
  amount: { kind: "const", value },
});

const EMBER = stubEvent({ id: "ember", cost: 9, resourceIcons: { energy: 1 } });
const STONE = stubEvent({ id: "stone", cost: 9, resourceIcons: { physical: 1 } });
const FRIEND = stubAlly({ id: "friend", cost: 9, atk: 1, thw: 1, hp: 2, resourceIcons: { energy: 1 } });

/** "Action: Choose one: deal 5 damage (only with an [energy] event in your discard pile), or deal 1 damage." */
const FANS_ACTION = stubAbility("fans.action", {
  trigger: { kind: "action" },
  effects: [
    {
      kind: "chooseOne",
      chooser: you,
      options: [
        {
          label: "Use an energy event from your discard pile",
          condition: holds("discard", ENERGY_EVENT),
          effects: [damage(5)],
        },
        { label: "Deal 1 damage", effects: [damage(1)] },
      ],
    },
  ],
});
const FANS = stubSupport({ id: "fans", cost: 0, abilities: [FANS_ACTION.ref] });

const deps: EngineDeps = depsOf(FANS_ACTION);
const CARDS = [EMBER, STONE, FRIEND, FANS];

/** Every seat with an empty hand and discard pile (all of it in the deck), so each count below is exact. */
function game(players: 1 | 2 = 1): GameState {
  const state = gameAtFirstTurn({
    cards: CARDS,
    deps,
    players,
    deck: [...copiesOf(EMBER.id, 3), ...copiesOf(STONE.id, 3), ...copiesOf(FRIEND.id, 3), FANS.id],
  });
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: [], discard: [], deck: [...p.deck, ...p.hand, ...p.discard] })),
  };
}
const give = (state: GameState, player: PlayerId, ...cards: readonly string[]): GameState =>
  giveCards(state, player, ...cards).state;
/** Moves the first copy of each card from `player`'s deck to the top of their discard pile (surgery). */
function discarded(state: GameState, player: PlayerId, ...cards: readonly string[]): GameState {
  let current = state;
  for (const cardId of cards) {
    const seat = mustPlayer(current, player);
    const id = seat.deck.find((candidate) => mustInstance(current, candidate).cardId === cardId);
    if (!id) throw new Error(`no ${cardId} in ${player}'s deck`);
    current = {
      ...current,
      players: current.players.map((p) =>
        p.playerId === player ? { ...p, deck: p.deck.filter((x) => x !== id), discard: [id, ...p.discard] } : p,
      ),
    };
  }
  return current;
}
const contextOf = (player: PlayerId): EffectContext => ({
  selfInstanceId: null,
  controllerId: player,
  event: null,
  bindings: {},
  deps,
});
const read = (state: GameState, value: ValueSpec, player: PlayerId = P1): number =>
  resolveValue(state, value, contextOf(player), deps);
const villainDamage = (state: GameState): number =>
  mustInstance(state, state.villains[0]?.instanceId as InstanceId).damage;

describe("ValueSpec zoneCount: cards in a player's out-of-play zones", () => {
  it("counts the discard pile, with and without a query", () => {
    const empty = game();
    expect(read(empty, count("discard"))).toBe(0);
    expect(read(empty, count("discard", you, ENERGY_EVENT))).toBe(0);
    const state = discarded(empty, P1, EMBER.id, EMBER.id, STONE.id, FRIEND.id);
    expect(read(state, count("discard"))).toBe(4);
    // Two events with a printed [energy]; the ally with one is not an event, the other event prints [physical].
    expect(read(state, count("discard", you, ENERGY_EVENT))).toBe(2);
    expect(read(state, count("discard", you, { categories: ["ally"] }))).toBe(1);
  });

  it("counts the hand and the deck, each as it stands", () => {
    const state = give(discarded(game(), P1, EMBER.id), P1, EMBER.id, STONE.id);
    const deck = mustPlayer(state, P1).deck.length;
    expect(read(state, count("hand"))).toBe(2);
    expect(read(state, count("hand", you, ENERGY_EVENT))).toBe(1);
    expect(read(state, count("deck"))).toBe(deck);
    // Three ember cards in all: one discarded, one in hand, one left in the deck.
    expect(read(state, count("deck", you, ENERGY_EVENT))).toBe(1);
    expect(read(state, count("hand"))).toBe(read(state, { kind: "handCount", player: you }));
    expect(read(state, count("deck"))).toBe(read(state, { kind: "deckCount", player: you }));
  });

  it("several zones are one pool, as a zone selector's are", () => {
    const state = give(discarded(game(), P1, EMBER.id), P1, EMBER.id);
    expect(read(state, count(["hand", "discard"], you, ENERGY_EVENT))).toBe(2);
    expect(read(state, count(["deck", "discard", "hand"], you, ENERGY_EVENT))).toBe(3);
  });

  it("reads the player the ref names: you, another player, each player", () => {
    const state = discarded(discarded(game(2), P1, EMBER.id), P2, EMBER.id, EMBER.id, STONE.id);
    expect(read(state, count("discard", you, ENERGY_EVENT), P1)).toBe(1);
    expect(read(state, count("discard", you, ENERGY_EVENT), P2)).toBe(2);
    expect(read(state, count("discard", { kind: "others", of: you }, ENERGY_EVENT), P1)).toBe(2);
    expect(read(state, count("discard", { kind: "each" }), P1)).toBe(4);
  });

  it("as a predicate: 'your discard pile holds an [energy] event'", () => {
    const empty = game();
    expect(evaluate(empty, holds("discard", ENERGY_EVENT), contextOf(P1))).toBe(false);
    expect(evaluate(discarded(empty, P1, STONE.id), holds("discard", ENERGY_EVENT), contextOf(P1))).toBe(false);
    expect(evaluate(discarded(empty, P1, EMBER.id), holds("discard", ENERGY_EVENT), contextOf(P1))).toBe(true);
    // In hand is not in the discard pile.
    expect(evaluate(give(empty, P1, EMBER.id), holds("discard", ENERGY_EVENT), contextOf(P1))).toBe(false);
  });
});

describe("an option that takes a card from the discard pile is offered only while one is there", () => {
  const act = (id: InstanceId): Command => ({
    type: "useAbility",
    playerId: P1,
    cardInstanceId: id,
    abilityId: FANS_ACTION.ref.id,
    payment: [],
  });

  it("nothing eligible in the discard pile: the other option resolves without asking", () => {
    const put = playerCardIntoPlay(discarded(game(), P1, STONE.id), FANS.id);
    const run = runCommands(put.state, deps, act(put.id));
    expect(run.state.pendingChoice).toBeNull();
    expect(villainDamage(run.state)).toBe(1);
  });

  it("an eligible card there: both options are offered", () => {
    const put = playerCardIntoPlay(discarded(game(), P1, EMBER.id), FANS.id);
    const asked = applyCommand(put.state, act(put.id), deps);
    if (!asked.ok) throw new Error(asked.error.message);
    expect(asked.state.pendingChoice?.options.map((o) => o.label)).toEqual([
      "Use an energy event from your discard pile",
      "Deal 1 damage",
    ]);
  });
});
