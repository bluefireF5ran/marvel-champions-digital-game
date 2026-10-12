/**
 * Every wave 10 card belongs to exactly one scripting module. `CARD_GROUPS` (module path to card ids) is checked against
 * the emitted data, against the modules on disk, and against each module's header list, so a card cannot be left out,
 * listed twice or filed under the wrong pack unnoticed.
 */
import { CW_CARDS } from "@mc/content";
import { CARD_GROUPS } from "./card-groups.js";
import { WAVE10_MODULES } from "./modules.js";

describe("wave 10 card groups", () => {
  it("holds every cw card in exactly one group", () => {
    const seen = new Map<string, string[]>();
    for (const [group, ids] of Object.entries(CARD_GROUPS)) {
      for (const id of ids) seen.set(id, [...(seen.get(id) ?? []), group]);
    }
    const twice = [...seen].filter(([, groups]) => groups.length > 1).map(([id, groups]) => `${id}: ${groups}`);
    expect(twice).toEqual([]);
    expect([...seen.keys()].sort()).toEqual(CW_CARDS.map((card) => card.id).sort());
    expect(CW_CARDS).toHaveLength(190);
  });

  it("files each card under cw/ and in a pack-56 id", () => {
    for (const [group, ids] of Object.entries(CARD_GROUPS)) {
      expect(group.startsWith("cw/"), group).toBe(true);
      for (const id of ids) expect(id.startsWith("56"), `${id} in ${group}`).toBe(true);
    }
  });

  it("has one module file per group, wired into modules.ts, with a header listing exactly its ids", () => {
    const sources = (import.meta as unknown as { glob: (p: string, o: object) => Record<string, string> }).glob(
      "./cw/**/*.ts",
      { query: "?raw", import: "default", eager: true },
    );
    expect(WAVE10_MODULES.map((m) => m.group).sort()).toEqual(Object.keys(CARD_GROUPS).sort());
    for (const [group, ids] of Object.entries(CARD_GROUPS)) {
      const text = sources[`./${group}.ts`];
      expect(text, `module ${group}.ts exists`).toBeDefined();
      const listed = [...text!.matchAll(/^ \* - (\S+) /gm)].map((m) => m[1]);
      expect(listed, group).toEqual([...ids]);
    }
  });
});
