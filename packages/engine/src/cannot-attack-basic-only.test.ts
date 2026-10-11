/**
 * `RuleSpec cannotAttack.basicOnly` (docs/phase7-wave9.md §3.72): "Attach to your identity. You cannot make basic
 * attacks." Only the attached identity's basic attack is forbidden, with synthetic cards.
 *
 * Sources: RRG 1.8 "'Cannot'" (p. 11): the word "is absolute, and cannot be countermanded by other abilities"; "Basic
 * Power" (p. 10): a basic attack is the character's own power, not a card ability's; "You, Your" (p. 49): "you" on an
 * attachment is the identity it is attached to, so an ally's basic attack is not "you" making one.
 */

import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { applyCommand } from "./engine.js";
import type { InstanceId } from "./ids.js";
import { legalActions } from "./legal.js";
import { mustInstance, mustPlayer } from "./query.js";
import { attackForbiddenBy, canAttack } from "./select.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommands, runCommandsPicking } from "./testing/drive.js";
import { stubAlly, stubMinion, stubSupport, stubUpgrade } from "./testing/fixtures.js";
import { defaultPick } from "./testing/scenario.js";
import { gameAtFirstTurn, minionEngagedWith, P1, playerCardIntoPlay } from "./testing/wave3.js";

/** "Attach to your identity. You cannot make basic attacks." */
const SEDUCED_RULE = stubAbility("charm.constant", {
  trigger: {
    kind: "constant",
    rules: [
      { kind: "cannotAttack", attacker: { hostOfSelf: true }, target: { categories: ["enemy"] }, basicOnly: true },
    ],
  },
  effects: [],
});
const CHARM = stubUpgrade({ id: "charm", cost: 0, abilities: [SEDUCED_RULE.ref] });
/** "Action (attack): Deal 3 damage to an enemy." A card ability's attack by the identity, not a basic attack. */
const STRIKE_ACTION = stubAbility("strike.action", {
  trigger: { kind: "action" },
  label: ["attack"],
  effects: [
    { kind: "chooseTarget", slot: "enemy", query: { categories: ["enemy"] }, chooser: { kind: "controller" } },
    { kind: "attack", target: { kind: "slot", slot: "enemy" }, amount: { kind: "const", value: 3 } },
  ],
});
const STRIKE = stubSupport({ id: "strike", cost: 0, abilities: [STRIKE_ACTION.ref] });
const SIDEKICK = stubAlly({ id: "sidekick", cost: 0, atk: 1, thw: 1, hp: 3 });
const THUG = stubMinion({ id: "thug", atk: 1, sch: 1, hp: 5 });

const deps: EngineDeps = depsOf(SEDUCED_RULE, STRIKE_ACTION);

interface Table {
  readonly state: GameState;
  readonly hero: InstanceId;
  readonly charm: InstanceId;
  readonly sidekick: InstanceId;
  readonly strike: InstanceId;
  readonly thug: InstanceId;
  readonly villain: InstanceId;
}

/** P1 in hero form with an ally and the attack support in play, a minion engaged, and the attachment on the hero. */
function table(charmed = true): Table {
  const start = gameAtFirstTurn({
    cards: [CHARM, STRIKE, SIDEKICK, THUG],
    deps,
    deck: [CHARM.id, STRIKE.id, SIDEKICK.id],
    encounter: [THUG.id, THUG.id],
  });
  const heroes: GameState = {
    ...start,
    players: start.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" as const } })),
  };
  const hero = mustPlayer(heroes, P1).identity.instanceId;
  const sidekick = playerCardIntoPlay(heroes, SIDEKICK.id);
  const strike = playerCardIntoPlay(sidekick.state, STRIKE.id);
  const thug = minionEngagedWith(strike.state, THUG.id);
  const put = playerCardIntoPlay(thug.state, CHARM.id);
  const state: GameState = charmed
    ? {
        ...put.state,
        instances: {
          ...put.state.instances,
          [put.id]: { ...mustInstance(put.state, put.id), attachedTo: hero },
          [hero]: {
            ...mustInstance(put.state, hero),
            attachments: [...mustInstance(put.state, hero).attachments, put.id],
          },
        },
      }
    : thug.state;
  return {
    state,
    hero,
    charm: put.id,
    sidekick: sidekick.id,
    strike: strike.id,
    thug: thug.id,
    villain: state.activeVillainId!,
  };
}

const basic = (attacker: InstanceId, target: InstanceId): Command => ({
  type: "basicAttack",
  playerId: P1,
  attackerInstanceId: attacker,
  targetInstanceId: target,
});
function turn(state: GameState) {
  const actions = legalActions(state, P1, deps);
  if (actions.kind !== "turn") throw new Error(`not P1's turn: ${actions.kind}`);
  return actions;
}
const basicAttackOf = (state: GameState, attacker: InstanceId) => {
  const { legal, illegal } = turn(state);
  const is = (entry: (typeof legal)[number] | (typeof illegal)[number]) =>
    entry.action.kind === "basicAttack" && entry.action.instanceId === attacker;
  return { legal: legal.find(is), illegal: illegal.find(is) };
};

describe('§3.72 `cannotAttack.basicOnly`: "you cannot make basic attacks"', () => {
  it("without the attachment the hero's basic attack is offered against the minion and the villain", () => {
    const t = table(false);
    expect(basicAttackOf(t.state, t.hero).legal?.targets).toEqual(expect.arrayContaining([t.thug, t.villain]));
  });

  it("the attached hero's basic attack is not legal against anything, and the refusal names the card", () => {
    const t = table();
    const entry = basicAttackOf(t.state, t.hero);
    expect(entry.legal).toBeUndefined();
    expect(entry.illegal?.message).toBe("charm: you cannot make basic attacks");
    expect(entry.illegal?.blockedTargets.map((b) => b.instanceId)).toEqual(expect.arrayContaining([t.thug, t.villain]));
    for (const target of [t.thug, t.villain]) {
      const refused = applyCommand(t.state, basic(t.hero, target), deps);
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.message).toBe("charm: you cannot make basic attacks");
    }
    expect(attackForbiddenBy(t.state, t.hero, t.thug, deps, true)).toEqual({ byInstanceId: t.charm, basicOnly: true });
  });

  it("an ally the same player controls still makes its basic attack", () => {
    const t = table();
    expect(basicAttackOf(t.state, t.sidekick).legal?.targets).toEqual(expect.arrayContaining([t.thug, t.villain]));
    const { state } = runCommands(t.state, deps, basic(t.sidekick, t.thug));
    expect(mustInstance(state, t.thug).damage).toBe(1);
  });

  it("an attack-labeled ability that is not a basic attack still resolves, by the same hero", () => {
    const t = table();
    // The rule is not asked about an attack that is not basic: the hero may attack the minion by a card's ability.
    expect(canAttack(t.state, t.hero, t.thug, deps)).toBe(true);
    expect(canAttack(t.state, t.hero, t.thug, deps, true)).toBe(false);
    expect(attackForbiddenBy(t.state, t.hero, t.thug, deps)).toBeNull();
    const { state } = runCommandsPicking(
      t.state,
      deps,
      (pending) =>
        pending.pendingChoice?.options.some((o) => o.optionId === t.thug) ? [t.thug] : defaultPick(pending),
      { type: "useAbility", playerId: P1, cardInstanceId: t.strike, abilityId: STRIKE_ACTION.ref.id, payment: [] },
    );
    expect(mustInstance(state, t.thug).damage).toBe(3);
  });
});
