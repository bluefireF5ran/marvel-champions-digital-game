/**
 * "Forced Interrupt: When attached character would scheme, thwart, or attack, discard this card instead." (Tangled
 * Up, `cw` 56181; docs/phase7-wave10.md §3.21): `TriggerEvent characterWouldAct`, announced by a basic attack or
 * thwart and by an attack- or thwart-labeled ability once its costs are paid. A synthetic attachment with that
 * sentence, on the hero.
 *
 * RRG 1.8 "'Would'" (p. 48) and "Replacement Effect" (p. 37): the replaced act did not happen. "Cost" (p. 13): what
 * was paid stays paid. "Labeled Ability" (p. 26): an attack- or thwart-labeled ability is its player's identity's
 * attack or thwart. "Stun, Stunned" (p. 41): the stunned status card replaces the attack first.
 */

import { flat } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { activeEncounterDeckId, mustInstance, mustPlayer } from "./query.js";
import { cardsInPlay } from "./select.js";
import type { ValueSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommands, runCommandsPicking } from "./testing/drive.js";
import { stubAttachment, stubEvent, stubMainScheme, stubMinion, stubSupport, stubVillain } from "./testing/fixtures.js";
import { ALLY, defaultPick, giveCard, giveCards, payFor, RESOURCE } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, P1, playerCardIntoPlay } from "./testing/wave3.js";

const n = (value: number): ValueSpec => ({ kind: "const", value });
const HOST = { hostOfSelf: true } as const;

/** "Forced Interrupt: When attached character would thwart or attack, discard this card instead." */
const SNARE_INTERRUPT = stubAbility("snare.interrupt", {
  trigger: { kind: "interrupt", forced: true, on: { on: "characterWouldAct", targetIs: HOST } },
  effects: [{ kind: "replaceTriggeringEvent", with: [{ kind: "discardFromPlay", target: { kind: "self" } }] }],
});
const SNARE = stubAttachment({ id: "snare", abilities: [SNARE_INTERRUPT.ref] });
/** The same, for an attack only. */
const NET_INTERRUPT = stubAbility("net.interrupt", {
  trigger: {
    kind: "interrupt",
    forced: true,
    on: { on: "characterWouldAct", targetIs: HOST, eventIs: { act: "attack" } },
  },
  effects: [{ kind: "replaceTriggeringEvent", with: [{ kind: "discardFromPlay", target: { kind: "self" } }] }],
});
const NET = stubAttachment({ id: "net", abilities: [NET_INTERRUPT.ref] });

/** Counts what was announced: "After a character uses a basic power" and "After a character attacks or thwarts". */
const LEDGER_USED = stubAbility("ledger.used", {
  trigger: { kind: "response", forced: true, on: { on: "basicPowerUsed" } },
  effects: [{ kind: "addCounters", target: { kind: "self" }, counterType: "used", amount: n(1) }],
});
const LEDGER_ACTED = stubAbility("ledger.acted", {
  trigger: { kind: "response", forced: true, on: { on: ["attack", "thwart"] } },
  effects: [{ kind: "addCounters", target: { kind: "self" }, counterType: "acted", amount: n(1) }],
});
const LEDGER = stubSupport({ id: "ledger", cost: 0, abilities: [LEDGER_USED.ref, LEDGER_ACTED.ref] });

const event = (id: string, cost: number, definition: Omit<AbilityDefinition, "trigger">) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, ...definition });
  return { card: stubEvent({ id, cost, abilities: [ability.ref] }), ability };
};
const villain = { kind: "villain" } as const;
/** "Hero Action (attack): Deal 4 damage to the villain." Cost 2. */
const STRIKE = event("strike", 2, { label: ["attack"], effects: [{ kind: "attack", target: villain, amount: n(4) }] });
/** "Hero Action (thwart): Remove 3 threat from the main scheme." */
const FOIL = event("foil", 0, {
  label: ["thwart"],
  effects: [{ kind: "thwart", target: { kind: "mainScheme" }, amount: n(3) }],
});
/** Not an attack: "Deal 3 damage to the villain." */
const ZAP = event("zap", 0, { effects: [{ kind: "dealDamage", target: villain, amount: n(3) }] });
/** "Hero Action (attack): Deal 1 damage to the villain. Limit once per round." on a support. */
const TURRET_ACTION = stubAbility("turret.action", {
  trigger: { kind: "action" },
  label: ["attack"],
  limit: { count: 1, period: "round" },
  effects: [{ kind: "attack", target: villain, amount: n(1) }],
});
const TURRET = stubSupport({ id: "turret", cost: 0, abilities: [TURRET_ACTION.ref] });
const EVENTS = [STRIKE, FOIL, ZAP];

