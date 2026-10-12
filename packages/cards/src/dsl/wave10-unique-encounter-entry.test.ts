/**
 * docs/phase7-wave10.md §3.8: the unique rule on a Civil War encounter card entering play, with the real cards in real
 * Civil War games.
 *
 * RRG 1.8 "Unique Icon" (pp. 45-46): "A non-villain card in an out-of-play state that matches a card in play cannot
 * enter play. If the out-of-play card is … a non-villain encounter card, it is discarded and any effects of it entering
 * play are ignored. If it was being revealed, any effects of it being revealed are ignored and the player revealing it
 * is dealt a facedown encounter card." Two cards that share a title and have no subtitle and no alter-ego title match.
 *
 * - Captain Marvel's Helmet 56099 (a unique attachment of the Captain Marvel leader's set, "Attach to Captain Marvel")
 *   against the Core upgrade Captain Marvel's Helmet 01016, in the `registration-captain-marvel` scenario with the Core
 *   Captain Marvel deck. The leader is a villain, so the hero of the same name does not stop the game (§4.1 Q5).
 * - Luke Cage 56184 (a unique minion of the Defenders set) against the Core ally Luke Cage 01076, in the
 *   `resistance-spider-woman` scenario with the Core Black Panther deck.
 *
 * The villain phase draws the villain's boost card first, then deals each player a card, so a stack reads "boost,
 * dealt, then the card the unique rule deals". Advance 01186 prints no boost icon and no Boost ability.
 */

import { applyCommand, createGame, locateCard, type GameEvent, type GameState, type InstanceId } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import {
  P1,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  moveToHand,
  payWith,
  play,
  settle,
  stackEncounterDeck,
} from "../testing/harness.js";
import { driveEventsPicking, withForm } from "../testing/staging.js";
import { codeOf, piles, revealedCodes, types } from "../wave9/testing.js";
import { wave10Scenario } from "../wave10/setup.js";
import { CAPTAIN_MARVEL_SCENARIO, SPIDER_WOMAN_SCENARIO, WAVE10_DEPS, stagedInPlay } from "../wave10/testing.js";

vi.setConfig({ testTimeout: 120_000 });

const HELMET_ATTACHMENT = "56099";
const HELMET_UPGRADE = "01016";
const LUKE_CAGE_MINION = "56184";
const LUKE_CAGE_ALLY = "01076";
const ADVANCE = "01186";
const CAPTAIN_MARVEL_DECK = "core-captain-marvel-leadership";
const BLACK_PANTHER_DECK = "core-black-panther-protection";

/** A Civil War game past setup with a Core starter deck in the one seat, in hero form. */
function game(scenarioId: string, starterDeckId: string, modularSetIds?: readonly string[]): GameState {
  const config = wave10Scenario(scenarioId, {
    seed: 1,
    players: [{ starterDeckId }],
    ...(modularSetIds ? { modularSetIds } : {}),
  });
  const created = createGame(config, WAVE10_DEPS);
  if (!created.ok) throw new Error(`${created.error.code}: ${created.error.message}`);
  const started = settle(created.state, firstLegal, (s) => s.step.phase === "player", WAVE10_DEPS);
  return withForm(started, { heroForm: 0 });
}

const leaderOf = (s: GameState): InstanceId => s.activeVillainId!;
const idOf = (s: GameState, code: string): InstanceId =>
  Object.values(s.instances).find((i) => (i.cardId as string) === code)!.instanceId;
const attachedTo = (s: GameState, host: InstanceId) =>
  Object.values(s.instances)
    .filter((i) => i.attachedTo === host)
    .map((i) => i.cardId as string);
const discardCodes = (s: GameState) => piles(s).discard.map((id) => codeOf(s, id));
/** The cards dealt to a player as facedown encounter cards, in order. */
const dealtCodes = (s: GameState, events: readonly GameEvent[]) =>
  types(events, "cardMoved")
    .filter((e) => e.to.kind === "dealtEncounter")
    .map((e) => codeOf(s, e.instanceId));
/** A side scheme of the encounter deck that is not unique: a harmless card for the unique rule to deal. */
const aSideScheme = (s: GameState): string => {
  const id = piles(s).deck.find((i) => {
    const card = s.cardPool[inst(s, i).cardId];
    return card?.type === "side_scheme" && !card.unique;
  });
  if (!id) throw new Error("no side scheme in the encounter deck");
  return codeOf(s, id);
};
/** The reveals of these cards, in order (another card's ability may reveal a card of its own in the same phase). */
const revealedOf = (s: GameState, events: readonly GameEvent[], ...codes: readonly string[]) =>
  revealedCodes(s, events).filter((code) => codes.includes(code));
const villainPhase = (state: GameState, ...stack: string[]) =>
  driveEventsPicking(WAVE10_DEPS, stackEncounterDeck(state, ...stack), firstLegal, endTurn(P1));

