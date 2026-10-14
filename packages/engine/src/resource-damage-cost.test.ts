/**
 * docs/phase7-wave10-hero-packs.md H3.14: a resource whose own cost takes a chosen amount of damage and whose
 * resources read that amount, on synthetic cards shaped like Energy Siphon (`wonder_man` 58006: "Hero Interrupt: When
 * you spend this card, take up to 3 damage → this card generates 1 additional [energy] resource for each damage taken
 * this way."). The amount travels in the payment (`SpentCardAbilityUse.costSelection.damageSelf`,
 * `ResourceAbilityUse.costSelection.damageSelf`), so what the use generates is known as the payment is priced.
 *
 * Sources: RRG 1.8 "Initiating Abilities" (p. 24): the cost is determined and paid (steps 3, 5) before the effect,
 * generating resources (step 6). "Cost" (p. 14): "If taking damage is a cost, that cost is not considered paid unless
 * all of that damage was taken", and "up to" some number in a cost "requires a minimum of one". FAQ "Focused Rage
 * (#27)" (p. 57): a cost a tough status card would prevent "cannot be paid".
 */

import { describe, expect, it } from "vitest";
import type { AbilityCost, EngineDeps } from "./abilities.js";
import { paymentOptions, paymentsFromOptionIds, resourceAbilityOptionId, spentCardOptionId } from "./actions.js";
import type { Command, Payment } from "./commands.js";
import { createCtx } from "./ctx.js";
import { applyCommand, replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { legalActions, paymentFor, tryPayment } from "./legal.js";
import { activeVillain, mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommandsPicking } from "./testing/drive.js";
import { stubEvent, stubResource, stubSupport } from "./testing/fixtures.js";
import { defaultPick, giveCard, RESOURCE } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, P1, playerCardIntoPlay } from "./testing/wave3.js";

const TAKEN = { kind: "var", name: "cost.damageSelf" } as const;
const upTo = (max: number): AbilityCost => ({
  damageSelf: { choose: { min: { kind: "const", value: 1 }, max: { kind: "const", value: max } } },
});

/** "Interrupt: When you spend this card, take up to 3 damage → 1 additional [energy] for each damage taken this way." */
const SIPHON_ABILITY = stubAbility("siphon.spent", {
  trigger: { kind: "resource", whenSpent: true },
  cost: upTo(3),
  generates: { kind: "amount", resource: "energy", amount: TAKEN },
  effects: [],
});
const SIPHON = stubResource({ id: "siphon", icons: 1, produces: { energy: 1 }, abilities: [SIPHON_ABILITY.ref] });
/** "Resource: Exhaust this card and take up to 2 damage → generate a [physical] resource for each damage taken." */
const VEIN_ABILITY = stubAbility("vein.resource", {
  trigger: { kind: "resource" },
  cost: { exhaustSelf: true, ...upTo(2) },
  generates: { kind: "amount", resource: "physical", amount: TAKEN },
  effects: [],
});
const VEIN = stubSupport({ id: "vein", cost: 0, abilities: [VEIN_ABILITY.ref] });
/** "Action: Take up to 3 damage → deal that much damage to the villain." */
const LASH_ABILITY = stubAbility("lash.action", {
  trigger: { kind: "action" },
  cost: upTo(3),
  effects: [{ kind: "dealDamage", target: { kind: "villain" }, amount: TAKEN }],
});
const LASH = stubSupport({ id: "lash", cost: 0, abilities: [LASH_ABILITY.ref] });

/** Events costing 2, 3 and 4 that deal 1 damage to the villain. */
const PING: EffectSpec = { kind: "dealDamage", target: { kind: "villain" }, amount: { kind: "const", value: 1 } };
const ping = stubAbility("ping.action", { trigger: { kind: "action" }, effects: [PING] });
const TWO = stubEvent({ id: "cost-two", cost: 2, abilities: [ping.ref] });
const THREE = stubEvent({ id: "cost-three", cost: 3, abilities: [ping.ref] });
const FOUR = stubEvent({ id: "cost-four", cost: 4, abilities: [ping.ref] });
const FIVE = stubEvent({ id: "cost-five", cost: 5, abilities: [ping.ref] });

const CARDS = [SIPHON, VEIN, LASH, TWO, THREE, FOUR, FIVE];
const deps: EngineDeps = depsOf(SIPHON_ABILITY, VEIN_ABILITY, LASH_ABILITY, ping);

