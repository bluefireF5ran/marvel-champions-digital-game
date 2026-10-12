import {
  CORE_SCENARIOS,
  PLAYABLE_CARDS,
  WAVE10_ENCOUNTER_SETS,
  WAVE10_SCENARIOS,
  type MainSchemeCard,
  type Scenario,
} from "@mc/content";
import { describe, expect, it } from "vitest";
import {
  chooseMainSchemeStages,
  mainSchemeStageGist,
  mainSchemeStagesOffer,
  mainSchemeStagesProblem,
} from "./main-scheme-stages.js";

/** docs/phase7-wave10.md §3.1 (MC56 pp. 4-5, step 4): one stage 1 and one stage 2 of the leader's side. */

const scenario = (id: string): Scenario => {
  const record = [...WAVE10_SCENARIOS, ...CORE_SCENARIOS].find((candidate) => candidate.id === id);
  if (!record) throw new Error(`no scenario ${id}`);
  return record;
};
const mainScheme = (record: Scenario): MainSchemeCard => {
  const card = PLAYABLE_CARDS.find((candidate) => candidate.id === record.mainSchemeCardId);
  if (!card || card.type !== "main_scheme") throw new Error(`no main scheme for ${record.id}`);
  return card;
};
const CONTEXT = { encounterSets: WAVE10_ENCOUNTER_SETS };
const choose = (id: string, picks?: readonly string[]) =>
  chooseMainSchemeStages(scenario(id), mainScheme(scenario(id)), picks, CONTEXT);
const problem = (id: string, picks?: readonly string[]) =>
  mainSchemeStagesProblem(scenario(id), mainScheme(scenario(id)), picks, CONTEXT);

describe("chooseMainSchemeStages", () => {
  it.each([
    ["registration-iron-man", [0, 1]],
    ["registration-captain-marvel", [2, 3]],
    ["resistance-captain-america", [0, 1]],
    ["resistance-spider-woman", [2, 3]],
  ])("%s without picks is the recommended pair", (id, indexes) => {
    expect(choose(id)).toEqual(indexes);
    expect(problem(id)).toBeNull();
  });

  it("maps each of a side's sixteen stage pairs to its two indexes, stage 1 first", () => {
    const record = scenario("resistance-captain-america");
    const card = mainScheme(record);
    const keyed = card.stages.map((stage, index) => ({ index, number: stage.stageNumber, id: stage.printedCardId! }));
    const ones = keyed.filter((stage) => stage.number === 1);
    const twos = keyed.filter((stage) => stage.number === 2);
    expect([ones.length, twos.length]).toEqual([4, 4]);
    for (const one of ones)
      for (const two of twos) expect(choose(record.id, [one.id, two.id])).toEqual([one.index, two.index]);
  });

  it("refuses the other side's stage by name and side", () => {
    expect(problem("registration-captain-marvel", ["56172b", "56097b"])).toBe(
      "Open Rebellion is a resistance stage; Captain Marvel leads the registration side (MC56 p. 4)",
    );
    expect(() => choose("resistance-captain-america", ["56141b", "56064b"])).toThrow(
      "Resistance: Captain America: Negative Zone Prison is a registration stage; Captain America leads the resistance (MC56 p. 4)",
    );
  });

  it("refuses two stages of one number, a wrong order and a missing number in the engine's words", () => {
    expect(problem("resistance-spider-woman", ["56142b", "56173b"])).toBe(
      "Choose only one stage 2: both Secret Avengers (stage 2) and Neighborhood Protectors (stage 2) are chosen.",
    );
    expect(problem("resistance-spider-woman", ["56173b", "56172b"])).toBe(
      "Open Rebellion (stage 1) cannot come after Neighborhood Protectors (stage 2): choose stages in ascending stage number.",
    );
    expect(problem("resistance-spider-woman", ["56173b"])).toBe(
      "Choose a stage 1 of Superhero Resistance: one stage of each number is needed.",
    );
    expect(problem("resistance-spider-woman", ["56172b", "56172b"])).toBe(
      "Open Rebellion (stage 1) is chosen twice. Choose each stage once.",
    );
    expect(problem("resistance-spider-woman", [])).toBe(
      "Choose at least one stage of Superhero Resistance: mainSchemeStageIndexes is empty.",
    );
  });

  it("a scenario whose stages are not a choice gives the engine nothing and accepts no picks", () => {
    expect(choose("rhino")).toBeUndefined();
    expect(problem("rhino")).toBeNull();
    expect(() => choose("rhino", ["56063b", "56064b"])).toThrow(
      "Rhino: the main scheme's stages are not a setup choice at this scenario",
    );
    expect(mainSchemeStagesOffer(scenario("rhino"), mainScheme(scenario("rhino")))).toBeNull();
  });

  it("refuses a card that is not the scenario's main scheme", () => {
    const other = mainScheme(scenario("resistance-spider-woman"));
    expect(mainSchemeStagesProblem(scenario("registration-iron-man"), other, undefined, CONTEXT)).toBe(
      "Superhero Resistance is not this scenario's main scheme",
    );
  });
});

