import { AOS_BOARD_MEMBER_LOG, cardId } from "@mc/content";
import type { CampaignDefinition, CampaignLog, GameState, InstanceId, LogValue } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { firstLegal, patchInstance, settle, type Picker } from "../../../testing/harness.js";
import { WAVE9_DEPS } from "../../index.js";
import { codeOf, piles } from "../../testing.js";
import {
  A_I_M_INTERFERENCE_IDS,
  BOARD_MEMBER_FRONTS,
  BOARD_MEMBER_STATE,
  BOARD_SET_ASIDE_OPS,
  BOARD_WORKING_WRITES,
  SCENARIO_ONE_BOARD,
  SECRETS_FIELDS,
  attachmentFaceOf,
  prepareBoard,
  recordSecrets,
  recordedBoard,
} from "./executive-board.js";
import { BOARD_DEFINITION, EXPERT, STANDARD, buildGame, compose, finishWon, newLog } from "./testing.js";

vi.setConfig({ testTimeout: 300_000 });

const [MEDICAL, SURVEILLANCE, TACTICAL] = BOARD_MEMBER_FRONTS as [string, string, string];
const TACTICAL_AID = attachmentFaceOf(TACTICAL);
const SURVEILLANCE_AID = attachmentFaceOf(SURVEILLANCE);
const MEDICAL_AID = attachmentFaceOf(MEDICAL);

/** Declines every evidence offer ("Do not ..."), otherwise the first legal answer. */
const declining: Picker = (s) => {
  const choice = s.pendingChoice!;
  const no = choice.options.find((o) => o.label.startsWith("Do not"));
  return no ? [no.optionId] : firstLegal(s);
};

const toFirstTurn = (state: GameState, pick: Picker = declining): GameState =>
  settle(state, pick, (s) => s.step.phase === "player", WAVE9_DEPS);

/** A node's game, composed from the log and played to the first player turn. */
function opened(definition: CampaignDefinition, log: CampaignLog, pick: Picker = declining) {
  const composed = compose(definition, log);
  const built = buildGame(definition, composed);
  return { composed, state: toFirstTurn(built.state, pick) };
}

/** The one instance showing this card id, wherever it is. */
const showing = (state: GameState, code: string): InstanceId => {
  const found = (Object.keys(state.instances) as InstanceId[]).filter((id) => codeOf(state, id) === code);
  if (found.length !== 1) throw new Error(`${found.length} instances show ${code}`);
  return found[0]!;
};
const secretsOn = (state: GameState, code: string): number =>
  state.instances[showing(state, code)]!.counters["secret"] ?? 0;
const hasInstance = (state: GameState, code: string): boolean =>
  (Object.keys(state.instances) as InstanceId[]).some((id) => codeOf(state, id) === code);

/** The first game ended as the test describes: each member's counters, and the face it is on (test surgery). */
function afterFirstGame(
  state: GameState,
  counts: Readonly<Record<string, { readonly secrets: number; readonly attachment?: true }>>,
): GameState {
  return Object.entries(counts).reduce((acc, [front, { secrets, attachment }]) => {
    const id = showing(acc, front);
    return patchInstance(acc, id, {
      counters: secrets > 0 ? { secret: secrets } : {},
      ...(attachment ? { cardId: cardId(attachmentFaceOf(front)) } : {}),
    });
  }, state);
}

/** A campaign through scenario 1 (won with these members), and scenario 2 composed and built from the log. */
function scenarioTwo(
  counts: Parameters<typeof afterFirstGame>[1],
  modes = STANDARD,
  second: { readonly pick?: Picker } = {},
) {
  const log = newLog(BOARD_DEFINITION, modes);
  const first = opened(BOARD_DEFINITION, log);
  const won = finishWon(BOARD_DEFINITION, first.composed, afterFirstGame(first.state, counts));
  return { won, ...opened(BOARD_DEFINITION, won, second.pick) };
}

const recorded = (log: CampaignLog, field: string): LogValue => log.shared[field]!;

