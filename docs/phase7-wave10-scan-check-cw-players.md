# Phase 7 wave 10: raw card text against the card scans (Civil War, player side)

Date: 2026-10-11. Branch `feature/wave-10`. Nothing in the repo was changed except this file.

## Method

Every record with a code from 56001a to 56058 inclusive in `packages/content/raw/marvelcdb/cw.json` (58 records) and the
two nested b faces (56001b Greer Nelson, 56029b Teddy Altman), 60 faces in all, was compared with its scan in
`assets/card-art/bundles/cards/`. The raw cache was printed with a node script (code, name, subname, type, traits,
cost and `cost_star`, resource icons, THW / ATK / DEF / REC / hit points / hand size, the `*_cost` consequential-damage
counts, star flags, base threat and its fixed flag, acceleration icon, boost icons and boost star, set position, unique
flag, text, flavor) and read next to the scan, field by field: title, subtitle, type line, traits, cost, resource
icons, stats and stars, hit points, keywords (Restricted, Uses, Max per player / deck / minion / phase, Play only if),
every ability label, the ability text word for word, boost icons, set position n/N, unique icon, aspect or set line.

Notes on the scans:

- The files are WebP images saved with `.png` and `.jpg` extensions. 56001a, 56001b, 56029a and 56029b are small (about
  300 x 425) but legible; every other scan read is large. No scan is unreadable.
- Fifty-two faces have a scan of their own. The eight reprints without one (56011, 56015, 56018, 56042, 56044, 56049,
  56051, 56053) were checked against the original's scan (04040, 19030, 21046, 09012, 09019, 05015, 21064, 12033). The
  other five records with a `duplicate_of_code` (56014, 56020, 56021, 56022, 56048) have their own scan and were read
  from it.
- Printed quantity is on no card, so the raw `quantity` was not checked against a print. It does agree with the set
  positions: Tigra's 15 (Moon Knight 1, Precinct HQ 2, Cat's Head Amulet 3, Sharp Claws 4 and 5, Cat-Like Reflexes 6
  and 7, Hunted 8 to 10, Tooth and Claw 11 to 13, Feline Senses 14 and 15) and Hulkling's 15 (Wiccan 1, Altman
  Residence 2, the four shapes 3 to 6, Alien Physiology 7, Shapeshifter Strike 8 to 10, Armored Defense 11 and 12,
  Impersonation 13 and 14, Shapeshifter 15) fill their sets exactly, and each scan prints the first position the raw
  `set_position` carries. The two nemesis sets print n/5: 56024 to 56028 and 56055 to 56058 (56058 has two copies, 4
  and 5).
- Aspect and basic cards print no n/N, only "Aggression", "Protection" or "Basic" in the lower right. The raw cache
  carries no set position for them, and none is owed.
- Illustrator credits were not compared. Flavor text was compared (see correction 4).
- The cache's `[energy]`, `[mental]`, `[physical]`, `[wild]`, `[star]`, `[boost]` were read as the matching printed icon
  in every case. The one house-and-cross scheme icon on 56025 and 56056 is the same icon as on 56091 (Dangerous
  Recruits), which the registration check recorded as the acceleration icon; it agrees with the raw
  `scheme_acceleration`.

## Result in one paragraph

Two records differ from their print in the ability text: 56023 ("engage3d" for "engaged") and 56027 ("Underwold" for
"Underworld"), both already known to the spec. The scan of 56019 prints the pre-errata title "Yellow Jacket", as the raw
does; the RRG 1.8 erratum retitles it. Three differences are cosmetic: a stray period in the flavor of 56011, and the
flavor lines missing from 56029a and 56031. Every other field of every face matches. No design in the spec rests on a
wrong text, because it quoted the scans for 56007, 56023, 56027 and 56055; the data corrections are what is owed.

## Faces

Result is "matches" or the exact difference (raw says / card prints). Hit points are read from the stat bubble on
heroes and from the circle at the right edge of the text box on allies and minions.

### Tigra (tigra), 56001 to 56009

