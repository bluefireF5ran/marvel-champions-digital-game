/**
 * docs/phase7-wave9.md §3.64: the pod record and `GroupId` on game state. Epic Multiplayer groundwork, built for
 * Single Group Mode (MC55 p. 10: "the only group in your pod is your own group of 1–4 players").
 *
 * Sources: MC55 p. 4 (the per group icon counts the groups of the pod, or of the whole game for a card in no group's
 * area); the Epic Multiplayer Reminder card ("the number of groups that began the scenario in that pod"); RRG 1.8 "Per
 * Player Icon" (p. 32): "If a player is eliminated, this value does not change."
 */

import { describe, expect, it } from "vitest";
import { flat, perPlayerOnly, perGroupOnly } from "@mc/content";
import { DEFAULT_DEPS } from "./abilities.js";
import { replay, startSession } from "./engine.js";
import { groupId } from "./ids.js";
import { podOf, podSetupFault, SINGLE_GROUP, type PodSetup } from "./pod.js";
import { inClosedScenarioPlayArea, mustInstance, scenarioPlayAreaOf } from "./query.js";
import { createGame, type GameSetupConfig } from "./setup.js";
import { driveSession } from "./testing/drive.js";
import { stubMainScheme, stubVillain } from "./testing/fixtures.js";
import {
  DEFAULT_CARDS,
  DEFAULT_DECK,
  HERO,
  MAIN_SCHEME,
  seatIdentities,
  TREACHERY,
  VILLAIN,
} from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn } from "./testing/wave3.js";

/** A shared villain: 20 per player on both faces, shaped like `tt` 55027a/b. */
const SHARED_VILLAIN = stubVillain({
  id: "shared-villain",
  stages: [{ hp: perPlayerOnly(20), atk: 0, sch: 0, dashedStats: ["atk", "sch"] }],
  back: { name: "shared-villain", stages: [{ hp: perPlayerOnly(20), atk: 0, sch: 0, dashedStats: ["atk", "sch"] }] },
});
/** A shared main scheme: target 2 per group, shaped like `tt` 55028a/b. */
const SHARED_SCHEME = stubMainScheme({
  id: "shared-scheme",
  stages: [{ startingThreat: flat(0), targetThreat: perGroupOnly(2), acceleration: flat(0) }],
});

const single = (players: number): PodSetup => ({
  groupId: SINGLE_GROUP,
  coordinator: "local",
  groupsInPod: 1,
  groupsInGame: 1,
  playersInGame: players,
});
const neutral = {
  area: "neutral",
  villainCardId: SHARED_VILLAIN.id,
  mainSchemeCardId: SHARED_SCHEME.id,
  villainFlipAtRemaining: perPlayerOnly(10),
};

function config(players: number, pod?: PodSetup): GameSetupConfig {
  const identities = seatIdentities(HERO, players);
  return {
    seed: 21,
    cards: [...DEFAULT_CARDS, ...identities.slice(1), SHARED_VILLAIN, SHARED_SCHEME],
    villainCardId: VILLAIN.id,
    mainSchemeCardId: MAIN_SCHEME.id,
    encounterDeck: copiesOf(TREACHERY.id, 30),
    players: identities.map((identity) => ({ identityCardId: identity.id, deck: DEFAULT_DECK })),
    ...(pod ? { pod } : {}),
  };
}
const created = (players: number, pod?: PodSetup) => {
  const result = createGame(config(players, pod), DEFAULT_DEPS);
  if (!result.ok) throw new Error(result.error.message);
  return result;
};

describe("the pod record (docs/phase7-wave9.md §3.64)", () => {
  it("a game with no pod has no pod key, and podOf gives the single-group default", () => {
    const { state } = created(2);
    expect("pod" in state).toBe(false);
    expect(podOf(state)).toEqual({
      groupId: "g1",
      coordinator: "local",
      groupsInPodAtStart: 1,
      groupsInGameAtStart: 1,
      playersInGameAtStart: 2,
      shared: null,
      outboundSeq: 0,
      inboundSeq: 0,
    });
  });

  it("three players in Single Group Mode: the record is in the replay baseline and round-trips through JSON", () => {
    const { state } = created(3, { ...single(3), neutral });
    const session = startSession(state);
    expect(session.log.initialState.pod).toMatchObject({
      groupId: "g1",
      coordinator: "local",
      groupsInPodAtStart: 1,
      groupsInGameAtStart: 1,
      playersInGameAtStart: 3,
    });
    expect(JSON.parse(JSON.stringify(state.pod))).toEqual(state.pod);
    expect(podOf(state)).toBe(state.pod);
    const driven = driveSession(session, DEFAULT_DEPS).session;
    const replayed = replay(driven.log, DEFAULT_DEPS);
    expect(replayed.ok && replayed.state).toEqual(driven.state);
  });

  it("a pod record alone moves nothing: the same seed deals the same game with and without it", () => {
    const { pod: _pod, ...withPod } = created(2, single(2)).state;
    expect(withPod).toEqual(created(2).state);
    expect(created(2, single(2)).events).toEqual(created(2).events);
  });

  it("setup refuses a local coordinator with more than one group in the game, and other impossible counts", () => {
    const refused = (pod: PodSetup) => {
      const result = createGame(config(2, pod), DEFAULT_DEPS);
      return result.ok ? null : result.error.code;
    };
    expect(refused({ ...single(2), groupsInGame: 2, playersInGame: 5 })).toBe("invalid_setup");
    expect(refused({ ...single(2), groupsInPod: 0 })).toBe("invalid_setup");
    expect(refused({ ...single(2), groupsInPod: 2 })).toBe("invalid_setup");
    expect(refused({ ...single(2), playersInGame: 1 })).toBe("invalid_setup");
    expect(refused({ ...single(2), playersInGame: 3 })).toBe("invalid_setup");
    const two = [groupId("g1"), groupId("g2")];
    expect(
      podSetupFault(
        { ...single(2), coordinator: "remote", groupsInPod: 2, groupsInGame: 4, playersInGame: 9, groupIdsInPod: two },
        2,
      ),
    ).toBe(null);
    expect(
      refused({ ...single(2), groupId: groupId("g2"), coordinator: "remote", groupsInGame: 2, playersInGame: 5 }),
    ).toBe(null);
  });
});

