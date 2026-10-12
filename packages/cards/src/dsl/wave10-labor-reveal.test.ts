/**
 * docs/phase7-wave10-hero-packs.md H3.2 (engine task HT2): "New Labors of Hercules" reveals the top card of the Labor
 * deck, with the real Hercules cards in a real game against Core's Rhino. The scripts are this test's own
 * (`wave10-labor.testing.ts`).
 *
 * Hercules 59001b: "New Labors of Hercules — Action: If there is no labor card in play, reveal the top card of the
 * labor deck." RRG 1.8 "Reveal" (p. 38): "If a player is instructed by card text to reveal an encounter card from the
 * encounter deck or any other game area, this same resolution procedure applies"; step 2: an obligation "enters play
 * in the play area of the player revealing it", and an attachment with no attach-to text is placed "on the table in
 * front of the player revealing it. (It is not in play.)" Ruling February 20, 2026 – Ruling 4: such an attachment
 * "attaches when its 'When Revealed' ability triggers". The Hercules insert: "the Lernean Hydra is always a potential
 * target for Defeat the Hydra" (RRG 1.8 "Find", p. 19, reaches the set-aside nemesis set).
 */

import {
  cardsInPlay,
  legalActions,
  locateCard,
  maxHitPoints,
  replay,
  sessionApply,
  startSession,
  type GameState,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { revealTopOfSeparateDeck, separateDeckCountOf, validateDefinition } from "./index.js";
import { P1, inst, playerOf } from "../testing/harness.js";
import { withForm } from "../testing/staging.js";
import {
  AMADEUS_CHO,
  DEFEAT_THE_HYDRA,
  EMBODY_PATHOS,
  LABOR,
  LABOR_DEPS,
  LABOR_SCRIPTS,
  LERNEAN_HYDRA,
  NEW_LABORS,
  PROTECT_HUMANITY,
  TEST_ACTIONS,
  drive,
  laborCodes,
  laborDeck,
  laborGame,
  newLabors,
  newLaborsVerdict,
  ofType,
  theCard,
} from "./wave10-labor.testing.js";

vi.setConfig({ testTimeout: 120_000 });

const offered = (state: GameState): boolean => {
  const actions = legalActions(state, P1, LABOR_DEPS);
  return (
    actions.kind === "turn" &&
    actions.legal.some((a) => a.action.kind === "useAbility" && (a.action.abilityId as string) === NEW_LABORS)
  );
};

describe("H3.2 New Labors of Hercules reveals the top card of the Labor deck (real cards)", () => {
  it("the scripts are valid definitions: the reveal is two effects, a count gates it, and every slot read is bound", () => {
    for (const [id, definition] of Object.entries({ ...LABOR_SCRIPTS, ...TEST_ACTIONS })) {
      expect(validateDefinition(definition), id).toEqual([]);
    }
    expect(revealTopOfSeparateDeck(LABOR)).toEqual([
      {
        kind: "selectCards",
        slot: "top-of-Labor",
        cards: { kind: "separateDeck", player: { kind: "controller" }, name: LABOR, top: { kind: "const", value: 1 } },
      },
      { kind: "revealCard", cards: { kind: "slot", slot: "top-of-Labor" }, player: { kind: "controller" } },
    ]);
    expect(separateDeckCountOf(LABOR)).toEqual({
      kind: "deckCount",
      player: { kind: "controller" },
      separateDeck: LABOR,
    });
    expect(LABOR_SCRIPTS[NEW_LABORS]?.trigger).toMatchObject({ kind: "action", form: "alterEgo" });
  });

  it("Protect Humanity on top: the Labor deck holds 2, the obligation is in his play area with 3 labor counters, and Amadeus Cho is in play", () => {
    const start = laborGame(PROTECT_HUMANITY, DEFEAT_THE_HYDRA, EMBODY_PATHOS);
    expect(offered(start)).toBe(true);
    const cho = theCard(start, AMADEUS_CHO);
    const choWasIn = locateCard(start, cho)?.kind;
    const { state, events } = drive(start, newLabors(start));
    const labor = theCard(state, PROTECT_HUMANITY);
    expect(laborCodes(state)).toEqual([DEFEAT_THE_HYDRA, EMBODY_PATHOS]);
    expect(locateCard(state, labor)).toEqual({ kind: "playArea", playerId: P1 });
    expect(inst(state, labor)).toMatchObject({
      ownerId: P1,
      controllerId: null,
      faceup: true,
      counters: { labor: 3 },
      home: { kind: "separateDeck", name: LABOR },
    });
    expect(cardsInPlay(state)).toContain(labor);
    // Amadeus Cho came from wherever the find saw him, under Hercules's control; the deck was shuffled if it was there.
    expect(locateCard(state, cho)).toEqual({ kind: "playArea", playerId: P1 });
    expect(inst(state, cho).controllerId).toBe(P1);
    if (choWasIn === "deck") {
      expect(events.some((e) => e.type === "deckShuffled" && e.zone.kind === "deck")).toBe(true);
    }
    // From the deck to the table in front of him, faceup, then into play.
    const moves = ofType(events, "cardMoved").filter((e) => e.instanceId === labor);
    expect(moves.map((e) => [e.from?.kind, e.to.kind])).toEqual([
      ["separateDeck", "dealtEncounter"],
      ["dealtEncounter", "playArea"],
    ]);
    expect(ofType(events, "encounterCardRevealed")).toEqual([
      { type: "encounterCardRevealed", instanceId: labor, cardId: PROTECT_HUMANITY, playerId: P1 },
    ]);
    for (const id of laborDeck(state)) expect(inst(state, id).faceup).toBe(false);
  });

  it("a second use that turn is refused: a Labor card is in play", () => {
    const start = laborGame(PROTECT_HUMANITY, DEFEAT_THE_HYDRA, EMBODY_PATHOS);
    const { state } = drive(start, newLabors(start));
    expect(offered(state)).toBe(false);
    expect(newLaborsVerdict(state)).toBe("no_valid_target");
    expect(laborCodes(state)).toEqual([DEFEAT_THE_HYDRA, EMBODY_PATHOS]);
  });

  it("is not offered in hero form, nor with the Labor deck empty", () => {
    const start = laborGame(PROTECT_HUMANITY, DEFEAT_THE_HYDRA, EMBODY_PATHOS);
    const hero = withForm(start, { heroForm: 0 });
    expect(offered(hero)).toBe(false);
    expect(newLaborsVerdict(hero)).not.toBe("ok");

    const empty: GameState = {
      ...start,
      players: start.players.map((p) =>
        p.playerId === P1 ? { ...p, separateDecks: { ...p.separateDecks, [LABOR]: { deck: [], discard: [] } } } : p,
      ),
    };
    expect(offered(empty)).toBe(false);
    expect(newLaborsVerdict(empty)).toBe("no_valid_target");
  });

  it("Defeat the Hydra on top: it waits out of play, finds the set-aside Lernean Hydra, and attaches as the minion engages him at 12 hit points", () => {
    const start = laborGame(DEFEAT_THE_HYDRA, PROTECT_HUMANITY, EMBODY_PATHOS);
    const hydra = theCard(start, LERNEAN_HYDRA);
    expect(locateCard(start, hydra)).toEqual({ kind: "setAside", playerId: P1 });
    const { state, events } = drive(start, newLabors(start));
    const labor = theCard(state, DEFEAT_THE_HYDRA);
    expect(laborCodes(state)).toEqual([PROTECT_HUMANITY, EMBODY_PATHOS]);
    expect(locateCard(state, hydra)).toEqual({ kind: "playArea", playerId: P1 });
    expect(inst(state, hydra)).toMatchObject({ engagedWith: P1, damage: 0, attachments: [labor] });
    expect(inst(state, labor)).toMatchObject({ ownerId: P1, controllerId: null, faceup: true, attachedTo: hydra });
    expect(maxHitPoints(state, hydra, LABOR_DEPS)).toBe(12);
    // No attach line: it sat in front of him, out of play, until its own When Revealed attached it.
    const moves = ofType(events, "cardMoved").filter((e) => e.instanceId === labor);
    expect(moves.map((e) => [e.from?.kind, e.to.kind])).toEqual([
      ["separateDeck", "dealtEncounter"],
      ["dealtEncounter", "attachment"],
    ]);
    expect(playerOf(state, P1).dealtEncounter).toEqual([]);
    // Both cards were revealed by Hercules's player: the Labor card, then the minion it found.
    expect(ofType(events, "encounterCardRevealed").map((e) => [e.cardId, e.playerId])).toEqual([
      [DEFEAT_THE_HYDRA, P1],
      [LERNEAN_HYDRA, P1],
    ]);
  });

  it("Embody Pathos on top: it finds a side scheme out of play, reveals it and attaches to it", () => {
    const start = laborGame(EMBODY_PATHOS, PROTECT_HUMANITY, DEFEAT_THE_HYDRA);
    const { state } = drive(start, newLabors(start));
    const labor = theCard(state, EMBODY_PATHOS);
    const scheme = inst(state, labor).attachedTo;
    expect(scheme).not.toBeNull();
    expect(state.cardPool[inst(state, scheme!).cardId]?.type).toBe("side_scheme");
    expect(cardsInPlay(state)).toContain(scheme);
    expect(inst(state, labor)).toMatchObject({ ownerId: P1, controllerId: null, faceup: true });
    expect(laborCodes(state)).toEqual([PROTECT_HUMANITY, DEFEAT_THE_HYDRA]);
  });

  it("a game that revealed a Labor card replays to the same state", () => {
    const start = laborGame(DEFEAT_THE_HYDRA, PROTECT_HUMANITY, EMBODY_PATHOS);
    const applied = sessionApply(startSession(start), newLabors(start), LABOR_DEPS);
    if (!applied.ok) throw new Error(applied.error.message);
    expect(applied.session.state.pendingChoice).toBeNull();
    const replayed = replay(applied.session.log, LABOR_DEPS);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(applied.session.state);
    expect(JSON.parse(JSON.stringify(applied.session.state))).toEqual(applied.session.state);
  });
});
