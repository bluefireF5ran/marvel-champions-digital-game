# Phase 7 wave 10 rules-QA pass, part 2: Civil War, resistance side

`rules-qa-engineer`, 2026-10-12, branch `feature/wave-10`. Scope: the Captain America and Spider-Woman leaders
(`cw/leaders/captain-america.ts`, `spider-woman.ts`, codes 56137 to 56149 and 56168 to 56179), the resistance main
schemes (`cw/main-schemes/resistance.ts`, 56141 to 56142, 56172 to 56173, 56199 to 56202) and the eight resistance
modular sets (`cw/modular/{new-avengers,secret-avengers,namor,atlanteans,spider-man,defenders,hells-kitchen,cloak-and-dagger}.ts`,
56150 to 56167 and 56180 to 56198). 113 ability refs were read, each against the printed text in
`packages/content/raw/marvelcdb/cw.json` (scan-checked in `docs/phase7-wave10-scan-check-cw-resistance.md`), then
against the Civil War rulebook MC56 (pp. 4 to 9 and 20 read as page images), RRG 1.8 and the FFG rulings. No script,
engine, content, client or existing test was changed.

Tests written (both files green: 12 pass, 2 expected failures):

- `packages/cards/src/wave10/qa-resistance.qa.test.ts`: 2 `it.fails` (the findings below) and 8 passing interaction
  tests the module tests do not assert.
- `packages/cards/src/wave10/qa-games-resistance.qa.test.ts`: four seeded greedy games, replayed from their logs.

RRG page numbers are the printed pages (the compressed Markdown's page marker is the number at the foot of the page,
so an entry sits on the page after the last marker above it).

## Findings

