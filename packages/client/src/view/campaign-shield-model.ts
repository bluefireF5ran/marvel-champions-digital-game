/**
 * What the Briefing shows about Agents of S.H.I.E.L.D. between scenarios (MC50 pp. 5, 6, 9 to 19, 24), read from the
 * campaign log: the evidence the players hold and how far it narrows the mole, each Board Member's secrets and whether it
 * has turned into an attachment, the numbers the next Setups read (Alert Level, Rescued Captives, Adaptoid
 * environments, surviving Thunderbolts), and in an expert campaign each seat's hit points and whether it sits out.
 *
 * **The sealed A.I.M. envelope is never read.** The log keeps it under `hidden` and nothing here touches that map: the
 * only fact shown about it is that it holds one card of each kind (the box's printed count, `EVIDENCE_KINDS`). The grid
 * rows left are worked out from the evidence the players *hold* (`shared.evidence`), through the same `evidenceGridOf`
 * the in-game Evidence sheet uses.
 *
 * Found by shape: a definition with the `evidence` and `secrets1` log fields. Any other box gets null.
 */
import {
  AOS_BOARD_MEMBER_LOG,
  AOS_CARDS,
  AOS_EVIDENCE_COMBINATIONS,
  EVIDENCE_KINDS,
  cardId,
  type AnyCard,
  type CardId,
} from "@mc/content";
import type { CampaignDefinition, CampaignLog, LogValue } from "@mc/engine";
import type { CardNameOf } from "./campaign-briefing-model.js";
import { evidenceGridOf } from "./evidence-model.js";

/** The log fields this module reads, by the ids `AOS_CAMPAIGN_DEFINITION` declares. */
const FIELDS = {
  evidence: "evidence",
  secrets: ["secrets1", "secrets2", "secrets3", "secrets4"],
  minions: "minionsAndSideSchemes",
  captives: "rescuedCaptives",
  adaptoids: "adaptoidEnvironments",
  thunderbolts: "survivingThunderbolts",
  hp: "remainingHp",
} as const;

export interface ShieldCard {
  readonly cardId: CardId;
  readonly name: string;
}

export interface ShieldEvidenceCard extends ShieldCard {
  /** "means", "motive" or "opportunity" */
  readonly kind: string;
}

export interface ShieldMemberKey {
  readonly name: string;
  /** Combinations that still name this Board Member. */
  readonly open: number;
}

export interface ShieldBoardMember extends ShieldCard {
  /** The face the log recorded: its attachment face once flipped, which stays for the whole campaign (MC50 p. 6). */
  readonly attachment: boolean;
  readonly secrets: number;
}

export interface ShieldNumber {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** Where the number is read, in a few words ("Scenario #2 Setup"). */
  readonly usedIn: string;
}

export interface ShieldSeat {
  readonly seatNumber: number;
  readonly heroName: string;
  /** "7 hit points", "Full hit points" or "Defeated: pays to rejoin, or sits out". */
  readonly status: string;
  readonly sitsOut: boolean;
}

export interface ShieldBriefing {
  /** The evidence the players hold, in the order gained. */
  readonly evidence: readonly ShieldEvidenceCard[];
  /** Always the box's printed count: one card of each kind sealed in the A.I.M. envelope. Its contents are never read. */
  readonly sealedCount: number;
  readonly rowsOpen: number;
  readonly rowsTotal: number;
  readonly members: readonly ShieldMemberKey[];
  /** The scenario whose Victory recorded the board (1 to 4), or null before the first record. */
  readonly boardAfter: number | null;
  readonly board: readonly ShieldBoardMember[];
  readonly numbers: readonly ShieldNumber[];
  /** Expert campaign only; empty in a standard one. */
  readonly seats: readonly ShieldSeat[];
  /** The flip threshold the board is read against, in plain words. */
  readonly flipNote: string;
}

type LogSource = Pick<CampaignLog, "shared" | "seats" | "modes">;

/** True for a definition with the evidence and board-secret fields. */
export function hasShieldLog(definition: Pick<CampaignDefinition, "logFields">): boolean {
  const ids = new Set(definition.logFields.map((field) => field.id));
  return ids.has(FIELDS.evidence) && FIELDS.secrets.every((id) => ids.has(id));
}

const cardsOf = (value: LogValue | undefined): readonly CardId[] => (value?.kind === "cardList" ? value.cardIds : []);
const numberOf = (value: LogValue | undefined): number | null => (value?.kind === "number" ? value.value : null);
const CARD_BY_ID = new Map<string, AnyCard>(AOS_CARDS.map((card) => [card.id as string, card]));

