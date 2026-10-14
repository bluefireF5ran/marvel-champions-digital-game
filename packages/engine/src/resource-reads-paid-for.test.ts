/**
 * docs/phase7-wave10-box-heroes.md B7.2: what a resource generates may read the card the payment is for, bound to slot
 * `paidFor` (`PAID_FOR_SLOT`, `generatedResources`), on synthetic cards shaped like Alien Physiology (`cw` 56036:
 * "Resource: Exhaust Alien Physiology → generate a [wild] resource ([wild][wild] resources instead if paying for a
 * Hulkling card).").
 *
 * Sources: RRG 1.8 "Resource Ability" (p. 37): a resource ability may be triggered "anytime the player … is generating
 * resources to pay a cost"; FAQ "Finesse (#33)" (p. 60): a resource generated for a kind of card pays "its resource
 * cost or a cost within that … card's ability", which is the card `generatesFor` is read against and the card this
 * slot names. RRG 1.8 "Cost" (p. 13): the resources of one payment are generated together and anything beyond the
 * cost is overpaid.
 */

import { trait } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps, ResourceGeneration } from "./abilities.js";
import type { Command, Payment } from "./commands.js";
import { applyCommand, replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { paymentFor } from "./legal.js";
import { activeVillain, mustInstance, mustPlayer } from "./query.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommandsPicking } from "./testing/drive.js";
import { stubAlly, stubResource, stubSupport } from "./testing/fixtures.js";
import { defaultPick, giveCard, payFor } from "./testing/scenario.js";
import { gameAtFirstTurn, P1, playerCardIntoPlay } from "./testing/wave3.js";

const KIN = trait("KIN");
/** "A [wild] resource ([wild][wild] resources instead if paying for a KIN card)." */
const ONE_OR_TWO: ResourceGeneration = {
  kind: "amount",
  resource: "wild",
  amount: {
    kind: "conditional",
    if: { kind: "refMatches", ref: { kind: "slot", slot: "paidFor" }, query: { trait: KIN }, anywhere: true },
    then: { kind: "const", value: 2 },
    else: { kind: "const", value: 1 },
  },
};

/** "Resource: Exhaust this card → generate a [wild] resource ([wild][wild] instead if paying for a KIN card)." */
const WELL_ABILITY = stubAbility("well.resource", {
  trigger: { kind: "resource" },
  cost: { exhaustSelf: true },
  effects: [],
  generates: ONE_OR_TWO,
});
const WELL = stubSupport({ id: "well", cost: 0, abilities: [WELL_ABILITY.ref] });
/** A card in hand that generates the same when it is spent. */
const SPARK_ABILITY = stubAbility("spark.constant", {
  trigger: { kind: "constant", handGenerates: ONE_OR_TWO },
  effects: [],
});
const SPARK = stubResource({ id: "spark", icons: 1, abilities: [SPARK_ABILITY.ref] });

const DAMAGE_VILLAIN = (n: number) =>
  ({ kind: "dealDamage", target: { kind: "villain" }, amount: { kind: "const", value: n } }) as const;
/** A KIN support: "Action: Spend 2 resources → deal 3 damage to the villain." */
const SHRINE_ABILITY = stubAbility("shrine.action", {
  trigger: { kind: "action" },
  cost: { resources: 2 },
  effects: [DAMAGE_VILLAIN(3)],
});
const SHRINE = stubSupport({ id: "shrine", cost: 2, traits: [KIN], abilities: [SHRINE_ABILITY.ref] });
/** The same ability on a card that is not KIN. */
const FORGE_ABILITY = stubAbility("forge.action", {
  trigger: { kind: "action" },
  cost: { resources: 2 },
  effects: [DAMAGE_VILLAIN(3)],
});
const FORGE = stubSupport({ id: "forge", cost: 2, abilities: [FORGE_ABILITY.ref] });
const COUSIN = stubAlly({ id: "cousin", cost: 2, atk: 1, thw: 1, hp: 2, traits: [KIN] });
const ELDER = stubAlly({ id: "elder", cost: 3, atk: 1, thw: 1, hp: 2, traits: [KIN] });
const STRANGER = stubAlly({ id: "stranger", cost: 2, atk: 1, thw: 1, hp: 2 });

const CARDS = [WELL, SPARK, SHRINE, FORGE, COUSIN, ELDER, STRANGER];
const deps: EngineDeps = depsOf(WELL_ABILITY, SPARK_ABILITY, SHRINE_ABILITY, FORGE_ABILITY);

/** The Well in play, ready. */
function start() {
  const state = gameAtFirstTurn({ cards: CARDS, deps, deck: CARDS.map((card) => card.id) });
  const well = playerCardIntoPlay(state, WELL.id);
  return { state: well.state, well: well.id };
}
const wellUse = (well: InstanceId): Payment => ({ ability: { instanceId: well, abilityId: WELL_ABILITY.ref.id } });
const play = (id: InstanceId, payment: readonly Payment[]): Command => ({
  type: "playCard",
  playerId: P1,
  cardInstanceId: id,
  payment,
  attachToInstanceId: null,
});
const use = (id: InstanceId, abilityId: string, payment: readonly Payment[]): Command => ({
  type: "useAbility",
  playerId: P1,
  cardInstanceId: id,
  abilityId: abilityId as never,
  payment,
});

function run(state: GameState, command: Command) {
  const { state: after, events, session } = runCommandsPicking(state, deps, defaultPick, command);
  const replayed = replay(session.log, deps);
  if (!replayed.ok) throw new Error(replayed.error.message);
  expect(replayed.state).toEqual(after);
  return { state: after, events };
}
const errorOf = (state: GameState, command: Command): string => {
  const result = applyCommand(state, command, deps);
  return result.ok ? "ok" : result.error.code;
};
const generated = (events: readonly GameEvent[]) =>
  events.flatMap((e) =>
    e.type === "resourcesGenerated" ? [{ abilityId: e.abilityId, amount: e.amount, pool: e.pool }] : [],
  );
const paid = (events: readonly GameEvent[], id: InstanceId) =>
  events.flatMap((e) => (e.type === "cardPlayed" && e.instanceId === id ? [e.resourcesPaid] : []));
const WILD = (n: number) => ({ physical: 0, mental: 0, energy: 0, wild: n });
const villainDamage = (state: GameState): number => mustInstance(state, activeVillain(state).instanceId).damage;

describe("B7.2 a resource ability's amount reads the card being paid for", () => {
  it("playing a KIN card of cost 2: the ability alone generates 2 wild and pays for it", () => {
    const { state: seeded, well } = start();
    const { state, id } = giveCard(seeded, P1, COUSIN.id);
    const hand = mustPlayer(state, P1).hand.length;
    const { state: after, events } = run(state, play(id, [wellUse(well)]));
    expect(generated(events)).toEqual([{ abilityId: WELL_ABILITY.ref.id, amount: 2, pool: WILD(2) }]);
    expect(paid(events, id)).toEqual([2]);
    expect(mustPlayer(after, P1).playArea).toContain(id);
    expect(mustInstance(after, well).exhausted).toBe(true);
    expect(mustPlayer(after, P1).hand).toHaveLength(hand - 1);
  });

  it("playing a card of cost 2 that is not KIN: the ability generates 1 wild, which does not pay for it alone", () => {
    const { state: seeded, well } = start();
    const { state, id } = giveCard(seeded, P1, STRANGER.id);
    expect(errorOf(state, play(id, [wellUse(well)]))).toBe("insufficient_resources");
    const { state: after, events } = run(state, play(id, [wellUse(well), ...payFor(state, P1, 1)]));
    expect(generated(events)).toEqual([{ abilityId: WELL_ABILITY.ref.id, amount: 1, pool: WILD(1) }]);
    expect(paid(events, id)).toEqual([2]);
    expect(mustPlayer(after, P1).playArea).toContain(id);
  });

  it("the 2 wild are all it generates: they do not pay for a KIN card of cost 3 alone", () => {
    const { state: seeded, well } = start();
    const { state, id } = giveCard(seeded, P1, ELDER.id);
    expect(errorOf(state, play(id, [wellUse(well)]))).toBe("insufficient_resources");
    const { events } = run(state, play(id, [wellUse(well), ...payFor(state, P1, 1)]));
    expect(generated(events)).toEqual([{ abilityId: WELL_ABILITY.ref.id, amount: 2, pool: WILD(2) }]);
    expect(paid(events, id)).toEqual([3]);
  });

  it("a cost within a KIN card's ability is paying for that card: 2 wild; within another card's ability: 1", () => {
    const { state: seeded, well } = start();
    const shrine = playerCardIntoPlay(seeded, SHRINE.id);
    const forge = playerCardIntoPlay(shrine.state, FORGE.id);
    const state = forge.state;
    const { state: after, events } = run(state, use(shrine.id, SHRINE_ABILITY.ref.id, [wellUse(well)]));
    expect(generated(events)).toEqual([{ abilityId: WELL_ABILITY.ref.id, amount: 2, pool: WILD(2) }]);
    expect(villainDamage(after)).toBe(villainDamage(state) + 3);

    expect(errorOf(state, use(forge.id, FORGE_ABILITY.ref.id, [wellUse(well)]))).toBe("insufficient_resources");
    const other = run(state, use(forge.id, FORGE_ABILITY.ref.id, [wellUse(well), ...payFor(state, P1, 1)]));
    expect(generated(other.events)).toEqual([{ abilityId: WELL_ABILITY.ref.id, amount: 1, pool: WILD(1) }]);
  });

  it("the payment prompt shows what it generates for the card in question, and suggests it alone when that pays", () => {
    const { state: seeded, well } = start();
    const cousin = giveCard(seeded, P1, COUSIN.id);
    const stranger = giveCard(cousin.state, P1, STRANGER.id);
    const state = stranger.state;
    const sourceFor = (id: InstanceId) =>
      paymentFor(state, P1, { kind: "playCard", instanceId: id }, {}, deps)!.sources.find((s) => s.instanceId === well);
    expect(sourceFor(cousin.id)).toMatchObject({ kind: "resourceAbility", pool: WILD(2) });
    expect(sourceFor(stranger.id)).toMatchObject({ kind: "resourceAbility", pool: WILD(1) });
    const query = paymentFor(state, P1, { kind: "playCard", instanceId: cousin.id }, {}, deps)!;
    expect(query.suggested).toEqual([`ability:${well}:${WELL_ABILITY.ref.id}`]);
    const other = paymentFor(state, P1, { kind: "playCard", instanceId: stranger.id }, {}, deps)!;
    expect(other.suggested).toHaveLength(2);
  });

  it("exhausted, it cannot pay its own cost: it is no payment source and a payment naming it is refused", () => {
    const { state: seeded, well } = start();
    const given = giveCard(seeded, P1, COUSIN.id);
    const state: GameState = {
      ...given.state,
      instances: { ...given.state.instances, [well]: { ...mustInstance(given.state, well), exhausted: true } },
    };
    const query = paymentFor(state, P1, { kind: "playCard", instanceId: given.id }, {}, deps)!;
    expect(query.sources.some((s) => s.instanceId === well)).toBe(false);
    expect(errorOf(state, play(given.id, [wellUse(well)]))).toBe("already_exhausted");
  });

  it("a hand card's `handGenerates` reads the same slot: 2 wild toward a KIN card, 1 toward another", () => {
    const { state: seeded } = start();
    const spark = giveCard(seeded, P1, SPARK.id);
    const cousin = giveCard(spark.state, P1, COUSIN.id);
    const stranger = giveCard(cousin.state, P1, STRANGER.id);
    const state = stranger.state;
    expect(errorOf(state, play(stranger.id, [{ fromHand: spark.id }]))).toBe("insufficient_resources");
    const { state: after, events } = run(state, play(cousin.id, [{ fromHand: spark.id }]));
    expect(paid(events, cousin.id)).toEqual([2]);
    expect(mustPlayer(after, P1).playArea).toContain(cousin.id);
    expect(mustPlayer(after, P1).discard).toContain(spark.id);
  });
});