| Code   | Face              | Result                                                                                                              |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| 56001a | Tigra             | matches (Hero, THW 1, ATK 2, DEF 3, hand size 5, hit points 10, Avenger., unique, no stars, On the Hunt Response)   |
| 56001b | Greer Nelson      | matches (Alter-Ego, REC 3, hand size 6, hit points 10, Police., unique, Undercover Work Action, limit once, flavor) |
| 56002  | Moon Knight       | matches (ally, cost 1, wild icon, THW 2, ATK 2, one consequential icon each, 3 hit points, unique, Forced Response) |
| 56003  | Precinct HQ       | matches (support, cost 2, mental icon, Location., unique, Alter-Ego Action, flavor, 2/15)                           |
| 56004  | Cat's Head Amulet | matches (upgrade, cost 2, energy icon, Artifact. Item., unique, Resource ability with three [physical], 3/15)       |
| 56005  | Sharp Claws       | matches (upgrade, cost 1, physical icon, Weapon., Interrupt, the two bullets, 4/15)                                 |
| 56006  | Cat-Like Reflexes | matches (upgrade, cost 1, energy icon, Superpower., Hero Interrupt, 6/15)                                           |
| 56007  | Hunted            | matches (upgrade, cost 0 with a star, mental icon, Condition., star additional cost, Interrupt, 8/15)               |
| 56008  | Tooth and Claw    | matches (event, cost 4, physical icon, Attack. Superpower., cost reduction line, Hero Action (attack), 11/15)       |
| 56009  | Feline Senses     | matches (event, cost 2, mental icon, Superpower. Thwart., Hero Action (thwart), flavor, 14/15)                      |

### Tigra obligation and nemesis set (tigra_nemesis)

| Code  | Face                | Result                                                                                                                                                                                                                                   |
| ----- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56023 | In Too Deep         | DIFFERS: raw says "Each minion engage3d with you activates against you"; card prints "Each minion engaged with you activates against you". Rest matches (obligation, "Give to the Greer Nelson player.", two boost icons, Tigra set)     |
| 56024 | The Hood            | matches (minion, SCH 1, ATK 1 star, 4 hit points, Criminal., unique, Steady. Villainous., star Forced Response, "(Tigra's nemesis minion.)", boost 2, 1/5)                                                                               |
| 56025 | Criminal Underworld | matches (side scheme, base threat 4 not per player, acceleration icon, boost 3, "Each Criminal minion cannot take damage.", flavor, 2/5)                                                                                                 |
| 56026 | The Hood's Mantle   | matches (attachment, +1 SCH, +1 ATK, no stars, Armor., unique, Hero Response with energy and physical, star Boost with no icons, 3/5)                                                                                                    |
| 56027 | Madame Masque       | DIFFERS: raw says "Place 2 threat on the Criminal Underwold side scheme" (When Revealed); card prints "Criminal Underworld". Boost line spelled correctly in the raw. Rest matches (SCH 2, ATK 1, 3 hit points, unique, star Boost, 4/5) |
| 56028 | Jigsaw              | matches (minion, SCH 1, ATK 2 star, 3 hit points, Criminal., unique, Quickstrike., star Forced Response, flavor, boost 2, 5/5)                                                                                                           |

### Aggression (Tigra's starter deck)

| Code  | Face                    | Result                                                                                                                                                                                                   |
| ----- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56010 | Two-Gun Kid             | matches (ally, cost 3, mental icon, THW 1, ATK 2 star, one consequential icon each, 3 hit points, unique, Avenger., star Interrupt, flavor)                                                              |
| 56011 | Spider-Girl             | reprint, checked against the scan of 04040. Text, THW 1, ATK 2, 2 hit points, cost 2, energy icon match. FLAVOR: raw says "...Who wants a piece of me?." (stray period); card prints "...a piece of me?" |
| 56012 | Air Cover               | matches (support, cost 1, energy icon, Tech., "Uses (2 fuel counters). Max 1 per player.", Response, TACTIC in trait lettering)                                                                          |
| 56013 | Aggressive Conditioning | matches (upgrade, cost 3, physical icon, Condition., "Play under any player's control. Max 1 per player.", +3 hit points, +1 ATK)                                                                        |
| 56014 | Suppressing Fire        | matches (upgrade, cost 0, mental icon, Tactic., "Attach to a minion. Max 1 per minion.", Hero Interrupt, heal 2)                                                                                         |
| 56015 | "Bring It!"             | reprint, checked against the scan of 19030: matches (event, cost 0, energy icon, no trait, "Max 1 per phase.", Hero Action, flavor "-Rocket Raccoon")                                                    |
| 56016 | Coup de Grâce           | matches (event, cost 2, mental icon, Attack., Hero Action (attack), non-Elite in trait lettering, "When Defeated" in bold, flavor "-Black Knight")                                                       |
| 56017 | Savage Strike           | matches (event, cost 3, physical icon, Skill., Hero Interrupt, +6 ATK, piercing, flavor "KRACK!")                                                                                                        |
| 56018 | Audacity                | reprint, checked against the scan of 21046: matches (resource, wild icon, "Max 1 per deck.", Hero Response, deal 1 damage to the villain)                                                                |

