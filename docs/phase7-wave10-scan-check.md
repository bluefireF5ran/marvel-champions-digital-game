# Phase 7 wave 10: raw card text against the card scans (Wonder Man, Hercules)

Date: 2026-10-11. Branch `feature/wave-10`. Nothing in the repo was changed except this file.

## Method

Every record and every nested b face in `packages/content/raw/marvelcdb/wonder_man.json` (34 records, 35 faces) and
`hercules.json` (45 records, 46 faces) was compared with its scan in `assets/card-art/bundles/cards/`. The raw cache
was printed with a small node script (code, name, subname, type, aspect, unique, cost, resource icons, traits, stats,
per-player and star flags, boost, scheme icons, set position, text) and read next to the scan, field by field: title,
subtitle, type line, traits, cost, resource icons, THW / ATK / DEF / SCH / hit points / hand size / REC, the stat icon
counts, stat stars, keywords, every ability label, the ability text word for word, arrows against "Then", boost icons
and boost star, scheme threat and its per-player icon, scheme icons (acceleration / crisis / hazard / amplify), set
name, set number (n/N), unique icon.

Notes on the scans themselves:

- The files are WebP images saved with `.png` and `.jpg` extensions (the `.jpg` and `.png` pairs are identical). All
  were readable. The hero faces (58001a/b, 59001a/b) and the older reprint originals (01088, 01089, 01090, 01092,
  06032, 08023) are small (about 300 x 425) but legible.
- Printed quantity is not on any card, so quantity cannot be checked against a scan. The raw `quantity` was not
  compared. Illustrator credits were not compared.
- The set total N is not in the raw cache (only the position n), so only n was compared. The scans print Wonder Man
  n/16, Hercules n/15, Wonder Man Nemesis n/5, Hercules Nemesis n/5, Labor Deck n/3, Gift Deck n/3, All Versus All
  n/5. Every raw position equals the printed n. Aspect and basic cards print no set line.
- A cost of X is encoded in the raw cache as `cost: -1` (58018). That is the cache's convention, not a transcription
  error, and the spec already records it (H1.3 / H7.2, `specialCost: "X"`).
- The cache's rendering of icons as `[energy]`, `[wild]`, `[per_hero]`, `[star]`, `[cost]` was read as the matching
  printed icon in every case (the printed energy icon, the star glyph on Olympus, Quincarrier and Mr. Hollywood, the
  per-player person icon, the printed star bullet, the consequential-damage icon on Deathcry).
- 58027 prints the amplify icon (cross with a wing), 59038 and 59041 print the hazard icon (cross on a card), and
  59045 prints the crisis icon (exclamation point). These agree with raw `scheme_amplify`, `scheme_hazard` and
  `scheme_crisis`. The per-player or fixed threat agrees as well: 58027 and 59022 / 59028 print a number with the
  person icon (per player), 59038, 59041 and 59045 print a bare number (fixed).

## Result in one paragraph

No transcription difference that changes game behavior was found in either pack. One text difference was found (59021
Teamwork, a missing colon in the cache, cosmetic). Ionic Physiology 58002 prints the pre-errata text. Eight Hercules
records and one Wonder Man record are reprints with no scan of their own; they were checked against the original's
scan.

## Wonder Man (`wonder_man`, 58001a/b to 58034)

Scan 58001a is the front of the hero; hero ATK prints "1" with a star, matching `attack_star`.