/** A game at the first turn whose hand is exactly one Siphon and `event`. */
function start(event: { readonly id: string }) {
  const base = gameAtFirstTurn({ cards: CARDS, deps, deck: [...CARDS.map((c) => c.id), ...copiesOf(RESOURCE.id, 3)] });
  const siphon = giveCard(base, P1, SIPHON.id);
  const played = giveCard(siphon.state, P1, event.id);
  const state: GameState = {
    ...played.state,
    players: played.state.players.map((p) => (p.playerId === P1 ? { ...p, hand: [siphon.id, played.id] } : p)),
  };
  return { state, siphon: siphon.id, event: played.id };
}
const spend = (siphon: InstanceId, damage?: number): Payment => ({
  fromHand: siphon,
  whenSpent: {
    abilityId: SIPHON_ABILITY.ref.id,
    ...(damage === undefined ? {} : { costSelection: { damageSelf: damage } }),
  },
});
const play = (id: InstanceId, payment: readonly Payment[]): Command => ({
  type: "playCard",
  playerId: P1,
  cardInstanceId: id,
  payment,
  attachToInstanceId: null,
});

function run(state: GameState, command: Command) {
  const asked: string[] = [];
  const pick = (current: GameState) => {
    if (current.pendingChoice) asked.push(current.pendingChoice.prompt.kind);
    return defaultPick(current);
  };
  const { state: after, events, session } = runCommandsPicking(state, deps, pick, command);
  const replayed = replay(session.log, deps);
  if (!replayed.ok) throw new Error(replayed.error.message);
  expect(replayed.state).toEqual(after);
  return { state: after, events, asked };
}
const errorOf = (state: GameState, command: Command): string => {
  const result = applyCommand(state, command, deps);
  return result.ok ? "ok" : result.error.code;
};
const identityOf = (state: GameState): InstanceId => mustPlayer(state, P1).identity.instanceId;
const identityDamage = (state: GameState): number => mustInstance(state, identityOf(state)).damage;
const villainDamage = (state: GameState): number => mustInstance(state, activeVillain(state).instanceId).damage;
const generated = (events: readonly GameEvent[]) =>
  events.flatMap((e) => (e.type === "resourcesGenerated" ? [{ amount: e.amount, pool: e.pool }] : []));
const paid = (events: readonly GameEvent[], id: InstanceId) =>
  events.flatMap((e) => (e.type === "cardPlayed" && e.instanceId === id ? [e.resourcesPaid] : []));
const settled = (events: readonly GameEvent[]) =>
  events.flatMap((e) => (e.type === "costDamageSettled" ? [{ amount: e.amount, taken: e.taken, paid: e.paid }] : []));
const ENERGY = (n: number) => ({ physical: 0, mental: 0, energy: n, wild: 0 });
const withIdentity = (state: GameState, change: { damage?: number; tough?: number }): GameState => {
  const id = identityOf(state);
  const instance = mustInstance(state, id);
  return {
    ...state,
    instances: {
      ...state.instances,
      [id]: {
        ...instance,
        damage: change.damage ?? instance.damage,
        statuses: { ...instance.statuses, tough: change.tough ?? instance.statuses.tough },
      },
    },
  };
};

