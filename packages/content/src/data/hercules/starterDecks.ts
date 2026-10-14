// GENERATED FILE — do not edit by hand.
// Source: MarvelCDB public API https://marvelcdb.com/api/public/cards/hercules (fetched 2026-09-13; raw cache: packages/content/raw/marvelcdb/hercules.json).
// Hand corrections / curated data: packages/content/scripts/marvelcdb/curation/hercules.ts
// Regenerate: pnpm --filter @mc/content ingest -- --pack hercules [--offline]

import { cardId, setCode, starterDeckId } from "../../schema/index.js";
import type { StarterDeck } from "../../schema/index.js";

export const HERCULES_STARTER_DECKS: readonly StarterDeck[] = [
  {
    id: starterDeckId("hercules-leadership"),
    name: "Hercules / Leadership",
    packCode: setCode("hercules"),
    identityCardId: cardId("59001a"),
    aspects: ["leadership"],
    cards: [
      { cardId: cardId("59008"), quantity: 1 },
      { cardId: cardId("59009"), quantity: 3 },
      { cardId: cardId("59010"), quantity: 2 },
      { cardId: cardId("59011"), quantity: 2 },
      { cardId: cardId("59012"), quantity: 1 },
      { cardId: cardId("59013"), quantity: 1 },
      { cardId: cardId("59014"), quantity: 1 },
      { cardId: cardId("59015"), quantity: 1 },
      { cardId: cardId("59016"), quantity: 2 },
      { cardId: cardId("59017"), quantity: 1 },
      { cardId: cardId("59018"), quantity: 1 },
      { cardId: cardId("59019"), quantity: 1 },
      { cardId: cardId("59020"), quantity: 1 },
      { cardId: cardId("59021"), quantity: 3 },
      { cardId: cardId("59022"), quantity: 1 },
      { cardId: cardId("59023"), quantity: 3 },
      { cardId: cardId("59024"), quantity: 3 },
      { cardId: cardId("59025"), quantity: 1 },
      { cardId: cardId("59026"), quantity: 1 },
      { cardId: cardId("59027"), quantity: 3 },
      { cardId: cardId("59028"), quantity: 1 },
      { cardId: cardId("59029"), quantity: 1 },
      { cardId: cardId("59030"), quantity: 1 },
      { cardId: cardId("59031"), quantity: 1 },
      { cardId: cardId("59032"), quantity: 1 },
      { cardId: cardId("59033"), quantity: 1 },
      { cardId: cardId("59034"), quantity: 1 },
    ],
    provenance: {
      verified: true,
      sources: [
        "Printed decklist card \"Hercules Deck\" (c) 2026 FFG, photographed by the owner (docs/decklists/hercules-deck-card.png), read 2026-10-12: Hero Cards (15), Leadership Aspect Cards (13), Basic Cards (12), Obligation 35, Nemesis Set 36-40; Labor Deck 2-4 and Gift Deck 5-7 are separate decks.",
      ],
      note: "40 cards: 15 Hercules, 13 Leadership, 12 basic. The card lists collector numbers, which are the MarvelCDB codes 590NN. Every copy count is within the record's quantity.",
    },
  },
];
