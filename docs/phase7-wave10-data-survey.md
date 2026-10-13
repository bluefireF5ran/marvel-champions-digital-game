# Wave 10 data survey (cycle 10 in our ids: Civil War, Wonder Man, Hercules)

Survey only, 2026-10-11, branch `feature/wave-10`. No card data or code was changed; this file is the only thing
written. Packs: `cw` (Civil War, MC56 custom scenario expansion), `wonder_man` (MC58 hero pack, already emitted data
only) and `hercules` (MC59 hero pack, curated but not registered). Companion docs: `phase7-wave10-handoff.md`,
`phase7-wave10-sources.md` (written in parallel; not read here). Model: `phase7-wave9-data-survey.md`.

Commands used. All counts in this file are by script, not by eye.

- `node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/marvelcdb/survey.ts --pack cw --pack
  wonder_man --pack hercules --json <scratch>` (the survey's own dry run; it writes only the scratch JSON).
- `scripts/ingest-marvelcdb.ts --pack <p> --offline --dry-run` for each pack (nothing written).
- Node scripts over `raw/marvelcdb/{cw,wonder_man,hercules}.json` (the top level is
  `{ source, fetchedAt, pack, cards: [...] }`, not a bare array; a b face is nested under a record's `linked_card`).
- A scratch `normalizePack` run on `cw` with scratch corrections (section 5.3), and a scratch re-emit of
  `wonder_man`'s `cards.ts` text diffed against the committed file (section 8).
- PDF pages of `mc56_rulebook-web_1.pdf` rendered with PyMuPDF installed into the session scratch folder (`pylib`,
  outside the repo); the two Hall of Heroes insert JPGs and seven local card scans opened as images.

Scratch files (scripts, `survey.json`, downloaded images, `pylib`) live in the session's scratch folder, outside the repo. Nothing was
written into `packages/content/src/data`. No git command was run. `pnpm` was not needed (node is on PATH).

**Convention for printed-card claims (Wave 7 lesson).** A claim is marked **checked** only if I opened the scan, the
rendered PDF page or the insert image in this session. Everything else is **unchecked** and comes from MarvelCDB raw
text or the rulebook markdown. Checked this session: MC56 rulebook pp. 7, 8 and 18 (rendered as images); the Wonder Man
and Hercules insert JPGs; scans 56023, 56027, 56086, 56118, 56158, 56178 and 59045 (local) and 58011 and 58033 (Hall of
Heroes images); Hall of Heroes' two pack pages (read
as text). **Not checked:** every other card face, and every stat on a card face.

## 0. Corrections to the brief and to the handoff

1. **The `leader` card type is not a gap any more.** PLAN.md line ~1107 ("37 unknown card types: `leader` ...") is
   stale.
   Wave 2 landed it (`phase7-wave2.md` section 6.3): a leader is a `VillainCard` with `printedType: "leader"`, stages
   I to IV, and `normalize/` already handles `type_code: "leader"` (`normalize/encounter-sets.ts` line 21,
   `normalize/context.ts` line 120, `normalize/encounter-cards.ts` line 131). A scratch run turns the 16 raw leader
   records into 4 `VillainCard`s with `printedType: "leader"` and four stages each (section 3.1). The survey reports no
   "unhandled type" line for `cw`.
2. **The Wave 2 "57 gaps" for `cw` are down to 17 lines** (section 5.1): 7 attachment attach-rule lines, 7 "never
   turned into a card" lines that follow from them, and 2 artwork lines. The 34 artwork gaps are gone because local
   scans
   now exist (section 9). The survey does **not** report the silent problem that matters most: the normalizer collapses
   the 16 main scheme records into **two** cards with eight stages each (section 5.2, gap G1).
3. **Wonder Man has no modular encounter set.** The handoff's "each one hero with a nemesis set and a modular set" holds
   for Hercules (`all_versus_all`, 5 cards) but not for Wonder Man: raw has only `wonder_man` and `wonder_man_nemesis`
   (section 7.2). Hall of Heroes' Wonder Man page lists none either.
4. **Component counts.** MC56 p. 2: "274 cards, consisting of 98 player cards, 16 leader cards, 158 encounter cards, and
   2 quick reference cards". By script, raw `quantity` sums to **272**: player-faction copies 98 (hero 32, aggression
   21,
   protection 21, basic 24), leader copies 16, encounter-faction copies 174 minus 16 leaders = 158. The two quick
   reference cards are not in MarvelCDB (section 6, G13). The 98 and 158 and 16 match the printed figures.
5. **Release dates** (Hall of Heroes, `hallofheroes-llms.txt` lines 28, 49, 136 and the pages): Civil War
   **2025-10-17**;
   Wonder Man and Hercules **2026-02-20**. The two existing curations already carry 2026-02-20.
6. **Two planned errata sit in RRG 1.8** (Appendix V, p. 70) and a third card family has a title erratum (section 10).
   The Civil War "Energy Channel" erratum and Ionic Physiology's are not yet in any curation (`errata: []`).
7. **A rulebook page is not a precon source for the hero packs.** The Hall of Heroes pages for Wonder Man and Hercules
   print "Starter Deck" as plain text with no link, unlike the four Wave 9 pages. The decklists for those two are
   **not obtainable** from anything in this session (section 8).

## 1. Where each pack stands

| Pack         | Raw cache (`raw/marvelcdb/`) | Emitted (`src/data/<pack>/`) | Curation (`scripts/marvelcdb/curation/`) | Registered in ingest | In `survey.ts` | Pool today    |
| ------------ | ---------------------------- | ---------------------------- | ---------------------------------------- | -------------------- | -------------- | ------------- |
| `cw`         | yes, 214 records, 234 faces  | no                           | none                                     | no                   | bare curation  | none          |
| `wonder_man` | yes, 34 records, 35 faces    | yes, 34 cards                | `wonder_man.ts` (50 lines), no errata    | yes                  | registered     | `DATA_ONLY_*` |
| `hercules`   | yes, 45 records, 46 faces    | no                           | `hercules.ts` (70 lines)                 | **no** (comment)     | registered     | none          |

- All three raw caches have `fetchedAt` 2026-09-13 and `pack_wave: 10` on every record (MarvelCDB's own wave number;
  our id is `cycle10`).
- `hercules.ts` carries cycle `{ id: "cycle10", name: "Cycle 10", order: 10 }`, release 2026-02-20, three dash-cost
  corrections (59005 to 59007) and `auxiliaryHeroSetCodes: { hercules_gift_deck: "hercules" }`. Its header comment
  says it is "NOT registered for emission" because of the Labor Deck. `scripts/ingest-marvelcdb.ts` lines 161 to 163
  repeat that. It has **no** `separateDecks` entry, so the Labor and Gift decks are not curated (gap G5).
- `src/data/index.ts` today: `DATA_ONLY_CARDS = [...WONDER_MAN_CARDS]`, `DATA_ONLY_ENCOUNTER_SETS =
  [...WONDER_MAN_ENCOUNTER_SETS]`; `WAVE9_*` is the last playable block. `data-only.test.ts` `PACKS` has one entry
  (`wonder_man`) and asserts `cycleOf("wonder_man") === "cycle10"`.
- `fne.ts` also declares `cycle10` / "Cycle 10" (a Wave 2 placeholder). RRG 1.8 Appendix VI (p. 71) puts Civil War,
  Wonder Man and Hercules together in Limited Environment cycle 10, so Fear No Evil probably belongs to cycle 11. That
  is Wave 11's to settle; recorded here so the cycle id is not reused by accident.
- Cycle display name: every earlier cycle in the curations is named after its box (cycle 9 is "Agents of S.H.I.E.L.D.").
  Proposed: `{ id: "cycle10", name: "Civil War", order: 10 }` for all three packs (owner question, section 11).

## 2. Raw shape and counts, by script

### 2.1 Totals per pack

| Pack         | Records | Faces | Nested b faces | Copies (sum of `quantity`) | Raw reprints (`duplicate_of_code`) |
| ------------ | ------- | ----- | -------------- | -------------------------- | ---------------------------------- |
| `cw`         | 214     | 234   | 20             | 272                        | 13                                 |
| `wonder_man` | 34      | 35    | 1              | 59                         | 2                                  |
| `hercules`   | 45      | 46    | 1              | 59                         | 9                                  |

**Double-sided records.** No record has `double_sided: true`. The back of a card is the nested `linked_card` object on
the record (a full card record with its own `code`, `type_code`, text and `hidden: true`). `cw`: 2 identities (56001a to
56001b, 56029a to 56029b), 16 main scheme stages (each a to b), 2 side schemes (56128a to 56128b, 56206a to 56206b).
`wonder_man`: 58001a to 58001b. `hercules`: 59001a to 59001b. No `linked_card` carries a `linked_card` of its own: **no
third faces** in any of the three packs. The 20 nested faces all have `hidden: true`.

### 2.2 By `type_code` (records, then copies)

| `type_code`          | `cw` rec | `cw` copies | `wonder_man` rec | `wonder_man` copies | `hercules` rec | `hercules` copies |
| -------------------- | -------- | ----------- | ---------------- | ------------------- | -------------- | ----------------- |
| `hero`               | 2        | 2           | 1                | 1                   | 1              | 1                 |
| `ally`               | 8        | 8           | 5                | 5                   | 5              | 5                 |
| `event`              | 21       | 44          | 9                | 26                  | 6              | 15                |
| `upgrade`            | 18       | 28          | 8                | 14                  | 9              | 12                |
| `support`            | 5        | 7           | 4                | 4                   | 5              | 7                 |
| `resource`           | 9        | 9           | 2                | 3                   | 3              | 3                 |
| `player_side_scheme` | 0        | 0           | 0                | 0                   | 2              | 2                 |
| `obligation`         | 4        | 4           | 1                | 1                   | 2              | 2                 |
| `minion`             | 31       | 36          | 1                | 1                   | 5              | 5                 |
| `side_scheme`        | 24       | 24          | 1                | 1                   | 3              | 3                 |
| `attachment`         | 23       | 29          | 0                | 0                   | 3              | 3                 |
| `treachery`          | 37       | 49          | 2                | 3                   | 1              | 1                 |
| `leader`             | 16       | 16          | 0                | 0                   | 0              | 0                 |
| `main_scheme`        | 16       | 16          | 0                | 0                   | 0              | 0                 |
| total                | 214      | 272         | 34               | 59                  | 45             | 59                |

### 2.3 By `faction_code` (records, then copies)

