/**
 * The scans of a scenario's printed rules cards (`Scenario.referenceCards`: Trickster Takeover's Shatter the Illusion
 * and Epic Multiplayer Reminder), which have no card record and so no `/card-art/` route. The owner's scans live in
 * `docs/campaign-modes/mc55-reference-cards/`; a glob puts them in the bundle, so nothing is fetched at runtime.
 *
 * Pure over a path to URL map, like `scenario-art.ts`, so it is tested without the glob. A path with no scan is a
 * supported outcome: the sheet draws its text alone.
 */
import type { ArtSource } from "./art-source.js";

const FILES = import.meta.glob("../../../../docs/campaign-modes/mc55-reference-cards/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** The scan a reference card's repo-relative `image` path names, matched by its path from `docs/` on. */
export function referenceArtFor(image: string, files: Readonly<Record<string, string>> = FILES): ArtSource | null {
  const wanted = image.replace(/^\/+/, "");
  const found = Object.keys(files).find((path) => path.endsWith(`/${wanted}`) || path.endsWith(wanted));
  return found ? { key: `reference-card:${wanted}`, url: files[found]! } : null;
}
