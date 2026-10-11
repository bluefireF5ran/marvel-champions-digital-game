/**
 * What the Baron Zemo evidence screens draw (MC50 pp. 18 and 19, "Gathering Evidence" and "The Accusation"): the
 * grid of 27 combinations, which of its rows the faceup evidence has crossed out, the two hidden piles by size, and
 * after the accusation the answer. Plain data over the engine's state; the sheet (`ui/evidence-grid.ts`), the
 * Evidence overlay (`scenes/evidence.ts`) and the accuse prompt (`scenes/choice.ts`) only draw it.
 *
 * **Hidden information.** The "aim" pile is the answer and nobody may read it before the accusation
 * (`GameState.hiddenPiles`, docs/phase7-wave9.md section 3.29 (a)). Nothing here takes a `GameState`: the input is
 * `EvidenceInput`, the slice of `SealedGameState` (`sealHiddenPiles`) that has no `hiddenPiles` key at all, and the one
 * place that turns a live state into it (`evidenceInputOf`) seals it first. A function in this file therefore cannot
 * read a pile's cards, only its size. What is faceup (`revealedPileCards`) is open to every player, and the crossed-out
 * rows come from it through the engine's own `openEvidenceRows`; the client works out no rule.
 */

import type { AnyCard, CardId, EvidenceCombination } from "@mc/content";
import {
  evidenceRowId,
  openEvidenceRows,
  sealHiddenPiles,
  type Accusation,
  type AccusationGuess,
  type GameState,
  type PendingChoice,
  type SealedGameState,
} from "@mc/engine";

/** The three kinds of evidence, in the order MC50 p. 19 lists a combination. */
export const EVIDENCE_KINDS = ["means", "motive", "opportunity"] as const;
export type EvidenceKindName = (typeof EVIDENCE_KINDS)[number];

/** What the screens may read of a game: no hidden pile's contents, by construction (`SealedGameState`). */
export type EvidenceInput = Pick<SealedGameState, "revealedPileCards" | "hiddenPileSizes" | "accusation">;

/** The evidence input of a live state, or null in a game that has no evidence (every scenario but Baron Zemo). */
export function evidenceInputOf(game: GameState): EvidenceInput | null {
  const sealed = sealHiddenPiles(game);
  if (sealed.hiddenPileSizes === undefined && sealed.revealedPileCards === undefined) return null;
  return {
    ...(sealed.revealedPileCards ? { revealedPileCards: sealed.revealedPileCards } : {}),
    ...(sealed.hiddenPileSizes ? { hiddenPileSizes: sealed.hiddenPileSizes } : {}),
    ...(sealed.accusation ? { accusation: sealed.accusation } : {}),
  };
}

/** Every card id that came out of a pile faceup, across all piles. */
export function faceupEvidenceOf(input: Pick<EvidenceInput, "revealedPileCards">): readonly CardId[] {
  return Object.values(input.revealedPileCards ?? {}).flat();
}

export type CardLookup = (id: CardId) => AnyCard | undefined;

export interface EvidenceCardView {
  readonly cardId: CardId;
  readonly name: string;
  readonly kind: EvidenceKindName | null;
  /** True when the players hold this card faceup (it has crossed rows out, or it is the revealed answer). */
  readonly faceup: boolean;
}

export interface EvidenceCellView {
  /** `evidenceRowId`: the option id of the accuse prompt. */
  readonly rowId: string;
  readonly means: CardId;
  readonly motive: CardId;
  readonly opportunity: CardId;
  readonly boardMember: CardId;
  /** Short word for the Board Member ("MED"): text, so a cell never relies on color. */
  readonly code: string;
  /** Not crossed out. */
  readonly open: boolean;
}

/** One means card with its 3 by 3 of motive rows and opportunity columns. */
export interface EvidenceBlockView {
  readonly means: EvidenceCardView;
  readonly motives: readonly EvidenceCardView[];
  readonly opportunities: readonly EvidenceCardView[];
  /** `cells[motive][opportunity]`; null when the grid holds no such row (not in the shipped data). */
  readonly cells: readonly (readonly (EvidenceCellView | null)[])[];
}

export interface BoardMemberKey {
  readonly cardId: CardId;
  readonly name: string;
  readonly code: string;
  /** Rows of this Board Member not crossed out. */
  readonly open: number;
}

export interface EvidenceGridView {
  readonly blocks: readonly EvidenceBlockView[];
  readonly members: readonly BoardMemberKey[];
  readonly total: number;
  readonly openCount: number;
}

const nameOf = (lookup: CardLookup, id: CardId): string => lookup(id)?.name ?? String(id);

/** "Chief Medical Officer" -> "MED": the first word that is not a title, three letters. Falls back to A, B, C on a clash. */
export function boardMemberCodes(names: readonly string[]): readonly string[] {
  const TITLES = new Set(["chief", "officer", "the", "of", "board", "member"]);
  const codes = names.map((name) => {
    const word = name.split(/\s+/).find((candidate) => !TITLES.has(candidate.toLowerCase())) ?? name;
    return word.slice(0, 3).toUpperCase();
  });
  return new Set(codes).size === codes.length ? codes : names.map((_name, index) => String.fromCharCode(65 + index));
}

