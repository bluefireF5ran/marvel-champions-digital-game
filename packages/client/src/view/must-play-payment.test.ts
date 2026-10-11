/**
 * "Must play it" payments (owner rulings 62B and 63B, 2026-10-11; `playFromHand.mustPay`), on the payment sheet's and the
 * log's view models, from real Enchantress games (`store/dev-enchantress-game.ts`, `&at=`): the Trance of Greed's draw
 * and Alluring Call's pick, each with a hand that can pay and one that cannot.
 */
import type { GameEvent, GameState, LegalAction, PendingChoice } from "@mc/engine";
import { describe, expect, test } from "vitest";
import { POOL_DEPS } from "../content/pool.js";
import { LocalEngineHost } from "../engine/local-host.js";
import { startEnchantressGame, type EnchantressAt } from "../store/dev-enchantress-game.js";
import { nextTurn } from "../store/dev-game-steps.js";
import { SessionStore } from "../store/session-store.js";
import { canConfirmChoice, canDeclineChoice } from "./choice-focus.js";
import { promptTitleOf, spendResourcesTitleOf } from "./choice-source.js";
import { isForcedAbility } from "./forced-actions.js";
import { appendEvents, emptyLog } from "./log-lines.js";
import { isPaymentSheet, paymentSheetView, requiredPaymentNoteOf } from "./payment-sheet.js";

async function usedForcedAction(at: EnchantressAt) {
  const store = new SessionStore(new LocalEngineHost());
  await startEnchantressGame(store, at);
  const actions = store.state.legal!.actions;
  if (actions.kind !== "turn") throw new Error(actions.kind);
  const use = actions.legal.find(
    (e: LegalAction) => e.action.kind === "useAbility" && isForcedAbility(POOL_DEPS, e.action.abilityId),
  )!;
  const events: GameEvent[][] = [];
  store.subscribe((s) => {
    if (s.lastEvents.length > 0) events.push([...s.lastEvents]);
  });
  await store.dispatch(use.example);
  return { store, events };
}
/** The log's lines for each command's events, read the way the board reads them (a burst at a time). */
const linesOf = (batches: readonly (readonly GameEvent[])[], game: GameState): string[] =>
  batches
    .reduce((log, batch) => appendEvents(log, batch, game, game.players[0]!.playerId, POOL_DEPS), emptyLog())
    .lines.map((line) => line.text);
const pendingOf = (store: SessionStore): PendingChoice => store.state.game!.pendingChoice!;

describe("a required payment (Trance of Greed draws a card it can pay for)", () => {
  test("the sheet names the card, has no decline, and Confirm waits for a payment the engine takes", async () => {
    const { store } = await usedForcedAction("greed-pay");
    const game = store.state.game!;
    const choice = pendingOf(store);
    expect(choice.prompt).toMatchObject({ kind: "spendResources", required: true });
    expect(isPaymentSheet(choice)).toBe(true);
    expect(promptTitleOf(choice.prompt, POOL_DEPS, choice, game)).toBe("Spend 4 resources");
    expect(requiredPaymentNoteOf(game, choice)).toBe("You must play Daredevil. Pick what pays.");
    expect(canDeclineChoice(choice)).toBe(false);
    expect(choice.minSelections).toBe(2);

    const view = (picked: readonly string[]) => paymentSheetView(game, choice, picked, POOL_DEPS)!;
    const options = choice.options.map((o) => o.optionId);
    expect(view([])).toMatchObject({ canConfirm: false, confirmLabel: "Pay 4 more" });
    // One card pays 2 of the 4: refused by the engine, so Confirm stays off and says what is missing.
    expect(view([options[0]!])).toMatchObject({ canConfirm: false, paid: 2, confirmLabel: "Pay 2 more" });
    expect(view(options.slice(0, 2))).toMatchObject({ canConfirm: true, confirmLabel: "Pay 4" });
    expect(canConfirmChoice(choice, 2)).toBe(true);
  }, 120_000);

  test("an empty answer is refused and the prompt stays open", async () => {
    const { store } = await usedForcedAction("greed-pay");
    const before = pendingOf(store).choiceId;
    expect(await store.resolveChoice([])).toBe(false);
    expect(pendingOf(store).choiceId).toBe(before);
  }, 120_000);
});

describe("Alluring Call", () => {
  test("the pick lists only cards that can be played and paid for; then the payment is required and names the card", async () => {
    const { store } = await usedForcedAction("call-pay");
    const pick = pendingOf(store);
    expect(pick.prompt).toMatchObject({ kind: "chooseCards", slot: "playFromHand" });
    expect(pick.options.map((o) => o.label)).toEqual(["Daredevil", "Jessica Jones"]);
    await store.resolveChoice([pick.options[0]!.optionId]);
    const pay = pendingOf(store);
    expect(pay.prompt).toMatchObject({ kind: "spendResources", required: true });
    expect(requiredPaymentNoteOf(store.state.game!, pay)).toBe("You must play Daredevil. Pick what pays.");
    expect(canDeclineChoice(pay)).toBe(false);
  }, 120_000);
});

describe("nothing playable", () => {
  test("Trance of Greed deals 1 damage with no prompt, and the log says the card could not be played", async () => {
    const { store, events } = await usedForcedAction("greed-none");
    await nextTurn(store);
    const game = store.state.game!;
    expect(game.pendingChoice).toBeNull();
    const lines = linesOf(events, game);
    expect(lines).toContain("Trance of Greed: Forced Action used (exhaust). No card could be played.");
    expect(lines.some((text) => /took 1 damage from Trance of Greed/.test(text))).toBe(true);
  }, 120_000);

  test("Alluring Call completes with nothing played, and the log says so", async () => {
    const { store, events } = await usedForcedAction("call-none");
    await nextTurn(store);
    const game = store.state.game!;
    expect(game.pendingChoice).toBeNull();
    expect(linesOf(events, game)).toContain("Alluring Call: Forced Action used (exhaust). No card could be played.");
  }, 120_000);

  test("a payment that is asked is not reported as unplayed", async () => {
    const { events, store } = await usedForcedAction("greed-pay");
    expect(linesOf(events, store.state.game!).join("\n")).not.toMatch(/No card could be played/);
  }, 120_000);
});

describe("a payment that is not required keeps its question", () => {
  test("the title still asks, and the sheet is not a payment sheet", () => {
    expect(spendResourcesTitleOf({ generic: 3 })).toBe("Spend 3 resources?");
    expect(spendResourcesTitleOf({ generic: 3 }, undefined, true)).toBe("Spend 3 resources");
    expect(isPaymentSheet({ prompt: { kind: "spendResources", requirement: { generic: 3 } } as never })).toBe(false);
  });
});
