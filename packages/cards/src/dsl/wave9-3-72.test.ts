/**
 * `cannotMakeBasicAttacks` (docs/phase7-wave9.md §3.72): "Attach to your identity. You cannot make basic attacks or
 * play Attack events." (Seduced, `tt` 55015.) The engine's `cannot-attack-basic-only.test.ts` drives the plain data.
 */

import { describe, expect, it } from "vitest";
import { cannotMakeBasicAttacks, constant } from "./abilities.js";
import { validateDefinition } from "./validate.js";
import { query } from "./values.js";

describe("`cannotMakeBasicAttacks`", () => {
  it("forbids the basic attacks of the card this one is attached to, against every enemy", () => {
    expect(cannotMakeBasicAttacks()).toEqual({
      rules: [
        { kind: "cannotAttack", attacker: { hostOfSelf: true }, target: { categories: ["enemy"] }, basicOnly: true },
      ],
    });
    expect(validateDefinition(constant(cannotMakeBasicAttacks()))).toEqual([]);
  });

  it("takes another attacker and a condition", () => {
    const part = cannotMakeBasicAttacks(query("ally", { controller: "you" }), { while: { kind: "always" } as never });
    expect(part.rules?.[0]).toMatchObject({
      kind: "cannotAttack",
      attacker: { categories: ["ally"], controller: "you" },
      basicOnly: true,
      while: { kind: "always" },
    });
  });
});
