import {
  CORE_STARTER_DECKS,
  WAVE10_ENCOUNTER_SETS,
  WAVE10_SCENARIOS,
  WAVE10_STARTER_DECKS,
  difficultyEncounterSetIds,
  difficultyOf,
  difficultySetChoiceErrors,
  type AnyCard,
  type CardId,
  type EncounterSet,
  type MainSchemeCard,
  type Scenario,
} from "@mc/content";
import type { GameSetupConfig, PlayerSetup } from "@mc/engine";
import {
  checkScenarioSetupOptions,
  encounterCardsOf,
  modularSetupCardIds,
  resolveModes,
  setSeparateDecks,
  type CoreDifficulty,
  type CorePlayer,
  type CoreScenarioOptions,
} from "../core/setup.js";
import { chooseMainSchemeStages } from "../main-scheme-stages.js";
import {
  PLAYABLE_ENCOUNTER_SETS,
  checkModularPickCount,
  chooseModularSets,
  extraModularCardIds,
} from "../modular-pool.js";
import { withoutBackFaces } from "../wave9/setup.js";
import { WAVE10_CARDS } from "./cards.js";

export type Wave10Difficulty = CoreDifficulty;

/**
 * The choices of one Civil War game (MC56 pp. 4-5). The side and the leader are the scenario id; the rest are options,
 * each defaulting to the leader's preconstructed scenario (MC56 pp. 7-8):
 *
 * - `modularSetIds`: three or four modular sets, none of the other side; a neutral set from another product counts as
 *   one of them (MC56 p. 5, "Further Customization"; docs/phase7-wave10.md section 4.1, question 7 = A).
 * - `mainSchemeStageIds` (`CoreScenarioOptions`): one stage 1 and one stage 2 of the leader's side, by the id of each
 *   stage's printed B face, stage 1 first.
 * - `difficulty` / `modes`: leader stages I and II in standard mode, III and IV in expert mode, with the Expert set.
 * - `gameMode`: passed to the engine, which refuses `"competitive"` with the code `mode_unavailable`.
 */
export interface Wave10ScenarioOptions extends Omit<CoreScenarioOptions, "cardPool" | "difficulty"> {
  readonly difficulty?: Wave10Difficulty;
  /** Extra modular sets shuffled in on top, never counted (`EncounterSet.extraModular`). */
  readonly extraModularSetIds?: readonly string[];
}

/**
 * Every encounter set a Civil War game can name: the playable sets and the wave's own, each once. The wave is not
 * joined to `modular-pool.ts`'s playable list yet, so its sets are added here (as `wave9/setup.ts` did for wave 9).
 */
export const WAVE10_GAME_ENCOUNTER_SETS: readonly EncounterSet[] = [
  ...new Map(
    [...PLAYABLE_ENCOUNTER_SETS, ...WAVE10_ENCOUNTER_SETS].map((set) => [set.id as string, set] as const),
  ).values(),
];

const cardsById = new Map<string, AnyCard>(WAVE10_CARDS.map((card) => [card.id, card]));

/** A `WAVE10_SCENARIOS` record (one per leader), or a throw naming the id. */
export function wave10ScenarioRecord(scenarioId: string): Scenario {
  const record = WAVE10_SCENARIOS.find((scenario) => scenario.id === scenarioId);
  if (!record) throw new Error(`no wave 10 scenario ${scenarioId}`);
  return record;
}

/** The scenario's main scheme card: the one card that holds every stage of its side. */
export function wave10MainSchemeCard(scenario: Scenario): MainSchemeCard {
  const card = cardsById.get(scenario.mainSchemeCardId);
  if (!card || card.type !== "main_scheme") throw new Error(`${scenario.mainSchemeCardId} is not a main scheme`);
  return card;
}

/**
 * A wave 10 hero (`tigra-aggression`, `hulkling-protection`) or Core starter deck as a player seat, quantities
 * expanded.
 */
export function wave10StarterDeckSetup(starterDeckId: string): PlayerSetup {
  const starter = [...WAVE10_STARTER_DECKS, ...CORE_STARTER_DECKS].find((d) => d.id === starterDeckId);
  if (!starter) throw new Error(`no wave 10 or Core starter deck ${starterDeckId}`);
  return {
    identityCardId: starter.identityCardId as CardId,
    aspects: starter.aspects,
    deck: starter.cards.flatMap(({ cardId: id, quantity }) => Array.from({ length: quantity }, () => id)),
  };
}

const seatsOf = (players: readonly CorePlayer[]): PlayerSetup[] =>
  players.map((seat) => {
    if ("starterDeckId" in seat) return wave10StarterDeckSetup(seat.starterDeckId);
    return {
      identityCardId: seat.identityCardId as CardId,
      deck: seat.deck as readonly CardId[],
      ...(seat.aspects ? { aspects: seat.aspects } : {}),
    };
  });

