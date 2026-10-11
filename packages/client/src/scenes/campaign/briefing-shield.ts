/**
 * The Briefing's case file (Agents of S.H.I.E.L.D., MC50 pp. 5, 6 and 24), drawn: the evidence the players hold as card
 * pictures (each opens Inspect), how many combinations are still open, the Executive Board's secrets and which members
 * are attachments now, the numbers the next Setups read, and in an expert campaign each seat's hit points. Plain
 * drawing over `ShieldBriefing` (`view/campaign-shield-model.ts`); it never reads the sealed A.I.M. envelope.
 */
import { accent, ink, signal, surface, typeRole } from "../../tokens.js";
import { ruleHeading } from "../../ui/campaign-chrome.js";
import { textStyle } from "../../ui/theme.js";
import { fitText, label } from "../../ui/widgets.js";
import type { PickCard } from "../../view/campaign-briefing-model.js";
import type { ShieldBriefing, ShieldCard } from "../../view/campaign-shield-model.js";
import type { Rect } from "../../view/layout.js";
import { drawPickCardArt } from "./briefing-pick-cards.js";
import type { SideSchemeDrawContext } from "./briefing-side-scheme.js";

const GAP = 8;

/** A line of body text at (x, y), wrapped to `width`; returns its bottom edge. */
function paragraph(
  ctx: SideSchemeDrawContext,
  x: number,
  y: number,
  width: number,
  text: string,
  options: { readonly size?: number; readonly bold?: boolean; readonly color?: number } = {},
): number {
  const line = ctx.scene.add
    .text(
      x,
      y,
      text,
      textStyle(options.bold ? typeRole.rowTitle : typeRole.body, options.color ?? surface.ink.hex, ink.secondary),
    )
    .setOrigin(0, 0)
    .setFontSize(options.size ?? 12)
    .setWordWrapWidth(width);
  return y + line.height + 4;
}

/**
 * A wrapped row of card pictures with a few words under each; returns the bottom edge. Every picture opens Inspect and
 * is its own focus stop. `captions` are one short line (text, never color alone) such as "3 secrets" or "ATTACHMENT".
 */
function cardRow(
  ctx: SideSchemeDrawContext,
  top: number,
  cards: readonly (ShieldCard & { readonly caption: string })[],
  keyBase: string,
): number {
  const { scene, rect, phone } = ctx;
  const width = phone ? 78 : 104;
  const height = Math.round(width * 1.4);
  const perRow = Math.max(1, Math.floor((rect.width + GAP) / (width + GAP)));
  let bottom = top;
  cards.forEach((card, index) => {
    const column = index % perRow;
    const row = Math.floor(index / perRow);
    const x = rect.x + column * (width + GAP);
    const y = top + row * (height + 34 + GAP);
    const art: Rect = { x, y, width, height };
    const pick: PickCard = { key: "card", caption: "", cardId: card.cardId, name: card.name, shape: "portrait" };
    drawPickCardArt(scene, art, pick, `${keyBase}-${index}`, ctx.stops, () =>
      ctx.inspect({ cardId: card.cardId, name: card.name }),
    );
    const caption = scene.add
      .text(x, y + height + 3, card.caption, textStyle(typeRole.label, surface.ink.hex, ink.secondary))
      .setOrigin(0, 0)
      .setFontSize(10)
      .setWordWrapWidth(width);
    // A single long word ("OPPORTUNITY", "ATTACHMENT") cannot wrap, so the type steps down until it fits its picture,
    // never cut with an ellipsis (`fitText` would, below its own floor).
    for (let size = 10; caption.width > width && size > 7; size--) caption.setFontSize(size - 1);
    bottom = Math.max(bottom, y + height + 3 + caption.height);
  });
  return bottom;
}

/** Draws the case file below `top` and returns its bottom edge. */
export function drawShieldBriefing(ctx: SideSchemeDrawContext, top: number, brief: ShieldBriefing): number {
  const { scene, rect } = ctx;
  let y = ruleHeading(scene, rect.x, top, rect.width, "The case file", surface.ink.hex, 20) + 2;

  // Evidence: the cards the players hold, then what they have narrowed.
  y +=
    label(scene, rect.x, y, `EVIDENCE · ${brief.evidence.length} GAINED`, typeRole.label, accent.heroRed.hex, 1)
      .height + 4;
  if (brief.evidence.length > 0) {
    y = cardRow(
      ctx,
      y,
      brief.evidence.map((card) => ({ ...card, caption: card.kind.toUpperCase() })),
      "shield-evidence",
    );
    y += 6;
  }
  y = paragraph(
    ctx,
    rect.x,
    y,
    rect.width,
    `${brief.rowsOpen} of ${brief.rowsTotal} combinations still open. The A.I.M. envelope holds ${brief.sealedCount} sealed cards, one of each kind.`,
  );
  y = paragraph(
    ctx,
    rect.x,
    y,
    rect.width,
    brief.members.map((member) => `${member.name.replace(/^Chief\s+/i, "")}: ${member.open} open`).join(" · "),
    { size: 11, color: surface.ink.hex },
  );

  // The Executive Board.
  y += 8;
  const heading =
    brief.boardAfter === null
      ? "EXECUTIVE BOARD · NOT YET RECORDED"
      : `EXECUTIVE BOARD · AFTER SCENARIO #${brief.boardAfter}`;
  y += label(scene, rect.x, y, heading, typeRole.label, accent.heroRed.hex, 1).height + 4;
  if (brief.board.length > 0) {
    y = cardRow(
      ctx,
      y,
      brief.board.map((member) => ({
        cardId: member.cardId,
        name: member.name,
        caption: `${member.attachment ? "ATTACHMENT · " : ""}${member.secrets} ${member.secrets === 1 ? "secret" : "secrets"}`,
      })),
      "shield-board",
    );
    y += 6;
  }
  y = paragraph(ctx, rect.x, y, rect.width, brief.flipNote, { size: 11, color: surface.ink.hex });

  // What the next Setups read.
  if (brief.numbers.length > 0) {
    y += 8;
    y += label(scene, rect.x, y, "CARRIED OVER", typeRole.label, accent.heroRed.hex, 1).height + 4;
    for (const row of brief.numbers) {
      const text = scene.add
        .text(
          rect.x,
          y,
          `${row.label}: ${row.value}  (${row.usedIn})`,
          textStyle(typeRole.body, surface.ink.hex, ink.secondary),
        )
        .setOrigin(0, 0)
        .setFontSize(12)
        .setWordWrapWidth(rect.width);
      y += text.height + 4;
    }
  }

  // Expert: who is hurt, and who has to pay to come back.
  if (brief.seats.length > 0) {
    y += 8;
    y += label(scene, rect.x, y, "EXPERT · HIT POINTS", typeRole.label, accent.heroRed.hex, 1).height + 4;
    for (const seat of brief.seats) {
      const color = seat.sitsOut ? signal.caution.hex : surface.ink.hex;
      const text = scene.add
        .text(rect.x, y, `${seat.heroName}: ${seat.status}`, textStyle(typeRole.body, color, ink.secondary))
        .setOrigin(0, 0)
        .setFontSize(12);
      fitText(text, rect.width, 12);
      y += text.height + 4;
    }
  }
  return y;
}
