/**
 * Staging shared by the tests of `costsPayableByAnyPlayer` (docs/phase7-wave10-hero-packs.md H3.19) and of the card
 * that prints it, Coordinated Effort (`wonder_man` 58032): a real game against Core's Rhino with Hercules as the first
 * seat and, with `twoPlayers`, Core's Spider-Man as the second, and the two obligations whose Alter-Ego Actions the
 * tests pay for.
 *
 * - **Appeal to Athena** (`hercules` 59035): "Alter-Ego Action: Exhaust Hercules or spend [mental][mental] → remove
 *   this obligation from the game." One branch names the user's own card, the other is resources.
 * - **Unregistered Super** (Civil War 56106): "Alter-Ego Action: Discard an identity-specific card from your hand →
 *   discard this card." A part paid with a card from a hand.
 */

import { cardId } from "@mc/content";
import {
  activeEncounterDeck,
  activeEncounterDeckId,
  createGame,
  type EngineDeps,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { coreScenario } from "../core/setup.js";
import {
  P1,
  applyOk,
  firstLegal,
  inst,
  moveToHand,
  patchInstance,
  play,
  playerOf,
  settle,
} from "../testing/harness.js";
import {
  CORE_SPIDER_MAN,
  HERCULES_DECK,
  HERO_PACK_CARDS,
  WAVE10_DEPS,
  heroPackConfig,
  heroPackSeat,
} from "../wave10/testing.js";

export const EFFORT = "58032";
export const EFFORT_REF = "58032.coordinated-effort-constant";
export const APPEAL = "59035";
export const APPEAL_ACTION = "59035.appeal-to-athena-action";
/** Appeal to Athena's either/or cost: "exhaust Hercules" is branch 0, "spend [mental][mental]" branch 1. */
export const EXHAUST_BRANCH = { branch: 0 } as const;
export const SPEND_BRANCH = { branch: 1 } as const;
export const UNREGISTERED_SUPER = "56106";
export const UNREGISTERED_ACTION = "56106.unregistered-super-action";
/** Core's Genius: a resource card with two mental icons, in the Spider-Man starter deck. */
export const GENIUS = "01089";
/** Core's Backflip: one of Spider-Man's identity-specific cards. */
export const BACKFLIP = "01003";

/** Hercules past setup (alter-ego form, his turn), alone or with Core's Spider-Man as the second seat. */
export function herculesTable(opts: { readonly twoPlayers?: boolean; readonly deps?: EngineDeps } = {}): GameState {
  const deps = opts.deps ?? WAVE10_DEPS;
  const base = heroPackConfig(HERCULES_DECK);
  const second = coreScenario("rhino", {
    players: [{ starterDeckId: CORE_SPIDER_MAN }],
    seed: 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: HERO_PACK_CARDS,
  } as never).players[0]!;
  const players = opts.twoPlayers ? [heroPackSeat(HERCULES_DECK), second] : base.players;
  const created = createGame({ ...base, players }, deps);
  if (!created.ok) throw new Error(created.error.message);
  return settle(created.state, firstLegal, (s) => s.step.phase === "player", deps);
}

/**
 * An obligation in `holder`'s play area, as a revealed obligation that stays in play sits: faceup, controlled by
 * nobody. Appeal to Athena is the copy setup put in the encounter deck; any other code is an encounter deck card
 * retagged to it (surgery), since Rhino's deck holds none.
 */
export function obligationHeld(
  start: GameState,
  code: string,
  holder: PlayerId = P1,
): { readonly state: GameState; readonly id: InstanceId } {
  const piles = activeEncounterDeck(start);
  const codeOf = (id: InstanceId): string => inst(start, id).cardId as string;
  const own = piles.deck.find((id) => codeOf(id) === code);
  const id = own ?? piles.deck.find((candidate) => codeOf(candidate) !== APPEAL);
  if (!id) throw new Error(`no encounter card to make ${code} from`);
  const state: GameState = {
    ...start,
    encounterDecks: {
      ...start.encounterDecks,
      [activeEncounterDeckId(start)]: { ...piles, deck: piles.deck.filter((other) => other !== id) },
    },
    players: start.players.map((p) => (p.playerId === holder ? { ...p, playArea: [...p.playArea, id] } : p)),
  };
  return { id, state: patchInstance(state, id, { cardId: cardId(code), faceup: true, controllerId: null }) };
}

/** A copy of Coordinated Effort in P1's hand: the last card of their deck, retagged (their deck holds none). */
export function effortInHand(state: GameState): { readonly state: GameState; readonly id: InstanceId } {
  const deck = playerOf(state, P1).deck;
  const given = moveToHand(patchInstance(state, deck[deck.length - 1]!, { cardId: cardId(EFFORT) }), P1, EFFORT);
  return { state: given.state, id: given.ids[0]! };
}

/** Coordinated Effort played by P1 from hand (cost 0) and attached to `host`, an encounter card in play. */
export function effortOn(
  state: GameState,
  host: InstanceId,
  deps: EngineDeps = WAVE10_DEPS,
): { readonly state: GameState; readonly id: InstanceId } {
  const held = effortInHand(state);
  const played = applyOk(held.state, play(P1, held.id, [], { attachToInstanceId: host }), deps).state;
  return { id: held.id, state: settle(played, firstLegal, undefined, deps) };
}

/** `player`'s hand put on the bottom of their deck (surgery), so they hold nothing to pay with. */
export function emptyHand(state: GameState, player: PlayerId): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.playerId === player ? { ...p, hand: [], deck: [...p.deck, ...p.hand] } : p)),
  };
}
