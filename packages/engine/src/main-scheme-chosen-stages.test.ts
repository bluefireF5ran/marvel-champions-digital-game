/**
 * docs/phase7-wave10.md §3.2: a main scheme deck made of chosen stages of one card
 * (`GameSetupConfig.mainSchemeStageIndexes`). MC56 p. 5: "Select one of the four main scheme stage 1s … Select one of
 * the four main scheme stage 2s … Put stage 1 on top of stage 2."
 *
 * The real `registration` card (56063a) is read from `@mc/content`: eight stages, by index Cut Off Support (1),
 * Negative Zone Prison (2), S.H.I.E.L.D. Recruits (1), Hunting Rebel Heroes (2), Homeland Security (1), Public
 * Outrage (1), The Initiative (2), No Going Back (2). Its abilities are card scripts the engine package cannot name, so
 * they are not registered here: these tests read its stages, threat values and `completionLoses` only. A fixture with
 * the same eight stage numbers and a different starting threat on every stage tells the stages apart by value.
 */
import { CORE_CARDS, CW_CARDS, flat, type CardId, type MainSchemeCard, type ScalingValue } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import { replay } from "./engine.js";
import { playerId } from "./ids.js";
import {
  mainSchemeStage,
  mainSchemeStageCount,
  mainSchemeStagePosition,
  mainSchemeValue,
  mustInstance,
} from "./query.js";
import { nextMainSchemeStage } from "./resolve/defeat.js";
import { createGame, mainSchemeStageIndexesProblem, type GameSetupConfig } from "./setup.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility, type StubAbility } from "./testing/abilities.js";
import { runCommands } from "./testing/drive.js";
import { stubEvent, stubMainScheme, stubTreachery, stubVillain } from "./testing/fixtures.js";
import { giveCard, HERO, seatIdentities } from "./testing/scenario.js";

const p1 = playerId("p1");
const BLANK = stubTreachery({ id: "blank", boostIcons: 0 });
const QUIET_VILLAIN = stubVillain({ id: "quiet", stages: [{ hp: flat(30), atk: 0, sch: 0 }] });

const ADVANCE = stubAbility("advance.action", {
  trigger: { kind: "action" },
  effects: [{ kind: "advanceMainScheme" }],
});
/** More than any target here: 9 per player with four players is 36. */
const PLOT = stubAbility("plot.action", {
  trigger: { kind: "action" },
  effects: [{ kind: "placeThreat", target: { kind: "mainScheme" }, amount: { kind: "const", value: 40 } }],
});
const SHUFFLE_ALL = stubAbility("shuffle-all.action", {
  trigger: { kind: "action" },
  effects: [{ kind: "shuffleMainSchemeStages", fromStageIndex: 0 }],
});
const ADVANCE_TO_2 = stubAbility("advance-to-2.action", {
  trigger: { kind: "action" },
  effects: [{ kind: "advanceMainScheme", to: { stageNumber: 2 } }],
});
const ADVANCE_CARD = stubEvent({ id: "advance-card", cost: 0, abilities: [ADVANCE.ref] });
const PLOT_CARD = stubEvent({ id: "plot-card", cost: 0, abilities: [PLOT.ref] });
const SHUFFLE_CARD = stubEvent({ id: "shuffle-card", cost: 0, abilities: [SHUFFLE_ALL.ref] });
const ADVANCE_TO_2_CARD = stubEvent({ id: "advance-to-2-card", cost: 0, abilities: [ADVANCE_TO_2.ref] });
const PLAYER_CARDS = [ADVANCE_CARD, PLOT_CARD, SHUFFLE_CARD, ADVANCE_TO_2_CARD];

const ABILITIES: readonly StubAbility[] = [ADVANCE, PLOT, SHUFFLE_ALL, ADVANCE_TO_2];
const deps: EngineDeps = depsOf(...ABILITIES);

