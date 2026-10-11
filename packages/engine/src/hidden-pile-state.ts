/**
 * Reading a hidden pile out of a game state, whether the state is the authority's or a sealed copy
 * (docs/phase7-wave9.md §3.29 (a); MC50 p. 5: the cards go in "without looking at them").
 *
 * The authority's state holds each pile's cards (`GameState.hiddenPiles`). A sealed copy (`sealHiddenPiles`,
 * `visibility.ts`: what a client holds or a server sends) holds each pile's size and no card
 * (`GameState.hiddenPileSizes`). A client still asks the engine questions of its copy and previews commands on it, so
 * every read of a pile goes through this module and gives the same open answers on both: a pile's size, and whether it
 * was prepared.
 *
 * What a sealed copy cannot give is the cards. There a pile is read as that many **placeholders**
 * (`sealedPileCards`): card ids that name no card and are in no card pool. An effect that takes cards out of a pile
 * then moves placeholders, so every count after it is right (the pile's size, how many cards have come out), and the
 * events that name them are where `preview()` stops (`hiddenPileCardIds`, `preview.ts` rule (c)): what a gain or a
 * reveal turned up is reported as hidden information, never as a card and never as "nothing". A placeholder says how
 * many, not which: it is not stable from one read to the next, and nothing may be decided by comparing two.
 *
 * A leaf module (types only), so `select.ts`, `visibility.ts` and `resolve/hidden-piles.ts` can all read through it.
 */

import type { CardId } from "@mc/content";
import type { GameState } from "./state.js";

const SEALED_PILE_CARD_PREFIX = "sealed-pile-card:";

/** `size` placeholders for the cards of the sealed pile `pile`: how many there are, and nothing of what they are. */
export const sealedPileCards = (pile: string, size: number): readonly CardId[] =>
  Array.from({ length: Math.max(0, size) }, (_, index) => `${SEALED_PILE_CARD_PREFIX}${pile}:${index}` as CardId);

/** Whether a card id is a sealed pile's placeholder and not a card. */
export const isSealedPileCard = (id: string): boolean => id.startsWith(SEALED_PILE_CARD_PREFIX);

/** Whether this state is a sealed copy of its hidden piles: sizes, and no cards. */
export const hiddenPilesSealed = (state: Pick<GameState, "hiddenPiles" | "hiddenPileSizes">): boolean =>
  state.hiddenPiles === undefined && state.hiddenPileSizes !== undefined;

/**
 * The cards in a hidden pile, in the pile's order; none for a pile that was never prepared. Engine eyes only. On a
 * sealed copy, the pile's placeholders.
 */
export const hiddenPileOf = (
  state: Pick<GameState, "hiddenPiles" | "hiddenPileSizes">,
  pile: string,
): readonly CardId[] => state.hiddenPiles?.[pile] ?? sealedPileCards(pile, state.hiddenPileSizes?.[pile] ?? 0);

/** How many cards a hidden pile holds: open information, and the same on the authority's state and a sealed copy. */
export const hiddenPileSize = (state: Pick<GameState, "hiddenPiles" | "hiddenPileSizes">, pile: string): number =>
  state.hiddenPiles?.[pile]?.length ?? state.hiddenPileSizes?.[pile] ?? 0;

/** Whether a pile of this name has been prepared, empty or not. */
export const hiddenPileExists = (state: Pick<GameState, "hiddenPiles" | "hiddenPileSizes">, pile: string): boolean =>
  state.hiddenPiles?.[pile] !== undefined || state.hiddenPileSizes?.[pile] !== undefined;

/** Each prepared pile's size, in the order the piles were prepared. */
export const hiddenPileSizesOf = (
  state: Pick<GameState, "hiddenPiles" | "hiddenPileSizes">,
): Readonly<Record<string, number>> =>
  state.hiddenPiles !== undefined
    ? Object.fromEntries(Object.entries(state.hiddenPiles).map(([pile, cardIds]) => [pile, cardIds.length]))
    : (state.hiddenPileSizes ?? {});
