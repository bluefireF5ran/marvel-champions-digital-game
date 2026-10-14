/**
 * `zoneCountOf(zone, player, filter)`: the cards in a player's hand, deck or discard pile that match a query, as a
 * number, so a predicate can say "your discard pile holds an event with a printed [energy] resource". With the real
 * Wonder Fans 58007 in a real Wonder Man game against Core's Rhino. The script is this test's own (the hero kit's
 * module is scripted elsewhere): the printed ability with its tuck option offered only while it can be done. The
 * engine's `zone-count.test.ts` drives the plain data (each zone, several zones, other players).
 *
 * Wonder Fans: "Alter-Ego Action: Exhaust Wonder Fans → choose: tuck 1 event with a printed [energy] resource from
 * your discard pile under Ionic Physiology; or draw 1 card." RRG 1.8 "Choose (Option)" (p. 12): an option that cannot
 * be done is not chosen.
 */

import { applyCommand, type AbilityDefinition, type EngineDeps, type GameState, type InstanceId } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import {
  allOf,
  alterEgoAction,
  cards,
  chooseCards,
  chooseOne,
  chosen,
  draw,
  exhaustThis,
  named,
  option,
  query,
  tuckCards,
  tuckedCount,
  validateDefinition,
  valueAtLeast,
  valueAtMost,
  you,
  zone,
  zoneCountOf,
} from "./index.js";
import {
  P1,
  firstLegal,
  inst,
  instancesOf,
  moveToHand,
  patchInstance,
  playerOf,
  settle,
  use,
} from "../testing/harness.js";
import { wonderManGame } from "../wave10/testing.js";
import { depsWith } from "./wave10-labor.testing.js";

vi.setConfig({ testTimeout: 120_000 });

const WONDER_FANS = "58007";
const ACTION = "58007.wonder-fans-action";
const IONIC_PHYSIOLOGY_CARD = "58002";
const IONIC_BLAST = "58004"; // an event with a printed [energy]
const BENEVOLENCE = "58016"; // an event with a printed [physical]
const ENERGY = "58023"; // a resource card with printed [energy]

const IONIC_PHYSIOLOGY = named("Ionic Physiology");
const ENERGY_EVENT = query("event", { printedResource: "energy" });
const HAS_ROOM = valueAtMost(tuckedCount(IONIC_PHYSIOLOGY), 2);
const AN_ENERGY_EVENT_DISCARDED = valueAtLeast(zoneCountOf("discard", you, ENERGY_EVENT), 1);

const SCRIPTS: Readonly<Record<string, AbilityDefinition>> = {
  [ACTION]: alterEgoAction(
    { cost: exhaustThis },
    chooseOne(
      option(
        "Tuck 1 event with a printed energy resource from your discard pile under Ionic Physiology",
        { when: allOf(HAS_ROOM, AN_ENERGY_EVENT_DISCARDED) },
        chooseCards("tuck", zone("discard", undefined, { filter: ENERGY_EVENT }), { min: 1, max: 1 }),
        tuckCards(cards(chosen("tuck")), IONIC_PHYSIOLOGY),
      ),
      option("Draw 1 card", draw(1)),
    ),
  ),
};
const DEPS: EngineDeps = depsWith(SCRIPTS);

/** Wonder Man in alter-ego form with Wonder Fans in play and exactly `discard` in his discard pile. */
function staged(...discard: readonly string[]) {
  const given = moveToHand(wonderManGame({ deps: DEPS }), P1, WONDER_FANS, ...discard);
  const [fans, ...discarded] = given.ids as [InstanceId, ...InstanceId[]];
  const moved = [fans, ...discarded];
  const state: GameState = patchInstance(
    {
      ...given.state,
      players: given.state.players.map((p) =>
        p.playerId === P1
          ? {
              ...p,
              hand: p.hand.filter((id) => !moved.includes(id)),
              deck: [...p.deck, ...p.discard],
              discard: discarded,
              playArea: [...p.playArea, fans],
            }
          : p,
      ),
    },
    fans,
    { faceup: true, controllerId: P1 },
  );
  return { state, fans, discarded, command: use(P1, fans, ACTION) };
}
const tucked = (state: GameState): readonly InstanceId[] =>
  inst(state, instancesOf(state, IONIC_PHYSIOLOGY_CARD)[0]!).tucked;
/** The state as the ability's first choice is asked, or settled when it asks nothing. */
function begun(state: GameState, command: ReturnType<typeof use>): GameState {
  const result = applyCommand(state, command, DEPS);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.state;
}
const labels = (state: GameState): string[] => (state.pendingChoice?.options ?? []).map((o) => String(o.label));

describe("zoneCountOf: the builder", () => {
  it("builds a count of one zone or several, for a player, with an optional query", () => {
    expect(zoneCountOf("discard", you, ENERGY_EVENT)).toEqual({
      kind: "zoneCount",
      zone: "discard",
      player: you,
      filter: ENERGY_EVENT,
    });
    expect(zoneCountOf(["deck", "discard"])).toEqual({ kind: "zoneCount", zone: ["deck", "discard"], player: you });
    expect(validateDefinition(SCRIPTS[ACTION]!)).toEqual([]);
  });
});

describe("Wonder Fans: the tuck option is offered only while the discard pile holds an eligible event", () => {
  it("a [physical] event and an [energy] resource card there: nothing is asked, 1 card is drawn, nothing tucked", () => {
    const at = staged(BENEVOLENCE, ENERGY);
    const hand = playerOf(at.state, P1).hand.length;
    const state = begun(at.state, at.command);
    expect(labels(state).some((label) => label.startsWith("Tuck"))).toBe(false);
    const done = settle(state, firstLegal, (s) => !s.pendingChoice, DEPS);
    expect(playerOf(done, P1).hand).toHaveLength(hand + 1);
    expect(tucked(done)).toEqual([]);
    expect(playerOf(done, P1).discard).toEqual(expect.arrayContaining([...at.discarded]));
    expect(inst(done, at.fans).exhausted).toBe(true);
  });

  it("an empty discard pile: the same", () => {
    const at = staged();
    expect(labels(begun(at.state, at.command)).some((label) => label.startsWith("Tuck"))).toBe(false);
  });

  it("an [energy] event there: both options are offered, and tucking takes it", () => {
    const at = staged(BENEVOLENCE, IONIC_BLAST);
    const blast = at.discarded[1]!;
    const state = begun(at.state, at.command);
    expect(labels(state)).toEqual([
      "Tuck 1 event with a printed energy resource from your discard pile under Ionic Physiology",
      "Draw 1 card",
    ]);
    const done = settle(state, firstLegal, (s) => !s.pendingChoice, DEPS);
    expect(tucked(done)).toEqual([blast]);
    expect(playerOf(done, P1).discard).not.toContain(blast);
  });

  it("an [energy] event there but 3 cards already tucked: only drawing", () => {
    const at = staged(IONIC_BLAST);
    const held = playerOf(at.state, P1).deck.slice(0, 3);
    const full = patchInstance(
      {
        ...at.state,
        players: at.state.players.map((p) =>
          p.playerId === P1 ? { ...p, deck: p.deck.filter((id) => !held.includes(id)) } : p,
        ),
      },
      instancesOf(at.state, IONIC_PHYSIOLOGY_CARD)[0]!,
      { tucked: held },
    );
    expect(labels(begun(full, at.command)).some((label) => label.startsWith("Tuck"))).toBe(false);
  });
});
