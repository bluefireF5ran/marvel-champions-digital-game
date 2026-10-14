# Phase 7 wave 10: raw card text against the card scans (Civil War, registration side)

Date: 2026-10-11. Branch `feature/wave-10`. Nothing in the repo was changed except this file.

## Method

Every record with a code from 56059 to 56136 inclusive in `packages/content/raw/marvelcdb/cw.json` (78 records) and
every nested b face (nine: 56063b, 56064b, 56096b, 56097b, 56121b, 56122b, 56123b, 56124b, 56128b), 87 faces in all,
was compared with its scan in `assets/card-art/bundles/cards/`. The raw cache was printed with a node script (code,
name, type, stage, traits, cost, resource icons, stats, star flags, per-player flags, boost, scheme icons, set name,
set position, unique flag, text) and read next to the scan, field by field: title, subtitle, type line, stage, traits,
cost, resource icons, SCH / ATK / THW / DEF / hit points, the per-player icon on each stat and threat, stat stars,
starting / target threat, escalation, hazard / acceleration / crisis / amplify icons, keywords, every ability label,
the ability text word for word, arrows, boost icons and boost star, set name, set position (n/N), unique icon.

Notes on the scans:

- The files are WebP images saved with `.png` and `.jpg` extensions. The main scheme faces and the cards 56063a to
  56064b, 56096a to 56097b and 56121a to 56124b are small (about 420 x 290) but legible; every other scan is large.
- Printed quantity is on no card, so the raw `quantity` was not checked. Illustrator credits and the lines of flavor
  text were not compared (see "Not carried by the cache" for one note on flavor).
- The set total N is not in the raw cache, only the position n. The scans print Iron Man n/14, Captain Marvel n/14,
  Registration n/8, Mighty Avengers n/5, The Initiative n/5, Maria Hill n/5, Dangerous Recruits n/5, Cape-Killer n/5,
  Martial Law n/5, Heroes for Hire n/5, Paladin n/5, Standard PVP n/5. Player cards print "Basic / Iron Man" or
  "Basic / Captain Marvel" with no n/N.
- The raw `set_position` is the first position of a card that has several copies (Iron Man 56070 prints 10/14 and its
  second copy 11/14; 56071 prints 12/14). That convention was used. The one place it fails is in the table
  (56101 to 56103).
- All the scheme icons agree with the raw flags: amplify on 56077, 56104, 56111; hazard on 56072, 56086, 56116; crisis
  on 56082, 56108; acceleration on 56091, 56106, 56114, 56120, 56131. Per-player icons on threat agree: 56072, 56104
  and 56128a print a person icon; 56077, 56082, 56086, 56091, 56108, 56111, 56116, 56120 print a bare number. All eight
  main scheme B faces print the per-player icon on the threat (7 or 9) and on the escalation (+1), matching
  `threat_fixed: false` and `escalation_threat_fixed: false`; the 0 starting threat is bare, matching
  `base_threat_fixed: true`. The stars agree: SCH star on all four Iron Man leaders, ATK star on 56065, 56087, 56105,
  56118, boost star on every card with a "Boost" label and no icons, target threat star on 56064b, escalation star on
  56122b.
- The cache's `[energy]`, `[physical]`, `[mental]`, `[wild]`, `[per_hero]`, `[star]`, `[boost]` were read as the matching
  printed icon in every case.

## Result in one paragraph

