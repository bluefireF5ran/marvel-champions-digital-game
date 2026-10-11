/**
 * docs/phase7-wave9.md §3.74: a `cardState` log field, written by a `record` instruction's `cardStateOf` query and
 * read inside the next game by `ValueSpec campaignLog { card, counter }` and `Predicate campaignLog { card, face }`.
 *
 * MC50 pp. 9 to 15, Victory: "Record the number of secret counters on each Board Member card in the campaign log."
 * MC50 p. 11, Setup: "Place secret counters on each Board Member environment equal to the number of secret counters
 * recorded for that environment in scenario #1. (This will cause the environment to flip to its attachment side if
 * enough secrets are placed on it.)" MC50 p. 6: "once a board member flips to its attachment side, it remains an
 * attachment for the rest of the campaign." Owner decisions §4.1 Q1 = A (a flipped member keeps its counters) and
 * Q11 = A (the log records the face with the number).
 *
 * Synthetic cards shaped like the Board Members: an environment with the setup keyword whose other face is a card of
 * its own, an attachment for the villain. A standalone definition, so nothing here perturbs another fixture.
 */
import { describe, expect, it } from "vitest";
import { campaignId, cardId, scenarioId, trait, type AnyCard, type CardId, type PlayModes } from "@mc/content";
import type { EngineDeps } from "../abilities.js";
import type { CampaignDefinition, CampaignGameQuery, CampaignLog, CampaignNode, LogValue } from "../campaign.js";
import { CAMPAIGN_LOG_FRONT_FACE } from "../campaign-state.js";
import { EngineInvariantError } from "../errors.js";
import type { GameEvent } from "../events.js";
import type { InstanceId } from "../ids.js";
import { characterStat, locateCard } from "../query.js";
import { evaluate, resolveValue, type EffectContext } from "../select.js";
import { createGame, type GameSetupConfig } from "../setup.js";
import type { EffectSpec, TargetRef } from "../spec.js";
import type { GameState } from "../state.js";
import { depsOf, stubAbility } from "../testing/abilities.js";
import { runCommands } from "../testing/drive.js";
import { stubAttachment, stubEnvironment, stubMinion } from "../testing/fixtures.js";
import { DEFAULT_CARDS, DEFAULT_DECK, HERO, MAIN_SCHEME, VILLAIN, seatIdentities } from "../testing/scenario.js";
import { campaignResultOf } from "./result.js";
import {
  applyCampaignResult,
  createCampaignLog,
  resolveBetweenGames,
  startGameFromLog,
  type CampaignSeatSetup,
} from "./runner.js";

const CAMPAIGN_ID = campaignId("card-state-test");
const MODES: PlayModes = { campaign: { campaignId: CAMPAIGN_ID } };
const SCENARIO = scenarioId("card-state-test-scenario");
const OFFICER_TRAIT = trait("OFFICER");
const self: TargetRef = { kind: "self" };

/** "If there are 4 or more secret counters here, flip this card.", the counters kept (Q1 = A). */
const TURN = stubAbility("officer.turn", {
  trigger: {
    kind: "stateCheck",
    when: { kind: "counterAtLeast", of: self, counterType: "secret", amount: 4 },
  },
  effects: [{ kind: "flipCard", target: self, keepCounters: ["secret"] }],
});
/** "Forced Response: After a secret counter is placed here, …": counts its own resolutions. */
const PLACED = stubAbility("aid.placed", {
  trigger: {
    kind: "response",
    forced: true,
    on: { on: "countersPlaced", selfIs: "target", eventIs: { counterType: "secret" } },
  },
  effects: [{ kind: "addCounters", target: self, counterType: "answered", amount: { kind: "const", value: 1 } }],
});
const deps: EngineDeps = depsOf(TURN, PLACED);

