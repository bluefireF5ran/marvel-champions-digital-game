/**
 * A double-sided card whose other face no player may look at (`CardInstance.reverseHidden`; docs/phase7-wave9.md §3.54;
 * MC55 p. 7: "Players cannot look at the 'Trance' side of any Enchantment attachment until it flips"): the predicate a
 * view asks, and the card such a card is named as wherever the engine names a card to players. A leaf module: the
 * rule over zones and viewers is `visibility.ts`, which re-exports the predicate.
 */

import type { AnyCard, CardId } from "@mc/content";
import type { InstanceId } from "./ids.js";
import type { GameState } from "./state.js";

/**
 * Whether any player may look at the other face of this double-sided card right now (docs/phase7-wave9.md §3.54; MC55
 * p. 7: "Players cannot look at the 'Trance' side of any Enchantment attachment until it flips"). False while the card
 * is marked `CardInstance.reverseHidden`, for every viewer: nobody holds this permission, so there is no viewer to
 * name. True for every other card, whose other face is printed card data any player may read. What a view shows of a
 * card whose answer is false is its showing face only: not the other face's name, text, traits or image.
 */
export const otherFaceVisible = (state: Pick<GameState, "instances">, id: InstanceId): boolean =>
  state.instances[id]?.reverseHidden !== true;

/**
 * Two double-sided cards a player cannot tell apart by the face that starts up: the same card type, name and printed
 * text, each with another face. The fronts of the five Hypnotic Gaze cards (`tt` 55007a–55011a) are one such group.
 */
export const sameFront = (a: AnyCard, b: AnyCard): boolean =>
  a.type === b.type &&
  a.name === b.name &&
  "flipSide" in a &&
  a.flipSide !== undefined &&
  "flipSide" in b &&
  b.flipSide !== undefined &&
  "text" in a &&
  "text" in b &&
  a.text.printed === b.text.printed;

/**
 * The card a hidden-reverse card is shown as: the first card of the game's pool, by card id, with the same front
 * (`sameFront`). Every card of a look-alike group has the same stand-in, so the stand-in says which front a card has
 * and nothing about its other face.
 */
export function standInOf(state: Pick<GameState, "cardPool">, cardId: CardId): CardId {
  const card = state.cardPool[cardId];
  if (!card) return cardId;
  const alike = Object.values(state.cardPool)
    .filter((other) => sameFront(card, other))
    .map((other) => other.id)
    .sort();
  return alike[0] ?? cardId;
}

/**
 * The card id an event names this instance by: its own, or its stand-in while its other face is hidden, so the log
 * says which front a card has and never which of the look-alike cards it is.
 */
export const shownCardId = (state: Pick<GameState, "instances" | "cardPool">, id: InstanceId): CardId => {
  const instance = state.instances[id];
  if (!instance) throw new Error(`no instance ${id}`);
  return instance.reverseHidden ? standInOf(state, instance.cardId) : instance.cardId;
};
