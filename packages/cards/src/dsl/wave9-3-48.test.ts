import { describe, expect, it } from "vitest";
import {
  aScheme,
  anEnemy,
  chooseOne,
  chosen,
  dealDamage,
  distinctTraitsOf,
  each,
  heroAction,
  option,
  query,
  removeThreat,
  repeatTimes,
  validateDefinition,
} from "./index.js";

const FRIENDLY_CHARACTERS = each(query(["identity", "ally"]));

describe("distinctTraitsOf: 'for each different Trait on friendly characters in play' (docs/phase7-wave9.md §3.48)", () => {
  it("builds the value over the cards named", () => {
    expect(distinctTraitsOf(FRIENDLY_CHARACTERS)).toEqual({
      kind: "distinctTraits",
      of: { kind: "each", query: { categories: ["identity", "ally"] } },
    });
  });

  it("Strength in Diversity (falcon 53019): one choice per different trait", () => {
    const definition = heroAction(
      repeatTimes(
        distinctTraitsOf(FRIENDLY_CHARACTERS),
        chooseOne(
          option("Remove 1 threat from a scheme", aScheme(), removeThreat(1, chosen("scheme"))),
          option("Deal 1 damage to an enemy", anEnemy(), dealDamage(1, chosen("enemy"))),
        ),
      ),
    );
    expect(validateDefinition(definition)).toEqual([]);
    expect(definition.effects[0]).toMatchObject({ kind: "repeatTimes", times: { kind: "distinctTraits" } });
  });
});
