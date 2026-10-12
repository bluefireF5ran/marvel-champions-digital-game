import { HERCULES_CARDS } from "@mc/content";
import { WAVE10_CARDS } from "../cards.js";
import { BASIC } from "../../core/aspects/basic.js";
import { BKW_PACK_CARDS } from "../../wave1/bkw/pack-cards.js";
import { SPDR_EVENTS } from "../../wave5/spdr/events.js";
import { validateDefinition } from "../../dsl/validate.js";
import { HERCULES_BASIC as REGISTRY, HERCULES_BASIC_SKIPPED as SKIPPED } from "./basic.js";

/**
 * Wave 10 `hercules/basic` (docs/phase7-wave10-hero-packs.md H8.4, HS0): only the reprints are scripted so far.
 * 59029 Energy, 59030 Genius and 59031 Strength print no ability and need nothing; 59032 Avengers Compound reprints
 * 58034 (`wonder_man/basic`, not scripted yet), so it stays skipped.
 */
const LIMITLESS_CONSTANT = "59027.limitless-stamina-constant";
const LIMITLESS_ACTION = "59027.limitless-stamina-action";
const HELICARRIER = "59033.helicarrier-action";
const QUINCARRIER = "59034.quincarrier-resource";

const dataOf = (code: string) =>
  [...WAVE10_CARDS, ...HERCULES_CARDS].find((c) => c.id === code) as unknown as {
    cost?: number;
    resourceIcons?: unknown;
    traits?: unknown;
    abilities: { id: string }[];
  };

describe("reprints", () => {
  it("scripts exactly the four aliased refs, each validating and none skipped", () => {
    expect(Object.keys(REGISTRY).sort()).toEqual(
      [LIMITLESS_ACTION, LIMITLESS_CONSTANT, HELICARRIER, QUINCARRIER].sort(),
    );
    for (const id of Object.keys(REGISTRY)) {
      expect(validateDefinition(REGISTRY[id]!), id).toEqual([]);
      expect(Object.keys(SKIPPED)).not.toContain(id);
    }
    expect(Object.keys(SKIPPED)).toContain("59032.avengers-compound-action");
  });

  it("each copy resolves to the definition object of its original", () => {
    expect(REGISTRY[LIMITLESS_CONSTANT]).toBe(SPDR_EVENTS["31023.limitless-stamina-constant"]);
    expect(REGISTRY[LIMITLESS_ACTION]).toBe(SPDR_EVENTS["31023.limitless-stamina-action"]);
    expect(REGISTRY[HELICARRIER]).toBe(BASIC["01092.helicarrier-action"]);
    expect(REGISTRY[QUINCARRIER]).toBe(BKW_PACK_CARDS["08023.quincarrier-resource"]);
  });

  it("the copies print the originals' cost, icons and traits and name the same refs", () => {
    for (const [copy, original] of [
      ["59027", "31023"],
      ["59033", "01092"],
      ["59034", "08023"],
    ] as const) {
      const a = dataOf(copy);
      const b = dataOf(original);
      expect(a.cost, copy).toBe(b.cost);
      expect(a.resourceIcons, copy).toEqual(b.resourceIcons);
      expect(a.traits, copy).toEqual(b.traits);
      expect(
        a.abilities.map((r) => r.id.slice(5)),
        copy,
      ).toEqual(b.abilities.map((r) => r.id.slice(5)));
    }
  });

  it("59029 Energy, 59030 Genius and 59031 Strength print no ability, like 01088 to 01090", () => {
    for (const code of ["59029", "59030", "59031", "01088", "01089", "01090"])
      expect(dataOf(code).abilities, code).toEqual([]);
  });
});