| Code   | Face                          | Result                                                                                                                                                  |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 58001a | Wonder Man (hero)             | matches: THW 2, ATK 1 (star), DEF 2, hand size 5, hit points 12, Aerial. Avenger., unique, "Power Recycling" and the star Forced Response word for word |
| 58001b | Simon Williams (alter-ego)    | matches: REC 3, hand size 6, hit points 12, Civilian., "Ionic Energy Being", Setup: Put Ionic Physiology into play                                      |
| 58002  | Ionic Physiology              | matches the raw text. Both print the pre-errata wording (cost arrow "→ heal 1 damage from your identity"). See "Known errata"                           |
| 58003  | Active Altruism               | matches (cost 0, energy, Thwart., Wonder Man 2/16)                                                                                                      |
| 58004  | Ionic Blast                   | matches (cost 1, Attack. Superpower., 5/16)                                                                                                             |
| 58005  | Starstruck                    | matches (cost 1, Attack. Superpower., 7/16)                                                                                                             |
| 58006  | Energy Siphon                 | matches (no cost, energy icon, Hero Interrupt, 10/16)                                                                                                   |
| 58007  | Wonder Fans                   | matches (cost 1, wild icon, Civilian., Alter-Ego Action, two bullets, 12/16)                                                                            |
| 58008  | Jet Belt                      | matches (cost 2, mental icon, unique, Item. Tech., two Hero Resource abilities, 13/16)                                                                  |
| 58009  | Mr. Hollywood                 | matches (cost 1, wild icon, unique, Title., Resource, flavor "Kate Bishop", 14/16)                                                                      |
| 58010  | Signature Sunglasses          | matches (cost 1, physical icon, unique, Item., Response, 15/16)                                                                                         |
| 58011  | "What Are You?"               | matches (cost 2, energy icon, Superpower., Forced Interrupt, 16/16)                                                                                     |
| 58012  | Firebird, Bonita Juarez       | matches (Justice, cost 2, hit points 2, THW 2 with 1 icon, ATK 2 with 2 icons, unique, Aerial. Avenger.)                                                |
| 58013  | Hawkeye, Clint Barton         | matches (cost 3, hit points 3, THW 1 / 1 icon, ATK 1 / 1 icon, Avenger. S.H.I.E.L.D.)                                                                   |
| 58014  | Scarlet Witch, Wanda Maximoff | matches (cost 2, hit points 3, THW 2 / 1, ATK 2 / 1, mental icon, Avenger. Mystic.)                                                                     |
| 58015  | Sentry, Robert Reynolds       | matches (cost 3, hit points 5, THW 2 / 1, ATK 3 / 1, Aerial. Avenger.)                                                                                  |
| 58016  | Battlefield Benevolence       | matches (cost 1, physical icon, Tactic., flavor "Vulture")                                                                                              |
| 58017  | Bombs Away                    | matches (own scan; cost 2, Aggression, Aerial. Tactic.). Raw `duplicate_of_code` 42029                                                                  |
| 58018  | Everywhere All at Once        | matches (cost prints X, raw -1 is the cache's encoding of X; Aerial. Thwart.; "3 threat instead if you overpaid")                                       |
| 58019  | Stronger Together             | matches (cost 0, Protection, no traits line)                                                                                                            |
| 58020  | Unified Strike                | matches (cost 0, Leadership, Tactic.)                                                                                                                   |
| 58021  | Heroic Conditioning           | matches (cost 3, physical icon, Condition., Max 1 per player)                                                                                           |
| 58022  | Swordsman, Jacques Duquesne   | matches (basic, cost 4, hit points 4, THW 2 / 2 icons, ATK 2 star / 1 icon, physical icon, unique, Avenger.)                                            |
| 58023  | Energy                        | no scan of its own (reprint, `duplicate_of_code` 01088). 01088's scan: Resource, two energy icons, "Max 1 per deck." Matches                            |
| 58024  | Jarvis                        | matches (basic, cost 2, energy icon, unique, Avenger. Persona., Response, two bullets)                                                                  |
| 58025  | Pacifism                      | matches (obligation, boost 2, "Give to the Simon Williams player.", Alter-Ego Action, set line "Wonder Man")                                            |
| 58026  | Grim Reaper                   | matches (minion, SCH 2, ATK 2 star, hit points 3, unique, Cyborg., Quickstrike, boost 2, Wonder Man Nemesis 1/5)                                        |
| 58027  | Brother vs. Brother           | matches (side scheme, threat 2 per player, boost 3, amplify icon, 2/5)                                                                                  |
| 58028  | Scythe Strike                 | matches (treachery, boost 2, When Revealed, flavor "Grim Reaper", 3/5)                                                                                  |
| 58029  | Death Cannot Die              | matches (treachery, no boost icons, boost star, When Revealed, the printed Boost, 4/5)                                                                  |
| 58030  | Caught in the Crossfire       | matches (Aggression, cost 0, energy icon, Tactic., Attach to a non-Elite minion)                                                                        |
| 58031  | Cameo                         | matches (Leadership, no cost and no resource icon, "Setup. Max 1 per deck.", Setup)                                                                     |
| 58032  | Coordinated Effort            | matches (Leadership, cost 0, wild icon, Tactic.)                                                                                                        |
| 58033  | Disarming Defense             | matches (Protection, cost 1, energy icon, Defense., Hero Interrupt (defense))                                                                           |
| 58034  | Avengers Compound             | matches (basic, cost 0, mental icon, Avenger. Location., Action)                                                                                        |

## Hercules (`hercules`, 59001a/b to 59045)

| Code   | Face                      | Result                                                                                                                                                                                                 |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 59001a | Hercules (hero)           | matches: THW 1, ATK 3, DEF 2, hand size 4, hit points 14, Avenger. Olympus., unique, "Atonement" Response word for word including "(Limit once per phase.)"                                            |
| 59001b | Hercules (alter-ego)      | matches: REC 4, hand size 6, hit points 14, Olympus., two-deck sentence with "(See insert.)", "New Labors of Hercules" Action                                                                          |
| 59002  | Defeat the Hydra          | matches (attachment, Labor., Victory 0, Labor Deck 1/3, When Revealed)                                                                                                                                 |
| 59003  | Embody Pathos             | matches (attachment, Labor., "treating each per-player icon on it as 1", Labor Deck 2/3)                                                                                                               |
| 59004  | Protect Humanity          | matches (obligation, Labor., "Uses (3 labor counters). Victory 0.", Labor Deck 3/3)                                                                                                                    |
| 59005  | Nemean Lion Skin          | matches (upgrade, no cost, unique, Artifact. Gift., Permanent., Gift Deck 1/3)                                                                                                                         |
| 59006  | Shield of Perseus         | matches (no cost, unique, Artifact. Gift., "+1 hit point and gains retaliate 1", 2/3)                                                                                                                  |
| 59007  | Sword of Peleus           | matches (no cost, unique, Artifact. Gift. Weapon., "Permanent. Restricted.", 3/3)                                                                                                                      |
| 59008  | Amadeus Cho               | matches (cost 2, hit points 2, THW 1 / 1, ATK 1 / 1, wild icon, unique, Genius., Hercules 1/15)                                                                                                        |
| 59009  | The Gift of Battle        | matches (cost 3, physical icon, Attack., flavor "Hercules", 2/15)                                                                                                                                      |
| 59010  | Son of Zeus               | matches (cost 2, energy icon, Olympus., Hero Action, three bullets, 5/15)                                                                                                                              |
| 59011  | Wisdom of Athena          | matches (cost 3, mental icon, Thwart., "Remove 4 threat", 7/15)                                                                                                                                        |
| 59012  | Olympus                   | matches (cost 0, energy icon, unique, Location. Olympus., Resource, wild icon, 9/15)                                                                                                                   |
| 59013  | Gauntlets of Hercules     | matches (cost 0, physical icon, unique, Armor. Olympus., 10/15)                                                                                                                                        |
| 59014  | Golden Mace               | matches (cost 1, physical icon, unique, Olympus. Weapon., Restricted, "gains overkill", 11/15)                                                                                                         |
| 59015  | Herc's Helm               | matches (cost 0, physical icon, unique, Armor. Olympus., Hero Interrupt (defense), 12/15)                                                                                                              |
| 59016  | Lion of Olympus           | matches (cost 0, physical icon, Olympus., Temporary., not unique, 13/15)                                                                                                                               |
| 59017  | Prince of Power           | matches (cost 1, physical icon, unique, Olympus. Title., Hero Response, 15/15)                                                                                                                         |
| 59018  | Deathcry, Sharra Neramani | matches (Leadership, cost 3, hit points 4, THW 1 / 1, ATK 3 star / 2, physical icon, unique, Avenger.)                                                                                                 |
| 59019  | Namora, Aquaria Neptunia  | matches (cost 4, hit points 4 star, THW 2 / 2, ATK 2 / 1, physical icon, unique, Agent of Atlas. Atlantis.)                                                                                            |
| 59020  | Thor, Odinson             | matches (cost 4, hit points 4, THW 3 star / 1, ATK 3 / 2, energy icon, unique, Asgard. Avenger.)                                                                                                       |
| 59021  | Teamwork                  | no scan of its own (reprint, `duplicate_of_code` 06032). Differs from 06032's scan in one character, see below                                                                                         |
| 59022  | Call for Backup           | matches (own scan; player side scheme, Leadership, unique, mental icon, threat 3 per player, Victory 0, When Defeated; cost glyph is a stylized 1)                                                     |
| 59023  | Recruitment Drive         | matches (cost 3, mental icon, "Alter-ego form only.", Action)                                                                                                                                          |
| 59024  | "Avenge Me!"              | matches (cost 0, physical icon, Avenger., "Play only if...", Interrupt)                                                                                                                                |
| 59025  | Gilgamesh                 | matches (basic, cost 3, hit points 6, THW 2 / 2, ATK 3 / 2, physical icon, unique, Eternal.)                                                                                                           |
| 59026  | Ancient Rivalry           | matches (basic, cost 1, wild icon, Asgard. Olympus., Team-Up (Hercules and Thor), Max 1 per deck, not unique)                                                                                          |
| 59027  | Limitless Stamina         | no scan of its own (reprint of 31023). 31023's scan: cost 1, physical icon, Superpower., "at least 14 printed hit points", Ready your hero, flavor "Thor". Matches                                     |
| 59028  | Evaluate Threat           | matches (own scan; player side scheme, basic, unique, mental icon, threat 2 per player, Victory 0, Avenger or S.H.I.E.L.D., When Defeated with "Reduce the cost ... by 2"; cost glyph is a stylized 1) |
| 59029  | Energy                    | no scan of its own (reprint of 01088); matches the original (two energy icons, "Max 1 per deck.")                                                                                                      |
| 59030  | Genius                    | no scan of its own (reprint of 01089); matches the original (two mental icons, "Max 1 per deck.")                                                                                                      |
| 59031  | Strength                  | no scan of its own (reprint of 01090); matches the original (two physical icons, "Max 1 per deck.")                                                                                                    |
| 59032  | Avengers Compound         | no scan of its own (reprint of 58034); matches 58034's scan word for word                                                                                                                              |
| 59033  | Helicarrier               | no scan of its own (reprint of 01092); matches the original (cost 3, physical icon, Location. S.H.I.E.L.D., "Max 1 per player.", Action, flavor "Jennifer Walters")                                    |
| 59034  | Quincarrier               | no scan of its own (reprint of 08023); matches the original (cost 3, mental icon, unique, Avenger. Vehicle., "Play only if...", Resource, wild icon, flavor "Hawkeye")                                 |
| 59035  | Appeal to Athena          | matches (obligation, boost 2, "Give to the Hercules player.", the two mental icons in the Alter-Ego Action, set line "Hercules")                                                                       |
| 59036  | Ares                      | matches (minion, SCH 0 star, ATK 3, hit points 5, unique, Elite. Olympus., Retaliate 1, boost 2, "(Hercules's nemesis minion.)", Hercules Nemesis 1/5)                                                 |
| 59037  | Lernean Hydra             | matches (minion, SCH 0, ATK 2, hit points 6, unique, Creature. Hydra., boost 1 (one icon), physical icon in the choice, 2/5)                                                                           |
| 59038  | Olympic Feud              | matches (side scheme, threat 2 fixed, hazard icon, boost 3, flavor, 3/5)                                                                                                                               |
| 59039  | Ares's Axe                | matches (attachment, Weapon., +2 ATK star, boost 2, star Forced Response, flavor, 4/5)                                                                                                                 |
| 59040  | God of War                | matches (treachery, boost 3, When Revealed with the parenthetical, 5/5)                                                                                                                                |
| 59041  | All Versus All            | matches (side scheme, threat 2 fixed, hazard icon, boost 2, "Hinder 2" with per-player icon, All Versus All 1/5)                                                                                       |
| 59042  | Hecate                    | matches (minion, SCH 2 star, ATK 0 star, hit points 4, unique, Olympus., boost 2, "When Revealed/Defeated", 2/5)                                                                                       |
| 59043  | Kyknos                    | matches (minion, SCH 0 star, ATK 3 star, hit points 7, unique, Brute. Olympus., "Retaliate 1. Toughness. Victory 0.", boost 3, 3/5)                                                                    |
| 59044  | Bewitched Officer         | matches (minion, not unique, SCH 1, ATK 3 star, hit points 5, Aerial. Dragon. Enthralled., Retaliate 1, boost 2, 4/5)                                                                                  |
| 59045  | Roving Mobs               | matches (side scheme, threat 3 fixed, crisis icon, boost 2, Victory 0, When Defeated, 5/5)                                                                                                             |

## Known errata: Ionic Physiology 58002

The scan (set line "Wonder Man (1/16)", Wonder Man 2) prints the pre-errata text: "Response: After you play an event
with a printed energy resource, tuck that event from your discard pile under this card → heal 1 damage from your
identity." The RRG 1.8 p. 70 errata reads "... under this card. Then, heal 1 damage from your identity." (the cost
arrow changed to "Then"). The raw cache carries the printed (arrow) text, as the scan does. This is not a mismatch; the
curation's `errata` entry is already owed (spec H1.4, H8.1 item 1).

