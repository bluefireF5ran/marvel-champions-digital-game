import { describe, expect, test } from "vitest";
import { CW_CARDS, CW_ENCOUNTER_SETS, CW_SCENARIOS, type AnyCard } from "@mc/content";
import { POOL_ENCOUNTER_SETS } from "../content/pool.js";
import { openBuilderOn, type BuilderContext } from "./civil-war-builder-model.js";
import { civilWarTableSummaryOf } from "./civil-war-table-summary.js";
import { initialSetupDraft, setCivilWarBlind, setDifficulty, setModularSetIds } from "./setup-draft.js";

const CTX: BuilderContext = {
  cards: new Map<string, AnyCard>(CW_CARDS.map((c) => [c.id as string, c])),
  scenarios: CW_SCENARIOS,
  encounterSets: [...POOL_ENCOUNTER_SETS, ...CW_ENCOUNTER_SETS],
};
const IRON = "registration-iron-man";
const ready = () => openBuilderOn(initialSetupDraft({ scenarioId: "rhino", seatDeckId: "x", seed: 5 }), IRON).draft;
const lines = (d: ReturnType<typeof ready>) => {
  const s = civilWarTableSummaryOf(d, CTX)!;
  return [s.build, ...s.rows.map((r) => `${r.label}: ${r.value}`)];
};

describe("Table setup's Civil War summary", () => {
  test("a ready-made build", () => {
    expect(lines(ready())).toEqual([
      "Ready-made",
      "Leader: Iron Man (stage I)",
      "Side: Registration",
      "Stage 1: Cut Off Support",
      "Stage 2: Negative Zone Prison",
      "Iron Man set: Iron Man",
      "Encounter set: Standard",
      "Modular sets: Dangerous Recruits, Maria Hill, Mighty Avengers, The Initiative",
      "Difficulty: Standard",
    ]);
    const s = civilWarTableSummaryOf(ready(), CTX)!;
    expect(s.editLabel).toBe("Edit scenario");
    expect(s.setCount).toBe(4);
  });

  test("a custom expert build", () => {
    const d = setDifficulty(setModularSetIds(ready(), ["paladin", "cape_killer", "bomb_scare"]), "expert");
    expect(lines(d)).toEqual([
      "Custom",
      "Leader: Iron Man (stage III)",
      "Side: Registration",
      "Stage 1: Cut Off Support",
      "Stage 2: Negative Zone Prison",
      "Iron Man set: Iron Man",
      "Encounter set: Expert",
      "Modular sets: Paladin, Cape-Killer, Bomb Scare",
      "Difficulty: Expert",
    ]);
    expect(civilWarTableSummaryOf(d, CTX)!.setCount).toBe(3);
  });

  test("a blind build hides stage 2 and the set names", () => {
    const s = lines(setCivilWarBlind(ready(), true));
    expect(s).toContain("Stage 2: hidden");
    expect(s).toContain("Modular sets: 4 hidden");
    expect(s.join(" | ")).not.toContain("Negative Zone Prison");
    expect(s.join(" | ")).not.toContain("Paladin");
  });

  test("rows have stable ids and the first line moves to the build tag", () => {
    const s = civilWarTableSummaryOf(ready(), CTX)!;
    expect(s.build).toBe("Ready-made");
    expect(s.rows.map((r) => r.id)).toEqual(Array.from({ length: 8 }, (_, i) => `row${i}`));
  });

  test("a draft that is not Civil War has no summary", () => {
    expect(
      civilWarTableSummaryOf(initialSetupDraft({ scenarioId: "rhino", seatDeckId: "x", seed: 5 }), CTX),
    ).toBeNull();
  });
});
