/**
 * A hero's identity card in play as a minion (Reluctant Foe 50171, Baron Zemo; MC50 p. 22): the Board draws it as a
 * minion tile in the engaged player's row, from the hero side, and Inspect says what is going on. The state is a real
 * Zemo game with Reluctant Foe dealt in round 1 and Captain Marvel chosen from the collection, played on the engine's own
 * commands; nothing here works out a stat or a rule.
 */
import { describe, expect, test } from "vitest";
import { activeEncounterDeck, activeEncounterDeckId, type GameState, type InstanceId } from "@mc/engine";
import { CARDS_BY_ID, POOL_DEPS } from "../content/pool.js";
import { DevStateHost } from "../engine/dev-state-host.js";
import { LocalEngineHost } from "../engine/local-host.js";
import { nextTurn } from "../store/dev-game-steps.js";
import { zemoFixtureState } from "../store/dev-zemo-game.js";
import { SessionStore } from "../store/session-store.js";
import { boardModel } from "./board-model.js";
import {
  collectionGrid,
  collectionPage,
  collectionPages,
  collectionRows,
  collectionSlots,
} from "./collection-search.js";
import { inspectModel } from "./inspect-model.js";
import { placementNotes } from "./inspect-notes.js";

const CAPTAIN_MARVEL = "01010a";

/** A Zemo game whose second encounter card is Reluctant Foe, played through the villain phase to the collection search. */
async function foeGame() {
  const { config, state } = await zemoFixtureState(new SessionStore(new LocalEngineHost()));
  const piles = activeEncounterDeck(state);
  const foe = [...piles.deck, ...piles.discard].find((id) => state.instances[id]!.cardId === "50171")!;
  const rest = piles.deck.filter((id) => id !== foe);
  const staged: GameState = {
    ...state,
    encounterDecks: {
      ...state.encounterDecks,
      [activeEncounterDeckId(state)]: {
        deck: [rest[0]!, foe, ...rest.slice(1)],
        discard: piles.discard.filter((id) => id !== foe),
      },
    },
  };
  const store = new SessionStore(new DevStateHost(staged, POOL_DEPS));
  await store.start(config);
  const turn = await nextTurn(store);
  await store.dispatch(turn!.legal.find((entry) => entry.action.kind === "endTurn")!.example);
  for (let guard = 0; guard < 30 && store.state.game!.pendingChoice?.prompt.kind !== "searchCollection"; guard++) {
    const choice = store.state.game!.pendingChoice;
    if (!choice) throw new Error("the search never opened");
    await store.resolveChoice(choice.options.slice(0, choice.minSelections).map((option) => option.optionId));
  }
  return { store, foe: foe as InstanceId };
}

describe("the collection search Reluctant Foe opens", () => {
  test("every option is a hero's identity card, shown by its hero side, two Black Panthers told apart by name", async () => {
    const { store } = await foeGame();
    const choice = store.state.game!.pendingChoice!;
    const rows = collectionRows(choice, (id) => CARDS_BY_ID.get(id))!;
    expect(rows).toHaveLength(choice.options.length);
    expect(rows.length).toBeGreaterThan(40);
    for (const row of rows) {
      expect(CARDS_BY_ID.get(row.cardId)?.type).toBe("hero_identity");
      expect(row.face).toEqual({ kind: "hero" });
      expect(row.name.length).toBeGreaterThan(0);
    }
    const names = rows.map((row) => row.name);
    expect(names).toContain("Black Panther (T'Challa)");
    expect(names).toContain("Black Panther (Shuri)");
    expect(new Set(names).size).toBe(names.length);
    expect(rows.find((row) => row.cardId === CAPTAIN_MARVEL)?.name).toBe("Captain Marvel");
  }, 120_000);

  test("a prompt that is not a collection search of cards is not drawn as one", async () => {
    const { store } = await foeGame();
    const choice = store.state.game!.pendingChoice!;
    expect(
      collectionRows({ ...choice, prompt: { kind: "chooseCards" } as never }, (id) => CARDS_BY_ID.get(id)),
    ).toBeNull();
    expect(collectionRows({ ...choice, options: [] }, (id) => CARDS_BY_ID.get(id))).toBeNull();
  }, 120_000);
});

