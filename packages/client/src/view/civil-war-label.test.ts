import { describe, expect, test } from "vitest";
import { playableScenarioOffer } from "@mc/cards";
import { describeCivilWar } from "./civil-war-label.js";

const IRON = "registration-iron-man";
const offer = playableScenarioOffer(IRON);
const stages = offer.mainSchemeStages!;
const recommendedStages = stages.recommended;
const recommendedSets = offer.modularSets!.filter((s) => s.recommended).map((s) => s.id);
const otherStage1 = stages.stages[0]!.options.find((o) => o.printedCardId !== recommendedStages[0])!;
const nameOf = (id: string): string =>
  stages.stages.flatMap((s) => s.options).find((o) => o.printedCardId === id)!.name;

describe("the Civil War save label", () => {
  test("a ready-made leader reads plainly, with or without the stored picks", () => {
    expect(describeCivilWar({ scenarioId: IRON })).toBe("Civil War: Iron Man");
    expect(
      describeCivilWar({ scenarioId: IRON, mainSchemeStageIds: recommendedStages, modularSetIds: recommendedSets }),
    ).toBe("Civil War: Iron Man");
  });

  test("a custom build names the stages in order and counts the sets", () => {
    const label = describeCivilWar({
      scenarioId: IRON,
      mainSchemeStageIds: [otherStage1.printedCardId, recommendedStages[1]!],
      modularSetIds: recommendedSets.slice(0, 3),
    });
    expect(label).toBe(`Custom Civil War: Iron Man, ${otherStage1.name} then ${nameOf(recommendedStages[1]!)}, 3 sets`);
  });

  test("a random roll says so even if it landed on the printed picks", () => {
    expect(describeCivilWar({ scenarioId: IRON, randomScenario: true })).toMatch(/^Random Civil War: Iron Man, /);
  });

  test("a blind game hides stage 2 and every set, and still names stage 1 and the count", () => {
    const label = describeCivilWar({
      scenarioId: IRON,
      mainSchemeStageIds: [otherStage1.printedCardId, recommendedStages[1]!],
      modularSetIds: recommendedSets,
      blind: true,
      randomScenario: true,
    })!;
    expect(label).toBe(`Random Civil War (blind): Iron Man, ${otherStage1.name} then a hidden stage 2, 4 sets hidden`);
    expect(label).not.toContain(nameOf(recommendedStages[1]!));
    for (const set of offer.modularSets!.filter((s) => recommendedSets.includes(s.id))) {
      expect(label).not.toContain(set.name);
    }
  });

  test("any other scenario has no Civil War label", () => {
    expect(describeCivilWar({ scenarioId: "rhino" })).toBeNull();
    expect(describeCivilWar({ scenarioId: "nonsense" }, () => null)).toBeNull();
  });
});
