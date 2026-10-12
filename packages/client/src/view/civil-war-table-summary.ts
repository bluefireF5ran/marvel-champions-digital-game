/**
 * Table setup's modular section for a Civil War scenario (docs/phase7-wave10-client.md 2.10, task C8): a read-only
 * summary of the build in place of the fixed-count picker, with one "Edit scenario" control that returns to the builder.
 * The words are the builder's own review lines (`BuilderView.summary`), not re-derived here, so a blind build is masked
 * exactly as the builder masks it ("Stage 2: hidden", "Modular sets: 4 hidden").
 */
import { builderViewOf, effectiveSetIds, type BuilderContext } from "./civil-war-builder-model.js";
import type { SetupDraft } from "./setup-draft.js";
import { offerOf } from "./setup-options.js";

export const EDIT_SCENARIO_LABEL = "Edit scenario";
/** The focus stop / tile id of the Edit control (`modular:<id>` on Table setup). */
export const EDIT_SCENARIO_ID = "civil-war-edit";
export const SUMMARY_SECTION_TITLE = "Your scenario";

export interface CivilWarSummaryRow {
  readonly id: string;
  /** "Leader", "Stage 1", "Modular sets", ... */
  readonly label: string;
  readonly value: string;
}

export interface CivilWarTableSummary {
  /** "Ready-made" or "Custom": shown at the section header's right. */
  readonly build: string;
  readonly rows: readonly CivilWarSummaryRow[];
  readonly editLabel: string;
  /** How many modular sets are in the game (for the footer line); the names are masked when blind. */
  readonly setCount: number;
}

/** The summary for the draft, or null when it is not a Civil War scenario (or the build is not readable). */
export function civilWarTableSummaryOf(draft: SetupDraft, ctx: BuilderContext): CivilWarTableSummary | null {
  if (!draft.civilWar) return null;
  const offer = ctx.offer ?? offerOf(draft);
  const view = builderViewOf(draft, { ...ctx, offer });
  if (!view) return null;
  const [build = "", ...rest] = view.summary;
  const rows = rest.map<CivilWarSummaryRow>((line, index) => {
    const at = line.indexOf(": ");
    return at < 0
      ? { id: `row${index}`, label: "Build", value: line }
      : { id: `row${index}`, label: line.slice(0, at), value: line.slice(at + 2) };
  });
  return { build, rows, editLabel: EDIT_SCENARIO_LABEL, setCount: effectiveSetIds(draft, offer).length };
}