const TYRANT = stubVillain({ id: "tyrant", stages: [{ hp: flat(30), atk: 3, sch: 0 }] });
const SCHEME = stubMainScheme({
  id: "long",
  stages: [{ startingThreat: flat(6), targetThreat: flat(99), acceleration: flat(0) }],
});
const FILLER = stubMinion({ id: "filler", atk: 0, sch: 0, hp: 9, boostIcons: 0 });

const deps: EngineDeps = depsOf(
  SNARE_INTERRUPT,
  NET_INTERRUPT,
  LEDGER_USED,
  LEDGER_ACTED,
  TURRET_ACTION,
  ...EVENTS.map((e) => e.ability),
);
/** The same game with nothing that hears the "would" point. */
const quiet: EngineDeps = depsOf(LEDGER_USED, LEDGER_ACTED, TURRET_ACTION, ...EVENTS.map((e) => e.ability));

const toHero: Command = { type: "changeForm", playerId: P1 };
const heroOf = (state: GameState) => mustPlayer(state, P1).identity.instanceId;
const villainOf = (state: GameState) => state.villains[0]!.instanceId;
const damageOn = (state: GameState, id: InstanceId) => mustInstance(state, id).damage;
const mainThreat = (state: GameState) => mustInstance(state, state.mainScheme.instanceId).threat;
const inPlay = (state: GameState, id: InstanceId) => cardsInPlay(state).includes(id);
const basicAttack = (state: GameState, attacker = heroOf(state)): Command => ({
  type: "basicAttack",
  playerId: P1,
  attackerInstanceId: attacker,
  targetInstanceId: villainOf(state),
});
const basicThwart = (state: GameState): Command => ({
  type: "basicThwart",
  playerId: P1,
  thwarterInstanceId: heroOf(state),
  schemeInstanceId: state.mainScheme.instanceId,
});
const wouldActs = (events: readonly GameEvent[]) =>
  events.flatMap((e) =>
    e.type === "triggerEvent" && e.event.kind === "characterWouldAct" ? [`${e.event.act} ${e.phase}`] : [],
  );
const kinds = (events: readonly GameEvent[], kind: string) =>
  events.filter((e) => e.type === "triggerEvent" && e.event.kind === kind && e.phase === "initiated").length;

/** Attaches the encounter deck's copy of `card` to `to` (surgery: no reveal). */
function attach(state: GameState, card: { readonly id: string }, to: InstanceId) {
  const deckId = activeEncounterDeckId(state);
  const piles = state.encounterDecks[deckId]!;
  const id = piles.deck.find((key) => state.instances[key]?.cardId === card.id);
  if (!id) throw new Error(`no ${card.id} in the encounter deck`);
  const next: GameState = {
    ...state,
    encounterDecks: { ...state.encounterDecks, [deckId]: { ...piles, deck: piles.deck.filter((x) => x !== id) } },
    instances: {
      ...state.instances,
      [id]: { ...mustInstance(state, id), faceup: true, attachedTo: to },
      [to]: { ...mustInstance(state, to), attachments: [...mustInstance(state, to).attachments, id] },
    },
  };
  return { state: next, id };
}

/** P1 in hero form with the Ledger in play and the Snare (or `card`) on the hero. */
function table(using: EngineDeps = deps, card: { readonly id: string } | null = SNARE) {
  let state = gameAtFirstTurn({
    cards: [SNARE, NET, LEDGER, TURRET, FILLER, ...EVENTS.map((e) => e.card)],
    deps: using,
    villain: TYRANT,
    mainScheme: SCHEME,
    encounter: [SNARE.id, NET.id, ...copiesOf(FILLER.id, 12)],
    deck: [LEDGER.id, TURRET.id, ...EVENTS.map((e) => e.card.id)],
  });
  const ledger = playerCardIntoPlay(state, LEDGER.id);
  state = runCommands(ledger.state, using, toHero).state;
  if (!card) return { state, ledger: ledger.id, snare: null as unknown as InstanceId };
  const attached = attach(state, card, heroOf(state));
  return { state: attached.state, ledger: ledger.id, snare: attached.id };
}
const counters = (state: GameState, ledger: InstanceId) => mustInstance(state, ledger).counters;
/** Plays `card` from hand (surgery puts it there, with `cost` resource cards to pay for it). */
const play = (state: GameState, card: string, cost = 0) => {
  const funded = giveCards(state, P1, ...copiesOf(RESOURCE.id, cost)).state;
  const given = giveCard(funded, P1, card);
  return runCommands(given.state, deps, {
    type: "playCard",
    playerId: P1,
    cardInstanceId: given.id,
    payment: payFor(given.state, P1, cost),
    attachToInstanceId: null,
  });
};
const readied = (state: GameState, id: InstanceId): GameState => ({
  ...state,
  instances: { ...state.instances, [id]: { ...mustInstance(state, id), exhausted: false } },
});

