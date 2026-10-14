// GENERATED FILE — do not edit by hand.
// Source: MarvelCDB public API https://marvelcdb.com/api/public/cards/hercules (fetched 2026-09-13; raw cache: packages/content/raw/marvelcdb/hercules.json).
// Hand corrections / curated data: packages/content/scripts/marvelcdb/curation/hercules.ts
// Regenerate: pnpm --filter @mc/content ingest -- --pack hercules [--offline]

import { cardId, encounterSetId, setCode } from "../../schema/index.js";
import type { EncounterSet } from "../../schema/index.js";

export const HERCULES_ENCOUNTER_SETS: readonly EncounterSet[] = [
  { id: encounterSetId("all_versus_all"), name: "All Versus All", packCodes: [setCode("hercules")] },
  {
    id: encounterSetId("hercules_nemesis"),
    name: "Hercules Nemesis",
    packCodes: [setCode("hercules")],
    nemesisOfIdentityId: cardId("59001a"),
  },
];
