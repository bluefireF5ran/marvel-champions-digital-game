/**
 * `AOS_CAMPAIGN_DEFINITION` (Agents of S.H.I.E.L.D., MC50): the definition is well-formed against the real `@mc/content`
 * records, and each node's setup, Victory records and transitions do what pp. 9 to 19 print, standard and expert
 * (docs/phase7-wave9.md sections 3.73 to 3.76, 3.78). Per node, not a whole campaign: the five-scenario playthrough is
 * `aos.qa.test.ts`'s (items 79 and 80).
 *
 * The definition runs against real games of the real scenarios. A finished game's result is `campaignResultOf` over a
 * real state with test surgery (the cards that "were in play" put on the table), or a stand-in result where a test needs
 * a seat sitting out or a loss.
 */
import { describe, expect, it, vi } from "vitest";
import { AOS_CAMPAIGN, AOS_CARDS, AOS_THUNDERBOLT_MINIONS, cardId, type PlayModes } from "@mc/content";
import {
  applyCampaignResult,
  remainingHitPoints,
  type CampaignGameResult,
  type CampaignInstruction,
  type CampaignLog,
  type GameState,
  type InstanceId,
  type LogValue,
} from "@mc/engine";
import { action } from "../dsl/abilities.js";
import { validateDefinition } from "../dsl/validate.js";
import { firstLegal, patchInstance, settle, type Picker } from "../testing/harness.js";
import { WAVE9_CARDS } from "../wave9/cards.js";
import { WAVE9_DEPS } from "../wave9/index.js";
import { codeOf, piles } from "../wave9/testing.js";
import { BOARD_MEMBER_FRONTS, attachmentFaceOf } from "../wave9/aos/campaign/executive-board.js";
import { DEPS, SEATS, buildGame, compose, finishWon, newLog } from "../wave9/aos/campaign/testing.js";
import { AOS_CAMPAIGN_DEFINITION, EVIDENCE_IDS } from "./aos.js";
import { CAMPAIGNS, campaignDefinitionOf } from "./index.js";
import { HEAL_REC_LABEL, REJOIN_REC_LABEL, SIT_OUT_LABEL } from "./expert-helpers.js";

vi.setConfig({ testTimeout: 300_000 });

const DEF = AOS_CAMPAIGN_DEFINITION;
const STANDARD: PlayModes = { campaign: { campaignId: DEF.campaignId } };
const EXPERT: PlayModes = { campaign: { campaignId: DEF.campaignId, expertCampaign: true }, expert: true };
const NODES = ["black-widow", "batroc", "modok", "thunderbolts", "baron-zemo"] as const;
const nodes = DEF.graph.nodes;
const [MEDICAL, SURVEILLANCE, TACTICAL] = BOARD_MEMBER_FRONTS as [string, string, string];
const KIND_OF = new Map(
  AOS_CARDS.flatMap((card) => (card.type === "evidence" ? [[card.id as string, card.evidence]] : [])),
);
const MEANS = ["50185", "50186", "50187"];
const MOTIVE = ["50188", "50189", "50190"];
const OPPORTUNITY = ["50191", "50192", "50193"];

const everyInstruction = (): readonly CampaignInstruction[] => [
  ...(DEF.everyNodeSetup ?? []),
  ...(DEF.everyNodeVictory ?? []),
  ...nodes.flatMap((node) => [...(node.composition ?? []), ...node.setup, ...node.victory, ...(node.defeat ?? [])]),
];
const instructionIds = (list: readonly CampaignInstruction[]): readonly string[] => list.map((i) => i.id);

// ---------------------------------------------------------------------------------------------------------------
// Logs and games
// ---------------------------------------------------------------------------------------------------------------

type Shared = Record<string, LogValue>;
const cards = (...ids: string[]): LogValue => ({ kind: "cardList", cardIds: ids.map(cardId) });
const num = (value: number): LogValue => ({ kind: "number", value });
const members = (
  counts: Readonly<Record<string, { readonly secrets: number; readonly attachment?: true }>>,
): LogValue => ({
  kind: "cardState",
  cards: Object.fromEntries(
    BOARD_MEMBER_FRONTS.map((front) => [
      front,
      {
        counters: { secret: counts[front]?.secrets ?? 0 },
        ...(counts[front]?.attachment ? { face: attachmentFaceOf(front) } : {}),
      },
    ]),
  ),
});

/** The campaign log as node `index` (0 to 4) begins, with these shared fields, the envelope and each seat's hit points. */
function logAt(
  index: number,
  over: {
    readonly shared?: Shared;
    readonly envelope?: readonly string[];
    readonly modes?: PlayModes;
    readonly hp?: readonly (number | undefined)[];
    readonly seed?: number;
  } = {},
): CampaignLog {
  const base = newLog(DEF, over.modes ?? STANDARD, over.seed ?? 7);
  const hp = over.hp ?? [];
  return {
    ...base,
    position: {
      ...base.position,
      nextNodeId: NODES[index]!,
      resolved: Object.fromEntries(NODES.slice(0, index).map((id) => [id, "completed" as const])),
    },
    shared: { ...base.shared, ...over.shared },
    hidden: over.envelope ? { ...base.hidden, aimEnvelope: cards(...over.envelope) } : base.hidden,
    seats: base.seats.map((seat, seatIndex) =>
      hp[seatIndex] === undefined ? seat : { ...seat, fields: { ...seat.fields, remainingHp: num(hp[seatIndex]!) } },
    ),
  };
}

