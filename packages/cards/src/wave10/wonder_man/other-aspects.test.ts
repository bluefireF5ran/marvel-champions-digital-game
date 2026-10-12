import { HERCULES_CARDS } from "@mc/content";
import { WAVE10_CARDS } from "../cards.js";
import { ANGEL_PACK_CARDS } from "../../wave7/angel/pack-cards.js";
import { validateDefinition } from "../../dsl/validate.js";
import { WONDER_MAN_OTHER_ASPECTS as REGISTRY, WONDER_MAN_OTHER_ASPECTS_SKIPPED as SKIPPED } from "./other-aspects.js";

/** Wave 10 `wonder_man/other-aspects` (docs/phase7-wave10-hero-packs.md H8.4, HS0): only the reprint is scripted so far. */
const BOMBS_AWAY = "58017.bombs-away-action";

const dataOf = (code: string) =>
  [...WAVE10_CARDS, ...HERCULES_CARDS].find((c) => c.id === code) as unknown as {
    cost: number;
    resourceIcons: unknown;
    traits: unknown;
    abilities: { id: string }[];
  };

describe("reprints", () => {
  it("58017 Bombs Away aliases the script of 42029, the same definition object", () => {
    expect(Object.keys(REGISTRY)).toEqual([BOMBS_AWAY]);
    expect(REGISTRY[BOMBS_AWAY]).toBe(ANGEL_PACK_CARDS["42029.bombs-away-action"]);
    expect(validateDefinition(REGISTRY[BOMBS_AWAY]!)).toEqual([]);
    expect(Object.keys(SKIPPED)).not.toContain(BOMBS_AWAY);
    const a = dataOf("58017");
    const b = dataOf("42029");
    expect(a.cost).toBe(b.cost);
    expect(a.resourceIcons).toEqual(b.resourceIcons);
    expect(a.traits).toEqual(b.traits);
    expect(a.abilities.map((r) => r.id)).toEqual([BOMBS_AWAY]);
  });
});