const officer = (name: string): readonly [AnyCard, AnyCard] => {
  const front = stubEnvironment({
    id: `${name}-a`,
    traits: [OFFICER_TRAIT],
    keywords: [{ name: "setup" }],
    abilities: [TURN.ref],
  });
  const back = {
    ...stubAttachment({
      id: `${name}-b`,
      attachesTo: { kind: "villain" },
      statModifiers: { atk: 1 },
      keywords: [{ name: "permanent" }],
      abilities: [PLACED.ref],
    }),
    traits: [OFFICER_TRAIT],
  };
  return [
    { ...front, otherFaceId: back.id as CardId },
    { ...back, otherFaceId: front.id as CardId },
  ];
};
const OFFICERS = ["medic", "watcher", "tactician"].map(officer);
const FRONTS = OFFICERS.map(([front]) => front.id);
const [MEDIC, WATCHER, TACTICIAN] = FRONTS as [CardId, CardId, CardId];
const TACTICIAN_AID = OFFICERS[2]![1].id;
/** A card no `cardState` field of this box lists. */
const STRANGER = stubMinion({ id: "stranger", atk: 1, sch: 1, hp: 3 });

const SEATS: readonly CampaignSeatSetup[] = [1, 2].map((seatNumber) => ({
  seatNumber,
  identityCardId: cardId(`hero-${seatNumber}`),
  deck: { identityCardId: cardId(`hero-${seatNumber}`), aspects: [], cards: [] },
}));
const identities = seatIdentities(HERO, 2);

function playGame(campaign: GameSetupConfig["campaign"]): {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
} {
  const config: GameSetupConfig = {
    seed: 1,
    cards: [...DEFAULT_CARDS, ...identities, ...OFFICERS.flat(), STRANGER],
    villainCardId: VILLAIN.id,
    mainSchemeCardId: MAIN_SCHEME.id,
    // The environments carry the setup keyword, so each starts in play (RRG 1.8 Appendix II step 11).
    encounterDeck: FRONTS,
    setAside: [STRANGER.id],
    players: identities.map((identity) => ({ identityCardId: identity.id, deck: DEFAULT_DECK })),
    ...(campaign ? { campaign } : {}),
  };
  const created = createGame(config, deps);
  if (!created.ok) throw new Error(`setup failed: ${created.error.message}`);
  const driven = runCommands(created.state, deps);
  return { state: driven.state, events: [...created.events, ...driven.events] };
}

const instanceOf = (state: GameState, id: string): InstanceId => {
  const found = Object.values(state.instances).find((instance) => instance.cardId === id);
  if (!found) throw new Error(`no instance of ${id}`);
  return found.instanceId;
};

const patch = (state: GameState, id: InstanceId, over: Partial<GameState["instances"][string]>): GameState => ({
  ...state,
  instances: { ...state.instances, [id]: { ...state.instances[id]!, ...over } },
});

const won = (state: GameState): GameState => ({
  ...state,
  outcome: { result: "win" as const, reason: "villainDefeated" as const },
});

const SECRETS: CampaignGameQuery = {
  kind: "cardStateOf",
  query: { trait: OFFICER_TRAIT },
  counters: ["secret"],
  withFace: true,
};

/** MC50 p. 11's bullet for one member: the recorded counters in one placement, then the recorded face restored. */
const restore = (front: CardId, back: CardId): readonly EffectSpec[] => {
  const card: TargetRef = { kind: "each", query: { printedId: front } };
  return [
    {
      kind: "addCounters",
      target: card,
      counterType: "secret",
      amount: { kind: "campaignLog", field: "secrets", card: front, counter: "secret" },
    },
    {
      kind: "if",
      condition: { kind: "campaignLog", field: "secrets", card: front, face: back },
      then: [{ kind: "flipCard", target: card, keepCounters: ["secret"] }],
    },
  ];
};

const node = (id: string, over: Partial<CampaignNode> = {}): CampaignNode => ({
  id,
  label: id,
  scenario: { kind: "fixed", scenarioId: SCENARIO },
  setup: [],
  victory: [],
  ...over,
});

const record = (id: string, field: string, value: CampaignGameQuery, mode: "set" | "append" = "set") => ({
  id,
  text: "test",
  citation: "test",
  step: { kind: "record" as const, writes: [{ field, mode, value }] },
});

