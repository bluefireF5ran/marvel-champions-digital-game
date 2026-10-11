/**
 * Agents of S.H.I.E.L.D. (MC50) — the ninth `CampaignDefinition`: five scenarios (Black Widow, Batroc, M.O.D.O.K.,
 * Thunderbolts, Baron Zemo) in numerical order, a mole among the S.H.I.E.L.D. Executive Board, and the evidence that
 * exposes it.
 *
 * Source of truth: `docs/campaign-modes/markdown/mc50_agents_of_shield.md` ("MC50 p. N", the PDF's pages: the campaign
 * rules pp. 4 to 6, the five scenarios' Campaign Instructions pp. 9, 11, 13, 15 and 19, the log sheet p. 24) and
 * `docs/phase7-wave9.md` sections 3.73 to 3.78 with the section 4.1 decisions. Every `CampaignInstruction` carries the
 * printed bullet it encodes, in printed order. The in-game effects are `wave9/aos/campaign/*`'s builders; this file only
 * wires them into windows and nodes.
 *
 * ---------------------------------------------------------------------------------------------------------------
 * MODELING
 *
 * - **The evidence.** `aimEnvelope` (hidden) holds the three sealed cards, one of each kind; the S.H.I.E.L.D. envelope is
 *   not a field but the nine evidence cards less `aimEnvelope` less `evidence` (section 3.73). "Prepare the evidence" is
 *   three sealed draws (`PREPARE_EVIDENCE`); a gain is one open draw from what is left (`GAIN_EVIDENCE`).
 * - **The board.** Scenarios 1 to 4 set the six Board Member and A.I.M. Interference cards aside (composition) and prepare
 *   them before the starting hands (`prepareBoard`); each Victory records the counters and faces in `secretsN`
 *   (`recordSecrets`), then the two working numbers the gain reads. Scenario 5 does not prepare the board: Baron Zemo's own
 *   Setup puts the environments into play and the campaign only restores `secrets4` on them (`restoreBoardSecrets`).
 * - **Order of the shaded expert bullets (Q13 = B, owner 2026-10-09).** The set-hit-points and heal bullets print after
 *   "After resolving mulligans", so they resolve in the `afterMulligans` window after every evidence card's Setup, in the
 *   printed order. Section 3.73's table says the default window for them; the decision wins.
 * - **A lost scenario 5.** In an expert campaign the campaign is lost. In a standard one the block reads N (the evidence
 *   gained so far, into a working field because the next bullet clears it), prepares the evidence again with draws that
 *   change on every attempt (`perAttempt`), and gains N cards. The retry then runs Setup as printed (section 3.76).
 */
import { AOS_CAMPAIGN, AOS_CARDS, EVIDENCE_KINDS, cardId, type EvidenceKind } from "@mc/content";
import type {
  CampaignDefinition,
  CampaignInstruction,
  CampaignNode,
  CampaignOp,
  CampaignValue,
  EffectSpec,
  LogFieldDef,
} from "@mc/engine";
import { seedHiddenPiles } from "../dsl/index.js";
import {
  ADAPTOID_ENVIRONMENTS_FIELD,
  ADAPTOID_ENVIRONMENTS_RECORD,
  MINIONS_AND_SIDE_SCHEMES_FIELD,
  MINIONS_AND_SIDE_SCHEMES_RECORD,
  RESCUED_CAPTIVES_FIELD,
  RESCUED_CAPTIVES_RECORD,
  SURVIVING_THUNDERBOLTS_FIELD,
  THUNDERBOLTS_RECORD,
  adaptoidEnvironmentsComposition,
  adaptoidEnvironmentsSetup,
  adaptoidsComposition,
  adaptoidsSetup,
  alertLevelSetup,
  holdingCellLocksSetup,
  thunderboltsComposition,
  thunderboltsSetup,
} from "../wave9/aos/campaign/carryover.js";
import {
  BOARD_ENVIRONMENTS_FIELD,
  BOARD_MEMBER_FRONTS,
  BOARD_SET_ASIDE_OPS,
  BOARD_WORKING_WRITES,
  CLEAN_BOARD_MEMBERS_FIELD,
  SCENARIO_ONE_BOARD,
  SECRETS_FIELDS,
  prepareBoard,
  recordSecrets,
  recordedBoard,
  restoreBoardSecrets,
  type BoardSource,
} from "../wave9/aos/campaign/executive-board.js";
import { EVIDENCE_SETUPS, evidenceSetupOf } from "../wave9/aos/campaign/executive-board-evidence.js";
import { defeatedSeatRecordsZero, healRecForSecret, hpRecord, hpSet } from "./expert-helpers.js";