## Corrections owed in the data

1. **59021 Teamwork, `text`**: the cache reads "Hero Interrupt When you use your basic thwart power ..." with no colon.
   The printed original (06032's scan; 59021 has no scan of its own) reads "Hero Interrupt: When you use your basic
   thwart power (THW) or basic attack power (ATK), exhaust an ally you control → add that ally's matching power to
   your hero's power for this use." Change to "Hero Interrupt: When you use ...". Confirm against the printed 59021
   if a scan of it becomes available. Cosmetic: the ability label and its trigger are unchanged.
2. **58002 Ionic Physiology**: nothing new. The data keeps the printed arrow wording, which is what the card prints;
   the RRG p. 70 errata wording goes in through the curation's `errata` entry already scheduled in spec H8.1 item 1.

No other raw field (title, subtitle, type, traits, cost, icons, stats, stars, keywords, labels, text, boost, scheme
icons, set position, unique flag) differs from a scan.

## Differences that change behavior

None found. The only text difference (59021, a missing colon) does not change what the card does. The spec sections that
touch the two non-matching items need no design change:

- 59021 Teamwork: spec H3.21 (rulings on behavior the engine already covers; the June 19, 2026 ruling on Teamwork with
  Wonder Man's tucked cards) and H5 ("Teamwork 59021 is the player event"). The design rests on the correct text.
- 58002 Ionic Physiology: spec H1.4, H2.1 and H3.12. These already follow the RRG p. 70 wording, not the scan's
  pre-errata arrow.

## Missing or unreadable scans

- No scan is unreadable.
- No scan of their own (reprints, checked against the original's scan as shown in the tables): 58023 (01088); 59021
  (06032); 59027 (31023); 59029 (01088); 59030 (01089); 59031 (01090); 59032 (58034); 59033 (01092); 59034 (08023).
- 58017 and 59022 are reprints (`duplicate_of_code` 42029 and 40018) that do have a scan of their own in the bundle;
  the own scans were used. 59022's rules text matches 40018's scan; its flavor line differs by design (59022 prints
  "I already regret this." -Rocket Raccoon, 40018 prints a Bishop quote), and the raw flavor matches 59022's scan.
- Not checkable from any scan: raw `quantity`, and the set total N.
