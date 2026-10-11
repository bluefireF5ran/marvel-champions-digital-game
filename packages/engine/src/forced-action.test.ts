/**
 * docs/phase7-wave9.md §3.53: `AbilityTriggerSpec action.forced`, `outstandingForcedActions`, `endTurn` refused while
 * the ending player has one, and the phase end putting late ones to their players.
 *
 * RRG 1.8 "Action" (p. 6) and "Forced Action" (p. 20): "Each 'Forced Action' ability must be resolved before the
 * player phase can end. A forced action ability can be triggered at any time a non-forced action ability could be
 * triggered. If such an ability has a cost that cannot be paid or requires one or more valid targets and has none, the
 * phase can end without that ability being resolved." Synthetic cards shaped like the Temptations of Trickster
 * Takeover ("Forced Action: Exhaust this card → place 1 charm counter … Alter-Ego Action: Exhaust this card → discard
 * this card.").
 */

import type { AbilityId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { Command } from "./commands.js";
import { applyCommand } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { legalActions, outstandingForcedActions } from "./legal.js";
import { locateCard, mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommandsPicking } from "./testing/drive.js";
import { stubAttachment, stubEvent, stubMinion, stubTreachery } from "./testing/fixtures.js";
import { defaultPick } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, minionEngagedWith, P1, P2, playerCardIntoPlay } from "./testing/wave3.js";

const self = { kind: "self" } as const;
const you = { kind: "controller" } as const;
const n = (value: number) => ({ kind: "const", value }) as const;
const EXHAUST = { exhaustSelf: true } as const;

/** "Forced Action: Exhaust this card → place 1 charm counter on your identity. Draw 1 card." */
const LURE_FORCED = stubAbility("lure.forced", {
  trigger: { kind: "action", forced: true },
  cost: EXHAUST,
  effects: [
    { kind: "addCounters", target: { kind: "host" }, counterType: "charm", amount: n(1) },
    { kind: "draw", player: you, amount: n(1) },
  ],
});
/** "Alter-Ego Action: Exhaust this card → discard this card." */
const LURE_OUT = stubAbility("lure.out", {
  trigger: { kind: "action", form: "alterEgo" },
  cost: EXHAUST,
  effects: [{ kind: "discardFromPlay", target: self }],
});
const LURE = stubAttachment({
  id: "lure",
  attachesTo: { kind: "yourIdentity" },
  abilities: [LURE_FORCED.ref, LURE_OUT.ref],
});
/** "Forced Action: Exhaust this card → place 1 charm counter on your identity. Ready your identity." (it is ready) */
const IDLE_FORCED = stubAbility("idle.forced", {
  trigger: { kind: "action", forced: true },
  cost: EXHAUST,
  effects: [
    { kind: "addCounters", target: { kind: "host" }, counterType: "charm", amount: n(1) },
    { kind: "ready", target: { kind: "host" } },
  ],
});
const IDLE = stubAttachment({ id: "idle", attachesTo: { kind: "yourIdentity" }, abilities: [IDLE_FORCED.ref] });
/** "Forced Action: Exhaust this card → deal 1 damage to a minion engaged with you." (needs a target) */
const SNARE_FORCED = stubAbility("snare.forced", {
  trigger: { kind: "action", forced: true },
  cost: EXHAUST,
  effects: [
    { kind: "chooseTarget", slot: "minion", query: { categories: ["minion"], engagedWith: "you" }, chooser: you },
    { kind: "dealDamage", target: { kind: "slot", slot: "minion" }, amount: n(1) },
  ],
});
const SNARE = stubAttachment({ id: "snare", attachesTo: { kind: "yourIdentity" }, abilities: [SNARE_FORCED.ref] });
/** "Forced Action: Spend 9 resources → draw 1 card." (a cost no hand here pays) */
const TOLL_FORCED = stubAbility("toll.forced", {
  trigger: { kind: "action", forced: true },
  cost: { resources: 9 },
  effects: [{ kind: "draw", player: you, amount: n(1) }],
});
const TOLL = stubAttachment({ id: "toll", attachesTo: { kind: "yourIdentity" }, abilities: [TOLL_FORCED.ref] });