const AOS_ID = AOS_CAMPAIGN.id;

export const AIM_ENVELOPE_FIELD = "aimEnvelope";
export const EVIDENCE_FIELD = "evidence";
/** Working number: how many evidence cards were gained before scenario 5 began (read by its standard-campaign DEFEAT). */
export const EVIDENCE_EARNED_FIELD = "evidenceEarned";

const slot = (name: string): CampaignValue => ({ kind: "choice", slot: name });

// ---------------------------------------------------------------------------------------------------------------
// The evidence
// ---------------------------------------------------------------------------------------------------------------

/** The nine evidence cards (50185 to 50193), by kind, read from the card data. */
const EVIDENCE_OF_KIND = (kind: EvidenceKind) =>
  AOS_CARDS.flatMap((card) => (card.type === "evidence" && card.evidence === kind ? [card.id] : []));
export const EVIDENCE_IDS: readonly string[] = Object.keys(EVIDENCE_SETUPS);

/**
 * "Prepare the evidence" (MC50 p. 5): one sealed draw from each kind's three cards into the hidden A.I.M. envelope
 * ("without looking at them"), and the evidence gained so far is given up. `perAttempt` makes a node's retry deal again
 * (scenario 5's DEFEAT block, section 3.76); a node's own first attempt is the plain draw either way.
 */
export const prepareEvidenceOps = (perAttempt = false): readonly CampaignOp[] => [
  ...EVIDENCE_KINDS.map((kind): CampaignOp => ({
    kind: "random",
    slot: kind,
    from: { kind: "cards", cardIds: EVIDENCE_OF_KIND(kind) },
    sealed: true,
    ...(perAttempt ? { perAttempt: true as const } : {}),
  })),
  { kind: "setField", field: AIM_ENVELOPE_FIELD, value: slot("means") },
  { kind: "appendToList", field: AIM_ENVELOPE_FIELD, value: slot("motive") },
  { kind: "appendToList", field: AIM_ENVELOPE_FIELD, value: slot("opportunity") },
  { kind: "clearField", field: EVIDENCE_FIELD },
];
export const PREPARE_EVIDENCE: readonly CampaignOp[] = prepareEvidenceOps();

/** "Gain one evidence card from the S.H.I.E.L.D. envelope": one of the cards in neither `aimEnvelope` nor `evidence`. */
export const gainEvidenceOps = (perAttempt = false): readonly CampaignOp[] => [
  {
    kind: "random",
    slot: "gained",
    ...(perAttempt ? { perAttempt: true as const } : {}),
    from: {
      kind: "excludingTitles",
      from: {
        kind: "excludingTitles",
        from: { kind: "cards", cardIds: EVIDENCE_IDS.map(cardId) },
        titlesIn: { kind: "field", field: AIM_ENVELOPE_FIELD },
      },
      titlesIn: { kind: "field", field: EVIDENCE_FIELD },
    },
  },
  { kind: "appendToList", field: EVIDENCE_FIELD, value: slot("gained") },
];
export const GAIN_EVIDENCE: readonly CampaignOp[] = gainEvidenceOps();

// ---------------------------------------------------------------------------------------------------------------
// Instruction helpers
// ---------------------------------------------------------------------------------------------------------------

const between = (
  id: string,
  text: string,
  citation: string,
  ops: readonly CampaignOp[],
  over: Partial<CampaignInstruction> = {},
): CampaignInstruction => ({ id, text, citation, step: { kind: "betweenGames", ops }, ...over });

const inGame = (
  id: string,
  text: string,
  citation: string,
  window: "beforeStartingHands" | "afterScenarioSetup" | "afterMulligans",
  effects: readonly EffectSpec[],
  over: Partial<CampaignInstruction> = {},
): CampaignInstruction => ({ id, text, citation, step: { kind: "inGame", window, effects }, ...over });

