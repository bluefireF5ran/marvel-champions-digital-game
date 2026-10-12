/**
 * docs/phase7-wave10.md §3.10: `setDefeatDestination(boostCardOf(enemy))`, a defeated minion given to the enemy leader
 * as a facedown boost card, in real Civil War games (`civilWarHeroGame`, the Tigra starter deck, cooperative mode).
 * The engine side is driven by `packages/engine/src/defeat-to-boost-card.test.ts`.
 *
 * The real cards are Falcon 56150 and Hercules 56151 (New Avengers; "Teamwork (Avenger). When Defeated: Give this card
 * to the enemy leader as a facedown boost card.") against Captain America 56137, and Dangerous Recruits 56091 ("Forced
 * Interrupt: When a minion is defeated, give it to the enemy leader as a facedown boost card.") with Bullseye 56088
 * against Iron Man 56059. Their modules are scripted elsewhere, so this file registers its own scripts of the texts
 * under test over the wave's registry. Falcon's Boost here is its first sentence only ("You are confused."): the
 * "gains [boost][boost]" half is another primitive.
 *
 * Sources: RRG 1.8 "When Defeated Abilities" (p. 48), "Boost, Boost Icon" (p. 11), "Stun, Stunned" (p. 41); MC56
 * p. 6: in a cooperative game "the enemy leader" is the leader in play.
 */

