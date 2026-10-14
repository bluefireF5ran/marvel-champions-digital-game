/**
 * docs/phase7-wave10-hero-packs.md H3.3 (engine task HT3): where a Labor card goes when it leaves play or cannot enter
 * it, with the real Hercules cards in a real game against Core's Rhino. The scripts are this test's own
 * (`wave10-labor.testing.ts`).
 *
 * RRG 1.8 FAQ, "Hercules Hero Pack – Labor Cards" (p. 65): "Q: What happens if a labor card fails to find a target when
 * it is revealed? A: That Labor card is discarded. Any time a Labor card leaves play other than being placed in the
 * victory display, place it on the bottom of the Labor deck." Ruling March 6, 2026 – Ruling 3 (2), on the same
 * question (its example: "Lernean Hydra already dealt as a boost card"): "If a Labor card cannot enter play, place it
 * on the bottom of the Labor deck." Both end the card in the same place; the FAQ is later and adds that it is
 * discarded. The owner's answer to question 3 is B (docs/phase7-wave10.md §4.0): the discard is announced, then the
 * card goes to the bottom of the Labor deck.
 *
 * RRG 1.8 "Victory X" (p. 46): "An attachment or upgrade with the victory X keyword is placed in the victory display
 * when the card to which it is attached is defeated"; "A card with both the victory X and uses (X 'type') keywords is
 * placed in the victory display when its last all-purpose counter is removed from it."
 */

import { locateCard, maxHitPoints, type GameEvent, type GameState, type InstanceId } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { P1, inst, patchInstance, playerOf } from "../testing/harness.js";
import { defeatWithAttack, withForm } from "../testing/staging.js";
import { codeOf } from "../wave9/testing.js";
import {
  DEFEAT_THE_HYDRA,
  DISCARD_LABORS,
  DISCARD_MINIONS,
  EMBODY_PATHOS,
  LABOR,
  LABOR_DEPS,
  LERNEAN_HYDRA,
  PROTECT_HUMANITY,
  REMOVE_LABOR_COUNTER,
  drive,
  laborCodes,
  laborGame,
  newLabors,
  newLaborsVerdict,
  ofType,
  testAction,
  theCard,
} from "./wave10-labor.testing.js";

vi.setConfig({ testTimeout: 120_000 });

const LABOR_ZONE = { kind: "separateDeck", playerId: P1, name: LABOR } as const;
const returns = (events: readonly GameEvent[]) =>
  ofType(events, "returnedToSeparateDeck").map((e) => [e.cardId as string, e.name, e.instead]);
const victoryCodes = (state: GameState): string[] => state.victoryDisplay.map((id) => codeOf(state, id));
/** No discard pile, hand or other deck holds the card. */
function inNoPile(state: GameState, id: InstanceId): boolean {
  const player = playerOf(state, P1);
  const piles = [
    ...player.discard,
    ...player.hand,
    ...player.deck,
    ...Object.values(state.encounterDecks).flatMap((deck) => [...deck.deck, ...deck.discard]),
  ];
  return !piles.includes(id);
}

/**
 * The ruling's own case: the Lernean Hydra is a facedown boost card on the villain, where a find cannot look (RRG 1.8
 * "Find", p. 19: "except facedown encounter cards"), so Defeat the Hydra has no minion to find.
 */
function withHydraAsBoostCard(state: GameState): GameState {
  const hydra = theCard(state, LERNEAN_HYDRA);
  const villain = state.activeVillainId!;
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, setAside: p.setAside.filter((id) => id !== hydra) })),
    instances: {
      ...state.instances,
      [hydra]: { ...inst(state, hydra), faceup: false },
      [villain]: { ...inst(state, villain), boostCards: [hydra] },
    },
  };
}

