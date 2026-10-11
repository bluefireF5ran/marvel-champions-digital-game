/**
 * docs/phase7-wave9.md §3.75: a sealed draw between games, and the same cards inside a game.
 *
 * MC50 p. 5, "Preparing the Evidence": "Shuffle each set of three cards separately and put one card from each set into
 * the A.I.M. envelope **without looking at them**." MC50 p. 18: "If you are playing in campaign mode, simply place the
 * A.I.M. and S.H.I.E.L.D. envelopes within reach." MC50 p. 6: an evidence card gained comes from the other envelope.
 *
 * What these tests pin, in the order the report states it:
 * 1. where the stored log holds the sealed cards (the hidden field and the retry baselines, and nowhere in a trace);
 * 2. that the log replays to the same sealed cards from its seed with nothing written down;
 * 3. what a reader who is not the authority gets (`sealCampaignLog`, `sealHiddenPiles`): sizes, and no card;
 * 4. what the between-games vocabulary and a game may and may not do with a sealed value.
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
  type EvidenceCombination,
  type EvidenceKind,
  type PlayModes,
} from "@mc/content";
import { DEFAULT_DEPS } from "../abilities.js";
import { evidenceRowsLeft } from "../accusation.js";
import { createCtx } from "../ctx.js";
import { seedHiddenPiles } from "../resolve/hidden-piles.js";
import type {
  CampaignDefinition,
  CampaignInstruction,
  CampaignLog,
  CampaignNode,
  CampaignOp,
  CampaignValue,
} from "../campaign.js";
import type { GameEvent } from "../events.js";
import { evaluate, resolveValue, type EffectContext } from "../select.js";
import { createGame, type GameSetupConfig } from "../setup.js";
import type { EffectSpec } from "../spec.js";
import type { GameState } from "../state.js";
import { runCommands } from "../testing/drive.js";
import { DEFAULT_CARDS, DEFAULT_DECK, HERO, MAIN_SCHEME, VILLAIN, seatIdentities } from "../testing/scenario.js";
import { hiddenPileViews, sealHiddenInformation, sealHiddenPiles } from "../visibility.js";
import { campaignResultOf } from "./result.js";
import {
  applyCampaignResult,
  createCampaignLog,
  resolveBetweenGames,
  startGameFromLog,
  type CampaignSeatSetup,
} from "./runner.js";
import { sealCampaignLog } from "./seal.js";

const CAMPAIGN_ID = campaignId("sealed-draw-test");
const MODES: PlayModes = { campaign: { campaignId: CAMPAIGN_ID } };
const SCENARIO = scenarioId("sealed-draw-test-scenario");
const CLUES = "clues";

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
  encounterSetIds: [encounterSetId(CLUES)],
  traits: [],
  text: unerrataedText(""),
  abilities: [],
});
const CLUE_CARDS = EVIDENCE_KINDS.flatMap((kind) => [0, 1, 2].map((n) => clue(`clue-${kind}-${n}`, kind)));
const ALL: readonly CardId[] = CLUE_CARDS.map((card) => card.id);
const ofKind = (kind: EvidenceKind): readonly CardId[] =>
  CLUE_CARDS.filter((card) => card.evidence === kind).map((card) => card.id);
const kindOf = (id: string): EvidenceKind | undefined => CLUE_CARDS.find((card) => card.id === id)?.evidence;

/** Every combination once; the board member is irrelevant here. */
const GRID: readonly EvidenceCombination[] = ofKind("means").flatMap((means) =>
  ofKind("motive").flatMap((motive) =>
    ofKind("opportunity").map((opportunity) => ({ means, motive, opportunity, boardMember: cardId("nobody") })),
  ),
);

const SEATS: readonly CampaignSeatSetup[] = [1, 2].map((seatNumber) => ({
  seatNumber,
  identityCardId: cardId(`hero-${seatNumber}`),
  deck: { identityCardId: cardId(`hero-${seatNumber}`), aspects: [], cards: [] },
}));
const identities = seatIdentities(HERO, 2);
const DEPS = { pool: CLUE_CARDS };

