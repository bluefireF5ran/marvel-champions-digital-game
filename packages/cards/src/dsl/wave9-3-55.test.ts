import { trait } from "@mc/content";
import { describe, expect, it } from "vitest";
import {
  each,
  eventAmount,
  forcedInterrupt,
  forcedResponse,
  instead,
  on,
  placeThreat,
  query,
  self,
  validateDefinition,
} from "./index.js";

const ENCHANTMENT = trait("ENCHANTMENT");
const ENTHRALLED = trait("ENTHRALLED");

describe("on.countersWouldBePlaced: 'when a counter would be placed' (docs/phase7-wave9.md §3.55; RRG 1.8 'Would' p. 48)", () => {
  it("builds the placement's pattern over the card the counters are bound for", () => {
    expect(on.countersWouldBePlaced("charm", "self")).toEqual({
      on: "countersPlaced",
      eventIs: { counterType: "charm" },
      selfIs: "target",
    });
    expect(on.countersWouldBePlaced("charm")).toEqual({ on: "countersPlaced", eventIs: { counterType: "charm" } });
  });

  it("Prime Real Estate 1B (tt 55004b): a charm counter bound for an Enthralled identity's Enchantment is 1 threat here", () => {
    const ability = forcedInterrupt(
      on.countersWouldBePlaced(
        "charm",
        query("attachment", { trait: ENCHANTMENT, host: each(query("identity", { trait: ENTHRALLED })) }),
      ),
      instead(placeThreat(eventAmount, self)),
    );
    expect(validateDefinition(ability)).toEqual([]);
    expect(ability.trigger).toMatchObject({
      kind: "interrupt",
      forced: true,
      on: {
        on: "countersPlaced",
        eventIs: { counterType: "charm" },
        targetIs: { categories: ["attachment"], trait: "ENCHANTMENT", host: { kind: "each" } },
      },
    });
    expect(ability.effects).toEqual([
      {
        kind: "replaceTriggeringEvent",
        with: [{ kind: "placeThreat", target: { kind: "self" }, amount: { kind: "eventAmount" } }],
      },
    ]);
  });

  it("the same pattern in a response is 'after a counter is placed', as before", () => {
    const after = forcedResponse(on.countersPlaced("charm", "self"), placeThreat(1, self));
    expect(validateDefinition(after)).toEqual([]);
    expect(after.trigger).toMatchObject({ kind: "response", on: { on: "countersPlaced" } });
  });
});
