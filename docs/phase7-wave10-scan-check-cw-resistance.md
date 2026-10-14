# Phase 7 wave 10: raw card text against the card scans (Civil War, resistance side)

Date: 2026-10-11. Branch `feature/wave-10`. Nothing in the repo was changed except this file.

## Method

Every record with a code from 56137 to 56214 inclusive in `packages/content/raw/marvelcdb/cw.json` (78 records) and
every nested b face (nine: 56141b, 56142b, 56172b, 56173b, 56199b, 56200b, 56201b, 56202b, 56206b), 87 faces in all,
was compared with its scan in `assets/card-art/bundles/cards/`. The raw cache was printed with a node script (code,
name, type, stage, traits, cost, resource icons, stats, star flags, per-player flags, boost, scheme icons, set name,
set position, unique flag, flavor, `real_text`) and read next to the scan, field by field: title, subtitle, type line,
stage, traits, cost, resource icons, SCH / ATK / THW / DEF / hit points, the per-player icon on each stat and threat,
stat stars, starting / target threat, escalation, hazard / acceleration / crisis / amplify icons, keywords, every
ability label, the ability text word for word, arrows, boost icons and boost star, set name, set position (n/N),
unique icon. The b faces carry HTML in `text` and plain text with `[per_hero]` in `real_text`; `real_text` was read.

Notes on the scans:

- The files are WebP images saved with `.png` and `.jpg` extensions. The main scheme faces (56141a to 56142b, 56172a
  to 56173b, 56199a to 56202b) and 56206b are small (about 420 x 290, 56206b about 290 x 420) but legible; every other
  scan is large. The A faces of the three "Superhero Resistance" and the three "Resistance Tactics" scans are the same
  picture, so each was compared once with the raw record of its own code.
- Printed quantity is on no card, so the raw `quantity` was not checked. Illustrator credits were not compared.
- The set total N is not in the raw cache, only the position n. The scans print Captain America n/14, Spider-Woman
  n/14, Resistance n/8, New Avengers n/5, Secret Avengers n/5, Namor n/5, Atlanteans n/5, Spider-Man n/5, Defenders
  n/5, Hell's Kitchen n/5, Cloak & Dagger n/5, Standard PVP n/5. The player cards print "Basic / Captain America" or
  "Basic / Spider-Woman" with no n/N, and the A faces print "(???)".
- The raw `set_position` is the first position of a card with several copies (as in the registration check):
  Super-Soldier Serum 56145 prints 7/14 (its second copy is 8), Shield Toss 56147 10/14 (11), Heroic Strike 56148 12/14
  (13), Pheromones 56176 8/14 (9), Venom Blast 56177 10/14 (11), Inconspicuous 56178 12/14 (13), Atlantean Guard 56165
  1/5 (2, 3). The fourteen slots of each leader set are all accounted for with those quantities (Captain America: 1 to
  4 leaders, 5 shield, 6 helmet, 7 and 8 serum, 9 Shield Block, 10 and 11 Shield Toss, 12 and 13 Heroic Strike, 14
  Fearless Determination; Spider-Woman: 1 to 4 leaders, 5 Finesse, 6 and 7 Contaminant Immunity, 8 and 9 Pheromones, 10
  and 11 Venom Blast, 12 and 13 Inconspicuous, 14 Self-propelled Glide). The two Atlanteans slots (2 and 3) are
  accounted for by the raw quantity 3 on 56165. Unlike the registration side, no set position is off by one here.
- The four scheme icons were identified from known cards in the registration half and agree with the raw flags here:
  amplify (a jet with a plus) on 56149, 56164, 56183; hazard (a card with a plus) on 56154, 56193; crisis (an
  exclamation burst) on 56159, 56198; acceleration (a house shape with a bar) on 56179, 56188. Per-player icons on
  threat agree: 56149, 56179 and 56128a print a person icon; 56154, 56159, 56164, 56167, 56183, 56188, 56193, 56198
  print a bare number. All eight main scheme B faces print the per-player icon on the target threat (7 or 9) and on
  the escalation (+1), matching `threat_fixed: false` and `escalation_threat_fixed: false`; the 0 starting threat is
  bare, matching `base_threat_fixed: true`. The stars agree: ATK star on all four Spider-Woman leaders, target threat
  and escalation stars on 56202b, boost star on every card with a "Boost" label and no icons, scheme / attack stars on
  56161, 56162, 56196, and the "+1" modifiers on 56144, 56175, 56191 print no star where the raw has none.
