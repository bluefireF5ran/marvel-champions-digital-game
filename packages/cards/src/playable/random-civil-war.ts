/**
 * Random scenario creation for the Civil War box (MC56 p. 5, "Random Scenario Creation"; docs/phase7-wave10.md §3.3,
 * §2.6): side, leader, main scheme stage 1, stage 2 and the modular sets, drawn at random. A pure function of a seed
 * and options that returns ordinary setup options (`wave10Scenario` / `playableScenario`'s `modularSetIds` and
 * `mainSchemeStageIds`), so a random game replays from its options alone. Hiding the stage 2 and the set list while
 * playing blind is the client's job; this only says what was picked.
 *
 * The draws come from the engine's seeded generator in a fixed order: side, leader, stage 1, stage 2, then the sets.
 * Every slot takes its draw whether or not it is pinned, so locking a pick does not move the others.
 */
import type { CivilWarSide } from "@mc/content";
import { createRng, nextUint32, shuffle, type RngState } from "@mc/engine";
import { mainSchemeStagesProblem } from "../main-scheme-stages.js";
import { modularPickCountProblem, modularPickProblem } from "../modular-pool.js";
import { WAVE10_GAME_ENCOUNTER_SETS, wave10MainSchemeCard, wave10ScenarioRecord } from "../wave10/setup.js";
import { civilWarSidesOffer, playableScenarioOffer } from "./scenario-options.js";

export interface RandomCivilWarOptions {
  /** How many modular sets to draw (question 9: the player's choice, 3 or 4). Default 4, as every ready-made scenario has. */
  readonly modularCount?: number;
  /** Pins, which a re-roll keeps. A pinned stage or set fixes the side when nothing else has. */
  readonly side?: CivilWarSide;
  readonly leaderId?: string;
  /** Printed ids (`printedCardId`) of the stage 1 and stage 2 to keep. */
  readonly stage1Id?: string;
  readonly stage2Id?: string;
  /** Modular sets to keep; the rest of the count is drawn. */
  readonly modularSetIds?: readonly string[];
  /** Also draw other products' sets that the leader may use (question 7). Default false: the side's own sets only. */
  readonly includeOtherProducts?: boolean;
}

export interface RandomCivilWarScenario {
  /** The leader's scenario id: `wave10Scenario`'s first argument. */
  readonly scenarioId: string;
  /** Stage 1 then stage 2, by `printedCardId`: `mainSchemeStageIds`. */
  readonly mainSchemeStageIds: readonly [string, string];
  /** `modularSetIds`, pinned sets first. */
  readonly modularSetIds: readonly string[];
}

function pick<T>(items: readonly T[], rng: RngState): readonly [T, RngState] {
  const [raw, next] = nextUint32(rng);
  return [items[raw % items.length] as T, next];
}

/**
 * A random Civil War scenario for `seed`. Throws the validators' own message when the pins cannot go together
 * (a leader with the other side's stage, a set of the other side, a count outside 3 to 4).
 */
export function randomCivilWarScenario(seed: number, options: RandomCivilWarOptions = {}): RandomCivilWarScenario {
  const sides = civilWarSidesOffer();
  const count = options.modularCount ?? 4;
  const pinnedSets = options.modularSetIds ?? [];
  const recordOf = (id: string) => wave10ScenarioRecord(id);

  // The side: the leader's, else the pin, else one a pinned stage or sided set belongs to, else drawn.
  let rng = createRng(seed);
  let drawnSide: CivilWarSide;
  [drawnSide, rng] = pick(
    sides.map((entry) => entry.side),
    rng,
  );
  let side: CivilWarSide | undefined;
  if (options.leaderId !== undefined) side = recordOf(options.leaderId).side;
  side ??= options.side;
  if (side === undefined) {
    for (const entry of sides) {
      const stageIds = entry.leaders.flatMap((leader) =>
        wave10MainSchemeCard(recordOf(leader.scenarioId)).stages.map((stage) => stage.printedCardId as string),
      );
      if (
        [options.stage1Id, options.stage2Id].some((id) => id !== undefined && stageIds.includes(id)) ||
        pinnedSets.some((id) => WAVE10_GAME_ENCOUNTER_SETS.find((set) => set.id === id)?.side === entry.side)
      ) {
        side = entry.side;
        break;
      }
    }
  }
  side ??= drawnSide;
  const sideOffer = sides.find((entry) => entry.side === side)!;
  if (options.leaderId !== undefined && !sideOffer.leaders.some((l) => l.scenarioId === options.leaderId))
    throw new Error(`${options.leaderId} does not lead the ${side} side`);
  if (options.side !== undefined && side !== options.side)
    throw new Error(`${options.leaderId} does not lead the ${options.side} side`);

  let drawnLeader: string;
  [drawnLeader, rng] = pick(
    sideOffer.leaders.map((leader) => leader.scenarioId),
    rng,
  );
  const scenarioId = options.leaderId ?? drawnLeader;
  const scenario = recordOf(scenarioId);
  const offer = playableScenarioOffer(scenarioId);

  const stageOptions = (n: number): readonly string[] =>
    (offer.mainSchemeStages?.stages.find((stage) => stage.stageNumber === n)?.options ?? []).map(
      (option) => option.printedCardId,
    );
  let drawn1: string;
  let drawn2: string;
  [drawn1, rng] = pick(stageOptions(1), rng);
  [drawn2, rng] = pick(stageOptions(2), rng);
  const stageIds: readonly [string, string] = [options.stage1Id ?? drawn1, options.stage2Id ?? drawn2];
  const stageProblem = mainSchemeStagesProblem(scenario, wave10MainSchemeCard(scenario), stageIds, {
    encounterSets: WAVE10_GAME_ENCOUNTER_SETS,
  });
  if (stageProblem) throw new Error(`${scenario.name}: ${stageProblem}`);

  if (new Set(pinnedSets).size !== pinnedSets.length)
    throw new Error(`${scenario.name}: a modular set is chosen twice`);
  for (const id of pinnedSets) {
    const problem = modularPickProblem(scenario, id, WAVE10_GAME_ENCOUNTER_SETS);
    if (problem) throw new Error(`${scenario.name}: ${problem}`);
  }
  const countProblem = modularPickCountProblem(scenario, count);
  if (countProblem) throw new Error(countProblem);
  if (pinnedSets.length > count)
    throw new Error(`${scenario.name}: ${pinnedSets.length} modular sets are kept, more than ${count}`);

  const candidates = (offer.modularSets ?? [])
    .filter((set) => set.ok && !pinnedSets.includes(set.id))
    .filter((set) => set.side === side || (options.includeOtherProducts === true && set.side === null))
    .map((set) => set.id);
  const [shuffled] = shuffle(candidates, rng);
  const modularSetIds = [...pinnedSets, ...shuffled.slice(0, count - pinnedSets.length)];
  if (modularSetIds.length < count)
    throw new Error(`${scenario.name}: only ${modularSetIds.length} modular sets can be drawn for ${count}`);
  return { scenarioId, mainSchemeStageIds: stageIds, modularSetIds };
}