const kindOf = (id: CardId): string => {
  const card = CARD_BY_ID.get(id as string) as { evidence?: string } | undefined;
  return card?.evidence ?? "evidence";
};

/** The latest `secretsN` the log holds, and the scenario number it was recorded after. */
function latestBoardOf(shared: LogSource["shared"]): { readonly after: number; readonly value: LogValue } | null {
  for (let index = FIELDS.secrets.length - 1; index >= 0; index--) {
    const value = shared[FIELDS.secrets[index]!];
    if (value?.kind === "cardState" && Object.keys(value.cards).length > 0) return { after: index + 1, value };
  }
  return null;
}

export function shieldBriefingOf(
  record: LogSource,
  definition: Pick<CampaignDefinition, "logFields">,
  cardName: CardNameOf,
): ShieldBriefing | null {
  if (!hasShieldLog(definition)) return null;
  const gained = cardsOf(record.shared[FIELDS.evidence]);
  const lookup = (id: CardId): AnyCard | undefined => CARD_BY_ID.get(id as string);
  const grid = evidenceGridOf(AOS_EVIDENCE_COMBINATIONS, gained, lookup);

  const latest = latestBoardOf(record.shared);
  const board: ShieldBoardMember[] = [];
  if (latest && latest.value.kind === "cardState") {
    for (const front of AOS_BOARD_MEMBER_LOG.boardMemberIds) {
      const state = latest.value.cards[front as string];
      if (!state) continue;
      const attachment = state.face !== undefined;
      const shown = attachment ? cardId(state.face!) : front;
      board.push({
        cardId: shown,
        name: cardName(shown),
        attachment,
        secrets: state.counters[AOS_BOARD_MEMBER_LOG.counter] ?? 0,
      });
    }
  }

  const numbers: ShieldNumber[] = [];
  const minions = numberOf(record.shared[FIELDS.minions]);
  if (minions !== null)
    numbers.push({
      key: "alert",
      label: "Alert Level",
      value: `${minions} threat`,
      usedIn: "Scenario #2 Setup",
    });
  const captives = numberOf(record.shared[FIELDS.captives]);
  if (captives !== null)
    numbers.push({
      key: "captives",
      label: "Rescued Captives",
      value: String(captives),
      usedIn: "Scenario #3 Setup",
    });
  const adaptoids = cardsOf(record.shared[FIELDS.adaptoids]);
  const thunderbolts = cardsOf(record.shared[FIELDS.thunderbolts]);
  if (adaptoids.length > 0)
    numbers.push({
      key: "adaptoids",
      label: "Adaptoid environments",
      value: adaptoids.map((id) => cardName(id)).join(", "),
      usedIn: "Scenario #5 Setup",
    });
  if (thunderbolts.length > 0)
    numbers.push({
      key: "thunderbolts",
      label: "Surviving Thunderbolts",
      value: thunderbolts.map((id) => cardName(id)).join(", "),
      usedIn: "Scenario #5 Setup",
    });

  const seats: ShieldSeat[] = record.modes.campaign?.expertCampaign
    ? record.seats.map((seat) => {
        const hp = numberOf(seat.fields[FIELDS.hp]);
        const sitsOut = hp === 0;
        return {
          seatNumber: seat.seatNumber,
          heroName: cardName(seat.identityCardId),
          status:
            hp === null
              ? "Full hit points"
              : sitsOut
                ? "Defeated: pays to rejoin, or sits out"
                : `${hp} hit ${hp === 1 ? "point" : "points"}`,
          sitsOut,
        };
      })
    : [];

  const flip = AOS_BOARD_MEMBER_LOG.flipAtSecrets;
  return {
    evidence: gained.map((id) => ({ cardId: id, name: cardName(id), kind: kindOf(id) })),
    sealedCount: EVIDENCE_KINDS.length,
    rowsOpen: grid.openCount,
    rowsTotal: grid.total,
    members: grid.members.map((member) => ({ name: member.name, open: member.open })),
    boardAfter: latest?.after ?? null,
    board,
    numbers,
    seats,
    flipNote: record.modes.campaign?.expertCampaign
      ? `A Board Member flips at ${flip.expert} secrets (expert) and stays flipped.`
      : `A Board Member flips at ${flip.standard} secrets and stays flipped.`,
  };
}
