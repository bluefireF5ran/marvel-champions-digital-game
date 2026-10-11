/**
 * A scenario's printed rules cards as the board and Inspect show them (`Scenario.referenceCards`): the title, the
 * printed text and the scan. Content only: no engine rule reads them.
 */
import type { Scenario, ScenarioReferenceCard } from "@mc/content";
import type { ArtSource } from "../art/art-source.js";
import { referenceArtFor } from "../art/reference-art.js";

export interface ReferenceCardView {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  /** Null when the scan is not in the bundle: the sheet then shows the text alone. */
  readonly art: ArtSource | null;
}

export function referenceCardViews(
  scenario: Pick<Scenario, "referenceCards"> | undefined,
  artFor: (image: string) => ArtSource | null = referenceArtFor,
): readonly ReferenceCardView[] {
  return (scenario?.referenceCards ?? []).map((card: ScenarioReferenceCard) => ({
    id: card.id,
    title: card.title,
    text: card.text,
    art: artFor(card.image as string),
  }));
}