/** Declines every offer ("Do not ...", "Decline") and takes the first answer of anything else. */
const declining: Picker = (s) => {
  const no = s.pendingChoice!.options.find((o) => o.label.startsWith("Do not") || o.label === "Decline");
  return no ? [no.optionId] : firstLegal(s);
};

/** The `chooseOption` choices a game asked, as their option labels, in order. */
type Offers = string[][];
function recording(pick: Picker, offers: Offers): Picker {
  return (s) => {
    if (s.pendingChoice!.prompt.kind === "chooseOption") offers.push(s.pendingChoice!.options.map((o) => o.label));
    return pick(s);
  };
}

function opened(log: CampaignLog, pick: Picker = declining) {
  const composed = compose(DEF, log);
  const built = buildGame(DEF, composed);
  const offers: Offers = [];
  const state = settle(built.state, recording(pick, offers), (s) => s.step.phase === "player", WAVE9_DEPS);
  return { composed, built: built.state, state, offers };
}

const instances = (s: GameState): InstanceId[] => Object.keys(s.instances) as InstanceId[];
const all = (s: GameState, code: string): InstanceId[] => instances(s).filter((id) => codeOf(s, id) === code);
const secretsOn = (s: GameState, code: string): number => s.instances[all(s, code)[0]!]!.counters["secret"] ?? 0;
const threatOf = (s: GameState, code: string): number => s.instances[all(s, code)[0]!]!.threat;
const typeOf = (s: GameState, id: InstanceId): string =>
  AOS_CARDS.find((card) => (card.id as string) === codeOf(s, id))?.type ?? "";
const numberOf = (log: CampaignLog, field: string): number => {
  const value = log.shared[field];
  return value?.kind === "number" ? value.value : -1;
};
const listOf = (log: CampaignLog, field: string): readonly string[] => {
  const value = log.shared[field] ?? log.hidden[field];
  return value?.kind === "cardList" ? value.cardIds.map(String) : [];
};
const hpOf = (s: GameState, seat: number): number =>
  remainingHitPoints(s, s.players[seat]!.identity.instanceId, WAVE9_DEPS) ?? Number.NaN;

/** Test surgery: these cards leave the encounter deck, discard and set-aside areas and sit on the table. */
function putOnTable(state: GameState, ids: readonly InstanceId[]): GameState {
  const strip = (zone: readonly InstanceId[]) => zone.filter((id) => !ids.includes(id));
  return {
    ...state,
    encounterDecks: Object.fromEntries(
      Object.entries(state.encounterDecks).map(([key, deck]) => [
        key,
        { deck: strip(deck.deck), discard: strip(deck.discard) },
      ]),
    ),
    encounterSetAside: strip(state.encounterSetAside),
    villainArea: [...state.villainArea, ...ids.filter((id) => !state.villainArea.includes(id))],
  };
}
/** The Board Member environment `front` has this many secret counters now (test surgery). */
const withSecrets = (state: GameState, front: string, secrets: number): GameState =>
  patchInstance(state, all(state, front)[0]!, { counters: secrets > 0 ? { secret: secrets } : {} });

/** A finished game's result by hand, for the cases a real state cannot reach (a seat sitting out, a loss). */
function result(
  composed: CampaignLog,
  outcome: "won" | "lost",
  over: Partial<CampaignGameResult> = {},
): CampaignGameResult {
  return {
    nodeId: composed.attempt!.nodeId,
    outcome,
    records: [],
    removedFromCampaign: [],
    logWrites: [],
    expiringGrants: [],
    ...over,
  };
}
const apply = (composed: CampaignLog, outcome: CampaignGameResult): CampaignLog => {
  const applied = applyCampaignResult(DEF, composed, outcome, { at: 1_700_000_000_000, gameId: "qa" }, DEPS);
  if (applied.kind !== "done") throw new Error(`unexpected pending choice: ${applied.choice.instructionId}`);
  return applied.value;
};
const lose = (log: CampaignLog): CampaignLog => {
  const composed = compose(DEF, log);
  return apply(composed, result(composed, "lost"));
};

// ---------------------------------------------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------------------------------------------