/**
 * A Civil War scenario's `GameSetupConfig` from its leader's record (`registration-iron-man`,
 * `registration-captain-marvel`, `resistance-captain-america`, `resistance-spider-woman`) and the players' choices:
 * the four preconstructed scenarios with no choices, any custom scenario with them (MC56 pp. 4-5, steps 1 to 4). Throws
 * for any other id and for a choice the rules forbid.
 *
 * - **Leader**: the record's villain card, started at the difficulty's first stage (I, or III in expert mode) and
 *   ending at its second (II or IV); MC56 p. 4 and each stage 1A's "Contents" line.
 * - **Main scheme deck**: the chosen stage 1 over the chosen stage 2 of the side's one main scheme card, handed to the
 *   engine as `mainSchemeStageIndexes` (`chooseMainSchemeStages`).
 * - **Encounter deck**: the leader's set, the three or four modular sets, the Standard set and, in expert mode, the
 *   Expert set. The side's main scheme set and the competitive-only Standard PvP sets are never in it. The leader's
 *   permanent attachment and side scheme stay in the deck: the leader's and stage 1A's "Setup" abilities find them
 *   there (docs/phase7-wave10.md section 2), so nothing is set aside by this builder.
 * - **Same name on both sides of the table** (question 5 = A): a hero may face the leader of the same name in a
 *   cooperative game, so no seat is refused for it.
 */
export function wave10Scenario(scenarioId: string, options: Wave10ScenarioOptions): GameSetupConfig {
  checkScenarioSetupOptions(scenarioId, options.setupOptions);
  const scenario = wave10ScenarioRecord(scenarioId);
  const modes = resolveModes(options.difficulty, options.modes);
  const difficulty = difficultyOf(modes);
  const villain = cardsById.get(scenario.villainCardId);
  if (!villain || villain.type !== "villain") throw new Error(`${scenario.villainCardId} is not a villain`);
  const side = villain.sides[0];
  if (!side) throw new Error(`${villain.name} has no sides`);
  const stageIndex = (stageNumber: number): number => {
    const index = side.stages.findIndex((stage) => stage.stageNumber === stageNumber);
    if (index < 0) throw new Error(`${villain.name} has no stage ${stageNumber}`);
    return index;
  };
  const [firstStage, lastStage] = scenario.villainStages[difficulty];
  if (options.players.length < 1 || options.players.length > 4) throw new Error("a game has 1-4 players");

  checkModularPickCount(scenario, options.modularSetIds);
  const modular = chooseModularSets(scenario, WAVE10_GAME_ENCOUNTER_SETS, {
    ...options,
    playerCount: options.players.length,
  });
  if (options.difficultySets) {
    const errors = difficultySetChoiceErrors(options.difficultySets, WAVE10_GAME_ENCOUNTER_SETS);
    if (errors.length > 0) throw new Error(`${scenario.name}: difficultySets: ${errors.join("; ")}`);
  }
  const mainSchemeStageIndexes = chooseMainSchemeStages(
    scenario,
    wave10MainSchemeCard(scenario),
    options.mainSchemeStageIds,
    { cards: WAVE10_CARDS, encounterSets: WAVE10_GAME_ENCOUNTER_SETS },
  );

  const sets = [
    ...scenario.encounterSetIds,
    ...modular.modularSetIds,
    ...difficultyEncounterSetIds(scenario, difficulty, options.difficultySets),
  ];
  // A double-sided encounter card is one card: its front face.
  const encounterDeck = withoutBackFaces([
    ...encounterCardsOf(sets, WAVE10_CARDS),
    ...modularSetupCardIds(modular.modularSetIds, WAVE10_CARDS),
    ...extraModularCardIds(modular.extraModularSetIds, WAVE10_CARDS),
  ]);
  const separateDecks = setSeparateDecks(sets);
  return {
    seed: options.seed,
    cards: WAVE10_CARDS,
    villainCardId: scenario.villainCardId,
    villainSide: side.side,
    villainStartStageIndex: stageIndex(firstStage),
    villainLastStageIndex: stageIndex(lastStage),
    mainSchemeCardId: scenario.mainSchemeCardId,
    ...(mainSchemeStageIndexes ? { mainSchemeStageIndexes } : {}),
    encounterDeck,
    players: seatsOf(options.players),
    ...(separateDecks.length > 0 ? { scenarioDecks: separateDecks } : {}),
    includeIdentitySets: true,
    requireIdentitySets: true,
    requireLegalDecks: true,
    ...(difficulty === "expert" ? { difficulty: "expert" as const } : {}),
    ...(options.firstPlayerIndex !== undefined ? { firstPlayerIndex: options.firstPlayerIndex } : {}),
    ...(options.stack ? { stack: options.stack } : {}),
    ...(options.gameMode !== undefined ? { gameMode: options.gameMode } : {}),
  };
}
