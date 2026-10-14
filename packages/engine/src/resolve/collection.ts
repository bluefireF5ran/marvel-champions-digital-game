/**
 * "Search your collection" (docs/phase7-wave7.md §3.81; RRG 1.8 "Search", p. 39): the one effect that brings a card
 * into the game from outside it.
 */

import type { AnyCard, CardId } from "@mc/content";
import { CARD_DATA_CATEGORIES, cardTraits } from "../campaign/ops.js";
import { type Ctx, emit, nextInstanceId, requestChoice, setFrame, updatePlayer } from "../ctx.js";
import { EngineInvariantError } from "../errors.js";
import type { PlayerId } from "../ids.js";
import { linkedKeywordsOf } from "../linked.js";
import { cardOf, foeHeroFace, getInstance, getPlayer, titleShowing } from "../query.js";
import { cardsInPlay, categoriesOf, type EffectContext, resolvePlayers } from "../select.js";
import type { CollectionSearchFilter, EffectSpec } from "../spec.js";
import { type CardInstance, type GameState, NO_STATUSES } from "../state.js";
import { sameTitle } from "../titles.js";
import { effectChoiceAuthority } from "../villain/authority.js";
import type { Frame } from "./frames.js";
import { markPreThenUnresolved } from "./then.js";

/**
 * A scenario-, campaign- or competitive-specific card is in no collection search: it "can only be used during a
 * campaign from the same product" (RRG 1.8 "Campaign-Specific Card", p. 11), by that campaign's own rules, and the
 * owner's decision leaves every such card out (§4.1 Q47 = A), whatever aspect it also prints.
 *
 * A linked card is in none either (docs/phase7-wave9.md §3.77). RRG 1.8 "Linked (Card Title)" (p. 27): "Cards with
 * the linked keyword cannot be included in any deck. Instead, they are set aside at the start of the game if any deck
 * includes the card that brings the linked cards into play". Ruling August 3, 2026 - Ruling 4, answer 3: "Linked
 * cards cannot be included in decks", asked about a campaign reward. So the card its parentheses name is the one way
 * a linked card comes into a game, and a search of the collection is not it.
 */
const matchesFilter = (
  card: AnyCard,
  filter: CollectionSearchFilter,
  titlesInPlay: () => ReadonlySet<string>,
  ownTitles: () => ReadonlySet<string>,
  identitiesInGame: () => ReadonlySet<string>,
): boolean => {
  if ("specificTo" in card && card.specificTo !== undefined) return false;
  if (linkedKeywordsOf(card).length > 0) return false;
  if (filter.notAmongOwnCards && [...ownTitles()].some((title) => sameTitle(card.name, title))) return false;
  if (filter.heroTitleNotInPlay) {
    if (card.type !== "hero_identity" || card.separatedIdentity) return false;
    // Only the version a game starts with is a hero to choose (the others replace it during a game).
    if (card.progressingIdentity && card.progressingIdentity.versions[0] !== card.id) return false;
    const title = foeHeroFace(card).faceName;
    if ([...titlesInPlay()].some((inPlay) => sameTitle(title, inPlay))) return false;
  }
  if (filter.identitySpecificToUnseated) {
    const owner = identitySetOwnerOf(card);
    if (owner === undefined || identitiesInGame().has(owner)) return false;
  }
  const categories = CARD_DATA_CATEGORIES[card.type];
  if (filter.categories && !filter.categories.some((category) => categories.includes(category))) return false;
  if (filter.aspects && !filter.aspects.includes("aspect" in card ? (card.aspect as string) : "")) return false;
  if (filter.traits) {
    const traits = cardTraits(card);
    if (!filter.traits.some((trait) => traits.includes(trait))) return false;
  }
  return true;
};

/**
 * The identity whose set a player card belongs to (RRG 1.8 "Identity-Specific Card", p. 23: the identity icon, carried
 * as `aspect: "hero:<identity card id>"`), by that identity's card id. Undefined for an identity card itself and for a
 * card of no identity's set.
 */