- The cache's `[energy]`, `[physical]`, `[mental]`, `[wild]`, `[per_hero]`, `[star]`, `[boost]` were read as the matching
  printed icon in every case (energy and physical on 56161, mental and physical on 56162, physical on 56208, mental on
  56212).

## Result in one paragraph

Four records differ from their print in the text, and one set name differs in spelling. 56158 ("enmy" for "enemy") and
56178 ("Chooose" for "Choose") are typos the spec already expected. 56205 (Targeted Strike) has "The card gains" for the
printed "This card gains", the same wording that was found on its sibling 56127. 56209 (Recruited by Cap) carries
broken markup, `Action<b/>`, with the right words. The Spider-Woman set is named "Spider Woman" in the cache and
"Spider-Woman" on the print (14 records). Everything else matches, including every ability label, every "In
competitive mode" clause, every "enemy team" / "your team" / "your leader" wording and all eight main scheme B faces. Of
the differences only 56205 may change behavior, and it is in the competitive set that the spec sets aside. 56206a has no
scan of its own; its text was checked against the sibling print 56128a and matches word for word.

## Faces

Result is "matches" or the exact difference (raw says / card prints). Hit points are read from the stat bubble where
the card has one.

### Captain America leader (captain_america_leader)

| Code  | Face                   | Result                                                                                                                                         |
| ----- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 56137 | Captain America I      | matches (SCH 1, ATK 2, 14 per player, Avenger., unique, Setup and Forced Response word for word, flavor, 1/14)                                 |
| 56138 | Captain America II     | matches (SCH 2, ATK 2, 18 per player, Steady, When Revealed, Forced Response, 2/14)                                                            |
| 56139 | Captain America III    | matches (SCH 2, ATK 2, 18 per player, Setup, Forced Response, flavor, 3/14)                                                                    |
| 56140 | Captain America IV     | matches (SCH 2, ATK 3, 22 per player, Steady, When Revealed, Forced Response, 4/14)                                                            |
| 56143 | Cap's Shield           | matches (attachment, Item., Permanent, unique icon, retaliate 1 and "lose piercing", Forced Response, 5/14)                                    |
| 56144 | Cap's Helmet           | matches (+1 SCH no star, unique icon, Armor., stalwart, Hero Response "3 resources of the same type", boost star, 6/14)                        |
| 56145 | Super-Soldier Serum    | matches (+2 ATK star, Item., star Forced Interrupt with overkill, boost star, 7/14)                                                            |
| 56146 | Shield Block           | matches (treachery, boost 3, When Revealed, flavor, 9/14)                                                                                      |
| 56147 | Shield Toss            | matches (treachery, boost 2, both When Revealed forms, 10/14)                                                                                  |
| 56148 | Heroic Strike          | matches (treachery, boost 1, both When Revealed forms, 12/14)                                                                                  |
| 56149 | Fearless Determination | matches (side scheme, 3 per player, amplify, boost 3, flavor, When Defeated "He activates against the player who defeated this scheme", 14/14) |

### Spider-Woman leader (spider_woman_leader)

The raw `card_set_name` is "Spider Woman" for every record of this set (and for 56211 to 56214); the print says
"Spider-Woman (n/14)" and "Basic / Spider-Woman". See correction 4. It is the only difference in the rows marked
"matches" below.

| Code  | Face                 | Result                                                                                                                                                                                                                  |
| ----- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56168 | Spider-Woman I       | matches (SCH 1, ATK 2 star, 13 per player, Avenger., unique, Setup, star Forced Interrupt, 1/14)                                                                                                                        |
| 56169 | Spider-Woman II      | matches (SCH 2, ATK 2 star, 17 per player, Steady, When Revealed, star Forced Interrupt, 2/14)                                                                                                                          |
| 56170 | Spider-Woman III     | matches (SCH 2, ATK 2 star, 17 per player, Setup, star Forced Interrupt, 3/14)                                                                                                                                          |
| 56171 | Spider-Woman IV      | matches (SCH 2, ATK 3 star, 21 per player, Steady, When Revealed, star Forced Interrupt, 4/14)                                                                                                                          |
| 56174 | Finesse              | matches (attachment, Superpower., Permanent, "Max 3 skill counters here", Forced Interrupt "When a treachery is revealed", 5/14)                                                                                        |
| 56175 | Contaminant Immunity | matches (+1 SCH no star, Superpower., Forced Interrupt, boost star, 6/14)                                                                                                                                               |
| 56176 | Pheromones           | matches (treachery, boost star "You are stunned. Otherwise, you are confused.", 8/14)                                                                                                                                   |
| 56177 | Venom Blast          | matches (treachery, boost 1, both When Revealed forms with the three bullets, 10/14)                                                                                                                                    |
| 56178 | Inconspicuous        | DIFFERS: raw says "<b>When Revealed</b>: Chooose:"; card prints "When Revealed: Choose:". Rest matches (two bullets, boost star + 1 icon, Boost "This card gains [boost] for each status card on your identity", 12/14) |
| 56179 | Self-propelled Glide | matches (side scheme, 3 per player, acceleration, boost 3, flavor, Forced Interrupt, 14/14)                                                                                                                             |

