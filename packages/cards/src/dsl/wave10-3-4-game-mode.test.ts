/**
 * docs/phase7-wave10.md §3.4, docs/competitive-mode-plan.md §4 tasks 1 and 6: the DSL side of the game mode.
 * `inCompetitiveMode()` is the condition of a printed "In competitive mode, …. Otherwise, …" clause and
 * `competitiveOnly("…")` stands for the part of it that is not built, so the clause is in the script and listed. The
 * engine's `game-mode.test.ts` drives the same shapes on a state marked competitive.
 *
 * The game here is a real Core game: Helicarrier's action is rebound to a clause of that shape (Neighborhood Hero,
 * `cw` 56183, with a constant amount), so the cooperative branch resolves through the real play and use commands.
 */

import { describe, expect, it } from "vitest";
import type { EngineDeps } from "@mc/engine";
import { CORE_DEPS } from "../core/index.js";
import { coreScenario } from "../core/setup.js";
import {
  mainThreat,
  moveToHand,
  P1,
  payWith,
  play,
  playerOf,
  runWith,
  startCoreGame,
  use,
} from "../testing/harness.js";
import { action } from "./abilities.js";
import { chooseOne, competitiveOnly, ifThen, option, placeThreat } from "./effects.js";
import { competitiveOnlyTexts, validateDefinition } from "./validate.js";
import { inCompetitiveMode, inMode, theMainScheme } from "./values.js";

const PRINTED = "In competitive mode, move 2 threat from the main scheme in your area to the enemy team's main scheme.";
const CLAUSE = action(ifThen(inCompetitiveMode(), competitiveOnly(PRINTED), placeThreat(2, theMainScheme)));
const MISPLACED = "competitiveOnly: only in the competitive branch of an if on inCompetitiveMode()";

describe("§3.4 inCompetitiveMode and competitiveOnly", () => {
  it("emit the engine's plain specs", () => {
    expect(inCompetitiveMode()).toEqual({ kind: "gameMode", is: "competitive" });
    expect(competitiveOnly(PRINTED)).toEqual({ kind: "competitiveOnly", text: PRINTED });
    expect(CLAUSE.effects).toEqual([
      {
        kind: "if",
        condition: { kind: "gameMode", is: "competitive" },
        then: [{ kind: "competitiveOnly", text: PRINTED }],
        otherwise: [{ kind: "placeThreat", target: { kind: "mainScheme" }, amount: { kind: "const", value: 2 } }],
      },
    ]);
  });

  it("the clause validates, and its marker is listed", () => {
    expect(validateDefinition(CLAUSE)).toEqual([]);
    expect(competitiveOnlyTexts(CLAUSE)).toEqual([PRINTED]);
    expect(competitiveOnlyTexts(action(placeThreat(2, theMainScheme)))).toEqual([]);
  });

  it("a marker nested under the competitive branch validates and is listed in script order", () => {
    const definition = action(
      ifThen(inCompetitiveMode(), [
        competitiveOnly("first"),
        chooseOne(option("One", competitiveOnly("second")), option("Other", placeThreat(1, theMainScheme))),
      ]),
    );
    expect(validateDefinition(definition)).toEqual([]);
    expect(competitiveOnlyTexts(definition)).toEqual(["first", "second"]);
  });

  it("the validator refuses a marker a cooperative game would reach", () => {
    expect(validateDefinition(action(competitiveOnly(PRINTED)))).toEqual([MISPLACED]);
    expect(
      validateDefinition(action(ifThen(inCompetitiveMode(), placeThreat(2, theMainScheme), competitiveOnly(PRINTED)))),
    ).toEqual([MISPLACED]);
    expect(validateDefinition(action(ifThen(inMode("expert"), competitiveOnly(PRINTED))))).toEqual([MISPLACED]);
  });

  it("the validator refuses a marker with no printed text", () => {
    expect(validateDefinition(action(ifThen(inCompetitiveMode(), competitiveOnly(" "))))).toEqual([
      "competitiveOnly: give the printed text it stands for",
    ]);
  });

  it("a real cooperative game resolves the otherwise branch: 2 threat on the main scheme", () => {
    const deps: EngineDeps = { abilities: { ...CORE_DEPS.abilities, "01092.helicarrier-action": CLAUSE } };
    const config = coreScenario("rhino", { players: [{ starterDeckId: "core-spider-man-justice" }], seed: 11 });
    const given = moveToHand(startCoreGame(config, deps), P1, "01092");
    const [helicarrier] = given.ids as [never];
    const inPlay = runWith(deps, given.state, play(P1, helicarrier, payWith(given.state, P1, 3, given.ids)));
    expect(playerOf(inPlay, P1).playArea).toContain(helicarrier);
    const before = mainThreat(inPlay);
    const after = runWith(deps, inPlay, use(P1, helicarrier, "01092.helicarrier-action"));
    expect(mainThreat(after)).toBe(before + 2);
    expect(after.pendingChoice).toBeNull();
    expect("gameMode" in after).toBe(false);
  });

  it("coreScenario passes the mode, and the engine refuses competitive", () => {
    const options = { players: [{ starterDeckId: "core-spider-man-justice" }], seed: 11 } as const;
    expect("gameMode" in coreScenario("rhino", options)).toBe(false);
    expect(coreScenario("rhino", { ...options, gameMode: "competitive" }).gameMode).toBe("competitive");
    expect(() => startCoreGame(coreScenario("rhino", { ...options, gameMode: "competitive" }))).toThrow(
      "setup failed: Competitive mode is coming soon. Play this scenario cooperatively for now.",
    );
  });
});
