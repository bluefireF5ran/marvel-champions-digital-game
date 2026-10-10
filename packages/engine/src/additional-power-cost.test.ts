/**
 * docs/phase7-wave9.md §3.31: `RuleSpec additionalPowerCost`, "As an additional cost for a player to attack, thwart,
 * or defend with an ally, that player must spend 1 resource of any type" (Divided Loyalties, `aos` 50173), with
 * synthetic cards.
 *
 * Sources: RRG 1.8 "Cost" (p. 13): "A player must pay all additional costs simultaneously with the cost that is being
 * added to, even if multiple cards or abilities are adding separate additional costs. A player cannot pay the original
 * cost or any of the additional costs individually; if they cannot pay for all of the costs at once, then they do not
 * pay any of the costs and the effect associated with the costs does not occur." "Defend, Defense" (p. 15): "An ally
 * can exhaust to defend against an enemy attack."
 *
 * The table: one player in hero form (ATK 2, THW 2, DEF 2), an ally (ATK 2, THW 1, 9 hit points) in play, the taxing
 * side scheme in the villain's area with 5 threat, the villain attacking for 2 with boost cards of 0 icons. Every
 * card in hand is worth 1 resource.
 */

import { flat } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps, RuleSpec } from "./abilities.js";
import type { Command } from "./commands.js";
import { applyCommand, type GameSession, replay, sessionApply, startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { legalActions, paymentFor, tryPayment } from "./legal.js";
import { mustInstance, mustPlayer } from "./query.js";
import { abilityCostFor, additionalPowerCostFor } from "./rules.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { stubAlly, stubMinion, stubSideScheme, stubSupport, stubTreachery, stubVillain } from "./testing/fixtures.js";
import { defaultPick } from "./testing/scenario.js";
import {
  copiesOf,
  encounterCardInVillainArea,
  gameAtFirstTurn,
  minionEngagedWith,
  P1,
  playerCardIntoPlay,
} from "./testing/wave3.js";
import { choiceExclusions } from "./why-not.js";

const def = (definition: AbilityDefinition) => definition;
type Power = (RuleSpec & { kind: "additionalPowerCost" })["powers"][number];
const tax = (powers: readonly Power[], resources = 1): RuleSpec => ({
  kind: "additionalPowerCost",
  character: { categories: ["ally"] },
  powers,
  resources,
});

/** Divided Loyalties' shape. */
const TAX = stubAbility(
  "tax.constant",
  def({ trigger: { kind: "constant", rules: [tax(["attack", "thwart", "defend"])] }, effects: [] }),
);
/** The same over attacks only. */
const ATTACK_TAX = stubAbility(
  "attack-tax.constant",
  def({ trigger: { kind: "constant", rules: [tax(["attack"])] }, effects: [] }),
);
/** "Action: You make a basic attack or thwart with a character you control." */
const ORDER = stubAbility(
  "order.action",
  def({
    trigger: { kind: "action" },
    effects: [{ kind: "basicPowerBy", player: { kind: "controller" }, powers: ["attack"] }],
  }),
);

const TAX_SCHEME = stubSideScheme({ id: "tax-scheme", startingThreat: 5, boostIcons: 0, abilities: [TAX.ref] });
const ATTACK_TAX_SCHEME = stubSideScheme({
  id: "attack-tax-scheme",
  startingThreat: 5,
  boostIcons: 0,
  abilities: [ATTACK_TAX.ref],
});
const GUARD = stubAlly({ id: "guard-ally", cost: 0, atk: 2, thw: 1, hp: 9 });
const RADIO = stubSupport({ id: "radio", cost: 0, abilities: [ORDER.ref] });
const THUG = stubMinion({ id: "thug", atk: 1, sch: 0, hp: 9, boostIcons: 0 });
const BLANK = stubTreachery({ id: "blank", boostIcons: 0 });
const BOSS = stubVillain({ id: "boss", stages: [{ hp: flat(50), atk: 2, sch: 0 }] });

// --- §4.1 Q48 = B: an ally's own "(attack)" / "(thwart)" ability, and an ally an effect declares the defender ------
const three = { kind: "const", value: 3 } as const;
const one = { kind: "const", value: 1 } as const;
const allies = { kind: "each", query: { categories: ["ally"] } } as const;
/** "Action (attack): Exhaust this ally → deal 3 damage to the villain." */
const STRIKE = stubAbility(
  "striker.attack",
  def({
    trigger: { kind: "action" },
    label: ["attack"],
    cost: { exhaustSelf: true },
    effects: [{ kind: "dealDamage", target: { kind: "villain" }, amount: three }],
  }),
);
/** "Action (thwart): Remove 1 threat from each side scheme." No cost of its own. */
const SNEAK = stubAbility(
  "striker.thwart",
  def({
    trigger: { kind: "action" },
    label: ["thwart"],
    effects: [{ kind: "removeThreat", target: { kind: "each", query: { categories: ["sideScheme"] } }, amount: one }],
  }),
);
/** "Action: Deal 1 damage to the villain." No label. */
const POKE = stubAbility(
  "striker.plain",
  def({
    trigger: { kind: "action" },
    effects: [{ kind: "dealDamage", target: { kind: "villain" }, amount: one }],
  }),
);
/** "Response (attack): After you thwart, deal 3 damage to the villain." No cost of its own. */
const FOLLOW_UP = stubAbility(
  "follower.response",
  def({
    trigger: { kind: "response", forced: false, on: { on: "thwart", playerIs: "controller" } },
    label: ["attack"],
    effects: [{ kind: "dealDamage", target: { kind: "villain" }, amount: three }],
  }),
);
/** "Forced Response (attack): After you thwart, deal 3 damage to the villain." */
const ZEAL = stubAbility(
  "zealot.forced",
  def({
    trigger: { kind: "response", forced: true, on: { on: "thwart", playerIs: "controller" } },
    label: ["attack"],
    effects: [{ kind: "dealDamage", target: { kind: "villain" }, amount: three }],
  }),
);
/** "Interrupt: When an enemy attacks you, exhaust an ally you control and declare it the defender." */
const COVER = stubAbility(
  "cover.interrupt",
  def({
    trigger: {
      kind: "interrupt",
      forced: true,
      on: { on: "enemyAttack", playerIs: "controller", usesAttackedPlayer: true },
    },
    effects: [{ kind: "declareDefender", character: allies, exhaust: true }],
  }),
);
/** The same once the attack's procedure runs: "When a boost card is turned faceup, exhaust an ally and declare it …". */
const LATE_COVER = stubAbility(
  "late-cover.interrupt",
  def({
    trigger: { kind: "interrupt", forced: true, on: { on: "boostCardTurnedFaceup", activation: "attack" } },
    effects: [{ kind: "declareDefender", character: allies, exhaust: true }],
  }),
);
const STRIKER = stubAlly({
  id: "striker-ally",
  cost: 0,
  atk: 1,
  thw: 1,
  hp: 9,
  resources: 1,
  abilities: [STRIKE.ref, SNEAK.ref, POKE.ref],
});
const FOLLOWER = stubAlly({
  id: "follower-ally",
  cost: 0,
  atk: 1,
  thw: 1,
  hp: 9,
  resources: 1,
  abilities: [FOLLOW_UP.ref],
});
const ZEALOT = stubAlly({ id: "zealot-ally", cost: 0, atk: 1, thw: 1, hp: 9, resources: 1, abilities: [ZEAL.ref] });
/** The same "(attack)" action on a card that is not an ally. */
const TURRET = stubSupport({ id: "turret", cost: 0, resources: 1, abilities: [STRIKE.ref] });
const COVER_CALL = stubSupport({ id: "cover-call", cost: 0, resources: 1, abilities: [COVER.ref] });
const LATE_CALL = stubSupport({ id: "late-call", cost: 0, resources: 1, abilities: [LATE_COVER.ref] });

const deps: EngineDeps = depsOf(TAX, ATTACK_TAX, ORDER, STRIKE, SNEAK, POKE, FOLLOW_UP, ZEAL, COVER, LATE_COVER);
const CARDS = [
  TAX_SCHEME,
  ATTACK_TAX_SCHEME,
  GUARD,
  RADIO,
  THUG,
  BLANK,
  STRIKER,
  FOLLOWER,
  ZEALOT,
  TURRET,
  COVER_CALL,
  LATE_CALL,
];

/** P1's hand cut to its first `size` cards (surgery); the rest go to the discard pile. */
function handOfSize(state: GameState, size: number): GameState {
  const seat = mustPlayer(state, P1);
  const rest = seat.hand.slice(size);
  return {
    ...state,
    players: state.players.map((p) =>
      p.playerId === P1 ? { ...p, hand: seat.hand.slice(0, size), discard: [...rest, ...p.discard] } : p,
    ),
  };
}

interface Table {
  readonly state: GameState;
  readonly hero: InstanceId;
  readonly ally: InstanceId;
  readonly scheme: InstanceId;
  readonly villain: InstanceId;
  readonly radio: InstanceId;
}
/** The first player's turn, hero form, the ally and the radio in play, `scheme` in the villain's area, `hand` cards. */
function table(hand: number, scheme: { readonly id: string } | null = TAX_SCHEME): Table {
  let state = gameAtFirstTurn({
    cards: CARDS,
    deps,
    villain: BOSS,
    encounter: [TAX_SCHEME.id, ATTACK_TAX_SCHEME.id, THUG.id, ...copiesOf(BLANK.id, 30)],
    deck: [GUARD.id, RADIO.id, STRIKER.id, FOLLOWER.id, ZEALOT.id, TURRET.id, COVER_CALL.id, LATE_CALL.id],
  });
  state = {
    ...state,
    players: state.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" as const } })),
  };
  const ally = playerCardIntoPlay(state, GUARD.id as never);
  const radio = playerCardIntoPlay(ally.state, RADIO.id as never);
  state = radio.state;
  let schemeId = "" as InstanceId;
  if (scheme) {
    const placed = encounterCardInVillainArea(state, scheme.id as never, 5);
    state = placed.state;
    schemeId = placed.id;
  }
  return {
    state: handOfSize(state, hand),
    hero: mustPlayer(state, P1).identity.instanceId,
    ally: ally.id,
    scheme: schemeId,
    villain: state.villains[0]!.instanceId,
    radio: radio.id,
  };
}

/** Applies the commands through a session, answering nothing; the log replays to the same state. */
function play(state: GameState, ...commands: readonly Command[]) {
  let session: GameSession = startSession(state);
  const events: GameEvent[] = [];
  for (const command of commands) {
    const result = sessionApply(session, command, deps);
    if (!result.ok) throw new Error(`${command.type} rejected: ${result.error.message}`);
    session = result.session;
    events.push(...result.events);
  }
  const replayed = replay(session.log, deps);
  if (!replayed.ok) throw new Error(replayed.error.message);
  expect(replayed.state).toEqual(session.state);
  return { session, state: session.state, events };
}
const answer = (state: GameState, ...selectedOptionIds: readonly string[]): Command => {
  const choice = state.pendingChoice!;
  return { type: "resolveChoice", playerId: choice.playerId, choiceId: choice.choiceId, selectedOptionIds };
};
const exhausted = (state: GameState, id: InstanceId): boolean => mustInstance(state, id).exhausted;
const handSize = (state: GameState): number => mustPlayer(state, P1).hand.length;
const actionFor = (state: GameState, kind: "basicAttack" | "basicThwart", id: InstanceId) => {
  const actions = legalActions(state, P1, deps);
  if (actions.kind !== "turn") throw new Error(`not P1's turn: ${actions.kind}`);
  const matches = (ref: { kind: string; instanceId?: InstanceId }) => ref.kind === kind && ref.instanceId === id;
  return {
    legal: actions.legal.find((entry) => matches(entry.action as never)),
    illegal: actions.illegal.find((entry) => matches(entry.action as never)),
  };
};
const types = (events: readonly GameEvent[]): readonly string[] => events.map((e) => e.type);

describe("§3.31 `additionalPowerCost`: an additional cost to attack or thwart with an ally", () => {
  it("reads the rule for the ally and each power, and not for the hero", () => {
    const t = table(1);
    expect(additionalPowerCostFor(t.state, deps, t.ally, "attack")?.sourceInstanceIds).toEqual([t.scheme]);
    expect(additionalPowerCostFor(t.state, deps, t.ally, "thwart")).not.toBeNull();
    expect(additionalPowerCostFor(t.state, deps, t.ally, "defend")).not.toBeNull();
    expect(additionalPowerCostFor(t.state, deps, t.hero, "attack")).toBeNull();
    expect(additionalPowerCostFor(table(1, null).state, deps, t.ally, "attack")).toBeNull();
  });

  it("an ally's basic attack with one card in hand: the card is spent, the ally exhausts, the attack resolves", () => {
    const t = table(1);
    const [card] = mustPlayer(t.state, P1).hand;
    const { legal } = actionFor(t.state, "basicAttack", t.ally);
    expect(legal?.needsPayment).toBe(true);
    expect(legal?.targets).toContain(t.villain);
    expect(legal?.example).toMatchObject({ type: "basicAttack", payment: [{ fromHand: card }] });

    const out = play(t.state, {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: t.ally,
      targetInstanceId: t.villain,
      payment: [{ fromHand: card! }],
    });
    expect(handSize(out.state)).toBe(0);
    expect(mustPlayer(out.state, P1).discard).toContain(card);
    expect(exhausted(out.state, t.ally)).toBe(true);
    expect(mustInstance(out.state, t.villain).damage).toBe(2);
    expect(out.events).toContainEqual({
      type: "additionalPowerCostPaid",
      playerId: P1,
      characterInstanceId: t.ally,
      power: "attack",
      sourceInstanceIds: [t.scheme],
    });
  });

  it("unpaid, the attack is refused and the ally does not exhaust", () => {
    const t = table(1);
    const result = applyCommand(
      t.state,
      { type: "basicAttack", playerId: P1, attackerInstanceId: t.ally, targetInstanceId: t.villain },
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("insufficient_resources");
    expect(exhausted(t.state, t.ally)).toBe(false);
  });

  it("with nothing to spend the ally's attack and thwart are not offered; the hero's own powers cost nothing", () => {
    const t = table(0);
    for (const kind of ["basicAttack", "basicThwart"] as const) {
      const ally = actionFor(t.state, kind, t.ally);
      expect(ally.legal).toBeUndefined();
      const target = kind === "basicAttack" ? t.villain : t.scheme;
      expect(ally.illegal?.blockedTargets).toContainEqual(
        expect.objectContaining({ instanceId: target, reason: "insufficient_resources" }),
      );
      const hero = actionFor(t.state, kind, t.hero);
      expect(hero.legal?.needsPayment).toBe(false);
    }
    const out = play(t.state, {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: t.hero,
      targetInstanceId: t.villain,
    });
    expect(mustInstance(out.state, t.villain).damage).toBe(2);
    expect(types(out.events)).not.toContain("additionalPowerCostPaid");
  });

  it("an ally's basic thwart is paid the same way", () => {
    const t = table(2);
    const { legal } = actionFor(t.state, "basicThwart", t.ally);
    expect(legal?.needsPayment).toBe(true);
    const out = play(t.state, legal!.example);
    // The smallest payment that works: one card of the two.
    expect(handSize(out.state)).toBe(1);
    expect(exhausted(out.state, t.ally)).toBe(true);
    expect(out.events.some((e) => e.type === "additionalPowerCostPaid" && e.power === "thwart")).toBe(true);
  });

  it("a rule over attacks alone leaves the thwart free", () => {
    const t = table(0, ATTACK_TAX_SCHEME);
    expect(actionFor(t.state, "basicAttack", t.ally).illegal?.reason).toBe("insufficient_resources");
    expect(actionFor(t.state, "basicAttack", t.hero).legal).toBeDefined();
    const thwart = actionFor(t.state, "basicThwart", t.ally).legal;
    expect(thwart?.needsPayment).toBe(false);
    const out = play(t.state, thwart!.example);
    expect(mustInstance(out.state, t.scheme).threat).toBe(4);
  });

  it("two rules add up", () => {
    let t = table(2);
    const second = encounterCardInVillainArea(t.state, ATTACK_TAX_SCHEME.id as never, 5);
    t = { ...t, state: second.state };
    expect(additionalPowerCostFor(t.state, deps, t.ally, "attack")?.sourceInstanceIds).toEqual([t.scheme, second.id]);
    const out = play(t.state, actionFor(t.state, "basicAttack", t.ally).legal!.example);
    expect(handSize(out.state)).toBe(0);
    expect(actionFor(handOfSize(t.state, 1), "basicAttack", t.ally).legal).toBeUndefined();
  });

  it("`paymentFor` and `tryPayment` take the basic power with its target", () => {
    const t = table(2);
    const action = { kind: "basicAttack", instanceId: t.ally } as const;
    const query = paymentFor(t.state, P1, action, { target: t.villain }, deps);
    expect(query?.sources).toHaveLength(2);
    expect(query?.suggested).toHaveLength(1);
    expect(tryPayment(t.state, P1, action, [], { target: t.villain }, deps)).toMatchObject({
      ok: false,
      reason: "insufficient_resources",
    });
    const paid = tryPayment(t.state, P1, action, [query!.sources[1]!.optionId], { target: t.villain }, deps);
    expect(paid.ok).toBe(true);
    // The hero's own attack carries no payment.
    expect(
      paymentFor(t.state, P1, { kind: "basicAttack", instanceId: t.hero }, { target: t.villain }, deps),
    ).toBeNull();
  });

  it("a basic attack a card instructs asks for the payment; unpaid, no power is made", () => {
    const t = table(1);
    const use: Command = {
      type: "useAbility",
      playerId: P1,
      cardInstanceId: t.radio,
      abilityId: ORDER.ref.id,
      payment: [],
    };
    let session = play(t.state, use).session;
    const step = (...selected: readonly string[]): void => {
      const result = sessionApply(session, answer(session.state, ...selected), deps);
      if (!result.ok) throw new Error(result.error.message);
      session = result.session;
    };
    // The character, then (one enemy) the payment.
    for (let guard = 0; session.state.pendingChoice?.prompt.kind !== "spendResources"; guard++) {
      if (guard > 5) throw new Error(`no payment asked: ${session.state.pendingChoice?.prompt.kind}`);
      const choice = session.state.pendingChoice!;
      const ally = choice.options.find((o) => o.ref.kind === "card" && o.ref.instanceId === t.ally);
      step(ally ? ally.optionId : choice.options[0]!.optionId);
    }
    const unpaid = sessionApply(session, answer(session.state), deps);
    expect(unpaid.ok && exhausted(unpaid.session.state, t.ally)).toBe(false);
    expect(unpaid.ok && types(unpaid.events)).toContain("basicPowerNotMade");

    step(session.state.pendingChoice!.options[0]!.optionId);
    expect(exhausted(session.state, t.ally)).toBe(true);
    expect(handSize(session.state)).toBe(0);
    expect(mustInstance(session.state, t.villain).damage).toBe(2);
  });
});

describe("§3.31 `additionalPowerCost`: an additional cost to defend with an ally", () => {
  /** Ends the turn and plays to the first Declare Defender prompt, with `hand` cards in hand as it opens. */
  function atDeclare(t: Table, hand: number): GameSession {
    let session = play(t.state, { type: "endTurn", playerId: P1 }).session;
    for (let guard = 0; session.state.pendingChoice?.prompt.kind !== "declareDefender"; guard++) {
      if (guard > 50 || !session.state.pendingChoice) throw new Error("no Declare Defender step");
      const result = sessionApply(session, answer(session.state, ...defaultPick(session.state)), deps);
      if (!result.ok) throw new Error(result.error.message);
      session = result.session;
    }
    return startSession(handOfSize(session.state, hand));
  }
  function apply(session: GameSession, ...selected: readonly string[]) {
    const result = sessionApply(session, answer(session.state, ...selected), deps);
    if (!result.ok) throw new Error(result.error.message);
    const replayed = replay(result.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(result.session.state);
    return result;
  }
  const offered = (state: GameState): readonly string[] => state.pendingChoice!.options.map((o) => o.optionId);

  it("declared with a card to spend: the controller pays, then the ally exhausts and takes the attack", () => {
    const t = table(1);
    const start = atDeclare(t, 1);
    expect(offered(start.state)).toEqual(["decline", t.hero, t.ally]);

    const asked = apply(start, t.ally);
    expect(types(asked.events)).toEqual(expect.arrayContaining(["additionalPowerCostAsked"]));
    expect(types(asked.events)).not.toContain("defenderDeclared");
    expect(asked.session.state.pendingChoice?.prompt).toMatchObject({ kind: "spendResources" });
    expect(asked.session.state.pendingChoice?.playerId).toBe(P1);
    // Not exhausted, and not the defender, until the cost is paid.
    expect(exhausted(asked.session.state, t.ally)).toBe(false);

    const paid = apply(asked.session, asked.session.state.pendingChoice!.options[0]!.optionId);
    const order = types(paid.events);
    expect(order.indexOf("additionalPowerCostPaid")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("additionalPowerCostPaid")).toBeLessThan(order.indexOf("defenderDeclared"));
    expect(handSize(paid.session.state)).toBe(0);
    expect(exhausted(paid.session.state, t.ally)).toBe(true);

    let session = paid.session;
    for (let guard = 0; session.state.pendingChoice && session.state.step.phase !== "player"; guard++) {
      if (guard > 50) throw new Error("the villain phase did not settle");
      session = apply(session, ...defaultPick(session.state)).session;
    }
    expect(mustInstance(session.state, t.ally).damage).toBe(2);
    expect(mustInstance(session.state, t.hero).damage).toBe(0);
  });

  it("not paid: the ally stays ready, is not the defender, and the step is asked again without it", () => {
    const t = table(1);
    const asked = apply(atDeclare(t, 1), t.ally);
    const declined = apply(asked.session);
    expect(types(declined.events)).toContain("additionalPowerCostNotPaid");
    expect(types(declined.events)).not.toContain("defenderDeclared");
    expect(exhausted(declined.session.state, t.ally)).toBe(false);
    expect(handSize(declined.session.state)).toBe(1);
    expect(declined.session.state.pendingChoice?.prompt.kind).toBe("declareDefender");
    expect(offered(declined.session.state)).toEqual(["decline", t.hero]);
    expect(choiceExclusions(declined.session.state, deps)).toContainEqual({
      instanceId: t.ally,
      reason: "cannotDefend",
    });

    // The hero defends for nothing more.
    const hero = apply(declined.session, t.hero);
    expect(types(hero.events)).toContain("defenderDeclared");
    expect(types(hero.events)).not.toContain("additionalPowerCostAsked");
    expect(exhausted(hero.session.state, t.hero)).toBe(true);
    expect(handSize(hero.session.state)).toBe(1);
  });

  it("with nothing to spend the ally is not offered as a defender", () => {
    // An engaged minion attacks after the villain: the hand is emptied (surgery) while the villain's Declare Defender
    // prompt is open, that attack is left undefended, and the minion's step is built with nothing to spend.
    const t = table(1);
    const engaged = minionEngagedWith(t.state, THUG.id as never);
    const first = atDeclare({ ...t, state: engaged.state }, 0);
    const start = apply(first, "decline").session;
    expect(start.state.pendingChoice?.prompt).toMatchObject({
      kind: "declareDefender",
      attack: { enemyInstanceId: engaged.id },
    });
    expect(offered(start.state)).toEqual(["decline", t.hero]);
    expect(choiceExclusions(start.state, deps)).toContainEqual({ instanceId: t.ally, reason: "cannotDefend" });
    const refused = sessionApply(start, answer(start.state, t.ally), deps);
    expect(refused.ok).toBe(false);
  });

  it("without the rule the ally defends as ever", () => {
    const t = table(1, ATTACK_TAX_SCHEME);
    const start = atDeclare(t, 0);
    expect(offered(start.state)).toEqual(["decline", t.hero, t.ally]);
    const declared = apply(start, t.ally);
    expect(types(declared.events)).toContain("defenderDeclared");
    expect(exhausted(declared.session.state, t.ally)).toBe(true);
  });
});

describe('§4.1 Q48 = B `additionalPowerCost`: an ally\'s own "(attack)" or "(thwart)" ability', () => {
  /** `table`, with `card` in play too. */
  function withCard(hand: number, card: { readonly id: string }, scheme: { readonly id: string } | null = TAX_SCHEME) {
    const t = table(hand + 10, scheme);
    const placed = playerCardIntoPlay(t.state, card.id as never);
    return { ...t, state: handOfSize(placed.state, hand), card: placed.id };
  }
  const abilityFor = (state: GameState, id: InstanceId, abilityId: string) => {
    const actions = legalActions(state, P1, deps);
    if (actions.kind !== "turn") throw new Error(`not P1's turn: ${actions.kind}`);
    const matches = (ref: { kind: string; instanceId?: InstanceId; abilityId?: string }) =>
      ref.kind === "useAbility" && ref.instanceId === id && ref.abilityId === abilityId;
    return {
      legal: actions.legal.find((entry) => matches(entry.action as never)),
      illegal: actions.illegal.find((entry) => matches(entry.action as never)),
    };
  };
  const use = (id: InstanceId, abilityId: string, payment: readonly InstanceId[] = []): Command => ({
    type: "useAbility",
    playerId: P1,
    cardInstanceId: id,
    abilityId: abilityId as never,
    payment: payment.map((fromHand) => ({ fromHand })),
  });

  it("reads the rule's resources onto the ability's cost: labeled abilities of the ally only", () => {
    const t = withCard(1, STRIKER);
    expect(abilityCostFor(t.state, deps, t.card, STRIKE.ref.id)).toMatchObject({
      exhaustSelf: true,
      additionalPower: { power: "attack", sourceInstanceIds: [t.scheme] },
    });
    expect(abilityCostFor(t.state, deps, t.card, SNEAK.ref.id)?.additionalPower?.power).toBe("thwart");
    // No label: the written cost (none), by identity.
    expect(abilityCostFor(t.state, deps, t.card, POKE.ref.id)).toBeUndefined();
    const free = withCard(1, STRIKER, null);
    expect(abilityCostFor(free.state, deps, free.card, STRIKE.ref.id)).toBe(STRIKE.definition.cost);
    // A rule over attacks alone leaves the "(thwart)" ability as written.
    const attacks = withCard(1, STRIKER, ATTACK_TAX_SCHEME);
    expect(abilityCostFor(attacks.state, deps, attacks.card, SNEAK.ref.id)).toBeUndefined();
    expect(abilityCostFor(attacks.state, deps, attacks.card, STRIKE.ref.id)?.additionalPower).toBeDefined();
  });

  it('the "(attack)" action pays 1 resource with its exhaust, and the attack resolves', () => {
    const t = withCard(1, STRIKER);
    const [card] = mustPlayer(t.state, P1).hand;
    const { legal } = abilityFor(t.state, t.card, STRIKE.ref.id);
    expect(legal?.needsPayment).toBe(true);
    expect(legal?.example).toMatchObject({ type: "useAbility", payment: [{ fromHand: card }] });
    const out = play(t.state, legal!.example);
    expect(handSize(out.state)).toBe(0);
    expect(exhausted(out.state, t.card)).toBe(true);
    expect(mustInstance(out.state, t.villain).damage).toBe(3);
    expect(out.events).toContainEqual({
      type: "additionalPowerCostPaid",
      playerId: P1,
      characterInstanceId: t.card,
      power: "attack",
      sourceInstanceIds: [t.scheme],
    });
  });

  it("unpaid, the action is refused and the ally stays ready; with nothing to spend it is not offered", () => {
    const t = withCard(1, STRIKER);
    const result = applyCommand(t.state, use(t.card, STRIKE.ref.id), deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("insufficient_resources");
    expect(exhausted(t.state, t.card)).toBe(false);

    const broke = withCard(0, STRIKER);
    expect(abilityFor(broke.state, broke.card, STRIKE.ref.id).legal).toBeUndefined();
    expect(abilityFor(broke.state, broke.card, SNEAK.ref.id).legal).toBeUndefined();
    // Its unlabeled action is still free.
    const poke = abilityFor(broke.state, broke.card, POKE.ref.id).legal;
    expect(poke?.needsPayment).toBe(false);
    const out = play(broke.state, poke!.example);
    expect(mustInstance(out.state, broke.villain).damage).toBe(1);
    expect(types(out.events)).not.toContain("additionalPowerCostPaid");
  });

  it('a "(thwart)" action with no cost of its own costs the resource', () => {
    const t = withCard(2, STRIKER);
    const { legal } = abilityFor(t.state, t.card, SNEAK.ref.id);
    expect(legal?.needsPayment).toBe(true);
    const out = play(t.state, legal!.example);
    expect(handSize(out.state)).toBe(1);
    expect(mustInstance(out.state, t.scheme).threat).toBe(4);
    expect(out.events.some((e) => e.type === "additionalPowerCostPaid" && e.power === "thwart")).toBe(true);
    const refused = applyCommand(t.state, use(t.card, SNEAK.ref.id), deps);
    expect(refused.ok).toBe(false);
  });

  it('the same "(attack)" action on a support, and the ally\'s without the rule, cost nothing more', () => {
    const turret = withCard(0, TURRET);
    const shot = abilityFor(turret.state, turret.card, STRIKE.ref.id).legal;
    expect(shot?.needsPayment).toBe(false);
    expect(mustInstance(play(turret.state, shot!.example).state, turret.villain).damage).toBe(3);

    const free = withCard(0, STRIKER, null);
    const strike = abilityFor(free.state, free.card, STRIKE.ref.id).legal;
    expect(strike?.needsPayment).toBe(false);
    expect(mustInstance(play(free.state, strike!.example).state, free.villain).damage).toBe(3);
  });

  /** The hero's basic thwart of the taxing scheme, then every prompt answered by `pick` until the turn is quiet. */
  function afterThwart(t: Table, pick: (state: GameState) => readonly string[]) {
    let { session, events } = play(t.state, {
      type: "basicThwart",
      playerId: P1,
      thwarterInstanceId: t.hero,
      schemeInstanceId: t.scheme || t.state.mainScheme.instanceId,
    });
    const prompts: string[] = [];
    for (let guard = 0; session.state.pendingChoice; guard++) {
      if (guard > 20) throw new Error("the thwart did not settle");
      prompts.push(session.state.pendingChoice.prompt.kind);
      const result = sessionApply(session, answer(session.state, ...pick(session.state)), deps);
      if (!result.ok) throw new Error(result.error.message);
      session = result.session;
      events = [...events, ...result.events];
    }
    return { state: session.state, events, prompts };
  }
  const paying =
    (pay: boolean) =>
    (state: GameState): readonly string[] => {
      const choice = state.pendingChoice!;
      if (choice.prompt.kind === "payForAbility") return pay ? [choice.options[0]!.optionId] : [];
      return defaultPick(state).length > 0 ? defaultPick(state) : [choice.options[0]!.optionId];
    };

  it('a triggered "(attack)" Response asks its controller for the resource as it is initiated', () => {
    const t = withCard(1, FOLLOWER);
    const out = afterThwart(t, paying(true));
    expect(out.prompts).toContain("payForAbility");
    expect(handSize(out.state)).toBe(0);
    expect(mustInstance(out.state, t.villain).damage).toBe(3);
    expect(out.events.some((e) => e.type === "additionalPowerCostPaid" && e.characterInstanceId === t.card)).toBe(true);
  });

  it("declining the payment declines the Response; with nothing to spend it is not offered", () => {
    const t = withCard(1, FOLLOWER);
    const declined = afterThwart(t, paying(false));
    expect(declined.prompts).toContain("payForAbility");
    expect(handSize(declined.state)).toBe(1);
    expect(mustInstance(declined.state, t.villain).damage).toBe(0);
    expect(types(declined.events)).not.toContain("additionalPowerCostPaid");

    const broke = afterThwart(withCard(0, FOLLOWER), paying(true));
    expect(broke.prompts).toEqual([]);
    expect(mustInstance(broke.state, t.villain).damage).toBe(0);

    // Without the rule the Response is free: no payment is asked.
    const bare = withCard(0, FOLLOWER, null);
    const main = bare.state.mainScheme.instanceId;
    const threatened = {
      ...bare.state,
      instances: { ...bare.state.instances, [main]: { ...mustInstance(bare.state, main), threat: 3 } },
    };
    const free = afterThwart({ ...bare, state: threatened }, paying(true));
    expect(free.prompts).not.toContain("payForAbility");
    expect(mustInstance(free.state, t.villain).damage).toBe(3);
  });

  it('a Forced "(attack)" ability is not a player\'s to pay for: it resolves as written', () => {
    const t = withCard(0, ZEALOT);
    expect(abilityCostFor(t.state, deps, t.card, ZEAL.ref.id)).toBeUndefined();
    const out = afterThwart(t, paying(true));
    expect(mustInstance(out.state, t.villain).damage).toBe(3);
    expect(types(out.events)).not.toContain("additionalPowerCostPaid");
  });
});

describe("§4.1 Q48 = B `additionalPowerCost`: an ally a card effect declares the defender", () => {
  function apply(session: GameSession, ...selected: readonly string[]) {
    const result = sessionApply(session, answer(session.state, ...selected), deps);
    if (!result.ok) throw new Error(result.error.message);
    const replayed = replay(result.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(result.session.state);
    return result;
  }
  /** `card` in play too; ends the turn and plays to the first prompt of `kind`. */
  function toPrompt(card: { readonly id: string }, scheme: { readonly id: string } | null, kind: string) {
    const t = table(1, scheme);
    const placed = playerCardIntoPlay(t.state, card.id as never);
    const ended = play(placed.state, { type: "endTurn", playerId: P1 });
    let session = ended.session;
    const events: GameEvent[] = [...ended.events];
    for (let guard = 0; session.state.pendingChoice?.prompt.kind !== kind; guard++) {
      if (guard > 50 || !session.state.pendingChoice) throw new Error(`no ${kind} prompt`);
      const result = sessionApply(session, answer(session.state, ...defaultPick(session.state)), deps);
      if (!result.ok) throw new Error(result.error.message);
      session = result.session;
      events.push(...result.events);
    }
    return { t, session, events };
  }
  /**
   * The Declare Defender step is declined with `hand` cards in hand (surgery while its prompt is open), so the boost
   * card is turned faceup and the effect declares the ally.
   */
  function declaredLate(hand: number, scheme: { readonly id: string } | null = TAX_SCHEME) {
    const { t, session } = toPrompt(LATE_CALL, scheme, "declareDefender");
    const result = apply(startSession(handOfSize(session.state, hand)), "decline");
    return { t, session: result.session, events: result.events };
  }
  /** Plays the villain phase out with the default answers. */
  function settled(from: GameSession): GameState {
    let session = from;
    for (let guard = 0; session.state.pendingChoice && session.state.step.phase !== "player"; guard++) {
      if (guard > 50) throw new Error("the villain phase did not settle");
      session = apply(session, ...defaultPick(session.state)).session;
    }
    return session.state;
  }

  it("asks the ally's controller; paid, the ally is exhausted, declared the defender and takes the attack", () => {
    const { t, session: asked, events } = declaredLate(1);
    expect(asked.state.pendingChoice?.prompt).toMatchObject({ kind: "spendResources" });
    expect(asked.state.pendingChoice?.playerId).toBe(P1);
    expect(types(events)).toContain("additionalPowerCostAsked");
    expect(types(events)).not.toContain("defenderDeclared");
    // Not exhausted, and not the defender, until the cost is paid.
    expect(exhausted(asked.state, t.ally)).toBe(false);

    const paid = apply(asked, asked.state.pendingChoice!.options[0]!.optionId);
    const order = types(paid.events);
    expect(order).toContain("additionalPowerCostPaid");
    expect(order.indexOf("additionalPowerCostPaid")).toBeLessThan(order.indexOf("defenderDeclared"));
    expect(paid.events).toContainEqual(
      expect.objectContaining({ type: "defenderDeclared", defenderInstanceId: t.ally, byEffect: true }),
    );
    expect(handSize(paid.session.state)).toBe(0);
    expect(exhausted(paid.session.state, t.ally)).toBe(true);
    const end = settled(paid.session);
    expect(mustInstance(end, t.ally).damage).toBe(2);
    expect(mustInstance(end, t.hero).damage).toBe(0);
  });

  it("not paid: the ally is not declared and not exhausted, and the attack goes on without it", () => {
    const { t, session: asked } = declaredLate(1);
    const declined = apply(asked);
    expect(types(declined.events)).toContain("additionalPowerCostNotPaid");
    expect(types(declined.events)).not.toContain("defenderDeclared");
    expect(types(declined.events)).not.toContain("additionalPowerCostPaid");
    expect(exhausted(declined.session.state, t.ally)).toBe(false);
    expect(handSize(declined.session.state)).toBe(1);
    const end = settled(declined.session);
    expect(mustInstance(end, t.ally).damage).toBe(0);
    expect(mustInstance(end, t.hero).damage).toBe(2);
  });

  it("with nothing to spend nothing is asked and the ally does not defend", () => {
    const { t, session, events } = declaredLate(0);
    expect(session.state.pendingChoice?.prompt.kind).not.toBe("spendResources");
    expect(types(events)).toContain("additionalPowerCostNotPaid");
    expect(types(events)).not.toContain("defenderDeclared");
    expect(exhausted(session.state, t.ally)).toBe(false);
    expect(mustInstance(settled(session), t.hero).damage).toBe(2);
  });

  it("without the rule the effect declares the ally for nothing", () => {
    const { t, session, events } = declaredLate(0, ATTACK_TAX_SCHEME);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "defenderDeclared", defenderInstanceId: t.ally, byEffect: true }),
    );
    expect(types(events)).not.toContain("additionalPowerCostAsked");
    expect(exhausted(session.state, t.ally)).toBe(true);
    expect(mustInstance(settled(session), t.ally).damage).toBe(2);
  });

  it('declared as the attack is initiated ("when an enemy attacks you"): asked there too, before the step', () => {
    const { t, session: asked, events } = toPrompt(COVER_CALL, TAX_SCHEME, "spendResources");
    expect(types(events)).toContain("additionalPowerCostAsked");
    expect(types(events)).not.toContain("defenderDeclared");
    expect(exhausted(asked.state, t.ally)).toBe(false);
    const before = handSize(asked.state);
    const paid = apply(asked, asked.state.pendingChoice!.options[0]!.optionId);
    expect(handSize(paid.session.state)).toBe(before - 1);
    expect(exhausted(paid.session.state, t.ally)).toBe(true);
    expect(types(paid.events)).toContain("additionalPowerCostPaid");
    let session = paid.session;
    for (let guard = 0; session.state.pendingChoice && session.state.step.phase !== "player"; guard++) {
      if (guard > 50) throw new Error("the villain phase did not settle");
      // The ally is the defender: the Declare Defender step asks for nobody.
      expect(session.state.pendingChoice.prompt.kind).not.toBe("declareDefender");
      session = apply(session, ...defaultPick(session.state)).session;
    }
    expect(mustInstance(session.state, t.ally).damage).toBe(2);
    expect(mustInstance(session.state, t.hero).damage).toBe(0);
  });
});
