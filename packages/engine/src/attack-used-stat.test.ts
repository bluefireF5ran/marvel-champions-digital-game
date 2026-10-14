/**
 * "Uses their ATK to attack and damage" (docs/phase7-wave10.md §3.17): `usedStat` on the attack in progress and on its
 * damage, and `Predicate attackUsedAtk`. A synthetic attachment shaped like Cap's Shield (`cw` 56143: "Attached
 * character gains retaliate 1 … Forced Response: After a hero or the Captain America leader uses their ATK to attack
 * and damage attached character, attach Cap's Shield to the attacker.").
 *
 * Rulings: December 17, 2025 (2) #3, "If the ability is phrased as a flat damage amount (e.g., 'Deal # damage to an
 * enemy'), that would not allow you to take Cap's Shield. If an ability calls out your ATK in some way (e.g., 'Deal
 * damage to an enemy equal to your ATK'), that would"; January 11, 2026 (1) and (2), "assuming the attacker used
 * their ATK (e.g., basic attack) and that attack had overkill, damage dealt to the Captain America leader triggers
 * the Forced Response"; January 17, 2026 (3) #2, a keyword (retaliate) resolves before a triggered ability. RRG 1.8
 * "Retaliate X" (p. 38), "Overkill" (p. 31), "Tough" (p. 44).
 */

import { flat, type CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { replay } from "./engine.js";
import type { InstanceId } from "./ids.js";
import { mustInstance, mustPlayer } from "./query.js";
import { cardsInPlay } from "./select.js";
import type { EffectSpec, Predicate, TargetRef, ValueSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommands } from "./testing/drive.js";
import { stubAttachment, stubEvent, stubMainScheme, stubMinion, stubSupport, stubVillain } from "./testing/fixtures.js";
import { giveCard } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, minionEngagedWith, P1, playerCardIntoPlay } from "./testing/wave3.js";

const n = (value: number): ValueSpec => ({ kind: "const", value });
const HOST = { hostOfSelf: true } as const;
const host: TargetRef = { kind: "host" };
const self: TargetRef = { kind: "self" };
const villain: TargetRef = { kind: "villain" };
const yourIdentity: TargetRef = { kind: "identityOf", player: { kind: "controller" } };
const yourAtk: ValueSpec = { kind: "stat", of: yourIdentity, stat: "atk" };
const usedAtk: Predicate = { kind: "attackUsedAtk" };

/** "Attached character gains retaliate 1." */
const BUCKLER_CONSTANT = stubAbility("buckler.constant", {
  trigger: { kind: "constant", keywordGrants: [{ keyword: { name: "retaliate", value: 1 }, target: HOST }] },
  effects: [],
});
/** "Forced Response: After a character uses their ATK to attack and damage attached character, attach this to the attacker." */
const BUCKLER_RESPONSE = stubAbility("buckler.response", {
  trigger: {
    kind: "response",
    forced: true,
    on: { on: ["attack", "enemyAttack"] },
    while: { kind: "and", of: [usedAtk, { kind: "eventDamageTakenAtLeast", of: host, amount: 1 }] },
  },
  effects: [{ kind: "attach", card: self, to: { kind: "eventSource" } }],
});
const BUCKLER = stubAttachment({ id: "buckler", abilities: [BUCKLER_CONSTANT.ref, BUCKLER_RESPONSE.ref] });

/** "Forced Response: After the villain takes damage from an attack that used ATK, place 1 counter here." */
const LEDGER_RESPONSE = stubAbility("ledger.response", {
  trigger: {
    kind: "response",
    forced: true,
    on: { on: "dealDamage", targetIs: { categories: ["villain"] }, requireResults: { amount: 1 } },
    while: usedAtk,
  },
  effects: [{ kind: "addCounters", target: self, counterType: "tally", amount: n(1) }],
});
const LEDGER = stubSupport({ id: "ledger", cost: 0, abilities: [LEDGER_RESPONSE.ref] });

