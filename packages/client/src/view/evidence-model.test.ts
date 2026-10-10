import { readFileSync } from "node:fs";
import { AOS_EVIDENCE_COMBINATIONS } from "@mc/content";
import { evidenceRowId, openEvidenceRows, type PendingChoice } from "@mc/engine";
import { describe, expect, test } from "vitest";
import { CARDS_BY_ID } from "../content/pool.js";
import {
  accuseSheetOf,
  boardMemberCodes,
  evidenceBoardOf,
  evidenceGridOf,
  evidenceInputOf,
  type CardLookup,
} from "./evidence-model.js";

const lookup: CardLookup = (id) => CARDS_BY_ID.get(id as string);
const GRID = AOS_EVIDENCE_COMBINATIONS;
const cardId = (code: string) => code as (typeof GRID)[number]["means"];

describe("evidenceGridOf", () => {
  test("three blocks of a 3 by 3, every row open, nine rows per Board Member", () => {
    const view = evidenceGridOf(GRID, [], lookup);
    expect(view.blocks).toHaveLength(3);
    expect(view.blocks.map((block) => block.means.name)).toEqual(["Medical Records", "Wiretap", "Security Scanner"]);
    for (const block of view.blocks) {
      expect(block.motives).toHaveLength(3);
      expect(block.opportunities).toHaveLength(3);
      expect(block.cells.flat().every((cell) => cell !== null && cell.open)).toBe(true);
    }
    expect(view.total).toBe(27);
    expect(view.openCount).toBe(27);
    expect(view.members.map((member) => [member.code, member.open])).toEqual([
      ["MED", 9],
      ["SUR", 9],
      ["TAC", 9],
    ]);
  });

  test("faceup evidence crosses out exactly the rows the engine says are crossed out", () => {
    const faceup = [cardId("50185"), cardId("50192")]; // Medical Records, Travel
    const view = evidenceGridOf(GRID, faceup, lookup);
    const open = new Set(openEvidenceRows({ revealedPileCards: { shield: faceup } }, GRID).map(evidenceRowId));
    const cells = view.blocks.flatMap((block) => block.cells.flat()).filter((cell) => cell !== null);
    expect(cells.filter((cell) => cell.open).map((cell) => cell.rowId)).toEqual([...open]);
    expect(view.openCount).toBe(open.size);
    // The faceup cards say so in the headers, so the cross-out never rests on the cells' look alone.
    expect(view.blocks[0]!.means.faceup).toBe(true);
    expect(view.blocks[1]!.opportunities.find((card) => card.name === "Travel")?.faceup).toBe(true);
    expect(view.members.reduce((sum, member) => sum + member.open, 0)).toBe(open.size);
  });

  test("Board Member codes are text and distinct", () => {
    expect(boardMemberCodes(["Chief Medical Officer", "Chief Surveillance Officer", "Chief Tactical Officer"])).toEqual(
      ["MED", "SUR", "TAC"],
    );
    expect(boardMemberCodes(["Chief Medical Officer", "Chief Medical Advisor"])).toEqual(["A", "B"]);
  });
});

/** An accuse prompt shaped as the engine raises it: one option per open row, in the grid's order. */
function accuseChoice(crossedOut: readonly string[]): Pick<PendingChoice, "prompt" | "options"> {
  const crossed = crossedOut.map(cardId);
  const open = openEvidenceRows({ revealedPileCards: { shield: crossed } }, GRID);
  return {
    prompt: { kind: "accuse", grid: GRID, crossedOut: crossed },
    options: open.map((row) => ({
      optionId: evidenceRowId(row),
      label: "row",
      ref: { kind: "cardDefinition", cardId: row.boardMember },
    })),
  } as unknown as Pick<PendingChoice, "prompt" | "options">;
}

