/**
 * The pod's shared villain and shared scheme (docs/phase7-wave9.md §3.66): damage to Loki, God of Lies (the Shatter
 * the Illusion card, step 1), threat on Worlds Collide (Mischief and Mayhem 1B, 55033b), and the two neutral cards'
 * own lines (55027b, 55028b), `tt`. The engine's `shared-villain-event.test.ts` and `shared-scheme-event.test.ts`
 * drive the plain data.
 */

import { describe, expect, it } from "vitest";
import { POD_MOMENT } from "@mc/engine";
import { forcedResponse, on, whenRevealed } from "./abilities.js";
import { damageSharedVillain, endGame, placeThreatOnSharedScheme, removeEachCounterFrom } from "./effects.js";
import { validateDefinition } from "./validate.js";
import { self, varOf } from "./values.js";

describe("`damageSharedVillain` and `placeThreatOnSharedScheme`", () => {
  it("build a shared event of each kind", () => {
    expect(damageSharedVillain(7)).toEqual({
      kind: "sharedEvent",
      event: "villainDamaged",
      amount: { kind: "const", value: 7 },
    });
    expect(placeThreatOnSharedScheme(1, "identityDefeated")).toEqual({
      kind: "sharedEvent",
      event: "schemeThreatPlaced",
      amount: { kind: "const", value: 1 },
      cause: "identityDefeated",
    });
  });

  it("take a computed amount: the number of counters removed this way", () => {
    const effect = damageSharedVillain(varOf("shattered.amount"));
    expect(effect).toMatchObject({ kind: "sharedEvent", amount: { kind: "var", name: "shattered.amount" } });
    expect(
      validateDefinition(whenRevealed(removeEachCounterFrom(self, "shatter", { bind: "shattered" }), effect)),
    ).toEqual([]);
  });

  it("the validator refuses a constant amount below 1 and a cause in the wrong place", () => {
    expect(validateDefinition(whenRevealed(damageSharedVillain(0)))).toEqual([
      "sharedEvent: a constant amount must be a whole number of at least 1",
    ]);
    expect(
      validateDefinition(
        whenRevealed({ kind: "sharedEvent", event: "schemeThreatPlaced", amount: { kind: "const", value: 1 } }),
      ),
    ).toEqual(["sharedEvent: threat on the shared scheme names its cause; use placeThreatOnSharedScheme"]);
    expect(
      validateDefinition(
        whenRevealed({
          kind: "sharedEvent",
          event: "villainDamaged",
          amount: { kind: "const", value: 1 },
          cause: "schemeCompleted",
        }),
      ),
    ).toEqual(["sharedEvent: damage to the shared villain has no cause"]);
  });
});

describe("the neutral cards' own lines", () => {
  it("answer the engine's pod moments by name, for any player", () => {
    expect(on.sharedVillainDefeated()).toEqual({
      on: "momentRaised",
      eventIs: { name: POD_MOMENT.sharedVillainDefeated },
    });
    expect(on.sharedVillainFlipped()).toEqual({
      on: "momentRaised",
      eventIs: { name: POD_MOMENT.sharedVillainFlipped },
    });
    expect(on.sharedSchemeCompleted()).toEqual({
      on: "momentRaised",
      eventIs: { name: POD_MOMENT.sharedSchemeCompleted },
    });
  });

  it("are valid forced responses that end the game", () => {
    const win = forcedResponse(on.sharedVillainDefeated(), endGame("win"));
    const loss = forcedResponse(on.sharedSchemeCompleted(), endGame("loss"));
    expect(validateDefinition(win)).toEqual([]);
    expect(validateDefinition(loss)).toEqual([]);
    expect(loss.effects).toEqual([{ kind: "endGame", result: "loss", reason: "cardAbility" }]);
  });
});