/** "You get +1 ATK. Your attacks gain overkill." */
const GAUNTLET_CONSTANT = stubAbility("gauntlet.constant", {
  trigger: {
    kind: "constant",
    modifiers: [{ stat: "atk", amount: 1, target: { categories: ["identity"], controller: "you" } }],
    rules: [{ kind: "attackKeywords", keywords: ["overkill"], attacker: { categories: ["identity"] } }],
  },
  effects: [],
});
const GAUNTLET = stubSupport({ id: "gauntlet", cost: 0, abilities: [GAUNTLET_CONSTANT.ref] });
/** "Interrupt: When a character makes a basic attack, that character uses their THW instead of their ATK." */
const FOG_INTERRUPT = stubAbility("fog.interrupt", {
  trigger: { kind: "interrupt", forced: true, on: { on: "attack", attackKind: "basic" } },
  effects: [{ kind: "modifyBasicPower", useStat: "thw" }],
});
const FOG = stubSupport({ id: "fog", cost: 0, abilities: [FOG_INTERRUPT.ref] });

const event = (id: string, definition: Omit<AbilityDefinition, "trigger">) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, ...definition });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
const attackFor = (amount: ValueSpec, more: Partial<Extract<EffectSpec, { kind: "attack" }>> = {}): EffectSpec => ({
  kind: "attack",
  target: villain,
  amount,
  ...more,
});
/** "Hero Action (attack): Deal 4 damage to the villain." */
const FLAT = event("flat", { label: ["attack"], effects: [attackFor(n(4))] });
/** "Hero Action (attack): Deal damage to the villain equal to your ATK." */
const SWING = event("swing", { label: ["attack"], effects: [attackFor(yourAtk, { usesAtk: true })] });
/** The same amount with no mark: what the engine reads is the mark, not the amount. */
const UNMARKED = event("unmarked", { label: ["attack"], effects: [attackFor(yourAtk)] });
/** An "(attack)" ability with no attack instruction: "Deal 1 damage to the villain. Deal damage to it equal to your ATK." */
const COMBO = event("combo", {
  label: ["attack"],
  effects: [
    { kind: "dealDamage", target: villain, amount: n(1) },
    { kind: "dealDamage", target: villain, amount: yourAtk, usesAtk: true },
  ],
});
/** The same with flat amounts only. */
const JABS = event("jabs", {
  label: ["attack"],
  effects: [
    { kind: "dealDamage", target: villain, amount: n(1) },
    { kind: "dealDamage", target: villain, amount: n(2) },
  ],
});
/** Not an attack: "Deal damage to the villain equal to your ATK." */
const ZAP = event("zap", { effects: [{ kind: "dealDamage", target: villain, amount: yourAtk, usesAtk: true }] });
const EVENTS = [FLAT, SWING, UNMARKED, COMBO, JABS, ZAP];

const TYRANT = stubVillain({ id: "tyrant", stages: [{ hp: flat(30), atk: 2, sch: 0 }] });
const SCHEME = stubMainScheme({
  id: "long",
  stages: [{ startingThreat: flat(0), targetThreat: flat(99), acceleration: flat(0) }],
});
const GRUNT = stubMinion({ id: "grunt", atk: 0, sch: 0, hp: 1, boostIcons: 0 });
const FILLER = stubMinion({ id: "filler", atk: 0, sch: 0, hp: 9, boostIcons: 0 });

const deps: EngineDeps = depsOf(
  BUCKLER_CONSTANT,
  BUCKLER_RESPONSE,
  LEDGER_RESPONSE,
  GAUNTLET_CONSTANT,
  FOG_INTERRUPT,
  ...EVENTS.map((e) => e.ability),
);

const toHero: Command = { type: "changeForm", playerId: P1 };
const heroOf = (state: GameState) => mustPlayer(state, P1).identity.instanceId;
const villainOf = (state: GameState) => state.villains[0]!.instanceId;
const damageOn = (state: GameState, id: InstanceId) => mustInstance(state, id).damage;
const basicAttack = (state: GameState, target: InstanceId): Command => ({
  type: "basicAttack",
  playerId: P1,
  attackerInstanceId: heroOf(state),
  targetInstanceId: target,
});