describe("H3.14 a when-spent resource that takes a chosen amount of damage", () => {
  it.each([
    [1, TWO],
    [2, THREE],
    [3, FOUR],
  ] as const)(
    "taking %i: that much damage on the identity, that much energy beside the card's own 1, and no choice is asked",
    (damage, event) => {
      const { state, siphon, event: id } = start(event);
      const { state: after, events, asked } = run(state, play(id, [spend(siphon, damage)]));
      expect(identityDamage(after)).toBe(damage);
      expect(generated(events)).toEqual([{ amount: damage, pool: ENERGY(damage) }]);
      expect(paid(events, id)).toEqual([1 + damage]);
      expect(settled(events)).toEqual([{ amount: damage, taken: damage, paid: true }]);
      expect(mustPlayer(after, P1).discard).toEqual(expect.arrayContaining([siphon, id]));
      expect(villainDamage(after)).toBe(1);
      expect(asked).not.toContain("chooseNumber");
    },
  );

  it("the damage is taken before the card paid for resolves", () => {
    const { state, siphon, event } = start(TWO);
    const { state: after, events } = run(state, play(event, [spend(siphon, 1)]));
    const taken = events.findIndex((e) => e.type === "damageDealt" && e.targetInstanceId === identityOf(after));
    const dealt = events.findIndex(
      (e) => e.type === "damageDealt" && e.targetInstanceId === activeVillain(after).instanceId,
    );
    expect(taken).toBeGreaterThan(-1);
    expect(dealt).toBeGreaterThan(taken);
  });

  it("the cap and the floor: 4 and 0 are refused, and one short of the cost is refused whole with nothing taken", () => {
    const { state, siphon, event } = start(FIVE);
    expect(errorOf(state, play(event, [spend(siphon, 4)]))).toBe("invalid_choice");
    expect(errorOf(state, play(event, [spend(siphon, 0)]))).toBe("invalid_choice");
    expect(errorOf(state, play(event, [spend(siphon, 3)]))).toBe("insufficient_resources");
    expect(identityDamage(state)).toBe(0);
  });

  it("with no amount named it takes the least it may (1): the engine does not take unnamed damage for the player", () => {
    const { state, siphon, event } = start(TWO);
    const { state: after, events } = run(state, play(event, [spend(siphon)]));
    expect(identityDamage(after)).toBe(1);
    expect(generated(events)).toEqual([{ amount: 1, pool: ENERGY(1) }]);
  });

  it("spent plainly it is the card's 1 energy: no damage, nothing generated by the ability", () => {
    const { state, siphon, event } = start(TWO);
    expect(errorOf(state, play(event, [{ fromHand: siphon }]))).toBe("insufficient_resources");
    const one = start(LASH);
    const { state: after, events } = run(one.state, play(one.event, [{ fromHand: one.siphon }]));
    expect(identityDamage(after)).toBe(0);
    expect(generated(events)).toEqual([]);
    expect(mustPlayer(after, P1).discard).toContain(one.siphon);
  });
});

describe("H3.14 the payment prompt: one option per amount", () => {
  it("lists the plain spending and one use per amount, each with its pool, its selection and its option id", () => {
    const { state, siphon, event } = start(FOUR);
    const query = paymentFor(state, P1, { kind: "playCard", instanceId: event }, {}, deps)!;
    const of = query.sources.filter((s) => s.instanceId === siphon);
    const id = (n: number) => `hand:${siphon}:${SIPHON_ABILITY.ref.id}@#damageSelf=${n}`;
    expect(of.map((s) => [s.optionId, s.kind, s.pool, s.costSelection, s.spendsHandCard])).toEqual([
      [`hand:${siphon}`, "handCard", ENERGY(1), undefined, undefined],
      [id(1), "resourceAbility", ENERGY(2), { damageSelf: 1 }, true],
      [id(2), "resourceAbility", ENERGY(3), { damageSelf: 2 }, true],
      [id(3), "resourceAbility", ENERGY(4), { damageSelf: 3 }, true],
    ]);
    const labels = paymentOptions(createCtx(state, deps), P1, event).filter((o) =>
      o.optionId.startsWith(id(1).slice(0, -1)),
    );
    expect(labels.map((o) => o.label)).toEqual([
      "siphon (take 1 damage)",
      "siphon (take 2 damage)",
      "siphon (take 3 damage)",
    ]);
  });

  it("an option id round-trips to the payment entry, and `tryPayment` builds the accepted command from it", () => {
    const { state, siphon, event } = start(FOUR);
    const entry = spend(siphon, 3) as Extract<Payment, { fromHand: InstanceId }>;
    const optionId = spentCardOptionId(entry);
    expect(optionId).toBe(`hand:${siphon}:${SIPHON_ABILITY.ref.id}@#damageSelf=3`);
    expect(paymentsFromOptionIds([optionId])).toEqual([entry]);
    const attempt = tryPayment(state, P1, { kind: "playCard", instanceId: event }, [optionId], {}, deps);
    expect(attempt.ok).toBe(true);
    if (attempt.ok) expect(attempt.command).toMatchObject({ type: "playCard", payment: [entry] });
    const short = tryPayment(state, P1, { kind: "playCard", instanceId: event }, [`hand:${siphon}`], {}, deps);
    expect(short.ok).toBe(false);
  });

  it("the suggested payment and the legal action's example take the least damage that pays", () => {
    const { state, siphon, event } = start(THREE);
    const query = paymentFor(state, P1, { kind: "playCard", instanceId: event }, {}, deps)!;
    expect(query.suggested).toEqual([`hand:${siphon}:${SIPHON_ABILITY.ref.id}@#damageSelf=2`]);
    const actions = legalActions(state, P1, deps);
    if (actions.kind !== "turn") throw new Error(actions.kind);
    const legal = actions.legal.find((a) => a.action.kind === "playCard" && a.action.instanceId === event);
    expect(legal?.example).toMatchObject({ payment: [spend(siphon, 2)] });
    // A card it cannot pay for even at the most is not offered.
    const five = start(FIVE);
    const all = legalActions(five.state, P1, deps);
    if (all.kind !== "turn") throw new Error(all.kind);
    expect(all.legal.some((a) => a.action.kind === "playCard" && a.action.instanceId === five.event)).toBe(false);
  });

  it("a tough status card: the damage could not be taken, so no use is offered and one named is refused; the plain spending stays", () => {
    const seeded = start(TWO);
    const state = withIdentity(seeded.state, { tough: 1 });
    const query = paymentFor(state, P1, { kind: "playCard", instanceId: seeded.event }, {}, deps)!;
    expect(query.sources.filter((s) => s.instanceId === seeded.siphon).map((s) => s.optionId)).toEqual([
      `hand:${seeded.siphon}`,
    ]);
    expect(errorOf(state, play(seeded.event, [spend(seeded.siphon, 1)]))).toBe("insufficient_resources");
    expect(mustInstance(state, identityOf(state)).statuses.tough).toBe(1);
  });

  it("hit points do not limit it: with 1 hit point left every amount is still offered (damage past it is still taken)", () => {
    const seeded = start(FOUR);
    const state = withIdentity(seeded.state, { damage: 9 });
    const query = paymentFor(state, P1, { kind: "playCard", instanceId: seeded.event }, {}, deps)!;
    expect(query.sources.filter((s) => s.instanceId === seeded.siphon).map((s) => s.costSelection?.damageSelf)).toEqual(
      [undefined, 1, 2, 3],
    );
  });
});