Five records differ from their print in a way that matters to the data: 56061 (label), 56069 (label, a different
timing window), 56086 and 56118 (typos that are the cache's), 56127 (wording of the Boost). Three more differ in
cosmetic or bookkeeping ways: 56135 (the card prints a misspelled title), 56101 / 56102 / 56103 (set positions) and the
missing flavor on five main scheme B faces. Two of the five matter to behavior (56061, 56069) and one more may
(56127). 56073 and 56098 print the pre-errata text, as expected. 56128b has no scan of its own; its text was checked
against the sibling print 56206b.

## Faces

Result is "matches" or the exact difference (raw says / card prints). Hit points are read from the stat bubble where
the card has one.

### Iron Man leader (iron_man_leader)

| Code  | Face              | Result                                                                                                                                                                                |
| ----- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56059 | Iron Man I        | matches (SCH 1 star, ATK 1, 12 per player, Avenger., unique, Setup word for word, 1/14)                                                                                               |
| 56060 | Iron Man II       | matches (SCH 1 star, ATK 2, 16 per player, Steady, When Revealed, 2/14)                                                                                                               |
| 56061 | Iron Man III      | DIFFERS: raw says "When Revealed: The enemy team searches ..."; card prints "Setup: The enemy team searches ...". Rest matches (SCH 1 star, ATK 2, 16 per player, 3/14)               |
| 56062 | Iron Man IV       | matches (SCH 1 star, ATK 3, 20 per player, Steady, When Revealed, 4/14)                                                                                                               |
| 56065 | Powered Gauntlets | matches (+1 ATK star, Armor. Tech., ranged star text, Hero Response spend energy + physical, boost star "Reveal this card", 5/14)                                                     |
| 56066 | Rocket Boots      | matches (+1 ATK no star, Aerial trait, Hero Response energy + physical, boost star, 6/14)                                                                                             |
| 56067 | Mark V Helmet     | matches (two boost icons, tough status card, stalwart, Hero Response mental + physical, 7/14)                                                                                         |
| 56068 | Arc Reactor       | matches (two boost icons, tough status card, retaliate 1, Hero Response mental + physical, 8/14)                                                                                      |
| 56069 | Mark V Armor      | DIFFERS: raw says "Forced Response: When Iron Man would take any amount of damage ..."; card prints "Forced Interrupt: When Iron Man would take ...". Rest matches (boost star, 9/14) |
| 56070 | Repulsor Blast    | matches (boost 1, both When Revealed forms, "printed energy and wild resource", 10/14)                                                                                                |
| 56071 | Supersonic Punch  | matches (boost 2, both When Revealed forms, flavor "That's it. Now I'm mad!", 12/14)                                                                                                  |
| 56072 | Stark Tower       | matches (3 per player, hazard icon, boost 3, When Defeated, 14/14)                                                                                                                    |

### Iron Man leader, player cards (Basic / Iron Man)

| Code  | Face           | Result                                                                                                              |
| ----- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| 56129 | The Futurist   | matches (event, cost 2, wild icon, Action, "Do not give him a boost card for this activation")                      |
| 56130 | Target Lock    | matches (event, cost 2, wild icon, "If you spent a mental resource", "Hero Response" or "Hero Interrupt")           |
| 56131 | High-Tech Suit | matches (upgrade, cost 1, wild icon, acceleration icon, "Counts as a Tech attachment", Hero Action energy + mental) |
| 56132 | Suit Up        | matches (resource, two wild icons, Hero Response)                                                                   |

### Mighty Avengers (mighty_avengers)

| Code  | Face                     | Result                                                                                                                                                                                              |
| ----- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56073 | Yellow Jacket            | matches the raw text (SCH 2, ATK 1, 4 hit points, unique, Avenger., Toughness, boost star, 1/5). Prints the pre-errata title "Yellow Jacket" (RRG p. 70 retitles it "Yellowjacket"); not a mismatch |
| 56074 | Wasp                     | matches (SCH 1, ATK 2, 3 hit points, Aerial. Avenger., Teamwork (Avenger), boost star, 2/5)                                                                                                         |
| 56075 | U.S. Agent               | matches (SCH 1, ATK 2, 3 hit points, Retaliate 1. Toughness., boost star, 3/5)                                                                                                                      |
| 56076 | Mighty Avengers          | matches (treachery, boost 2, 4/5)                                                                                                                                                                   |
| 56077 | Earth's Mightiest Heroes | matches (side scheme, 3 fixed, amplify, boost 2, Hinder 1 per player, 5/5)                                                                                                                          |

### The Initiative (the_initiative)

| Code  | Face                       | Result                                                                         |
| ----- | -------------------------- | ------------------------------------------------------------------------------ |
| 56078 | Doc Samson                 | matches (SCH 2, ATK 2, 4 hit points, Avenger. Gamma., Guard, boost star, 1/5)  |
| 56079 | Hellcat                    | matches (SCH 1, ATK 2, 3 hit points, Quickstrike, boost star, 2/5)             |
| 56080 | Drafted                    | matches (attachment, boost 1, "In competitive mode" clause word for word, 3/5) |
| 56081 | Mighty Avengers            | matches (treachery, boost 2, 4/5)                                              |
| 56082 | The Fifty State Initiative | matches (3 fixed, crisis, boost 2, Hinder 1 per player, When Defeated, 5/5)    |

### Maria Hill (maria_hill_modular)

| Code  | Face                     | Result                                                                                                                                              |
| ----- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56083 | Maria Hill               | matches (Elite. S.H.I.E.L.D., SCH 2, ATK 2, 4 hit points, unique, Retaliate 2, boost 2, 1/5)                                                        |
| 56084 | Life Model Decoy         | matches (Tech., boost 1, "Limit 1 per character", stalwart, Forced Interrupt, 2/5)                                                                  |
| 56085 | Executive Order          | matches (no icons, boost star "gains" three boost icons, When Revealed, 4/5)                                                                        |
| 56086 | S.H.I.E.L.D. Helicarrier | DIFFERS: raw says "deals 1 damager to each character"; card prints "deals 1 damage to each character". Rest matches (3 fixed, hazard, boost 2, 5/5) |

### Dangerous Recruits (dangerous_recruits)

| Code  | Face                   | Result                                                                                            |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| 56087 | Venom                  | matches (Thunderbolt., SCH 1, ATK 3 star, 4 hit points, unique, piercing star text, boost 2, 1/5) |
| 56088 | Bullseye               | matches (SCH 2, ATK 2, 3 hit points, unique, boost 2, 2/5)                                        |
| 56089 | Justice Like Lightning | matches (treachery, boost 1, 3/5)                                                                 |
| 56090 | Excessive Force        | matches (treachery, boost star, 4/5)                                                              |
| 56091 | Dangerous Recruits     | matches (3 fixed, acceleration icon, boost 2, Forced Interrupt, 5/5)                              |

### Captain Marvel leader (captain_marvel_leader)

| Code  | Face                    | Result                                                                                                                                                                                                |
| ----- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56092 | Captain Marvel I        | matches (SCH 1, ATK 2, 14 per player, Aerial. Avenger., Setup, Forced Response, 1/14)                                                                                                                 |
| 56093 | Captain Marvel II       | matches (SCH 2, ATK 2, 18 per player, Steady, When Revealed, Forced Response, 2/14)                                                                                                                   |
| 56094 | Captain Marvel III      | matches (SCH 2, ATK 2, 18 per player, Setup, Forced Response, 3/14)                                                                                                                                   |
| 56095 | Captain Marvel IV       | matches (SCH 2, ATK 3, 22 per player, Steady, When Revealed, Forced Response, 4/14)                                                                                                                   |
| 56098 | Energy Channel          | matches the raw text. Prints the pre-errata wording "remove all of them → Captain Marvel attacks that character" (RRG p. 70 changes the arrow to "and"); not a mismatch. Superpower., Permanent, 5/14 |
| 56099 | Captain Marvel's Helmet | matches (+1 SCH no star, unique icon, Armor. Tech., stalwart, "3 resources of the same type", boost star, 6/14)                                                                                       |
| 56100 | Cosmic Flight           | matches (+1 ATK no star, Superpower., Forced Interrupt, boost star, 7/14)                                                                                                                             |
| 56101 | Photonic Blast          | text matches (boost 1). SET POSITION: raw 9, card prints 8/14                                                                                                                                         |
| 56102 | Crisis Interdiction     | text matches (boost 2). SET POSITION: raw 11, card prints 10/14                                                                                                                                       |
| 56103 | Energy Absorption       | text matches (boost star). SET POSITION: raw 13, card prints 12/14                                                                                                                                    |
| 56104 | Alpha Flight Station    | matches (3 per player, amplify, boost 3, When Defeated, 14/14)                                                                                                                                        |

### Captain Marvel leader, player cards (Basic / Captain Marvel)

| Code  | Face                 | Result                                                                                                                                                                     |
| ----- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56133 | Provoked Response    | matches (upgrade, cost 0, wild icon, Forced Interrupt, "She cannot take more than 3 damage")                                                                               |
| 56134 | You Started This     | matches (event, cost 2, wild icon, "If you spent an energy resource", confuse)                                                                                             |
| 56135 | Alpha Flight Recruit | DIFFERS in the title only: raw says "Alpha Flight Recruit"; card prints "Alpha Flgiht Recruit" (a printing error on the card). Text, Title. trait, cost 0, wild icon match |
| 56136 | Raw Power            | matches (resource, two wild icons, Hero Response, 2 energy counters)                                                                                                       |

### Cape-Killer (cape_killer)

| Code  | Face               | Result                                                                                                                |
| ----- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 56105 | Cape-Killer        | matches (S.H.I.E.L.D., SCH 1, ATK 2 star, 4 hit points, not unique, Quickstrike, star Forced Interrupt, boost 2, 1/5) |
| 56106 | Unregistered Super | matches (obligation, acceleration icon, boost 1, Alter-Ego Action, 3/5)                                               |
| 56107 | Bring Them In      | matches (treachery, boost 1, 4/5)                                                                                     |
| 56108 | Arrest Order       | matches (3 fixed, crisis, boost 2, When Defeated, 5/5)                                                                |

### Martial Law (martial_law)

| Code  | Face                 | Result                                                              |
| ----- | -------------------- | ------------------------------------------------------------------- |
| 56109 | S.H.I.E.L.D. Soldier | matches (SCH 1, ATK 1, 3 hit points, not unique, boost star, 1/5)   |
| 56110 | Rapid Response       | matches (treachery, boost 1, two bullets, 4/5)                      |
| 56111 | S.H.I.E.L.D. Patrol  | matches (3 fixed, amplify, boost 3, "Each minion gains guard", 5/5) |

### Heroes for Hire (heroes_for_hire)

| Code  | Face               | Result                                                                     |
| ----- | ------------------ | -------------------------------------------------------------------------- |
| 56112 | Colleen Wing       | matches (Hero for Hire., SCH 1, ATK 2, 3 hit points, unique, boost 2, 1/5) |
| 56113 | Shang-Chi          | matches (SCH 2, ATK 2, 4 hit points, unique, boost 2, 2/5)                 |
| 56114 | Unregistered Super | matches (obligation, acceleration icon, boost 1, 3/5)                      |
| 56115 | Bounty Hunting     | matches (treachery, boost 1, flavor, 4/5)                                  |
| 56116 | Heroes for Hire    | matches (3 fixed, hazard, boost 2, When Defeated, 5/5)                     |

### Paladin (paladin)

| Code  | Face                  | Result                                                                                                                                                                                                                          |
| ----- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56117 | Paladin               | matches (Elite. Hero for Hire., SCH 2, ATK 2, 5 hit points, unique, Quickstrike. Toughness., boost 2, 1/5)                                                                                                                      |
| 56118 | Paladin's Pistol      | DIFFERS: raw says "Attack to Paladin. Otherwise, attach to the enemy leader."; card prints "Attach to Paladin. Otherwise, attach to the enemy leader." Rest matches (Weapon., +2 ATK star, star Forced Interrupt, boost 2, 2/5) |
| 56119 | Bounty Hunting        | matches (treachery, boost 1, 4/5)                                                                                                                                                                                               |
| 56120 | Government Contractor | matches (3 fixed, acceleration, boost 2, "Each identity gains the Unregistered trait", 5/5)                                                                                                                                     |

### Registration main schemes (registration)

The A faces print "(???)" and no stage threat; they match. Every B face prints its own n/8.

| Code   | Face                            | Result                                                                                                     |
| ------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 56063a | Superhero Registration Act (1A) | matches (Contents, Setup word for word, "In competitive mode" and "In cooperative mode" clauses)           |
| 56063b | Cut Off Support (1B)            | matches (0 start, 7 per player, +1 per player, Hinder 2 per player, Forced Interrupt with the limit, 4/8)  |
| 56064a | Pro-Registration Tactics (2A)   | matches (flavor only)                                                                                      |
| 56064b | Negative Zone Prison (2B)       | matches (0 start, 9 per player with a star, +1 per player, star text, Forced Response, loss line, 8/8)     |
| 56096a | Superhero Registration Act (1A) | matches (same text as 56063a)                                                                              |
| 56096b | S.H.I.E.L.D. Recruits (1B)      | matches (7 per player, +1 per player, Hinder 2 per player, When Revealed with "1 per player minions", 1/8) |
| 56097a | Pro-Registration Tactics (2A)   | matches                                                                                                    |
| 56097b | Hunting Rebel Heroes (2B)       | matches (9 per player, +1 per player, no stars, Unregistered text, Forced Response, loss line, 6/8)        |
| 56121a | Superhero Registration Act (1A) | matches                                                                                                    |
| 56121b | Homeland Security (1B)          | matches (7 per player, +1 per player, Hinder 2 per player, "Each minion gains guard", 2/8)                 |
| 56122a | Superhero Registration Act (1A) | matches                                                                                                    |
| 56122b | Public Outrage (1B)             | matches (7 per player, +1 per player with an escalation star, star Forced Response, 3/8)                   |
| 56123a | Pro-Registration Tactics (2A)   | matches                                                                                                    |
| 56123b | The Initiative (2B)             | matches (9 per player, +1 per player, When Revealed with "1 per player side schemes", loss line, 5/8)      |
| 56124a | Pro-Registration Tactics (2A)   | matches                                                                                                    |
| 56124b | No Going Back (2B)              | matches (9 per player, +1 per player, "Allies enter play exhausted", loss line, 7/8)                       |

### Standard PvP (standard_pvp, registration copy)

| Code   | Face              | Result                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 56125  | Righteous Cause   | matches (treachery, no boost icons, When Revealed, flavor, 1/5)                                                                                                                                                                                                                                                                                                                                        |
| 56126  | Whatever It Takes | matches (treachery, both When Revealed forms, flavor, 2/5)                                                                                                                                                                                                                                                                                                                                             |
| 56127  | Targeted Strike   | DIFFERS in the Boost: raw says "Boost: The card gains [boost] for each player on your team."; card prints "Boost: This card gains [boost] for each player on your team." When Revealed and boost star match, 3/5                                                                                                                                                                                       |
| 56128a | Choosing Sides    | matches (side scheme, 4 per player, Permanent, "cannot take more than 2 damage from each attack", Forced Response with "1 per player encounter cards" and "Flip this card", 5/5)                                                                                                                                                                                                                       |
| 56128b | Now It's Personal | NO SCAN of its own (none for 56128b in the bundle). Checked against the scan of the sibling print 56206b (Standard PVP 5/5, obligation, "Give to the first player.", Action "Remove this card from the game -> each player on your team chooses 2 of your leader's set-aside player cards and adds them to their hand."): the raw text matches it word for word. Inferred, not read from 56128b itself |

## Known errata (RRG 1.8 p. 70, Civil War Expansion)

- Energy Channel 56098: the scan prints the pre-errata text, "... remove all of them → Captain Marvel attacks that
  character. This attack gains overkill." The errata reads "... remove all of them and Captain Marvel attacks that
  character ...". The raw cache carries the printed (arrow) text, as the scan does. Not a mismatch.
- Yellow Jacket 56073: the scan prints the title "Yellow Jacket"; the errata retitles #73 "Yellowjacket" (title only,
  no text change). The raw cache carries "Yellow Jacket". Not a mismatch.

