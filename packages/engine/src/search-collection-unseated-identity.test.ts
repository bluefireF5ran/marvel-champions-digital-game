/**
 * docs/phase7-wave10-hero-packs.md H3.18: a collection search for "an identity-specific ally for an identity not in
 * this game", made by a player card's own "Setup:" ability.
 *
 * RRG 1.8 "Identity-Specific Card" (p. 23): "cards that belong to an identity's set of accompanying cards", "designated
 * by the identity icon printed in the bottom right corner of the card"; the card data carries the icon as `aspect:
 * "hero:<identity card id>"`. Appendix II (p. 51), step 11: "Search each deck and the set aside area for any cards with
 * the setup keyword and put them into play"; step 16: "Resolve any 'Setup' abilities on player cards in play", after the
 * mulligan of step 15. Ruling March 19, 2026 - Ruling 6: "Any unique cards added during Setup … can share titles with
 * cards in player decks." Synthetic cards only; the engine never names a card.
 */
import { cardId, type AllyCard, type AnyCard, type HeroIdentityCard } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { PendingChoice } from "./choices.js";
import { replay, startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { locateCard, mustInstance, mustPlayer } from "./query.js";
import { collectionCandidates } from "./resolve/collection.js";
import type { CollectionSearchFilter } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubAlly, stubIdentity, stubSupport, stubUpgrade } from "./testing/fixtures.js";
import { defaultPick, HERO, newGameAtMulligan, RESOURCE } from "./testing/scenario.js";
import { copiesOf, P1, P2 } from "./testing/wave3.js";

/** "An identity-specific ally for an identity not in this game." */
const guestAlly: CollectionSearchFilter = { categories: ["ally"], identitySpecificToUnseated: true };

const identity = (id: string, extra: Partial<HeroIdentityCard> = {}): HeroIdentityCard => ({
  ...stubIdentity({ id, hp: 10, atk: 2, thw: 2, def: 2, rec: 3, heroHandSize: 5, alterEgoHandSize: 6 }),
  ...extra,
});
const ally = (id: string, extra: Partial<AllyCard> = {}): AllyCard => ({
  ...stubAlly({ id, cost: 1, atk: 1, thw: 1, hp: 1 }),
  ...extra,
});

/** An identity nobody is using: in the card pool, in no seat. */
const ABSENT = identity("absent");
/** A progressing identity on two cards; its set carries the first version's icon. */
const GROWING_1 = identity("growing-1", {
  progressingIdentity: { versions: [cardId("growing-1"), cardId("growing-2")] },
});
const GROWING_2 = identity("growing-2", {
  progressingIdentity: { versions: [cardId("growing-1"), cardId("growing-2")] },
});

/** The absent identity's ally: unique, one printed copy. */
const SQUIRE = ally("squire", { aspect: "hero:absent", unique: true });
/** The first seat's own ally (`HERO`), and the second seat's (`seatIdentities` names that identity `hero-p2`). */
const PAGE = ally("page", { aspect: "hero:hero" });
const AIDE = ally("aide", { aspect: "hero:hero-p2" });
/** An ally of an identity whose card is not even in the card pool. */
const STRAY = ally("stray", { aspect: "hero:nowhere" });
/** The progressing identity's ally. */
const WARD = ally("ward", { aspect: "hero:growing-1" });
/** An identity-specific ally that also prints an aspect. */
const ENVOY = ally("envoy", { aspect: "hero:absent", printedAspect: "justice" });
/** Not identity-specific: an aspect ally and a basic one. The basic one shares the squire's title. */
const SCOUT = ally("scout", { aspect: "justice" });
const NAMESAKE = ally("namesake", { name: "squire", aspect: "basic", unique: true, quantityInSet: 3 });
/** The absent identity's card that is not an ally. */
const BANNER = { ...stubUpgrade({ id: "banner", cost: 1 }), aspect: "hero:absent" as const };

/**
 * "Setup. Setup: Search your collection for an identity-specific ally for an identity not in this game. Shuffle that
 * ally into your deck. Discard 2 cards from your hand and remove this card from the game."
 */