const slot = (name: string): CampaignValue => ({ kind: "choice", slot: name });
const between = (id: string, ops: readonly CampaignOp[]): CampaignInstruction => ({
  id,
  text: "test",
  citation: "test",
  step: { kind: "betweenGames", ops },
});
const inGame = (id: string, effects: readonly EffectSpec[]): CampaignInstruction => ({
  id,
  text: "test",
  citation: "test",
  step: { kind: "inGame", window: "beforeStartingHands", effects },
});

/** "Prepare the evidence": one sealed draw from each kind's three cards, into the hidden field. */
const PREPARE: readonly CampaignOp[] = [
  ...EVIDENCE_KINDS.map((kind): CampaignOp => ({
    kind: "random",
    slot: kind,
    from: { kind: "cards", cardIds: ofKind(kind) },
    sealed: true,
  })),
  { kind: "setField", field: "envelope", value: slot("means") },
  { kind: "appendToList", field: "envelope", value: slot("motive") },
  { kind: "appendToList", field: "envelope", value: slot("opportunity") },
  { kind: "clearField", field: "evidence" },
];

/** "Gain one evidence card": an open draw from the cards that are in neither the envelope nor the evidence gained. */
const gain = (count: number): readonly CampaignOp[] => [
  {
    kind: "random",
    slot: "gained",
    count,
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

const SEED_PILES: EffectSpec = {
  kind: "seedHiddenPiles",
  piles: { aim: { campaignLogField: "envelope" } },
  revealed: { campaignLogField: "evidence" },
  rest: { set: CLUES, to: "shield" },
};

const node = (id: string, over: Partial<CampaignNode> = {}): CampaignNode => ({
  id,
  label: id,
  scenario: { kind: "fixed", scenarioId: SCENARIO },
  setup: [],
  victory: [],
  ...over,
});

function definitionOf(nodes: readonly CampaignNode[]): CampaignDefinition {
  return {
    campaignId: CAMPAIGN_ID,
    version: "1",
    logFields: [
      { id: "envelope", label: "Envelope", scope: "shared", type: { kind: "cardList" }, hidden: true, citation: "t" },
      { id: "evidence", label: "Evidence", scope: "shared", type: { kind: "cardList" }, citation: "t" },
      { id: "copy", label: "Copy", scope: "shared", type: { kind: "cardList" }, hidden: true, citation: "t" },
      { id: "scratch", label: "Scratch", scope: "shared", type: { kind: "number" }, hidden: true, citation: "t" },
      { id: "count", label: "Count", scope: "shared", type: { kind: "number" }, citation: "t" },
    ],
    loss: { retry: "free", retryBaseline: "nodeStart" },
    graph: { kind: "linear", nodes },
  };
}

const DEFINITION = definitionOf([
  node("first", {
    setup: [between("first.prepare", PREPARE)],
    victory: [between("first.gain", gain(2))],
  }),
  node("second", {
    setup: [
      inGame("second.envelopes", [
        SEED_PILES,
        // "Gain 2 cards … (1 card instead in campaign mode)".
        {
          kind: "gainFromHiddenPile",
          pile: "shield",
          count: {
            kind: "conditional",
            if: { kind: "inCampaign" },
            then: { kind: "const", value: 1 },
            else: { kind: "const", value: 2 },
          },
        },
      ]),
    ],
  }),
]);

const newLog = (definition: CampaignDefinition = DEFINITION, seed = 7): CampaignLog =>
  createCampaignLog(definition, { id: "run", seats: SEATS, modes: MODES, poolVersion: "test", seed });

function composed(definition: CampaignDefinition, log: CampaignLog): CampaignLog {
  const result = resolveBetweenGames(definition, log, DEPS, MODES);
  if (result.kind !== "done") throw new Error("unexpected pending choice");
  return result.value;
}

function playGame(campaign: GameSetupConfig["campaign"]): { state: GameState; events: readonly GameEvent[] } {
  const config: GameSetupConfig = {
    seed: campaign?.seed ?? 1,
    cards: [...DEFAULT_CARDS, ...identities, ...CLUE_CARDS],
    villainCardId: VILLAIN.id,
    mainSchemeCardId: MAIN_SCHEME.id,
    encounterDeck: [],
    players: identities.map((identity) => ({ identityCardId: identity.id, deck: DEFAULT_DECK })),
    ...(campaign ? { campaign } : {}),
  };
  const created = createGame(config, DEFAULT_DEPS);
  if (!created.ok) throw new Error(`setup failed: ${created.error.message}`);
  const driven = runCommands(created.state, DEFAULT_DEPS);
  return { state: driven.state, events: [...created.events, ...driven.events] };
}

const won = (state: GameState): GameState => ({
  ...state,
  outcome: { result: "win" as const, reason: "villainDefeated" as const },
});

/** Node one composed and won, node two composed: the log at the start of the second game. */
function atSecondGame(seed = 7): { readonly first: CampaignLog; readonly second: CampaignLog } {
  const first = composed(DEFINITION, newLog(DEFINITION, seed));
  const game = playGame(startGameFromLog(DEFINITION, first).input);
  const result = campaignResultOf(DEFINITION, first, won(game.state), game.events, DEFAULT_DEPS);
  const applied = applyCampaignResult(DEFINITION, first, result, { at: 1 }, DEPS);
  if (applied.kind !== "done") throw new Error("unexpected pending choice");
  return { first, second: composed(DEFINITION, applied.value) };
}

const envelopeOf = (log: CampaignLog): readonly CardId[] => {
  const value = log.hidden.envelope;
  if (value?.kind !== "cardList") throw new Error("no envelope");
  return value.cardIds;
};
const evidenceOf = (log: CampaignLog): readonly CardId[] => {
  const value = log.shared.evidence;
  return value?.kind === "cardList" ? value.cardIds : [];
};
/** Whether any of `ids` appears anywhere in the JSON of `value`. */
const names = (value: unknown, ids: readonly string[]): boolean => {
  const text = JSON.stringify(value);
  return ids.some((id) => text.includes(`"${id}"`));
};

describe("a sealed draw between games (§3.75, task 53)", () => {
  it("fills the hidden field with one card of each kind, marked sealed", () => {
    const log = composed(DEFINITION, newLog());
    const envelope = envelopeOf(log);
    expect(envelope.map(kindOf)).toEqual(["means", "motive", "opportunity"]);
    expect(log.hidden.envelope?.sealed).toBe(true);
    // The stored value carries no size of its own: the size mark is for a copy with the contents taken out.
    expect(log.hidden.envelope?.sealedSize).toBeUndefined();
    expect(log.shared.envelope).toBeUndefined();
  });

  it("the step trace holds three sealed records and three emptied writes, and none of the three cards", () => {
    const log = composed(DEFINITION, newLog());
    const step = log.attempt?.steps.find((entry) => entry.instructionId === "first.prepare");
    expect(step?.choices).toEqual(
      EVIDENCE_KINDS.map((kind) => ({
        slot: kind,
        seatNumber: null,
        picked: [],
        random: true,
        sealed: true,
        drawn: 1,
      })),
    );
    expect(step?.writes).toEqual(
      (["set", "append", "append"] as const).map((mode, index) => ({
        field: "envelope",
        seatNumber: null,
        mode,
        value: { kind: "cardList", cardIds: [], sealed: true, sealedSize: index + 1 },
      })),
    );
    expect(names(log.attempt?.steps, envelopeOf(log))).toBe(false);
    // Once the game is over the steps are the history entry's, still without the cards.
    const { second } = atSecondGame();
    expect(
      names(
        second.history.map((entry) => entry.steps),
        envelopeOf(second),
      ),
    ).toBe(false);
  });

  it("the same seed draws the same envelope with nothing written down; another seed may draw another", () => {
    const envelopes = [7, 7, 8, 9, 10, 11].map((seed) => envelopeOf(composed(DEFINITION, newLog(DEFINITION, seed))));
    expect(envelopes[1]).toEqual(envelopes[0]);
    expect(new Set(envelopes.map((ids) => ids.join("+"))).size).toBeGreaterThan(1);
    // A log that went through storage composes the same game.
    const stored = JSON.parse(JSON.stringify(newLog())) as CampaignLog;
    expect(composed(DEFINITION, stored)).toEqual(composed(DEFINITION, newLog()));
  });

  it("a sealed draw advances the RNG exactly as an open draw does", () => {
    const open = definitionOf([
      node("first", {
        setup: [
          between(
            "first.prepare",
            PREPARE.map((op) => {
              if (op.kind !== "random") return op;
              const { sealed: _sealed, ...plain } = op;
              return plain;
            }),
          ),
        ],
      }),
    ]);
    const sealedLog = composed(DEFINITION, newLog());
    const openLog = composed(open, newLog(open));
    expect(openLog.rng).toEqual(sealedLog.rng);
    expect(envelopeOf(openLog)).toEqual(envelopeOf(sealedLog));
    // The open draw is traced card by card, and its value is not sealed.
    expect(openLog.hidden.envelope?.sealed).toBeUndefined();
    expect(names(openLog.attempt?.steps, envelopeOf(openLog))).toBe(true);
  });

  it("refuses a sealed slot anywhere but a hidden field", () => {
    const refused = (ops: readonly CampaignOp[]) => () =>
      composed(definitionOf([node("first", { setup: [between("first.prepare", [PREPARE[0]!, ...ops])] })]), newLog());
    const sealedMeans = slot("means");
    expect(refused([{ kind: "setField", field: "evidence", value: sealedMeans }])).toThrow(/is sealed/);
    expect(refused([{ kind: "appendToList", field: "evidence", value: sealedMeans }])).toThrow(/is sealed/);
    expect(refused([{ kind: "setField", field: "count", value: sealedMeans }])).toThrow(/is sealed/);
    expect(refused([{ kind: "grantCard", seat: "each", card: sealedMeans, permanence: "campaign" }])).toThrow(
      /is sealed/,
    );
    expect(refused([{ kind: "setAsideCards", cards: [sealedMeans] }])).toThrow(/is sealed/);
    expect(refused([{ kind: "composeEncounterSets", sets: [sealedMeans] }])).toThrow(/is sealed/);
    expect(refused([{ kind: "removeFromCampaign", cards: [sealedMeans] }])).toThrow(/is sealed/);
    expect(
      refused([{ kind: "choose", slot: "look", chooser: "group", from: { kind: "values", of: sealedMeans } }]),
    ).toThrow(/is sealed/);
    expect(
      refused([
        {
          kind: "random",
          slot: "other",
          from: { kind: "excludingTitles", from: { kind: "cards", cardIds: ALL }, titlesIn: sealedMeans },
        },
      ]),
    ).toThrow(/is sealed/);
    // Whether anything was drawn is not a card: `choiceMade` may ask.
    expect(
      refused([
        {
          kind: "if",
          when: { kind: "choiceMade", slot: "means" },
          then: [{ kind: "setField", field: "count", value: { kind: "const", value: 1 } }],
        },
      ]),
    ).not.toThrow();
  });

  it("a sealed field can be counted, copied to a hidden field and used to filter a draw, and read by nothing else", () => {
    const after = (ops: readonly CampaignOp[]) =>
      composed(definitionOf([node("first", { setup: [between("first.prepare", [...PREPARE, ...ops])] })]), newLog());
    const envelope: CampaignValue = { kind: "field", field: "envelope" };

    const counted = after([{ kind: "setField", field: "count", value: { kind: "count", field: "envelope" } }]);
    expect(counted.shared.count).toEqual({ kind: "number", value: 3 });

    const copied = after([{ kind: "setField", field: "copy", value: envelope }]);
    expect(copied.hidden.copy).toEqual({ kind: "cardList", cardIds: envelopeOf(copied), sealed: true });
    expect(names(copied.attempt?.steps, envelopeOf(copied))).toBe(false);

    expect(() => after([{ kind: "setField", field: "evidence", value: envelope }])).toThrow(/holds a sealed value/);
    expect(() => after([{ kind: "grantCard", seat: "each", card: envelope, permanence: "campaign" }])).toThrow(
      /holds a sealed value/,
    );
    expect(() =>
      after([
        {
          kind: "if",
          when: { kind: "fieldContains", field: "envelope", value: ALL[0]! },
          then: [],
        },
      ]),
    ).toThrow(/holds a sealed value/);
    // Its size is open: "is anything in it" and "are there three" are not cards.
    expect(() =>
      after([
        { kind: "if", when: { kind: "fieldIsSet", field: "envelope" }, then: [] },
        { kind: "if", when: { kind: "fieldAtLeast", field: "envelope", amount: 3 }, then: [] },
      ]),
    ).not.toThrow();
  });

  it("an open value added to a sealed field stays sealed, and a set replaces it", () => {
    const after = (ops: readonly CampaignOp[]) =>
      composed(definitionOf([node("first", { setup: [between("first.prepare", [...PREPARE, ...ops])] })]), newLog());
    const added = after([{ kind: "appendToList", field: "envelope", value: { kind: "const", value: "extra" } }]);
    expect(added.hidden.envelope).toMatchObject({ sealed: true });
    expect(envelopeOf(added)).toHaveLength(4);
    expect(names(added.attempt?.steps, envelopeOf(added).slice(0, 3))).toBe(false);
    const replaced = after([{ kind: "setField", field: "envelope", value: { kind: "const", value: "open" } }]);
    expect(replaced.hidden.envelope).toEqual({ kind: "cardList", cardIds: ["open"] });
  });

  it("a gain never draws a card of the envelope, whatever the seed, and is traced openly", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { second } = atSecondGame(seed);
      const envelope = envelopeOf(second);
      const evidence = evidenceOf(second);
      expect(evidence).toHaveLength(2);
      expect(evidence.some((id) => envelope.includes(id))).toBe(false);
      const step = second.history[0]?.steps.find((entry) => entry.instructionId === "first.gain");
      expect(step?.choices[0]).toMatchObject({ slot: "gained", picked: evidence, random: true });
      expect(step?.choices[0]?.sealed).toBeUndefined();
    }
  });
});