describe("H3.3 a Labor card with no valid target (question 3 = B, real cards)", () => {
  it("Defeat the Hydra with the Lernean Hydra dealt as a boost card: discarded, said so, and last in a Labor deck of 3", () => {
    const start = withHydraAsBoostCard(laborGame(DEFEAT_THE_HYDRA, PROTECT_HUMANITY, EMBODY_PATHOS));
    const { state, events } = drive(start, newLabors(start));
    const labor = theCard(state, DEFEAT_THE_HYDRA);
    expect(laborCodes(state)).toEqual([PROTECT_HUMANITY, EMBODY_PATHOS, DEFEAT_THE_HYDRA]);
    expect(locateCard(state, labor)).toEqual(LABOR_ZONE);
    expect(inst(state, labor)).toMatchObject({ ownerId: P1, controllerId: null, faceup: false, attachedTo: null });
    expect(inNoPile(state, labor)).toBe(true);
    expect(state.victoryDisplay).toEqual([]);
    // The boost card was not found and is where it was.
    expect(inst(state, state.activeVillainId!).boostCards).toEqual([theCard(state, LERNEAN_HYDRA)]);
    expect(ofType(events, "revealedCardDiscarded")).toEqual([
      {
        type: "revealedCardDiscarded",
        instanceId: labor,
        cardId: DEFEAT_THE_HYDRA,
        playerId: P1,
        reason: "notAttached",
      },
    ]);
    expect(returns(events)).toEqual([[DEFEAT_THE_HYDRA, LABOR, "separateDiscard"]]);
    const story = events
      .filter((e) => "instanceId" in e && e.instanceId === labor)
      .map((e) => (e.type === "cardMoved" ? `cardMoved:${e.to.kind}` : e.type));
    expect(story.slice(-3)).toEqual(["revealedCardDiscarded", "returnedToSeparateDeck", "cardMoved:separateDeck"]);
  });

  it("the action may be used again at once and reveals the next card", () => {
    const start = withHydraAsBoostCard(laborGame(DEFEAT_THE_HYDRA, PROTECT_HUMANITY, EMBODY_PATHOS));
    const first = drive(start, newLabors(start)).state;
    expect(newLaborsVerdict(first)).toBe("ok");
    const { state } = drive(first, newLabors(first));
    const next = theCard(state, PROTECT_HUMANITY);
    expect(locateCard(state, next)).toEqual({ kind: "playArea", playerId: P1 });
    expect(inst(state, next).counters).toEqual({ labor: 3 });
    expect(laborCodes(state)).toEqual([EMBODY_PATHOS, DEFEAT_THE_HYDRA]);
  });
});

