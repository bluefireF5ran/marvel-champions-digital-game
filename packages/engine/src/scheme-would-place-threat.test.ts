/**
 * `EffectSpec enemyScheme.wouldPlaceThreat`: "[Enemy] schemes. If this activation would place any threat on the main
 * scheme, you may … to prevent X of that threat …". The rest of the initiating ability's text resolves at the
 * activation's place-threat step with the placement as its triggering event, whether or not its card is in play (a
 * treachery being revealed is not, so it has no interrupt of its own to gather).
 *
 * Sources: RRG 1.8 "Scheme (Enemy Activation)" (p. 39) step 3; "Prevent" (p. 35); "Interrupt" (p. 25).
 */

import { flat } from "@mc/content";
import type { CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { replay, startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import { playerId, type InstanceId } from "./ids.js";
import { activeEncounterDeck, mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec, ValueSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility, type StubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubMainScheme, stubSupport, stubTreachery, stubVillain } from "./testing/fixtures.js";
import { defaultPick, giveCards, newGame, RESOURCE, runWith, withEncounterPiles } from "./testing/scenario.js";

const p1 = playerId("p1");
const copies = (id: CardId, n: number): readonly CardId[] => Array.from({ length: n }, () => id);
const theVillain = { kind: "villain" } as const;
const you = { kind: "controller" } as const;
const x = { kind: "var", name: "x.amount" } as const;
/** A marker: damage on the villain equal to `amount`. */
const mark = (amount: ValueSpec): EffectSpec => ({ kind: "dealDamage", target: theVillain, amount });

const action = (id: string, effects: readonly EffectSpec[]) =>
  stubAbility(id, { trigger: { kind: "action" }, effects });
const schemes = (wouldPlaceThreat: readonly EffectSpec[]): EffectSpec => ({
  kind: "enemyScheme",
  enemies: theVillain,
  against: you,
  bind: "s",
  wouldPlaceThreat,
});
/** "You may prevent up to X of that threat" as a number chosen from 0 to the threat about to be placed. */
const preventChosen: readonly EffectSpec[] = [
  { kind: "chooseNumber", player: you, max: { kind: "eventAmount" }, bind: "x" },
  { kind: "preventThreat", amount: x },
  mark(x),
];

/**
 * "You may spend X [mental] resources to prevent X of that threat", one resource at a time: for each threat about to
 * be placed, either spend 1 [mental] resource (an option only a player who can pay is offered) to prevent 1, or not.
 */
const payToPrevent: readonly EffectSpec[] = [
  {
    kind: "repeatTimes",
    times: { kind: "eventAmount" },
    effects: [
      {
        kind: "chooseOne",
        chooser: you,
        options: [
          {
            label: "Spend 1 [mental] resource to prevent 1 threat",
            effects: [
              { kind: "spendResources", player: you, resources: { mental: 1 }, bind: "paid", required: true },
              { kind: "preventThreat", amount: { kind: "const", value: 1 } },
              mark({ kind: "const", value: 1 }),
            ],
          },
          { label: "Prevent no more", effects: [] },
        ],
      },
    ],
  },
];
/** "The villain schemes. If this activation would place any threat …, you may spend X [mental] resources …" */
const BARGAIN = action("bargain.action", [schemes(payToPrevent)]);
/** "The villain schemes. If this activation would place any threat on the main scheme, prevent up to X of it." */
const PARRY = action("parry.action", [schemes(preventChosen)]);
/** "… cancel that placement." */
const BLOCK = action("block.action", [schemes([{ kind: "cancelTriggeringEvent" }, mark({ kind: "const", value: 1 })])]);
/** A treachery: "When Revealed: The villain schemes. If this activation would place any threat …, prevent up to X." */
const WITS_REVEAL = stubAbility("wits.when-revealed", {
  trigger: { kind: "whenRevealed" },
  effects: [schemes(preventChosen)],
});
const WITS = stubTreachery({ id: "wits", boostIcons: 0, abilities: [WITS_REVEAL.ref] });
/** "Forced Interrupt: When the villain activates, deal 10 damage to it." (a listener, so the activation is announced) */
const WARY = stubAbility("wary.forced-interrupt", {
  trigger: { kind: "interrupt", forced: true, on: { on: "enemyActivating", targetIs: { categories: ["villain"] } } },
  effects: [mark({ kind: "const", value: 10 })],
});

const ACTIONS = [PARRY, BLOCK, WARY, BARGAIN] as const;
const SUPPORT = new Map(
  ACTIONS.map((a) => [a as StubAbility, stubSupport({ id: a.ref.id.split(".")[0]!, cost: 0, abilities: [a.ref] })]),
);
const BLANK = stubTreachery({ id: "blank", boostIcons: 0 });
const TWO = stubTreachery({ id: "two", boostIcons: 2 });
const deps: EngineDeps = depsOf(...ACTIONS, WITS_REVEAL);

interface Setup {
  readonly state: GameState;
  readonly inPlay: ReadonlyMap<StubAbility, InstanceId>;
  readonly villain: InstanceId;
}

/** Alter-ego form, the villain's SCH `sch`, `abilities`' supports in play, the encounter deck `top` over blanks. */
function setup(sch: number, abilities: readonly StubAbility[], top: readonly CardId[] = []): Setup {
  const supports = abilities.map((a) => SUPPORT.get(a)!);
  const state = newGame({
    villain: stubVillain({ id: "villain", stages: [{ hp: flat(60), atk: 1, sch }] }),
    mainScheme: stubMainScheme({
      id: "main",
      stages: [{ startingThreat: flat(0), targetThreat: flat(40), acceleration: flat(0) }],
    }),
    extraCards: [BLANK, TWO, WITS, ...SUPPORT.values()],
    deck: [...supports.map((s) => s.id), ...copies(RESOURCE.id, 20)],
    encounterDeck: [...top, ...copies(BLANK.id, 20)],
    deps,
  });
  const given = giveCards(state, p1, ...supports.map((s) => s.id));
  const ids = given.ids as readonly InstanceId[];
  const ready = runWith(
    deps,
    given.state,
    ...ids.map((id): Command => ({
      type: "playCard",
      playerId: p1,
      cardInstanceId: id,
      payment: [],
      attachToInstanceId: null,
    })),
  );
  // The deck in the order given: `top` first.
  const deck = activeEncounterDeck(ready).deck;
  const first = top.map((code) => deck.find((id) => ready.instances[id]?.cardId === code)!);
  const stacked = withEncounterPiles(ready, { deck: [...first, ...deck.filter((id) => !first.includes(id))] });
  return {
    state: stacked,
    inPlay: new Map(abilities.map((a, index) => [a, ids[index]!] as const)),
    villain: Object.values(stacked.instances).find((i) => i.cardId === "villain")!.instanceId,
  };
}

/** Answers a `chooseNumber` with `number`; everything else by default. */
const choosing =
  (number: number, asked: number[][] = []) =>
  (state: GameState): readonly string[] => {
    const choice = state.pendingChoice;
    if (choice?.prompt.kind !== "chooseNumber") return defaultPick(state);
    asked.push(choice.options.map((o) => Number(o.optionId)));
    return [String(number)];
  };

function drive(s: Setup, command: Command, pick: (state: GameState) => readonly string[]) {
  const { session, events } = driveSession(startSession(s.state), deps, [command], pick);
  return { state: session.state, events, session };
}
const use = (s: Setup, ability: StubAbility): Command => ({
  type: "useAbility",
  playerId: p1,
  cardInstanceId: s.inPlay.get(ability)!,
  abilityId: ability.ref.id as Extract<Command, { type: "useAbility" }>["abilityId"],
  payment: [],
});

const of = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const damage = (state: GameState, s: Setup): number => mustInstance(state, s.villain).damage;
const threat = (state: GameState): number => mustInstance(state, state.mainScheme.instanceId).threat;
const schemeResults = (events: readonly GameEvent[]) =>
  of(events, "triggerEvent")
    .filter((e) => e.phase === "resolved" && e.event.kind === "enemyScheme")
    .map((e) => ("results" in e.event ? e.event.results : undefined));

describe("enemyScheme.wouldPlaceThreat", () => {
  it("resolves at the place-threat step with the threat about to be placed (SCH 3 + 2 boost icons = 5): 2 prevented, 3 placed", () => {
    const s = setup(3, [PARRY], [TWO.id]);
    const asked: number[][] = [];
    const { state, events, session } = drive(s, use(s, PARRY), choosing(2, asked));
    expect(asked).toEqual([[0, 1, 2, 3, 4, 5]]);
    expect(of(events, "schemeResolved")).toMatchObject([{ baseSch: 3, boostIcons: 2, threatPlaced: 5 }]);
    expect(of(events, "threatPrevented")).toMatchObject([{ schemeInstanceId: state.mainScheme.instanceId, amount: 2 }]);
    expect(threat(state)).toBe(3);
    expect(schemeResults(events)).toMatchObject([{ threatPlaced: 3 }]);
    expect(damage(state, s)).toBe(2);
    // The choice comes after the boost card is turned up and before any threat is placed.
    const order = events.map((e) => e.type);
    expect(order.indexOf("boostCardFlipped")).toBeLessThan(order.indexOf("choiceRequested"));
    expect(order.indexOf("choiceRequested")).toBeLessThan(order.indexOf("threatPlaced"));
    const replayed = replay(session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(session.state);
  });

  it("choosing 0 prevents nothing, and preventing all of it places none", () => {
    const none = setup(3, [PARRY]);
    expect(threat(drive(none, use(none, PARRY), choosing(0)).state)).toBe(3);
    const all = setup(3, [PARRY]);
    const run = drive(all, use(all, PARRY), choosing(3));
    expect(threat(run.state)).toBe(0);
    expect(of(run.events, "threatPrevented")).toMatchObject([{ amount: 3 }]);
  });

  it("is not resolved when the activation would place no threat (SCH 0, no boost icons)", () => {
    const s = setup(0, [PARRY]);
    const asked: number[][] = [];
    const { state } = drive(s, use(s, PARRY), choosing(0, asked));
    expect(asked).toEqual([]);
    expect(threat(state)).toBe(0);
  });

  it("can cancel the placement: nothing is placed and the activation reports no threat", () => {
    const s = setup(3, [BLOCK]);
    const { state, events } = drive(s, use(s, BLOCK), defaultPick);
    expect(threat(state)).toBe(0);
    expect(of(events, "threatPlaced")).toHaveLength(0);
    expect(damage(state, s)).toBe(1);
  });

  it("a treachery's When Revealed carries it: the card is not in play, and its scheme's threat is still prevented", () => {
    // Villain phase in alter-ego form: the villain schemes (3), then the treachery dealt to the player makes it scheme
    // again (3), of which the player prevents 2.
    const s = setup(3, [], [BLANK.id, WITS.id]);
    const asked: number[][] = [];
    const { state, events, session } = drive(s, { type: "endTurn", playerId: p1 }, choosing(2, asked));
    expect(asked).toEqual([[0, 1, 2, 3]]);
    expect(of(events, "schemeResolved")).toHaveLength(2);
    expect(of(events, "threatPrevented")).toMatchObject([{ amount: 2 }]);
    expect(threat(state)).toBe(3 + 1);
    expect(damage(state, s)).toBe(2);
    const replayed = replay(session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(session.state);
  });

  it("pays for each threat prevented: two [mental] spent of 3 threat, 1 placed; the spend is not offered once the hand is empty", () => {
    const s = setup(3, [BARGAIN]);
    const hand = mustPlayer(s.state, p1).hand.length;
    let spends = 0;
    const labels: string[][] = [];
    const pick = (state: GameState): readonly string[] => {
      const choice = state.pendingChoice;
      if (choice?.prompt.kind !== "chooseOption") return defaultPick(state);
      labels.push(choice.options.map((o) => o.label));
      const spend = choice.options.find((o) => o.label.startsWith("Spend"));
      return spend && spends++ < 2
        ? [spend.optionId]
        : [choice.options.find((o) => o.label === "Prevent no more")!.optionId];
    };
    const { state, events } = drive(s, use(s, BARGAIN), pick);
    expect(labels).toHaveLength(3);
    expect(of(events, "threatPrevented").map((e) => e.amount)).toEqual([1, 1]);
    expect(threat(state)).toBe(1);
    expect(damage(state, s)).toBe(2);
    expect(mustPlayer(state, p1).hand).toHaveLength(hand - 2);

    // With nothing to pay with, only the other option is left for each threat.
    const broke: Setup = {
      ...s,
      state: {
        ...s.state,
        players: s.state.players.map((p) => ({ ...p, hand: [], deck: [...p.deck, ...p.hand] })),
      },
    };
    const offered: string[][] = [];
    const run = drive(broke, use(broke, BARGAIN), (state) => {
      const choice = state.pendingChoice;
      if (choice?.prompt.kind === "chooseOption") offered.push(choice.options.map((o) => o.label));
      return defaultPick(state);
    });
    expect(offered.flat().some((label) => label.startsWith("Spend"))).toBe(false);
    expect(threat(run.state)).toBe(3);
  });

  it("travels with an activation that is announced first ('when [enemy] activates' has a listener)", () => {
    const s = setup(3, [PARRY, WARY]);
    const { state, events } = drive(s, use(s, PARRY), choosing(1));
    expect(of(events, "threatPrevented")).toMatchObject([{ amount: 1 }]);
    expect(threat(state)).toBe(2);
    // 10 from the interrupt to the activation, 1 from the number chosen.
    expect(damage(state, s)).toBe(11);
  });
});
