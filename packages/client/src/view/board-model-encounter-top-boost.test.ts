/**
 * The faceup top card of the encounter deck, as words the ENC DECK tile wears: its name and its printed boost (icon
 * count and star), read from the engine (`boostIconsFor`, `hasStarIcon`) only while the engine shows the card.
 */
import { describe, expect, test } from "vitest";
import { activeEncounterDeck, boostIconsFor, hasStarIcon, legalActions, type PlayerId } from "@mc/engine";
import { LocalEngineHost } from "../engine/local-host.js";
import { SessionStore } from "../store/session-store.js";
import { POOL_DEPS } from "../content/pool.js";
import { boardModel, boostLineOf } from "./board-model.js";

describe("boostLineOf", () => {
  test("the count, then a star when the boost area prints one", () => {
    expect(boostLineOf(0, false)).toBe("BOOST 0");
    expect(boostLineOf(2, false)).toBe("BOOST 2");
    expect(boostLineOf(1, true)).toBe("BOOST 1 ★");
    expect(boostLineOf(0, true)).toBe("BOOST 0 ★");
  });
});

describe("the encounter deck's shown top card", () => {
  test("none while facedown; the card's name and boost in hero form", async () => {
    const store = new SessionStore(new LocalEngineHost());
    await store.start({
      scenarioId: "batroc",
      difficulty: "standard",
      players: [{ starterDeckId: "falcon-leadership" }],
      seed: 4,
    });
    for (let choice = store.state.game!.pendingChoice; choice; choice = store.state.game!.pendingChoice) {
      await store.resolveChoice(choice.minSelections > 0 ? [choice.options[0]!.optionId] : []);
    }
    const me = store.state.perspectiveId as PlayerId;
    const model = () => boardModel(store.state.game!, me, POOL_DEPS, legalActions(store.state.game!, me, POOL_DEPS));
    expect(model().encounterDeckTop).toBeNull();

    await store.dispatch({ type: "changeForm", playerId: me });
    const state = store.state.game!;
    const top = activeEncounterDeck(state).deck[0]!;
    const shown = model().encounterDeckTop!;
    expect(shown.instanceId).toBe(top);
    expect(shown.name.length).toBeGreaterThan(0);
    expect(shown.boostIcons).toBe(boostIconsFor(state, POOL_DEPS, top));
    expect(shown.star).toBe(hasStarIcon(state, top));
    expect(shown.boostLine).toBe(boostLineOf(shown.boostIcons, shown.star));
  }, 120_000);
});