const distinct = <T>(values: readonly T[]): readonly T[] => [...new Set(values)];

/**
 * The grid as three blocks by means: rows are motives, columns are opportunities, each cell the Board Member that
 * combination names. `crossedOut` is the faceup evidence; a row is open when `openRows` (the engine's answer) holds it.
 */
export function evidenceGridOf(
  grid: readonly EvidenceCombination[],
  crossedOut: readonly CardId[],
  lookup: CardLookup,
): EvidenceGridView {
  const faceup = new Set<CardId>(crossedOut);
  const open = new Set(openEvidenceRows({ revealedPileCards: { all: [...crossedOut] } }, grid).map(evidenceRowId));
  // Printed order (50181a, 50182a, 50183a), not the order the grid first names them in, so the key reads the same every game.
  const memberIds = [...distinct(grid.map((row) => row.boardMember))].sort();
  const codes = boardMemberCodes(memberIds.map((id) => nameOf(lookup, id)));
  const codeOf = new Map(memberIds.map((id, index) => [id, codes[index]!] as const));
  const kindOf = (id: CardId): EvidenceKindName | null => {
    const card = lookup(id);
    const kind = card && "evidence" in card ? (card as { evidence?: string }).evidence : undefined;
    return kind === "means" || kind === "motive" || kind === "opportunity" ? kind : null;
  };
  const cardView = (id: CardId): EvidenceCardView => ({
    cardId: id,
    name: nameOf(lookup, id),
    kind: kindOf(id),
    faceup: faceup.has(id),
  });
  const motives = distinct(grid.map((row) => row.motive));
  const opportunities = distinct(grid.map((row) => row.opportunity));
  const blocks = distinct(grid.map((row) => row.means)).map((means): EvidenceBlockView => {
    const cells = motives.map((motive) =>
      opportunities.map((opportunity): EvidenceCellView | null => {
        const row = grid.find((r) => r.means === means && r.motive === motive && r.opportunity === opportunity);
        if (!row) return null;
        const rowId = evidenceRowId(row);
        return { rowId, ...row, code: codeOf.get(row.boardMember) ?? "?", open: open.has(rowId) };
      }),
    );
    return {
      means: cardView(means),
      motives: motives.map(cardView),
      opportunities: opportunities.map(cardView),
      cells,
    };
  });
  return {
    blocks,
    members: memberIds.map((id) => ({
      cardId: id,
      name: nameOf(lookup, id),
      code: codeOf.get(id) ?? "?",
      open: grid.filter((row) => row.boardMember === id && open.has(evidenceRowId(row))).length,
    })),
    total: grid.length,
    openCount: open.size,
  };
}

/** The four cards a combination names, in reading order, for the "what you are choosing" chips. */
export function rowCardsOf(row: EvidenceCombination, lookup: CardLookup): readonly EvidenceCardView[] {
  return [row.means, row.motive, row.opportunity, row.boardMember].map((id, index) => ({
    cardId: id,
    name: nameOf(lookup, id),
    kind: index < 3 ? EVIDENCE_KINDS[index]! : null,
    faceup: true,
  }));
}

/** "Medical Records, Money, Security Clearance: Chief Medical Officer" */
export function rowSummaryOf(row: EvidenceCombination, lookup: CardLookup): string {
  return `${nameOf(lookup, row.means)}, ${nameOf(lookup, row.motive)}, ${nameOf(lookup, row.opportunity)}: ${nameOf(lookup, row.boardMember)}`;
}

export interface AccuseSheetView {
  readonly grid: EvidenceGridView;
  /** The picked row, when one is picked. */
  readonly selected: EvidenceCombination | null;
  readonly selectedCards: readonly EvidenceCardView[];
  readonly summary: string;
  /** How many combinations can still be accused. */
  readonly openCount: number;
  readonly total: number;
  /** Exactly one open row is picked. */
  readonly canConfirm: boolean;
}

/**
 * The accuse prompt as the sheet draws it. The option list is the engine's answer to "which rows are legal", so the
 * open cells are the options (a grid row crossed out has no option), and a picked id that is not an option is no pick.
 */
export function accuseSheetOf(
  choice: Pick<PendingChoice, "prompt" | "options">,
  picked: readonly string[],
  lookup: CardLookup,
): AccuseSheetView | null {
  const prompt = choice.prompt;
  if (prompt.kind !== "accuse") return null;
  const grid = evidenceGridOf(prompt.grid, prompt.crossedOut, lookup);
  const offered = new Set(choice.options.map((option) => option.optionId));
  // The engine offers every open row; a cell is selectable only if it is also an option.
  const blocks = grid.blocks.map((block) => ({
    ...block,
    cells: block.cells.map((line) =>
      line.map((cell) => (cell ? { ...cell, open: cell.open && offered.has(cell.rowId) } : cell)),
    ),
  }));
  const pick = picked.find((id) => offered.has(id));
  const selected = pick ? (prompt.grid.find((row) => evidenceRowId(row) === pick) ?? null) : null;
  return {
    grid: { ...grid, blocks },
    selected,
    selectedCards: selected ? rowCardsOf(selected, lookup) : [],
    summary: selected ? rowSummaryOf(selected, lookup) : "Pick a combination",
    openCount: choice.options.length,
    total: prompt.grid.length,
    canConfirm: selected !== null,
  };
}

