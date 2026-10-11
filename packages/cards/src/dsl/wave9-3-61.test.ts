/**
 * `counterLimit` (docs/phase7-wave9.md §3.61): "Permanent. Max 1 [per player] synergy counters here." (Domineering
 * Force 55052, Feigned Retreat 55053, Mounting Resistance 55054, Unified Front 55055, `tt`.) The engine's
 * `counter-limit.test.ts` drives the plain data.
 */

import { describe, expect, it } from "vitest";
import { constant, counterLimit } from "./abilities.js";
import { validateDefinition } from "./validate.js";
import { perHero, query } from "./values.js";

describe("`counterLimit`", () => {
  it("builds a maximum on this card's counters of one type, per player", () => {
    const part = counterLimit("synergy", perHero(1));
    expect(part).toEqual({
      rules: [
        {
          kind: "counterLimit",
          card: { self: true },
          counterType: "synergy",
          max: { kind: "perPlayer", base: 0, perPlayer: 1 },
        },
      ],
    });
    expect(validateDefinition(constant(part))).toEqual([]);
  });

  it("takes a fixed number and another card", () => {
    expect(counterLimit("charge", 3, query("upgrade", { hostOfSelf: false })).rules?.[0]).toEqual({
      kind: "counterLimit",
      card: { categories: ["upgrade"], hostOfSelf: false },
      counterType: "charge",
      max: { kind: "const", value: 3 },
    });
  });
});