describe("the Executive Board's preparation: scenario #1 (MC50 p. 9)", () => {
  it("has the three Board Member environments in play with two secret counters each", () => {
    const { state } = opened(BOARD_DEFINITION, newLog(BOARD_DEFINITION));
    for (const front of BOARD_MEMBER_FRONTS) {
      expect(secretsOn(state, front)).toBe(2);
      expect(state.villainArea).toContain(showing(state, front));
    }
  });

  it("shuffles the three A.I.M. Interference treacheries into the encounter deck, none revealed or left aside", () => {
    const { state } = opened(BOARD_DEFINITION, newLog(BOARD_DEFINITION));
    const deck = piles(state).deck.map((id) => codeOf(state, id));
    for (const id of A_I_M_INTERFERENCE_IDS) {
      expect(deck.filter((code) => code === id)).toHaveLength(1);
      expect(state.encounterSetAside.map((aside) => codeOf(state, aside))).not.toContain(id);
    }
  });

  it("is the same preparation for two players and for one", () => {
    const solo = newLog(BOARD_DEFINITION, STANDARD, 7, [newLog(BOARD_DEFINITION).seats[0]!]);
    expect(solo.seats).toHaveLength(1);
    const { state } = opened(BOARD_DEFINITION, solo);
    expect(BOARD_MEMBER_FRONTS.map((front) => secretsOn(state, front))).toEqual([2, 2, 2]);
  });

  it("is two counters on each, then the treacheries: six effects, no log read", () => {
    const effects = prepareBoard(SCENARIO_ONE_BOARD);
    expect(effects.map((effect) => effect.kind)).toEqual([
      "addCounters",
      "addCounters",
      "addCounters",
      "moveCards",
      "moveCards",
      "moveCards",
    ]);
    expect(JSON.stringify(effects)).not.toContain("campaignLog");
  });

  it("sets the six cards aside for the game, the environments by their front faces", () => {
    expect(BOARD_SET_ASIDE_OPS.map((op) => (op.kind === "setAsideCards" ? op.cards[0] : null))).toEqual(
      [...BOARD_MEMBER_FRONTS, ...A_I_M_INTERFERENCE_IDS].map((value) => ({ kind: "const", value: cardId(value) })),
    );
  });
});

describe("recording the board at a Victory (MC50 pp. 9 to 15)", () => {
  const counts = {
    [MEDICAL]: { secrets: 2 },
    [SURVEILLANCE]: { secrets: 0 },
    [TACTICAL]: { secrets: 5, attachment: true as const },
  };

  it("keeps each member's secret counters and the face it is on (Q11 = A), under the front face's id", () => {
    const { won } = scenarioTwo(counts);
    expect(recorded(won, "secrets1")).toEqual({
      kind: "cardState",
      cards: {
        [MEDICAL]: { counters: { secret: 2 } },
        [SURVEILLANCE]: { counters: { secret: 0 } },
        [TACTICAL]: { counters: { secret: 5 }, face: TACTICAL_AID },
      },
    });
  });

  it("records the two working numbers: Board Member environments in play, and those with no secret counter", () => {
    const { won } = scenarioTwo(counts);
    // The attachment is no environment: two are in play and one of them is clean.
    expect(recorded(won, "boardEnvironments")).toEqual({ kind: "number", value: 2 });
    expect(recorded(won, "cleanBoardMembers")).toEqual({ kind: "number", value: 1 });
  });

  it("gains one evidence card from outside the A.I.M. envelope when a member is clean", () => {
    const { won } = scenarioTwo(counts);
    const evidence = recorded(won, "evidence");
    expect(evidence.kind === "cardList" && evidence.cardIds).toHaveLength(1);
    const aim = won.hidden["aimEnvelope"];
    expect(aim?.kind === "cardList" && aim.cardIds).toHaveLength(3);
    const gained = evidence.kind === "cardList" ? evidence.cardIds[0] : undefined;
    expect(aim?.kind === "cardList" && aim.cardIds).not.toContain(gained);
  });

  it("gains nothing when every member has a counter, and an attachment is not a clean member", () => {
    const { won } = scenarioTwo({
      [MEDICAL]: { secrets: 1 },
      [SURVEILLANCE]: { secrets: 3 },
      [TACTICAL]: { secrets: 0, attachment: true },
    });
    expect(recorded(won, "cleanBoardMembers")).toEqual({ kind: "number", value: 0 });
    // `clearField` left the field empty, and no gain wrote to it.
    const evidence = won.shared["evidence"];
    expect(evidence === undefined || (evidence.kind === "cardList" && evidence.cardIds.length === 0)).toBe(true);
  });

  it("compiles to the cardStateOf query and writes the owner's decisions put in one place", () => {
    expect(BOARD_MEMBER_STATE).toMatchObject({
      kind: "cardStateOf",
      counters: [AOS_BOARD_MEMBER_LOG.counter],
      ...(AOS_BOARD_MEMBER_LOG.recordFace ? { withFace: true } : {}),
    });
    expect(recordSecrets("secrets3")).toEqual({ field: "secrets3", mode: "set", value: BOARD_MEMBER_STATE });
    expect(SECRETS_FIELDS).toEqual(["secrets1", "secrets2", "secrets3", "secrets4"]);
    expect(BOARD_WORKING_WRITES.map((write) => write.field)).toEqual(["boardEnvironments", "cleanBoardMembers"]);
    expect(AOS_BOARD_MEMBER_LOG.recordFace).toBe(true);
    expect(AOS_BOARD_MEMBER_LOG.secretsStayOnFlip).toBe(true);
  });
});