describe("the pod's neutral cards (docs/phase7-wave9.md §3.59, §3.65, §3.66)", () => {
  it("are plain cards in a closed in-play area: neither the villain nor a main scheme of the game", () => {
    const { state, events } = created(1, { ...single(1), neutral });
    const pod = podOf(state);
    expect(pod.neutral?.area).toBe("neutral");
    expect(state.scenarioPlayAreas).toEqual({
      neutral: { cards: [pod.neutral?.villainInstanceId, pod.neutral?.mainSchemeInstanceId], closed: true },
    });
    expect(events).toContainEqual({ type: "scenarioPlayAreaCreated", name: "neutral", closed: true });
    const villainId = pod.neutral!.villainInstanceId;
    const schemeId = pod.neutral!.mainSchemeInstanceId;
    expect(mustInstance(state, villainId)).toMatchObject({ cardId: SHARED_VILLAIN.id, faceup: true, flipped: false });
    expect(scenarioPlayAreaOf(state, schemeId)).toBe("neutral");
    expect(inClosedScenarioPlayArea(state, villainId)).toBe(true);
    expect(state.villains.map((v) => v.cardId)).toEqual([VILLAIN.id]);
    expect(state.mainScheme.cardId).toBe(MAIN_SCHEME.id);
    expect(state.mainScheme.instanceId).not.toBe(schemeId);
  });

  it("every other card keeps the instance id it has without them", () => {
    const withNeutral = created(2, { ...single(2), neutral }).state;
    const without = created(2).state;
    for (const [id, instance] of Object.entries(without.instances))
      expect(withNeutral.instances[id]?.cardId).toBe(instance.cardId);
    expect(Object.keys(withNeutral.instances).length).toBe(Object.keys(without.instances).length + 2);
    expect(withNeutral.rng).toEqual(without.rng);
  });

  it("their values are scaled once, at setup, with the game's counts", () => {
    const shared = (players: number, pod: PodSetup) => created(players, { ...pod, neutral }).state.pod?.shared;
    expect(shared(1, single(1))).toEqual({
      villainHp: 20,
      villainDamage: 0,
      villainFlipAtRemaining: 10,
      villainFlipped: false,
      schemeThreat: 0,
      schemeTarget: 2,
      status: "playing",
    });
    expect(shared(3, single(3))).toMatchObject({ villainHp: 60, villainFlipAtRemaining: 30, schemeTarget: 2 });
    // Hand-built Epic counts: two players at this table, of nine in a game of six groups, three of them in this pod.
    const epic: PodSetup = {
      groupId: groupId("g2"),
      coordinator: "remote",
      groupsInPod: 3,
      groupsInGame: 6,
      playersInGame: 9,
      groupIdsInPod: [groupId("g1"), groupId("g2"), groupId("g3")],
    };
    expect(shared(2, epic)).toMatchObject({ villainHp: 180, villainFlipAtRemaining: 90, schemeTarget: 12 });
    const { villainFlipAtRemaining: _flip, ...neverFlips } = neutral;
    expect(created(1, { ...single(1), neutral: neverFlips }).state.pod?.shared?.villainFlipAtRemaining).toBeNull();
  });

  it("setup refuses neutral cards of the wrong type, or already in the game", () => {
    const refused = (cards: Partial<typeof neutral>) => {
      const result = createGame(config(1, { ...single(1), neutral: { ...neutral, ...cards } }), DEFAULT_DEPS);
      return result.ok ? null : result.error.message;
    };
    expect(refused({ villainCardId: SHARED_SCHEME.id })).toMatch(/not a villain card/);
    expect(refused({ mainSchemeCardId: TREACHERY.id })).toMatch(/not a main scheme card/);
    expect(refused({ mainSchemeCardId: MAIN_SCHEME.id })).toMatch(/already in the game/);
    expect(refused({ area: "" })).toMatch(/needs a name/);
  });

  it("a game with them plays a full round, and replays", () => {
    const state = gameAtFirstTurn({
      cards: [SHARED_VILLAIN, SHARED_SCHEME],
      deps: DEFAULT_DEPS,
      pod: { ...single(1), neutral },
    });
    const { session } = driveSession(startSession(state), DEFAULT_DEPS, [
      { type: "endTurn", playerId: state.firstPlayerId },
    ]);
    expect(session.state.round).toBe(2);
    expect(session.state.outcome).toBeNull();
    // Step one's threat went on the game's own main scheme; the neutral cards hold no tokens.
    const pod = podOf(session.state);
    expect(mustInstance(session.state, pod.neutral!.mainSchemeInstanceId).threat).toBe(0);
    expect(mustInstance(session.state, pod.neutral!.villainInstanceId).damage).toBe(0);
    expect(pod.shared).toMatchObject({ villainDamage: 0, schemeThreat: 0, status: "playing" });
    const replayed = replay(session.log, DEFAULT_DEPS);
    expect(replayed.ok && replayed.state).toEqual(session.state);
  });
});
