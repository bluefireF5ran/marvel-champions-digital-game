/**
 * `EffectSpec spendResources.x`: "You may spend X [mental] resources to prevent X of that threat and remove X secret
 * counters" (Battle of Wits, `aos` 50175; A.I.M. Interference 50184), with synthetic cards. The player chooses X from
 * 0 to the most they could pay (never above the cap), then pays X resources of the type in one payment.
 *
 * Sources: RRG 1.8 "Cost" (p. 13): "While paying a cost, a player is permitted to generate resources beyond the
 * specified cost … Any resources that are generated beyond the specified cost are lost after paying that cost."
 * "Wild Resource" (p. 48): a wild is used as any one type. "Non-Numerical Variable" (p. 30) for X.
 */
import type { CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityDefinition } from "./abilities.js";
import { replay, sessionApply, startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { PlayerId } from "./ids.js";
import { mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec, TargetRef, ValueSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubEvent, stubResource, stubSupport } from "./testing/fixtures.js";
import { defaultPick, giveCards } from "./testing/scenario.js";
import { gameAtFirstTurn, P1, playerCardIntoPlay } from "./testing/wave3.js";

const def = (definition: AbilityDefinition) => definition;
const v = (name: string): ValueSpec => ({ kind: "var", name }) as ValueSpec;
const n = (value: number): ValueSpec => ({ kind: "const", value });

const MENT = stubResource({ id: "ment", icons: 0, produces: { mental: 1 } });
const DOUBLE_MENT = stubResource({ id: "double-ment", icons: 0, produces: { mental: 2 } });
const PHYS = stubResource({ id: "phys", icons: 0, produces: { physical: 1 } });
const WILD = stubResource({ id: "wild", icons: 1 });
/** "Resource: Exhaust this card → generate a [mental] resource." */
const GENERATOR_RESOURCE = stubAbility(
  "generator.resource",
  def({ trigger: { kind: "resource" }, cost: { exhaustSelf: true }, generates: { mental: 1 }, effects: [] }),
);
const GENERATOR = stubSupport({ id: "generator", cost: 0, abilities: [GENERATOR_RESOURCE.ref] });
const METER = stubSupport({ id: "meter", cost: 0 });
const meter: TargetRef = { kind: "named", name: METER.name };
const measure = (counterType: string, amount: ValueSpec): EffectSpec => ({
  kind: "addCounters",
  target: meter,
  counterType,
  amount,
});

/** "You may spend X [mental] resources (X up to `cap`). Place X counters; place 1 'made' counter if X is at least 1." */
const bargain = (id: string, cap: number) => {
  const ability = stubAbility(
    `${id}.action`,
    def({
      trigger: { kind: "action" },
      effects: [
        {
          kind: "spendResources",
          player: { kind: "controller" },
          resources: { mental: 1 },
          bind: "paid",
          x: { max: n(cap) },
        },
        measure("ran", n(1)),
        measure("x", v("paid.amount")),
        measure("made", v("paid.made")),
      ],
    }),
  );
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
const BARGAIN_3 = bargain("bargain-3", 3);
const BARGAIN_0 = bargain("bargain-0", 0);

const CARDS = [MENT, DOUBLE_MENT, PHYS, WILD, GENERATOR, METER, BARGAIN_3.card, BARGAIN_0.card];
const deps = depsOf(GENERATOR_RESOURCE, BARGAIN_3.ability, BARGAIN_0.ability);
const DECK: readonly CardId[] = CARDS.flatMap((card) => [card.id, card.id, card.id, card.id]);

/** P1's hand is exactly the event and these cards; the meter is in play. */
function table(event: { readonly card: { readonly id: string } }, hand: readonly string[], generator = false) {
  let state = gameAtFirstTurn({ cards: CARDS, deps, deck: DECK });
  const put = playerCardIntoPlay(state, METER.id);
  state = put.state;
  if (generator) state = playerCardIntoPlay(state, GENERATOR.id).state;
  const given = giveCards(state, P1, event.card.id, ...hand);
  state = {
    ...given.state,
    players: given.state.players.map((p) =>
      p.playerId === P1
        ? { ...p, hand: [...given.ids], deck: [...p.deck, ...p.hand.filter((id) => !given.ids.includes(id))] }
        : p,
    ),
  };
  return { state, meter: put.id, event: given.ids[0]!, hand: given.ids.slice(1) };
}
type Seen = { readonly kind: string; readonly options: readonly string[]; readonly min: number };
/**
 * Plays the event, answering the X prompt with `x` and the payment with its first `minSelections` options (the payment
 * in full from the fewest options, which the engine lists first).
 */
function play(t: ReturnType<typeof table>, x: number) {
  const seen: Seen[] = [];
  const pick = (state: GameState): readonly string[] => {
    const choice = state.pendingChoice!;
    seen.push({
      kind: choice.prompt.kind,
      options: choice.options.map((o) => o.optionId),
      min: choice.minSelections,
    });
    if (choice.prompt.kind === "chooseNumber") return [String(x)];
    if (choice.prompt.kind === "spendResources") {
      return choice.options.slice(0, choice.minSelections).map((o) => o.optionId);
    }
    return defaultPick(state);
  };
  const driven = driveSession(
    startSession(t.state),
    deps,
    [{ type: "playCard", playerId: P1, cardInstanceId: t.event, payment: [], attachToInstanceId: null }],
    pick,
  );
  const state = driven.session.state;
  const replayed = replay(driven.session.log, deps);
  expect(replayed.ok && replayed.state).toEqual(state);
  const count = (type: string) => mustInstance(state, t.meter).counters[type] ?? 0;
  return { state, events: driven.events, seen, x: count("x"), made: count("made"), ran: count("ran") };
}
const handOf = (state: GameState, player: PlayerId = P1) => mustPlayer(state, player).hand;
const kinds = (seen: readonly Seen[]) => seen.map((s) => s.kind);
const chosen = (events: readonly GameEvent[]) =>
  events.flatMap((e) => (e.type === "numberChosen" ? [[e.bind, e.amount] as const] : []));

describe("`spendResources.x`: spend X resources of a type, X chosen first, in one payment", () => {
  it("three mental cards, cap 3: one number prompt from 0 to 3, one payment of 3; X is 3", () => {
    const t = table(BARGAIN_3, [MENT.id, MENT.id, MENT.id]);
    const out = play(t, 3);
    expect(kinds(out.seen)).toEqual(["chooseNumber", "spendResources"]);
    expect(out.seen[0]!.options).toEqual(["0", "1", "2", "3"]);
    expect(out.seen[1]!.min).toBe(3);
    expect([out.x, out.made]).toEqual([3, 1]);
    expect(handOf(out.state)).toEqual([]);
    expect(chosen(out.events)).toEqual([["paid", 3]]);
  });

  it("choosing 0 ends it at once: no payment is asked, nothing is spent, the effects after it still resolve", () => {
    const t = table(BARGAIN_3, [MENT.id, MENT.id, MENT.id]);
    const out = play(t, 0);
    expect(kinds(out.seen)).toEqual(["chooseNumber"]);
    expect([out.x, out.made, out.ran]).toEqual([0, 0, 1]);
    expect(handOf(out.state)).toEqual(t.hand);
    expect(chosen(out.events)).toEqual([["paid", 0]]);
  });

  it("choosing less than the top pays exactly that many: X of 2 from three cards leaves one in hand", () => {
    const t = table(BARGAIN_3, [MENT.id, MENT.id, MENT.id]);
    const out = play(t, 2);
    expect(out.seen[1]!.min).toBe(2);
    expect([out.x, out.made]).toEqual([2, 1]);
    expect(handOf(out.state)).toHaveLength(1);
  });

  it("a card that generates two mental resources pays X of 2 alone", () => {
    const t = table(BARGAIN_3, [DOUBLE_MENT.id, PHYS.id]);
    const out = play(t, 2);
    // The top is 2: the physical card pays nothing of this type.
    expect(out.seen[0]!.options).toEqual(["0", "1", "2"]);
    expect(out.seen[1]!.min).toBe(1);
    expect([out.x, out.made]).toEqual([2, 1]);
    expect(handOf(out.state)).toEqual([t.hand[1]]);
  });

  it("a double card and a single card reach 3 with two cards; a wild pays as the type", () => {
    const both = play(table(BARGAIN_3, [DOUBLE_MENT.id, MENT.id]), 3);
    expect(both.seen[0]!.options).toEqual(["0", "1", "2", "3"]);
    expect(both.x).toBe(3);
    expect(handOf(both.state)).toEqual([]);
    const wild = play(table(BARGAIN_3, [WILD.id, MENT.id]), 2);
    expect(wild.x).toBe(2);
  });

  it("the cap holds whatever the player holds: four mental cards, cap 3", () => {
    const out = play(table(BARGAIN_3, [MENT.id, MENT.id, MENT.id, MENT.id]), 3);
    expect(out.seen[0]!.options).toEqual(["0", "1", "2", "3"]);
    expect(handOf(out.state)).toHaveLength(1);
  });

  it("a resource ability in play counts toward the top and pays", () => {
    const t = table(BARGAIN_3, [MENT.id], true);
    const out = play(t, 2);
    expect(out.seen[0]!.options).toEqual(["0", "1", "2"]);
    expect(out.x).toBe(2);
    expect(handOf(out.state)).toEqual([]);
  });

  it("nothing of the type to spend, or a cap of 0: nobody is asked and X is 0", () => {
    const broke = play(table(BARGAIN_3, [PHYS.id]), 1);
    expect(broke.seen).toEqual([]);
    expect([broke.x, broke.made, broke.ran]).toEqual([0, 0, 1]);
    const capped = play(table(BARGAIN_0, [MENT.id, MENT.id]), 1);
    expect(capped.seen).toEqual([]);
    expect([capped.x, capped.made, capped.ran]).toEqual([0, 0, 1]);
    expect(handOf(capped.state)).toHaveLength(2);
  });

  it("the payment is in full or not accepted: too little is refused and the choice stays open; overpaying is legal", () => {
    const t = table(BARGAIN_3, [MENT.id, MENT.id, MENT.id]);
    let session = startSession(t.state);
    const apply = (selected: readonly string[]) => {
      const choice = session.state.pendingChoice!;
      return sessionApply(
        session,
        {
          type: "resolveChoice",
          playerId: choice.playerId,
          choiceId: choice.choiceId,
          selectedOptionIds: selected,
        } as never,
        deps,
      );
    };
    const played = sessionApply(
      session,
      { type: "playCard", playerId: P1, cardInstanceId: t.event, payment: [], attachToInstanceId: null },
      deps,
    );
    if (!played.ok) throw new Error(played.error.message);
    session = played.session;
    const two = apply(["2"]);
    if (!two.ok) throw new Error(two.error.message);
    session = two.session;
    expect(session.state.pendingChoice?.prompt).toMatchObject({
      kind: "spendResources",
      required: true,
      requirement: { mental: 2 },
    });
    const offered = session.state.pendingChoice!.options.map((o) => o.optionId);
    expect(offered).toHaveLength(3);
    expect(apply([offered[0]!]).ok).toBe(false);
    expect(apply([]).ok).toBe(false);
    expect(session.state.pendingChoice?.prompt.kind).toBe("spendResources");
    const over = apply(offered);
    if (!over.ok) throw new Error(`${over.error.code}: ${over.error.message}`);
    // Three resources spent for an X of 2: the third is lost (RRG 1.8 "Cost", p. 13), and X stays 2.
    expect(mustInstance(over.session.state, t.meter).counters.x).toBe(2);
    expect(handOf(over.session.state)).toEqual([]);
  });
});
