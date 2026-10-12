/**
 * The Civil War scenario builder (docs/phase7-wave10-client.md section 2): five steps (side, leader, main scheme, modular
 * sets, review and play) over one draft. A thin view: `view/civil-war-builder-model.ts` decides every row, tile, reason and
 * action string, `view/civil-war-builder-layout.ts` every rectangle, and `@mc/cards`' offer (through the model) every
 * refusal. This scene draws them, sends the action string a tap or key names to `applyBuilderAction`, and carries out the
 * navigation effects it returns. It counts nothing and checks no side or stage itself.
 *
 * Start hands the draft to Take your seats (docs 2.10), the way Scenario select's "Choose heroes" does. While the Civil War
 * scenarios are not in the client pool (`content/pool.ts`; task C10) the hand-off is `blocked` and says so on the status
 * line rather than starting a game the seats screen cannot build (`view/civil-war-entry.ts#handoffOf`).
 *
 * Scrolling content (the active step) is drawn at the layout's content-space positions inside an `McScrollRegion`; the
 * header, step rail, review column and sticky foot are fixed. Every control is also a focus stop keyed by its action string.
 */
import Phaser from "phaser";
import { CW_CARDS, CW_ENCOUNTER_SETS, CW_SCENARIOS, type AnyCard } from "@mc/content";
import { CARDS_BY_ID, POOL_ENCOUNTER_SETS, POOL_SCENARIOS } from "../content/pool.js";
import { dotGrid, ink, surface, typeRole, type TypeSpec } from "../tokens.js";
import { cssOf, textStyle } from "../ui/theme.js";
import { McButton, fitText, paintDotGrid } from "../ui/widgets.js";
import { McScrollRegion } from "../ui/scroll-region.js";
import { onTap } from "../ui/tap.js";
import { destroyChildren } from "../ui/destroy-children.js";
import { fadeScreenIn, goToScreen } from "../ui/transitions.js";
import { VariableListScroll } from "../view/variable-list-scroll.js";
import type { Rect } from "../view/layout.js";
import {
  applyBuilderAction,
  builderViewOf,
  defaultStatusOf,
  refusalOf,
  type BuilderContext,
  type BuilderView,
  type SetTileView,
} from "../view/civil-war-builder-model.js";
import { civilWarBuilderLayout, type BuilderLayout, type BuilderStep } from "../view/civil-war-builder-layout.js";
import { handoffOf, rememberBuild, type BuilderHandoff } from "../view/civil-war-entry.js";
import { offerOf } from "../view/setup-options.js";
import type { SetupDraft } from "../view/setup-draft.js";
import { FocusRoute, type FocusStop } from "./focus-route.js";
import { SCENES } from "./keys.js";
import type { SeatsData } from "./seats.js";
import type { ScenarioSelectData } from "./scenario-select.js";

export interface CivilWarBuilderData {
  readonly draft: SetupDraft;
  /** The step to open on: the review for "Customize", the side step for "Build your own". */
  readonly step?: BuilderStep;
}

/** Shown when Random is pressed before task C9 supplies the randomizer. */
export const RANDOM_UNAVAILABLE = "Random is not available yet.";

/** The Civil War cards and sets from the content package, over the client pool's (the scenarios join the pool in C10). */
const CARDS: ReadonlyMap<string, AnyCard> = new Map<string, AnyCard>([
  ...CARDS_BY_ID,
  ...CW_CARDS.map((card): [string, AnyCard] => [card.id as string, card]),
]);
const ENCOUNTER_SETS = [...POOL_ENCOUNTER_SETS, ...CW_ENCOUNTER_SETS];

const NAME: TypeSpec = typeRole.rowTitle;
const DETAIL: TypeSpec = typeRole.body;
const HATCH_SPACING = 10;

interface TextOptions {
  readonly width?: number;
  readonly maxLines?: number;
  readonly color?: number;
  readonly alpha?: number;
}

