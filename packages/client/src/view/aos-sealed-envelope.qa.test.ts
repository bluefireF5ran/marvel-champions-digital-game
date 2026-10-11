/**
 * Agents of S.H.I.E.L.D. (MC50): nothing a player can see names the sealed A.I.M. envelope
 * (docs/phase7-wave9.md section 8.4 item 81, section 3.75 "the visibility rule", section 8.5 item 5; design Q4,
 * 2026-09-25: "the value is stored, kept out of every view, and shown as a sealed envelope with a card count").
 *
 * The rule under test (MC50 p. 5: "put one card from each set into the A.I.M. envelope without looking at them";
 * p. 19: the envelope is only opened by the accusation): no card id, name or ability id of the three sealed cards
 * appears in a view model, a log line, an Inspect model, a choice sheet, the state the client holds or a legal-action
 * payload, until the accusation of scenario 5 resolves. Evidence the players GAINED is public and must still show.
 *
 * Method. A real campaign is played through the real `CampaignService` (the way `campaign/dev-fixtures.ts`
 * `seedAosRun` does, with a seed of our own so different envelopes are drawn), every view model the client builds
 * from the stored record is serialized and searched (`mentions`), and the same models are built again from a record
 * whose sealed envelope was swapped for three other cards: a model that reads the envelope differs between the two
 * (`sameWithAnotherEnvelope`, a non-interference check that also covers the models that legitimately print the whole
 * nine-card grid, where an id search proves nothing). In game the five scenarios are started through the real
 * `SessionStore` and `LocalEngineHost` (so through `EngineSessionCore`'s snapshot path) and played command by command.
 *
 * The state the client holds is sealed in one place (`sealForTable`, `view/hidden-reverse.ts`: the engine's
 * `sealHiddenInformation`), as it leaves the engine session and again as the store takes it in: no `hiddenPiles` key,
 * the piles' sizes, and the campaign log's sealed values emptied. The last section checks that the sealed state still
 * gives the engine's answers (legal actions, previews) and that a resumed or rewound game, which lives in the engine
 * session and its storage, still resolves the accusation from the real envelope.
 */
import { describe, expect, it, vi } from "vitest";
import { AOS_CAMPAIGN_DEFINITION } from "@mc/cards";
import { AOS_BOARD_MEMBER_LOG, AOS_CARDS, AOS_EVIDENCE_COMBINATIONS, type AnyCard } from "@mc/content";
import {
  evidenceRowId,
  legalActions,
  preview,
  sealHiddenInformation,
  type CampaignChoiceAnswer,
  type CampaignPendingChoice,
  type GameEvent,
  type GameState,
} from "@mc/engine";
import { CampaignService, type CampaignStepResult } from "../campaign/campaign-service.js";
import { storyFor } from "../campaign/story.js";
import { CARDS_BY_ID, POOL_CARDS, POOL_DEPS, POOL_VERSION } from "../content/pool.js";
import { MemoryCampaignStorage, summaryOf, type CampaignRecord } from "../engine/campaign-storage.js";
import { MemoryGameStorage } from "../engine/game-storage.js";
import { LocalEngineHost } from "../engine/local-host.js";
import { EngineSessionCore } from "../engine/session-core.js";
import { SessionStore } from "../store/session-store.js";
import { boardModel, characterPanel } from "./board-model.js";
import { briefingViewOf } from "./campaign-briefing-model.js";
import { campaignChoicePrompt, campaignStepRows } from "./campaign-step-model.js";
import { coverModelOf } from "./campaign-cover-model.js";
import {
  campaignDossierHero,
  campaignDossierIssues,
  campaignDossierLog,
  campaignDossierOverview,
} from "./campaign-dossier-model.js";
import { aftermathLogTags } from "./campaign-aftermath-model.js";
import { campaignIssueModel } from "./campaign-issue-model.js";
import { finaleViewOf } from "./campaign-finale-model.js";
import { campaignLogSheet } from "./campaign-log-model.js";
import { hiddenEvidenceEnvelope } from "./campaign-hidden-evidence-model.js";
import { campaignRunModel } from "./campaign-run-model.js";
import { campaignSagaRows } from "./campaign-saga-model.js";
import { rewindViewOf } from "./campaign-rewind-model.js";
import { shieldBriefingOf } from "./campaign-shield-model.js";
import { preconDecks } from "./deck-list-model.js";
import { accuseSheetOf, evidenceBoardOf, evidenceGridOf, evidenceInputOf, faceupEvidenceOf } from "./evidence-model.js";
import { appendCardHistory, emptyCardHistoryLog } from "./card-history.js";
import { inspectModel } from "./inspect-model.js";
import { appendEvents, emptyLog } from "./log-lines.js";

vi.setConfig({ testTimeout: 90_000 });

const DEF = AOS_CAMPAIGN_DEFINITION;
const NODES = DEF.graph.kind === "linear" ? DEF.graph.nodes.map((node) => node.id) : [];
const FRONTS = AOS_BOARD_MEMBER_LOG.boardMemberIds.map(String);
const EVIDENCE_CARDS = AOS_CARDS.filter((card) => card.type === "evidence") as readonly (AnyCard & {
  readonly evidence: string;
})[];
const nameOf = (id: string): string => CARDS_BY_ID.get(id)?.name ?? id;

// ---------------------------------------------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------------------------------------------

/** What would name one sealed card: its id (an ability id is "<card id>.<name>", so the id finds it too) and its name. */
const needlesOf = (
  envelope: readonly string[],
): { readonly ids: readonly string[]; readonly names: readonly string[] } => ({
  ids: envelope,
  names: envelope.map(nameOf),
});

const gridless = (key: string, value: unknown): unknown =>
  key === "grid" &&
  Array.isArray(value) &&
  (value[0] as { boardMember?: unknown } | undefined)?.boardMember !== undefined
    ? "[printed grid]"
    : value;

