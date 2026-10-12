/**
 * The payment strip's wave 10 lines (docs/phase7-wave10-client.md C14, section 5.5): the amount a hand card spent
 * through its own ability takes (Energy Siphon's damage, one source per amount), and the line for each other player
 * whose cards help pay. Real games; the sources the engine offers only in a hand not dealt here are added to the real
 * query exactly as `PaymentSource` documents them.
 */
import { WAVE10_DEPS } from "@mc/cards";
import { cardOf, legalActions, type GameState, type InstanceId, type PaymentSource, type PlayerId } from "@mc/engine";
import { describe, expect, test } from "vitest";
import { POOL_DEPS } from "../content/pool.js";
import { EngineSessionCore } from "../engine/session-core.js";
import { heroPackGame } from "./hero-pack-fixture.js";
import { beginPayment, paymentView, togglePayment, type PaymentState } from "./payment-model.js";

const pool = (extra: Partial<PaymentSource["pool"]>): PaymentSource["pool"] => ({
  physical: 0,
  mental: 0,
  energy: 0,
  wild: 0,
  ...extra,
});

function firstPayment(state: GameState, me: PlayerId, deps = POOL_DEPS): { payment: PaymentState; card: InstanceId } {
  const legal = legalActions(state, me, deps);
  if (legal.kind !== "turn") throw new Error(`expected a turn, got ${legal.kind}`);
  const entry = legal.legal.find(
    (e) =>
      e.action.kind === "playCard" && e.needsPayment && (cardOf(state, e.action.instanceId) as { cost?: number })?.cost,
  );
  if (!entry || entry.action.kind !== "playCard") throw new Error("no card to pay for");
  const payment = beginPayment(state, me, entry.action, null, deps);
  if (!payment) throw new Error("no payment");
  return { payment, card: entry.action.instanceId };
}

describe("a hand card spent through its own ability says the amount it takes", () => {
  test("Energy Siphon's three amounts are three tiles, each saying its damage, and the plain card says none", () => {
    const state = heroPackGame("wonderMan");
    const me = state.players[0]!.playerId;
    const { payment } = firstPayment(state, me, WAVE10_DEPS);
    const siphon = state.players[0]!.hand.find((id) => id !== undefined)!;
    const sources: PaymentSource[] = [1, 2, 3].map(
      (damage) =>
        ({
          optionId: `hand:${siphon}:58006.energy-siphon-interrupt@#damageSelf=${damage}`,
          kind: "resourceAbility",
          instanceId: siphon,
          label: "Energy Siphon",
          pool: pool({ energy: 1 + damage }),
          spendsHandCard: true,
          costSelection: { damageSelf: damage },
        }) as PaymentSource,
    );
    const view = paymentView(
      state,
      me,
      { ...payment, query: { ...payment.query, sources: [...payment.query.sources, ...sources] } },
      "x",
      WAVE10_DEPS,
    );
    const notes = view.sources.filter((source) => source.spendsHandCard).map((source) => source.amountNote);
    expect(notes).toEqual(["take 1 damage", "take 2 damage", "take 3 damage"]);
    expect(view.sources.filter((source) => !source.spendsHandCard).every((source) => source.amountNote === null)).toBe(
      true,
    );
    // All three are table tiles (the strip draws them), told apart by the amount and by what each generates.
    expect(view.tableSources.filter((source) => source.spendsHandCard)).toHaveLength(3);
  }, 120_000);
});

describe("Coordinated-Effort style help: one line per helper", () => {
  test("another player's picked cards read as 'Helped by <hero>: <resources>'", async () => {
    const core = new EngineSessionCore();
    const started = await core.start({
      scenarioId: "rhino",
      difficulty: "standard",
      players: [{ starterDeckId: "core-spider-man-justice" }, { starterDeckId: "core-captain-marvel-leadership" }],
      seed: 4,
    });
    const state = {
      ...started.snapshot.state,
      cardPool: started.cardPool,
      pendingChoice: null,
    } as unknown as GameState;
    const me = state.players[0]!.playerId;
    const helperCard = state.players[1]!.hand[0]!;
    const base = beginPayment(
      state,
      me,
      { kind: "playCard", instanceId: state.players[0]!.hand[0]! },
      null,
      POOL_DEPS,
    ) ?? {
      action: { kind: "playCard", instanceId: state.players[0]!.hand[0]! },
      target: null,
      query: { requirement: { generic: 1, physical: 0, mental: 0, energy: 0, wild: 0 }, sources: [], suggested: [] },
      picked: [],
      reductions: [],
    };
    const source = {
      optionId: `hand:${helperCard}`,
      kind: "handCard",
      instanceId: helperCard,
      label: "Helper's card",
      pool: pool({ energy: 1 }),
    } as PaymentSource;
    const open = { ...base, query: { ...base.query, sources: [...base.query.sources, source] } } as PaymentState;
    expect(paymentView(state, me, open, "x", POOL_DEPS).helperLines).toEqual([]);
    const spent = paymentView(state, me, togglePayment(open, source.optionId), "x", POOL_DEPS);
    expect(spent.helperLines).toHaveLength(1);
    expect(spent.helperLines[0]).toMatch(/^Helped by .+: 1 energy$/);
    expect(spent.tableSources.some((entry) => entry.helperName !== null)).toBe(true);
  }, 120_000);
});
