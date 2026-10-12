/**
 * The Civil War builder's randomizer (docs/phase7-wave10-client.md 2.5): `randomCivilWarScenario` from `@mc/cards`
 * behind the builder model's `CivilWarRandomizer` seam. The draw is the cards package's; this only carries the request
 * across and the result back. Stages and sets are never pinned from the builder (they are what is being drawn), so the
 * request has no way to name them.
 */
import { randomCivilWarScenario, type RandomCivilWarOptions } from "@mc/cards";
import type { CivilWarRandomizer } from "./civil-war-builder-model.js";

/** The modular counts a random roll offers (question 9). */
export const RANDOM_SET_COUNTS = [3, 4] as const;
export const DEFAULT_RANDOM_SET_COUNT = 4;

/** Keys are left out when undefined: the cards options type forbids an explicit `undefined`. */
export const cardsRandomizer: CivilWarRandomizer = (request) => {
  const options: RandomCivilWarOptions = {
    ...(request.side !== undefined ? { side: request.side as NonNullable<RandomCivilWarOptions["side"]> } : {}),
    ...(request.leaderId !== undefined ? { leaderId: request.leaderId } : {}),
    ...(request.modularCount !== undefined ? { modularCount: request.modularCount } : {}),
  };
  const drawn = randomCivilWarScenario(request.seed, options);
  return { leaderId: drawn.scenarioId, stageIds: drawn.mainSchemeStageIds, modularSetIds: drawn.modularSetIds };
};
