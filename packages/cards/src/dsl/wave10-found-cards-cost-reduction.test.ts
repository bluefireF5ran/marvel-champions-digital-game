/**
 * docs/phase7-wave10-hero-packs.md H3.11 (engine task HT9): `reduceCostOfCards(ref, n, duration)`, a cost reduction
 * bound to the cards a search found, with the real Evaluate Threat 59028 in a real Hercules game against Core's Rhino.
 * The script is this test's own; the pack's basic module (`../wave10/hercules/basic.ts`) is scripted elsewhere. The
 * engine's `cost-reduction-bound-to-cards.test.ts` drives the plain data.
 *
 * Evaluate Threat: "Victory 0. Play only if your identity has the Avenger or S.H.I.E.L.D. trait. When Defeated: Each
 * player may search their deck and discard pile for an Avenger or S.H.I.E.L.D. card and add it to their hand.
 * (Shuffle.) Reduce the cost to play each of those cards by 2 until the end of the phase." Found here: Thor 59020
 * (Avenger, cost 4).
 *
 * Rulings June 2, 2026 – Ruling 2 (4): "Evaluate Threat reduces the cost for the next time it is played that phase,
 * even if bounced"; July 9, 2026 – Ruling 3 (3): "Evaluate Threat reduces cost for the **next time** it is played, not
 * repeatedly."
 */

import { trait } from "@mc/content";
import {
  applyCommand,
  createGame,
  playCostOf,
  type AbilityDefinition,
  type Command,
  type EngineDeps,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import {
  cards,
  chooseCards,
  chosen,
  eachPlayer,
  forEachPlayer,
  moveCards,
  reduceCostOfCards,
  shuffleDeck,
  thatPlayer,
  validateDefinition,
  whenDefeated,
  zone,
} from "./index.js";
import { coreScenario } from "../core/setup.js";
import {
  P1,
  P2,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  instancesOf,
  patchInstance,
  play,
  playerOf,
  settle,
  type Picker,
} from "../testing/harness.js";
import { withForm } from "../testing/staging.js";
import {
  CORE_SPIDER_MAN,
  HERCULES_DECK,
  HERO_PACK_CARDS,
  herculesHeroGame,
  heroPackConfig,
} from "../wave10/testing.js";
import { depsWith, drive } from "./wave10-labor.testing.js";

vi.setConfig({ testTimeout: 120_000 });

const EVALUATE_THREAT = "59028";
const WHEN_DEFEATED = "59028.when-defeated";
const THOR = "59020";
const AVENGER_OR_SHIELD = { anyOf: [{ trait: trait("AVENGER") }, { trait: trait("S.H.I.E.L.D.") }] };

const SCRIPTS: Readonly<Record<string, AbilityDefinition>> = {
  [WHEN_DEFEATED]: whenDefeated(
    forEachPlayer(
      eachPlayer,
      chooseCards("found", zone(["deck", "discard"], thatPlayer, { filter: AVENGER_OR_SHIELD }), {
        min: 0,
        max: 1,
        chooser: thatPlayer,
      }),
      moveCards(cards(chosen("found")), "hand"),
      shuffleDeck(thatPlayer),
      reduceCostOfCards(chosen("found"), 2, "phase"),
    ),
  ),
};
const DEPS: EngineDeps = depsWith(SCRIPTS);

const reductions = (state: GameState) => state.lastingEffects.filter((e) => e.kind === "costReduction");
const priceOf = (state: GameState, id: InstanceId, player: PlayerId = P1) => playCostOf(state, player, id, DEPS);

/** Evaluate Threat in play with 1 threat, as a player side scheme Hercules controls (surgery). */
function withEvaluateThreat(state: GameState): { state: GameState; scheme: InstanceId } {
  const scheme = instancesOf(state, EVALUATE_THREAT)[0]!;
  const out: GameState = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      hand: p.hand.filter((id) => id !== scheme),
      deck: p.deck.filter((id) => id !== scheme),
      discard: p.discard.filter((id) => id !== scheme),
    })),
    villainArea: [...state.villainArea, scheme],
  };
  return { scheme, state: patchInstance(out, scheme, { faceup: true, threat: 1, controllerId: P1 }) };
}
/** Thor is in Hercules's deck (not his hand), so the search can find him. */
function thorInDeck(state: GameState): { state: GameState; thor: InstanceId } {
  const thor = instancesOf(state, THOR)[0]!;
  return {
    thor,
    state: {
      ...state,
      players: state.players.map((p) =>
        p.playerId === P1
          ? { ...p, hand: p.hand.filter((id) => id !== thor), deck: [thor, ...p.deck.filter((id) => id !== thor)] }
          : p,
      ),
    },
  };
}
/** The search takes `mine` for Hercules and the first card offered for anyone else; everything else by default. */
const finding =
  (mine: InstanceId): Picker =>
  (state) => {
    const choice = state.pendingChoice;
    if (choice?.prompt.kind !== "chooseCards") return firstLegal(state);
    if (choice.playerId === P1) return choice.options.some((o) => o.optionId === mine) ? [mine] : [];
    return choice.options.slice(0, 1).map((o) => o.optionId);
  };
