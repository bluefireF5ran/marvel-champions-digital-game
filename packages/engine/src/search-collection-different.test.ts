/**
 * docs/phase7-wave9.md §3.77: a collection search for "a different" card, and linked cards left out of every search.
 *
 * Wiretap (`aos` 50186): "Setup: Each player may add 1 secret counter to a Board Member environment to search their
 * collection for **a different** Justice ally and shuffle it into their deck." Owner decision §4.1 Q12 = A: different
 * from that player's own cards, which is no title in their deck, hand, discard pile or play area.
 *
 * RRG 1.8 "Linked (Card Title)" (p. 27): "Cards with the linked keyword cannot be included in any deck. Instead, they
 * are set aside at the start of the game if any deck includes the card that brings the linked cards into play".
 * Ruling August 3, 2026 - Ruling 4, answer 3: "Linked cards cannot be included in decks." RRG 1.8 "Search" (p. 39): a
 * search may find nothing. Synthetic cards only; the engine never names a card.
 */
import type { AllyCard, AnyCard } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { PendingChoice } from "./choices.js";
import type { Command } from "./commands.js";
import { startSession } from "./engine.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { mustInstance, mustPlayer } from "./query.js";
import { collectionCandidates } from "./resolve/collection.js";
import type { CollectionSearchFilter, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubAlly, stubSupport } from "./testing/fixtures.js";
import { defaultPick, giveCard } from "./testing/scenario.js";
import { gameAtFirstTurn, P1, P2, playerCardIntoPlay } from "./testing/wave3.js";

const found: TargetRef = { kind: "slot", slot: "found" };

/** "A Justice ally", and "a different Justice ally". */
const justiceAlly: CollectionSearchFilter = { categories: ["ally"], aspects: ["justice"] };
const differentJusticeAlly: CollectionSearchFilter = { ...justiceAlly, notAmongOwnCards: true };

const ally = (id: string, extra: Partial<AllyCard> = {}): AllyCard => ({
  ...stubAlly({ id, cost: 1, atk: 1, thw: 1, hp: 1 }),
  aspect: "justice",
  ...extra,
});
/** In each seat's deck, with a second printed copy left in the collection. */
const AGENT = ally("agent", { quantityInSet: 3 });
/** A reprint: another card id with the title of a card in the deck. */
const AGENT_REPRINT = ally("agent-reprint", { name: "agent" });
/** In nobody's deck; two printed copies. */
const SCOUT = ally("scout", { quantityInSet: 2 });
const WARDEN = ally("warden", { quantityInSet: 2 });
/** A Justice ally with the linked keyword: brought into a game by the card it names and by nothing else. */
const SHIELDMATE: AnyCard = ally("shieldmate", { keywords: [{ name: "linked", cardTitle: "Some Card" }] });
/** Not a Justice ally. */
const BRUISER = ally("bruiser", { aspect: "aggression" });

/** "Search your collection for a different Justice ally and shuffle it into your deck." */
const RECRUIT = stubAbility("recruit.action", {
  trigger: { kind: "action" },
  effects: [
    { kind: "searchCollection", player: { kind: "controller" }, filter: differentJusticeAlly, bind: "found" },
    { kind: "moveCards", cards: { kind: "ref", ref: found }, to: "deckShuffle" },
  ],
});
const DESK = stubSupport({ id: "recruit", cost: 0, abilities: [RECRUIT.ref] });
const deps: EngineDeps = depsOf(RECRUIT);

const game = (players: 1 | 2 = 2): GameState =>
  gameAtFirstTurn({
    cards: [AGENT, AGENT_REPRINT, SCOUT, WARDEN, SHIELDMATE, BRUISER, DESK],
    deps,
    players,
    deck: [AGENT.id, DESK.id],
  });

const ids = (cards: readonly AnyCard[]): readonly string[] => cards.map((card) => card.id);

/** Uses the desk's action for `player`, answering the collection prompt with `pick` (null finds nothing). */
function recruit(state: GameState, player: PlayerId, pick: string | null, asked: PendingChoice[] = []) {
  const inPlay = mustPlayer(state, player).playArea.find((id) => mustInstance(state, id).cardId === DESK.id);
  const placed = inPlay ? { state, id: inPlay } : playerCardIntoPlay(state, DESK.id, player);
  const command: Command = {
    type: "useAbility",
    playerId: player,
    cardInstanceId: placed.id,
    abilityId: RECRUIT.ref.id as Extract<Command, { type: "useAbility" }>["abilityId"],
    payment: [],
  };
  const run = driveSession(startSession(placed.state), deps, [command], (current) => {
    const choice = current.pendingChoice!;
    if (choice.prompt.kind !== "searchCollection") return defaultPick(current);
    asked.push(choice);
    return pick === null ? [] : [pick];
  });
  return { state: run.session.state, asked };
}