describe("Captain Marvel's Helmet 56099 against the upgrade Captain Marvel's Helmet 01016", () => {
  it("revealed with the upgrade in play: discarded, never attached, and one facedown encounter card is dealt", () => {
    const start = game(CAPTAIN_MARVEL_SCENARIO, CAPTAIN_MARVEL_DECK);
    const upgrade = stagedInPlay(start, HELMET_UPGRADE);
    const next = aSideScheme(upgrade.state);
    const before = attachedTo(upgrade.state, leaderOf(upgrade.state));
    const { state, events } = villainPhase(upgrade.state, ADVANCE, HELMET_ATTACHMENT, next);
    const helmet = idOf(state, HELMET_ATTACHMENT);
    expect(types(events, "uniqueEntryBlocked")).toEqual([
      {
        type: "uniqueEntryBlocked",
        instanceId: helmet,
        cardId: HELMET_ATTACHMENT,
        matchedInstanceId: upgrade.id,
        disposition: "discarded",
      },
    ]);
    // Not attached to the leader, at any point: it went from the player's dealt cards to the encounter discard pile.
    expect(inst(state, helmet).attachedTo).toBeNull();
    expect(attachedTo(state, leaderOf(state))).toEqual(before);
    expect(types(events, "cardMoved").filter((e) => e.instanceId === helmet && e.to.kind === "attachment")).toEqual([]);
    expect(locateCard(state, helmet)?.kind).toBe("encounterDiscard");
    expect(discardCodes(state)).toContain(HELMET_ATTACHMENT);
    // Step three dealt the Helmet; the unique rule dealt exactly one more card, revealed after it in step four.
    expect(dealtCodes(state, events)).toEqual([HELMET_ATTACHMENT, next]);
    expect(revealedOf(state, events, HELMET_ATTACHMENT, next)).toEqual([HELMET_ATTACHMENT, next]);
    // The player's upgrade is untouched.
    expect(state.players[0]!.playArea).toContain(upgrade.id);
    expect(inst(state, upgrade.id).controllerId).toBe(P1);
  });

  it("revealed with no matching card in play: it attaches to the leader and no extra card is dealt", () => {
    const start = game(CAPTAIN_MARVEL_SCENARIO, CAPTAIN_MARVEL_DECK);
    const { state, events } = villainPhase(start, ADVANCE, HELMET_ATTACHMENT);
    expect(types(events, "uniqueEntryBlocked")).toEqual([]);
    expect(inst(state, idOf(state, HELMET_ATTACHMENT)).attachedTo).toBe(leaderOf(state));
    expect(dealtCodes(state, events)).toEqual([HELMET_ATTACHMENT]);
  });

  it("the reverse: with 56099 attached to the leader, playing the upgrade 01016 is refused by the unique rule", () => {
    const start = game(CAPTAIN_MARVEL_SCENARIO, CAPTAIN_MARVEL_DECK);
    const attached = villainPhase(start, ADVANCE, HELMET_ATTACHMENT).state;
    expect(attachedTo(attached, leaderOf(attached))).toContain(HELMET_ATTACHMENT);
    const given = moveToHand(withForm(attached, { heroForm: 0 }), P1, HELMET_UPGRADE);
    const turn = given.state;
    const upgrade = given.ids[0]!;
    const result = applyCommand(turn, play(P1, upgrade, payWith(turn, P1, 2, [upgrade])), WAVE10_DEPS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe(
      "Captain Marvel's Helmet matches Captain Marvel's Helmet, already in play: the players as a group may have only one copy of each unique card in play",
    );
    expect(turn.players[0]!.hand).toContain(upgrade);
  });
});

describe("Luke Cage 56184 against the ally Luke Cage 01076", () => {
  it("revealed with the ally in play: discarded, its When Revealed ignored, and one facedown card is dealt", () => {
    const start = game(SPIDER_WOMAN_SCENARIO, BLACK_PANTHER_DECK, ["new_avengers", "defenders", "hells_kitchen"]);
    const ally = stagedInPlay(start, LUKE_CAGE_ALLY);
    const hero = identityOf(ally.state, P1);
    const next = aSideScheme(ally.state);
    const { state, events } = villainPhase(ally.state, ADVANCE, LUKE_CAGE_MINION, next);
    const minion = idOf(state, LUKE_CAGE_MINION);
    expect(types(events, "uniqueEntryBlocked")).toEqual([
      {
        type: "uniqueEntryBlocked",
        instanceId: minion,
        cardId: LUKE_CAGE_MINION,
        matchedInstanceId: ally.id,
        disposition: "discarded",
      },
    ]);
    expect(locateCard(state, minion)?.kind).toBe("encounterDiscard");
    expect(state.players[0]!.playArea).not.toContain(minion);
    // Nothing of the minion resolved: nobody was given a status card, and it did not attack.
    expect(types(events, "abilityResolved").filter((e) => e.instanceId === minion)).toEqual([]);
    expect(types(events, "statusGiven")).toEqual([]);
    expect(inst(state, hero).statuses).toMatchObject({ stunned: 0, confused: 0 });
    expect(types(events, "attackResolved").filter((e) => e.enemyInstanceId === minion)).toEqual([]);
    expect(dealtCodes(state, events)).toEqual([LUKE_CAGE_MINION, next]);
    expect(revealedOf(state, events, LUKE_CAGE_MINION, next)).toEqual([LUKE_CAGE_MINION, next]);
    expect(state.players[0]!.playArea).toContain(ally.id);
  });
});