### Basic (Tigra's starter deck)

| Code  | Face          | Result                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56019 | Yellow Jacket | matches the raw text (ally, cost 3, energy icon, THW 2, ATK 2, two consequential icons each, 3 hit points, unique, Avenger., "Play only if you have the Avenger trait.", Response, flavor). Prints the pre-errata title "Yellow Jacket" and the text "After Yellow Jacket enters play"; RRG 1.8 p. 70 retitles it "Yellowjacket" (as cited in the spec and the registration check; not re-read here). Not a mismatch |
| 56020 | Energy        | matches (resource, two energy icons, "Max 1 per deck.")                                                                                                                                                                                                                                                                                                                                                              |
| 56021 | Genius        | matches (resource, two mental icons, "Max 1 per deck.")                                                                                                                                                                                                                                                                                                                                                              |
| 56022 | Strength      | matches (resource, two physical icons, "Max 1 per deck.")                                                                                                                                                                                                                                                                                                                                                            |

### Hulkling (hulkling)

| Code   | Face                | Result                                                                                                                                                                                                        |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56029a | Hulkling            | matches (Hero, THW 1, ATK 1, DEF 1, hand size 5, hit points 13, Avenger. Kree. Skrull., unique, Chosen Shape Forced Response). FLAVOR "This is awesome!" printed, not in the raw                              |
| 56029b | Teddy Altman        | matches (Alter-Ego, REC 4, hand size 5, hit points 13, Kree. Skrull., unique, "cannot have more than 1 Shapeshift upgrade in play", Shape-Changer Action, limit once per round)                               |
| 56030  | Wiccan              | matches (ally, cost 2, wild icon, THW 2, ATK 1, one consequential icon each, 2 hit points, unique, Avenger. Mystic., Response with "(Shuffle.)", flavor, 1/15)                                                |
| 56031  | Altman Residence    | matches the text (support, cost 1, mental icon, Location., unique, Alter-Ego Action, 2/15). FLAVOR "Teddy was raised by Mrs. Altman from infancy in order to hide his true heritage." printed, not in the raw |
| 56032  | Winged Shape        | matches (upgrade, cost 2, energy and mental icons, Shapeshift., +1 THW +1 ATK +1 DEF, Aerial, Hero Response, 3/15)                                                                                            |
| 56033  | Hulk Shape          | matches (upgrade, cost 2, two physical icons, Shapeshift., +2 ATK +1 DEF, Hero Response, 4/15)                                                                                                                |
| 56034  | Armored Shape       | matches (upgrade, cost 2, energy and physical icons, Shapeshift., +1 ATK +2 DEF, retaliate 1, Hero Response, 5/15)                                                                                            |
| 56035  | Imitation Shape     | matches (upgrade, cost 2, two mental icons, Shapeshift., +2 THW, Forced Interrupt, Hero Response, 6/15)                                                                                                       |
| 56036  | Alien Physiology    | matches (upgrade, cost 3, mental icon, Superpower., Resource ability, the two wild icons, flavor, 7/15)                                                                                                       |
| 56037  | Shapeshifter Strike | matches (event, cost 2, energy icon, Attack. Superpower., Hero Action (attack), flavor "-Hulkling", 8/15)                                                                                                     |
| 56038  | Armored Defense     | matches (event, cost 1, physical icon, Defense. Superpower., Hero Interrupt (defense), tough status card, 11/15)                                                                                              |
| 56039  | Impersonation       | matches (event, cost 2, mental icon, Superpower. Thwart., Hero Action (thwart), 4 threat, flavor, 13/15)                                                                                                      |
| 56040  | Shapeshifter        | matches (event, cost 0, wild icon, Superpower., Hero Action with "(Shuffle.)", flavor, 15/15)                                                                                                                 |

