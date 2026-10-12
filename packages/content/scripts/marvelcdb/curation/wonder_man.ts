/**
 * Wonder Man (Simon Williams) Hero Pack (Cycle 10, Civil War) curation.
 *
 * - **Errata: Ionic Physiology (58002)**, RRG 1.8 p. 70 (cost arrow to "Then"); the printed text keeps the arrow.
 * - **Deck-building rule (Simon Williams 58001b, "Ionic Energy Being").** The printed alter-ego text: "You may
 *   include events with a printed [energy] resource icon from any aspect in your deck." (raw 58001b `text`; raw
 *   `deck_options: [{ resource: ["energy"], type: ["event"] }]`.) Curated as `identityDeckbuilding["58001a"]`, an
 *   `offAspectAllowance` by card type and printed resource with no `maxCards` (docs/phase7-wave10-hero-packs.md
 *   H1.5, H3.15). Keyed on 58001a, the hero record's own code, as `gam` and `cyclops` key theirs.
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
      code: "58026",
      reason:
        'Grim Reaper is Wonder Man\'s nemesis minion (the only minion of the wonder_man_nemesis set, 58026 to 58029) but prints no Nemesis reminder line, so the parser cannot set the flag. Without it, "your nemesis minion" finds nothing for Wonder Man. Never applied to text.',
      evidence:
        "raw/marvelcdb/wonder_man.json: 58026 is the one minion in wonder_man_nemesis and its text carries no reminder line (Ares 59036 and The Hood 56024 print one); same fix as cw 56055 (docs/phase7-wave10-box-heroes.md B8.1).",
      nemesisMinion: true,
    },
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

  // Simon Williams 58001b, "Ionic Energy Being": "You may include events with a printed [energy] resource icon from
  // any aspect in your deck." A printed wild icon is not an energy icon (RRG 1.8 "Printed", p. 35).
  identityDeckbuilding: {
    "58001a": { offAspectAllowance: { cardType: "event", printedResource: "energy" } },
  },

  scenarios: [],
  starterDecks: [],
};