/** The same instruction at another window: the shaded expert bullets print after the mulligans (Q13 = B). */
const afterMulligans = (instruction: CampaignInstruction): CampaignInstruction =>
  instruction.step.kind === "inGame"
    ? { ...instruction, step: { ...instruction.step, window: "afterMulligans" } }
    : instruction;

const IDENTITY_TEXT =
  "Each player records their identity in the campaign log found on the back cover of this rulebook. Players cannot switch identities during a campaign.";
const BOARD_TEXT = "Prepare the S.H.I.E.L.D. Executive Board set.";
const EVIDENCE_SETUP_TEXT =
  "After resolving mulligans, resolve the “Setup” ability of each evidence card the players have earned.";

/** Scenario N's composition of the board: the three Board Members and the three A.I.M. Interference cards are set aside. */
const boardComposition = (n: number, citation: string): CampaignInstruction =>
  between(
    `mc50.s${n}.compose.board`,
    "Gather the three Board Member environments (181–183) and the three copies of the A.I.M. Interference treachery (184A–C).",
    citation,
    BOARD_SET_ASIDE_OPS,
  );

const boardSetup = (n: number, citation: string, source: BoardSource): CampaignInstruction =>
  inGame(`mc50.s${n}.setup.board`, BOARD_TEXT, citation, "beforeStartingHands", prepareBoard(source));

/** One `inGame` instruction for each evidence card, gated on the log, after the mulligans, in card id order. */
const evidenceSetups = (n: number, citation: string): readonly CampaignInstruction[] =>
  EVIDENCE_IDS.map((id) =>
    inGame(`mc50.s${n}.setup.evidence.${id}`, EVIDENCE_SETUP_TEXT, citation, "afterMulligans", evidenceSetupOf(id), {
      when: { kind: "fieldContains", field: EVIDENCE_FIELD, value: id },
    }),
  );

/** The two shaded expert bullets of scenarios 2 to 5, after the evidence Setups (Q13 = B). */
const expertSetups = (n: number, citation: string): readonly CampaignInstruction[] => [
  afterMulligans(hpSet(`mc50.s${n}.setup.hp-set`, citation)),
  afterMulligans(healRecForSecret(`mc50.s${n}.setup.heal`, citation)),
];

const SECRETS_TEXT = "Record the number of secret counters on each Board Member card in the campaign log.";
const GAIN_TEXT =
  "If at least one Board Member environment in play has no secret counters on it, gain one evidence card from the S.H.I.E.L.D. envelope and cross out each combination of means, motive, and opportunity in the campaign log that includes the icon on the evidence card gained.";

/** The Victory bullets every scenario 1 to 4 ends with: the secrets, the gain (via two working numbers), the expert hp. */
const commonVictory = (n: number, citation: string): readonly CampaignInstruction[] => [
  {
    id: `mc50.s${n}.victory.secrets`,
    text: SECRETS_TEXT,
    citation,
    step: { kind: "record", writes: [recordSecrets(SECRETS_FIELDS[n - 1]!)] },
  },
  {
    id: `mc50.s${n}.victory.board-working`,
    text: "Count the Board Member environments in play and those with no secret counters on them (the gain below reads them).",
    citation,
    step: { kind: "record", writes: BOARD_WORKING_WRITES },
  },
  between(`mc50.s${n}.victory.gain`, GAIN_TEXT, citation, GAIN_EVIDENCE, {
    when: { kind: "fieldAtLeast", field: CLEAN_BOARD_MEMBERS_FIELD, amount: 1 },
  }),
  hpRecord(`mc50.s${n}.victory.hp`, citation),
];

// ---------------------------------------------------------------------------------------------------------------
// The five nodes
// ---------------------------------------------------------------------------------------------------------------

const [BLACK_WIDOW, BATROC, MODOK, THUNDERBOLTS, BARON_ZEMO] = AOS_CAMPAIGN.scenarioIds;

