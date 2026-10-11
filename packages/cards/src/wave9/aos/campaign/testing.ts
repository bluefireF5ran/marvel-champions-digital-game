/**
 * Scaffolding for the Agents of S.H.I.E.L.D. campaign modules' tests (docs/phase7-wave9.md sections 3.73 to 3.77): a
 * small `CampaignDefinition` over the real cards and the real scenarios that wires the three effect builders under test
 * (`prepareBoard`, `evidenceSetupOf`, the Victory records) the way the box's definition will, and a real game built from
 * a composed log the way a client must build it. It is not the box's definition (`campaigns/aos.ts`, spec item 77) and
 * holds none of its other instructions. Not a test file and imported by tests only.
 */
import { CORE_STARTER_DECKS, campaignId, cardId, scenarioId } from "@mc/content";
import type { PlayModes } from "@mc/content";
import {
  applyCampaignResult,
  campaignResultOf,
  createCampaignLog,
  createGame,
  resolveBetweenGames,
  startGameFromLog,
  type CampaignDefinition,
  type CampaignDeps,
  type CampaignInstruction,
  type CampaignLog,
  type CampaignNode,
  type CampaignOp,
  type CampaignSeatSetup,
  type EffectSpec,
  type GameEvent,
  type GameState,
} from "@mc/engine";
import { seedHiddenPiles } from "../../../dsl/index.js";
import { WAVE9_CARDS as CARDS } from "../../cards.js";
import { WAVE9_DEPS } from "../../index.js";
import { wave9Scenario } from "../../setup.js";
import {
  BOARD_SET_ASIDE_OPS,
  BOARD_WORKING_WRITES,
  CLEAN_BOARD_MEMBERS_FIELD,
  BOARD_MEMBER_FRONTS,
  SCENARIO_ONE_BOARD,
  prepareBoard,
  recordSecrets,
  recordedBoard,
  type BoardSource,
} from "./executive-board.js";
import { evidenceSetupOf, EVIDENCE_SETUPS } from "./executive-board-evidence.js";

export const TEST_CAMPAIGN = campaignId("aos-modules-test");
export const STANDARD: PlayModes = { campaign: { campaignId: TEST_CAMPAIGN } };
export const EXPERT: PlayModes = { campaign: { campaignId: TEST_CAMPAIGN, expertCampaign: true }, expert: true };
export const DEPS: CampaignDeps = { pool: CARDS };

const KINDS = {
  means: ["50185", "50186", "50187"],
  motive: ["50188", "50189", "50190"],
  opportunity: ["50191", "50192", "50193"],
} as const;
export const ALL_EVIDENCE: readonly string[] = Object.keys(EVIDENCE_SETUPS);

const slot = (name: string) => ({ kind: "choice" as const, slot: name });
const between = (id: string, ops: readonly CampaignOp[]): CampaignInstruction => ({
  id,
  text: "test",
  citation: "test",
  step: { kind: "betweenGames", ops },
});
const inGame = (
  id: string,
  window: "beforeStartingHands" | "afterMulligans",
  effects: readonly EffectSpec[],
  when?: CampaignInstruction["when"],
): CampaignInstruction => ({
  id,
  text: "test",
  citation: "test",
  ...(when ? { when } : {}),
  step: { kind: "inGame", window, effects },
});

