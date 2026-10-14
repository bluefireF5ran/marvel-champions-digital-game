/**
 * docs/phase7-wave10.md §3.14: `AbilityLimit.per: "eventPlayer"`, a forced trigger limited "once per phase per
 * player" on a card nobody controls. Cut Off Support 56063b and Open Rebellion 56172b (`cw`): "Forced Interrupt: When
 * a player reveals a treachery, place 1 threat here. (Limit once per phase per player.)"
 *
 * Sources: RRG 1.8 "Limit" (pp. 26-27). The count is kept for the player the triggering event belongs to (the
 * revealing player), and reset at the phase boundary as any phase limit is.
 *
 * Synthetic cards. The main scheme's stage 1B prints the forced interrupt, placing a `heard` counter instead of threat
 * so the villain's own scheming does not blur the number. The encounter deck holds treacheries only: `rush` (surge) and
 * `filler`. Each villain phase is stacked so every player is dealt a `rush`, whose surge reveals a `filler`: two
 * treacheries revealed by each player in the one phase.
 */

import { abilityId, flat, type AbilityReference } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityDefinition, AbilityLimit, EngineDeps } from "./abilities.js";
import { replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { PlayerId } from "./ids.js";
import { activeEncounterDeck, mustInstance } from "./query.js";
import { limitKeyOf } from "./resolve/ability.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommands } from "./testing/drive.js";
import { stubEvent, stubMainScheme, stubTreachery } from "./testing/fixtures.js";
import { withEncounterPiles } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, P1, P2, playFree } from "./testing/wave3.js";

const INTERRUPT_ID = "scheme.1b-forced-interrupt";
const self = { kind: "self" } as const;

/** "Forced Interrupt: When a player reveals a treachery, place 1 `heard` counter here." with `limit`. */
const interrupt = (limit: AbilityLimit | undefined): AbilityDefinition => ({
  trigger: {
    kind: "interrupt",
    forced: true,
    on: { on: "encounterCardRevealing", targetIs: { categories: ["treachery"] } },
  },
  ...(limit ? { limit } : {}),
  effects: [{ kind: "addCounters", target: self, counterType: "heard", amount: { kind: "const", value: 1 } }],
});
const INTERRUPT_REF: AbilityReference = { id: abilityId(INTERRUPT_ID) };
const PER_EVENT_PLAYER: AbilityLimit = { count: 1, period: "phase", per: "eventPlayer" };

const SCHEME = stubMainScheme({
  id: "main",
  stages: [{ startingThreat: flat(0), targetThreat: flat(99), acceleration: flat(0), abilities: [INTERRUPT_REF] }],
});
const RUSH = stubTreachery({ id: "rush", boostIcons: 0, keywords: [{ name: "surge" }] });
const FILLER = stubTreachery({ id: "filler", boostIcons: 0 });
/** "Reveal the top card of the encounter deck." */
const REVEAL_ABILITY = stubAbility("reveal-top.action", {
  trigger: { kind: "action" },
  effects: [{ kind: "revealEncounterCard", player: { kind: "controller" } }],
});
const REVEAL_TOP = stubEvent({ id: "reveal-top", cost: 0, abilities: [REVEAL_ABILITY.ref] });

const depsWith = (limit: AbilityLimit | undefined): EngineDeps => ({
  abilities: { ...depsOf(REVEAL_ABILITY).abilities, [INTERRUPT_ID]: interrupt(limit) },
});
const deps = depsWith(PER_EVENT_PLAYER);

function start(players: 1 | 2 | 3, using: EngineDeps = deps): GameState {
  return gameAtFirstTurn({
    players,
    cards: [RUSH, FILLER, REVEAL_TOP],
    deps: using,
    mainScheme: SCHEME,
    deck: [REVEAL_TOP.id, REVEAL_TOP.id, REVEAL_TOP.id],
    encounter: [...copiesOf(FILLER.id, 30), ...copiesOf(RUSH.id, 6)],
  });
}

/**
 * Stacks the encounter deck for one villain phase, top first: a boost card for each player's activation, a `rush`
 * dealt to each player, then the `filler` each surge reveals. Surgery on the deck's own instances.
 */
function stackedForVillainPhase(state: GameState): GameState {
  const n = state.players.length;
  const deck = activeEncounterDeck(state).deck;
  const of = (card: typeof RUSH) => deck.filter((id) => mustInstance(state, id).cardId === card.id);
  const [fillers, rushes] = [of(FILLER), of(RUSH)];
  const top = [...fillers.slice(0, n), ...rushes.slice(0, n), ...fillers.slice(n, 2 * n)];
  expect(top).toHaveLength(3 * n);
  return withEncounterPiles(state, { deck: [...top, ...deck.filter((id) => !top.includes(id))] });
}

/** Every player ends their turn, in turn order: the villain phase runs through to the next round, the log replayed. */
function villainPhase(state: GameState, using: EngineDeps = deps) {
  const first = state.players.findIndex((p) => p.playerId === state.firstPlayerId);
  const inTurnOrder = state.players.map((_, seat) => state.players[(first + seat) % state.players.length]!);
  const run = runCommands(
    stackedForVillainPhase(state),
    using,
    ...inTurnOrder.map((p) => ({ type: "endTurn" as const, playerId: p.playerId })),
  );
  const replayed = replay(run.session.log, using);
  if (!replayed.ok) throw new Error(replayed.error.message);
  expect(replayed.state).toEqual(run.state);
  return run;
}

