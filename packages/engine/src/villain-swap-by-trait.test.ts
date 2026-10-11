/**
 * docs/phase7-wave9.md §3.60: `swapVillain { with: { setAsideTrait }, face, dial }`. Synthetic villains shaped like the
 * Avatars of Loki: four titles, each a card whose front has the [Avatar] trait and a "Forced Interrupt: When this
 * villain would be defeated, place 5 shatter counters here and flip this card instead", and whose back is a "Figment"
 * with infinite hit points and "When Revealed: Remove each shatter counter from here. Swap the Figment in play with a
 * random set-aside villain, Avatar side faceup, then set the hit point dial of that villain to its printed hit point
 * value."
 *
 * Sources: RRG 1.8 "'Swap'" (p. 42): "A swap cannot be completed if there is not a component in both locations"; RRG
 * 1.8 erratum (p. 70, "Swapping Avatars of Loki"): "they should replace the villain in play with one of the other
 * set-aside versions of the Avatar of Loki villain"; MC55 p. 19 (docs/phase7-wave9.md §3.60): a swap "does not cause
 * any Avatar of Loki villain to leave play, enter play, or be revealed. Sustained damage (on the villain's hit point
 * dial), attachments, status cards, counters, and tokens on the Avatar of Loki villain should be transferred"; ruling
 * February 28, 2026 – Ruling 3: "Scenario intent takes precedence: Intense Focus / Total Focus should not leave play.
 * They attach to the swapped-in Avatar of Loki." Owner decision §4.1 Q8 = A: the new dial is the printed value plus
 * what an attachment adds.
 */