describe("docs/phase7-wave10.md §3.21: a character would attack or thwart", () => {
  it("a basic attack: the hero is exhausted, nothing is dealt, the attachment is discarded, and no attack was made", () => {
    const at = table();
    const run = runCommands(at.state, deps, basicAttack(at.state));
    expect(mustInstance(run.state, heroOf(run.state)).exhausted).toBe(true);
    expect(damageOn(run.state, villainOf(run.state))).toBe(0);
    expect(inPlay(run.state, at.snare)).toBe(false);
    expect(mustInstance(run.state, heroOf(run.state)).attachments).toEqual([]);
    expect(wouldActs(run.events)).toEqual(["attack initiated", "attack cancelled"]);
    // Replaced, so it did not happen: no attack event, no basic power used.
    expect(kinds(run.events, "attack")).toBe(0);
    expect(counters(run.state, at.ledger)).toEqual({});
    const replayed = replay(run.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(run.state);
  });

  it("the next basic attack works: 2 damage, announced as usual", () => {
    const at = table();
    const first = runCommands(at.state, deps, basicAttack(at.state)).state;
    const ready = readied(first, heroOf(first));
    const run = runCommands(ready, deps, basicAttack(ready));
    expect(damageOn(run.state, villainOf(run.state))).toBe(2);
    expect(wouldActs(run.events)).toEqual([]);
    expect(counters(run.state, at.ledger)).toEqual({ used: 1, acted: 1 });
  });

  it("a basic thwart: the hero is exhausted, no threat is removed, the attachment is discarded", () => {
    const at = table();
    const run = runCommands(at.state, deps, basicThwart(at.state));
    expect(mustInstance(run.state, heroOf(run.state)).exhausted).toBe(true);
    expect(mainThreat(run.state)).toBe(6);
    expect(inPlay(run.state, at.snare)).toBe(false);
    expect(wouldActs(run.events)).toEqual(["thwart initiated", "thwart cancelled"]);
    expect(counters(run.state, at.ledger)).toEqual({});
  });

  it("with nothing to replace it the point resolves into the power: 2 threat removed, announced once", () => {
    const at = table(deps, null);
    const netted = attach(at.state, NET, heroOf(at.state));
    const run = runCommands(netted.state, deps, basicThwart(netted.state));
    // The Net hears attacks only, so nothing is pushed for the thwart.
    expect(wouldActs(run.events)).toEqual([]);
    expect(mainThreat(run.state)).toBe(4);
    expect(inPlay(run.state, netted.id)).toBe(true);
    expect(counters(run.state, at.ledger)).toEqual({ used: 1, acted: 1 });
    const attack = runCommands(netted.state, deps, basicAttack(netted.state));
    expect(damageOn(attack.state, villainOf(attack.state))).toBe(0);
    expect(inPlay(attack.state, netted.id)).toBe(false);
  });

  it("a 2-cost attack event: paid for and discarded, 0 damage, the attachment discarded", () => {
    const at = table();
    const spent = (s: GameState) =>
      mustPlayer(s, P1).discard.filter((id) => s.instances[id]?.cardId === RESOURCE.id).length;
    const run = play(at.state, STRIKE.card.id, 2);
    expect(damageOn(run.state, villainOf(run.state))).toBe(0);
    expect(inPlay(run.state, at.snare)).toBe(false);
    // The two cards that paid for it are in the discard pile, and so is the event.
    expect(spent(run.state)).toBe(spent(at.state) + 2);
    const strike = mustPlayer(run.state, P1).discard.filter((id) => run.state.instances[id]?.cardId === STRIKE.card.id);
    expect(strike).toHaveLength(1);
    expect(wouldActs(run.events)).toEqual(["attack initiated", "attack cancelled"]);
    expect(kinds(run.events, "attack")).toBe(0);
    // A labeled ability does not exhaust the hero.
    expect(mustInstance(run.state, heroOf(run.state)).exhausted).toBe(false);
    // Played again without the attachment: 4 damage.
    const again = play(run.state, STRIKE.card.id, 2);
    expect(damageOn(again.state, villainOf(again.state))).toBe(4);
    expect(wouldActs(again.events)).toEqual([]);
  });

  it("a thwart event: discarded, no threat removed, the attachment discarded", () => {
    const at = table();
    const run = play(at.state, FOIL.card.id);
    expect(mainThreat(run.state)).toBe(6);
    expect(inPlay(run.state, at.snare)).toBe(false);
    expect(wouldActs(run.events)).toEqual(["thwart initiated", "thwart cancelled"]);
  });

  it("a replaced use of a limited attack ability counts toward its limit", () => {
    const at = table();
    const turret = playerCardIntoPlay(at.state, TURRET.id);
    const use: Command = {
      type: "useAbility",
      playerId: P1,
      cardInstanceId: turret.id,
      abilityId: TURRET_ACTION.ref.id,
      payment: [],
    };
    const run = runCommands(turret.state, deps, use);
    expect(damageOn(run.state, villainOf(run.state))).toBe(0);
    expect(inPlay(run.state, at.snare)).toBe(false);
    expect(run.events.filter((e) => e.type === "abilityUseRecorded")).toHaveLength(1);
    expect(() => runCommands(run.state, deps, use)).toThrow();
  });

  it("an event that is not an attack, and an ally's basic attack, are not the attached character's", () => {
    const at = table();
    const zap = play(at.state, ZAP.card.id);
    expect(damageOn(zap.state, villainOf(zap.state))).toBe(3);
    expect(inPlay(zap.state, at.snare)).toBe(true);
    const ally = playerCardIntoPlay(zap.state, ALLY.id);
    const run = runCommands(ally.state, deps, basicAttack(ally.state, ally.id));
    expect(damageOn(run.state, villainOf(run.state))).toBe(5);
    expect(inPlay(run.state, at.snare)).toBe(true);
    expect(wouldActs(run.events)).toEqual([]);
  });

  it("a stunned hero's attack discards the stunned card and leaves the attachment for the next attack", () => {
    const at = table();
    const hero = heroOf(at.state);
    const stunned: GameState = {
      ...at.state,
      instances: {
        ...at.state.instances,
        [hero]: { ...mustInstance(at.state, hero), statuses: { stunned: 1, confused: 0, tough: 0 } },
      },
    };
    const run = runCommands(stunned, deps, basicAttack(stunned));
    expect(mustInstance(run.state, hero).statuses.stunned).toBe(0);
    expect(inPlay(run.state, at.snare)).toBe(true);
    expect(wouldActs(run.events)).toEqual([]);
    const event = play(stunned, STRIKE.card.id, 2);
    expect(mustInstance(event.state, hero).statuses.stunned).toBe(0);
    expect(inPlay(event.state, at.snare)).toBe(true);
    expect(damageOn(event.state, villainOf(event.state))).toBe(0);
  });

  it("a basic defense and a basic recovery are untouched", () => {
    const at = table();
    const hero = heroOf(at.state);
    const defended = runCommandsPicking(
      at.state,
      deps,
      (s) => (s.pendingChoice?.prompt.kind === "declareDefender" ? [hero] : defaultPick(s)),
      { type: "endTurn", playerId: P1 },
    );
    // The villain's 3 ATK against the hero's 2 DEF: 1 damage, and the attachment is still there.
    expect(damageOn(defended.state, hero)).toBe(1);
    expect(inPlay(defended.state, at.snare)).toBe(true);
    expect(wouldActs(defended.events)).toEqual([]);
    // The next turn, in alter-ego form: recovery heals it.
    const next = readied(defended.state, hero);
    const recovered = runCommands(next, deps, toHero, { type: "basicRecover", playerId: P1 });
    expect(damageOn(recovered.state, hero)).toBe(0);
    expect(inPlay(recovered.state, at.snare)).toBe(true);
    expect(wouldActs(recovered.events)).toEqual([]);
  });

  it("with no card hearing the point nothing is pushed for it, and the log is as before", () => {
    const at = table(quiet, null);
    const run = runCommands(at.state, quiet, basicAttack(at.state));
    expect(wouldActs(run.events)).toEqual([]);
    expect(damageOn(run.state, villainOf(run.state))).toBe(2);
  });
});
