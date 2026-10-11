import { AOS_CARDS, AOS_THUNDERBOLT_MINIONS, cardId } from "@mc/content";
import {
  createGame,
  DEFAULT_CAMPAIGN_WINDOW,
  type CampaignDefinition,
  type CampaignInstruction,
  type CampaignLog,
  type CampaignNode,
  type CampaignOp,
  type EffectSpec,
  type GameState,
  type InstanceId,
  type LogWriteSpec,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { firstLegal, patchInstance, settle, stackEncounterDeck } from "../../../testing/harness.js";
import { WAVE9_DEPS } from "../../index.js";
import { wave9Scenario } from "../../setup.js";
import { SPIDER_MAN, codeOf, piles } from "../../testing.js";
import {
  ADAPTOID_COPIES,
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
} from "./carryover.js";
import { EXPERT, STANDARD, buildGame, compose, definitionOf, finishWon, newLog, node } from "./testing.js";

vi.setConfig({ testTimeout: 300_000 });

// ---------------------------------------------------------------------------
// A test definition over the real scenarios: only the carryover instructions of MC50 pp. 9 to 19.
// ---------------------------------------------------------------------------

const between = (id: string, ops: readonly CampaignOp[]): CampaignInstruction => ({
  id,
  text: "test",
  citation: "MC50",
  step: { kind: "betweenGames", ops },
});
const inGame = (id: string, effects: readonly EffectSpec[]): CampaignInstruction => ({
  id,
  text: "test",
  citation: "MC50",
  step: { kind: "inGame", window: DEFAULT_CAMPAIGN_WINDOW, effects },
});
const record = (id: string, writes: readonly LogWriteSpec[]): CampaignInstruction => ({
  id,
  text: "test",
  citation: "MC50",
  step: { kind: "record", writes },
});

const NODES: Readonly<Record<string, Partial<CampaignNode> & { readonly scenarioName: string }>> = {
  one: { scenarioName: "black-widow", victory: [record("one.count", MINIONS_AND_SIDE_SCHEMES_RECORD)] },
  two: {
    scenarioName: "batroc",
    setup: [inGame("two.alert", alertLevelSetup())],
    victory: [record("two.captives", RESCUED_CAPTIVES_RECORD)],
  },
  three: {
    scenarioName: "modok",
    setup: [inGame("three.locks", holdingCellLocksSetup())],
    victory: [record("three.adaptoids", ADAPTOID_ENVIRONMENTS_RECORD)],
  },
  four: { scenarioName: "thunderbolts", victory: [record("four.thunderbolts", THUNDERBOLTS_RECORD)] },
  five: {
    scenarioName: "baron-zemo",
    composition: [
      between("five.compose.environments", adaptoidEnvironmentsComposition),
      between("five.compose.adaptoids", adaptoidsComposition),
      between("five.compose.thunderbolts", thunderboltsComposition),
    ],
    setup: [
      inGame("five.environments", adaptoidEnvironmentsSetup()),
      inGame("five.adaptoids", adaptoidsSetup()),
      inGame("five.thunderbolts", thunderboltsSetup()),
    ],
  },
};

const FIELDS = [
  { id: MINIONS_AND_SIDE_SCHEMES_FIELD, type: { kind: "number" as const, min: 0 } },
  { id: RESCUED_CAPTIVES_FIELD, type: { kind: "number" as const, min: 0, max: 4 } },
  { id: ADAPTOID_ENVIRONMENTS_FIELD, type: { kind: "cardList" as const } },
  { id: SURVIVING_THUNDERBOLTS_FIELD, type: { kind: "cardList" as const } },
].map((field) => ({ ...field, label: field.id, scope: "shared" as const, citation: "MC50 p. 24" }));

const nodeOf = (id: string): CampaignNode => {
  const { scenarioName, ...rest } = NODES[id]!;
  return node(id, scenarioName, rest);
};
const definitionFor = (...ids: readonly string[]): CampaignDefinition => {
  const base = definitionOf(ids.map(nodeOf));
  return { ...base, logFields: FIELDS };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const instances = (s: GameState): InstanceId[] => Object.keys(s.instances) as InstanceId[];
const all = (s: GameState, code: string): InstanceId[] => instances(s).filter((id) => codeOf(s, id) === code);
const typeOf = (s: GameState, id: InstanceId): string => {
  const data = dataOfId(codeOf(s, id));
  return data?.type ?? "";
};
interface Printed {
  readonly type?: string;
  readonly traits?: readonly unknown[];
  readonly encounterSetIds?: readonly unknown[];
}
const dataOfId = (code: string): Printed | undefined =>
  AOS_CARDS.find((c) => (c.id as string) === code) as unknown as Printed | undefined;
const traitsOf = (s: GameState, id: InstanceId): readonly string[] =>
  (dataOfId(codeOf(s, id))?.traits ?? []).map(String);

const inPlayIds = (s: GameState): readonly InstanceId[] => [...s.villainArea, ...s.players.flatMap((p) => p.playArea)];
const lockCounters = (s: GameState): number =>
  inPlayIds(s)
    .filter((id) => codeOf(s, id).startsWith("5010") && codeOf(s, id).endsWith("a"))
    .map((id) => s.instances[id]!.counters["lock"] ?? 0)[0] ?? -1;
const threatOf = (s: GameState, code: string): number => {
  const [id] = all(s, code);
  return s.instances[id!]!.threat;
};

/** Test surgery: these cards come out of the encounter deck, discard and set-aside areas and onto the table. */
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

const where = (s: GameState, pick: (id: InstanceId) => boolean): InstanceId[] => instances(s).filter(pick);

const opened = (definition: CampaignDefinition, log: CampaignLog) => {
  const composed = compose(definition, log);
  const built = buildGame(definition, composed);
  const state = settle(built.state, firstLegal, (s) => s.step.phase === "player", WAVE9_DEPS);
  return { composed, built: built.state, state };
};

const setField = (log: CampaignLog, field: string, value: CampaignLog["shared"][string]): CampaignLog => ({
  ...log,
  shared: { ...log.shared, [field]: value },
});
const numberOf = (log: CampaignLog, field: string): number => {
  const value = log.shared[field];
  return value?.kind === "number" ? value.value : -1;
};
const cardsOf = (log: CampaignLog, field: string): readonly string[] => {
  const value = log.shared[field];
  return value?.kind === "cardList" ? value.cardIds.map(String) : [];
};

const ENVIRONMENTS = ["50109", "50110", "50111", "50112"];
const solo = (id: string, patch: (log: CampaignLog) => CampaignLog = (log) => log) => {
  const definition = definitionFor(id);
  return { definition, ...opened(definition, patch(newLog(definition))) };
};

// ---------------------------------------------------------------------------
// Scenario 1 to 2: Alert Level
// ---------------------------------------------------------------------------

describe("scenario 1 records minions and side schemes; scenario 2 puts that much threat on Alert Level (MC50 pp. 9, 11)", () => {
  it("records every minion and side scheme in play, the main scheme and allies not counted", () => {
    const definition = definitionFor("one", "two");
    const first = opened(definition, newLog(definition));
    const deck = piles(first.state).deck;
    const minions = deck.filter((id) => typeOf(first.state, id) === "minion").slice(0, 3);
    const schemes = deck.filter((id) => typeOf(first.state, id) === "side_scheme").slice(0, 1);
    expect(minions).toHaveLength(3);
    expect(schemes).toHaveLength(1);
    // The opening villain phase already put some in play: the record is that many plus these four.
    const already = numberOf(finishWon(definition, first.composed, first.state), MINIONS_AND_SIDE_SCHEMES_FIELD);
    const won = finishWon(definition, first.composed, putOnTable(first.state, [...minions, ...schemes]));
    expect(numberOf(won, MINIONS_AND_SIDE_SCHEMES_FIELD)).toBe(already + 4);
  });

  it("is restored as 4 threat on Alert Level in scenario 2, still on its Low side (two players: threshold 8)", () => {
    const definition = definitionFor("one", "two");
    const first = opened(definition, newLog(definition));
    const deck = piles(first.state).deck;
    const picks = deck.filter((id) => ["minion", "side_scheme"].includes(typeOf(first.state, id))).slice(0, 2);
    const won = finishWon(definition, first.composed, putOnTable(first.state, picks));
    const recorded = numberOf(won, MINIONS_AND_SIDE_SCHEMES_FIELD);
    expect(recorded).toBeGreaterThanOrEqual(2);
    expect(recorded).toBeLessThan(8);
    const second = opened(definition, won);
    expect(threatOf(second.state, "50090a")).toBe(recorded);
    expect(second.state.instances[all(second.state, "50090a")[0]!]!.flipped).toBeFalsy();
    expect(all(second.state, "50090b")).toHaveLength(0);
  });

  it("is 0 threat when nothing was recorded (a field never written)", () => {
    const { state } = solo("two");
    expect(threatOf(state, "50090a")).toBe(0);
  });

  it("empties and flips Alert Level to High when the record meets the threshold: 8 for two players", () => {
    const { state } = solo("two", (log) => setField(log, MINIONS_AND_SIDE_SCHEMES_FIELD, { kind: "number", value: 8 }));
    const [id] = all(state, "50090a");
    expect(state.instances[id!]!.threat).toBe(0);
    expect(state.instances[id!]!.flipped).toBe(true);
  });

  it("is a standalone game's 0 threat when not in a campaign", () => {
    const created = createGame(wave9Scenario("batroc", { players: [SPIDER_MAN], seed: 3 }), WAVE9_DEPS);
    if (!created.ok) throw new Error(created.error.message);
    const state = settle(created.state, firstLegal, (s) => s.step.phase === "player", WAVE9_DEPS);
    expect(threatOf(state, "50090a")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 to 3: the Holding Cell
// ---------------------------------------------------------------------------

describe("scenario 2 records Rescued Captives; scenario 3 adjusts the top Holding Cell's lock counters (MC50 pp. 11, 13)", () => {
  it("records the Rescued Captive allies in play", () => {
    const definition = definitionFor("two");
    const first = opened(definition, newLog(definition));
    const captives = all(first.built, "50091").slice(0, 3);
    expect(captives).toHaveLength(3);
    const won = finishWon(definition, first.composed, putOnTable(first.state, captives));
    expect(numberOf(won, RESCUED_CAPTIVES_FIELD)).toBe(3);
  });

  it("leaves (5 - X)[per_hero] lock counters: 4 for X = 3 and two players", () => {
    const { state } = solo("three", (log) => setField(log, RESCUED_CAPTIVES_FIELD, { kind: "number", value: 3 }));
    expect(lockCounters(state)).toBe(4);
  });

  it("leaves 10 for X = 0, 6 for X = 2 and 2 for X = 4 (two players)", () => {
    for (const [x, locks] of [
      [0, 10],
      [2, 6],
      [4, 2],
    ] as const) {
      const { state } = solo("three", (log) => setField(log, RESCUED_CAPTIVES_FIELD, { kind: "number", value: x }));
      expect(lockCounters(state)).toBe(locks);
    }
  });

  it("scales with the group: one player, X = 3, leaves 2", () => {
    const definition = definitionFor("three");
    const base = newLog(definition, STANDARD, 7, [newLog(definition).seats[0]!]);
    const { state } = opened(definition, setField(base, RESCUED_CAPTIVES_FIELD, { kind: "number", value: 3 }));
    expect(state.players).toHaveLength(1);
    expect(lockCounters(state)).toBe(2);
  });

  it("is the printed 2[per_hero] in a standalone game", () => {
    const created = createGame(wave9Scenario("modok", { players: [SPIDER_MAN], seed: 3 }), WAVE9_DEPS);
    if (!created.ok) throw new Error(created.error.message);
    const state = settle(created.state, firstLegal, (s) => s.step.phase === "player", WAVE9_DEPS);
    expect(lockCounters(state)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 to 5: the Adaptoids
// ---------------------------------------------------------------------------

describe("scenario 3 marks the Adaptoid environments in play; scenario 5 puts them into play (MC50 pp. 13, 19)", () => {
  it("records each Adaptoid environment in play, by card id", () => {
    const definition = definitionFor("three");
    const first = opened(definition, newLog(definition));
    const onTable = inPlayIds(first.state).filter((id) => traitsOf(first.state, id).includes("ADAPTOID"));
    const third = all(first.built, "50112");
    const extra = where(first.state, (id) => ["50110", "50112"].includes(codeOf(first.state, id)));
    const state = putOnTable(first.state, [...new Set([...extra, ...third])]);
    const inPlay = inPlayIds(state).filter((id) => ENVIRONMENTS.includes(codeOf(state, id)));
    expect(inPlay.length).toBeGreaterThanOrEqual(2);
    expect(onTable.length).toBeGreaterThanOrEqual(1);
    const won = finishWon(definition, first.composed, state);
    expect([...cardsOf(won, ADAPTOID_ENVIRONMENTS_FIELD)].sort()).toEqual(inPlay.map((id) => codeOf(state, id)).sort());
  });

  it("puts exactly the recorded environments into play in scenario 5, and the others nowhere", () => {
    const { state } = solo("five", (log) =>
      setField(log, ADAPTOID_ENVIRONMENTS_FIELD, { kind: "cardList", cardIds: [cardId("50110"), cardId("50112")] }),
    );
    const inPlay = inPlayIds(state).map((id) => codeOf(state, id));
    expect(inPlay).toContain("50110");
    expect(inPlay).toContain("50112");
    expect(inPlay).not.toContain("50109");
    expect(inPlay).not.toContain("50111");
    expect(all(state, "50109")).toHaveLength(0);
    expect(all(state, "50111")).toHaveLength(0);
  });

  it("puts none into play when none was marked", () => {
    const { state } = solo("five");
    expect(inPlayIds(state).filter((id) => ENVIRONMENTS.includes(codeOf(state, id)))).toHaveLength(0);
  });

  it("shuffles all four Adaptoid minions into the encounter deck", () => {
    const { state } = solo("five");
    const deck = piles(state).deck.map((id) => codeOf(state, id));
    expect(deck.filter((code) => code === "50113")).toHaveLength(ADAPTOID_COPIES);
    expect(state.encounterSetAside.map((id) => codeOf(state, id))).not.toContain("50113");
  });

  it("has no Adaptoids, Adaptoid environments or Holding Cells in a standalone Baron Zemo game", () => {
    const created = createGame(wave9Scenario("baron-zemo", { players: [SPIDER_MAN], seed: 3 }), WAVE9_DEPS);
    if (!created.ok) throw new Error(created.error.message);
    const state = created.state;
    for (const code of ["50113", "50109", "50110", "50111", "50112", "50105a"]) {
      expect(all(state, code)).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 to 5: the surviving Thunderbolts
// ---------------------------------------------------------------------------

const JOLT = "50133";
const thunderbolt = (elite: boolean) => AOS_THUNDERBOLT_MINIONS.filter((row) => row.elite === elite);
const setOf = (code: string) =>
  AOS_THUNDERBOLT_MINIONS.find((row) => (row.minionId as string) === code)!.encounterSetId;
const deckSets = (s: GameState): ReadonlySet<string> =>
  new Set(piles(s).deck.flatMap((id) => (dataOfId(codeOf(s, id))?.encounterSetIds ?? []).map(String)));

describe("scenario 4 records the Thunderbolt minions in play; scenario 5 shuffles in their sets (MC50 pp. 15, 19)", () => {
  it("records each Thunderbolt minion in play by card id, and no other card", () => {
    const definition = definitionFor("four");
    const first = opened(definition, newLog(definition));
    const jolt = all(first.built, JOLT);
    const elites = where(
      first.built,
      (id) => traitsOf(first.built, id).includes("THUNDERBOLT") && id !== jolt[0],
    ).slice(0, 1);
    expect(jolt).toHaveLength(1);
    expect(elites).toHaveLength(1);
    const bystander = piles(first.state).deck.find(
      (id) => typeOf(first.state, id) === "minion" && !traitsOf(first.state, id).includes("THUNDERBOLT"),
    );
    const state = putOnTable(first.state, [...jolt, ...elites, ...(bystander ? [bystander] : [])]);
    const already = cardsOf(finishWon(definition, first.composed, first.state), SURVIVING_THUNDERBOLTS_FIELD);
    const won = finishWon(definition, first.composed, state);
    // The scenario's opening already has Thunderbolt minions in play; these two join them, the bystander does not.
    expect([...cardsOf(won, SURVIVING_THUNDERBOLTS_FIELD)].sort()).toEqual(
      [...already, JOLT, codeOf(state, elites[0]!)].sort(),
    );
    expect(
      cardsOf(won, SURVIVING_THUNDERBOLTS_FIELD).every((code) =>
        AOS_THUNDERBOLT_MINIONS.some((row) => row.minionId === code),
      ),
    ).toBe(true);
  });

  it("derives one composition row for each Thunderbolt minion", () => {
    expect(thunderboltsComposition).toHaveLength(AOS_THUNDERBOLT_MINIONS.length);
    expect(thunderbolt(false).map((row) => row.minionId as string)).toEqual([JOLT]);
    expect(thunderboltsSetup()).toHaveLength(1);
  });

  it("adds an Elite minion's whole set to scenario 5, and only the sets recorded", () => {
    const [first, second] = thunderbolt(true);
    const { state, built } = solo("five", (log) =>
      setField(log, SURVIVING_THUNDERBOLTS_FIELD, { kind: "cardList", cardIds: [first!.minionId] }),
    );
    const sets = deckSets(built);
    expect(sets.has(first!.encounterSetId as string)).toBe(true);
    expect(sets.has(second!.encounterSetId as string)).toBe(false);
    expect(all(state, first!.minionId as string)).toHaveLength(1);
    expect(all(state, second!.minionId as string)).toHaveLength(0);
    const baseline = solo("five").built;
    expect(piles(built).deck.length).toBeGreaterThan(piles(baseline).deck.length);
  });

  it("adds Jolt as a card and not her set (Thunderbolts), the rest of her set staying out", () => {
    const { state, built } = solo("five", (log) =>
      setField(log, SURVIVING_THUNDERBOLTS_FIELD, { kind: "cardList", cardIds: [cardId(JOLT)] }),
    );
    const deck = piles(state).deck.map((id) => codeOf(state, id));
    expect(deck.filter((code) => code === JOLT)).toHaveLength(1);
    expect(state.encounterSetAside.map((id) => codeOf(state, id))).not.toContain(JOLT);
    // Her set is not added: the only Thunderbolts-set card in the deck is Jolt herself.
    const ofHerSet = piles(built).deck.filter((id) =>
      dataOfId(codeOf(built, id))
        ?.encounterSetIds?.map(String)
        .includes(setOf(JOLT) as string),
    );
    expect(ofHerSet.map((id) => codeOf(built, id))).toEqual([JOLT]);
  });

  it("brings Jolt and an Elite minion together, and no Thunderbolt at all when none survived", () => {
    const [elite] = thunderbolt(true);
    const both = solo("five", (log) =>
      setField(log, SURVIVING_THUNDERBOLTS_FIELD, { kind: "cardList", cardIds: [cardId(JOLT), elite!.minionId] }),
    );
    expect(all(both.state, JOLT)).toHaveLength(1);
    expect(all(both.state, elite!.minionId as string)).toHaveLength(1);
    const none = solo("five");
    for (const row of AOS_THUNDERBOLT_MINIONS) expect(all(none.state, row.minionId as string)).toHaveLength(0);
  });
});

describe("expert mode and Adaptoids in scenario 5", () => {
  it("restores Alert Level and the Holding Cell the same in an expert campaign (the text has no expert variant)", () => {
    const alert = solo("two", (log) =>
      setField({ ...log, modes: EXPERT }, MINIONS_AND_SIDE_SCHEMES_FIELD, { kind: "number", value: 3 }),
    );
    // Expert mode adds its own threat to Alert Level at setup (the scenario's, not the campaign's): the same on top of 0.
    const bare = solo("two", (log) => ({ ...log, modes: EXPERT }));
    expect(threatOf(alert.state, "50090a") - threatOf(bare.state, "50090a")).toBe(3);
    const cell = solo("three", (log) =>
      setField({ ...log, modes: EXPERT }, RESCUED_CAPTIVES_FIELD, { kind: "number", value: 3 }),
    );
    expect(lockCounters(cell.state)).toBe(4);
  });

  it("lets an Adaptoid with no environment in play be revealed in Baron Zemo's scenario without error", () => {
    const { state } = solo("five");
    const withAdaptoid = stackEncounterDeck(state, "50113");
    const next = settle(withAdaptoid, firstLegal, (s) => s.step.phase === "player", WAVE9_DEPS);
    expect(next.outcome).toBeFalsy();
    expect(all(next, "50113")).toHaveLength(ADAPTOID_COPIES);
  });
});

// ---------------------------------------------------------------------------
// The whole carry: four records restored in order
// ---------------------------------------------------------------------------

describe("a campaign carries all four records through to scenario 5", () => {
  it("restores each at its own scenario from the log the scenario before wrote", () => {
    // Scenarios 1 and 2 chain through one definition: the record of 1 is the Setup of 2.
    const early = definitionFor("one", "two", "three");
    const logOne = newLog(early);
    const one = opened(early, logOne);
    const picks = piles(one.state)
      .deck.filter((id) => ["minion", "side_scheme"].includes(typeOf(one.state, id)))
      .slice(0, 2);
    const afterOne = finishWon(early, one.composed, putOnTable(one.state, picks));
    const recordedOne = numberOf(afterOne, MINIONS_AND_SIDE_SCHEMES_FIELD);
    expect(recordedOne).toBeGreaterThanOrEqual(2);

    const two = opened(early, afterOne);
    expect(threatOf(two.state, "50090a")).toBe(recordedOne);
    const captives = all(two.built, "50091").slice(0, 4);
    const afterTwo = finishWon(
      early,
      two.composed,
      putOnTable(patchInstance(two.state, two.state.mainScheme.instanceId, {}), captives),
    );
    expect(numberOf(afterTwo, RESCUED_CAPTIVES_FIELD)).toBe(4);

    const three = opened(early, afterTwo);
    expect(lockCounters(three.state)).toBe(2);
    // The earlier records are still in the log for the scenarios that read them later.
    expect(numberOf(afterTwo, MINIONS_AND_SIDE_SCHEMES_FIELD)).toBe(recordedOne);
  });
});