const nodeOne: CampaignNode = {
  id: "black-widow",
  label: "Scenario #1 - Black Widow",
  scenario: { kind: "fixed", scenarioId: BLACK_WIDOW! },
  composition: [boardComposition(1, "MC50 p. 9")],
  setup: [
    between(
      "mc50.s1.setup.identity",
      IDENTITY_TEXT,
      "MC50 p. 9",
      // The seat's identity is recorded when the campaign log is created (`CampaignSeat.identityCardId`).
      [],
    ),
    between("mc50.s1.setup.evidence", "Prepare the evidence (see page 5).", "MC50 p. 9", PREPARE_EVIDENCE),
    boardSetup(1, "MC50 p. 9", SCENARIO_ONE_BOARD),
  ],
  victory: [
    {
      id: "mc50.s1.victory.minions",
      text: "Record the total number of minions and side schemes in play in the campaign log.",
      citation: "MC50 p. 9",
      step: { kind: "record", writes: MINIONS_AND_SIDE_SCHEMES_RECORD },
    },
    ...commonVictory(1, "MC50 p. 9"),
  ],
};

const nodeTwo: CampaignNode = {
  id: "batroc",
  label: "Scenario #2 - Batroc",
  scenario: { kind: "fixed", scenarioId: BATROC! },
  composition: [boardComposition(2, "MC50 p. 11")],
  setup: [
    inGame(
      "mc50.s2.setup.alert-level",
      "Place threat on the Alert Level environment equal to the number of minions and side schemes recorded in the campaign log for scenario #1.",
      "MC50 p. 11",
      "afterScenarioSetup",
      alertLevelSetup(),
    ),
    boardSetup(2, "MC50 p. 11", recordedBoard(SECRETS_FIELDS[0]!)),
    ...evidenceSetups(2, "MC50 p. 11"),
    ...expertSetups(2, "MC50 p. 11"),
  ],
  victory: [
    {
      id: "mc50.s2.victory.captives",
      text: "Record the number of Rescued Captive (91) allies in play in the campaign log.",
      citation: "MC50 p. 11",
      step: { kind: "record", writes: RESCUED_CAPTIVES_RECORD },
    },
    ...commonVictory(2, "MC50 p. 11"),
  ],
};

const nodeThree: CampaignNode = {
  id: "modok",
  label: "Scenario #3 - M.O.D.O.K.",
  scenario: { kind: "fixed", scenarioId: MODOK! },
  composition: [boardComposition(3, "MC50 p. 13")],
  setup: [
    inGame(
      "mc50.s3.setup.locks",
      "Place 3[per_hero] additional lock counters on the top card of the Holding Cell deck, then remove X[per_hero] lock counters from that card, where X is the number of “Rescued Captives in Play” recorded in the campaign log.",
      "MC50 p. 13",
      "afterScenarioSetup",
      holdingCellLocksSetup(),
    ),
    boardSetup(3, "MC50 p. 13", recordedBoard(SECRETS_FIELDS[1]!)),
    ...evidenceSetups(3, "MC50 p. 13"),
    ...expertSetups(3, "MC50 p. 13"),
  ],
  victory: [
    {
      id: "mc50.s3.victory.adaptoid-environments",
      text: "Mark each Adaptoid environment (109–112) in play in the campaign log.",
      citation: "MC50 p. 13",
      step: { kind: "record", writes: ADAPTOID_ENVIRONMENTS_RECORD },
    },
    ...commonVictory(3, "MC50 p. 13"),
  ],
};

const nodeFour: CampaignNode = {
  id: "thunderbolts",
  label: "Scenario #4 - Thunderbolts",
  scenario: { kind: "fixed", scenarioId: THUNDERBOLTS! },
  composition: [boardComposition(4, "MC50 p. 15")],
  setup: [
    boardSetup(4, "MC50 p. 15", recordedBoard(SECRETS_FIELDS[2]!)),
    ...evidenceSetups(4, "MC50 p. 15"),
    ...expertSetups(4, "MC50 p. 15"),
  ],
  victory: [
    {
      id: "mc50.s4.victory.thunderbolts",
      text: "If there are any Thunderbolt minions in play, record each of their names in the campaign log.",
      citation: "MC50 p. 15",
      step: { kind: "record", writes: THUNDERBOLTS_RECORD },
    },
    ...commonVictory(4, "MC50 p. 15"),
  ],
};

/** N gains, as many gated single gains as the box can have earned before scenario 5 (one each from scenarios 1 to 4). */
const REPLAY_GAINS: readonly CampaignOp[] = [1, 2, 3, 4].map((nth): CampaignOp => ({
  kind: "if",
  when: { kind: "fieldAtLeast", field: EVIDENCE_EARNED_FIELD, amount: nth },
  then: gainEvidenceOps(true),
}));