### Hulkling obligation and nemesis set (hulkling_nemesis)

| Code  | Face                   | Result                                                                                                                                                            |
| ----- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56054 | Complicated Lineage    | matches (obligation, "Give to the Teddy Altman player.", two boost icons, both options, Hulkling set)                                                             |
| 56055 | Super Skrull           | matches (minion, SCH 1, ATK 1 star, 5 hit points, Elite. Skrull., unique, star Forced Interrupt with the four icon lines, boost 2, 1/5, no nemesis reminder line) |
| 56056 | Skrull Business        | matches (side scheme, base threat 5 not per player, acceleration icon, boost 3, Forced Response, flavor, 2/5)                                                     |
| 56057 | Fantastic Powers       | matches (attachment, +1 SCH, +1 ATK, Superpower., +3 hit points, retaliate 1, When Revealed, boost 2, 3/5)                                                        |
| 56058 | You're Coming With Me! | matches (treachery, boost 1, When Revealed (Alter-Ego) and (Hero), four resource icons in the parenthesis, 4/5)                                                   |

### Protection (Hulkling's starter deck)

| Code  | Face                    | Result                                                                                                                                                                        |
| ----- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56041 | Patriot                 | matches (ally, cost 3, energy icon, THW 1, ATK 2, one consequential icon each, 3 hit points, unique, Avenger., Response, flavor)                                              |
| 56042 | Brother Voodoo          | reprint, checked against the scan of 09012: matches (ally, cost 3, mental icon, THW 2, ATK 1, 3 hit points, unique, Avenger. Mystic., Response, "Shuffle your deck.", flavor) |
| 56043 | Hidden Base             | matches (support, cost 2, energy icon, Location., unique, "Uses (3 stronghold counters).", Alter-Ego Response)                                                                |
| 56044 | The Night Nurse         | reprint, checked against the scan of 09019: matches (support, cost 1, mental icon, Persona., unique, "Uses (3 medical counters).", Action)                                    |
| 56045 | Excelsior               | matches (upgrade, cost 1, energy icon, Kree. Skrull. Weapon., unique, Restricted with its reminder, Response, one [energy])                                                   |
| 56046 | Defensive Conditioning  | matches (upgrade, cost 2, physical icon, Condition., "Play under any player's control. Max 1 per player.", +3 hit points, +1 DEF)                                             |
| 56047 | "I Can Do This All Day" | matches (event, cost 1, mental icon, Defense., Hero Interrupt (defense))                                                                                                      |
| 56048 | Taunt                   | matches (event, cost 1, physical icon, Tactic., Hero Action, "Draw 3 cards.", flavor "-Captain America")                                                                      |
| 56049 | Tackle                  | reprint, checked against the scan of 05015: matches (event, cost 3, physical icon, Attack., Hero Action (attack), the [physical] condition, 3 damage, flavor)                 |
| 56050 | Cuts Both Ways          | matches (event, cost 0, energy icon, Defense., Hero Interrupt (defense), retaliate 1, flavor "-Wiccan")                                                                       |
| 56051 | Preservation            | reprint, checked against the scan of 21064: matches (resource, wild icon, "Max 1 per deck.", Hero Response, heal 1 damage from your hero)                                     |

### Basic (Hulkling's starter deck)

| Code  | Face                 | Result                                                                                                                                                                         |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 56052 | Iron Lad             | matches (ally, cost 2, energy icon, THW 1 star, ATK 1 star, one consequential icon each, 3 hit points, unique, Avenger., star Interrupt, "AVENGER" in trait lettering, flavor) |
| 56053 | Assess the Situation | reprint, checked against the scan of 12033: matches (event, cost 0, mental icon, Tactic., Action, +1 hand size until the end of the phase, flavor "-Tony Stark")               |

