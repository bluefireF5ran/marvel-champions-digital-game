/**
 * docs/phase7-wave10-hero-packs.md H3.5 (engine task HT5): `perPlayerAs` on a reveal, with the real Hercules cards in
 * a real three-player game against Core's Rhino (Hercules, Spider-Man, She-Hulk) with the All Versus All side scheme.
 * The scripts are this test's own; the pack's modules are scripted elsewhere.
 *
 * Embody Pathos 59003: "When Revealed: Find an encounter side scheme that is not in play and reveal it, treating each
 * [per player] on it as 1, and attach this card to it. Place 6 additional threat on it."
 *
 * RRG 1.8 "Per Player Icon" (p. 32): "A per player icon next to a value multiplies that value by the number of players
 * who started the scenario." RRG 1.8 "Hinder X" (p. 22): hinder threat is in addition to any threat the scheme
 * normally enters play with.
 *
 * The owner's answer to question 19 = A (2026-10-11, provisional): the reading covers only the reveal (starting
 * threat, hinder, the scheme's When Revealed); a later ability of that scheme reads the real per-player count.
 *
 * The side schemes found: All Versus All 59041 (starting threat 2, Hinder 2 per player), Crowd Control 01108 (starting
 * threat 2 per player), Breakin' & Takin' 01107 (starting threat 2; "When Revealed: Place an additional 1 [per player]
 * threat here"), and one built in the test (starting threat 3 per player; "Forced Response: After a character flips,
 * place 1 [per player] threat here").
 */

