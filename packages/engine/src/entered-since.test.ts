/**
 * A card that was not in play when a triggering condition occurred does not answer it (the owner's answer 43B,
 * 2026-10-12, docs/phase7-wave10.md §4.0; `entered-since.ts`), proven with synthetic cards.
 *
 * RRG 1.8 "Triggering Condition" (p. 45): "a specific occurrence that takes place in the game". "Response" (p. 38):
 * "Response abilities may be resolved after the specified triggering condition occurs". The case that raised it: a minion
 * whose "When Defeated" finds and reveals a side scheme reading "Forced Response: After a character is defeated, …"
 * (RRG 1.8 "When Defeated Abilities", p. 48: the defeated card's ability resolves, then it leaves play, and only then
 * does the defeat's response window open). The scheme is in play when that window opens, and was not when the minion
 * was defeated.
 *
 * What must not change: a card's own "after this card enters play" and "after you play this", a card an interrupt put
 * into play before the condition occurred, and "after … attacks", which answers the finished attack (RRG 1.8 "Attack
 * (Enemy Activation)", p. 9, step 6), so a card that came into play while the attack resolved was in play when it did.
 */

import { flat, type AbilityReference, type AnyCard, type CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps, EventPattern } from "./abilities.js";
import { replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import { playerId, type InstanceId } from "./ids.js";
import { activeEncounterDeck, mustInstance } from "./query.js";
import { cardsInPlay } from "./select.js";
import type { EffectSpec, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility, type StubAbility } from "./testing/abilities.js";
import { runCommandsPicking } from "./testing/drive.js";
import {
  stubAlly,
  stubEvent,
  stubMainScheme,
  stubMinion,
  stubSideScheme,
  stubSupport,
  stubTreachery,
  stubVillain,
} from "./testing/fixtures.js";
import { defaultPick, DEFAULT_DECK, giveCard, newGame, withEncounterPiles } from "./testing/scenario.js";

const p1 = playerId("p1");
const you = { kind: "controller" } as const;
const firstPlayer = { kind: "firstPlayer" } as const;
const copies = (id: CardId, n: number): readonly CardId[] => Array.from({ length: n }, () => id);

const abilities: StubAbility[] = [];
const ability = (id: string, definition: AbilityDefinition): AbilityReference => {
  const stub = stubAbility(id, definition);
  abilities.push(stub);
  return stub.ref;
};
/** A counter on the main scheme: every mark lands on one card, so the log orders them. */
const mark = (counterType: string): EffectSpec => ({
  kind: "addCounters",
  target: { kind: "each", query: { categories: ["mainScheme"] } },
  counterType,
  amount: { kind: "const", value: 1 },
});
const forcedResponse = (id: string, on: EventPattern, effects: EffectSpec[]) =>
  ability(id, { trigger: { kind: "response", forced: true, on }, effects });
const afterMinionDefeated: EventPattern = { on: "characterDefeated", targetIs: { categories: ["minion"] } };
const found: TargetRef = { kind: "slot", slot: "found" };
const minionNamed = (name: string): TargetRef => ({ kind: "each", query: { categories: ["minion"], name } });

const VILLAIN = stubVillain({ id: "boss", stages: [{ hp: flat(30), atk: 0, sch: 0 }] });
const SCHEME = stubMainScheme({
  id: "calm",
  stages: [{ startingThreat: flat(0), targetThreat: flat(99), acceleration: flat(0) }],
});
const BLANK = stubTreachery({ id: "blank", boostIcons: 0 });

/**
 * All Versus All's shape: "Forced Response: After a character is defeated, …". It also answers its own entering play
 * and "after a character attacks", for the cases that must keep working.
 */
const BRAWL = stubSideScheme({
  id: "brawl",
  startingThreat: 3,
  boostIcons: 0,
  abilities: [
    forcedResponse("brawl.after-defeat", { on: "characterDefeated", targetIs: { categories: ["character"] } }, [
      mark("brawl"),
    ]),
    forcedResponse("brawl.after-entering", { on: "cardEntersPlay", selfIs: "target" }, [mark("brawl-entered")]),
    forcedResponse("brawl.after-attack", { on: "attack" }, [mark("brawl-attack")]),
  ],
});
/** Hecate's shape: "When Defeated: Find the brawl side scheme and reveal it." */
const WITCH = stubMinion({
  id: "witch",
  atk: 0,
  sch: 0,
  hp: 2,
  boostIcons: 0,
  abilities: [
    ability("witch.when-defeated", {
      trigger: { kind: "whenDefeated" },
      effects: [
        {
          kind: "selectCards",
          slot: "found",
          cards: { kind: "encounter", zones: ["deck"], filter: { name: "brawl" } },
        },
        { kind: "revealCard", cards: found, player: firstPlayer },
      ],
    }),
  ],
});
const GRUNT = stubMinion({ id: "grunt", atk: 0, sch: 0, hp: 2, boostIcons: 0 });
const THUG = stubMinion({ id: "thug", atk: 0, sch: 0, hp: 2, boostIcons: 0 });
/** A minion with its own "Forced Response: After this minion enters play, …" and a When Revealed. */
const HERALDED = stubMinion({
  id: "heralded",
  atk: 0,
  sch: 0,
  hp: 2,
  boostIcons: 0,
  abilities: [
    ability("heralded.when-revealed", { trigger: { kind: "whenRevealed" }, effects: [mark("revealed")] }),
    forcedResponse("heralded.after-entering", { on: "cardEntersPlay", selfIs: "target" }, [mark("own")]),
  ],
});
const ENCOUNTER: readonly AnyCard[] = [BRAWL, WITCH, GRUNT, THUG, HERALDED, BLANK];

/** In play from the start of each case: "Forced Response: After a minion is defeated, …". */
const VIGIL = stubSupport({
  id: "vigil",
  cost: 0,
  abilities: [forcedResponse("vigil.response", afterMinionDefeated, [mark("vigil")])],
});
/** The card that arrives: the same response as the vigil's. */
const LATE = stubSupport({
  id: "late",
  cost: 0,
  abilities: [forcedResponse("late.response", afterMinionDefeated, [mark("late")])],
});
const lateFromHand: EffectSpec[] = [
  { kind: "selectCards", slot: "found", cards: { kind: "zone", zone: "hand", player: you, filter: { name: "late" } } },
  { kind: "putIntoPlay", card: found, controller: you },
];
/** "Forced Interrupt: When a minion would be defeated, put the late support into play from your hand." */
const HERALD = stubSupport({
  id: "herald",
  cost: 0,
  abilities: [
    ability("herald.interrupt", {
      trigger: { kind: "interrupt", forced: true, on: afterMinionDefeated },
      effects: lateFromHand,
    }),
  ],
});
/** "Forced Response: After a minion is defeated, put the late support into play from your hand." */
const USHER = stubSupport({
  id: "usher",
  cost: 0,
  abilities: [forcedResponse("usher.response", afterMinionDefeated, [mark("usher"), ...lateFromHand])],
});
/** An ally with its own "after this enters play" and "after you play this". */
const PAL = stubAlly({
  id: "pal",
  cost: 0,
  atk: 1,
  thw: 1,
  hp: 2,
  abilities: [
    forcedResponse("pal.after-entering", { on: "cardEntersPlay", selfIs: "target" }, [mark("pal-entered")]),
    forcedResponse("pal.after-played", { on: "cardPlayed", selfIs: "target" }, [mark("pal-played")]),
  ],
});
const action = (id: string, effects: EffectSpec[]) =>
  stubEvent({ id, cost: 0, abilities: [ability(`${id}.action`, { trigger: { kind: "action" }, effects })] });
/** "Deal 5 damage to [the named minion / each minion]." */
const zap = (name: string) =>
  action(`zap-${name}`, [{ kind: "dealDamage", target: minionNamed(name), amount: { kind: "const", value: 5 } }]);
const ZAP_WITCH = zap("witch");
const ZAP_GRUNT = zap("grunt");
const ZAP_THUG = zap("thug");
const ZAP_ALL = action("zap-all", [
  {
    kind: "dealDamage",
    target: { kind: "each", query: { categories: ["minion"] } },
    amount: { kind: "const", value: 5 },
  },
]);
/** An attack for 5 on the witch. */
const STRIKE = action("strike", [
  { kind: "attack", target: minionNamed("witch"), amount: { kind: "const", value: 5 }, bind: "hit" },
]);
/** "Reveal the top card of the encounter deck." */
const SCOUT = action("scout", [{ kind: "revealEncounterCard", player: you }]);
/** "Put the brawl side scheme into play from the encounter deck." */
const PLANT = action("plant", [
  { kind: "selectCards", slot: "found", cards: { kind: "encounter", zones: ["deck"], filter: { name: "brawl" } } },
  { kind: "putIntoPlay", card: found, controller: you },
]);
const PLAYER_CARDS: readonly AnyCard[] = [
  VIGIL,
  LATE,
  HERALD,
  USHER,
  PAL,
  ZAP_WITCH,
  ZAP_GRUNT,
  ZAP_THUG,
  ZAP_ALL,
  STRIKE,
  SCOUT,
  PLANT,
];
const deps: EngineDeps = depsOf(...abilities);

/** A game on p1's turn, p1 in hero form, `top` on top of the encounter deck and `inPlay` engaged with p1. */
function game(top: readonly AnyCard[], inPlay: readonly AnyCard[] = []): GameState {
  const start = newGame({
    villain: VILLAIN,
    mainScheme: SCHEME,
    deps,
    extraCards: [...ENCOUNTER, ...PLAYER_CARDS],
    encounterDeck: [...[...top, ...inPlay].map((card) => card.id), ...copies(BLANK.id, 15)],
    deck: [...DEFAULT_DECK, ...PLAYER_CARDS.map((card) => card.id)],
  });
  let deck = [...activeEncounterDeck(start).deck];
  const take = (card: AnyCard): InstanceId => {
    const id = deck.find((i) => start.instances[i]?.cardId === card.id) as InstanceId;
    deck = deck.filter((i) => i !== id);
    return id;
  };
  const topIds = top.map(take);
  const inPlayIds = inPlay.map(take);
  const surgery = withEncounterPiles(start, { deck: [...topIds, ...deck] });
  return {
    ...surgery,
    players: surgery.players.map((p) => ({
      ...p,
      identity: { ...p.identity, form: "hero" as const },
      playArea: p.playerId === p1 ? [...p.playArea, ...inPlayIds] : p.playArea,
    })),
    instances: {
      ...surgery.instances,
      ...Object.fromEntries(
        inPlayIds.map((id) => [
          id,
          { ...mustInstance(surgery, id), faceup: true, engagedWith: p1, controllerId: null },
        ]),
      ),
    },
  };
}

function play(state: GameState, card: AnyCard) {
  const given = giveCard(state, p1, card.id);
  return runCommandsPicking(given.state, deps, defaultPick, {
    type: "playCard",
    playerId: p1,
    cardInstanceId: given.id,
    payment: [],
    attachToInstanceId: null,
  });
}
const withInPlay = (state: GameState, ...cards: readonly AnyCard[]): GameState =>
  cards.reduce((current, card) => play(current, card).state, state);
const withInHand = (state: GameState, card: AnyCard): GameState => giveCard(state, p1, card.id).state;

const idOf = (state: GameState, card: AnyCard): InstanceId =>
  Object.values(state.instances).find((i) => i.cardId === card.id)?.instanceId as InstanceId;
const counted = (state: GameState, counterType: string): number =>
  mustInstance(state, state.mainScheme.instanceId).counters[counterType] ?? 0;
const marked = (events: readonly GameEvent[], counterType: string): number =>
  events.findIndex((e) => e.type === "counterAdded" && e.counterType === counterType);
const inPlay = (state: GameState, card: AnyCard): boolean => cardsInPlay(state).includes(idOf(state, card));
/** The resolved defeats in the log, as `[defeated card, the cards listed as having entered play since]`. */
const defeats = (state: GameState, events: readonly GameEvent[]) =>
  events.flatMap((e) =>
    e.type === "triggerEvent" && e.phase === "resolved" && e.event.kind === "characterDefeated"
      ? [[state.instances[e.event.instanceId]?.cardId, e.event.enteredPlaySince ?? []]]
      : [],
  );

describe("a card revealed by a When Defeated does not answer that defeat (RRG 1.8 p. 45, p. 38; answer 43B)", () => {
  it("the side scheme is in play when the defeat's response window opens, and does not respond; a card in play all along does", () => {
    const { state, events, session } = play(withInPlay(game([BRAWL], [WITCH, GRUNT]), VIGIL), ZAP_WITCH);
    const brawl = idOf(state, BRAWL);
    expect(state.villainArea).toContain(brawl);
    expect(inPlay(state, WITCH)).toBe(false);
    expect(counted(state, "vigil")).toBe(1);
    expect(counted(state, "brawl")).toBe(0);
    // The log says why: the defeat lists the card that came into play after it.
    expect(defeats(state, events)).toEqual([[WITCH.id, [brawl]]]);
    expect(state.stack).toEqual([]);
    const replayed = replay(session.log, deps);
    expect(replayed.ok && replayed.state).toEqual(session.state);
  });

  it("its own reveal is untouched: it enters play with its threat and answers its own entering", () => {
    const { state } = play(game([BRAWL], [WITCH]), ZAP_WITCH);
    expect(mustInstance(state, idOf(state, BRAWL)).threat).toBe(3);
    expect(counted(state, "brawl-entered")).toBe(1);
  });

  it("it answers the next defeat, which it was in play for", () => {
    const first = play(game([BRAWL], [WITCH, GRUNT]), ZAP_WITCH).state;
    expect(counted(first, "brawl")).toBe(0);
    const { state, events } = play(first, ZAP_GRUNT);
    expect(counted(state, "brawl")).toBe(1);
    expect(defeats(state, events)).toEqual([[GRUNT.id, []]]);
  });

  it("control: already in play when the minion is defeated, it answers", () => {
    const planted = play(game([BRAWL], [WITCH]), PLANT).state;
    expect(planted.villainArea).toContain(idOf(planted, BRAWL));
    const { state, events } = play(planted, ZAP_WITCH);
    expect(counted(state, "brawl")).toBe(1);
    expect(defeats(state, events)).toEqual([[WITCH.id, []]]);
  });

  it("two minions defeated together, one of which reveals it: it answers neither defeat", () => {
    const { state } = play(withInPlay(game([BRAWL], [WITCH, GRUNT]), VIGIL), ZAP_ALL);
    expect(inPlay(state, WITCH) || inPlay(state, GRUNT)).toBe(false);
    expect(state.villainArea).toContain(idOf(state, BRAWL));
    expect(counted(state, "vigil")).toBe(2);
    expect(counted(state, "brawl")).toBe(0);
    expect(state.stack).toEqual([]);
  });

  it("'after a character attacks' answers the finished attack (RRG p. 9, step 6): revealed while it resolved, it responds to the attack and not to the defeat", () => {
    const { state, events } = play(game([BRAWL], [WITCH]), STRIKE);
    expect(state.villainArea).toContain(idOf(state, BRAWL));
    expect(counted(state, "brawl")).toBe(0);
    expect(counted(state, "brawl-attack")).toBe(1);
    expect(marked(events, "brawl-entered")).toBeLessThan(marked(events, "brawl-attack"));
  });
});

describe("a card put into play around a defeat (answer 43B)", () => {
  it("by an interrupt, before the defeat occurred: it was in play for it and answers", () => {
    const start = withInHand(withInPlay(game([], [GRUNT]), HERALD), LATE);
    const { state, events } = play(start, ZAP_GRUNT);
    expect(inPlay(state, LATE)).toBe(true);
    expect(counted(state, "late")).toBe(1);
    expect(defeats(state, events)).toEqual([[GRUNT.id, []]]);
  });

  it("by a response to the defeat: it did not see the defeat, and the open window does not offer it", () => {
    const start = withInHand(withInPlay(game([], [GRUNT, THUG]), USHER), LATE);
    const { state, session } = play(start, ZAP_GRUNT);
    expect(counted(state, "usher")).toBe(1);
    expect(inPlay(state, LATE)).toBe(true);
    expect(counted(state, "late")).toBe(0);
    expect(state.stack).toEqual([]);
    const replayed = replay(session.log, deps);
    expect(replayed.ok && replayed.state).toEqual(session.state);
    // The next defeat finds it in play.
    const next = play(state, ZAP_THUG).state;
    expect(counted(next, "late")).toBe(1);
  });
});

describe("a card's own entering play is its own occurrence (unchanged)", () => {
  it("an ally played from hand answers 'after this enters play' and 'after you play this'", () => {
    const { state } = play(game([]), PAL);
    expect(inPlay(state, PAL)).toBe(true);
    expect(counted(state, "pal-entered")).toBe(1);
    expect(counted(state, "pal-played")).toBe(1);
  });

  it("a revealed minion answers its own entering play, once its reveal has finished (RRG p. 38)", () => {
    const { state, events } = play(game([HERALDED]), SCOUT);
    expect(counted(state, "own")).toBe(1);
    expect(marked(events, "revealed")).toBeLessThan(marked(events, "own"));
  });

  it("a card that enters play with nothing pending is listed nowhere: the state carries no trace of the rule", () => {
    const { state, events } = play(game([]), PAL);
    expect(JSON.stringify(state)).not.toContain("enteredPlaySince");
    expect(JSON.stringify(events)).not.toContain("enteredPlaySince");
  });
});
