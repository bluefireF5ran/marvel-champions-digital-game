/**
 * `enemyScheme(..., { wouldPlaceThreat })`: "[Enemy] schemes. If this activation would place any threat on the main
 * scheme, you may spend X [type] resources to prevent X of that threat and …" (Battle of Wits, `aos` 50175). The
 * engine's `scheme-would-place-threat.test.ts` drives the plain data these builders emit.
 */

import { describe, expect, it } from "vitest";
import { whenRevealed } from "./abilities.js";
import {
  chooseNumber,
  chooseOne,
  chooseTarget,
  dealDamage,
  enemyScheme,
  option,
  preventThreat,
  removeCountersAmong,
  repeatTimes,
  spendResources,
} from "./effects.js";
import { validateDefinition } from "./validate.js";
import { chosen, eventAmount, firstPlayer, query, theVillain, varOf, you } from "./values.js";

const ENVIRONMENTS = query("environment", { hasCounter: "secret" });

/** The shape handed to the scripting of 50175: one resource, one threat and one counter at a time. */
const payToPrevent = repeatTimes(
  eventAmount,
  chooseOne(
    option(
      "Spend 1 [mental] resource to prevent 1 threat and remove 1 secret counter",
      spendResources({ mental: 1 }, "paid", you, { required: true }),
      preventThreat(1),
      removeCountersAmong("secret", 1, ENVIRONMENTS, { chooser: firstPlayer }),
    ),
    option("Spend no more"),
  ),
);

describe("`enemyScheme` with `wouldPlaceThreat`", () => {
  it("emits the effects as one flat list on the effect, and nothing without the option", () => {
    const prevent = preventThreat(1);
    const number = chooseNumber("x", eventAmount);
    expect(enemyScheme(theVillain, { wouldPlaceThreat: [number, [prevent]] })).toEqual({
      kind: "enemyScheme",
      enemies: theVillain,
      wouldPlaceThreat: [number, prevent],
    });
    expect(enemyScheme(theVillain, { against: you })).toEqual({
      kind: "enemyScheme",
      enemies: theVillain,
      against: you,
    });
  });

  it("validates on a When Revealed ability: the pay-to-prevent loop and a chosen number are both clean", () => {
    expect(validateDefinition(whenRevealed(enemyScheme(theVillain, { wouldPlaceThreat: [payToPrevent] })))).toEqual([]);
    expect(
      validateDefinition(
        whenRevealed(
          enemyScheme(theVillain, {
            wouldPlaceThreat: [chooseNumber("x", eventAmount), preventThreat(varOf("x.amount"))],
          }),
        ),
      ),
    ).toEqual([]);
  });

  it("validates: the list is not empty, and what it binds is not read by the effects after the scheme", () => {
    expect(validateDefinition(whenRevealed(enemyScheme(theVillain, { wouldPlaceThreat: [] }))).join("\n")).toMatch(
      /wouldPlaceThreat resolves no effects/,
    );
    const leaked = validateDefinition(
      whenRevealed(
        enemyScheme(theVillain, { wouldPlaceThreat: [chooseTarget("pick", query("minion"))] }),
        dealDamage(1, chosen("pick")),
      ),
    );
    expect(leaked.join("\n")).toMatch(/pick/);
    // Read inside the list, the slot is bound.
    expect(
      validateDefinition(
        whenRevealed(
          enemyScheme(theVillain, {
            wouldPlaceThreat: [chooseTarget("pick", query("minion")), dealDamage(1, chosen("pick"))],
          }),
        ),
      ),
    ).toEqual([]);
  });
});