/** Hercules thwarts Evaluate Threat's last threat away, and the When Defeated search resolves. */
function defeated(base: GameState) {
  const { state: staged, thor } = thorInDeck(base);
  const { state, scheme } = withEvaluateThreat(staged);
  const thwart: Command = {
    type: "basicThwart",
    playerId: P1,
    thwarterInstanceId: identityOf(state),
    schemeInstanceId: scheme,
  };
  return { ...drive(state, thwart, finding(thor), DEPS), thor, scheme };
}
/** Plays `id` from `player`'s hand paying with `n` other cards from it; the refusal code when it is refused. */
function playPaying(state: GameState, id: InstanceId, n: number, player: PlayerId = P1) {
  const payers = playerOf(state, player)
    .hand.filter((card) => card !== id)
    .slice(0, n);
  if (payers.length < n) throw new Error(`${player} has fewer than ${n} other cards in hand`);
  const result = applyCommand(state, play(player, id, payers), DEPS);
  if (!result.ok) return { ok: false as const, code: result.error.code };
  return { ok: true as const, state: settle(result.state, firstLegal, undefined, DEPS), events: result.events };
}
/** Surgery: the card goes from wherever its owner has it to that zone of theirs. */
function moveTo(state: GameState, id: InstanceId, to: "hand" | "discard"): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      const without = {
        ...p,
        hand: p.hand.filter((i) => i !== id),
        discard: p.discard.filter((i) => i !== id),
        playArea: p.playArea.filter((i) => i !== id),
      };
      return inst(state, id).ownerId === p.playerId ? { ...without, [to]: [...without[to], id] } : without;
    }),
  };
}

/** Hercules (first player) and Core's Spider-Man against Rhino, at Hercules's first turn, both in hero form. */
function twoPlayerGame(): GameState {
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
  return withForm(withForm(opened, { heroForm: 0 }, P1), { heroForm: 0 }, P2);
}

describe("H3.11 the script", () => {
  it("is a valid definition: the reduction names the cards the search bound", () => {
    expect(validateDefinition(SCRIPTS[WHEN_DEFEATED]!)).toEqual([]);
    expect(reduceCostOfCards(chosen("found"), 2, "phase")).toEqual({
      kind: "reduceNextCardCost",
      player: { kind: "controller" },
      amount: { kind: "const", value: 2 },
      duration: "phase",
      cards: { kind: "slot", slot: "found" },
    });
  });

  it("the validator refuses a filter, a destination or 'until played' on a reduction bound to cards", () => {
    const bound = reduceCostOfCards(chosen("found"), 2, "phase");
    const bad = (extra: object): AbilityDefinition =>
      whenDefeated(chooseCards("found", zone("deck"), { min: 0, max: 1 }), { ...bound, ...extra } as typeof bound);
    expect(validateDefinition(bad({ duration: "untilPlayed" }))).toEqual([
      "reduceNextCardCost cards: a reduction bound to cards ends at a phase, turn or round",
    ]);
    expect(validateDefinition(bad({ cardFilter: { categories: ["ally"] } }))).toEqual([
      "reduceNextCardCost cards: the ref names the cards, so cardFilter, into and anyPlayer are not read",
    ]);
  });
});

