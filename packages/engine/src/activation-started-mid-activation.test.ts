/**
 * An activation initiated indirectly while an enemy activation resolves waits for it (PR #410 owner review of e8ade787d).
 *
 * Sources: RRG 1.8 "Activation" (p. 6): "If an effect initiates an activation during the resolution of another
 * activation, the newly initiated activation resolves after the current activation has finished resolving."; FFG
 * ruling Jun 13, 2024 (#214, docs/rulings/post-rrg-1-5/09-2024-part-4.md): "a new activation cannot interrupt an
 * activation currently resolving."; RRG 1.8 "Boost" (p. 11); ruling Feb 28, 2026 (1) answer 2 (Retaliate and responses
 * resolve before the queued activation).
 *
 * The engine decides this in `resolve/apply-effect.ts` (`case "enemyAttack" | "enemyScheme" | "enemyActivation"`) from
 * the stack: an enemy attack or scheme in progress (`currentActivationFrameId`) holds the new activation in its
 * `endEffects`, whatever ability initiated it. These tests start the activation from an ability that is not a Boost
 * ability.
 */

import { flat, type AbilityReference, type CardId, type HeroIdentityCard } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import type { GameEvent } from "./events.js";
import { playerId } from "./ids.js";
import { activeEncounterDeck, activeVillain } from "./query.js";
import { createGame } from "./setup.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommands } from "./testing/drive.js";
import {
  stubIdentity,
  stubMainScheme,
  stubSideScheme,
  stubSupport,
  stubTreachery,
  stubVillain,
} from "./testing/fixtures.js";
import { DEFAULT_CARDS, DEFAULT_DECK, giveCard, withEncounterPiles } from "./testing/scenario.js";

const p1 = playerId("p1");
const one = { kind: "const", value: 1 } as const;
const self = { kind: "self" } as const;
const theVillain = { kind: "villain" } as const;

/** The scenario's setup puts the villain's signature side scheme into play. */
const PUT_SCHEMES = stubAbility("scenario.setup", {
  trigger: { kind: "setup" },
  effects: [
    { kind: "selectCards", slot: "signature", cards: { kind: "encounterSetAside" } },
    { kind: "putIntoPlay", card: { kind: "slot", slot: "signature" }, controller: { kind: "firstPlayer" } },
  ],
});
const SCENARIO = stubMainScheme({
  id: "scenario",
  stages: [
    { startingThreat: flat(0), targetThreat: flat(99), acceleration: flat(0), aSideAbilities: [PUT_SCHEMES.ref] },
  ],
});
const BLANK = stubTreachery({ id: "blank", boostIcons: 0 });

/** "Forced Response: After threat is placed here, the villain attacks you." Not a Boost ability. */
const ATTACK_ON_THREAT = stubAbility("side.attack-on-threat", {
  trigger: { kind: "response", forced: true, on: { on: "placeThreat", selfIs: "target" } },
  effects: [{ kind: "enemyAttack", enemies: theVillain, against: { kind: "firstPlayer" } }],
});
const SIDE = stubSideScheme({ id: "side", startingThreat: 1, boostIcons: 0, abilities: [ATTACK_ON_THREAT.ref] });
/** "Boost: Place 1 threat on the villain's side scheme." The attack comes from the side scheme's response to it. */
const BOOST_THREAT = stubAbility("threat.boost", {
  trigger: { kind: "boost" },
  effects: [{ kind: "placeThreat", target: { kind: "signatureSideSchemeOf", villain: theVillain }, amount: one }],
});
const THREAT_BOOST = stubTreachery({ id: "threat-boost", boostIcons: 0, abilities: [BOOST_THREAT.ref] });

/** "Forced Response: After the villain's attack deals damage to you, the villain schemes." (no Boost ability anywhere) */
const SCHEME_AFTER_DAMAGE = stubAbility("punisher.scheme-after-damage", {
  trigger: {
    kind: "response",
    forced: true,
    on: { on: "dealDamage", fromAttack: true, requireResults: { amount: 1 } },
  },
  effects: [{ kind: "enemyScheme", enemies: theVillain }],
});
/** "After the villain attacks, …": a response of the activation that the queued one must follow. */
const WATCHER_RESPONSE = stubAbility("watcher.response", {
  trigger: { kind: "response", forced: true, on: { on: "enemyAttack", sourceIs: { categories: ["villain"] } } },
  effects: [{ kind: "addCounters", target: self, counterType: "sawAttack", amount: one }],
});
const WATCHER = stubSupport({ id: "watcher", cost: 0, abilities: [WATCHER_RESPONSE.ref] });
const PUNISHER = stubSupport({ id: "punisher", cost: 0, abilities: [SCHEME_AFTER_DAMAGE.ref] });

