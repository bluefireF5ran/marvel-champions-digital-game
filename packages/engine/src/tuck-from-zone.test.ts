/**
 * docs/phase7-wave10-hero-packs.md §H3.12: `CardSelector ref.ownerZone`, a tuck that takes the card it names from a
 * zone. Synthetic cards shaped like Ionic Physiology (`wonder_man` 58002, as errata'd, RRG 1.8 p. 70): "Max 3 cards
 * tucked here. Response: After you play an event with a printed [energy] resource, tuck that event from your discard
 * pile under this card. Then, heal 1 damage from your identity."
 *
 * RRG 1.8 "Target" (p. 42): an ability that requires a target "can only be initiated if it has at least one valid
 * target"; "'Then'" (p. 44): "If the pre-'then' text of an effect does not fully resolve, the post-'then' text does not
 * attempt to resolve." The Wonder Man insert, clarification 1, and ruling March 6, 2026 (4), step 3 ("trigger Ionic
 * Physiology to tuck Leading Blow (if under 3 cards)") for the limit.
 */

import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { applyCommand } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { locateCard, mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { stubEvent, stubSupport } from "./testing/fixtures.js";
import { defaultPick, giveCard } from "./testing/scenario.js";
import { gameAtFirstTurn, P1, playerCardIntoPlay } from "./testing/wave3.js";

const self: TargetRef = { kind: "self" };
const n = (value: number) => ({ kind: "const", value }) as const;
const played: TargetRef = { kind: "eventTarget" };
const tally: EffectSpec = { kind: "addCounters", target: self, counterType: "tally", amount: n(1) };
const afterYouPlayAnEvent = {
  kind: "response",
  forced: false,
  on: { on: "cardPlayed", targetIs: { categories: ["event"] }, playerIs: "controller" },
} as const;

/** "Max 3 cards tucked here." */
const DESK_LIMIT = stubAbility("desk.constant", {
  trigger: { kind: "constant", rules: [{ kind: "tuckLimit", card: { self: true }, max: n(3) }] },
  effects: [],
});
/** "Response: After you play an event, tuck that event from your discard pile under this card. Then, tally 1 here." */
const DESK_RESPONSE = stubAbility("desk.response", {
  trigger: afterYouPlayAnEvent,
  effects: [
    { kind: "tuckCards", cards: { kind: "ref", ref: played, ownerZone: "discard" }, under: self },
    { kind: "then", effects: [tally] },
  ],
});
const DESK = stubSupport({ id: "desk", cost: 0, abilities: [DESK_LIMIT.ref, DESK_RESPONSE.ref] });
/** "Forced Response: After you play an event, shuffle that event into your deck." It takes the event out of the pile. */
const RECYCLER_RESPONSE = stubAbility("recycler.response", {
  trigger: { ...afterYouPlayAnEvent, forced: true },
  effects: [{ kind: "moveCards", cards: { kind: "ref", ref: played }, to: "deckShuffle" }],
});
const RECYCLER = stubSupport({ id: "recycler", cost: 0, abilities: [RECYCLER_RESPONSE.ref] });
/** "Action: Draw 1 card." */
const NOTE_ACTION = stubAbility("note.action", {
  trigger: { kind: "action" },
  effects: [{ kind: "draw", player: { kind: "controller" }, amount: n(1) }],
});
const NOTE = stubEvent({ id: "note", cost: 0, abilities: [NOTE_ACTION.ref] });

const deps: EngineDeps = depsOf(DESK_LIMIT, DESK_RESPONSE, RECYCLER_RESPONSE, NOTE_ACTION);

interface Table {
  readonly state: GameState;
  readonly desk: InstanceId;
}
/** A one-player game with the desk in play and `held` notes already tucked under it (surgery). */
function table(held = 0, recycler = false): Table {
  let state = gameAtFirstTurn({
    cards: [DESK, RECYCLER, NOTE],
    deps,
    deck: [DESK.id, RECYCLER.id, ...Array.from({ length: 6 }, () => NOTE.id)],
  });
  const placed = playerCardIntoPlay(state, DESK.id);
  state = placed.state;
  if (recycler) state = playerCardIntoPlay(state, RECYCLER.id).state;
  const tucked: InstanceId[] = [];
  for (let i = 0; i < held; i++) {
    const given = giveCard(state, P1, NOTE.id, tucked);
    tucked.push(given.id);
    state = {
      ...given.state,
      players: given.state.players.map((p) => ({ ...p, hand: p.hand.filter((id) => id !== given.id) })),
    };
  }
  state = { ...state, instances: { ...state.instances, [placed.id]: { ...mustInstance(state, placed.id), tucked } } };
  return { state, desk: placed.id };
}
const under = (state: GameState, host: InstanceId) => mustInstance(state, host).tucked;
const tallies = (state: GameState, id: InstanceId) => mustInstance(state, id).counters.tally ?? 0;
const unresolved = (events: readonly GameEvent[]) =>
  events.flatMap((e) => (e.type === "preThenUnresolved" ? [e.cause] : []));
const offersDesk = (state: GameState): boolean =>
  state.pendingChoice?.prompt.kind === "chooseTriggers" &&
  state.pendingChoice.options.some((o) => JSON.stringify(o).includes(DESK_RESPONSE.ref.id));

/**
 * Plays a note and answers every choice: the desk's Response is taken (after `before` has changed the state, when
 * given), anything else by default. Reports whether the Response was offered and where the note was when it was.
 */
function playNote(t: Table, before?: (state: GameState, note: InstanceId) => GameState) {
  const given = giveCard(t.state, P1, NOTE.id, under(t.state, t.desk));
  const events: GameEvent[] = [];
  let offeredFrom: string | null | undefined;
  let state = given.state;
  const apply = (command: Command): void => {
    const result = applyCommand(state, command, deps);
    if (!result.ok) throw new Error(`${command.type} rejected: ${result.error.message}`);
    state = result.state;
    events.push(...result.events);
  };
  apply({ type: "playCard", playerId: P1, cardInstanceId: given.id, payment: [], attachToInstanceId: null });
  for (let guard = 0; state.pendingChoice; guard++) {
    if (guard > 20) throw new Error("choices did not settle");
    const choice = state.pendingChoice;
    let selected = defaultPick(state);
    if (offersDesk(state)) {
      offeredFrom = locateCard(state, given.id)?.kind ?? null;
      selected = choice.options.filter((o) => JSON.stringify(o).includes(DESK_RESPONSE.ref.id)).map((o) => o.optionId);
      if (before) state = before(state, given.id);
    }
    apply({
      type: "resolveChoice",
      playerId: choice.playerId,
      choiceId: choice.choiceId,
      selectedOptionIds: selected as never,
    });
  }
  return { state, events, note: given.id, offeredFrom };
}

describe("§H3.12 `CardSelector ref.ownerZone`: tuck that event from your discard pile", () => {
  it("the event is in its owner's discard pile when the Response is offered, and is tucked from there; then the tally", () => {
    const t = table();
    const { state, events, note, offeredFrom } = playNote(t);
    expect(offeredFrom).toBe("discard");
    expect(under(state, t.desk)).toEqual([note]);
    expect(mustPlayer(state, P1).discard).not.toContain(note);
    expect(tallies(state, t.desk)).toBe(1);
    expect(unresolved(events)).toEqual([]);
  });

  it("an event that left the discard pile before the Response resolves is not tucked, and the Then is not attempted", () => {
    const t = table();
    // Between the Response being chosen and its tuck, the note is shuffled into the deck (surgery).
    const intoDeck = (state: GameState, note: InstanceId): GameState => ({
      ...state,
      players: state.players.map((p) => ({
        ...p,
        discard: p.discard.filter((id) => id !== note),
        deck: [note, ...p.deck],
      })),
    });
    const { state, events, note, offeredFrom } = playNote(t, intoDeck);
    expect(offeredFrom).toBe("discard");
    expect(under(state, t.desk)).toEqual([]);
    expect(mustPlayer(state, P1).deck).toContain(note);
    expect(unresolved(events)).toEqual(["tuckNamedNoCard"]);
    expect(events.filter((e) => e.type === "thenSkipped")).toHaveLength(1);
    expect(tallies(state, t.desk)).toBe(0);
  });

  it("an event another ability already took out of the discard pile: the Response is not offered", () => {
    const t = table(0, true);
    const { state, note, offeredFrom } = playNote(t);
    expect(offeredFrom).toBeUndefined();
    expect(mustPlayer(state, P1).deck).toContain(note);
    expect(under(state, t.desk)).toEqual([]);
    expect(tallies(state, t.desk)).toBe(0);
  });

  it("the limit still holds with the zone named: at 2 of 3 the third is tucked, and a fourth is not offered", () => {
    const t = table(2);
    const third = playNote(t);
    expect(third.offeredFrom).toBe("discard");
    expect(under(third.state, t.desk)).toHaveLength(3);
    expect(tallies(third.state, t.desk)).toBe(1);
    const fourth = playNote({ state: third.state, desk: t.desk });
    expect(fourth.offeredFrom).toBeUndefined();
    expect(under(fourth.state, t.desk)).toHaveLength(3);
    expect(mustPlayer(fourth.state, P1).discard).toContain(fourth.note);
    expect(tallies(fourth.state, t.desk)).toBe(1);
  });

  it("the state with the selector's guard survives a serialization round trip", () => {
    const t = table(1);
    const loaded = JSON.parse(JSON.stringify(t.state)) as GameState;
    expect(loaded).toEqual(t.state);
    const { state } = playNote({ state: loaded, desk: t.desk });
    expect(under(state, t.desk)).toHaveLength(2);
  });
});