import { cardId, type AnyCard } from "@mc/content";
import {
  activeEncounterDeckId,
  createGame,
  type AbilityDefinition,
  type EngineDeps,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import {
  action,
  attachCard,
  chosen,
  findCard,
  forcedResponse,
  on,
  perHero,
  placeThreat,
  query,
  self,
  validateDefinition,
  whenRevealed,
} from "./index.js";
import { coreScenario } from "../core/setup.js";
import { P1, changeForm, firstLegal, identityOf, inst, playerOf, settle, type Picker } from "../testing/harness.js";
import { codeOf } from "../wave9/testing.js";
import { CORE_SPIDER_MAN, HERCULES_DECK, HERO_PACK_CARDS, heroPackSeat } from "../wave10/testing.js";
import {
  DEFEAT_THE_HYDRA,
  EMBODY_PATHOS,
  LABOR_SCRIPTS,
  PROTECT_HUMANITY,
  depsWith,
  drive,
  newLabors,
  theCard,
  withLaborOrder,
} from "./wave10-labor.testing.js";

vi.setConfig({ testTimeout: 120_000 });

const ALL_VERSUS_ALL = "59041";
const CROWD_CONTROL = "01108";
const BREAKIN_AND_TAKIN = "01107";
const TEST_SCHEME = "test-riot";
const TEST_SCHEME_RESPONSE = "test-riot.forced-response";
const REVEAL_NORMALLY = "test.find-and-reveal-a-side-scheme";

const ENCOUNTER_SIDE_SCHEME = query("sideScheme", { controller: "encounter" });
const SCRIPTS: Readonly<Record<string, AbilityDefinition>> = {
  ...LABOR_SCRIPTS,
  // The card's own text, as its module will write it.
  "59003.when-revealed": whenRevealed(
    findCard(ENCOUNTER_SIDE_SCHEME, "reveal", { choose: true, outOfPlay: true, bind: "scheme", perPlayerAs: 1 }),
    attachCard(self, chosen("scheme")),
    placeThreat(6, chosen("scheme")),
  ),
  // Test only. "Action: Find an encounter side scheme that is not in play and reveal it." (no per-player reading)
  [REVEAL_NORMALLY]: action(findCard(ENCOUNTER_SIDE_SCHEME, "reveal", { choose: true, outOfPlay: true })),
  // Test only. "Forced Response: After a character flips, place 1 [per player] threat here."
  [TEST_SCHEME_RESPONSE]: forcedResponse(on.characterFlips(), placeThreat(perHero(1), self)),
};
const DEPS: EngineDeps = depsWith(SCRIPTS);

/** Surgery: the test's own side scheme (Crowd Control's record, starting threat 3 per player) on the encounter deck. */
function withTestScheme(state: GameState): GameState {
  const crowd = state.cardPool[inst(state, theCard(state, CROWD_CONTROL)).cardId];
  if (crowd?.type !== "side_scheme") throw new Error("no Crowd Control");
  const card: AnyCard = {
    ...crowd,
    id: TEST_SCHEME as never,
    name: "Riot",
    icons: [],
    startingThreat: { base: 0, perPlayer: 3 },
    abilities: [{ id: TEST_SCHEME_RESPONSE as never }],
  };
  const id = "riot" as InstanceId;
  const deckId = activeEncounterDeckId(state);
  const pile = state.encounterDecks[deckId]!;
  return {
    ...state,
    cardPool: { ...state.cardPool, [card.id]: card },
    encounterDecks: { ...state.encounterDecks, [deckId]: { ...pile, deck: [...pile.deck, id] } },
    instances: {
      ...state.instances,
      [id]: { ...inst(state, theCard(state, CROWD_CONTROL)), instanceId: id, cardId: card.id },
    },
  };
}

/** Surgery on the card pool: Hercules's alter-ego also prints the test's plain find-and-reveal action. */
function withRevealAction(state: GameState): GameState {
  const cardId = playerOf(state, P1).identity.cardId;
  const card = state.cardPool[cardId];
  if (card?.type !== "hero_identity") throw new Error("no identity card");
  const alterEgo = { ...card.alterEgo, abilities: [...card.alterEgo.abilities, { id: REVEAL_NORMALLY as never }] };
  return { ...state, cardPool: { ...state.cardPool, [cardId]: { ...card, alterEgo } } };
}

/**
 * Hercules (first player), Spider-Man and She-Hulk against Rhino, with the All Versus All side scheme added to the
 * encounter deck; Embody Pathos on top of the Labor deck.
 */
function threePlayerGame(): GameState {
  const config = coreScenario("rhino", {
    players: [{ starterDeckId: CORE_SPIDER_MAN }, { starterDeckId: "core-she-hulk-aggression" }],
    seed: 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: HERO_PACK_CARDS,
  } as never);
  const created = createGame(
    {
      ...config,
      encounterDeck: [...config.encounterDeck, cardId(ALL_VERSUS_ALL)],
      players: [heroPackSeat(HERCULES_DECK), ...config.players],
    },
    DEPS,
  );
  if (!created.ok) throw new Error(`${created.error.code}: ${created.error.message}`);
  const opened = settle(created.state, firstLegal, (s) => s.step.phase === "player", DEPS);
  return withRevealAction(withTestScheme(withLaborOrder(opened, EMBODY_PATHOS, PROTECT_HUMANITY, DEFEAT_THE_HYDRA)));
}

const picking =
  (id: InstanceId): Picker =>
  (state) =>
    state.pendingChoice?.options.some((o) => o.optionId === id) ? [id] : firstLegal(state);
const revealNormally = (state: GameState) =>
  ({
    type: "useAbility",
    playerId: P1,
    cardInstanceId: identityOf(state, P1),
    abilityId: REVEAL_NORMALLY as never,
    payment: [],
  }) as const;
/** The threat on the scheme `code` once the Hercules player has found and revealed it, normally or by Embody Pathos. */
function threatAfter(code: string, how: "normally" | "embodyPathos"): { state: GameState; scheme: InstanceId } {
  const start = threePlayerGame();
  const scheme = code === TEST_SCHEME ? ("riot" as InstanceId) : theCard(start, code);
  const command = how === "normally" ? revealNormally(start) : newLabors(start);
  const { state } = drive(start, command, picking(scheme), DEPS);
  expect(state.villainArea).toContain(scheme);
  return { state, scheme };
}
const threatOf = (found: { state: GameState; scheme: InstanceId }): number => inst(found.state, found.scheme).threat;

describe("H3.5 Embody Pathos: reveal it, treating each per player icon on it as 1 (real cards, 3 players; question 19 = A, provisional)", () => {
  it("the script is a valid definition, and three players started the game", () => {
    expect(validateDefinition(SCRIPTS["59003.when-revealed"]!)).toEqual([]);
    expect(validateDefinition(action(findCard(ENCOUNTER_SIDE_SCHEME, "discard", { perPlayerAs: 1 })))).toEqual([
      'findCard perPlayerAs: only a find with `to: "reveal"` reveals a card',
    ]);
    const start = threePlayerGame();
    expect(start.startingPlayerCount).toBe(3);
    expect(codeOf(start, theCard(start, ALL_VERSUS_ALL))).toBe(ALL_VERSUS_ALL);
  });

  it("All Versus All (starting threat 2, Hinder 2 per player) revealed normally: 2 + 6 = 8", () => {
    expect(threatOf(threatAfter(ALL_VERSUS_ALL, "normally"))).toBe(8);
  });

  it("All Versus All found by Embody Pathos: 2 + 2 hinder + 6 additional = 10", () => {
    const found = threatAfter(ALL_VERSUS_ALL, "embodyPathos");
    expect(threatOf(found)).toBe(10);
    expect(inst(found.state, found.scheme).attachments).toEqual([theCard(found.state, EMBODY_PATHOS)]);
  });

  it("Crowd Control (starting threat 2 per player) revealed normally: 6; found by Embody Pathos: 2 + 6 = 8", () => {
    expect(threatOf(threatAfter(CROWD_CONTROL, "normally"))).toBe(6);
    expect(threatOf(threatAfter(CROWD_CONTROL, "embodyPathos"))).toBe(8);
  });

  it("Breakin' & Takin' (2; When Revealed: 1 per player more) revealed normally: 2 + 3 = 5; found by Embody Pathos: 2 + 1 + 6 = 9", () => {
    expect(threatOf(threatAfter(BREAKIN_AND_TAKIN, "normally"))).toBe(5);
    expect(threatOf(threatAfter(BREAKIN_AND_TAKIN, "embodyPathos"))).toBe(9);
  });

  it("a side scheme with starting threat 3 per player, found by Embody Pathos: 3 + 6 = 9, not 9 + 6", () => {
    expect(threatOf(threatAfter(TEST_SCHEME, "normally"))).toBe(9);
    expect(threatOf(threatAfter(TEST_SCHEME, "embodyPathos"))).toBe(9);
  });

  it("question 19 = A: that scheme's later Forced Response still reads 3 players (9 + 3 = 12)", () => {
    const found = threatAfter(TEST_SCHEME, "embodyPathos");
    expect(threatOf(found)).toBe(9);
    // Hercules flips to hero form: "After a character flips, place 1 [per player] threat here."
    const { state } = drive(found.state, changeForm(P1), firstLegal, DEPS);
    expect(playerOf(state, P1).identity.form).toBe("hero");
    expect(inst(state, found.scheme).threat).toBe(12);
    // Embody Pathos is still attached: the reading ended with the reveal, not with the attachment.
    expect(inst(state, found.scheme).attachments).toEqual([theCard(state, EMBODY_PATHOS)]);
  });
});
