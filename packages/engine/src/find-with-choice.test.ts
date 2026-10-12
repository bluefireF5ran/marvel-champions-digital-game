/**
 * docs/phase7-wave10-hero-packs.md H3.4: a "find" that chooses among several cards, in play or out (`EffectSpec
 * findCard` with `choose`, `outOfPlay`, and the destinations `"reveal"` and `"play"`), proven with synthetic cards
 * shaped like Hercules's Labor cards: "Find a non-Elite minion with at least 6 printed hit points. Reveal it, heal all
 * damage from it …" (Defeat the Hydra), "Find an encounter side scheme that is not in play and reveal it" (Embody
 * Pathos), "Find Amadeus Cho and put him into play" (Protect Humanity).
 *
 * Sources: RRG 1.8 "Find" (p. 19): "a player searches each game area where that card could be found"; not searched:
 * "Facedown encounter cards in any in-play game area … (For example, any encounter cards dealt to a player or given to
 * a character as a boost card.)", the victory display, removed cards; "If a player is instructed to 'find and reveal' a
 * minion that is already in play, that player engages that minion and resolves any keywords and/or triggered abilities
 * that resolve as a result of that minion being revealed … That minion retains all attached cards and tokens on it.
 * That minion is not considered to be entering play. That minion is considered to engage that player unless it was
 * already engaged with that player." RRG 1.8 "Search" (p. 39): "If a player finds multiple cards that satisfy the
 * criteria of a search, the player chooses among those options"; "If any portion of a deck is searched, upon completion
 * of that … card ability, shuffle that entire deck." Ruling March 6, 2026 – Ruling 3 (2): a Labor card has no valid
 * target with the "Lernean Hydra already dealt as a boost card".
 *
 * Synthetic cards only; the engine never names a card.
 */

