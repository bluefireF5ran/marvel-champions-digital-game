/**
 * A main scheme deck made of chosen stages (docs/phase7-wave10.md §3.1; MC56 pp. 4-5, step 4: "Select one stage 1 main
 * scheme and one stage 2 main scheme from the chosen side. Place the stage 1 main scheme on top of the stage 2 main
 * scheme."). A Civil War side's eight stages are one `MainSchemeCard`, each stage keyed by the id of its printed B face
 * (`MainSchemeStage.printedCardId`), and `Scenario.mainSchemeStages` says a setup chooses among them and which pair the
 * rulebook recommends. This module turns the players' picks into `GameSetupConfig.mainSchemeStageIndexes` and lists
 * the options a setup screen shows.
 *
 * What a legal deck is belongs to the engine (`mainSchemeStageIndexesProblem`: one stage of each number, ascending,
 * none twice); this module adds only what the engine cannot know from indexes, that a pick names a stage of this card
 * at all, and says so in terms of the side when the stage is the other side's.
 */
import {
  PLAYABLE_CARDS,
  type AnyCard,
  type EncounterSet,
  type MainSchemeCard,
  type ScalingValue,
  type Scenario,
} from "@mc/content";
import { mainSchemeStageIndexesProblem } from "@mc/engine";
import { PLAYABLE_ENCOUNTER_SETS, scenarioSideClause } from "./modular-pool.js";

export interface MainSchemeStageContext {
  /** Where a pick that is not a stage of the scenario's card is looked up, to name it. Default `PLAYABLE_CARDS`. */
  readonly cards?: readonly AnyCard[];
  /** The sets that say which side a main scheme card is on. Default `PLAYABLE_ENCOUNTER_SETS`. */
  readonly encounterSets?: readonly EncounterSet[];
}

/** Why `id` is not a stage of `card`: the other side's stage by name and side, anything else by id. */
function unknownStageProblem(
  scenario: Scenario,
  card: MainSchemeCard,
  id: string,
  context: MainSchemeStageContext,
): string {
  for (const other of context.cards ?? PLAYABLE_CARDS) {
    if (other.type !== "main_scheme" || other.id === card.id) continue;
    const stage = other.stages.find((candidate) => candidate.printedCardId === id);
    if (!stage) continue;
    const side = (context.encounterSets ?? PLAYABLE_ENCOUNTER_SETS).find(
      (set) => other.encounterSetIds.includes(set.id) && set.side !== undefined,
    )?.side;
    if (side !== undefined && scenario.side !== undefined && side !== scenario.side)
      return `${stage.name ?? other.name} is a ${side} stage; ${scenarioSideClause(scenario)} (MC56 p. 4)`;
    return `${stage.name ?? other.name} is a stage of ${other.name}, not of ${card.name}`;
  }
  return `${id} is not a stage of ${card.name}`;
}

/**
 * The stage indexes of `card` that `picks` name, or why they are not a main scheme deck for `scenario`. `picks` are
 * `printedCardId`s, one per stage number, in stage order; absent is the record's recommended pair.
 */
function resolveStagePicks(
  scenario: Scenario,
  card: MainSchemeCard,
  picks: readonly string[] | undefined,
  context: MainSchemeStageContext,
): { readonly indexes: readonly number[] | undefined } | { readonly problem: string } {
  if (card.id !== scenario.mainSchemeCardId) return { problem: `${card.name} is not this scenario's main scheme` };
  if (!scenario.mainSchemeStages) {
    if (picks === undefined) return { indexes: undefined };
    return { problem: "the main scheme's stages are not a setup choice at this scenario" };
  }
  const indexes: number[] = [];
  for (const id of picks ?? scenario.mainSchemeStages.recommended) {
    const index = card.stages.findIndex((stage) => stage.printedCardId === id);
    if (index < 0) return { problem: unknownStageProblem(scenario, card, id, context) };
    indexes.push(index);
  }
  const problem = mainSchemeStageIndexesProblem(card, indexes);
  return problem ? { problem } : { indexes };
}