describe("H3.11 Evaluate Threat 59028: the cards found cost 2 less, once each, until the end of the phase", () => {
  it("Thor is added to Hercules's hand and costs 2; his reduction names him and ends with the phase", () => {
    const run = defeated(herculesHeroGame({ deps: DEPS }));
    expect(run.state.villainArea).not.toContain(run.scheme);
    expect(playerOf(run.state, P1).hand).toContain(run.thor);
    expect(reductions(run.state)).toMatchObject([
      { playerId: P1, amount: 2, cardInstanceId: run.thor, duration: { kind: "endOfPhase" } },
    ]);
    expect(priceOf(run.state, run.thor)).toMatchObject({ printed: 4, current: 2, reduction: 2 });
    expect(playPaying(run.state, run.thor, 1)).toEqual({ ok: false, code: "insufficient_resources" });
    const played = playPaying(run.state, run.thor, 2);
    if (!played.ok) throw new Error(played.code);
    expect(playerOf(played.state, P1).playArea).toContain(run.thor);
    expect(reductions(played.state)).toEqual([]);
  });

  it("no other card is reduced: every other card with a cost in his hand is priced without it", () => {
    const run = defeated(herculesHeroGame({ deps: DEPS }));
    for (const id of playerOf(run.state, P1).hand) {
      if (id === run.thor) continue;
      const cost = priceOf(run.state, id);
      if (cost) expect(cost.reduction, inst(run.state, id).cardId).toBe(0);
    }
  });

  it("discarded and returned to hand the same phase, then played: still 2 (June 2, 2026 – Ruling 2 (4))", () => {
    const run = defeated(herculesHeroGame({ deps: DEPS }));
    const back = moveTo(moveTo(run.state, run.thor, "discard"), run.thor, "hand");
    expect(priceOf(back, run.thor)).toMatchObject({ printed: 4, current: 2, reduction: 2 });
    expect(playPaying(back, run.thor, 2).ok).toBe(true);
  });

  it("played, returned to hand and played again the same phase: 2, then 4 (July 9, 2026 – Ruling 3 (3))", () => {
    const run = defeated(herculesHeroGame({ deps: DEPS }));
    const first = playPaying(run.state, run.thor, 2);
    if (!first.ok) throw new Error(first.code);
    const bounced = moveTo(first.state, run.thor, "hand");
    expect(priceOf(bounced, run.thor)).toMatchObject({ printed: 4, current: 4, reduction: 0 });
    expect(playPaying(bounced, run.thor, 2)).toEqual({ ok: false, code: "insufficient_resources" });
  });

  it("not played that phase: next round Thor costs 4", () => {
    const run = defeated(herculesHeroGame({ deps: DEPS }));
    const ending = applyCommand(run.state, endTurn(P1), DEPS);
    if (!ending.ok) throw new Error(ending.error.message);
    const next = settle(ending.state, firstLegal, undefined, DEPS);
    expect(next.round).toBe(2);
    expect(reductions(next)).toEqual([]);
    expect(priceOf(moveTo(next, run.thor, "hand"), run.thor)).toMatchObject({ printed: 4, current: 4, reduction: 0 });
  });

  it("a player who takes no card gets no reduction", () => {
    const { state: staged } = thorInDeck(herculesHeroGame({ deps: DEPS }));
    const { state, scheme } = withEvaluateThreat(staged);
    const thwart: Command = {
      type: "basicThwart",
      playerId: P1,
      thwarterInstanceId: identityOf(state),
      schemeInstanceId: scheme,
    };
    const declined = drive(state, thwart, firstLegal, DEPS);
    expect(declined.state.villainArea).not.toContain(scheme);
    expect(reductions(declined.state)).toEqual([]);
  });

  it("two players each find a card: each card is reduced for the player who plays it", () => {
    const run = defeated(twoPlayerGame());
    const bound = reductions(run.state);
    expect(bound).toHaveLength(2);
    expect(bound[0]).toMatchObject({ amount: 2, cardInstanceId: run.thor });
    const theirs = bound[1]!.cardInstanceId!;
    expect(playerOf(run.state, P2).hand).toContain(theirs);
    expect(priceOf(run.state, run.thor)).toMatchObject({ printed: 4, current: 2 });
    const before = priceOf({ ...run.state, lastingEffects: [] }, theirs, P2)!;
    expect(priceOf(run.state, theirs, P2)).toMatchObject({
      printed: before.printed,
      current: Math.max(0, before.current - 2),
    });
    // Hercules plays Thor for 2: only Thor's reduction is used.
    const first = playPaying(run.state, run.thor, 2);
    if (!first.ok) throw new Error(first.code);
    expect(reductions(first.state).map((e) => e.cardInstanceId)).toEqual([theirs]);
  });
});
