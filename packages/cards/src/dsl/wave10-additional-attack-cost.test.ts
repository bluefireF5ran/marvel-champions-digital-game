/**
 * docs/phase7-wave10-hero-packs.md H3.16 (engine task HT13): `additionalAttackCost(target, cost)`, with the real
 * Brother vs. Brother 58027 and Grim Reaper 58026 (Wonder Man's nemesis set) in a real Wonder Man game against Core's
 * Rhino. The side scheme's script is this test's own; the pack's obligation and nemesis module is scripted elsewhere.
 * The engine's `additional-attack-cost.test.ts` drives the plain data (two rules on one enemy, a stunned attacker,
 * "each enemy", damage that is not an attack).
 *
 * Brother vs. Brother: "As an additional cost to attack Grim Reaper, you must discard 1 card from your hand." RRG 1.8
 * "Cost" (p. 14): an additional cost is paid with the cost it is added to, all of it or none; "Attack (Player Ability
 * Type)" (p. 10) and "Labeled Ability" (p. 26): an "(attack)" event is an attack by the player's identity. Ionic Blast
 * 58004 is the pack's own script: "Hero Action (attack): Deal 3 damage to an enemy. …"
 */

import {
  applyCommand,
  legalActions,
  type AbilityDefinition,
  type EngineDeps,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { cardId } from "@mc/content";
import { describe, expect, it, vi } from "vitest";
import {
  additionalAttackCost,
  constant,
  discardFromHandCost,
  exhaustThis,
  query,
  validateDefinition,
} from "./index.js";
import {
  P1,
  firstLegal,
  identityOf,
  inst,
  moveToHand,
  play,
  playerOf,
  settle,
  type Picker,
} from "../testing/harness.js";
import { stagedInPlay, wonderManHeroGame } from "../wave10/testing.js";
import { depsWith } from "./wave10-labor.testing.js";

vi.setConfig({ testTimeout: 120_000 });

const BROTHER_VS_BROTHER = "58027";
const CONSTANT = "58027.brother-vs-brother-constant";
const GRIM_REAPER = "58026";
const IONIC_BLAST = "58004";
const HAWKEYE = "58013";
const GRIM = query("enemy", { name: "Grim Reaper" });

const SCRIPTS: Readonly<Record<string, AbilityDefinition>> = {
  [CONSTANT]: constant(additionalAttackCost(GRIM, discardFromHandCost(1, 1))),
};
const DEPS: EngineDeps = depsWith(SCRIPTS);

/** A set-aside nemesis card of the first player, taken out of the set-aside area. */
function fromSetAside(state: GameState, code: string) {
  const id = playerOf(state, P1).setAside.find((i) => state.instances[i]?.cardId === cardId(code));
  if (!id) throw new Error(`no ${code} set aside`);
  const players = state.players.map((p) =>
    p.playerId === P1 ? { ...p, setAside: p.setAside.filter((i) => i !== id) } : p,
  );
  return { id, state: { ...state, players } };
}

/**
 * Wonder Man in hero form, Grim Reaper engaged with him and Brother vs. Brother in play (surgery: no reveal), Hawkeye
 * under his control, and a hand of exactly `hand` cards ending with the named ones.
 */
function staged(hand: number, ...codes: readonly string[]) {
  let state = wonderManHeroGame({ deps: DEPS });
  const ally = stagedInPlay(state, HAWKEYE);
  state = ally.state;
  const reaper = fromSetAside(state, GRIM_REAPER);
  state = {
    ...reaper.state,
    players: reaper.state.players.map((p) => (p.playerId === P1 ? { ...p, playArea: [...p.playArea, reaper.id] } : p)),
    instances: {
      ...reaper.state.instances,
      [reaper.id]: { ...reaper.state.instances[reaper.id]!, engagedWith: P1, controllerId: null, faceup: true },
    },
  };
  const scheme = fromSetAside(state, BROTHER_VS_BROTHER);
  state = {
    ...scheme.state,
    villainArea: [...scheme.state.villainArea, scheme.id],
    instances: {
      ...scheme.state.instances,
      [scheme.id]: { ...scheme.state.instances[scheme.id]!, threat: 2, faceup: true },
    },
  };
  const named = moveToHand(state, P1, ...codes);
  state = named.state;
  const seat = playerOf(state, P1);
  const others = seat.hand.filter((id) => !named.ids.includes(id));
  const kept = others.slice(0, Math.max(0, hand - named.ids.length));
  state = {
    ...state,
    players: state.players.map((p) =>
      p.playerId === P1
        ? { ...p, hand: [...kept, ...named.ids], deck: [...others.filter((id) => !kept.includes(id)), ...p.deck] }
        : p,
    ),
  };
  return {
    state,
    hero: identityOf(state, P1),
    villain: state.villains[0]!.instanceId,
    reaper: reaper.id,
    scheme: scheme.id,
    hawkeye: ally.id,
    named: named.ids,
  };
}

const attack = (attacker: InstanceId, target: InstanceId) =>
  ({ type: "basicAttack", playerId: P1, attackerInstanceId: attacker, targetInstanceId: target }) as const;
const handOf = (state: GameState): readonly InstanceId[] => playerOf(state, P1).hand;
const paid = (events: readonly GameEvent[]) => events.filter((e) => e.type === "additionalAttackCostPaid");
/** Answers "choose an enemy" with `enemy`; everything else by default. */
const choosing =
  (enemy: InstanceId): Picker =>
  (state) => {
    const choice = state.pendingChoice;
    return choice?.options.some((o) => o.optionId === enemy) ? [enemy] : firstLegal(state);
  };
function run(state: GameState, command: Parameters<typeof applyCommand>[1], pick: Picker = firstLegal) {
  const result = applyCommand(state, command, DEPS);
  if (!result.ok) return { ok: false as const, code: result.error.code, message: result.error.message };
  const events: GameEvent[] = [...result.events];
  let current = result.state;
  for (let guard = 0; current.pendingChoice && !current.outcome; guard++) {
    if (guard > 100) throw new Error("choices did not settle");
    const choice = current.pendingChoice;
    const next = applyCommand(
      current,
      { type: "resolveChoice", playerId: choice.playerId, choiceId: choice.choiceId, selectedOptionIds: pick(current) },
      DEPS,
    );
    if (!next.ok) throw new Error(`${next.error.code}: ${next.error.message}`);
    events.push(...next.events);
    current = next.state;
  }
  return { ok: true as const, state: settle(current, pick, (s) => !s.pendingChoice, DEPS), events };
}
const basicTargets = (state: GameState, attacker: InstanceId): readonly InstanceId[] => {
  const legal = legalActions(state, P1, DEPS);
  if (legal.kind !== "turn") throw new Error(`expected a turn, got ${legal.kind}`);
  return (
    legal.legal.find((a) => a.example.type === "basicAttack" && a.example.attackerInstanceId === attacker)?.targets ??
    []
  );
};
/** The cards the first "choose an enemy" of a play offered. */
const offeredEnemies = (events: readonly GameEvent[]): readonly string[] =>
  events.flatMap((e) =>
    e.type === "choiceRequested" && e.choice.prompt.kind === "chooseTarget" && e.choice.prompt.slot !== "discard"
      ? [e.choice.options.map((o) => o.optionId)]
      : [],
  )[0] ?? [];

describe("H3.16 the builder", () => {
  it("builds a constant rule scoped by the enemy attacked", () => {
    const definition = SCRIPTS[CONSTANT]!;
    expect(definition.trigger).toEqual({
      kind: "constant",
      rules: [
        {
          kind: "additionalAttackCost",
          target: { categories: ["enemy"], name: "Grim Reaper" },
          cost: { discardFromHand: { min: 1, max: 1 } },
        },
      ],
    });
    expect(validateDefinition(definition)).toEqual([]);
  });

  it("the validator refuses a cost that is not a fixed discard from hand", () => {
    const refusals = (definition: AbilityDefinition) => validateDefinition(definition).join("\n");
    const notADiscard = "additionalAttackCost: the cost is a discard from hand";
    expect(refusals(constant(additionalAttackCost(GRIM, { resources: 1 })))).toContain(notADiscard);
    expect(refusals(constant(additionalAttackCost(GRIM, exhaustThis)))).toContain(notADiscard);
    expect(refusals(constant(additionalAttackCost(GRIM, { ...discardFromHandCost(1, 1), resources: 1 })))).toContain(
      notADiscard,
    );
    expect(refusals(constant(additionalAttackCost(GRIM, discardFromHandCost(1, 3))))).toContain(
      "additionalAttackCost: the discard is of a fixed number of cards",
    );
    expect(refusals(constant(additionalAttackCost(GRIM, discardFromHandCost(1, 1, "n"))))).toContain(
      "additionalAttackCost: the discard has no bind",
    );
  });
});

describe("H3.16 Brother vs. Brother 58027: an additional cost to attack Grim Reaper", () => {
  it("a basic attack with 1 card in hand: the card is discarded and the attack is made", () => {
    const table = staged(1);
    const [card] = handOf(table.state);
    const after = run(table.state, attack(table.hero, table.reaper));
    if (!after.ok) throw new Error(`refused: ${after.message}`);
    expect(handOf(after.state)).toEqual([]);
    expect(playerOf(after.state, P1).discard).toContain(card);
    expect(inst(after.state, table.reaper).damage).toBeGreaterThan(0);
    expect(inst(after.state, table.hero).exhausted).toBe(true);
    expect(paid(after.events)).toMatchObject([
      { playerId: P1, attackerInstanceId: table.hero, targetInstanceId: table.reaper, sourceInstanceId: table.scheme },
    ]);
  });

  it("with an empty hand Grim Reaper is not a legal target and Wonder Man does not exhaust", () => {
    const table = staged(0);
    const refused = run(table.state, attack(table.hero, table.reaper));
    expect(refused).toMatchObject({ ok: false, code: "insufficient_resources" });
    expect(inst(table.state, table.hero).exhausted).toBe(false);
    expect(basicTargets(table.state, table.hero)).toEqual([table.villain]);
    const villain = run(table.state, attack(table.hero, table.villain));
    if (!villain.ok) throw new Error(`refused: ${villain.message}`);
    expect(inst(villain.state, table.villain).damage).toBeGreaterThan(0);
    expect(paid(villain.events)).toEqual([]);
  });

  it("an ally's attack: its controller discards", () => {
    const table = staged(1);
    const [card] = handOf(table.state);
    const after = run(table.state, attack(table.hawkeye, table.reaper));
    if (!after.ok) throw new Error(`refused: ${after.message}`);
    expect(playerOf(after.state, P1).discard).toContain(card);
    expect(inst(after.state, table.reaper).damage).toBeGreaterThan(0);
    expect(paid(after.events)).toMatchObject([{ playerId: P1, attackerInstanceId: table.hawkeye }]);
    const broke = staged(0);
    expect(run(broke.state, attack(broke.hawkeye, broke.reaper)).ok).toBe(false);
  });

  it("Ionic Blast with nothing left in hand once it is paid for: Grim Reaper is not offered, the villain is", () => {
    const table = staged(2, IONIC_BLAST);
    const [blast] = table.named;
    const payer = handOf(table.state).find((id) => id !== blast)!;
    const after = run(table.state, play(P1, blast!, [payer]), choosing(table.reaper));
    if (!after.ok) throw new Error(`refused: ${after.message}`);
    expect(offeredEnemies(after.events)).toEqual([table.villain]);
    expect(inst(after.state, table.reaper).damage).toBe(0);
    expect(inst(after.state, table.villain).damage).toBeGreaterThanOrEqual(3);
    expect(paid(after.events)).toEqual([]);
  });

  it("Ionic Blast with a card left in hand: Grim Reaper may be chosen, and that card is discarded first", () => {
    const table = staged(3, IONIC_BLAST);
    const [blast] = table.named;
    const [payer, kept] = handOf(table.state).filter((id) => id !== blast);
    const after = run(table.state, play(P1, blast!, [payer!]), choosing(table.reaper));
    if (!after.ok) throw new Error(`refused: ${after.message}`);
    expect(offeredEnemies(after.events)).toContain(table.reaper);
    expect(handOf(after.state)).toEqual([]);
    expect(playerOf(after.state, P1).discard).toContain(kept);
    expect(paid(after.events)).toMatchObject([{ attackerInstanceId: table.hero, targetInstanceId: table.reaper }]);
    const cost = after.events.findIndex((e) => e.type === "additionalAttackCostPaid");
    const damage = after.events.findIndex((e) => e.type === "damageDealt" && e.targetInstanceId === table.reaper);
    expect(damage).toBeGreaterThan(cost);
  });
});
