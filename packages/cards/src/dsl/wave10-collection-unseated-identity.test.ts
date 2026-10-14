/**
 * docs/phase7-wave10-hero-packs.md H3.18: `forAnIdentityNotInThisGame`, the "identity-specific … for an identity not in
 * this game" half of a collection search filter, and a player card's own "Setup:" ability resolving at setup step 16.
 * With the real Cameo 58031 in a real Wonder Man game against Core's Rhino. The script is this test's own (the pack's
 * module scripts the card for the game); the engine's `search-collection-unseated-identity.test.ts` drives the plain
 * data (seats, progressing identities, copies, the step's order).
 *
 * Cameo: "Setup. Max 1 per deck. Setup: Search your collection for an identity-specific ally for an identity not in
 * this game. Shuffle that ally into your deck. Discard 2 cards from your hand and remove this card from the game."
 * RRG 1.8 "Identity-Specific Card" (p. 23); Appendix II steps 11 and 16 (p. 51). Ruling March 19, 2026 - Ruling 6: a
 * unique card added during setup "can share titles with cards in player decks".
 */

import { cardId } from "@mc/content";
import { createGame, locateCard, type GameState } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import {
  cards,
  chosen,
  discardFromHand,
  forAnIdentityNotInThisGame,
  fromAnyAspect,
  heroNoCharacterIsTitledAs,
  moveCards,
  searchCollection,
  self,
  setup,
  validateDefinition,
} from "./index.js";
import { P1, answer, firstLegal, inst, instancesOf, playerOf, settle } from "../testing/harness.js";
import { HERCULES_DECK, WONDER_MAN_DECK, heroPackConfig, heroPackSeat } from "../wave10/testing.js";
import { depsWith } from "./wave10-labor.testing.js";

vi.setConfig({ testTimeout: 120_000 });

const CAMEO = "58031";
const SETUP = "58031.setup";
const AMADEUS_CHO = "59008"; // Hercules's own ally
const BLACK_CAT = "01002"; // Spider-Man's own ally
const HAWKEYE = "58013"; // a Justice ally of the Wonder Man pack

const CAMEO_SETUP = setup(
  searchCollection({ categories: ["ally"], ...forAnIdentityNotInThisGame }, "ally"),
  moveCards(cards(chosen("ally")), "deckShuffle"),
  discardFromHand(2),
  moveCards(cards(self), "removedFromGame"),
);
const deps = depsWith({ [SETUP]: CAMEO_SETUP });

/** A Wonder Man game with Cameo in place of the deck's last card, played to Cameo's collection search. */
function atSearch(withHercules = false): GameState {
  const config = heroPackConfig(WONDER_MAN_DECK);
  const seat = config.players[0]!;
  const deck = [...seat.deck.slice(0, -1), cardId(CAMEO)];
  const players = [{ ...seat, deck }, ...(withHercules ? [heroPackSeat(HERCULES_DECK)] : [])];
  const created = createGame({ ...config, requireLegalDecks: false, players }, deps);
  if (!created.ok) throw new Error(`${created.error.code}: ${created.error.message}`);
  return settle(created.state, firstLegal, (s) => s.pendingChoice?.prompt.kind === "searchCollection", deps);
}
const offered = (state: GameState): string[] => state.pendingChoice!.options.map((o) => o.optionId);

describe("H3.18 a collection search for an ally of an identity not in the game", () => {
  it("forAnIdentityNotInThisGame is the filter's own half, spread into it beside the card type", () => {
    expect(forAnIdentityNotInThisGame).toEqual({ identitySpecificToUnseated: true });
    expect(searchCollection({ categories: ["ally"], ...forAnIdentityNotInThisGame }, "ally")).toEqual({
      kind: "searchCollection",
      player: { kind: "controller" },
      filter: { categories: ["ally"], identitySpecificToUnseated: true },
      bind: "ally",
    });
  });

  it("Cameo's Setup validates: the slot is bound for the shuffle", () => {
    expect(CAMEO_SETUP.trigger).toEqual({ kind: "setup" });
    expect(validateDefinition(CAMEO_SETUP)).toEqual([]);
  });

  it("the validator refuses the half beside a field it can never match with, or with no card type", () => {
    const problemsOf = (filter: Parameters<typeof searchCollection>[0]) =>
      validateDefinition(setup(searchCollection(filter, "ally")));
    expect(problemsOf({ categories: ["ally"], aspects: fromAnyAspect, ...forAnIdentityNotInThisGame })).toEqual([
      expect.stringContaining("identitySpecificToUnseated with aspects matches no card"),
    ]);
    expect(problemsOf({ categories: ["ally"], ...heroNoCharacterIsTitledAs, ...forAnIdentityNotInThisGame })).toEqual([
      expect.stringContaining("identitySpecificToUnseated with heroTitleNotInPlay matches no card"),
    ]);
    expect(problemsOf(forAnIdentityNotInThisGame)).toEqual([
      expect.stringContaining("identitySpecificToUnseated names no card type"),
    ]);
    // The other filters are untouched.
    expect(problemsOf({ categories: ["ally"], aspects: fromAnyAspect })).toEqual([]);
  });

  it("at step 16 the real Cameo offers Amadeus Cho and Black Cat, and no aspect ally", () => {
    const state = atSearch();
    expect(state.step).toMatchObject({ phase: "setup", kind: "playerSetupAbilities" });
    expect(offered(state)).toEqual(expect.arrayContaining([AMADEUS_CHO, BLACK_CAT]));
    expect(offered(state)).not.toContain(HAWKEYE);
  });

  it("with Hercules seated, Amadeus Cho is not offered", () => {
    const state = atSearch(true);
    expect(offered(state)).not.toContain(AMADEUS_CHO);
    expect(offered(state)).toContain(BLACK_CAT);
  });

  it("the ally is shuffled into the deck, 2 cards are discarded from hand and Cameo is removed from the game", () => {
    const state = atSearch();
    const before = playerOf(state, P1);
    const cameo = instancesOf(state, CAMEO)[0]!;
    expect(locateCard(state, cameo)).toEqual({ kind: "playArea", playerId: P1 });
    const after = settle(answer(state, [AMADEUS_CHO], deps), firstLegal, (s) => s.step.phase === "player", deps);
    const player = playerOf(after, P1);
    expect(player.deck.map((id) => inst(after, id).cardId)).toContain(AMADEUS_CHO);
    expect(player.deck).toHaveLength(before.deck.length + 1);
    expect(player.hand).toHaveLength(before.hand.length - 2);
    expect(player.discard).toHaveLength(before.discard.length + 2);
    expect(locateCard(after, cameo)).toEqual({ kind: "removedFromGame" });
  });
});
