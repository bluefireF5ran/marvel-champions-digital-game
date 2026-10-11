/**
 * The active player is eliminated during their own turn (`endEliminatedPlayersTurn`, `flow.ts`), and an eliminated
 * identity's hit point dial stops at zero (`eliminatePlayer`, `resolve/defeat.ts`).
 *
 * RRG 1.8 "Player Elimination" (p. 34): "When a player is eliminated, the remaining players continue to play the game.
 * Eliminated players no longer participate in the game", and "If a player is eliminated partway through the resolution
 * of an ability, resolve the entire ability." So the turn of a player who is out cannot wait on them: once what was
 * resolving has resolved, it ends as a turn does and the next player's begins, or the end of the phase when it was the
 * last. RRG 1.8 "Hit Points" (p. 22): the dial "represents their remaining hit points"; it has no reading below zero.
 *
 * From a real four-player game: Wade Wilson, defeated during his own turn, left the step on his turn, where an
 * eliminated player has no legal action and `endTurn` is refused, and his dial read -1. Synthetic cards only.
 */

import { flat } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { applyCommand, replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import { playerId, type InstanceId, type PlayerId } from "./ids.js";
import { legalActions } from "./legal.js";
import { activeVillain, maxHitPoints, mustInstance, mustPlayer, remainingHitPoints } from "./query.js";
import type { EffectSpec, TargetRef, ValueSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommands } from "./testing/drive.js";
import { stubEvent, stubSideScheme, stubVillain } from "./testing/fixtures.js";
import { encounterCardInVillainArea, gameAtFirstTurn, P1, P2, playFree } from "./testing/wave3.js";
import { TREACHERY } from "./testing/scenario.js";

const P3: PlayerId = playerId("p3");
const you: TargetRef = { kind: "identityOf", player: { kind: "controller" } };
const n = (value: number): ValueSpec => ({ kind: "const", value });

const event = (id: string, effects: readonly EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
/** "Deal 11 damage to your identity." One more than its 10 hit points. */
const BACKFIRE = event("out-backfire", [{ kind: "dealDamage", target: you, amount: n(11) }]);
/** "Deal 11 damage to your identity. Place 1 threat on the main scheme." The rest of an ability whose player is out. */
const BACKFIRE_THEN = event("out-backfire-then", [
  { kind: "dealDamage", target: you, amount: n(11) },
  { kind: "placeThreat", target: { kind: "mainScheme" }, amount: n(1) },
]);
/** "Deal 1 damage to each identity." */
const SHOCKWAVE = event("out-shockwave", [
  { kind: "dealDamage", target: { kind: "each", query: { categories: ["identity"] } }, amount: n(1) },
]);
const EVENTS = [BACKFIRE, BACKFIRE_THEN, SHOCKWAVE];

/** "Forced Response: After a player's turn ends, place 1 threat on the main scheme." An encounter card, so it stays. */
const TOLL_RESPONSE = stubAbility("out-toll.forced-response", {
  trigger: { kind: "response", forced: true, on: { on: "turnEnding" } },
  effects: [{ kind: "placeThreat", target: { kind: "mainScheme" }, amount: n(1) }],
});
const TOLL = stubSideScheme({ id: "out-toll", startingThreat: 0, abilities: [TOLL_RESPONSE.ref] });

const PLAIN = stubVillain({ id: "out-plain", stages: [{ hp: flat(60), atk: 1, sch: 1 }] });
/** Retaliate 2: a hero attacking it with 1 hit point left goes one past zero. */
const THORNS = stubVillain({
  id: "out-thorns",
  stages: [{ hp: flat(60), atk: 1, sch: 1, keywords: [{ name: "retaliate", value: 2 }] }],
});

const deps: EngineDeps = depsOf(TOLL_RESPONSE, ...EVENTS.map((e) => e.ability));

function table(players: 1 | 2 | 3, villain = PLAIN): GameState {
  return gameAtFirstTurn({
    deps,
    villain,
    players,
    cards: [TOLL, ...EVENTS.map((e) => e.card)],
    deck: EVENTS.map((e) => e.card.id),
    encounter: [TOLL.id, ...Array.from({ length: 30 }, () => TREACHERY.id)],
  });
}

const identityOf = (state: GameState, player: PlayerId): InstanceId => mustPlayer(state, player).identity.instanceId;
const withDamage = (state: GameState, id: InstanceId, damage: number): GameState => ({
  ...state,
  instances: { ...state.instances, [id]: { ...mustInstance(state, id), damage } },
});
const asHeroes = (state: GameState): GameState => ({
  ...state,
  players: state.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" } })),
});
const endTurn = (player: PlayerId): Command => ({ type: "endTurn", playerId: player });
const of = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const typesOf = (events: readonly GameEvent[], ...types: readonly GameEvent["type"][]) =>
  events.filter((e) => types.includes(e.type)).map((e) => e.type);
const threat = (state: GameState) => mustInstance(state, state.mainScheme.instanceId).threat;

describe("the active player is eliminated during their own turn (RRG 1.8 'Player Elimination', p. 34)", () => {
  it("with players still to go, the turn ends and the next player's begins; they can act and end it", () => {
    const start = table(3);
    expect(start.step).toMatchObject({ kind: "turn", activePlayerId: P1, remainingPlayerIds: [P2, P3] });

    const out = playFree(start, deps, BACKFIRE.card.id, P1);
    expect(mustPlayer(out.state, P1).eliminated).toBe(true);
    expect(out.state.outcome).toBeNull();
    expect(out.state.stack).toEqual([]);
    expect(out.state.step).toEqual({ phase: "player", kind: "turn", activePlayerId: P2, remainingPlayerIds: [P3] });
    // Eliminated, then the turn ended, then the next began: the log gives the order.
    expect(typesOf(out.events, "playerEliminated", "turnEnded", "turnStarted")).toEqual([
      "playerEliminated",
      "turnEnded",
      "turnStarted",
    ]);
    expect(of(out.events, "turnEnded")).toEqual([{ type: "turnEnded", playerId: P1 }]);
    expect(of(out.events, "turnStarted")).toEqual([{ type: "turnStarted", playerId: P2 }]);

    // The eliminated player has nothing to do and is not waited on; the next player has a turn.
    expect(legalActions(out.state, P1, deps)).toMatchObject({ kind: "notYourTurn", activePlayerId: P2 });
    const theirs = legalActions(out.state, P2, deps);
    expect(theirs.kind).toBe("turn");
    expect(theirs.kind === "turn" && theirs.legal.length).toBeGreaterThan(0);
    expect(applyCommand(out.state, endTurn(P1), deps).ok).toBe(false);

    const acted = playFree(out.state, deps, SHOCKWAVE.card.id, P2);
    expect(of(acted.events, "damageDealt").map((e) => e.targetInstanceId)).toEqual([
      identityOf(acted.state, P2),
      identityOf(acted.state, P3),
    ]);
    const next = runCommands(acted.state, deps, endTurn(P2));
    expect(next.state.step).toEqual({ phase: "player", kind: "turn", activePlayerId: P3, remainingPlayerIds: [] });
  });

  it("as the last player in turn order, the player phase goes on to its end and the villain phase follows", () => {
    const start = table(2);
    const round = start.round;
    const atLast = runCommands(start, deps, endTurn(P1));
    expect(atLast.state.step).toMatchObject({ kind: "turn", activePlayerId: P2, remainingPlayerIds: [] });

    const out = playFree(atLast.state, deps, BACKFIRE.card.id, P2);
    expect(mustPlayer(out.state, P2).eliminated).toBe(true);
    expect(of(out.events, "turnEnded")).toEqual([{ type: "turnEnded", playerId: P2 }]);
    // The end-of-phase steps and the whole villain phase ran with one player; the next round is theirs.
    expect(of(out.events, "roundStarted")).toEqual([{ type: "roundStarted", round: round + 1 }]);
    expect(out.state.outcome).toBeNull();
    expect(out.state.step).toEqual({ phase: "player", kind: "turn", activePlayerId: P1, remainingPlayerIds: [] });
    expect(legalActions(out.state, P1, deps).kind).toBe("turn");
  });

  it("the rest of the ability that eliminated them resolves before the turn ends", () => {
    const start = table(2);
    const before = threat(start);
    const out = playFree(start, deps, BACKFIRE_THEN.card.id, P1);
    expect(threat(out.state)).toBe(before + 1);
    // …in the turn it was played in: the threat is placed before that turn ends.
    expect(typesOf(out.events, "playerEliminated", "threatPlaced", "turnEnded")).toEqual([
      "playerEliminated",
      "threatPlaced",
      "turnEnded",
    ]);
    expect(out.state.step).toMatchObject({ kind: "turn", activePlayerId: P2 });
  });

  it("the turn's end is an ordinary one: a card still in play that answers a turn ending answers this one", () => {
    const toll = encounterCardInVillainArea(table(2), TOLL.id);
    const before = threat(toll.state);
    const out = playFree(toll.state, deps, BACKFIRE.card.id, P1);
    expect(threat(out.state)).toBe(before + 1);
    expect(out.state.stack).toEqual([]);
    expect(out.state.step).toMatchObject({ kind: "turn", activePlayerId: P2 });
  });

  it("Retaliate during their own basic attack: the attack is made, Retaliate 2 on 1 hit point eliminates, the turn moves on", () => {
    const start = asHeroes(table(2, THORNS));
    const hero = identityOf(start, P1);
    const hp = maxHitPoints(start, hero, deps)!;
    const out = runCommands(withDamage(start, hero, hp - 1), deps, {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: hero,
      targetInstanceId: activeVillain(start).instanceId,
    });
    expect(of(out.events, "damageDealt").map((e) => [e.targetInstanceId, e.amount])).toEqual([
      [activeVillain(start).instanceId, 2],
      [hero, 2],
    ]);
    expect(mustPlayer(out.state, P1).eliminated).toBe(true);
    expect(remainingHitPoints(out.state, hero, deps)).toBe(0);
    expect(out.state.stack).toEqual([]);
    expect(out.state.step).toEqual({ phase: "player", kind: "turn", activePlayerId: P2, remainingPlayerIds: [] });
    expect(legalActions(out.state, P2, deps).kind).toBe("turn");

    const replayed = replay(out.session.log, deps);
    expect(replayed.ok && replayed.state).toEqual(out.state);
  });

  it("the command log replays to the same state and the same events", () => {
    const start = table(3);
    const out = playFree(start, deps, BACKFIRE.card.id, P1, [endTurn(P2), endTurn(P3)]);
    expect(mustPlayer(out.state, P1).eliminated).toBe(true);
    const replayed = replay(out.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(out.state);
    expect(replayed.events).toEqual(out.events);
    expect(replay(out.session.log, deps)).toEqual(replayed);
  });
});

describe("an elimination that does not end a turn", () => {
  it("a player eliminated during another player's turn: that turn goes on, and theirs is passed over", () => {
    const start = table(3);
    const fragile = withDamage(start, identityOf(start, P2), maxHitPoints(start, identityOf(start, P2), deps)! - 1);
    const out = playFree(fragile, deps, SHOCKWAVE.card.id, P1);
    expect(mustPlayer(out.state, P2).eliminated).toBe(true);
    expect(of(out.events, "turnEnded")).toEqual([]);
    expect(out.state.step).toEqual({ phase: "player", kind: "turn", activePlayerId: P1, remainingPlayerIds: [P2, P3] });
    expect(legalActions(out.state, P1, deps).kind).toBe("turn");

    const next = runCommands(out.state, deps, endTurn(P1));
    expect(next.state.step).toEqual({ phase: "player", kind: "turn", activePlayerId: P3, remainingPlayerIds: [] });
  });

  it("the last player eliminated on their own turn: the game is lost there, with no turn ended or begun", () => {
    const out = playFree(table(1), deps, BACKFIRE.card.id, P1);
    expect(out.state.outcome).toEqual({ result: "loss", reason: "allPlayersDefeated" });
    expect(out.state.step).toEqual({ phase: "gameOver", kind: "gameOver" });
    expect(typesOf(out.events, "turnEnded", "turnStarted")).toEqual([]);
    expect(remainingHitPoints(out.state, identityOf(out.state, P1), deps)).toBe(0);
  });
});

describe("an eliminated identity's hit point dial stops at zero (RRG 1.8 'Hit Points', p. 22)", () => {
  it("11 damage on 10 hit points: 11 are dealt and logged, the dial reads 0, and the 1 past zero is logged as lost", () => {
    const start = table(2);
    const hero = identityOf(start, P1);
    const out = playFree(start, deps, BACKFIRE.card.id, P1);
    expect(of(out.events, "damageDealt")).toMatchObject([{ targetInstanceId: hero, amount: 11 }]);
    expect(of(out.events, "damageBeyondZeroLost")).toEqual([
      {
        type: "damageBeyondZeroLost",
        instanceId: hero,
        cardId: mustInstance(start, hero).cardId,
        amount: 1,
        damage: 10,
      },
    ]);
    expect(mustInstance(out.state, hero).damage).toBe(10);
    expect(remainingHitPoints(out.state, hero, deps)).toBe(0);
    // It stays there for the rest of the game.
    const later = runCommands(out.state, deps, endTurn(P2));
    expect(remainingHitPoints(later.state, hero, deps)).toBe(0);
  });

  it("defeated at exactly zero: nothing was past zero, so nothing is logged as lost", () => {
    const start = table(2);
    const hero = identityOf(start, P1);
    const out = playFree(withDamage(start, hero, 9), deps, SHOCKWAVE.card.id, P1);
    expect(mustPlayer(out.state, P1).eliminated).toBe(true);
    expect(of(out.events, "damageBeyondZeroLost")).toEqual([]);
    expect(remainingHitPoints(out.state, hero, deps)).toBe(0);
  });
});