describe("AOS_CAMPAIGN_DEFINITION: structure", () => {
  it("is registered under its @mc/content id", () => {
    expect(CAMPAIGNS["aos"]).toBe(DEF);
    expect(campaignDefinitionOf("aos")).toBe(DEF);
    expect(DEF.campaignId).toBe(AOS_CAMPAIGN.id);
    expect(DEF.version).toBe("1");
  });

  it("matches the content record: five linear nodes in MC50's fixed order, each a real scenario", () => {
    expect(DEF.graph.kind).toBe("linear");
    expect(nodes.map((node) => node.id)).toEqual([...NODES]);
    const scenarioIds = nodes.map((node) => {
      if (node.scenario.kind !== "fixed") throw new Error(`${node.id}: expected a fixed scenario`);
      return node.scenario.scenarioId as string;
    });
    expect(scenarioIds).toEqual(AOS_CAMPAIGN.scenarioIds.map((id) => id as string));
  });

  it("a loss is retried by instruction from the node's start (MC50 pp. 4, 19); only scenario 5 prints a DEFEAT block", () => {
    expect(DEF.loss).toEqual({ retry: "byInstruction", retryBaseline: "nodeStart", citation: "MC50 pp. 4, 19" });
    expect(nodes.map((node) => node.defeat !== undefined)).toEqual([false, false, false, false, true]);
    expect(instructionIds(nodes[4]!.defeat!)).toEqual(["mc50.s5.defeat.expert", "mc50.s5.defeat.standard"]);
    expect(nodes[4]!.defeat!.map((i) => i.whenModes)).toEqual([{ expertCampaign: true }, { expertCampaign: false }]);
  });

  it("elimination is the expert campaign's rule (MC50 p. 6) with no free rejoin", () => {
    expect(DEF.elimination).toMatchObject({ citation: "MC50 p. 6", whenModes: { expertCampaign: true } });
    expect(DEF.elimination?.rejoinAtPrintedHitPoints).toBeUndefined();
    expect(instructionIds(DEF.everyNodeVictory ?? [])).toEqual(["mc50.victory.defeatedHp"]);
  });

  it("every instruction id is unique and prefixed 'mc50.'; every citation is a printed page of MC50", () => {
    const ids = instructionIds(everyInstruction());
    expect(new Set(ids).size).toBe(ids.length);
    for (const instruction of everyInstruction()) {
      expect(instruction.id.startsWith("mc50."), instruction.id).toBe(true);
      expect(instruction.citation, instruction.id).toMatch(/^MC50 p\. (6|9|11|13|15|19)$/);
    }
    for (const field of DEF.logFields) expect(field.citation, field.id).toMatch(/^MC50 pp?\. \d+$/);
  });

  it("the log: the fields of section 3.73, with the envelope hidden and the working numbers unprinted", () => {
    const types = Object.fromEntries(DEF.logFields.map((field) => [field.id, field.type]));
    const fronts = BOARD_MEMBER_FRONTS.map(cardId);
    for (const n of [1, 2, 3, 4]) expect(types[`secrets${n}`]).toEqual({ kind: "cardState", cardIds: fronts });
    expect(types["minionsAndSideSchemes"]).toEqual({ kind: "number", min: 0 });
    expect(types["rescuedCaptives"]).toEqual({ kind: "number", min: 0, max: 4 });
    expect(types["adaptoidEnvironments"]).toEqual({ kind: "cardList" });
    expect(types["survivingThunderbolts"]).toEqual({ kind: "cardList" });
    expect(types["evidence"]).toEqual({ kind: "cardList" });
    expect(types["aimEnvelope"]).toEqual({ kind: "cardList" });
    expect(DEF.logFields.find((f) => f.id === "aimEnvelope")?.hidden).toBe(true);
    expect(DEF.logFields.filter((f) => f.working).map((f) => f.id)).toEqual([
      "boardEnvironments",
      "cleanBoardMembers",
      "evidenceEarned",
    ]);
    expect(DEF.logFields.find((f) => f.id === "remainingHp")).toMatchObject({
      scope: "perSeat",
      whenModes: { expertCampaign: true },
    });
  });

  it("every field an instruction reads or writes is declared, and every declared field is used", () => {
    const fieldsIn = (value: unknown, found: Set<string>): void => {
      if (Array.isArray(value)) value.forEach((item) => fieldsIn(item, found));
      else if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (typeof record["field"] === "string") found.add(record["field"]);
        if (typeof record["campaignLogField"] === "string") found.add(record["campaignLogField"]);
        Object.values(record).forEach((item) => fieldsIn(item, found));
      }
    };
    const referenced = new Set<string>();
    for (const instruction of everyInstruction()) {
      fieldsIn(instruction.step, referenced);
      fieldsIn(instruction.when, referenced);
    }
    const declared = new Set(DEF.logFields.map((field) => field.id));
    for (const field of referenced) expect(declared.has(field), field).toBe(true);
    // The Notes box is the players' own; no instruction writes it.
    for (const field of declared) if (field !== "notes") expect(referenced.has(field), `${field} unused`).toBe(true);
  });

  it("every in-game instruction passes the DSL validator, and the definition round-trips through JSON", () => {
    for (const instruction of everyInstruction()) {
      if (instruction.step.kind !== "inGame") continue;
      expect(validateDefinition(action(...instruction.step.effects)), instruction.id).toEqual([]);
    }
    expect(JSON.parse(JSON.stringify(DEF))).toEqual(DEF);
  });

  it("the windows: the board before the starting hands; evidence Setups, then the expert bullets, after mulligans (Q13 = B)", () => {
    const windowOf = (id: string) => {
      const found = everyInstruction().find((i) => i.id === id)!;
      return found.step.kind === "inGame" ? found.step.window : found.step.kind;
    };
    for (const n of [1, 2, 3, 4]) expect(windowOf(`mc50.s${n}.setup.board`)).toBe("beforeStartingHands");
    expect(windowOf("mc50.s5.setup.envelopes")).toBe("beforeStartingHands");
    expect(windowOf("mc50.s5.setup.secrets")).toBe("beforeStartingHands");
    for (const n of [2, 3, 4, 5]) {
      const setup = nodes[n - 1]!.setup;
      expect(setup.filter((i) => i.id.includes(".evidence.")).map((i) => windowOf(i.id))).toEqual(
        EVIDENCE_IDS.map(() => "afterMulligans"),
      );
      expect(windowOf(`mc50.s${n}.setup.hp-set`)).toBe("afterMulligans");
      expect(windowOf(`mc50.s${n}.setup.heal`)).toBe("afterMulligans");
      // Printed order: evidence cards, then the set-hit-points bullet, then the heal.
      expect(instructionIds(setup).slice(-2)).toEqual([`mc50.s${n}.setup.hp-set`, `mc50.s${n}.setup.heal`]);
      expect(setup.slice(-2).map((i) => i.whenModes)).toEqual([{ expertCampaign: true }, { expertCampaign: true }]);
    }
    expect(instructionIds(nodes[0]!.setup)).toEqual([
      "mc50.s1.setup.identity",
      "mc50.s1.setup.evidence",
      "mc50.s1.setup.board",
    ]);
  });

  it("each Victory records in printed order: its own record, the secrets, the gain, then the expert hit points", () => {
    const tail = (n: number) => [
      `mc50.s${n}.victory.secrets`,
      `mc50.s${n}.victory.board-working`,
      `mc50.s${n}.victory.gain`,
      `mc50.s${n}.victory.hp`,
    ];
    expect(instructionIds(nodes[0]!.victory)).toEqual(["mc50.s1.victory.minions", ...tail(1)]);
    expect(instructionIds(nodes[1]!.victory)).toEqual(["mc50.s2.victory.captives", ...tail(2)]);
    expect(instructionIds(nodes[2]!.victory)).toEqual(["mc50.s3.victory.adaptoid-environments", ...tail(3)]);
    expect(instructionIds(nodes[3]!.victory)).toEqual(["mc50.s4.victory.thunderbolts", ...tail(4)]);
    expect(instructionIds(nodes[4]!.victory)).toEqual(["mc50.s5.victory.win"]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Scenario 1: Black Widow
// ---------------------------------------------------------------------------------------------------------------

describe("scenario 1 (MC50 p. 9)", () => {
  it("prepares the evidence: a sealed envelope of one card of each kind, traced without the cards, and no evidence", () => {
    const composed = compose(DEF, logAt(0));
    const envelope = listOf(composed, "aimEnvelope");
    expect(envelope).toHaveLength(3);
    expect(envelope.map((id) => KIND_OF.get(id))).toEqual(["means", "motive", "opportunity"]);
    expect(MEANS).toContain(envelope[0]);
    expect(MOTIVE).toContain(envelope[1]);
    expect(OPPORTUNITY).toContain(envelope[2]);
    expect(composed.hidden["aimEnvelope"]?.sealed).toBe(true);
    expect(listOf(composed, "evidence")).toEqual([]);
    const step = composed.attempt!.steps.find((s) => s.instructionId === "mc50.s1.setup.evidence")!;
    expect(step.choices).toHaveLength(3);
    for (const choice of step.choices) {
      expect(choice.picked).toEqual([]);
      expect(choice).toMatchObject({ sealed: true });
    }
    expect(JSON.stringify(step)).not.toMatch(/5018[5-9]|5019[0-3]/);
  });

  it("deals the same envelope from the same seed and another from another", () => {
    const envelopeOf = (seed: number) => listOf(compose(DEF, logAt(0, { seed })), "aimEnvelope").join();
    expect(envelopeOf(11)).toBe(envelopeOf(11));
    expect(new Set([1, 2, 3, 4, 5, 6].map(envelopeOf)).size).toBeGreaterThan(1);
  });

  it("opens with the three Board Member environments at two secret counters, the three treacheries in the deck", () => {
    const { state } = opened(logAt(0));
    for (const front of BOARD_MEMBER_FRONTS) {
      expect(secretsOn(state, front)).toBe(2);
      expect(state.villainArea).toContain(all(state, front)[0]);
    }
    const deck = piles(state).deck.map((id) => codeOf(state, id));
    for (const id of ["50184a", "50184b", "50184c"]) expect(deck.filter((code) => code === id)).toHaveLength(1);
  });

  it("won with the Medical Officer at 0 and 3 minions and a side scheme more in play: the record, the secrets, one evidence card", () => {
    const first = opened(logAt(0));
    const deck = piles(first.state).deck;
    const minions = deck.filter((id) => typeOf(first.state, id) === "minion").slice(0, 3);
    const schemes = deck.filter((id) => typeOf(first.state, id) === "side_scheme").slice(0, 1);
    expect(minions).toHaveLength(3);
    expect(schemes).toHaveLength(1);
    const already = numberOf(finishWon(DEF, first.composed, first.state), "minionsAndSideSchemes");
    const state = withSecrets(putOnTable(first.state, [...minions, ...schemes]), MEDICAL, 0);
    const won = finishWon(DEF, first.composed, state);
    expect(numberOf(won, "minionsAndSideSchemes")).toBe(already + 4);
    expect(won.shared["secrets1"]).toEqual(
      members({ [MEDICAL]: { secrets: 0 }, [SURVEILLANCE]: { secrets: 2 }, [TACTICAL]: { secrets: 2 } }),
    );
    const evidence = listOf(won, "evidence");
    expect(evidence).toHaveLength(1);
    expect(EVIDENCE_IDS).toContain(evidence[0]);
    expect(listOf(won, "aimEnvelope")).not.toContain(evidence[0]);
    expect(won.position.nextNodeId).toBe("batroc");
    expect(won.status).toBe("active");
  });

  it("with a counter on every Board Member environment, no evidence is gained", () => {
    const first = opened(logAt(0));
    const won = finishWon(DEF, first.composed, first.state);
    expect(listOf(won, "evidence")).toEqual([]);
    expect(won.shared["boardEnvironments"]).toEqual(num(3));
    expect(won.shared["cleanBoardMembers"]).toEqual(num(0));
  });

  it("records a Board Member attachment on its attachment face and an unrecorded environment as itself", () => {
    const first = opened(logAt(0));
    const flipped = patchInstance(first.state, all(first.state, TACTICAL)[0]!, {
      cardId: cardId(attachmentFaceOf(TACTICAL)),
      counters: { secret: 5 },
    });
    const won = finishWon(DEF, first.composed, flipped);
    expect(won.shared["secrets1"]).toEqual(
      members({
        [MEDICAL]: { secrets: 2 },
        [SURVEILLANCE]: { secrets: 2 },
        [TACTICAL]: { secrets: 5, attachment: true },
      }),
    );
    expect(won.shared["boardEnvironments"]).toEqual(num(2));
  });

  it("a standard campaign records no hit points; an expert campaign records each seat's (capped at base)", () => {
    const standard = opened(logAt(0));
    expect(finishWon(DEF, standard.composed, standard.state).seats.map((s) => s.fields["remainingHp"])).toEqual([
      undefined,
      undefined,
    ]);
    const expert = opened(logAt(0, { modes: EXPERT }));
    const hurt = patchInstance(expert.state, expert.state.players[0]!.identity.instanceId, { damage: 4 });
    const won = finishWon(DEF, expert.composed, hurt);
    expect(won.seats.map((s) => s.fields["remainingHp"])).toEqual([num(hpOf(hurt, 0)), num(hpOf(hurt, 1))]);
    expect(hpOf(hurt, 0)).toBe(hpOf(expert.state, 0) - 4);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Scenario 2: Batroc
// ---------------------------------------------------------------------------------------------------------------

describe("scenario 2 (MC50 p. 11)", () => {
  const shared: Shared = {
    minionsAndSideSchemes: num(4),
    secrets1: members({
      [MEDICAL]: { secrets: 2 },
      [SURVEILLANCE]: { secrets: 0 },
      [TACTICAL]: { secrets: 5, attachment: true },
    }),
  };

  it("places the recorded minions and side schemes as threat on Alert Level (two players: 4 stays below 8)", () => {
    const { state } = opened(logAt(1, { shared }));
    expect(threatOf(state, "50090a")).toBe(4);
    expect(state.instances[all(state, "50090a")[0]!]!.flipped).toBeFalsy();
  });

  it("restores the board from scenario 1: counters, and a recorded attachment is an attachment holding its counters", () => {
    const { state } = opened(logAt(1, { shared }));
    expect(secretsOn(state, MEDICAL)).toBe(2);
    expect(secretsOn(state, SURVEILLANCE)).toBe(0);
    expect(all(state, TACTICAL)).toHaveLength(0);
    expect(secretsOn(state, attachmentFaceOf(TACTICAL))).toBe(5);
    const deck = piles(state).deck.map((id) => codeOf(state, id));
    for (const id of ["50184a", "50184b", "50184c"]) expect(deck.filter((code) => code === id)).toHaveLength(1);
  });

  it("with no evidence earned no Setup offer is made; with Wiretap and Blackmail earned each is offered, in order gained", () => {
    expect(opened(logAt(1, { shared })).offers).toEqual([]);
    const { offers } = opened(logAt(1, { shared: { ...shared, evidence: cards("50189", "50186") } }));
    // Card id order is accepted (the instruction list runs 50186 then 50189): four offers each, two players, two sentences.
    const aspects = offers.map((labels) => /Justice (ally|upgrade)/.exec(labels[0]!)?.[1]);
    expect(aspects).toEqual(["ally", "ally", "ally", "ally", "upgrade", "upgrade", "upgrade", "upgrade"]);
  });

  it("an expert campaign sets hit points, then offers the heal after the evidence Setups; a standard one does neither", () => {
    const log = logAt(1, { shared: { ...shared, evidence: cards("50186") }, modes: EXPERT, hp: [4, 6] });
    const first = composedOffers(log);
    const kinds = first.offers.map((labels) =>
      labels.includes(HEAL_REC_LABEL) ? "heal" : labels[0]!.startsWith("Add 1") ? "evidence" : "other",
    );
    expect(kinds).toEqual(["evidence", "evidence", "evidence", "evidence", "heal", "heal"]);
    expect(first.atHeal).toEqual([4, 6]);
    const standard = opened(logAt(1, { shared: { ...shared, evidence: cards("50186") }, modes: STANDARD, hp: [4, 6] }));
    expect(standard.offers.flat().some((label) => label === HEAL_REC_LABEL)).toBe(false);
    expect(hpOf(standard.state, 0)).not.toBe(4);
  });

  it("expert: a seat recorded at 0 is asked to rejoin or sit out", () => {
    const { offers } = opened(logAt(1, { shared, modes: EXPERT, hp: [5, 0] }));
    expect(offers).toEqual([
      [HEAL_REC_LABEL, "Decline"],
      [REJOIN_REC_LABEL, SIT_OUT_LABEL],
    ]);
  });

  it("won with three Rescued Captives in play: the count, the secrets, one evidence card for the clean member", () => {
    const first = opened(logAt(1, { shared, envelope: ["50185", "50188", "50191"] }));
    const captives = all(first.built, "50091").slice(0, 3);
    expect(captives).toHaveLength(3);
    const won = finishWon(DEF, first.composed, putOnTable(first.state, captives));
    expect(numberOf(won, "rescuedCaptives")).toBe(3);
    expect(won.shared["secrets2"]).toEqual(shared["secrets1"]);
    // The Chief Surveillance Officer has no counter: the players gain a card from the six outside the envelope.
    const evidence = listOf(won, "evidence");
    expect(evidence).toHaveLength(1);
    expect(["50185", "50188", "50191"]).not.toContain(evidence[0]);
    expect(won.position.nextNodeId).toBe("modok");
  });

  it("an evidence card gained is never gained twice, nor one of the envelope's, over four scenarios of gains", () => {
    const envelope = ["50185", "50188", "50191"];
    let log = logAt(1, { shared: { ...shared, evidence: cards("50186", "50189", "50192") }, envelope });
    const first = opened(log);
    log = finishWon(DEF, first.composed, withSecrets(first.state, MEDICAL, 0));
    const evidence = listOf(log, "evidence");
    expect(evidence).toHaveLength(4);
    expect(new Set(evidence).size).toBe(4);
    for (const card of evidence) expect(envelope).not.toContain(card);
  });
});

/** An expert scenario 2 composed and played to the first turn, noting each seat's hit points at the first heal offer. */
function composedOffers(log: CampaignLog) {
  const composed = compose(DEF, log);
  const built = buildGame(DEF, composed);
  const offers: Offers = [];
  const atHeal: number[] = [];
  const pick = recording((s) => {
    if (s.pendingChoice!.options.some((o) => o.label === HEAL_REC_LABEL) && atHeal.length === 0) {
      atHeal.push(hpOf(s, 0), hpOf(s, 1));
    }
    return declining(s);
  }, offers);
  settle(built.state, pick, (s) => s.step.phase === "player", WAVE9_DEPS);
  return { offers, atHeal };
}

// ---------------------------------------------------------------------------------------------------------------
// Scenario 3: M.O.D.O.K.
// ---------------------------------------------------------------------------------------------------------------

describe("scenario 3 (MC50 p. 13)", () => {
  const shared: Shared = {
    rescuedCaptives: num(3),
    secrets2: members({ [MEDICAL]: { secrets: 1 }, [SURVEILLANCE]: { secrets: 3 }, [TACTICAL]: { secrets: 0 } }),
  };

  it("leaves (5 - 3) x 2 = 4 lock counters on the first Holding Cell, and restores the board from scenario 2", () => {
    const { state } = opened(logAt(2, { shared }));
    const locks = state.villainArea
      .filter((id) => codeOf(state, id).startsWith("5010") && codeOf(state, id).endsWith("a"))
      .map((id) => state.instances[id]!.counters["lock"] ?? 0);
    expect(locks).toEqual([4]);
    expect([MEDICAL, SURVEILLANCE, TACTICAL].map((front) => secretsOn(state, front))).toEqual([1, 3, 0]);
  });

  it("records each Adaptoid environment in play by card id, the secrets, and gains evidence for a clean member", () => {
    const first = opened(logAt(2, { shared, envelope: ["50185", "50188", "50191"] }));
    const environments = all(first.built, "50109").concat(all(first.built, "50111"));
    expect(environments).toHaveLength(2);
    const won = finishWon(DEF, first.composed, putOnTable(first.state, environments));
    expect([...listOf(won, "adaptoidEnvironments")].sort()).toEqual(["50109", "50111"]);
    expect(won.shared["secrets3"]).toEqual(shared["secrets2"]);
    expect(listOf(won, "evidence")).toHaveLength(1);
    expect(won.position.nextNodeId).toBe("thunderbolts");
  });

  it("with a counter on every member there is no gain, whatever the earlier evidence", () => {
    const first = opened(logAt(2, { shared, envelope: ["50185", "50188", "50191"] }));
    let state = first.state;
    for (const front of BOARD_MEMBER_FRONTS) state = withSecrets(state, front, 1);
    const won = finishWon(DEF, first.composed, state);
    expect(listOf(won, "evidence")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Scenario 4: Thunderbolts
// ---------------------------------------------------------------------------------------------------------------

describe("scenario 4 (MC50 p. 15)", () => {
  const shared: Shared = {
    secrets3: members({ [MEDICAL]: { secrets: 2 }, [SURVEILLANCE]: { secrets: 2 }, [TACTICAL]: { secrets: 1 } }),
  };

  it("restores the board from scenario 3 and prints no other Setup bullet", () => {
    const { state } = opened(logAt(3, { shared }));
    expect([MEDICAL, SURVEILLANCE, TACTICAL].map((front) => secretsOn(state, front))).toEqual([2, 2, 1]);
    expect(instructionIds(nodes[3]!.setup).filter((id) => !id.includes(".evidence."))).toEqual([
      "mc50.s4.setup.board",
      "mc50.s4.setup.hp-set",
      "mc50.s4.setup.heal",
    ]);
  });

  it("records the names of the Thunderbolt minions in play, and no other minion", () => {
    const first = opened(logAt(3, { shared, envelope: ["50185", "50188", "50191"] }));
    const jolt = AOS_THUNDERBOLT_MINIONS.find((row) => !row.elite)!;
    const joltId = all(first.built, jolt.minionId as string)[0]!;
    const state = putOnTable(first.state, [joltId]);
    const already = listOf(finishWon(DEF, first.composed, first.state), "survivingThunderbolts");
    const won = finishWon(DEF, first.composed, state);
    expect([...listOf(won, "survivingThunderbolts")].sort()).toEqual([...already, jolt.minionId as string].sort());
    expect(won.position.nextNodeId).toBe("baron-zemo");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Scenario 5: Baron Zemo
// ---------------------------------------------------------------------------------------------------------------

describe("scenario 5 (MC50 p. 19)", () => {
  const ENVELOPE = ["50185", "50189", "50193"];
  const jolt = AOS_THUNDERBOLT_MINIONS.find((row) => !row.elite)!.minionId as string;
  const shared: Shared = {
    adaptoidEnvironments: cards("50109", "50110"),
    survivingThunderbolts: cards(jolt),
    evidence: cards("50186", "50191"),
    secrets4: members({
      [MEDICAL]: { secrets: 3 },
      [SURVEILLANCE]: { secrets: 1 },
      [TACTICAL]: { secrets: 5, attachment: true },
    }),
  };

  it("opens with the recorded environments and the four Adaptoids, the surviving Thunderbolt, and the envelopes", () => {
    const { state } = opened(logAt(4, { shared, envelope: ENVELOPE }));
    for (const id of ["50109", "50110"]) expect(state.villainArea).toContain(all(state, id)[0]);
    for (const id of ["50111", "50112"])
      expect(all(state, id).filter((i) => state.villainArea.includes(i))).toEqual([]);
    const deck = piles(state).deck.map((id) => codeOf(state, id));
    expect(deck.filter((code) => code === "50113")).toHaveLength(4);
    expect(deck.filter((code) => code === jolt)).toHaveLength(1);
    expect(state.hiddenPiles?.["aim"]?.map(String).sort()).toEqual([...ENVELOPE].sort());
    expect(state.hiddenPiles?.["shield"]).toHaveLength(9 - 3 - 2);
    expect(state.revealedPileCards?.["shield"]?.map(String).sort()).toEqual(["50186", "50191"]);
  });

  it("puts the scenario 4 counters and faces on Zemo's own Board Member environments, and none on a fresh board", () => {
    const { state } = opened(logAt(4, { shared, envelope: ENVELOPE }));
    // 3 on the Chief Medical Officer (below the standard threshold of 4), 1 on the Surveillance Officer, and the
    // Tactical Officer is the attachment it was recorded as, holding 5.
    expect(secretsOn(state, MEDICAL)).toBe(3);
    expect(secretsOn(state, SURVEILLANCE)).toBe(1);
    expect(all(state, TACTICAL)).toHaveLength(0);
    expect(secretsOn(state, attachmentFaceOf(TACTICAL))).toBe(5);
    const { secrets4: _secrets4, ...withoutSecrets4 } = shared;
    const fresh = opened(logAt(4, { shared: withoutSecrets4, envelope: ENVELOPE }));
    expect([MEDICAL, SURVEILLANCE, TACTICAL].map((front) => secretsOn(fresh.state, front))).toEqual([0, 0, 0]);
  });

  it("offers the Setup of each evidence card earned, after the mulligans", () => {
    const { offers } = opened(logAt(4, { shared, envelope: ENVELOPE }));
    const aspects = offers.map((labels) => /(Justice ally|Protection support)/.exec(labels[0]!)?.[1]);
    expect(aspects).toEqual([...Array(4).fill("Justice ally"), ...Array(4).fill("Protection support")]);
  });

  it("winning ends the campaign as won", () => {
    const first = opened(logAt(4, { shared, envelope: ENVELOPE }));
    const won = finishWon(DEF, first.composed, first.state);
    expect(won.status).toBe("won");
  });

  it("losing in an expert campaign loses the campaign: no retry is offered", () => {
    const lost = lose(logAt(4, { shared, envelope: ENVELOPE, modes: EXPERT, hp: [5, 5] }));
    expect(lost.status).toBe("lost");
  });

  it("losing in a standard campaign deals a new envelope and as many fresh evidence cards as before, then retries (section 3.76)", () => {
    const log = logAt(4, { shared, envelope: ENVELOPE });
    const after = lose(log);
    expect(after.status).toBe("active");
    expect(after.position.nextNodeId).toBe("baron-zemo");
    const envelope = listOf(after, "aimEnvelope");
    const evidence = listOf(after, "evidence");
    expect(envelope.map((id) => KIND_OF.get(id))).toEqual(["means", "motive", "opportunity"]);
    expect(evidence).toHaveLength(2);
    expect(new Set(evidence).size).toBe(2);
    for (const card of evidence) expect(envelope).not.toContain(card);
    // What the node's start held and the lost game could not change stays.
    for (const field of ["secrets4", "adaptoidEnvironments", "survivingThunderbolts"]) {
      expect(after.shared[field]).toEqual(log.shared[field]);
    }
    expect(after.seats.map((seat) => seat.deck)).toEqual(log.seats.map((seat) => seat.deck));
    // The retry runs Setup as printed with the new envelope and evidence.
    const retry = opened(after);
    expect(retry.state.hiddenPiles?.["aim"]?.map(String).sort()).toEqual([...envelope].sort());
    expect(retry.state.revealedPileCards?.["shield"]?.map(String).sort()).toEqual([...evidence].sort());
  });

  it("a second loss deals again: some seed gives a different envelope or evidence after each loss", () => {
    const deals = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
      const start = logAt(4, { shared, envelope: ENVELOPE, seed });
      const first = lose(start);
      const second = lose(first);
      for (const log of [first, second]) {
        expect(listOf(log, "evidence")).toHaveLength(2);
        expect(listOf(log, "aimEnvelope")).toHaveLength(3);
      }
      return [first, second].map((log) => [listOf(log, "aimEnvelope"), listOf(log, "evidence")].join("|"));
    });
    expect(deals.some(([first, second]) => first !== second)).toBe(true);
  });

  it("with no evidence earned the standard loss still deals a new envelope and gains nothing", () => {
    const after = lose(logAt(4, { shared: { ...shared, evidence: cards() }, envelope: ENVELOPE }));
    expect(listOf(after, "aimEnvelope")).toHaveLength(3);
    expect(listOf(after, "evidence")).toEqual([]);
    expect(after.status).toBe("active");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Expert campaign: elimination
// ---------------------------------------------------------------------------------------------------------------

describe("expert campaign: hit points and elimination (MC50 p. 6)", () => {
  const hpRecords = (nodeId: string, hp: Readonly<Record<number, number>>) =>
    Object.entries(hp).map(([seat, value]) => ({
      instructionId: `mc50.${nodeId}.victory.hp`,
      write: { field: "remainingHp", seatNumber: Number(seat), mode: "set" as const, value: num(value) },
    }));

  it("a seat that sits out a won scenario records 0, so the next Setup asks it to rejoin", () => {
    const composed = compose(DEF, logAt(0, { modes: EXPERT }));
    const after = apply(composed, result(composed, "won", { records: hpRecords("s1", { 1: 4 }), sittingOut: [2] }));
    expect(after.seats.map((seat) => seat.fields["remainingHp"])).toEqual([num(4), num(0)]);
    const { offers } = opened({ ...after, status: "active" });
    expect(offers).toEqual([
      [HEAL_REC_LABEL, "Decline"],
      [REJOIN_REC_LABEL, SIT_OUT_LABEL],
    ]);
  });

  it("nobody sat out: each seat's record is its own", () => {
    const composed = compose(DEF, logAt(0, { modes: EXPERT }));
    const after = apply(composed, result(composed, "won", { records: hpRecords("s1", { 1: 4, 2: 7 }) }));
    expect(after.seats.map((seat) => seat.fields["remainingHp"])).toEqual([num(4), num(7)]);
    expect(SEATS).toHaveLength(2);
  });
});

describe("the printed card data the definition reads", () => {
  it("names the nine evidence cards in the kinds the envelope is dealt from", () => {
    expect([...EVIDENCE_IDS].sort()).toEqual([...MEANS, ...MOTIVE, ...OPPORTUNITY]);
    expect(WAVE9_CARDS.filter((card) => EVIDENCE_IDS.includes(card.id as string))).toHaveLength(9);
  });
});
