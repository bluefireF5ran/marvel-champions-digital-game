import { describe, expect, test } from "vitest";
import { playableScenarioOffer } from "@mc/cards";
import {
  initialSetupDraft,
  setCivilWarBlind,
  setMainSchemeStage,
  setModularSetIds,
  setScenario,
  toSessionConfig,
} from "./setup-draft.js";
import { civilWarPickProblems, offerOf, reconcileWithOffer } from "./setup-options.js";

const SPIDER = [{ starterDeckId: "core-spider-man-justice" }];
const draftFor = (scenarioId: string) => initialSetupDraft({ scenarioId, seatDeckId: "x", seed: 5 });
const recommendedPair = (id: string) => playableScenarioOffer(id).mainSchemeStages!.recommended;

describe("a Civil War setup draft", () => {
  test("starts at the leader's recommended stage pair, the four recommended sets (null) and no blind", () => {
    const draft = draftFor("registration-iron-man");
    expect(draft.civilWar).toEqual({ stageIds: recommendedPair("registration-iron-man"), blind: false });
    expect(draft.modularSetIds).toBeNull();
  });

  test("sends the stages, cooperative and blind; the draft survives a JSON round trip", () => {
    let draft = draftFor("registration-iron-man");
    draft = setModularSetIds(draft, ["paladin", "cape_killer", "bomb_scare"]);
    draft = setMainSchemeStage(draft, 2, "56123b");
    draft = setCivilWarBlind(draft, true);
    const stored = JSON.parse(JSON.stringify(draft)) as typeof draft;
    expect(stored).toEqual(draft);
    const config = toSessionConfig(stored, SPIDER);
    expect(config.mainSchemeStageIds).toEqual(draft.civilWar!.stageIds);
    expect(config.mainSchemeStageIds![1]).toBe("56123b");
    expect(config.gameMode).toBe("cooperative");
    expect(config.blind).toBe(true);
    expect(config.modularSetIds).toEqual(["paladin", "cape_killer", "bomb_scare"]);
    expect(JSON.parse(JSON.stringify(config))).toEqual(config);
  });

  test("blind is left out when off", () => {
    const config = toSessionConfig(draftFor("resistance-spider-woman"), SPIDER);
    expect(config.blind).toBeUndefined();
    expect(config.gameMode).toBe("cooperative");
  });

  test("modularSetIds null still means the recommendation (nothing sent)", () => {
    expect(toSessionConfig(draftFor("registration-iron-man"), SPIDER).modularSetIds).toBeUndefined();
  });

  test("another leader resets the picks; the same leader keeps them; blind stays", () => {
    let draft = setMainSchemeStage(draftFor("registration-iron-man"), 2, "56123b");
    draft = setCivilWarBlind(draft, true);
    expect(setScenario(draft, undefined, "registration-iron-man").civilWar).toEqual(draft.civilWar);
    const other = setScenario(draft, undefined, "resistance-captain-america");
    expect(other.civilWar).toEqual({ stageIds: recommendedPair("resistance-captain-america"), blind: true });
    expect(other.modularSetIds).toBeNull();
  });

  test("a non-Civil War scenario clears the picks and sends none of the fields", () => {
    const draft = setScenario(draftFor("registration-iron-man"), undefined, "rhino");
    expect(draft.civilWar).toBeNull();
    expect(toSessionConfig(draft, SPIDER)).toEqual({
      scenarioId: "rhino",
      difficulty: "standard",
      players: SPIDER,
      seed: 5,
    });
  });

  test.each(["rhino", "breakout", "the-hood"])(
    "%s: the draft holds no Civil War picks and the config is unchanged",
    (id) => {
      const draft = draftFor(id);
      expect(draft.civilWar).toBeNull();
      const config = toSessionConfig(draft, SPIDER);
      expect(config).not.toHaveProperty("mainSchemeStageIds");
      expect(config).not.toHaveProperty("gameMode");
      expect(config).not.toHaveProperty("blind");
    },
  );

  test("stage ids of the wrong side are dropped by reconcileWithOffer, with the offer's own problem text", () => {
    const draft = { ...draftFor("registration-iron-man"), civilWar: { stageIds: ["56199b", "56064b"], blind: false } };
    const offer = offerOf(draft);
    const problem = "Rallying Call is a resistance stage; Iron Man leads the registration side (MC56 p. 4)";
    expect(offer.mainSchemeStages!.problem).toBe(problem);
    expect(civilWarPickProblems(draft, offer)).toContain(problem);
    expect(reconcileWithOffer(draft).civilWar!.stageIds).toEqual(recommendedPair("registration-iron-man"));
  });

  test("a set of the other side is dropped; none left means the recommendation", () => {
    const draft = { ...draftFor("registration-iron-man"), modularSetIds: ["paladin", "defenders", "cape_killer"] };
    expect(reconcileWithOffer(draft).modularSetIds).toEqual(["paladin", "cape_killer"]);
    expect(civilWarPickProblems(draft)).toEqual([
      "Defenders is a resistance set; Iron Man leads the registration side (MC56 p. 4)",
    ]);
    expect(reconcileWithOffer({ ...draft, modularSetIds: ["defenders"] }).modularSetIds).toBeNull();
  });

  test("a count outside 3 to 4 is kept: the builder shows the offer's problem", () => {
    const draft = setModularSetIds(draftFor("registration-iron-man"), ["paladin", "cape_killer"]);
    expect(draft.modularSetIds).toEqual(["paladin", "cape_killer"]);
    expect(offerOf(draft).modularSetCount.problem).toBe("Registration: Iron Man uses 3 to 4 modular sets, got 2");
  });
});
