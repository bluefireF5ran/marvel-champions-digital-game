/**
 * Slot `paid.inPlayCards` (`PAID_IN_PLAY_CARDS_SLOT`): the cards in play whose "Resource" ability paid for a play, kept
 * apart from `paid.cards` so the `paid.cards.<cardType>` counts still read only the cards spent from a hand. Owner
 * decision 2026-11-15 (#525 item 11), replacing wave 9 §3.46 (b) on this point; ruling Aug 22, 2025 (Q2): "you can use
 * a resource ability to pay for Spectrum and then tuck that card under her". RRG 1.8 "Tuck" (p. 45): tucked cards are
 * not in play. The `chooseCards` prompt carries its effect's `note` (Spectrum's out-of-play warning).
 */

import { describe, expect, it } from "vitest";
import type { AbilityDefinition } from "./abilities.js";
import type { Command, Payment } from "./commands.js";
import { replay, startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { cardsInPlay } from "./select.js";
import { locateCard, mustInstance, mustPlayer } from "./query.js";
import { PAID_CARDS_SLOT, PAID_IN_PLAY_CARDS_SLOT } from "./stack.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubAlly, stubResource, stubSupport } from "./testing/fixtures.js";
import { defaultPick, giveCards } from "./testing/scenario.js";
import { gameAtFirstTurn, P1, playerCardIntoPlay } from "./testing/wave3.js";

const def = (d: Omit<AbilityDefinition, "cost"> & { cost?: AbilityDefinition["cost"] }): AbilityDefinition =>
  d as AbilityDefinition;
const NOTE_TEXT = "A tucked card is out of play.";
const you = { kind: "controller" } as const;

/** Spectrum's shape, both kinds of payer: "Response: After you play this ally, tuck 1 card used to pay for her under her." */
const TUCK_RESPONSE = stubAbility(
  "tuck.response",
  def({
    trigger: { kind: "response", forced: false, on: { on: "cardPlayed", selfIs: "target", playerIs: "controller" } },
    effects: [
      {
        kind: "chooseCards",
        slot: "tucked",
        from: {
          kind: "anyOf",
          of: [
            { kind: "zone", zone: "discard", player: { kind: "each" }, filter: { inSlot: PAID_CARDS_SLOT } },
            { kind: "ref", ref: { kind: "slot", slot: PAID_IN_PLAY_CARDS_SLOT } },
          ],
        },
        chooser: you,
        min: 1,
        max: 1,
        note: NOTE_TEXT,
      },
      { kind: "tuckCards", cards: { kind: "ref", ref: { kind: "slot", slot: "tucked" } }, under: { kind: "self" } },
    ],
  }),
);
/** "Resource: Exhaust this card → generate a [wild] resource." */
const GEAR_RESOURCE = stubAbility(
  "gear.resource",
  def({ trigger: { kind: "resource" }, cost: { exhaustSelf: true }, generates: 1, effects: [] }),
);
/** "Forced Interrupt: When you play a card, …": opens the play's `cardBeingPlayed` window. */
const BEING_INTERRUPT = stubAbility(
  "being.interrupt",
  def({
    trigger: { kind: "interrupt", forced: true, on: { on: "cardBeingPlayed", playerIs: "controller" } },
    effects: [],
  }),
);
const RECRUIT = stubAlly({ id: "recruit", cost: 2, atk: 1, thw: 1, hp: 3, abilities: [TUCK_RESPONSE.ref] });
/** Recruit at a cost of 0: whatever pays for it is overpaid. */
const FREE_RECRUIT = stubAlly({ id: "free-recruit", cost: 0, atk: 1, thw: 1, hp: 3, abilities: [TUCK_RESPONSE.ref] });
const GEAR = stubSupport({ id: "gear", cost: 0, abilities: [GEAR_RESOURCE.ref] });
/** Gear with the permanent keyword (RRG 1.8 "Permanent", p. 32). */
const FIXED_GEAR = stubSupport({
  id: "fixed-gear",
  cost: 0,
  keywords: [{ name: "permanent" }],
  abilities: [GEAR_RESOURCE.ref],
});
/** "This card cannot leave play." (`RuleSpec cannotLeavePlay`) */
const ROOTED_RULE = stubAbility(
  "rooted.constant",
  def({ trigger: { kind: "constant", rules: [{ kind: "cannotLeavePlay", target: { self: true } }] }, effects: [] }),
);
/** Gear that cannot leave play. */
const ROOTED_GEAR = stubSupport({ id: "rooted-gear", cost: 0, abilities: [GEAR_RESOURCE.ref, ROOTED_RULE.ref] });
/** A support whose interrupt listens for `cardBeingPlayed`. */
const WATCHER = stubSupport({ id: "watcher", cost: 0, abilities: [BEING_INTERRUPT.ref] });
/** A resource card printing 1 mental resource. */
const NOTE = stubResource({ id: "note", icons: 0, produces: { mental: 1 } });

const CARDS = [RECRUIT, FREE_RECRUIT, GEAR, NOTE];
const deps = depsOf(TUCK_RESPONSE, GEAR_RESOURCE);

const play = (card: InstanceId, payment: readonly Payment[]): Command => ({
  type: "playCard",
  playerId: P1,
  cardInstanceId: card,
  payment,
  attachToInstanceId: null,
});

/** Gear in play, Recruit and a mental card in hand. */
function table(d = deps, extra: readonly (typeof GEAR)[] = []) {
  const base = gameAtFirstTurn({
    cards: [...CARDS, ...extra],
    deps: d,
    deck: [...CARDS, ...extra].flatMap((c) => [c.id, c.id, c.id]),
  });
  const gear = playerCardIntoPlay(base, GEAR.id);
  const given = giveCards(gear.state, P1, RECRUIT.id, NOTE.id);
  const [recruit, note] = given.ids as [InstanceId, InstanceId];
  const payment: Payment[] = [
    { ability: { instanceId: gear.id, abilityId: GEAR_RESOURCE.ref.id } },
    { fromHand: note },
  ];
  return { state: given.state, gear: gear.id, recruit, note, payment };
}

function run(state: GameState, command: Command, prefer: InstanceId, d = deps) {
  const prompts: { options: readonly string[]; note: string | undefined }[] = [];
  const pick = (s: GameState): readonly string[] => {
    const choice = s.pendingChoice!;
    if (choice.prompt.kind === "chooseTriggers") return choice.options.map((o) => o.optionId);
    if (choice.prompt.kind === "chooseCards") {
      prompts.push({
        options: choice.options.flatMap((o) => (o.ref?.kind === "card" ? [o.ref.instanceId] : [])),
        note: choice.prompt.note,
      });
      const wanted = choice.options.find((o) => o.ref?.kind === "card" && o.ref.instanceId === prefer);
      if (wanted) return [wanted.optionId];
    }
    return defaultPick(s);
  };
  const { session, events } = driveSession(startSession(state), d, [command], pick);
  const replayed = replay(session.log, d);
  if (!replayed.ok) throw new Error(replayed.error.message);
  expect(replayed.state).toEqual(session.state);
  return { state: session.state, events, prompts };
}

const playedEvent = (events: readonly GameEvent[]) =>
  events.flatMap((e) =>
    e.type === "triggerEvent" && e.phase === "resolved" && e.event.kind === "cardPlayed" ? [e.event] : [],
  )[0];

describe("slot `paid.inPlayCards`: the cards in play whose resource ability paid for a play", () => {
  it("holds the support whose resource ability paid; `paid.cards` and its counts hold only the hand card", () => {
    const t = table();
    const { events } = run(t.state, play(t.recruit, t.payment), t.note);
    const played = playedEvent(events)!;
    expect(played.paidCards).toEqual([t.note]);
    expect(played.paidInPlayCards).toEqual([t.gear]);
    // `paid.cards.<cardType>` (§3.51) counts the resource card alone, never the support.
    const counts = Object.entries(played.payment ?? {}).filter(([k]) => k.startsWith("paid.cards."));
    expect(counts).toEqual([["paid.cards.resource", 1]]);
  });

  it("the tuck offers both, and its prompt carries the effect's note", () => {
    const t = table();
    const { prompts } = run(t.state, play(t.recruit, t.payment), t.note);
    expect(prompts).toHaveLength(1);
    expect([...prompts[0]!.options].sort()).toEqual([t.gear, t.note].sort());
    expect(prompts[0]!.note).toBe(NOTE_TEXT);
  });

  it("tucking the support takes it out of play, under the ally", () => {
    const t = table();
    const { state } = run(t.state, play(t.recruit, t.payment), t.gear);
    expect(mustInstance(state, t.recruit).tucked).toEqual([t.gear]);
    expect(locateCard(state, t.gear)).toMatchObject({ kind: "tucked", hostInstanceId: t.recruit });
    expect(cardsInPlay(state)).not.toContain(t.gear);
    expect(mustPlayer(state, P1).discard).toContain(t.note);
  });

  it("a play paid by hand cards alone binds no in-play card", () => {
    const t = table();
    const extra = mustPlayer(t.state, P1).deck.find((id) => t.state.instances[id]?.cardId === NOTE.id)!;
    const staged: GameState = {
      ...t.state,
      players: t.state.players.map((p) =>
        p.playerId === P1 ? { ...p, deck: p.deck.filter((i) => i !== extra), hand: [...p.hand, extra] } : p,
      ),
    };
    const { events } = run(staged, play(t.recruit, [{ fromHand: t.note }, { fromHand: extra }]), t.note);
    expect(playedEvent(events)!.paidCards).toEqual([t.note, extra]);
    expect(playedEvent(events)!.paidInPlayCards).toBeUndefined();
  });

  it("the slot is carried on `cardBeingPlayed` too, for an interrupt to the play", () => {
    const withInterrupt = depsOf(TUCK_RESPONSE, GEAR_RESOURCE, BEING_INTERRUPT);
    const t = table(withInterrupt, [WATCHER]);
    const watcher = playerCardIntoPlay(t.state, WATCHER.id);
    const { events } = run(watcher.state, play(t.recruit, t.payment), t.note, withInterrupt);
    const being = events.flatMap((e) =>
      e.type === "triggerEvent" && e.event.kind === "cardBeingPlayed" ? [e.event] : [],
    )[0];
    expect(being, "the cardBeingPlayed window opened").toBeDefined();
    expect(being!.paidInPlayCards).toEqual([t.gear]);
    expect(being!.paidCards).toEqual([t.note]);
  });

  it("leaves out an in-play payer whose resource was overpaid (a cost of 0: nothing was paid)", () => {
    // RRG 1.8 "Cost" (p. 13): overpaid resources "were not paid for that cost"; §4.1 Q28 = A, as for `paid.cards`.
    const t = table();
    const free = giveCards(t.state, P1, FREE_RECRUIT.id);
    const recruit = free.ids[0]!;
    const { state, events, prompts } = run(
      free.state,
      play(recruit, [{ ability: { instanceId: t.gear, abilityId: GEAR_RESOURCE.ref.id } }]),
      t.gear,
    );
    expect(playedEvent(events)!.paidInPlayCards).toBeUndefined();
    expect(prompts).toEqual([]);
    expect(mustPlayer(state, P1).playArea).toContain(t.gear);
  });

  // Engine reading: an identity is never tucked under a card (it never leaves play that way), so an identity whose
  // resource ability paid is not bound.
  it("leaves out an identity whose resource ability paid", () => {
    const t = table();
    const identity = mustPlayer(t.state, P1).identity.instanceId;
    const heroCardId = mustInstance(t.state, identity).cardId;
    const hero = t.state.cardPool[heroCardId]!;
    if (hero.type !== "hero_identity") throw new Error("expected a hero identity");
    const withResource: GameState = {
      ...t.state,
      cardPool: {
        ...t.state.cardPool,
        [heroCardId]: {
          ...hero,
          hero: { ...hero.hero, abilities: [...hero.hero.abilities, GEAR_RESOURCE.ref] },
          alterEgo: { ...hero.alterEgo, abilities: [...hero.alterEgo.abilities, GEAR_RESOURCE.ref] },
        },
      },
    };
    const { events, prompts } = run(
      withResource,
      play(t.recruit, [{ ability: { instanceId: identity, abilityId: GEAR_RESOURCE.ref.id } }, { fromHand: t.note }]),
      t.note,
    );
    const played = playedEvent(events)!;
    expect(played.paidCards).toEqual([t.note]);
    expect(played.paidInPlayCards).toBeUndefined();
    expect(prompts[0]!.options).toEqual([t.note]);
  });

  // RRG 1.8 "Permanent" (p. 32): permanent cards "are not valid targets for card effects that would cause the
  // permanent card to leave play", and a tuck takes the card out of play ("Tuck", p. 45).
  it("leaves out a permanent card whose resource ability paid", () => {
    const t = table(deps, [FIXED_GEAR]);
    const fixed = playerCardIntoPlay(t.state, FIXED_GEAR.id);
    const { state, events, prompts } = run(
      fixed.state,
      play(t.recruit, [{ ability: { instanceId: fixed.id, abilityId: GEAR_RESOURCE.ref.id } }, { fromHand: t.note }]),
      fixed.id,
    );
    const played = playedEvent(events)!;
    expect(played.paidCards).toEqual([t.note]);
    expect(played.paidInPlayCards).toBeUndefined();
    expect(prompts[0]!.options).toEqual([t.note]);
    expect(mustPlayer(state, P1).playArea).toContain(fixed.id);
  });

  it("leaves out a card that cannot leave play whose resource ability paid", () => {
    const d = depsOf(TUCK_RESPONSE, GEAR_RESOURCE, ROOTED_RULE);
    const t = table(d, [ROOTED_GEAR]);
    const rooted = playerCardIntoPlay(t.state, ROOTED_GEAR.id);
    const { state, events, prompts } = run(
      rooted.state,
      play(t.recruit, [{ ability: { instanceId: rooted.id, abilityId: GEAR_RESOURCE.ref.id } }, { fromHand: t.note }]),
      rooted.id,
      d,
    );
    const played = playedEvent(events)!;
    expect(played.paidCards).toEqual([t.note]);
    expect(played.paidInPlayCards).toBeUndefined();
    expect(prompts[0]!.options).toEqual([t.note]);
    expect(mustPlayer(state, P1).playArea).toContain(rooted.id);
  });
});
