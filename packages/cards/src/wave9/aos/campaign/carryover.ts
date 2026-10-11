import { AOS_THUNDERBOLT_MINIONS, cardId, trait } from "@mc/content";
import type { CampaignGameQuery, CampaignOp, CampaignPredicate, EffectSpec, LogWriteSpec } from "@mc/engine";
import {
  addCounters,
  campaignLogValue,
  chosen,
  each,
  firstPlayer,
  moveCards,
  perHero,
  placeThreat,
  product,
  putIntoPlay,
  query,
  removeCountersFrom,
  selectCards,
  encounterSetAside,
} from "../../../dsl/index.js";

/**
 * What the Agents of S.H.I.E.L.D. campaign carries from one scenario to the next besides the Executive Board (MC50 pp. 9
 * to 19, 24; docs/phase7-wave9.md sections 2.9, 3.73 and 3.78; module `aos/campaign/carryover`). Builders only: the
 * `CampaignDefinition` (item 77) inlines them. Each carryover is a pair, the Victory `record` of one scenario and the
 * Setup of a later one:
 *
 * | Recorded (Victory)                                  | Field                   | Restored (Setup)                                  |
 * | --------------------------------------------------- | ----------------------- | ------------------------------------------------- |
 * | scenario 1: minions and side schemes in play        | `minionsAndSideSchemes` | scenario 2: threat on Alert Level                 |
 * | scenario 2: Rescued Captive allies in play          | `rescuedCaptives`       | scenario 3: lock counters on the top Holding Cell |
 * | scenario 3: Adaptoid environments in play           | `adaptoidEnvironments`  | scenario 5: put into play                         |
 * | (none: a fixed count)                               |                         | scenario 5: the four Adaptoids shuffled in        |
 * | scenario 4: Thunderbolt minions in play             | `survivingThunderbolts` | scenario 5: their sets (Jolt as a card)           |
 *
 * Windows (item 77 wires them): every `*Setup` effect list is an `inGame` instruction at the default window, the same
 * one the box's other non-hand Setup bullets use; each `*Composition` list is a `betweenGames` instruction in the
 * node's `composition`. A composition (set aside, sets added) always comes with its in-game half in the same scenario:
 * `adaptoidEnvironmentsComposition` with `adaptoidEnvironmentsSetup`, `adaptoidsComposition` with `adaptoidsSetup`, and
 * `thunderboltsComposition` with `thunderboltsSetup`.
 */

const set = (value: string): { readonly kind: "const"; readonly value: string } => ({ kind: "const", value });

// ---------------------------------------------------------------------------
// The records (Victory)
// ---------------------------------------------------------------------------

export const MINIONS_AND_SIDE_SCHEMES_FIELD = "minionsAndSideSchemes";
export const RESCUED_CAPTIVES_FIELD = "rescuedCaptives";
export const ADAPTOID_ENVIRONMENTS_FIELD = "adaptoidEnvironments";
export const SURVIVING_THUNDERBOLTS_FIELD = "survivingThunderbolts";

/** Rescued Captive (50091), the ally the Batroc scenario sets aside four of (MC50 p. 11). */
export const RESCUED_CAPTIVE = "50091";
/** Alert Level (50090a), the Batroc scenario's environment: the card the recorded count lands on. */
const ALERT_LEVEL = each(query("environment", { name: "Alert Level" }));
/** The Holding Cell environment in play: "the top card of the Holding Cell deck" (MC50 p. 13). */
const HOLDING_CELL = each(query("environment", { name: "Holding Cell" }));

/** The four Adaptoid environments 50109 to 50112 (Flying, Psionic, Sarah Garza, Strong Upgrade), by the trait they share. */
const ADAPTOID_ENVIRONMENTS = query("environment", { trait: trait("ADAPTOID") });
/** The Adaptoid minion 50113 (four copies). */
export const ADAPTOID = "50113";
export const ADAPTOID_COPIES = 4;

const countOf = (inPlay: ReturnType<typeof query>): CampaignGameQuery => ({
  kind: "count",
  of: { kind: "cardsInPlay", query: inPlay },
});

/**
 * Scenario 1: "Record the total number of minions and side schemes in play in the campaign log." Player side schemes count
 * (the `sideScheme` category holds both kinds; RRG "Side Scheme", p. 34), the main scheme and allies do not.
 */
export const MINIONS_AND_SIDE_SCHEMES_RECORD: readonly LogWriteSpec[] = [
  {
    field: MINIONS_AND_SIDE_SCHEMES_FIELD,
    mode: "set",
    value: countOf(query(["minion", "sideScheme"])),
  },
];

/** Scenario 2: "Record the number of Rescued Captive (91) allies in play in the campaign log." */
export const RESCUED_CAPTIVES_RECORD: readonly LogWriteSpec[] = [
  {
    field: RESCUED_CAPTIVES_FIELD,
    mode: "set",
    value: countOf(query("ally", { printedId: cardId(RESCUED_CAPTIVE) })),
  },
];

/** Scenario 3: "Mark each Adaptoid environment (109-112) in play in the campaign log." The field holds their card ids. */
export const ADAPTOID_ENVIRONMENTS_RECORD: readonly LogWriteSpec[] = [
  {
    field: ADAPTOID_ENVIRONMENTS_FIELD,
    mode: "set",
    value: { kind: "cardsInPlay", query: ADAPTOID_ENVIRONMENTS },
  },
];

