/**
 * docs/phase7-wave10.md §3.13: a main scheme stage that gains hinder under a condition, in real Civil War games
 * (`wave10Scenario`, Registration: Iron Man, stages Cut Off Support 56063b and Negative Zone Prison 56064b, cooperative
 * mode, one to four starter decks). The engine side is driven by
 * `packages/engine/src/main-scheme-stage-hinder.test.ts`.
 *
 * The real card is Cut Off Support 56063b: "If there is more than 1 player on your team, this stage gains hinder
 * 2[per_hero]." (starting threat 0, target threat 7 per player). Its module is scripted elsewhere, so this file
 * registers its own script of that sentence over the wave's registry, and rebinds Helicarrier's action (01092, in the
 * Core Spider-Man starter deck) to "advance the main scheme" so stage 2B is reached through a real command.
 *
 * Sources: RRG 1.8 "Hinder X" (p. 22): "A card with the hinder X keyword enters play with X threat on it"; MC56 p. 9:
 * "When a card with hinder X enters play, place X threat on that card."; RRG 1.8 "Per Player Icon" (p. 32).
 */

import {
  createGame,
  keywordTotal,
  mainSchemeValue,
  type EngineDeps,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import {
  P1,
  firstLegal,
  mainThreat,
  moveToHand,
  payWith,
  play,
  playerOf,
  runWith,
  settle,
  use,
} from "../testing/harness.js";
import { wave10Scenario } from "../wave10/setup.js";
import { HULKLING_DECK, IRON_MAN_SCENARIO, TIGRA_DECK, WAVE10_DEPS } from "../wave10/testing.js";
import { action, constant, gainsKeywordX } from "./abilities.js";
import { advanceMainScheme } from "./effects.js";
import { defineAbilities, validateDefinition } from "./validate.js";
import { identityOf, perHero, refCount, valueAtLeast, yourTeam } from "./values.js";

vi.setConfig({ testTimeout: 120_000 });

const HELICARRIER = "01092";
const HELICARRIER_ACTION = "01092.helicarrier-action";

/** "If there is more than 1 player on your team, this stage gains hinder 2[per_hero]." */
const cutOffSupport = constant(
  gainsKeywordX("hinder", perHero(2), { self: true }, { while: valueAtLeast(refCount(identityOf(yourTeam)), 2) }),
);
const SCRIPTS = defineAbilities({
  "56063b.cut-off-support-constant": cutOffSupport,
  [HELICARRIER_ACTION]: action(advanceMainScheme()),
});
const deps: EngineDeps = { ...WAVE10_DEPS, abilities: { ...WAVE10_DEPS.abilities, ...SCRIPTS } };

const SEATS = [
  { starterDeckId: "core-spider-man-justice" },
  { starterDeckId: TIGRA_DECK },
  { starterDeckId: HULKLING_DECK },
  { starterDeckId: "core-she-hulk-aggression" },
] as const;

/** A Registration: Iron Man game past setup, at the first player's turn, with every setup event. */
function game(players: 1 | 2 | 3 | 4) {
  const config = wave10Scenario(IRON_MAN_SCENARIO, {
    players: SEATS.slice(0, players),
    seed: 7,
    mainSchemeStageIds: ["56063b", "56064b"],
  });
  const created = createGame(config, deps);
  if (!created.ok) throw new Error(`${created.error.code}: ${created.error.message}`);
  return settle(created.state, firstLegal, (s) => s.step.phase === "player", deps);
}

const scheme = (state: GameState): InstanceId => state.mainScheme.instanceId;
const hinder = (state: GameState): number => keywordTotal(state, scheme(state), "hinder", deps);
const target = (state: GameState): number => mainSchemeValue(state, "targetThreat", deps);

/** Player 1 plays Helicarrier and uses its rebound action: the main scheme advances to stage 2. */
function advanced(state: GameState): GameState {
  const given = moveToHand(state, P1, HELICARRIER);
  const [helicarrier] = given.ids as [InstanceId];
  const inPlay = runWith(deps, given.state, play(P1, helicarrier, payWith(given.state, P1, 3, given.ids)));
  expect(playerOf(inPlay, P1).playArea).toContain(helicarrier);
  return settle(
    runWith(deps, inPlay, use(P1, helicarrier, HELICARRIER_ACTION)),
    firstLegal,
    (s) => !s.pendingChoice,
    deps,
  );
}

describe("§3.13 Cut Off Support: 'if there is more than 1 player on your team, this stage gains hinder 2[per_hero]'", () => {
  it("the script is plain data, and the validator accepts it", () => {
    expect(cutOffSupport.trigger).toEqual({
      kind: "constant",
      keywordGrants: [
        {
          keyword: { name: "hinder", value: 0 },
          target: { self: true },
          value: { kind: "perPlayer", base: 0, perPlayer: 2 },
          while: {
            kind: "compare",
            left: { kind: "refCount", of: { kind: "identityOf", player: { kind: "team", of: "yours" } } },
            op: "atLeast",
            right: { kind: "const", value: 2 },
          },
        },
      ],
    });
    expect(validateDefinition(cutOffSupport)).toEqual([]);
    expect(JSON.parse(JSON.stringify(cutOffSupport))).toEqual(cutOffSupport);
  });

  it("one player: the stage has no hinder and opens with 0 threat, target 7", () => {
    const state = game(1);
    expect(state.mainScheme.stageIndex).toBe(0);
    expect(hinder(state)).toBe(0);
    expect(mainThreat(state)).toBe(0);
    expect(target(state)).toBe(7);
  });

  it.each([
    [2, 4, 14],
    [4, 8, 28],
  ] as const)("%i players: hinder 2 per player, so the stage opens with %i threat, target %i", (players, threat, t) => {
    const state = game(players);
    expect(hinder(state)).toBe(threat);
    expect(mainThreat(state)).toBe(threat);
    expect(target(state)).toBe(t);
  });

  it("the stage 2 advanced to (Negative Zone Prison) has no hinder: 0 threat, with two players", () => {
    const before = game(2);
    expect(mainThreat(before)).toBe(4);
    const after = advanced(before);
    expect(after.mainScheme.stageIndex).toBe(1);
    expect(after.mainScheme.faceupSide).toBeUndefined();
    expect(hinder(after)).toBe(0);
    expect(mainThreat(after)).toBe(0);
    expect(target(after)).toBe(18);
  });
});