/** Why `picks` cannot be `scenario`'s main scheme deck, or null when they can. Worded for a player. */
export function mainSchemeStagesProblem(
  scenario: Scenario,
  card: MainSchemeCard,
  picks: readonly string[] | undefined,
  context: MainSchemeStageContext = {},
): string | null {
  const resolved = resolveStagePicks(scenario, card, picks, context);
  return "problem" in resolved ? resolved.problem : null;
}

/**
 * `GameSetupConfig.mainSchemeStageIndexes` for a game of `scenario`: the picked stages of its main scheme card, the
 * recommended pair when there are no picks, and `undefined` for a scenario whose stages are not a choice (every stage
 * of the card in printed order, the engine's default). Throws `"<scenario name>: <problem>"` on an illegal pick.
 */
export function chooseMainSchemeStages(
  scenario: Scenario,
  card: MainSchemeCard,
  picks?: readonly string[],
  context: MainSchemeStageContext = {},
): readonly number[] | undefined {
  const resolved = resolveStagePicks(scenario, card, picks, context);
  if ("problem" in resolved) throw new Error(`${scenario.name}: ${resolved.problem}`);
  return resolved.indexes;
}

export interface MainSchemeStageOption {
  /** The stage's key: what `mainSchemeStageIds` takes, and the card id its art is filed under. */
  readonly printedCardId: string;
  readonly name: string;
  readonly stageNumber: number;
  readonly targetThreat: ScalingValue;
  /** One sentence of the stage's own text: what sets it apart from the other stages of its number. */
  readonly gist: string;
}

export interface MainSchemeStagesOffer {
  /** One entry per stage number, ascending; a setup picks one option from each. */
  readonly stages: readonly { readonly stageNumber: number; readonly options: readonly MainSchemeStageOption[] }[];
  /** The rulebook's pair for this leader (`Scenario.mainSchemeStages.recommended`), one `printedCardId` per number. */
  readonly recommended: readonly string[];
}

/** A sentence ends at ". " or the end of the line, but not after a one-letter abbreviation ("S.H.I.E.L.D. Recruits"). */
function firstSentence(line: string): string {
  for (const match of line.matchAll(/[.!?]\)?(?=\s|$)/g)) {
    const at = match.index;
    if (line[at] === "." && /^(?:|.*[\s.(])[A-Z]$/.test(line.slice(0, at))) continue;
    return line.slice(0, at + match[0].length);
  }
  return line;
}

/**
 * The first sentence of a stage's text that is its own. Every Civil War stage 1 opens with the same hinder line ("If
 * there is more than 1 player on your team, this stage gains hinder ..."), which tells a player nothing about the
 * choice, so that line is passed over when the stage prints anything else.
 */
export function mainSchemeStageGist(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const own = lines.filter((line) => !/\bgains hinder\b/i.test(line));
  const line = own[0] ?? lines[0];
  // A leading "[star]" marks text that is also a reminder icon on the card; it is not part of the sentence.
  return line === undefined ? "" : firstSentence(line.replace(/^\[star\]\s*/, ""));
}

/** The stage choices of `scenario`, or null when its main scheme deck is not a setup choice. */
export function mainSchemeStagesOffer(scenario: Scenario, card: MainSchemeCard): MainSchemeStagesOffer | null {
  if (!scenario.mainSchemeStages || card.id !== scenario.mainSchemeCardId) return null;
  const numbers = [...new Set(card.stages.map((stage) => stage.stageNumber))].sort((a, b) => a - b);
  return {
    stages: numbers.map((stageNumber) => ({
      stageNumber,
      options: card.stages
        .filter((stage) => stage.stageNumber === stageNumber && stage.printedCardId !== undefined)
        .map((stage) => ({
          printedCardId: stage.printedCardId as string,
          name: stage.name ?? card.name,
          stageNumber,
          targetThreat: stage.targetThreat,
          gist: mainSchemeStageGist(stage.text.current),
        })),
    })),
    recommended: scenario.mainSchemeStages.recommended,
  };
}
