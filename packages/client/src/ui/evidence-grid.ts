/**
 * Draws the Baron Zemo evidence grid (`view/evidence-model.ts`, `view/evidence-layout.ts`): three means blocks, each a
 * 3 by 3 of motive rows and opportunity columns, every cell the Board Member that combination names. A cell is
 * always text: "MED" while the row is open, a cross and its dimmed code once faceup evidence has crossed it out, so
 * nothing rests on color. Used by the accuse sheet (cells are the choice) and the Evidence overlay (read only).
 */

import type Phaser from "phaser";
import type { CardId } from "@mc/content";
import { accent, ink, signal, surface, typeRole } from "../tokens.js";
import { textStyle } from "./theme.js";
import { fitText, fitWrapped, paintPanel } from "./widgets.js";
import type { Rect } from "../view/layout.js";
import { evidenceGridLayout } from "../view/evidence-layout.js";
import type { BoardMemberKey, EvidenceCardView, EvidenceGridView } from "../view/evidence-model.js";

export type CellMark = "accused" | "mole";

export interface EvidenceGridOptions {
  /** The picked row, ringed and filled. */
  readonly selected?: string | null;
  /** Open cells answer a tap (the accuse sheet). Without it every cell is only information. */
  readonly onCell?: (rowId: string) => void;
  /** A name strip or header was tapped: open that card in Inspect. */
  readonly onInspect: (cardId: CardId) => void;
  /** Rows to flag after the accusation. */
  readonly marks?: ReadonlyMap<string, CellMark>;
}

export interface DrawnEvidenceGrid {
  readonly cellRects: ReadonlyMap<string, Rect>;
  readonly cardRects: ReadonlyMap<CardId, Rect>;
  /** Every game object drawn, for the caller to destroy or animate. */
  readonly objects: readonly Phaser.GameObjects.GameObject[];
}

/** "✕ Money" for evidence that is faceup, so the cross-out shows in the header too. */
const headText = (card: EvidenceCardView): string => (card.faceup ? `✕ ${card.name}` : card.name);