/** Attaches the Buckler to `to` (surgery: no reveal). */
function attachBuckler(state: GameState, to: InstanceId): { state: GameState; id: InstanceId } {
  const id = (Object.keys(state.instances) as InstanceId[]).find(
    (key) => state.instances[key]?.cardId === BUCKLER.id && !cardsInPlay(state).includes(key),
  );
  if (!id) throw new Error("no buckler out of play");
  return {
    id,
    state: {
      ...state,
      encounterDecks: Object.fromEntries(
        Object.entries(state.encounterDecks).map(([deckId, piles]) => [
          deckId,
          { ...piles, deck: piles.deck.filter((x) => x !== id) },
        ]),
      ),
      instances: {
        ...state.instances,
        [id]: { ...mustInstance(state, id), faceup: true, attachedTo: to },
        [to]: { ...mustInstance(state, to), attachments: [...mustInstance(state, to).attachments, id] },
      },
    },
  };
}

/** P1 in hero form, the Ledger in play, the Buckler on the villain (or on P1's hero), and `supports` in play. */
function table(supports: readonly { readonly id: CardId }[] = [], on: "villain" | "hero" = "villain") {
  let state = gameAtFirstTurn({
    cards: [BUCKLER, LEDGER, GAUNTLET, FOG, GRUNT, FILLER, ...EVENTS.map((e) => e.card)],
    deps,
    villain: TYRANT,
    mainScheme: SCHEME,
    encounter: [BUCKLER.id, GRUNT.id, ...copiesOf(FILLER.id, 12)],
    deck: [LEDGER.id, GAUNTLET.id, FOG.id, ...EVENTS.map((e) => e.card.id)],
  });
  const ledger = playerCardIntoPlay(state, LEDGER.id);
  state = ledger.state;
  for (const support of supports) state = playerCardIntoPlay(state, support.id).state;
  state = runCommands(state, deps, toHero).state;
  const buckler = attachBuckler(state, on === "villain" ? villainOf(state) : heroOf(state));
  return { state: buckler.state, buckler: buckler.id, ledger: ledger.id };
}
const play = (state: GameState, card: string) => {
  const given = giveCard(state, P1, card);
  return runCommands(given.state, deps, {
    type: "playCard",
    playerId: P1,
    cardInstanceId: given.id,
    payment: [],
    attachToInstanceId: null,
  });
};
const tally = (state: GameState, ledger: InstanceId) => mustInstance(state, ledger).counters.tally ?? 0;
const hostOf = (state: GameState, buckler: InstanceId) => mustInstance(state, buckler).attachedTo;

