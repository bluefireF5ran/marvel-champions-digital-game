/**
 * docs/phase7-wave10.md §3.14: `oncePerPhasePerEventPlayer`, "(Limit once per phase per player.)" on a forced trigger
 * of a card nobody controls, in real two- and three-player Civil War games (`wave10Scenario`, Registration: Iron Man
 * on stage Cut Off Support 56063b, cooperative mode, Core starter decks). The engine side is driven by
 * `packages/engine/src/limit-per-event-player.test.ts`.
 *
 * The real card is Cut Off Support 56063b: "Forced Interrupt: When a player reveals a treachery, place 1 threat here.
 * (Limit once per phase per player.)" Its module is scripted elsewhere, so this file registers its own script of that
 * sentence over the wave's registry, and rebinds Helicarrier's action (01092, in every Core starter deck used here) to
 * "reveal the top card of the encounter deck" so a player reveals a treachery by a real command in the player phase.
 * The treachery revealed is Advance 01186 (Core standard: "the villain schemes"), put back on top before each reveal.
 *
 * Source: RRG 1.8 "Limit" (pp. 26-27).
 */

import {
  createGame,
  type EngineDeps,
  type GameEvent,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import {
  P1,
  P2,
  P3,
  endTurn,
  firstLegal,
  moveToHand,
  patchInstance,
  payWith,
  play,
  playerOf,
  settle,
  stackEncounterDeck,
  use,
} from "../testing/harness.js";
import { driveEventsPicking, withForm } from "../testing/staging.js";
import { codeOf, types } from "../wave9/testing.js";
import { WAVE10_CARDS } from "../wave10/cards.js";
import { wave10Scenario } from "../wave10/setup.js";
import { IRON_MAN_SCENARIO, WAVE10_DEPS } from "../wave10/testing.js";
import { action, forcedInterrupt, on, oncePerPhasePerEventPlayer, oncePerRoundPerPlayer } from "./abilities.js";
import { placeThreat, revealEncounterCard } from "./effects.js";
import { defineAbilities, validateDefinition } from "./validate.js";
import { query, self, you } from "./values.js";

vi.setConfig({ testTimeout: 120_000 });

const HELICARRIER = "01092";
const HELICARRIER_ACTION = "01092.helicarrier-action";
const ADVANCE = "01186";
const INTERRUPT = "56063b.cut-off-support-forced-interrupt";

/** "Forced Interrupt: When a player reveals a treachery, place 1 threat here. (Limit once per phase per player.)" */
const cutOffSupport = forcedInterrupt(
  on.encounterCardRevealed(query("treachery")),
  { limit: oncePerPhasePerEventPlayer },
  placeThreat(1, self),
);
const SCRIPTS = defineAbilities({
  [INTERRUPT]: cutOffSupport,
  [HELICARRIER_ACTION]: action(revealEncounterCard(you)),
});
const deps: EngineDeps = { ...WAVE10_DEPS, abilities: { ...WAVE10_DEPS.abilities, ...SCRIPTS } };

const SEATS = [
  { starterDeckId: "core-spider-man-justice" },
  { starterDeckId: "core-captain-marvel-leadership" },
  { starterDeckId: "core-she-hulk-aggression" },
] as const;

/** A Registration: Iron Man game on Cut Off Support, past setup, at the first player's turn. */
function game(players: 2 | 3): GameState {
  const config = wave10Scenario(IRON_MAN_SCENARIO, {
    players: SEATS.slice(0, players),
    seed: 7,
    mainSchemeStageIds: ["56063b", "56064b"],
  });
  const created = createGame(config, deps);
  if (!created.ok) throw new Error(`${created.error.code}: ${created.error.message}`);
  return settle(created.state, firstLegal, (s) => s.step.phase === "player", deps);
}

type Driven = { readonly state: GameState; readonly events: readonly GameEvent[] };
const drive = (state: GameState, ...commands: Parameters<typeof driveEventsPicking>[3][]): Driven =>
  driveEventsPicking(deps, state, firstLegal, ...commands);

/** `player`'s Helicarrier in play, played from hand for its cost the first time. */
function helicarrierOf(state: GameState, player: PlayerId): { readonly state: GameState; readonly id: InstanceId } {
  const inPlay = playerOf(state, player).playArea.find((id) => codeOf(state, id) === HELICARRIER);
  if (inPlay) return { state, id: inPlay };
  const given = moveToHand(state, player, HELICARRIER);
  const [id] = given.ids as [InstanceId];
  return { state: drive(given.state, play(player, id, payWith(given.state, player, 3, given.ids))).state, id };
}

/**
 * `player` reveals Advance off the top of the encounter deck, by Helicarrier's rebound action. Advance ("the villain
 * schemes") puts Iron Man's SCH on the main scheme and the real stage opens with hinder 2[per_hero] and the leader's
 * attachment, so over six reveals in a three-player game the stage would reach its target of 7 per player and advance
 * to stage 2, ending the Cut Off Support under test. The test counts the stage's own placements, so the threat on the
 * scheme is cleared before each reveal.
 */
function reveals(state: GameState, player: PlayerId): Driven {
  const ready = helicarrierOf(state, player);
  const cleared = patchInstance(ready.state, ready.state.mainScheme.instanceId, { threat: 0 });
  return drive(stackEncounterDeck(cleared, ADVANCE), use(player, ready.id, HELICARRIER_ACTION));
}

/** How many times the forced interrupt resolved. */
const resolved = (events: readonly GameEvent[]): number =>
  types(events, "abilityResolved").filter((e) => e.abilityId === INTERRUPT).length;
/** The threat the stage's own ability placed on it, one entry per placement. */
const placedByStage = (state: GameState, events: readonly GameEvent[]): number[] =>
  types(events, "threatPlaced")
    .filter((e) => e.sourceInstanceId === state.mainScheme.instanceId)
    .map((e) => e.amount);
const TYPE_OF = new Map<string, string>(WAVE10_CARDS.map((card) => [card.id as string, card.type]));
/** How many treacheries `player` revealed. */
const treacheriesRevealedBy = (events: readonly GameEvent[], player: PlayerId): number =>
  types(events, "encounterCardRevealed").filter((e) => e.playerId === player && TYPE_OF.get(e.cardId) === "treachery")
    .length;

describe("§3.14 Cut Off Support: 'when a player reveals a treachery, place 1 threat here (limit once per phase per player)'", () => {
  it("the script is plain data, and the validator accepts it", () => {
    expect(oncePerPhasePerEventPlayer).toEqual({ count: 1, period: "phase", per: "eventPlayer" });
    expect(cutOffSupport).toEqual({
      trigger: {
        kind: "interrupt",
        forced: true,
        on: { on: "encounterCardRevealing", targetIs: { categories: ["treachery"] } },
      },
      limit: { count: 1, period: "phase", per: "eventPlayer" },
      effects: [{ kind: "placeThreat", target: { kind: "self" }, amount: { kind: "const", value: 1 } }],
    });
    expect(validateDefinition(cutOffSupport)).toEqual([]);
    expect(JSON.parse(JSON.stringify(cutOffSupport))).toEqual(cutOffSupport);
  });

  it("the validator rejects it on an ability with no triggering event, and keeps the per-user limit for actions", () => {
    expect(validateDefinition(action({ limit: oncePerPhasePerEventPlayer }, placeThreat(1, self)))).toEqual([
      "a limit per event player is a triggered ability's: an interrupt or a response",
    ]);
    expect(validateDefinition(action({ limit: oncePerRoundPerPlayer }, placeThreat(1, self)))).toEqual([]);
  });

  it.each([
    [2, [P1, P2]],
    [3, [P1, P2, P3]],
  ] as const)(
    "%i players each reveal two treacheries in one player phase: once for each player, not twice for one",
    (players, order) => {
      let state = game(players);
      const scheme = state.mainScheme.instanceId;
      let total = 0;
      for (const player of order) {
        const first = reveals(state, player);
        expect(resolved(first.events)).toBe(1);
        expect(placedByStage(first.state, first.events)).toEqual([1]);
        const second = reveals(first.state, player);
        expect(types(second.events, "encounterCardRevealed").map((e) => [e.cardId, e.playerId])).toEqual([
          [ADVANCE, player],
        ]);
        expect(resolved(second.events)).toBe(0);
        expect(placedByStage(second.state, second.events)).toEqual([]);
        total += 1;
        expect(second.state.abilityUses[`${scheme}:${INTERRUPT}#eventPlayer:${player}`]).toBe(1);
        expect(
          Object.keys(second.state.abilityUses).filter((key) => key.startsWith(`${scheme}:${INTERRUPT}`)),
        ).toHaveLength(total);
        state = second.state;
        // The next player's turn, in the same player phase (the last player's turn is ended by the test that needs it).
        if (player !== order[order.length - 1]) {
          state = drive(state, endTurn(player)).state;
          expect(state.step.phase).toBe("player");
        }
      }
      expect(total).toBe(players);
    },
  );

  it("the next phase starts the count again: the villain phase, then the next player phase", () => {
    let state = game(2);
    const scheme = state.mainScheme.instanceId;
    state = reveals(state, P1).state;
    state = drive(state, endTurn(P1)).state;
    state = reveals(state, P2).state;
    // The villain phase: each player's own reveals place at most 1, and exactly 1 if they revealed a treachery.
    // The Advances' scheming is taken off first and both heroes face the villain's attack, not its scheme, so the
    // stage is not completed during the phase.
    state = patchInstance(state, scheme, { threat: 0 });
    for (const player of [P1, P2]) state = withForm(state, { heroForm: 0 }, player);
    const villain = drive(state, endTurn(P2));
    expect(villain.state.mainScheme.stageIndex).toBe(0);
    const expected = [P1, P2].filter((p) => treacheriesRevealedBy(villain.events, p) > 0).length;
    // With this seed at least one of the two is dealt a treachery, so the phase's own count is exercised.
    expect(expected).toBeGreaterThan(0);
    expect(resolved(villain.events)).toBe(expected);
    expect(placedByStage(villain.state, villain.events)).toEqual(Array.from({ length: expected }, () => 1));
    // A new player phase: no count is left, and a player who revealed last round places 1 again.
    expect(villain.state.step.phase).toBe("player");
    expect(Object.keys(villain.state.abilityUses).filter((key) => key.startsWith(`${scheme}:${INTERRUPT}`))).toEqual(
      [],
    );
    const again = reveals(villain.state, villain.state.firstPlayerId);
    expect(resolved(again.events)).toBe(1);
    expect(placedByStage(again.state, again.events)).toEqual([1]);
  });
});
