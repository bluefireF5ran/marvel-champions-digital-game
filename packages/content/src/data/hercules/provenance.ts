// GENERATED FILE — do not edit by hand.
// Source: MarvelCDB public API https://marvelcdb.com/api/public/cards/hercules (fetched 2026-09-13; raw cache: packages/content/raw/marvelcdb/hercules.json).
// Hand corrections / curated data: packages/content/scripts/marvelcdb/curation/hercules.ts
// Regenerate: pnpm --filter @mc/content ingest -- --pack hercules [--offline]

import { cardId } from "../../schema/index.js";
import type { CardProvenance, DroppedSourceRecord } from "../types.js";

export const HERCULES_PROVENANCE: readonly CardProvenance[] = [
  {
    cardId: cardId("59001a"),
    cardSetCode: "hercules",
    marvelcdbCodes: ["59001a", "59001b"],
    corrections: [],
  },
  {
    cardId: cardId("59002"),
    cardSetCode: "hercules_labor_deck",
    marvelcdbCodes: ["59002"],
    corrections: [
      "59002: Defeat the Hydra prints no \"Attach to\" sentence: its own When Revealed finds a target and attaches it. Without the field the normalizer reports an attachment with no attach rule. Never applied to text. [evidence: Raw text and scan 59002.png (scan check: the card has no host line); RRG 1.8 \"Reveal\" (p. 38) step 2 and ruling February 20, 2026 (4): an attachment without \"attach to\" text attaches when its \"When Revealed\" ability triggers. Survey section 10, correction owed item 4; spec H1.1.]",
    ],
  },
  {
    cardId: cardId("59003"),
    cardSetCode: "hercules_labor_deck",
    marvelcdbCodes: ["59003"],
    corrections: [
      "59003: Embody Pathos prints no \"Attach to\" sentence: its own When Revealed finds a target and attaches it. Without the field the normalizer reports an attachment with no attach rule. Never applied to text. [evidence: Raw text and scan 59003.png (scan check: the card has no host line); RRG 1.8 \"Reveal\" (p. 38) step 2 and ruling February 20, 2026 (4): an attachment without \"attach to\" text attaches when its \"When Revealed\" ability triggers. Survey section 10, correction owed item 4; spec H1.1.]",
    ],
  },
  {
    cardId: cardId("59004"),
    cardSetCode: "hercules_labor_deck",
    marvelcdbCodes: ["59004"],
    corrections: [],
  },
  {
    cardId: cardId("59005"),
    cardSetCode: "hercules_gift_deck",
    marvelcdbCodes: ["59005"],
    corrections: [
      "59005: Nemean Lion Skin is a Permanent upgrade whose own Response (\"After this card enters play, draw 4 cards\") shows it enters play by effect, not paid for from hand: raw sends no `cost` at all — the printed-dash pattern (RRG 1.8 \"Dash (Value)\", p. 15), not a data gap. [evidence: MarvelCDB card listing (marvelcdb.com/card/59005), \"Cost: —\"; scan 59005.png prints no cost (scan check)]",
    ],
  },
  {
    cardId: cardId("59006"),
    cardSetCode: "hercules_gift_deck",
    marvelcdbCodes: ["59006"],
    corrections: [
      "59006: Shield of Perseus — same Gift Deck reasoning as 59005. [evidence: MarvelCDB card listing (marvelcdb.com/card/59006), \"Cost: —\"; scan 59006.png prints no cost (scan check)]",
    ],
  },
  {
    cardId: cardId("59007"),
    cardSetCode: "hercules_gift_deck",
    marvelcdbCodes: ["59007"],
    corrections: [
      "59007: Sword of Peleus — same Gift Deck reasoning as 59005. [evidence: MarvelCDB card listing (marvelcdb.com/card/59007), \"Cost: —\"; scan 59007.png prints no cost (scan check)]",
    ],
  },
  { cardId: cardId("59008"), cardSetCode: "hercules", marvelcdbCodes: ["59008"], corrections: [] },
  { cardId: cardId("59009"), cardSetCode: "hercules", marvelcdbCodes: ["59009"], corrections: [] },
  { cardId: cardId("59010"), cardSetCode: "hercules", marvelcdbCodes: ["59010"], corrections: [] },
  { cardId: cardId("59011"), cardSetCode: "hercules", marvelcdbCodes: ["59011"], corrections: [] },
  { cardId: cardId("59012"), cardSetCode: "hercules", marvelcdbCodes: ["59012"], corrections: [] },
  { cardId: cardId("59013"), cardSetCode: "hercules", marvelcdbCodes: ["59013"], corrections: [] },
  { cardId: cardId("59014"), cardSetCode: "hercules", marvelcdbCodes: ["59014"], corrections: [] },
  { cardId: cardId("59015"), cardSetCode: "hercules", marvelcdbCodes: ["59015"], corrections: [] },
  { cardId: cardId("59016"), cardSetCode: "hercules", marvelcdbCodes: ["59016"], corrections: [] },
  { cardId: cardId("59017"), cardSetCode: "hercules", marvelcdbCodes: ["59017"], corrections: [] },
  { cardId: cardId("59018"), cardSetCode: "leadership", marvelcdbCodes: ["59018"], corrections: [] },
  { cardId: cardId("59019"), cardSetCode: "leadership", marvelcdbCodes: ["59019"], corrections: [] },
  { cardId: cardId("59020"), cardSetCode: "leadership", marvelcdbCodes: ["59020"], corrections: [] },
  {
    cardId: cardId("59021"),
    cardSetCode: "leadership",
    marvelcdbCodes: ["59021"],
    corrections: [
      "59021: MarvelCDB reads \"Hero Interrupt When you use your basic thwart power\"; the card prints \"Hero Interrupt: When you use ...\". The cache dropped the colon (cosmetic: the ability label and its trigger are unchanged). [evidence: Scan 06032.png (the original Teamwork; 59021 is its reprint, `duplicate_of_code` 06032, and has no scan of its own): \"Hero Interrupt: When you use your basic thwart power (THW) or basic attack power (ATK), exhaust an ally you control → add that ally's matching power to your hero's power for this use.\" Scan check, \"Corrections owed in the data\" item 1. To confirm against a scan of 59021 itself if one appears.]",
    ],
    duplicateOfCardId: cardId("06032"),
  },
  {
    cardId: cardId("59022"),
    cardSetCode: "leadership",
    marvelcdbCodes: ["59022"],
    corrections: [],
    duplicateOfCardId: cardId("40018"),
  },
  { cardId: cardId("59023"), cardSetCode: "leadership", marvelcdbCodes: ["59023"], corrections: [] },
  { cardId: cardId("59024"), cardSetCode: "leadership", marvelcdbCodes: ["59024"], corrections: [] },
  { cardId: cardId("59025"), cardSetCode: "basic", marvelcdbCodes: ["59025"], corrections: [] },
  { cardId: cardId("59026"), cardSetCode: "basic", marvelcdbCodes: ["59026"], corrections: [] },
  {
    cardId: cardId("59027"),
    cardSetCode: "basic",
    marvelcdbCodes: ["59027"],
    corrections: [],
    duplicateOfCardId: cardId("31023"),
  },
  { cardId: cardId("59028"), cardSetCode: "basic", marvelcdbCodes: ["59028"], corrections: [] },
  {
    cardId: cardId("59029"),
    cardSetCode: "basic",
    marvelcdbCodes: ["59029"],
    corrections: [],
    duplicateOfCardId: cardId("01088"),
  },
  {
    cardId: cardId("59030"),
    cardSetCode: "basic",
    marvelcdbCodes: ["59030"],
    corrections: [],
    duplicateOfCardId: cardId("01089"),
  },
  {
    cardId: cardId("59031"),
    cardSetCode: "basic",
    marvelcdbCodes: ["59031"],
    corrections: [],
    duplicateOfCardId: cardId("01090"),
  },
  {
    cardId: cardId("59032"),
    cardSetCode: "basic",
    marvelcdbCodes: ["59032"],
    corrections: [],
    duplicateOfCardId: cardId("58034"),
  },
  {
    cardId: cardId("59033"),
    cardSetCode: "basic",
    marvelcdbCodes: ["59033"],
    corrections: [],
    duplicateOfCardId: cardId("01092"),
  },
  {
    cardId: cardId("59034"),
    cardSetCode: "basic",
    marvelcdbCodes: ["59034"],
    corrections: [],
    duplicateOfCardId: cardId("08023"),
  },
  { cardId: cardId("59035"), cardSetCode: "hercules", marvelcdbCodes: ["59035"], corrections: [] },
  {
    cardId: cardId("59036"),
    cardSetCode: "hercules_nemesis",
    marvelcdbCodes: ["59036"],
    corrections: [],
  },
  {
    cardId: cardId("59037"),
    cardSetCode: "hercules_nemesis",
    marvelcdbCodes: ["59037"],
    corrections: [],
  },
  {
    cardId: cardId("59038"),
    cardSetCode: "hercules_nemesis",
    marvelcdbCodes: ["59038"],
    corrections: [],
  },
  {
    cardId: cardId("59039"),
    cardSetCode: "hercules_nemesis",
    marvelcdbCodes: ["59039"],
    corrections: [],
  },
  {
    cardId: cardId("59040"),
    cardSetCode: "hercules_nemesis",
    marvelcdbCodes: ["59040"],
    corrections: [],
  },
  {
    cardId: cardId("59041"),
    cardSetCode: "all_versus_all",
    marvelcdbCodes: ["59041"],
    corrections: [],
  },
  {
    cardId: cardId("59042"),
    cardSetCode: "all_versus_all",
    marvelcdbCodes: ["59042"],
    corrections: [],
  },
  {
    cardId: cardId("59043"),
    cardSetCode: "all_versus_all",
    marvelcdbCodes: ["59043"],
    corrections: [],
  },
  {
    cardId: cardId("59044"),
    cardSetCode: "all_versus_all",
    marvelcdbCodes: ["59044"],
    corrections: [],
  },
  {
    cardId: cardId("59045"),
    cardSetCode: "all_versus_all",
    marvelcdbCodes: ["59045"],
    corrections: [],
  },
];

/** MarvelCDB records deliberately not ingested, with the reason. */
export const HERCULES_DROPPED_SOURCE_RECORDS: readonly DroppedSourceRecord[] = [

];