const definition: CampaignDefinition = {
  campaignId: CAMPAIGN_ID,
  version: "1",
  logFields: [
    { id: "secrets", label: "Secrets", scope: "shared", type: { kind: "cardState", cardIds: FRONTS }, citation: "t" },
    { id: "members", label: "Members", scope: "shared", type: { kind: "number" }, citation: "t" },
    { id: "memberList", label: "Member list", scope: "shared", type: { kind: "cardList" }, citation: "t" },
  ],
  loss: { retry: "free", retryBaseline: "nodeStart" },
  graph: {
    kind: "linear",
    nodes: [
      node("first", {
        victory: [
          record("first.secrets", "secrets", SECRETS),
          record("first.count", "members", SECRETS),
          record("first.list", "memberList", SECRETS),
        ],
      }),
      node("second", {
        setup: [
          {
            id: "second.setup.board",
            text: "test",
            citation: "test",
            step: {
              kind: "inGame",
              window: "beforeStartingHands",
              effects: OFFICERS.flatMap(([front, back]) => restore(front.id, back.id)),
            },
          },
        ],
      }),
    ],
  },
};

const newLog = (of: CampaignDefinition = definition): CampaignLog =>
  createCampaignLog(of, { id: "run", seats: SEATS, modes: MODES, poolVersion: "test", seed: 1 });

function composed(of: CampaignDefinition, log: CampaignLog): CampaignLog {
  const result = resolveBetweenGames(of, log, { pool: [] }, MODES);
  if (result.kind !== "done") throw new Error("unexpected pending choice");
  return result.value;
}

/** The first game as it ended: the medic at 2, the watcher at 0, and the tactician turned to its attachment at 5. */
function firstGameEnded(): { readonly log: CampaignLog; readonly state: GameState } {
  const log = composed(definition, newLog());
  let state = playGame(startGameFromLog(definition, log).input).state;
  state = patch(state, instanceOf(state, MEDIC), { counters: { secret: 2, mark: 7 } });
  state = patch(state, instanceOf(state, TACTICIAN), { cardId: TACTICIAN_AID, counters: { secret: 5 } });
  return { log, state: won(state) };
}

function afterFirstGame(): CampaignLog {
  const { log, state } = firstGameEnded();
  const result = campaignResultOf(definition, log, state, [], deps);
  const applied = applyCampaignResult(definition, log, result, { at: 1 }, { pool: [] });
  if (applied.kind !== "done") throw new Error("unexpected pending choice");
  return applied.value;
}

const RECORDED: LogValue = {
  kind: "cardState",
  cards: {
    [MEDIC]: { counters: { secret: 2 } },
    [WATCHER]: { counters: { secret: 0 } },
    [TACTICIAN]: { counters: { secret: 5 }, face: TACTICIAN_AID },
  },
};

