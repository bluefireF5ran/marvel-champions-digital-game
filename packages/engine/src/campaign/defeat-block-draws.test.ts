/**
 * docs/phase7-wave9.md §3.76: a DEFEAT block that draws, lost twice.
 *
 * MC50 p. 19, DEFEAT, standard campaign: "To replay this scenario, do the following: Prepare the evidence as if you
 * are starting a new campaign (see page 5). Gain one evidence card from the S.H.I.E.L.D. envelope for each scenario in
 * which you had at least one Board Member environment with no secret counters on it. Perform the campaign setup
 * instructions above." Expert campaign: "the players lose the campaign."
 *
 * A proof, not a new primitive: `LossPolicy.retry: "byInstruction"`, `retryBaseline: "nodeStart"`, `random.perAttempt`
 * and `random.sealed` already compose into this. What is proved (the section's five points):
 * 1. the block's writes survive the restore to the node's start;
 * 2. a second loss deals again (the attempt number the draws are mixed with differs between the two losses);
 * 3. N is read before the evidence is cleared, and no gain draws a card of the new envelope;
 * 4. in an expert campaign the same loss ends the campaign, and no retry is offered;
 * 5. nothing the lost game or its node wrote is left in the log.
 *
 * A standalone definition over synthetic evidence cards, so nothing here perturbs another fixture.
 */
import { describe, expect, it } from "vitest";
import {
  campaignId,
  cardId,
  cycleId,
  encounterSetId,
  EVIDENCE_KINDS,
  scenarioId,
  setCode,
  unerrataedText,
  type CardId,
  type EvidenceCard,
  type EvidenceKind,
  type PlayModes,
} from "@mc/content";
import type {
  CampaignDefinition,
  CampaignGameResult,
  CampaignInstruction,
  CampaignLog,
  CampaignOp,
  CampaignValue,
} from "../campaign.js";
import {
  applyCampaignResult,
  createCampaignLog,
  resolveBetweenGames,
  type CampaignDeps,
  type CampaignSeatSetup,
} from "./runner.js";

const CAMPAIGN_ID = campaignId("defeat-block-test");
const STANDARD: PlayModes = { campaign: { campaignId: CAMPAIGN_ID } };
const EXPERT: PlayModes = { campaign: { campaignId: CAMPAIGN_ID, expertCampaign: true } };
const SCENARIO = scenarioId("defeat-block-test-scenario");

const clue = (id: string, evidence: EvidenceKind): EvidenceCard => ({
  id: cardId(id),
  name: id,
  setCode: setCode("stub"),
  cycleId: cycleId("stub"),
  collectorNumber: id,
  quantityInSet: 1,
  unique: false,
  type: "evidence",
  evidence,
  encounterSetIds: [encounterSetId("clues")],
  traits: [],
  text: unerrataedText(""),
  abilities: [],
});
const CLUE_CARDS = EVIDENCE_KINDS.flatMap((kind) => [0, 1, 2].map((n) => clue(`clue-${kind}-${n}`, kind)));
const ALL: readonly CardId[] = CLUE_CARDS.map((card) => card.id);
const ofKind = (kind: EvidenceKind): readonly CardId[] =>
  CLUE_CARDS.filter((card) => card.evidence === kind).map((card) => card.id);
const kindOf = (id: string): EvidenceKind | undefined => CLUE_CARDS.find((card) => card.id === id)?.evidence;
const DEPS: CampaignDeps = { pool: CLUE_CARDS };

const SEATS: readonly CampaignSeatSetup[] = [1, 2].map((seatNumber) => ({
  seatNumber,
  identityCardId: cardId(`hero-${seatNumber}`),
  deck: {
    identityCardId: cardId(`hero-${seatNumber}`),
    aspects: [],
    cards: [{ cardId: cardId(`card-of-${seatNumber}`), quantity: 2 }],
  },
}));

const slot = (name: string): CampaignValue => ({ kind: "choice", slot: name });
const between = (
  id: string,
  ops: readonly CampaignOp[],
  over: Partial<CampaignInstruction> = {},
): CampaignInstruction => ({
  id,
  text: "test",
  citation: "test",
  step: { kind: "betweenGames", ops },
  ...over,
});

