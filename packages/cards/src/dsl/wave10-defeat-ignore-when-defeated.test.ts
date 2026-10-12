/**
 * docs/phase7-wave10-box-heroes.md B3.2: the DSL surface of `defeat(target, { ignoreWhenDefeated: true })`. The engine
 * side is driven by `packages/engine/src/defeat-ignore-when-defeated.test.ts` and `attack-ability-defeat.test.ts`.
 */

import type { AbilityDefinition, EffectSpec } from "@mc/engine";
import { describe, expect, it } from "vitest";
import { heroAction } from "./abilities.js";
import { chooseTarget, defeat } from "./effects.js";
import { validateDefinition } from "./validate.js";
import { chosen, query } from "./values.js";

describe("B3.2 `defeat(target, { ignoreWhenDefeated })`", () => {
  it("'Hero Action (attack): Defeat a minion. Ignore any \"When Defeated\" abilities on that minion.'", () => {
    const definition = heroAction(
      { label: "attack" },
      chooseTarget("minion", query("minion")),
      defeat(chosen("minion"), { ignoreWhenDefeated: true }),
    );
    expect(validateDefinition(definition)).toEqual([]);
    expect(definition.effects[1]).toEqual({
      kind: "defeat",
      target: { kind: "slot", slot: "minion" },
      ignoreWhenDefeated: true,
    });
  });

  it("absent, no key is emitted: a plain defeat is unchanged", () => {
    expect(defeat(chosen("minion"))).toEqual({ kind: "defeat", target: { kind: "slot", slot: "minion" } });
    expect(defeat(chosen("minion"), {})).toEqual({ kind: "defeat", target: { kind: "slot", slot: "minion" } });
  });

  it("the definition is plain data: it survives a JSON round trip unchanged", () => {
    const definition = heroAction(
      chooseTarget("minion", query("minion")),
      defeat(chosen("minion"), { ignoreWhenDefeated: true }),
    );
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
  });

  it("the flag is true or absent: any other value is rejected", () => {
    const withFlag = (flag: unknown): AbilityDefinition =>
      heroAction(chooseTarget("minion", query("minion")), {
        kind: "defeat",
        target: chosen("minion"),
        ignoreWhenDefeated: flag,
      } as unknown as EffectSpec);
    expect(validateDefinition(withFlag(false))).toEqual(["effects[1] defeat: ignoreWhenDefeated is true or absent"]);
    expect(validateDefinition(withFlag("yes"))).toEqual(["effects[1] defeat: ignoreWhenDefeated is true or absent"]);
    expect(validateDefinition(withFlag(true))).toEqual([]);
  });
});
