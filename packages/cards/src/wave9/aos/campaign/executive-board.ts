import { AOS_BOARD_MEMBER_LOG, AOS_CARDS, cardId, trait } from "@mc/content";
import type { CampaignGameQuery, CampaignOp, EffectSpec, LogWriteSpec, TargetQuery } from "@mc/engine";
import {
  addCounters,
  campaignLogCardCounter,
  campaignLogCardRecorded,
  each,
  encounterSetAside,
  flipCard,
  ifThen,
  moveCards,
  query,
} from "../../../dsl/index.js";

/**
 * The S.H.I.E.L.D. Executive Board's preparation in the campaign (MC50 pp. 9 to 15; docs/phase7-wave9.md sections 3.73
 * and 3.74; module `aos/campaign/executive-board`). Effect builders only: the `CampaignDefinition` (item 77) wires them
 * into its instructions. What is kept about a Board Member between scenarios, and the owner's two decisions on it, are
 * `AOS_BOARD_MEMBER_LOG`'s (Q1 = A: a flipped member keeps its secret counters; Q11 = A: the log records the face with
 * the number, and a member recorded as an attachment is an attachment again at the next Setup).
 */

const BOARD_MEMBER = trait("BOARD MEMBER");
const SECRET = AOS_BOARD_MEMBER_LOG.counter;

/** The front faces of the three Board Members, the keys of every `secretsN` field: 50181a, 50182a, 50183a. */
export const BOARD_MEMBER_FRONTS: readonly string[] = AOS_BOARD_MEMBER_LOG.boardMemberIds.map(String);

/** The A.I.M. Interference treacheries (50184a, b, c): one of each is shuffled into the encounter deck. */
export const A_I_M_INTERFERENCE_IDS: readonly string[] = ["50184a", "50184b", "50184c"];

/** The log fields that hold the recorded secret counters, one for each scenario whose Victory records them (#1 to #4). */
export const SECRETS_FIELDS: readonly string[] = ["secrets1", "secrets2", "secrets3", "secrets4"];

/** The two working numbers the Victory gain reads (`boardEnvironments`, `cleanBoardMembers`): they are never kept. */
export const BOARD_ENVIRONMENTS_FIELD = "boardEnvironments";
export const CLEAN_BOARD_MEMBERS_FIELD = "cleanBoardMembers";

/** The card id of the other face of a Board Member's front face (50181a -> 50181b), read from the card data. */
export function attachmentFaceOf(front: string): string {
  const card = AOS_CARDS.find((candidate) => (candidate.id as string) === front);
  if (!card?.otherFaceId) throw new Error(`${front} is not a Board Member environment with an attachment face`);
  return card.otherFaceId as string;
}

/** "Each Board Member card in play", either face: what the Victory record reads (MC50 p. 9). */
export const BOARD_MEMBER_CARDS: TargetQuery = query([], { trait: BOARD_MEMBER });
/** "A Board Member environment in play": the environment face only. */
export const BOARD_MEMBER_ENVIRONMENTS: TargetQuery = query("environment", { trait: BOARD_MEMBER });
/** "A Board Member environment that has no secret counters on it": the clean ones (MC50 p. 9, the Victory gain). */
export const CLEAN_BOARD_MEMBER_ENVIRONMENTS: TargetQuery = query("environment", {
  trait: BOARD_MEMBER,
  not: { hasCounter: SECRET },
});

/**
 * "Record the number of secret counters on each Board Member card in the campaign log" (MC50 pp. 9 to 15): the query a
 * `record` writes to a `secretsN` (`cardState`) field. The face is recorded with the number when
 * `AOS_BOARD_MEMBER_LOG.recordFace` says so (Q11 = A), so a member recorded as an attachment stays one.
 */
export const BOARD_MEMBER_STATE: CampaignGameQuery = {
  kind: "cardStateOf",
  query: BOARD_MEMBER_CARDS,
  counters: [SECRET],
  ...(AOS_BOARD_MEMBER_LOG.recordFace ? { withFace: true as const } : {}),
};

/** The write of a Victory `record` for scenario N: `recordSecrets("secrets1")`. */
export const recordSecrets = (field: string): LogWriteSpec => ({ field, mode: "set", value: BOARD_MEMBER_STATE });

/**
 * The two working numbers of the Victory gain (MC50 p. 9: "If at least one Board Member environment in play has no
 * secret counters on it, gain one evidence card"): how many Board Member environments are in play as the game ended
 * and how many of them have no secret counter. The gain is `valueAtLeast(cleanBoardMembers, 1)`; an attachment is not an
 * environment and is neither counted nor clean.
 */