const heard = (state: GameState): number => mustInstance(state, state.mainScheme.instanceId).counters.heard ?? 0;
/** How many encounter cards each player revealed, by player. */
const revealedBy = (events: readonly GameEvent[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const event of events)
    if (event.type === "encounterCardRevealed") counts[event.playerId] = (counts[event.playerId] ?? 0) + 1;
  return counts;
};
const recorded = (events: readonly GameEvent[]): number[] =>
  events.flatMap((event) =>
    event.type === "abilityUseRecorded" && event.abilityId === INTERRUPT_ID ? [event.uses] : [],
  );

describe("once per phase per player: counted for the player who reveals", () => {
  it("two players each reveal two treacheries in one villain phase: 2, not 4", () => {
    const run = villainPhase(start(2));
    expect(revealedBy(run.events)).toEqual({ [P1]: 2, [P2]: 2 });
    expect(heard(run.state)).toBe(2);
    // One use recorded under each player's own key, each its first.
    expect(recorded(run.events)).toEqual([1, 1]);
  });

  it("three players each reveal two: 3", () => {
    const run = villainPhase(start(3));
    expect(Object.values(revealedBy(run.events))).toEqual([2, 2, 2]);
    expect(heard(run.state)).toBe(3);
  });

  it("one player reveals two: 1", () => {
    const run = villainPhase(start(1));
    expect(revealedBy(run.events)).toEqual({ [P1]: 2 });
    expect(heard(run.state)).toBe(1);
  });

  it("the same reveals with no limit count every treachery (4), and with an unqualified phase limit only one (1)", () => {
    const unlimited = depsWith(undefined);
    expect(heard(villainPhase(start(2, unlimited), unlimited).state)).toBe(4);
    const shared = depsWith({ count: 1, period: "phase" });
    expect(heard(villainPhase(start(2, shared), shared).state)).toBe(1);
  });
});

describe("the count is the phase's", () => {
  it("in the player phase one player reveals two treacheries (1), then another reveals one (1 more)", () => {
    const state = start(2);
    const first = playFree(state, deps, REVEAL_TOP.id, P1);
    expect(heard(first.state)).toBe(1);
    expect(first.state.abilityUses).toEqual({
      [`${first.state.mainScheme.instanceId}:${INTERRUPT_ID}#eventPlayer:${P1}`]: 1,
    });
    const second = playFree(first.state, deps, REVEAL_TOP.id, P1);
    expect(revealedBy([...first.events, ...second.events])).toEqual({ [P1]: 2 });
    expect(heard(second.state)).toBe(1);
    // Player 2's turn, the same player phase: their own count.
    const passed = runCommands(second.state, deps, { type: "endTurn", playerId: P1 });
    expect(passed.state.step.phase).toBe("player");
    const other = playFree(passed.state, deps, REVEAL_TOP.id, P2);
    expect(heard(other.state)).toBe(2);
    expect(other.state.abilityUses).toEqual({
      [`${state.mainScheme.instanceId}:${INTERRUPT_ID}#eventPlayer:${P1}`]: 1,
      [`${state.mainScheme.instanceId}:${INTERRUPT_ID}#eventPlayer:${P2}`]: 1,
    });
  });

  it("a player who revealed in the player phase reveals again in the villain phase: 1 more for each player", () => {
    const early = playFree(start(2), deps, REVEAL_TOP.id, P1);
    expect(heard(early.state)).toBe(1);
    const round = villainPhase(early.state);
    expect(heard(round.state)).toBe(3);
    // The villain phase's counts are gone with it: the next player phase starts clean.
    expect(round.state.step.phase).toBe("player");
    expect(round.state.abilityUses).toEqual({});
    const next = playFree(round.state, deps, REVEAL_TOP.id, P1);
    expect(heard(next.state)).toBe(4);
  });

  it("two villain phases: 2 each", () => {
    const first = villainPhase(start(2));
    expect(heard(first.state)).toBe(2);
    expect(heard(villainPhase(first.state).state)).toBe(4);
  });
});

describe("the key", () => {
  it("names the event's player, whoever resolves the ability; no event, or no player on it, shares one count", () => {
    const state = start(2);
    const scheme = state.mainScheme.instanceId;
    const definition = interrupt(PER_EVENT_PLAYER);
    const id = abilityId(INTERRUPT_ID);
    const reveal = (playerId: PlayerId) => ({ kind: "encounterCardRevealing", instanceId: scheme, playerId }) as const;
    expect(limitKeyOf(state, scheme, id, definition, reveal(P2), P1)).toBe(`${scheme}:${INTERRUPT_ID}#eventPlayer:p2`);
    expect(limitKeyOf(state, scheme, id, definition, reveal(P1), null)).toBe(
      `${scheme}:${INTERRUPT_ID}#eventPlayer:p1`,
    );
    expect(limitKeyOf(state, scheme, id, definition, null, P1)).toBe(`${scheme}:${INTERRUPT_ID}#eventPlayer:none`);
    const noPlayer = { kind: "placeThreat", schemeInstanceId: scheme, amount: 1, sourceInstanceId: null } as const;
    expect(limitKeyOf(state, scheme, id, definition, noPlayer, P1)).toBe(`${scheme}:${INTERRUPT_ID}#eventPlayer:none`);
  });
});