| Id  | Card                  | Severity     | Printed text                                                                                                                                                               | What the game does                                                                                                                                                                  | Citation                                                                                                                                                                   | Proving test                                                                                                                                       |
| --- | --------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | 56159 Secret Avengers | wrong result | When Defeated: "The enemy team searches the top 5 cards of the encounter deck for a card. Give that card ..."                                                              | The other four cards stay on top in order; the encounter deck is never shuffled (no `deckShuffled` event). The script comment and a module test pin this.                           | RRG 1.8 "Search" p. 39: "If any portion of a deck is searched, ... shuffle that entire deck"; FAQ "Hawkeye's Quiver"                                                       | `qa-resistance.qa.test.ts`: `it.fails("56159 Secret Avengers: 'searches the top 5 cards of the encounter deck' shuffles the deck afterwards ...")` |
| R2  | 56180 Spider-Man      | wrong result | When Revealed: "attacks each character with Tangled Up attached. If no attack was made this way, the enemy team searches ... for a copy of Tangled Up and gives it to you" | Scripted as "if no character has Tangled Up attached, search". A stunned Spider-Man (the stun card is used up instead of the attack) attacks nobody, yet no copy is found or dealt. | Printed condition is "no attack was made"; RRG "Stun, Stunned" (the stunned enemy's activation is canceled); RRG "Otherwise" p. 31 reads the preceding effect's resolution | `qa-resistance.qa.test.ts`: `it.fails("56180 Spider-Man: a Tangled Up hero, but his attack is replaced by a stun status card: ...")`               |

Notes on each finding:

- **R1.** The module comment says "the text does not shuffle", and `secret-avengers.test.ts` ("the other four stay on
  top in order") asserts the unshuffled order, so that test must change with the fix. The RRG FAQ answer is explicit
  that the shuffle follows a search of "only a portion of the deck". The same rule is why Spider-Man 56180's search and the
  setup finds already shuffle. Fix: add `shuffleEncounterDeck()` after the `giveBoostCard` in `56159.when-defeated`.
  Owner: `ability-scripting-engineer`.
- **R2.** The two readings differ only when his attack does not happen. With one `stunned` status card on the minion
  (set by surgery on the deck card; no revealed minion is stunned in normal play) the test shows the attack is
  replaced, the stun is used up, and the game then neither attacks nor deals a copy. Printed text: the search is owed.
  Fix: bind the attack results of the `forEachCard` and read "no attack resolved" (the engine already binds
  `<bind>.damaged` for `enemyAttack`; a count of resolved attacks is needed, which may be a small engine addition).
  Owner: `ability-scripting-engineer`, with `game-rules-architect` for the count. Severity is low in play (the minion
  must start stunned) but the condition is wrong as printed.

No finding was recorded for: Cap's Shield, Helmet, Serum, Shield Block, Shield Toss, Heroic Strike, Fearless
Determination, Finesse, Spider-Woman's Forced Interrupt, Contaminant Immunity, Pheromones, Venom Blast, Inconspicuous,
Self-propelled Glide, any resistance main scheme stage, or any of the modular sets besides the two above.

## Known items settled

| Item                                                     | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Venom Blast "ranged" untested                            | Correct. Hulkling with Armored Shape 56034 (retaliate 1): Spider-Woman's own attack takes 1 from retaliate (control); Venom Blast's attack (always at least one skill counter, since Finesse places one as it is revealed) takes 0 (RRG "Ranged" p. 36, "Retaliate X" p. 38). Passing test `Venom Blast 56177: ranged ignores retaliate`.                                                                                                                                                                                           |
| Spider-Man 56180 "no attack was made"                    | Differs when his attack is replaced by a stun: finding R2, `it.fails`.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Spec section 3.8: Superhero Jailbreak case               | Written and correct: Jessica Jones 56185 discarded by Jailbreak while the ally Jessica Jones 01059 is in play is not put into play, stays in the discard pile, one `uniqueEntryBlocked` (RRG "Unique Icon" p. 45). The spec's Hercules 56151 and ally 06011 would do the same; 56185 and the Core ally were used because Hercules' pack cards are not in the Civil War pool of these tests. No facedown card is dealt (it was not being revealed).                                                                                  |
| Spec section 3.8: Wasp case                              | **Not written.** Wasp 56074 is in Mighty Avengers, a registration set; `wave10Scenario` refuses it in a resistance scenario (MC56 p. 4; ruling Jan 11, 2026 R1), and no Wasp starter deck is known to `wave10Scenario` ("no wave 10 or Core starter deck wsp-aggression"). It belongs to the registration pass; a Wasp seat must be built from the wave 2 deck by identity code. Listed under Unproven.                                                                                                                             |
| Freedom Fighters with a minion that has no Boost ability | Correct as printed. "If no 'Boost' abilities were resolved this way" is true when every minion in play lacks one (Namor), so the card gains surge; the module treats a minion without a Boost as not resolved and `new-avengers.test.ts` asserts it. Also checked: Cloak and Dagger in play, "reveal this card" re-triggers each When Revealed (ruling June 25, 2026 R5): +3 threat (Open Rebellion 1, Cloak 2) and 2 damage from Dagger.                                                                                           |
| Cap's Shield and the Hero Shield (owner question 4 = A)  | No card in scope is affected. Question 4 is about the player card "Cap's Shield" (Linked, hero Captain America), which is not in the card pool at all (`packages/content/src/data` names "Cap's Shield" only at 56143). The encounter Shield is Permanent and never reaches a discard pile. One latent risk, listed under Unproven: the scripts name it by title.                                                                                                                                                                   |
| Street Defenders 56187 "Otherwise"                       | Correct. RRG "Otherwise" p. 31: an "otherwise" sentence resolves only if the preceding effect was not resolved, either a false condition or an effect that "cannot at least partially resolve". "Each minion activates ..." cannot resolve with no minion in play, so the leader activates; with any minion in play only the minions do. The module tests assert both. With a villainous minion (Namor) the card also gives no boost card (passing test `Street Defenders 56187 with a villainous minion`; RRG "Villainous" p. 47). |
| Hecate                                                   | Out of scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Play tests

`qa-games-resistance.qa.test.ts` uses the greedy driver (`testing/driver.ts`, which knows no card names) on
`wave10Scenario` seated with the Tigra deck (1 player, standard, seed 1) and the Tigra and Hulkling decks (2 players,
expert, seed 2), cap 3000 commands. Each game was asserted to finish with no illegal command from the driver, no
prompt left open after the outcome, and a log that replays to a deep-equal state.

| Scenario                     | Players, mode | Seed | Outcome                     | Round | Commands |
| ---------------------------- | ------------- | ---- | --------------------------- | ----- | -------- |
| `resistance-captain-america` | 1, standard   | 1    | loss, main scheme completed | 4     | 35       |
| `resistance-captain-america` | 2, expert     | 2    | loss, all players defeated  | 5     | 78       |
| `resistance-spider-woman`    | 1, standard   | 1    | loss, all players defeated  | 3     | 23       |
| `resistance-spider-woman`    | 2, expert     | 2    | loss, main scheme completed | 4     | 84       |

No stall, no illegal state, no unanswerable prompt, and every replay was deep-equal. All four are losses because the
greedy driver does not defend with care or thwart enough; the losses are short, so they exercise the opening of each
scenario (Setup finds, stage 1 B search, stage advance, Finesse counters, Street Defenders, Pheromones, amplify from
a revealed side scheme) rather than a long game. The 1-player Captain America game was traced command by command: the
stage 1 to stage 2 advance and the 7 threat in one villain phase come from Captain America's SCH, Falcon's activation
and boost icons, all as printed. The 1-player Spider-Woman defeat was traced too: each treachery placed a skill
counter, her ATK and the boost icons (3 from a revealed card, plus 1 amplify) account for the damage dealt.
Hunted 56007 and Alien Physiology 56036 were not reached.

## Interactions checked and passing (new tests, `qa-resistance.qa.test.ts`)

- Venom Blast ranged against a retaliating hero (above).
- Superhero Jailbreak and the unique rule (above).
- Superhero Jailbreak when the encounter deck empties during the first player's discard: the deck is reset with one
  acceleration token and the second player resumes discarding (RRG "Each Player" p. 17 and "Encounter Deck" p. 17).
- Neighborhood Protectors 56173b with two players and one side scheme left: the first player's pick is dealt, the
  second gets none, no prompt is left open.
- Street Defenders with Namor, villainous (above).
- Imperius Rex! 56163 boost on a scheme activation (alter-ego player): the leader turns up two boost cards, 2 icons
  in all.
- Freedom Fighters with Cloak and Dagger in play (above).

## Checked and correct

Every ref was read against the printed text for: "may" against compulsory, "each" against "a", the target set, timing
(When Revealed, Forced Interrupt or Response, "after" against "when"), limits, per-player icons, "Then" and arrow
dependencies, the no-valid-target case, surge and boost icons, every "In competitive mode" clause (written in full as
a marker, the cooperative reading being MC56 p. 6: "your leader" cannot be resolved, so the "Otherwise" sentence
resolves), enemy-team choices (first player, marked, owner 6A), and Teamwork's facedown boost card. The module tests
(about 6,000 lines for this scope) assert the rest.

**Captain America (21 refs).** 56137 to 56140 Setup (one Shield, no prompt, deck shuffled after the find, RRG "Search"
p. 39), the Forced Response "after Cap's Shield is attached to Captain America" (heard for Setup, a card's attach and
the Shield returning from a defeated holder, MC56 p. 20), stages II and IV When Revealed ("cannot take damage this
phase", MC56 p. 20 FAQ). 56143 Cap's Shield: retaliate 1 and "attacks against them lose piercing" as constants; the
Forced Response uses `attackUsedAtk` and the holder's damage taken (rulings Dec 17, 2025 R2 answer 3, Jan 11, 2026 R1
and R2, Jan 26, 2026 R3: flat-damage abilities do not move it; overkill that damages Captain America does). 56144
Cap's Helmet (stalwart; Hero Response after a basic attack against him, 3 resources of the same type; boost reveal).
56145 Super-Soldier Serum (overkill, discard at the end of the attack; boost reveal). 56146 Shield Block (tough and a
facedown boost card, otherwise attach and a facedown boost card). 56147 Shield Toss (alter-ego: he schemes; hero: 2
damage to each character you control, otherwise attach). 56148 Heroic Strike (alter-ego: discard an ally or upgrade;
hero: he attacks you, stun the character damaged). 56149 Fearless Determination (When Defeated: attach, he activates
against the defeating player; stays in play until it resolves, ruling Jan 11, 2026 R1).

**Spider-Woman (19 refs).** 56168 to 56171 Setup, Forced Interrupt (+1 ATK per skill counter counted before the
counters are removed), stage II and IV When Revealed. 56174 Finesse (max 3 counters; a counter for every treachery
revealed, before that treachery's own When Revealed). 56175 Contaminant Immunity (stun or confuse replaced by discard
and a tough card; boost reveal). 56176 Pheromones (stun and confuse and a counter; boost "otherwise" resolved by
RRG "Otherwise" p. 31). 56177 Venom Blast (surge in alter-ego; hero: ranged, piercing, overkill at 1, 2, 3 counters,
cumulative; ranged proven here). 56178 Inconspicuous (the first option needs a card with a cost, RRG "Choose
(Option)" p. 12; the boost counts all three status cards). 56179 Self-propelled Glide (reduction equals the counters,
not below zero).

**Main schemes (16 refs).** 56141a, 56172a, 56199a, 56200a Setup (competitive sentence a marker; cooperative: the
leader's own side scheme found and revealed by the first player). Stage 1 B constants: hinder 2 per hero only when
there is more than one player on the team (as printed). 56141b Gathering Support (one minion per player, picked by the
first player, marked; one shuffle). 56172b Open Rebellion (limit once per phase per player). 56199b Rallying Call and
56200b Going Underground. Stage 2 B: 56142b +1 ATK, +2 when undefended; 56173b Neighborhood Protectors (deck and discard
pile; fewer schemes than players does not stall); 56201b Guerilla Warfare; 56202b Superhero Jailbreak (after step 1,
"Place Threat", RRG "Villain Phase" p. 47; unique rule and empty deck checked above).

**New Avengers (9).** Falcon, Hercules, Goliath: Teamwork (data; RRG p. 43 and MC56 p. 9 make only the entering minion
activate, unlike MC32 and MC40), When Defeated gives the card facedown to the enemy leader as a boost card (MC56 and
RRG "Boost" p. 11), boosts read the status before giving it. 56153 Freedom Fighters (the count of resolved Boost
abilities, surge, question 10 = A with B as a switch). 56154 New Avengers (minions in the discard pile shuffled in).

**Secret Avengers (8).** Black Panther, Spectrum, 56157 (same definition as 56153), 56158 Switching Sides (surge when
no ally left play; competitive sentence a marker). 56159 has finding R1.

**Namor (8).** 56160 (he activates against you; Villainous gives his own activation a boost card, RRG p. 47). 56161
Neptune's Trident and 56162 Horn of Proteus (attach to Namor, otherwise the enemy leader; Hero Actions). 56163 Imperius
Rex! (When Revealed and Boost, including a scheme activation). 56164 Ruler of Atlantis.

**Atlanteans (3).** 56165, 56166 (different card types counted; fewer than 3 cards discards what there is, RRG "Player
Deck" p. 33), 56167 (1 per hero cards; acceleration token per different type).

**Spider-Man (5).** 56180 (see R2), 56181 Tangled Up (would-interrupt replaces the use; boost reveal when Spider-Man is
in play), 56182 Spectacular!, 56183 Neighborhood Hero (competitive sentence a marker; otherwise 2 per hero threat).

**Defenders (7).** 56184, 56185 (cooperative: no "your leader", the "Otherwise" sentence, RRG p. 31), 56186 Protect the
Innocent (the leader's tough status read before it is given), 56187 Street Defenders ("Otherwise", above), 56188 The
Defenders.

**Hell's Kitchen (9).** 56189 Daredevil (the enemy team exhausts: first player, marked; boost: the player), 56190 Iron
Fist (both sentences are competitive-only or "Otherwise"), 56191 Resistance Fighter (the minion of the enemy team's
choice; surge with no minion; +4 hit points and stalwart; boost attach), 56192 (same card as 56187), 56193 Defend Hell's
Kitchen.

**Cloak and Dagger (8).** 56194, 56195 (boost reveals the other or deals the damage or threat), 56196 Darkforce
(cooperative reading per owner question 11 = A: removes nothing, discards itself), 56197 Lightforce, 56198.

## Unproven

- **Contaminant Immunity 56175 against Steady.** Spider-Woman II and IV have Steady (RRG "Steady" p. 41: she is
  "not considered stunned" with fewer than 2 stun cards). The interrupt "When Spider-Woman would be stunned or
  confused" fires on the first stun card (stage II, Mockingbird's stun: CI discarded, tough 1, stun 0). If "would be
  stunned" means "would become stunned" CI should wait for the second card; if it means "would be given a stun card"
  (the FAQ's White Queen reading, RRG p. 63: "you are confused" instructs placing the card) the script is right. No
  ruling found; not written as a test.
- **Heroic Strike 56148 with overkill (Super-Soldier Serum attached).** "If this attack damages a character, stun that
  character": when an ally defends and the excess damages the hero, two characters are damaged. The script binds one
  (`strike.damaged`). No ruling; not tested.
- **"Exhaust a character you control" (Spectrum boost, Daredevil).** RRG "Exhausted" (p. 19): an exhausted card
  cannot be exhausted again, which may make exhausted characters invalid targets. The prompts were seen to offer
  both; a test could not stage an exhausted character at the prompt (the end-of-phase ready comes first).
- **Superhero Jailbreak's order.** The printed text discards a card for each player and then lets "each player who
  discards a minion" put it into play; the script discards and puts into play player by player. The difference shows
  only with a reset or a unique card in the middle. Not tested.
- **Darkforce 56196.** It answers any threat the attached leader places on the main scheme, not only a scheme action
  (printed: "schemes and places threat"). Today only scheme actions place threat from a leader, so no test can tell.
- **Cap's Shield by title.** `SHIELD = named("Cap's Shield")` is used by Shield Block, Shield Toss and Fearless
  Determination without the `attachment` type that `SHIELD_ON_CAPTAIN_AMERICA` has. When the hero Cap's Shield (a
  player upgrade, same title) enters the pool, RRG "Referential Ability" (p. 36) decides which is meant; add the
  type or the code then. Not testable today.
- **Wasp 56074 and the unique rule** (above).
- **Greedy games** reached no long game, no win; they show the openings are sound, not that a winnable game can be
  played to the end by the driver.

## Spec corrections owed

1. **Spec 3.5 and `secret-avengers.ts` (R1).** The "does not shuffle" decision for 56159 contradicts RRG "Search"
   p. 39 and the Hawkeye's Quiver FAQ; the spec's section on enemy-team searches should add "a search of the top N
   cards shuffles the whole deck".
2. **Spec 3.8 tests.** The Wasp case needs a seat the scenario builder cannot make today, and Mighty Avengers cannot
   be played with a resistance leader (MC56 p. 4; ruling Jan 11, 2026 R1); move the Wasp test to the registration
   pass. The Jailbreak test as written (Hercules 56151 and the ally 06011) works with any matching pair; this pass
   used Jessica Jones 56185 and 01059.
3. **Spec 3.21 (Spider-Man).** "he attacks that hero for 2; with none in play, a copy is found" is the scripted
   reading; the printed condition is "no attack was made this way" (R2).
4. **Spec 4.1 question 6 and MC56 p. 6.** MC56's rule is the grim rule ("Imagine what an opponent would do if it were
   their choice"); owner answer 6A has the first player answer a prompt marked as the enemy team's. That is a way to
   implement the grim rule, not what the rulebook says; the prompt text should tell the first player to choose as an
   opponent would, or the spec should record that 6A is an owner decision beyond the rulebook.
5. **Task and spec citations of RRG "Boost".** The RRG entry "Boost, Boost Icon" is on p. 11, not p. 9; MC56 p. 9 is
   the rulebook page for Villainous, Amplify, Steady, Ranged and Teamwork.
6. **MC56 and older rulebooks on Teamwork.** MC32 and MC40 say "each minion that shares the teamwork keyword
   activates"; MC56 p. 9 and RRG p. 43 say only the minion that just entered. The scripts and the spec follow the
   latter; no change owed, noted because the older text is in `docs/campaign-modes/markdown/`.

## Environment note

`pnpm --filter @mc/cards typecheck` fails today in files this pass did not touch:
`src/dsl/wave10-labor-reveal.test.ts`, `wave10-labor-routing.test.ts` and `wave10-labor.testing.ts` (another agent's
work in progress: `node:fs` types and `AbilityId` not exported) and `src/wave10/qa-games-registration.qa.test.ts` (the
registration QA pass, `node:fs` types). Neither of this pass's two test files has a type error; `oxlint` and
`oxfmt --check` are clean on both.