| `faction_code` | `cw` rec | `cw` copies | `wonder_man` rec | `wonder_man` copies | `hercules` rec | `hercules` copies |
| -------------- | -------- | ----------- | ---------------- | ------------------- | -------------- | ----------------- |
| `hero`         | 21       | 32          | 11               | 17                  | 17             | 22                |
| `aggression`   | 9        | 21          | 2                | 6                   | 0              | 0                 |
| `justice`      | 0        | 0           | 7                | 13                  | 0              | 0                 |
| `leadership`   | 0        | 0           | 3                | 7                   | 7              | 13                |
| `protection`   | 11       | 21          | 2                | 6                   | 0              | 0                 |
| `basic`        | 22       | 24          | 4                | 4                   | 10             | 13                |
| `encounter`    | 151      | 174         | 5                | 6                   | 11             | 11                |

`hercules` has six `hero`-faction cards that are not player-deck cards: the Labor deck 59002 to 59004 (typed
`attachment`, `attachment`, `obligation`) and the Gift deck 59005 to 59007 (typed `upgrade`); their set type is
`hero_special`.

### 2.4 By `card_set_code` (encounter and kit sets), with id ranges

`cw` (28 sets; `card_set_type_name_code` in brackets). "Recs" are top-level records, "copies" their quantity sum.

| Set (`card_set_code`)        | Name                   | Recs | Copies | Codes            | Contents (records)                                                     |
| ---------------------------- | ---------------------- | ---- | ------ | ---------------- | ---------------------------------------------------------------------- |
| `tigra` [hero]               | Tigra                  | 10   | 17     | 56001a to 56023  | hero 1, ally 1, support 1, upgrade 4, event 2, obligation 1            |
| (null)                       | aspect and basic cards | 26   | 50     | 56010 to 56053   | aggression 9, protection 11, basic 6 records (section 3.7)             |
| `tigra_nemesis` [nemesis]    | Tigra Nemesis          | 5    | 5      | 56024 to 56028   | 3 minion, side scheme, attachment                                      |
| `hulkling` [hero]            | Hulkling               | 13   | 17     | 56029a to 56054  | hero 1, ally 1, support 1, upgrade 5, event 4, obligation 1            |
| `hulkling_nemesis`           | Hulkling Nemesis       | 4    | 5      | 56055 to 56058   | minion, side scheme, attachment, treachery x2                          |
| `iron_man_leader` [leader]   | Iron Man               | 16   | 18     | 56059 to 56132   | 4 leader, 5 attachment, 2 treachery, side scheme, 4 basic player cards |
| `registration` [main_scheme] | Registration           | 8    | 8      | 56063a to 56124a | 8 main scheme (4 stage 1, 4 stage 2)                                   |
| `mighty_avengers` [modular]  | Mighty Avengers        | 5    | 5      | 56073 to 56077   | 3 minion, treachery, side scheme                                       |
| `the_initiative`             | The Initiative         | 5    | 5      | 56078 to 56082   | 2 minion, attachment, treachery, side scheme                           |
| `maria_hill_modular`         | Maria Hill             | 4    | 5      | 56083 to 56086   | minion, attachment x2, treachery, side scheme                          |
| `dangerous_recruits`         | Dangerous Recruits     | 5    | 5      | 56087 to 56091   | 2 minion, 2 treachery, side scheme                                     |
| `captain_marvel_leader`      | Captain Marvel         | 15   | 18     | 56092 to 56136   | 4 leader, 3 attachment, 3 treachery, side scheme, 4 basic player cards |
| `cape_killer`                | Cape-Killer            | 4    | 5      | 56105 to 56108   | minion x2, **obligation**, treachery, side scheme                      |
| `martial_law`                | Martial Law            | 3    | 5      | 56109 to 56111   | minion x3, treachery, side scheme                                      |
| `heroes_for_hire`            | Heroes for Hire        | 5    | 5      | 56112 to 56116   | 2 minion, **obligation**, treachery, side scheme                       |
| `paladin`                    | Paladin                | 4    | 5      | 56117 to 56120   | minion, attachment x2, treachery, side scheme                          |
| `standard_pvp` [standard]    | Standard PVP           | 8    | 10     | 56125 to 56206a  | 6 treachery, 2 side scheme (two copies of a 5-card set; section 3.5)   |
| `captain_america_leader`     | Captain America        | 15   | 18     | 56137 to 56210   | 4 leader, 3 attachment, 3 treachery, side scheme, 4 basic player cards |
| `resistance` [main_scheme]   | Resistance             | 8    | 8      | 56141a to 56202a | 8 main scheme (4 stage 1, 4 stage 2)                                   |
| `new_avengers`               | New Avengers           | 5    | 5      | 56150 to 56154   | 3 minion, treachery, side scheme                                       |
| `secret_avengers`            | Secret Avengers        | 5    | 5      | 56155 to 56159   | 2 minion, 2 treachery, side scheme                                     |
| `namor_modular`              | Namor                  | 5    | 5      | 56160 to 56164   | minion, attachment x2, treachery, side scheme                          |
| `atlanteans`                 | Atlanteans             | 3    | 5      | 56165 to 56167   | minion x3, treachery, side scheme                                      |
| `spider_woman_leader`        | Spider Woman           | 14   | 18     | 56168 to 56214   | 4 leader, 2 attachment, 3 treachery, side scheme, 4 basic player cards |
| `spider_man_modular`         | Spider-Man             | 4    | 5      | 56180 to 56183   | minion, attachment x2, treachery, side scheme                          |
| `defenders`                  | Defenders              | 5    | 5      | 56184 to 56188   | 2 minion, 2 treachery, side scheme                                     |
| `hells_kitchen`              | Hell's Kitchen         | 5    | 5      | 56189 to 56193   | 2 minion, attachment, treachery, side scheme                           |
| `cloak_and_dagger_modular`   | Cloak & Dagger         | 5    | 5      | 56194 to 56198   | 2 minion, attachment, treachery, side scheme                           |

The 28 rows add to 214 records and 272 copies. The two obligations in `cape_killer` (56106) and `heroes_for_hire`
(56114)
are the same card ("Unregistered Super") under two codes.

`wonder_man`:

| Set                  | Name               | Recs | Copies | Codes           | Contents                                                        |
| -------------------- | ------------------ | ---- | ------ | --------------- | --------------------------------------------------------------- |
| `wonder_man` [hero]  | Wonder Man         | 12   | 18     | 58001a to 58025 | hero 1, upgrade 5, event 3, resource 1, support 1, obligation 1 |
| (null)               | aspect and basic   | 18   | 36     | 58012 to 58034  | justice 7, aggression 2, protection 2, leadership 3, basic 4    |
| `wonder_man_nemesis` | Wonder Man Nemesis | 4    | 5      | 58026 to 58029  | minion, side scheme, treachery x2 (58029 has quantity 2)        |

`hercules`:

| Set                                  | Name             | Recs | Copies | Codes           | Contents                                                            |
| ------------------------------------ | ---------------- | ---- | ------ | --------------- | ------------------------------------------------------------------- |
| `hercules` [hero]                    | Hercules         | 12   | 17     | 59001a to 59035 | hero 1, ally 1, event 3, support 1, upgrade 5, obligation 1 (59035) |
| `hercules_labor_deck` [hero_special] | Labor Deck       | 3    | 3      | 59002 to 59004  | attachment x2, obligation (faction `hero`)                          |
| `hercules_gift_deck` [hero_special]  | Gift Deck        | 3    | 3      | 59005 to 59007  | upgrade x3 (faction `hero`)                                         |
| (null)                               | aspect and basic | 17   | 26     | 59018 to 59034  | leadership 7, basic 10                                              |
| `hercules_nemesis`                   | Hercules Nemesis | 5    | 5      | 59036 to 59040  | minion x2, side scheme, attachment, treachery                       |
| `all_versus_all` [modular]           | All Versus All   | 5    | 5      | 59041 to 59045  | side scheme x2, minion x3                                           |

## 3. `cw` in detail

### 3.1 The four leaders (raw `type_code: "leader"`, 16 records)

All 16: `faction_code: "encounter"`, `card_set_type_name_code: "leader"`, `is_unique: true`, `health_per_hero: true`
(per-hero hit points; none is `health_per_group`), `traits` "Avenger." (Captain Marvel "Aerial. Avenger."), `stage` a
roman numeral I to IV, no `linked_card` (each stage is its own record). Stage III and IV replace I and II in expert mode
(Superhero Registration Act 1A Contents, and rulebook pp. 7 and 8). Hit points and stat boxes by script; icons are
`scheme_star` (SCH star) and `attack_star` (ATK star):

