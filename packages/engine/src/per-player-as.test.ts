/**
 * docs/phase7-wave10-hero-packs.md H3.5: a reveal that reads each per player icon on the revealed card as a given
 * number (`EffectSpec revealCard.perPlayerAs`, `findCard.perPlayerAs`, `Frame<"reveal">.perPlayerAs`,
 * `perPlayerReading`), proven with synthetic cards shaped like Embody Pathos (`hercules` 59003): "Find an encounter
 * side scheme that is not in play and reveal it, treating each [per player] on it as 1 … Place 6 additional threat on
 * it."
 *
 * Sources: RRG 1.8 "Per Player Icon" (p. 32): "A per player icon next to a value multiplies that value by the number
 * of players who started the scenario." RRG 1.8 "Hinder X" (p. 22): hinder threat is in addition to any threat the
 * scheme normally enters play with. The owner's answer to question 19 = A (2026-10-11, provisional): the reading covers
 * only the reveal (starting threat, hinder, the scheme's When Revealed); a later ability of that scheme reads the real
 * number of players.
 *
 * Three players throughout. Synthetic cards only; the engine never names a card.
 */

import { flat, type CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { applyCommand, replay } from "./engine.js";
import { playerId, type InstanceId, type PlayerId } from "./ids.js";
import { maxHitPoints, mustInstance, mustPlayer, perPlayerCountAt, perPlayerReading } from "./query.js";
import { createGame, type GameSetupConfig } from "./setup.js";
import type { EffectSpec, TargetRef, ValueSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility, type StubAbility } from "./testing/abilities.js";
import { runCommands, runCommandsPicking } from "./testing/drive.js";
import {
  stubIdentity,
  stubMainScheme,
  stubMinion,
  stubSideScheme,
  stubTreachery,
  stubVillain,
} from "./testing/fixtures.js";
import { DEFAULT_CARDS, DEFAULT_DECK, defaultPick, seatIdentities } from "./testing/scenario.js";

const p1 = playerId("p1");
const you = { kind: "controller" } as const;
const self: TargetRef = { kind: "self" };
const slot = (name: string): TargetRef => ({ kind: "slot", slot: name });
const perPlayer = (n: number): ValueSpec => ({ kind: "perPlayer", base: 0, perPlayer: n });
const threat = (target: TargetRef, amount: ValueSpec | number): EffectSpec => ({
  kind: "placeThreat",
  target,
  amount: typeof amount === "number" ? { kind: "const", value: amount } : amount,
});

/** "When Revealed: Place 1 [per player] threat here." */
const RIOT_REVEALED = stubAbility("riot.when-revealed", {
  trigger: { kind: "whenRevealed" },
  effects: [threat(self, perPlayer(1))],
});
/** "Forced Response: After a player changes form, place 1 [per player] threat here." A later ability of the scheme. */
const RIOT_LATER = stubAbility("riot.forced-response", {
  trigger: { kind: "response", forced: true, on: { on: "formChanged" } },
  effects: [threat(self, perPlayer(1))],
});
/** Starting threat 3 per player, and both abilities. */
const RIOT = stubSideScheme({
  id: "riot",
  startingThreat: { base: 0, perPlayer: 3 },
  boostIcons: 0,
  abilities: [RIOT_REVEALED.ref, RIOT_LATER.ref],
});
/** All Versus All's shape: starting threat 2, Hinder 2 per player. */
const BRAWL = stubSideScheme({
  id: "brawl",
  startingThreat: 2,
  boostIcons: 0,
  keywords: [{ name: "hinder", value: 0, perPlayer: 2 }],
});
/** "When Revealed: Choose a player." A stop inside the reveal, for a test to look at the game there. */
const MOB_REVEALED = stubAbility("mob.when-revealed", {
  trigger: { kind: "whenRevealed" },
  effects: [{ kind: "choosePlayer", slot: "player", chooser: you }],
});
/** A minion of 2 hit points per player. */
const MOB = {
  ...stubMinion({ id: "mob", atk: 1, sch: 0, hp: 2, boostIcons: 0, abilities: [MOB_REVEALED.ref] }),
  hpPerPlayer: true as const,
};
const BLANK = stubTreachery({ id: "blank", boostIcons: 0 });
const QUIET = stubVillain({ id: "quiet", stages: [{ hp: flat(30), atk: 0, sch: 0 }] });
const LONG = stubMainScheme({
  id: "long",
  stages: [{ startingThreat: flat(0), targetThreat: flat(999), acceleration: flat(0) }],
});

const action = (id: string, effects: readonly EffectSpec[]): StubAbility =>
  stubAbility(`seeker.${id}`, { trigger: { kind: "action" }, effects });
const find = (name: string): TargetRef => ({ kind: "find", query: { name } });
const sixMore = threat(slot("s"), 6);
const SIDE_SCHEME_OUT_OF_PLAY = {
  kind: "findCard",
  query: { categories: ["sideScheme"] },
  to: "reveal",
  choose: true,
  outOfPlay: true,
  bind: "s",
} as const;
/** "Find a side scheme that is not in play and reveal it. Place 6 additional threat on it." */
const REVEAL_PLAIN = action("reveal-plain", [SIDE_SCHEME_OUT_OF_PLAY, sixMore]);
/** The same, "treating each [per player] on it as 1". */
const REVEAL_AS_ONE = action("reveal-as-one", [{ ...SIDE_SCHEME_OUT_OF_PLAY, perPlayerAs: 1 }, sixMore]);
/** "Reveal the riot, treating each [per player] on it as 2": the plain `revealCard` form, and a number other than 1. */
const REVEAL_AS_TWO = action("reveal-as-two", [
  { kind: "revealCard", cards: find(RIOT.name), player: you, perPlayerAs: 2 },
]);
/** "Reveal the mob, treating each [per player] on it as 1." */
const REVEAL_MOB = action("reveal-mob", [{ kind: "revealCard", cards: find(MOB.name), player: you, perPlayerAs: 1 }]);
/** Another card's per player value, read while the scheme is being revealed. */
const WATCHER = stubAbility("seeker.watcher", {
  trigger: { kind: "response", forced: true, on: { on: "cardEntersPlay", targetIs: { categories: ["sideScheme"] } } },
  effects: [threat({ kind: "mainScheme" }, perPlayer(1))],
});
const ACTIONS = [REVEAL_PLAIN, REVEAL_AS_ONE, REVEAL_AS_TWO, REVEAL_MOB];
const deps: EngineDeps = depsOf(...ACTIONS, WATCHER, RIOT_REVEALED, RIOT_LATER, MOB_REVEALED);

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
      alterEgoAbilities: [...ACTIONS.map((a) => a.ref), WATCHER.ref],
    }),
    3,
  );
  // Only the first seat prints the watcher, so it answers once.
  const seats = identities.map((identity, seat) =>
    seat === 0 ? identity : { ...identity, alterEgo: { ...identity.alterEgo, abilities: ACTIONS.map((a) => a.ref) } },
  );
  const config: GameSetupConfig = {
    seed: 23,
    cards: [...DEFAULT_CARDS, QUIET, LONG, BLANK, RIOT, BRAWL, MOB, ...seats],
    villainCardId: QUIET.id,
    mainSchemeCardId: LONG.id,
    encounterDeck: [...Array.from({ length: 12 }, () => BLANK.id as CardId), RIOT.id, BRAWL.id, MOB.id],
    includeIdentitySets: false,
    players: seats.map((identity) => ({ identityCardId: identity.id, deck: DEFAULT_DECK })),
  };
  const result = createGame(config, deps);
  if (!result.ok) throw new Error(result.error.message);
  return runCommands(result.state, deps).state;
}

