/**
 * docs/competitive-mode-plan.md §3.3 and §4 task 4: the team-relative queries of `team.ts` — the enemy team of a team,
 * the leader a team is fighting ("the enemy leader") and the leader that is the team's own ("your leader") — and the
 * attachment host that reads them.
 *
 * Sources: MC56 p. 6 (cooperative play): "'the enemy team' refers to the players", "The leader in play is called 'the
 * enemy leader.'", "A card ability that refers to 'your leader' cannot be resolved. … Do as much as you can."; ruling of
 * July 9, 2026 (3) answer 2: outside Civil War scenarios "enemy leader" refers to the villain. No setup makes a second
 * team, so the two-team side is read on `twoTeamState`.
 */

import { describe, expect, it } from "vitest";
import { flat } from "@mc/content";
import { attachmentHostCandidates } from "./attachment-hosts.js";
import { EngineInvariantError } from "./errors.js";
import { playerId, teamId, type InstanceId } from "./ids.js";
import type { EffectContext } from "./select.js";
import { createGame } from "./setup.js";
import type { GameState } from "./state.js";
import { enemyLeaderOf, enemyTeamOf, SINGLE_TEAM, teamInArea, yourLeaderOf } from "./team.js";
import { stubVillain } from "./testing/fixtures.js";
import {
  DEFAULT_CARDS,
  DEFAULT_DECK,
  defaultPick,
  HERO,
  MAIN_SCHEME,
  newGame,
  settle,
  TREACHERY,
} from "./testing/scenario.js";
import { LEADER_ONE, LEADER_TWO, TEAM_ONE, TEAM_TWO, twoTeamState } from "./testing/team.js";

const P1 = playerId("p1");
const P2 = playerId("p2");

const leaderInstance = (state: GameState, card: { readonly id: string }): InstanceId =>
  state.villains.find((villain) => state.instances[villain.instanceId]?.cardId === card.id)!.instanceId;

const contextOf = (controllerId: EffectContext["controllerId"]): EffectContext => ({
  selfInstanceId: null,
  controllerId,
  event: null,
  bindings: {},
  deps: { abilities: {} },
});

const CREW = ["wrecker", "thunderball", "piledriver", "bulldozer"].map((id) =>
  stubVillain({ id, stages: [{ hp: flat(10), atk: 1, sch: 1 }] }),
);

/** Four villains in one game, each with its own encounter deck, as The Wrecking Crew sets up. */
function fourVillains(): GameState {
  const encounterDeck = Array.from({ length: 6 }, () => TREACHERY.id);
  const result = createGame({
    seed: 12,
    cards: [...DEFAULT_CARDS, ...CREW],
    villainCardId: CREW[0]!.id,
    villains: CREW.map((villain) => ({ villainCardId: villain.id, encounterDeck })),
    mainSchemeCardId: MAIN_SCHEME.id,
    encounterDeck: [],
    players: [{ identityCardId: HERO.id, deck: DEFAULT_DECK }],
  });
  if (!result.ok) throw new Error(result.error.message);
  return settle(result.state, defaultPick);
}

describe("cooperative play: one team", () => {
  it.each([1, 2, 3, 4])("%i players: the enemy team of the one team is that team", (players) => {
    const state = newGame({ players });
    const enemy = enemyTeamOf(state, SINGLE_TEAM);
    expect(enemy.teamId).toBe(SINGLE_TEAM);
    expect(enemy.playerIds).toHaveLength(players);
  });

  it.each([1, 2, 3, 4])("%i players: the enemy leader is the villain", (players) => {
    const state = newGame({ players });
    expect(enemyLeaderOf(state, SINGLE_TEAM)).toBe(state.activeVillainId);
    expect(state.villains.map((villain) => villain.instanceId)).toEqual([state.activeVillainId]);
  });

  it.each([1, 2, 3, 4])("%i players: there is no 'your leader'", (players) => {
    expect(yourLeaderOf(newGame({ players }), SINGLE_TEAM)).toBeNull();
  });

  it("four villains: the enemy leader is the active villain, and follows it", () => {
    const state = fourVillains();
    expect(state.villains).toHaveLength(4);
    expect(enemyLeaderOf(state, SINGLE_TEAM)).toBe(state.activeVillainId);
    const third = state.villains[2]!.instanceId;
    expect(third).not.toBe(state.activeVillainId);
    expect(enemyLeaderOf({ ...state, activeVillainId: third }, SINGLE_TEAM)).toBe(third);
    expect(yourLeaderOf(state, SINGLE_TEAM)).toBeNull();
  });

  it("a defeated villain is nobody's enemy leader", () => {
    const state = newGame();
    const defeated: GameState = {
      ...state,
      villains: state.villains.map((villain) => ({ ...villain, defeated: true })),
    };
    expect(enemyLeaderOf(defeated, SINGLE_TEAM)).toBeNull();
  });

  it("no team plays in a game area", () => {
    const { teams: _teams, ...state } = twoTeamState();
    expect(teamInArea(state, state.gameAreas[0]!)).toBeNull();
  });

  it("an unknown team is an invariant error, not a quiet answer", () => {
    const state = newGame();
    expect(() => enemyTeamOf(state, teamId("t9"))).toThrow(EngineInvariantError);
    expect(() => enemyLeaderOf(state, teamId("t9"))).toThrow(EngineInvariantError);
    expect(() => yourLeaderOf(state, teamId("t9"))).toThrow(EngineInvariantError);
  });
});