describe("CampaignGameQuery.cardStateOf written to a cardState field (§3.74, task 51)", () => {
  it("records each named counter, 0 for a card with none, keyed by the front face, with the face it is on", () => {
    const log = afterFirstGame();
    expect(log.shared.secrets).toEqual(RECORDED);
    // The history traces the write as it was applied, and the log round-trips as plain JSON.
    const step = log.history[0]?.steps.find((entry) => entry.instructionId === "first.secrets");
    expect(step?.writes).toEqual([{ field: "secrets", seatNumber: null, mode: "set", value: RECORDED }]);
    expect(JSON.parse(JSON.stringify(log))).toEqual(log);
  });

  it("records no face when the query does not ask for one", () => {
    const { log, state } = firstGameEnded();
    const bare: CampaignDefinition = {
      ...definition,
      graph: {
        kind: "linear",
        nodes: [
          node("first", {
            victory: [
              record("first.secrets", "secrets", {
                kind: "cardStateOf",
                query: { trait: OFFICER_TRAIT },
                counters: ["secret", "mark"],
              }),
            ],
          }),
        ],
      },
    };
    const result = campaignResultOf(bare, log, state, [], deps);
    expect(result.records[0]?.write.value).toEqual({
      kind: "cardState",
      cards: {
        [MEDIC]: { counters: { secret: 2, mark: 7 } },
        [WATCHER]: { counters: { secret: 0, mark: 0 } },
        [TACTICIAN]: { counters: { secret: 5, mark: 0 } },
      },
    });
  });

  it("written to a number or a card list field, the same query reads as the matching cards", () => {
    const log = afterFirstGame();
    expect(log.shared.members).toEqual({ kind: "number", value: 3 });
    // In the order the cards are in play, each by the card id of the face it shows.
    const listed = log.shared.memberList;
    expect(listed?.kind === "cardList" && [...listed.cardIds].sort()).toEqual([MEDIC, TACTICIAN_AID, WATCHER].sort());
  });

  it("refuses a card the field's cardIds does not list", () => {
    const { log, state } = firstGameEnded();
    const stray: CampaignDefinition = {
      ...definition,
      graph: {
        kind: "linear",
        nodes: [
          node("first", {
            victory: [
              record("first.secrets", "secrets", {
                kind: "cardStateOf",
                query: { categories: ["villain"] },
                counters: ["secret"],
              }),
            ],
          }),
        ],
      },
    };
    expect(() => campaignResultOf(stray, log, state, [], deps)).toThrow(EngineInvariantError);
    expect(() => campaignResultOf(stray, log, state, [], deps)).toThrow(/not one of them/);
  });

  it("refuses two cards in play that would be recorded under one key", () => {
    const { log, state } = firstGameEnded();
    // The watcher turned to the tactician's attachment face: two cards now answer to the tactician's key.
    const doubled = patch(state, instanceOf(state, WATCHER), { cardId: TACTICIAN_AID });
    expect(() => campaignResultOf(definition, log, doubled, [], deps)).toThrow(/found two such cards/);
  });

  it("refuses any other query, and any mode but set, into a cardState field", () => {
    const { log, state } = firstGameEnded();
    const withVictory = (step: ReturnType<typeof record>): CampaignDefinition => ({
      ...definition,
      graph: { kind: "linear", nodes: [node("first", { victory: [step] })] },
    });
    const counted = withVictory(
      record("first.secrets", "secrets", { kind: "cardsInPlay", query: { trait: OFFICER_TRAIT } }),
    );
    expect(() => campaignResultOf(counted, log, state, [], deps)).toThrow(/cardStateOf query only/);
    const appendedTo = withVictory(record("first.secrets", "secrets", SECRETS, "append"));
    expect(() => campaignResultOf(appendedTo, log, state, [], deps)).toThrow(/mode "set"/);
  });

  it("the between-games vocabulary still cannot write one", () => {
    const between: CampaignDefinition = {
      ...definition,
      graph: {
        kind: "linear",
        nodes: [
          node("first", {
            setup: [
              {
                id: "first.setup.write",
                text: "test",
                citation: "test",
                step: {
                  kind: "betweenGames",
                  ops: [{ kind: "setField", field: "secrets", value: { kind: "const", value: 1 } }],
                },
              },
            ],
          }),
        ],
      },
    };
    expect(() => resolveBetweenGames(between, newLog(between), { pool: [] }, MODES)).toThrow(
      /between-games vocabulary cannot yet write/,
    );
  });
});