describe("accuseSheetOf", () => {
  test("is null for any other prompt", () => {
    const other = { prompt: { kind: "chooseOption" }, options: [] } as unknown as Pick<
      PendingChoice,
      "prompt" | "options"
    >;
    expect(accuseSheetOf(other, [], lookup)).toBeNull();
  });

  test("a cell is selectable only when the engine offered its row; nothing picked cannot confirm", () => {
    const choice = accuseChoice(["50185", "50192"]);
    const sheet = accuseSheetOf(choice, [], lookup)!;
    const selectable = sheet.grid.blocks.flatMap((block) => block.cells.flat()).filter((cell) => cell?.open);
    expect(selectable.map((cell) => cell!.rowId)).toEqual(choice.options.map((option) => option.optionId));
    expect(sheet.openCount).toBe(choice.options.length);
    expect(sheet.total).toBe(27);
    expect(sheet.canConfirm).toBe(false);
    expect(sheet.selected).toBeNull();
  });

  test("the picked row names its four cards; a pick the engine did not offer is no pick", () => {
    const choice = accuseChoice(["50185", "50192"]);
    const offered = choice.options[0]!.optionId;
    const sheet = accuseSheetOf(choice, [offered], lookup)!;
    expect(sheet.canConfirm).toBe(true);
    expect(sheet.selectedCards).toHaveLength(4);
    expect(sheet.selectedCards.map((card) => card.kind)).toEqual(["means", "motive", "opportunity", null]);
    expect(sheet.summary).toContain(":");
    // 50185+50188+50191 is crossed out (Medical Records is faceup): it is not an option.
    const crossedRow = "50185+50188+50191";
    expect(choice.options.some((option) => option.optionId === crossedRow)).toBe(false);
    expect(accuseSheetOf(choice, [crossedRow], lookup)!.canConfirm).toBe(false);
  });
});

describe("evidenceBoardOf", () => {
  const sealed = {
    hiddenPileSizes: { aim: 3, shield: 4 },
    revealedPileCards: { shield: [cardId("50185"), cardId("50192")] },
  };

  test("a hidden pile is a size only; the gained cards are faceup and cross rows out", () => {
    const view = evidenceBoardOf(sealed, GRID, lookup);
    expect(view.piles.map((pile) => [pile.title, pile.hiddenCount, pile.faceup.map((card) => card.name)])).toEqual([
      ["A.I.M. envelope", 3, []],
      ["S.H.I.E.L.D. envelope", 4, ["Medical Records", "Travel"]],
    ]);
    expect(view.gained.map((card) => card.name)).toEqual(["Medical Records", "Travel"]);
    expect(view.answer).toBeNull();
    expect(view.solved).toBe(false);
    expect(view.status).toMatch(/combinations open/);
  });

  test("after the accusation the answer, the verdict and the mole's row are there", () => {
    const accused = GRID.find((row) => evidenceRowId(row) === "50186+50188+50191")!;
    const mole = GRID.find((row) => evidenceRowId(row) === "50187+50190+50193")!;
    const view = evidenceBoardOf(
      {
        hiddenPileSizes: { shield: 4 },
        revealedPileCards: {
          shield: [cardId("50185"), cardId("50192")],
          aim: [cardId("50187"), cardId("50190"), cardId("50193")],
        },
        accusation: { accused, mole, wrong: ["means", "boardMember"] },
      },
      GRID,
      lookup,
    );
    expect(view.solved).toBe(true);
    expect(view.piles.find((pile) => pile.pile === "aim")).toMatchObject({ hiddenCount: 0 });
    expect(view.answer?.moleLine).toBe("Security Scanner, Ideology, Authority: Chief Tactical Officer");
    expect(view.answer?.accusedLine).toBe("Wiretap, Money, Security Clearance: Chief Medical Officer");
    expect(view.answer?.verdict).toBe("2 wrong: means, Board Member");
    expect(view.status).toBe("The mole is unmasked");
  });

  test("a right accusation says so", () => {
    const row = GRID[0]!;
    const view = evidenceBoardOf(
      {
        revealedPileCards: { aim: [row.means, row.motive, row.opportunity] },
        accusation: { accused: row, mole: row, wrong: [] },
      },
      GRID,
      lookup,
    );
    expect(view.answer?.verdict).toBe("Every guess was right");
  });
});

describe("hidden information", () => {
  test("no function of the view model reads a hidden pile's contents", () => {
    const source = readFileSync(new URL("./evidence-model.ts", import.meta.url), "utf8");
    // Comments may name the field; code may not reach for it.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\.hiddenPiles\b|hiddenPiles\s*[?:]/);
    expect(code).toMatch(/sealHiddenPiles/);
  });
});

// Keep `evidenceInputOf` honest against a real state: see `store/dev-zemo-game.test.ts`.
test("evidenceInputOf is null for a game with no evidence", () => {
  expect(evidenceInputOf({ instances: {} } as never)).toBeNull();
});
