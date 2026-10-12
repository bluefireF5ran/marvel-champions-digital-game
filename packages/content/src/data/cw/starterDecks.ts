// GENERATED FILE — do not edit by hand.
// Source: MarvelCDB public API https://marvelcdb.com/api/public/cards/cw (fetched 2026-09-13; raw cache: packages/content/raw/marvelcdb/cw.json).
// Hand corrections / curated data: packages/content/scripts/marvelcdb/curation/cw.ts
// Regenerate: pnpm --filter @mc/content ingest -- --pack cw [--offline]

import { cardId, setCode, starterDeckId } from "../../schema/index.js";
import type { StarterDeck } from "../../schema/index.js";

export const CW_STARTER_DECKS: readonly StarterDeck[] = [
  {
    id: starterDeckId("tigra-aggression"),
    name: "Tigra / Aggression",
    packCode: setCode("cw"),
    identityCardId: cardId("56001a"),
    aspects: ["aggression"],
    cards: [
      { cardId: cardId("56002"), quantity: 1 },
      { cardId: cardId("56003"), quantity: 1 },
      { cardId: cardId("56004"), quantity: 1 },
      { cardId: cardId("56005"), quantity: 2 },
      { cardId: cardId("56006"), quantity: 2 },
      { cardId: cardId("56007"), quantity: 3 },
      { cardId: cardId("56008"), quantity: 3 },
      { cardId: cardId("56009"), quantity: 2 },
      { cardId: cardId("56010"), quantity: 1 },
      { cardId: cardId("56011"), quantity: 1 },
      { cardId: cardId("56012"), quantity: 3 },
      { cardId: cardId("56013"), quantity: 3 },
      { cardId: cardId("56014"), quantity: 3 },
      { cardId: cardId("56015"), quantity: 3 },
      { cardId: cardId("56016"), quantity: 3 },
      { cardId: cardId("56017"), quantity: 3 },
      { cardId: cardId("56018"), quantity: 1 },
      { cardId: cardId("56019"), quantity: 1 },
      { cardId: cardId("56020"), quantity: 1 },
      { cardId: cardId("56021"), quantity: 1 },
      { cardId: cardId("56022"), quantity: 1 },
    ],
    provenance: {
      verified: true,
      sources: [
        "MC56 rulebook p. 18 (docs/campaign-modes/mc56_rulebook-web_1.pdf), rendered and read against the list on 2026-10-11 (survey section 10.2: names and counts match the markdown, the Tigra and Hulkling columns told apart on the page image)",
      ],
      note: "40 cards: 15 Tigra, 21 Aggression, 4 basic. The page lists titles and quantities, not codes; each title was matched to raw/marvelcdb/cw.json (every copy count is within the record's quantity).",
    },
  },
  {
    id: starterDeckId("hulkling-protection"),
    name: "Hulkling / Protection",
    packCode: setCode("cw"),
    identityCardId: cardId("56029a"),
    aspects: ["protection"],
    cards: [
      { cardId: cardId("56030"), quantity: 1 },
      { cardId: cardId("56031"), quantity: 1 },
      { cardId: cardId("56032"), quantity: 1 },
      { cardId: cardId("56033"), quantity: 1 },
      { cardId: cardId("56034"), quantity: 1 },
      { cardId: cardId("56035"), quantity: 1 },
      { cardId: cardId("56036"), quantity: 1 },
      { cardId: cardId("56037"), quantity: 3 },
      { cardId: cardId("56038"), quantity: 2 },
      { cardId: cardId("56039"), quantity: 2 },
      { cardId: cardId("56040"), quantity: 1 },
      { cardId: cardId("56041"), quantity: 1 },
      { cardId: cardId("56042"), quantity: 1 },
      { cardId: cardId("56043"), quantity: 1 },
      { cardId: cardId("56044"), quantity: 1 },
      { cardId: cardId("56045"), quantity: 1 },
      { cardId: cardId("56046"), quantity: 3 },
      { cardId: cardId("56047"), quantity: 3 },
      { cardId: cardId("56048"), quantity: 3 },
      { cardId: cardId("56049"), quantity: 3 },
      { cardId: cardId("56050"), quantity: 3 },
      { cardId: cardId("56051"), quantity: 1 },
      { cardId: cardId("56052"), quantity: 1 },
      { cardId: cardId("56053"), quantity: 3 },
    ],
    provenance: {
      verified: true,
      sources: [
        "MC56 rulebook p. 18 (docs/campaign-modes/mc56_rulebook-web_1.pdf), rendered and read against the list on 2026-10-11 (survey section 10.2)",
      ],
      note: "40 cards: 15 Hulkling, 21 Protection, 4 basic. The page lists titles and quantities, not codes; each title was matched to raw/marvelcdb/cw.json.",
    },
  },
];