## Corrections owed in the data

1. **56061 Iron Man III, `text`**: change "<b>When Revealed</b>: The enemy team searches the encounter deck for an Iron
   Man attachment and your team reveals it." to "<b>Setup</b>: The enemy team searches the encounter deck for an Iron
   Man attachment and your team reveals it." (already known; scan read again for this check).
2. **56069 Mark V Armor, `text`**: change "<b>Forced Response</b>: When Iron Man would take any amount of damage, place
   it here instead. Then, if there is at least 5 damage here, discard this card." to "<b>Forced Interrupt</b>: When
   Iron Man would take any amount of damage, place it here instead. Then, if there is at least 5 damage here, discard
   this card." (the rest of the text is unchanged).
3. **56086 S.H.I.E.L.D. Helicarrier, `text`**: "deals 1 damager to each character" becomes "deals 1 damage to each
   character". Typo is the cache's (spec section 0 asked for this read).
4. **56118 Paladin's Pistol, `text`**: "Attack to Paladin. Otherwise, attach to the enemy leader." becomes "Attach to
   Paladin. Otherwise, attach to the enemy leader." Typo is the cache's (spec section 0 asked for this read).
5. **56127 Targeted Strike, `text`**: in the Boost, "The card gains [boost] for each player on your team." becomes "This
   card gains [boost] for each player on your team." The same print as 56205 (the resistance copy): check that record
   too, which is outside this range.