const the = (state: GameState, card: { readonly id: CardId }): InstanceId =>
  (Object.keys(state.instances) as InstanceId[]).find((id) => state.instances[id]?.cardId === card.id)!;
const use = (state: GameState, ability: StubAbility, player: PlayerId = p1): Command => ({
  type: "useAbility",
  playerId: player,
  cardInstanceId: mustPlayer(state, player).identity.instanceId,
  abilityId: ability.ref.id,
  payment: [],
});
const picking =
  (id: InstanceId) =>
  (state: GameState): readonly string[] =>
    state.pendingChoice?.options.some((o) => o.optionId === id) ? [id] : defaultPick(state);
const threatOn = (state: GameState, id: InstanceId): number => mustInstance(state, id).threat;
const mainThreat = (state: GameState): number => threatOn(state, state.mainScheme.instanceId);

describe("H3.5 a reveal that treats each per player icon on the card as 1 (3 players; question 19 = A, provisional)", () => {
  it("three players started this game", () => {
    expect(game().startingPlayerCount).toBe(3);
  });

  it("starting threat 2 and Hinder 2 per player, revealed normally: 2 + 6 hinder + 6 additional = 14", () => {
    const at = game();
    const brawl = the(at, BRAWL);
    const { state } = runCommandsPicking(at, deps, picking(brawl), use(at, REVEAL_PLAIN));
    expect(threatOn(state, brawl)).toBe(14);
  });

  it("the same scheme revealed with each per player icon as 1: 2 + 2 hinder + 6 additional = 10", () => {
    const at = game();
    const brawl = the(at, BRAWL);
    const { state } = runCommandsPicking(at, deps, picking(brawl), use(at, REVEAL_AS_ONE));
    expect(threatOn(state, brawl)).toBe(10);
  });

  it("starting threat 3 per player and 'When Revealed: place 1 per player threat here', revealed normally: 9 + 3 + 6 = 18", () => {
    const at = game();
    const riot = the(at, RIOT);
    const { state } = runCommandsPicking(at, deps, picking(riot), use(at, REVEAL_PLAIN));
    expect(threatOn(state, riot)).toBe(18);
  });

  it("that scheme revealed with each per player icon as 1: 3 + 1 + 6 = 10, not 9 + 3 + 6", () => {
    const at = game();
    const riot = the(at, RIOT);
    const { state } = runCommandsPicking(at, deps, picking(riot), use(at, REVEAL_AS_ONE));
    expect(threatOn(state, riot)).toBe(10);
  });

  it("a per player value on another card is unaffected while the scheme is revealed: it places 3", () => {
    const at = game();
    const riot = the(at, RIOT);
    expect(mainThreat(at)).toBe(0);
    const { state } = runCommandsPicking(at, deps, picking(riot), use(at, REVEAL_AS_ONE));
    expect(threatOn(state, riot)).toBe(10);
    expect(mainThreat(state)).toBe(3);
  });

  it("question 19 = A: the scheme's later Forced Response reads the real number of players and places 3 (10 + 3 = 13)", () => {
    const at = game();
    const riot = the(at, RIOT);
    const revealed = runCommandsPicking(at, deps, picking(riot), use(at, REVEAL_AS_ONE)).state;
    expect(threatOn(revealed, riot)).toBe(10);
    // The reading ended with the reveal.
    expect(perPlayerReading(revealed, riot)).toBeNull();
    expect(perPlayerCountAt(revealed, riot)).toBe(3);
    const { state } = runCommands(revealed, deps, { type: "changeForm", playerId: p1 });
    expect(threatOn(state, riot)).toBe(13);
  });

  it("the plain revealCard form, each per player icon as 2: 6 + 2 = 8", () => {
    const at = game();
    const riot = the(at, RIOT);
    const { state } = runCommands(at, deps, use(at, REVEAL_AS_TWO));
    expect(threatOn(state, riot)).toBe(8);
  });

  it("every printed per player value of the card is read through the reveal frame: a minion of 2 hit points per player has 2 while it is revealed and 6 after", () => {
    const at = game();
    const mob = the(at, MOB);
    const brawl = the(at, BRAWL);
    expect(perPlayerReading(at, mob)).toBeNull();
    // Its When Revealed asks which player, so the game stops inside the reveal.
    const asked = applyCommand(at, use(at, REVEAL_MOB), deps);
    if (!asked.ok) throw new Error(asked.error.message);
    const during = asked.state;
    expect(during.pendingChoice?.prompt.kind).toBe("choosePlayer");
    const reveal = during.stack.find((frame) => frame.kind === "reveal");
    expect(reveal).toMatchObject({ kind: "reveal", instanceId: mob, perPlayerAs: 1 });
    expect(perPlayerReading(during, mob)).toBe(1);
    expect(perPlayerCountAt(during, mob)).toBe(1);
    expect(maxHitPoints(during, mob, deps)).toBe(2);
    // Another card's icons are read as printed all the while.
    expect(perPlayerReading(during, brawl)).toBeNull();
    expect(perPlayerCountAt(during, brawl)).toBe(3);

    const { state, session } = runCommands(at, deps, use(at, REVEAL_MOB));
    expect(state.stack).toEqual([]);
    expect(mustInstance(state, mob).engagedWith).toBe(p1);
    // Question 19 = A: once revealed, its hit points are 2 per player again.
    expect(perPlayerReading(state, mob)).toBeNull();
    expect(maxHitPoints(state, mob, deps)).toBe(6);
    const again = replay(session.log, deps);
    if (!again.ok) throw new Error(again.error.message);
    expect(again.state).toEqual(state);
  });
});