/** "Forced Interrupt: When [this villain] would attack, it schemes instead." A replacement, not a new activation. */
const SCHEMES_INSTEAD = stubAbility("boss.schemes-instead", {
  trigger: { kind: "interrupt", forced: true, on: { on: "enemyAttack", selfIs: "source" } },
  effects: [{ kind: "replaceTriggeringEvent", with: [{ kind: "enemyScheme", enemies: self }] }],
});
/** "Forced Response: After the villain attacks, your hero attacks the villain for 1. Discard this card." */
const HERO_STRIKES = stubAbility("striker.response", {
  trigger: { kind: "response", forced: true, on: { on: "enemyAttack", sourceIs: { categories: ["villain"] } } },
  effects: [
    { kind: "attack", target: theVillain, amount: one },
    { kind: "discardFromPlay", target: self },
  ],
});
/** "Forced Response: After you attack, the villain attacks you." (the shape of a leader's punishing response) */
const STRIKE_BACK = stubAbility("striker.strike-back", {
  trigger: { kind: "response", forced: true, on: { on: "attack", playerIs: "controller" } },
  effects: [{ kind: "enemyAttack", enemies: theVillain, against: { kind: "firstPlayer" } }],
});
const STRIKER = stubSupport({ id: "striker", cost: 0, abilities: [HERO_STRIKES.ref] });
const PUNISHING_LEADER = stubSupport({ id: "punishing-leader", cost: 0, abilities: [STRIKE_BACK.ref] });
/**
 * "Forced Response: After the villain's attack deals damage to you, the villain attacks you. If no attack was made this
 * way, place 1 counter here. Discard this card." (Tail Sweep's shape, 02040, answering mid-activation.)
 */
const ATTACK_OR_COUNTER = stubAbility("sweeper.response", {
  trigger: {
    kind: "response",
    forced: true,
    on: { on: "dealDamage", fromAttack: true, requireResults: { amount: 1 } },
  },
  effects: [
    { kind: "enemyAttack", enemies: theVillain, against: { kind: "firstPlayer" }, bind: "sweep" },
    {
      kind: "if",
      condition: { kind: "not", of: { kind: "varAtLeast", name: "sweep.made", amount: 1 } },
      then: [{ kind: "addCounters", target: self, counterType: "noAttack", amount: one }],
    },
    { kind: "discardFromPlay", target: self },
  ],
});
const SWEEPER = stubSupport({ id: "sweeper", cost: 0, abilities: [ATTACK_OR_COUNTER.ref] });

/** "Forced Response: After the villain schemes, the villain attacks you twice. Discard this card." */
const TWO_ATTACKS = stubAbility("doubler.response", {
  trigger: { kind: "response", forced: true, on: { on: "enemyScheme", sourceIs: { categories: ["villain"] } } },
  effects: [
    { kind: "enemyAttack", enemies: theVillain, against: { kind: "firstPlayer" } },
    { kind: "enemyAttack", enemies: theVillain, against: { kind: "firstPlayer" } },
    { kind: "discardFromPlay", target: self },
  ],
});
/** "Forced Interrupt: When the villain would attack, it schemes instead. Discard this card." */
const SCHEME_INSTEAD_ONCE = stubAbility("diverter.interrupt", {
  trigger: { kind: "interrupt", forced: true, on: { on: "enemyAttack", sourceIs: { categories: ["villain"] } } },
  effects: [
    {
      kind: "replaceTriggeringEvent",
      with: [
        { kind: "enemyScheme", enemies: theVillain },
        { kind: "discardFromPlay", target: self },
      ],
    },
  ],
});
/** "Forced Response: After the villain schemes, it attacks each player. Discard this card." */
const ATTACK_EACH = stubAbility("rampage.response", {
  trigger: { kind: "response", forced: true, on: { on: "enemyScheme", sourceIs: { categories: ["villain"] } } },
  effects: [
    {
      kind: "forEachPlayer",
      players: { kind: "each" },
      effects: [{ kind: "enemyAttack", enemies: theVillain, against: { kind: "scoped" } }],
    },
    { kind: "discardFromPlay", target: self },
  ],
});
const DOUBLER = stubSupport({ id: "doubler", cost: 0, abilities: [TWO_ATTACKS.ref] });
const DIVERTER = stubSupport({ id: "diverter", cost: 0, abilities: [SCHEME_INSTEAD_ONCE.ref] });
const RAMPAGE = stubSupport({ id: "rampage", cost: 0, abilities: [ATTACK_EACH.ref] });