const event = (id: string, effects: readonly EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
/** "Action: Ready each Lure." */
const STIR = event("stir", [{ kind: "ready", target: { kind: "each", query: { name: "lure" } } }]);
const DUMMY = stubMinion({ id: "dummy", atk: 0, sch: 0, hp: 9, boostIcons: 0 });
const FILLER = stubTreachery({ id: "filler", boostIcons: 0 });
const deps = depsOf(LURE_FORCED, LURE_OUT, IDLE_FORCED, SNARE_FORCED, TOLL_FORCED, STIR.ability);

function table(players: 1 | 2 = 1, form: "hero" | "alterEgo" = "hero"): GameState {
  const start = gameAtFirstTurn({
    cards: [LURE, IDLE, SNARE, TOLL, DUMMY, FILLER, STIR.card],
    deps,
    players,
    deck: [STIR.card.id],
    encounter: [LURE.id, LURE.id, IDLE.id, SNARE.id, TOLL.id, DUMMY.id, ...copiesOf(FILLER.id, 20)],
  });
  return { ...start, players: start.players.map((p) => ({ ...p, identity: { ...p.identity, form } })) };
}

/** Surgery: the first copy of `card` in the encounter deck goes onto `player`'s identity. */
function attached(state: GameState, card: string, player: PlayerId = P1): { state: GameState; id: InstanceId } {
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

const identityOf = (state: GameState, player: PlayerId = P1) => mustPlayer(state, player).identity.instanceId;
const charm = (state: GameState, player: PlayerId = P1) =>
  mustInstance(state, identityOf(state, player)).counters.charm ?? 0;
const endTurn = (playerId: PlayerId = P1): Command => ({ type: "endTurn", playerId });
const use = (cardInstanceId: InstanceId, ability: { ref: { id: AbilityId } }, playerId: PlayerId = P1): Command => ({
  type: "useAbility",
  playerId,
  cardInstanceId,
  abilityId: ability.ref.id,
  payment: [],
});
const run = (state: GameState, ...commands: Command[]) => runCommandsPicking(state, deps, defaultPick, ...commands);
const ok = (state: GameState, command: Command): { state: GameState; events: readonly GameEvent[] } => {
  const result = applyCommand(state, command, deps);
  if (!result.ok) throw new Error(`${command.type} rejected: ${result.error.code}: ${result.error.message}`);
  return result;
};
const outstanding = (state: GameState, player: PlayerId = P1) =>
  outstandingForcedActions(state, player, deps).map((action) => action.instanceId);
const typesOf = (events: readonly GameEvent[]) => events.map((e) => e.type);

describe("§3.53 Forced Action: an action a player must resolve before the player phase can end", () => {
  it("endTurn is refused while the ending player has one, naming the card; resolving it lets the turn end", () => {
    const t = attached(table(), LURE.id);
    const hero: GameState = {
      ...t.state,
      instances: {
        ...t.state.instances,
        [identityOf(t.state)]: { ...mustInstance(t.state, identityOf(t.state)), counters: { charm: 2 } },
      },
    };
    expect(outstanding(hero)).toEqual([t.id]);
    const refused = applyCommand(hero, endTurn(), deps);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe("forced_action_outstanding");
    expect(refused.error.forcedActions).toEqual([{ instanceId: t.id, abilityId: LURE_FORCED.ref.id }]);
    // `legalActions` says so too: the forced action is offered like any action, and End Turn is illegal.
    const legal = legalActions(hero, P1, deps);
    if (legal.kind !== "turn") throw new Error("not a turn");
    expect(legal.legal.some((a) => a.action.kind === "useAbility" && a.action.instanceId === t.id)).toBe(true);
    expect(legal.illegal.find((a) => a.action.kind === "endTurn")?.reason).toBe("forced_action_outstanding");

    const hand = mustPlayer(hero, P1).hand.length;
    const used = ok(hero, use(t.id, LURE_FORCED));
    expect(charm(used.state)).toBe(3);
    expect(mustPlayer(used.state, P1).hand.length).toBe(hand + 1);
    expect(mustInstance(used.state, t.id).exhausted).toBe(true);
    // Logged as any ability, marked forced.
    expect(used.events.find((e) => e.type === "abilityResolved")).toMatchObject({ instanceId: t.id, forced: true });
    // Exhausted, its cost cannot be paid: nothing is outstanding and the turn ends.
    expect(outstanding(used.state)).toEqual([]);
    const ended = run(used.state, endTurn());
    expect(typesOf(ended.events)).toContain("turnEnded");
    expect(typesOf(ended.events)).not.toContain("forcedActionsRequired");
  });

  it("the Alter-Ego Action on the same card discards it: the forced action is gone and the turn ends", () => {
    const t = attached(table(1, "alterEgo"), LURE.id);
    expect(outstanding(t.state)).toEqual([t.id]);
    const out = ok(t.state, use(t.id, LURE_OUT));
    expect(locateCard(out.state, t.id)?.kind).toBe("encounterDiscard");
    expect(outstanding(out.state)).toEqual([]);
    expect(applyCommand(out.state, endTurn(), deps).ok).toBe(true);
    expect(charm(out.state)).toBe(0);
  });

  it("an effect that would change nothing is no out: it is still outstanding, and still places its counter", () => {
    const t = attached(table(), IDLE.id);
    expect(mustInstance(t.state, identityOf(t.state)).exhausted).toBe(false);
    expect(outstanding(t.state)).toEqual([t.id]);
    expect(applyCommand(t.state, endTurn(), deps).ok).toBe(false);
    const used = ok(t.state, use(t.id, IDLE_FORCED));
    expect(charm(used.state)).toBe(1);
    expect(applyCommand(used.state, endTurn(), deps).ok).toBe(true);
  });

  it("a forced action with no valid target, or with a cost that cannot be paid, is not outstanding", () => {
    const snare = attached(table(), SNARE.id);
    expect(outstanding(snare.state)).toEqual([]);
    expect(applyCommand(snare.state, endTurn(), deps).ok).toBe(true);
    // With a minion engaged it has its target and is owed.
    const engaged = minionEngagedWith(snare.state, DUMMY.id);
    expect(outstanding(engaged.state)).toEqual([snare.id]);
    expect(applyCommand(engaged.state, endTurn(), deps).ok).toBe(false);

    const toll = attached(table(), TOLL.id);
    expect(outstanding(toll.state)).toEqual([]);
    expect(applyCommand(toll.state, endTurn(), deps).ok).toBe(true);
  });

  it("only the player whose identity it is attached to owes it, on their own turn's end", () => {
    const t = attached(table(2), LURE.id, P2);
    expect(outstanding(t.state, P1)).toEqual([]);
    expect(outstanding(t.state, P2)).toEqual([t.id]);
    // P1's turn ends; P2's does not until it is resolved.
    const next = ok(t.state, endTurn(P1));
    expect(next.state.step).toMatchObject({ kind: "turn", activePlayerId: P2 });
    expect(applyCommand(next.state, endTurn(P2), deps).ok).toBe(false);
    // A forced action can be triggered whenever an action could: P2 may resolve it during P1's turn.
    const early = ok(t.state, use(t.id, LURE_FORCED, P2));
    expect(charm(early.state, P2)).toBe(1);
    const after = ok(early.state, endTurn(P1));
    expect(applyCommand(after.state, endTurn(P2), deps).ok).toBe(true);
  });

  it("readied after its player's turn: the last player's endTurn opens that player's prompt, and the phase ends after it", () => {
    const t = attached(table(2), LURE.id, P1);
    const used = ok(t.state, use(t.id, LURE_FORCED));
    const p2Turn = ok(used.state, endTurn(P1)).state;
    expect(p2Turn.step).toMatchObject({ kind: "turn", activePlayerId: P2 });
    // P2 readies P1's card during P2's turn.
    const stir = playerCardIntoPlay(p2Turn, STIR.card.id, P2);
    const inHand: GameState = {
      ...stir.state,
      players: stir.state.players.map((p) =>
        p.playerId === P2
          ? { ...p, playArea: p.playArea.filter((id) => id !== stir.id), hand: [...p.hand, stir.id] }
          : p,
      ),
    };
    const readied = ok(inHand, {
      type: "playCard",
      playerId: P2,
      cardInstanceId: stir.id,
      payment: [],
      attachToInstanceId: null,
    }).state;
    expect(mustInstance(readied, t.id).exhausted).toBe(false);
    expect(outstanding(readied, P1)).toEqual([t.id]);
    // P2 has none of their own, so P2's endTurn is accepted: the turn ends and P1 is asked.
    const asked = ok(readied, endTurn(P2));
    expect(typesOf(asked.events)).toEqual(expect.arrayContaining(["turnEnded", "forcedActionsRequired"]));
    expect(asked.events.find((e) => e.type === "forcedActionsRequired")).toEqual({
      type: "forcedActionsRequired",
      actions: [{ playerId: P1, instanceId: t.id, abilityId: LURE_FORCED.ref.id }],
    });
    expect(typesOf(asked.events)).not.toContain("triggerEvent");
    const choice = asked.state.pendingChoice!;
    expect(choice.playerId).toBe(P1);
    expect(choice.prompt).toEqual({ kind: "chooseOption", forcedAction: true });
    expect(choice.options.map((o) => o.ref)).toEqual([
      { kind: "ability", instanceId: t.id, abilityId: LURE_FORCED.ref.id },
    ]);
    expect([choice.minSelections, choice.maxSelections]).toEqual([1, 1]);
    expect(asked.state.step).toMatchObject({ phase: "player", kind: "turn", ended: true });
    // Nothing else is accepted while it waits.
    expect(legalActions(asked.state, P1, deps).kind).toBe("choice");
    const answered = ok(asked.state, {
      type: "resolveChoice",
      playerId: P1,
      choiceId: choice.choiceId,
      selectedOptionIds: [choice.options[0]!.optionId],
    });
    expect(charm(answered.state, P1)).toBe(2);
    expect(answered.events.find((e) => e.type === "abilityResolved")).toMatchObject({ instanceId: t.id, forced: true });
    // The phase goes on to its end-of-phase steps: the first of them asks for the discard down to hand size.
    expect(answered.state.step).toMatchObject({ phase: "player", kind: "endPhaseDiscard" });
    expect(typesOf(answered.events).filter((type) => type === "turnEnded")).toEqual([]);
  });

  it("a game with no forced action ends its turns as before, and the log replays", () => {
    const state = table(2);
    const a = run(state, endTurn(P1), endTurn(P2));
    const b = run(state, endTurn(P1), endTurn(P2));
    expect(a.state).toEqual(b.state);
    expect(typesOf(a.events)).not.toContain("forcedActionsRequired");
    expect(a.state.round).toBe(2);
  });
});
