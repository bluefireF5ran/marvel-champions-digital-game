/**
 * Shared scaffolding for docs/phase7-wave10-hero-packs.md H3.1 to H3.3: an identity that brings a separate deck of
 * encounter cards its player owns (Hercules's Labor deck) and a second one of player cards (his Gift deck), proven
 * with a synthetic "Taskmaster's apprentice" so the engine tests name no real card.
 *
 * The Task deck holds three cards, one copy each, all with the TASK trait and Victory 0:
 * - `TASK_BEAST`, an attachment with no "attach to" text. "Attached minion gets +6 hit points. When Revealed: Find a
 *   Big minion, reveal it and attach this card to it."
 * - `TASK_PLOT`, an attachment with no "attach to" text. "When Revealed: Find a side scheme, reveal it and attach this
 *   card to it."
 * - `TASK_WATCH`, an obligation. "Uses (3 labor counters)."
 *
 * The identity prints the deck's reveal ("Alter-Ego Action: If there is no Task card in play, reveal the top card of
 * the Task deck") and a handful of test actions that stand in for other cards' effects.
 */

import { flat, trait, type AnyCard, type CardId, type HeroIdentityCard } from "@mc/content";
import type { EngineDeps } from "../abilities.js";
import type { Command } from "../commands.js";
import type { GameEvent } from "../events.js";
import { playerId, type InstanceId, type PlayerId } from "../ids.js";
import { activeEncounterDeck, mustInstance, mustPlayer, separateDeckOf } from "../query.js";
import { createGame } from "../setup.js";
import type { CardSelector, EffectSpec, Predicate, TargetQuery, TargetRef } from "../spec.js";
import type { GameState } from "../state.js";
import { depsOf, stubAbility, type StubAbility } from "./abilities.js";
import { runCommands } from "./drive.js";
import {
  stubAttachment,
  stubIdentity,
  stubMainScheme,
  stubMinion,
  stubObligation,
  stubSideScheme,
  stubTreachery,
  stubUpgrade,
  stubVillain,
} from "./fixtures.js";
import { DEFAULT_CARDS, DEFAULT_DECK, HERO, withEncounterPiles } from "./scenario.js";

export const P1: PlayerId = playerId("p1");
export const P2: PlayerId = playerId("p2");
export const TASK = "Task";
export const BOON = "Boon";

const TASK_TRAIT = trait("TASK");
const BIG = trait("BIG");
const you = { kind: "controller" } as const;
const self: TargetRef = { kind: "self" };
const one = { kind: "const", value: 1 } as const;
const slot = (name: string): TargetRef => ({ kind: "slot", slot: name });
const each = (query: TargetQuery): TargetRef => ({ kind: "each", query });
/** The first card a find names (RRG 1.8 "Find", p. 19), bound to `name`. */
const findOne = (name: string, query: TargetQuery): EffectSpec => ({
  kind: "selectCards",
  slot: name,
  cards: { kind: "atMost", count: one, of: { kind: "ref", ref: { kind: "find", query } } },
});
const mainThreat = (value: number): EffectSpec => ({
  kind: "placeThreat",
  target: { kind: "mainScheme" },
  amount: { kind: "const", value },
});

const TASK_IN_PLAY: TargetQuery = { trait: TASK_TRAIT };
const taskTop: CardSelector = { kind: "separateDeck", player: you, name: TASK, top: one };
const canReveal: Predicate = {
  kind: "and",
  of: [
    { kind: "not", of: { kind: "exists", query: TASK_IN_PLAY } },
    {
      kind: "compare",
      left: { kind: "deckCount", player: you, separateDeck: TASK },
      op: "atLeast",
      right: one,
    },
  ],
};
const revealTop: readonly EffectSpec[] = [
  { kind: "selectCards", slot: "task", cards: taskTop },
  { kind: "revealCard", cards: slot("task"), player: you },
];

