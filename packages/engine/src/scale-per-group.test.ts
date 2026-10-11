/**
 * docs/phase7-wave9.md §3.65: the per group icon read from the group counts. Synthetic cards shaped like The Mangog
 * (`tt` 55041, hit points "10 [per group]"), Door Between Worlds (55046, starting threat "7 [per group]") and Worlds
 * Collide (55028b, target "2 [per group]").
 *
 * Sources: MC55 p. 4: "If the [per group] icon is on a card in a group's game area, that icon multiplies the value it is
 * next to by the number of groups in the respective pod. If the icon is on a card that is not in a specific group's
 * game area (such as the Worlds Collide main scheme), that icon multiplies the value it is next to by the total number
 * of groups in the game." MC55 p. 10: one group in Single Group Mode. The multi-group numbers are on hand-built states:
 * no game of this project has more than one group.
 */

import { describe, expect, it } from "vitest";
import { flat, perGroupOnly, perPlayerOnly, scaling } from "@mc/content";
import { DEFAULT_DEPS } from "./abilities.js";
import { replay, startSession } from "./engine.js";
import { groupId, type InstanceId } from "./ids.js";
import { podOf, SINGLE_GROUP, type PodSetup, type PodState } from "./pod.js";
import {
  mainSchemeValue,
  maxHitPoints,
  mustInstance,
  printedMinionHp,
  remainingHitPoints,
  scale,
  scaleIn,
  startingThreatOf,
} from "./query.js";
import type { GameState } from "./state.js";
import { driveSession } from "./testing/drive.js";
import { stubMainScheme, stubMinion, stubSideScheme, stubVillain } from "./testing/fixtures.js";
import { TREACHERY } from "./testing/scenario.js";
import {
  copiesOf,
  encounterCardInVillainArea,
  gameAtFirstTurn,
  minionEngagedWith,
  onTopOfEncounterDeck,
} from "./testing/wave3.js";

/** "10 [per group]" hit points. */
const BEAST = stubMinion({ id: "beast", atk: 4, sch: 3, hp: 10, hpPerGroup: true });
/** A flat 10, and "10 [per player]": neither reads the groups. */
const GRUNT = stubMinion({ id: "grunt", atk: 1, sch: 1, hp: 10 });
const WARDEN = stubMinion({ id: "warden", atk: 1, sch: 1, hp: 10, hpPerPlayer: true });
/** Starting threat "7 [per group]". */
const DOOR = stubSideScheme({ id: "door", startingThreat: perGroupOnly(7), boostIcons: 0 });
/** The same with "Hinder 2". */
const BARRED = stubSideScheme({
  id: "barred",
  startingThreat: perGroupOnly(7),
  boostIcons: 0,
  keywords: [{ name: "hinder", value: 2 }],
});
const SHARED_VILLAIN = stubVillain({ id: "shared-villain", stages: [{ hp: perPlayerOnly(20), atk: 0, sch: 0 }] });
const SHARED_SCHEME = stubMainScheme({
  id: "shared-scheme",
  stages: [{ startingThreat: flat(0), targetThreat: perGroupOnly(2), acceleration: flat(0) }],
});
/** A main scheme of the group's own whose target prints the per group icon. */
const GROUP_SCHEME = stubMainScheme({
  id: "group-scheme",
  stages: [{ startingThreat: flat(0), targetThreat: perGroupOnly(5), acceleration: flat(1) }],
});

const single = (players: number): PodSetup => ({
  groupId: SINGLE_GROUP,
  coordinator: "local",
  groupsInPod: 1,
  groupsInGame: 1,
  playersInGame: players,
});
const neutral = { area: "neutral", villainCardId: SHARED_VILLAIN.id, mainSchemeCardId: SHARED_SCHEME.id };
const CARDS = [BEAST, GRUNT, WARDEN, DOOR, BARRED, SHARED_VILLAIN, SHARED_SCHEME, GROUP_SCHEME];
const ENCOUNTER = [BEAST.id, GRUNT.id, WARDEN.id, DOOR.id, BARRED.id, ...copiesOf(TREACHERY.id, 20)];