export function drawEvidenceGrid(
  scene: Phaser.Scene,
  rect: Rect,
  view: EvidenceGridView,
  options: EvidenceGridOptions,
): DrawnEvidenceGrid {
  const first = scene.children.list.length;
  const layout = evidenceGridLayout(rect, view.blocks.length);
  const cellRects = new Map<string, Rect>();
  const cardRects = new Map<CardId, Rect>();
  const g = scene.add.graphics();

  const zone = (area: Rect, onPress: () => void): void => {
    scene.add
      .zone(area.x, area.y, area.width, area.height)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", onPress);
  };
  const header = (area: Rect, card: EvidenceCardView, size: number, lines: number, align: "left" | "center"): void => {
    const pad = 4;
    const text = scene.add.text(0, 0, headText(card), {
      ...textStyle(typeRole.rowTitle, surface.ink.hex, card.faceup ? ink.label : 1),
      align,
    });
    text.setFontSize(size);
    if (lines === 1) fitText(text, area.width - pad * 2, size);
    else fitWrapped(text, area.width - pad * 2, lines, size);
    text.setOrigin(align === "center" ? 0.5 : 0, 0.5);
    text.setPosition(align === "center" ? area.x + area.width / 2 : area.x + pad, area.y + area.height / 2);
    cardRects.set(card.cardId, area);
    zone(area, () => options.onInspect(card.cardId));
  };

  view.blocks.forEach((block, index) => {
    const places = layout.blocks[index];
    if (!places) return;
    paintPanel(g, places.rect, "card", "rest");

    // The means strip: ink bar with the card's name, FACEUP flagged in text.
    g.fillStyle(surface.ink.hex, 1).fillRect(places.title.x, places.title.y, places.title.width, places.title.height);
    const titleText = scene.add
      .text(
        0,
        0,
        `${block.means.faceup ? "✕ " : ""}${block.means.name}`,
        textStyle(typeRole.rowTitle, surface.paper.hex),
      )
      .setOrigin(0, 0.5);
    const tag = block.means.faceup ? "FACEUP" : "MEANS";
    const tagText = scene.add
      .text(
        places.title.x + places.title.width - 6,
        places.title.y + places.title.height / 2,
        tag,
        textStyle(
          typeRole.label,
          block.means.faceup ? signal.caution.hex : surface.paper.hex,
          block.means.faceup ? 1 : ink.secondary,
        ),
      )
      .setOrigin(1, 0.5);
    titleText.setPosition(places.title.x + 6, places.title.y + places.title.height / 2);
    fitText(titleText, Math.max(40, tagText.x - tagText.width - 8 - titleText.x), 12);
    cardRects.set(block.means.cardId, places.title);
    zone(places.title, () => options.onInspect(block.means.cardId));

    block.opportunities.forEach((card, column) => header(places.columnHeads[column]!, card, 10, 2, "center"));
    block.motives.forEach((card, row) => header(places.rowHeads[row]!, card, 10, 2, "left"));

    block.cells.forEach((line, row) =>
      line.forEach((cell, column) => {
        const area = places.cells[row]?.[column];
        if (!cell || !area) return;
        cellRects.set(cell.rowId, area);
        const picked = options.selected === cell.rowId;
        const mark = options.marks?.get(cell.rowId);
        const box = { x: area.x + 2, y: area.y + 2, width: area.width - 4, height: area.height - 4 };
        if (picked) {
          g.fillStyle(surface.ink.hex, 1).fillRect(box.x, box.y, box.width, box.height);
          g.lineStyle(3, accent.heroRed.hex, 1).strokeRect(box.x - 1, box.y - 1, box.width + 2, box.height + 2);
        } else if (cell.open) {
          g.fillStyle(surface.card.hex, 1).fillRect(box.x, box.y, box.width, box.height);
          g.lineStyle(2, surface.ink.hex, 1).strokeRect(box.x, box.y, box.width, box.height);
        } else {
          g.fillStyle(surface.parchment.hex, 1).fillRect(box.x, box.y, box.width, box.height);
          g.lineStyle(1, surface.ink.hex, ink.disabled).strokeRect(box.x, box.y, box.width, box.height);
        }
        if (mark) {
          g.lineStyle(3, accent.heroRed.hex, 1).strokeRect(box.x - 1, box.y - 1, box.width + 2, box.height + 2);
        }
        const word = mark === "mole" ? `${cell.code} MOLE` : mark === "accused" ? `${cell.code} ACC.` : cell.code;
        const label = scene.add
          .text(
            area.x + area.width / 2,
            area.y + area.height / 2,
            cell.open || mark ? (picked ? `✓ ${cell.code}` : word) : `✕ ${cell.code}`,
            textStyle(
              typeRole.emphasis,
              picked ? surface.paper.hex : surface.ink.hex,
              cell.open || picked || mark ? 1 : ink.illegal,
            ),
          )
          .setOrigin(0.5);
        fitText(label, box.width - 4, 12);
        if (cell.open && options.onCell) {
          const press = options.onCell;
          zone(area, () => press(cell.rowId));
        }
      }),
    );
  });

  const objects = scene.children.list.slice(first);
  return { cellRects, cardRects, objects };
}

/**
 * The Board Member key under the grid: each code, its name and how many rows it still holds, one tappable strip per
 * member (Inspect opens the card). Returns each strip's rect by card id, for keyboard focus.
 */
export function drawBoardMemberKey(
  scene: Phaser.Scene,
  rect: Rect,
  members: readonly BoardMemberKey[],
  onInspect: (cardId: CardId) => void,
): ReadonlyMap<CardId, Rect> {
  const rects = new Map<CardId, Rect>();
  const gap = 8;
  const width = (rect.width - gap * (members.length - 1)) / Math.max(1, members.length);
  const g = scene.add.graphics();
  members.forEach((member, index) => {
    const strip: Rect = { x: rect.x + index * (width + gap), y: rect.y, width, height: rect.height };
    g.fillStyle(surface.parchment.hex, 1).fillRect(strip.x, strip.y, strip.width, strip.height);
    g.lineStyle(1, surface.ink.hex, ink.label).strokeRect(strip.x, strip.y, strip.width, strip.height);
    const text = scene.add
      .text(
        strip.x + 6,
        strip.y + strip.height / 2,
        `${member.code}  ${member.name} · ${member.open} open`,
        textStyle(typeRole.emphasis, surface.ink.hex),
      )
      .setOrigin(0, 0.5);
    fitText(text, strip.width - 12, 11);
    scene.add
      .zone(strip.x, strip.y, strip.width, strip.height)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => onInspect(member.cardId));
    rects.set(member.cardId, strip);
  });
  return rects;
}