/**
 * Which of the sealed cards the serialized value names: by id (as a whole number, not inside another), or by name as a
 * whole JSON string value (a name is also ordinary words: "Authority" is an evidence card and a word in other text).
 * The `mc50.sN.setup.evidence.<id>` instruction ids are removed first: a Setup step exists for each of the nine
 * evidence cards, earned or not, and is skipped for every unearned one, so those ids say nothing of which cards are
 * sealed (the envelope and the S.H.I.E.L.D. pile read the same there).
 */
function mentions(value: unknown, envelope: readonly string[]): string[] {
  // The accuse prompt prints the whole grid (27 rows of three evidence cards and a Board Member) and one option per open
  // row: the printed grid is the same for every envelope. `gridless` drops it so what is left is what could differ.
  const text = (JSON.stringify(value, gridless) ?? "")
    .replace(/mc50\.s\d\.setup\.evidence\.\d+/g, "")
    .replace(/\d{5}\+\d{5}\+\d{5}/g, "")
    .replace(/"label":"[^"]*, [^"]*, [^"]*: Chief [A-Za-z ]+"/g, '"label":"[printed row]"')
    .replace(/On Whose Authority/g, "");
  const { ids, names } = needlesOf(envelope);
  const around = (hit: RegExp): string => {
    const at = text.search(hit);
    return text.slice(Math.max(0, at - 70), at + 50);
  };
  return [
    ...ids
      .filter((id) => new RegExp(`(?<![0-9a-zA-Z])${id}(?![0-9])`).test(text))
      .map((id) => `id ${id} in ...${around(new RegExp(`(?<![0-9a-zA-Z])${id}(?![0-9])`))}...`),
    ...names
      .filter((name) => new RegExp(`(?<![A-Za-z])${name}(?![A-Za-z])`).test(text))
      .map((name) => `name ${name} in ...${around(new RegExp(`(?<![A-Za-z])${name}(?![A-Za-z])`))}...`),
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// A real campaign
// ---------------------------------------------------------------------------------------------------------------

const newService = () =>
  new CampaignService({
    storage: new MemoryCampaignStorage(),
    campaignDeps: { pool: Object.fromEntries(POOL_CARDS.map((card) => [card.id as string, card])) },
    engineDeps: POOL_DEPS,
  });

const seatOf = (hero: string) => {
  const deck = preconDecks(POOL_VERSION).find((candidate) => (candidate.id as string).includes(hero));
  if (!deck) throw new Error(`no precon for ${hero}`);
  return { identityCardId: deck.identityCardId, deck };
};

function answerFor(choice: CampaignPendingChoice): CampaignChoiceAnswer {
  const picked = choice.optional ? [] : choice.options.slice(0, choice.count);
  return { instructionId: choice.instructionId, slot: choice.slot, seatNumber: choice.seatNumber, picked };
}

/** The secret counters each Board Member holds as scenarios 1 to 4 end (the same table `seedAosRun` uses). */
const SECRETS: readonly (readonly [number, number, number])[] = [
  [0, 3, 2],
  [1, 2, 0],
  [0, 2, 3],
  [2, 1, 3],
];

interface Stage {
  readonly label: string;
  readonly record: CampaignRecord;
  /** The choices the campaign asked on the way to this record. */
  readonly choices: readonly CampaignPendingChoice[];
  /** Index of the scenario this record is composed for, or null. */
  readonly composedFor: number | null;
}

interface Run {
  readonly seed: number;
  readonly service: CampaignService;
  readonly stages: readonly Stage[];
}

/**
 * The sealed cards of `stage` that were never public before it. A scenario 5 defeat returns the evidence the players
 * held to the pool and deals a new envelope (MC50 p. 19, section 3.76), so a card the players earned in an earlier
 * scenario may legitimately be sealed again: the history then names it, and that is the earlier gain, not a leak.
 */
function sealedSince(run: { readonly stages: readonly Stage[] }, stage: Stage): readonly string[] {
  const before = run.stages.slice(0, run.stages.indexOf(stage));
  const publicBefore = new Set(before.flatMap((earlier) => gainedOf(earlier.record)));
  return envelopeOf(stage.record).filter((id) => !publicBefore.has(id));
}

const envelopeOf = (record: CampaignRecord): readonly string[] =>
  ((record.hidden["aimEnvelope"] as { readonly cardIds?: readonly string[] } | undefined)?.cardIds ?? []).map(String);
const gainedOf = (record: CampaignRecord): readonly string[] =>
  ((record.shared["evidence"] as { readonly cardIds?: readonly string[] } | undefined)?.cardIds ?? []).map(String);

async function settle(
  step: (answers: readonly CampaignChoiceAnswer[]) => Promise<CampaignStepResult>,
  asked: CampaignPendingChoice[],
): Promise<CampaignRecord> {
  const answers: CampaignChoiceAnswer[] = [];
  for (let guard = 0; guard < 48; guard++) {
    const result = await step(answers);
    if (result.kind === "done") return result.record;
    asked.push(result.choice);
    answers.push(answerFor(result.choice));
  }
  throw new Error("more than 48 campaign questions in one step");
}

/** Scenarios 1 to 4 won (a substituted verdict with the Board Members' counters set, as `seedAosRun` does), 5 lost once. */
async function playCampaign(seed: number, expert = false): Promise<Run> {
  const service = newService();
  const stages: Stage[] = [];
  let record = await service.start({
    campaignId: "aos",
    seats: [seatOf("maria-hill"), seatOf("nick-fury")],
    poolVersion: POOL_VERSION,
    seed,
    ...(expert ? { expertCampaign: true } : {}),
  });
  stages.push({ label: "fresh", record, choices: [], composedFor: null });
  for (let index = 0; index < 5; index++) {
    const asked: CampaignPendingChoice[] = [];
    const composed = await settle((answers) => service.compose(record, answers), asked);
    stages.push({ label: `composed ${index + 1}`, record: composed, choices: asked, composedFor: index });
    const core = new EngineSessionCore({ storage: new MemoryGameStorage() });
    const started = await core.start(service.launchConfig(composed));
    const foldAsked: CampaignPendingChoice[] = [];
    if (index < 4) {
      const state: GameState = { ...started.snapshot.state, cardPool: started.cardPool };
      let won = state;
      for (const id of state.villainArea) {
        const instance = state.instances[id];
        const slot = instance ? FRONTS.indexOf(instance.cardId as string) : -1;
        if (!instance || slot < 0) continue;
        won = {
          ...won,
          instances: {
            ...won.instances,
            [id]: { ...instance, counters: { ...instance.counters, secret: SECRETS[index]![slot]! } },
          },
        };
      }
      won = { ...won, outcome: { result: "win", reason: "villainDefeated" } };
      record = await settle((answers) => service.foldState(composed, won, [], answers), foldAsked);
      stages.push({ label: `after ${index + 1} won`, record, choices: foldAsked, composedFor: null });
    } else {
      const conceded = core.dispatch({ type: "concede", playerId: started.snapshot.state.firstPlayerId });
      if (!conceded.ok) throw new Error(conceded.error.message);
      const saved = core.save();
      record = await settle((answers) => service.fold(composed, saved, answers), foldAsked);
      stages.push({ label: "after 5 lost", record, choices: foldAsked, composedFor: null });
      const asked2: CampaignPendingChoice[] = [];
      const again = await settle((answers) => service.compose(record, answers), asked2);
      stages.push({ label: "composed 5 again", record: again, choices: asked2, composedFor: 4 });
    }
  }
  return { seed, service, stages };
}

const SEEDS = [5050, 7, 20260928];
const runs = new Map<number, Run>();
async function runFor(seed: number): Promise<Run> {
  let run = runs.get(seed);
  if (!run) {
    run = await playCampaign(seed);
    runs.set(seed, run);
  }
  return run;
}

/** Another envelope: for each kind, a different card of that kind (it may be one the players hold: only the log field is swapped). */
function anotherEnvelope(record: CampaignRecord): readonly string[] {
  const real = new Set(envelopeOf(record));
  return ["means", "motive", "opportunity"].map((kind) => {
    const pick = EVIDENCE_CARDS.find((card) => card.evidence === kind && !real.has(card.id as string));
    if (!pick) throw new Error(`no spare ${kind} card`);
    return pick.id as string;
  });
}
const withEnvelope = (record: CampaignRecord, cardIds: readonly string[]): CampaignRecord => ({
  ...record,
  hidden: { ...record.hidden, aimEnvelope: { kind: "cardList", cardIds: cardIds as never, sealed: true } as never },
});

// ---------------------------------------------------------------------------------------------------------------
// Every campaign view model the client builds from a record
// ---------------------------------------------------------------------------------------------------------------

const cardName = (id: unknown): string => nameOf(String(id));
const cardsById = CARDS_BY_ID as ReadonlyMap<string, AnyCard>;
const heroName = (id: string): string => nameOf(id);
const typeOf = (id: string): { readonly type?: string } | undefined => CARDS_BY_ID.get(id) as never;

/** Each model keyed by name. `grid` marks the ones that print the whole nine-card grid, which an id search cannot judge. */
function campaignModels(run: Run, stage: Stage): Record<string, { readonly value: unknown; readonly grid: boolean }> {
  const { record } = stage;
  const out: Record<string, { readonly value: unknown; readonly grid: boolean }> = {};
  const add = (name: string, value: unknown, grid = false) => {
    out[name] = { value, grid };
  };
  const named = { ...record, name: record.name, box: record.box };
  const story = storyFor("aos");
  const issueNumberOf = (nodeId: string) => NODES.indexOf(nodeId) + 1;
  add("saga rows", campaignSagaRows([summaryOf(record)]));
  add("list summary", summaryOf(record));
  add("run model", campaignRunModel(named, DEF, story, cardName));
  add("dossier overview", campaignDossierOverview(named, DEF, heroName, cardName), true);
  add("dossier log", campaignDossierLog(record, DEF, cardName, heroName));
  add("dossier issues", campaignDossierIssues(named, DEF, story, cardName));
  for (const seat of record.seats)
    add(
      `dossier hero ${seat.seatNumber}`,
      campaignDossierHero(named, DEF, seat.seatNumber, (id) => CARDS_BY_ID.get(id)),
    );
  for (const nodeId of NODES) add(`issue model ${nodeId}`, campaignIssueModel(record, DEF, story, nodeId, cardName));
  add("log sheet", campaignLogSheet(DEF, record, cardName));
  add("hidden envelope", hiddenEvidenceEnvelope(record, DEF, cardName));
  add("case file", shieldBriefingOf(record, DEF, cardName), true);
  add(
    "cover",
    coverModelOf({
      campaignId: "aos",
      boxCode: "MC50",
      name: record.name,
      record,
      definition: DEF,
      expertUnlocked: true,
    }),
  );
  add("finale", finaleViewOf(DEF, record));
  if (record.attempt) {
    const number = issueNumberOf(record.attempt.nodeId);
    add("briefing", briefingViewOf(record, cardName, number, DEF, NODES, typeOf as never), true);
    add("attempt step rows", campaignStepRows(record.attempt.steps, cardName));
  }
  for (const [at, entry] of record.history.entries()) {
    add(`history step rows ${entry.nodeId}#${at}`, campaignStepRows(entry.steps, cardName));
    const tags = aftermathLogTags(record, entry.nodeId, DEF.logFields, cardsById);
    add(`aftermath tags ${entry.nodeId}`, tags);
  }
  if (stage.label === "after 5 lost") add("rewind", rewindViewOf(record, "baron-zemo", issueNumberOf, cardsById, DEF));
  stage.choices.forEach((choice, i) =>
    add(`choice sheet ${i} (${choice.slot})`, { choice, prompt: campaignChoicePrompt(choice) }),
  );
  return out;
}

describe("the campaign view models never name the sealed A.I.M. envelope", () => {
  it("control: the stored record does hold the envelope, and the search finds it when a view is built to leak it", async () => {
    const run = await runFor(SEEDS[0]!);
    const composed = run.stages.find((stage) => stage.label === "composed 1")!.record;
    const envelope = envelopeOf(composed);
    expect(envelope).toHaveLength(3);
    expect(mentions(composed, envelope).length).toBeGreaterThanOrEqual(3);
    // A box whose envelope field were not hidden would print it: the Dossier's World lists every shared, unhidden field.
    const open = {
      ...DEF,
      logFields: DEF.logFields.map((field) =>
        field.id === "aimEnvelope" ? (({ hidden: _hidden, ...rest }) => rest)(field) : field,
      ),
    };
    const leaky = { ...composed, shared: { ...composed.shared, aimEnvelope: composed.hidden["aimEnvelope"]! } };
    const sheet = campaignLogSheet(open, leaky, cardName);
    expect(mentions(sheet, envelope).length).toBeGreaterThan(0);
    // And the real one, with the field hidden, does not.
    expect(mentions(campaignLogSheet(DEF, composed, cardName), envelope)).toEqual([]);
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: no model of any stage of the run holds an envelope card's id or name`, async () => {
      const run = await runFor(seed);
      let checked = 0;
      const dealt = new Set<string>();
      for (const stage of run.stages) {
        const envelope = sealedSince(run, stage);
        if (envelopeOf(stage.record).length === 0) continue;
        dealt.add(envelopeOf(stage.record).join());
        for (const [name, { value, grid }] of Object.entries(campaignModels(run, stage))) {
          checked++;
          if (grid) continue; // judged by the non-interference test below
          expect(mentions(value, envelope), `${stage.label}: ${name}`).toEqual([]);
        }
      }
      expect(checked).toBeGreaterThan(60);
      // Scenario 5 lost once: a second envelope was dealt, and it is checked in its own stages.
      expect(dealt.size).toBe(2);
    });

    it(`seed ${seed}: every model is identical whatever the envelope is (non-interference), grid models included`, async () => {
      const run = await runFor(seed);
      for (const stage of run.stages) {
        const envelope = envelopeOf(stage.record);
        if (envelope.length === 0) continue;
        const swapped = { ...stage, record: withEnvelope(stage.record, anotherEnvelope(stage.record)) };
        const a = campaignModels(run, stage);
        const b = campaignModels(run, swapped);
        expect(Object.keys(b)).toEqual(Object.keys(a));
        for (const name of Object.keys(a)) expect(b[name]!.value, `${stage.label}: ${name}`).toEqual(a[name]!.value);
      }
    });
  }

  it("different seeds drew different envelopes (the test is not blind to which cards are sealed)", async () => {
    const envelopes = new Set<string>();
    for (const seed of SEEDS) {
      const run = await runFor(seed);
      envelopes.add(envelopeOf(run.stages.find((stage) => stage.label === "composed 1")!.record).join());
    }
    expect(envelopes.size).toBeGreaterThan(1);
  });

  it("the Case file and the Briefing show a sealed envelope with a card count of three, and no revealed cards", async () => {
    const run = await runFor(SEEDS[0]!);
    const stage = run.stages.find((candidate) => candidate.label === "composed 3")!;
    const briefing = briefingViewOf(stage.record, cardName, 3, DEF, NODES);
    expect(briefing?.shield?.sealedCount).toBe(3);
    // The generic envelope chip (`hiddenEvidenceEnvelope`) is not what MC50 uses: the case file's sealedCount is.
    expect(briefing?.hiddenEvidence).toBeNull();
  });

  it("the grid models never mark a sealed card faceup, only the evidence the players gained", async () => {
    const run = await runFor(SEEDS[0]!);
    const stage = run.stages.find((candidate) => candidate.label === "composed 4")!;
    const gained = gainedOf(stage.record);
    expect(gained.length).toBeGreaterThan(0);
    const grid = evidenceGridOf(AOS_EVIDENCE_COMBINATIONS, gained as never, (id) => CARDS_BY_ID.get(id as string));
    const faceup = grid.blocks
      .flatMap((block) => [block.means, ...block.motives, ...block.opportunities])
      .filter((card) => card.faceup);
    expect([...new Set(faceup.map((card) => card.cardId as string))].sort()).toEqual([...gained].sort());
    for (const id of envelopeOf(stage.record)) expect(faceup.map((card) => card.cardId as string)).not.toContain(id);
  });

  it("positive control: evidence gained is visible in the Case file, the Dossier and the log sheet", async () => {
    for (const seed of SEEDS) {
      const run = await runFor(seed);
      const stage = run.stages.find((candidate) => candidate.label === "after 4 won")!;
      const gained = gainedOf(stage.record);
      expect(gained.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      const models = campaignModels(run, stage);
      const caseFile = models["case file"]!.value as { evidence: readonly { cardId: string }[]; rowsOpen: number };
      expect(caseFile.evidence.map((card) => card.cardId as string)).toEqual(gained);
      expect(caseFile.rowsOpen).toBeLessThan(27);
      // The Dossier's World row counts the evidence gained; the log sheet names each card.
      const world = (models["dossier overview"]!.value as { world: readonly { id: string; bigValue: string }[] }).world;
      expect(world.find((row) => row.id === "evidence")?.bigValue, `seed ${seed}`).toBe(String(gained.length));
      for (const id of gained) expect(JSON.stringify(models["log sheet"]!.value), `sheet ${id}`).toContain(nameOf(id));
    }
  });

  it("the step traces and history the record keeps hold no sealed draw's cards: the sealed records have empty picked lists", async () => {
    for (const seed of SEEDS) {
      const run = await runFor(seed);
      const last = run.stages[run.stages.length - 1]!;
      const envelope = sealedSince(run, last);
      const traces = [...last.record.history.flatMap((entry) => entry.steps), ...(last.record.attempt?.steps ?? [])];
      expect(mentions(traces, envelope), `seed ${seed} current envelope`).toEqual([]);
      const sealed = traces
        .flatMap((step) => step.choices ?? [])
        .filter((c: { sealed?: boolean }) => c.sealed === true);
      expect(sealed.length, `seed ${seed}: sealed draws traced`).toBeGreaterThanOrEqual(2);
      for (const record of sealed) expect((record as { picked: readonly unknown[] }).picked).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// In game
// ---------------------------------------------------------------------------------------------------------------

const GAME_SEED = SEEDS[0]!;
/** Which composed scenarios hand the client a game whose campaign log has a `hidden.aimEnvelope` field at all (5 only). */
const ENVELOPE_FIELD_PRESENT: Record<string, boolean> = {
  "composed 1": false,
  "composed 2": false,
  "composed 3": false,
  "composed 4": false,
  "composed 5": true,
  "composed 5 again": true,
};

interface Observed {
  readonly stage: string;
  readonly step: number;
  readonly game: GameState;
  readonly events: readonly GameEvent[];
  readonly legal: unknown;
  readonly record: unknown;
  readonly trail: unknown;
}

/**
 * Plays a composed scenario through the store (and so through the host and the session core's snapshot) and observes the
 * state the client holds after each command. `accuse` picks the mole's row of the grid when asked; every other choice
 * takes its minimum.
 */
async function playGame(
  run: Run,
  stage: Stage,
  options: {
    readonly maxSteps: number;
    readonly accuseRow?: string;
    readonly untilAccused?: boolean;
    /** Stop with the accuse prompt open, unanswered. */
    readonly untilAccusePrompt?: boolean;
    /** Called with the store before each command is sent. */
    readonly beforeEach?: (store: SessionStore) => void;
    readonly host?: LocalEngineHost;
  },
): Promise<{ readonly store: SessionStore; readonly observed: Observed[]; readonly allEvents: GameEvent[] }> {
  const store = new SessionStore(options.host ?? new LocalEngineHost());
  const observed: Observed[] = [];
  const allEvents: GameEvent[] = [];
  const see = (step: number) => {
    const s = store.state;
    if (!s.game) return;
    allEvents.push(...s.lastEvents);
    observed.push({
      stage: stage.label,
      step,
      game: s.game,
      events: s.lastEvents,
      legal: s.legal,
      record: s.record,
      trail: s.commandTrail,
    });
  };
  await store.start(run.service.launchConfig(stage.record));
  see(0);
  for (let step = 1; step <= options.maxSteps; step++) {
    const s = store.state;
    const game = s.game;
    if (!game || game.outcome) break;
    if (options.untilAccused && game.accusation?.mole) break;
    const choice = game.pendingChoice;
    if (options.untilAccusePrompt && choice?.prompt.kind === "accuse") break;
    options.beforeEach?.(store);
    if (choice) {
      let picked: readonly string[];
      if (choice.prompt.kind === "accuse") {
        const row = choice.options.find((o) => (o.optionId as string) === options.accuseRow);
        picked = row ? [row.optionId] : choice.options.slice(0, 1).map((o) => o.optionId);
      } else if (choice.prompt.kind === "chooseOption") {
        const advance = choice.options.find((o) => o.label.startsWith("Advance to stage 2A"));
        const no = choice.options.find((o) => o.label.startsWith("Do not"));
        picked = advance
          ? [advance.optionId]
          : no
            ? [no.optionId]
            : choice.options.slice(0, choice.minSelections).map((o) => o.optionId);
      } else if (choice.prompt.kind === "chooseTriggers") {
        const hit = choice.options.find((o) => (o.optionId as string).includes("zemos-manipulations"));
        picked = hit ? [hit.optionId] : choice.options.slice(0, choice.minSelections).map((o) => o.optionId);
      } else if (choice.prompt.kind === "declareDefender") picked = ["decline"];
      else picked = choice.options.slice(0, choice.minSelections).map((o) => o.optionId);
      if (!(await store.resolveChoice(picked))) break;
    } else {
      const actions = s.legal?.actions;
      const end = actions?.kind === "turn" ? actions.legal.find((entry) => entry.action.kind === "endTurn") : undefined;
      if (!end || !(await store.dispatch(end.example))) break;
    }
    see(step);
  }
  return { store, observed, allEvents };
}

/** Everything a view derives for the viewer from the state the client holds. */
function viewsOf(game: GameState, events: readonly GameEvent[], legal: unknown): Record<string, unknown> {
  const me = game.players[0]!;
  const actions = (legal as { actions?: never } | null)?.actions ?? null;
  const out: Record<string, unknown> = {
    board: boardModel(
      game,
      me.playerId,
      POOL_DEPS,
      (actions as { kind?: string } | null)?.kind === "turn" ? (actions as never) : null,
    ),
    panel: characterPanel(game, me.identity.instanceId, POOL_DEPS),
    log: appendEvents(emptyLog(), events, game, me.playerId, POOL_DEPS),
  };
  const history = appendCardHistory(emptyCardHistoryLog(), events);
  const inspected = Object.keys(game.instances).filter((_, i) => i % 7 === 0);
  out["inspect"] = inspected.map((id) =>
    inspectModel(game, id as never, (actions as never) ?? null, me.playerId, POOL_DEPS, { history }),
  );
  return out;
}

/** The types of the events that name a sealed card. */
const eventsNaming = (events: readonly GameEvent[], envelope: readonly string[]): string[] =>
  events.flatMap((event) => mentions(event, envelope).map((hit) => `${event.type}: ${hit}`));

/** The state without the printed catalog (`cardPool`, public) and the RNG: what the table could read. */
const tableOf = (game: GameState): unknown => {
  const { cardPool: _pool, rng: _rng, ...table } = game;
  return table;
};

const lookup = (id: unknown) => CARDS_BY_ID.get(String(id));

describe("in game: the state the client holds and the views built from it", () => {
  it("scenarios 1 to 4: no board, Inspect, log, panel, choice or legal-action payload names the envelope", async () => {
    const run = await runFor(GAME_SEED);
    for (const stage of run.stages.filter((s) => s.composedFor !== null && s.composedFor < 4)) {
      const envelope = envelopeOf(stage.record);
      const { observed } = await playGame(run, stage, { maxSteps: 30 });
      expect(observed.length).toBeGreaterThan(5);
      for (const seen of observed) {
        if (seen.step % 5 !== 0) continue;
        for (const [name, value] of Object.entries(viewsOf(seen.game, seen.events, seen.legal))) {
          expect(mentions(value, envelope), `${stage.label} step ${seen.step}: ${name}`).toEqual([]);
        }
        expect(mentions(seen.legal, envelope), `${stage.label} step ${seen.step}: legal`).toEqual([]);
        expect(mentions(seen.events, envelope), `${stage.label} step ${seen.step}: events`).toEqual([]);
        expect(mentions(seen.game.pendingChoice, envelope), `${stage.label} step ${seen.step}: pendingChoice`).toEqual(
          [],
        );
      }
    }
  });

  it("scenario 5, until the accusation: the views, the legal actions, the Evidence view and the accuse sheet name no sealed card", async () => {
    const run = await runFor(GAME_SEED);
    const stage = run.stages.find((s) => s.label === "composed 5")!;
    const envelope = envelopeOf(stage.record);
    const { observed } = await playGame(run, stage, { maxSteps: 80, untilAccused: true });
    expect(observed.some((o) => o.game.pendingChoice?.prompt.kind === "accuse")).toBe(true);
    for (const seen of observed) {
      if (seen.game.accusation?.mole) break;
      const input = evidenceInputOf(seen.game);
      if (input) {
        expect(input.hiddenPileSizes?.["aim"], `step ${seen.step}`).toBe(3);
        const board = evidenceBoardOf(input, AOS_EVIDENCE_COMBINATIONS, lookup);
        expect(board.piles.find((p) => p.pile === "aim")?.faceup, `step ${seen.step}: aim faceup`).toEqual([]);
        expect(board.answer).toBeNull();
        // The grid prints all nine; a sealed card is never marked faceup.
        const faceup = faceupEvidenceOf(input).map(String);
        for (const id of envelope) expect(faceup, `step ${seen.step}`).not.toContain(id);
      }
      const choice = seen.game.pendingChoice;
      if (choice?.prompt.kind === "accuse") {
        const sheet = accuseSheetOf(choice, [], lookup)!;
        expect(sheet.selected).toBeNull();
        // The accuse prompt's own payload: the crossed-out list is the gained evidence only; no option is marked as the answer.
        expect((choice.prompt as { crossedOut: readonly string[] }).crossedOut.map(String).sort()).toEqual(
          [...gainedOf(stage.record)].sort(),
        );
        expect(JSON.stringify(choice.options)).not.toMatch(/mole|answer|correct/i);
      }
      for (const [name, value] of Object.entries(viewsOf(seen.game, seen.events, seen.legal))) {
        if (seen.step % 6 !== 0) break;
        expect(mentions(value, envelope), `step ${seen.step}: ${name}`).toEqual([]);
      }
      expect(eventsNaming(seen.events, envelope), `step ${seen.step}: events`).toEqual([]);
      expect(mentions(seen.legal, envelope), `step ${seen.step}: legal`).toEqual([]);
      expect(mentions(choice, envelope), `step ${seen.step}: pendingChoice`).toEqual([]);
    }
  });

  it("the state the client receives has no hiddenPiles key (store.state.game, scenario 5): it holds the two sizes, 3 and 3", async () => {
    const run = await runFor(GAME_SEED);
    const stage = run.stages.find((s) => s.label === "composed 5")!;
    const { store } = await playGame(run, stage, { maxSteps: 0 });
    expect(store.state.game).not.toHaveProperty("hiddenPiles");
    expect(store.state.game!.hiddenPileSizes).toEqual({ aim: 3, shield: 3 });
    expect(mentions(tableOf(store.state.game!), envelopeOf(stage.record))).toEqual([]);
  });

  it("sealing is idempotent: the engine's own sealHiddenInformation(state) returns the store's state as it is", async () => {
    const run = await runFor(GAME_SEED);
    const stage = run.stages.find((s) => s.label === "composed 5")!;
    const { store } = await playGame(run, stage, { maxSteps: 0 });
    const game = store.state.game!;
    const sealed = sealHiddenInformation(game);
    expect(sealed).toBe(game);
    expect(mentions(tableOf(sealed), envelopeOf(stage.record))).toEqual([]);
    expect(sealed.hiddenPileSizes).toMatchObject({ aim: 3 });
  });

  it("the state the client receives carries the campaign log without its sealed values: in scenario 5 the envelope field says 3 cards and names none", async () => {
    const run = await runFor(GAME_SEED);
    const present: Record<string, boolean> = {};
    for (const stage of run.stages.filter((s) => s.composedFor !== null)) {
      const { store } = await playGame(run, stage, { maxSteps: 0 });
      const hidden = store.state.game!.campaign?.log.hidden;
      present[stage.label] = hidden?.["aimEnvelope"] !== undefined;
      if (hidden?.["aimEnvelope"])
        expect(hidden["aimEnvelope"], stage.label).toEqual({
          kind: "cardList",
          cardIds: [],
          sealed: true,
          sealedSize: 3,
        });
      expect(mentions(store.state.game!.campaign, envelopeOf(stage.record)), stage.label).toEqual([]);
    }
    expect(present).toEqual(ENVELOPE_FIELD_PRESENT);
  });

  it("the store's other copies of the game are clean too: the record and the command trail name no sealed card", async () => {
    const run = await runFor(GAME_SEED);
    const stage = run.stages.find((s) => s.label === "composed 5")!;
    const envelope = envelopeOf(stage.record);
    const { observed, store } = await playGame(run, stage, { maxSteps: 60, untilAccused: true });
    for (const seen of observed) {
      if (seen.game.accusation?.mole) break;
      expect(mentions(seen.record, envelope), `record step ${seen.step}`).toEqual([]);
      expect(mentions(seen.trail, envelope), `trail step ${seen.step}`).toEqual([]);
    }
    expect(store.state.game).toBeTruthy();
  });

  it("after the accusation resolves the reveal is allowed and the Evidence view names the mole", async () => {
    const run = await runFor(GAME_SEED);
    const stage = run.stages.find((s) => s.label === "composed 5")!;
    const envelope = envelopeOf(stage.record);
    const mole = AOS_EVIDENCE_COMBINATIONS.find(
      (row) =>
        envelope.includes(row.means as string) &&
        envelope.includes(row.motive as string) &&
        envelope.includes(row.opportunity as string),
    );
    expect(mole, "the envelope names a row of the grid").toBeTruthy();
    const { store, allEvents } = await playGame(run, stage, {
      maxSteps: 120,
      accuseRow: evidenceRowId(mole!),
      untilAccused: true,
    });
    const game = store.state.game!;
    expect(game.accusation?.mole).toBeTruthy();
    const input = evidenceInputOf(game)!;
    const board = evidenceBoardOf(input, AOS_EVIDENCE_COMBINATIONS, lookup);
    expect(board.solved).toBe(true);
    const moleEvidence = (board.answer?.moleCards ?? [])
      .filter((card) => card.kind !== null)
      .map((card) => card.cardId as string);
    expect(moleEvidence.sort()).toEqual([...envelope].sort());
    expect(allEvents.length).toBeGreaterThan(0);
  });

  it("after a scenario 5 defeat and redeal, the current envelope is not in the second attempt's views either", async () => {
    const run = await runFor(GAME_SEED);
    const first = run.stages.find((s) => s.label === "composed 5")!;
    const again = run.stages.find((s) => s.label === "composed 5 again")!;
    const envelope = sealedSince(run, again);
    expect(envelope.join()).not.toBe(envelopeOf(first.record).join());
    const { observed } = await playGame(run, again, { maxSteps: 30 });
    for (const seen of observed) {
      if (seen.step % 6 !== 0) continue;
      for (const [name, value] of Object.entries(viewsOf(seen.game, seen.events, seen.legal))) {
        expect(mentions(value, envelope), `redeal step ${seen.step}: ${name}`).toEqual([]);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The sealed state still answers: queries and previews on it, and the authority behind it
// ---------------------------------------------------------------------------------------------------------------

/** The row of the grid the envelope's three cards make. */
const moleRowOf = (envelope: readonly string[]) =>
  AOS_EVIDENCE_COMBINATIONS.find(
    (row) =>
      envelope.includes(row.means as string) &&
      envelope.includes(row.motive as string) &&
      envelope.includes(row.opportunity as string),
  )!;

describe("the sealed state the client holds answers the engine's questions as the engine session does", () => {
  it("scenario 5: legal actions asked of the store's state are the ones the engine session computed from the full state, at every step", async () => {
    const run = await runFor(GAME_SEED);
    const stage = run.stages.find((s) => s.label === "composed 5")!;
    let compared = 0;
    await playGame(run, stage, {
      maxSteps: 80,
      untilAccused: true,
      beforeEach: (store) => {
        const { game, legal } = store.state;
        if (!game || !legal) return;
        compared++;
        expect(JSON.stringify(legalActions(game, legal.playerId, POOL_DEPS)), `step ${compared}`).toBe(
          JSON.stringify(legal.actions),
        );
      },
    });
    expect(compared).toBeGreaterThan(10);
  });

  it("scenario 5: a preview of every answer on the way to the accusation never throws and names no sealed card or placeholder; the accusation's stops at the envelope", async () => {
    const run = await runFor(GAME_SEED);
    const stage = run.stages.find((s) => s.label === "composed 5")!;
    const envelope = envelopeOf(stage.record);
    /** Each accuse row's preview as its stop, counters, outcome and event kinds (the events name the row guessed). */
    const accusePreviews = new Set<string>();
    let previews = 0;
    await playGame(run, stage, {
      maxSteps: 120,
      untilAccused: true,
      accuseRow: evidenceRowId(moleRowOf(envelope)),
      beforeEach: (store) => {
        const game = store.state.game!;
        const choice = game.pendingChoice;
        if (!choice) return;
        const picks =
          choice.prompt.kind === "accuse"
            ? choice.options.map((option) => [option.optionId])
            : [choice.options.slice(0, Math.max(1, choice.minSelections)).map((option) => option.optionId)];
        for (const selectedOptionIds of picks) {
          const result = preview(
            game,
            { type: "resolveChoice", playerId: choice.playerId, choiceId: choice.choiceId, selectedOptionIds },
            POOL_DEPS,
          );
          previews++;
          expect(JSON.stringify(result)).not.toContain("sealed-pile-card");
          if (choice.prompt.kind !== "accuse") {
            expect(mentions(result, envelope), `${choice.prompt.kind}`).toEqual([]);
            continue;
          }
          // The guess is made (the players' own row, public), then the envelope would open, and the preview stops.
          expect(result.stop).toEqual({ kind: "hiddenInformation", at: "hiddenPileRevealed" });
          expect(result.events.map((event) => event.type)).toContain("accusationMade");
          expect(result.events.map((event) => event.type)).not.toContain("moleIdentified");
          expect(result.outcome).toBeNull();
          accusePreviews.add(JSON.stringify({ ...result, events: result.events.map((event) => event.type) }));
        }
      },
    });
    expect(previews).toBeGreaterThan(10);
    // The accuse prompt offered every open row, the mole's among them, and each previews the same but for the row it names:
    // the right row cannot be told from a wrong one.
    expect(accusePreviews.size).toBe(1);
  });

  it("a resumed scenario 5 game resolves the accusation from the real envelope: saved with the accuse prompt open, resumed in a new session, the right row is right", async () => {
    const run = await runFor(GAME_SEED);
    const stage = run.stages.find((s) => s.label === "composed 5")!;
    const envelope = envelopeOf(stage.record);
    const mole = moleRowOf(envelope);
    const storage = new MemoryGameStorage();
    const first = await playGame(run, stage, {
      maxSteps: 120,
      untilAccusePrompt: true,
      host: new LocalEngineHost(storage),
    });
    expect(first.store.state.game!.pendingChoice?.prompt.kind).toBe("accuse");
    // Storage writes trail the commands: let them land, as a page that is closed and reopened would have.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const saved = (await storage.list())[0]!;
    expect(saved.commandCount).toBe(first.store.state.version);

    const resumed = new SessionStore(new LocalEngineHost(storage));
    await resumed.resume(saved.id);
    const game = resumed.state.game!;
    expect(game).not.toHaveProperty("hiddenPiles");
    expect(game.hiddenPileSizes).toMatchObject({ aim: 3 });
    expect(mentions(tableOf(game), envelope)).toEqual([]);
    expect(game.pendingChoice?.prompt.kind).toBe("accuse");
    expect(await resumed.resolveChoice([evidenceRowId(mole)])).toBe(true);
    for (let step = 0; step < 20 && !resumed.state.game!.accusation?.mole; step++) {
      const choice = resumed.state.game!.pendingChoice;
      if (!choice) break;
      await resumed.resolveChoice(choice.options.slice(0, choice.minSelections).map((option) => option.optionId));
    }
    const accusation = resumed.state.game!.accusation!;
    expect(accusation.mole).toEqual(mole);
    expect(accusation.accused).toEqual(mole);
    expect(accusation.wrong).toEqual([]);
    expect([...(resumed.state.game!.revealedPileCards?.["aim"] ?? [])].map(String).sort()).toEqual(
      [...envelope].sort(),
    );
    expect(resumed.state.game!.hiddenPileSizes).toMatchObject({ aim: 0 });
  });

  it("a rewound scenario 5 game does too: a wrong accusation is taken back, and the same envelope answers the second one", async () => {
    const run = await runFor(GAME_SEED);
    const stage = run.stages.find((s) => s.label === "composed 5")!;
    const envelope = envelopeOf(stage.record);
    const mole = moleRowOf(envelope);
    const { store } = await playGame(run, stage, { maxSteps: 120, untilAccusePrompt: true });
    const prompt = store.state.game!.pendingChoice!;
    expect(prompt.prompt.kind).toBe("accuse");
    const at = store.state.version;
    const wrongRow = prompt.options.find((option) => (option.optionId as string) !== evidenceRowId(mole))!;
    expect(await store.resolveChoice([wrongRow.optionId])).toBe(true);
    expect(store.state.game!.accusation?.mole).toEqual(mole);
    expect(store.state.game!.accusation?.wrong?.length).toBeGreaterThan(0);

    expect(await store.rewindTo(at)).toBe(true);
    const back = store.state.game!;
    expect(back.accusation).toBeUndefined();
    expect(back.hiddenPileSizes).toMatchObject({ aim: 3 });
    expect(mentions(tableOf(back), sealedSince(run, stage))).toEqual([]);
    expect(await store.resolveChoice([evidenceRowId(mole)])).toBe(true);
    expect(store.state.game!.accusation?.mole).toEqual(mole);
    expect(store.state.game!.accusation?.wrong).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Saved games (item 4): storage necessarily holds the envelope; no screen prints it
// ---------------------------------------------------------------------------------------------------------------

describe("saved games and the save-data export hold the envelope (storage, not a leak) and no view reads it", () => {
  it("the campaign record keeps the envelope under hidden.aimEnvelope, and a saved scenario 5 game keeps it in its baseline", async () => {
    const run = await runFor(GAME_SEED);
    const stage = run.stages.find((s) => s.label === "composed 5")!;
    const envelope = envelopeOf(stage.record);
    // Where: the CampaignRecord (IndexedDB `mc-campaigns` or the memory storage), `hidden.aimEnvelope`; the stored
    // attempt and each history entry's `logBefore` carry the same log at the time they were taken.
    expect(mentions(stage.record.hidden, envelope).length).toBe(3);
    // The saved game: `GameStorage.create(meta, initialState)` is the full engine state, which is what a resume replays.
    const storage = new MemoryGameStorage();
    const core = new EngineSessionCore({ storage });
    const started = await core.start(run.service.launchConfig(stage.record));
    const stored = await storage.load(started.snapshot.record ? (await storage.list())[0]!.id : "");
    const baseline = stored!.initialState as unknown as GameState;
    expect([...(baseline.hiddenPiles?.["aim"] ?? [])].map(String).sort()).toEqual([...envelope].sort());
    expect(mentions(baseline.campaign?.log.hidden, envelope).length).toBe(3);
  });

  it("the Dossier, Briefing and Run views build from the record but print only counts (the export file is the raw record)", async () => {
    const run = await runFor(GAME_SEED);
    const stage = run.stages.find((s) => s.label === "composed 5")!;
    const envelope = envelopeOf(stage.record);
    // The export is `exportSaveData`: each IndexedDB store's records verbatim (docs/save-data.md), so it holds the envelope.
    expect(mentions(JSON.stringify({ databases: { campaigns: [stage.record] } }), envelope).length).toBe(3);
    // And the views over that same record do not.
    for (const [name, { value, grid }] of Object.entries(campaignModels(run, stage))) {
      if (!grid) expect(mentions(value, envelope), name).toEqual([]);
    }
  });
});