| Leader (set)                               | Stage | Code  | HP per hero | ATK | SCH | Star | Text opens with                                    |
| ------------------------------------------ | ----- | ----- | ----------- | --- | --- | ---- | -------------------------------------------------- |
| Iron Man (`iron_man_leader`)               | I     | 56059 | 12          | 1   | 1   | SCH  | star clause, then Setup (find Iron Man attachment) |
|                                            | II    | 56060 | 16          | 2   | 1   | SCH  | Steady, star clause, When Revealed                 |
|                                            | III   | 56061 | 16          | 2   | 1   | SCH  | star clause, **When Revealed** (not Setup)         |
|                                            | IV    | 56062 | 20          | 3   | 1   | SCH  | Steady, star clause, When Revealed                 |
| Captain Marvel (`captain_marvel_leader`)   | I     | 56092 | 14          | 2   | 1   | -    | Setup (Energy Channel), Forced Response            |
|                                            | II    | 56093 | 18          | 2   | 2   | -    | Steady, When Revealed, Forced Response             |
|                                            | III   | 56094 | 18          | 2   | 2   | -    | same as I                                          |
|                                            | IV    | 56095 | 22          | 3   | 2   | -    | same as II                                         |
| Captain America (`captain_america_leader`) | I     | 56137 | 14          | 2   | 1   | -    | Setup (Cap's Shield), Forced Response              |
|                                            | II    | 56138 | 18          | 2   | 2   | -    | Steady, When Revealed, Forced Response             |
|                                            | III   | 56139 | 18          | 2   | 2   | -    | same as I                                          |
|                                            | IV    | 56140 | 22          | 3   | 2   | -    | same as II                                         |
| Spider-Woman (`spider_woman_leader`)       | I     | 56168 | 13          | 2   | 1   | ATK  | Setup (Finesse), star Forced Interrupt             |
|                                            | II    | 56169 | 17          | 2   | 2   | ATK  | Steady, When Revealed, star Forced Interrupt       |
|                                            | III   | 56170 | 17          | 2   | 2   | ATK  | same as I                                          |
|                                            | IV    | 56171 | 21          | 3   | 2   | ATK  | same as II                                         |

- Stage I cross-check against the rulebook p. 2 / p. 3 callouts (markdown, unchecked on the PDF): Iron Man I 12 HP, SCH
  1,
  ATK 1; Captain Marvel I 14 HP, SCH 1, ATK 2; Captain America I 14 HP, SCH 1, ATK 2; Spider-Woman I 13 HP, SCH 1, ATK 2.
  All four match raw. The callouts print "(1/14)" on stage I: each leader's set is 14 cards (4 leaders plus 10).
- Spider-Woman's ATK star and Iron Man's SCH star are printed stat stars. The schema has no star field on a villain
  stage; the text clause carries the rule (gap G10, information only).
- The text on stages II and IV of every leader says "When Revealed: Deal each player an encounter card. [Leader] cannot
  take damage this phase." (the FAQ on rulebook p. 20 answers what stage II does in competitive play).

### 3.2 Each leader's 10-card encounter set, and its four leader-specific basic player cards

Each leader set has the four leader stages, a 10-card set and four basic player cards. The 10-card set, by script
(copies, so Cosmic Flight x2 is two cards), all `faction_code: "encounter"`:

| Leader          | Set code                 | Encounter cards (code, name, copies)                                                                                                                                                                                     | Sum |
| --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| Iron Man        | `iron_man_leader`        | 56065 Powered Gauntlets, 56066 Rocket Boots, 56067 Mark V Helmet, 56068 Arc Reactor, 56069 Mark V Armor (attachments); 56070 Repulsor Blast x2, 56071 Supersonic Punch x2 (treacheries); 56072 Stark Tower (side scheme) | 10  |
| Captain Marvel  | `captain_marvel_leader`  | 56098 Energy Channel, 56099 Captain Marvel's Helmet, 56100 Cosmic Flight x2 (attachments); 56101 Photonic Blast x2, 56102 Crisis Interdiction x2, 56103 Energy Absorption; 56104 Alpha Flight Station                    | 10  |
| Captain America | `captain_america_leader` | 56143 Cap's Shield, 56144 Cap's Helmet, 56145 Super-Soldier Serum x2; 56146 Shield Block, 56147 Shield Toss x2, 56148 Heroic Strike x2; 56149 Fearless Determination                                                     | 10  |
| Spider-Woman    | `spider_woman_leader`    | 56174 Finesse, 56175 Contaminant Immunity x2; 56176 Pheromones x2, 56177 Venom Blast x2, 56178 Inconspicuous x2; 56179 Self-propelled Glide                                                                              | 10  |

The leader's side scheme (Stark Tower, Alpha Flight Station, Fearless Determination, Self-propelled Glide; all base
threat 3, boost 3) is the one the stage 1A Setup reveals "in cooperative mode".

