/**
 * docs/phase7-wave9.md §3.55: the "would be placed" window in front of a placement of counters (`TriggerEvent
 * countersPlaced` with `imminent`), opened only when an interrupt answers it, and the placement replaced.
 *
 * Synthetic cards shaped like Prime Real Estate 1B (`tt` 55004b): "Forced Interrupt: When a charm counter would be
 * placed on the Enchantment card in your play area, if your identity has the Enthralled trait, place 1 threat here
 * instead." RRG 1.8 "'Would'" (p. 48), "Interrupt" (p. 25), "Replacement Effect" (p. 37).
 */

import { trait } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { Command } from "./commands.js";
import type { GameEvent } from "./events.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommandsPicking } from "./testing/drive.js";
import { stubAttachment, stubEvent, stubSideScheme, stubTreachery } from "./testing/fixtures.js";
import { defaultPick, giveCard } from "./testing/scenario.js";
import { copiesOf, encounterCardInVillainArea, gameAtFirstTurn, P1, P2 } from "./testing/wave3.js";

const self = { kind: "self" } as const;
const you = { kind: "controller" } as const;
const n = (value: number) => ({ kind: "const", value }) as const;
const ENTHRALLED = trait("ENTHRALLED");
const hostIdentity = { categories: ["identity"], hostOfSelf: true } as const;
const eachHolder = { kind: "each", query: { name: "holder" } } as const;

/** The Enchantment: it holds charm counters. "After a charm counter is placed here, place 1 seen counter here." */
const HOLDER_SEEN = stubAbility("holder.seen", {
  trigger: {
    kind: "response",
    forced: true,
    on: { on: "countersPlaced", selfIs: "target", eventIs: { counterType: "charm" } },
  },
  effects: [{ kind: "addCounters", target: self, counterType: "seen", amount: { kind: "eventAmount" } }],
});
const HOLDER = stubAttachment({ id: "holder", attachesTo: { kind: "yourIdentity" }, abilities: [HOLDER_SEEN.ref] });
/** "Your identity gains the Enthralled trait." */
const THRALL_TRAIT = stubAbility("thrall.trait", {
  trigger: { kind: "constant", traitGrants: [{ trait: ENTHRALLED, target: hostIdentity }] },
  effects: [],
});
const THRALL = stubAttachment({ id: "thrall", attachesTo: { kind: "yourIdentity" }, abilities: [THRALL_TRAIT.ref] });
/**
 * "Forced Interrupt: When a charm counter would be placed on the holder in your play area, if your identity has the
 * Enthralled trait, place 1 threat here instead."
 */
const ESTATE_INTERRUPT = stubAbility("estate.interrupt", {
  trigger: {
    kind: "interrupt",
    forced: true,
    on: {
      on: "countersPlaced",
      eventIs: { counterType: "charm" },
      targetIs: {
        name: "holder",
        host: { kind: "each", query: { categories: ["identity"], trait: ENTHRALLED } },
      },
    },
  },
  effects: [
    {
      kind: "replaceTriggeringEvent",
      with: [{ kind: "placeThreat", target: self, amount: { kind: "eventAmount" } }],
    },
  ],
});
const ESTATE = stubSideScheme({ id: "estate", startingThreat: 0, abilities: [ESTATE_INTERRUPT.ref] });