function identitySetOwnerOf(card: AnyCard): string | undefined {
  if (card.type === "hero_identity" || !("aspect" in card)) return undefined;
  const aspect = String(card.aspect);
  return aspect.startsWith(IDENTITY_SET_PREFIX) ? aspect.slice(IDENTITY_SET_PREFIX.length) : undefined;
}
const IDENTITY_SET_PREFIX = "hero:";

/**
 * The card ids of the identities in this game, for `CollectionSearchFilter.identitySpecificToUnseated`: every identity
 * card the game holds an instance of, in any zone (each seat's identity; an identity card a card effect brought in),
 * with every version of a progressing identity, which are one identity on several cards.
 */
function identityCardsInGame(state: GameState): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const instance of Object.values(state.instances)) {
    const card = state.cardPool[instance.cardId];
    if (card?.type !== "hero_identity") continue;
    ids.add(card.id);
    for (const version of card.progressingIdentity?.versions ?? []) ids.add(version);
  }
  return ids;
}

/**
 * The cards of `filter` a collection search can find right now, in title order (then card id), which is the order
 * they are offered in and does not depend on the order the pool was configured or deserialized in.
 *
 * The collection is the game's card pool (§4.1 Q47 = A). A card is in it while a copy is left outside the game: its
 * printed quantity in its product, less every instance of it the game holds, in any zone. That covers each seat's
 * deck copies and copies already fetched, and a copy removed from the game stays counted, since it "does not become a
 * part of the collection" (ruling, December 17, 2025 - Ruling 4, answer 1).
 */
export function collectionCandidates(
  state: GameState,
  filter: CollectionSearchFilter,
  /** The searching player, for a filter that reads their cards (`notAmongOwnCards`). */
  playerId?: PlayerId,
): readonly AnyCard[] {
  const inGame = new Map<string, number>();
  for (const instance of Object.values(state.instances))
    inGame.set(instance.cardId, (inGame.get(instance.cardId) ?? 0) + 1);
  const byTitle = (a: AnyCard, b: AnyCard): number => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
  let titles: ReadonlySet<string> | undefined;
  const titlesInPlay = (): ReadonlySet<string> => (titles ??= characterTitlesInPlay(state));
  let own: ReadonlySet<string> | undefined;
  const ownTitles = (): ReadonlySet<string> => (own ??= titlesAmongCardsOf(state, playerId));
  let identities: ReadonlySet<string> | undefined;
  const identitiesInGame = (): ReadonlySet<string> => (identities ??= identityCardsInGame(state));
  return Object.values(state.cardPool)
    .filter(
      (card) =>
        matchesFilter(card, filter, titlesInPlay, ownTitles, identitiesInGame) &&
        card.quantityInSet - (inGame.get(card.id) ?? 0) > 0,
    )
    .sort(byTitle);
}

/**
 * The printed titles of a player's cards in this game, for `CollectionSearchFilter.notAmongOwnCards` ("a different"
 * card, docs/phase7-wave9.md §4.1 Q12 = A): the cards in their deck, hand and discard pile, and the cards in play they
 * own or control. Cards set aside, removed from the game or in the victory display are not among them. No player, no
 * titles.
 */
function titlesAmongCardsOf(state: GameState, playerId: PlayerId | undefined): ReadonlySet<string> {
  const player = playerId === undefined ? undefined : getPlayer(state, playerId);
  if (!player) return new Set();
  const inPlay = cardsInPlay(state).filter((id) => {
    const instance = getInstance(state, id);
    return instance?.ownerId === player.playerId || instance?.controllerId === player.playerId;
  });
  const titles = new Set<string>();
  for (const id of [...player.deck, ...player.hand, ...player.discard, ...inPlay]) {
    const title = cardOf(state, id)?.name;
    if (title !== undefined) titles.add(title);
  }
  return titles;
}

