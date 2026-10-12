/**
 * docs/phase7-wave10-hero-packs.md H3.7: a leaves-play trigger that asks where the card went ("After a labor card is
 * added to the victory display", Hercules 59001a). `EventPattern.eventIs: { to }` reads `TriggerEvent
 * cardLeavesPlay.to`. Synthetic cards only (`testing/owned-encounter-deck.ts`).
 *
 * RRG 1.8 "Victory X" (p. 46): "An attachment or upgrade with the victory X keyword is placed in the victory display
 * when the card to which it is attached is defeated"; "A card with both the victory X and uses (X 'type') keywords is
 * placed in the victory display when its last all-purpose counter is removed from it."
 */

import { trait } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import { mustInstance, mustPlayer } from "./query.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility, type StubAbility } from "./testing/abilities.js";
import { runCommands } from "./testing/drive.js";
import {
  CLEAR_SCHEMES,
  DEFEAT_MINIONS,
  DISCARD_MINIONS,
  DISCARD_TASKS,
  OGRE,
  P1,
  PLOT,
  REVEAL,
  SPEND_LABOR,
  TASK_ABILITIES,
  TASK_BEAST,
  TASK_PLOT,
  TASK_WATCH,
  asHero,
  only,
  taskGame,
  use,
} from "./testing/owned-encounter-deck.js";

const TASK_CARD = { trait: trait("TASK") };
const mainThreat = (value: number) =>
  ({ kind: "placeThreat", target: { kind: "mainScheme" }, amount: { kind: "const", value } }) as const;

/** "Forced Response: After a Task card is added to the victory display, place 1 threat on the main scheme." */
const ADDED_TO_VICTORY = stubAbility("apprentice.added-to-victory", {
  trigger: {
    kind: "response",
    forced: true,
    on: { on: "cardLeavesPlay", targetIs: TASK_CARD, eventIs: { to: "victoryDisplay" } },
  },
  effects: [mainThreat(1)],
});
/**
 * "Forced Response: After a Task card is discarded from play, place 10 threat on the main scheme." A card of a deck
 * with no discard pile is discarded and then placed on the bottom of its deck (RRG 1.8 p. 65; H3.3, question 3 = B):
 * the event's `to` is the pile it was discarded to, and the return is the move's own replacement, logged
 * `returnedToSeparateDeck`.
 */
const RETURNED = stubAbility("apprentice.returned", {
  trigger: {
    kind: "response",
    forced: true,
    on: { on: "cardLeavesPlay", targetIs: TASK_CARD, eventIs: { to: ["separateDiscard", "encounterDiscard"] } },
  },
  effects: [mainThreat(10)],
});
/** "Forced Response: After a Task card leaves play, place 100 threat on the main scheme." (no destination asked) */
const LEFT = stubAbility("apprentice.left", {
  trigger: { kind: "response", forced: true, on: { on: "cardLeavesPlay", targetIs: TASK_CARD } },
  effects: [mainThreat(100)],
});
/** The victory display one again, on the hero face only. */
const HERO_ONLY = stubAbility("apprentice.added-to-victory-hero", {
  trigger: {
    kind: "response",
    forced: true,
    form: "hero",
    on: { on: "cardLeavesPlay", targetIs: TASK_CARD, eventIs: { to: "victoryDisplay" } },
  },
  effects: [mainThreat(1)],
});

/** Surgery on the card pool: the apprentice also prints `abilities` on both faces. */
function withAbilities(state: GameState, abilities: readonly StubAbility[]): GameState {
  const id = mustPlayer(state, P1).identity.cardId;
  const card = state.cardPool[id];
  if (card?.type !== "hero_identity") throw new Error("no identity card");
  const refs = abilities.map((a) => a.ref);
  const hero = { ...card.hero, abilities: [...card.hero.abilities, ...refs] };
  const alterEgo = { ...card.alterEgo, abilities: [...card.alterEgo.abilities, ...refs] };
  return { ...state, cardPool: { ...state.cardPool, [id]: { ...card, hero, alterEgo } } };
}

const ALL = [ADDED_TO_VICTORY, RETURNED, LEFT];
const deps: EngineDeps = depsOf(...TASK_ABILITIES, ...ALL, HERO_ONLY);
const mainSchemeThreat = (state: GameState): number => mustInstance(state, state.mainScheme.instanceId).threat;