### Resistance main schemes (resistance)

The A faces print "(???)" and no stage threat; they match. Every B face prints its own n/8.

| Code   | Face                         | Result                                                                                                                                              |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56141a | Superhero Resistance (1A)    | matches (Contents, Setup word for word, "In competitive mode" and "In cooperative mode" clauses)                                                    |
| 56141b | Gathering Support (1B)       | matches (0 start, 7 per player, +1 per player, Hinder 2 per player, When Revealed with "1 per player minions", 1/8)                                 |
| 56142a | Resistance Tactics (2A)      | matches (flavor only)                                                                                                                               |
| 56142b | Secret Avengers (2B)         | matches (0 start, 9 per player, +1 per player, no stars, flavor, "+1 ATK ... (+2 ATK instead if the attack is undefended)", loss line, 7/8)         |
| 56172a | Superhero Resistance (1A)    | matches (same text as 56141a)                                                                                                                       |
| 56172b | Open Rebellion (1B)          | matches (7 per player, +1 per player, Hinder 2 per player, flavor, Forced Interrupt "(Limit once per phase per player.)", 3/8)                      |
| 56173a | Resistance Tactics (2A)      | matches                                                                                                                                             |
| 56173b | Neighborhood Protectors (2B) | matches (9 per player, +1 per player, When Revealed with "1 per player side schemes" and "encounter deck and discard pile", flavor, loss line, 5/8) |
| 56199a | Superhero Resistance (1A)    | matches                                                                                                                                             |
| 56199b | Rallying Call (1B)           | matches (7 per player, +1 per player, Hinder 2 per player, "Each minion gains guard", flavor, 2/8)                                                  |
| 56200a | Superhero Resistance (1A)    | matches                                                                                                                                             |
| 56200b | Going Underground (1B)       | matches (7 per player, +1 per player, Hinder 2 per player, "The enemy leader gains steady", flavor, 4/8)                                            |
| 56201a | Resistance Tactics (2A)      | matches                                                                                                                                             |
| 56201b | Guerilla Warfare (2B)        | matches (9 per player, +1 per player, Forced Response "After a status card is placed on the enemy leader", flavor, loss line, 6/8)                  |
| 56202a | Resistance Tactics (2A)      | matches                                                                                                                                             |
| 56202b | Superhero Jailbreak (2B)     | matches (9 per player with a star, +1 per player with a star, star Forced Response "After resolving step 1 of the villain phase", loss line, 8/8)   |

### New Avengers (new_avengers)

| Code  | Face             | Result                                                                                                               |
| ----- | ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| 56150 | Falcon           | matches (Aerial. Avenger., SCH 2, ATK 2, 3 hit points, unique, Teamwork (Avenger), When Defeated, boost star, 1/5)   |
| 56151 | Hercules         | matches (Avenger., SCH 1, ATK 3, 4 hit points, unique, Teamwork (Avenger), When Defeated, boost star "stunned", 2/5) |
| 56152 | Goliath          | matches (Avenger. Giant., SCH 1, ATK 2, 5 hit points, unique, Teamwork (Avenger), When Defeated, boost star, 3/5)    |
| 56153 | Freedom Fighters | matches (treachery, "Resolve the \"Boost\" ability of each minion in play", surge clause, boost star, 4/5)           |
| 56154 | New Avengers     | matches (side scheme, 3 fixed, hazard, boost 2, flavor, Hinder 1 per player, When Defeated, 5/5)                     |

