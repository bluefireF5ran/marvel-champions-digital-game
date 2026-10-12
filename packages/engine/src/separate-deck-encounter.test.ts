/**
 * docs/phase7-wave10-hero-packs.md H3.1: an identity's separate deck of encounter cards, built at setup and owned by its
 * player (Hercules's Labor deck), beside a second deck of player cards (his Gift deck). Synthetic cards only
 * (`testing/owned-encounter-deck.ts`).
 *
 * Sources: the Hercules Hero Pack insert, "The Gift and Labor Decks" ("shuffle the three GIFT cards together to form
 * the GIFT deck and the three LABOR cards to form the LABOR deck. Then, place both of these decks facedown in your play
 * area"); RRG 1.8 "Deck" (p. 15: "Certain identities or scenarios may add other decks to the game"); RRG 1.8
 * "Ownership and Control" (p. 31: "A card's owner is the player whose deck contained the card at the start of
 * setup"); RRG 1.8 "Player Elimination" (p. 34, step 4: "each card owned by the eliminated player" leaves the game
 * with them); RRG 1.8 "End of Player Phase" step 3 ("Ready each exhausted encounter card").
 */

import type { HeroIdentityCard } from "@mc/content";
import { describe, expect, it } from "vitest";
import { validateDeck } from "./deck.js";
import { replay } from "./engine.js";
import {
  activeEncounterDeck,
  isOwnedEncounterCard,
  locateCard,
  maxHitPoints,
  mustInstance,
  mustPlayer,
  playerCardOwnerOf,
  separateDeckOf,
} from "./query.js";
import { canHaveAttached } from "./rules.js";
import { cardsInPlay, controllerOf, isPlayerCard } from "./select.js";
import { createGame } from "./setup.js";
import { runCommands } from "./testing/drive.js";
import {
  APPRENTICE,
  BOON,
  BOONS,
  EXHAUST_TASKS,
  FALL,
  OGRE,
  P1,
  P2,
  POOL,
  REVEAL,
  TASK,
  TASKS,
  TASK_BEAST,
  TASK_WATCH,
  cardIdsOf,
  createdTaskGame,
  deps,
  ofType,
  only,
  taskDeck,
  taskGame,
  use,
} from "./testing/owned-encounter-deck.js";
import { DEFAULT_DECK } from "./testing/scenario.js";
import { faceVisible } from "./visibility.js";

const sorted = (ids: readonly string[]) => [...ids].sort();

