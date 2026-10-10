/**
 * The encounter deck's top card played faceup (Falcon's hero form, 53001a): the board model carries its face only
 * while the engine shows it (`shownEncounterTop`), so the ENC DECK tile draws it, and Inspect opens it like any card.
 */
import { describe, expect, test } from "vitest";
import { activeEncounterDeck, legalActions, shownEncounterTop, type PlayerId } from "@mc/engine";
import { LocalEngineHost } from "../engine/local-host.js";
import { SessionStore } from "../store/session-store.js";
import { POOL_DEPS } from "../content/pool.js";
import { boardModel } from "./board-model.js";
import { inspectModel } from "./inspect-model.js";

async function falconAtBatroc() {
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
  return { store, me, model };
}

describe("the encounter deck tile's faceup top card", () => {
  test("hidden in alter-ego form (card back), shown in hero form", async () => {
    const t = await falconAtBatroc();
    const state = () => t.store.state.game!;
    expect(state().players[0]!.identity.form).toBe("alterEgo");
    expect(shownEncounterTop(state(), POOL_DEPS)).toBeNull();
    expect(t.model().encounterDeckTopArt).toBeNull();

    await t.store.dispatch({ type: "changeForm", playerId: t.me });
    const top = activeEncounterDeck(state()).deck[0]!;
    expect(shownEncounterTop(state(), POOL_DEPS)).toBe(top);
    const art = t.model().encounterDeckTopArt;
    expect(art).not.toBeNull();
    expect(t.model().encounterDeckTopInstanceId).toBe(top);
    expect(t.model().encounterPiles.deck).toBe(activeEncounterDeck(state()).deck.length);

    // Inspect reads the engine's visibility: the card opens face up while it shows.
    const sheet = inspectModel(state(), top, null, t.me, POOL_DEPS);
    expect(sheet.hidden).toBe(false);
  });
});