/** "Alter-Ego Action: If there is no Task card in play, reveal the top card of the Task deck." */
export const REVEAL = stubAbility("apprentice.reveal", {
  trigger: { kind: "action", form: "alterEgo", while: canReveal },
  effects: revealTop,
});
/** The same reveal as a Hero Action: no card prints it; it shows what a reveal does to a player in hero form. */
export const REVEAL_AS_HERO = stubAbility("apprentice.reveal-as-hero", {
  trigger: { kind: "action", form: "hero", while: canReveal },
  effects: revealTop,
});
const testAction = (id: string, effects: readonly EffectSpec[]): StubAbility =>
  stubAbility(`apprentice.${id}`, { trigger: { kind: "action" }, effects });
/** "Action: Discard each minion." */
export const DISCARD_MINIONS = testAction("discard-minions", [
  { kind: "discardFromPlay", target: each({ categories: ["minion"] }) },
]);
/** "Action: Discard each Task card." */
export const DISCARD_TASKS = testAction("discard-tasks", [{ kind: "discardFromPlay", target: each(TASK_IN_PLAY) }]);
/** "Action: Defeat each minion." */
export const DEFEAT_MINIONS = testAction("defeat-minions", [
  { kind: "defeat", target: each({ categories: ["minion"] }) },
]);
/** "Action: Remove 9 threat from each side scheme." */
export const CLEAR_SCHEMES = testAction("clear-schemes", [
  { kind: "removeThreat", target: each({ categories: ["sideScheme"] }), amount: { kind: "const", value: 9 } },
]);
/** "Action: Remove 1 labor counter from each Task card." */
export const SPEND_LABOR = testAction("spend-labor", [
  { kind: "removeCounters", target: each(TASK_IN_PLAY), counterType: "labor", amount: one },
]);
/** "Action: Exhaust each Task card." */
export const EXHAUST_TASKS = testAction("exhaust-tasks", [{ kind: "exhaust", target: each(TASK_IN_PLAY) }]);
/** "Action: Deal 99 damage to your identity." */
export const FALL = testAction("fall", [
  { kind: "dealDamage", target: { kind: "identityOf", player: you }, amount: { kind: "const", value: 99 } },
]);
const ACTIONS = [
  REVEAL,
  REVEAL_AS_HERO,
  DISCARD_MINIONS,
  DISCARD_TASKS,
  DEFEAT_MINIONS,
  CLEAR_SCHEMES,
  SPEND_LABOR,
  EXHAUST_TASKS,
  FALL,
];

/** "Attached minion gets +6 hit points." */
const BEAST_CONSTANT = stubAbility("task-beast.constant", {
  trigger: {
    kind: "constant",
    modifiers: [{ stat: "hp", amount: 6, target: { categories: ["minion"], hostOfSelf: true } }],
  },
  effects: [],
});
/**
 * "When Revealed: [if this card is in play, place 5 threat on the main scheme.] Find a Big minion, reveal it and attach
 * this card to it." The probe shows the card is out of play while its When Revealed resolves.
 */
const BEAST_REVEALED = stubAbility("task-beast.when-revealed", {
  trigger: { kind: "whenRevealed" },
  effects: [
    { kind: "if", condition: { kind: "exists", query: { self: true } }, then: [mainThreat(5)] },
    findOne("beast", { categories: ["minion"], trait: BIG }),
    { kind: "revealCard", cards: slot("beast"), player: you },
    { kind: "attach", card: self, to: slot("beast") },
  ],
});
/** "When Revealed: Find a side scheme, reveal it and attach this card to it." */
const PLOT_REVEALED = stubAbility("task-plot.when-revealed", {
  trigger: { kind: "whenRevealed" },
  effects: [
    findOne("plot", { categories: ["sideScheme"] }),
    { kind: "revealCard", cards: slot("plot"), player: you },
    { kind: "attach", card: self, to: slot("plot") },
  ],
});
/** "When Revealed: Place 1 threat on the main scheme." Resolved by the player who revealed it. */
const WATCH_REVEALED = stubAbility("task-watch.when-revealed", {
  trigger: { kind: "whenRevealed" },
  effects: [mainThreat(1)],
});

