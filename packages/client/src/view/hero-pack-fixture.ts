/**
 * Test support for the Civil War hero packs' board models: a real Wonder Man or Hercules game past setup against Core's
 * Rhino. Their packs are not in the client's playable pool and have no starter deck, so the deck is built here the way
 * the cards package's `heroPackSeat` builds one (the identity's required set, then the pack's and Core's cards of the
 * chosen aspect and of the basic aspect, up to forty), with the cards package's data passed to the engine explicitly.
 */

import { CORE_CARDS, cardId, type AnyCard, type CoreAspect, type HeroIdentityCard } from "@mc/content";
import { WAVE10_CARDS, WAVE10_DEPS, coreScenario } from "@mc/cards";
import {
  DECK_MIN_CARDS,
  applyCommand,
  cardOfferedToDeck,
  copiesUpToLimit,
  createGame,
  isPermanentCard,
  requiredIdentitySet,
  type GameState,
  type PlayerSetup,
} from "@mc/engine";

export const HERO_PACK_POOL: readonly AnyCard[] = WAVE10_CARDS;

const SEATS = {
  wonderMan: { identityId: "58001a", aspect: "justice" as CoreAspect },
  hercules: { identityId: "59001a", aspect: "leadership" as CoreAspect },
};

function seat(which: keyof typeof SEATS): PlayerSetup {
  const spec = SEATS[which];
  const identity = HERO_PACK_POOL.find((c) => c.id === cardId(spec.identityId)) as HeroIdentityCard;
  const byCode = new Map(HERO_PACK_POOL.map((c) => [c.id as string, c]));
  const entries = requiredIdentitySet(identity, HERO_PACK_POOL).map((e) => ({ ...e }));
  const counted = (id: unknown): boolean => !isPermanentCard(byCode.get(id as string)!);
  let total = entries.reduce((n, e) => n + (counted(e.cardId) ? e.quantity : 0), 0);
  const byId = (a: AnyCard, b: AnyCard): number => (a.id as string).localeCompare(b.id as string);
  const offered = (card: AnyCard): boolean =>
    card.type !== "hero_identity" &&
    !("aspect" in card && String(card.aspect).startsWith("hero:")) &&
    cardOfferedToDeck(card, identity, [spec.aspect]).offered;
  const own = HERO_PACK_POOL.filter((c) => c.setCode === identity.setCode && offered(c)).sort(byId);
  const core = CORE_CARDS.filter(offered).sort(byId);
  for (const card of [...own, ...core]) {
    if (total >= DECK_MIN_CARDS) break;
    const taken = copiesUpToLimit(entries, card.id as string, identity, HERO_PACK_POOL);
    const copies = counted(card.id) ? Math.min(taken, DECK_MIN_CARDS - total) : Math.min(taken, 1);
    if (copies > 0) {
      entries.push({ cardId: card.id, quantity: copies });
      if (counted(card.id)) total += copies;
    }
  }
  return {
    identityCardId: identity.id,
    aspects: [spec.aspect],
    deck: entries.flatMap((e) => Array.from({ length: e.quantity }, () => e.cardId)),
  };
}

/** A game past setup (every opening hand kept) for the hero pack's hero, seated alone against Rhino. */
export function heroPackGame(which: keyof typeof SEATS, seed = 1): GameState {
  const base = coreScenario("rhino", {
    players: [{ starterDeckId: "core-spider-man-justice" }],
    seed,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: HERO_PACK_POOL,
  } as never);
  const created = createGame({ ...base, players: [seat(which)] }, WAVE10_DEPS);
  if (!created.ok) throw new Error(`${created.error.code}: ${created.error.message}`);
  let state = created.state;
  for (let guard = 0; state.pendingChoice && state.step.phase !== "player"; guard++) {
    if (guard > 300) throw new Error("setup choices did not settle");
    const choice = state.pendingChoice;
    const ids = choice.options.slice(0, choice.minSelections).map((option) => option.optionId);
    const result = applyCommand(
      state,
      { type: "resolveChoice", playerId: choice.playerId, choiceId: choice.choiceId, selectedOptionIds: ids },
      WAVE10_DEPS,
    );
    if (!result.ok) throw new Error(result.error.message);
    state = result.state;
  }
  return state;
}