### Secret Avengers (secret_avengers)

| Code  | Face             | Result                                                                                                                                                                          |
| ----- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56155 | Black Panther    | matches (Avenger., SCH 2, ATK 2, 4 hit points, unique, Teamwork (Avenger), When Defeated, boost star, 1/5)                                                                      |
| 56156 | Spectrum         | matches (Aerial. Avenger., SCH 2, ATK 2, 3 hit points, unique, Teamwork (Avenger), When Defeated, boost star, 2/5)                                                              |
| 56157 | Freedom Fighters | matches (same text as 56153, boost star, 3/5)                                                                                                                                   |
| 56158 | Switching Sides  | DIFFERS: raw says "any player on the enmy team"; card prints "any player on the enemy team". Rest matches (treachery, boost 2, "In competitive mode" clause, surge clause, 4/5) |
| 56159 | Secret Avengers  | matches (side scheme, 3 fixed, crisis, boost 2, Hinder 1 per player, When Defeated "top 5 cards", 5/5)                                                                          |

### Namor (namor)

| Code  | Face              | Result                                                                                                                              |
| ----- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 56160 | Namor             | matches (Atlantis. Elite., SCH 1, ATK 1, 6 hit points, unique, Stalwart. Toughness. Villainous., boost 3, flavor, 1/5)              |
| 56161 | Neptune's Trident | matches (Weapon., +1 ATK star, unique icon, Attach to Namor / enemy leader, star text, Hero Action energy + physical, boost 1, 2/5) |
| 56162 | Horn of Proteus   | matches (Item., +1 SCH star, unique icon, star Forced Interrupt, Hero Action mental + physical, boost 1, 3/5)                       |
| 56163 | Imperius Rex!     | matches (treachery, boost star + 1, When Revealed, Boost "additional boost card", 4/5)                                              |
| 56164 | Ruler of Atlantis | matches (side scheme, 3 fixed, amplify, boost 2, flavor, Hinder 1 per player, 5/5)                                                  |

### Atlanteans (atlanteans)

| Code  | Face             | Result                                                                                                                                          |
| ----- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 56165 | Atlantean Guard  | matches (Atlantis., SCH 1, ATK 2, 3 hit points, not unique, Guard, When Revealed, boost 1, flavor, 1/5)                                         |
| 56166 | Atlanteans       | matches (treachery, boost 2, the two form bullets, 4/5)                                                                                         |
| 56167 | Atlantis Attacks | matches (side scheme, 3 fixed, boost 3, flavor "enmity", Hinder 1 per player, When Revealed "1 per player cards" and "acceleration token", 5/5) |

### Spider-Man (spider_man)

| Code  | Face              | Result                                                                                                                                            |
| ----- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56180 | Spider-Man        | matches (Avenger. Elite., SCH 2, ATK 2, 4 hit points, unique, boost 2, When Revealed, 1/5)                                                        |
| 56181 | Tangled Up        | matches (Condition., Forced Interrupt "would scheme, thwart, or attack", Boost "If the Spider-Man minion is in play", boost star, 2/5)            |
| 56182 | Spectacular!      | matches (treachery, boost 2, "In competitive mode" clause, flavor, 4/5)                                                                           |
| 56183 | Neighborhood Hero | matches (side scheme, 2 fixed, amplify, boost 2, flavor, "In competitive mode, move 2 threat ... Otherwise, place 2 per player threat here", 5/5) |

### Defenders (defenders)

| Code  | Face                 | Result                                                                                                                                        |
| ----- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 56184 | Luke Cage            | matches (Defender., SCH 1, ATK 2, 4 hit points, unique, When Revealed and Boost "Stun your leader. Otherwise, you are stunned.", flavor, 1/5) |
| 56185 | Jessica Jones        | matches (Defender., SCH 2, ATK 1, 3 hit points, unique, "Confuse your leader. Otherwise, you are confused." twice, flavor, 2/5)               |
| 56186 | Protect the Innocent | matches (treachery, boost 1, tough and surge, flavor, 3/5)                                                                                    |
| 56187 | Street Defenders     | matches (treachery, boost 2, "Do not give it a boost card for this activation", 4/5)                                                          |
| 56188 | The Defenders        | matches (side scheme, 3 fixed, acceleration, boost 3, flavor, Hinder 1 per player, "Each minion gains guard", 5/5)                            |

### Hell's Kitchen (hells_kitchen)