export class CivilWarBuilderScene extends Phaser.Scene {
  #draft!: SetupDraft;
  #step: BuilderStep = 5;
  #status: string | null = null;
  #otherSideExpanded = false;
  #view: BuilderView | null = null;
  #layout: BuilderLayout | null = null;
  #statusShown = "";
  #handoff: BuilderHandoff | null = null;
  #statusText: Phaser.GameObjects.Text | null = null;
  #buttons: McButton[] = [];
  #stops = new Map<string, FocusStop>();
  #region: McScrollRegion | null = null;
  #route: FocusRoute | null = null;
  readonly #scroll = new VariableListScroll();

  constructor() {
    super(SCENES.civilWarBuilder);
  }

  init(data: CivilWarBuilderData): void {
    this.#draft = data.draft;
    this.#step = data.step ?? 5;
    this.#status = null;
    this.#otherSideExpanded = false;
    this.#handoff = null;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(cssOf(surface.paper.hex));
    this.scale.on("resize", this.#rebuild, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.#rebuild, this);
      this.#region?.destroy();
      this.#region = null;
      for (const button of this.#buttons) button.destroy();
      this.#buttons = [];
    });
    this.#route = new FocusRoute(this, {
      blocked: () => false,
      onCancel: () => this.#act("civil:back"),
      // A keyboard or pad user reads a disabled tile's reason by moving onto it.
      onFocusChange: (key) => {
        const reason = key && this.#view ? refusalOf(this.#view, key) : null;
        if (reason !== null) this.#showNotice(reason);
      },
    });
    if (import.meta.env.DEV) this.#publishDebug();
    this.#rebuild();
    fadeScreenIn(this);
  }

  // ---- state ----

  #context(): BuilderContext {
    return {
      cards: CARDS,
      scenarios: CW_SCENARIOS,
      encounterSets: ENCOUNTER_SETS,
      offer: offerOf(this.#draft),
      step: this.#step,
      otherSideExpanded: this.#otherSideExpanded,
      status: this.#status,
      extraSets: 0,
    };
  }

  /** Sends one action string through the model and carries out what it asks of the scene. */
  #act(action: string): void {
    const ctx = this.#context();
    const refusal = this.#view ? refusalOf(this.#view, action) : null;
    const result = applyBuilderAction(this.#draft, action, ctx);
    this.#draft = result.draft;
    this.#status = result.status ?? refusal;
    const effect = result.effect;
    if (effect?.kind === "step") {
      this.#step = effect.step;
      this.#scroll.reset();
    } else if (effect?.kind === "toggleOtherSide") {
      this.#otherSideExpanded = !this.#otherSideExpanded;
    } else if (effect?.kind === "back") {
      this.#leave();
      return;
    } else if (effect?.kind === "start") {
      if (this.#start()) return;
    } else if (effect?.kind === "random") {
      this.#status = RANDOM_UNAVAILABLE;
    }
    this.#rebuild();
  }

  /** True when the scene navigated away. */
  #start(): boolean {
    const view = builderViewOf(this.#draft, this.#context());
    if (!view?.canStart) {
      this.#status = view?.startProblem ?? null;
      return false;
    }
    rememberBuild(this.#draft);
    const handoff = handoffOf(this.#draft, new Set(POOL_SCENARIOS.map((s) => s.id as string)));
    this.#handoff = handoff;
    if (handoff.kind === "blocked") {
      this.#status = handoff.message;
      return false;
    }
    this.scale.off("resize", this.#rebuild, this);
    goToScreen(this, SCENES.seats, { draft: handoff.draft } satisfies SeatsData);
    return true;
  }

  #leave(): void {
    rememberBuild(this.#draft);
    this.scale.off("resize", this.#rebuild, this);
    goToScreen(this, SCENES.scenarioSelect, { draft: this.#draft } satisfies ScenarioSelectData);
  }

  #showNotice(text: string): void {
    this.#status = text;
    this.#statusShown = text;
    this.#statusText?.setText(text);
  }

  // ---- drawing ----

  #rebuild(): void {
    this.#region?.destroy();
    this.#region = null;
    for (const button of this.#buttons) button.destroy();
    this.#buttons = [];
    this.#stops = new Map();
    destroyChildren(this);

    const view = builderViewOf(this.#draft, this.#context());
    if (!view) {
      this.#leave();
      return;
    }
    const { width, height } = this.scale.gameSize;
    const layout = civilWarBuilderLayout({ width, height, ...view.layout });
    this.#view = view;
    this.#layout = layout;

    this.add.rectangle(0, 0, width, height, surface.paper.hex).setOrigin(0, 0);
    paintDotGrid(
      this,
      { x: 0, y: layout.headerBar.height, width, height: height - layout.headerBar.height },
      "paper",
      dotGrid.onPaper,
    );
    this.#drawHeader(view, layout);
    this.#drawContent(view, layout);
    if (layout.rail) this.#drawRail(view, layout);
    if (layout.stepBar) this.#drawStepBar(view, layout);
    if (layout.review) this.#drawSummaryCard(layout.review, view);
    this.#drawFoot(view, layout);
    this.#route?.set(view.focusOrder, this.#stops);
  }

  #text(x: number, y: number, text: string, type: TypeSpec, o: TextOptions = {}): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, {
      ...textStyle(type, o.color ?? surface.ink.hex, o.alpha ?? 1),
      ...(o.width ? { wordWrap: { width: o.width } } : {}),
      ...(o.maxLines ? { maxLines: o.maxLines } : {}),
    });
  }

  /** A tap zone plus its focus stop, keyed by the action string. `scrolls`: the rect is in the scroll region's content space. */
  #control(rect: Rect, action: string, container: Phaser.GameObjects.Container | null): void {
    const zone = this.add
      .zone(rect.x, rect.y, rect.width, rect.height)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    onTap(zone, () => this.#act(action), action);
    container?.add(zone);
    this.#stops.set(
      action,
      container
        ? {
            rect: () => ({ ...rect, y: rect.y - this.#scroll.offsetPx }),
            activate: () => this.#act(action),
            ensureVisible: () => this.#ensureVisible(rect),
          }
        : { rect, activate: () => this.#act(action) },
    );
  }

  #ensureVisible(rect: Rect): void {
    const layout = this.#layout;
    if (!layout || !this.#region) return;
    const top = rect.y - this.#scroll.offsetPx;
    const bottom = top + rect.height;
    const region = layout.content;
    if (top < region.y) this.#region.scrollByPx(top - region.y);
    else if (bottom > region.y + region.height) this.#region.scrollByPx(bottom - (region.y + region.height));
  }

  /** The face of a choice: white card, a thick ink border and a check when chosen, hatching and a padlock when disabled. */
  #card(rect: Rect, state: { selected?: boolean; disabled?: boolean; fill?: number }): void {
    const g = this.add.graphics();
    g.fillStyle(state.disabled ? surface.parchment.hex : (state.fill ?? surface.card.hex), 1).fillRect(
      rect.x,
      rect.y,
      rect.width,
      rect.height,
    );
    if (state.disabled) {
      g.lineStyle(1, surface.ink.hex, ink.disabled);
      for (let d = HATCH_SPACING; d < rect.width + rect.height; d += HATCH_SPACING) {
        const t0 = Math.max(0, d - rect.width);
        const t1 = Math.min(rect.height, d);
        if (t0 < t1) g.lineBetween(rect.x + d - t0, rect.y + t0, rect.x + d - t1, rect.y + t1);
      }
      const lx = rect.x + rect.width - 22;
      const ly = rect.y + 8;
      g.fillStyle(surface.ink.hex, ink.label).fillRect(lx, ly + 8, 14, 10);
      g.lineStyle(2, surface.ink.hex, ink.label)
        .beginPath()
        .arc(lx + 7, ly + 8, 4.5, Math.PI, 0, false)
        .strokePath();
    }
    if (state.selected) {
      g.lineStyle(4, surface.ink.hex, 1).strokeRect(rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4);
      this.add
        .text(rect.x + rect.width - 8, rect.y + 6, "✓", textStyle(typeRole.barTitle, surface.ink.hex))
        .setOrigin(1, 0);
    } else {
      g.lineStyle(1.5, surface.ink.hex, state.disabled ? ink.disabled : ink.label).strokeRect(
        rect.x + 0.75,
        rect.y + 0.75,
        rect.width - 1.5,
        rect.height - 1.5,
      );
    }
  }

  /** Runs `draw`, then reparents everything it just added into `container`. */
  #captureInto(container: Phaser.GameObjects.Container, draw: () => void): void {
    const before = this.children.list.length;
    draw();
    const added = this.children.list.slice(before);
    if (added.length > 0) container.add(added);
  }

  #drawHeader(view: BuilderView, layout: BuilderLayout): void {
    const { width } = this.scale.gameSize;
    this.add.rectangle(0, 0, width, layout.headerBar.height, surface.ink.hex).setOrigin(0, 0);
    const back = (): void => this.#act("civil:back");
    this.#buttons.push(
      new McButton(this, {
        kind: "onInk",
        label: "◂ Back",
        type: typeRole.backLabel,
        rect: layout.back,
        onClick: back,
      }),
    );
    this.#stops.set("civil:back", { rect: layout.back, activate: back });

    // "Show me" (a blind scenario's reveal) sits at the header's right edge on every step.
    let right = layout.title.x + layout.title.width;
    if (view.blind) {
      const show: Rect = { x: right - 110, y: layout.back.y, width: 110, height: layout.back.height };
      right = show.x - 8;
      const reveal = (): void => this.#act("civil:blind:show");
      this.#buttons.push(
        new McButton(this, { kind: "onInk", label: "Show me", type: typeRole.rowTitle, rect: show, onClick: reveal }),
      );
      this.#stops.set("civil:blind:show", { rect: show, activate: reveal });
    }
    const textWidth = Math.max(40, right - layout.title.x);
    const title = layout.mode === "phone" ? `Step ${view.step} · ${view.steps[view.step - 1]!.title}` : view.title;
    const titleText = this.#text(layout.title.x, 6, title, typeRole.barTitle, { color: surface.paper.hex });
    fitText(titleText, textWidth, 20);

    // The status line: the notice from the last action, else the one sentence that reads the whole scenario.
    this.#statusShown = view.statusLine ?? defaultStatusOf(view);
    const status = this.#text(layout.title.x, 30, this.#statusShown, DETAIL, {
      color: surface.paper.hex,
      alpha: ink.secondary,
      width: textWidth,
    });
    for (let size = DETAIL.size; size > 9 && status.height > 34; size--) status.setFontSize(size);
    this.#statusText = status;
  }

  #drawRail(view: BuilderView, layout: BuilderLayout): void {
    view.steps.forEach((step, i) => {
      const rect = layout.stepButtons[i]!;
      this.#card(rect, { selected: step.active, fill: step.active ? surface.card.hex : surface.parchment.hex });
      this.#text(rect.x + 10, rect.y + 8, `${step.step}. ${step.title}`, NAME, { width: rect.width - 40 });
      const line = this.#text(rect.x + 10, rect.y + 28, step.line, DETAIL, {
        alpha: ink.secondary,
        width: rect.width - 20,
        maxLines: 2,
      });
      line.setLineSpacing(0);
      if (!step.complete) this.#text(rect.x + rect.width - 14, rect.y + 8, "!", NAME, { alpha: ink.label });
      this.#control(rect, step.action, null);
    });
  }

  #drawStepBar(view: BuilderView, layout: BuilderLayout): void {
    const bar = layout.stepBar!;
    this.add.rectangle(bar.x, bar.y, bar.width, bar.height, surface.parchment.hex).setOrigin(0, 0);
    view.steps.forEach((step, i) => {
      const rect = layout.stepButtons[i]!;
      if (step.active) this.add.rectangle(rect.x, rect.y, rect.width, rect.height, surface.ink.hex).setOrigin(0, 0);
      const mark = step.complete ? `${step.step}` : `${step.step}!`;
      this.add
        .text(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
          mark,
          textStyle(typeRole.barTitle, step.active ? surface.paper.hex : surface.ink.hex),
        )
        .setOrigin(0.5);
      this.#control(rect, step.action, null);
    });
    const g = this.add.graphics();
    g.lineStyle(1.5, surface.ink.hex, ink.label).lineBetween(bar.x, bar.y, bar.x + bar.width, bar.y);
  }

  #drawFoot(view: BuilderView, layout: BuilderLayout): void {
    const { width } = this.scale.gameSize;
    const foot = layout.foot;
    this.add.rectangle(0, foot.y, width, foot.height, surface.paper.hex).setOrigin(0, 0);
    this.add.graphics().lineStyle(2, surface.ink.hex, 1).lineBetween(0, foot.y, width, foot.y);
    const button = (
      rect: Rect,
      label: string,
      action: string,
      kind: "primary" | "secondary",
      enabled = true,
      reason?: string,
    ): void => {
      const run = (): void => this.#act(action);
      this.#buttons.push(
        new McButton(this, {
          kind,
          label,
          type: kind === "primary" ? typeRole.barTitle : typeRole.rowTitle,
          rect,
          onClick: run,
          enabled,
          ...(reason ? { reason } : {}),
        }),
      );
      this.#stops.set(action, { rect, activate: run });
    };
    button(layout.random, "Random", "civil:random", "secondary");
    button(layout.randomBlind, "Random and blind", "civil:random-blind", "secondary");
    button(
      layout.start,
      "Continue to heroes ▸",
      "civil:start",
      "primary",
      view.canStart,
      view.startProblem ?? undefined,
    );
  }

  #drawContent(view: BuilderView, layout: BuilderLayout): void {
    const region = new McScrollRegion(this, {
      rect: layout.content,
      heights: [layout.contentHeight],
      scroll: this.#scroll,
      clipInteractive: true,
    });
    this.#region = region;
    const container = region.content;
    this.#captureInto(container, () => {
      if (view.step === 1) this.#drawSides(view, layout, container);
      else if (view.step === 2) this.#drawLeaders(view, layout, container);
      else if (view.step === 3) this.#drawStages(view, layout, container);
      else if (view.step === 4) this.#drawSets(view, layout, container);
      else this.#drawReview(view, layout, container);
    });
    region.refresh();
    region.syncInteractivity();
  }

  #drawSides(view: BuilderView, layout: BuilderLayout, container: Phaser.GameObjects.Container): void {
    view.sideChoices.forEach((side, i) => {
      const rect = layout.choiceCards[i]!;
      this.#card(rect, { selected: side.selected });
      // A distinct shape per side, never colour alone: a square for one, a triangle for the other.
      const g = this.add.graphics();
      g.fillStyle(surface.ink.hex, 1);
      if (i === 0) g.fillRect(rect.x + 16, rect.y + 16, 22, 22);
      else g.fillTriangle(rect.x + 16, rect.y + 38, rect.x + 38, rect.y + 38, rect.x + 27, rect.y + 16);
      this.#text(rect.x + 50, rect.y + 14, side.name, typeRole.barTitle);
      this.#text(rect.x + 16, rect.y + 62, "LEADERS", typeRole.label, { alpha: ink.label });
      this.#text(rect.x + 16, rect.y + 80, side.leaderNames.join(" · "), NAME, { width: rect.width - 32 });
      this.#control(rect, side.action, container);
    });
  }

  #drawLeaders(view: BuilderView, layout: BuilderLayout, container: Phaser.GameObjects.Container): void {
    view.leaderChoices.forEach((leader, i) => {
      const rect = layout.choiceCards[i]!;
      this.#card(rect, { selected: leader.selected });
      this.#text(rect.x + 16, rect.y + 12, leader.name, typeRole.barTitle, { width: rect.width - 60 });
      this.#text(rect.x + 16, rect.y + 40, leader.word, typeRole.label, { alpha: ink.label });
      leader.stages.forEach((stage, j) =>
        this.#text(rect.x + 16, rect.y + 58 + j * 16, `Stage ${stage.numeral}: ${stage.hp} HP`, DETAIL, {
          width: rect.width - 32,
        }),
      );
      if (view.expertNote)
        this.#text(rect.x + 16, rect.y + 94, view.expertNote, DETAIL, {
          alpha: ink.secondary,
          width: rect.width - 32,
          maxLines: 2,
        });
      this.#text(rect.x + 16, rect.y + rect.height - 26, `Always in: ${leader.ownSet}`, NAME, {
        width: rect.width - 32,
        maxLines: 1,
      });
      this.#control(rect, leader.action, container);
    });
  }

  #drawStages(view: BuilderView, layout: BuilderLayout, container: Phaser.GameObjects.Container): void {
    view.stageRows.forEach((row, i) => {
      const geometry = layout.stageRows[i]!;
      this.#text(geometry.label.x, geometry.label.y + 4, row.label, typeRole.label, { alpha: ink.label });
      if (row.hidden) {
        this.#text(geometry.label.x, geometry.label.y + 30, "Stage 2: hidden", NAME);
        return;
      }
      row.options.forEach((option, j) => {
        const rect = geometry.cards[j]!;
        this.#card(rect, { selected: option.selected });
        this.#text(rect.x + 8, rect.y + 6, option.name, NAME, { width: rect.width - 40, maxLines: 2 });
        const threat = this.#text(
          rect.x + 8,
          rect.y + 38,
          `${option.targetThreat}${option.recommended ? " · Recommended" : ""}`,
          typeRole.label,
          { alpha: ink.secondary },
        );
        fitText(threat, rect.width - 16, typeRole.label.size);
        this.#text(rect.x + 8, rect.y + 54, option.gist, DETAIL, {
          width: rect.width - 16,
          maxLines: 2,
          alpha: ink.secondary,
        });
        this.#control(rect, option.action, container);
      });
    });
    this.#text(layout.stageSummary.x, layout.stageSummary.y + 4, view.stageSummary || "Stage 2 is hidden.", NAME, {
      width: layout.stageSummary.width,
    });
  }

  #drawTile(rect: Rect, tile: SetTileView, container: Phaser.GameObjects.Container): void {
    this.#card(rect, { selected: tile.selected, disabled: !tile.enabled });
    // "Recommended" is its own line above the name, so a narrow tile never cuts it.
    if (tile.recommended) this.#text(rect.x + 8, rect.y + 4, "Recommended", typeRole.label, { alpha: ink.secondary });
    this.#text(rect.x + 8, rect.y + (tile.recommended ? 16 : 6), tile.name, NAME, {
      width: rect.width - 40,
      maxLines: 2,
    });
    const detail = [`${tile.cardCount} cards`, tile.descriptor].filter((x): x is string => Boolean(x)).join(" · ");
    const line = this.#text(rect.x + 8, rect.y + rect.height - 18, detail, typeRole.label, { alpha: ink.secondary });
    fitText(line, rect.width - 16, typeRole.label.size);
    this.#control(rect, tile.action, container);
  }

  #drawSets(view: BuilderView, layout: BuilderLayout, container: Phaser.GameObjects.Container): void {
    const counter = view.modular.hidden
      ? `${view.modular.chosen} modular sets chosen, hidden.`
      : `${view.modular.counterLine}${view.modular.hint ? ` ${view.modular.hint}.` : ""}`;
    this.#text(layout.modularCounter.x, layout.modularCounter.y + 4, counter, NAME, {
      width: layout.modularCounter.width,
    });
    for (const section of layout.modularSections) {
      const data = view.modular.sections.find((s) => s.key === section.key);
      if (!data) continue;
      if (section.key === "otherSide") {
        const rect = section.label;
        this.#card(rect, { fill: surface.parchment.hex });
        const text = data.expanded
          ? `▾ ${data.label}: not used with this leader`
          : `▸ ${data.collapsedLine ?? data.label}`;
        const line = this.#text(rect.x + 10, rect.y + rect.height / 2, text, NAME, { width: rect.width - 20 });
        line.setOrigin(0, 0.5);
        this.#control(rect, "civil:other-side", container);
      } else {
        this.#text(section.label.x, section.label.y + 4, data.label, typeRole.label, { alpha: ink.label });
      }
      data.tiles.forEach((tile, i) => {
        const rect = section.tiles[i];
        if (rect) this.#drawTile(rect, tile, container);
      });
    }
  }

  #drawSummary(rect: Rect, view: BuilderView): void {
    let y = rect.y + 10;
    for (const line of view.summary) {
      const t = this.#text(rect.x + 12, y, line, DETAIL, {
        alpha: line === view.summary[0] ? 1 : ink.secondary,
        width: rect.width - 24,
      });
      y += t.height + 3;
    }
    if (view.expertNote) {
      this.#text(rect.x + 12, y, view.expertNote, DETAIL, { width: rect.width - 24, alpha: ink.secondary });
    }
  }

  #drawSummaryCard(rect: Rect, view: BuilderView): void {
    this.#card(rect, {});
    this.#drawSummary(rect, view);
  }

  #drawReview(view: BuilderView, layout: BuilderLayout, container: Phaser.GameObjects.Container): void {
    // Desktop has the summary in its review column; phone and tablet carry it here.
    if (layout.summaryInStep) {
      this.#card(layout.reviewBody, {});
      this.#drawSummary(layout.reviewBody, view);
    }
    const pre = layout.preconstructed;
    this.#card(pre, { disabled: !view.preconstructedEnabled });
    const label = this.#text(pre.x + pre.width / 2, pre.y + pre.height / 2, "Preconstructed", NAME);
    label.setOrigin(0.5);
    this.#control(pre, "civil:preconstructed", container);

    view.difficultyChoices.forEach((choice, i) => {
      const rect = layout.difficulty[i]!;
      this.#card(rect, { selected: choice.selected });
      const name = this.#text(rect.x + 10, rect.y + 6, choice.name, NAME, { width: rect.width - 44 });
      fitText(name, rect.width - 44, NAME.size);
      this.#text(rect.x + 10, rect.y + 28, choice.description, typeRole.label, {
        width: rect.width - 20,
        maxLines: 3,
        alpha: ink.secondary,
      });
      this.#control(rect, choice.action, container);
    });

    view.modeOptions.forEach((mode, i) => {
      const rect = layout.gameMode[i]!;
      this.#card(rect, { selected: mode.selected, disabled: !mode.enabled });
      const text = this.#text(rect.x + 10, rect.y + rect.height / 2, `${mode.label} · ${mode.note}`, NAME, {
        width: rect.width - 50,
      });
      text.setOrigin(0, 0.5);
      fitText(text, rect.width - 50, NAME.size);
      this.#control(rect, `civil:mode:${mode.id}`, container);
    });
  }

  // ---- dev hook ----

  /** Dev e2e hook (never referenced by product code): the view, the layout, the draft, and `act` to send an action string. */
  #publishDebug(): void {
    (window as unknown as { __mcBuilderDebug?: unknown }).__mcBuilderDebug = {
      view: () => this.#view,
      layout: () => this.#layout,
      draft: () => this.#draft,
      act: (action: string) => this.#act(action),
      status: () => this.#statusShown,
      focused: () => this.#route?.focused ?? null,
      handoff: () => this.#handoff,
      stops: () =>
        [...this.#stops].map(([key, stop]) => ({
          key,
          ...(typeof stop.rect === "function" ? stop.rect() : stop.rect),
        })),
    };
  }
}
