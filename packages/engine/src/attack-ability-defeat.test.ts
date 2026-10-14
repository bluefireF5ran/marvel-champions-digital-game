/**
 * A `defeat` instruction of an "(attack)"-labeled ability (`resolve/attack-ability.ts`, "A defeat instruction"):
 * synthetic cards shaped like Coup de Grâce ("Hero Action (attack): Defeat a non-[Elite] minion with an upgrade
 * attached.", `cw` 56016; docs/phase7-wave10-box-heroes.md B3.2).
 *
 * Sources: RRG 1.8 "Attack (Player Ability Type)" (p. 10): "If a triggered ability is labeled as an attack …
 * resolving that ability is considered to attack the specified target"; "Labeled Ability" (p. 26); "Retaliate X"
 * (p. 38): only an attacked enemy "still in play after the attack resolves" deals its retaliate damage.
 */

import type { CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import { applyCommand, replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import { activeEncounterDeck, mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { stubEvent, stubMinion, stubSupport } from "./testing/fixtures.js";
import { expectOk } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, minionEngagedWith, P1, playFree, playerCardIntoPlay } from "./testing/wave3.js";

const THUG = stubMinion({ id: "thug", atk: 1, sch: 1, hp: 4 });
const STINGER = stubMinion({ id: "stinger", atk: 1, sch: 1, hp: 4, keywords: [{ name: "retaliate", value: 2 }] });
const minions: TargetRef = { kind: "each", query: { categories: ["minion"] } };
const defeatMinions: EffectSpec = { kind: "defeat", target: minions };

/** "Hero Action (attack): Defeat each minion." */
const COUP_A = stubAbility("coup.action", {
  trigger: { kind: "action", form: "hero" },
  label: ["attack"],
  effects: [defeatMinions],
});
/** The same text without the label: "Hero Action: Defeat each minion." */
const SLAY_A = stubAbility("slay.action", { trigger: { kind: "action", form: "hero" }, effects: [defeatMinions] });
const COUP = stubEvent({ id: "coup", cost: 0, abilities: [COUP_A.ref] });
const SLAY = stubEvent({ id: "slay", cost: 0, abilities: [SLAY_A.ref] });

/** "Forced Interrupt: When your hero attacks and defeats a minion, deal 3 damage to the villain." */
const TALLY_A = stubAbility("tally.interrupt", {
  trigger: {
    kind: "interrupt",
    forced: true,
    on: {
      on: "characterDefeated",
      targetIs: { categories: ["minion"] },
      sourceIs: { categories: ["identity"], controller: "you" },
      fromAttack: true,
    },
  },
  effects: [{ kind: "dealDamage", target: { kind: "villain" }, amount: { kind: "const", value: 3 } }],
});
const TALLY = stubSupport({ id: "tally", cost: 0, abilities: [TALLY_A.ref] });

const deps: EngineDeps = depsOf(COUP_A, SLAY_A, TALLY_A);
// Spare copies, so that discarding a defeated minion never finds the encounter deck empty.
const ENCOUNTER: readonly CardId[] = [THUG.id, STINGER.id, ...copiesOf(THUG.id, 6)];

/** P1 in hero form on the first turn. */
const start = (): GameState =>
  expectOk(
    applyCommand(
      gameAtFirstTurn({
        cards: [THUG, STINGER, COUP, SLAY, TALLY],
        deps,
        encounter: ENCOUNTER,
        deck: [...copiesOf(COUP.id, 2), ...copiesOf(SLAY.id, 2), ...copiesOf(TALLY.id, 2)],
      }),
      { type: "changeForm", playerId: P1 },
      deps,
    ),
  );
const identityOf = (state: GameState) => mustPlayer(state, P1).identity.instanceId;
const villainDamage = (state: GameState) => mustInstance(state, state.activeVillainId!).damage;
const resolved = <K extends string>(events: readonly GameEvent[], kind: K) =>
  events.flatMap((e) =>
    e.type === "triggerEvent" && e.phase === "resolved" && e.event.kind === kind ? [e.event] : [],
  );

describe("a `defeat` instruction of an '(attack)' ability is that attack", () => {
  it("the identity attacks the minion it defeats: one attack, the minion attacked, the defeat made by the attacker", () => {
    const thug = minionEngagedWith(start(), THUG.id);
    const hero = identityOf(thug.state);
    const { state, events } = playFree(thug.state, deps, COUP.id);
    const coup = mustPlayer(state, P1).discard.find((id) => state.instances[id]?.cardId === COUP.id);
    expect(activeEncounterDeck(state).discard).toContain(thug.id);
    expect(resolved(events, "attack")).toHaveLength(1);
    expect(resolved(events, "attack")[0]).toMatchObject({ attackerInstanceId: hero, labeled: true });
    expect(resolved(events, "characterAttacked")).toEqual([
      expect.objectContaining({ attackerInstanceId: hero, targetInstanceId: thug.id }),
    ]);
    expect(resolved(events, "characterDefeated")).toEqual([
      expect.objectContaining({
        instanceId: thug.id,
        byEffect: true,
        fromAttack: true,
        sourceInstanceId: hero,
        viaInstanceId: coup,
        defeatedByPlayerId: P1,
      }),
    ]);
    expect(events.filter((e) => e.type === "damageDealt")).toHaveLength(0);
  });

  it("'when your hero attacks and defeats a minion' answers it, and does not answer the unlabeled defeat", () => {
    const tally = playerCardIntoPlay(start(), TALLY.id);
    const thug = minionEngagedWith(tally.state, THUG.id);
    const attack = playFree(thug.state, deps, COUP.id);
    expect(activeEncounterDeck(attack.state).discard).toContain(thug.id);
    expect(villainDamage(attack.state)).toBe(3);

    const plain = playFree(thug.state, deps, SLAY.id);
    expect(activeEncounterDeck(plain.state).discard).toContain(thug.id);
    expect(villainDamage(plain.state)).toBe(0);
    expect(resolved(plain.events, "attack")).toHaveLength(0);
    expect(resolved(plain.events, "characterAttacked")).toHaveLength(0);
    const slay = mustPlayer(plain.state, P1).discard.find((id) => plain.state.instances[id]?.cardId === SLAY.id);
    const [defeat] = resolved(plain.events, "characterDefeated");
    expect(defeat).toMatchObject({ instanceId: thug.id, byEffect: true, sourceInstanceId: slay });
    expect(defeat).not.toHaveProperty("fromAttack");
    expect(defeat).not.toHaveProperty("viaInstanceId");
  });

  it("a defeated minion with retaliate 2 deals nothing: it is not in play after the attack (RRG 'Retaliate X', p. 38)", () => {
    const stinger = minionEngagedWith(start(), STINGER.id);
    const hero = identityOf(stinger.state);
    const { state, events } = playFree(stinger.state, deps, COUP.id);
    expect(activeEncounterDeck(state).discard).toContain(stinger.id);
    expect(mustInstance(state, hero).damage).toBe(0);
    expect(events.filter((e) => e.type === "damageDealt")).toHaveLength(0);
  });

  it("two minions defeated by the one attack: each is attacked once, and the log replays to the same state", () => {
    const thug = minionEngagedWith(start(), THUG.id);
    const both = minionEngagedWith(thug.state, STINGER.id);
    const { state, events, session } = playFree(both.state, deps, COUP.id);
    expect(activeEncounterDeck(state).discard).toEqual(expect.arrayContaining([thug.id, both.id]));
    expect(resolved(events, "attack")).toHaveLength(1);
    expect(
      resolved(events, "characterAttacked")
        .map((e) => (e.kind === "characterAttacked" ? e.targetInstanceId : null))
        .sort(),
    ).toEqual([thug.id, both.id].sort());
    expect(mustInstance(state, identityOf(state)).damage).toBe(0);
    const replayed = replay(session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(session.state);
  });
});