/**
 * Scenario 4: "If there are any Thunderbolt minions in play, record each of their names in the campaign log." The minion
 * attached to Thunderbolt Backup is in play (MC50 p. 15), so it is recorded too; Citizen V is a villain and is not.
 */
export const THUNDERBOLTS_RECORD: readonly LogWriteSpec[] = [
  {
    field: SURVIVING_THUNDERBOLTS_FIELD,
    mode: "set",
    value: { kind: "cardsInPlay", query: query("minion", { trait: trait("THUNDERBOLT") }) },
  },
];

// ---------------------------------------------------------------------------
// The Setups
// ---------------------------------------------------------------------------

/**
 * Scenario 2: "Place threat on the Alert Level environment equal to the number of minions and side schemes recorded in the
 * campaign log for scenario #1." The environment's own text then applies: at 4[per_hero] it empties and flips to High.
 */
export const alertLevelSetup = (): readonly EffectSpec[] => [
  placeThreat(campaignLogValue(MINIONS_AND_SIDE_SCHEMES_FIELD), ALERT_LEVEL),
];

/**
 * Scenario 3: "Place 3[per_hero] additional lock counters on the top card of the Holding Cell deck, then remove X[per_hero]
 * lock counters from that card, where X is the number of 'Rescued Captives in Play' recorded." The cell already holds
 * 2[per_hero] from entering play, so it ends with (5 - X)[per_hero]; X is at most 4, so the last counter is never removed.
 */
export const holdingCellLocksSetup = (): readonly EffectSpec[] => [
  addCounters("lock", perHero(3), HOLDING_CELL),
  removeCountersFrom(HOLDING_CELL, "lock", product(perHero(1), campaignLogValue(RESCUED_CAPTIVES_FIELD))),
];

const ADAPTOID_ENVIRONMENT_IDS: readonly string[] = ["50109", "50110", "50111", "50112"];

/** Scenario 5, composition: "each Adaptoid environment marked as 'in play'" is set aside, to be put into play in game. */
export const adaptoidEnvironmentsComposition: readonly CampaignOp[] = [
  { kind: "setAsideCards", cards: [{ kind: "field", field: ADAPTOID_ENVIRONMENTS_FIELD }] },
];

/** Scenario 5, in game: "Put into play each Adaptoid environment marked as 'in play' in the campaign log." */
export const adaptoidEnvironmentsSetup = (): readonly EffectSpec[] => [
  selectCards("adaptoidEnvironments", encounterSetAside(ADAPTOID_ENVIRONMENTS)),
  putIntoPlay(chosen("adaptoidEnvironments"), firstPlayer),
];

/** Scenario 5, composition: the four Adaptoid minions (50113) are set aside. */
export const adaptoidsComposition: readonly CampaignOp[] = [
  { kind: "setAsideCards", cards: [set(ADAPTOID)], copies: { kind: "const", value: ADAPTOID_COPIES } },
];

/** Scenario 5, in game: "Shuffle each copy of the Adaptoid minion (113) into the encounter deck." */
export const adaptoidsSetup = (): readonly EffectSpec[] => [
  moveCards(encounterSetAside(query("minion", { printedId: cardId(ADAPTOID) })), "encounterDeckShuffle"),
];

/** The ten Elite Thunderbolt minions and Jolt, by the rule that sorts them: an Elite minion brings its set, Jolt only herself. */
const SURVIVOR_ROWS = AOS_THUNDERBOLT_MINIONS.map((row) => ({
  id: row.minionId as string,
  set: row.encounterSetId as string,
  elite: row.elite,
}));

const recorded = (id: string): CampaignPredicate => ({
  kind: "fieldContains",
  field: SURVIVING_THUNDERBOLTS_FIELD,
  value: id,
});

/**
 * Scenario 5, composition: "If you recorded any 'Surviving Thunderbolts', shuffle those minions and their encounter sets,
 * except for Jolt's (133), into the encounter deck." An Elite minion's whole set joins the deck (the minion is in it); Jolt
 * alone, a card of the Thunderbolts set that the sentence leaves out, is set aside as a card. The rows come from the
 * Thunderbolt minion map, so a later product's minion joins by carrying the trait.
 */
export const thunderboltsComposition: readonly CampaignOp[] = SURVIVOR_ROWS.map((row): CampaignOp => ({
  kind: "if",
  when: recorded(row.id),
  then: row.elite
    ? [{ kind: "composeEncounterSets", sets: [set(row.set)] }]
    : [{ kind: "setAsideCards", cards: [set(row.id)] }],
}));

/** Scenario 5, in game: the set-aside Thunderbolt that is not Elite (Jolt) is shuffled into the encounter deck, if recorded. */
export const thunderboltsSetup = (): readonly EffectSpec[] =>
  SURVIVOR_ROWS.filter((row) => !row.elite).map((row): EffectSpec =>
    moveCards(encounterSetAside(query("minion", { printedId: cardId(row.id) })), "encounterDeckShuffle"),
  );

export { ADAPTOID_ENVIRONMENT_IDS };