/** Pile names the scenario's cards use ("aim", "shield") and what the table calls them (MC50 p. 5). */
const PILE_TITLES: Readonly<Record<string, string>> = { aim: "A.I.M. envelope", shield: "S.H.I.E.L.D. envelope" };
export const pileTitleOf = (pile: string): string => PILE_TITLES[pile] ?? pile;

export interface EvidencePileView {
  readonly pile: string;
  readonly title: string;
  /** How many cards are still hidden in it. Never their identity. */
  readonly hiddenCount: number;
  /** Cards that came out of it faceup, in the order they came out. */
  readonly faceup: readonly EvidenceCardView[];
}

export interface EvidenceAnswerView {
  readonly accused: EvidenceCombination | null;
  readonly mole: EvidenceCombination | null;
  readonly accusedCards: readonly EvidenceCardView[];
  readonly moleCards: readonly EvidenceCardView[];
  readonly wrong: readonly AccusationGuess[];
  /** One line each: what was accused, who the mole was, how many guesses were wrong. */
  readonly accusedLine: string | null;
  readonly moleLine: string | null;
  readonly verdict: string | null;
}

export interface EvidenceBoardView {
  readonly piles: readonly EvidencePileView[];
  /** Every faceup evidence card, whichever pile it came from. */
  readonly gained: readonly EvidenceCardView[];
  readonly grid: EvidenceGridView;
  /** Null until an accusation is made. */
  readonly answer: EvidenceAnswerView | null;
  /** True once the "aim" pile has been turned faceup and named the mole. */
  readonly solved: boolean;
  /** One short status line for the header. */
  readonly status: string;
}

const GUESS_WORDS: Readonly<Record<AccusationGuess, string>> = {
  means: "means",
  motive: "motive",
  opportunity: "opportunity",
  boardMember: "Board Member",
};

function answerOf(accusation: Accusation | undefined, lookup: CardLookup): EvidenceAnswerView | null {
  if (!accusation || (!accusation.accused && !accusation.mole)) return null;
  const { accused = null, mole = null } = accusation;
  const wrong = accusation.wrong ?? [];
  let verdict: string | null = null;
  if (mole && accused) {
    verdict =
      wrong.length === 0
        ? "Every guess was right"
        : `${wrong.length} wrong: ${wrong.map((guess) => GUESS_WORDS[guess]).join(", ")}`;
  }
  return {
    accused,
    mole,
    accusedCards: accused ? rowCardsOf(accused, lookup) : [],
    moleCards: mole ? rowCardsOf(mole, lookup) : [],
    wrong,
    accusedLine: accused ? rowSummaryOf(accused, lookup) : null,
    moleLine: mole ? rowSummaryOf(mole, lookup) : null,
    verdict,
  };
}

/**
 * The Evidence view: both piles by size while hidden, the faceup evidence, the grid with its crossed-out rows, and the
 * answer once there is one. `grid` is the scenario's combinations (`AOS_EVIDENCE_COMBINATIONS`).
 */
export function evidenceBoardOf(
  input: EvidenceInput,
  grid: readonly EvidenceCombination[],
  lookup: CardLookup,
): EvidenceBoardView {
  const revealed = input.revealedPileCards ?? {};
  const names = distinct([...Object.keys(input.hiddenPileSizes ?? {}), ...Object.keys(revealed)]);
  const faceupIds = faceupEvidenceOf(input);
  const asView = (id: CardId): EvidenceCardView => cardOnly(id, lookup);
  const piles = names.map((pile): EvidencePileView => ({
    pile,
    title: pileTitleOf(pile),
    hiddenCount: input.hiddenPileSizes?.[pile] ?? 0,
    faceup: (revealed[pile] ?? []).map(asView),
  }));
  const answer = answerOf(input.accusation, lookup);
  const solved = input.accusation?.mole !== undefined;
  const gridView = evidenceGridOf(grid, faceupIds, lookup);
  const status = solved ? "The mole is unmasked" : `${gridView.openCount} of ${gridView.total} combinations open`;
  return { piles, gained: faceupIds.map(asView), grid: gridView, answer, solved, status };
}

function cardOnly(id: CardId, lookup: CardLookup): EvidenceCardView {
  const card = lookup(id);
  const kind = card && "evidence" in card ? (card as { evidence?: string }).evidence : undefined;
  return {
    cardId: id,
    name: card?.name ?? String(id),
    kind: kind === "means" || kind === "motive" || kind === "opportunity" ? kind : null,
    faceup: true,
  };
}