describe("what holds the sealed cards, and what a player's copy holds (§3.75)", () => {
  it("the stored log holds them in the hidden field and in the retry baselines taken after the draw", () => {
    const { second } = atSecondGame();
    const envelope = envelopeOf(second);
    expect(names(second.hidden, envelope)).toBe(true);
    // The first node's baseline was taken before the draw; the second's after it.
    expect(names(second.history[0]?.logBefore, envelope)).toBe(false);
    expect(names(second.attempt?.logBefore.hidden, envelope)).toBe(true);
    // Nothing else of the stored log names them, apart from the game input of a game that reads them.
    const { hidden: _hidden, history, attempt, ...rest } = second;
    expect(names(rest, envelope)).toBe(false);
    expect(
      names(
        history.map(({ logBefore: _before, ...entry }) => entry),
        envelope,
      ),
    ).toBe(false);
    expect(names(attempt?.steps, envelope)).toBe(false);
  });

  it("sealCampaignLog: sizes for the sealed values, no seed and no RNG state, everything open untouched", () => {
    const { second } = atSecondGame();
    const envelope = envelopeOf(second);
    const sealed = sealCampaignLog(second);
    expect(names(sealed, envelope)).toBe(false);
    expect(sealed.hidden.envelope).toEqual({ kind: "cardList", cardIds: [], sealed: true, sealedSize: 3 });
    expect(sealed.attempt?.logBefore.hidden.envelope).toMatchObject({ sealedSize: 3 });
    expect(sealed.attempt?.input.log.hidden?.envelope).toMatchObject({ cardIds: [], sealedSize: 3 });
    const text = JSON.stringify(sealed);
    expect(text).not.toContain('"rng"');
    expect(text).not.toContain('"seed"');
    expect(sealed.shared).toEqual(second.shared);
    expect(sealed.seats).toEqual(second.seats);
    expect(sealed.history.map((entry) => entry.steps)).toEqual(second.history.map((entry) => entry.steps));
    // A log with nothing sealed keeps its hidden record as it is.
    const plain = newLog();
    expect(sealCampaignLog(plain).hidden).toBe(plain.hidden);
  });

  it("a game that reads no sealed value is handed none; one that does gets it apart from the shared fields", () => {
    const { first, second } = atSecondGame();
    const envelope = envelopeOf(second);
    const firstInput = startGameFromLog(DEFINITION, first).input;
    expect(firstInput.log.hidden).toBeUndefined();
    expect(names(firstInput, envelope)).toBe(false);
    const secondInput = startGameFromLog(DEFINITION, second).input;
    expect(secondInput.log.hidden).toEqual({ envelope: { kind: "cardList", cardIds: envelope, sealed: true } });
    expect(secondInput.log.shared.envelope).toBeUndefined();
    expect(names({ ...secondInput, log: { ...secondInput.log, hidden: undefined } }, envelope)).toBe(false);
  });

  it("a hidden field holding an ordinary value is still handed to the game in the shared part", () => {
    const scratch = definitionOf([
      node("first", {
        setup: [
          between("first.scratch", [{ kind: "setField", field: "scratch", value: { kind: "const", value: 4 } }]),
          inGame("first.read", [
            {
              kind: "placeThreat",
              target: { kind: "mainScheme" },
              amount: { kind: "campaignLog", field: "scratch" },
            },
          ]),
        ],
      }),
    ]);
    const log = composed(scratch, newLog(scratch));
    const input = startGameFromLog(scratch, log).input;
    expect(input.log.shared.scratch).toEqual({ kind: "number", value: 4 });
    expect(input.log.hidden).toBeUndefined();
    // And it is traced as it always was.
    expect(log.attempt?.steps[0]?.writes[0]?.value).toEqual({ kind: "number", value: 4 });
  });
});