const VICTORY_0 = { name: "victory", value: 0 } as const;
export const TASK_BEAST: AnyCard = {
  ...stubAttachment({ id: "task-beast", keywords: [VICTORY_0], abilities: [BEAST_CONSTANT.ref, BEAST_REVEALED.ref] }),
  traits: [TASK_TRAIT],
  separateDeck: TASK,
};
export const TASK_PLOT: AnyCard = {
  ...stubAttachment({ id: "task-plot", keywords: [VICTORY_0], abilities: [PLOT_REVEALED.ref] }),
  traits: [TASK_TRAIT],
  separateDeck: TASK,
};
export const TASK_WATCH: AnyCard = {
  ...stubObligation({ id: "task-watch", boostIcons: 0, abilities: [WATCH_REVEALED.ref] }),
  traits: [TASK_TRAIT],
  keywords: [{ name: "uses", count: 3, counterType: "labor" }, VICTORY_0],
  separateDeck: TASK,
};
export const TASKS: readonly AnyCard[] = [TASK_BEAST, TASK_PLOT, TASK_WATCH];
export const BOONS: readonly AnyCard[] = ["lion", "shield", "sword"].map((name) => ({
  ...stubUpgrade({ id: `boon-${name}`, cost: 0 }),
  deckLimit: 0,
  separateDeck: BOON,
}));

export const APPRENTICE: HeroIdentityCard = {
  ...stubIdentity({
    id: "apprentice",
    hp: 14,
    atk: 3,
    thw: 1,
    def: 2,
    rec: 4,
    heroHandSize: 4,
    alterEgoHandSize: 6,
    heroAbilities: ACTIONS.map((a) => a.ref),
    alterEgoAbilities: ACTIONS.map((a) => a.ref),
  }),
  separateDecks: [
    {
      name: TASK,
      cardFamily: "encounter",
      cards: TASKS.map((card) => ({ cardId: card.id, quantity: 1 })),
      topCardFaceup: false,
      discardPile: "none",
      whenEmpty: "stayEmpty",
    },
    {
      name: BOON,
      cardFamily: "player",
      cards: BOONS.map((card) => ({ cardId: card.id, quantity: 1 })),
      topCardFaceup: false,
      discardPile: "none",
      whenEmpty: "stayEmpty",
    },
  ],
};

export const BLANK = stubTreachery({ id: "blank", boostIcons: 0 });
/** A Big minion of ATK 2, SCH 0 and 6 hit points. */
export const OGRE = stubMinion({ id: "ogre", atk: 2, sch: 0, hp: 6, boostIcons: 0, traits: [BIG] });
/** The same minion with quickstrike. */
export const SWIFT_OGRE = stubMinion({
  id: "swift-ogre",
  atk: 2,
  sch: 0,
  hp: 6,
  boostIcons: 0,
  traits: [BIG],
  keywords: [{ name: "quickstrike" }],
});
/** The same minion with surge. */
export const SURGING_OGRE = stubMinion({
  id: "surging-ogre",
  atk: 2,
  sch: 0,
  hp: 6,
  boostIcons: 0,
  traits: [BIG],
  keywords: [{ name: "surge" }],
});
export const PLOT = stubSideScheme({ id: "plot", startingThreat: 3, boostIcons: 0 });
const QUIET = stubVillain({ id: "quiet", stages: [{ hp: flat(50), atk: 0, sch: 0 }] });
const LONG = stubMainScheme({
  id: "long",
  stages: [{ startingThreat: flat(0), targetThreat: flat(99), acceleration: flat(0) }],
});

