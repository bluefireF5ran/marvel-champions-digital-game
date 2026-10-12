/**
 * docs/competitive-mode-plan.md §3.3 and §4 task 5: the spec words `TargetRef { kind: "leader", of }` ("the enemy
 * leader", "your leader") and `PlayerRef { kind: "team", of }` ("each player on your team", "the enemy team"), and
 * what an effect aimed at them does.
 *
 * Sources: MC56 p. 6 (cooperative play): "'the enemy team' refers to the players", "The leader in play is called 'the
 * enemy leader.'", "A card ability that refers to 'your leader' cannot be resolved. These cards typically have
 * alternate effects that will resolve instead. Do as much as you can."; ruling of July 9, 2026 (3) answer 2: outside
 * Civil War scenarios "enemy leader" refers to the villain. No setup makes a second team, so the two-team side is read
 * on `twoTeamState`.
 */

import { describe, expect, it } from "vitest";
import type { AnyCard } from "@mc/content";
import type { EngineDeps } from "./abilities.js";
import { startSession } from "./engine.js";
import { playerId, type InstanceId, type PlayerId } from "./ids.js";
import { mustInstance } from "./query.js";
import { eliminatePlayer } from "./resolve/defeat.js";
import { createCtx } from "./ctx.js";
import { contextTeam, resolvePlayers, resolveRef, resolveValue, type EffectContext } from "./select.js";
import type { EffectSpec, PlayerRef, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { SINGLE_TEAM } from "./team.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubEvent } from "./testing/fixtures.js";
import { gameAtFirstTurn, playFree } from "./testing/wave3.js";
import { LEADER_ONE, LEADER_TWO, TEAM_ONE, TEAM_TWO, twoTeamState } from "./testing/team.js";

const P1 = playerId("p1");
const P2 = playerId("p2");
const P3 = playerId("p3");
const P4 = playerId("p4");
const SEATS = [P1, P2, P3, P4];

const ENEMY_LEADER: TargetRef = { kind: "leader", of: "enemy" };
const YOUR_LEADER: TargetRef = { kind: "leader", of: "yours" };
const YOUR_TEAM: PlayerRef = { kind: "team", of: "yours" };
const ENEMY_TEAM: PlayerRef = { kind: "team", of: "enemy" };

const damage = (target: TargetRef, amount: number): EffectSpec => ({
  kind: "dealDamage",
  target,
  amount: { kind: "const", value: amount },
});
/** On the central stage, which is the main scheme of a cooperative game and the one stage the two-team fixture has. */
const threatOnMain = (amount: number): EffectSpec => ({
  kind: "placeThreat",
  target: { kind: "mainScheme", of: "central" },
  amount: { kind: "const", value: amount },
});
const leaderExists = (of: TargetRef) =>
  ({
    kind: "compare",
    left: { kind: "refCount", of },
    op: "atLeast",
    right: { kind: "const", value: 1 },
  }) as const;

const event = (id: string, effects: readonly EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
/** "Deal 2 damage to the enemy leader." */
const STRIKE = event("strike", [damage(ENEMY_LEADER, 2)]);
/** "Deal 3 damage to your leader. Place 1 threat on the main scheme.": the first part cannot resolve cooperatively. */
const OWN_GOAL = event("own-goal", [damage(YOUR_LEADER, 3), threatOnMain(1)]);
/** "Stun your leader. Otherwise, you are stunned." (Luke Cage, 56184). */
const OTHERWISE = event("otherwise", [
  {
    kind: "if",
    condition: leaderExists(YOUR_LEADER),
    then: [{ kind: "giveStatus", target: YOUR_LEADER, status: "stunned" }],
    otherwise: [
      { kind: "giveStatus", target: { kind: "identityOf", player: { kind: "controller" } }, status: "stunned" },
    ],
  },
]);
/** "Each player on your team places 1 threat on the main scheme." */
const RALLY = event("rally", [{ kind: "forEachPlayer", players: YOUR_TEAM, effects: [threatOnMain(1)] }]);
/** "Each player on the enemy team places 2 threat on the main scheme." */
const TAUNT = event("taunt", [{ kind: "forEachPlayer", players: ENEMY_TEAM, effects: [threatOnMain(2)] }]);
const BLANK = event("blank", []);
const EVENTS = [STRIKE, OWN_GOAL, OTHERWISE, RALLY, TAUNT, BLANK];
const deps: EngineDeps = depsOf(...EVENTS.map((e) => e.ability));

const start = (players: 1 | 2 | 3 | 4 = 1): GameState =>
  gameAtFirstTurn({ cards: EVENTS.map((e) => e.card), deck: EVENTS.map((e) => e.card.id), deps, players });

const contextOf = (controllerId: PlayerId | null, selfInstanceId: InstanceId | null = null): EffectContext => ({
  selfInstanceId,
  controllerId,
  event: null,
  bindings: {},
  deps,
});

const threat = (state: GameState): number => mustInstance(state, state.mainScheme.instanceId).threat;
const damageOn = (state: GameState, id: InstanceId): number => mustInstance(state, id).damage;
const leaderInstance = (state: GameState, card: { readonly id: string }): InstanceId =>
  state.villains.find((villain) => state.instances[villain.instanceId]?.cardId === card.id)!.instanceId;
const identity = (state: GameState, player: PlayerId): InstanceId =>
  state.players.find((seat) => seat.playerId === player)!.identity.instanceId;

/** Gives `player` a copy of `card` in the two-team fixture, whose decks do not hold it, then plays it for 0. */
function playInFixture(state: GameState, card: AnyCard, player: PlayerId): GameState {
  const seat = state.players.find((candidate) => candidate.playerId === player)!;
  const id = seat.deck[0]!;
  const given: GameState = {
    ...state,
    cardPool: { ...state.cardPool, [card.id]: card },
    instances: { ...state.instances, [id]: { ...state.instances[id]!, cardId: card.id } },
    players: state.players.map((candidate) =>
      candidate.playerId === player
        ? { ...candidate, deck: candidate.deck.slice(1), hand: [...candidate.hand, id] }
        : candidate,
    ),
  };
  return driveSession(startSession(given), deps, [
    { type: "playCard", playerId: player, cardInstanceId: id, payment: [], attachToInstanceId: null },
  ]).session.state;
}

describe("cooperative play: the words read", () => {
  it.each([1, 2, 3, 4] as const)("%i players: 'the enemy leader' is the villain", (players) => {
    const state = start(players);
    expect(resolveRef(state, ENEMY_LEADER, contextOf(P1))).toEqual([state.activeVillainId]);
    expect(resolveRef(state, ENEMY_LEADER, contextOf(P1))).toEqual(
      resolveRef(state, { kind: "villain" }, contextOf(P1)),
    );
    // An encounter card resolving for no player reads the same villain.
    expect(resolveRef(state, ENEMY_LEADER, contextOf(null))).toEqual([state.activeVillainId]);
  });

  it.each([1, 2, 3, 4] as const)("%i players: 'your leader' is no card", (players) => {
    const state = start(players);
    for (const seat of SEATS.slice(0, players)) expect(resolveRef(state, YOUR_LEADER, contextOf(seat))).toEqual([]);
    expect(resolveRef(state, YOUR_LEADER, contextOf(null))).toEqual([]);
    expect(resolveValue(state, { kind: "refCount", of: YOUR_LEADER }, contextOf(P1))).toBe(0);
  });

  it.each([1, 2, 3, 4] as const)("%i players: 'your team' is every player, in player order", (players) => {
    const state = start(players);
    expect(resolvePlayers(state, YOUR_TEAM, contextOf(P1))).toEqual(SEATS.slice(0, players));
    expect(resolvePlayers(state, YOUR_TEAM, contextOf(P1))).toEqual(
      resolvePlayers(state, { kind: "each" }, contextOf(P1)),
    );
  });

  it.each([1, 2, 3, 4] as const)("%i players: 'the enemy team' is the players", (players) => {
    const state = start(players);
    expect(resolvePlayers(state, ENEMY_TEAM, contextOf(P1))).toEqual(SEATS.slice(0, players));
    expect(resolvePlayers(state, ENEMY_TEAM, contextOf(null))).toEqual(SEATS.slice(0, players));
  });

  it("the team an effect is read for is the one team, whoever resolves it", () => {
    const state = start(3);
    expect(contextTeam(state, contextOf(P2))?.teamId).toBe(SINGLE_TEAM);
    expect(contextTeam(state, contextOf(null))?.teamId).toBe(SINGLE_TEAM);
  });

  it("player order starts at the first player, and an eliminated player is on neither list", () => {
    const state: GameState = { ...start(3), firstPlayerId: P2 };
    expect(resolvePlayers(state, YOUR_TEAM, contextOf(P1))).toEqual([P2, P3, P1]);
    const ctx = createCtx(state, deps);
    eliminatePlayer(ctx, P3);
    expect(resolvePlayers(ctx.state, YOUR_TEAM, contextOf(P1))).toEqual([P2, P1]);
    expect(resolvePlayers(ctx.state, ENEMY_TEAM, contextOf(P1))).toEqual([P2, P1]);
  });

  it("'more than 1 player on your team' counts the team's identities: 1, 2, 3, 4", () => {
    const count = { kind: "refCount", of: { kind: "identityOf", player: YOUR_TEAM } } as const;
    expect(([1, 2, 3, 4] as const).map((players) => resolveValue(start(players), count, contextOf(P1)))).toEqual([
      1, 2, 3, 4,
    ]);
  });
});

describe("cooperative play: effects aimed at the words", () => {
  it.each([1, 3] as const)("%i players: 2 damage to the enemy leader is 2 damage on the villain", (players) => {
    const state = start(players);
    const played = playFree(state, deps, STRIKE.card.id);
    expect(damageOn(played.state, state.activeVillainId)).toBe(damageOn(state, state.activeVillainId) + 2);
  });

  it.each([1, 3] as const)(
    "%i players: damage to 'your leader' changes nothing, and the next effect places its 1 threat",
    (players) => {
      const state = start(players);
      const played = playFree(state, deps, OWN_GOAL.card.id);
      expect(threat(played.state)).toBe(threat(state) + 1);
      expect(damageOn(played.state, state.activeVillainId)).toBe(damageOn(state, state.activeVillainId));
      for (const seat of state.players)
        expect(damageOn(played.state, seat.identity.instanceId)).toBe(damageOn(state, seat.identity.instanceId));
      expect(played.events.filter((e) => e.type === "damageDealt")).toEqual([]);
      expect(played.state.stack).toEqual([]);
      expect(played.state.pendingChoice).toBeNull();
    },
  );

  it("an ability that is only the part on 'your leader' leaves the game a blank ability leaves", () => {
    const only = event("only-yours", [damage(YOUR_LEADER, 3)]);
    const local = depsOf(only.ability, BLANK.ability);
    const state = gameAtFirstTurn({ cards: [only.card, BLANK.card], deck: [only.card.id, BLANK.card.id], deps: local });
    const aimed = playFree(state, local, only.card.id);
    const blank = playFree(state, local, BLANK.card.id);
    // The one difference in the log is the effects frame that held the effect, pushed and popped.
    const held = aimed.events.filter((e) => "frame" in e && e.frame === "effects");
    expect(held.map((e) => e.type)).toEqual(["framePushed", "framePopped"]);
    expect(aimed.events.filter((e) => !held.includes(e)).map((e) => e.type)).toEqual(blank.events.map((e) => e.type));
    expect(threat(aimed.state)).toBe(threat(state));
    expect(aimed.state.villains).toEqual(blank.state.villains);
    expect(mustInstance(aimed.state, state.activeVillainId)).toEqual(mustInstance(state, state.activeVillainId));
    expect(mustInstance(aimed.state, identity(state, P1))).toEqual(mustInstance(blank.state, identity(state, P1)));
    expect(aimed.state.stack).toEqual([]);
    expect(aimed.state.pendingChoice).toBeNull();
  });

  it("'Stun your leader. Otherwise, you are stunned.': the player is stunned, the villain is not", () => {
    const state = start(3);
    const played = playFree(state, deps, OTHERWISE.card.id);
    expect(mustInstance(played.state, identity(state, P1)).statuses.stunned).toBe(1);
    expect(mustInstance(played.state, state.activeVillainId).statuses.stunned ?? 0).toBe(0);
    expect(mustInstance(played.state, identity(state, P2)).statuses.stunned ?? 0).toBe(0);
  });

  it.each([1, 3] as const)("%i players: each player on your team places 1, the enemy team 2 each", (players) => {
    const state = start(players);
    expect(threat(playFree(state, deps, RALLY.card.id).state)).toBe(threat(state) + players);
    expect(threat(playFree(state, deps, TAUNT.card.id).state)).toBe(threat(state) + 2 * players);
  });
});

describe("two teams: each word from each side", () => {
  it("1 against 1: the leaders", () => {
    const state = twoTeamState();
    const one = leaderInstance(state, LEADER_ONE);
    const two = leaderInstance(state, LEADER_TWO);
    expect(resolveRef(state, ENEMY_LEADER, contextOf(P1))).toEqual([one]);
    expect(resolveRef(state, YOUR_LEADER, contextOf(P1))).toEqual([two]);
    expect(resolveRef(state, ENEMY_LEADER, contextOf(P2))).toEqual([two]);
    expect(resolveRef(state, YOUR_LEADER, contextOf(P2))).toEqual([one]);
  });

  it("2 against 2: the teams, in player order", () => {
    const state = twoTeamState({ sizes: [2, 2] });
    expect(resolvePlayers(state, YOUR_TEAM, contextOf(P1))).toEqual([P1, P2]);
    expect(resolvePlayers(state, ENEMY_TEAM, contextOf(P1))).toEqual([P3, P4]);
    expect(resolvePlayers(state, YOUR_TEAM, contextOf(P4))).toEqual([P3, P4]);
    expect(resolvePlayers(state, ENEMY_TEAM, contextOf(P4))).toEqual([P1, P2]);
    expect(resolveRef(state, YOUR_LEADER, contextOf(P2))).toEqual([leaderInstance(state, LEADER_TWO)]);
    expect(resolveRef(state, YOUR_LEADER, contextOf(P3))).toEqual([leaderInstance(state, LEADER_ONE)]);
  });

  it("the team is the resolving player's, then the team of the card's game area, then nobody's", () => {
    const state = twoTeamState({ sizes: [2, 2] });
    const one = leaderInstance(state, LEADER_ONE);
    const two = leaderInstance(state, LEADER_TWO);
    expect(contextTeam(state, contextOf(P2))?.teamId).toBe(TEAM_ONE);
    expect(contextTeam(state, contextOf(P3))?.teamId).toBe(TEAM_TWO);
    // A card in team two's area resolving for no player: the leader there, read from its own ability.
    expect(contextTeam(state, contextOf(null, two))?.teamId).toBe(TEAM_TWO);
    expect(resolveRef(state, ENEMY_LEADER, contextOf(null, two))).toEqual([two]);
    expect(resolveRef(state, YOUR_LEADER, contextOf(null, two))).toEqual([one]);
    expect(resolvePlayers(state, ENEMY_TEAM, contextOf(null, two))).toEqual([P1, P2]);
    // The central main scheme is in no team's area: with no player either, the words name nothing.
    const central = contextOf(null, state.mainScheme.instanceId);
    expect(contextTeam(state, central)).toBeNull();
    expect(resolveRef(state, ENEMY_LEADER, central)).toEqual([]);
    expect(resolveRef(state, YOUR_LEADER, central)).toEqual([]);
    expect(resolvePlayers(state, YOUR_TEAM, central)).toEqual([]);
    expect(resolvePlayers(state, ENEMY_TEAM, central)).toEqual([]);
  });

  it("'that player' of an effect over the enemy team does not turn 'your leader' around", () => {
    const state = twoTeamState();
    const scoped: EffectContext = { ...contextOf(P1), scopedPlayerId: P2 };
    expect(resolveRef(state, YOUR_LEADER, scoped)).toEqual([leaderInstance(state, LEADER_TWO)]);
  });

  it("1 against 1: 3 damage to 'your leader' lands on the leader in the other area, then 1 threat is placed", () => {
    const state = twoTeamState();
    const one = leaderInstance(state, LEADER_ONE);
    const two = leaderInstance(state, LEADER_TWO);
    const after = playInFixture(state, OWN_GOAL.card, P1);
    expect(damageOn(after, two)).toBe(3);
    expect(damageOn(after, one)).toBe(0);
    expect(threat(after)).toBe(threat(state) + 1);
  });

  it("1 against 1: 2 damage to 'the enemy leader' lands on the leader in the player's own area", () => {
    const state = twoTeamState();
    const after = playInFixture(state, STRIKE.card, P1);
    expect(damageOn(after, leaderInstance(state, LEADER_ONE))).toBe(2);
    expect(damageOn(after, leaderInstance(state, LEADER_TWO))).toBe(0);
  });
});
