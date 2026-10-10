/**
 * Wave 9 opportunistic tips (Agents of S.H.I.E.L.D. and the cycle 9 hero packs, `docs/guided-mode.md` section 3.14):
 * each `situation:` tip fires on its own trigger against the same Core Set fixture `guide-tips.test.ts` uses, with the
 * earlier situations marked seen so only the new trigger is under test. Cards the Core fixture doesn't have are
 * fabricated as bare instances (a tip only reads a printed id, a counter, a threat or an event).
 */
import { beforeEach, describe, expect, test } from "vitest";
import { cardId, cycleId, encounterSetId, setCode, unerrataedText, type MinionCard } from "@mc/content";
import {
  instanceId,
  type CardInstance,
  type GameEvent,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { POOL_DEPS } from "../content/pool.js";
import { LocalEngineHost } from "../engine/local-host.js";
import { SessionStore } from "../store/session-store.js";
import type { SessionConfig } from "../engine/host.js";
import { defaultGuidePrefs, type GuidePrefs } from "../guide/guide-prefs.js";
import type { LessonObservation } from "./lesson-model.js";
import { tipsFor } from "./guide-tips.js";
import { termTextModelOf } from "./term-text-model.js";

const RHINO_SOLO: SessionConfig = {
  scenarioId: "rhino",
  difficulty: "standard",
  players: [{ starterDeckId: "core-spider-man-justice" }],
  seed: 4,
};

/** Every situation tip that existed before wave 9, so a test isolates the new trigger. */
const EARLIER: readonly string[] = [
  "situation:obligation",
  "situation:nemesisSet",
  "situation:mulligan",
  "situation:minionEngaged",
  "situation:sideScheme",
  "situation:crisis",
  "situation:acceleration",
  "situation:boostFlip",
  "situation:villainStageAdvanced",
  "situation:recover",
  "situation:handSizeDiffers",
  "situation:drawOnAttack",
  "situation:teamwork",
  "situation:massForm",
  "situation:counters",
  "situation:weatherSwap",
  "situation:phoenixForce",
  "situation:touched",
  "situation:threatOnCharacters",
  "situation:playerSideScheme",
  "situation:sideSchemeLimit",
  "situation:perPlayerCost",
  "situation:poolAspect",
  "situation:specialists",
  "situation:threeFaceIdentity",
  "situation:psiBlades",
  "situation:hopeSummers",
  "situation:routed",
  "situation:setupAttachments",
  "situation:energyAbsorption",
  "situation:faceupTopCard",
  "situation:wildDeclared",
  "situation:effectDefender",
  "situation:magneticPull",
  "situation:frostbite",
  "situation:grounded",
  "situation:bamf",
  "situation:wrappedInMetal",
  "situation:genePool",
  "situation:prelates",
  "situation:apocalypseDefeat",
  "situation:settingEnvironment",
  "situation:enSabahNur",
  "situation:pursuedByThePast",
  "situation:crazyGang",
  "situation:missionArea",
  "situation:missionAttempt",
  "situation:fourHorsemen",
];
const prefs: GuidePrefs = { ...defaultGuidePrefs, seenTips: EARLIER };

let base: GameState;
let me: PlayerId;

beforeEach(async () => {
  const store = new SessionStore(new LocalEngineHost());
  await store.start(RHINO_SOLO);
  for (let step = 0; step < 12 && store.state.legal?.actions.kind === "choice"; step++) {
    const { choice } = store.state.legal.actions as {
      choice: { options: readonly { optionId: string }[]; minSelections: number };
    };
    await store.resolveChoice(choice.options.slice(0, choice.minSelections).map((option) => option.optionId));
  }
  base = store.state.game!;
  me = store.state.perspectiveId!;
});

function observe(game: GameState, lastEvents: readonly GameEvent[] = []): LessonObservation {
  return { game, lastEvents, perspectiveId: me };
}

const firedId = (
  game: GameState,
  events: readonly GameEvent[] = [],
  seen: readonly string[] = [],
): string | undefined =>
  tipsFor(observe(game, events), POOL_DEPS, { ...prefs, seenTips: [...EARLIER, ...seen] })[0]?.id;

/** A bare instance of a printed card id, put in `playerId`'s play area (or the villain area), optionally attached. */
function withPrintedCard(
  state: GameState,
  printedId: string,
  opts: {
    readonly area?: "player" | "villain";
    readonly patch?: Partial<CardInstance>;
    readonly cardType?: string;
  } = {},
): GameState {
  const cid = cardId(printedId);
  const id = instanceId(`wave9-tip-${printedId}`) as InstanceId;
  const instance: CardInstance = {
    instanceId: id,
    cardId: cid,
    ownerId: null,
    controllerId: me,
    home: { kind: "villainArea" },
    faceup: true,
    exhausted: false,
    damage: 0,
    threat: 0,
    statuses: { stunned: 0, confused: 0, tough: 0 },
    counters: {},
    attachedTo: null,
    attachments: [],
    boostCards: [],
    tucked: [],
    facedownAs: null,
    engagedWith: null,
    flipped: false,
    ...opts.patch,
  } as CardInstance;
  const minion: MinionCard = {
    id: cid,
    type: "minion",
    name: `Wave 9 fixture ${printedId}`,
    setCode: setCode("core"),
    cycleId: cycleId("core"),
    collectorNumber: "test",
    quantityInSet: 1,
    unique: false,
    encounterSetIds: [encounterSetId("wave9-tip-test")],
    boostIcons: 0,
    traits: [],
    keywords: [],
    atk: 1,
    sch: 0,
    hp: 5,
    text: unerrataedText(""),
    abilities: [],
  };
  const inPlayerArea = (opts.area ?? "villain") === "player";
  return {
    ...state,
    cardPool: {
      ...state.cardPool,
      [cid]: opts.cardType ? ({ ...minion, type: opts.cardType, icons: [] } as never) : minion,
    },
    instances: { ...state.instances, [id]: instance },
    villainArea: inPlayerArea ? state.villainArea : [...state.villainArea, id],
    players: state.players.map((p) =>
      p.playerId === me && inPlayerArea ? { ...p, playArea: [...p.playArea, id] } : p,
    ),
  };
}

/** `base` with the perspective player's identity swapped for the printed card `printedId`. */
function asIdentity(state: GameState, printedId: string): GameState {
  const identityId = state.players.find((p) => p.playerId === me)!.identity.instanceId;
  return {
    ...state,
    instances: { ...state.instances, [identityId]: { ...state.instances[identityId]!, cardId: cardId(printedId) } },
  } as GameState;
}
const identityOf = (state: GameState): InstanceId => state.players.find((p) => p.playerId === me)!.identity.instanceId;

describe("wave 9 tips", () => {
  const onTable: readonly (readonly [string, string])[] = [
    ["situation:suitForm", "50035a"],
    ["situation:preparationAbility", "50064"],
    ["situation:nonScalingVillain", "50086a"],
    ["situation:nonScalingVillain", "50103a"],
    ["situation:nonScalingVillain", "50165a"],
    ["situation:nonScalingVillain", "50166a"],
    ["situation:alertLevel", "50090a"],
    ["situation:holdingCell", "50105a"],
    ["situation:holdingCell", "50108a"],
    ["situation:citizenV", "50129a"],
    ["situation:executiveBoard", "50181a"],
    ["situation:executiveBoard", "50183b"],
    ["situation:reluctantFoe", "50171"],
    ["situation:additionalAllyCost", "50173"],
    ["situation:controlledMinions", "50032"],
    ["situation:encasedInIce", "54035"],
  ];
  for (const [tipId, printedId] of onTable) {
    test(`${tipId} fires with ${printedId} on the table, once`, () => {
      const game = withPrintedCard(base, printedId);
      expect(firedId(game)).toBe(tipId);
      expect(firedId(game, [], [tipId])).not.toBe(tipId);
    });
  }

  test("the embassy tip reads the main scheme stage, all three of them", () => {
    const stage = (printedId: string): GameState => ({
      ...base,
      instances: {
        ...base.instances,
        [base.mainScheme.instanceId]: { ...base.instances[base.mainScheme.instanceId]!, cardId: cardId(printedId) },
      },
    });
    for (const id of ["50087a", "50088a", "50089a"]) expect(firedId(stage(id))).toBe("situation:embassyCaptives");
    expect(firedId(base)).toBeUndefined();
  });

  test("Maria Hill's tip needs her identity, and Silk's needs a tucked card", () => {
    expect(firedId(base)).toBeUndefined();
    expect(firedId(asIdentity(base, "50001a"))).toBe("situation:shieldSupports");
    const silk = asIdentity(base, "52001a");
    expect(firedId(silk)).toBeUndefined();
    const id = identityOf(silk);
    const tucked = {
      ...silk,
      instances: { ...silk.instances, [id]: { ...silk.instances[id]!, tucked: [instanceId("t1")] } },
    } as GameState;
    expect(firedId(tucked)).toBe("situation:tuckedCards");
    const other = asIdentity(base, "50034a");
    const otherId = identityOf(other);
    const otherTucked = {
      ...other,
      instances: { ...other.instances, [otherId]: { ...other.instances[otherId]!, tucked: [instanceId("t2")] } },
    } as GameState;
    expect(firedId(otherTucked)).not.toBe("situation:tuckedCards");
  });

  test("the event tips fire on their own event, once", () => {
    const events: readonly (readonly [string, GameEvent])[] = [
      [
        "situation:encounterTopFaceup",
        { type: "encounterTopShown", deckId: "d", instanceId: instanceId("e"), cardId: cardId("50051") } as never,
      ],
      [
        "situation:vulnerableDiscarded",
        {
          type: "vulnerableDiscarded",
          instanceId: instanceId("v"),
          cardId: cardId("50083"),
          status: "stunned",
        } as never,
      ],
      [
        "situation:minionHeld",
        {
          type: "minionHeld",
          instanceId: instanceId("m"),
          hostInstanceId: instanceId("h"),
          engagedBefore: null,
        } as never,
      ],
      ["situation:surgeDealt", { type: "surgeTriggered", instanceId: instanceId("s"), playerId: me } as never],
      [
        "situation:evidenceCards",
        { type: "hiddenPileCardsGained", pile: "shield", cardIds: [], requested: 1, remaining: 5 } as never,
      ],
      ["situation:accusation", { type: "accusationMade", playerId: me, accused: {} } as never],
    ];
    for (const [tipId, event] of events) {
      expect(firedId(base, [event]), tipId).toBe(tipId);
      expect(firedId(base, [event], [tipId]), tipId).not.toBe(tipId);
      expect(firedId(base), tipId).not.toBe(tipId);
    }
  });

  test("every wave 9 tip body links only real glossary terms, and every tip id is distinct", () => {
    const stage = (printedId: string): GameState => ({
      ...base,
      instances: {
        ...base.instances,
        [base.mainScheme.instanceId]: { ...base.instances[base.mainScheme.instanceId]!, cardId: cardId(printedId) },
      },
    });
    const silk = asIdentity(base, "52001a");
    const silkId = identityOf(silk);
    const eventAttempts = [
      { type: "encounterTopShown", deckId: "d", instanceId: instanceId("e"), cardId: cardId("50051") },
      { type: "vulnerableDiscarded", instanceId: instanceId("v"), cardId: cardId("50083"), status: "stunned" },
      { type: "minionHeld", instanceId: instanceId("m"), hostInstanceId: instanceId("h"), engagedBefore: null },
      { type: "surgeTriggered", instanceId: instanceId("s"), playerId: me },
      { type: "hiddenPileCardsGained", pile: "shield", cardIds: [], requested: 1, remaining: 5 },
      { type: "accusationMade", playerId: me, accused: {} },
    ].map((event) => [base, [event as never]] as const);
    const attempts: readonly (readonly [GameState, readonly GameEvent[]])[] = [
      ...["50035a", "50064", "50086a", "50090a", "50105a", "50129a", "50181a", "50171", "50173", "50032", "54035"].map(
        (id) => [withPrintedCard(base, id), []] as const,
      ),
      [stage("50088a"), []],
      [asIdentity(base, "50001a"), []],
      [
        {
          ...silk,
          instances: { ...silk.instances, [silkId]: { ...silk.instances[silkId]!, tucked: [instanceId("t1")] } },
        } as GameState,
        [],
      ],
      ...eventAttempts,
    ];
    const fired: string[] = [];
    for (const [game, events] of attempts) {
      const tip = tipsFor(observe(game, events), POOL_DEPS, prefs)[0];
      expect(tip, "an attempt did not fire a tip").toBeDefined();
      fired.push(tip!.id);
      expect(termTextModelOf(tip!.body).unknownIds, tip!.id).toEqual([]);
      expect(tip!.body, tip!.id).not.toMatch(/colour|behaviour|[–—]/i);
    }
    expect(new Set(fired).size).toBe(fired.length);
    expect(fired.length).toBe(attempts.length);
  });
});