describe("the envelopes inside a campaign game (§3.75, task 54)", () => {
  const context: EffectContext = {
    selfInstanceId: null,
    controllerId: null,
    event: null,
    bindings: {},
    deps: DEFAULT_DEPS,
  };

  function secondGame(seed = 7) {
    const { second } = atSecondGame(seed);
    const input = startGameFromLog(DEFINITION, second).input;
    return { log: second, input, ...playGame(input) };
  }

  it("seeds the piles from the log: the envelope, the evidence faceup, the rest shuffled into the other pile", () => {
    const { log, state, events } = secondGame();
    const envelope = envelopeOf(log);
    const evidence = evidenceOf(log);
    expect(state.hiddenPiles?.aim).toEqual(envelope);
    // Two evidence cards were earned, and the instruction gains one more in a campaign: 6 - 2 - 1 are left.
    expect(state.hiddenPiles?.shield).toHaveLength(3);
    const faceup = state.revealedPileCards?.shield ?? [];
    expect(faceup.slice(0, 2)).toEqual(evidence);
    expect(faceup).toHaveLength(3);
    const everywhere = [...envelope, ...(state.hiddenPiles?.shield ?? []), ...faceup];
    expect([...everywhere].sort()).toEqual([...ALL].sort());
    expect(events.filter((event) => event.type === "hiddenPilesDealt")).toEqual([
      {
        type: "hiddenPilesDealt",
        from: CLUES,
        piles: [
          { pile: "aim", size: 3 },
          { pile: "shield", size: 4 },
        ],
        kept: false,
        seeded: true,
        faceup: 2,
      },
    ]);
    // The rows left are those with none of the faceup cards.
    const left = evidenceRowsLeft(GRID, faceup);
    expect(left.length).toBeLessThan(27);
    expect(left.every((row) => !faceup.includes(row.means) && !faceup.includes(row.motive))).toBe(true);
    expect(evidenceRowsLeft(GRID, evidence)).toHaveLength(
      GRID.filter((row) => ![row.means, row.motive, row.opportunity].some((id) => evidence.includes(id))).length,
    );
    expect(evidenceRowsLeft(GRID, [])).toHaveLength(27);
  });

  it("no event, no sealed state and no in-game log read names a card that is still in a pile", () => {
    const { state, events } = secondGame();
    const inPiles = [...(state.hiddenPiles?.aim ?? []), ...(state.hiddenPiles?.shield ?? [])];
    expect(names(events, inPiles)).toBe(false);
    // The authority's state holds them twice: in the piles, and in the campaign input the game was built from.
    expect(names(state.hiddenPiles, inPiles)).toBe(true);
    expect(names(state.campaign?.log.hidden, state.hiddenPiles?.aim ?? [])).toBe(true);
    // A player's copy holds neither. The card pool lists every card of the game, so it is set apart for the check.
    for (const sealed of [sealHiddenPiles(state), sealHiddenInformation(state)]) {
      const { cardPool: _pool, ...rest } = sealed;
      expect(names(rest, inPiles)).toBe(false);
      expect(sealed.hiddenPileSizes).toEqual({ aim: 3, shield: 3 });
      expect(sealed.campaign?.log.hidden?.envelope).toEqual({
        kind: "cardList",
        cardIds: [],
        sealed: true,
        sealedSize: 3,
      });
    }
    expect(hiddenPileViews(state)).toEqual([
      { pile: "aim", size: 3 },
      { pile: "shield", size: 3 },
    ]);
    // The ordinary in-game reads of the log do not reach the sealed part.
    expect(resolveValue(state, { kind: "campaignLog", field: "envelope", of: "count" }, context, DEFAULT_DEPS)).toBe(0);
    expect(evaluate(state, { kind: "campaignLog", field: "envelope" }, context)).toBe(false);
    expect(evaluate(state, { kind: "campaignLog", field: "envelope", has: state.hiddenPiles!.aim![0]! }, context)).toBe(
      false,
    );
  });

  it("seeding on a sealed copy, whose log holds the envelope's size and no card: the same 2 sizes, no card of either pile, and the copy stays sealed", () => {
    const { log, state } = secondGame();
    const inPiles = [...(state.hiddenPiles?.aim ?? []), ...(state.hiddenPiles?.shield ?? [])];
    // A copy sealed before its piles were seeded: the campaign input emptied, and no pile yet.
    const { hiddenPileSizes: _sizes, revealedPileCards: _revealed, ...unseeded } = sealHiddenPiles(state);
    const ctx = createCtx(unseeded, DEFAULT_DEPS);
    seedHiddenPiles(ctx, SEED_PILES as Extract<EffectSpec, { kind: "seedHiddenPiles" }>);
    expect("hiddenPiles" in ctx.state).toBe(false);
    // 9 cards, 3 sealed away and 2 gained and faceup: 4 are the rest (the game then gains 1 more, so its own pile holds 3).
    expect(ctx.state.hiddenPileSizes).toEqual({ aim: 3, shield: 4 });
    expect(ctx.state.revealedPileCards).toEqual({ shield: evidenceOf(log) });
    const { cardPool: _pool, ...rest } = ctx.state;
    expect(names(rest, inPiles)).toBe(false);
    expect(names(ctx.events, inPiles)).toBe(false);
    expect(ctx.events.map((event) => (event.type === "hiddenPilesDealt" ? event.piles : null))).toEqual([
      [
        { pile: "aim", size: 3 },
        { pile: "shield", size: 4 },
      ],
    ]);
  });

  it("the game replays from its own input: the same piles, without the campaign log", () => {
    const { input, state } = secondGame();
    const again = playGame(JSON.parse(JSON.stringify(input)) as typeof input).state;
    expect(again.hiddenPiles).toEqual(state.hiddenPiles);
    expect(again.revealedPileCards).toEqual(state.revealedPileCards);
  });

  it("Predicate inCampaign: true in a campaign game and false in a standalone one, where nothing is seeded", () => {
    const { state } = secondGame();
    expect(evaluate(state, { kind: "inCampaign" }, context)).toBe(true);
    const standalone = playGame(undefined).state;
    expect(evaluate(standalone, { kind: "inCampaign" }, context)).toBe(false);
    expect(standalone.hiddenPiles).toBeUndefined();
    // "Gain 2 cards … (1 card instead in campaign mode)", as a value.
    const gained = {
      kind: "conditional",
      if: { kind: "inCampaign" },
      then: { kind: "const", value: 1 },
      else: { kind: "const", value: 2 },
    } as const;
    expect(resolveValue(state, gained, context, DEFAULT_DEPS)).toBe(1);
    expect(resolveValue(standalone, gained, context, DEFAULT_DEPS)).toBe(2);
  });
});
