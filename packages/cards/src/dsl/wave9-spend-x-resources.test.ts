/**
 * `spendXResources`: "you may spend X [mental] resources to prevent X of that threat and remove X secret counters"
 * (Battle of Wits, `aos` 50175; A.I.M. Interference 50184). The engine's `spend-x-resources.test.ts` drives the plain
 * data; the real cards are in `wave9/aos/baron-zemo-encounter.test.ts` and `executive-board.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { whenRevealed } from "./abilities.js";
import { chooseOne, draw, ifThen, option, spendResources, spendXResources } from "./effects.js";
import { validateDefinition } from "./validate.js";
import { eventAmount, firstPlayer, made, varOf } from "./values.js";

describe("`spendXResources`", () => {
  it("builds a spend whose X the player sets, up to a live cap, and binds <bind>.amount and <bind>.made", () => {
    const effect = spendXResources({ mental: 1 }, eventAmount, "paid");
    expect(effect).toEqual({
      kind: "spendResources",
      player: { kind: "controller" },
      resources: { mental: 1 },
      bind: "paid",
      x: { max: { kind: "eventAmount" } },
    });
    const definition = whenRevealed(effect, ifThen(made("paid"), draw(varOf("paid.amount"))));
    expect(validateDefinition(definition)).toEqual([]);
  });

  it("takes a constant cap and another player", () => {
    expect(spendXResources({ energy: 1 }, 3, "paid", firstPlayer)).toMatchObject({
      player: { kind: "firstPlayer" },
      x: { max: { kind: "const", value: 3 } },
    });
  });

  it("inside a chooseOne option it is not made a required spend: X of 0 stays the player's to choose", () => {
    const choice = chooseOne(
      option("Bargain", spendXResources({ mental: 1 }, 2, "paid")),
      option("Pay", spendResources({ mental: 1 }, "flat")),
    );
    if (choice.kind !== "chooseOne") throw new Error("not a chooseOne");
    expect(choice.options[0]!.effects[0]).not.toHaveProperty("required");
    expect(choice.options[1]!.effects[0]).toHaveProperty("required", true);
  });

  it("is refused with a price of nothing, with required, and with distinctTypes", () => {
    const free = whenRevealed(spendXResources({}, 2, "paid"));
    expect(validateDefinition(free)).toContain(
      "spendResources x: resources is the price of one and must ask for at least 1 resource",
    );
    const forced = whenRevealed({ ...spendXResources({ mental: 1 }, 2, "paid"), required: true } as never);
    expect(validateDefinition(forced)).toContain(
      "spendResources x: not with required (X of 0 is the player's to choose)",
    );
    const typed = whenRevealed({ ...spendXResources({ generic: 1 }, 2, "paid"), distinctTypes: 2 } as never);
    expect(validateDefinition(typed)).toContain("spendResources x: not with distinctTypes");
  });
});
