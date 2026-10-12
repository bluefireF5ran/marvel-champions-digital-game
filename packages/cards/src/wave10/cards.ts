/**
 * The wave 10 (cycle 10) card pool: every earlier playable card plus the Civil War box (`cw`). `@mc/content`'s
 * `PLAYABLE_CARDS` lists them, so this is the playable pool itself (like `../wave9/cards.ts`). `wonder_man` and
 * `hercules` join when their data is emitted and scripted.
 */
import { PLAYABLE_CARDS, type AnyCard } from "@mc/content";

/** Every card the wave 10 scenarios and decks can name, each exactly once. */
export const WAVE10_CARDS: readonly AnyCard[] = PLAYABLE_CARDS;
