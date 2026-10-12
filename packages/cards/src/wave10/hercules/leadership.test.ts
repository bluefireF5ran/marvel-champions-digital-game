import { HERCULES_CARDS } from "@mc/content";
import { WAVE10_CARDS } from "../cards.js";
import { THOR_PACK_CARDS } from "../../wave1/thor/pack-cards.js";
import { NEXT_EVOL_PRECON_CABLE_DECK } from "../../wave7/next_evol/precon-cable-deck.js";
import { validateDefinition } from "../../dsl/validate.js";
import { HERCULES_LEADERSHIP as REGISTRY, HERCULES_LEADERSHIP_SKIPPED as SKIPPED } from "./leadership.js";

/** Wave 10 `hercules/leadership` (docs/phase7-wave10-hero-packs.md H8.4, HS0): only the two reprints are scripted so far. */
const TEAMWORK = "59021.teamwork-interrupt";
const CALL_FOR_BACKUP = "59022.when-defeated";

const dataOf = (code: string) =>
  [...WAVE10_CARDS, ...HERCULES_CARDS].find((c) => c.id === code) as unknown as {
    cost?: number;
    resourceIcons?: unknown;
    traits?: unknown;
    abilities: { id: string }[];
  };

describe("reprints", () => {
  it("scripts exactly the two reprints, neither skipped, each validating", () => {
    expect(Object.keys(REGISTRY).sort()).toEqual([TEAMWORK, CALL_FOR_BACKUP]);
    for (const id of Object.keys(REGISTRY)) {
      expect(validateDefinition(REGISTRY[id]!), id).toEqual([]);
      expect(Object.keys(SKIPPED)).not.toContain(id);
    }
  });

  it("59021 Teamwork aliases the script of 06032, the same definition object", () => {
    expect(REGISTRY[TEAMWORK]).toBe(THOR_PACK_CARDS["06032.teamwork-constant"]);
    const a = dataOf("59021");
    const b = dataOf("06032");
    expect(a.cost).toBe(b.cost);
    expect(a.resourceIcons).toEqual(b.resourceIcons);
    expect(a.traits).toEqual(b.traits);
    expect(a.abilities.map((r) => r.id)).toEqual([TEAMWORK]);
  });

  it("59022 Call for Backup aliases the script of 40018, the same definition object", () => {
    expect(REGISTRY[CALL_FOR_BACKUP]).toBe(NEXT_EVOL_PRECON_CABLE_DECK["40018.when-defeated"]);
    const a = dataOf("59022");
    const b = dataOf("40018");
    expect(a.traits).toEqual(b.traits);
    expect(a.abilities.map((r) => r.id)).toEqual([CALL_FOR_BACKUP]);
  });
});
