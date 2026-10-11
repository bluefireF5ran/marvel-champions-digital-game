/**
 * "This group", "a group in your pod", "each group in your pod" (docs/phase7-wave9.md §3.67): the Fading Figments
 * (55029b–55032b), Laufey 55044 and its three siblings, The Mangog 55041 and Door Between Worlds 55046, `tt`. The
 * engine's `group-selector.test.ts` drives the plain data.
 */

import { describe, expect, it } from "vitest";
import { trait } from "@mc/content";
import { constant, reachableFromPod, whenDefeated, whenRevealed } from "./abilities.js";
import { addCounters, chooseGroup, chooseTarget, eachGroupInPod, inGroup } from "./effects.js";
import { validateDefinition } from "./validate.js";
import { chosen, chosenGroup, each, eventTarget, groupPlayerCount, query, theVillain, thisGroup } from "./values.js";

const FRONT = each(query("environment", { name: "Unified Front" }));

describe("`chooseGroup`, `inGroup`, `eachGroupInPod`, `groupPlayerCount`", () => {
  it("a Fading Figment's second sentence", () => {
    const second = [chooseGroup(), inGroup(chosenGroup(), addCounters("synergy", groupPlayerCount(), FRONT))];
    expect(second).toEqual([
      { kind: "chooseGroup", chooser: { kind: "firstPlayer" }, among: "inPod", bind: "group" },
      {
        kind: "inGroup",
        group: { var: "group" },
        effects: [
          {
            kind: "addCounters",
            target: FRONT,
            counterType: "synergy",
            amount: { kind: "groupPlayerCount", group: "self" },
          },
        ],
      },
    ]);
    expect(validateDefinition(whenRevealed(...second))).toEqual([]);
  });

  it("The Mangog's When Defeated: every group, their villain, one of their environments", () => {
    const definition = whenDefeated(
      eachGroupInPod(
        addCounters("shatter", 3, theVillain),
        chooseTarget("theirs", query("environment", { trait: trait("SYNERGY") })),
        addCounters("synergy", 1, chosen("theirs")),
      ),
    );
    expect(definition.effects[0]).toMatchObject({ kind: "inGroup", group: "eachInPod" });
    expect(validateDefinition(definition)).toEqual([]);
    expect(thisGroup).toBe("self");
    expect(validateDefinition(whenDefeated(inGroup(thisGroup, addCounters("shatter", 3, theVillain))))).toEqual([]);
  });

  it("the validator refuses a block that reads a slot, a var or the event of the ability around it", () => {
    const outerSlot = whenDefeated(
      chooseTarget("outer", query("environment")),
      chooseGroup(),
      inGroup(chosenGroup(), addCounters("synergy", 1, chosen("outer"))),
    );
    expect(validateDefinition(outerSlot)).toEqual([
      'effects[2] inGroup/0[0] addCounters: slot "outer" is read before it is bound',
    ]);
    const outerVar = whenDefeated(
      chooseGroup(),
      inGroup(thisGroup, addCounters("synergy", groupPlayerCount(chosenGroup()), FRONT)),
    );
    expect(validateDefinition(outerVar)).toEqual([
      'effects[1] inGroup/0[0] addCounters: group "group" is read before chooseGroup binds it',
    ]);
    const event = whenDefeated(eachGroupInPod(addCounters("synergy", 1, eventTarget)));
    expect(validateDefinition(event)).toEqual([
      "effects[0] inGroup: a block resolved in a group's area cannot read the triggering event",
    ]);
  });

  it("refuses a group nothing chose, an empty block and a block inside a block", () => {
    expect(validateDefinition(whenDefeated(inGroup(chosenGroup(), addCounters("synergy", 1, FRONT))))).toEqual([
      'effects[0] inGroup: group "group" is read before chooseGroup binds it',
    ]);
    expect(validateDefinition(whenDefeated(eachGroupInPod()))).toEqual([
      "effects[0] inGroup: inGroup resolves no effects",
    ]);
    expect(
      validateDefinition(whenDefeated(eachGroupInPod(inGroup(thisGroup, addCounters("synergy", 1, FRONT))))),
    ).toContain("effects[0] inGroup: a block resolved in a group's area cannot name another group");
  });
});

describe("`reachableFromPod`", () => {
  it("builds the rule on this card for an attack or a thwart", () => {
    expect(reachableFromPod("attack")).toEqual({
      rules: [{ kind: "reachableFromPod", card: { self: true }, by: "attack" }],
    });
    expect(reachableFromPod("thwart").rules?.[0]).toMatchObject({ by: "thwart" });
    expect(validateDefinition(constant(reachableFromPod("attack")))).toEqual([]);
  });
});
