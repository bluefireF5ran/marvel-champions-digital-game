import { describe, expect, it } from "vitest";
import {
  cardId,
  encounterSetId,
  modularSetCountRangeOf,
  validateMainSchemeCard,
  validateScenario,
  validateScenarioEncounterSets,
  validateScenarioMainSchemeStages,
} from "./index.js";
import type { EncounterSet, MainSchemeCard, Scenario } from "./index.js";
import { CORE_CARDS } from "../data/core/cards.js";
import { CORE_ENCOUNTER_SETS } from "../data/core/encounterSets.js";
import { CW_CARDS } from "../data/cw/cards.js";
import { CW_ENCOUNTER_SETS } from "../data/cw/encounterSets.js";
import { CW_SCENARIOS } from "../data/cw/scenarios.js";

/**
 * Wave 10 schema additions (docs/phase7-wave10.md §1.2 to §1.4): `EncounterSet.side`, `MainSchemeStage.printedCardId`,
 * `Scenario.side`, `Scenario.modularSetCountRange` (read with `modularSetCountRangeOf`) and `Scenario.mainSchemeStages`.
 * Sources: MC56 pp. 4, 5, 7 and 8; ruling Jan 11, 2026 R1.
 */

const SETS: readonly EncounterSet[] = [...CORE_ENCOUNTER_SETS, ...CW_ENCOUNTER_SETS];
const scenario = (id: string): Scenario => CW_SCENARIOS.find((s) => s.id === id)!;
const ironMan = scenario("registration-iron-man");
const registration = CW_CARDS.find((c) => c.id === "56063a") as MainSchemeCard;

describe("EncounterSet.side", () => {
  it("is refused when a scenario of the other side names the set", () => {
    const crossed = {
      ...ironMan,
      recommendedModularSetIds: [...ironMan.recommendedModularSetIds, encounterSetId("defenders")],
    };
    expect(validateScenarioEncounterSets(crossed, SETS).errors).toEqual([
      "scenario registration-iron-man is on the registration side, but set defenders is resistance",
    ]);
    const leader = { ...ironMan, encounterSetIds: [encounterSetId("captain_america_leader")] };
    expect(validateScenarioEncounterSets(leader, SETS).errors).toEqual([
      "scenario registration-iron-man is on the registration side, but set captain_america_leader is resistance",
    ]);
  });

  it("leaves a scenario with no side, and a set with no side, alone", () => {
    const { side: _side, ...sideless } = ironMan;
    const mixed = { ...sideless, recommendedModularSetIds: [encounterSetId("defenders")] };
    expect(validateScenarioEncounterSets(mixed, SETS).errors).toEqual([]);
    expect(validateScenarioEncounterSets(ironMan, SETS).errors).toEqual([]);
  });
});

describe("Scenario.modularSetCountRange and modularSetCountRangeOf", () => {
  it("reads the range when there is one, and the count otherwise", () => {
    expect(modularSetCountRangeOf(ironMan)).toEqual({ min: 3, max: 4 });
    const { modularSetCountRange: _range, ...plain } = ironMan;
    expect(modularSetCountRangeOf(plain)).toEqual({ min: 4, max: 4 });
    const { modularSetCount: _count, ...none } = plain;
    expect(modularSetCountRangeOf(none)).toEqual({ min: 1, max: 1 });
  });

  it("validates the range and that the recommended count lies inside it", () => {
    expect(validateScenario(ironMan).errors).toEqual([]);
    for (const modularSetCountRange of [
      { min: 4, max: 3 },
      { min: -1, max: 4 },
      { min: 1.5, max: 4 },
    ])
      expect(validateScenario({ ...ironMan, modularSetCountRange }).valid).toBe(false);
    expect(validateScenario({ ...ironMan, modularSetCountRange: { min: 1, max: 2 } }).errors).toEqual([
      "scenario modularSetCount must lie within modularSetCountRange",
    ]);
  });
});

