import { describe, expect, test } from "vitest";
import { playableScenarioOffer } from "@mc/cards";
import { cardsRandomizer } from "./civil-war-random.js";

describe("the cards randomizer behind the builder", () => {
  test("the same seed gives the same scenario; a different seed can differ", () => {
    expect(cardsRandomizer({ seed: 11 })).toEqual(cardsRandomizer({ seed: 11 }));
    const seen = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(cardsRandomizer({ seed: i }))));
    expect(seen.size).toBeGreaterThan(1);
  });

  test("the result is four sets by default, three when asked, and a stage pair of the leader's side", () => {
    expect(cardsRandomizer({ seed: 3 }).modularSetIds).toHaveLength(4);
    expect(cardsRandomizer({ seed: 3, modularCount: 3 }).modularSetIds).toHaveLength(3);
    const picks = cardsRandomizer({ seed: 3 });
    const stages = playableScenarioOffer(picks.leaderId).mainSchemeStages!;
    expect(picks.stageIds).toHaveLength(2);
    expect(stages.stages[0]!.options.map((o) => o.printedCardId)).toContain(picks.stageIds[0]);
    expect(stages.stages[1]!.options.map((o) => o.printedCardId)).toContain(picks.stageIds[1]);
  });

  test("a pinned leader and a pinned side are kept for every seed", () => {
    for (let seed = 0; seed < 8; seed++) {
      expect(cardsRandomizer({ seed, leaderId: "resistance-captain-america" }).leaderId).toBe(
        "resistance-captain-america",
      );
      expect(["registration-iron-man", "registration-captain-marvel"]).toContain(
        cardsRandomizer({ seed, side: "registration" }).leaderId,
      );
    }
  });
});