import { flat, trait, type CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { createCtx, moveCard, updateInstance } from "./ctx.js";
import { applyCommand, replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import { playerId, type InstanceId, type PlayerId } from "./ids.js";
import { activeEncounterDeck, activeEncounterDeckId, locateCard, mustInstance, mustPlayer } from "./query.js";
import { createGame, type GameSetupConfig } from "./setup.js";
import type { EffectSpec, TargetQuery, TargetRef } from "./spec.js";
import type { GameState, ZoneId } from "./state.js";
import { depsOf, stubAbility, type StubAbility } from "./testing/abilities.js";
import { runCommands, runCommandsPicking } from "./testing/drive.js";
import {
  stubIdentity,
  stubMainScheme,
  stubMinion,
  stubSideScheme,
  stubTreachery,
  stubUpgrade,
  stubVillain,
} from "./testing/fixtures.js";
import { DEFAULT_CARDS, DEFAULT_DECK, defaultPick, seatIdentities } from "./testing/scenario.js";
import { faceVisible } from "./visibility.js";

const p1 = playerId("p1");
const p2 = playerId("p2");
const you = { kind: "controller" } as const;
const BIG = trait("BIG");
const slot = (name: string): TargetRef => ({ kind: "slot", slot: name });
const mark = (target: TargetRef, counterType: string): EffectSpec => ({
  kind: "addCounters",
  target,
  counterType,
  amount: { kind: "const", value: 1 },
});
/** "When Revealed: [the revealing player's identity gets a counter]": who resolved it, and how many times. */
const REVEALED = stubAbility("big.when-revealed", {
  trigger: { kind: "whenRevealed" },
  effects: [mark({ kind: "identityOf", player: you }, "revealed")],
});

const OGRE = stubMinion({ id: "ogre", atk: 2, sch: 0, hp: 6, boostIcons: 0, traits: [BIG], abilities: [REVEALED.ref] });
const TROLL = stubMinion({
  id: "troll",
  atk: 2,
  sch: 0,
  hp: 6,
  boostIcons: 0,
  traits: [BIG],
  abilities: [REVEALED.ref],
});
/** A Big minion with quickstrike. */
const LYNX = stubMinion({
  id: "lynx",
  atk: 1,
  sch: 0,
  hp: 6,
  boostIcons: 0,
  traits: [BIG],
  keywords: [{ name: "quickstrike" }],
});
/** Not Big: never a candidate. */
const RUNT = stubMinion({ id: "runt", atk: 1, sch: 0, hp: 6, boostIcons: 0 });
const PLOT = stubSideScheme({ id: "plot", startingThreat: 3, boostIcons: 0 });
const RUSE = stubSideScheme({ id: "ruse", startingThreat: 2, boostIcons: 0 });
const CHARM = stubUpgrade({ id: "charm", cost: 0 });
const BLANK = stubTreachery({ id: "blank", boostIcons: 0 });
const QUIET = stubVillain({ id: "quiet", stages: [{ hp: flat(30), atk: 0, sch: 0 }] });
const LONG = stubMainScheme({
  id: "long",
  stages: [{ startingThreat: flat(0), targetThreat: flat(99), acceleration: flat(0) }],
});

const BIG_MINION: TargetQuery = { categories: ["minion"], trait: BIG };
const thenMark: EffectSpec = { kind: "then", effects: [mark({ kind: "identityOf", player: you }, "then")] };
const action = (id: string, effects: readonly EffectSpec[]): StubAbility =>
  stubAbility(`seeker.${id}`, { trigger: { kind: "action" }, effects });
/** "Action: Find a Big minion. Reveal it, heal all damage from it and place a counter on it. Then …" */
const FIND_BIG = action("find-big", [
  { kind: "findCard", query: BIG_MINION, to: "reveal", choose: true, bind: "minion" },
  { kind: "heal", target: slot("minion"), amount: { kind: "const", value: 99 } },
  mark(slot("minion"), "found"),
  thenMark,
]);
/** "Action: Find a side scheme that is not in play and reveal it. Place 6 threat on it." */
const FIND_SCHEME = action("find-scheme", [
  { kind: "findCard", query: { categories: ["sideScheme"] }, to: "reveal", choose: true, outOfPlay: true, bind: "s" },
  { kind: "placeThreat", target: slot("s"), amount: { kind: "const", value: 6 } },
]);
/** "Action: Find your charm and put it into play." */
const FIND_CHARM = action("find-charm", [{ kind: "findCard", query: { name: CHARM.name }, owner: you, to: "play" }]);
const ACTIONS = [FIND_BIG, FIND_SCHEME, FIND_CHARM];
const deps: EngineDeps = depsOf(...ACTIONS, REVEALED);

const ENCOUNTER = [OGRE, TROLL, LYNX, RUNT, PLOT, RUSE];

function game(): GameState {
  const identities = seatIdentities(
    stubIdentity({
      id: "seeker",
      hp: 10,
      atk: 2,
      thw: 2,
      def: 2,
      rec: 3,
      heroHandSize: 5,
      alterEgoHandSize: 6,
      heroAbilities: ACTIONS.map((a) => a.ref),
      alterEgoAbilities: ACTIONS.map((a) => a.ref),
    }),
    2,
  );
  const config: GameSetupConfig = {
    seed: 23,
    cards: [...DEFAULT_CARDS, QUIET, LONG, BLANK, CHARM, ...ENCOUNTER, ...identities],
    villainCardId: QUIET.id,
    mainSchemeCardId: LONG.id,
    encounterDeck: [...Array.from({ length: 12 }, () => BLANK.id as CardId), ...ENCOUNTER.map((card) => card.id)],
    includeIdentitySets: false,
    players: identities.map((identity) => ({ identityCardId: identity.id, deck: [...DEFAULT_DECK, CHARM.id] })),
  };
  const result = createGame(config, deps);
  if (!result.ok) throw new Error(result.error.message);
  return runCommands(result.state, deps).state;
}

const the = (state: GameState, card: { readonly id: CardId }, owner?: PlayerId): InstanceId =>
  (Object.keys(state.instances) as InstanceId[]).find(
    (id) => state.instances[id]?.cardId === card.id && (owner === undefined || state.instances[id]?.ownerId === owner),
  )!;
const identityId = (state: GameState, player: PlayerId): InstanceId => mustPlayer(state, player).identity.instanceId;
const counterOn = (state: GameState, id: InstanceId, counter: string): number =>
  mustInstance(state, id).counters[counter] ?? 0;
const encounterDeckZone = (state: GameState): ZoneId => ({
  kind: "encounterDeck",
  deckId: activeEncounterDeckId(state),
});

/** Test-only state surgery: puts a card somewhere, faceup or facedown. */
function place(state: GameState, id: InstanceId, zone: ZoneId, faceup = true): GameState {
  const ctx = createCtx(state, deps);
  moveCard(ctx, id, zone, "top");
  updateInstance(ctx, id, (i) => ({ ...i, faceup }));
  return ctx.state;
}
const patch = (state: GameState, id: InstanceId, change: Partial<GameState["instances"][InstanceId]>): GameState => {
  const ctx = createCtx(state, deps);
  updateInstance(ctx, id, (i) => ({ ...i, ...change }));
  return ctx.state;
};
/** Surgery: a minion in play engaged with `player`, as if it had been there a while. */
const engagedWith = (state: GameState, id: InstanceId, player: PlayerId): GameState =>
  patch(place(state, id, { kind: "playArea", playerId: player }), id, { engagedWith: player, controllerId: null });
/** Surgery: the card out of the game's reach, so it is no candidate. */
const removed = (state: GameState, ...cards: readonly { readonly id: CardId }[]): GameState =>
  cards.reduce((s, card) => place(s, the(s, card), { kind: "removedFromGame" }), state);

const use = (state: GameState, ability: StubAbility, player: PlayerId = p1): Command => ({
  type: "useAbility",
  playerId: player,
  cardInstanceId: identityId(state, player),
  abilityId: ability.ref.id,
  payment: [],
});
const typed = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const shuffled = (events: readonly GameEvent[]) => typed(events, "deckShuffled").map((e) => e.zone);
const announced = (events: readonly GameEvent[], kind: string, id: InstanceId) =>
  typed(events, "triggerEvent").filter(
    (e) => e.event.kind === kind && "instanceId" in e.event && e.event.instanceId === id,
  );
/** Answers a find's pick with `id` and every other choice by default. */
const picking =
  (id: InstanceId) =>
  (state: GameState): readonly string[] =>
    state.pendingChoice?.options.some((o) => o.optionId === id) ? [id] : defaultPick(state);

/**
 * The ogre set aside for player 1 (a nemesis set's place), the troll engaged with player 2 with 4 damage and 2
 * counters, the lynx removed from the game. The runt is in the encounter deck and is not Big.
 */
function twoCandidates(): { state: GameState; ogre: InstanceId; troll: InstanceId } {
  const start = removed(game(), LYNX);
  const ogre = the(start, OGRE);
  const troll = the(start, TROLL);
  let state = place(start, ogre, { kind: "setAside", playerId: p1 });
  state = patch(engagedWith(state, troll, p2), troll, { damage: 4, counters: { grudge: 2 } });
  return { state, ogre, troll };
}

describe("H3.4 a find that chooses: the pick", () => {
  it("a set-aside minion and one engaged with another player: both offered, each with the area it is in", () => {
    const { state: at, ogre, troll } = twoCandidates();
    const result = applyCommand(at, use(at, FIND_BIG), deps);
    if (!result.ok) throw new Error(result.error.message);
    const choice = result.state.pendingChoice!;
    expect(choice).toMatchObject({ playerId: p1, minSelections: 1, maxSelections: 1, authority: "player" });
    expect(choice.prompt).toEqual({ kind: "chooseCards", slot: "minion" });
    // Search order: in play first, then the set-aside areas.
    expect(choice.options).toEqual([
      {
        optionId: troll,
        label: TROLL.name,
        ref: { kind: "card", instanceId: troll },
        zone: { kind: "playArea", playerId: p2 },
      },
      {
        optionId: ogre,
        label: OGRE.name,
        ref: { kind: "card", instanceId: ogre },
        zone: { kind: "setAside", playerId: p1 },
      },
    ]);
    // Nothing has moved or been shuffled while the pick is open.
    expect(typed(result.events, "cardMoved")).toEqual([]);
    expect(shuffled(result.events)).toEqual([]);
  });

  it("the set-aside one chosen: revealed, engaged with the finder, its When Revealed resolved once, the encounter deck shuffled", () => {
    const { state: at, ogre, troll } = twoCandidates();
    const { state, events } = runCommandsPicking(at, deps, picking(ogre), use(at, FIND_BIG));
    expect(mustInstance(state, ogre)).toMatchObject({ engagedWith: p1, faceup: true, damage: 0 });
    expect(mustPlayer(state, p1).playArea).toContain(ogre);
    expect(counterOn(state, ogre, "found")).toBe(1);
    expect(counterOn(state, identityId(state, p1), "revealed")).toBe(1);
    expect(counterOn(state, identityId(state, p1), "then")).toBe(1);
    expect(announced(events, "cardEntersPlay", ogre)).not.toEqual([]);
    // The other candidate is untouched.
    expect(mustInstance(state, troll)).toMatchObject({ engagedWith: p2, damage: 4, counters: { grudge: 2 } });
    expect(typed(events, "targetChosen")).toEqual([{ type: "targetChosen", slot: "minion", instanceIds: [ogre] }]);
    expect(typed(events, "cardFound")).toEqual([
      {
        type: "cardFound",
        instanceId: ogre,
        cardId: OGRE.id,
        from: { kind: "setAside", playerId: p1 },
        alreadyThere: false,
        deckShuffled: true,
      },
    ]);
    // A Big minion could have been in the encounter deck, so it was looked through and is shuffled (RRG p. 39).
    expect(shuffled(events)).toEqual([encounterDeckZone(state)]);
  });

  it("the engaged one chosen, with 4 damage: it moves to the finder, 0 damage, its counters kept, and does not enter play", () => {
    const { state: at, ogre, troll } = twoCandidates();
    const { state, events } = runCommandsPicking(at, deps, picking(troll), use(at, FIND_BIG));
    const minion = mustInstance(state, troll);
    expect(minion.engagedWith).toBe(p1);
    expect(mustPlayer(state, p1).playArea).toContain(troll);
    expect(mustPlayer(state, p2).playArea).not.toContain(troll);
    // "Heal all damage from it" resolved after the reveal.
    expect(minion.damage).toBe(0);
    expect(minion.counters).toEqual({ grudge: 2, found: 1 });
    expect(announced(events, "cardEntersPlay", troll)).toEqual([]);
    expect(typed(events, "encounterCardRevealed").map((e) => [e.instanceId, e.playerId])).toEqual([[troll, p1]]);
    expect(counterOn(state, identityId(state, p1), "revealed")).toBe(1);
    expect(counterOn(state, identityId(state, p2), "revealed")).toBe(0);
    expect(typed(events, "cardFound")[0]).toMatchObject({ instanceId: troll, alreadyThere: true, deckShuffled: true });
    expect(mustPlayer(state, p1).setAside).toContain(ogre);
    expect(shuffled(events)).toEqual([encounterDeckZone(state)]);
  });

  it("a candidate in the encounter deck is offered with its deck, and is face-visible while the pick is open, as a searched card is", () => {
    const start = removed(game(), LYNX, TROLL);
    const ogre = the(start, OGRE);
    const at = engagedWith(start, the(start, RUNT), p1);
    // One candidate: no pick. Add a second by setting the troll aside instead.
    const two = place(at, the(at, TROLL), { kind: "encounterSetAside" });
    const result = applyCommand(two, use(two, FIND_BIG), deps);
    if (!result.ok) throw new Error(result.error.message);
    const offered = result.state.pendingChoice!.options;
    expect(offered.map((o) => [o.label, o.zone])).toEqual([
      [TROLL.name, { kind: "encounterSetAside" }],
      [OGRE.name, encounterDeckZone(two)],
    ]);
    expect(faceVisible(two, ogre, { viewer: p1, deps })).toBe(false);
    expect(faceVisible(result.state, ogre, { viewer: p1, deps })).toBe(true);
    // A search is not a look (RRG 1.8 "Look, Looked-At", p. 27): what it offers is shown to the table.
    expect(faceVisible(result.state, ogre, { viewer: p2, deps })).toBe(true);
    // Chosen from the deck: out of it, revealed, and the deck shuffled without it.
    const { state, events } = runCommandsPicking(two, deps, picking(ogre), use(two, FIND_BIG));
    expect(mustInstance(state, ogre).engagedWith).toBe(p1);
    expect(activeEncounterDeck(state).deck).not.toContain(ogre);
    expect(activeEncounterDeck(state).deck).toHaveLength(activeEncounterDeck(two).deck.length - 1);
    expect(typed(events, "cardFound")[0]).toMatchObject({ from: encounterDeckZone(two), deckShuffled: true });
    expect(shuffled(events)).toEqual([encounterDeckZone(state)]);
  });

  it("one candidate: found with no pick", () => {
    const start = removed(game(), LYNX, TROLL);
    const ogre = the(start, OGRE);
    const at = place(start, ogre, { kind: "setAside", playerId: p1 });
    const { state, events } = runCommands(at, deps, use(at, FIND_BIG));
    expect(typed(events, "choiceRequested")).toEqual([]);
    expect(typed(events, "targetChosen")).toEqual([]);
    expect(mustInstance(state, ogre).engagedWith).toBe(p1);
    expect(counterOn(state, ogre, "found")).toBe(1);
  });

  it("a minion with quickstrike found out of play attacks a hero as it engages (ATK 1, undefended: 1 damage), then is healed and marked", () => {
    const start = removed(game(), OGRE, TROLL);
    const lynx = the(start, LYNX);
    const set = place(start, lynx, { kind: "setAside", playerId: p1 });
    // Surgery: player 1 in hero form (RRG 1.8 "Quickstrike", p. 36).
    const at: GameState = {
      ...set,
      players: set.players.map((p) =>
        p.playerId === p1 ? { ...p, identity: { ...p.identity, form: "hero", heroFormIndex: 0 } } : p,
      ),
    };
    const { state } = runCommands(at, deps, use(at, FIND_BIG));
    expect(mustInstance(state, lynx).engagedWith).toBe(p1);
    expect(mustInstance(state, identityId(state, p1)).damage).toBe(1);
    expect(counterOn(state, lynx, "found")).toBe(1);
  });
});

describe("H3.4 what a find that chooses does not reach", () => {
  it("the only match dealt facedown as a boost card: nothing found, no pick, the deck still searched (ruling March 6, 2026 – 3 (2))", () => {
    const start = removed(game(), LYNX, TROLL);
    const ogre = the(start, OGRE);
    const villain = start.villains[0]!.instanceId;
    const ctx = createCtx(start, deps);
    moveCard(ctx, ogre, { kind: "boost", hostInstanceId: villain }, "top");
    updateInstance(ctx, ogre, (i) => ({ ...i, faceup: false }));
    const at = ctx.state;
    const { state, events } = runCommands(at, deps, use(at, FIND_BIG));
    expect(typed(events, "choiceRequested")).toEqual([]);
    expect(typed(events, "cardFound")).toEqual([]);
    expect(typed(events, "preThenUnresolved").map((e) => e.cause)).toEqual(["findFoundNothing"]);
    // The boost card is where it was, facedown.
    expect(mustInstance(state, villain).boostCards).toEqual([ogre]);
    expect(mustInstance(state, ogre).faceup).toBe(false);
    // Nothing healed, marked or "then".
    expect(counterOn(state, ogre, "found")).toBe(0);
    expect(counterOn(state, identityId(state, p1), "then")).toBe(0);
    // The ogre is an encounter card, so the encounter deck was looked through for one.
    expect(shuffled(events)).toEqual([encounterDeckZone(state)]);
  });

  it("a match dealt facedown to a player, in the victory display or removed from the game is not offered", () => {
    const start = game();
    let at = place(start, the(start, OGRE), { kind: "dealtEncounter", playerId: p2 }, false);
    at = place(at, the(at, TROLL), { kind: "victoryDisplay" });
    at = removed(at, LYNX);
    const { events } = runCommands(at, deps, use(at, FIND_BIG));
    expect(typed(events, "choiceRequested")).toEqual([]);
    expect(typed(events, "cardFound")).toEqual([]);
  });
});

describe("H3.4 a find of a card that is not in play", () => {
  it("one side scheme in play and one in the encounter deck: only the one out of play is found, with no pick", () => {
    const start = game();
    const plot = the(start, PLOT);
    const ruse = the(start, RUSE);
    const at = patch(place(start, plot, { kind: "villainArea" }), plot, { threat: 3 });
    const { state, events } = runCommands(at, deps, use(at, FIND_SCHEME));
    expect(typed(events, "choiceRequested")).toEqual([]);
    expect(mustInstance(state, plot).threat).toBe(3);
    // Revealed: its starting threat 2, then 6 more.
    expect(state.villainArea).toContain(ruse);
    expect(mustInstance(state, ruse).threat).toBe(8);
    expect(typed(events, "cardFound").map((e) => e.instanceId)).toEqual([ruse]);
  });

  it("two out of play, in the deck and the discard pile: both offered; with both in play nothing is found", () => {
    const start = game();
    const plot = the(start, PLOT);
    const ruse = the(start, RUSE);
    const discard: ZoneId = { kind: "encounterDiscard", deckId: activeEncounterDeckId(start) };
    const at = place(start, plot, discard);
    const result = applyCommand(at, use(at, FIND_SCHEME), deps);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.pendingChoice!.options.map((o) => [o.optionId, o.zone])).toEqual([
      [plot, discard],
      [ruse, encounterDeckZone(at)],
    ]);
    const picked = runCommandsPicking(at, deps, picking(plot), use(at, FIND_SCHEME)).state;
    expect(mustInstance(picked, plot).threat).toBe(9);
    expect(activeEncounterDeck(picked).deck).toContain(ruse);

    const both = place(place(start, plot, { kind: "villainArea" }), ruse, { kind: "villainArea" });
    const none = runCommands(both, deps, use(both, FIND_SCHEME));
    expect(typed(none.events, "cardFound")).toEqual([]);
    expect(typed(none.events, "preThenUnresolved").map((e) => e.cause)).toEqual(["findFoundNothing"]);
    expect(mustInstance(none.state, plot).threat).toBe(0);
  });
});

describe("H3.4 find and put into play", () => {
  it("from your deck: in play under your control, and your deck shuffled; another player's copy is left alone", () => {
    const at = game();
    const mine = the(at, CHARM, p1);
    const theirs = the(at, CHARM, p2);
    const theirsAt = locateCard(at, theirs);
    expect(mustPlayer(at, p1).deck).toContain(mine);
    const { state, events } = runCommands(at, deps, use(at, FIND_CHARM));
    expect(mustInstance(state, mine)).toMatchObject({ controllerId: p1, faceup: true });
    expect(mustPlayer(state, p1).deck).not.toContain(mine);
    expect(locateCard(state, theirs)).toEqual(theirsAt);
    expect(typed(events, "cardFound")).toEqual([
      {
        type: "cardFound",
        instanceId: mine,
        cardId: CHARM.id,
        from: { kind: "deck", playerId: p1 },
        alreadyThere: false,
        deckShuffled: true,
      },
    ]);
    expect(shuffled(events)).toEqual([{ kind: "deck", playerId: p1 }]);
    expect(announced(events, "cardEntersPlay", mine)).not.toEqual([]);
  });

  it("already in play: found where it is, nothing moves, no deck searched", () => {
    const start = game();
    const first = runCommands(start, deps, use(start, FIND_CHARM)).state;
    const mine = the(first, CHARM, p1);
    const { state, events } = runCommands(first, deps, use(first, FIND_CHARM));
    expect(typed(events, "cardMoved")).toEqual([]);
    expect(typed(events, "cardFound")[0]).toMatchObject({ instanceId: mine, alreadyThere: true, deckShuffled: false });
    expect(shuffled(events)).toEqual([]);
    expect(mustInstance(state, mine).controllerId).toBe(p1);
  });
});

describe("H3.4 replay", () => {
  it("a find with a pick replays deep-equal", () => {
    const { state: at, troll } = twoCandidates();
    const { state, session } = runCommandsPicking(at, deps, picking(troll), use(at, FIND_BIG));
    const again = replay(session.log, deps);
    if (!again.ok) throw new Error(again.error.message);
    expect(again.state).toEqual(state);
  });
});
