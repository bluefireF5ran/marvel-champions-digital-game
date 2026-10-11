/**
 * `AbilityCost.dealEncounterCardsTo`: "Hero Action: Exhaust [this card] and deal a player 1 facedown encounter card →
 * place 1 recon counter here." A deal paid as a cost to a player the payer picks, with synthetic cards.
 *
 * Sources: RRG 1.8 "Deal, Deal an Encounter Card" (p. 15): "the player takes the top card of the encounter deck and
 * places it facedown in front of them. This card is not revealed at this time."; "Cost" (p. 13): "If multiple costs
 * for a single card or ability require payment, those costs must be paid simultaneously."; "Initiating Abilities"
 * (p. 24), step 3: the cost is determined, picks included, before it is paid.
 */

import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { applyCommand, replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { legalActions, tryPayment } from "./legal.js";
import { mustInstance, mustPlayer } from "./query.js";
import type { TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommands } from "./testing/drive.js";
import { stubSupport, stubTreachery } from "./testing/fixtures.js";
import { copiesOf, gameAtFirstTurn, P1, P2, playerCardIntoPlay } from "./testing/wave3.js";

const self: TargetRef = { kind: "self" };
const n = (value: number) => ({ kind: "const", value }) as const;

/** "Action: Exhaust this card and deal a player 1 facedown encounter card → place 1 recon counter here." */
const SCOUT_ACTION = stubAbility("scout.action", {
  trigger: { kind: "action" },
  cost: { exhaustSelf: true, dealEncounterCardsTo: { count: 1, slot: "dealtTo" } },
  effects: [
    { kind: "addCounters", target: self, counterType: "recon", amount: n(1) },
    // "That player" is the controller of the slot's card: marked, to show the slot reaches the effects.
    { kind: "addCounters", target: { kind: "slot", slot: "dealtTo" }, counterType: "marked", amount: n(1) },
  ],
});
const SCOUT = stubSupport({ id: "scout", cost: 0, abilities: [SCOUT_ACTION.ref] });
/** "Action: Deal a player 2 facedown encounter cards → place 1 recon counter here." */
const SWEEP_ACTION = stubAbility("sweep.action", {
  trigger: { kind: "action" },
  cost: { dealEncounterCardsTo: { count: 2, slot: "dealtTo" } },
  effects: [{ kind: "addCounters", target: self, counterType: "recon", amount: n(1) }],
});
const SWEEP = stubSupport({ id: "sweep", cost: 0, abilities: [SWEEP_ACTION.ref] });
/** "Forced Interrupt: When a player would be dealt an encounter card, place 1 seen counter here." */
const WATCHER_INTERRUPT = stubAbility("watcher.forced-interrupt", {
  trigger: { kind: "interrupt", forced: true, on: { on: "encounterCardBeingDealt" } },
  effects: [{ kind: "addCounters", target: self, counterType: "seen", amount: n(1) }],
});
const WATCHER = stubSupport({ id: "watcher", cost: 0, abilities: [WATCHER_INTERRUPT.ref] });
/** "Forced Response: After a player is dealt an encounter card, place 1 dealt counter here." */
const WITNESS_RESPONSE = stubAbility("witness.response", {
  trigger: { kind: "response", forced: true, on: { on: "encounterCardDealt" } },
  effects: [{ kind: "addCounters", target: self, counterType: "dealt", amount: n(1) }],
});
const WITNESS = stubSupport({ id: "witness", cost: 0, abilities: [WITNESS_RESPONSE.ref] });
const FILLER = stubTreachery({ id: "filler", boostIcons: 0 });

const deps: EngineDeps = depsOf(SCOUT_ACTION, SWEEP_ACTION, WATCHER_INTERRUPT, WITNESS_RESPONSE);
const SUPPORTS = [SCOUT, SWEEP, WATCHER, WITNESS];

function table(players: 1 | 2, ...inPlay: readonly { readonly id: string }[]) {
  let state = gameAtFirstTurn({
    players,
    cards: [...SUPPORTS, FILLER],
    deps,
    deck: SUPPORTS.map((s) => s.id),
    encounter: copiesOf(FILLER.id, 30),
  });
  const ids: Record<string, InstanceId> = {};
  for (const card of inPlay) {
    const put = playerCardIntoPlay(state, card.id as never);
    state = put.state;
    ids[card.id] = put.id;
  }
  return { state, ids };
}
const identityOf = (state: GameState, player: PlayerId): InstanceId => mustPlayer(state, player).identity.instanceId;
const deckOf = (state: GameState): readonly InstanceId[] => Object.values(state.encounterDecks)[0]!.deck;
const counter = (state: GameState, id: InstanceId, type: string) => mustInstance(state, id).counters[type] ?? 0;
const use = (card: InstanceId, abilityId: string, dealTo?: InstanceId): Command => ({
  type: "useAbility",
  playerId: P1,
  cardInstanceId: card,
  abilityId: abilityId as never,
  payment: [],
  ...(dealTo ? { costChoices: { dealtTo: [dealTo] } } : {}),
});
const dealt = (events: readonly GameEvent[]) =>
  events.flatMap((e) =>
    e.type === "cardMoved" && e.to.kind === "dealtEncounter" ? [[e.to.playerId, e.instanceId] as const] : [],
  );
/** The `legalActions` entry for this ability of P1's. */
function offered(state: GameState, card: InstanceId, abilityId: string) {
  const actions = legalActions(state, P1, deps);
  if (actions.kind !== "turn") throw new Error(`not P1's turn: ${actions.kind}`);
  return actions.legal.find(
    (entry) =>
      entry.action.kind === "useAbility" && entry.action.instanceId === card && entry.action.abilityId === abilityId,
  );
}

describe("`dealEncounterCardsTo`: a deal to a chosen player, paid as a cost", () => {
  it("solo: the pick is forced; the card exhausts, the payer is dealt the top card facedown, then the effect", () => {
    const t = table(1, SCOUT);
    const scout = t.ids[SCOUT.id]!;
    const [top] = deckOf(t.state);
    // One player: nothing to pick, so the ability is offered with no target to name.
    expect(offered(t.state, scout, SCOUT_ACTION.ref.id)?.targets ?? []).toEqual([]);
    const { session, events } = runCommands(t.state, deps, use(scout, SCOUT_ACTION.ref.id));
    const state = session.state;
    expect(dealt(events)).toEqual([[P1, top]]);
    expect(mustPlayer(state, P1).dealtEncounter).toEqual([top]);
    expect(mustInstance(state, top!).faceup).toBe(false);
    expect(mustInstance(state, scout).exhausted).toBe(true);
    expect(counter(state, scout, "recon")).toBe(1);
    expect(counter(state, identityOf(state, P1), "marked")).toBe(1);
    // Paid before the effects: the deal is logged before the ability resolves.
    const order = events.map((e) => (e.type === "cardMoved" && e.to.kind === "dealtEncounter" ? "deal" : e.type));
    expect(order.indexOf("deal")).toBeLessThan(order.indexOf("abilityResolved"));
    const replayed = replay(session.log, deps);
    expect(replayed.ok && replayed.state).toEqual(state);
  });

  it("two players: each player is a target of the action; choosing the other player deals them the card", () => {
    const t = table(2, SCOUT);
    const scout = t.ids[SCOUT.id]!;
    const [top] = deckOf(t.state);
    const entry = offered(t.state, scout, SCOUT_ACTION.ref.id);
    expect(entry?.targets).toEqual([identityOf(t.state, P1), identityOf(t.state, P2)]);
    // The client's own route for a pick listed as a target: the command built for the other player's identity.
    const built = tryPayment(t.state, P1, entry!.action, [], { target: identityOf(t.state, P2) }, deps);
    expect(built.ok && built.command).toMatchObject({ costChoices: { dealtTo: [identityOf(t.state, P2)] } });
    const { session, events } = runCommands(t.state, deps, use(scout, SCOUT_ACTION.ref.id, identityOf(t.state, P2)));
    expect(dealt(events)).toEqual([[P2, top]]);
    expect(mustPlayer(session.state, P1).dealtEncounter).toEqual([]);
    expect(mustPlayer(session.state, P2).dealtEncounter).toEqual([top]);
    expect(counter(session.state, scout, "recon")).toBe(1);
    expect(counter(session.state, identityOf(session.state, P2), "marked")).toBe(1);
  });

  it("two players: choosing yourself; a count of 2 deals both cards to the one player", () => {
    const t = table(2, SWEEP);
    const sweep = t.ids[SWEEP.id]!;
    const [first, second] = deckOf(t.state);
    const { session } = runCommands(t.state, deps, use(sweep, SWEEP_ACTION.ref.id, identityOf(t.state, P1)));
    expect(mustPlayer(session.state, P1).dealtEncounter).toEqual([first, second]);
    expect(mustPlayer(session.state, P2).dealtEncounter).toEqual([]);
  });

  it("two players: no pick, two picks, or a card that is not a player's identity is refused and nothing is paid", () => {
    const t = table(2, SCOUT);
    const scout = t.ids[SCOUT.id]!;
    const both = { dealtTo: [identityOf(t.state, P1), identityOf(t.state, P2)] };
    const refused = [
      applyCommand(t.state, use(scout, SCOUT_ACTION.ref.id), deps),
      applyCommand(t.state, { ...use(scout, SCOUT_ACTION.ref.id), costChoices: both } as Command, deps),
      applyCommand(t.state, use(scout, SCOUT_ACTION.ref.id, scout), deps),
    ];
    expect(refused.map((r) => (r.ok ? "ok" : r.error.code))).toEqual([
      "invalid_choice",
      "invalid_choice",
      "no_valid_target",
    ]);
    expect(mustInstance(t.state, scout).exhausted).toBe(false);
  });

  it("an eliminated player cannot be picked, and with one player left the pick is forced again", () => {
    const t = table(2, SCOUT);
    const scout = t.ids[SCOUT.id]!;
    const out = {
      ...t.state,
      players: t.state.players.map((p) => (p.playerId === P2 ? { ...p, eliminated: true } : p)),
    } as GameState;
    const gone = applyCommand(out, use(scout, SCOUT_ACTION.ref.id, identityOf(out, P2)), deps);
    expect(gone.ok ? "ok" : gone.error.code).toBe("no_valid_target");
    const forced = applyCommand(out, use(scout, SCOUT_ACTION.ref.id), deps);
    expect(forced.ok).toBe(true);
    if (forced.ok) expect(mustPlayer(forced.state, P1).dealtEncounter).toHaveLength(1);
  });

  it('not announced to "would be dealt" interrupts (every cost is paid at once); the card dealt is still answered', () => {
    const t = table(2, SCOUT, WATCHER, WITNESS);
    const scout = t.ids[SCOUT.id]!;
    const { session, events } = runCommands(t.state, deps, use(scout, SCOUT_ACTION.ref.id, identityOf(t.state, P2)));
    expect(events.some((e) => e.type === "triggerEvent" && e.event.kind === "encounterCardBeingDealt")).toBe(false);
    expect(counter(session.state, t.ids[WATCHER.id]!, "seen")).toBe(0);
    expect(counter(session.state, t.ids[WITNESS.id]!, "dealt")).toBe(1);
    expect(mustPlayer(session.state, P2).dealtEncounter).toHaveLength(1);
  });
});