/**
 * The titles of the characters in play, for `CollectionSearchFilter.heroTitleNotInPlay`: the title each character is
 * showing (`titleShowing`; RRG 1.8 "Identity", p. 23: an identity by its faceup side). Only a faceup title is in play
 * (docs/phase7-wave9.md §4.1 Q44 = B): a seat's identity in alter-ego form shows its alter-ego title, so its hero title
 * blocks nothing until it flips. A subtitle is not a title (RRG 1.8 "Subtitle", p. 41).
 */
function characterTitlesInPlay(state: GameState): ReadonlySet<string> {
  const titles = new Set<string>();
  for (const id of cardsInPlay(state)) {
    if (!categoriesOf(state, id).includes("character")) continue;
    const title = titleShowing(state, id);
    if (title !== undefined) titles.add(title);
  }
  return titles;
}

/**
 * `EffectSpec searchCollection`. The choice is parked on the frame like every other; its answer is the recorded
 * command, and the new instance takes the next id of the game's instance counter, so replaying the log creates the
 * same card under the same id.
 */
export function executeSearchCollection(
  ctx: Ctx,
  frame: Frame<"effects">,
  effect: Extract<EffectSpec, { kind: "searchCollection" }>,
  context: EffectContext,
): void {
  const [playerId] = resolvePlayers(ctx.state, effect.player, context);
  const candidates = playerId ? collectionCandidates(ctx.state, effect.filter, playerId) : [];
  const bind = (found: CardInstance["instanceId"] | null): void =>
    setFrame(ctx, {
      ...frame,
      answer: null,
      cursor: frame.cursor + 1,
      bindings: { ...frame.bindings, [effect.bind]: found === null ? [] : [found] },
      vars: { ...frame.vars, [`${effect.bind}.count`]: found === null ? 0 : 1 },
    });
  if (!playerId) return bind(null);
  if (candidates.length === 0) {
    bind(null);
    // The same "then" gate as a deck search that found nothing (RRG 1.8 "'Then'", p. 44).
    markPreThenUnresolved(ctx, frame.frameId, "searchFoundNothing");
    return;
  }
  if (frame.answer === null) {
    requestChoice(ctx, {
      playerId,
      authority: effectChoiceAuthority(ctx.state, frame.selfInstanceId, effect.player),
      prompt: { kind: "searchCollection", slot: effect.bind },
      options: candidates.map((card) => ({
        optionId: card.id,
        label: card.name,
        ref: { kind: "cardDefinition", cardId: card.id } as const,
      })),
      minSelections: 0,
      maxSelections: 1,
      frameId: frame.frameId,
    });
    return;
  }
  const [answered] = frame.answer;
  if (answered === undefined) return bind(null);
  const card = candidates.find((candidate) => candidate.id === answered);
  if (!card) throw new EngineInvariantError(`"${answered}" is not a card the collection search can find`);
  bind(addFromCollection(ctx, card.id, playerId));
}

/** Creates the found card: owned and controlled by the searcher, out of play in their set-aside area, facedown. */
function addFromCollection(ctx: Ctx, cardId: CardId, ownerId: NonNullable<CardInstance["ownerId"]>) {
  const id = nextInstanceId(ctx);
  const instance: CardInstance = {
    instanceId: id,
    cardId,
    ownerId,
    controllerId: ownerId,
    home: { kind: "player" },
    faceup: false,
    exhausted: false,
    damage: 0,
    threat: 0,
    statuses: NO_STATUSES,
    counters: {},
    attachedTo: null,
    attachments: [],
    boostCards: [],
    tucked: [],
    facedownAs: null,
    engagedWith: null,
    flipped: false,
  };
  ctx.state = { ...ctx.state, instances: { ...ctx.state.instances, [id]: instance } };
  updatePlayer(ctx, ownerId, (player) => ({ ...player, setAside: [...player.setAside, id] }));
  emit(ctx, { type: "cardAddedFromCollection", cardId, instanceId: id, ownerId });
  return id;
}