describe("reading a cardState field inside the next game (§3.74, task 52)", () => {
  const context: EffectContext = { selfInstanceId: null, controllerId: null, event: null, bindings: {}, deps };

  function secondGame(log: CampaignLog = afterFirstGame()) {
    return playGame(startGameFromLog(definition, composed(definition, log)).input);
  }

  it("ValueSpec campaignLog { card, counter }: the recorded number, 0 for anything not recorded", () => {
    const { state } = secondGame();
    const read = (card: CardId, counter: string) =>
      resolveValue(state, { kind: "campaignLog", field: "secrets", card, counter }, context, deps);
    expect(read(MEDIC, "secret")).toBe(2);
    expect(read(WATCHER, "secret")).toBe(0);
    expect(read(TACTICIAN, "secret")).toBe(5);
    expect(read(MEDIC, "mark")).toBe(0);
    expect(read(STRANGER.id, "secret")).toBe(0);
    // A field of another kind, and a field the log does not hold, read 0 as well.
    expect(
      resolveValue(state, { kind: "campaignLog", field: "members", card: MEDIC, counter: "secret" }, context, deps),
    ).toBe(0);
    expect(
      resolveValue(state, { kind: "campaignLog", field: "nothing", card: MEDIC, counter: "secret" }, context, deps),
    ).toBe(0);
  });

  it("Predicate campaignLog { card, face }: recorded at all, on the named face, on the front face", () => {
    const { state } = secondGame();
    const ask = (card: CardId, face?: string) =>
      evaluate(state, { kind: "campaignLog", field: "secrets", card, ...(face ? { face } : {}) }, context);
    expect(ask(TACTICIAN)).toBe(true);
    expect(ask(TACTICIAN, TACTICIAN_AID)).toBe(true);
    expect(ask(TACTICIAN, CAMPAIGN_LOG_FRONT_FACE)).toBe(false);
    expect(ask(MEDIC, CAMPAIGN_LOG_FRONT_FACE)).toBe(true);
    expect(ask(MEDIC, TACTICIAN_AID)).toBe(false);
    expect(ask(STRANGER.id)).toBe(false);
    expect(evaluate(state, { kind: "campaignLog", field: "members", card: MEDIC }, context)).toBe(false);
  });

  it("recorded 2, 0 and 5 with the third on its attachment face: two environments and an attachment on the villain", () => {
    const { state, events } = secondGame();
    const medic = state.instances[instanceOf(state, MEDIC)]!;
    const watcher = state.instances[instanceOf(state, WATCHER)]!;
    const aid = state.instances[instanceOf(state, TACTICIAN_AID)]!;
    const villain = state.activeVillainId!;
    expect(medic.counters.secret).toBe(2);
    expect(watcher.counters.secret ?? 0).toBe(0);
    expect(aid.counters.secret).toBe(5);
    expect(locateCard(state, aid.instanceId)).toEqual({ kind: "attachment", hostInstanceId: villain });
    // The counters were placed while the card was an environment, so the attachment's Forced Response never heard them.
    expect(aid.counters.answered ?? 0).toBe(0);
    expect(events.filter((event) => event.type === "cardFlippedToOtherFace")).toHaveLength(1);
    // The villain has the attachment's stat bonus.
    const plain = playGame(undefined).state;
    expect(characterStat(state, villain, "atk", deps)).toBe(
      (characterStat(plain, plain.activeVillainId!, "atk", deps) ?? 0) + 1,
    );
  });

  it("recorded 3 on the attachment face stays an attachment below the threshold (Q11 = A)", () => {
    const log = afterFirstGame();
    const three: CampaignLog = {
      ...log,
      shared: {
        ...log.shared,
        secrets: {
          kind: "cardState",
          cards: { ...RECORDED.cards, [TACTICIAN]: { counters: { secret: 3 }, face: TACTICIAN_AID } },
        } as LogValue,
      },
    };
    const { state } = secondGame(three);
    const aid = state.instances[instanceOf(state, TACTICIAN_AID)]!;
    expect(aid.counters.secret).toBe(3);
    expect(aid.attachedTo).toBe(state.activeVillainId);
  });

  it("recorded 4 on the environment face flips at setup by the card's own text, once", () => {
    const log = afterFirstGame();
    const four: CampaignLog = {
      ...log,
      shared: {
        ...log.shared,
        secrets: { kind: "cardState", cards: { ...RECORDED.cards, [MEDIC]: { counters: { secret: 4 } } } } as LogValue,
      },
    };
    const { state, events } = secondGame(four);
    const medicAid = OFFICERS[0]![1].id;
    const aid = state.instances[instanceOf(state, medicAid)]!;
    expect(aid.counters).toMatchObject({ secret: 4 });
    expect(aid.counters.answered ?? 0).toBe(0);
    // The medic by its own text and the tactician by the recorded face: two flips, never a third.
    expect(events.filter((event) => event.type === "cardFlippedToOtherFace")).toHaveLength(2);
  });
});