describe("Scenario.side and Scenario.mainSchemeStages", () => {
  it("validate their shape", () => {
    expect(validateScenario({ ...ironMan, side: "neutral" as never }).errors).toEqual([
      "scenario side must be 'registration' or 'resistance' when present",
    ]);
    const one = { recommended: [cardId("56063b")] as never };
    expect(validateScenario({ ...ironMan, mainSchemeStages: one }).valid).toBe(false);
    const twice = { recommended: [cardId("56063b"), cardId("56063b")] as const };
    expect(validateScenario({ ...ironMan, mainSchemeStages: twice }).valid).toBe(false);
  });

  it("must name one stage 1 then one stage 2 of the scenario's main scheme card, on the scenario's side", () => {
    for (const s of CW_SCENARIOS) expect(validateScenarioMainSchemeStages(s, CW_CARDS, SETS).errors, s.id).toEqual([]);
    const swapped = { ...ironMan, mainSchemeStages: { recommended: [cardId("56064b"), cardId("56063b")] as const } };
    expect(validateScenarioMainSchemeStages(swapped, CW_CARDS, SETS).errors).toEqual([
      "scenario registration-iron-man must recommend one stage 1 then one stage 2, not 2 then 1",
    ]);
    const twoOnes = { ...ironMan, mainSchemeStages: { recommended: [cardId("56063b"), cardId("56096b")] as const } };
    expect(validateScenarioMainSchemeStages(twoOnes, CW_CARDS, SETS).valid).toBe(false);
    const foreign = { ...ironMan, mainSchemeStages: { recommended: [cardId("56063b"), cardId("56142b")] as const } };
    expect(validateScenarioMainSchemeStages(foreign, CW_CARDS, SETS).errors).toEqual([
      "scenario registration-iron-man recommends stage 56142b, which main scheme 56063a does not hold",
    ]);
  });

  it("refuses a main scheme card of the other side", () => {
    const crossed = { ...ironMan, mainSchemeCardId: cardId("56141a") };
    expect(validateScenarioMainSchemeStages(crossed, CW_CARDS, SETS).errors).toContain(
      "scenario registration-iron-man is on the registration side, but main scheme set resistance is resistance",
    );
  });

  it("passes a scenario with neither field, and reports a main scheme that is not one", () => {
    const { side: _side, mainSchemeStages: _stages, ...plain } = ironMan;
    expect(validateScenarioMainSchemeStages(plain, [], SETS).errors).toEqual([]);
    expect(validateScenarioMainSchemeStages(ironMan, [], SETS).valid).toBe(false);
  });
});

describe("MainSchemeStage.printedCardId", () => {
  it("is the stable key of each of the eight stages, unique within the card", () => {
    expect(validateMainSchemeCard(registration).errors).toEqual([]);
    const ids = registration.stages.map((s) => s.printedCardId as string);
    expect(ids).toEqual(["56063b", "56064b", "56096b", "56097b", "56121b", "56122b", "56123b", "56124b"]);
    const twice = {
      ...registration,
      stages: [
        registration.stages[0],
        { ...registration.stages[1]!, printedCardId: registration.stages[0].printedCardId },
      ],
    } as unknown as MainSchemeCard;
    expect(validateMainSchemeCard(twice).errors).toEqual(["main scheme has two stages with printedCardId 56063b"]);
    const blank = {
      ...registration,
      stages: [{ ...registration.stages[0], printedCardId: "" }],
    } as unknown as MainSchemeCard;
    expect(validateMainSchemeCard(blank).valid).toBe(false);
  });

  it("is absent on a card whose stage numbers are unique (Core's main schemes)", () => {
    const schemes = CORE_CARDS.filter((c): c is MainSchemeCard => c.type === "main_scheme");
    expect(schemes.length).toBeGreaterThan(0);
    for (const card of schemes)
      for (const stage of card.stages) expect(stage.printedCardId, card.id as string).toBeUndefined();
  });
});