export const TASK_ABILITIES: readonly StubAbility[] = [
  ...ACTIONS,
  BEAST_CONSTANT,
  BEAST_REVEALED,
  PLOT_REVEALED,
  WATCH_REVEALED,
];
export const deps: EngineDeps = depsOf(...TASK_ABILITIES);
export const POOL: readonly AnyCard[] = [
  ...DEFAULT_CARDS,
  APPRENTICE,
  ...TASKS,
  ...BOONS,
  BLANK,
  OGRE,
  SWIFT_OGRE,
  SURGING_OGRE,
  PLOT,
  QUIET,
  LONG,
];

export interface TaskGame {
  /** Encounter cards besides the twelve blanks (a minion or a side scheme for a Task card to find). */
  readonly encounter?: readonly CardId[];
  /** A second seat with the default hero. */
  readonly twoPlayers?: boolean;
  readonly seed?: number;
}

/** The game as `createGame` leaves it, the apprentice in the first seat. */
export function createdTaskGame(options: TaskGame = {}) {
  const seats = [{ identityCardId: APPRENTICE.id, deck: DEFAULT_DECK }];
  const result = createGame(
    {
      seed: options.seed ?? 23,
      cards: POOL,
      villainCardId: QUIET.id,
      mainSchemeCardId: LONG.id,
      encounterDeck: [...Array.from({ length: 12 }, () => BLANK.id), ...(options.encounter ?? [])],
      includeIdentitySets: false,
      players: options.twoPlayers ? [...seats, { identityCardId: HERO.id, deck: DEFAULT_DECK }] : seats,
    },
    deps,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

export const taskDeck = (state: GameState): readonly InstanceId[] => separateDeckOf(state, P1, TASK).deck;
export const cardIdsOf = (state: GameState, ids: readonly InstanceId[]): CardId[] =>
  ids.map((id) => mustInstance(state, id).cardId);
/** The one instance of `card` in the game. */
export function only(state: GameState, card: AnyCard): InstanceId {
  const ids = (Object.keys(state.instances) as InstanceId[]).filter((id) => state.instances[id]?.cardId === card.id);
  if (ids.length !== 1) throw new Error(`${ids.length} copies of ${card.id}`);
  return ids[0] as InstanceId;
}

/**
 * The first player's first turn (alter-ego form), the Task deck in this order from the top and the encounter deck with
 * its blanks on top, so a deal never takes the card a Task is meant to find. Surgery before any session starts.
 */
export function taskGame(order: readonly AnyCard[], options: TaskGame = {}): GameState {
  const begun = runCommands(createdTaskGame(options).state, deps).state;
  const top = order.map((card) => only(begun, card));
  const rest = taskDeck(begun).filter((id) => !top.includes(id));
  const encounter = activeEncounterDeck(begun).deck;
  const blanks = encounter.filter((id) => begun.instances[id]?.cardId === BLANK.id);
  const others = encounter.filter((id) => begun.instances[id]?.cardId !== BLANK.id);
  const ordered: GameState = {
    ...begun,
    players: begun.players.map((p) =>
      p.playerId === P1
        ? { ...p, separateDecks: { ...p.separateDecks, [TASK]: { deck: [...top, ...rest], discard: [] } } }
        : p,
    ),
  };
  return withEncounterPiles(ordered, { deck: [...blanks, ...others] });
}

/** Surgery: the first seat in hero form, with its change of form still available. */
export const asHero = (state: GameState): GameState => ({
  ...state,
  players: state.players.map((p) =>
    p.playerId === P1 ? { ...p, identity: { ...p.identity, form: "hero", heroFormIndex: 0 } } : p,
  ),
});

/** One of the apprentice's actions, used by the first player. */
export const use = (state: GameState, ability: StubAbility): Command => ({
  type: "useAbility",
  playerId: P1,
  cardInstanceId: mustPlayer(state, P1).identity.instanceId,
  abilityId: ability.ref.id,
  payment: [],
});

export const ofType = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
/** The log entries that name this card as their `instanceId`, by type. */
export const storyOf = (events: readonly GameEvent[], id: InstanceId): string[] =>
  events.filter((e) => "instanceId" in e && e.instanceId === id).map((e) => e.type);