describe("H3.3 the three ways to the victory display (real cards)", () => {
  it("the Hydra's minion defeated by Hercules: the attachment is in the victory display, the minion in the encounter discard pile", () => {
    const start = laborGame(DEFEAT_THE_HYDRA, PROTECT_HUMANITY, EMBODY_PATHOS);
    const attached = drive(start, newLabors(start)).state;
    const labor = theCard(attached, DEFEAT_THE_HYDRA);
    const hydra = theCard(attached, LERNEAN_HYDRA);
    expect(maxHitPoints(attached, hydra, LABOR_DEPS)).toBe(12);
    const state = defeatWithAttack(LABOR_DEPS, withForm(attached, { heroForm: 0 }), hydra);
    expect(victoryCodes(state)).toEqual([DEFEAT_THE_HYDRA]);
    expect(locateCard(state, labor)).toEqual({ kind: "victoryDisplay" });
    expect(locateCard(state, hydra)?.kind).toBe("encounterDiscard");
    expect(inst(state, labor)).toMatchObject({ ownerId: P1, controllerId: null, attachedTo: null });
    expect(laborCodes(state)).toEqual([PROTECT_HUMANITY, EMBODY_PATHOS]);
  });

  it("Embody Pathos's side scheme defeated: the attachment is in the victory display", () => {
    const start = laborGame(EMBODY_PATHOS, PROTECT_HUMANITY, DEFEAT_THE_HYDRA);
    const attached = drive(start, newLabors(start)).state;
    const labor = theCard(attached, EMBODY_PATHOS);
    const scheme = inst(attached, labor).attachedTo!;
    // One threat left, and Hercules thwarts for 1.
    const hero = withForm(patchInstance(attached, scheme, { threat: 1 }), { heroForm: 0 });
    const { state } = drive(hero, {
      type: "basicThwart",
      playerId: P1,
      thwarterInstanceId: playerOf(hero, P1).identity.instanceId,
      schemeInstanceId: scheme,
    });
    expect(victoryCodes(state)).toContain(EMBODY_PATHOS);
    expect(locateCard(state, labor)).toEqual({ kind: "victoryDisplay" });
    expect(laborCodes(state)).toEqual([PROTECT_HUMANITY, DEFEAT_THE_HYDRA]);
  });

  it("Protect Humanity at 1 counter, one more removed: the victory display, never the encounter discard pile", () => {
    const start = laborGame(PROTECT_HUMANITY, DEFEAT_THE_HYDRA, EMBODY_PATHOS);
    const inPlay = drive(start, newLabors(start)).state;
    const labor = theCard(inPlay, PROTECT_HUMANITY);
    const atOne = patchInstance(inPlay, labor, { counters: { labor: 1 } });
    const { state, events } = drive(atOne, testAction(atOne, REMOVE_LABOR_COUNTER));
    expect(victoryCodes(state)).toEqual([PROTECT_HUMANITY]);
    expect(inNoPile(state, labor)).toBe(true);
    expect(playerOf(state, P1).playArea).not.toContain(labor);
    expect(laborCodes(state)).toEqual([DEFEAT_THE_HYDRA, EMBODY_PATHOS]);
    const moves = ofType(events, "cardMoved").filter((e) => e.instanceId === labor);
    expect(moves.map((e) => e.to.kind)).toEqual(["victoryDisplay"]);
    expect(returns(events)).toEqual([]);
  });
});

describe("H3.3 every other departure ends on the bottom of the Labor deck (real cards)", () => {
  it("the Hydra's minion discarded by a player card, not defeated: the attachment is last in the Labor deck, the victory display unchanged", () => {
    const start = laborGame(DEFEAT_THE_HYDRA, PROTECT_HUMANITY, EMBODY_PATHOS);
    const attached = drive(start, newLabors(start)).state;
    const labor = theCard(attached, DEFEAT_THE_HYDRA);
    const hydra = theCard(attached, LERNEAN_HYDRA);
    const { state, events } = drive(attached, testAction(attached, DISCARD_MINIONS));
    expect(laborCodes(state)).toEqual([PROTECT_HUMANITY, EMBODY_PATHOS, DEFEAT_THE_HYDRA]);
    expect(state.victoryDisplay).toEqual([]);
    expect(locateCard(state, hydra)?.kind).toBe("encounterDiscard");
    expect(inst(state, labor)).toMatchObject({ ownerId: P1, controllerId: null, faceup: false, attachedTo: null });
    expect(inNoPile(state, labor)).toBe(true);
    expect(returns(events)).toEqual([[DEFEAT_THE_HYDRA, LABOR, "separateDiscard"]]);
  });

  it("a player card discards the obligation: last in the Labor deck, facedown, its counters gone", () => {
    const start = laborGame(PROTECT_HUMANITY, DEFEAT_THE_HYDRA, EMBODY_PATHOS);
    const inPlay = drive(start, newLabors(start)).state;
    const labor = theCard(inPlay, PROTECT_HUMANITY);
    const { state, events } = drive(inPlay, testAction(inPlay, DISCARD_LABORS));
    expect(laborCodes(state)).toEqual([DEFEAT_THE_HYDRA, EMBODY_PATHOS, PROTECT_HUMANITY]);
    expect(inst(state, labor)).toMatchObject({ faceup: false, counters: {}, controllerId: null });
    expect(state.victoryDisplay).toEqual([]);
    expect(inNoPile(state, labor)).toBe(true);
    expect(returns(events)).toEqual([[PROTECT_HUMANITY, LABOR, "separateDiscard"]]);
    // With no Labor card in play, the action is open again.
    expect(newLaborsVerdict(state)).toBe("ok");
  });
});