const table = (players: 1 | 2 | 3 | 4, pod?: PodSetup): GameState =>
  gameAtFirstTurn({ players, cards: CARDS, deps: DEFAULT_DEPS, encounter: ENCOUNTER, ...(pod ? { pod } : {}) });
/** A state hand-built as one group of a larger pod and game. */
const inPodOf = (state: GameState, counts: Partial<PodState>): GameState => ({
  ...state,
  pod: { ...podOf(state), groupId: groupId("g1"), coordinator: "remote", ...counts },
});
/** `card` as the first encounter card dealt in the villain phase: under the one boost card the villain's activation takes. */
const dealtFirst = (state: GameState, card: typeof DOOR): GameState =>
  onTopOfEncounterDeck(onTopOfEncounterDeck(state, card.id), TREACHERY.id);
const hp = (state: GameState, id: InstanceId) => maxHitPoints(state, id, DEFAULT_DEPS);

describe("scale (docs/phase7-wave9.md §3.65)", () => {
  it("the per group icon multiplies by the groups and by nothing else", () => {
    expect(scale(perGroupOnly(7), 4, 1)).toBe(7);
    expect(scale(perGroupOnly(7), 4, 3)).toBe(21);
    // Players do not multiply a per group value, and groups do not touch a value without the icon.
    expect(scale(scaling(2, 1), 3, 5)).toBe(5);
    expect(scale(perPlayerOnly(8), 3, 5)).toBe(24);
    // Outside Epic Multiplayer there is one group.
    expect(scale(perGroupOnly(7), 4)).toBe(7);
    expect(scale(scaling(2, 1), 3)).toBe(5);
  });

  it("scaleIn reads the group's own players and the groups of its pod, never the game's", () => {
    const state = table(2);
    expect(scaleIn(state, scaling(1, 2))).toBe(5);
    expect(scaleIn(state, perGroupOnly(7))).toBe(7);
    const epic = inPodOf(state, { groupsInPodAtStart: 3, groupsInGameAtStart: 6, playersInGameAtStart: 9 });
    expect(scaleIn(epic, perGroupOnly(7))).toBe(21);
    expect(scaleIn(epic, scaling(1, 2))).toBe(5);
  });
});

describe("a minion's hit points with the per group icon", () => {
  it("one group: 10, with a pod record, in Single Group Mode and at any player count", () => {
    for (const state of [table(1), table(3), table(3, single(3))]) {
      const minion = minionEngagedWith(state, BEAST.id);
      expect(printedMinionHp(minion.state, BEAST)).toBe(10);
      expect(hp(minion.state, minion.id)).toBe(10);
    }
  });

  it("hand-built: two groups in the pod give 20, three give 30 whatever the game's count", () => {
    const minion = minionEngagedWith(table(2), BEAST.id);
    const two = inPodOf(minion.state, { groupsInPodAtStart: 2, groupsInGameAtStart: 2 });
    expect(hp(two, minion.id)).toBe(20);
    const three = inPodOf(minion.state, { groupsInPodAtStart: 3, groupsInGameAtStart: 6 });
    expect(hp(three, minion.id)).toBe(30);
    // Only damage is stored, so the dial follows the product.
    const hurt: GameState = {
      ...three,
      instances: { ...three.instances, [minion.id]: { ...mustInstance(three, minion.id), damage: 12 } },
    };
    expect(remainingHitPoints(hurt, minion.id, DEFAULT_DEPS)).toBe(18);
  });

  it("a flat value and a per player value do not read the groups", () => {
    const grunt = minionEngagedWith(table(2), GRUNT.id);
    const warden = minionEngagedWith(grunt.state, WARDEN.id);
    const epic = inPodOf(warden.state, { groupsInPodAtStart: 3, groupsInGameAtStart: 6 });
    expect(hp(epic, grunt.id)).toBe(10);
    expect(hp(epic, warden.id)).toBe(20);
  });
});