describe("two teams", () => {
  it("1 against 1: each team's enemy team is the other", () => {
    const state = twoTeamState();
    expect(enemyTeamOf(state, TEAM_ONE).teamId).toBe(TEAM_TWO);
    expect(enemyTeamOf(state, TEAM_TWO).teamId).toBe(TEAM_ONE);
    expect(enemyTeamOf(state, TEAM_ONE).playerIds).toEqual([P2]);
    expect(enemyTeamOf(state, TEAM_TWO).playerIds).toEqual([P1]);
  });

  it("1 against 1: the enemy leader is the leader in the team's own area, your leader the one in the other", () => {
    const state = twoTeamState();
    const one = leaderInstance(state, LEADER_ONE);
    const two = leaderInstance(state, LEADER_TWO);
    expect(one).not.toBe(two);
    expect(enemyLeaderOf(state, TEAM_ONE)).toBe(one);
    expect(yourLeaderOf(state, TEAM_ONE)).toBe(two);
    expect(enemyLeaderOf(state, TEAM_TWO)).toBe(two);
    expect(yourLeaderOf(state, TEAM_TWO)).toBe(one);
  });

  it("the team that plays in each area", () => {
    const state = twoTeamState({ sizes: [2, 2] });
    expect(teamInArea(state, state.gameAreas[0]!)?.teamId).toBe(TEAM_ONE);
    expect(teamInArea(state, state.gameAreas[1]!)?.teamId).toBe(TEAM_TWO);
  });

  it("a defeated leader is no longer either team's", () => {
    const state = twoTeamState();
    const two = leaderInstance(state, LEADER_TWO);
    const defeated: GameState = {
      ...state,
      villains: state.villains.map((villain) =>
        villain.instanceId === two ? { ...villain, defeated: true } : villain,
      ),
    };
    expect(enemyLeaderOf(defeated, TEAM_TWO)).toBeNull();
    expect(yourLeaderOf(defeated, TEAM_ONE)).toBeNull();
    expect(enemyLeaderOf(defeated, TEAM_ONE)).toBe(leaderInstance(state, LEADER_ONE));
  });
});

describe("AttachmentHost leader reads the same queries", () => {
  const TANGLED_UP = {
    kind: "ifAble",
    preferred: { kind: "leader", of: "yours" },
    otherwise: { kind: "yourIdentity" },
  } as const;

  it.each([1, 3])("cooperative, %i players: the enemy leader hosts, your leader does not", (players) => {
    const state = newGame({ players });
    expect(attachmentHostCandidates(state, { kind: "leader", of: "enemy" }, contextOf(P1))).toEqual([
      state.activeVillainId,
    ]);
    expect(attachmentHostCandidates(state, { kind: "leader", of: "yours" }, contextOf(P1))).toEqual([]);
    // Tangled Up (56181): "Attach to your leader. Otherwise, attach to your hero."
    expect(attachmentHostCandidates(state, TANGLED_UP, contextOf(P1))).toEqual([state.players[0]!.identity.instanceId]);
  });

  it("two teams: 'your leader' is a host, so the otherwise is not taken", () => {
    const state = twoTeamState();
    const one = leaderInstance(state, LEADER_ONE);
    const two = leaderInstance(state, LEADER_TWO);
    expect(attachmentHostCandidates(state, TANGLED_UP, contextOf(P1))).toEqual([two]);
    expect(attachmentHostCandidates(state, TANGLED_UP, contextOf(P2))).toEqual([one]);
    expect(attachmentHostCandidates(state, { kind: "leader", of: "enemy" }, contextOf(P1))).toEqual([one]);
    expect(attachmentHostCandidates(state, { kind: "leader", of: "enemy" }, contextOf(P2))).toEqual([two]);
  });
});