const INVITE = stubAbility("walk-on.setup", {
  trigger: { kind: "setup" },
  effects: [
    { kind: "searchCollection", player: { kind: "controller" }, filter: guestAlly, bind: "found" },
    { kind: "moveCards", cards: { kind: "ref", ref: { kind: "slot", slot: "found" } }, to: "deckShuffle" },
    { kind: "discardFromHand", player: { kind: "controller" }, amount: { kind: "const", value: 2 } },
    { kind: "moveCards", cards: { kind: "ref", ref: { kind: "self" } }, to: "removedFromGame" },
  ],
});
const WALK_ON = stubSupport({ id: "walk-on", cost: 0, keywords: [{ name: "setup" }], abilities: [INVITE.ref] });
const deps: EngineDeps = depsOf(INVITE);

const POOL: readonly AnyCard[] = [
  ABSENT,
  GROWING_1,
  GROWING_2,
  SQUIRE,
  PAGE,
  AIDE,
  STRAY,
  WARD,
  ENVOY,
  SCOUT,
  NAMESAKE,
  BANNER,
  WALK_ON,
];

/** A 40-card deck: the walk-on, one namesake of the squire and 38 resources. Parked on the first mulligan. */
const atMulligan = (players: 1 | 2 = 1, identityCard: HeroIdentityCard = HERO): GameState =>
  newGameAtMulligan({
    players,
    identity: identityCard,
    extraCards: POOL,
    deck: [WALK_ON.id, NAMESAKE.id, ...copiesOf(RESOURCE.id, 38)],
    deps,
  });

const ids = (cards: readonly AnyCard[]): readonly string[] => cards.map((card) => card.id);
const cardsIn = (state: GameState, list: readonly InstanceId[]): readonly string[] =>
  list.map((id) => mustInstance(state, id).cardId);

/** Plays setup out, answering each collection search with the next of `picks` (null finds nothing). */
function setUp(state: GameState, picks: readonly (string | null)[]) {
  const asked: PendingChoice[] = [];
  const run = driveSession(startSession(state), deps, [], (current) => {
    const choice = current.pendingChoice!;
    if (choice.prompt.kind !== "searchCollection") return defaultPick(current);
    const pick = picks[asked.length];
    asked.push(choice);
    return pick === null || pick === undefined ? [] : [pick];
  });
  return { session: run.session, state: run.session.state, events: run.events, asked };
}

const walkOnOf = (state: GameState, player: PlayerId): InstanceId =>
  Object.values(state.instances).find((i) => i.cardId === WALK_ON.id && i.ownerId === player)!.instanceId;

describe("CollectionSearchFilter.identitySpecificToUnseated (H3.18)", () => {
  it("finds the allies of identities no seat is using, and no ally of a seated identity", () => {
    const one = atMulligan(1);
    // One seat (`hero`): the second-seat identity of a bigger table is not in this game, so its ally is found too.
    expect(ids(collectionCandidates(one, guestAlly, P1))).toEqual(["aide", "envoy", "squire", "stray", "ward"]);
    const two = atMulligan(2);
    expect(ids(collectionCandidates(two, guestAlly, P1))).toEqual(["envoy", "squire", "stray", "ward"]);
    expect(ids(collectionCandidates(two, guestAlly, P2))).toEqual(["envoy", "squire", "stray", "ward"]);
  });

  it("is a classification and an owner, not a card type: without `categories` the set's other cards match", () => {
    const found = ids(collectionCandidates(atMulligan(2), { identitySpecificToUnseated: true }, P1));
    expect(found).toEqual(["banner", "envoy", "squire", "stray", "ward"]);
    // Never an identity card, and never a card of no identity's set.
    expect(found).not.toContain("absent");
    expect(found).not.toContain("scout");
  });

  it("does not compare titles: an ally sharing a title with a card in the searcher's deck is found", () => {
    const state = atMulligan(1);
    expect(cardsIn(state, [...mustPlayer(state, P1).deck, ...mustPlayer(state, P1).hand])).toContain("namesake");
    expect(ids(collectionCandidates(state, guestAlly, P1))).toContain("squire");
  });

  it("a seat using any version of a progressing identity keeps that identity's set out", () => {
    const first = atMulligan(1, GROWING_1);
    expect(ids(collectionCandidates(first, guestAlly, P1))).not.toContain("ward");
    // The seat has progressed: its identity card is now the second version (test surgery).
    const seat = mustPlayer(first, P1).identity.instanceId;
    const second: GameState = {
      ...first,
      instances: { ...first.instances, [seat]: { ...mustInstance(first, seat), cardId: GROWING_2.id } },
    };
    expect(ids(collectionCandidates(second, guestAlly, P1))).not.toContain("ward");
    expect(ids(collectionCandidates(second, guestAlly, P1))).toContain("squire");
  });

  it("an identity card a card effect brought into the game is in the game", () => {
    const state = atMulligan(1);
    const spare = Object.values(state.instances)[0]!;
    const brought = { ...spare, instanceId: "brought-in" as InstanceId, cardId: ABSENT.id, ownerId: null };
    const withIdentity: GameState = {
      ...state,
      instances: { ...state.instances, [brought.instanceId]: brought },
      encounterSetAside: [...state.encounterSetAside, brought.instanceId],
    };
    expect(ids(collectionCandidates(withIdentity, guestAlly, P1))).toEqual(["aide", "stray", "ward"]);
  });
});