| Code  | Face                  | Result                                                                                                                       |
| ----- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 56189 | Daredevil             | matches (Defender., SCH 2, ATK 2, 3 hit points, unique, When Revealed "The enemy team exhausts", Boost, flavor, 1/5)         |
| 56190 | Iron Fist             | matches (Defender., SCH 1, ATK 3, 4 hit points, unique, When Revealed, Boost with the italic "(after this activation)", 2/5) |
| 56191 | Resistance Fighter    | matches (Condition., +1 SCH and +1 ATK no stars, "minion of the enemy team's choice", "+4 hit points", stalwart, Boost, 3/5) |
| 56192 | Street Defenders      | matches (same text as 56187, boost 2, 4/5)                                                                                   |
| 56193 | Defend Hell's Kitchen | matches (side scheme, 3 fixed, hazard, boost 2, flavor, Hinder 1 per player, "[Defender] minion is in play", 5/5)            |

### Cloak & Dagger (cloak_and_dagger)

| Code  | Face             | Result                                                                                                                                          |
| ----- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 56194 | Cloak            | matches (Defender., SCH 2, ATK 1, 4 hit points, unique, When Revealed with "In competitive mode" clause, Boost "If Dagger is in play", 1/5)     |
| 56195 | Dagger           | matches (Defender., SCH 1, ATK 2, 3 hit points, unique, When Revealed, Boost "If Cloak is in play", 2/5)                                        |
| 56196 | Darkforce        | matches (attachment, no trait, +1 SCH star, boost 1, "Attach to the enemy leader and give them a tough status card", star Forced Response, 3/5) |
| 56197 | Lightforce       | matches (treachery, boost 2, "Take 3 indirect damage", flavor, 4/5)                                                                             |
| 56198 | Cloak and Dagger | matches (side scheme, 3 fixed, crisis, boost 3, flavor, Hinder 1 per player, When Defeated, 5/5)                                                |

### Standard PvP (standard_pvp, resistance copy)

| Code   | Face              | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 56203  | Righteous Cause   | matches (treachery, no boost icons, When Revealed, flavor, 1/5)                                                                                                                                                                                                                                                                                                                                                                                        |
| 56204  | Whatever It Takes | matches (treachery, no boost icons, both When Revealed forms, flavor, 2/5)                                                                                                                                                                                                                                                                                                                                                                             |
| 56205  | Targeted Strike   | DIFFERS in the Boost: raw says "Boost: The card gains [boost] for each player on your team."; card prints "Boost: This card gains [boost] for each player on your team." When Revealed and boost star match, 3/5                                                                                                                                                                                                                                       |
| 56206a | Choosing Sides    | NO SCAN of its own (none for 56206a in the bundle). Checked against the scan of the sibling print 56128a (Standard PVP 5/5, side scheme, 4 per player, Permanent, "cannot take more than 2 damage from each attack", Forced Response with "1 per player encounter cards" and "Flip this card"): the raw text of 56206a matches it word for word, and the raw 4 per player agrees with the person icon on 56128a. Inferred, not read from 56206a itself |
| 56206b | Now It's Personal | matches (obligation, "Give to the first player.", Action "Remove this card from the game -> each player on your team chooses 2 of your leader's set-aside player cards and adds them to their hand.", 5/5). Scan is `56206b.png`                                                                                                                                                                                                                       |

### Captain America leader, player cards (Basic / Captain America)

| Code  | Face              | Result                                                                                                                                                                      |
| ----- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56207 | No, You Move!     | matches (upgrade, cost 0, wild icon, Forced Interrupt "attach Cap's Shield to your Captain America leader and resolve this attack against him instead. Discard this card.") |
| 56208 | Fighting Dirty    | matches (event, cost 2, wild icon, Action, "If you spent a physical resource", stun, flavor)                                                                                |
| 56209 | Recruited by Cap  | text matches; MARKUP: raw says "<b>Action<b/></b>" (a malformed closing tag), the card prints "Action:" in bold. Event, cost 3, wild icon, flavor match                     |
| 56210 | The People's Hero | matches (resource, two wild icons, Hero Response "give your Captain America leader a facedown boost card")                                                                  |

### Spider-Woman leader, player cards (Basic / Spider-Woman)