import { cardId } from "@mc/content";
import {
  activeEncounterDeckId,
  type AbilityDefinition,
  type EngineDeps,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { P1, endTurn, firstLegal, identityOf, inst, patchInstance, stackEncounterDeck } from "../testing/harness.js";
import { driveEventsPicking, encounterCardInVillainArea } from "../testing/staging.js";
import { codeOf, flippedBoosts, piles, types } from "../wave9/testing.js";
import { CAPTAIN_AMERICA_SCENARIO, IRON_MAN_SCENARIO, WAVE10_DEPS, civilWarHeroGame } from "../wave10/testing.js";
import { action, boost, forcedInterrupt, on, whenDefeated } from "./abilities.js";
import { boostCardOf, confuse, setDefeatDestination } from "./effects.js";
import { defineAbilities, validateDefinition } from "./validate.js";
import { enemyLeader, query, yourIdentity } from "./values.js";

vi.setConfig({ testTimeout: 120_000 });

const FALCON = "56150";
const HERCULES = "56151";
const NEW_AVENGERS = "56154"; // side scheme: dealt and revealed, it enters play and does nothing to the player
const BULLSEYE = "56088"; // minion, 2 boost icons, no Boost ability
const RECRUITS = "56091";
const ADVANCE = "01186"; // Core standard treachery with no boost icon and no Boost ability

const teamworkGift = whenDefeated(setDefeatDestination(boostCardOf(enemyLeader)));
const SCRIPTS = defineAbilities({
  "56150.when-defeated": teamworkGift,
  "56150.boost": boost(confuse(yourIdentity)),
  "56151.when-defeated": teamworkGift,
  "56091.dangerous-recruits-forced-interrupt": forcedInterrupt(
    on.defeated(query("minion")),
    setDefeatDestination(boostCardOf(enemyLeader)),
  ),
});
const deps: EngineDeps = { ...WAVE10_DEPS, abilities: { ...WAVE10_DEPS.abilities, ...SCRIPTS } };

const leaderOf = (s: GameState): InstanceId => s.activeVillainId!;
const boostsOn = (s: GameState) => inst(s, leaderOf(s)).boostCards;

/** Surgery: the encounter deck's own copy of minion `code`, engaged with player 1 (no reveal, no When Revealed). */
function engaged(state: GameState, code: string): { readonly state: GameState; readonly id: InstanceId } {
  const deckId = activeEncounterDeckId(state);
  const pile = state.encounterDecks[deckId]!;
  const wanted = cardId(code);
  const id = [...pile.deck, ...pile.discard].find((i) => state.instances[i]?.cardId === wanted);
  if (!id) throw new Error(`no ${code} in the encounter deck or discard`);
  return {
    id,
    state: {
      ...state,
      encounterDecks: {
        ...state.encounterDecks,
        [deckId]: { deck: pile.deck.filter((i) => i !== id), discard: pile.discard.filter((i) => i !== id) },
      },
      players: state.players.map((p) => (p.playerId === P1 ? { ...p, playArea: [...p.playArea, id] } : p)),
      instances: { ...state.instances, [id]: { ...state.instances[id]!, engagedWith: P1, faceup: true } },
    },
  };
}

/** Player 1's hero, readied by surgery, defeats `target` with a real basic attack. */
function defeat(state: GameState, target: InstanceId) {
  const hero = identityOf(state, P1);
  const ready = patchInstance(patchInstance(state, target, { damage: 999 }), hero, { exhausted: false });
  return driveEventsPicking(deps, ready, firstLegal, {
    type: "basicAttack",
    playerId: P1,
    attackerInstanceId: hero,
    targetInstanceId: target,
  });
}

const capGame = () => civilWarHeroGame(CAPTAIN_AMERICA_SCENARIO, { deps });

describe("§3.10 Teamwork minions: 'give this card to the enemy leader as a facedown boost card'", () => {
  it("the script is plain data and the validator accepts it in a When Defeated and in an interrupt on a defeat", () => {
    expect(teamworkGift.effects).toEqual([
      { kind: "setDefeatDestination", to: { kind: "boostCardOf", enemy: { kind: "leader", of: "enemy" } } },
    ]);
    expect(validateDefinition(teamworkGift)).toEqual([]);
    expect(validateDefinition(SCRIPTS["56091.dangerous-recruits-forced-interrupt"])).toEqual([]);
    expect(JSON.parse(JSON.stringify(teamworkGift))).toEqual(teamworkGift);
    const misplaced: AbilityDefinition = action(setDefeatDestination(boostCardOf(enemyLeader)));
    expect(validateDefinition(misplaced)).toEqual([
      "setDefeatDestination boostCardOf needs a When Defeated ability or an interrupt on a character's defeat (interrupt(on.defeated(…), …))",
    ]);
    // Any other defeat destination is checked as before.
    expect(validateDefinition(action(setDefeatDestination("hand")))).toEqual([]);
  });

  it("Falcon defeated: Captain America holds him facedown, and he is in no discard pile", () => {
    const falcon = engaged(capGame(), FALCON);
    const { state, events } = defeat(falcon.state, falcon.id);
    expect(types(events, "characterDefeated").map((e) => e.instanceId)).toEqual([falcon.id]);
    expect(types(events, "boostCardDealt")).toEqual([
      { type: "boostCardDealt", enemyInstanceId: leaderOf(state), instanceId: falcon.id, outsideActivation: true },
    ]);
    expect(boostsOn(state)).toEqual([falcon.id]);
    expect(inst(state, falcon.id)).toMatchObject({ faceup: false, damage: 0, engagedWith: null });
    expect(piles(state).discard).not.toContain(falcon.id);
    expect(state.players.flatMap((p) => [...p.playArea, ...p.discard])).not.toContain(falcon.id);
    expect(flippedBoosts(events)).toEqual([]);
  });

  it("his next attack turns Falcon up first (0 boost icons, 'You are confused'), then the card it is dealt", () => {
    const falcon = engaged(capGame(), FALCON);
    const given = defeat(falcon.state, falcon.id).state;
    // The villain phase: Captain America's boost card, then the card player 1 is dealt.
    const stacked = stackEncounterDeck(given, ADVANCE, NEW_AVENGERS);
    const { state, events } = driveEventsPicking(deps, stacked, firstLegal, endTurn());
    const flips = flippedBoosts(events);
    expect(flips.map((f) => [codeOf(state, f.instanceId), f.boostIcons])).toEqual([
      [FALCON, 0],
      [ADVANCE, 0],
    ]);
    expect(flips[0]!.instanceId).toBe(falcon.id);
    const hero = identityOf(state, P1);
    expect(types(events, "statusGiven").filter((e) => e.instanceId === hero)).toEqual([
      { type: "statusGiven", instanceId: hero, status: "confused" },
    ]);
    expect(inst(state, hero).statuses.confused).toBe(1);
    // Applied to the activation, he is discarded to the encounter discard pile, faceup.
    expect(boostsOn(state)).toEqual([]);
    expect(piles(state).discard).toContain(falcon.id);
    expect(inst(state, falcon.id).faceup).toBe(true);
  });

  it("defeated while Captain America is stunned: Falcon stays facedown through the attack that does not happen", () => {
    const start = capGame();
    const stunned = patchInstance(start, leaderOf(start), { statuses: { stunned: 1, confused: 0, tough: 0 } });
    const falcon = engaged(stunned, FALCON);
    const given = defeat(falcon.state, falcon.id).state;
    // A stunned leader is dealt no boost card, so the top card is the one player 1 is dealt.
    const first = driveEventsPicking(deps, stackEncounterDeck(given, NEW_AVENGERS), firstLegal, endTurn());
    expect(flippedBoosts(first.events)).toEqual([]);
    expect(inst(first.state, leaderOf(first.state)).statuses.stunned).toBe(0);
    expect(boostsOn(first.state)).toEqual([falcon.id]);
    expect(inst(first.state, falcon.id).faceup).toBe(false);
    expect(inst(first.state, identityOf(first.state, P1)).statuses.confused).toBe(0);
    // The next villain phase is his next activation.
    const second = driveEventsPicking(deps, first.state, firstLegal, endTurn());
    const flips = flippedBoosts(second.events);
    expect([flips[0]!.instanceId, flips[0]!.boostIcons]).toEqual([falcon.id, 0]);
    expect(boostsOn(second.state)).not.toContain(falcon.id);
  });

  it("two Teamwork minions defeated: Captain America holds both, in the order they were given", () => {
    const falcon = engaged(capGame(), FALCON);
    const hercules = engaged(falcon.state, HERCULES);
    const first = defeat(hercules.state, falcon.id).state;
    const { state, events } = defeat(first, hercules.id);
    expect(types(events, "boostCardDealt").map((e) => e.instanceId)).toEqual([hercules.id]);
    expect(boostsOn(state)).toEqual([falcon.id, hercules.id]);
    expect([falcon.id, hercules.id].map((id) => inst(state, id).faceup)).toEqual([false, false]);
    expect(piles(state).discard.filter((id) => id === falcon.id || id === hercules.id)).toEqual([]);
  });

  it("Dangerous Recruits in play and Bullseye defeated: Iron Man holds him; without it he is discarded", () => {
    const start = civilWarHeroGame(IRON_MAN_SCENARIO, { deps });
    const recruits = encounterCardInVillainArea(start, RECRUITS, 3);
    const held = engaged(recruits.state, BULLSEYE);
    const withIt = defeat(held.state, held.id).state;
    expect(boostsOn(withIt)).toEqual([held.id]);
    expect(inst(withIt, held.id).faceup).toBe(false);
    expect(piles(withIt).discard).not.toContain(held.id);

    const alone = engaged(start, BULLSEYE);
    const without = defeat(alone.state, alone.id).state;
    expect(boostsOn(without)).toEqual([]);
    expect(piles(without).discard).toContain(alone.id);
  });
});