6. **56101, 56102, 56103, `set_position`**: raw 9, 11, 13 against printed 8, 10, 12 (of 14). Set them to 8, 10, 12.
   The other six cards of the set agree with the print (5, 6, 7 for 56098 to 56100; 14 for 56104). Eight positions are
   taken (5, 6, 7, 8 and 9, 10 and 11, 12) and 13 is unaccounted for: a printed 13/14 must be a second copy of 56100
   (7 and 13) or of 56103 (12 and 13). The raw `quantity` (2 for 56100, 1 for 56103) may be wrong for one of them;
   quantity is not on the card, so it cannot be settled from the scans. See "Differences that change behavior".
7. **56135 Alpha Flight Recruit, `name`**: the card prints "Alpha Flgiht Recruit". Recommended: keep "Alpha Flight
   Recruit" in the data, as it is, and record the printed misspelling in a curation note (it is a printing error, not
   an errata; the RRG p. 70 list has no entry for it). The owner decides whether the displayed title follows the print.
8. **Flavor on five main scheme B faces** (not carried by the cache; optional, cosmetic): 56063b "Society will no
   longer tolerate superheroes who operate outside the law." -She-Hulk; 56121b "With armed S.H.I.E.L.D. units
   patrolling the streets, crime rates have fallen to record lows."; 56122b "I can't believe Captain America has turned
   against his country!" -J. Jonah Jameson; 56123b "Wait until they see our plans to protect the midwest."
   -Yellowjacket; 56124b "There's no more amnesty for Cap and his renegades. It's gone too far!" -She-Hulk.

