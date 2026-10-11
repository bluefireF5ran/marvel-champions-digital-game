/**
 * `eachPlayerCost` (docs/phase7-wave9.md §3.58): "Hero Action: Each player exhausts their identity and takes 1 damage →
 * discard this card." (Crown of the Enchantress, `tt` 55016.) The engine's `each-player-cost.test.ts` drives the plain
 * data.
 */

import { describe, expect, it } from "vitest";
import { eachPlayerCost, exhaustYourHero, heroAction, resource } from "./abilities.js";
import { draw } from "./effects.js";
import { validateDefinition } from "./validate.js";

describe("`eachPlayerCost`", () => {
  it("builds a cost every player pays: exhaust their identity and take 1 damage", () => {
    const definition = heroAction({ cost: eachPlayerCost({ exhaustIdentity: true, damage: 1 }) }, draw(1));
    expect(definition.cost).toEqual({ eachPlayer: { exhaustIdentity: true, damageSelf: 1 } });
    expect(validateDefinition(definition)).toEqual([]);
  });

  it("builds either half alone", () => {
    expect(eachPlayerCost({ exhaustIdentity: true })).toEqual({ eachPlayer: { exhaustIdentity: true } });
    expect(eachPlayerCost({ damage: 2 })).toEqual({ eachPlayer: { damageSelf: 2 } });
  });

  it("is refused empty, with damage below 1, beside the payer's own exhaust, and on a resource ability", () => {
    expect(validateDefinition(heroAction({ cost: eachPlayerCost({}) }, draw(1)))).toContain(
      "cost eachPlayer: needs exhaustIdentity or damageSelf",
    );
    expect(validateDefinition(heroAction({ cost: eachPlayerCost({ damage: 0 }) }, draw(1)))).toContain(
      "cost eachPlayer: damageSelf must be a whole number of at least 1",
    );
    const twice = heroAction({ cost: [exhaustYourHero, eachPlayerCost({ exhaustIdentity: true })] }, draw(1));
    expect(validateDefinition(twice)).toContain(
      "cost eachPlayer: exhaustIdentity already exhausts the payer's identity; drop the cost's own",
    );
    const paid = resource(1, { cost: eachPlayerCost({ damage: 1 }) });
    expect(validateDefinition(paid)).toContain("cost eachPlayer: not on a resource ability");
  });
});