**Leader-specific basic player cards** ("used only when playing in competitive mode", rulebook p. 3; `faction_code:
"basic"`, `card_set_code` is the leader's set, `card_set_type_name_code: "leader"`). 16 records, 16 copies, none with a
raw `deck_limit`:

| Leader          | Codes and names                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Iron Man        | 56129 The Futurist (event, cost 2), 56130 Target Lock (event, 2), 56131 High-Tech Suit (upgrade, 1), 56132 Suit Up (resource)                |
| Captain Marvel  | 56133 Provoked Response (upgrade, 0), 56134 You Started This (event, 2), 56135 Alpha Flight Recruit (upgrade, 0), 56136 Raw Power (resource) |
| Captain America | 56207 No, You Move! (upgrade, 0), 56208 Fighting Dirty (event, 2), 56209 Recruited by Cap (event, 3), 56210 The People's Hero (resource)     |
| Spider-Woman    | 56211 Double Agent (event, 2), 56212 Spider-Blast (event, 2), 56213 Hard to Hit (upgrade, 1), 56214 Secret Contact (resource)                |

The normalizer already emits all 16 with `specificTo: { kind: "competitive", encounterSetId: "<leader set>" }` and
`deckLimit: 1` (scratch run). 56131 High-Tech Suit emits as an upgrade with `attachesTo: { kind: "leader", of: "yours"
}` and `schemeIcons: ["acceleration"]`.

### 3.3 Main schemes: 8 stage-1 and 8 stage-2 records

All 16 are `type_code: "main_scheme"`, `faction_code: "encounter"`, with the set `registration` or `resistance` and the
stage on the a record (`1A` or `2A`). The a record is the front; the numbers and the real text sit on the nested b
record (`linked_card`, `1B` or `2B`): starting threat 0 fixed (`base_threat: 0`, `base_threat_fixed: true`), target 7
per hero (stage 1) or 9 per hero (stage 2) (`threat`, `threat_fixed: false`), acceleration +1 per hero
(`escalation_threat: 1`, `escalation_threat_fixed: false`). The three star flags below sit on the b record.

**How the raw data marks the side: it does not, except through `card_set_code` (`registration` / `resistance`) and the
code range** (registration main schemes 56063 to 56124, resistance 56141 to 56202). There is no side, color or `meta`
field on any record in the pack (`meta` is only set on the two hero a records, as hero colors).

Stage 1 a records share one printed "Contents" and "Setup" text (identical on all four of a side; "Each stage 1 has the
same side A and a different side B", rulebook p. 5). Stage 2 a records carry only flavor.

| Side         | Stage 1 (a, b) | B-face name           | Stage 2 (a, b) | B-face name             | Marks                                |
| ------------ | -------------- | --------------------- | -------------- | ----------------------- | ------------------------------------ |
| Registration | 56063a, 56063b | Cut Off Support       | 56064a, 56064b | Negative Zone Prison    | 56064b target star                   |
| Registration | 56096a, 56096b | S.H.I.E.L.D. Recruits | 56097a, 56097b | Hunting Rebel Heroes    |                                      |
| Registration | 56121a, 56121b | Homeland Security     | 56123a, 56123b | The Initiative          |                                      |
| Registration | 56122a, 56122b | Public Outrage        | 56124a, 56124b | No Going Back           | 56122b acceleration star             |
| Resistance   | 56141a, 56141b | Gathering Support     | 56142a, 56142b | Secret Avengers         |                                      |
| Resistance   | 56172a, 56172b | Open Rebellion        | 56173a, 56173b | Neighborhood Protectors |                                      |
| Resistance   | 56199a, 56199b | Rallying Call         | 56201a, 56201b | Guerilla Warfare        |                                      |
| Resistance   | 56200a, 56200b | Going Underground     | 56202a, 56202b | Superhero Jailbreak     | 56202b target and acceleration stars |

The A-face names are "Superhero Registration Act" (1A) and "Pro-Registration Tactics" (2A) on the registration side,
"Superhero Resistance" (1A) and "Resistance Tactics" (2A) on the resistance side. The pairing of a stage 1 with a
stage 2 is **free** (rulebook p. 5: choose any one of each from the chosen side), so the rows above are not decks; the
four preconstructed pairs are in section 4. A stage-1 B face carries "If there is more than 1 player on your team, this
stage gains hinder 2 [per_hero]" (all 8). Stage 2 B faces end "If this stage is completed, the players lose the game".

### 3.4 The 16 modular sets, by side

Each is exactly 5 cards by copies (script: every set's `quantity` sum is 5), each with at least one minion, treachery
and side scheme (script). Side by code range (registration 56059 to 56136, resistance 56137 to 56214); the raw set
records carry `card_set_type_name_code: "modular"` and nothing else that names a side. Contents (copies in brackets):

| Side         | Set (`card_set_code`)      | Codes          | Cards                                                                                                                              |
| ------------ | -------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Registration | `mighty_avengers`          | 56073 to 56077 | Yellow Jacket, Wasp, U.S. Agent (minions); Mighty Avengers (treachery); Earth's Mightiest Heroes (side scheme)                     |
| Registration | `the_initiative`           | 56078 to 56082 | Doc Samson, Hellcat (minions); Drafted (attachment); Mighty Avengers (treachery); The Fifty State Initiative (side scheme)         |
| Registration | `maria_hill_modular`       | 56083 to 56086 | Maria Hill (minion); Life Model Decoy [2] (attachment); Executive Order (treachery); S.H.I.E.L.D. Helicarrier (side scheme)        |
| Registration | `dangerous_recruits`       | 56087 to 56091 | Venom, Bullseye (minions); Justice Like Lightning, Excessive Force (treacheries); Dangerous Recruits (side scheme)                 |
| Registration | `cape_killer`              | 56105 to 56108 | Cape-Killer [2] (minion); Unregistered Super (obligation); Bring Them In (treachery); Arrest Order (side scheme)                   |
| Registration | `martial_law`              | 56109 to 56111 | S.H.I.E.L.D. Soldier [3] (minion); Rapid Response (treachery); S.H.I.E.L.D. Patrol (side scheme)                                   |
| Registration | `heroes_for_hire`          | 56112 to 56116 | Colleen Wing, Shang-Chi (minions); Unregistered Super (obligation); Bounty Hunting (treachery); Heroes for Hire (side scheme)      |
| Registration | `paladin`                  | 56117 to 56120 | Paladin (minion); Paladin's Pistol [2] (attachment); Bounty Hunting (treachery); Government Contractor (side scheme)               |
| Resistance   | `new_avengers`             | 56150 to 56154 | Falcon, Hercules, Goliath (minions, all Teamwork (AVENGER)); Freedom Fighters (treachery); New Avengers (side scheme)              |
| Resistance   | `secret_avengers`          | 56155 to 56159 | Black Panther, Spectrum (minions, Teamwork); Freedom Fighters, Switching Sides (treacheries); Secret Avengers (side scheme)        |
| Resistance   | `namor_modular`            | 56160 to 56164 | Namor (minion); Neptune's Trident, Horn of Proteus (attachments); Imperius Rex! (treachery); Ruler of Atlantis (side scheme)       |
| Resistance   | `atlanteans`               | 56165 to 56167 | Atlantean Guard [3] (minion); Atlanteans (treachery); Atlantis Attacks (side scheme)                                               |
| Resistance   | `spider_man_modular`       | 56180 to 56183 | Spider-Man (minion); Tangled Up [2] (attachment); Spectacular! (treachery); Neighborhood Hero (side scheme)                        |
| Resistance   | `defenders`                | 56184 to 56188 | Luke Cage, Jessica Jones (minions); Protect the Innocent, Street Defenders (treacheries); The Defenders (side scheme)              |
| Resistance   | `hells_kitchen`            | 56189 to 56193 | Daredevil, Iron Fist (minions); Resistance Fighter (attachment); Street Defenders (treachery); Defend Hell's Kitchen (side scheme) |
| Resistance   | `cloak_and_dagger_modular` | 56194 to 56198 | Cloak, Dagger (minions); Darkforce (attachment); Lightforce (treachery); Cloak and Dagger (side scheme)                            |

"Freedom Fighters" appears in two resistance sets (56153 in `new_avengers`, 56157 in `secret_avengers`, identical
text) and "Street Defenders" in two (56187 `defenders`, 56192 `hells_kitchen`); "Bounty Hunting" in two registration
sets (56115, 56119). They are separate cards with separate codes.

### 3.5 The Standard PvP set

`standard_pvp` (`card_set_type_name_code: "standard"`): 8 records, 10 copies, named "Standard PVP" (rulebook "Standard
PvP"). It is one five-card set printed twice, once per side: registration copy 56125 Righteous Cause, 56126 Whatever
It Takes, 56127 Targeted Strike x2, 56128a Choosing Sides (side scheme, base threat 4 per hero; b face 56128b "Now
It's Personal", typed `obligation`); resistance copy 56203, 56204, 56205 x2 and 56206a (b face 56206b). The callouts on
rulebook p. 15 print "STANDARD PVP (5/5) ... 128A" beside the registration area and "206A" beside the resistance area
(markdown, unchecked on the PDF). The normalizer emits both under one `standard_pvp` set with `competitiveOnly: true`
(section 5.3) and cannot tell which copy belongs to which side (gap G3). Synthezoid Smackdown (MC57) reprints the same
eight codes as 57036 to 57039a and 57078 to 57081a (`duplicate_of_code` in `synthezoid.json`; `duplicated_by` in
`cw.json`), which matters when that pack is emitted.

### 3.6 Tigra's and Hulkling's kits, obligations and nemesis sets

| Hero     | Identity                     | Hand A / B | HP  | THW / ATK / DEF (A) | REC (B) | Traits (A / B)                    | Kit (copies)                                                                                                                                                                           | Obligation                | Nemesis set                                                                                                           |
| -------- | ---------------------------- | ---------- | --- | ------------------- | ------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Tigra    | 56001a / 56001b Greer Nelson | 5 / 6      | 10  | 1 / 2 / 3           | 3       | Avenger / Police                  | 15: 56002 to 56009 (Moon Knight, Precinct HQ, Cat's Head Amulet, Sharp Claws x2, Cat-Like Reflexes x2, Hunted x3, Tooth and Claw x3, Feline Senses x2)                                 | 56023 In Too Deep         | `tigra_nemesis` 56024 The Hood, 56025 Criminal Underworld, 56026 The Hood's Mantle, 56027 Madame Masque, 56028 Jigsaw |
| Hulkling | 56029a / 56029b Teddy Altman | 5 / 5      | 13  | 1 / 1 / 1           | 4       | Avenger Kree Skrull / Kree Skrull | 15: 56030 to 56040 (Wiccan, Altman Residence, Winged / Hulk / Armored / Imitation Shape, Alien Physiology, Shapeshifter Strike x3, Armored Defense x2, Impersonation x2, Shapeshifter) | 56054 Complicated Lineage | `hulkling_nemesis` 56055 Super Skrull, 56056 Skrull Business, 56057 Fantastic Powers, 56058 You're Coming With Me! x2 |

- Hand size and HP match the rulebook p. 2 callouts (Tigra "HAND SIZE 5 / HIT POINTS 10", Hulkling "HAND SIZE 5 / HIT
  POINTS 13"; markdown). The alter-ego hand sizes (6 and 5) and recovery values are raw only (unchecked).
- Neither identity has `deck_options` or `deck_requirements` in raw (both `null`): no deckbuilding exception.
- Both obligations are hero-kit obligations: the Wave 6 rule (`encounterSetIds: []`) applies and the scratch run does
  that (56023 and 56054 emit with an empty set list).
- Both heroes use "Shapeshift" (Hulkling) or "Hunted" (Tigra) cards that scripting will need: Hulkling's Chosen Shape,
  "You cannot have more than 1 Shapeshift upgrade in play" (56029b), Tigra's "Each minion with a copy of Hunted attached
  loses guard" (56001a). Plain hand-off material, nothing for the schema.

### 3.7 Aspect and basic cards in the box

26 records with no `card_set_code`, 50 copies: **aggression** (Tigra's aspect) 56010 to 56018 (9 records, 21 copies),
**protection** (Hulkling's aspect) 56041 to 56051 (11 records, 21 copies), **basic** 56019 to 56022, 56052, 56053 (6
records, 8 copies). New cards: Two-Gun Kid 56010, Air Cover 56012 x3, Aggressive Conditioning 56013 x3, Coup de Grace
56016 x3, Savage Strike 56017 x3, Yellow Jacket 56019 (basic ally), Patriot 56041, Hidden Base 56043, Excelsior 56045,
Defensive Conditioning 56046 x3, "I Can Do This All Day" 56047 x3, Cuts Both Ways 56050 x3, Iron Lad 56052 (basic ally).
The other 13 are reprints (section 3.8). Note that Hunted 56007 (a Tigra hero card) has raw `cost_star: true` with
cost 0 ("As an additional cost to play this upgrade, search the encounter deck ... put it into play engaged with
you"): the text carries the rule, no schema field is needed.

### 3.8 Reprints (`duplicate_of_code`)

13 in `cw`, 2 in `wonder_man`, 9 in `hercules`. Every original is in a raw cache and has a local scan.

| Pack         | Code and card                                                                                                                                                                                                                                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cw`         | 56011 Spider-Girl (04040), 56014 Suppressing Fire (46014), 56015 "Bring It!" (19030), 56018 Audacity (21046), 56020 Energy (01088), 56021 Genius (01089), 56022 Strength (01090), 56042 Brother Voodoo (09012), 56044 The Night Nurse (09019), 56048 Taunt (42016), 56049 Tackle (05015), 56051 Preservation (21064), 56053 Assess the Situation (12033) |
| `wonder_man` | 58017 Bombs Away (42029), 58023 Energy (01088)                                                                                                                                                                                                                                                                                                           |
| `hercules`   | 59021 Teamwork (06032), 59022 Call for Backup (40018), 59027 Limitless Stamina (31023), 59029 Energy (01088), 59030 Genius (01089), 59031 Strength (01090), 59032 Avengers Compound (58034, Wonder Man's), 59033 Helicarrier (01092), 59034 Quincarrier (08023)                                                                                          |

`58034` Avengers Compound is `duplicated_by` `59032`: the Hercules reprint should reuse the Wonder Man card's image
(same as the Wave 9 cross-pack reprint). Names are identical between each reprint and its original (script check).

## 4. The four preconstructed scenarios (rulebook pp. 7 and 8, **checked** on the rendered pages)

The leader deck is "(I), (II)" for standard and "(III), (IV)" for expert, which fits `Scenario.villainStages`
`{ standard: [1,2], expert: [3,4] }` (the `mut_gen` shape; the `VillainCard` holds four stages). Each scenario's main
scheme deck is one stage 1 and one stage 2 named on the page, which map to the b-face names in section 3.3. The
Standard set is Core's `standard` (`standard_pvp` in competitive mode).

| Scenario id (handoff)         | Leader (record)                | Main scheme stage 1 (a, b)             | Main scheme stage 2 (a, b)               | Own set and modular sets (rulebook order)                                                             |
| ----------------------------- | ------------------------------ | -------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `registration-iron-man`       | Iron Man 56059 to 56062        | Cut Off Support (56063a, 56063b)       | Negative Zone Prison (56064a, 56064b)    | `iron_man_leader`; `mighty_avengers`, `the_initiative`, `maria_hill_modular`, `dangerous_recruits`    |
| `registration-captain-marvel` | Captain Marvel 56092 to 56095  | S.H.I.E.L.D. Recruits (56096a, 56096b) | Hunting Rebel Heroes (56097a, 56097b)    | `captain_marvel_leader`; `cape_killer`, `martial_law`, `heroes_for_hire`, `paladin`                   |
| `resistance-captain-america`  | Captain America 56137 to 56140 | Gathering Support (56141a, 56141b)     | Secret Avengers (56142a, 56142b)         | `captain_america_leader`; `new_avengers`, `secret_avengers`, `namor_modular`, `atlanteans`            |
| `resistance-spider-woman`     | Spider-Woman 56168 to 56171    | Open Rebellion (56172a, 56172b)        | Neighborhood Protectors (56173a, 56173b) | `spider_woman_leader`; `spider_man_modular`, `defenders`, `hells_kitchen`, `cloak_and_dagger_modular` |

- Rulebook wording quirks: p. 7 names the Captain Marvel modular set "Cape-Killer" in the encounter deck line and
  "Cape-Killers" in the footnote; the raw set is `cape_killer`/"Cape-Killer". p. 8's Captain America deck has a main
  scheme named "Secret Avengers" and a modular set of the same name.
- All four modular sets per scenario "can be removed ... and/or added to other scenarios", which `Scenario.recommended
  ModularSetIds` already expresses; the custom-builder rules (any 3 or 4 sets of the chosen side, rulebook p. 4) are a
  scenario-builder feature, not card data. Mixing sides is refused (p. 4); other products' modular sets are allowed in
  cooperative play only (p. 5).
- **Not expressible today:** a scenario that names a stage 1 and a stage 2 main scheme out of eight (gap G1).

## 5. What the normalizer does today

### 5.1 Dry-run results (nothing written)

`survey.ts --pack cw --pack wonder_man --pack hercules`: "1 normalize cleanly, 2 do not". `cw` uses a bare curation (no
corrections), `hercules` its registered curation, `wonder_man` its registered curation.

| Pack         | Result             | Lines                                                                                                                                                                                                                                                                                                      |
| ------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wonder_man` | clean              | 34 cards (hero_identity 1, upgrade 8, event 9, resource 2, support 4, ally 5, obligation 1, minion 1, side_scheme 1, treachery 2), 1 encounter set                                                                                                                                                         |
| `cw`         | 17 issues          | 56057, 56080, 56084, 56098, 56118, 56174, 56191: "attachment without an attach rule" (7); 56191 also "unrecognized attach rule: Attach to a minion of the enemy team's choice." (1); "record never turned into a card" for the same 7 (7); 56128b and 56206a "no artwork reference for the card front" (2) |
| `hercules`   | 7 issues (curated) | 59002 and 59003 "attachment with faction hero" and "attachment without an attach rule"; 59004 "obligation with faction hero"; "record never turned into a card" for 59002 and 59003                                                                                                                        |

`ingest-marvelcdb.ts --pack hercules --offline --dry-run` uses a **bare** curation (the pack is not registered there)
and reports 13 lines: the same 7, plus 59005 to 59007 "hero card in set hercules_gift_deck with no identity" and
"upgrade without a cost". The curation's `auxiliaryHeroSetCodes` and dash costs clear those six, which is why the survey
shows 7. The survey gap matrix: attach-rule shape 10, never turned into a card 9, uncategorized 3 (the three
`faction hero` lines), no artwork 2.

### 5.2 The silent failure: the main scheme chain (not in the survey's list)

With the seven attach lines and the two art lines bypassed in a scratch run (section 5.3), `cw` normalizes to 190
cards. The surprise is the main schemes: `normalize/main-schemes.ts` ("one card per scenario set, one stage per A/B
record pair") groups by `card_set_code`, so all eight registration records become **one** `MainSchemeCard` (id
`56063a`, name "Superhero Registration Act") with **eight stages**, in raw code order, whose stage numbers read
`1, 2, 1, 2, 1, 1, 2, 2`, and all eight resistance records become one card (id `56141a`) the same way. The provenance
record for `56063a` lists all 16 codes. A scenario can name only one `mainSchemeCardId`, and the four precons need
(stage 1, stage 2) pairs that cross those groups. This is gap G1. No error is raised.

The four leaders, by contrast, come out right: one `VillainCard` each (`56059`, `56092`, `56137`, `56168`, collector
numbers "59/60/61/62" and so on), `printedType: "leader"`, side A only, stages 1 to 4, per-hero HP `{ base: 0,
perPlayer: 12 }` and so on, keywords `steady` on stages 2 and 4.

### 5.3 Scratch run (corrections used only to get past the errors; not proposals as written)

Corrections in a scratch curation: `impliedAttachHost: "ownWhenRevealed"` for 56057, 56080, 56084, 56098, 56174 (their
text has no "Attach to" sentence; section 6, G4); `textReplace` "Attack to Paladin" to "Attach to Paladin" on 56118;
`textReplace` "Attach to a minion of the enemy team's choice." to "Attach to a minion." on 56191; and two synthetic art
codes for 56128b and 56206a. Result: **190 cards**: hero_identity 2, ally 8, support 5, upgrade 18, event 21, resource
9, obligation 6, minion 31, side_scheme 24, attachment 23, treachery 37, villain 4, main_scheme 2. (214 records minus 12
leader records minus 14 collapsed main scheme records plus two b faces emitted as cards = 190.)

Other things the scratch output shows:

- **Encounter sets (25).** The 16 modular sets, the four leader sets, `registration`, `resistance`, `standard_pvp`
  (with `competitiveOnly: true`), `tigra_nemesis` and `hulkling_nemesis` (with `nemesisOfIdentityId`). Set names are the
  raw names: "Spider Woman" (card name "Spider-Woman"), "Standard PVP", and a modular set named "Maria Hill" that will
  look like the `aos` Maria Hill hero set in a list (section 10, correction 9).
- **Choosing Sides** emits as a `side_scheme` (56128a, 56206a; `startingThreat` 4 per hero, `permanent` keyword, set
  `standard_pvp`, `otherFaceId` the b face) and the b face "Now It's Personal" as an `obligation` card (56128b, 56206b)
  with `encounterSetIds: ["standard_pvp"]`. Two raw obligations in modular sets (56106, 56114) keep their set (the Wave
  6
  rule only empties a hero-kit obligation). Whether the engine treats a side-scheme / obligation flip pair as a flip is
  a question for scripting.
- **Leader attachments:** "Attach to Iron Man." (56065), "Permanent. Attach to Captain America." (56143) resolve to
  `attachesTo: { kind: "villain" }` (the named leader is a villain-kind host); 56118 resolves to `ifAble { preferred:
  namedCard Paladin, otherwise leader enemy }`; 56181 Tangled Up to `ifAble { preferred leader yours, otherwise your
  identity hero }`. These were designed in Wave 2 (`attachment-host.ts`) and need no change.
- **Competitive-only player cards:** the 16 leader basics emit with `specificTo` (section 3.2).
- **Teamwork** parses: six minions (56074, 56150, 56151, 56152, 56155, 56156) emit `teamwork` with `sharedTrait
  "AVENGER"` (rulebook p. 9; the keyword and its parser rule exist).
- **Keyword inventory in the scratch output:** steady 9 stages, uses 3, villainous 2, quickstrike 4, restricted 1,
  toughness 4, teamwork(AVENGER) 6, retaliate 1 and 2, hinder 14 (the `[per_hero]` form), guard 2, permanent 5, stalwart
  1. No new keyword, and no "unclassified" parse for the pack. Text that mentions piercing (7), ranged (3), overkill
     (5), surge (11), stalwart (6), steady (10) is covered by those parsers or by constant text.

## 6. Schema, parser and decision gaps

"G" numbers are new in this survey. "Not gaps" at the end lists what looked like one and is not.

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                               | Records                                                                                                                                         | Fix kind                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **Main scheme chain collapse.** One `MainSchemeCard` per set, eight stages each, stage numbers repeating; `Scenario.mainSchemeCardId` is a single id, so a scenario cannot pick one stage 1 and one stage 2 of eight.                                                                                                                                                                                             | 56063a to 56124a (8), 56141a to 56202a (8)                                                                                                      | Spec (`game-rules-architect`): either one `MainSchemeCard` per A/B pair (16 cards, scenario names two ids) or a stage-1 and stage-2 pool on the card. Then normalizer (`main-schemes.ts`, which today groups by set) and curation |
| G2  | **No encounter-set side.** Nothing in the schema or the raw data says a set is registration or resistance; the custom builder refuses mixing (rulebook p. 4), the leader sets and 16 modular sets need it.                                                                                                                                                                                                        | all 16 modular sets, 4 leader sets, `registration`, `resistance`, 4 main-scheme groups                                                          | Schema: `EncounterSet.civilWarSide?: "registration" \| "resistance"` (name is the spec's); normalizer reads it from a curation table keyed by set (from the code ranges in section 3.4)                                           |
| G3  | **Standard PvP is two printed copies of one set**, registration copy (56125 to 56128a) and resistance copy (56203 to 56206a), both under `standard_pvp`; the side is only the code range. Also reprinted by `synthezoid` (57036 to 57039a, 57078 to 57081a).                                                                                                                                                      | 56125 to 56128a, 56203 to 56206a                                                                                                                | Decision with G2 (one set with 10 cards, or two sets each with `competitiveOnly`, side-tagged); a curation field either way; dedupe against `synthezoid` when that pack is emitted                                                |
| G4  | **Attach rules with no "Attach to" sentence**: the card is attached by another card's Setup or When Revealed.                                                                                                                                                                                                                                                                                                     | 56057 Fantastic Powers, 56080 Drafted, 56084 Life Model Decoy, 56098 Energy Channel, 56174 Finesse, 59002 Defeat the Hydra, 59003 Embody Pathos | Curation `impliedAttachHost` (`"ownWhenRevealed"` fits 56057, 56080, 59002, 59003; a leader-by-name host fits 56098 and 56174; 56084 is "a minion or their leader")                                                               |
| G5  | **Attach rule text the parser rejects**: "Attach to a minion of the enemy team's choice. Otherwise, this card gains surge."                                                                                                                                                                                                                                                                                       | 56191 Resistance Fighter                                                                                                                        | Parser rule (host `minion` plus a chooser and a fallback) or a curation `textReplace` plus `impliedAttachHost`; the "enemy team" wording means "you" in cooperative play                                                          |
| G6  | **Hercules Labor and Gift decks.** The schema landed in Wave 2 (`phase7-wave2.md` section 15.3: `IdentitySeparateDeck.cardFamily`, `discardPile: "none"`, `whenEmpty: "stayEmpty"`, `EncounterCardCommon.separateDeck`), but the normalizer refuses `faction_code: "hero"` for attachment and obligation (`encounter-cards.ts` line 45) and `curation/hercules.ts` has no `separateDecks`.                        | 59002, 59003, 59004, and the Gift deck 59005 to 59007                                                                                           | Normalizer (let a card in a curated encounter-family separate deck through) and curation (`separateDecks: [{ identityCode: "59001a", deckName: "Labor", cardFamily: "encounter", ... }, { ... "Gift" ... }]`)                     |
| G7  | **Hero deckbuilding by printed resource icon.** Wonder Man's alter ego: "You may include events with a printed [energy] resource icon from any aspect in your deck." Raw has `deck_options: [{ "resource": ["energy"], "type": ["event"] }]` on 58001a; the normalizer ignores `deck_options` and `OffAspectAllowance` filters only by card type and trait. The emitted `58001a` has **no** `deckbuilding` field. | 58001a (and 58001b text)                                                                                                                        | Schema: a resource-icon criterion on `OffAspectAllowance`; curation `identityDeckbuilding["58001a"]`. Without it the Justice precon cannot be validated, because three of its events are Aggression, Protection and Leadership    |
| G8  | **Competitive wording in cooperative play.** "the enemy team" (38 faces), "your team" (27), "enemy leader" (37), "your leader" (16), "In competitive mode" (13), "cooperative mode" (8). All are plain text; `AttachmentHost { kind: "leader" }` and `competitiveOnly` exist.                                                                                                                                     | see section 6.1                                                                                                                                 | No schema change. Scripting needs the rulebook p. 6 mapping (the leader is the villain, the enemy team is the players, "your leader" cannot be resolved); the handoff's team-count plan owns the rest                             |
| G9  | **Flip pair of a side scheme and an obligation** (Choosing Sides to Now It's Personal). Emits as two cards linked by `otherFaceId`; the b face is typed `obligation` and hidden.                                                                                                                                                                                                                                  | 56128a/b, 56206a/b                                                                                                                              | Scripting and engine (the flip happens in the card's own Forced Response, "Flip this card"); the b face is given to the first player                                                                                              |
| G10 | **Printed star on a stat value** has no field: leader SCH star (56059 to 56062) and ATK star (56168 to 56171), main scheme target star (56064b, 56202b) and acceleration star (56122b, 56202b), ally stats (56052 thw and atk, 59018 atk, 59019 hp, 59020 thw). The rule is in the card text.                                                                                                                     | listed                                                                                                                                          | None unless the client wants to draw the star; information only                                                                                                                                                                   |
| G11 | **Raw `deck_limit` missing on the 16 leader basic cards**; the scratch run emits `deckLimit: 1` for all (unchecked on scans: each is a single copy per leader in raw).                                                                                                                                                                                                                                            | 56129 to 56136, 56207 to 56214                                                                                                                  | Confirm a "Max 1" default against the scans at emit, or add a curation `deckLimit` entry                                                                                                                                          |
| G12 | **Errata**: Energy Channel, Ionic Physiology, Yellowjacket (two cards). Section 10.                                                                                                                                                                                                                                                                                                                               | 56098, 58002, 56019, 56073                                                                                                                      | Curation `errata` (`currentReplace`), with the RRG 1.8 page                                                                                                                                                                       |
| G13 | **Rules cards not in MarvelCDB**: the two quick reference cards of MC56 (the competitive quick reference, rulebook p. 20), (a rules reference, text on rulebook p. 20).                                                                                                                                                                                                                                           | none in raw                                                                                                                                     | Decision: data card, UI-only text, or leave to the scenario builder's help; the text is in the rulebook but the cards' own text is not                                                                                            |
| G14 | **Rulebook p. 9 "Alternate Encounter Card Back"**: "rules for these cards prevent them from entering a deck, a discard pile, or a player's hand". The rulebook does not say which cards. Likely the main scheme or Choosing Sides faces; the Hercules insert says the same for the Labor cards (and the Wonder Man insert "Alternate Player Card Back" for an unnamed card, probably Ionic Physiology 58002).     | unknown                                                                                                                                         | Spec question (section 12, question 2). Not a schema gap until the cards are named                                                                                                                                                |

**Not gaps (confirmed by the scratch run or the existing schema):** the `leader` card type and `printedType`; leader
hosts (`kind: "leader"`); `competitiveOnly` on a set; `specificTo: { kind: "competitive" }`; the Teamwork keyword and
its
parser rule; `Hinder X` with the `[per_hero]` form; `Steady`, `Stalwart`, `Piercing`, `Ranged`, `Villainous`,
`Permanent`, `Setup`, `Victory X`, `Toughness`, `Quickstrike`, `Overkill`, `Retaliate`, `Surge`; the amplify, hazard,
crisis and acceleration scheme icons (rulebook p. 9 "Amplify icon"; raw `scheme_amplify`, `scheme_hazard`,
`scheme_crisis`, `scheme_acceleration`); `Temporary`, `Assault`, `Find` (Hercules insert "Featured Terms"); player side
schemes (59022 Call for Backup, 59028 Evaluate Threat); Team-Up (59026 Ancient Rivalry, "Team-Up (Hercules and
Thor)"); the dash-cost pattern (58002, 58031, 59005 to 59007, all curated or curatable); cost `X` (58018, raw cost -1,
already `specialCost: "X"`); per-hero HP on a villain stage. **No `*_per_group` field is set on any record** of the
three packs (script over every face), so the Wave 9 per-group gap (S4) does not apply here.

### 6.1 Records carrying competitive wording (text faces, from the raw text; counted by script)

- "enemy team": 56059, 56061, 56063a, 56072, 56080, 56083, 56084, 56088, 56092, 56094, 56096a, 56096b, 56107, 56112,
  56113, 56116, 56121a, 56122a, 56123b, 56127, 56128a, 56137, 56139, 56141a, 56141b, 56159, 56168, 56170, 56172a,
  56173b,
  56180, 56189, 56191, 56199a, 56200a, 56205, 56206a, 56209 (38 faces).
- "your leader": 56087, 56088, 56090, 56126, 56128b, 56181, 56182, 56183, 56184, 56185, 56190, 56194, 56196, 56204,
  56206b, 56211 (16 faces; "A card ability that refers to 'your leader' cannot be resolved", rulebook p. 6).
- "In competitive mode": 56063a, 56080, 56096a, 56121a, 56122a, 56141a, 56158, 56172a, 56182, 56183, 56194, 56199a,
  56200a (13 faces); "In cooperative mode" also appears on the stage-1 Setup text of the eight stage-1 a records.
- "Unregistered" (a trait granted by text): 56097b, 56105, 56106, 56107, 56112 to 56117, 56119, 56120 (12 faces). The
  trait is not printed on any card's trait line; it is a granted trait, so it should be valid for text and conditions
  but never appears in `traits`.

## 7. The hero packs in detail

### 7.1 Hercules (`hercules`)

- **Identity 59001a/b** Hercules / Hercules (same name on both faces): A hand 4, HP 14, THW 1, ATK 3, DEF 2; B hand 6,
  recover 4; traits Avenger, Olympus / Olympus. Aspect: Leadership (insert heading "HERCULES / LEADERSHIP",
  **checked**). The text on A is "Atonement" (Response: after a Labor card is added to the victory display, put the top
  card of the Gift deck into play, ready Hercules, may flip to alter-ego, limit once per phase) and on B "Hercules
  begins
  the game with a labor deck and a gift deck. (See insert.) New Labors of Hercules - Action: if there is no labor card
  in play, reveal the top card of the labor deck."
- **Labor deck (3):** 59002 Defeat the Hydra (attachment), 59003 Embody Pathos (attachment), 59004 Protect Humanity
  (typed **obligation**, "Uses (3 labor counters)"). All three: `faction_code: "hero"`, `card_set_type_name_code:
  "hero_special"`, "Victory 0", trait Labor, no cost, a When Revealed that finds its own target and attaches itself
  (59002, 59003) or finds Amadeus Cho (59004). **Gift deck (3):** 59005 Nemean Lion Skin, 59006 Shield of Perseus,
  59007 Sword of Peleus: Permanent upgrades, trait Gift, no cost ("Response: After this card enters play, draw 4
  cards"). The Hercules insert (**checked**): "he begins each game with two special 3-card decks ... shuffle the three
  GIFT cards together to form the GIFT deck and the three LABOR cards to form the LABOR deck. Then, place both of these
  decks facedown in your play area. During the game, while in alter-ego form you may use ... New Labors of Hercules ...
  After a LABOR card enters the victory display while in hero form, you may use ... Atonement". This matches the Wave 2
  schema shape (G6). RRG 1.8 FAQ "Labor Cards" (p. 65): a Labor card that fails to find a target is discarded; a Labor
  card that leaves play other than into the victory display goes to the bottom of the Labor deck. Rulings: February 20,
  2026 (3) (Protect Humanity needs an ally), March 6, 2026 (3) answer 2, June 2, 2026 (2) answer 3 (Embody Pathos can
  find set-aside cards).
- **Obligation 59035 Appeal to Athena** (faction `encounter`, set `hercules`): hero-kit
  obligation, emptied by the Wave 6 rule. "When counting Gift cards you control, you are considered to control none."
- **Kit (15):** Amadeus Cho 59008, The Gift of Battle x3 59009, Son of Zeus x2 59010, Wisdom of Athena x2 59011, Olympus
  59012, Gauntlets of Hercules 59013, Golden Mace 59014, Herc's Helm 59015, Lion of Olympus x2 59016 (Temporary), Prince
  of Power 59017. Several cards count Gift cards in play (59009 to 59014 text).
- **Leadership (13 copies):** Deathcry 59018, Namora 59019, Thor 59020, Teamwork x3 59021 (reprint), Call for Backup
  59022 (player side scheme, reprint), Recruitment Drive x3 59023, "Avenge Me!" x3 59024.
- **Basic (13 copies):** Gilgamesh 59025, Ancient Rivalry x2 59026 (**Team-Up (Hercules and Thor)**), Limitless Stamina
  x3
  59027 (reprint), Evaluate Threat 59028 (player side scheme), Energy, Genius, Strength 59029 to 59031 (reprints),
  Avengers Compound 59032 (reprint of 58034), Helicarrier 59033, Quincarrier 59034 (reprints).
- **Nemesis set `hercules_nemesis` (5):** Ares 59036 (Elite, Olympus), Lernean Hydra 59037, Olympic Feud 59038 (side
  scheme, 2 fixed), Ares's Axe 59039 (attachment), God of War 59040 (treachery).
- **Modular set `all_versus_all` (5):** All Versus All 59041 (side scheme, Hinder 2 [per_hero]), Hecate 59042, Kyknos
  59043, Bewitched Officer 59044 (trait Enthralled), Roving Mobs 59045 (side scheme, 3 fixed). Hecate and Roving Mobs
  both say "Find the All Versus All side scheme and reveal it".
- **Team-Up art:** `art/teamups/hercules-thor` does not exist (section 9).
- The Hercules insert (**checked**) lists the featured terms Assault, Find, Permanent, Piercing, Player Side Scheme,
  Steady, Temporary and Victory X, all already in the schema.

### 7.2 Wonder Man (`wonder_man`)

- **Identity 58001a/b** Wonder Man / Simon Williams: A hand 5, HP 12, THW 2, ATK 1, DEF 2; B hand 6, recover 3; traits
  Aerial, Avenger / Civilian. Aspect Justice (insert "WONDER MAN / JUSTICE", **checked**). A: "Power Recycling" (+1 ATK
  per card tucked under Ionic Physiology) and a star Forced Response; B: "Ionic Energy Being" (deckbuilding, G7) and
  "Setup: Put Ionic Physiology into play."
- **Kit (16 copies plus the identity):** 58002 Ionic Physiology, Active Altruism x3 58003, Ionic Blast x2 58004,
  Starstruck
  x3 58005, Energy Siphon x2 58006, Wonder Fans 58007, Jet Belt 58008, Mr. Hollywood 58009, Signature Sunglasses 58010,
  "What Are You?" 58011. Scan 58011 prints "WONDER MAN (16/16)", so the printed hero set is 16 cards and does not count
  the identity (**checked**).
- **Aspect and basic (36 copies):** Justice 58012 Firebird, 58013 Hawkeye, 58014 Scarlet Witch, 58015 Sentry, 58016
  Battlefield Benevolence x3, 58018 Everywhere All at Once x3, 58021 Heroic Conditioning x3; **off-aspect energy-icon
  events** 58017 Bombs Away (Aggression, reprint of 42029) x3, 58019 Stronger Together (Protection) x3, 58020 Unified
  Strike (Leadership) x3; **other-aspect support** 58030 Caught in the Crossfire (Aggression), 58031 Cameo
  (Leadership), 58032 Coordinated Effort (Leadership), 58033 Disarming Defense (Protection); basic 58022 Swordsman,
  58023
  Energy (reprint), 58024 Jarvis, 58034 Avengers Compound.
- **Nemesis set `wonder_man_nemesis` (5 copies):** Grim Reaper 58026, Brother vs. Brother 58027, Scythe Strike 58028,
  Death
  Cannot Die x2 58029. **Obligation 58025 Pacifism** (hero-kit, emptied).
- **No modular set** (section 0).
- **Cameo 58031** ("Search your collection for an identity-specific ally for an identity not in this game"): the Wonder
  Man insert FAQ (**checked**) says "Cameo allows you to search through all of your Marvel Champions cards outside of
  the
  current game for an ally that belongs to another identity's set of cards." Ruling March 19, 2026 (6): setup-added
  unique cards may share titles with the deck. The same "collection" question as Wave 9 S10; the insert answers it for
  this card.
- The Wonder Man insert (**checked**) lists the featured terms Amplify, Permanent, Piercing, Player Side Scheme, Setup
  (keyword) and Tuck.

## 8. `wonder_man` (already emitted): is it still in step with the raw cache?

Method: re-ran the normalizer on `raw/marvelcdb/wonder_man.json` with the registered curation, rendered `cards.ts` with
the emitter's own `emitModule`, and diffed it against `src/data/wonder_man/cards.ts` (scratch only, nothing written).

- **Yes, in step.** 34 cards; **the only differences are the image extensions** (committed `.jpg`, regen `.png` for 32
  lines, the known Wave 8 and 9 behavior; keep the committed extension). No other line differs: no ability, stat or
  text drift. The curation, raw cache and emitted data agree.
- **What the wave needs changed for `wonder_man`:**
  1. **Errata** (`errata: []` today): Ionic Physiology 58002, "Response: After you play an event with a printed [energy]
     resource, tuck that event from your discard pile under this card. Then, heal 1 damage from your identity." The raw
     and the print have a cost arrow where the erratum has "Then". RRG 1.8 Appendix V, p. 70, and ruling March 6, 2026
     (3); the emitted card has `printed` and `current` both with the arrow.
  2. **`deckbuilding`** on identity 58001a (G7): not emitted today.
  3. **Cycle name** (`cycle10` placeholder "Cycle 10") if the owner picks a name (section 11); `data-only.test.ts`
     asserts
     `cycleOf("wonder_man") === "cycle10"` and will keep passing.
  4. **A starter deck** (`starterDecks: []` today): blocked on a source (section 10.1, owner).
  5. **Pool move.** `wonder_man` leaves `DATA_ONLY_*` for a `WAVE10_*` block when its kit is scripted, which empties the
     data-only pool (`PACKS` in `data-only.test.ts`, the "one pack" test and the `index.ts` header comment all change).
     Decide whether the data-only mechanism stays (empty) or goes; `fne` may use it next.
  6. **58002's deck status** (G14, unknown): the Wonder Man insert mentions an "Alternate Player Card Back", which most
     likely means Ionic Physiology is a set-aside Setup card outside the deck; the emitted card has `deckLimit: 1`.
     Settle with the spec before the starter deck is built (compare Nick Fury's Assault/Stealth, Wave 9 section 6.1).
  7. **Image check:** 58023 (Energy, reprint of 01088) reuses the Core scan; the other 34 faces have local scans.

## 9. Card art

All art is outside the versioned data. Wave 9's `aos` references resolve as `/bundles/cards/<code>.<ext>` against the
gitignored `assets/card-art/bundles/cards/` (5145 files), which the client serves through `vite-card-art.ts`;
`packages/client/public` does not exist. The ingest's `withLocalArt` picks the extension from the files present
(`.png` in the regen, `.jpg` in the committed data; same drift as Waves 8 and 9). Coverage by script over every face
(front and nested back), `<code>.png` present:

| Pack         | Records | Faces | Faces with a scan | Missing scans | Which                                                                                   | Faces with no raw `imagesrc`                                                             |
| ------------ | ------- | ----- | ----------------- | ------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `cw`         | 214     | 234   | 224               | **10**        | 8 reprints (56011, 56015, 56018, 56042, 56044, 56049, 56051, 56053), **56128b, 56206a** | 44 (32 main scheme faces, 4 side-scheme faces, 8 reprints; all but two covered by scans) |
| `wonder_man` | 34      | 35    | 34                | 1             | 58023 (reprint of 01088)                                                                | 1                                                                                        |
| `hercules`   | 45      | 46    | 38                | 8             | all 8 are reprints (59021, 59027, 59029 to 59034)                                       | 8                                                                                        |

- **Genuinely missing: 56128b "Now It's Personal" (registration copy, back of Choosing Sides) and 56206a "Choosing
  Sides" (resistance copy).** The other face of each copy (56128a and 56206b) has a scan, so each side's art exists
  for one face only. The two copies are the same card in two colors; reusing the sibling's scan would show the wrong
  color. Owner supplies both, or accept a stand-in.
- Every reprint listed as missing has an original with a scan, so the 17 reprint codes reuse the earlier image (as in
  Wave 9).
- `assets/card-art/hall-of-heroes-manifest.tsv` has 34 lines for codes 56xxx, 58xxx or 59xxx.
- **Hero art** (`art/heroes/<id>-<slug>/hero.<ext>`): Wonder Man `art/heroes/58001a-wonder-man/hero.jpg` present.
  **Pending and empty (`.gitkeep` only):** `art/heroes/_pending/56001a-tigra/`, `56029a-hulkling/`, `59001a-hercules/`
  (also pending and out of scope: `60001a-daredevil`, `60037a-echo`, `61001a-jessica-jones`, `62001a-luke-cage`). I
  opened
  no hero image.
- **Scenario art** (`art/scenarios/<id>/villain.*`): none for `registration-iron-man`, `registration-captain-marvel`,
  `resistance-captain-america`, `resistance-spider-woman`. **No campaign art folder** is needed (the box has no
  campaign); `art/campaigns/` has no `cw`. Whether the custom scenario builder needs a cover or per-side art is a client
  question.
- **Team-up art** (`art/teamups/`): the folder has 19 entries and none for Hercules and Thor (slug rule: names
  lowercased and sorted, so `hercules-thor`). One pair for this wave.
- **Pack art:** `art/packs/_pending/` has `tt` only.

## 10. Anomalies, corrections owed, and precon decklists

Anomalies found (every card marked checked was opened as a scan this session; the others are raw only):

| Id                             | Anomaly                                                                                                        | Status                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 56023                          | In Too Deep: "engage3d" for "engaged"                                                                          | **checked** (the scan prints "engaged")                                      |
| 56027                          | Madame Masque: "Criminal **Underwold** side scheme" in the When Revealed                                       | **checked** (scan: "Underworld")                                             |
| 56086                          | S.H.I.E.L.D. Helicarrier: "deals 1 **damager**"                                                                | **checked** (scan: "damage")                                                 |
| 56118                          | Paladin's Pistol: "**Attack** to Paladin."                                                                     | **checked** (scan: "Attach to Paladin.")                                     |
| 56158                          | Switching Sides: "the **enmy** team"                                                                           | **checked** (scan: "enemy")                                                  |
| 56178                          | Inconspicuous: "**Chooose**:"                                                                                  | **checked** (scan: "Choose:")                                                |
| 59045                          | Roving Mobs flavor: "wargospel"                                                                                | **checked**: printed as "wargospel"; not a typo, keep                        |
| 56019                          | Yellow Jacket (ally) and 56073 Yellow Jacket (minion): printed "Yellow Jacket", current title "Yellowjacket"   | RRG 1.8 Appendix V, p. 70                                                    |
| 56098                          | Energy Channel: cost arrow before "Captain Marvel attacks that character"; current wording "and"               | RRG 1.8 Appendix V, p. 70; rulings January 26, 2026 (5) and June 2, 2026 (4) |
| 58002                          | Ionic Physiology: cost arrow; current wording "Then"                                                           | RRG 1.8 Appendix V, p. 70; ruling March 6, 2026 (3)                          |
| 56191                          | Resistance Fighter: "of the enemy team's choice" has no parser rule                                            | gap G5                                                                       |
| 56128b, 56206b                 | The b face of a side scheme is typed `obligation` ("Now It's Personal")                                        | gap G9                                                                       |
| 56129 to 56136, 56207 to 56214 | no `deck_limit` in raw                                                                                         | gap G11                                                                      |
| 56007                          | Hunted: raw `cost_star: true`, cost 0                                                                          | text carries it; no field                                                    |
| 56106, 56114                   | Same card ("Unregistered Super") under two codes in two modular sets; obligation type with faction `encounter` | fine; set kept by the Wave 6 rule                                            |
| 56153, 56157                   | Same card ("Freedom Fighters") under two codes in two resistance sets                                          | fine                                                                         |
| Pack-wide                      | Rulebook p. 7 "Cape-Killer" vs "Cape-Killers" for one set                                                      | markdown and rendered p. 7 agree; raw is `Cape-Killer`                       |
| Pack-wide                      | MC56 p. 2 total 274 vs raw 272 copies (two quick reference cards)                                              | G13                                                                          |

No raw record has a missing trait where the scan matters that I could find (the script over names, traits and text
against the 60 other caches flagged only the six typos above plus proper nouns). Missing traits are otherwise **not
verified** (that needs scans).

### Corrections the data agent owes (for the emit step)

1. New `curation/cw.ts`: cycle (`cycle10`; name per the owner, section 11), pack "Civil War", release 2025-10-17 (Hall
   of
   Heroes), `outDir src/data/cw`, `exportPrefix "CW"`; register in `ingest-marvelcdb.ts` and `survey.ts`.
2. 56118: `textReplace` "Attack to Paladin" to "Attach to Paladin" (scan checked).
3. 56023 `textReplace` "engage3d" to "engaged"; 56027 "Underwold" to "Underworld"; 56086 "damager" to "damage"; 56158
   "enmy" to "enemy"; 56178 "Chooose" to "Choose" (all five scan checked).
4. `impliedAttachHost` for 56057, 56080 (`"ownWhenRevealed"`), 56098 and 56174 (the leader by name; both are put on the
   leader by its Setup), 56084 (a minion or the leader), and the Hercules pair 59002 and 59003 (`"ownWhenRevealed"`).
5. 56191: a parser rule or `textReplace` for "of the enemy team's choice" (G5).
6. Errata, each with `version: "RRG 1.8"` and the page: 56019 title and text "Yellowjacket" (Appendix V, "YELLOW
   JACKET (#19)"), 56073 title "Yellowjacket" ("YELLOW JACKET (#73)"), 56098 Energy Channel "and" (p. 70), 58002 Ionic
   Physiology "Then" (p. 70). Keep the printed text and put the erratum in `current`. The flavor text of 56123b (The
   Initiative, stage 2B) already prints "Yellowjacket", which agrees with the erratum.
7. **Main scheme re-shape (G1)**: after the spec decision, change `main-schemes.ts` so each A/B pair is its own stage
   record and the 16 pairs are addressable; emit the B-face names as stage names (they already are).
8. **Encounter-set side (G2, G3)**: a curation table (set code to registration or resistance) from the code ranges in
   section 3.4, the leader sets and the main-scheme sets, plus the Standard PvP decision.
9. Set names: `spider_woman_leader` "Spider Woman" to "Spider-Woman", `standard_pvp` "Standard PVP" to "Standard PvP"
   (rulebook spelling), and a distinct display name for `maria_hill_modular` (currently "Maria Hill", the same as the
   `aos` hero set `maria_hill`).
10. Art stubs for 56128b and 56206a (owner supplies the scans; until then the survey's two art lines stay).
11. 16 leader basic cards: confirm `deckLimit: 1` against the scans (G11).
12. Four scenarios (section 4), `Scenario.id` `registration-iron-man`, `registration-captain-marvel`,
    `resistance-captain-america`, `resistance-spider-woman` (the handoff's music folder names), `villainStages`
    `{ standard: [1, 2], expert: [3, 4] }`, `recommendedModularSetIds` from section 4, standard sets Core's `standard`.
13. Starter decks Tigra (aggression) and Hulkling (protection) from section 10.2, `verified: true`, with obligation
    (56023, 56054) and nemesis set ids.
14. `curation/hercules.ts`: `separateDecks` for the Labor deck (`cardFamily: "encounter"`, 59002 to 59004, facedown, no
    discard pile, `whenEmpty: "stayEmpty"`) and the Gift deck (59005 to 59007, player family), per Wave 2 section 15.3;
    normalizer step for G6; keep the three dash costs; register in `ingest-marvelcdb.ts`; change the header comment that
    says "NOT registered".
15. `curation/wonder_man.ts`: errata for 58002 (item 6), `identityDeckbuilding["58001a"]` (G7, after the schema
    change), `starterDecks` (blocked on a source).
16. Cycle: change the `cycle` name on all three curations to the owner's choice (id stays `cycle10`).
17. Scripting notes (`scriptingNotes`) for the hand-off: Tigra (Hunted, On the Hunt, Undercover Work), Hulkling (Chosen
    Shape, Shapeshift upgrades, "cannot have more than 1"), the leaders (Setup finds an attachment; Cap's Shield and
    Energy Channel; Finesse counters), Standard PvP and "Choosing Sides" (competitive only; cooperative fallback),
    Wonder Man (Ionic Physiology tuck, Power Recycling), Hercules (Labor and Gift decks, Atonement).
18. Re-emit `wonder_man`'s `cards.ts` only for the 58002 erratum and `deckbuilding`: do not accept the 32
    image-extension
    hunks.

### 10.1 Starter decks for the two hero packs: no source found

The Hall of Heroes pages for **Wonder Man** and **Hercules** show "Starter Deck" as unlinked text (page HTML and the
rendered text; compare the four Wave 9 pages, which linked an image per pack). The insert JPGs
(`.../2026/02/wonder-man-pdf.jpg`, `.../2026/02/hercules-pdf.jpg`, **checked**) are rules, credits and a strategy
paragraph with **no decklist**. MarvelCDB's public decklists (`/api/public/decklists/by_date/2026-02-20`) are player
decks, not the printed precon. So these two lists **cannot be derived from raw** (raw copies exceed what a 40-card deck
holds, and the precon includes reprinted cards from other products, as the Wave 9 lists did) and **still need the
printed decklist card or an official source** (owner, section 11). What raw does give: the hero kit is 16 cards for
Wonder Man (scan-checked) and 15 for Hercules
(plus the 6 Labor and Gift cards, which sit outside the deck); the pack's own aspect and basic copies are, for Wonder
Man, justice 13, off-aspect energy events 9, other-aspect and basic 14, and for Hercules, leadership 13 and basic 13.
A 40-card list needs the printed counts.

### 10.2 Starter decks for the box (Tigra and Hulkling), **checked** on the rendered rulebook p. 18

Names and counts match the markdown card for card. Mapped to raw by script (every name matched a code, every copy
count is within raw `quantity`); each list sums to 40 (hero + aspect + basic):

| Deck                 | Hero cards (15)                                                                                                                                                                                                                                    | Aspect (21)                                                                                                                                                                                                                                     | Basic (4)                                                       | Obligation                | Nemesis set                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| Tigra, Aggression    | 56002 Moon Knight, 56003 Precinct HQ, 56004 Cat's Head Amulet, 56005 Sharp Claws x2, 56006 Cat-Like Reflexes x2, 56007 Hunted x3, 56008 Tooth and Claw x3, 56009 Feline Senses x2                                                                  | 56010 Two-Gun Kid, 56011 Spider-Girl, 56012 Air Cover x3, 56013 Aggressive Conditioning x3, 56014 Suppressing Fire x3, 56015 "Bring It!" x3, 56016 Coup de Grace x3, 56017 Savage Strike x3, 56018 Audacity                                     | 56019 Yellow Jacket, 56020 Energy, 56021 Genius, 56022 Strength | 56023 In Too Deep         | 56024 The Hood, 56025 Criminal Underworld, 56026 The Hood's Mantle, 56027 Madame Masque, 56028 Jigsaw |
| Hulkling, Protection | 56030 Wiccan, 56031 Altman Residence, 56032 Winged Shape, 56033 Hulk Shape, 56034 Armored Shape, 56035 Imitation Shape, 56036 Alien Physiology, 56037 Shapeshifter Strike x3, 56038 Armored Defense x2, 56039 Impersonation x2, 56040 Shapeshifter | 56041 Patriot, 56042 Brother Voodoo, 56043 Hidden Base, 56044 The Night Nurse, 56045 Excelsior, 56046 Defensive Conditioning x3, 56047 "I Can Do This All Day" x3, 56048 Taunt x3, 56049 Tackle x3, 56050 Cuts Both Ways x3, 56051 Preservation | 56052 Iron Lad, 56053 Assess the Situation x3                   | 56054 Complicated Lineage | 56055 Super Skrull, 56056 Skrull Business, 56057 Fantastic Powers, 56058 You're Coming With Me! x2    |

The markdown of p. 18 mixes the two decks' basic and nemesis lines (column flow); the rendered page shows Tigra's
basic and nemesis lists at the foot of her box and Hulkling's at the foot of his, as above. `StarterDeckCuration`
fields: `identityCode` 56001a / 56029a, `aspect` aggression / protection, `obligationCode`, `nemesisCodes`.

## 11. What must be asked of the owner

1. **Starter decklists for Wonder Man and Hercules:** a photo of each printed decklist card (or the box's list), since
   no official source is online (section 10.1). Until then the two precons stay out of the data and the e2e game uses
   the box's two (Tigra, Hulkling).
2. **Hero art** into `art/heroes/_pending/56001a-tigra/`, `56029a-hulkling/` and `59001a-hercules/`; **scenario art**
   for
   the four scenario ids; scans of **56128b** (Now It's Personal, registration copy) and **56206a** (Choosing Sides,
   resistance copy); a photo of the two **quick reference cards** if they should be cards in the game.
3. **Cycle display name** for cycle 10: "Civil War" (recommended, same rule as Wave 9) or something else.
4. **Standard PvP (G2, G3):** one 10-card set tagged to both sides (recommended default: two side-tagged copies of the
   5-card set, so the builder picks the copy of its side) or one set.
5. **Whether Wonder Man's printed hero set of 16 includes Ionic Physiology in the 40-card deck** or whether it starts
   set aside (alternate player card back). A photo of 58002's back or the box rulebook line answers it.
6. **Wonder Man, Hercules and Civil War rulings errata** are all from RRG 1.8 and the rulings page; no owner input.

## 12. Open questions for the spec (`game-rules-architect`)

1. **G1:** one `MainSchemeCard` per A/B pair (16 cards, the scenario names two ids) or one card with two stage pools?
   Recommended default: 16 single-stage cards, `Scenario.mainSchemeCardIds: [stage1, stage2]`, with the builder choosing
   from the side-tagged set.
2. **G14:** which cards carry the "alternate encounter card back" of MC56 p. 9 and what the rule means for the data
   (never in a deck, never discarded). Names are not in the rulebook.
3. **Expert mode for a leader:** III and IV replace I and II (the `villainStages` pair; the 1A Contents text says "III
   and IV for expert mode"). Does a custom scenario from the builder swap the same way?
4. **The "grim rule"** for "the enemy team" in cooperative play (rulebook p. 6): "Imagine what an opponent would do if
   it
   were their choice." Is that a player prompt, an automatic default, or an opponent-logic decision for each such card? 38 faces.
5. **Hercules's Labor deck target absence** (RRG p. 65 vs ruling March 6, 2026 (3) answer 2): the RRG FAQ says a Labor
   card that finds no target is discarded, and the ruling says one that cannot enter play goes to the bottom of the
   Labor
   deck. They read compatibly (not entering play vs leaving play) but state it in §4.1 with the page.

## 13. Proposed emit order and tests that change

Steps touching different files can run in parallel, at most three agents. This mirrors Wave 9 section 11; the file lists
are carried from there and **not re-derived** here.

1. **Spec decisions** (G1 to G3, G7, G14) and **schema changes** (`EncounterSet` side field, `OffAspectAllowance` icon
   criterion, main scheme pool shape).
2. **Normalizer prep (small):** `main-schemes.ts` for G1; G6 (encounter-family separate deck, `faction hero`); G5 parser
   rule; extend `normalize.test.ts` and `parse-text.test.ts`.
3. **`curation/cw.ts`** (corrections 1 to 12), register; done when `survey.ts --pack cw` is clean. Then
   scenarios, the two box starter decks and emit `cw`.
4. **`curation/hercules.ts`** (items 4, 14, 16), register; emit `hercules`; starter deck blocked on question 1.
5. **`wonder_man`** re-emit for the erratum and deckbuilding (item 15); starter deck blocked on question 1.
6. **`WAVE10_*` block in `src/data/index.ts`** (before `PLAYABLE_CARDS`, after `WAVE9_*`): `export *` for `cw` and
   `hercules`, `WAVE10_CARDS` (Core plus the wave), `WAVE10_ENCOUNTER_SETS`, `WAVE10_SCENARIOS`, `WAVE10_STARTER_DECKS`;
   append to `PLAYABLE_CARDS`; **no campaign** (`CAMPAIGNS` unchanged: MC56 has none); move `wonder_man` out of
   `DATA_ONLY_*`.
7. **Tests that change:** `data-only.test.ts` (`PACKS` goes from 1 to 0, the "one pack" test, the cycle10 assertion);
   `campaigns.test.ts` (add `WAVE10_ENCOUNTER_SETS` and `WAVE10_SCENARIOS`; the `CAMPAIGNS` id list does not change);
   `schema/star-icon.test.ts`, `minion-hp-per-player.test.ts`, `pool-version.test.ts`, `catalog.test.ts` and
   `catalog-codes.ts` counts, `schema/glossary.test.ts` (a `cycle10` box and a `WAVE_10_IDS` test); a new
   `wave10.test.ts`
   (model `wave9.test.ts`/`wave8.test.ts`: `validateCard` on every card, counts by type, encounter sets, the four
   scenarios, the two box starter decks, errata, leaders, the 16 competitive basic cards, the Labor and Gift decks); the
   client's `pool.ts` (outside content).
8. **Art step (owner-supplied):** section 9 and owner question 2.
