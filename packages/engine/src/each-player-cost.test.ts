/**
 * `AbilityCost.eachPlayer` (docs/phase7-wave9.md §3.58): "Action: Each player exhausts their identity and takes 1
 * damage → [effect]." A cost every player still in the game pays in kind, with synthetic cards.
 *
 * Sources: RRG 1.8 "Cost" (p. 13): "If multiple costs for a single card or ability require payment, those costs must
 * be paid simultaneously", and a cost that cannot be paid in full cannot be paid; (p. 14): "If taking damage is a cost,
 * that cost is not considered paid unless all of that damage was taken. (If any of the damage is prevented, then the
 * cost has not been paid.)"; FAQ "Focused Rage (#27)" (p. 57): "The tough status card prevents She-Hulk from 'tak[ing]
 * 1 damage,' so the ability's cost cannot be paid."
 */

import { describe, expect, it } from "vitest";
import type { AbilityCost, EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { applyCommand, replay, startSession } from "./engine.js";
import { type InstanceId, type PlayerId, playerId } from "./ids.js";
import { legalActions } from "./legal.js";
import { mustInstance, mustPlayer } from "./query.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubSupport } from "./testing/fixtures.js";
import { gameAtFirstTurn, P1, P2, playerCardIntoPlay } from "./testing/wave3.js";

const P3: PlayerId = playerId("p3");
const n = (value: number) => ({ kind: "const", value }) as const;

/** "Action: Each player exhausts their identity and takes 1 damage → place 1 done counter here." */
const CROWN_ACTION = stubAbility("crown.action", {
  trigger: { kind: "action" },
  cost: { eachPlayer: { exhaustIdentity: true, damageSelf: 1 } } satisfies AbilityCost,
  effects: [{ kind: "addCounters", target: { kind: "self" }, counterType: "done", amount: n(1) }],
});
const CROWN = stubSupport({ id: "crown", cost: 0, abilities: [CROWN_ACTION.ref] });
/** "Action: Each player takes 2 damage → place 1 done counter here." */
const TOLL_ACTION = stubAbility("toll.action", {
  trigger: { kind: "action" },
  cost: { eachPlayer: { damageSelf: 2 } } satisfies AbilityCost,
  effects: [{ kind: "addCounters", target: { kind: "self" }, counterType: "done", amount: n(1) }],
});
const TOLL = stubSupport({ id: "toll", cost: 0, abilities: [TOLL_ACTION.ref] });
/** "Forced Interrupt: When your identity would take damage, give it a tough status card." */
const ARMOR_INTERRUPT = stubAbility("armor.interrupt", {
  trigger: {
    kind: "interrupt",
    forced: true,
    on: { on: "dealDamage", targetIs: { categories: ["identity"], controller: "you" } },
  },
  effects: [{ kind: "giveStatus", target: { kind: "eventTarget" }, status: "tough" }],
});
const ARMOR = stubSupport({ id: "armor", cost: 0, abilities: [ARMOR_INTERRUPT.ref] });

const deps: EngineDeps = depsOf(CROWN_ACTION, TOLL_ACTION, ARMOR_INTERRUPT);
const CARDS = [CROWN, TOLL, ARMOR];

function table(players: 1 | 2 | 3, card = CROWN) {
  const start = gameAtFirstTurn({ players, cards: CARDS, deps, deck: CARDS.map((c) => c.id) });
  const put = playerCardIntoPlay(start, card.id);
  return { state: put.state, card: put.id };
}
const identityOf = (state: GameState, player: PlayerId): InstanceId => mustPlayer(state, player).identity.instanceId;
const identity = (state: GameState, player: PlayerId) => mustInstance(state, identityOf(state, player));
const patchIdentity = (
  state: GameState,
  player: PlayerId,
  patch: (instance: GameState["instances"][string]) => GameState["instances"][string],
): GameState => {
  const id = identityOf(state, player);
  return { ...state, instances: { ...state.instances, [id]: patch(mustInstance(state, id)) } };
};
const exhausted = (state: GameState, player: PlayerId) =>
  patchIdentity(state, player, (instance) => ({ ...instance, exhausted: true }));
const withTough = (state: GameState, player: PlayerId) =>
  patchIdentity(state, player, (instance) => ({ ...instance, statuses: { ...instance.statuses, tough: 1 } }));
const use = (card: InstanceId, abilityId: string): Command => ({
  type: "useAbility",
  playerId: P1,
  cardInstanceId: card,
  abilityId: abilityId as never,
  payment: [],
});
function offered(state: GameState, card: InstanceId): boolean {
  const actions = legalActions(state, P1, deps);
  if (actions.kind !== "turn") throw new Error(`not P1's turn: ${actions.kind}`);
  return actions.legal.some((entry) => entry.action.kind === "useAbility" && entry.action.instanceId === card);
}
function run(state: GameState, command: Command) {
  const { session, events } = driveSession(startSession(state), deps, [command]);
  const replayed = replay(session.log, deps);
  expect(replayed.ok && replayed.state).toEqual(session.state);
  return { state: session.state, events };
}
const done = (state: GameState, card: InstanceId) => mustInstance(state, card).counters.done ?? 0;

describe("`AbilityCost.eachPlayer`: a cost every player pays", () => {
  it("three players, all ready: three identities exhausted, 1 damage each at once, then the effect", () => {
    const t = table(3);
    expect(offered(t.state, t.card)).toBe(true);
    const { state, events } = run(t.state, use(t.card, CROWN_ACTION.ref.id));
    for (const player of [P1, P2, P3]) {
      expect(identity(state, player).exhausted).toBe(true);
      expect(identity(state, player).damage).toBe(1);
    }
    expect(done(state, t.card)).toBe(1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "costDamageSettled", amount: 3, taken: 3, paid: true }),
    );
    // Paid before the effects: all three identities are damaged before the ability resolves, in player order.
    const damaged = events.flatMap((e, i) => (e.type === "damageDealt" ? [[e.targetInstanceId, i] as const] : []));
    expect(damaged.map(([id]) => id)).toEqual([P1, P2, P3].map((player) => identityOf(state, player)));
    const resolvedAt = events.findIndex((e) => e.type === "abilityResolved");
    expect(damaged.every(([, i]) => i < resolvedAt)).toBe(true);
  });

  it("one player's identity is exhausted: not offered, and the refusal names that player's identity", () => {
    const t = table(3);
    const state = exhausted(t.state, P2);
    expect(offered(state, t.card)).toBe(false);
    const refused = applyCommand(state, use(t.card, CROWN_ACTION.ref.id), deps);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("unreachable");
    expect(refused.error.code).toBe("already_exhausted");
    expect(refused.error.message).toContain("p2");
    // Nothing was paid by anyone.
    expect(identity(state, P1).exhausted).toBe(false);
    expect(identity(state, P3).damage).toBe(0);
  });

  it("one player holds a tough status card: the whole cost cannot be paid, and the card stays (RRG p. 14, FAQ #27)", () => {
    const t = table(3);
    const state = withTough(t.state, P3);
    expect(offered(state, t.card)).toBe(false);
    const refused = applyCommand(state, use(t.card, CROWN_ACTION.ref.id), deps);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("unreachable");
    expect(refused.error.code).toBe("insufficient_resources");
    expect(refused.error.message).toContain("p3");
    expect(identity(state, P3).statuses.tough).toBe(1);
  });

  it("damage an interrupt prevents as it is paid: the others still took theirs, the cost is unpaid, no effect", () => {
    const t = table(2, TOLL);
    // Player 2's own "when your identity would take damage, give it a tough status card".
    const armored = playerCardIntoPlay(t.state, ARMOR.id, P2).state;
    expect(offered(armored, t.card)).toBe(true);
    const { state, events } = run(armored, use(t.card, TOLL_ACTION.ref.id));
    expect(identity(state, P1).damage).toBe(2);
    expect(identity(state, P2).damage).toBe(0);
    expect(identity(state, P2).statuses.tough).toBe(0);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "costDamageSettled", amount: 4, taken: 2, paid: false }),
    );
    expect(done(state, t.card)).toBe(0);
    // No exhaust in this cost: the identities stay ready.
    expect(identity(state, P1).exhausted).toBe(false);
  });

  it("solo: the payer alone pays it; an eliminated player is not asked", () => {
    const solo = table(1);
    const after = run(solo.state, use(solo.card, CROWN_ACTION.ref.id)).state;
    expect(identity(after, P1).exhausted).toBe(true);
    expect(identity(after, P1).damage).toBe(1);
    expect(done(after, solo.card)).toBe(1);

    const t = table(2);
    // Player 2 is out of the game with an exhausted identity: neither checked nor paid.
    const gone: GameState = {
      ...exhausted(t.state, P2),
      players: t.state.players.map((p) => (p.playerId === P2 ? { ...p, eliminated: true } : p)),
    };
    expect(offered(gone, t.card)).toBe(true);
    const state = run(gone, use(t.card, CROWN_ACTION.ref.id)).state;
    expect(identity(state, P1).damage).toBe(1);
    expect(identity(state, P2).damage).toBe(0);
    expect(done(state, t.card)).toBe(1);
  });

  it("with the payer's own `exhaustIdentity` beside it: one card cannot pay two parts of a cost", () => {
    const BOTH = stubAbility("both.action", {
      trigger: { kind: "action" },
      cost: { exhaustIdentity: true, eachPlayer: { exhaustIdentity: true } },
      effects: [],
    });
    const card = stubSupport({ id: "both", cost: 0, abilities: [BOTH.ref] });
    const bothDeps = depsOf(BOTH);
    const start = gameAtFirstTurn({ players: 2, cards: [card], deps: bothDeps, deck: [card.id] });
    const put = playerCardIntoPlay(start, card.id);
    expect(applyCommand(put.state, use(put.id, BOTH.ref.id), bothDeps).ok).toBe(false);
  });
});
