/**
 * Hercules Hero Pack (Cycle 10, Civil War) curation.
 *
 * Evidence abbreviations: "scan" is `assets/card-art/bundles/cards/<code>.png` (gitignored, read directly, never wired
 * into the data), "scan check" is docs/phase7-wave10-scan-check.md, "survey" is docs/phase7-wave10-data-survey.md and
 * "spec" is docs/phase7-wave10-hero-packs.md.
 *
 * - **Two separate decks on 59001a** (spec H1.1; the Hercules insert: "he begins each game with two special 3-card
 *   decks"). The Labor deck (59002 Defeat the Hydra, 59003 Embody Pathos, 59004 Protect Humanity) is a deck of
 *   encounter-shaped cards (`cardFamily: "encounter"`, trait Labor, Victory 0, no encounter set); the Gift deck
 *   (59005 Nemean Lion Skin, 59006 Shield of Perseus, 59007 Sword of Peleus) is Permanent upgrades (`cardFamily:
 *   "player"`, resolved through `auxiliaryHeroSetCodes`, the mechanism `storm.ts` uses). Both are facedown, with no
 *   discard pile, and stay empty (RRG 1.8 p. 65 FAQ "Labor Cards": a Labor card that leaves play other than into the
 *   victory display goes to the bottom of the Labor deck).
 * - **59004 Protect Humanity is typed `obligation` but is not Hercules's obligation** (spec H8.1 item 4): his
 *   obligation is Appeal to Athena 59035 alone. The card carries `separateDeck: "Labor"`.
 * - **59002 and 59003 print no "Attach to" line**: their own When Revealed finds a target and attaches them (RRG 1.8
 *   "Reveal", p. 38; ruling February 20, 2026 (4)), so they are `impliedAttachHost: "ownWhenRevealed"`.
 * - **Dash costs** on the three Gift cards, the printed-dash pattern (RRG 1.8 "Dash (Value)", p. 15).
 * - **Hecate 59042 prints "When Revealed/Defeated:"** (scan 59042.png; scan check): one ability with two timings. The
 *   parser (`parse-text.ts`, trigger "When Revealed/Defeated") emits it as `59042.when-revealed` and
 *   `59042.when-defeated` over the same text, because an ability definition has one trigger kind. Text unchanged.
 * - **Starter deck: none.** No source exists for the printed decklist (survey section 10.1); the owner has been asked
 *   for the printed decklist card, so `starterDecks` stays empty rather than inventing a list.
 */
import type { PackCuration } from "./types.ts";

/** A Labor card whose own When Revealed finds a target and attaches the card (spec H1.1). */
const ownLaborAttach = (code: string, title: string): PackCuration["corrections"][number] => ({
  code,
  reason: `${title} prints no "Attach to" sentence: its own When Revealed finds a target and attaches it. Without the field the normalizer reports an attachment with no attach rule. Never applied to text.`,
  evidence: `Raw text and scan ${code}.png (scan check: the card has no host line); RRG 1.8 "Reveal" (p. 38) step 2 and ruling February 20, 2026 (4): an attachment without "attach to" text attaches when its "When Revealed" ability triggers. Survey section 10, correction owed item 4; spec H1.1.`,
  impliedAttachHost: "ownWhenRevealed",
});

export const HERCULES_CURATION: PackCuration = {
  packCode: "hercules",
  cycle: { id: "cycle10", name: "Civil War", order: 10 },
  pack: {
    name: "Hercules",
    releaseDate: "2026-02-20",
    releaseDateSource:
      'Hall of Heroes Hercules page (https://hallofheroeslcg.com/hercules/): "Release date: February 20, 2026"',
  },
  outDir: "src/data/hercules",
  exportPrefix: "HERCULES",

  corrections: [
    {
      code: "59005",
      reason:
        'Nemean Lion Skin is a Permanent upgrade whose own Response ("After this card enters play, draw 4 cards") shows it enters play by effect, not paid for from hand: raw sends no `cost` at all — the printed-dash pattern (RRG 1.8 "Dash (Value)", p. 15), not a data gap.',
      evidence:
        'MarvelCDB card listing (marvelcdb.com/card/59005), "Cost: —"; scan 59005.png prints no cost (scan check)',
      specialCost: "dash",
    },
    {
      code: "59006",
      reason: "Shield of Perseus — same Gift Deck reasoning as 59005.",
      evidence:
        'MarvelCDB card listing (marvelcdb.com/card/59006), "Cost: —"; scan 59006.png prints no cost (scan check)',
      specialCost: "dash",
    },
    {
      code: "59007",
      reason: "Sword of Peleus — same Gift Deck reasoning as 59005.",
      evidence:
        'MarvelCDB card listing (marvelcdb.com/card/59007), "Cost: —"; scan 59007.png prints no cost (scan check)',
      specialCost: "dash",
    },
    ownLaborAttach("59002", "Defeat the Hydra"),
    ownLaborAttach("59003", "Embody Pathos"),
    {
      code: "59021",
      reason:
        'MarvelCDB reads "Hero Interrupt When you use your basic thwart power"; the card prints "Hero Interrupt: When you use ...". The cache dropped the colon (cosmetic: the ability label and its trigger are unchanged).',
      evidence:
        'Scan 06032.png (the original Teamwork; 59021 is its reprint, `duplicate_of_code` 06032, and has no scan of its own): "Hero Interrupt: When you use your basic thwart power (THW) or basic attack power (ATK), exhaust an ally you control → add that ally\'s matching power to your hero\'s power for this use." Scan check, "Corrections owed in the data" item 1. To confirm against a scan of 59021 itself if one appears.',
      textReplace: { find: "Hero Interrupt When you use", replace: "Hero Interrupt: When you use" },
    },
  ],
  errata: [],

  scriptingNotes: {},
  cardNotes: {},

  scenarios: [],
  starterDecks: [],

  // Spec H1.1. Both decks are facedown, keep no discard pile and stay empty. The Labor cards are encounter-shaped
  // (`separateDeck: "Labor"`, no encounter set); the Gift cards are player cards (`deckLimit: 0`).
  separateDecks: [
    {
      identityCode: "59001a",
      deckName: "Labor",
      cardCodes: ["59002", "59003", "59004"],
      topCardFaceup: false,
      discardPile: "none",
      whenEmpty: "stayEmpty",
      cardFamily: "encounter",
    },
    {
      identityCode: "59001a",
      deckName: "Gift",
      cardCodes: ["59005", "59006", "59007"],
      topCardFaceup: false,
      discardPile: "none",
      whenEmpty: "stayEmpty",
      cardFamily: "player",
    },
  ],

  auxiliaryHeroSetCodes: {
    hercules_gift_deck: "hercules",
  },
};