describe("H3.7 a leaves-play trigger with a destination", () => {
  it("a Victory attachment whose minion is defeated is heard as added to the victory display (1 + 100, not 10)", () => {
    const start = withAbilities(taskGame([TASK_BEAST, TASK_WATCH, TASK_PLOT], { encounter: [OGRE.id] }), ALL);
    const attached = runCommands(start, deps, use(start, REVEAL)).state;
    expect(mainSchemeThreat(attached)).toBe(0);
    const { state } = runCommands(attached, deps, use(attached, DEFEAT_MINIONS));
    expect(state.victoryDisplay).toEqual([only(state, TASK_BEAST)]);
    expect(mainSchemeThreat(state)).toBe(101);
  });

  it("the same attachment whose minion is discarded goes to its deck: the victory display trigger is silent (10 + 100)", () => {
    const start = withAbilities(taskGame([TASK_BEAST, TASK_WATCH, TASK_PLOT], { encounter: [OGRE.id] }), ALL);
    const attached = runCommands(start, deps, use(start, REVEAL)).state;
    const { state } = runCommands(attached, deps, use(attached, DISCARD_MINIONS));
    expect(state.victoryDisplay).toEqual([]);
    expect(mainSchemeThreat(state)).toBe(110);
  });

  it("a Victory attachment whose side scheme is defeated is heard (1 + 100)", () => {
    const start = withAbilities(taskGame([TASK_PLOT, TASK_WATCH, TASK_BEAST], { encounter: [PLOT.id] }), ALL);
    const attached = runCommands(start, deps, use(start, REVEAL)).state;
    const { state } = runCommands(attached, deps, use(attached, CLEAR_SCHEMES));
    expect(state.victoryDisplay).toEqual([only(state, TASK_PLOT)]);
    expect(mainSchemeThreat(state)).toBe(101);
  });

  it("a Victory uses card is heard when its last counter goes, not before (0, 0, then 1 + 100)", () => {
    const start = withAbilities(taskGame([TASK_WATCH, TASK_BEAST, TASK_PLOT]), ALL);
    let state = runCommands(start, deps, use(start, REVEAL)).state;
    // The obligation's own When Revealed placed 1.
    expect(mainSchemeThreat(state)).toBe(1);
    for (const _left of [2, 1]) {
      state = runCommands(state, deps, use(state, SPEND_LABOR)).state;
      expect(mainSchemeThreat(state)).toBe(1);
    }
    state = runCommands(state, deps, use(state, SPEND_LABOR)).state;
    expect(state.victoryDisplay).toEqual([only(state, TASK_WATCH)]);
    expect(mainSchemeThreat(state)).toBe(102);
  });

  it("the obligation discarded by a card effect goes to its deck: silent (1 + 10 + 100)", () => {
    const start = withAbilities(taskGame([TASK_WATCH, TASK_BEAST, TASK_PLOT]), ALL);
    const inPlay = runCommands(start, deps, use(start, REVEAL)).state;
    const { state } = runCommands(inPlay, deps, use(inPlay, DISCARD_TASKS));
    expect(state.victoryDisplay).toEqual([]);
    expect(mainSchemeThreat(state)).toBe(111);
  });

  it("on a hero face only: heard in hero form (1), not in alter-ego form (0)", () => {
    const start = withAbilities(taskGame([TASK_BEAST, TASK_WATCH, TASK_PLOT], { encounter: [OGRE.id] }), [HERO_ONLY]);
    const attached = runCommands(start, deps, use(start, REVEAL)).state;
    const asAlterEgo = runCommands(attached, deps, use(attached, DEFEAT_MINIONS)).state;
    expect(asAlterEgo.victoryDisplay).toHaveLength(1);
    expect(mainSchemeThreat(asAlterEgo)).toBe(0);
    const hero = asHero(attached);
    const asHeroForm = runCommands(hero, deps, use(hero, DEFEAT_MINIONS)).state;
    expect(asHeroForm.victoryDisplay).toHaveLength(1);
    expect(mainSchemeThreat(asHeroForm)).toBe(1);
  });
});
