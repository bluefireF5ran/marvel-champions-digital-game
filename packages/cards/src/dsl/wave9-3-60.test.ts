/**
 * `swapVillainByTrait` (docs/phase7-wave9.md §3.60): "Swap the Avatar of Loki villain in play with a random set-aside
 * Avatar of Loki villain" (Stories and Lies, `tt` 55051) and Shatter the Illusion's step 2. The engine's
 * `villain-swap-by-trait.test.ts` drives the plain data.
 */

import { describe, expect, it } from "vitest";
import { whenRevealed } from "./abilities.js";
import { swapVillain, swapVillainByTrait } from "./effects.js";
import { validateDefinition } from "./validate.js";
import { trait } from "@mc/content";
import { self } from "./values.js";

const AVATAR = trait("AVATAR OF LOKI");

describe("`swapVillainByTrait`", () => {
  it("swaps the villain with a set-aside villain of the trait, starting face up, keeping the dial", () => {
    expect(swapVillainByTrait(AVATAR)).toEqual({
      kind: "swapVillain",
      villain: { kind: "villain" },
      with: { setAsideTrait: AVATAR },
      face: "starting",
    });
    expect(validateDefinition(whenRevealed(swapVillainByTrait(AVATAR)))).toEqual([]);
  });

  it("sets the dial to the printed value, for a named villain", () => {
    expect(swapVillainByTrait(AVATAR, { villain: self, dial: "printed" })).toEqual({
      kind: "swapVillain",
      villain: { kind: "self" },
      with: { setAsideTrait: AVATAR },
      face: "starting",
      dial: "printed",
    });
  });

  it("leaves the swap by title as it was", () => {
    expect(swapVillain()).toEqual({ kind: "swapVillain", villain: { kind: "villain" } });
  });
});
