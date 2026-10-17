/**
 * `EffectSpec sentence`: the responses to what one printed sentence causes wait until all of it has resolved
 * (`resolve/sentence-hold.ts`). FFG ruling December 8, 2023 - Ruling 126 (Gamma Blast: "You must resolve the first
 * sentence of Gamma Blast in full before resolving the Response on Gamma form") and January 11, 2024 - Ruling 137 ("a
 * sentence in an ability must fully resolve before responses to that sentence can occur"); RRG 1.8 p. 4 and "'And'"
 * (p. 7). A flat list keeps its window between effects (the Mutant Protectors ruling, post-RRG 1.5).
 *
 * Synthetic cards: an event placing 1, then 2, then 3 threat on the main scheme, and a support with "Forced Response:
 * After threat is placed on the main scheme, put a tally on your identity". The log's order tells where each window
 * opened.
 */
import { describe, expect, it } from "vitest";
import type { AbilityDefinition } from "./abilities.js";
import { startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import { mustPlayer } from "./query.js";
import type { EffectSpec } from "./spec.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubEvent, stubSupport } from "./testing/fixtures.js";
import { giveCard } from "./testing/scenario.js";
import { gameAtFirstTurn, P1, playerCardIntoPlay } from "./testing/wave3.js";

const place = (value: number): EffectSpec => ({
  kind: "placeThreat",
  target: { kind: "mainScheme" },
  amount: { kind: "const", value },
});

const TALLY = stubAbility("tally.forced-response", {
  trigger: { kind: "response", forced: true, on: { on: "placeThreat", targetIs: { categories: ["mainScheme"] } } },
  effects: [
    {
      kind: "addCounters",
      target: { kind: "identityOf", player: { kind: "controller" } },
      counterType: "tally",
      amount: { kind: "const", value: 1 },
    },
  ],
} satisfies AbilityDefinition);
const TALLIER = stubSupport({ id: "tallier", cost: 0, abilities: [TALLY.ref] });

const actionEvent = (id: string, effects: readonly EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
/** "Place 1 threat on the main scheme and place 2 threat on the main scheme. Place 3 threat on the main scheme." */
const SENTENCE = actionEvent("one-sentence", [{ kind: "sentence", effects: [place(1), place(2)] }, place(3)]);
/** The same written flat: three sentences. */
const FLAT = actionEvent("flat", [place(1), place(2), place(3)]);

const deps = depsOf(TALLY, SENTENCE.ability, FLAT.ability);

/** Plays `card` with the tallier in play; the order of placements (`p<amount>`) and tallies (`t`) in the log. */
function order(card: { readonly id: string }): readonly string[] {
  let state = gameAtFirstTurn({
    cards: [TALLIER, SENTENCE.card, FLAT.card],
    deps,
    deck: [TALLIER.id, SENTENCE.card.id, FLAT.card.id],
  });
  state = playerCardIntoPlay(state, TALLIER.id as never).state;
  const given = giveCard(state, P1, card.id as never);
  const { events } = driveSession(startSession(given.state), deps, [
    { type: "playCard", playerId: P1, cardInstanceId: given.id, payment: [], attachToInstanceId: null },
  ]);
  const identity = mustPlayer(given.state, P1).identity.instanceId;
  return events.flatMap((event: GameEvent) => {
    if (event.type === "threatPlaced" && event.schemeInstanceId === given.state.mainScheme.instanceId)
      return [`p${event.amount}`];
    if (event.type === "counterAdded" && event.instanceId === identity) return ["t"];
    return [];
  });
}

describe("a sentence holds its responses until it has resolved in full", () => {
  it("flat list: each placement's forced response resolves before the next placement", () => {
    expect(order(FLAT.card)).toEqual(["p1", "t", "p2", "t", "p3", "t"]);
  });

  it("one sentence: the first placement's response waits for the second; both resolve before the next sentence", () => {
    // The last effect's own window is not held (it opens as it resolves), then the held one opens.
    expect(order(SENTENCE.card)).toEqual(["p1", "p2", "t", "t", "p3", "t"]);
  });
});
