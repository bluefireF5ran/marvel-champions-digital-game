/**
 * docs/phase7-wave10.md §1.9 and §3.4, docs/competitive-mode-plan.md §4 tasks 1 and 6: the game mode on setup and
 * state, the refusal of competitive mode, `Predicate gameMode` and the `competitiveOnly` marker effect.
 *
 * Sources: MC56 p. 6 (cooperative play) and p. 14 (competitive play). No setup makes a competitive game, so the
 * competitive side of the predicate is read on a state the test marks itself.
 */

import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import { replay } from "./engine.js";
import { COMPETITIVE_MODE_UNAVAILABLE_MESSAGE, gameModeOf } from "./game-mode.js";
import type { InstanceId } from "./ids.js";
import { mustInstance } from "./query.js";
import { createGame, type GameSetupConfig } from "./setup.js";
import type { EffectSpec, Predicate } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { stubEvent } from "./testing/fixtures.js";
import { DEFAULT_CARDS, DEFAULT_DECK, HERO, MAIN_SCHEME, TREACHERY, VILLAIN } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, playFree } from "./testing/wave3.js";

const CONFIG: GameSetupConfig = {
  seed: 7,
  cards: DEFAULT_CARDS,
  villainCardId: VILLAIN.id,
  mainSchemeCardId: MAIN_SCHEME.id,
  encounterDeck: copiesOf(TREACHERY.id, 20),
  players: [{ identityCardId: HERO.id, deck: DEFAULT_DECK }],
};

const competitive: Predicate = { kind: "gameMode", is: "competitive" };
const cooperative: Predicate = { kind: "gameMode", is: "cooperative" };
const threatOnMain = (amount: number): EffectSpec => ({
  kind: "placeThreat",
  target: { kind: "mainScheme" },
  amount: { kind: "const", value: amount },
});
const MARKER: EffectSpec = { kind: "competitiveOnly", text: "In competitive mode, move 2 threat." };

const event = (id: string, effects: readonly EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
/** "In competitive mode, [marker]. Otherwise, place 2 threat": the cooperative reading is the false branch. */
const CLAUSE = event("clause", [{ kind: "if", condition: competitive, then: [MARKER], otherwise: [threatOnMain(2)] }]);
const IN_COMPETITIVE = event("in-competitive", [{ kind: "if", condition: competitive, then: [threatOnMain(3)] }]);
const IN_COOPERATIVE = event("in-cooperative", [{ kind: "if", condition: cooperative, then: [threatOnMain(5)] }]);
const MARKER_ONLY = event("marker-only", [MARKER]);
const BLANK = event("blank", []);
const EVENTS = [CLAUSE, IN_COMPETITIVE, IN_COOPERATIVE, MARKER_ONLY, BLANK];

const deps: EngineDeps = depsOf(...EVENTS.map((e) => e.ability));
const start = (): GameState =>
  gameAtFirstTurn({ cards: EVENTS.map((e) => e.card), deck: EVENTS.map((e) => e.card.id), deps });
const asCompetitive = (state: GameState): GameState => ({ ...state, gameMode: "competitive" });
const threat = (state: GameState) => mustInstance(state, state.mainScheme.instanceId).threat;

describe("GameSetupConfig.gameMode", () => {
  it("refuses competitive mode with mode_unavailable and the player-readable message", () => {
    const result = createGame({ ...CONFIG, gameMode: "competitive" });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "mode_unavailable",
        message: "Competitive mode is coming soon. Play this scenario cooperatively for now.",
        command: null,
      },
    });
    expect(COMPETITIVE_MODE_UNAVAILABLE_MESSAGE).toBe(
      "Competitive mode is coming soon. Play this scenario cooperatively for now.",
    );
  });

  it("refuses it first: an otherwise invalid config still reports mode_unavailable", () => {
    const broken = createGame({ ...CONFIG, players: [] });
    expect(broken.ok ? null : broken.error.code).toBe("invalid_setup");
    const result = createGame({ ...CONFIG, players: [], gameMode: "competitive" });
    expect(result.ok ? null : result.error.code).toBe("mode_unavailable");
  });

  it("absent is cooperative: the same state as cooperative given explicitly, with no gameMode on it", () => {
    const absent = createGame(CONFIG);
    const explicit = createGame({ ...CONFIG, gameMode: "cooperative" });
    if (!absent.ok || !explicit.ok) throw new Error("setup failed");
    expect(explicit.state).toEqual(absent.state);
    expect("gameMode" in absent.state).toBe(false);
    expect("gameMode" in explicit.state).toBe(false);
    expect(gameModeOf(absent.state)).toBe("cooperative");
  });

  it("refuses a mode it does not know as a malformed config", () => {
    const result = createGame({ ...CONFIG, gameMode: "solo" as never });
    expect(result.ok ? null : result.error).toEqual({
      code: "invalid_setup",
      message: 'gameMode must be "cooperative" or "competitive", not solo',
      command: null,
    });
  });
});

