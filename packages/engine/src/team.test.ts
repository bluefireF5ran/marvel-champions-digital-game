/**
 * docs/competitive-mode-plan.md §3.3 and §4 task 2, docs/phase7-wave10.md §3.4: team membership, the one derived team
 * of a cooperative game, and the hand-built two-team state later tasks are tested against.
 *
 * Sources: MC56 p. 6 (cooperatively, "the enemy team" refers to the players), p. 14 (two teams) and p. 20 ("per
 * player" counts the players on your team); RRG 1.8 "Per Player Icon" (p. 32). No setup makes a second team, so the
 * two-team side is read on `twoTeamState`.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_DEPS } from "./abilities.js";
import { createCtx } from "./ctx.js";
import { EngineInvariantError } from "./errors.js";
import { gameModeOf } from "./game-mode.js";
import { playerId, teamId } from "./ids.js";
import { areaOfPlayer } from "./query.js";
import { eliminatePlayer, sitOutScenario } from "./resolve/defeat.js";
import { createGame } from "./setup.js";
import type { GameState } from "./state.js";
import { playersOnTeam, SINGLE_TEAM, teamOf, teamSize, teamsOf } from "./team.js";
import {
  DEFAULT_CARDS,
  DEFAULT_DECK,
  HERO,
  MAIN_SCHEME,
  newGame,
  newGameAtMulligan,
  VILLAIN,
} from "./testing/scenario.js";
import { LEADER_ONE, LEADER_TWO, TEAM_ONE, TEAM_TWO, twoTeamState } from "./testing/team.js";

const P1 = playerId("p1");
const P2 = playerId("p2");
const P3 = playerId("p3");
const P4 = playerId("p4");
const SEATS = [P1, P2, P3, P4];

describe("the one derived team of a game that stores none", () => {
  it.each([1, 2, 3, 4])("%i players: one team, t1, holding every seat in seat order", (players) => {
    const state = newGame({ players });
    expect("teams" in state).toBe(false);
    expect(SINGLE_TEAM).toBe("t1");
    expect(teamsOf(state)).toEqual([{ teamId: "t1", side: null, playerIds: SEATS.slice(0, players), areaId: null }]);
    expect(playersOnTeam(state, SINGLE_TEAM)).toEqual(SEATS.slice(0, players));
  });

  it.each([1, 2, 3, 4])("%i players: every seat is on t1", (players) => {
    const state = newGame({ players });
    expect(state.players.map((player) => teamOf(state, player.playerId).teamId)).toEqual(
      Array.from({ length: players }, () => "t1"),
    );
  });

  it("seat order is by seat index, whatever order the state lists its players in", () => {
    const state = newGame({ players: 3 });
    const shuffled: GameState = { ...state, players: [state.players[2]!, state.players[0]!, state.players[1]!] };
    expect(teamsOf(shuffled)[0]!.playerIds).toEqual([P1, P2, P3]);
  });

  it.each([1, 2, 3, 4])("%i players: its size is the count of players who started", (players) => {
    const state = newGame({ players });
    expect(teamSize(state, SINGLE_TEAM)).toBe(players);
    expect(state.startingPlayerCount).toBe(players);
  });

  it("a player eliminated during the game is still on the team and still counted", () => {
    const ctx = createCtx(newGame({ players: 3 }), DEFAULT_DEPS);
    eliminatePlayer(ctx, P2);
    expect(ctx.state.players[1]!.eliminated).toBe(true);
    expect(teamsOf(ctx.state)[0]!.playerIds).toEqual([P1, P2, P3]);
    expect(teamOf(ctx.state, P2).teamId).toBe("t1");
    expect(teamSize(ctx.state, SINGLE_TEAM)).toBe(3);
  });

  it("a seat that sat the scenario out is on the team and not counted", () => {
    const ctx = createCtx(newGameAtMulligan({ players: 3 }), DEFAULT_DEPS);
    sitOutScenario(ctx, P2);
    expect(ctx.state.players[1]!.sittingOut).toBe(true);
    expect(ctx.state.startingPlayerCount).toBe(2);
    expect(teamsOf(ctx.state)[0]!.playerIds).toEqual([P1, P2, P3]);
    expect(teamOf(ctx.state, P2).teamId).toBe("t1");
    expect(teamSize(ctx.state, SINGLE_TEAM)).toBe(2);
  });

  it("an unknown team or player is an invariant error", () => {
    const state = newGame({ players: 2 });
    expect(() => teamSize(state, teamId("t2"))).toThrow(EngineInvariantError);
    expect(() => playersOnTeam(state, teamId("t2"))).toThrow(EngineInvariantError);
    expect(() => teamOf(state, P3)).toThrow(EngineInvariantError);
  });
});

describe("twoTeamState", () => {
  it("1 against 1: a team of one seat each, in its own area with its own leader", () => {
    const state = twoTeamState();
    expect(gameModeOf(state)).toBe("competitive");
    expect(teamsOf(state)).toEqual([
      { teamId: "t1", side: "registration", playerIds: [P1], areaId: "a1" },
      { teamId: "t2", side: "resistance", playerIds: [P2], areaId: "a2" },
    ]);
    expect(teamOf(state, P1).teamId).toBe("t1");
    expect(teamOf(state, P2).teamId).toBe("t2");
    expect([teamSize(state, TEAM_ONE), teamSize(state, TEAM_TWO)]).toEqual([1, 1]);
    expect(state.startingPlayerCount).toBe(2);
    expect([areaOfPlayer(state, P1)?.areaId, areaOfPlayer(state, P2)?.areaId]).toEqual(["a1", "a2"]);
    expect(state.gameAreas.map((area) => state.instances[area.activeVillainId!]!.cardId)).toEqual([
      LEADER_ONE.id,
      LEADER_TWO.id,
    ]);
    expect(state.villains.map((villain) => villain.encounterDeckId)).toEqual(["e1", "e2"]);
  });

  it("2 against 2: seats 1 and 2 against seats 3 and 4", () => {
    const state = twoTeamState({ sizes: [2, 2] });
    expect(playersOnTeam(state, TEAM_ONE)).toEqual([P1, P2]);
    expect(playersOnTeam(state, TEAM_TWO)).toEqual([P3, P4]);
    expect(SEATS.map((seat) => teamOf(state, seat).teamId)).toEqual(["t1", "t1", "t2", "t2"]);
    expect([teamSize(state, TEAM_ONE), teamSize(state, TEAM_TWO)]).toEqual([2, 2]);
    expect(state.startingPlayerCount).toBe(4);
  });

  it("2 against 1: each team's size is its own", () => {
    const state = twoTeamState({ sizes: [2, 1] });
    expect(playersOnTeam(state, TEAM_ONE)).toEqual([P1, P2]);
    expect(playersOnTeam(state, TEAM_TWO)).toEqual([P3]);
    expect([P1, P2, P3].map((seat) => teamOf(state, seat).teamId)).toEqual(["t1", "t1", "t2"]);
    expect([teamSize(state, TEAM_ONE), teamSize(state, TEAM_TWO)]).toEqual([2, 1]);
  });

  it("an eliminated player stays on its team and in its size; a seat marked as sitting out leaves the size", () => {
    const ctx = createCtx(twoTeamState({ sizes: [2, 2] }), DEFAULT_DEPS);
    eliminatePlayer(ctx, P4);
    expect(ctx.state.players[3]!.eliminated).toBe(true);
    expect(teamOf(ctx.state, P4).teamId).toBe("t2");
    expect(playersOnTeam(ctx.state, TEAM_TWO)).toEqual([P3, P4]);
    expect([teamSize(ctx.state, TEAM_ONE), teamSize(ctx.state, TEAM_TWO)]).toEqual([2, 2]);
    const satOut: GameState = {
      ...ctx.state,
      players: ctx.state.players.map((player) => (player.playerId === P4 ? { ...player, sittingOut: true } : player)),
    };
    expect([teamSize(satOut, TEAM_ONE), teamSize(satOut, TEAM_TWO)]).toEqual([2, 1]);
  });

  it("createGame still refuses competitive mode", () => {
    const result = createGame({
      seed: 1,
      cards: DEFAULT_CARDS,
      villainCardId: VILLAIN.id,
      mainSchemeCardId: MAIN_SCHEME.id,
      encounterDeck: [],
      players: [{ identityCardId: HERO.id, deck: DEFAULT_DECK }],
      gameMode: "competitive",
    });
    expect(result.ok ? null : result.error.code).toBe("mode_unavailable");
  });
});

describe("serialization", () => {
  it("a state round-trips with and without teams", () => {
    const state = newGame({ players: 2 });
    const without = JSON.parse(JSON.stringify(state)) as GameState;
    expect(without).toEqual(state);
    expect("teams" in without).toBe(false);
    expect(teamsOf(without)).toEqual([{ teamId: "t1", side: null, playerIds: [P1, P2], areaId: null }]);
    const twoTeams = twoTeamState({ sizes: [2, 1] });
    const withTeams = JSON.parse(JSON.stringify(twoTeams)) as GameState;
    expect(withTeams).toEqual(twoTeams);
    expect(teamsOf(withTeams)).toEqual([
      { teamId: "t1", side: "registration", playerIds: [P1, P2], areaId: "a1" },
      { teamId: "t2", side: "resistance", playerIds: [P3], areaId: "a2" },
    ]);
    expect([teamSize(withTeams, TEAM_ONE), teamSize(withTeams, TEAM_TWO)]).toEqual([2, 1]);
  });
});