describe("a scheme's values with the per group icon", () => {
  it("one group, in play: the side scheme enters with 7 threat when it is revealed", () => {
    const start = dealtFirst(table(1, single(1)), DOOR);
    const { session } = driveSession(startSession(start), DEFAULT_DEPS, [
      { type: "endTurn", playerId: start.firstPlayerId },
    ]);
    const door = session.state.villainArea.find((id) => mustInstance(session.state, id).cardId === DOOR.id);
    expect(door && mustInstance(session.state, door).threat).toBe(7);
    const replayed = replay(session.log, DEFAULT_DEPS);
    expect(replayed.ok && replayed.state).toEqual(session.state);
  });

  it("hand-built: two groups in the pod give 14, three give 21, in play and by the reader", () => {
    const base = dealtFirst(table(1), DOOR);
    for (const [groups, threat] of [
      [2, 14],
      [3, 21],
    ] as const) {
      const start = inPodOf(base, { groupsInPodAtStart: groups, groupsInGameAtStart: groups * 2 });
      const { session } = driveSession(startSession(start), DEFAULT_DEPS, [
        { type: "endTurn", playerId: start.firstPlayerId },
      ]);
      const door = session.state.villainArea.find((id) => mustInstance(session.state, id).cardId === DOOR.id);
      expect(door && mustInstance(session.state, door).threat).toBe(threat);
      expect(door && startingThreatOf(session.state, door, DEFAULT_DEPS)).toBe(threat);
    }
  });

  it("hinder is added to a per group value", () => {
    const start = inPodOf(dealtFirst(table(1), BARRED), { groupsInPodAtStart: 2, groupsInGameAtStart: 2 });
    const { session } = driveSession(startSession(start), DEFAULT_DEPS, [
      { type: "endTurn", playerId: start.firstPlayerId },
    ]);
    const barred = session.state.villainArea.find((id) => mustInstance(session.state, id).cardId === BARRED.id);
    expect(barred && mustInstance(session.state, barred).threat).toBe(16);
    const placed = encounterCardInVillainArea(table(1), DOOR.id);
    expect(startingThreatOf(placed.state, placed.id, DEFAULT_DEPS)).toBe(7);
  });

  it("a main scheme of the group's own reads the groups of its pod", () => {
    const state = gameAtFirstTurn({ cards: CARDS, deps: DEFAULT_DEPS, mainScheme: GROUP_SCHEME });
    expect(mainSchemeValue(state, "targetThreat", DEFAULT_DEPS)).toBe(5);
    const epic = inPodOf(state, { groupsInPodAtStart: 2, groupsInGameAtStart: 6 });
    expect(mainSchemeValue(epic, "targetThreat", DEFAULT_DEPS)).toBe(10);
    expect(mainSchemeValue(epic, "acceleration", DEFAULT_DEPS)).toBe(1);
  });
});

describe("the neutral cards' values are scaled at setup with the game's counts", () => {
  const target = (players: 1 | 2 | 3 | 4, pod: PodSetup) => table(players, { ...pod, neutral }).pod?.shared;

  it("one group: target 2, 20 hit points per player", () => {
    expect(target(1, single(1))).toMatchObject({ schemeTarget: 2, villainHp: 20 });
    expect(target(3, single(3))).toMatchObject({ schemeTarget: 2, villainHp: 60 });
  });

  it("hand-built: two groups in the game give 4; three in the pod of six give 12, beside 30 and 21 in the group", () => {
    const remote = (groupsInPod: number, groupsInGame: number, playersInGame: number): PodSetup => ({
      groupId: groupId("g1"),
      coordinator: "remote",
      groupsInPod,
      groupsInGame,
      playersInGame,
      groupIdsInPod: Array.from({ length: groupsInPod }, (_, index) => groupId(`g${index + 1}`)),
    });
    expect(target(2, remote(2, 2, 5))).toMatchObject({ schemeTarget: 4, villainHp: 100 });
    const state = table(2, { ...remote(3, 6, 12), neutral });
    expect(state.pod?.shared).toMatchObject({ schemeTarget: 12, villainHp: 240 });
    const beast = minionEngagedWith(state, BEAST.id);
    const door = encounterCardInVillainArea(beast.state, DOOR.id);
    expect(hp(door.state, beast.id)).toBe(30);
    expect(startingThreatOf(door.state, door.id, DEFAULT_DEPS)).toBe(21);
  });
});