describe("GameState.gameMode", () => {
  it("reads the stored mode, cooperative when absent", () => {
    const state = start();
    expect(gameModeOf(state)).toBe("cooperative");
    expect(gameModeOf(asCompetitive(state))).toBe("competitive");
    expect(gameModeOf({ ...state, gameMode: "cooperative" })).toBe("cooperative");
  });

  it("a serialized state round-trips with and without the field", () => {
    const state = start();
    const without = JSON.parse(JSON.stringify(state)) as GameState;
    expect(without).toEqual(state);
    expect("gameMode" in without).toBe(false);
    const marked = asCompetitive(state);
    const withField = JSON.parse(JSON.stringify(marked)) as GameState;
    expect(withField).toEqual(marked);
    expect(withField.gameMode).toBe("competitive");
  });
});

describe("Predicate gameMode", () => {
  it("competitive: false in a cooperative game, true in a competitive one", () => {
    const state = start();
    expect(threat(playFree(state, deps, IN_COMPETITIVE.card.id).state)).toBe(threat(state));
    expect(threat(playFree(asCompetitive(state), deps, IN_COMPETITIVE.card.id).state)).toBe(threat(state) + 3);
  });

  it("cooperative: true in a cooperative game, false in a competitive one", () => {
    const state = start();
    expect(threat(playFree(state, deps, IN_COOPERATIVE.card.id).state)).toBe(threat(state) + 5);
    expect(threat(playFree(asCompetitive(state), deps, IN_COOPERATIVE.card.id).state)).toBe(threat(state));
  });
});

describe("EffectSpec competitiveOnly", () => {
  it("does nothing: the game an ability with only the marker leaves is the game a blank ability leaves", () => {
    const state = start();
    const marker = playFree(state, deps, MARKER_ONLY.card.id);
    const blank = playFree(state, deps, BLANK.card.id);
    // The one difference in the log is the effects frame that held the marker, pushed and popped.
    const held = marker.events.filter((e) => "frame" in e && e.frame === "effects");
    expect(held.map((e) => e.type)).toEqual(["framePushed", "framePopped"]);
    expect(marker.events.filter((e) => !held.includes(e)).map((e) => e.type)).toEqual(blank.events.map((e) => e.type));
    expect(threat(marker.state)).toBe(threat(state));
    // The played card went from hand to discard, and no other card moved.
    const others = (ids: readonly InstanceId[]) =>
      ids.filter((id) => mustInstance(state, id).cardId !== MARKER_ONLY.card.id);
    expect(others(marker.state.players[0]!.hand)).toEqual(others(state.players[0]!.hand));
    expect(marker.state.players[0]!.discard).toHaveLength(state.players[0]!.discard.length + 1);
    expect(marker.state.stack).toEqual([]);
    expect(marker.state.pendingChoice).toBeNull();
  });

  it("'In competitive mode, …. Otherwise, …': a cooperative game resolves the otherwise; replay deep-equal", () => {
    const state = start();
    const played = playFree(state, deps, CLAUSE.card.id);
    expect(threat(played.state)).toBe(threat(state) + 2);
    const replayed = replay(played.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(played.session.state);
  });

  it("the same clause in a competitive game reaches the marker and places no threat", () => {
    const state = start();
    expect(threat(playFree(asCompetitive(state), deps, CLAUSE.card.id).state)).toBe(threat(state));
  });
});
