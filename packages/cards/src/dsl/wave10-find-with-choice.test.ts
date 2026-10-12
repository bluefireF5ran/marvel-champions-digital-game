/**
 * docs/phase7-wave10-hero-packs.md H3.4 (engine task HT4): `findCard(q, to, { choose, outOfPlay })` with the
 * destinations `"reveal"` and `"play"`, with the real Hercules cards in a real two-player game against Core's Rhino
 * (Hercules, then Core's Spider-Man). The scripts are this test's own; the pack's modules are scripted elsewhere.
 *
 * Defeat the Hydra 59002: "When Revealed: Find a non-Elite minion with at least 6 printed hit points. Reveal it, heal
 * all damage from it, and attach this card to it." Embody Pathos 59003: "When Revealed: Find an encounter side scheme
 * that is not in play and reveal it … and attach this card to it. Place 6 additional threat on it." Protect Humanity
 * 59004: "When Revealed: Find Amadeus Cho and put him into play."
 *
 * RRG 1.8 "Find" (p. 19): "a player searches each game area where that card could be found"; not searched: "Facedown
 * encounter cards in any in-play game area … (For example, any encounter cards dealt to a player or given to a
 * character as a boost card.)", the victory display, removed cards; "If a player is instructed to 'find and reveal' a
 * minion that is already in play, that player engages that minion and resolves any keywords and/or triggered abilities
 * that resolve as a result of that minion being revealed … That minion retains all attached cards and tokens on it.
 * That minion is not considered to be entering play." RRG 1.8 "Search" (p. 39): "If a player finds multiple cards that
 * satisfy the criteria of a search, the player chooses among those options"; a deck that was looked through is
 * shuffled. Ruling March 6, 2026 – Ruling 3 (2): a Labor card has no valid target with the "Lernean Hydra already
 * dealt as a boost card". Ruling June 2, 2026 – Ruling 2 (3): Embody Pathos can find a set-aside side scheme.
 */

