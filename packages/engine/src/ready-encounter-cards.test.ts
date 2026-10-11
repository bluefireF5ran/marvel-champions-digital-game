/**
 * RRG 1.8 "End of Player Phase", step 3: "Each player simultaneously readies all of their cards. Ready each exhausted
 * encounter card." Every encounter card in play readies, wherever it is: attached to an identity (a Trance exhausted by
 * its Forced Action, `tt` 55007b to 55011b, MC55 p. 22), to an ally, to a minion, to the villain or to a card in the
 * villain area, engaged with a player, or in the villain area.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_DEPS, type EngineDeps } from "./abilities.js";
import { replay, startSession } from "./engine.js";
import type { InstanceId } from "./ids.js";
import { activeEncounterDeckId, mustInstance, mustPlayer } from "./query.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubAttachment, stubEnvironment, stubMinion, stubSideScheme } from "./testing/fixtures.js";
import { ALLY, TREACHERY } from "./testing/scenario.js";
import {
  copiesOf,
  encounterCardInVillainArea,
  gameAtFirstTurn,
  minionEngagedWith,
  P1,
  P2,
  playerCardIntoPlay,
} from "./testing/wave3.js";

const TRANCE = stubAttachment({ id: "trance" });
const GRUNT = stubMinion({ id: "grunt", atk: 0, sch: 0, hp: 9 });
const WEATHER = stubEnvironment({ id: "weather" });
const PLOT = stubSideScheme({ id: "plot", startingThreat: 3, boostIcons: 0 });
/** "This card cannot ready." */
const STUCK_RULE = stubAbility("stuck.constant", {
  trigger: { kind: "constant", rules: [{ kind: "cannotReady", target: { self: true } }] },
  effects: [],
});
const STUCK = stubAttachment({ id: "stuck", abilities: [STUCK_RULE.ref] });
const deps: EngineDeps = depsOf(STUCK_RULE);

/** An attachment from the encounter deck attached to `host`, exhausted (surgery). */
function attachedExhausted(state: GameState, card: string, host: InstanceId): { state: GameState; id: InstanceId } {
  const deckId = activeEncounterDeckId(state);
  const piles = state.encounterDecks[deckId]!;
  const id = piles.deck.find((candidate) => state.instances[candidate]?.cardId === card);
  if (!id) throw new Error(`no ${card} in the encounter deck`);
  const hostInstance = mustInstance(state, host);
  return {
    id,
    state: {
      ...state,
      encounterDecks: { ...state.encounterDecks, [deckId]: { ...piles, deck: piles.deck.filter((x) => x !== id) } },
      instances: {
        ...state.instances,
        [host]: { ...hostInstance, attachments: [...hostInstance.attachments, id] },
        [id]: { ...mustInstance(state, id), attachedTo: host, faceup: true, exhausted: true },
      },
    },
  };
}
const exhaust = (state: GameState, ...ids: readonly InstanceId[]): GameState => ({
  ...state,
  instances: {
    ...state.instances,
    ...Object.fromEntries(ids.map((id) => [id, { ...mustInstance(state, id), exhausted: true }])),
  },
});
const exhausted = (state: GameState, id: InstanceId) => mustInstance(state, id).exhausted;
const table = (players: 1 | 2 = 1, using: EngineDeps = DEFAULT_DEPS) =>
  gameAtFirstTurn({
    players,
    cards: [TRANCE, GRUNT, WEATHER, PLOT, STUCK],
    deps: using,
    encounter: [...copiesOf(TRANCE.id, 6), GRUNT.id, WEATHER.id, PLOT.id, STUCK.id, ...copiesOf(TREACHERY.id, 20)],
  });
/** Plays the player phase to its end, and stops before the villain phase can exhaust anything again. */
function endPlayerPhase(state: GameState, using: EngineDeps = DEFAULT_DEPS) {
  const order = [...state.players].sort((a, b) => a.seatIndex - b.seatIndex).map((p) => p.playerId);
  const { session, events } = driveSession(
    startSession(state),
    using,
    order.map((playerId) => ({ type: "endTurn" as const, playerId })),
  );
  const replayed = replay(session.log, using);
  expect(replayed.ok && replayed.state).toEqual(session.state);
  const readied = events.flatMap((e) => (e.type === "cardReadied" ? [e.instanceId] : []));
  return { state: session.state, readied };
}

describe("the end of the player phase readies every encounter card in play", () => {
  it("an encounter attachment on an identity", () => {
    const start = table();
    const trance = attachedExhausted(start, TRANCE.id, mustPlayer(start, P1).identity.instanceId);
    const { state, readied } = endPlayerPhase(trance.state);
    expect(readied).toContain(trance.id);
    expect(exhausted(state, trance.id)).toBe(false);
    expect(state.round).toBe(2);
  });

  it("on each player's identity, on an ally, on a minion, on the villain and on a card in the villain area", () => {
    const start = table(2);
    const ally = playerCardIntoPlay(start, ALLY.id, P2);
    const minion = minionEngagedWith(ally.state, GRUNT.id, P2);
    const plot = encounterCardInVillainArea(minion.state, PLOT.id, 3);
    const weather = encounterCardInVillainArea(plot.state, WEATHER.id);
    let state = weather.state;
    const ids: InstanceId[] = [];
    for (const host of [
      mustPlayer(state, P1).identity.instanceId,
      mustPlayer(state, P2).identity.instanceId,
      ally.id,
      minion.id,
      state.activeVillainId,
      plot.id,
    ]) {
      const attached = attachedExhausted(state, TRANCE.id, host);
      state = attached.state;
      ids.push(attached.id);
    }
    // The cards the step already readied: an engaged minion, and cards in the villain area.
    state = exhaust(state, minion.id, weather.id, plot.id, ally.id);
    const after = endPlayerPhase(state);
    for (const id of [...ids, minion.id, weather.id, plot.id, ally.id]) {
      expect(after.readied).toContain(id);
      expect(exhausted(after.state, id)).toBe(false);
    }
    // Each card once.
    expect(new Set(after.readied).size).toBe(after.readied.length);
  });

  it("a card that cannot ready stays exhausted", () => {
    const start = table(1, deps);
    const stuck = attachedExhausted(start, STUCK.id, mustPlayer(start, P1).identity.instanceId);
    const { state, readied } = endPlayerPhase(stuck.state, deps);
    expect(readied).not.toContain(stuck.id);
    expect(exhausted(state, stuck.id)).toBe(true);
  });

  it("a game with no exhausted encounter attachment readies exactly what it did", () => {
    const { readied } = endPlayerPhase(table());
    expect(readied).toEqual([]);
  });
});