describe("docs/phase7-wave10.md §3.17: an attack that uses the attacker's ATK", () => {
  it("a hero's basic attack (2 ATK): 2 damage, retaliate 1 hits the hero, then the attachment moves to the hero", () => {
    const at = table();
    const run = runCommands(at.state, deps, basicAttack(at.state, villainOf(at.state)));
    expect(damageOn(run.state, villainOf(run.state))).toBe(2);
    expect(damageOn(run.state, heroOf(run.state))).toBe(1);
    expect(hostOf(run.state, at.buckler)).toBe(heroOf(run.state));
    expect(mustInstance(run.state, villainOf(run.state)).attachments).toEqual([]);
    expect(tally(run.state, at.ledger)).toBe(1);
    const replayed = replay(run.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(run.state);
  });

  it("a flat 4-damage attack event: 4 damage, retaliate 1, and the attachment stays", () => {
    const at = table();
    const run = play(at.state, FLAT.card.id);
    expect(damageOn(run.state, villainOf(run.state))).toBe(4);
    expect(damageOn(run.state, heroOf(run.state))).toBe(1);
    expect(hostOf(run.state, at.buckler)).toBe(villainOf(run.state));
    expect(tally(run.state, at.ledger)).toBe(0);
  });

  it("an attack event dealing damage equal to your ATK, marked usesAtk: 2 damage and the attachment moves", () => {
    const at = table();
    const run = play(at.state, SWING.card.id);
    expect(damageOn(run.state, villainOf(run.state))).toBe(2);
    expect(damageOn(run.state, heroOf(run.state))).toBe(1);
    expect(hostOf(run.state, at.buckler)).toBe(heroOf(run.state));
    expect(tally(run.state, at.ledger)).toBe(1);
  });

  it("the mark is what is read: the same amount on an instruction without usesAtk does not move it", () => {
    const at = table();
    const run = play(at.state, UNMARKED.card.id);
    expect(damageOn(run.state, villainOf(run.state))).toBe(2);
    expect(hostOf(run.state, at.buckler)).toBe(villainOf(run.state));
    expect(tally(run.state, at.ledger)).toBe(0);
  });

  it("overkill: a 3 ATK basic attack defeats a 1-hit-point minion, 2 spills to the villain, and the attachment moves", () => {
    const at = table([GAUNTLET]);
    const grunt = minionEngagedWith(at.state, GRUNT.id);
    const run = runCommands(grunt.state, deps, basicAttack(grunt.state, grunt.id));
    expect(cardsInPlay(run.state)).not.toContain(grunt.id);
    expect(damageOn(run.state, villainOf(run.state))).toBe(2);
    // The villain was not attacked, so its retaliate does not answer (RRG 1.8 "Overkill", p. 31).
    expect(damageOn(run.state, heroOf(run.state))).toBe(0);
    expect(hostOf(run.state, at.buckler)).toBe(heroOf(run.state));
    expect(tally(run.state, at.ledger)).toBe(1);
  });

  it("a tough status card absorbs the basic attack: no damage, so no move; the attacked character still retaliates", () => {
    const at = table();
    const id = villainOf(at.state);
    const tough: GameState = {
      ...at.state,
      instances: {
        ...at.state.instances,
        [id]: { ...mustInstance(at.state, id), statuses: { ...mustInstance(at.state, id).statuses, tough: 1 } },
      },
    };
    const run = runCommands(tough, deps, basicAttack(tough, id));
    expect(damageOn(run.state, id)).toBe(0);
    expect(mustInstance(run.state, id).statuses.tough).toBe(0);
    expect(damageOn(run.state, heroOf(run.state))).toBe(1);
    expect(hostOf(run.state, at.buckler)).toBe(id);
    expect(tally(run.state, at.ledger)).toBe(0);
  });

  it("a basic attack made with THW instead of ATK: 2 damage (THW 2) and the attachment stays", () => {
    const at = table([FOG]);
    const run = runCommands(at.state, deps, basicAttack(at.state, villainOf(at.state)));
    expect(damageOn(run.state, villainOf(run.state))).toBe(2);
    expect(hostOf(run.state, at.buckler)).toBe(villainOf(run.state));
    expect(tally(run.state, at.ledger)).toBe(0);
  });

  it("an (attack) ability with no attack instruction: only its instance marked usesAtk counts, and it marks the attack", () => {
    const at = table();
    const run = play(at.state, COMBO.card.id);
    expect(damageOn(run.state, villainOf(run.state))).toBe(3);
    // One instance of the two used ATK.
    expect(tally(run.state, at.ledger)).toBe(1);
    expect(hostOf(run.state, at.buckler)).toBe(heroOf(run.state));

    const flatOnly = table();
    const jabs = play(flatOnly.state, JABS.card.id);
    expect(damageOn(jabs.state, villainOf(jabs.state))).toBe(3);
    expect(tally(jabs.state, flatOnly.ledger)).toBe(0);
    expect(hostOf(jabs.state, flatOnly.buckler)).toBe(villainOf(jabs.state));
  });

  it("damage that is not an attack's never used ATK to attack, whatever its amount reads", () => {
    const at = table();
    const run = play(at.state, ZAP.card.id);
    expect(damageOn(run.state, villainOf(run.state))).toBe(2);
    expect(damageOn(run.state, heroOf(run.state))).toBe(0);
    expect(tally(run.state, at.ledger)).toBe(0);
    expect(hostOf(run.state, at.buckler)).toBe(villainOf(run.state));
  });

  it("an enemy attacks with its ATK: the villain damages the hero holding the attachment and takes it back", () => {
    const at = table([], "hero");
    const run = runCommands(at.state, deps, { type: "endTurn", playerId: P1 });
    expect(damageOn(run.state, heroOf(run.state))).toBe(2);
    expect(hostOf(run.state, at.buckler)).toBe(villainOf(run.state));
    // The hero's retaliate 1 answered the attack before the attachment left.
    expect(damageOn(run.state, villainOf(run.state))).toBe(1);
    expect(tally(run.state, at.ledger)).toBe(0);
  });
});