describe("H3.14 the same cost on a resource ability in play, and named on an action", () => {
  it("in play: the plain option takes the least, each larger amount is its own option, and the amount is what it generates", () => {
    const seeded = start(THREE);
    const vein = playerCardIntoPlay(seeded.state, VEIN.id);
    const state = vein.state;
    const ids = paymentOptions(createCtx(state, deps), P1, seeded.event)
      .filter((o) => o.ref.kind === "ability" && o.ref.instanceId === vein.id)
      .map((o) => [o.optionId, o.label]);
    const two = resourceAbilityOptionId({
      instanceId: vein.id,
      abilityId: VEIN_ABILITY.ref.id,
      costSelection: { damageSelf: 2 },
    });
    expect(two).toBe(`ability:${vein.id}:${VEIN_ABILITY.ref.id}@#damageSelf=2`);
    expect(ids).toEqual([
      [`ability:${vein.id}:${VEIN_ABILITY.ref.id}`, "vein (take 1 damage)"],
      [two, "vein (take 2 damage)"],
    ]);
    expect(paymentsFromOptionIds([two])).toEqual([
      { ability: { instanceId: vein.id, abilityId: VEIN_ABILITY.ref.id, costSelection: { damageSelf: 2 } } },
    ]);
    const { state: after, events } = run(
      state,
      play(seeded.event, [...paymentsFromOptionIds([two]), { fromHand: seeded.siphon }]),
    );
    expect(identityDamage(after)).toBe(2);
    expect(generated(events)).toEqual([{ amount: 2, pool: { physical: 2, mental: 0, energy: 0, wild: 0 } }]);
    expect(mustInstance(after, vein.id).exhausted).toBe(true);
    expect(paid(events, seeded.event)).toEqual([3]);
  });

  it("an action's chosen damage cost named on the command is paid with that amount and not asked", () => {
    const seeded = start(TWO);
    const lash = playerCardIntoPlay(seeded.state, LASH.id);
    const command: Command = {
      type: "useAbility",
      playerId: P1,
      cardInstanceId: lash.id,
      abilityId: LASH_ABILITY.ref.id,
      payment: [],
      costSelection: { damageSelf: 2 },
    };
    const { state: after, asked } = run(lash.state, command);
    expect(identityDamage(after)).toBe(2);
    expect(villainDamage(after)).toBe(2);
    expect(asked).not.toContain("chooseNumber");
    expect(errorOf(lash.state, { ...command, costSelection: { damageSelf: 4 } })).toBe("invalid_choice");
    // Unnamed, the payer is asked as before.
    const { asked: unnamed } = run(lash.state, { ...command, costSelection: {} });
    expect(unnamed).toContain("chooseNumber");
  });
});