## Corrections owed in the data

1. **56023 In Too Deep, `text`**: "Each minion engage3d with you activates against you." becomes "Each minion engaged with
   you activates against you." (already in the spec's B8.1 item 2; the scan agrees).
2. **56027 Madame Masque, `text`**: in the When Revealed, "Place 2 threat on the Criminal Underwold side scheme."
   becomes "Place 2 threat on the Criminal Underworld side scheme." (already in the spec's B8.1 item 3; the scan
   agrees). The Boost line is spelled correctly in the raw.
3. **56019 Yellow Jacket, `name` and `text`** (RRG 1.8 p. 70, erratum #19): the scan prints the pre-errata "Yellow
   Jacket" and the raw carries it. After the erratum the title is "Yellowjacket" and the text "After Yellowjacket enters
   play, search ...". The spec's B8.1 item 1 already owes this. 56073, the minion in the registration set, prints the
   same pre-errata title and takes the same retitle (the registration check, "Known errata"); do both in one pass so
   the two cards keep one title.
4. **Flavor, cosmetic, optional** (the cache lacks it; the scans print it):
   - 56029a Hulkling: "This is awesome!"
   - 56031 Altman Residence: "Teddy was raised by Mrs. Altman from infancy in order to hide his true heritage."
5. **56011 Spider-Girl, `flavor`, cosmetic**: the raw reads "...Who wants a piece of me?." and the print (04040's scan)
   ends "...Who wants a piece of me?". Drop the period after the question mark. The same flavor is in 04040's own
   record; check it there too.

No other raw field (title, subtitle, type, traits, cost and cost star, resource icons, stats and stars, consequential
damage counts, hit points, hand size, keywords and play restrictions, labels, text, boost icons and star, base threat,
acceleration icon, set position, unique flag) differs from a scan.

## Differences that change behavior

None of the differences makes a design in `docs/phase7-wave10-box-heroes.md` rest on a wrong text: the spec quoted the
scans for 56007, 56023, 56027 and 56055 (section B0, lines 27 to 29), and the sections below already use the printed
words. What the corrections change is the data the scripts will be built from.

1. **56023 In Too Deep, "engaged".** Spec B3.15 (line 497) quotes the scan ("Each minion engaged with you activates
   against you") and B8.1 item 2 owes the correction. With the raw text the obligation would carry a nonsense word in
   the one clause that names which minions activate; a script or a text-keyed test written from the data would not
   match the printed rule. No design change: only the data text.
2. **56027 Madame Masque, "Criminal Underworld".** Spec B3.14 (line 472) quotes the scan, and B8.1 item 3 owes the
   correction. The When Revealed names a side scheme by title ("place 2 threat on ... otherwise, find Criminal
   Underworld and reveal it"). With "Underwold" in the data the named-scheme lookup and the displayed text would both
   miss the card; B3.14's tests (Madame Masque revealed with the scheme out of play) depend on the correct title. No
   design change.
3. **56019 Yellow Jacket / Yellowjacket.** Spec B1 (line 87) lists "Yellowjacket (ally 56019 and the box's own minion
   56073)" among the unique titles shared across cards, and B8.1 item 1 owes the retitle. The print and the raw carry
   "Yellow Jacket", so until both 56019 and 56073 are retitled the two cards still share one title, but the spec's
   cross-card unique rule is stated for the errata'd name. The retitle must reach both cards, or one of them keeps the
   old name and the shared-title rule is tested against two different names. No design change.

The flavor lines (56029a, 56031) and the 56011 flavor period change no behavior.

## Missing or unreadable scans

- No scan is unreadable.
- The eight reprints 56011, 56015, 56018, 56042, 56044, 56049, 56051 and 56053 have no scan of their own (the spec's B0
  says the same). Each was checked against the original's scan, which is present for all eight. This is a check of the
  printed card the reprint copies, not of the Civil War print itself: a difference between the two printings (a changed
  collector line or flavor) would not show here.
- Not checkable from any scan: raw `quantity`, the set total N for the aspect and basic cards (none is printed), the
  illustrator credit.