export const BOARD_WORKING_WRITES: readonly LogWriteSpec[] = [
  {
    field: BOARD_ENVIRONMENTS_FIELD,
    mode: "set",
    value: { kind: "count", of: { kind: "cardsInPlay", query: BOARD_MEMBER_ENVIRONMENTS } },
  },
  {
    field: CLEAN_BOARD_MEMBERS_FIELD,
    mode: "set",
    value: { kind: "count", of: { kind: "cardsInPlay", query: CLEAN_BOARD_MEMBER_ENVIRONMENTS } },
  },
];

/**
 * Composition for every scenario that prepares the board: the three Board Member environments and the three
 * A.I.M. Interference treacheries are set aside (ownerless). The environments enter play at Appendix II step 11 by their
 * Setup keyword; the treacheries wait for `prepareBoard` to shuffle them in. A double-faced card is one instance, so
 * the front faces stand for the attachment faces.
 */
export const BOARD_SET_ASIDE_OPS: readonly CampaignOp[] = [...BOARD_MEMBER_FRONTS, ...A_I_M_INTERFERENCE_IDS].map(
  (id): CampaignOp => ({ kind: "setAsideCards", cards: [{ kind: "const", value: cardId(id) }] }),
);

/** Where the counters on the environments come from: two on each (scenario #1), or a `cardState` field recorded earlier. */
export type BoardSource = { readonly kind: "twoSecrets" } | { readonly kind: "recorded"; readonly field: string };

/** Scenario #1: "Place two secret counters on each Board Member environment" (MC50 p. 9). */
export const SCENARIO_ONE_BOARD: BoardSource = { kind: "twoSecrets" };
/** Scenarios #2 to #4: the counters (and, with Q11 = A, the face) recorded in `secretsN`. */
export const recordedBoard = (field: string): BoardSource => ({ kind: "recorded", field });

/**
 * "Prepare the S.H.I.E.L.D. Executive Board set" (MC50 pp. 9, 11, 13, 15), the in-game half, to be resolved before the
 * starting hands are drawn: the three Board Member environments are in play (their Setup keyword; see below), give each
 * its secret counters, and shuffle the three A.I.M. Interference treacheries into the encounter deck.
 *
 * Scenario #1 places two on each. A later scenario places each member's recorded number in one placement, while it is
 * still an environment, so an attachment's "after a secret counter is placed here" does not answer them; the
 * environment's own state check flips it at its threshold (4, or 3 in expert mode), and a member recorded as an
 * attachment that is still an environment is then flipped (Q11 = A), keeping its counters (Q1 = A). A third
 * attachment loses the game during setup, as the card says.
 */
export function prepareBoard(source: BoardSource): readonly EffectSpec[] {
  const members = boardMembersFor(source);
  const treacheries = A_I_M_INTERFERENCE_IDS.map((id): EffectSpec =>
    moveCards(encounterSetAside({ printedId: cardId(id) }), "encounterDeckShuffle"),
  );
  return [...members, ...treacheries];
}

/**
 * Only the counters and faces of `field` on Board Member environments already in play, with no treachery shuffled in:
 * scenario 5's "Place secret counters on each Board Member environment equal to the number of secret counters recorded
 * for that environment in scenario #4" (MC50 p. 19). Baron Zemo's own Setup puts the three environments into play
 * (`BOARD_MEMBER_FRONTS` are on the table) and its A.I.M. Interference cards are the scenario's own, so this is
 * `prepareBoard`'s member half and nothing else.
 */
export const restoreBoardSecrets = (field: string): readonly EffectSpec[] => boardMembersFor(recordedBoard(field));

function boardMembersFor(source: BoardSource): readonly EffectSpec[] {
  return BOARD_MEMBER_FRONTS.flatMap((front): readonly EffectSpec[] => {
    // The environments are already in play: each has the Setup keyword, and Appendix II step 11 puts a card with it into
    // play from the set-aside area as well as from the encounter deck. "Put the three Board Member environments into
    // play" (MC50 p. 9) is therefore that keyword, and this resolves on them where they stand.
    const onTable = each(query([], { printedId: cardId(front) }));
    if (source.kind === "twoSecrets") return [addCounters(SECRET, 2, onTable)];
    return [
      addCounters(SECRET, campaignLogCardCounter(source.field, front, SECRET), onTable),
      ...(AOS_BOARD_MEMBER_LOG.recordFace
        ? [
            ifThen(campaignLogCardRecorded(source.field, front, attachmentFaceOf(front)), [
              flipCard(onTable, { keepCounters: AOS_BOARD_MEMBER_LOG.secretsStayOnFlip ? [SECRET] : [] }),
            ]),
          ]
        : []),
    ];
  });
}
