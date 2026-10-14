/**
 * Staging shared by the DSL tests of Hercules's Labor deck (docs/phase7-wave10-hero-packs.md H3.2, H3.3): a real
 * Hercules game against Core's Rhino (`herculesGame`), with the scripts those tests need registered on top of
 * `WAVE10_DEPS`. The pack's own modules (`../wave10/hercules/hercules/`) are scripted elsewhere; these are the shortest
 * scripts that exercise the engine pieces, not the cards' finished text (Embody Pathos's per player reading, Protect
 * Humanity's Forced Interrupt and Defeat the Hydra's damage rule are other engine tasks).
 */

import { trait } from "@mc/content";
import {
  applyCommand,
  separateDeckOf,
  type AbilityDefinition,
  type Command,
  type EngineDeps,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import {
  action,
  allOf,
  alterEgoAction,
  attachCard,
  atMost,
  cards,
  chosen,
  each,
  exists,
  heal,
  not,
  putIntoPlay,
  query,
  removeCountersFrom,
  revealCard,
  revealTopOfSeparateDeck,
  selectCards,
  self,
  separateDeckCountOf,
  shuffleDeck,
  valueAtLeast,
  whenRevealed,
  you,
} from "./index.js";
import { P1, firstLegal, identityOf, playerOf, type Picker } from "../testing/harness.js";
import { codeOf } from "../wave9/testing.js";
import { WAVE10_DEPS, herculesGame } from "../wave10/testing.js";

export const LABOR = "Labor";
export const GIFT = "Gift";
export const DEFEAT_THE_HYDRA = "59002";
export const EMBODY_PATHOS = "59003";
export const PROTECT_HUMANITY = "59004";
export const AMADEUS_CHO = "59008";
export const LERNEAN_HYDRA = "59037";
export const NEW_LABORS = "59001b.new-labors-of-hercules";

const LABOR_TRAIT = trait("LABOR");
const ELITE = trait("ELITE");

/** "If there is no labor card in play": a card in play with the Labor trait. A revealed card waiting is not in play. */
export const noLaborInPlay = not(exists(query([], { trait: LABOR_TRAIT })));

/**
 * The scripts. `HYDRA_TARGET`: "a non-Elite minion with at least 6 printed hit points", wherever a find looks.
 * The attachments' constants are their hit point and threat halves only.
 */
const HYDRA_TARGET = query("minion", { withoutTrait: ELITE, not: { maxPrintedHp: 5 } });
export const LABOR_SCRIPTS: Readonly<Record<string, AbilityDefinition>> = {
  // New Labors of Hercules — Action: If there is no labor card in play, reveal the top card of the labor deck.
  [NEW_LABORS]: alterEgoAction(
    { while: allOf(noLaborInPlay, valueAtLeast(separateDeckCountOf(LABOR), 1)) },
    revealTopOfSeparateDeck(LABOR),
  ),
  // When Revealed: Find a non-Elite minion with at least 6 printed hit points. Reveal it, heal all damage from it,
  // and attach this card to it.
  "59002.when-revealed": whenRevealed(
    selectCards("minion", atMost(1, cards({ kind: "find", query: HYDRA_TARGET }))),
    revealCard(chosen("minion")),
    heal(99, chosen("minion")),
    attachCard(self, chosen("minion")),
  ),
  // Attached minion gets +6 hit points.
  "59002.defeat-the-hydra-constant": {
    trigger: {
      kind: "constant",
      modifiers: [{ stat: "hp", amount: 6, target: { categories: ["minion"], hostOfSelf: true } }],
    },
    effects: [],
  },
  // When Revealed: Find an encounter side scheme that is not in play and reveal it, and attach this card to it. (No
  // side scheme is in play in these games, so the first one a find names is out of play.)
  "59003.when-revealed": whenRevealed(
    selectCards("scheme", atMost(1, cards({ kind: "find", query: query("sideScheme") }))),
    revealCard(chosen("scheme")),
    attachCard(self, chosen("scheme")),
  ),
  // When Revealed: Find Amadeus Cho and put him into play.
  "59004.when-revealed": whenRevealed(
    selectCards("cho", atMost(1, cards({ kind: "find", query: { name: "Amadeus Cho" }, owner: you }))),
    putIntoPlay(chosen("cho")),
    shuffleDeck(),
  ),
};

/** Test-only player cards' actions, registered under ids no card prints; a test gives its identity the ability. */
export const DISCARD_MINIONS = "test.discard-each-minion";
export const DISCARD_LABORS = "test.discard-each-labor-card";
export const REMOVE_LABOR_COUNTER = "test.remove-labor-counter";
export const TEST_ACTIONS: Readonly<Record<string, AbilityDefinition>> = {
  // "Action: Discard each minion." (a "discard a minion" player card effect)
  [DISCARD_MINIONS]: action({ kind: "discardFromPlay", target: each(query("minion")) }),
  // "Action: Discard each Labor card." (a player card discarding the attachment or the obligation)
  [DISCARD_LABORS]: action({ kind: "discardFromPlay", target: each(query([], { trait: LABOR_TRAIT })) }),
  // "Action: Remove 1 labor counter from each Labor card." (the last half of Protect Humanity's Forced Interrupt)
  [REMOVE_LABOR_COUNTER]: action(removeCountersFrom(each(query([], { trait: LABOR_TRAIT })), "labor", 1)),
};

export const depsWith = (abilities: Readonly<Record<string, AbilityDefinition>>): EngineDeps => ({
  ...WAVE10_DEPS,
  abilities: { ...WAVE10_DEPS.abilities, ...abilities },
});
export const LABOR_DEPS: EngineDeps = depsWith({ ...LABOR_SCRIPTS, ...TEST_ACTIONS });

export const laborDeck = (state: GameState): readonly InstanceId[] => separateDeckOf(state, P1, LABOR).deck;
export const laborCodes = (state: GameState): string[] => laborDeck(state).map((id) => codeOf(state, id));

/** The game's one copy of `code`, wherever it is. */
export function theCard(state: GameState, code: string): InstanceId {
  const ids = (Object.keys(state.instances) as InstanceId[]).filter((id) => codeOf(state, id) === code);
  if (ids.length !== 1) throw new Error(`${ids.length} copies of ${code} in this game`);
  return ids[0] as InstanceId;
}

/** Surgery: the Labor deck in this order from the top (the three cards are one copy each). */
export function withLaborOrder(state: GameState, ...codes: readonly string[]): GameState {
  const deck = codes.map((code) => {
    const id = laborDeck(state).find((candidate) => codeOf(state, candidate) === code);
    if (!id) throw new Error(`${code} is not in the Labor deck`);
    return id;
  });
  const rest = laborDeck(state).filter((id) => !deck.includes(id));
  return {
    ...state,
    players: state.players.map((p) =>
      p.playerId === P1
        ? { ...p, separateDecks: { ...p.separateDecks, [LABOR]: { deck: [...deck, ...rest], discard: [] } } }
        : p,
    ),
  };
}

/**
 * Surgery on the game's card pool: Hercules's alter-ego also prints the test actions (`TEST_ACTIONS`), so a test can
 * discard a minion or a Labor card "by a player card effect" with a real `useAbility`.
 */
function withTestActions(state: GameState): GameState {
  const identityCardId = playerOf(state, P1).identity.cardId;
  const identity = state.cardPool[identityCardId];
  if (identity?.type !== "hero_identity") throw new Error("no identity card");
  const refs = Object.keys(TEST_ACTIONS).map((id) => ({ id: id as never }));
  const withRefs = {
    ...identity,
    alterEgo: { ...identity.alterEgo, abilities: [...identity.alterEgo.abilities, ...refs] },
  };
  return { ...state, cardPool: { ...state.cardPool, [identityCardId]: withRefs } };
}

/** A Hercules game at his first turn, in alter-ego form, the Labor deck in this order from the top. */
export const laborGame = (...order: readonly string[]): GameState =>
  withTestActions(withLaborOrder(herculesGame({ deps: LABOR_DEPS }), ...order));

/** One of the test actions (`DISCARD_MINIONS`, `DISCARD_LABORS`), used by the Hercules player in alter-ego form. */
export const testAction = (state: GameState, ability: string): Command => ({
  type: "useAbility",
  playerId: P1,
  cardInstanceId: identityOf(state, P1),
  abilityId: ability as never,
  payment: [],
});

export interface Driven {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/** Applies `command` and answers every choice it raises with `pick`, collecting the events. Throws on a refusal. */
export function drive(state: GameState, command: Command, pick: Picker = firstLegal, deps = LABOR_DEPS): Driven {
  const first = applyCommand(state, command, deps);
  if (!first.ok) throw new Error(`${command.type} rejected: ${first.error.code}: ${first.error.message}`);
  let current = first.state;
  const events: GameEvent[] = [...first.events];
  for (let guard = 0; current.pendingChoice && !current.outcome; guard++) {
    if (guard > 200) throw new Error(`choices did not settle (stuck on ${current.pendingChoice.prompt.kind})`);
    const choice = current.pendingChoice;
    const next = applyCommand(
      current,
      {
        type: "resolveChoice",
        playerId: choice.playerId,
        choiceId: choice.choiceId,
        selectedOptionIds: pick(current),
      },
      deps,
    );
    if (!next.ok) throw new Error(`choice rejected: ${next.error.code}: ${next.error.message}`);
    current = next.state;
    events.push(...next.events);
  }
  return { state: current, events };
}

/** "New Labors of Hercules", used by the Hercules player. */
export const newLabors = (state: GameState): Command => ({
  type: "useAbility",
  playerId: P1,
  cardInstanceId: identityOf(state, P1),
  abilityId: NEW_LABORS as never,
  payment: [],
});

/** Whether the engine accepts New Labors of Hercules right now, and the refusal's code when it does not. */
export function newLaborsVerdict(state: GameState, deps = LABOR_DEPS): string {
  const result = applyCommand(state, newLabors(state), deps);
  return result.ok ? "ok" : result.error.code;
}

export function ofType<T extends GameEvent["type"]>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

export const inPlayArea = (state: GameState, id: InstanceId): boolean => playerOf(state, P1).playArea.includes(id);