function mainSchemeCard(cards: readonly { readonly id: CardId }[], id: string): MainSchemeCard {
  const card = cards.find((candidate) => candidate.id === id) as MainSchemeCard | undefined;
  if (card?.type !== "main_scheme") throw new Error(`${id} is not a main scheme card`);
  return card;
}

const REGISTRATION = mainSchemeCard(CW_CARDS, "56063a");
const KLAW_SCHEME = mainSchemeCard(CORE_CARDS, "01116a");

const REGISTRATION_NUMBERS = [1, 2, 1, 2, 1, 1, 2, 2] as const;

/** The registration card's shape with a starting threat of `10 × (index + 1)` plus `index + 1` per player. */
const EIGHT: MainSchemeCard = (() => {
  const stub = stubMainScheme({
    id: "eight",
    stages: REGISTRATION_NUMBERS.map((_, index) => ({
      startingThreat: { base: 10 * (index + 1), perPlayer: index + 1 } satisfies ScalingValue,
      targetThreat: flat(100),
      acceleration: flat(0),
    })),
  });
  const [first, ...rest] = stub.stages.map((stage, index) => ({
    ...stage,
    stageNumber: REGISTRATION_NUMBERS[index] as number,
    name: `Stage at ${index}`,
  }));
  if (!first) throw new Error("no stages");
  return { ...stub, name: "Eight Stages", stages: [first, ...rest] };
})();

function config(scheme: MainSchemeCard, indexes: readonly number[] | undefined, players = 1): GameSetupConfig {
  const identities = seatIdentities(HERO, players);
  return {
    seed: 7,
    cards: [QUIET_VILLAIN, scheme, BLANK, ...PLAYER_CARDS, ...identities],
    villainCardId: QUIET_VILLAIN.id,
    mainSchemeCardId: scheme.id,
    ...(indexes ? { mainSchemeStageIndexes: indexes } : {}),
    encounterDeck: Array.from({ length: 24 }, () => BLANK.id as CardId),
    includeIdentitySets: false,
    players: identities.map((identity) => ({
      identityCardId: identity.id,
      deck: [...PLAYER_CARDS, ...PLAYER_CARDS].map((card) => card.id),
    })),
  };
}

function game(scheme: MainSchemeCard, indexes: readonly number[] | undefined, players = 1) {
  const result = createGame(config(scheme, indexes, players), deps);
  if (!result.ok) throw new Error(result.error.message);
  const run = runCommands(result.state, deps);
  return { ...run, created: result.state, events: [...result.events, ...run.events] };
}

function play(state: GameState, cardId: string) {
  const given = giveCard(state, p1, cardId);
  return runCommands(given.state, deps, {
    type: "playCard",
    playerId: p1,
    cardInstanceId: given.id,
    payment: [],
    attachToInstanceId: null,
  });
}

const schemeThreat = (state: GameState): number => mustInstance(state, state.mainScheme.instanceId).threat;
const refusal = (scheme: MainSchemeCard, indexes: readonly number[]) => {
  const result = createGame(config(scheme, indexes), deps);
  return result.ok ? "accepted" : { code: result.error.code, message: result.error.message };
};

