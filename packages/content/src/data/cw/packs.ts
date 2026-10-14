// GENERATED FILE — do not edit by hand.
// Source: MarvelCDB public API https://marvelcdb.com/api/public/cards/cw (fetched 2026-09-13; raw cache: packages/content/raw/marvelcdb/cw.json).
// Hand corrections / curated data: packages/content/scripts/marvelcdb/curation/cw.ts
// Regenerate: pnpm --filter @mc/content ingest -- --pack cw [--offline]

import { cycleId, setCode } from "../../schema/index.js";
import type { Cycle, Pack } from "../../schema/index.js";

export const CW_CYCLE: Cycle = { id: cycleId("cycle10"), name: "Civil War", order: 10 };

/** Release date source: Hall of Heroes Civil War page (https://hallofheroeslcg.com/civil-war/), used as a pointer: "Release date: October 17, 2025" (survey section 0 item 5; hallofheroes-llms.txt). The date is not printed in the MC56 rulebook. */
export const CW_PACK: Pack = { code: setCode("cw"), name: "Civil War", cycleId: cycleId("cycle10"), releaseDate: "2025-10-17" };
