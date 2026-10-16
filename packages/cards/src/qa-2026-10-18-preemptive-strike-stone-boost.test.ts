/**
 * FFG ruling #8, Sept 5, 2024 (post-RRG 1.6): "Because 'I Am Inevitable' treats the Infinity Stone card 'as if it were
 * a boost card,' you are able to use abilities that affect boost cards on it, including Preemptive Strike." The stone
 * is applied as a boost card turned faceup (RRG 1.8 "Boost", p. 11), so it opens the "when a boost card is turned face
 * up" window and its icons can be cancelled there.
 */
import { activeVillain, type GameEvent, type GameState, type InstanceId } from "@mc/engine";
import { MSM_STARTER_DECKS } from "@mc/content";
import { describe, expect, it } from "vitest";
import { applyOk, endTurn, firstLegal, moveToHand, P1, stackEncounterDeck, toHero } from "./testing/harness.js";
import { WAVE4_DEPS } from "./wave4/index.js";
import { runWave4, startWave4Game } from "./wave4/testing.js";
import { wave4Scenario } from "./wave4/setup.js";

const msm = MSM_STARTER_DECKS.find((d) => d.id === "msm-protection")!;

function thanosAttackWithStone(stoneCode: string, useStrike = true) {
  const start = startWave4Game(
    wave4Scenario("thanos", {
      seed: 3,
      players: [
        {
          identityCardId: msm.identityCardId,
          aspects: msm.aspects,
          deck: msm.cards.flatMap(({ cardId, quantity }) => Array.from({ length: quantity }, () => cardId)),
        },
      ],
    }),
  );
  const given = moveToHand(start, P1, "05014", "05005"); // Preemptive Strike, Wiggle Room (to pay)
  const [strike, payment] = given.ids as [InstanceId, InstanceId];
  const hero = runWave4(given.state, toHero());
  const villain = activeVillain(hero).instanceId;
  // "I Am Inevitable" as Thanos's boost card, the chosen stone on top of the Infinity Stone deck.
  const staged = stackEncounterDeck(hero, "21122");
  const stones = staged.scenarioDecks["Infinity Stone"]!;
  const stone = stones.deck.find((id) => staged.instances[id]?.cardId === stoneCode)!;
  const primed: GameState = {
    ...staged,
    scenarioDecks: {
      ...staged.scenarioDecks,
      "Infinity Stone": { ...stones, deck: [stone, ...stones.deck.filter((id) => id !== stone)] },
    },
  };
  const option = `${strike}:05014.preemptive-strike-interrupt`;
  let offered = false;
  const pick = (s: GameState): readonly string[] => {
    const choice = s.pendingChoice!;
    if (choice.options.some((o) => o.optionId === option)) {
      offered = true;
      if (useStrike) return [option];
    }
    if (choice.prompt.kind === "payForCard" && choice.prompt.instanceId === strike) return [`hand:${payment}`];
    if (choice.prompt.kind === "discardDownToHandSize") {
      const spare = choice.options.filter((o) => o.optionId !== strike && o.optionId !== payment);
      return spare.slice(0, choice.minSelections).map((o) => o.optionId);
    }
    return firstLegal(s);
  };
  const events: GameEvent[] = [];
  let state = applyOk(primed, endTurn(), WAVE4_DEPS).state;
  const attackDone = () => events.some((e) => e.type === "attackResolved" && e.enemyInstanceId === villain);
  for (let guard = 0; state.pendingChoice && !attackDone(); guard++) {
    if (guard > 300) throw new Error(`stuck on ${state.pendingChoice.prompt.kind}`);
    const choice = state.pendingChoice;
    const step = applyOk(
      state,
      { type: "resolveChoice", playerId: choice.playerId, choiceId: choice.choiceId, selectedOptionIds: pick(state) },
      WAVE4_DEPS,
    );
    events.push(...step.events);
    state = step.state;
  }
  const attack = events.find(
    (e): e is Extract<GameEvent, { type: "attackResolved" }> =>
      e.type === "attackResolved" && e.enemyInstanceId === villain,
  );
  return { offered, events, stone, attack };
}

describe('Preemptive Strike vs the Infinity Stone of "I Am Inevitable" (ruling Sept 5, 2024 #8)', () => {
  it("is offered against the stone's icons and cancels them", () => {
    const { offered, events, stone, attack } = thanosAttackWithStone("21131"); // Power Stone, 3 boost icons
    expect(offered).toBe(true);
    expect(events.some((e) => e.type === "boostCancelled" && e.instanceId === stone && e.scope === "icons")).toBe(true);
    expect(attack?.boostIcons).toBe(0);
  });

  it("left alone, the stone's icons count for the attack", () => {
    const { offered, attack } = thanosAttackWithStone("21131", false);
    expect(offered).toBe(true);
    expect(attack?.boostIcons).toBe(3);
  });
});
