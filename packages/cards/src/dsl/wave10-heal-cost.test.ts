/**
 * docs/phase7-wave10-hero-packs.md H3.17 (engine task HT14): `healCost(q, n, { bind })`, with the real Battlefield
 * Benevolence 58016 in a real Wonder Man game against Core's Rhino. The script is this test's own; the pack's Justice
 * module is scripted elsewhere. The engine's `heal-character-cost.test.ts` drives the plain data (several candidates,
 * a stalwart enemy, an enemy that cannot be healed).
 *
 * Battlefield Benevolence: "Hero Action: Heal 2 damage from an enemy → confuse that enemy." RRG 1.8 "Cost" (p. 14):
 * "An ability's cost cannot be paid if that ability's effect requires one or more targets and there is not at least
 * one valid target"; "Target" (p. 43): "The cost of an ability or game function is not considered when determining if
 * that ability or game function can affect a target."
 */

import { applyCommand, legalActions, type AbilityDefinition, type EngineDeps, type GameState } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import {
  canTakeStatus,
  chosen,
  giveStatus,
  healCost,
  heroAction,
  interrupt,
  on,
  query,
  validateDefinition,
} from "./index.js";
import { P1, firstLegal, inst, moveToHand, patchInstance, play, playerOf, settle } from "../testing/harness.js";
import { wonderManHeroGame } from "../wave10/testing.js";
import { depsWith } from "./wave10-labor.testing.js";

vi.setConfig({ testTimeout: 120_000 });

const BATTLEFIELD_BENEVOLENCE = "58016";
const ACTION = "58016.battlefield-benevolence-action";
const CONFUSABLE_ENEMY = { ...query("enemy"), ...canTakeStatus("confused") };

const SCRIPTS: Readonly<Record<string, AbilityDefinition>> = {
  [ACTION]: heroAction({ cost: healCost(CONFUSABLE_ENEMY, 2) }, giveStatus(chosen("healed"), "confused")),
};
const DEPS: EngineDeps = depsWith(SCRIPTS);

/** Wonder Man in hero form with the event in hand and `damage` on Rhino. */
function staged(damage: number) {
  const base = wonderManHeroGame({ deps: DEPS });
  const given = moveToHand(base, P1, BATTLEFIELD_BENEVOLENCE);
  const villain = given.state.villains[0]!.instanceId;
  return { state: patchInstance(given.state, villain, { damage }), event: given.ids[0]!, villain };
}
/** Plays the event paying its cost of 1 with another card from hand; the refusal code when it is refused. */
function played(state: GameState, event: ReturnType<typeof staged>["event"]) {
  const payer = playerOf(state, P1).hand.find((id) => id !== event);
  if (!payer) throw new Error("no other card in hand to pay with");
  const result = applyCommand(state, play(P1, event, [payer]), DEPS);
  if (!result.ok) return { ok: false as const, code: result.error.code };
  return { ok: true as const, state: settle(result.state, firstLegal, (s) => !s.pendingChoice, DEPS) };
}
const offers = (state: GameState, event: ReturnType<typeof staged>["event"]): boolean => {
  const legal = legalActions(state, P1, DEPS);
  if (legal.kind !== "turn") throw new Error(`expected a turn, got ${legal.kind}`);
  return legal.legal.some((a) => a.example.type === "playCard" && a.example.cardInstanceId === event);
};

describe("H3.17 the builder", () => {
  it("builds a heal cost on a picked character, bound to 'healed' unless a slot is named", () => {
    expect(healCost(CONFUSABLE_ENEMY, 2)).toEqual({
      healCharacter: { slot: "healed", query: { categories: ["enemy"], canTakeStatus: "confused" }, amount: 2 },
    });
    expect(healCost(query("enemy"), 1, { bind: "foe" }).healCharacter?.slot).toBe("foe");
    expect(validateDefinition(SCRIPTS[ACTION]!)).toEqual([]);
  });

  it("the effects may name the healed character only through the cost's slot", () => {
    const wrongSlot = heroAction(
      { cost: healCost(query("enemy"), 2, { bind: "foe" }) },
      giveStatus(chosen("healed"), "confused"),
    );
    expect(validateDefinition(wrongSlot)).not.toEqual([]);
  });

  it("the validator refuses an amount below 1, an empty slot, and a heal cost outside an action", () => {
    const refusals = (definition: AbilityDefinition) => validateDefinition(definition).join("\n");
    expect(refusals(heroAction({ cost: healCost(query("enemy"), 0) }))).toContain(
      "cost healCharacter: amount must be a whole number of at least 1",
    );
    expect(refusals(heroAction({ cost: healCost(query("enemy"), 2, { bind: "" }) }))).toContain(
      "cost healCharacter: needs a slot for the character healed",
    );
    expect(refusals(interrupt(on.youPlayThis(), { cost: healCost(query("enemy"), 2) }))).toContain(
      "cost healCharacter: only on an action",
    );
  });
});

describe("H3.17 Battlefield Benevolence 58016: heal 2 damage from an enemy → confuse that enemy", () => {
  it("Rhino with 5 damage: 3 are left and he is confused", () => {
    const table = staged(5);
    expect(offers(table.state, table.event)).toBe(true);
    const after = played(table.state, table.event);
    if (!after.ok) throw new Error(`refused: ${after.code}`);
    expect(inst(after.state, table.villain)).toMatchObject({ damage: 3, statuses: { confused: 1 } });
    expect(playerOf(after.state, P1).discard).toContain(table.event);
  });

  it("Rhino with 1 damage only: the event cannot be played, and nothing is paid", () => {
    const table = staged(1);
    expect(offers(table.state, table.event)).toBe(false);
    const after = played(table.state, table.event);
    expect(after).toEqual({ ok: false, code: "no_valid_target" });
    expect(inst(table.state, table.villain).damage).toBe(1);
  });

  it("an undamaged enemy and an already confused one are no candidates", () => {
    expect(offers(staged(0).state, staged(0).event)).toBe(false);
    const table = staged(5);
    const confused = patchInstance(table.state, table.villain, { statuses: { stunned: 0, confused: 1, tough: 0 } });
    expect(offers(confused, table.event)).toBe(false);
    expect(played(confused, table.event)).toEqual({ ok: false, code: "no_valid_target" });
  });
});