describe("collection pages", () => {
  const area = { x: 0, y: 0, width: 1016, height: 372 };

  test("a desktop sheet holds a screen of cards per page, none narrower than a readable scan", () => {
    const grid = collectionGrid(area);
    expect(grid.perPage).toBeGreaterThanOrEqual(18);
    expect(grid.tile.width).toBeGreaterThanOrEqual(96);
    expect(grid.cols * grid.tile.width + 6 * (grid.cols - 1)).toBeLessThanOrEqual(area.width);
    expect(grid.rows * grid.tile.height + 6 * (grid.rows - 1)).toBeLessThanOrEqual(area.height);
    expect(collectionPages(59, grid.perPage)).toBeLessThanOrEqual(4);
  });

  test("a tiny area still gets a one-tile page, and an empty list one page", () => {
    expect(collectionGrid({ x: 0, y: 0, width: 50, height: 60 }).perPage).toBe(1);
    expect(collectionPages(0, 20)).toBe(1);
  });

  test("pages are clamped, cover every row once, and slots stay inside the area", () => {
    const rows = Array.from({ length: 59 }, (_unused, index) => index);
    const grid = collectionGrid(area);
    const pages = collectionPages(rows.length, grid.perPage);
    const seen = Array.from({ length: pages }, (_unused, page) => collectionPage(rows, page, grid.perPage).rows).flat();
    expect(seen).toEqual(rows);
    expect(collectionPage(rows, 99, grid.perPage).page).toBe(pages - 1);
    expect(collectionPage(rows, -3, grid.perPage).page).toBe(0);
    const last = collectionPage(rows, pages - 1, grid.perPage).rows;
    for (const slot of collectionSlots(area, grid, last.length)) {
      expect(slot.x).toBeGreaterThanOrEqual(area.x);
      expect(slot.x + slot.width).toBeLessThanOrEqual(area.x + area.width + 0.5);
      expect(slot.y + slot.height).toBeLessThanOrEqual(area.y + area.height + 0.5);
    }
  });
});

describe("a hero in play as a minion", () => {
  test("is a minion tile engaged with the player: hero art, minion stats, traits, the Villainous tag, Reluctant Foe attached", async () => {
    const { store, foe } = await foeGame();
    await store.resolveChoice([CAPTAIN_MARVEL]);
    const game = store.state.game!;
    const me = store.state.perspectiveId!;
    const model = boardModel(game, me, POOL_DEPS);
    const tile = model.minions.find((minion) => minion.name === "Captain Marvel");
    expect(tile).toBeDefined();
    expect(tile!.engagedWith).toBe(me);
    expect(tile!.heldBy).toBeNull();
    expect(tile!.subtitle).toBe("Minion (treated as)");
    // The hero side's scan, not the alter ego's.
    expect(tile!.art?.key).toContain("01010a");
    // The engine's own profile: ATK and SCH from the hero side, its hit points.
    expect(Object.fromEntries(tile!.stats.map((stat) => [stat.label, stat.value]))).toEqual({
      ATK: "2",
      SCH: "2",
      HP: "12/12",
    });
    expect(tile!.hp).toEqual({ current: 12, max: 12 });
    expect(tile!.traits).toEqual(expect.arrayContaining(["ELITE", "AVENGER", "SOLDIER"]));
    expect(tile!.keywords).toContain("villainous");
    // Not on the scan, so it is a tag of its own.
    expect(tile!.grantedKeywords).toContain("villainous");
    expect(tile!.attachments.map((attachment) => attachment.instanceId)).toEqual([foe]);
    expect(tile!.attachments[0]!.name).toBe("Reluctant Foe");
    // The seat's own identity is the hero it plays, not this card.
    expect(game.players.some((seat) => seat.identity.instanceId === tile!.instanceId)).toBe(false);
  }, 120_000);

  test("Inspect shows the hero side with a note that Reluctant Foe is treating it as a minion", async () => {
    const { store, foe } = await foeGame();
    await store.resolveChoice([CAPTAIN_MARVEL]);
    const game = store.state.game!;
    const hero = Object.values(game.instances).find((instance) => instance.treatedAs?.kind === "minion")!.instanceId;
    expect(placementNotes(game, hero)).toEqual([
      "Treated as a minion by Reluctant Foe: no player controls it, and its printed text does not apply",
    ]);
    const model = inspectModel(game, hero, store.state.legal?.actions ?? null, store.state.perspectiveId!, POOL_DEPS);
    expect(model.art?.key).toContain("01010a");
    expect(model.areaNotes.join(" ")).toContain("Treated as a minion by Reluctant Foe");
    // The attachment reads as itself, with no such note.
    expect(placementNotes(game, foe)).toEqual([]);
  }, 120_000);
});