describe("a player card's Setup ability at step 16 (RRG 1.8 Appendix II, p. 51)", () => {
  it("the setup-keyword card is in play from step 11 and its Setup waits for the mulligan", () => {
    const state = atMulligan(1);
    const walkOn = walkOnOf(state, P1);
    expect(locateCard(state, walkOn)).toEqual({ kind: "playArea", playerId: P1 });
    expect(state.pendingChoice?.prompt.kind).toBe("mulligan");
    expect(mustPlayer(state, P1).hand).toHaveLength(6);
    expect(mustPlayer(state, P1).deck).toHaveLength(33);
  });

  it("searches, shuffles the ally into the deck, discards 2 from hand and removes itself; replays deep-equal", () => {
    const run = setUp(atMulligan(1), ["squire"]);
    expect(run.asked).toHaveLength(1);
    expect(run.asked[0]!.playerId).toBe(P1);
    expect(run.asked[0]!.options.map((option) => option.optionId)).toEqual([
      "aide",
      "envoy",
      "squire",
      "stray",
      "ward",
    ]);
    const player = mustPlayer(run.state, P1);
    expect(player.hand).toHaveLength(4);
    expect(player.discard).toHaveLength(2);
    // 40 cards, less the walk-on in play and the 6 drawn, plus the ally found.
    expect(player.deck).toHaveLength(34);
    expect(cardsIn(run.state, player.deck)).toContain("squire");
    const walkOn = walkOnOf(run.state, P1);
    expect(locateCard(run.state, walkOn)).toEqual({ kind: "removedFromGame" });
    const added = run.events.filter(
      (event): event is Extract<GameEvent, { type: "cardAddedFromCollection" }> =>
        event.type === "cardAddedFromCollection",
    );
    expect(added.map((event) => [event.cardId, event.ownerId])).toEqual([["squire", P1]]);
    // The first round begins only once the Setup has resolved.
    const order = run.events.map((event) => event.type);
    expect(order.indexOf("cardAddedFromCollection")).toBeLessThan(order.indexOf("roundStarted"));
    const replayed = replay(run.session.log, deps);
    expect(replayed.ok && replayed.state).toEqual(run.state);
  });

  it("a search that finds nothing still costs the 2 cards and the card itself", () => {
    const run = setUp(atMulligan(1), [null]);
    const player = mustPlayer(run.state, P1);
    expect(player.hand).toHaveLength(4);
    expect(player.discard).toHaveLength(2);
    expect(player.deck).toHaveLength(33);
    expect(locateCard(run.state, walkOnOf(run.state, P1))).toEqual({ kind: "removedFromGame" });
  });

  it("two players cannot both take an ally's one copy: the second search no longer offers it", () => {
    const run = setUp(atMulligan(2), ["squire", "envoy"]);
    expect(run.asked).toHaveLength(2);
    const [first, second] = run.asked;
    expect(first!.options.map((option) => option.optionId)).toEqual(["envoy", "squire", "stray", "ward"]);
    expect(second!.options.map((option) => option.optionId)).toEqual(["envoy", "stray", "ward"]);
    expect(second!.playerId).not.toBe(first!.playerId);
    const holders = run.state.players.filter((seat) => cardsIn(run.state, seat.deck).includes("squire"));
    expect(holders.map((seat) => seat.playerId)).toEqual([first!.playerId]);
    for (const seat of run.state.players)
      expect(locateCard(run.state, walkOnOf(run.state, seat.playerId))).toEqual({ kind: "removedFromGame" });
  });
});
