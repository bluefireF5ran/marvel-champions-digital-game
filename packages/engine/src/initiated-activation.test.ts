/**
 * A keyword's activation initiates as its minion engages and resolves its steps once the ability around it has
 * finished (`resolve/initiated-activation.ts`), proven with synthetic cards.
 *
 * FFG ruling January 11, 2024 - Ruling 137 (Planetary Invasion: quickstrike "initiat[es] its attack. (The steps of the
 * attack will then resolve at the next available opportunity.)"); ruling May 23, 2024 - Ruling 194 (Shadow of the
 * Past: "the attack resolves as soon as the ability that put her into play finishes"); teamwork shares the model,
 * ruling December 8, 2023 - Ruling 129 and February 15, 2024 - Ruling 147.
 */

import { flat, trait, type AbilityReference, type AnyCard, type CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps } from "./abilities.js";
import type { GameEvent } from "./events.js";
import { playerId, type InstanceId } from "./ids.js";
import { activeEncounterDeck, mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility, type StubAbility } from "./testing/abilities.js";
import { runCommandsPicking } from "./testing/drive.js";
import { stubEvent, stubMainScheme, stubMinion, stubTreachery, stubVillain } from "./testing/fixtures.js";
import { defaultPick, DEFAULT_DECK, giveCard, newGame, withEncounterPiles } from "./testing/scenario.js";

const p1 = playerId("p1");
const CREW = trait("CREW");
const you = { kind: "controller" } as const;
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

const VILLAIN = stubVillain({ id: "boss", stages: [{ hp: flat(30), atk: 0, sch: 0 }] });
const SCHEME = stubMainScheme({
  id: "calm",
  stages: [{ startingThreat: flat(0), targetThreat: flat(99), acceleration: flat(0) }],
});
const BLANK = stubTreachery({ id: "blank", boostIcons: 0 });
/** Quickstrike, ATK 2. */
const SENTRY = stubMinion({ id: "sentry", atk: 2, sch: 1, hp: 5, boostIcons: 0, keywords: [{ name: "quickstrike" }] });
/** Teamwork (CREW), ATK 1. */
const DECKHAND = stubMinion({
  id: "deckhand",
  traits: [CREW],
  atk: 1,
  sch: 1,
  hp: 5,
  boostIcons: 0,
  keywords: [{ name: "teamwork", sharedTrait: CREW }],
});
/** A CREW minion to stand beside it. */
const MATE = stubMinion({ id: "mate", traits: [CREW], atk: 0, sch: 0, hp: 5, boostIcons: 0 });

const putTopMinion: readonly EffectSpec[] = [
  {
    kind: "selectCards",
    slot: "m",
    cards: { kind: "encounter", zones: ["deck"], filter: { categories: ["minion"] } },
  },
  { kind: "putIntoPlay", card: { kind: "slot", slot: "m" }, controller: you },
];
/** "Put the top minion of the encounter deck into play engaged with you. (Then) leave a mark." */
const AMBUSH_THEN = stubEvent({
  id: "ambush-then",
  cost: 0,
  abilities: [
    ability("ambush-then.action", { trigger: { kind: "action" }, effects: [...putTopMinion, mark("after")] }),
  ],
});
/** "Put the top minion of the encounter deck into play engaged with you." Nothing after it. */
const AMBUSH = stubEvent({
  id: "ambush",
  cost: 0,
  abilities: [ability("ambush.action", { trigger: { kind: "action" }, effects: putTopMinion })],
});

const PLAYER_CARDS: readonly AnyCard[] = [AMBUSH_THEN, AMBUSH];
const deps: EngineDeps = depsOf(...abilities);

/** p1's turn in hero form, `top` the only minion in the encounter deck, `inPlay` engaged with p1. */
function game(top: AnyCard, inPlay: readonly AnyCard[] = []): GameState {
  const start = newGame({
    players: 1,
    villain: VILLAIN,
    mainScheme: SCHEME,
    deps,
    extraCards: [SENTRY, DECKHAND, MATE, ...PLAYER_CARDS, BLANK],
    encounterDeck: [top.id, ...inPlay.map((card) => card.id), ...copies(BLANK.id, 15)],
    deck: [...DEFAULT_DECK, ...PLAYER_CARDS.map((card) => card.id)],
  });
  let deck = [...activeEncounterDeck(start).deck];
  const take = (card: AnyCard): InstanceId => {
    const id = deck.find((i) => start.instances[i]?.cardId === card.id) as InstanceId;
    deck = deck.filter((i) => i !== id);
    return id;
  };
  const topId = take(top);
  const inPlayIds = inPlay.map(take);
  const surgery = withEncounterPiles(start, { deck: [topId, ...deck] });
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

const idOf = (state: GameState, card: AnyCard): InstanceId =>
  Object.values(state.instances).find((i) => i.cardId === card.id)?.instanceId as InstanceId;
const damageOn = (state: GameState): number => mustInstance(state, mustPlayer(state, p1).identity.instanceId).damage;
const marked = (events: readonly GameEvent[], counterType: string): number =>
  events.findIndex((e) => e.type === "counterAdded" && e.counterType === counterType);
const attack = (events: readonly GameEvent[], phase: "initiated" | "resolved", by: InstanceId): number =>
  events.findIndex(
    (e) =>
      e.type === "triggerEvent" &&
      e.phase === phase &&
      e.event.kind === "enemyAttack" &&
      e.event.enemyInstanceId === by,
  );
const firstDamage = (events: readonly GameEvent[]): number => events.findIndex((e) => e.type === "damageDealt");
const awaited = (events: readonly GameEvent[]) => events.filter((e) => e.type === "activationAwaitsAbility");

describe("a keyword's activation initiates now and resolves after the ability around it (rulings 137, 194)", () => {
  it("quickstrike: the attack initiates as the minion enters play, and its damage follows the ability's next effect", () => {
    const { state, events } = play(game(SENTRY), AMBUSH_THEN);
    const sentry = idOf(state, SENTRY);
    expect(damageOn(state)).toBe(2);
    expect(attack(events, "initiated", sentry)).toBeGreaterThanOrEqual(0);
    expect(attack(events, "initiated", sentry)).toBeLessThan(marked(events, "after"));
    expect(marked(events, "after")).toBeLessThan(firstDamage(events));
    expect(marked(events, "after")).toBeLessThan(attack(events, "resolved", sentry));
    expect(awaited(events)).toMatchObject([{ enemyInstanceId: sentry, activation: "attack" }]);
  });

  it("quickstrike: with nothing left of the ability after it, the attack resolves at once and waits for nothing", () => {
    const { state, events } = play(game(SENTRY), AMBUSH);
    expect(damageOn(state)).toBe(2);
    expect(awaited(events)).toEqual([]);
  });

  it("teamwork: the activation initiates as the minion enters play, and its damage follows the ability's next effect", () => {
    const { state, events } = play(game(DECKHAND, [MATE]), AMBUSH_THEN);
    const deckhand = idOf(state, DECKHAND);
    expect(damageOn(state)).toBe(1);
    expect(attack(events, "initiated", deckhand)).toBeGreaterThanOrEqual(0);
    expect(attack(events, "initiated", deckhand)).toBeLessThan(marked(events, "after"));
    expect(marked(events, "after")).toBeLessThan(firstDamage(events));
    expect(awaited(events)).toMatchObject([{ enemyInstanceId: deckhand, activation: "attack" }]);
  });
});