| Code  | Face           | Result                                                                                                                                                                      |
| ----- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56211 | Double Agent   | matches (event, cost 2, wild icon, Action "Remove 2 threat from the main scheme. Place 2 threat on your leader's main scheme.", flavor); set name "Spider Woman" in the raw |
| 56212 | Spider-Blast   | matches (event, cost 2, wild icon, "If you spent a mental resource", confuse, flavor); set name "Spider Woman" in the raw                                                   |
| 56213 | Hard to Hit    | matches (upgrade, cost 1, wild icon, Skill., "Attach to your Spider-Woman leader and give her a tough status card", Forced Response); set name "Spider Woman" in the raw    |
| 56214 | Secret Contact | matches (resource, two wild icons, Hero Response, "place 2 skill counters on your Spider-Woman leader's Finesse attachment"); set name "Spider Woman" in the raw            |

## Known errata (RRG 1.8 p. 70, Civil War Expansion)

None of the faces in this range is on the errata list that the registration check recorded (Yellowjacket 56073 and
Energy Channel 56098 are both in the registration half). No printed text in this range was found to be pre-errata.

## Corrections owed in the data

1. **56158 Switching Sides, `text` (and `real_text`)**: "any player on the enmy team" becomes "any player on the enemy
   team". Typo is the cache's (spec section 0 asked for this read).
2. **56178 Inconspicuous, `text` (and `real_text`)**: "<b>When Revealed</b>: Chooose:" becomes "<b>When Revealed</b>:
   Choose:". Typo is the cache's (spec section 0 asked for this read).
3. **56205 Targeted Strike, `text` (and `real_text`)**: in the Boost, "The card gains [boost] for each player on your
   team." becomes "This card gains [boost] for each player on your team." The same correction as 56127 (registration
   copy); both prints read "This card".
4. **Set name of the Spider-Woman set**: raw `card_set_name` "Spider Woman" on 56168 to 56171, 56174 to 56179 and
   56211 to 56214 (fourteen records) becomes "Spider-Woman", as the cards print "Spider-Woman (n/14)" and "Basic /
   Spider-Woman". Cosmetic (the set code `spider_woman_leader` is not affected); the owner may prefer to keep the
   cache's spelling and fix it in the curation file instead.
5. **56209 Recruited by Cap, `text` (and `real_text`)**: "<b>Action<b/></b>:" is malformed markup; the printed text
   is "Action: Choose a minion engaged with you ..." with "Action" in bold. Make the markup "<b>Action</b>:" (the words
   do not change). Check that the normalizer's label parse (`parse-text.ts`) does not read the broken tag as a missing
   label.
6. **56206a Choosing Sides**: no scan to check; keep the text as it is (it matches the print of 56128a word for word),
   and when the two printings of Standard PvP are folded into one set (spec section 8.1 item 7) take 56128a as the one
   with a scan.

No other raw field (title, subtitle, type, stage, traits, cost, resource icons, stats, stars, per-player flags,
keywords, labels, text, boost, scheme icons, set position, unique flag, flavor) differs from a scan.

## Differences that change behavior

1. **56205 Targeted Strike, "This card" and not "The card".** Targeted Strike is in the competitive set that the spec
   sets aside for pass 1c (section 7.9, "56127 / 56205 (x2 each)"; section 6.2), so no design rests on the wrong text
   yet. The wording matters when it is designed: "The card" could be read as the card the enemy team found and dealt
   facedown (an encounter card), while "This card" is Targeted Strike itself as a boost card; the printed word makes
   the target Targeted Strike, so the added boost icons belong to this card's own boost total. The spec's question 10
   (section 4.1, a boost ability that speaks of "this card") is the same class of wording and should be extended to
   cover it. This repeats the finding of the registration check on 56127, which prints the same sentence.

None of the other differences change behavior: 56158 and 56178 are single-letter typos that the spec already expected
(section 0, section 8.1 item 6; section 3.4, line 304 and section 7.8 rest on the printed "enemy team" and on a "Choose"
with two bullets, both as the scan prints them), the Spider-Woman set name and the 56209 markup are bookkeeping, and
56206a is the unchanged Choosing Sides.

## Missing or unreadable scans

- No scan is unreadable.
- 56206a has no scan of its own. The sibling print 56128a exists and matches the raw text of 56206a (see the table).
  The scan of the b face of that card, 56206b, exists and was read.
- Not checkable from any scan: raw `quantity`, the set total N for each set (taken from the printed n/N, which was
  readable), the illustrator credit.