describe("§3.2 GameSetupConfig.mainSchemeStageIndexes", () => {
  it("the real registration card holds the eight stages these tests index", () => {
    expect(REGISTRATION.stages.map((stage) => [stage.stageNumber, stage.name, stage.printedCardId])).toEqual([
      [1, "Cut Off Support", "56063b"],
      [2, "Negative Zone Prison", "56064b"],
      [1, "S.H.I.E.L.D. Recruits", "56096b"],
      [2, "Hunting Rebel Heroes", "56097b"],
      [1, "Homeland Security", "56121b"],
      [1, "Public Outrage", "56122b"],
      [2, "The Initiative", "56123b"],
      [2, "No Going Back", "56124b"],
    ]);
  });

  it.each([
    [1, 7, 9],
    [2, 14, 18],
    [4, 28, 36],
  ])("stages [2, 6] with %i player(s): opens on stage 2 (target %i), then stage 6 (target %i)", (players, t1, t2) => {
    const { state, created, events } = game(REGISTRATION, [2, 6], players);
    expect(created.mainScheme).toEqual({
      instanceId: created.mainScheme.instanceId,
      cardId: "56063a",
      stageIndex: 2,
      completed: false,
      accelerationTokens: 0,
      stageOrder: [2, 6],
    });
    expect(state.mainScheme.stageIndex).toBe(2);
    expect(state.mainScheme.stageOrder).toEqual([2, 6]);
    expect(state.spentMainSchemeStages).toEqual([0, 1, 3, 4, 5, 7]);
    expect(mainSchemeStage(state).name).toBe("S.H.I.E.L.D. Recruits");
    expect(schemeThreat(state)).toBe(0);
    expect(mainSchemeValue(state, "startingThreat")).toBe(0);
    expect(mainSchemeValue(state, "targetThreat")).toBe(t1);
    expect(mainSchemeStageCount(state)).toBe(2);
    expect(mainSchemeStagePosition(state)).toBe(1);
    expect(nextMainSchemeStage(state, state.mainScheme)).toBe(6);
    expect(events.filter((event) => event.type === "mainSchemeStagesChosen")).toEqual([
      { type: "mainSchemeStagesChosen", schemeInstanceId: state.mainScheme.instanceId, order: [2, 6] },
    ]);

    const second = play(state, PLOT_CARD.id);
    expect(second.state.mainScheme.stageIndex).toBe(6);
    expect(second.state.mainScheme.completed).toBe(false);
    expect(second.state.outcome).toBeNull();
    expect(mainSchemeStage(second.state).name).toBe("The Initiative");
    expect(schemeThreat(second.state)).toBe(0);
    expect(mainSchemeValue(second.state, "targetThreat")).toBe(t2);
    expect(mainSchemeStagePosition(second.state)).toBe(2);
    expect(nextMainSchemeStage(second.state, second.state.mainScheme)).toBeNull();
    expect(second.events.filter((event) => event.type.startsWith("mainScheme"))).toEqual([
      { type: "mainSchemeCompleted", stageIndex: 2 },
      { type: "mainSchemeAdvanced", stageIndex: 6, advancedBy: { cause: "completed", sourceInstanceId: null } },
    ]);

    const lost = play(second.state, PLOT_CARD.id);
    expect(lost.state.mainScheme.stageIndex).toBe(6);
    expect(lost.state.mainScheme.completed).toBe(true);
    expect(lost.state.outcome).toEqual({ result: "loss", reason: "mainSchemeCompleted" });
  });

  it("the spec's pair [Public Outrage, No Going Back] is indexes [5, 7]: targets 7 then 9 with one player", () => {
    const { state } = game(REGISTRATION, [5, 7]);
    expect(mainSchemeStage(state).name).toBe("Public Outrage");
    expect(mainSchemeValue(state, "targetThreat")).toBe(7);
    const second = play(state, PLOT_CARD.id).state;
    expect(second.mainScheme.stageIndex).toBe(7);
    expect(mainSchemeStage(second).name).toBe("No Going Back");
    expect(mainSchemeValue(second, "targetThreat")).toBe(9);
    expect(play(second, PLOT_CARD.id).state.outcome).toEqual({ result: "loss", reason: "mainSchemeCompleted" });
  });

  it.each([
    [1, 33, 77],
    [2, 36, 84],
    [4, 42, 98],
  ])("each chosen stage enters with its own starting threat: %i player(s), %i then %i", (players, first, second) => {
    const { state } = game(EIGHT, [2, 6], players);
    expect(state.mainScheme.stageIndex).toBe(2);
    expect(schemeThreat(state)).toBe(first);
    const advanced = play(state, ADVANCE_CARD.id).state;
    expect(advanced.mainScheme.stageIndex).toBe(6);
    expect(schemeThreat(advanced)).toBe(second);
    // The last chosen stage is the final one: a default advance does nothing.
    const stays = play(advanced, ADVANCE_CARD.id).state;
    expect(stays.mainScheme.stageIndex).toBe(6);
    expect(stays.outcome).toBeNull();
  });

  it("a stage left out is not in the main scheme deck: no named advance or shuffle reaches it", () => {
    const { state } = game(EIGHT, [2, 6]);
    // "Advance to stage 2" finds the one stage 2 in the deck, not a group of four.
    expect(play(state, ADVANCE_TO_2_CARD.id).state.mainScheme.stageIndex).toBe(6);
    const shuffled = play(state, SHUFFLE_CARD.id);
    expect(shuffled.state.mainScheme.stageOrder).toEqual([2, 6]);
    expect(shuffled.state.spentMainSchemeStages).toEqual([0, 1, 3, 4, 5, 7]);
  });

  it("absent: every stage in printed order, as before (same-numbered stages stay alternatives)", () => {
    const { state, created, events } = game(REGISTRATION, undefined);
    expect(created.mainScheme).toEqual({
      instanceId: created.mainScheme.instanceId,
      cardId: "56063a",
      stageIndex: 0,
      completed: false,
      accelerationTokens: 0,
    });
    expect(state.mainScheme.stageOrder).toBeUndefined();
    expect(state.spentMainSchemeStages).toEqual([]);
    expect(events.some((event) => event.type === "mainSchemeStagesChosen")).toBe(false);
    expect(mainSchemeStageCount(state)).toBe(8);
    expect(mainSchemeStagePosition(state)).toBe(1);
    expect(nextMainSchemeStage(state, state.mainScheme)).toBe("alternatives");
  });

  it("Klaw's two-stage main scheme (01116a) is unchanged without the field, and [0, 1] plays the same stages", () => {
    const plain = game(KLAW_SCHEME, undefined);
    expect(plain.state.mainScheme.stageIndex).toBe(0);
    expect(plain.state.mainScheme.stageOrder).toBeUndefined();
    expect(plain.state.spentMainSchemeStages).toEqual([]);
    expect(mainSchemeValue(plain.state, "targetThreat")).toBe(6);
    const stageTwo = play(plain.state, PLOT_CARD.id).state;
    expect(stageTwo.mainScheme.stageIndex).toBe(1);
    expect(mainSchemeStage(stageTwo).name).toBe("Secret Rendezvous");
    expect(mainSchemeValue(stageTwo, "targetThreat")).toBe(8);
    expect(stageTwo.outcome).toBeNull();
    expect(play(stageTwo, PLOT_CARD.id).state.outcome).toEqual({ result: "loss", reason: "mainSchemeCompleted" });

    const chosen = game(KLAW_SCHEME, [0, 1]);
    expect(chosen.state.mainScheme.stageOrder).toEqual([0, 1]);
    expect(chosen.state.spentMainSchemeStages).toEqual([]);
    const chosenTwo = play(chosen.state, PLOT_CARD.id).state;
    expect(chosenTwo.mainScheme.stageIndex).toBe(1);
    expect(play(chosenTwo, PLOT_CARD.id).state.outcome).toEqual({ result: "loss", reason: "mainSchemeCompleted" });
  });

  it("a card whose stage numbers are unique may play a subset: Klaw's stage 2 alone is the final stage", () => {
    const { state } = game(KLAW_SCHEME, [1]);
    expect(state.mainScheme.stageIndex).toBe(1);
    expect(state.spentMainSchemeStages).toEqual([0]);
    expect(play(state, PLOT_CARD.id).state.outcome).toEqual({ result: "loss", reason: "mainSchemeCompleted" });
  });

  describe("refusals, all `invalid_setup`", () => {
    it.each<[string, readonly number[], string]>([
      [
        "an empty list",
        [],
        "Choose at least one stage of Superhero Registration Act: mainSchemeStageIndexes is empty.",
      ],
      [
        "an index past the last stage",
        [2, 8],
        "Superhero Registration Act has no stage at index 8: its stages are indexes 0 to 7.",
      ],
      [
        "a negative index",
        [-1, 6],
        "Superhero Registration Act has no stage at index -1: its stages are indexes 0 to 7.",
      ],
      [
        "a fractional index",
        [1.5, 6],
        "Superhero Registration Act has no stage at index 1.5: its stages are indexes 0 to 7.",
      ],
      ["a repeated stage", [2, 2], "S.H.I.E.L.D. Recruits (stage 1) is chosen twice. Choose each stage once."],
      [
        "two stage 1s",
        [2, 5],
        "Choose only one stage 1: both S.H.I.E.L.D. Recruits (stage 1) and Public Outrage (stage 1) are chosen.",
      ],
      [
        "two stage 2s after a stage 1",
        [2, 6, 7],
        "Choose only one stage 2: both The Initiative (stage 2) and No Going Back (stage 2) are chosen.",
      ],
      [
        "stage 2 before stage 1",
        [6, 2],
        "S.H.I.E.L.D. Recruits (stage 1) cannot come after The Initiative (stage 2): choose stages in ascending stage number.",
      ],
      [
        "a stage 1 with no stage 2",
        [2],
        "Choose a stage 2 of Superhero Registration Act: one stage of each number is needed.",
      ],
      [
        "a stage 2 with no stage 1",
        [6],
        "Choose a stage 1 of Superhero Registration Act: one stage of each number is needed.",
      ],
    ])("%s", (_, indexes, message) => {
      expect(REGISTRATION.name).toBe("Superhero Registration Act");
      expect(refusal(REGISTRATION, indexes)).toEqual({ code: "invalid_setup", message });
      expect(mainSchemeStageIndexesProblem(REGISTRATION, indexes)).toBe(message);
    });

    it("a stage with no title of its own is named by its card", () => {
      expect(refusal(KLAW_SCHEME, [1, 0])).toEqual({
        code: "invalid_setup",
        message:
          "Underground Distribution (stage 1) cannot come after Secret Rendezvous (stage 2): choose stages in ascending stage number.",
      });
    });

    it("a legal list has no problem", () => {
      expect(mainSchemeStageIndexesProblem(REGISTRATION, [2, 6])).toBeNull();
      expect(mainSchemeStageIndexesProblem(KLAW_SCHEME, [0, 1])).toBeNull();
    });
  });

  it("the state does not share the caller's list, and survives a JSON round trip", () => {
    const indexes = [2, 6];
    const result = createGame(config(REGISTRATION, indexes), deps);
    if (!result.ok) throw new Error(result.error.message);
    indexes.push(7);
    expect(result.state.mainScheme.stageOrder).toEqual([2, 6]);
    const { state } = play(runCommands(result.state, deps).state, PLOT_CARD.id);
    const restored = JSON.parse(JSON.stringify(state)) as GameState;
    expect(restored).toEqual(state);
    // The restored game keeps walking the chosen order.
    expect(restored.mainScheme).toMatchObject({ stageIndex: 6, stageOrder: [2, 6] });
    expect(play(restored, PLOT_CARD.id).state.outcome).toEqual({ result: "loss", reason: "mainSchemeCompleted" });
  });

  it("replays deep-equal", () => {
    let { state, session } = game(REGISTRATION, [2, 6], 2);
    for (const cardId of [PLOT_CARD.id, PLOT_CARD.id]) {
      const given = giveCard(state, p1, cardId);
      ({ state, session } = runCommands(given.state, deps, {
        type: "playCard",
        playerId: p1,
        cardInstanceId: given.id,
        payment: [],
        attachToInstanceId: null,
      }));
      const replayed = replay(session.log, deps);
      if (!replayed.ok) throw new Error(replayed.error.message);
      expect(replayed.state).toEqual(state);
    }
    expect(state.outcome).toEqual({ result: "loss", reason: "mainSchemeCompleted" });
  });
});