import { flat, trait, type CardId, type VillainCard } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import { replay, startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { characterProfile, mustInstance, villainOf } from "./query.js";
import { cardsInPlay } from "./select.js";
import { createGame } from "./setup.js";
import type { EffectSpec, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import {
  stubAttachment,
  stubEvent,
  stubMainScheme,
  stubSupport,
  stubTreachery,
  stubVillain,
} from "./testing/fixtures.js";
import { DEFAULT_CARDS, DEFAULT_DECK, HERO } from "./testing/scenario.js";
import { copiesOf, playerCardIntoPlay, playFree } from "./testing/wave3.js";

const AVATAR = trait("Avatar");
const self: TargetRef = { kind: "self" };
const theVillain: TargetRef = { kind: "villain" };
const n = (value: number) => ({ kind: "const", value }) as const;
const tracker: TargetRef = { kind: "each", query: { categories: ["support"], name: "tracker" } };

/** "Forced Interrupt: When this villain would be defeated, place 5 shatter counters here and flip this card instead." */
const WOULD_FALL = stubAbility("avatar.would-be-defeated", {
  trigger: { kind: "interrupt", forced: true, would: true, on: { on: "characterDefeated", selfIs: "target" } },
  effects: [
    {
      kind: "replaceTriggeringEvent",
      with: [
        { kind: "addCounters", target: self, counterType: "shatter", amount: n(5) },
        { kind: "flipCard", target: self, reveal: true },
      ],
    },
  ],
});
/** The Figment's When Revealed: the counters come off, then the swap by trait with the dial set to the printed value. */
const SHATTER = stubAbility("figment.when-revealed", {
  trigger: { kind: "whenRevealed" },
  effects: [
    { kind: "removeCounters", target: self, counterType: "shatter", amount: n(99) },
    { kind: "swapVillain", villain: self, with: { setAsideTrait: AVATAR }, face: "starting", dial: "printed" },
  ],
});
const avatar = (id: string, name: string): VillainCard =>
  stubVillain({
    id,
    name,
    stages: [{ hp: flat(15), atk: 1, sch: 1, traits: [AVATAR], abilities: [WOULD_FALL.ref] }],
    back: {
      name: "Figment",
      stages: [
        { hp: flat(0), infiniteHp: true, atk: 0, sch: 0, dashedStats: ["atk", "sch"], abilities: [SHATTER.ref] },
      ],
    },
  });
const AVATARS = [avatar("rascal", "Rascal"), avatar("knave", "Knave"), avatar("wretch", "Wretch")];
/** A set-aside villain without the trait: never in the pool. */
const BYSTANDER = stubVillain({ id: "bystander", stages: [{ hp: flat(9), atk: 1, sch: 1 }] });

/** "The [Avatar] villain gets +4 hit points." */
const FOCUS_CONSTANT = stubAbility("focus.constant", {
  trigger: {
    kind: "constant",
    modifiers: [{ stat: "hp", amount: 4, target: { categories: ["villain"], trait: AVATAR } }],
  },
  effects: [],
});
const FOCUS = stubAttachment({ id: "focus", abilities: [FOCUS_CONSTANT.ref] });
/** Counts what the table hears: a swap, a card leaving play, a card entering play. */
const count = (id: string, on: string, counterType: string) =>
  stubAbility(id, {
    trigger: { kind: "response", forced: true, on: { on } as never },
    effects: [{ kind: "addCounters", target: tracker, counterType, amount: n(1) }],
  });
const HEARD_SWAP = count("tracker.swapped", "villainSwapped", "swaps");
const HEARD_LEAVE = count("tracker.left", "cardLeavesPlay", "left");
const TRACKER = stubSupport({ id: "tracker", cost: 0, abilities: [HEARD_SWAP.ref, HEARD_LEAVE.ref] });
const FILLER = stubTreachery({ id: "filler", boostIcons: 0 });
const SCHEME = stubMainScheme({
  id: "plain",
  stages: [{ startingThreat: flat(0), targetThreat: flat(99), acceleration: flat(0) }],
});

const event = (id: string, effects: readonly EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
/** "Swap the [Avatar] villain in play with a random set-aside [Avatar] villain." */
const STORIES = event("stories", [{ kind: "swapVillain", villain: theVillain, with: { setAsideTrait: AVATAR } }]);
const MARK = event("mark", [
  { kind: "dealDamage", target: theVillain, amount: n(6) },
  { kind: "giveStatus", target: theVillain, status: "tough" },
  { kind: "addCounters", target: theVillain, counterType: "shatter", amount: n(3) },
]);
const HIT_20 = event("hit-20", [{ kind: "dealDamage", target: theVillain, amount: n(20) }]);
const EVENTS = [STORIES, MARK, HIT_20];

const deps: EngineDeps = depsOf(
  WOULD_FALL,
  SHATTER,
  FOCUS_CONSTANT,
  HEARD_SWAP,
  HEARD_LEAVE,
  ...EVENTS.map((e) => e.ability),
);

function start(setAside: readonly VillainCard[] = AVATARS.slice(1)): GameState {
  const result = createGame(
    {
      seed: 8,
      cards: [...DEFAULT_CARDS, ...AVATARS, BYSTANDER, SCHEME, TRACKER, FILLER, FOCUS, ...EVENTS.map((e) => e.card)],
      villainCardId: AVATARS[0]!.id,
      setAsideVillainCardIds: setAside.map((card) => card.id),
      mainSchemeCardId: SCHEME.id,
      encounterDeck: [FOCUS.id, ...copiesOf(FILLER.id, 10)],
      includeIdentitySets: false,
      players: [
        {
          identityCardId: HERO.id,
          deck: [...DEFAULT_DECK, TRACKER.id, ...EVENTS.flatMap((e) => copiesOf(e.card.id, 3))],
        },
      ],
    },
    deps,
  );
  if (!result.ok) throw new Error(result.error.message);
  const state = driveSession(startSession(result.state), deps).session.state;
  return playerCardIntoPlay(state, TRACKER.id).state;
}
const villain = (state: GameState) => villainOf(state, state.activeVillainId)!;
const villainInstance = (state: GameState) => mustInstance(state, state.activeVillainId);
const setAsideCards = (state: GameState): readonly CardId[] =>
  state.encounterSetAside.map((id) => mustInstance(state, id).cardId);
const tracked = (state: GameState, type: string): number => {
  const id = state.players[0]!.playArea.find((i) => mustInstance(state, i).cardId === TRACKER.id)!;
  return mustInstance(state, id).counters[type] ?? 0;
};
/** Attaches the encounter attachment to the villain (surgery: no reveal). */
function focused(state: GameState): { state: GameState; id: InstanceId } {
  const host = state.activeVillainId;
  const id = (Object.keys(state.instances) as InstanceId[]).find(
    (key) => state.instances[key]?.cardId === FOCUS.id && !cardsInPlay(state).includes(key),
  )!;
  const decks = Object.fromEntries(
    Object.entries(state.encounterDecks).map(([deckId, piles]) => [
      deckId,
      { ...piles, deck: piles.deck.filter((x) => x !== id) },
    ]),
  );
  return {
    id,
    state: {
      ...state,
      encounterDecks: decks,
      instances: {
        ...state.instances,
        [id]: { ...mustInstance(state, id), faceup: true, attachedTo: host },
        [host]: { ...mustInstance(state, host), attachments: [...mustInstance(state, host).attachments, id] },
      },
    },
  };
}
const replaced = (events: readonly GameEvent[]) =>
  events.flatMap((e) => (e.type === "villainReplaced" ? [[e.fromCardId, e.toCardId, e.reason] as const] : []));

describe("§3.60 a villain swapped with a random set-aside villain by trait", () => {
  it("keeps the dial: sustained damage, counters and status cards stay; the old card is set aside; no leave or reveal", () => {
    const marked = playFree(start(), deps, MARK.card.id).state;
    const before = villain(marked);
    const { state: after, session, events } = playFree(marked, deps, STORIES.card.id);
    const now = villain(after);
    expect(now.instanceId).toBe(before.instanceId);
    // A different title: one of the two set-aside cards with the trait, never the bystander.
    expect([AVATARS[1]!.id, AVATARS[2]!.id]).toContain(now.cardId);
    expect(now.side).toBe("A");
    expect([...setAsideCards(after)].sort()).toEqual(
      [AVATARS[0]!.id, ...[AVATARS[1]!.id, AVATARS[2]!.id].filter((id) => id !== now.cardId)].sort(),
    );
    expect(villainInstance(after)).toMatchObject({ damage: 6, statuses: { tough: 1 }, counters: { shatter: 3 } });
    expect(replaced(events)).toEqual([[AVATARS[0]!.id, now.cardId, "swap"]]);
    expect(tracked(after, "swaps")).toBe(1);
    expect(tracked(after, "left")).toBe(0);
    // Nothing is revealed: neither face's abilities resolve for the card swapped in.
    expect(
      events.some(
        (e) =>
          e.type === "abilityResolved" && e.abilityId !== STORIES.ability.ref.id && e.abilityId !== HEARD_SWAP.ref.id,
      ),
    ).toBe(false);
    const replayed = replay(session.log, deps);
    expect(replayed.ok && replayed.state).toEqual(session.state);
  });

  it("the card swapped out is in the pool for the next swap, and the one in play never is", () => {
    // Only one other card with the trait is set aside: the two trade places back and forth.
    const first = playFree(start([AVATARS[1]!, BYSTANDER]), deps, STORIES.card.id).state;
    expect(villain(first).cardId).toBe(AVATARS[1]!.id);
    expect([...setAsideCards(first)].sort()).toEqual([BYSTANDER.id, AVATARS[0]!.id].sort());
    const second = playFree(first, deps, STORIES.card.id).state;
    expect(villain(second).cardId).toBe(AVATARS[0]!.id);
  });

  it("with no set-aside villain of the trait nothing is swapped (RRG p. 42)", () => {
    const state = start([BYSTANDER]);
    const { state: after, events } = playFree(state, deps, STORIES.card.id);
    expect(villain(after).cardId).toBe(AVATARS[0]!.id);
    expect(setAsideCards(after)).toEqual([BYSTANDER.id]);
    expect(replaced(events)).toEqual([]);
    expect(tracked(after, "swaps")).toBe(0);
  });
});

describe("§3.60 the defeat replaced by a flip, and the swap from the other face with the dial set", () => {
  it("20 damage on 15 hit points with 2 counters: 7 counters, the flip, the counters removed, a new card at its printed value", () => {
    const seeded = start();
    const two: GameState = {
      ...seeded,
      instances: {
        ...seeded.instances,
        [seeded.activeVillainId]: { ...villainInstance(seeded), counters: { shatter: 2 } },
      },
    };
    const { state: after, session, events } = playFree(two, deps, HIT_20.card.id);
    const now = villain(after);
    expect(now.defeated).toBe(false);
    expect(after.outcome).toBeNull();
    // 2 + 5 counters were on it when it flipped, and the Figment's When Revealed removed them all.
    const placed = events.flatMap((e) => (e.type === "counterAdded" && e.counterType === "shatter" ? [e.amount] : []));
    expect(placed).toEqual([5]);
    const removed = events.flatMap((e) =>
      e.type === "counterRemoved" && e.counterType === "shatter" ? [e.amount] : [],
    );
    expect(removed).toEqual([7]);
    expect(villainInstance(after).counters.shatter ?? 0).toBe(0);
    // A different card, front side up, at its printed 15 with no damage; the old one set aside front side up.
    expect([AVATARS[1]!.id, AVATARS[2]!.id]).toContain(now.cardId);
    expect(now.side).toBe("A");
    expect(villainInstance(after).damage).toBe(0);
    expect(characterProfile(after, after.activeVillainId, deps)?.maxHp).toBe(15);
    expect(setAsideCards(after)).toContain(AVATARS[0]!.id);
    expect(replaced(events)).toEqual([[AVATARS[0]!.id, now.cardId, "swap"]]);
    const replayed = replay(session.log, deps);
    expect(replayed.ok && replayed.state).toEqual(session.state);
  });

  it("an attachment stays attached through the flip and the swap, and its +4 hit points count on the new dial (Q8 = A)", () => {
    const withFocus = focused(start());
    expect(characterProfile(withFocus.state, withFocus.state.activeVillainId, deps)?.maxHp).toBe(19);
    const { state: after } = playFree(withFocus.state, deps, HIT_20.card.id);
    expect(villain(after).cardId).not.toBe(AVATARS[0]!.id);
    expect(mustInstance(after, withFocus.id).attachedTo).toBe(after.activeVillainId);
    expect(villainInstance(after).attachments).toContain(withFocus.id);
    expect(tracked(after, "left")).toBe(0);
    // Printed 15 plus the attachment's 4, no damage: 19 remaining.
    expect(characterProfile(after, after.activeVillainId, deps)?.maxHp).toBe(19);
    expect(villainInstance(after).damage).toBe(0);
  });
});
