/**
 * Wonder Man on the board (docs/phase7-wave10-client.md C14, section 5.5). His pack is not in the client's playable pool
 * and has no starter deck, so the game is a real one built in `hero-pack-fixture.ts` (the cards package's own data
 * passed in explicitly), with the tucked events patched in as the engine leaves them.
 *
 * What the engine does not expose, and so what these tests do not claim: what overpaying does for a card (the effect
 * is the card's own text, which the client never computes), and the overpaid amounts by resource type (the engine asks
 * the player which resources were the paid ones only when it matters, `paidResourcesChosen`); the payment prompt says
 * the count beyond the cost and nothing more.
 */
import {
  applyCommand,
  cardOf,
  legalActions,
  type Command,
  type GameEvent,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { WAVE10_DEPS } from "@mc/cards";
import { beforeAll, describe, expect, test } from "vitest";
import { boardModel, type AttachmentChip, type CharacterPanel } from "./board-model.js";
import { heroPackGame } from "./hero-pack-fixture.js";
import { logLine } from "./log-lines.js";
import { beginPayment, paymentView, togglePayment } from "./payment-model.js";

const DEPS = WAVE10_DEPS;
let game: GameState;
let me: PlayerId;
let ionic: InstanceId;

function run(state: GameState, command: Command): GameState {
  const result = applyCommand(state, command, DEPS);
  if (!result.ok) throw new Error(`${command.type} rejected: ${result.error.message}`);
  return result.state;
}

beforeAll(() => {
  game = heroPackGame("wonderMan");
  me = game.players[0]!.playerId;
  ionic = game.instances[game.players[0]!.identity.instanceId]!.attachments.find(
    (id) => game.instances[id]!.cardId === "58002",
  )!;
}, 120_000);

const chip = (state: GameState): AttachmentChip =>
  boardModel(state, me, DEPS).me.attachments.find((entry) => entry.instanceId === ionic)!;
const atk = (panel: CharacterPanel): string | undefined => panel.stats.find((stat) => stat.label === "ATK")?.value;

/** The first `count` events of the player's deck, moved under Ionic Physiology faceup. */
function withTucked(state: GameState, count: number): { state: GameState; ids: InstanceId[] } {
  const seat = state.players[0]!;
  const ids = seat.deck.filter((id) => cardOf(state, id)?.type === "event").slice(0, count);
  expect(ids).toHaveLength(count);
  return {
    ids,
    state: {
      ...state,
      players: state.players.map((entry, at) =>
        at === 0 ? { ...entry, deck: entry.deck.filter((id) => !ids.includes(id)) } : entry,
      ),
      instances: {
        ...state.instances,
        [ionic]: { ...state.instances[ionic]!, tucked: ids },
        ...Object.fromEntries(ids.map((id) => [id, { ...state.instances[id]!, faceup: true }])),
      },
    },
  };
}

describe("Ionic Physiology: the cards tucked under it", () => {
  test("with nothing tucked it still says the room: 0 of 3", () => {
    const entry = chip(game);
    expect(entry.tuckMax).toBe(3);
    expect(entry.tuckedCount).toBe(0);
    expect(entry.tuckedNote).toBe("0 of 3 tucked");
  });

  test("two tucked: faceup and named, counted against the maximum the engine gives", () => {
    const { state, ids } = withTucked(game, 2);
    const entry = chip(state);
    expect(entry.tuckedCount).toBe(2);
    expect(entry.tuckMax).toBe(3);
    expect(entry.tuckedNote).toBe("2 of 3 tucked");
    expect(entry.tucked.map((card) => card.instanceId)).toEqual(ids);
    expect(entry.tucked.every((card) => card.faceup && card.name !== "Facedown card")).toBe(true);
    expect(entry.tucked.map((card) => card.name)).toEqual(ids.map((id) => cardOf(state, id)!.name));
  });

  test("the chip's one line carries the count in words", () => {
    const { state } = withTucked(game, 3);
    const text = boardModel(state, me, DEPS)
      .me.attachments.filter((entry) => entry.instanceId === ionic)
      .map((entry) => `${entry.name} · ${entry.tuckedNote}`);
    expect(text).toEqual(["Ionic Physiology · 3 of 3 tucked"]);
  });

  test("his ATK on the panel is the state's number: each tucked card adds one, in hero form only", () => {
    const hero = run(game, { type: "changeForm", playerId: me });
    const base = Number(atk(boardModel(hero, me, DEPS).me));
    const { state } = withTucked(hero, 2);
    expect(Number(atk(boardModel(state, me, DEPS).me))).toBe(base + 2);
    // Alter-ego form shows no ATK at all; the tucked cards add nothing there.
    const { state: alterEgo } = withTucked(game, 2);
    expect(atk(boardModel(alterEgo, me, DEPS).me)).toBeUndefined();
  });
});

describe("Ionic Physiology in the log", () => {
  test("a tuck, a refused tuck and the discard after a basic attack", () => {
    const { state, ids } = withTucked(game, 3);
    const [first] = ids as [InstanceId, ...InstanceId[]];
    const extra = state.players[0]!.deck.find((id) => cardOf(state, id)?.type === "event")!;
    const shown: GameState = {
      ...state,
      instances: { ...state.instances, [extra]: { ...state.instances[extra]!, faceup: true } },
    };
    const name = (id: InstanceId) => cardOf(state, id)!.name;
    const tuck = {
      type: "cardMoved",
      instanceId: first,
      cardId: state.instances[first]!.cardId,
      from: { kind: "discard", playerId: me },
      to: { kind: "tucked", hostInstanceId: ionic },
    } as unknown as GameEvent;
    expect(logLine(tuck, shown, me, DEPS)?.text).toBe(`${name(first)} is tucked under Ionic Physiology.`);
    const refused = { type: "cardNotTucked", instanceId: extra, hostInstanceId: ionic, reason: "limit" } as GameEvent;
    expect(logLine(refused, shown, me, DEPS)?.text).toBe(
      `${name(extra)} is not tucked under Ionic Physiology: it holds at most 3.`,
    );
    const away = {
      type: "cardMoved",
      instanceId: first,
      cardId: state.instances[first]!.cardId,
      from: { kind: "tucked", hostInstanceId: ionic },
      to: { kind: "discard", playerId: me },
    } as unknown as GameEvent;
    expect(logLine(away, shown, me, DEPS)?.text).toBe(`${name(first)} is discarded from under Ionic Physiology.`);
  });
});

describe("paying with more than the cost", () => {
  /** A card in hand the engine lets this player play, and the other hand cards that could pay for it. */
  function playable(state: GameState): { card: InstanceId; others: InstanceId[] } {
    const legal = legalActions(state, me, DEPS);
    if (legal.kind !== "turn") throw new Error(`expected a turn, got ${legal.kind}`);
    const entry = legal.legal.find(
      (e) =>
        e.action.kind === "playCard" &&
        e.needsPayment &&
        (cardOf(state, e.action.instanceId) as { cost?: number })?.cost,
    );
    if (!entry || entry.action.kind !== "playCard") throw new Error("nothing to pay for in the opening hand");
    const card = entry.action.instanceId;
    return { card, others: state.players[0]!.hand.filter((id) => id !== card) };
  }

  test("the bar counts what the picks add beyond the cost, once the engine accepts them", () => {
    const { card, others } = playable(game);
    let payment = beginPayment(game, me, { kind: "playCard", instanceId: card }, null, DEPS)!;
    expect(paymentView(game, me, payment, "x", DEPS).overpaid).toBe(0);
    let spent = 0;
    const required = paymentView(game, me, payment, "x", DEPS).required;
    for (const id of others) {
      const source = payment.query.sources.find((s) => s.instanceId === id && s.kind === "handCard");
      if (!source) continue;
      payment = togglePayment(payment, source.optionId);
      spent += Object.values(source.pool).reduce((a, b) => a + b, 0);
      if (spent > required) break;
    }
    const view = paymentView(game, me, payment, "x", DEPS);
    expect(view.paid).toBe(spent);
    expect(spent).toBeGreaterThan(required);
    expect(view.command).not.toBeNull();
    if (view.command !== null) {
      expect(view.overpaid).toBe(Math.max(0, spent - required));
      expect(view.overpaidNote).toBe(view.overpaid > 0 ? `Overpaid by ${view.overpaid}` : null);
    } else {
      // Not enough to pay: short, never "overpaid".
      expect(view.overpaid).toBe(0);
      expect(view.overpaidNote).toBeNull();
    }
  });
});