/** "Prepare the evidence": one sealed draw a kind, into the hidden envelope; the evidence gained is given up. */
const prepare = (perAttempt: boolean): readonly CampaignOp[] => [
  ...EVIDENCE_KINDS.map((kind): CampaignOp => ({
    kind: "random",
    slot: kind,
    from: { kind: "cards", cardIds: ofKind(kind) },
    sealed: true,
    ...(perAttempt ? { perAttempt: true as const } : {}),
  })),
  { kind: "setField", field: "envelope", value: slot("means") },
  { kind: "appendToList", field: "envelope", value: slot("motive") },
  { kind: "appendToList", field: "envelope", value: slot("opportunity") },
  { kind: "clearField", field: "evidence" },
];

/** "Gain one evidence card from the S.H.I.E.L.D. envelope": one of the cards in neither list. */
const gainOne = (perAttempt: boolean): readonly CampaignOp[] => [
  {
    kind: "random",
    slot: "gained",
    ...(perAttempt ? { perAttempt: true as const } : {}),
    from: {
      kind: "excludingTitles",
      from: {
        kind: "excludingTitles",
        from: { kind: "cards", cardIds: ALL },
        titlesIn: { kind: "field", field: "envelope" },
      },
      titlesIn: { kind: "field", field: "evidence" },
    },
  },
  { kind: "appendToList", field: "evidence", value: slot("gained") },
];

/**
 * MC50 p. 19's DEFEAT list for a standard campaign. N is read first, into a working field, because the next bullet
 * clears the evidence it counts. Then one gain for each of the N, each gated on the count: `random.count` is a fixed
 * number, so "N gains" is written as that many gated single gains (N is at most 4 in the box, 3 here).
 */
const DEFEAT_STANDARD: readonly CampaignOp[] = [
  { kind: "setField", field: "earned", value: { kind: "count", field: "evidence" } },
  ...prepare(true),
  ...[1, 2, 3, 4].map((nth): CampaignOp => ({
    kind: "if",
    when: { kind: "fieldAtLeast", field: "earned", amount: nth },
    then: gainOne(true),
  })),
];

const definition: CampaignDefinition = {
  campaignId: CAMPAIGN_ID,
  version: "1",
  logFields: [
    { id: "envelope", label: "Envelope", scope: "shared", type: { kind: "cardList" }, hidden: true, citation: "t" },
    { id: "evidence", label: "Evidence", scope: "shared", type: { kind: "cardList" }, citation: "t" },
    { id: "earned", label: "Earned", scope: "shared", type: { kind: "number" }, working: true, citation: "t" },
    { id: "carried", label: "Carried", scope: "shared", type: { kind: "number" }, citation: "t" },
    { id: "nodeScratch", label: "Scratch", scope: "shared", type: { kind: "number" }, citation: "t" },
  ],
  loss: { retry: "byInstruction", retryBaseline: "nodeStart", citation: "test" },
  graph: {
    kind: "linear",
    nodes: [
      {
        id: "opening",
        label: "opening",
        scenario: { kind: "fixed", scenarioId: SCENARIO },
        setup: [between("opening.prepare", prepare(false))],
        victory: [
          between("opening.gain", [...gainOne(false), ...gainOne(false), ...gainOne(false)]),
          between("opening.carry", [{ kind: "setField", field: "carried", value: { kind: "const", value: 4 } }]),
        ],
      },
      {
        id: "final",
        label: "final",
        scenario: { kind: "fixed", scenarioId: SCENARIO },
        // Something the node itself writes before the game, which a loss must roll back.
        setup: [
          between("final.scratch", [{ kind: "addToField", field: "nodeScratch", value: { kind: "const", value: 1 } }]),
        ],
        victory: [between("final.won", [{ kind: "endCampaign", result: "won" }])],
        defeat: [
          between("final.defeat.expert", [{ kind: "endCampaign", result: "lost" }], {
            whenModes: { expertCampaign: true },
          }),
          between("final.defeat.standard", DEFEAT_STANDARD, { whenModes: { expertCampaign: false } }),
        ],
      },
    ],
  },
};

const newLog = (seed: number, modes: PlayModes): CampaignLog =>
  createCampaignLog(definition, { id: "run", seats: SEATS, modes, poolVersion: "test", seed });

function compose(log: CampaignLog): CampaignLog {
  const outcome = resolveBetweenGames(definition, log, DEPS, log.modes);
  if (outcome.kind !== "done") throw new Error("a draw asked a question");
  return outcome.value;
}

function finish(
  log: CampaignLog,
  outcome: "won" | "lost",
  logWrites: CampaignGameResult["logWrites"] = [],
): CampaignLog {
  const result: CampaignGameResult = {
    nodeId: log.attempt?.nodeId ?? "",
    outcome,
    records: [],
    removedFromCampaign: [],
    logWrites,
    expiringGrants: [],
  };
  const applied = applyCampaignResult(definition, log, result, { at: 1_700_000_000_000 }, DEPS);
  if (applied.kind !== "done") throw new Error("unexpected pending choice after the game");
  return applied.value;
}

