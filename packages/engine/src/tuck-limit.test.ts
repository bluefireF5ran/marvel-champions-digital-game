/**
 * docs/phase7-wave10-hero-packs.md §H3.12: `RuleSpec tuckLimit`, a maximum on the cards tucked under a card. Synthetic
 * cards shaped like Ionic Physiology (`wonder_man` 58002): "Permanent. Max 3 cards tucked here."
 *
 * Sources: the Wonder Man insert, clarification 1 (a card is tucked there only while fewer than three are); ruling
 * March 6, 2026 (4), step 3: "trigger Ionic Physiology to tuck Leading Blow (if under 3 cards)"; RRG 1.8 "'Then'"
 * (p. 44): "If the pre-'then' text of an effect does not fully resolve, the post-'then' text does not attempt to
 * resolve"; "Tuck" (p. 45).
 */

import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { applyCommand, replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { legalActions } from "./legal.js";
import { activeEncounterDeckId, mustInstance, mustPlayer } from "./query.js";
import { cardsInPlay } from "./select.js";
import type { EffectSpec, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { stubAlly, stubEvent, stubSupport, stubTreachery } from "./testing/fixtures.js";
import { giveCard } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, P1, playerCardIntoPlay, playFree } from "./testing/wave3.js";
import { tuckLimitOf, tuckRoom } from "./tuck-limit.js";

const self: TargetRef = { kind: "self" };
const n = (value: number) => ({ kind: "const", value }) as const;
const named = (name: string): TargetRef => ({ kind: "each", query: { name } });
const top = (count: number) => ({ kind: "encounter", zones: ["deck"], top: n(count) }) as const;
const tally = (name: string): EffectSpec => ({
  kind: "addCounters",
  target: named(name),
  counterType: "tally",
  amount: n(1),
});

const limit = (id: string, max: number) =>
  stubAbility(`${id}.constant`, {
    trigger: { kind: "constant", rules: [{ kind: "tuckLimit", card: { self: true }, max: n(max) }] },
    effects: [],
  });
/** "Max 3 cards tucked here." */
const SHELF_LIMIT = limit("shelf", 3);
/** "Action: Tuck the top card of the encounter deck here. Then, place 1 tally counter here." */
const SHELF_ACTION = stubAbility("shelf.action", {
  trigger: { kind: "action" },
  effects: [
    { kind: "tuckCards", cards: top(1), under: self },
    { kind: "then", effects: [tally("shelf")] },
  ],
});
const SHELF = stubSupport({ id: "shelf", cost: 0, abilities: [SHELF_LIMIT.ref, SHELF_ACTION.ref] });
/** A card with no maximum. */
const CRATE = stubSupport({ id: "crate", cost: 0 });
/** "Max 1 card tucked here. Forced Interrupt: When a player card effect would tuck a card, tuck it here instead." */
const NOOK_LIMIT = limit("nook", 1);
const NOOK_INTERRUPT = stubAbility("nook.interrupt", {
  trigger: {
    kind: "interrupt",
    forced: true,
    would: true,
    on: { on: "cardBeingTucked", eventIs: { by: "playerCard" } },
  },
  effects: [{ kind: "replaceTuckHost", to: self }],
});
const NOOK = stubSupport({ id: "nook", cost: 0, abilities: [NOOK_LIMIT.ref, NOOK_INTERRUPT.ref] });
/** "Forced Interrupt: When a player card effect would tuck a card, place 1 warned counter here." */
const WARDEN_INTERRUPT = stubAbility("warden.interrupt", {
  trigger: { kind: "interrupt", forced: true, on: { on: "cardBeingTucked", eventIs: { by: "playerCard" } } },
  effects: [{ kind: "addCounters", target: self, counterType: "warned", amount: n(1) }],
});
const WARDEN = stubSupport({ id: "warden", cost: 0, abilities: [WARDEN_INTERRUPT.ref] });
/** "Max 1 card tucked here. Forced Interrupt: When an ally leaves play, tuck it under here." */
const CELL_LIMIT = limit("cell", 1);
const CELL_INTERRUPT = stubAbility("cell.interrupt", {
  trigger: { kind: "interrupt", forced: true, on: { on: "cardLeavesPlay", targetIs: { categories: ["ally"] } } },
  effects: [{ kind: "replaceLeaveDestination", to: { tuckedUnder: self } }],
});
const CELL = stubSupport({ id: "cell", cost: 0, abilities: [CELL_LIMIT.ref, CELL_INTERRUPT.ref] });
const BUDDY = stubAlly({ id: "buddy", cost: 1, atk: 1, thw: 1, hp: 3 });
const PAL = stubAlly({ id: "pal", cost: 1, atk: 1, thw: 1, hp: 3 });
const FILLER = stubTreachery({ id: "filler", boostIcons: 0 });

const event = (id: string, effects: readonly EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
/** "Tuck the top N cards of the encounter deck under the shelf. Then, place 1 tally counter on the shelf." */
const stash = (count: number) =>
  event(`stash-${count}`, [
    { kind: "tuckCards", cards: top(count), under: named("shelf") },
    { kind: "then", effects: [tally("shelf")] },
  ]);
const STASH_1 = stash(1);
const STASH_2 = stash(2);
/** The same with a part that does not depend on the tuck: "… Place 1 other counter on the shelf." */
const STASH_AND = event("stash-and", [
  { kind: "tuckCards", cards: top(1), under: named("shelf") },
  { kind: "then", effects: [tally("shelf")] },
  { kind: "addCounters", target: named("shelf"), counterType: "other", amount: n(1) },
]);
/** "Tuck the top card of the encounter deck under the crate. Then, place 1 tally counter on the crate." */
const CRATE_1 = event("crate-1", [
  { kind: "tuckCards", cards: top(1), under: named("crate") },
  { kind: "then", effects: [tally("crate")] },
]);
/** "Tuck Buddy under the shelf." (a card in play) */
const JAIL = event("jail", [
  { kind: "tuckCards", cards: { kind: "ref", ref: named("buddy") }, under: named("shelf") },
  { kind: "addCounters", target: named("shelf"), counterType: "other", amount: n(1) },
]);
const discardAlly = (name: string) => event(`discard-${name}`, [{ kind: "discardFromPlay", target: named(name) }]);
const DISCARD_BUDDY = discardAlly("buddy");
const DISCARD_PAL = discardAlly("pal");
const EVENTS = [STASH_1, STASH_2, STASH_AND, CRATE_1, JAIL, DISCARD_BUDDY, DISCARD_PAL];
const SUPPORTS = [SHELF, CRATE, NOOK, WARDEN, CELL];

const quiet = [SHELF_LIMIT, SHELF_ACTION, ...EVENTS.map((e) => e.ability)];
/** Nothing hears a tuck or a leaving. */
const quietDeps: EngineDeps = depsOf(...quiet);
const wardenDeps: EngineDeps = depsOf(...quiet, WARDEN_INTERRUPT);
const nookDeps: EngineDeps = depsOf(...quiet, NOOK_LIMIT, NOOK_INTERRUPT);
const cellDeps: EngineDeps = depsOf(...quiet, CELL_LIMIT, CELL_INTERRUPT);

const CARD = { shelf: SHELF, crate: CRATE, nook: NOOK, warden: WARDEN, cell: CELL, buddy: BUDDY, pal: PAL };
type Name = keyof typeof CARD;
interface Table {
  readonly state: GameState;
  readonly id: Record<Name, InstanceId>;
}
/** A one-player game with `inPlay` under P1's control and `held` cards already tucked under the shelf. */
function table(deps: EngineDeps, inPlay: readonly Name[], held = 0): Table {
  let state = gameAtFirstTurn({
    cards: [...SUPPORTS, BUDDY, PAL, FILLER, ...EVENTS.map((e) => e.card)],
    deps,
    deck: [...SUPPORTS, BUDDY, PAL, ...EVENTS.map((e) => e.card)].map((card) => card.id),
    encounter: copiesOf(FILLER.id, 30),
  });
  const id = {} as Record<Name, InstanceId>;
  for (const name of inPlay) {
    const placed = playerCardIntoPlay(state, CARD[name].id);
    state = placed.state;
    id[name] = placed.id;
  }
  for (let i = 0; i < held; i++) state = playFree(state, deps, STASH_1.card.id).state;
  return { state, id };
}
const under = (state: GameState, host: InstanceId) => mustInstance(state, host).tucked;
const counters = (state: GameState, id: InstanceId, type: string) => mustInstance(state, id).counters[type] ?? 0;
const deckSize = (state: GameState) => state.encounterDecks[activeEncounterDeckId(state)]!.deck.length;
const refused = (events: readonly GameEvent[]) =>
  events.flatMap((e) => (e.type === "cardNotTucked" ? [{ card: e.instanceId, host: e.hostInstanceId }] : []));
const unresolved = (events: readonly GameEvent[]) =>
  events.flatMap((e) => (e.type === "preThenUnresolved" ? [e.cause] : []));
const play = (t: Table, deps: EngineDeps, card: (typeof EVENTS)[number]) => {
  const played = playFree(t.state, deps, card.card.id);
  const replayed = replay(played.session.log, deps);
  expect(replayed.ok && replayed.state).toEqual(played.session.state);
  return played;
};
const useShelf = (t: Table): Command => ({
  type: "useAbility",
  playerId: P1,
  cardInstanceId: t.id.shelf,
  abilityId: SHELF_ACTION.ref.id,
  payment: [],
});

describe("§H3.12 `RuleSpec tuckLimit`: a maximum on the cards tucked under a card", () => {
  it("reads the room left and the maximum; a card with no rule has neither", () => {
    const empty = table(quietDeps, ["shelf", "crate"]);
    expect(tuckRoom(empty.state, quietDeps, empty.id.shelf)).toBe(3);
    expect(tuckLimitOf(empty.state, quietDeps, empty.id.shelf)).toBe(3);
    expect(tuckRoom(empty.state, quietDeps, empty.id.crate)).toBe(Number.POSITIVE_INFINITY);
    expect(tuckLimitOf(empty.state, quietDeps, empty.id.crate)).toBeNull();

    const two = table(quietDeps, ["shelf"], 2);
    expect(under(two.state, two.id.shelf)).toHaveLength(2);
    expect(counters(two.state, two.id.shelf, "tally")).toBe(2);
    expect(tuckRoom(two.state, quietDeps, two.id.shelf)).toBe(1);
    expect(tuckLimitOf(two.state, quietDeps, two.id.shelf)).toBe(3);
  });

  it("at 2 of 3, a tuck of 2 tucks the first; the second stays in the deck and is logged; the Then resolves", () => {
    const t = table(quietDeps, ["shelf"], 2);
    const before = deckSize(t.state);
    const second = t.state.encounterDecks[activeEncounterDeckId(t.state)]!.deck[1]!;
    const { state, events } = play(t, quietDeps, STASH_2);
    expect(under(state, t.id.shelf)).toHaveLength(3);
    expect(deckSize(state)).toBe(before - 1);
    expect(refused(events)).toEqual([{ card: second, host: t.id.shelf }]);
    // One card was tucked, so the text before the "Then" resolved.
    expect(unresolved(events)).toEqual([]);
    expect(counters(state, t.id.shelf, "tally")).toBe(3);
  });

  it("at 3 of 3 nothing is tucked, the Then is skipped and the rest of the ability resolves", () => {
    const t = table(quietDeps, ["shelf"], 3);
    const before = deckSize(t.state);
    const { state, events } = play(t, quietDeps, STASH_AND);
    expect(under(state, t.id.shelf)).toHaveLength(3);
    expect(deckSize(state)).toBe(before);
    expect(refused(events)).toHaveLength(1);
    expect(unresolved(events)).toEqual(["tuckRefused"]);
    expect(events.filter((e) => e.type === "thenSkipped")).toHaveLength(1);
    expect(counters(state, t.id.shelf, "tally")).toBe(3);
    expect(counters(state, t.id.shelf, "other")).toBe(1);
  });

  it("an ability made only of a tuck under a full card cannot be initiated: an event, and an action in play", () => {
    const t = table(quietDeps, ["shelf"], 3);
    const given = giveCard(t.state, P1, STASH_1.card.id);
    const played = applyCommand(
      given.state,
      { type: "playCard", playerId: P1, cardInstanceId: given.id, payment: [], attachToInstanceId: null },
      quietDeps,
    );
    expect(played.ok ? null : played.error.code).toBe("no_valid_target");

    const used = applyCommand(t.state, useShelf(t), quietDeps);
    expect(used.ok ? null : used.error).toMatchObject({
      code: "no_valid_target",
      message: "no more cards can be tucked under that card: it holds its maximum",
    });
    const actions = legalActions(t.state, P1, quietDeps);
    if (actions.kind !== "turn") throw new Error(`expected the player's turn, got ${actions.kind}`);
    const isShelf = (a: { action: { kind: string } }) =>
      a.action.kind === "useAbility" && "instanceId" in a.action && a.action.instanceId === t.id.shelf;
    expect(actions.legal.some(isShelf)).toBe(false);
    expect(actions.illegal.find(isShelf)?.reason).toBe("no_valid_target");

    // With room, the same action is legal and tucks.
    const roomy = table(quietDeps, ["shelf"], 2);
    const ok = applyCommand(roomy.state, useShelf(roomy), quietDeps);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(under(ok.state, roomy.id.shelf)).toHaveLength(3);
  });

  it("a refused tuck is not imminent: 'when a card would be tucked' answers only the cards that fit", () => {
    const t = table(wardenDeps, ["shelf", "warden"], 2);
    expect(counters(t.state, t.id.warden, "warned")).toBe(2);
    const { state, events } = play(t, wardenDeps, STASH_2);
    expect(under(state, t.id.shelf)).toHaveLength(3);
    expect(counters(state, t.id.warden, "warned")).toBe(3);
    expect(refused(events)).toHaveLength(1);

    const full = play({ ...t, state }, wardenDeps, STASH_AND);
    expect(counters(full.state, t.id.warden, "warned")).toBe(3);
    expect(unresolved(full.events)).toEqual(["tuckRefused"]);
  });

  it("a card in play named by a tuck under a full card stays in play", () => {
    const t = table(quietDeps, ["shelf", "buddy"], 3);
    const { state, events } = play(t, quietDeps, JAIL);
    expect(cardsInPlay(state)).toContain(t.id.buddy);
    expect(under(state, t.id.shelf)).not.toContain(t.id.buddy);
    expect(refused(events)).toEqual([{ card: t.id.buddy, host: t.id.shelf }]);
    expect(events.some((e) => e.type === "cardMoved" && e.instanceId === t.id.buddy)).toBe(false);
  });

  it("a tuck sent to another host is bound by that host's maximum", () => {
    const t = table(nookDeps, ["crate", "nook"]);
    const first = play(t, nookDeps, CRATE_1);
    expect(under(first.state, t.id.nook)).toHaveLength(1);
    expect(under(first.state, t.id.crate)).toHaveLength(0);
    expect(refused(first.events)).toEqual([]);

    const before = deckSize(first.state);
    const second = play({ ...t, state: first.state }, nookDeps, CRATE_1);
    // The tuck under the crate was replaced, and the nook is full: the card is tucked nowhere.
    expect(under(second.state, t.id.nook)).toHaveLength(1);
    expect(under(second.state, t.id.crate)).toHaveLength(0);
    expect(deckSize(second.state)).toBe(before);
    expect(refused(second.events)).toEqual([{ card: expect.any(String), host: t.id.nook }]);
  });

  it("a leaving card sent under a full card makes the move the tuck replaced", () => {
    const t = table(cellDeps, ["cell", "buddy", "pal"]);
    const first = play(t, cellDeps, DISCARD_BUDDY);
    expect(under(first.state, t.id.cell)).toEqual([t.id.buddy]);

    const second = play({ ...t, state: first.state }, cellDeps, DISCARD_PAL);
    expect(under(second.state, t.id.cell)).toEqual([t.id.buddy]);
    expect(mustPlayer(second.state, P1).discard).toContain(t.id.pal);
    expect(refused(second.events)).toEqual([{ card: t.id.pal, host: t.id.cell }]);
  });
});