import { trait } from "@mc/content";
import {
  activeEncounterDeck,
  activeEncounterDeckId,
  cardsInPlay,
  createGame,
  locateCard,
  maxHitPoints,
  type AbilityDefinition,
  type EngineDeps,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import {
  attachCard,
  chosen,
  findCard,
  heal,
  placeThreat,
  query,
  self,
  validateDefinition,
  whenRevealed,
  you,
} from "./index.js";
import { coreScenario } from "../core/setup.js";
import { P1, P2, firstLegal, inst, patchInstance, playerOf, settle, type Picker } from "../testing/harness.js";
import { codeOf } from "../wave9/testing.js";
import { CORE_SPIDER_MAN, HERCULES_DECK, HERO_PACK_CARDS, engageMinion, heroPackConfig } from "../wave10/testing.js";
import {
  AMADEUS_CHO,
  DEFEAT_THE_HYDRA,
  EMBODY_PATHOS,
  LABOR_SCRIPTS,
  LERNEAN_HYDRA,
  PROTECT_HUMANITY,
  depsWith,
  drive,
  laborCodes,
  newLabors,
  ofType,
  theCard,
  withLaborOrder,
} from "./wave10-labor.testing.js";

vi.setConfig({ testTimeout: 120_000 });

const ELITE = trait("ELITE");
const TIGER_SHARK = "01131";
const OLYMPIC_FEUD = "59038";

const SCRIPTS: Readonly<Record<string, AbilityDefinition>> = {
  ...LABOR_SCRIPTS,
  "59002.when-revealed": whenRevealed(
    findCard(query("minion", { withoutTrait: ELITE, not: { maxPrintedHp: 5 } }), "reveal", {
      choose: true,
      bind: "minion",
    }),
    heal(99, chosen("minion")),
    attachCard(self, chosen("minion")),
  ),
  // The per-player reading of this reveal is engine task HT5; these tests pick schemes that print no per-player value.
  "59003.when-revealed": whenRevealed(
    findCard(query("sideScheme", { controller: "encounter" }), "reveal", {
      choose: true,
      outOfPlay: true,
      bind: "scheme",
    }),
    attachCard(self, chosen("scheme")),
    placeThreat(6, chosen("scheme")),
  ),
  "59004.when-revealed": whenRevealed(findCard({ name: "Amadeus Cho" }, "play", { owner: you })),
};
const DEPS: EngineDeps = depsWith(SCRIPTS);

/** Hercules (first player) and Core's Spider-Man against Rhino, at Hercules's first turn, in alter-ego form. */
function twoPlayerGame(...laborOrder: readonly string[]): GameState {
  const config = heroPackConfig(HERCULES_DECK);
  const second = coreScenario("rhino", {
    players: [{ starterDeckId: CORE_SPIDER_MAN }],
    seed: 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: HERO_PACK_CARDS,
  } as never).players[0]!;
  const created = createGame({ ...config, players: [...config.players, second] }, DEPS);
  if (!created.ok) throw new Error(`${created.error.code}: ${created.error.message}`);
  const opened = settle(created.state, firstLegal, (s) => s.step.phase === "player", DEPS);
  return withLaborOrder(opened, ...laborOrder);
}

const SHARK = "shark" as InstanceId;
/** Defeat the Hydra on top; Tiger Shark (6 printed hit points, not Elite) engaged with Spider-Man with 4 damage. */
function hydraAndShark(): GameState {
  const start = twoPlayerGame(DEFEAT_THE_HYDRA, PROTECT_HUMANITY, EMBODY_PATHOS);
  return patchInstance(engageMinion(start, TIGER_SHARK, SHARK, P2), SHARK, { damage: 4, counters: { grudge: 2 } });
}
/** Answers the find's pick with `id` and everything else by default. */
const picking =
  (id: InstanceId): Picker =>
  (state) =>
    state.pendingChoice?.options.some((o) => o.optionId === id) ? [id] : firstLegal(state);
/** Applies commands until the first pick a find asks for, and returns that state. */
function atThePick(state: GameState): GameState {
  let seen: GameState | undefined;
  const stop: Picker = (s) => {
    if (!seen && s.pendingChoice?.prompt.kind === "chooseCards" && s.pendingChoice.options.some((o) => o.zone))
      seen = s;
    return firstLegal(s);
  };
  drive(state, newLabors(state), stop, DEPS);
  if (!seen) throw new Error("the find asked for no pick");
  return seen;
}
const shuffledZones = (events: readonly GameEvent[]) => ofType(events, "deckShuffled").map((e) => e.zone);
const encounterDeckZone = (state: GameState) =>
  ({ kind: "encounterDeck", deckId: activeEncounterDeckId(state) }) as const;

describe("H3.4 the scripts", () => {
  it("are valid definitions: every slot read after the find is bound by it", () => {
    for (const id of ["59002.when-revealed", "59003.when-revealed", "59004.when-revealed"])
      expect(validateDefinition(SCRIPTS[id]!)).toEqual([]);
    expect(SCRIPTS["59003.when-revealed"]!.effects[0]).toEqual({
      kind: "findCard",
      query: { categories: ["sideScheme"], controller: "encounter" },
      to: "reveal",
      bind: "scheme",
      choose: true,
      outOfPlay: true,
    });
  });
});

describe("H3.4 Defeat the Hydra: find a non-Elite minion with at least 6 printed hit points (real cards)", () => {
  it("the Lernean Hydra in Hercules's set-aside nemesis set and Tiger Shark engaged with Spider-Man: both offered, with where they are", () => {
    const start = hydraAndShark();
    const hydra = theCard(start, LERNEAN_HYDRA);
    const choice = atThePick(start).pendingChoice!;
    expect(choice).toMatchObject({ playerId: P1, minSelections: 1, maxSelections: 1 });
    expect(choice.options.map((o) => [o.optionId, o.label, o.zone])).toEqual([
      [SHARK, "Tiger Shark", { kind: "playArea", playerId: P2 }],
      [hydra, "Lernean Hydra", { kind: "setAside", playerId: P1 }],
    ]);
  });

  it("the set-aside Hydra chosen: revealed, engaged with Hercules, 12 hit points, the attachment on it, the encounter deck shuffled", () => {
    const start = hydraAndShark();
    const hydra = theCard(start, LERNEAN_HYDRA);
    const { state, events } = drive(start, newLabors(start), picking(hydra), DEPS);
    const labor = theCard(state, DEFEAT_THE_HYDRA);
    expect(inst(state, hydra)).toMatchObject({ engagedWith: P1, faceup: true, damage: 0, attachments: [labor] });
    expect(playerOf(state, P1).playArea).toContain(hydra);
    expect(maxHitPoints(state, hydra, DEPS)).toBe(12);
    expect(ofType(events, "encounterCardRevealed").map((e) => e.cardId)).toEqual([DEFEAT_THE_HYDRA, LERNEAN_HYDRA]);
    // Tiger Shark is untouched.
    expect(inst(state, SHARK)).toMatchObject({ engagedWith: P2, damage: 4, attachments: [] });
    expect(ofType(events, "cardFound")).toEqual([
      {
        type: "cardFound",
        instanceId: hydra,
        cardId: LERNEAN_HYDRA,
        from: { kind: "setAside", playerId: P1 },
        alreadyThere: false,
        deckShuffled: true,
      },
    ]);
    // A minion that fits could have been in the encounter deck, so it was looked through (RRG p. 39).
    expect(shuffledZones(events)).toEqual([encounterDeckZone(state)]);
  });

  it("the engaged one chosen, with 4 damage: it moves to Hercules, 0 damage, 12 hit points, its counters kept, and does not enter play", () => {
    const start = hydraAndShark();
    const { state, events } = drive(start, newLabors(start), picking(SHARK), DEPS);
    const labor = theCard(state, DEFEAT_THE_HYDRA);
    expect(inst(state, SHARK)).toMatchObject({
      engagedWith: P1,
      damage: 0,
      counters: { grudge: 2 },
      attachments: [labor],
    });
    expect(playerOf(state, P1).playArea).toContain(SHARK);
    expect(playerOf(state, P2).playArea).not.toContain(SHARK);
    expect(maxHitPoints(state, SHARK, DEPS)).toBe(12);
    expect(ofType(events, "cardFound")[0]).toMatchObject({ instanceId: SHARK, alreadyThere: true });
    const entered = ofType(events, "triggerEvent").filter(
      (e) => e.event.kind === "cardEntersPlay" && e.event.instanceId === SHARK,
    );
    expect(entered).toEqual([]);
    // The Hydra stays set aside.
    expect(playerOf(state, P1).setAside).toContain(theCard(state, LERNEAN_HYDRA));
  });

  it("the Lernean Hydra dealt facedown as a boost card and nothing else eligible: nothing found (ruling March 6, 2026 – Ruling 3 (2))", () => {
    const start = twoPlayerGame(DEFEAT_THE_HYDRA, PROTECT_HUMANITY, EMBODY_PATHOS);
    const hydra = theCard(start, LERNEAN_HYDRA);
    const villain = start.activeVillainId!;
    const staged: GameState = {
      ...start,
      players: start.players.map((p) => ({ ...p, setAside: p.setAside.filter((id) => id !== hydra) })),
      instances: {
        ...start.instances,
        [hydra]: { ...inst(start, hydra), faceup: false },
        [villain]: { ...inst(start, villain), boostCards: [hydra] },
      },
    };
    const { state, events } = drive(staged, newLabors(staged), firstLegal, DEPS);
    expect(ofType(events, "cardFound")).toEqual([]);
    expect(ofType(events, "preThenUnresolved").map((e) => e.cause)).toContain("findFoundNothing");
    expect(inst(state, villain).boostCards).toEqual([hydra]);
    expect(inst(state, hydra).faceup).toBe(false);
    // The Labor card had no target: back on the bottom of its deck (H3.3).
    expect(laborCodes(state)).toEqual([PROTECT_HUMANITY, EMBODY_PATHOS, DEFEAT_THE_HYDRA]);
    expect(shuffledZones(events)).toEqual([encounterDeckZone(state)]);
  });
});

describe("H3.4 Embody Pathos: find an encounter side scheme that is not in play (real cards)", () => {
  it("offers every encounter side scheme out of play with its area, and none in play or of a player's", () => {
    const start = twoPlayerGame(EMBODY_PATHOS, PROTECT_HUMANITY, DEFEAT_THE_HYDRA);
    const choice = atThePick(start).pendingChoice!;
    const offered = choice.options.map((o) => [codeOf(start, o.optionId as InstanceId), o.zone?.kind]);
    // Hercules's nemesis side scheme, set aside (ruling June 2, 2026 – Ruling 2 (3)).
    expect(offered).toContainEqual([OLYMPIC_FEUD, "setAside"]);
    // Rhino's own, in the encounter deck.
    expect(offered).toContainEqual(["01107", "encounterDeck"]);
    expect(offered).toContainEqual(["01108", "encounterDeck"]);
    const inPlay = new Set(cardsInPlay(start));
    for (const option of choice.options) {
      const id = option.optionId as InstanceId;
      expect(start.cardPool[inst(start, id).cardId]?.type).toBe("side_scheme");
      expect(inPlay.has(id)).toBe(false);
    }
  });

  it("the set-aside Olympic Feud chosen: revealed (2, and 1 for Hercules, an Olympus card in play), attached, 6 more threat: 9", () => {
    const start = twoPlayerGame(EMBODY_PATHOS, PROTECT_HUMANITY, DEFEAT_THE_HYDRA);
    const feud = theCard(start, OLYMPIC_FEUD);
    const deckBefore = activeEncounterDeck(start).deck.length;
    const { state, events } = drive(start, newLabors(start), picking(feud), DEPS);
    const labor = theCard(state, EMBODY_PATHOS);
    expect(state.villainArea).toContain(feud);
    expect(inst(state, feud)).toMatchObject({ threat: 9, attachments: [labor], faceup: true });
    expect(ofType(events, "cardFound")[0]).toMatchObject({ instanceId: feud, alreadyThere: false });
    // The encounter deck was looked through for the others, and lost no card.
    expect(shuffledZones(events)).toEqual([encounterDeckZone(state)]);
    expect(activeEncounterDeck(state).deck).toHaveLength(deckBefore);
  });
});

describe("H3.4 Protect Humanity: find Amadeus Cho and put him into play (real cards)", () => {
  it("from Hercules's deck or hand: in play under his control, and a deck that was searched is shuffled", () => {
    const start = twoPlayerGame(PROTECT_HUMANITY, DEFEAT_THE_HYDRA, EMBODY_PATHOS);
    const cho = theCard(start, AMADEUS_CHO);
    const from = locateCard(start, cho)!;
    const { state, events } = drive(start, newLabors(start), firstLegal, DEPS);
    expect(playerOf(state, P1).playArea).toContain(cho);
    expect(inst(state, cho)).toMatchObject({ controllerId: P1, faceup: true });
    expect(ofType(events, "choiceRequested").filter((e) => e.choice.prompt.kind === "chooseCards")).toEqual([]);
    expect(ofType(events, "cardFound")).toEqual([
      {
        type: "cardFound",
        instanceId: cho,
        cardId: AMADEUS_CHO,
        from,
        alreadyThere: false,
        deckShuffled: from.kind === "deck",
      },
    ]);
    expect(shuffledZones(events)).toEqual(from.kind === "deck" ? [{ kind: "deck", playerId: P1 }] : []);
  });

  it("Amadeus Cho already in play: nothing moves and no deck is searched", () => {
    const start = twoPlayerGame(PROTECT_HUMANITY, DEFEAT_THE_HYDRA, EMBODY_PATHOS);
    const cho = theCard(start, AMADEUS_CHO);
    // Surgery: Cho in play already, under Hercules's control.
    const from = locateCard(start, cho)!;
    const staged: GameState = {
      ...start,
      players: start.players.map((p) =>
        p.playerId === P1
          ? {
              ...p,
              deck: p.deck.filter((id) => id !== cho),
              hand: p.hand.filter((id) => id !== cho),
              playArea: [...p.playArea, cho],
            }
          : p,
      ),
      instances: { ...start.instances, [cho]: { ...inst(start, cho), faceup: true, controllerId: P1 } },
    };
    expect(["deck", "hand"]).toContain(from.kind);
    const { state, events } = drive(staged, newLabors(staged), firstLegal, DEPS);
    expect(ofType(events, "cardMoved").filter((e) => e.instanceId === cho)).toEqual([]);
    expect(ofType(events, "cardFound")[0]).toMatchObject({ instanceId: cho, alreadyThere: true, deckShuffled: false });
    expect(shuffledZones(events)).toEqual([]);
    expect(playerOf(state, P1).playArea).toContain(cho);
  });
});