const cardsIn = (log: CampaignLog, field: "envelope" | "evidence"): readonly CardId[] => {
  const value = field === "envelope" ? log.hidden.envelope : log.shared.evidence;
  return value?.kind === "cardList" ? value.cardIds : [];
};

interface Run {
  /** The log as the final node began: three evidence cards earned. */
  readonly start: CampaignLog;
  readonly afterFirstLoss: CampaignLog;
  readonly afterSecondLoss: CampaignLog;
}

/** The opening node won, then the final node composed and lost twice. */
function loseTwice(seed: number, modes: PlayModes = STANDARD): Run {
  const start = finish(compose(newLog(seed, modes)), "won");
  const afterFirstLoss = finish(compose(start), "lost");
  const afterSecondLoss = finish(compose(afterFirstLoss), "lost");
  return { start, afterFirstLoss, afterSecondLoss };
}

const SEEDS = Array.from({ length: 60 }, (_, index) => index + 1);

describe("a DEFEAT block that draws (§3.76; MC50 p. 19)", () => {
  it("1. the block's writes survive the restore: a new envelope and N new evidence cards outside it", () => {
    for (const seed of SEEDS) {
      const { start, afterFirstLoss, afterSecondLoss } = loseTwice(seed);
      expect(cardsIn(start, "evidence")).toHaveLength(3);
      for (const log of [afterFirstLoss, afterSecondLoss]) {
        const envelope = cardsIn(log, "envelope");
        const evidence = cardsIn(log, "evidence");
        expect(envelope.map(kindOf)).toEqual(["means", "motive", "opportunity"]);
        expect(log.hidden.envelope?.sealed).toBe(true);
        // 3. N was read before the evidence was cleared, and no gain drew a card of the new envelope.
        expect(log.shared.earned).toEqual({ kind: "number", value: 3 });
        expect(evidence).toHaveLength(3);
        expect(new Set(evidence).size).toBe(3);
        expect(evidence.some((id) => envelope.includes(id))).toBe(false);
        // The retry is offered: the campaign is active and the same node is next.
        expect(log.status).toBe("active");
        expect(log.position.nextNodeId).toBe("final");
        expect(log.attempt).toBeUndefined();
      }
    }
  });

  it("2. a second loss deals again: the attempt number differs, and so do the deals across seeds", () => {
    let differing = 0;
    for (const seed of SEEDS) {
      const { afterFirstLoss, afterSecondLoss } = loseTwice(seed);
      const stepOf = (log: CampaignLog) =>
        log.history[log.history.length - 1]!.steps.find((step) => step.instructionId === "final.defeat.standard")!;
      const first = stepOf(afterFirstLoss);
      const second = stepOf(afterSecondLoss);
      // Three sealed draws and three gains, each traced with the attempt it was made for.
      expect(first.choices.map((choice) => choice.attempt)).toEqual([1, 1, 1, 1, 1, 1]);
      expect(second.choices.map((choice) => choice.attempt)).toEqual([2, 2, 2, 2, 2, 2]);
      expect(first.choices.slice(0, 3)).toEqual(
        EVIDENCE_KINDS.map((kind) => ({
          slot: kind,
          seatNumber: null,
          picked: [],
          random: true,
          attempt: 1,
          sealed: true,
          drawn: 1,
        })),
      );
      // The sealed cards are in neither loss's trace.
      const traces = JSON.stringify([first, second]);
      for (const log of [afterFirstLoss, afterSecondLoss]) {
        const gained = cardsIn(log, "evidence");
        for (const id of cardsIn(log, "envelope")) {
          // An envelope card of one deal may be an evidence card of the other, which is open; only then is it named.
          const open = [afterFirstLoss, afterSecondLoss].some((other) => cardsIn(other, "evidence").includes(id));
          if (!open && !gained.includes(id)) expect(traces).not.toContain(`"${id}"`);
        }
      }
      if (cardsIn(afterFirstLoss, "envelope").join() !== cardsIn(afterSecondLoss, "envelope").join()) differing++;
    }
    // A deal is one of 27, so two deals can coincide by chance; most seeds deal two different envelopes.
    expect(differing).toBeGreaterThan(SEEDS.length / 2);
  });

  it("5. everything else is as it was when the node began: the fields, the decks, the position", () => {
    const { start, afterFirstLoss, afterSecondLoss } = loseTwice(11);
    for (const log of [afterFirstLoss, afterSecondLoss]) {
      expect(log.shared.carried).toEqual(start.shared.carried);
      // The node's own setup write was rolled back each time (it would read 1, then 2, otherwise).
      expect(log.shared.nodeScratch).toBeUndefined();
      expect(log.seats).toEqual(start.seats);
      expect(log.position).toEqual(start.position);
      expect(log.removedFromCampaign).toEqual(start.removedFromCampaign);
    }
    // What the lost game itself wrote to the log is kept, as every box's in-game write is (RRG 1.8 p. 29; design
    // Q6). Evidence gained inside the game is the game's own state and is never written, so nothing of it is here.
    const written = finish(compose(start), "lost", [
      { field: "carried", seatNumber: null, mode: "add", value: { kind: "number", value: 1 } },
    ]);
    expect(written.shared.carried).toEqual({ kind: "number", value: 5 });
    expect(cardsIn(written, "evidence")).toHaveLength(3);
  });

  it("replaying the log from its seed reproduces both deals", () => {
    for (const seed of [3, 17, 42]) {
      const once = loseTwice(seed);
      const again = loseTwice(seed);
      expect(again.afterFirstLoss).toEqual(once.afterFirstLoss);
      expect(again.afterSecondLoss).toEqual(once.afterSecondLoss);
      // And through storage between every step.
      const stored = (log: CampaignLog): CampaignLog => JSON.parse(JSON.stringify(log)) as CampaignLog;
      const start = stored(finish(stored(compose(stored(newLog(seed, STANDARD)))), "won"));
      const first = stored(finish(stored(compose(start)), "lost"));
      const second = stored(finish(stored(compose(first)), "lost"));
      expect(second.hidden).toEqual(once.afterSecondLoss.hidden);
      expect(second.shared).toEqual(once.afterSecondLoss.shared);
    }
  });

  it("the retry's own baseline is the log after the block, so a third attempt starts from the new deal", () => {
    const { afterFirstLoss } = loseTwice(5);
    const retry = compose(afterFirstLoss);
    expect(retry.attempt?.logBefore.hidden).toEqual(afterFirstLoss.hidden);
    expect(retry.attempt?.logBefore.shared).toEqual(afterFirstLoss.shared);
    // Won on the retry: the campaign is won with the second deal still sealed in the log.
    const won = finish(retry, "won");
    expect(won.status).toBe("won");
    expect(won.hidden.envelope).toEqual(afterFirstLoss.hidden.envelope);
  });

  it("the block draws on from the composed game's RNG: no draw of it is the value that seeded the lost game", () => {
    // The final node's setup draws nothing, so from the node's start the next RNG value is the lost game's seed. A
    // block that began there would deal `means[seed % 3]` every time, a sealed card readable off a logged number.
    let tied = 0;
    for (const seed of SEEDS) {
      const start = finish(compose(newLog(seed, STANDARD)), "won");
      const composed = compose(start);
      const lost = finish(composed, "lost");
      if (cardsIn(lost, "envelope")[0] === ofKind("means")[composed.attempt!.input.seed % 3]) tied++;
      // The log keeps the RNG where the block left it: past the game's seed, by one value a draw among several.
      expect(lost.rng.draws).toBeGreaterThan(composed.rng.draws);
      expect(composed.rng.draws).toBe(start.rng.draws + 1);
    }
    // One deal in three matches by chance; all of them would match if the block read the seed's value again.
    expect(tied).toBeLessThan(SEEDS.length * 0.6);
    expect(tied).toBeGreaterThan(0);
  });

  it("4. in an expert campaign the same loss ends the campaign: lost, no retry, no new deal", () => {
    const start = finish(compose(newLog(9, EXPERT)), "won");
    const lost = finish(compose(start), "lost");
    expect(lost.status).toBe("lost");
    expect(lost.position.nextNodeId).toBeNull();
    expect(lost.hidden.envelope).toEqual(start.hidden.envelope);
    expect(lost.shared.evidence).toEqual(start.shared.evidence);
    const entry = lost.history[lost.history.length - 1]!;
    expect(entry.steps.find((step) => step.instructionId === "final.defeat.standard")?.skipped).toBe("modes");
    expect(() => resolveBetweenGames(definition, lost, DEPS, lost.modes)).toThrow(/is lost, not active/);
    // A block that draws nothing leaves the RNG at the node's start, as a free retry does.
    expect(lost.rng).toEqual(start.rng);
  });
});
