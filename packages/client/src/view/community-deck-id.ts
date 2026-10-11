/**
 * The id a community (tested MarvelCDB) deck carries while it is only an offer and not one of the player's saved decks:
 * `community:<MarvelCDB id>`. Kept apart from `community-decks-model.ts` (which imports the roster filter) so the filter
 * can ask "is this a tested deck?" without an import cycle.
 */
const COMMUNITY_ID_PREFIX = "community:";

export const communityDeckIdOf = (marvelcdbId: number): string => `${COMMUNITY_ID_PREFIX}${marvelcdbId}`;
export const isCommunityDeckId = (id: string): boolean => id.startsWith(COMMUNITY_ID_PREFIX);
