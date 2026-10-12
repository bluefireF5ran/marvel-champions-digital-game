/**
 * Wonder Man (Simon Williams) Hero Pack (Cycle 10, Civil War) curation.
 *
 * - **Errata: Ionic Physiology (58002)**, RRG 1.8 p. 70 (cost arrow to "Then"); the printed text keeps the arrow.
 * - **Deck-building rule (Simon Williams 58001b, "Ionic Energy Being")** is NOT curated yet: spec H1.5 needs
 *   `OffAspectAllowance.printedResource` (task HT12), which the schema does not have. Add
 *   `identityDeckbuilding["58001a"]` once it lands.
 * - **Starter deck: none.** No source exists for the printed decklist (survey section 10.1); `starterDecks` stays empty.
 *
 * - **Ionic Physiology (58002, upgrade) and Cameo (58031, support): dash cost, confirmed.** Ionic Physiology is
 *   Permanent, entering play by its own text; Cameo is a `Setup:` search-and-attach support, never played for a
 *   resource cost. Both send no `cost` at all on MarvelCDB; both confirmed against their own MarvelCDB listing
 *   ("Cost: —").
 * - **Coordinated Effort (58032, upgrade): `AttachmentHost { kind: "encounterCard" }`**, landed by
 *   `game-rules-architect` (docs/phase7-wave2.md §7.2) in response to this pipeline's schema request — "Attach
 *   to an encounter card in play. Max 1 per encounter card." parses automatically once the request landed; no
 *   further curation needed. Normalizes cleanly.
 */
import type { PackCuration } from "./types.ts";

export const WONDER_MAN_CURATION: PackCuration = {
  packCode: "wonder_man",
  cycle: { id: "cycle10", name: "Civil War", order: 10 },
  pack: {
    name: "Wonder Man",
    releaseDate: "2026-02-20",
    releaseDateSource:
      'Hall of Heroes Simon Williams/Wonder Man page (https://hallofheroeslcg.com/simon-williams-wonder-man/): "Release date: February 20, 2026"',
  },
  outDir: "src/data/wonder_man",
  exportPrefix: "WONDER_MAN",

  corrections: [
    {
      code: "58002",
      reason:
        'Ionic Physiology is Permanent, entering play through its own text rather than being paid for from hand: raw sends no `cost` at all — the printed-dash pattern (RRG 1.8 "Dash (Value)", p. 15), not a data gap.',
      evidence: 'MarvelCDB card listing (marvelcdb.com/card/58002), "Cost: —"',
      specialCost: "dash",
    },
    {
      code: "58031",
      reason:
        "Cameo is a Setup: search-and-attach support, never played for a resource cost: raw sends no `cost` at all — same reasoning as 58002.",
      evidence: 'MarvelCDB card listing (marvelcdb.com/card/58031), "Cost: —"',
      specialCost: "dash",
    },
  ],
  errata: [
    {
      code: "58002",
      version: "RRG 1.8",
      changedFields: ["text"],
      note: 'Ionic Physiology: the cost arrow before "heal 1 damage from your identity" became "Then" (tucking the event is no longer a cost). MarvelCDB and the card print the arrow; the printed text keeps it.',
      evidence:
        'RRG 1.8 p. 70 (Wonder Man errata, IONIC PHYSIOLOGY (#2), mc_rulesreference_v18_compressed.md line 5150): "Should read: Response: After you play an event with a printed [energy] resource, tuck that event from your discard pile under this card. Then, heal 1 damage from your identity. (Changed cost arrow to “Then”.)"; ruling March 6, 2026 (3); scan 58002.png prints the arrow (scan check, "Known errata"). Raw text is the print.',
      currentReplace: { find: " → heal 1 damage", replace: ". Then, heal 1 damage" },
    },
  ],

  scriptingNotes: {},
  cardNotes: {},

  scenarios: [],
  starterDecks: [],
};
