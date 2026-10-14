// GENERATED FILE — do not edit by hand.
// Source: MarvelCDB public API https://marvelcdb.com/api/public/cards/hercules (fetched 2026-09-13; raw cache: packages/content/raw/marvelcdb/hercules.json).
// Hand corrections / curated data: packages/content/scripts/marvelcdb/curation/hercules.ts
// Regenerate: pnpm --filter @mc/content ingest -- --pack hercules [--offline]

import { cycleId, setCode } from "../../schema/index.js";
import type { Cycle, Pack } from "../../schema/index.js";

export const HERCULES_CYCLE: Cycle = { id: cycleId("cycle10"), name: "Civil War", order: 10 };

/** Release date source: Hall of Heroes Hercules page (https://hallofheroeslcg.com/hercules/): "Release date: February 20, 2026" */
export const HERCULES_PACK: Pack = {
  code: setCode("hercules"),
  name: "Hercules",
  cycleId: cycleId("cycle10"),
  releaseDate: "2026-02-20",
};