const event = (id: string, effects: readonly EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
/** "Action: Place 1 charm counter on each holder." */
const WHISPER = event("whisper", [{ kind: "addCounters", target: eachHolder, counterType: "charm", amount: n(1) }]);
/** "Action: Place 3 charm counters on each holder." */
const CHORUS = event("chorus", [{ kind: "addCounters", target: eachHolder, counterType: "charm", amount: n(3) }]);
/** "Action: Place 2 charm counters on each holder. Take 1 damage for each counter placed this way." */
const TOLL = event("toll", [
  { kind: "addCounters", target: eachHolder, counterType: "charm", amount: n(2), bind: "placed" },
  { kind: "dealDamage", target: { kind: "identityOf", player: you }, amount: { kind: "var", name: "placed.amount" } },
]);
/** "Action: Place 1 other counter on each holder." (not a charm counter) */
const HUM = event("hum", [{ kind: "addCounters", target: eachHolder, counterType: "other", amount: n(1) }]);
const FILLER = stubTreachery({ id: "filler", boostIcons: 0 });
const EVENTS = [WHISPER, CHORUS, TOLL, HUM];
const deps = depsOf(HOLDER_SEEN, THRALL_TRAIT, ESTATE_INTERRUPT, ...EVENTS.map((e) => e.ability));
/** The same cards with nothing that hears a counter about to be placed. */
const quietDeps = depsOf(HOLDER_SEEN, THRALL_TRAIT, ...EVENTS.map((e) => e.ability));

/** Surgery: the first copy of `card` in the encounter deck goes onto `player`'s identity. */
function attached(state: GameState, card: string, player: PlayerId): { state: GameState; id: InstanceId } {
  const deckId = Object.keys(state.encounterDecks)[0] as keyof typeof state.encounterDecks;
  const piles = state.encounterDecks[deckId]!;
  const id = piles.deck.find((candidate) => state.instances[candidate]?.cardId === card)!;
  const host = mustPlayer(state, player).identity.instanceId;
  return {
    id,
    state: {
      ...state,
      encounterDecks: { ...state.encounterDecks, [deckId]: { ...piles, deck: piles.deck.filter((x) => x !== id) } },
      instances: {
        ...state.instances,
        [id]: { ...mustInstance(state, id), attachedTo: host, faceup: true },
        [host]: { ...mustInstance(state, host), attachments: [...mustInstance(state, host).attachments, id] },
      },
    },
  };
}

interface Table {
  readonly state: GameState;
  readonly estate: InstanceId;
  readonly holders: Readonly<Record<string, InstanceId>>;
}

/** Two players, each with a holder; `enthralled` have the trait. The estate is in play with 3 threat. */
function table(enthralled: readonly PlayerId[], withDeps = deps): Table {
  let state = gameAtFirstTurn({
    cards: [HOLDER, THRALL, ESTATE, FILLER, ...EVENTS.map((e) => e.card)],
    deps: withDeps,
    players: 2,
    deck: EVENTS.map((e) => e.card.id),
    encounter: [HOLDER.id, HOLDER.id, THRALL.id, THRALL.id, ESTATE.id, ...copiesOf(FILLER.id, 20)],
  });
  const estate = encounterCardInVillainArea(state, ESTATE.id, 3);
  state = estate.state;
  const holders: Record<string, InstanceId> = {};
  for (const player of [P1, P2]) {
    const holder = attached(state, HOLDER.id, player);
    holders[player] = holder.id;
    state = holder.state;
    if (enthralled.includes(player)) state = attached(state, THRALL.id, player).state;
  }
  return { state, estate: estate.id, holders };
}

function play(t: Table, card: (typeof EVENTS)[number], withDeps = deps) {
  const given = giveCard(t.state, P1, card.card.id);
  const command: Command = {
    type: "playCard",
    playerId: P1,
    cardInstanceId: given.id,
    payment: [],
    attachToInstanceId: null,
  };
  return runCommandsPicking(given.state, withDeps, defaultPick, command);
}

const counters = (state: GameState, id: InstanceId, type: string) => mustInstance(state, id).counters[type] ?? 0;
const threat = (state: GameState, id: InstanceId) => mustInstance(state, id).threat;
const imminent = (events: readonly GameEvent[]) =>
  events.filter((e) => e.type === "triggerEvent" && e.event.kind === "countersPlaced" && e.event.imminent);

describe("§3.55 a counter that would be placed: the interrupt window, and the placement replaced", () => {
  it("an Enthralled player's counter becomes 1 threat on the scheme; a player without the trait gets the counter", () => {
    const t = table([P1]);
    const { state, events } = play(t, WHISPER);
    expect(counters(state, t.holders[P1]!, "charm")).toBe(0);
    expect(threat(state, t.estate)).toBe(4);
    expect(counters(state, t.holders[P2]!, "charm")).toBe(1);
    // The replaced placement is not announced as placed: "after a charm counter is placed here" answers P2's only.
    expect(counters(state, t.holders[P1]!, "seen")).toBe(0);
    expect(counters(state, t.holders[P2]!, "seen")).toBe(1);
    expect(events.filter((e) => e.type === "counterAdded" && e.counterType === "charm").length).toBe(1);
  });

  it("the other way round: the first placement lands at once and the second, heard, is replaced", () => {
    const t = table([P2]);
    const { state } = play(t, WHISPER);
    expect(counters(state, t.holders[P1]!, "charm")).toBe(1);
    expect(counters(state, t.holders[P2]!, "charm")).toBe(0);
    expect(threat(state, t.estate)).toBe(4);
  });

  it("one for each counter: 3 counters about to be placed become 3 threat; both players Enthralled, 6", () => {
    const one = table([P1]);
    const single = play(one, CHORUS);
    expect(threat(single.state, one.estate)).toBe(6);
    expect(counters(single.state, one.holders[P1]!, "charm")).toBe(0);
    expect(counters(single.state, one.holders[P2]!, "charm")).toBe(3);
    // One placement of 3 is one announcement with the number placed.
    expect(counters(single.state, one.holders[P2]!, "seen")).toBe(3);
    const both = table([P1, P2]);
    const double = play(both, CHORUS);
    expect(threat(double.state, both.estate)).toBe(9);
    expect(counters(double.state, both.holders[P2]!, "charm")).toBe(0);
  });

  it("'placed this way' counts the counters that landed, not the replaced ones", () => {
    const t = table([P1]);
    const { state } = play(t, TOLL);
    // P1's 2 were replaced (2 threat); P2's 2 landed after their window: 2 damage.
    expect(threat(state, t.estate)).toBe(5);
    expect(mustInstance(state, mustPlayer(state, P1).identity.instanceId).damage).toBe(2);
    const none = table([P1, P2]);
    const replaced = play(none, TOLL);
    expect(mustInstance(replaced.state, mustPlayer(replaced.state, P1).identity.instanceId).damage).toBe(0);
    const all = table([]);
    const landed = play(all, TOLL);
    expect(mustInstance(landed.state, mustPlayer(landed.state, P1).identity.instanceId).damage).toBe(4);
  });

  it("the window opens only when an interrupt answers: no player Enthralled, another counter type, or no listener", () => {
    const defiant = table([]);
    const plain = play(defiant, WHISPER);
    expect(imminent(plain.events)).toEqual([]);
    expect(counters(plain.state, defiant.holders[P1]!, "charm")).toBe(1);
    expect(threat(plain.state, defiant.estate)).toBe(3);

    const thralls = table([P1, P2]);
    const other = play(thralls, HUM);
    expect(imminent(other.events)).toEqual([]);
    expect(counters(other.state, thralls.holders[P1]!, "other")).toBe(1);
    expect(threat(other.state, thralls.estate)).toBe(3);

    // A registry with no such interrupt logs exactly what it always did.
    const quiet = table([P1, P2], quietDeps);
    const before = play(quiet, WHISPER, quietDeps);
    expect(imminent(before.events)).toEqual([]);
    expect(counters(before.state, quiet.holders[P1]!, "charm")).toBe(1);
    expect(counters(before.state, quiet.holders[P1]!, "seen")).toBe(1);
    // With the listener in the registry and nobody Enthralled, the same play logs the same events.
    const same = play(table([]), WHISPER);
    const kinds = (events: readonly GameEvent[]) => events.map((e) => e.type);
    expect(kinds(same.events)).toEqual(kinds(play(table([], quietDeps), WHISPER, quietDeps).events));
  });

  it("the window is logged as an interrupt to the placement, cancelled when replaced, and replays the same", () => {
    const t = table([P1]);
    const first = play(t, WHISPER);
    const logged = imminent(first.events);
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.some((e) => e.type === "triggerEvent" && e.phase === "cancelled")).toBe(true);
    expect(play(t, WHISPER).state).toEqual(first.state);
  });
});
