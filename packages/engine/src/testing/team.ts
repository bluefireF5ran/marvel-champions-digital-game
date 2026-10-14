/**
 * A hand-built two-team state (docs/competitive-mode-plan.md §4 task 2; MC56 p. 14), for testing what reads a team
 * before competitive setup exists. `createGame` refuses competitive mode, so this sets up a cooperative game with two
 * leaders, each with its own encounter deck, and then writes onto the state what competitive setup will: the mode, a
 * game area for each team holding that team's seats and the leader it faces, and the two teams.
 *
 * The areas have no main scheme of their own yet (the game's one stage stays the central stage), and the round is
 * still the cooperative one. Nothing but a test builds a state this way.
 */

import { flat } from "@mc/content";
import { gameAreaId, teamId, type InstanceId } from "../ids.js";
import { createGame } from "../setup.js";
import type { GameAreaState, GameState } from "../state.js";
import type { TeamState } from "../team.js";
import { stubVillain } from "./fixtures.js";
import {
  DEFAULT_CARDS,
  DEFAULT_DECK,
  defaultPick,
  HERO,
  MAIN_SCHEME,
  seatIdentities,
  settle,
  TREACHERY,
} from "./scenario.js";

export const TEAM_ONE = teamId("t1");
export const TEAM_TWO = teamId("t2");

/** The leader team one faces (in team one's area), and the leader team two faces. */
export const LEADER_ONE = stubVillain({ id: "leader-one", stages: [{ hp: flat(20), atk: 2, sch: 1 }] });
export const LEADER_TWO = stubVillain({ id: "leader-two", stages: [{ hp: flat(20), atk: 2, sch: 1 }] });

export interface TwoTeamOptions {
  /** How many players each team has, team one first. Default 1 against 1; 2 against 2 is the other printed game. */
  readonly sizes?: readonly [number, number];
  readonly seed?: number;
}

/**
 * A game past setup with two teams: the first `sizes[0]` seats are team one (Registration), the rest team two
 * (Resistance). Uneven sizes are for tests of per-team counts alone; the printed game is never offered that way.
 */
export function twoTeamState(options: TwoTeamOptions = {}): GameState {
  const [first, second] = options.sizes ?? [1, 1];
  const identities = seatIdentities(HERO, first + second);
  const encounterDeck = Array.from({ length: 10 }, () => TREACHERY.id);
  const result = createGame({
    seed: options.seed ?? 56,
    cards: [...DEFAULT_CARDS, LEADER_ONE, LEADER_TWO, ...identities.slice(1)],
    villainCardId: LEADER_ONE.id,
    villains: [
      { villainCardId: LEADER_ONE.id, encounterDeck },
      { villainCardId: LEADER_TWO.id, encounterDeck },
    ],
    mainSchemeCardId: MAIN_SCHEME.id,
    encounterDeck: [],
    players: identities.map((identity) => ({ identityCardId: identity.id, deck: DEFAULT_DECK })),
  });
  if (!result.ok) throw new Error(`setup failed: ${result.error.message}`);
  const state = settle(result.state, defaultPick);
  const seats = [...state.players].sort((a, b) => a.seatIndex - b.seatIndex).map((player) => player.playerId);
  const [leaderOne, leaderTwo] = state.villains.map((villain) => villain.instanceId) as [InstanceId, InstanceId];
  const area = (seq: number, playerIds: GameAreaState["playerIds"], leader: InstanceId): GameAreaState => ({
    areaId: gameAreaId(`a${seq}`),
    playerIds,
    mainScheme: null,
    villainIds: [leader],
    activeVillainId: leader,
    sideSchemeIds: [],
    formerSchemeIds: [],
  });
  const one = area(1, seats.slice(0, first), leaderOne);
  const two = area(2, seats.slice(first), leaderTwo);
  const teams: readonly TeamState[] = [
    { teamId: TEAM_ONE, side: "registration", playerIds: one.playerIds, areaId: one.areaId },
    { teamId: TEAM_TWO, side: "resistance", playerIds: two.playerIds, areaId: two.areaId },
  ];
  return { ...state, gameMode: "competitive", gameAreas: [one, two], nextGameAreaSeq: 3, teams };
}