const SPIKY: HeroIdentityCard = stubIdentity({
  id: "spiky",
  hp: 20,
  atk: 2,
  thw: 2,
  def: 0,
  rec: 3,
  heroHandSize: 6,
  alterEgoHandSize: 6,
  heroKeywords: [{ name: "retaliate", value: 1 }],
});

/** The second player's hero: the same stats, another card (a group may have one copy of each hero in play). */
const SPIKY_TWO: HeroIdentityCard = stubIdentity({
  id: "spiky-two",
  hp: 20,
  atk: 2,
  thw: 2,
  def: 0,
  rec: 3,
  heroHandSize: 6,
  alterEgoHandSize: 6,
});

const deps: EngineDeps = depsOf(
  PUT_SCHEMES,
  ATTACK_ON_THREAT,
  BOOST_THREAT,
  SCHEME_AFTER_DAMAGE,
  WATCHER_RESPONSE,
  SCHEMES_INSTEAD,
  HERO_STRIKES,
  STRIKE_BACK,
  ATTACK_OR_COUNTER,
  TWO_ATTACKS,
  SCHEME_INSTEAD_ONCE,
  ATTACK_EACH,
);
const copies = (id: CardId, n: number): readonly CardId[] => Array.from({ length: n }, () => id);

function game(
  encounter: readonly CardId[],
  bossAbilities: readonly AbilityReference[] = [],
  playerCount: 1 | 2 = 1,
): GameState {
  const boss = stubVillain({ id: "boss", stages: [{ hp: flat(30), atk: 1, sch: 2, abilities: [...bossAbilities] }] });
  const result = createGame(
    {
      seed: 5,
      cards: [
        ...DEFAULT_CARDS,
        SPIKY,
        SPIKY_TWO,
        boss,
        SCENARIO,
        SIDE,
        BLANK,
        THREAT_BOOST,
        WATCHER,
        PUNISHER,
        STRIKER,
        PUNISHING_LEADER,
        SWEEPER,
        DOUBLER,
        DIVERTER,
        RAMPAGE,
      ],
      villainCardId: boss.id,
      villains: [{ villainCardId: boss.id, encounterDeck: encounter, signatureSideSchemeCardId: SIDE.id }],
      mainSchemeCardId: SCENARIO.id,
      encounterDeck: [],
      players: Array.from({ length: playerCount }, (_, i) => ({
        identityCardId: i === 0 ? SPIKY.id : SPIKY_TWO.id,
        deck: [
          ...DEFAULT_DECK,
          WATCHER.id,
          PUNISHER.id,
          STRIKER.id,
          PUNISHING_LEADER.id,
          SWEEPER.id,
          DOUBLER.id,
          DIVERTER.id,
          RAMPAGE.id,
        ],
      })),
    },
    deps,
  );
  if (!result.ok) throw new Error(result.error.message);
  return runCommands(result.state, deps).state;
}

const toHero: Command = { type: "changeForm", playerId: p1 };
const endTurn: Command = { type: "endTurn", playerId: p1 };
const indexOf = (events: readonly GameEvent[], predicate: (e: GameEvent) => boolean, from = 0) =>
  events.findIndex((e, i) => i >= from && predicate(e));

function playFree(state: GameState, cardId: CardId): GameState {
  const given = giveCard(state, p1, cardId);
  return runCommands(given.state, deps, {
    type: "playCard",
    playerId: p1,
    cardInstanceId: given.id,
    payment: [],
    attachToInstanceId: null,
  }).state;
}

const initiatedIndexes = (events: readonly GameEvent[], kind: "enemyAttack" | "enemyScheme", villain: string) =>
  events.flatMap((e, i) =>
    e.type === "triggerEvent" &&
    e.phase === "initiated" &&
    e.event.kind === kind &&
    "enemyInstanceId" in e.event &&
    e.event.enemyInstanceId === villain
      ? [i]
      : [],
  );

