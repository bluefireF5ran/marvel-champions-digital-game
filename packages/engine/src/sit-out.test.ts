/**
 * `EffectSpec sitOutScenario` and the count of players who started the scenario (`GameState.startingPlayerCount`).
 *
 * RRG 1.8 "Per Player Icon" (p. 32): "The icon next to a value multiplies that value by the number of players who
 * started the scenario. If a player is eliminated, this value does not change." A campaign can let a player defeated
 * in the last scenario decline to rejoin (MC45 p. 20, MC50 p. 6); that the player then is not one of the players who
 * started is an owner decision (66B, 2026-10-11, docs/phase7-wave9.md §4.1), not a printed rule or an FFG ruling.
 *
 * Synthetic cards and a synthetic campaign only: which box asks the question is content.
 */

import { describe, expect, it } from "vitest";
import { cardId, type AnyCard } from "@mc/content";
import { DEFAULT_DEPS } from "./abilities.js";
import type { CampaignGameInput } from "./campaign.js";
import { createCtx } from "./ctx.js";
import type { GameEvent } from "./events.js";
import { playerId } from "./ids.js";
import { mainSchemeValue, maxHitPoints, scaleIn } from "./query.js";
import { eliminatePlayer, sitOutScenario } from "./resolve/defeat.js";
import { playerSideSchemeLimit } from "./rules.js";
import { resolveValue } from "./select.js";
import { createGame } from "./setup.js";
import type { EffectSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { syntheticCampaignInput, syntheticInstruction } from "./testing/campaign.js";
import { runCommands } from "./testing/drive.js";
import { stubMainScheme, stubObligation, stubUpgrade, stubVillain } from "./testing/fixtures.js";
import { DEFAULT_CARDS, DEFAULT_DECK, HERO, seatIdentities } from "./testing/scenario.js";

const P1 = playerId("p1");
const P2 = playerId("p2");
const P3 = playerId("p3");

const perPlayer = (n: number) => ({ base: 0, perPlayer: n });

/** Every value of this scenario is printed with the per player icon. */
const VILLAIN = stubVillain({ id: "so-villain", stages: [{ hp: perPlayer(10), atk: 2, sch: 1 }] });
const SCHEME = stubMainScheme({
  id: "so-scheme",
  stages: [{ startingThreat: perPlayer(2), targetThreat: perPlayer(7), acceleration: perPlayer(1) }],
});
/** A player card with the setup keyword (RRG Appendix II step 11): in the deck of every seat. */
const KEEPSAKE = stubUpgrade({ id: "so-keepsake", cost: 0, keywords: [{ name: "setup" }] });

const sitOut = (id: typeof P1): EffectSpec => ({ kind: "sitOutScenario", player: { kind: "id", playerId: id } });

function play(
  players: number,
  instructions: CampaignGameInput["instructions"],
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  // Each identity has its own obligation, as every printed identity does (the fixture's clones share the first one's).
  const identities = seatIdentities(HERO, players).map((identity) => ({
    ...identity,
    obligationCardId: cardId(`${identity.id}-obligation`),
  }));
  const obligations: readonly AnyCard[] = identities.map((identity) =>
    stubObligation({ id: `${identity.id}-obligation` }),
  );
  const created = createGame(
    {
      seed: 99,
      cards: [...DEFAULT_CARDS, VILLAIN, SCHEME, KEEPSAKE, ...identities, ...obligations],
      villainCardId: VILLAIN.id,
      mainSchemeCardId: SCHEME.id,
      encounterDeck: [],
      players: identities.map((identity) => ({ identityCardId: identity.id, deck: [...DEFAULT_DECK, KEEPSAKE.id] })),
      campaign: syntheticCampaignInput({
        instructions,
        seats: identities.map((identity, index) => ({
          seatNumber: index + 1,
          identityCardId: identity.id,
          deck: [],
          aspects: [],
          grantedCardIds: [],
        })),
      }),
    },
    DEFAULT_DEPS,
  );
  if (!created.ok) throw new Error(`setup failed: ${created.error.message}`);
  const driven = runCommands(created.state, DEFAULT_DEPS);
  return { state: driven.state, events: [...created.events, ...driven.events] };
}

const threat = (state: GameState): number => state.instances[state.mainScheme.instanceId]!.threat;
const obligationsInDeck = (state: GameState): readonly string[] =>
  Object.values(state.encounterDecks)
    .flatMap((piles) => piles.deck)
    .map((id) => state.instances[id]!.cardId as string)
    .filter((id) => id.endsWith("-obligation"))
    .sort();
/** What each reader of the count returns: the scaled values, a `perPlayer` value spec, and the side scheme limit. */
const numbers = (state: GameState) => ({
  count: state.startingPlayerCount,
  villainHp: maxHitPoints(state, state.activeVillainId, DEFAULT_DEPS),
  target: mainSchemeValue(state, "targetThreat", DEFAULT_DEPS),
  acceleration: mainSchemeValue(state, "acceleration", DEFAULT_DEPS),
  scaled: scaleIn(state, perPlayer(3)),
  value: resolveValue(
    state,
    { kind: "perPlayer", base: 1, perPlayer: 2 },
    { selfInstanceId: null, controllerId: P1, event: null, bindings: {}, deps: DEFAULT_DEPS },
    DEFAULT_DEPS,
  ),
  sideSchemeLimit: playerSideSchemeLimit(state),
});

describe("a seat that sits the scenario out before it is set up (owner decision 66B)", () => {
  const { state, events } = play(2, [syntheticInstruction("so.sit-out", "beforeScenarioSetup", [sitOut(P2)])]);

  it("is eliminated and marked as sitting out, and the count of players who started drops to the players playing", () => {
    expect(state.players.map((player) => [player.eliminated, player.sittingOut === true])).toEqual([
      [false, false],
      [true, true],
    ]);
    expect(state.startingPlayerCount).toBe(1);
    const order = events.flatMap((event) =>
      event.type === "playerEliminated" || event.type === "playerSatOut" ? [event] : [],
    );
    expect(order).toEqual([
      { type: "playerEliminated", playerId: P2 },
      { type: "playerSatOut", playerId: P2, startingPlayerCount: 1 },
    ]);
  });

  it("sets the scenario up for one player: every per player value is one player's", () => {
    // Starting threat is placed during Appendix II step 9, after the seat left: 2 per player is 2.
    expect(threat(state)).toBe(2);
    expect(numbers(state)).toEqual({
      count: 1,
      villainHp: 10,
      target: 7,
      acceleration: 1,
      scaled: 3,
      value: 3,
      sideSchemeLimit: 1,
    });
  });

  it("gives the seat nothing: no hand, no setup card in play, no turn, and its obligation is not in the encounter deck", () => {
    const out = state.players[1]!;
    expect([out.hand, out.deck, out.playArea, out.dealtEncounter]).toEqual([[], [], [], []]);
    expect(events.some((event) => event.type === "cardDrawn" && event.playerId === P2)).toBe(false);
    // Seat 1's setup card entered play; the sitting-out seat's went with its deck.
    const keepsakesInPlay = Object.values(state.instances).filter(
      (instance) => instance.cardId === KEEPSAKE.id && instance.controllerId !== null && instance.faceup,
    );
    expect(keepsakesInPlay.map((instance) => instance.controllerId)).toEqual([P1]);
    expect(obligationsInDeck(state)).toEqual(["hero-obligation"]);
    expect(state.step).toMatchObject({ phase: "player", kind: "turn", activePlayerId: P1 });
    expect(state.outcome).toBeNull();
  });

  it("passes the first player token when the first player sits out", () => {
    const first = play(3, [syntheticInstruction("so.sit-out", "beforeScenarioSetup", [sitOut(P1)])]);
    expect(first.state.firstPlayerId).toBe(P2);
    expect(first.state.startingPlayerCount).toBe(2);
    expect(threat(first.state)).toBe(4);
    expect(first.state.step).toMatchObject({ phase: "player", kind: "turn", activePlayerId: P2 });
  });

  it("counts each seat that sits out once", () => {
    const two = play(3, [
      syntheticInstruction("so.sit-out", "beforeScenarioSetup", [sitOut(P2), sitOut(P3), sitOut(P3)]),
    ]);
    expect(two.state.startingPlayerCount).toBe(1);
    expect(two.state.players.map((player) => player.sittingOut === true)).toEqual([false, true, true]);
  });

  it("loses the game when every seat sits out, and the count never reads 0", () => {
    const none = play(2, [syntheticInstruction("so.sit-out", "beforeScenarioSetup", [sitOut(P1), sitOut(P2)])]);
    expect(none.state.outcome).toEqual({ result: "loss", reason: "allPlayersDefeated" });
    expect(none.state.startingPlayerCount).toBe(1);
  });
});

describe("a seat that sits out later in setup", () => {
  it("still leaves the count, so values read live follow; what setup already placed is not placed again", () => {
    const { state } = play(2, [syntheticInstruction("so.late", "afterMulligans", [sitOut(P2)])]);
    expect(state.startingPlayerCount).toBe(1);
    expect(numbers(state)).toMatchObject({ villainHp: 10, target: 7, acceleration: 1 });
    // Placed at step 9 for two players, before the seat left.
    expect(threat(state)).toBe(4);
  });
});

describe("a player eliminated during the scenario started it (RRG 1.8 'Per Player Icon', p. 32)", () => {
  const started = (): GameState => play(2, []).state;
  const twoPlayers = { count: 2, villainHp: 20, target: 14, acceleration: 2, scaled: 6, value: 5, sideSchemeLimit: 1 };

  it("two seats that both play: two players' numbers", () => {
    const state = started();
    expect(threat(state)).toBe(4);
    expect(numbers(state)).toEqual(twoPlayers);
    expect(obligationsInDeck(state)).toEqual(["hero-obligation", "hero-p2-obligation"]);
  });

  it("an elimination in the player phase changes no per player value", () => {
    const ctx = createCtx(started(), DEFAULT_DEPS);
    eliminatePlayer(ctx, P2);
    expect(ctx.state.players[1]!.eliminated).toBe(true);
    expect(ctx.state.players[1]!.sittingOut).toBeUndefined();
    expect(numbers(ctx.state)).toEqual(twoPlayers);
  });

  it("the sit-out effect resolved after setup is a plain elimination: the player did start", () => {
    const ctx = createCtx(started(), DEFAULT_DEPS);
    sitOutScenario(ctx, P2);
    expect(ctx.state.players[1]!.eliminated).toBe(true);
    expect(ctx.state.players[1]!.sittingOut).toBeUndefined();
    expect(ctx.events.some((event) => event.type === "playerSatOut")).toBe(false);
    expect(numbers(ctx.state)).toEqual(twoPlayers);
  });

  it("an identity defeated during setup by an ordinary defeat also started: only the sit-out effect lowers the count", () => {
    const { state } = play(2, [
      syntheticInstruction("so.defeat", "afterScenarioSetup", [
        { kind: "defeat", target: { kind: "identityOf", player: { kind: "id", playerId: P2 } } },
      ]),
    ]);
    expect(state.players[1]!.eliminated).toBe(true);
    expect(state.players[1]!.sittingOut).toBeUndefined();
    expect(state.startingPlayerCount).toBe(2);
  });
});
