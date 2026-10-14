// GENERATED FILE — do not edit by hand.
// Source: MarvelCDB public API https://marvelcdb.com/api/public/cards/wonder_man (fetched 2026-09-13; raw cache: packages/content/raw/marvelcdb/wonder_man.json).
// Hand corrections / curated data: packages/content/scripts/marvelcdb/curation/wonder_man.ts
// Regenerate: pnpm --filter @mc/content ingest -- --pack wonder_man [--offline]

import { cardId, setCode, starterDeckId } from "../../schema/index.js";
import type { StarterDeck } from "../../schema/index.js";

export const WONDER_MAN_STARTER_DECKS: readonly StarterDeck[] = [
  {
    id: starterDeckId("wonder-man-justice"),
    name: "Wonder Man / Justice",
    packCode: setCode("wonder_man"),
    identityCardId: cardId("58001a"),
    aspects: ["justice"],
    cards: [
      { cardId: cardId("58002"), quantity: 1 },
      { cardId: cardId("58003"), quantity: 3 },
      { cardId: cardId("58004"), quantity: 2 },
      { cardId: cardId("58005"), quantity: 3 },
      { cardId: cardId("58006"), quantity: 2 },
      { cardId: cardId("58007"), quantity: 1 },
      { cardId: cardId("58008"), quantity: 1 },
      { cardId: cardId("58009"), quantity: 1 },
      { cardId: cardId("58010"), quantity: 1 },
      { cardId: cardId("58011"), quantity: 1 },
      { cardId: cardId("58012"), quantity: 1 },
      { cardId: cardId("58013"), quantity: 1 },
      { cardId: cardId("58014"), quantity: 1 },
      { cardId: cardId("58015"), quantity: 1 },
      { cardId: cardId("58016"), quantity: 3 },
      { cardId: cardId("58017"), quantity: 3 },
      { cardId: cardId("58018"), quantity: 3 },
      { cardId: cardId("58019"), quantity: 3 },
      { cardId: cardId("58020"), quantity: 3 },
      { cardId: cardId("58021"), quantity: 3 },
      { cardId: cardId("58022"), quantity: 1 },
      { cardId: cardId("58023"), quantity: 1 },
      { cardId: cardId("58024"), quantity: 1 },
    ],
    provenance: {
      verified: false,
      sources: [
        "Owner-supplied stand-in for the printed decklist card (the owner could not locate a hard copy): a screenshot of the precon as listed on a card database, \"Wonder Man - precon deck\" (Wonder Man (Simon Williams), Justice, 40 cards), saved as docs/decklists/wonder-man-precon-deck.png, 2026-10-12. Not a scan of the insert, not checked against the printed card.",
      ],
      note: "40 cards in the listing plus the Permanent Ionic Physiology (58002), so 41 entries. Names were matched to this pack's own codes 580NN; every copy count is within the record's quantity.",
    },
  },
];