/** Moves one copy of `card` into the named zone of `player` (test surgery). */
function inZone(state: GameState, player: PlayerId, card: string, zone: "hand" | "discard" | "deck"): GameState {
  const given = giveCard(state, player, card);
  const without = (list: readonly InstanceId[]) => list.filter((id) => id !== given.id);
  return {
    ...given.state,
    players: given.state.players.map((seat) =>
      seat.playerId === player
        ? {
            ...seat,
            hand: zone === "hand" ? [...without(seat.hand), given.id] : without(seat.hand),
            discard: zone === "discard" ? [...without(seat.discard), given.id] : without(seat.discard),
            deck: zone === "deck" ? [...without(seat.deck), given.id] : without(seat.deck),
          }
        : seat,
    ),
  };
}

describe("CollectionSearchFilter.notAmongOwnCards (§3.77, Q12 = A)", () => {
  it("leaves out every title among the searching player's cards, a reprint of one included", () => {
    const state = game();
    // Without the flag: the agent's spare copy and its reprint are both in the collection.
    expect(ids(collectionCandidates(state, justiceAlly, P1))).toEqual(["agent", "agent-reprint", "scout", "warden"]);
    expect(ids(collectionCandidates(state, differentJusticeAlly, P1))).toEqual(["scout", "warden"]);
  });

  it("reads the deck, the hand, the discard pile and the play area alike", () => {
    for (const zone of ["deck", "hand", "discard"] as const) {
      const state = inZone(game(), P1, AGENT.id, zone);
      expect(ids(collectionCandidates(state, differentJusticeAlly, P1))).toEqual(["scout", "warden"]);
    }
    const inPlay = playerCardIntoPlay(game(), AGENT.id, P1).state;
    expect(ids(collectionCandidates(inPlay, differentJusticeAlly, P1))).toEqual(["scout", "warden"]);
  });

  it("is each player's own: a title only another player holds is still found", () => {
    const asked: PendingChoice[] = [];
    const after = recruit(game(), P2, SCOUT.id, asked).state;
    expect(asked[0]?.options.map((option) => option.optionId)).toEqual(["scout", "warden"]);
    // The second player's scout is in their deck; one printed copy is left in the collection.
    expect(mustPlayer(after, P2).deck.some((id) => mustInstance(after, id).cardId === SCOUT.id)).toBe(true);
    expect(ids(collectionCandidates(after, differentJusticeAlly, P2))).toEqual(["warden"]);
    expect(ids(collectionCandidates(after, differentJusticeAlly, P1))).toEqual(["scout", "warden"]);
  });

  it("a second search by the same player finds another title: the card found first is theirs by then", () => {
    const first = recruit(game(1), P1, SCOUT.id);
    const asked: PendingChoice[] = [];
    const second = recruit(first.state, P1, WARDEN.id, asked);
    // A printed copy of the scout is left, and it is no longer offered to this player.
    expect(asked[0]?.options.map((option) => option.optionId)).toEqual(["warden"]);
    const third: PendingChoice[] = [];
    const end = recruit(second.state, P1, null, third);
    // Nothing is left to find: nobody is asked, and nothing changes (RRG 1.8 "Search", p. 39).
    expect(third).toEqual([]);
    expect(Object.keys(end.state.instances)).toHaveLength(Object.keys(second.state.instances).length);
  });

  it("a search may find nothing, and declining changes nothing", () => {
    const before = game(1);
    const asked: PendingChoice[] = [];
    const after = recruit(before, P1, null, asked).state;
    expect(asked).toHaveLength(1);
    expect(Object.keys(after.instances)).toHaveLength(Object.keys(before.instances).length);
  });

  it("with no searching player named nothing is left out", () => {
    expect(ids(collectionCandidates(game(), differentJusticeAlly))).toEqual([
      "agent",
      "agent-reprint",
      "scout",
      "warden",
    ]);
  });
});

describe("linked cards are in no collection search (RRG 1.8 p. 27; ruling August 3, 2026 - Ruling 4)", () => {
  it("a linked card that matches the filter is not found, with the flag or without it", () => {
    const state = game();
    expect(state.cardPool[SHIELDMATE.id]).toBeDefined();
    expect(ids(collectionCandidates(state, justiceAlly, P1))).not.toContain(SHIELDMATE.id);
    expect(ids(collectionCandidates(state, differentJusticeAlly, P1))).not.toContain(SHIELDMATE.id);
    expect(ids(collectionCandidates(state, {}))).not.toContain(SHIELDMATE.id);
    // The filter is otherwise unchanged: another aspect's ally is found by its own aspect.
    expect(ids(collectionCandidates(state, { categories: ["ally"], aspects: ["aggression"] }))).toEqual(["bruiser"]);
  });
});