describe("RRG 1.8 'Activation' (p. 6); ruling 214 (Jun 13, 2024): an activation started mid-activation waits", () => {
  // The boost's placeThreat is answered by the side scheme's response, not a Boost ability: its attack still waits for
  // the boosted attack's Retaliate and responses (PR #410 owner review; it ran inside the boosted attack before).
  it("a Boost effect that another card's forced response answers with an attack: the new attack follows the boosted one's Retaliate and responses", () => {
    const start = runCommands(
      playFree(game([THREAT_BOOST.id, ...copies(BLANK.id, 11)]), WATCHER.id),
      deps,
      toHero,
    ).state;
    // Put the boost card on top: it is the first attack's boost card.
    const deck = activeEncounterDeck(start).deck;
    const boost = deck.find((id) => start.instances[id]?.cardId === THREAT_BOOST.id);
    if (!boost) throw new Error("no boost card");
    const topped = withEncounterPiles(start, { deck: [boost, ...deck.filter((id) => id !== boost)] });

    const { state, events } = runCommands(topped, deps, endTurn);
    const villain = activeVillain(state).instanceId;
    const attacks = initiatedIndexes(events, "enemyAttack", villain);
    expect(attacks).toHaveLength(2);
    const [first, second] = attacks as [number, number];
    const retaliate = indexOf(events, (e) => e.type === "damageDealt" && e.targetInstanceId === villain, first);
    const responded = indexOf(events, (e) => e.type === "counterAdded" && e.counterType === "sawAttack", first);
    const firstResolved = indexOf(events, (e) => e.type === "attackResolved" && e.enemyInstanceId === villain, first);
    expect(retaliate).toBeGreaterThan(first);
    expect(retaliate).toBeLessThan(second);
    expect(responded).toBeGreaterThan(first);
    expect(responded).toBeLessThan(second);
    expect(firstResolved).toBeGreaterThan(first);
    expect(firstResolved).toBeLessThan(second);
  });

  describe("a forced response (no Boost ability) that makes the villain scheme mid-attack", () => {
    const run = () => {
      const start = runCommands(
        playFree(playFree(game(copies(BLANK.id, 12)), WATCHER.id), PUNISHER.id),
        deps,
        toHero,
      ).state;
      const { state, events } = runCommands(start, deps, endTurn);
      const villain = activeVillain(state).instanceId;
      const attack = initiatedIndexes(events, "enemyAttack", villain)[0];
      if (attack === undefined) throw new Error("the villain did not attack");
      const scheme = initiatedIndexes(events, "enemyScheme", villain).find((i) => i > attack);
      if (scheme === undefined) throw new Error("the response did not make the villain scheme");
      return { events, villain, attack, scheme };
    };

    it("the scheme follows the attack's damage resolution and Retaliate", () => {
      const { events, villain, attack, scheme } = run();
      const retaliate = indexOf(events, (e) => e.type === "damageDealt" && e.targetInstanceId === villain, attack);
      const resolved = indexOf(events, (e) => e.type === "attackResolved" && e.enemyInstanceId === villain, attack);
      expect(resolved).toBeGreaterThan(attack);
      expect(resolved).toBeLessThan(scheme);
      expect(retaliate).toBeGreaterThan(attack);
      expect(retaliate).toBeLessThan(scheme);
    });

    // The scheme is initiated from the attack's response window: ruling Feb 28, 2026 (1) answer 2 puts an activation's
    // responses inside the activation, and RRG 1.8 p. 6 makes a newly initiated one wait for it to finish, so it
    // follows the attack's other forced response (the Watcher's). PR #410 owner review; it ran before it.
    it("the scheme follows the attack's other responses too (RRG 1.8 p. 6; ruling Feb 28, 2026 (1))", () => {
      const { events, attack, scheme } = run();
      const responded = indexOf(events, (e) => e.type === "counterAdded" && e.counterType === "sawAttack", attack);
      expect(responded).toBeGreaterThan(attack);
      expect(responded).toBeLessThan(scheme);
    });
  });
  // RRG 1.8 "Replacement Effect" (p. 36): the replaced attack never resolves, so there is no activation for the
  // scheme to wait behind (p. 6); a replaced activation also drops what it held (`pushEndEffects`).
  it("an activation that replaces the attack resolves now: the villain schemes instead of attacking", () => {
    const start = runCommands(game(copies(BLANK.id, 12), [SCHEMES_INSTEAD.ref]), deps, toHero).state;
    const { state, events } = runCommands(start, deps, endTurn);
    const villain = activeVillain(state).instanceId;
    expect(events.filter((e) => e.type === "attackResolved" && e.enemyInstanceId === villain)).toHaveLength(0);
    // The player is a hero, so the villain phase's one activation is an attack: this scheme is the one replacing it.
    expect(events.filter((e) => e.type === "schemeResolved" && e.enemyInstanceId === villain)).toHaveLength(1);
  });

  // A hero's attack made during the villain's attack sits above it on the stack; the villain's attack is still
  // resolving beneath it (its responses are part of it: ruling Feb 28, 2026 (1) answer 2), so an activation the hero's
  // attack sets off waits for the villain's attack to finish, not just for the hero's.
  it("an activation started from a hero's attack made during the villain's attack waits for the villain's attack", () => {
    const start = runCommands(
      playFree(playFree(game(copies(BLANK.id, 12)), STRIKER.id), PUNISHING_LEADER.id),
      deps,
      toHero,
    ).state;
    const { state, events } = runCommands(start, deps, endTurn);
    const villain = activeVillain(state).instanceId;
    const attacks = initiatedIndexes(events, "enemyAttack", villain);
    expect(attacks.length).toBeGreaterThanOrEqual(2);
    const [first, second] = attacks as [number, number];
    // The villain attack's response (the Striker's) finishes, its "Discard this card" included, before the new attack:
    // run at once, the new attack began inside the hero's attack's response window, before that discard.
    const strikerDone = indexOf(events, (e) => e.type === "cardDiscardedFromPlay", first);
    expect(strikerDone).toBeGreaterThan(first);
    expect(strikerDone).toBeLessThan(second);
    const heroAttack = indexOf(events, (e) => e.type === "triggerEvent" && e.event.kind === "attack", first);
    expect(heroAttack).toBeGreaterThan(first);
    expect(heroAttack).toBeLessThan(second);
  });

  // GAP (should-fix 2 of the PR #410 review of this change): RRG 1.8 "Activation" (p. 6): "An effect that initiates an
  // enemy activation is considered resolved after that activation has fully resolved." Only the activation is queued
  // (`apply-effect.ts`, `activationToQueueBehind`); the ability's later instructions run at once and read `sweep.made`
  // before the attack is made, so the counter is placed although the attack follows.
  it.fails("the rest of the initiating ability waits for the queued activation: its bind reads the attack", () => {
    const start = runCommands(playFree(game(copies(BLANK.id, 12)), SWEEPER.id), deps, toHero).state;
    const { state, events } = runCommands(start, deps, endTurn);
    const villain = activeVillain(state).instanceId;
    expect(initiatedIndexes(events, "enemyAttack", villain)).toHaveLength(2);
    expect(events.some((e) => e.type === "counterAdded" && e.counterType === "noAttack")).toBe(false);
  });
  // RRG 1.8 "Replacement Effect" (p. 36), nested: an attack that was itself queued behind an activation and is then
  // replaced resolves its replacement in its place, before the next queued attack, not behind the outer activation.
  it("a queued attack that is replaced: its replacement scheme resolves in its place, before the next queued attack", () => {
    const start = playFree(playFree(game(copies(BLANK.id, 12)), DOUBLER.id), DIVERTER.id);
    // In alter-ego form the villain phase's activation is a scheme: the Doubler queues two attacks behind it.
    const { state, events } = runCommands(start, deps, endTurn);
    const villain = activeVillain(state).instanceId;
    const schemes = events.flatMap((e, i) => (e.type === "schemeResolved" && e.enemyInstanceId === villain ? [i] : []));
    const attacks = events.flatMap((e, i) => (e.type === "attackResolved" && e.enemyInstanceId === villain ? [i] : []));
    // The phase's scheme, then the one replacing the first queued attack; the second queued attack is made.
    expect(schemes).toHaveLength(2);
    expect(attacks).toHaveLength(1);
    expect(schemes[1]).toBeLessThan(attacks[0]!);
  });

  // The queued activation keeps the scope of the effect that initiated it (`DeferredEffects` scopedPlayerId / event):
  // "it attacks each player" queued behind the scheme still names each player as "that player" (Juggernaut 40121b).
  it("an 'attacks each player' started during a scheme waits for it and still attacks each player", () => {
    const p2 = playerId("p2");
    const start = playFree(game(copies(BLANK.id, 12), [], 2), RAMPAGE.id);
    const { state, events } = runCommands(start, deps, endTurn, { type: "endTurn", playerId: p2 });
    const villain = activeVillain(state).instanceId;
    const attacked = events.flatMap((e) =>
      e.type === "triggerEvent" &&
      e.phase === "initiated" &&
      e.event.kind === "enemyAttack" &&
      e.event.enemyInstanceId === villain
        ? [e.event.attackedPlayerId]
        : [],
    );
    expect(attacked).toEqual([p1, p2]);
    // Both wait for the first scheme (against p1) to finish: its Rampage response has resolved, discard included.
    const firstAttack = initiatedIndexes(events, "enemyAttack", villain)[0]!;
    const discarded = indexOf(events, (e) => e.type === "cardDiscardedFromPlay");
    expect(discarded).toBeGreaterThan(0);
    expect(discarded).toBeLessThan(firstAttack);
  });
});