const nodeFive: CampaignNode = {
  id: "baron-zemo",
  label: "Scenario #5 - Baron Zemo",
  scenario: { kind: "fixed", scenarioId: BARON_ZEMO! },
  composition: [
    between(
      "mc50.s5.compose.adaptoid-environments",
      "Gather each Adaptoid environment marked as “in play” in the campaign log.",
      "MC50 p. 19",
      adaptoidEnvironmentsComposition,
    ),
    between(
      "mc50.s5.compose.adaptoids",
      "Gather each copy of the Adaptoid minion (113).",
      "MC50 p. 19",
      adaptoidsComposition,
    ),
    between(
      "mc50.s5.compose.thunderbolts",
      "Gather the “Surviving Thunderbolts” recorded in the campaign log and their encounter sets, except for Jolt’s (133).",
      "MC50 p. 19",
      thunderboltsComposition,
    ),
  ],
  setup: [
    inGame(
      "mc50.s5.setup.adaptoid-environments",
      "Put into play each Adaptoid environment (109–112) marked as “in play” in the campaign log.",
      "MC50 p. 19",
      "afterScenarioSetup",
      adaptoidEnvironmentsSetup(),
    ),
    inGame(
      "mc50.s5.setup.adaptoids",
      "Shuffle each copy of the Adaptoid minion (113) into the encounter deck.",
      "MC50 p. 19",
      "afterScenarioSetup",
      adaptoidsSetup(),
    ),
    inGame(
      "mc50.s5.setup.thunderbolts",
      "If you recorded any “Surviving Thunderbolts” in the campaign log, shuffle those minions and their encounter sets, except for Jolt’s (133), into the encounter deck.",
      "MC50 p. 19",
      "afterScenarioSetup",
      thunderboltsSetup(),
    ),
    inGame(
      "mc50.s5.setup.envelopes",
      "Set the A.I.M. and S.H.I.E.L.D. envelopes aside so that you can access them during the scenario.",
      "MC50 p. 19",
      "beforeStartingHands",
      [seedHiddenPiles({ aim: AIM_ENVELOPE_FIELD }, EVIDENCE_FIELD, { set: "executive_board_evidence", to: "shield" })],
    ),
    inGame(
      "mc50.s5.setup.secrets",
      "Place secret counters on each Board Member environment equal to the number of secret counters recorded for that environment in scenario #4.",
      "MC50 p. 19",
      "beforeStartingHands",
      restoreBoardSecrets(SECRETS_FIELDS[3]!),
    ),
    ...evidenceSetups(5, "MC50 p. 19"),
    ...expertSetups(5, "MC50 p. 19"),
  ],
  victory: [
    between(
      "mc50.s5.victory.win",
      "Zemo is defeated, the mole is exposed, the heroes are exonerated, and the players win the campaign!",
      "MC50 p. 19",
      // No `endCampaign` here: the last node won completes it and ends the campaign as won (the runner's
      // `advanceAfterWin`). An `endCampaign` op sets the status first, and the runner then skips the completed mark.
      [],
    ),
  ],
  defeat: [
    between(
      "mc50.s5.defeat.expert",
      "Expert Campaign Only: The heroes are arrested by S.H.I.E.L.D., convicted of their alleged crimes, and the players lose the campaign.",
      "MC50 p. 19",
      [{ kind: "endCampaign", result: "lost" }],
      { whenModes: { expertCampaign: true } },
    ),
    between(
      "mc50.s5.defeat.standard",
      "Standard Campaign Only: To replay this scenario, prepare the evidence as if you are starting a new campaign, then gain one evidence card from the S.H.I.E.L.D. envelope for each scenario in which you had at least one Board Member environment with no secret counters on it, then perform the campaign setup instructions above.",
      "MC50 p. 19",
      [
        // N is read before the evidence is cleared (the next bullet clears it).
        { kind: "setField", field: EVIDENCE_EARNED_FIELD, value: { kind: "count", field: EVIDENCE_FIELD } },
        ...prepareEvidenceOps(true),
        ...REPLAY_GAINS,
      ],
      { whenModes: { expertCampaign: false } },
    ),
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// The definition
// ---------------------------------------------------------------------------------------------------------------

const secretsField = (n: number): LogFieldDef => ({
  id: SECRETS_FIELDS[n - 1]!,
  label: `Remaining Secret Counters by Scenario, #${n}`,
  scope: "shared",
  type: { kind: "cardState", cardIds: BOARD_MEMBER_FRONTS.map(cardId) },
  citation: "MC50 p. 24",
});

export const AOS_CAMPAIGN_DEFINITION: CampaignDefinition = {
  campaignId: AOS_ID,
  version: "1",
  logFields: [
    {
      id: "remainingHp",
      label: "Remaining hit points",
      scope: "perSeat",
      type: { kind: "number", min: 0 },
      whenModes: { expertCampaign: true },
      citation: "MC50 p. 24",
    },
    ...[1, 2, 3, 4].map(secretsField),
    {
      id: MINIONS_AND_SIDE_SCHEMES_FIELD,
      label: "Scenario 1: Minions and side schemes in play",
      scope: "shared",
      type: { kind: "number", min: 0 },
      citation: "MC50 p. 24",
    },
    {
      id: RESCUED_CAPTIVES_FIELD,
      label: "Scenario 2: Rescued captives",
      scope: "shared",
      type: { kind: "number", min: 0, max: 4 },
      citation: "MC50 p. 24",
    },
    {
      id: ADAPTOID_ENVIRONMENTS_FIELD,
      label: "Scenario 3: Adaptoid environments",
      scope: "shared",
      type: { kind: "cardList" },
      citation: "MC50 p. 24",
    },
    {
      id: SURVIVING_THUNDERBOLTS_FIELD,
      label: "Scenario 4: Surviving Thunderbolts",
      scope: "shared",
      type: { kind: "cardList" },
      citation: "MC50 p. 24",
    },
    {
      id: EVIDENCE_FIELD,
      label: "Evidence gained",
      scope: "shared",
      type: { kind: "cardList" },
      citation: "MC50 p. 24",
    },
    {
      id: AIM_ENVELOPE_FIELD,
      label: "A.I.M. envelope",
      scope: "shared",
      type: { kind: "cardList" },
      hidden: true,
      citation: "MC50 p. 5",
    },
    {
      id: BOARD_ENVIRONMENTS_FIELD,
      label: "Board Member environments in play",
      scope: "shared",
      type: { kind: "number", min: 0 },
      working: true,
      citation: "MC50 p. 9",
    },
    {
      id: CLEAN_BOARD_MEMBERS_FIELD,
      label: "Board Member environments with no secret counters",
      scope: "shared",
      type: { kind: "number", min: 0 },
      working: true,
      citation: "MC50 p. 9",
    },
    {
      id: EVIDENCE_EARNED_FIELD,
      label: "Evidence gained before scenario 5",
      scope: "shared",
      type: { kind: "number", min: 0 },
      working: true,
      citation: "MC50 p. 19",
    },
    { id: "notes", label: "Notes", scope: "shared", type: { kind: "text" }, citation: "MC50 p. 24" },
  ],
  // MC50 p. 6 "Elimination and Victory": a player defeated in a scenario their teammates win skips its Victory steps and
  // rejoins through the next Setup's heal, so no `rejoinAtPrintedHitPoints` (Q14 = A). A seat that sat out has its
  // earlier record cleared so it must pay to rejoin.
  everyNodeVictory: [defeatedSeatRecordsZero("mc50.victory.defeatedHp", "MC50 p. 6")],
  elimination: {
    id: "mc50.elimination",
    text: "Expert Campaign Only: If a player is defeated during a scenario that their teammates go on to win, the defeated player does not participate in the Victory steps of that scenario.",
    citation: "MC50 p. 6",
    whenModes: { expertCampaign: true },
  },
  // MC50 p. 4: "If the players lost, they may reset the scenario and try again with no penalty"; p. 19's DEFEAT list is
  // the exception, so only node 5 has one.
  loss: { retry: "byInstruction", retryBaseline: "nodeStart", citation: "MC50 pp. 4, 19" },
  graph: { kind: "linear", nodes: [nodeOne, nodeTwo, nodeThree, nodeFour, nodeFive] },
};