describe("H3.1 an identity's separate deck of encounter cards, built at setup", () => {
  it("builds both decks: three Task cards its player owns and nobody controls, three Boon cards that are the player's", () => {
    const { state, events } = createdTaskGame();
    const task = separateDeckOf(state, P1, TASK);
    const boon = separateDeckOf(state, P1, BOON);
    expect(sorted(cardIdsOf(state, task.deck))).toEqual(sorted(TASKS.map((c) => c.id)));
    expect(sorted(cardIdsOf(state, boon.deck))).toEqual(sorted(BOONS.map((c) => c.id)));
    expect(task.discard).toEqual([]);
    expect(boon.discard).toEqual([]);
    for (const id of task.deck) {
      expect(mustInstance(state, id)).toMatchObject({
        ownerId: P1,
        controllerId: null,
        faceup: false,
        home: { kind: "separateDeck", name: TASK },
      });
      expect(locateCard(state, id)).toEqual({ kind: "separateDeck", playerId: P1, name: TASK });
      expect(isOwnedEncounterCard(state, id)).toBe(true);
      expect(playerCardOwnerOf(state, id)).toBeNull();
      expect(isPlayerCard(state, id)).toBe(false);
      expect(controllerOf(state, id)).toBeNull();
    }
    for (const id of boon.deck) {
      expect(mustInstance(state, id)).toMatchObject({ ownerId: P1, controllerId: P1, faceup: false });
      expect(isOwnedEncounterCard(state, id)).toBe(false);
      expect(playerCardOwnerOf(state, id)).toBe(P1);
      expect(isPlayerCard(state, id)).toBe(true);
    }
    // Each deck is shuffled by the seed, once, at setup.
    const shuffled = events.flatMap((e) =>
      e.type === "deckShuffled" && e.zone.kind === "separateDeck" ? [e.zone.name] : [],
    );
    expect(sorted(shuffled)).toEqual([BOON, TASK]);
  });

  it("the decks are apart from everything else: the player deck, the hand and the encounter deck hold none of the six", () => {
    const state = runCommands(createdTaskGame().state, deps).state;
    const player = mustPlayer(state, P1);
    const six = new Set([...TASKS, ...BOONS].map((c) => c.id));
    const elsewhere = [
      ...player.deck,
      ...player.hand,
      ...player.discard,
      ...activeEncounterDeck(state).deck,
      ...activeEncounterDeck(state).discard,
    ];
    expect(cardIdsOf(state, elsewhere).filter((id) => six.has(id))).toEqual([]);
    // The alter-ego hand of 6 comes out of the player deck alone.
    expect(player.hand).toHaveLength(6);
    expect(player.hand.length + player.deck.length).toBe(DEFAULT_DECK.length);
    expect(taskDeck(state)).toHaveLength(3);
    expect(separateDeckOf(state, P1, BOON).deck).toHaveLength(3);
  });

  it("no viewer sees a card of either deck: not the table, not its owner, not another player", () => {
    const state = runCommands(createdTaskGame({ twoPlayers: true }).state, deps).state;
    for (const id of [...taskDeck(state), ...separateDeckOf(state, P1, BOON).deck]) {
      expect(faceVisible(state, id)).toBe(false);
      expect(faceVisible(state, id, { deps })).toBe(false);
      expect(faceVisible(state, id, { viewer: P1, deps })).toBe(false);
      expect(faceVisible(state, id, { viewer: P2, deps })).toBe(false);
    }
  });

  it("validateDeck accepts the identity, refuses a Task card in a decklist, and reports a deck whose data is wrong", () => {
    const codes = (verdict: ReturnType<typeof validateDeck>) => (verdict.ok ? [] : verdict.problems.map((p) => p.code));
    const legal = validateDeck({ identityCardId: APPRENTICE.id, aspects: ["justice"], cards: [] }, POOL);
    expect(codes(legal)).not.toContain("unsupported_identity");
    expect(codes(legal)).not.toContain("missing_card_data");
    const listed = validateDeck(
      { identityCardId: APPRENTICE.id, aspects: ["justice"], cards: [{ cardId: TASK_BEAST.id, quantity: 1 }] },
      POOL,
    );
    expect(listed.ok).toBe(false);
    // A deck of encounter cards that lists a player card: the data cannot build it.
    const wrong: HeroIdentityCard = {
      ...APPRENTICE,
      separateDecks: [{ ...APPRENTICE.separateDecks![0]!, cards: [{ cardId: BOONS[0]!.id, quantity: 1 }] }],
    };
    const pool = POOL.map((card) => (card.id === APPRENTICE.id ? wrong : card));
    expect(codes(validateDeck({ identityCardId: APPRENTICE.id, aspects: ["justice"], cards: [] }, pool))).toContain(
      "missing_card_data",
    );
    const base = createdTaskGame().state;
    const refused = createGame(
      {
        seed: 1,
        cards: pool,
        villainCardId: mustInstance(base, base.activeVillainId!).cardId,
        mainSchemeCardId: mustInstance(base, base.mainScheme.instanceId).cardId,
        encounterDeck: [],
        includeIdentitySets: false,
        players: [{ identityCardId: APPRENTICE.id, deck: DEFAULT_DECK }],
      },
      deps,
    );
    expect(refused.ok ? null : refused.error.message).toMatch(
      /is not an encounter card marked for apprentice's Task deck/,
    );
  });

  it("in play a Task card is an encounter card: nobody's to control, readied with the encounter cards, an encounter attachment to its host", () => {
    const start = taskGame([TASK_WATCH]);
    const revealed = runCommands(start, deps, use(start, REVEAL)).state;
    const watch = only(revealed, TASK_WATCH);
    expect(cardsInPlay(revealed)).toContain(watch);
    expect(mustPlayer(revealed, P1).playArea).toContain(watch);
    expect(mustInstance(revealed, watch)).toMatchObject({ ownerId: P1, controllerId: null, faceup: true });
    expect(isPlayerCard(revealed, watch)).toBe(false);
    // RRG 1.8 "End of Player Phase" step 3: "Ready each exhausted encounter card."
    const exhausted = runCommands(revealed, deps, use(revealed, EXHAUST_TASKS)).state;
    expect(mustInstance(exhausted, watch).exhausted).toBe(true);
    const next = runCommands(exhausted, deps, { type: "endTurn", playerId: P1 }).state;
    expect(mustInstance(next, watch).exhausted).toBe(false);
    expect(mustInstance(next, watch)).toMatchObject({ ownerId: P1, controllerId: null });

    // An attachment from the deck is attached under no player's control.
    const beastGame = taskGame([TASK_BEAST], { encounter: [OGRE.id] });
    const attached = runCommands(beastGame, deps, use(beastGame, REVEAL)).state;
    const beast = only(attached, TASK_BEAST);
    expect(mustInstance(attached, beast)).toMatchObject({
      ownerId: P1,
      controllerId: null,
      attachedTo: only(attached, OGRE),
    });
    expect(canHaveAttached(attached, deps, only(attached, OGRE), beast)).toBe(true);
  });

  it("its player eliminated with a Task card on a minion: the card leaves the game with them, and the minion drops from 12 hit points to 6", () => {
    const start = taskGame([TASK_BEAST], { encounter: [OGRE.id], twoPlayers: true });
    const attached = runCommands(start, deps, use(start, REVEAL)).state;
    const beast = only(attached, TASK_BEAST);
    const ogre = only(attached, OGRE);
    expect(maxHitPoints(attached, ogre, deps)).toBe(12);
    expect(mustInstance(attached, ogre).engagedWith).toBe(P1);

    const { state, events } = runCommands(attached, deps, use(attached, FALL));
    expect(mustPlayer(state, P1).eliminated).toBe(true);
    expect(state.outcome).toBeNull();
    // The minion engages the next player and is no longer the Task's host.
    expect(mustInstance(state, ogre)).toMatchObject({ engagedWith: P2, attachments: [] });
    expect(maxHitPoints(state, ogre, deps)).toBe(6);
    expect(cardsInPlay(state)).not.toContain(beast);
    expect(state.victoryDisplay).not.toContain(beast);
    expect(activeEncounterDeck(state).discard).not.toContain(beast);
    expect(ofType(events, "playerEliminated")).toHaveLength(1);
  });

  it("a game with both decks is plain data and replays to the same state", () => {
    const start = taskGame([TASK_WATCH]);
    expect(JSON.parse(JSON.stringify(start))).toEqual(start);
    const { session } = runCommands(start, deps, use(start, REVEAL), { type: "endTurn", playerId: P1 });
    const replayed = replay(session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(session.state);
    expect(JSON.parse(JSON.stringify(session.state))).toEqual(session.state);
  });
});