No other raw field (title, subtitle, type, stage, traits, cost, resource icons, stats, stars, per-player flags,
keywords, labels, text, boost, scheme icons, set name, set position outside item 6, unique flag) differs from a scan.

## Differences that change behavior

1. **56061 Iron Man III, "Setup" and not "When Revealed".** Spec question 8 (section 4.1, closed 2026-10-11) and
   sections 2.2 and 8.1 item 3 already rest on the printed "Setup". Section 3.5 (line 305, the "enemy team"
   search row) lists 56061 next to 56059 with the same primitive. Nothing in the spec relies on the wrong text;
   the data correction in item 1 is the only change. Until it lands, the data would resolve the search in an
   expert-mode game as a first-stage reveal instead of at setup: the card would act when it is flipped to the front of
   the villain deck rather than at the start of play.
2. **56069 Mark V Armor, Forced Interrupt and not Forced Response.** Spec section 3.23 (line 795: "wave 9 section 3.25
   (damage onto the attachment), `damagedAtLeast` (verify)") and section 7.1 (line 990: "damage placed here; discard
   at 5") treat the card as a replacement of damage. The text says "would take", which is an interrupt window:
   the damage is replaced before it is dealt. With a Forced Response label the data would open the trigger after the
   damage had been taken, so there would be nothing to replace. The design (damage placed here instead) is the right
   one; only the label in the data changes, and the scripting agent should use the interrupt trigger. The same
   interaction applies with Cosmic Flight 56100 (a Forced Interrupt on "would take more than 3 damage"): printed
   timing decides which of the two applies first when both are attached, which spec section 3.22 does not yet cover.
   Worth a scenario test once both are scripted.
3. **56127 Targeted Strike, "This card" and not "The card".** Targeted Strike is in the competitive set that the spec
   sets aside for pass 1c (section 6.2; section 7.9, line 1149, "Set aside for pass 1c"), so no design rests on the wrong
   text yet. When it is designed: "The card" could be read as the card the enemy team found and dealt facedown (an
   encounter card) and "This card" is Targeted Strike itself as a boost card. The printed word makes the target
   Targeted Strike, so the added boost icons belong to this card's own boost total. The spec's question 10 (section
   4.1, "a boost ability that speaks of 'this card'") is the same class of wording and should be extended to cover it.
4. **56101 to 56103 set positions and quantity.** No behavior, but spec section 7.2 (lines 1001 to 1003) lists
   "56100 x2", "56101 x2", "56102 x2" and "56103" from the raw quantity. If one of the 14 printed slots is
   misattributed, one of those multipliers is wrong and the Captain Marvel set would deal one card too many or too few
   into the encounter deck. It cannot be settled from the scans (quantity is not printed). It needs the physical set's
   card list or the product insert; until then, treat the counts as unverified.

None of the other differences (56086, 56118 typos; 56135 title; the flavor lines) change behavior: the first two are
single-letter typos that the spec already expected (section 0, section 8.1 item 6) and the scan confirms them as
the cache's.

## Missing or unreadable scans

- No scan is unreadable.
- 56128b has no scan of its own. The sibling print 56206b exists and matches the raw text (see the table).
- Not checkable from any scan: raw `quantity`, the set total N for each set (taken from the printed n/N, which was
  readable), the illustrator credit.