/** "Prepare the evidence": one sealed draw from each kind's three cards into the hidden envelope; evidence cleared. */
const PREPARE: readonly CampaignOp[] = [
  ...(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((kind): CampaignOp => ({
    kind: "random",
    slot: kind,
    from: { kind: "cards", cardIds: KINDS[kind].map(cardId) },
    sealed: true,
  })),
  { kind: "setField", field: "aimEnvelope", value: slot("means") },
  { kind: "appendToList", field: "aimEnvelope", value: slot("motive") },
  { kind: "appendToList", field: "aimEnvelope", value: slot("opportunity") },
  { kind: "clearField", field: "evidence" },
];

/** "Gain one evidence card": one of the cards in neither the envelope nor the evidence gained (open draw). */
const GAIN: readonly CampaignOp[] = [
  {
    kind: "random",
    slot: "gained",
    from: {
      kind: "excludingTitles",
      from: {
        kind: "excludingTitles",
        from: { kind: "cards", cardIds: ALL_EVIDENCE.map(cardId) },
        titlesIn: { kind: "field", field: "aimEnvelope" },
      },
      titlesIn: { kind: "field", field: "evidence" },
    },
  },
  { kind: "appendToList", field: "evidence", value: slot("gained") },
];

const composition: readonly CampaignInstruction[] = [between("test.compose.board", BOARD_SET_ASIDE_OPS)];

/** Scenario N's Victory the way the box prints it: the secrets recorded, the working numbers, the gain. */
const victoryOf = (secretsField: string): readonly CampaignInstruction[] => [
  {
    id: `test.${secretsField}.record`,
    text: "Record the number of secret counters on each Board Member card.",
    citation: "MC50 p. 9",
    step: { kind: "record", writes: [recordSecrets(secretsField)] },
  },
  {
    id: `test.${secretsField}.working`,
    text: "Record the Board Member environments in play and those with no secret counter.",
    citation: "MC50 p. 9",
    step: { kind: "record", writes: BOARD_WORKING_WRITES },
  },
  {
    ...between(`test.${secretsField}.gain`, GAIN),
    when: { kind: "fieldAtLeast", field: CLEAN_BOARD_MEMBERS_FIELD, amount: 1 },
  },
];

/** Every evidence card's Setup, one instruction for each card in the log's `evidence` (in card id order here). */
const evidenceSetups: readonly CampaignInstruction[] = ALL_EVIDENCE.map((id) =>
  inGame(`test.evidence.${id}`, "afterMulligans", [...evidenceSetupOf(id)], {
    kind: "fieldContains",
    field: "evidence",
    value: id,
  }),
);

const boardOf = (id: string, source: BoardSource): CampaignInstruction =>
  inGame(id, "beforeStartingHands", [...prepareBoard(source)]);

const node = (id: string, scenario: string, over: Partial<CampaignNode>): CampaignNode => ({
  id,
  label: id,
  scenario: { kind: "fixed", scenarioId: scenarioId(scenario) },
  setup: [],
  victory: [],
  ...over,
});

const fields = [
  ...["secrets1", "secrets2", "secrets3", "secrets4"].map((id) => ({
    id,
    label: id,
    scope: "shared" as const,
    type: { kind: "cardState" as const, cardIds: BOARD_MEMBER_FRONTS.map(cardId) },
    citation: "MC50 p. 24",
  })),
  {
    id: "aimEnvelope",
    label: "A.I.M. envelope",
    scope: "shared" as const,
    type: { kind: "cardList" as const },
    hidden: true as const,
    citation: "MC50 p. 5",
  },
  {
    id: "evidence",
    label: "Evidence gained",
    scope: "shared" as const,
    type: { kind: "cardList" as const },
    citation: "MC50 p. 24",
  },
  {
    id: "boardEnvironments",
    label: "Board environments",
    scope: "shared" as const,
    type: { kind: "number" as const, min: 0 },
    working: true as const,
    citation: "MC50 p. 9",
  },
  {
    id: "cleanBoardMembers",
    label: "Clean members",
    scope: "shared" as const,
    type: { kind: "number" as const, min: 0 },
    working: true as const,
    citation: "MC50 p. 9",
  },
];

function definitionOf(nodes: readonly CampaignNode[]): CampaignDefinition {
  return {
    campaignId: TEST_CAMPAIGN,
    version: "1",
    logFields: fields,
    loss: { retry: "free", retryBaseline: "nodeStart" },
    graph: { kind: "linear", nodes },
  };
}

/**
 * Scenario 1 (Black Widow, prepared evidence, the board with two counters each), then scenario 2 (Batroc: the board
 * restored from `secrets1`, and the Setup of every evidence card gained).
 */
export const BOARD_DEFINITION: CampaignDefinition = definitionOf([
  node("one", "black-widow", {
    composition,
    setup: [between("test.one.evidence", PREPARE), boardOf("test.one.board", SCENARIO_ONE_BOARD)],
    victory: victoryOf("secrets1"),
  }),
  node("two", "batroc", {
    composition,
    setup: [boardOf("test.two.board", recordedBoard("secrets1")), ...evidenceSetups],
    victory: victoryOf("secrets2"),
  }),
]);

/**
 * One Baron Zemo game of a campaign whose log holds a prepared envelope and `gained` evidence cards: Zemo's own Setup
 * deals nothing; the piles come from `seedHiddenPiles`, the step the box's definition writes.
 */
export const zemoDefinition = (gained: number): CampaignDefinition =>
  definitionOf([
    node("zemo", "baron-zemo", {
      setup: [
        between("test.zemo.evidence", [...PREPARE, ...Array.from({ length: gained }, () => GAIN).flat()]),
        inGame("test.zemo.piles", "beforeStartingHands", [
          seedHiddenPiles({ aim: "aimEnvelope" }, "evidence", { set: "executive_board_evidence", to: "shield" }),
        ]),
      ],
    }),
  ]);

const seat = (starterDeckId: string, seatNumber: number): CampaignSeatSetup => {
  const starter = CORE_STARTER_DECKS.find((deck) => (deck.id as string) === starterDeckId);
  if (!starter) throw new Error(`no Core starter deck "${starterDeckId}"`);
  return {
    seatNumber,
    identityCardId: starter.identityCardId,
    deck: { identityCardId: starter.identityCardId, aspects: starter.aspects, cards: starter.cards },
  };
};
/** Spider-Man (Justice) and Captain Marvel (Leadership): the Core starter decks. */
export const SEATS: readonly CampaignSeatSetup[] = [
  seat("core-spider-man-justice", 1),
  seat("core-captain-marvel-leadership", 2),
];

export const newLog = (
  definition: CampaignDefinition,
  modes: PlayModes = STANDARD,
  seed = 7,
  seats: readonly CampaignSeatSetup[] = SEATS,
): CampaignLog => createCampaignLog(definition, { id: `aos-test-${seed}`, seats, modes, poolVersion: "test", seed });

/** The next node composed (its between-games steps resolved), every choice declined (none is asked). */
export function compose(definition: CampaignDefinition, log: CampaignLog): CampaignLog {
  const result = resolveBetweenGames(definition, log, DEPS, log.modes);
  if (result.kind !== "done") throw new Error(`unexpected pending choice: ${result.choice.instructionId}`);
  return result.value;
}

/** The real game a composed log starts, the way a client builds it; unsettled, parked on its first choice. */
export function buildGame(
  definition: CampaignDefinition,
  composed: CampaignLog,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const start = startGameFromLog(definition, composed);
  if (!start.scenarioId) throw new Error(`node ${start.nodeId} has no fixed scenario`);
  const config = wave9Scenario(start.scenarioId, {
    players: start.input.seats.map((s) => ({ identityCardId: s.identityCardId, deck: s.deck, aspects: s.aspects })),
    seed: start.input.seed,
    modes: start.modes,
  });
  const created = createGame({ ...config, campaign: start.input }, WAVE9_DEPS);
  if (!created.ok) throw new Error(`${start.nodeId}: setup failed: ${created.error.message}`);
  return { state: created.state, events: created.events };
}

/** The game ended as a win (test surgery) and its result applied to the log. */
export function finishWon(definition: CampaignDefinition, composed: CampaignLog, state: GameState): CampaignLog {
  const ended: GameState = { ...state, outcome: { result: "win", reason: "villainDefeated" } };
  const result = campaignResultOf(definition, composed, ended, [], WAVE9_DEPS);
  const applied = applyCampaignResult(definition, composed, result, { at: 1 }, DEPS);
  if (applied.kind !== "done") throw new Error(`unexpected pending choice: ${applied.choice.instructionId}`);
  return applied.value;
}