describe("mainSchemeStagesOffer", () => {
  it("lists four options per stage number with each stage's target threat, and the leader's recommendation", () => {
    const record = scenario("registration-captain-marvel");
    const offer = mainSchemeStagesOffer(record, mainScheme(record))!;
    expect(offer.recommended).toEqual(["56096b", "56097b"]);
    expect(offer.stages.map((stage) => stage.stageNumber)).toEqual([1, 2]);
    expect(offer.stages[0]!.options.map((option) => [option.printedCardId, option.name])).toEqual([
      ["56063b", "Cut Off Support"],
      ["56096b", "S.H.I.E.L.D. Recruits"],
      ["56121b", "Homeland Security"],
      ["56122b", "Public Outrage"],
    ]);
    expect(offer.stages[1]!.options.map((option) => [option.printedCardId, option.name])).toEqual([
      ["56064b", "Negative Zone Prison"],
      ["56097b", "Hunting Rebel Heroes"],
      ["56123b", "The Initiative"],
      ["56124b", "No Going Back"],
    ]);
    for (const option of offer.stages[0]!.options) expect(option.targetThreat).toEqual({ base: 0, perPlayer: 7 });
    for (const option of offer.stages[1]!.options) expect(option.targetThreat).toEqual({ base: 0, perPlayer: 9 });
    expect(offer.stages[0]!.options[2]!.gist).toBe("Each minion gains guard.");
    expect(offer.stages[1]!.options[3]!.gist).toBe("Allies enter play exhausted.");
  });

  it("every option of both sides has a gist of one sentence that is not the shared hinder line", () => {
    for (const id of ["registration-iron-man", "resistance-spider-woman"]) {
      const offer = mainSchemeStagesOffer(scenario(id), mainScheme(scenario(id)))!;
      for (const option of offer.stages.flatMap((stage) => stage.options)) {
        expect(option.gist.length, option.name).toBeGreaterThan(10);
        expect(option.gist, option.name).not.toMatch(/gains hinder|\n|^\[star\]/);
      }
    }
  });
});

describe("mainSchemeStageGist", () => {
  it("passes over the hinder line, drops a leading [star] and stops at the first sentence", () => {
    expect(
      mainSchemeStageGist(
        "If there is more than 1 player on your team, this stage gains hinder 2[per_hero].\nForced Interrupt: When a player reveals a treachery, place 1 threat here. (Limit once per phase per player.)",
      ),
    ).toBe("Forced Interrupt: When a player reveals a treachery, place 1 threat here.");
    expect(mainSchemeStageGist("[star] Reduce the target threat by 1. Then stop.")).toBe(
      "Reduce the target threat by 1.",
    );
  });

  it("does not end a sentence inside an initialism, and keeps a lone hinder line", () => {
    expect(mainSchemeStageGist("Each S.H.I.E.L.D. minion gets +1 ATK. They gain guard.")).toBe(
      "Each S.H.I.E.L.D. minion gets +1 ATK.",
    );
    expect(mainSchemeStageGist("This stage gains hinder 2[per_hero].")).toBe("This stage gains hinder 2[per_hero].");
    expect(mainSchemeStageGist("")).toBe("");
  });
});
