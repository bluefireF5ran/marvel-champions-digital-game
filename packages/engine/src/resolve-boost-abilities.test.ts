/**
 * docs/phase7-wave10.md §3.11: resolving a card's "Boost" abilities on another card's instruction. Freedom Fighters
 * (`cw` 56153): "When Revealed: Resolve the 'Boost' ability of each minion in play. If no 'Boost' abilities were
 * resolved this way, this card gains surge. [star] Boost: Resolve the 'Boost' ability of each minion engaged with you."
 * `resolveSpecials.trigger: "boost"` resolves each card's Boost abilities, and only those, with the card still in
 * play: "this card" inside them is the minion and "you" the resolving player. Synthetic cards.
 *
 * Question 10 (§4.0; owner, 2026-10-11): "this card gains [boost][boost]" in a borrowed ability does nothing (A, the
 * default: RRG 1.8 "Boost", p. 9, adds the icons of "each [boost] card", and a minion in play is not one), with B (the
 * icons join the activation the resolving card is boosting) kept as `borrowedBoostIcons: "joinActivation"`.
 *
 * The villain phase here: the villain (ATK 1) attacks the player with the top card of the encounter deck as its boost
 * card, then the player is dealt and reveals the next card.
 */

import { flat } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps } from "./abilities.js";
import { replay, startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec, TargetQuery, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubMinion, stubTreachery, stubVillain } from "./testing/fixtures.js";
import { defaultPick } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, minionEngagedWith, onTopOfEncounterDeck, P1, P2 } from "./testing/wave3.js";

const def = (definition: AbilityDefinition) => definition;
const n = (value: number) => ({ kind: "const", value }) as const;
const you: TargetRef = { kind: "identityOf", player: { kind: "controller" } };
const self: TargetRef = { kind: "self" };

/** "Boost: You are confused. If you were already confused, this card gains [boost][boost]." Marks its own card. */
const BIRD_BOOST = stubAbility(
  "bird.boost",
  def({
    trigger: { kind: "boost" },
    effects: [
      {
        kind: "if",
        condition: { kind: "hasStatus", of: you, status: "confused" },
        then: [{ kind: "adjustBoostCount", delta: n(2) }],
      },
      { kind: "giveStatus", target: you, status: "confused" },
      { kind: "addCounters", target: self, counterType: "marker", amount: n(1) },
    ],
  }),
);
/** "When Revealed: Place 3 threat on the main scheme." Must not resolve. */
const BIRD_REVEALED = stubAbility(
  "bird.when-revealed",
  def({
    trigger: { kind: "whenRevealed" },
    effects: [{ kind: "placeThreat", target: { kind: "mainScheme" }, amount: n(3) }],
  }),
);
const BIRD = stubMinion({
  id: "bird",
  atk: 1,
  sch: 1,
  hp: 5,
  boostIcons: 1,
  abilities: [BIRD_BOOST.ref, BIRD_REVEALED.ref],
});
/** "Boost: You are stunned." */
const OX_BOOST = stubAbility(
  "ox.boost",
  def({ trigger: { kind: "boost" }, effects: [{ kind: "giveStatus", target: you, status: "stunned" }] }),
);
const OX = stubMinion({ id: "ox", atk: 1, sch: 1, hp: 5, boostIcons: 1, abilities: [OX_BOOST.ref] });
/** A minion with a When Revealed and no Boost ability. */
const PLAIN = stubMinion({ id: "plain", atk: 1, sch: 1, hp: 5, boostIcons: 1, abilities: [BIRD_REVEALED.ref] });

type Option = "nothing" | "joinActivation";
const resolveBoosts = (minions: TargetQuery, borrowedBoostIcons?: Option): EffectSpec => ({
  kind: "resolveSpecials",
  of: { kind: "each", query: minions },
  trigger: "boost",
  bind: "r",
  ...(borrowedBoostIcons ? { borrowedBoostIcons } : {}),
});
const IN_PLAY: TargetQuery = { categories: ["minion"] };
const ENGAGED: TargetQuery = { categories: ["minion"], engagedWith: "you" };

const fighters = (id: string, option?: Option) => {
  const revealed = stubAbility(
    `${id}.when-revealed`,
    def({
      trigger: { kind: "whenRevealed" },
      effects: [
        resolveBoosts(IN_PLAY, option),
        // The count, as a value: that many counters on the main scheme.
        {
          kind: "addCounters",
          target: { kind: "mainScheme" },
          counterType: "resolved",
          amount: { kind: "var", name: "r.count" },
        },
        {
          kind: "if",
          condition: { kind: "not", of: { kind: "varAtLeast", name: "r.count", amount: 1 } },
          then: [{ kind: "gainSurge" }],
        },
      ],
    }),
  );
  const boost = stubAbility(
    `${id}.boost`,
    def({ trigger: { kind: "boost" }, effects: [resolveBoosts(ENGAGED, option)] }),
  );
  return {
    revealed,
    boost,
    card: stubTreachery({ id, boostIcons: 1, starIcon: true, abilities: [revealed.ref, boost.ref] }),
  };
};
const A = fighters("fighters-a");
const A_NAMED = fighters("fighters-a-named", "nothing");
const B = fighters("fighters-b", "joinActivation");
/** No boost icon and no ability: the villain's boost card when the card under test is the one dealt. */
const BLANK = stubTreachery({ id: "blank", boostIcons: 0 });
/** Two more of the same, so a stack can name a blank card more than once (the stacking helper takes the first copy). */
const BLANK_2 = stubTreachery({ id: "blank-2", boostIcons: 0 });
const BLANK_3 = stubTreachery({ id: "blank-3", boostIcons: 0 });
const BOSS = stubVillain({ id: "boss", stages: [{ hp: flat(30), atk: 1, sch: 1 }] });

