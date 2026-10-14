/**
 * `RuleSpec additionalAttackCost` (docs/phase7-wave10-hero-packs.md H3.16; `attack-cost.ts`): a cost a rule adds to
 * every attack a player makes against one enemy. Synthetic cards: a side scheme shaped like "As an additional cost to
 * attack reaper, you must discard 1 card from your hand", and the kinds of attack a player makes.
 *
 * Sources: RRG 1.8 "Cost" (p. 14: an additional cost is paid with the cost it is added to, all of it or none);
 * "Attack (Player Ability Type)" (p. 10: an "(attack)" ability attacks its target and is one attack however many
 * instances of damage it deals); "Labeled Ability" (p. 26: by the player's identity); "Stun, Stunned" (p. 41: the costs
 * of a stunned attack attempt are still paid).
 */

import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps, RuleSpec } from "./abilities.js";
import type { Command } from "./commands.js";
import { applyCommand, replay, startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { legalActions } from "./legal.js";
import { mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubAlly, stubEvent, stubMinion, stubSideScheme } from "./testing/fixtures.js";
import { defaultPick, giveCard, TREACHERY } from "./testing/scenario.js";
import {
  copiesOf,
  encounterCardInVillainArea,
  gameAtFirstTurn,
  minionEngagedWith,
  P1,
  P2,
  playerCardIntoPlay,
} from "./testing/wave3.js";

const def = (definition: AbilityDefinition) => definition;
const n = (value: number) => ({ kind: "const", value }) as const;
const chosen = (slot: string): TargetRef => ({ kind: "slot", slot });
const anEnemy: EffectSpec = {
  kind: "chooseTarget",
  slot: "enemy",
  query: { categories: ["enemy"] },
  chooser: { kind: "controller" },
};
const ruleCard = (id: string, rule: RuleSpec) => {
  const ability = stubAbility(`${id}.constant`, def({ trigger: { kind: "constant", rules: [rule] }, effects: [] }));
  return { ability, card: stubSideScheme({ id, startingThreat: 5, abilities: [ability.ref] }) };
};
const discardOne = { discardFromHand: { min: 1, max: 1 } } as const;
// "As an additional cost to attack reaper, you must discard 1 card from your hand."
const FEUD = ruleCard("feud", { kind: "additionalAttackCost", target: { name: "reaper" }, cost: discardOne });
// A second card with the same text: two costs on one enemy.
const GRUDGE = ruleCard("grudge", { kind: "additionalAttackCost", target: { name: "reaper" }, cost: discardOne });

const REAPER = stubMinion({ id: "reaper", atk: 1, sch: 1, hp: 9, boostIcons: 0 });
const THUG = stubMinion({ id: "thug", atk: 1, sch: 1, hp: 9, boostIcons: 0 });
const PAL = stubAlly({ id: "pal", cost: 0, atk: 1, thw: 1, hp: 3 });

const event = (id: string, definition: AbilityDefinition) => {
  const ability = stubAbility(`${id}.action`, definition);
  return { ability, card: stubEvent({ id, cost: 0, abilities: [ability.ref] }) };
};
// "Hero Action (attack): Deal 4 damage to an enemy."
const BLAST = event("blast", {
  trigger: { kind: "action" },
  label: ["attack"],
  effects: [anEnemy, { kind: "dealDamage", target: chosen("enemy"), amount: n(4) }],
});
// "Hero Action (attack): Deal 1 damage to each enemy. Deal 1 damage to each minion." (one attack, two instances)
const SWEEP = event("sweep", {
  trigger: { kind: "action" },
  label: ["attack"],
  effects: [
    { kind: "dealDamage", target: { kind: "each", query: { categories: ["enemy"] } }, amount: n(1) },
    { kind: "dealDamage", target: { kind: "each", query: { categories: ["minion"] } }, amount: n(1) },
  ],
});
// "Action: Deal 2 damage to an enemy." No label: not an attack.
const DART = event("dart", {
  trigger: { kind: "action" },
  effects: [anEnemy, { kind: "dealDamage", target: chosen("enemy"), amount: n(2) }],
});
// "Hero Action (attack): Choose an enemy. Your hero attacks that enemy for 3." (an `attack` effect)
const STRIKE = event("strike", {
  trigger: { kind: "action" },
  label: ["attack"],
  effects: [anEnemy, { kind: "attack", target: chosen("enemy"), amount: n(3) }],
});
const EVENTS = [BLAST, SWEEP, DART, STRIKE];

const deps: EngineDeps = depsOf(FEUD.ability, GRUDGE.ability, ...EVENTS.map((e) => e.ability));

interface Table {
  readonly state: GameState;
  readonly hero: InstanceId;
  readonly villain: InstanceId;
  readonly reaper: InstanceId;
  readonly thug: InstanceId;
  readonly pal: InstanceId;
  readonly feud: InstanceId | null;
}

/**
 * The first player in hero form with `hand` cards (blank resources, then `cards`), an ally, and both minions engaged.
 * `rules`: which of the two rule cards are in play.
 */
function start(
  hand: number,
  opts: { readonly cards?: readonly string[]; readonly rules?: readonly string[]; readonly players?: 1 | 2 } = {},
): Table {
  const rules = opts.rules ?? ["feud"];
  const base = gameAtFirstTurn({
    cards: [REAPER, THUG, PAL, FEUD.card, GRUDGE.card, ...EVENTS.map((e) => e.card)],
    deps,
    encounter: [...copiesOf(TREACHERY.id, 25), REAPER.id, THUG.id, FEUD.card.id, GRUDGE.card.id],
    deck: [PAL.id, ...EVENTS.map((e) => e.card.id)],
    players: opts.players ?? 1,
  });
  let state: GameState = {
    ...base,
    players: base.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" } })),
  };
  const pal = playerCardIntoPlay(state, PAL.id);
  const reaper = minionEngagedWith(pal.state, REAPER.id);
  const thug = minionEngagedWith(reaper.state, THUG.id);
  state = thug.state;
  let feud: InstanceId | null = null;
  for (const rule of rules) {
    const placed = encounterCardInVillainArea(state, rule === "feud" ? FEUD.card.id : GRUDGE.card.id, 5);
    state = placed.state;
    if (rule === "feud") feud = placed.id;
  }
  // The hand: exactly `hand` cards, the named ones last. The rest goes back on the deck.
  const named: InstanceId[] = [];
  for (const card of opts.cards ?? []) {
    const given = giveCard(state, P1, card, named);
    state = given.state;
    named.push(given.id);
  }
  const seat = mustPlayer(state, P1);
  const others = seat.hand.filter((id) => !named.includes(id));
  const kept = others.slice(0, Math.max(0, hand - named.length));
  const returned = others.filter((id) => !kept.includes(id));
  state = {
    ...state,
    players: state.players.map((p) =>
      p.playerId === P1 ? { ...p, hand: [...kept, ...named], deck: [...returned, ...p.deck] } : p,
    ),
  };
  return {
    state,
    hero: seat.identity.instanceId,
    villain: state.villains[0]!.instanceId,
    reaper: reaper.id,
    thug: thug.id,
    pal: pal.id,
    feud,
  };
}

const attack = (attacker: InstanceId, target: InstanceId): Command => ({
  type: "basicAttack",
  playerId: P1,
  attackerInstanceId: attacker,
  targetInstanceId: target,
});
const play = (card: InstanceId): Command => ({
  type: "playCard",
  playerId: P1,
  cardInstanceId: card,
  payment: [],
  attachToInstanceId: null,
});
const handOf = (state: GameState): readonly InstanceId[] => mustPlayer(state, P1).hand;
const cardIn = (state: GameState, id: string): InstanceId => {
  const found = handOf(state).find((card) => mustInstance(state, card).cardId === id);
  if (!found) throw new Error(`no ${id} in hand`);
  return found;
};
const damageOn = (state: GameState, id: InstanceId): number => mustInstance(state, id).damage;
const paid = (events: readonly GameEvent[]) => events.filter((e) => e.type === "additionalAttackCostPaid");
const discarded = (events: readonly GameEvent[]): InstanceId[] =>
  events.flatMap((e) => (e.type === "cardDiscardedFromHand" ? [e.instanceId] : []));
/** The cards each target choice offered, in order. */
const offered = (events: readonly GameEvent[], slot: string): InstanceId[][] =>
  events.flatMap((e) =>
    e.type === "choiceRequested" && e.choice.prompt.kind === "chooseTarget" && e.choice.prompt.slot === slot
      ? [e.choice.options.map((option) => option.optionId as InstanceId)]
      : [],
  );
/** Answers the "choose an enemy" of an event with `enemy` and a discard with `discard`; everything else by default. */
const picking =
  (enemy: InstanceId | null, discard: InstanceId | null = null) =>
  (state: GameState): readonly string[] => {
    const prompt = state.pendingChoice?.prompt;
    if (prompt?.kind === "chooseTarget" && prompt.slot === "enemy" && enemy) return [enemy];
    if (prompt?.kind === "chooseTarget" && prompt.slot === "discard" && discard) return [discard];
    return defaultPick(state);
  };
function run(state: GameState, command: Command, pick: (state: GameState) => readonly string[] = defaultPick) {
  const { session, events } = driveSession(startSession(state), deps, [command], pick);
  const replayed = replay(session.log, deps);
  if (!replayed.ok) throw new Error(replayed.error.message);
  expect(replayed.state).toEqual(session.state);
  return { state: session.state, events };
}
const basicTargets = (state: GameState, attacker: InstanceId): readonly InstanceId[] => {
  const legal = legalActions(state, P1, deps);
  if (legal.kind !== "turn") throw new Error(`expected a turn, got ${legal.kind}`);
  const action = legal.legal.find((a) => a.example.type === "basicAttack" && a.example.attackerInstanceId === attacker);
  return action?.targets ?? [];
};

describe("an additional cost to attack one enemy: a basic attack", () => {
  it("1 card in hand: the card is discarded, then the attack is made", () => {
    const table = start(1);
    const [card] = handOf(table.state);
    const after = run(table.state, attack(table.hero, table.reaper));
    expect(handOf(after.state)).toEqual([]);
    expect(discarded(after.events)).toEqual([card]);
    expect(damageOn(after.state, table.reaper)).toBe(2);
    expect(mustInstance(after.state, table.hero).exhausted).toBe(true);
    expect(paid(after.events)).toEqual([
      {
        type: "additionalAttackCostPaid",
        playerId: P1,
        attackerInstanceId: table.hero,
        targetInstanceId: table.reaper,
        sourceInstanceId: table.feud,
      },
    ]);
  });

  it("the cost is paid before the attack is initiated", () => {
    const table = start(1);
    const { events } = run(table.state, attack(table.hero, table.reaper));
    const cost = events.findIndex((e) => e.type === "additionalAttackCostPaid");
    const initiated = events.findIndex(
      (e) => e.type === "triggerEvent" && e.phase === "initiated" && e.event.kind === "attack",
    );
    expect(cost).toBeGreaterThanOrEqual(0);
    expect(initiated).toBeGreaterThan(cost);
  });

  it("an empty hand: the enemy is no legal target, the attack is refused and the hero does not exhaust", () => {
    const table = start(0);
    const result = applyCommand(table.state, attack(table.hero, table.reaper), deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("insufficient_resources");
      expect(result.error.message).toContain("feud");
    }
    expect(mustInstance(table.state, table.hero).exhausted).toBe(false);
    expect(new Set(basicTargets(table.state, table.hero))).toEqual(new Set([table.villain, table.thug]));
    // Another enemy costs nothing extra.
    const other = run(table.state, attack(table.hero, table.thug));
    expect(damageOn(other.state, table.thug)).toBe(2);
    expect(paid(other.events)).toEqual([]);
  });

  it("several cards in hand: the player picks which one is discarded", () => {
    const table = start(3);
    const [, second] = handOf(table.state);
    const after = run(table.state, attack(table.hero, table.reaper), picking(null, second!));
    expect(discarded(after.events)).toEqual([second]);
    expect(handOf(after.state)).toHaveLength(2);
    expect(offered(after.events, "discard")).toEqual([handOf(table.state)]);
  });

  it("an ally's attack: its controller discards", () => {
    const table = start(1);
    const [card] = handOf(table.state);
    const after = run(table.state, attack(table.pal, table.reaper));
    expect(discarded(after.events)).toEqual([card]);
    expect(damageOn(after.state, table.reaper)).toBe(1);
    expect(paid(after.events)[0]).toMatchObject({ playerId: P1, attackerInstanceId: table.pal });
    const broke = start(0);
    expect(applyCommand(broke.state, attack(broke.pal, broke.reaper), deps).ok).toBe(false);
    expect(basicTargets(broke.state, broke.pal)).not.toContain(broke.reaper);
  });

  it("each attack pays again", () => {
    const table = start(2);
    const first = run(table.state, attack(table.hero, table.reaper));
    const second = run(first.state, attack(table.pal, table.reaper));
    expect(handOf(second.state)).toEqual([]);
    expect(damageOn(second.state, table.reaper)).toBe(3);
  });

  it("two rules on one enemy are each paid, and a hand of one cannot attack it", () => {
    const one = start(1, { rules: ["feud", "grudge"] });
    expect(applyCommand(one.state, attack(one.hero, one.reaper), deps).ok).toBe(false);
    const two = start(2, { rules: ["feud", "grudge"] });
    const after = run(two.state, attack(two.hero, two.reaper));
    expect(handOf(after.state)).toEqual([]);
    expect(paid(after.events)).toHaveLength(2);
    expect(damageOn(after.state, two.reaper)).toBe(2);
  });

  it("without the rule in play nothing is owed", () => {
    const table = start(0, { rules: [] });
    const after = run(table.state, attack(table.hero, table.reaper));
    expect(damageOn(after.state, table.reaper)).toBe(2);
    expect(paid(after.events)).toEqual([]);
  });

  it("a stunned hero's attack is cancelled, and its additional cost is still paid", () => {
    const table = start(1);
    const stunned: GameState = {
      ...table.state,
      instances: {
        ...table.state.instances,
        [table.hero]: { ...mustInstance(table.state, table.hero), statuses: { stunned: 1, confused: 0, tough: 0 } },
      },
    };
    const after = run(stunned, attack(table.hero, table.reaper));
    expect(damageOn(after.state, table.reaper)).toBe(0);
    expect(mustInstance(after.state, table.hero).statuses.stunned).toBe(0);
    expect(handOf(after.state)).toEqual([]);
    expect(paid(after.events)).toHaveLength(1);
  });

  it("another player's attack on the enemy is theirs to pay", () => {
    const table = start(0, { players: 2 });
    // P1's hand is empty; the rule asks whoever attacks, so P1 cannot, whatever P2 holds.
    expect(mustPlayer(table.state, P2).hand.length).toBeGreaterThan(0);
    expect(applyCommand(table.state, attack(table.hero, table.reaper), deps).ok).toBe(false);
  });
});

describe("an additional cost to attack one enemy: an (attack) ability", () => {
  it("as the last card in hand it may not choose that enemy, and may choose another", () => {
    const table = start(1, { cards: ["blast"] });
    const blast = cardIn(table.state, "blast");
    const after = run(table.state, play(blast), picking(table.villain));
    expect(offered(after.events, "enemy")).toEqual([[table.villain, table.thug]]);
    expect(damageOn(after.state, table.villain)).toBe(4);
    expect(paid(after.events)).toEqual([]);
    expect(damageOn(after.state, table.reaper)).toBe(0);
  });

  it("with another card in hand it may choose that enemy: the card is discarded before the damage", () => {
    const table = start(2, { cards: ["blast"] });
    const blast = cardIn(table.state, "blast");
    const other = handOf(table.state).find((id) => id !== blast)!;
    const after = run(table.state, play(blast), picking(table.reaper));
    expect(offered(after.events, "enemy")[0]).toContain(table.reaper);
    expect(damageOn(after.state, table.reaper)).toBe(4);
    expect(handOf(after.state)).toEqual([]);
    const cost = after.events.findIndex((e) => e.type === "cardDiscardedFromHand" && e.instanceId === other);
    const damage = after.events.findIndex((e) => e.type === "damageDealt" && e.targetInstanceId === table.reaper);
    expect(cost).toBeGreaterThanOrEqual(0);
    expect(damage).toBeGreaterThan(cost);
    expect(paid(after.events)[0]).toMatchObject({ attackerInstanceId: table.hero, targetInstanceId: table.reaper });
  });

  it("choosing another enemy costs nothing", () => {
    const table = start(2, { cards: ["blast"] });
    const after = run(table.state, play(cardIn(table.state, "blast")), picking(table.thug));
    expect(damageOn(after.state, table.thug)).toBe(4);
    expect(handOf(after.state)).toHaveLength(1);
    expect(paid(after.events)).toEqual([]);
  });

  it("an attack effect pays the same way, before its 'when you attack' window", () => {
    const table = start(2, { cards: ["strike"] });
    const after = run(table.state, play(cardIn(table.state, "strike")), picking(table.reaper));
    expect(damageOn(after.state, table.reaper)).toBe(3);
    expect(handOf(after.state)).toEqual([]);
    const cost = after.events.findIndex((e) => e.type === "additionalAttackCostPaid");
    const initiated = after.events.findIndex(
      (e) => e.type === "triggerEvent" && e.phase === "initiated" && e.event.kind === "attack",
    );
    expect(cost).toBeGreaterThanOrEqual(0);
    expect(initiated).toBeGreaterThan(cost);
    const broke = start(1, { cards: ["strike"] });
    const without = run(broke.state, play(cardIn(broke.state, "strike")), picking(broke.villain));
    expect(offered(without.events, "enemy")).toEqual([[broke.villain, broke.thug]]);
  });

  it("one ability is one attack: an enemy two of its instructions name is paid for once", () => {
    const table = start(2, { cards: ["sweep"] });
    const after = run(table.state, play(cardIn(table.state, "sweep")));
    expect(damageOn(after.state, table.reaper)).toBe(2);
    expect(damageOn(after.state, table.thug)).toBe(2);
    expect(damageOn(after.state, table.villain)).toBe(1);
    expect(paid(after.events)).toHaveLength(1);
    expect(handOf(after.state)).toEqual([]);
  });

  it("an instruction that names every enemy skips the one that cannot be paid for", () => {
    const table = start(1, { cards: ["sweep"] });
    const after = run(table.state, play(cardIn(table.state, "sweep")));
    expect(damageOn(after.state, table.reaper)).toBe(0);
    expect(damageOn(after.state, table.thug)).toBe(2);
    expect(damageOn(after.state, table.villain)).toBe(1);
    expect(paid(after.events)).toEqual([]);
    const skips = after.events.flatMap((e) => (e.type === "attackTargetSkipped" ? [e.targetInstanceId] : []));
    expect(skips).toEqual([table.reaper, table.reaper]);
  });
});

describe("an additional cost to attack one enemy: damage that is not an attack", () => {
  it("an unlabeled ability's damage to the enemy is free, with an empty hand too", () => {
    const table = start(1, { cards: ["dart"] });
    const after = run(table.state, play(cardIn(table.state, "dart")), picking(table.reaper));
    expect(damageOn(after.state, table.reaper)).toBe(2);
    expect(paid(after.events)).toEqual([]);
    expect(discarded(after.events)).toEqual([]);
  });
});
