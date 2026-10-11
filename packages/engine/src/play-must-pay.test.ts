/**
 * `EffectSpec playFromHand.mustPay`: "play that card (paying its cost)" with no "may" (Trance of Greed 55008b, Alluring
 * Call 55012; owner decisions 62B and 63B, 2026-10-11, docs/phase7-wave9.md section 4.1). The payment is a `required`
 * `spendResources`: it cannot be declined or under-paid, and the first `minSelections` options are a legal answer. The
 * cards offered are the same as without the flag (legal and payable only). Without the flag the payment can still be
 * declined (every other card that plays from the hand).
 */
import { describe, expect, it } from "vitest";
import type { AbilityDefinition } from "./abilities.js";
import { applyCommand, startSession } from "./engine.js";
import type { InstanceId } from "./ids.js";
import { mustPlayer } from "./query.js";
import type { EffectSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility, type StubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubAlly } from "./testing/fixtures.js";
import { defaultPick, giveCard, RESOURCE } from "./testing/scenario.js";
import { gameAtFirstTurn, P1 } from "./testing/wave3.js";

const you = { kind: "controller" } as const;
const interrupt = (id: string, play: EffectSpec) =>
  stubAbility(id, {
    trigger: { kind: "interrupt", forced: false, on: { on: "turnEnding", playerIs: "controller" } },
    activeIn: "hand",
    effects: [play],
  } satisfies AbilityDefinition);
const paidPlay = {
  kind: "playFromHand",
  player: you,
  costReduction: { kind: "const", value: 0 },
  card: { kind: "self" },
};
const MUST = interrupt("must.interrupt", { ...paidPlay, mustPay: true } as EffectSpec);
const MAY = interrupt("may.interrupt", paidPlay as EffectSpec);
const ally = (id: string, ability: StubAbility) =>
  stubAlly({ id, cost: 2, atk: 1, thw: 1, hp: 2, abilities: [ability.ref] });
const CARDS = { must: ally("must", MUST), may: ally("may", MAY) };
const deps = depsOf(MUST, MAY);
const start = (): GameState =>
  gameAtFirstTurn({ cards: Object.values(CARDS), deps, deck: Object.values(CARDS).map((card) => card.id) });

function holding(card: keyof typeof CARDS, resources: number): { state: GameState; id: InstanceId } {
  const given = giveCard(start(), P1, CARDS[card].id);
  const seat = mustPlayer(given.state, P1);
  const isResource = (id: InstanceId): boolean => given.state.instances[id]?.cardId === RESOURCE.id;
  const pool = [...seat.hand, ...seat.deck].filter(isResource).slice(0, resources);
  const hand = [given.id, ...pool];
  const rest = [...seat.hand, ...seat.deck].filter((id) => !hand.includes(id));
  return {
    id: given.id,
    state: {
      ...given.state,
      players: given.state.players.map((p) => (p.playerId === P1 ? { ...p, hand, deck: rest } : p)),
    },
  };
}

/** Ends the turn taking every trigger; at the payment, records whether an empty and a one-card (short) answer were accepted. */
function endTurn(state: GameState) {
  const seen: { required: boolean; min: number; declinedAccepted: boolean; underAccepted: boolean }[] = [];
  const pick = (current: GameState): readonly string[] => {
    const choice = current.pendingChoice;
    if (!choice) return [];
    const ids = choice.options.map((o) => o.optionId);
    if (choice.prompt.kind === "chooseTriggers") return ids;
    if (choice.prompt.kind === "chooseCards") return ids;
    if (choice.prompt.kind === "spendResources") {
      const tryAnswer = (selectedOptionIds: readonly string[]) =>
        applyCommand(
          current,
          { type: "resolveChoice", playerId: choice.playerId, choiceId: choice.choiceId, selectedOptionIds },
          deps,
        ).ok;
      seen.push({
        required: choice.prompt.required === true,
        min: choice.minSelections,
        declinedAccepted: tryAnswer([]),
        underAccepted: tryAnswer(ids.slice(0, 1)),
      });
      return ids;
    }
    return defaultPick(current);
  };
  const driven = driveSession(startSession(state), deps, [{ type: "endTurn", playerId: P1 }], pick);
  return { state: driven.session.state, seen };
}
const inPlay = (state: GameState, id: InstanceId): boolean => mustPlayer(state, P1).playArea.includes(id);

describe("playFromHand.mustPay", () => {
  it("the payment is required: declining is refused, and the card is played when paid", () => {
    const { state, id } = holding("must", 2);
    const run = endTurn(state);
    expect(run.seen).toHaveLength(1);
    expect(run.seen[0]).toMatchObject({ required: true, min: 2, declinedAccepted: false, underAccepted: false });
    expect(inPlay(run.state, id)).toBe(true);
  });

  it("without the flag the payment can still be declined", () => {
    const { state } = holding("may", 2);
    const run = endTurn(state);
    expect(run.seen[0]).toMatchObject({ required: false, declinedAccepted: true });
  });

  it("a card the hand cannot pay for is not offered, as without the flag", () => {
    const { state, id } = holding("must", 1);
    const run = endTurn(state);
    expect(run.seen).toHaveLength(0);
    expect(inPlay(run.state, id)).toBe(false);
    expect(mustPlayer(run.state, P1).hand).toContain(id);
  });
});