describe("restoring the board in a later scenario (MC50 pp. 6 and 11; owner answers Q1 = A and Q11 = A)", () => {
  it("places each member's recorded counters, and a member recorded as an attachment is an attachment holding its counters", () => {
    const pickedLabels: string[] = [];
    const watching: Picker = (s) => {
      pickedLabels.push(...s.pendingChoice!.options.map((o) => o.label));
      return declining(s);
    };
    const { state } = scenarioTwo(
      {
        [MEDICAL]: { secrets: 2 },
        [SURVEILLANCE]: { secrets: 0 },
        [TACTICAL]: { secrets: 5, attachment: true },
      },
      STANDARD,
      { pick: watching },
    );
    expect(secretsOn(state, MEDICAL)).toBe(2);
    expect(state.villainArea).toContain(showing(state, MEDICAL));
    expect(secretsOn(state, SURVEILLANCE)).toBe(0);
    expect(state.villainArea).toContain(showing(state, SURVEILLANCE));
    // Q1 = A and Q11 = A: the attachment is on the villain with all five counters (the flip kept them).
    const aid = showing(state, TACTICAL_AID);
    expect(state.instances[aid]!.counters["secret"]).toBe(5);
    expect(state.instances[aid]!.attachedTo).toBe(state.villains[0]!.instanceId);
    expect(hasInstance(state, TACTICAL)).toBe(false);
    // The counters were placed on the environment, so the attachment's Forced Response did not answer them: nobody
    // chose a character to take the 2 damage, and no character has any.
    expect(pickedLabels.some((label) => label.includes("friendly") || label.includes("damage"))).toBe(false);
    for (const player of state.players) expect(state.instances[player.identity.instanceId]!.damage).toBe(0);
  });

  it("keeps the attachment an attachment two scenarios running: the next record names it again", () => {
    const { won, composed, state } = scenarioTwo({
      [MEDICAL]: { secrets: 0 },
      [SURVEILLANCE]: { secrets: 1 },
      [TACTICAL]: { secrets: 4, attachment: true },
    });
    expect(showing(state, TACTICAL_AID)).toBeDefined();
    const second = finishWon(BOARD_DEFINITION, composed, state);
    const value = recorded(second, "secrets2");
    expect(value.kind === "cardState" && value.cards[TACTICAL]).toEqual({
      counters: { secret: 4 },
      face: TACTICAL_AID,
    });
    expect(value.kind === "cardState" && value.cards[MEDICAL]).toEqual({ counters: { secret: 0 } });
    expect(won.shared["secrets1"]).toBeDefined();
  });

  it("restores three on the environment face as an environment in a standard campaign (its threshold is 4)", () => {
    const { state } = scenarioTwo({
      [MEDICAL]: { secrets: 3 },
      [SURVEILLANCE]: { secrets: 3 },
      [TACTICAL]: { secrets: 3 },
    });
    expect(BOARD_MEMBER_FRONTS.map((front) => secretsOn(state, front))).toEqual([3, 3, 3]);
    for (const front of BOARD_MEMBER_FRONTS) expect(state.villainArea).toContain(showing(state, front));
    expect(state.outcome).toBeNull();
  });

  it("flips a member recorded at 3 on its environment face by the card's own text in an expert campaign, counters kept", () => {
    const { state } = scenarioTwo(
      { [MEDICAL]: { secrets: 3 }, [SURVEILLANCE]: { secrets: 0 }, [TACTICAL]: { secrets: 1 } },
      EXPERT,
    );
    const aid = showing(state, MEDICAL_AID);
    expect(state.instances[aid]!.counters["secret"]).toBe(3);
    expect(state.instances[aid]!.attachedTo).toBe(state.villains[0]!.instanceId);
    expect(hasInstance(state, MEDICAL)).toBe(false);
  });

  it("holds 3 on an attachment recorded in an expert campaign when the next scenario is standard (Q11 = A)", () => {
    // Scenario 1 in an expert campaign flipped the member at 3; the log is then played on in standard mode: only the
    // modes differ, and the member stays an attachment with its 3 (under 11B it would be an environment holding 3).
    const { state } = scenarioTwo({
      [MEDICAL]: { secrets: 0 },
      [SURVEILLANCE]: { secrets: 3, attachment: true },
      [TACTICAL]: { secrets: 0 },
    });
    const aid = showing(state, SURVEILLANCE_AID);
    expect(state.instances[aid]!.counters["secret"]).toBe(3);
    expect(hasInstance(state, SURVEILLANCE)).toBe(false);
  });

  it("loses the game during setup when the restored members make three attachments (MC50 p. 6)", () => {
    const { state } = scenarioTwo(
      {
        [MEDICAL]: { secrets: 0, attachment: true },
        [SURVEILLANCE]: { secrets: 0, attachment: true },
        [TACTICAL]: { secrets: 3 },
      },
      EXPERT,
    );
    expect(state.outcome?.result).toBe("loss");
    expect(state.step.phase).not.toBe("player");
  });

  it("reads the log field it is given: a board built on secrets1 ignores the other fields", () => {
    const effects = JSON.stringify(prepareBoard(recordedBoard("secrets3")));
    expect(effects).toContain("secrets3");
    expect(effects).not.toContain("secrets1");
    // One placement and one conditional flip for each member, then the treacheries.
    expect(prepareBoard(recordedBoard("secrets2")).map((effect) => effect.kind)).toEqual([
      "addCounters",
      "if",
      "addCounters",
      "if",
      "addCounters",
      "if",
      "moveCards",
      "moveCards",
      "moveCards",
    ]);
  });
});
