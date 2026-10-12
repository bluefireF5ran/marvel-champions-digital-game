/**
 * The cards tucked under a wide character panel (Silk's identity holds up to four): an "UNDER n" strip over a row of
 * small cards, each its own tap target that opens Inspect and steps through the rest. A card tucked facedown is a card
 * back, never named. Environments use their own fan (`zones.ts`); a card-shaped tile (a minion, an ally) shows the count
 * strip alone and opens the first on a tap.
 */

import type { InstanceId } from "@mc/engine";
import { drawArt } from "../../art/card-art.js";
import { surface, typeRole } from "../../tokens.js";
import { textStyle } from "../../ui/theme.js";
import type { CharacterPanel } from "../../view/board-model.js";
import { CARD_ASPECT, type Rect } from "../../view/layout.js";
import { tuckedRowLayout } from "../../view/tucked-row-layout.js";
import type { BoardDrawContext } from "./context.js";
import { drawFootStrip } from "./character-panel.js";

export interface TuckedRowDrawn {
  /** The height the header and row used; 0 when `room` cannot hold even a readable row (nothing was drawn). */
  readonly height: number;
  /** Registers the cards' tap targets: called after the panel's own, so a tap on a tucked card is not swallowed by it. */
  readonly addTapTargets: () => void;
}

/** Draws the header and the row in `room`. */
export function drawTuckedRow(
  ctx: BoardDrawContext,
  room: Rect,
  panel: Pick<CharacterPanel, "tucked" | "tuckedCount">,
  dim: number,
  /** The header's words when not "UNDER n" (a main scheme's "Defeated allies, facedown: 2"). */
  headerText?: string,
): TuckedRowDrawn {
  const layout = tuckedRowLayout(room, panel.tuckedCount, CARD_ASPECT);
  if (!layout) return { height: 0, addTapTargets: () => {} };
  const { scene } = ctx;
  drawFootStrip(scene, layout.header, headerText ?? `UNDER ${panel.tuckedCount}`, "note", dim);
  const siblings: readonly InstanceId[] = panel.tucked.map((card) => card.instanceId);
  panel.tucked.forEach((card, index) => {
    const rect = layout.cards[index]!;
    const back = scene.add.graphics();
    back.fillStyle(surface.ink.hex, dim).fillRect(rect.x - 1, rect.y - 1, rect.width + 2, rect.height + 2);
    back.fillStyle(surface.paper.hex, dim).fillRect(rect.x, rect.y, rect.width, rect.height);
    const art = card.faceup ? card.art : null;
    const drawn = drawArt(scene, ctx.art.request(scene, art), rect, { fit: "cover", alpha: dim }) !== null;
    if (!drawn) {
      const initial = scene.add
        .text(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
          card.faceup ? card.name.charAt(0) : "?",
          textStyle(typeRole.label, surface.ink.hex, dim),
        )
        .setOrigin(0.5);
      scene.children.bringToTop(initial);
    }
  });
  return {
    height: layout.height,
    addTapTargets: () => {
      panel.tucked.forEach((card, index) =>
        ctx.makeTapTarget(layout.cards[index]!, card.instanceId, () => ctx.inspect(card.instanceId, siblings)),
      );
    },
  };
}