const deps: EngineDeps = depsOf(
  BIRD_BOOST,
  BIRD_REVEALED,
  OX_BOOST,
  A.revealed,
  A.boost,
  A_NAMED.revealed,
  A_NAMED.boost,
  B.revealed,
  B.boost,
);

type Fighters = typeof A;
type Stacked = typeof BLANK | typeof BIRD;

/** A game with `minions` engaged (surgery) and the encounter deck stacked `top` first. */
function start(
  minions: readonly (readonly [typeof BIRD, PlayerId])[],
  top: readonly Stacked[],
  options: { readonly players?: 1 | 2; readonly confused?: boolean } = {},
) {
  let state = gameAtFirstTurn({
    cards: [BIRD, OX, PLAIN, BLANK, BLANK_2, BLANK_3, BOSS, A.card, A_NAMED.card, B.card],
    deps,
    villain: BOSS,
    players: options.players ?? 1,
    encounter: [
      BIRD.id,
      BIRD.id,
      OX.id,
      PLAIN.id,
      A.card.id,
      A_NAMED.card.id,
      B.card.id,
      BLANK_2.id,
      BLANK_3.id,
      ...copiesOf(BLANK.id, 12),
    ],
  });
  const ids: InstanceId[] = [];
  for (const [card, player] of minions) {
    const placed = minionEngagedWith(state, card.id, player);
    state = placed.state;
    ids.push(placed.id);
  }
  for (const card of [...top].reverse()) state = onTopOfEncounterDeck(state, card.id);
  // Hero form, so the villain and the minions attack (RRG 1.8 "Activation", p. 6).
  state = { ...state, players: state.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" } })) };
  if (options.confused) {
    const hero = mustPlayer(state, P1).identity.instanceId;
    const instance = mustInstance(state, hero);
    state = {
      ...state,
      instances: { ...state.instances, [hero]: { ...instance, statuses: { ...instance.statuses, confused: 1 } } },
    };
  }
  return { state, ids };
}

/** Every player ends their turn; the villain phase runs to the next player turn. */
function villainPhase(state: GameState) {
  const turns = state.players.map((p) => ({ type: "endTurn", playerId: p.playerId }) as const);
  const { session, events } = driveSession(startSession(state), deps, turns, defaultPick);
  return { state: session.state, events, session };
}

const statusesOf = (state: GameState, player: PlayerId) => {
  const { stunned, confused, tough } = mustInstance(state, mustPlayer(state, player).identity.instanceId).statuses;
  return { stunned, confused, tough };
};
const markers = (state: GameState, id: InstanceId) => mustInstance(state, id).counters.marker ?? 0;
const resolvedCount = (state: GameState) => mustInstance(state, state.mainScheme.instanceId).counters.resolved ?? 0;
const threatOf = (state: GameState) => mustInstance(state, state.mainScheme.instanceId).threat;
const of = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
/** The villain's attacks: [base ATK, boost icons] each. */
const villainAttacks = (events: readonly GameEvent[], state: GameState) =>
  of(events, "attackResolved")
    .filter((e) => e.enemyInstanceId === state.activeVillainId)
    .map((e) => [e.baseAtk, e.boostIcons]);
const surges = (events: readonly GameEvent[]) => of(events, "surgeTriggered").length;

describe("§3.11 'Resolve the Boost ability of each minion in play' (revealed)", () => {
  it("two minions with a Boost ability: both resolve on the revealing player, the count is 2, no surge", () => {
    const { state, ids } = start(
      [
        [BIRD, P1],
        [OX, P1],
        [PLAIN, P1],
      ],
      [BLANK, A.card],
    );
    const before = threatOf(state);
    const after = villainPhase(state);
    expect(statusesOf(after.state, P1)).toEqual({ stunned: 1, confused: 1, tough: 0 });
    expect(resolvedCount(after.state)).toBe(2);
    expect(surges(after.events)).toBe(0);
    // "This card" in the borrowed ability is the minion: its marker is on it, and it is where it was.
    expect(markers(after.state, ids[0]!)).toBe(1);
    expect(mustPlayer(after.state, P1).playArea).toEqual(expect.arrayContaining([...ids]));
    // No minion was turned up as a boost card: only the villain's own boost card was.
    expect(of(after.events, "boostCardFlipped").filter((e) => ids.includes(e.instanceId))).toEqual([]);
    // No When Revealed of a minion resolved (3 threat each): the threat placed is what a blank reveal places.
    const minions = [
      [BIRD, P1],
      [OX, P1],
      [PLAIN, P1],
    ] as const;
    const control = villainPhase(start(minions, [BLANK, BLANK_2]).state);
    expect(threatOf(after.state) - before).toBe(threatOf(control.state) - before);
  });

  it("each minion in play, whoever it is engaged with: the revealing player is 'you' in every one", () => {
    const { state } = start(
      [
        [BIRD, P2],
        [OX, P2],
      ],
      [BLANK, BLANK_2, A.card, BLANK_3],
      { players: 2 },
    );
    const after = villainPhase(state);
    expect(statusesOf(after.state, P1)).toEqual({ stunned: 1, confused: 1, tough: 0 });
    expect(statusesOf(after.state, P2)).toEqual({ stunned: 0, confused: 0, tough: 0 });
    expect(resolvedCount(after.state)).toBe(2);
  });

  it("no minion in play: the count is 0 and the card gains surge", () => {
    const { state } = start([], [BLANK, A.card, BLANK_2]);
    const after = villainPhase(state);
    expect(resolvedCount(after.state)).toBe(0);
    expect(statusesOf(after.state, P1)).toEqual({ stunned: 0, confused: 0, tough: 0 });
    expect(surges(after.events)).toBe(1);
    // The surge deals one more card, the blank one under it.
    expect(of(after.events, "encounterCardRevealed").map((e) => e.cardId)).toEqual([A.card.id, BLANK_2.id]);
  });

  it("only a minion with no Boost ability in play: the count is 0 and the card gains surge", () => {
    const { state } = start([[PLAIN, P1]], [BLANK, A.card, BLANK_2]);
    const after = villainPhase(state);
    expect(resolvedCount(after.state)).toBe(0);
    expect(surges(after.events)).toBe(1);
  });

  it("question 10, B: a revealed card is boosting no activation, so the gained icons do nothing under B too", () => {
    const { state } = start([[BIRD, P1]], [BLANK, B.card], { confused: true });
    const after = villainPhase(state);
    expect(resolvedCount(after.state)).toBe(1);
    expect(statusesOf(after.state, P1).confused).toBe(1);
    expect(of(after.events, "attackResolved").map((e) => e.boostIcons)).toEqual(
      of(villainPhase(start([[BIRD, P1]], [BLANK, BLANK_2], { confused: true }).state).events, "attackResolved").map(
        (e) => e.boostIcons,
      ),
    );
  });
});

describe("§3.11 'Boost: Resolve the Boost ability of each minion engaged with you' (as the villain's boost card)", () => {
  const boosted = (card: Fighters, confused: boolean) => {
    const { state, ids } = start(
      [
        [BIRD, P1],
        [OX, P1],
      ],
      [card.card, BLANK],
      { confused },
    );
    return { ...villainPhase(state), ids };
  };

  it("resolves each engaged minion's Boost ability on the attacked player; the card adds its own printed icon", () => {
    const after = boosted(A, false);
    expect(villainAttacks(after.events, after.state)).toEqual([[1, 1]]);
    expect(markers(after.state, after.ids[0]!)).toBe(1);
    // The card's own When Revealed did not resolve: no count was recorded and no surge.
    expect(resolvedCount(after.state)).toBe(0);
    expect(surges(after.events)).toBe(0);
    expect(statusesOf(after.state, P1)).toEqual({ stunned: 1, confused: 1, tough: 0 });
  });

  it("question 10, A (the default): 'this card gains [boost][boost]' in the borrowed ability adds nothing", () => {
    const after = boosted(A, true);
    expect(villainAttacks(after.events, after.state)).toEqual([[1, 1]]);
    expect(markers(after.state, after.ids[0]!)).toBe(1);
  });

  it('question 10, A named outright (`borrowedBoostIcons: "nothing"`) is the default', () => {
    const after = boosted(A_NAMED, true);
    expect(villainAttacks(after.events, after.state)).toEqual([[1, 1]]);
  });

  it('question 10, B (`borrowedBoostIcons: "joinActivation"`): the icons join the activation the card boosts', () => {
    const after = boosted(B, true);
    expect(villainAttacks(after.events, after.state)).toEqual([[1, 3]]);
    // Not already confused: nothing is gained, so B and A agree.
    const fresh = boosted(B, false);
    expect(villainAttacks(fresh.events, fresh.state)).toEqual([[1, 1]]);
  });

  it("a minion engaged with another player is not read", () => {
    const { state } = start([[OX, P2]], [A.card, BLANK, BLANK_2, BLANK_3], { players: 2 });
    const after = villainPhase(state);
    expect(statusesOf(after.state, P1).stunned).toBe(0);
    expect(statusesOf(after.state, P2).stunned).toBe(0);
  });

  it("a minion's own Boost ability, with the minion as the boost card, still adds its icons (not borrowed)", () => {
    const { state } = start([], [BIRD, BLANK], { confused: true });
    const after = villainPhase(state);
    expect(villainAttacks(after.events, after.state)).toEqual([[1, 3]]);
  });

  it("replays deep-equal", () => {
    const after = boosted(B, true);
    const replayed = replay(after.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(after.session.state);
  });
});
