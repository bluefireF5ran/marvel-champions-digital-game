type Brand<T, B extends string> = T & { readonly __brand: B };

/** Identifies a seat, not a human: "p1".."p4", assigned at setup and stable for the game. */
export type PlayerId = Brand<string, "PlayerId">;

/**
 * Identifies one physical card in this game. Distinct from `CardId` (which
 * identifies the printed card) because two copies of the same card coexist.
 */
export type InstanceId = Brand<string, "InstanceId">;

export type ChoiceId = Brand<string, "ChoiceId">;

/** Identifies one frame on the resolution stack, so a choice can be routed back to it. */
export type FrameId = Brand<string, "FrameId">;

/**
 * Identifies one encounter deck (with its discard pile). A single-villain scenario has one; The Wrecking Crew
 * has one per villain (insert, "Prepare Encounter Decks"). Assigned at setup: "e1", "e2", … in villain order.
 */
export type EncounterDeckId = Brand<string, "EncounterDeckId">;

/** Identifies one separate game area (The Once and Future Kang): "a1", "a2", … in creation order. */
export type GameAreaId = Brand<string, "GameAreaId">;

/**
 * Identifies one group of 1 to 4 players in an Epic Multiplayer pod (MC55 p. 9): one table, one `GameState`. Not a
 * `GameAreaId`, which splits one table. In Single Group Mode the only group is "g1" (docs/phase7-wave9.md §3.64).
 */
export type GroupId = Brand<string, "GroupId">;

/**
 * Identifies one team of players (MC56 pp. 6, 14): "t1", "t2". A cooperative game is one team, "t1"
 * (docs/competitive-mode-plan.md §3.3).
 */
export type TeamId = Brand<string, "TeamId">;

export const teamId = (value: string): TeamId => value as TeamId;
export const groupId = (value: string): GroupId => value as GroupId;
export const playerId = (value: string): PlayerId => value as PlayerId;
export const gameAreaId = (value: string): GameAreaId => value as GameAreaId;
export const encounterDeckId = (value: string): EncounterDeckId => value as EncounterDeckId;
export const instanceId = (value: string): InstanceId => value as InstanceId;
export const choiceId = (value: string): ChoiceId => value as ChoiceId;
export const frameId = (value: string): FrameId => value as FrameId;
