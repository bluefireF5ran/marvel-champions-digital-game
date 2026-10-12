# Wave 10 client plan: the Civil War scenario builder, the "coming soon" notice and the rest of what the box asks of the board

Status: plan only (nothing built). Owner of the work: `game-client-engineer`. Written 2026-10-11 against
`docs/phase7-wave10.md` (the main spec, "main spec" below), `docs/phase7-wave10-box-heroes.md`,
`docs/phase7-wave10-hero-packs.md` (it exists and was read; section numbers H1 to H8), `docs/competitive-mode-plan.md`
(the "plan", its section 4 tasks 14 and 15), `docs/wave-definition-of-done.md` section 5, `docs/guided-mode.md`
section 3.14 and PLAN.md Phase 4's architecture rules. Rulebook MC56 pages are cited as "MC56 p. N".

Architecture rules this plan keeps (PLAN.md Phase 4): Phaser is a view, never an authority; every number, legality and
refusal text on screen comes from the engine, from `@mc/cards` (`playableScenarioOffer`, `playableScenario`) or from the
state; view models are plain TypeScript in `packages/client/src/view/` with Vitest tests next to them; scenes in
`packages/client/src/scenes/` stay thin (they draw a view model and hand back action strings); everything is built from
the `Mc*` widget layer over rexUI. The builder never decides what is legal: it asks the offer and shows the answer.

## 0. What exists today and what this plan changes

| Thing                    | Today                                                                                                                                                                                                                  | Wave 10 change                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Scenario pick            | `scenes/scenario-select.ts` (shelves by pack, detail panel from `view/scenario-detail.ts`), then Take your seats, then `scenes/table-setup.ts` (2,344 lines) with the modular picker `view/modular-sets.ts`            | Four ready-made rows (pack `cw`); a "Customize" action on them opens a new builder scene before seats          |
| Modular picks            | `SetupDraft.modularSetIds` (null = recommendation), capped at one number (`Scenario.modularSetCount`, rolling window if above 1); `view/modular-candidates.ts` offers every modular set of every open pack             | A range 3 to 4 and a side; a count that is a range cannot use the rolling window (see 2.4)                     |
| Optional setup choices   | `view/setup-options.ts`: action strings, `offerOf` asks `playableScenarioOffer`, `reconcileWithOffer` drops stale choices                                                                                              | Same pattern for the builder: `civil:*` action strings, offer-driven, reconciled                               |
| Extra sets on top        | `SetupDraft.extraModularSetIds` (Longshot rule, "can be included in any scenario")                                                                                                                                     | Stays, unchanged, and keeps meaning "on top, not counted" (see question 2 and 2.4)                             |
| The opponent's word      | "Villain" is written in about 25 files (`scenario-select.ts` 6 places, `scenario-detail.ts`, `table-setup-preview.ts`, `board-model.ts` "Villain · Stage I" and "VILLAIN", `log-lines.ts` 74, `guide-tips.ts` 23, ...) | One helper decides villain or leader from the card (`printedType: "leader"`, `VillainCard`), see task C1       |
| Authority tag on prompts | `view/villain-walkthrough.ts` `decisionLabel` words `firstPlayerTargets` / `firstPlayerOrders`; `scenes/choice.ts` ~1007 prints "AUTHORITY: PLAYER" / "PERIL"                                                          | A third authority, `enemyTeam` (plan task 7), worded and labelled (section 5.1)                                |
| Second decks             | `SeparateDeckPile` in `view/board-model.ts` (Doctor Strange's Invocation deck: name, deck/discard counts, a faceup top card)                                                                                           | Hercules: two facedown decks, no discard, not inspectable (section 5.3)                                        |
| Tucked cards             | `view/tucked-row-layout.ts`, `scenes/board/tucked-row.ts`, `board-model` tucked readers (wave 8 and 9)                                                                                                                 | Under a main scheme facedown (allies), under Ionic Physiology faceup with a count against 3                    |
| Game mode                | nothing                                                                                                                                                                                                                | `GAME_MODE_OPTIONS` data list; `SessionConfig.gameMode` always `cooperative`                                   |
| "New in this box"        | `view/new-in-box-model.ts` `BOXES` (core ... `cycle9`), pages from `GLOSSARY_ENTRIES` filtered by `introducedIn`; `GlossaryBoxId` in `packages/content/src/schema/glossary.ts` ends at `cycle9`                        | A `cycle10` row ("Civil War") and the "Competitive mode coming soon." line                                     |
| Pool                     | `content/pool.ts` spreads `WAVE9_SCENARIOS` (filtered through `PLAYABLE_SCENARIO_RECORDS`), `WAVE9_STARTER_DECKS`; `POOL_VERSION = poolVersionOf(POOL_CARDS)` (a hash, bumps itself)                                   | Add the four `cw` records, the box's and the two hero packs' decks and `POOL_PACKS` names; no hand-kept number |

Facts about the data that the plan relies on (read from `packages/content/src/data/cw/scenarios.ts` in the working
tree): the four records exist with `side`, `modularSetCountRange: { min: 3, max: 4 }` (still alongside the older
`modularSetCount: 4`) and `mainSchemeStages.recommended` (the printed ids `56063b/56064b`, `56096b/56097b`,
`56141b/56142b`, `56172b/56173b`), `packCode: "cw"`, cycle `cycle10` ("Civil War", order 10). Nothing in `art/` or
`music/` exists yet for the four scenario ids (the main spec says the music folders are "already named"; on disk they are
not, see section 8).

## 1. Words used on screen

- A leader is shown as "Leader" wherever the villain would be, and the screen never says "Villain" for a leader. The
  phase is still "Villain Phase" (RRG phase name; MC56 p. 6: the leader in play "works exactly as a villain").
- "The enemy team" and "the enemy leader" are printed on cards and are repeated only where a prompt is made on their
  behalf. Elsewhere the board says "Leader".
- "Registration" and "Resistance" are the two sides, always with their leaders beneath them. The ready-made scenarios
  are called by their leader ("Iron Man", the shelf header names the side), as the data does.

## 2. The scenario builder, screen by screen

### 2.1 Where it is entered

1. Scenario select (`scenes/scenario-select.ts`) lists the box's four scenarios on the "Civil War" shelf with a side
   tag (REGISTRATION or RESISTANCE, text plus a distinct icon shape, never colour alone). The detail panel
   (`view/scenario-detail.ts`) shows the leader where it shows the villain, and gains a second button beside "Play this
   villain" (renamed by the C1 helper to "Play this leader"): **"Customize this scenario"**. It exists only for a
   scenario whose offer has `mainSchemeStages` (that is, the four).
2. The shelf also carries one extra tile at its head, **"Build your own Civil War scenario"**, which opens the builder
   on the shelf's first leader. Both routes open the same scene; the second is for a player who has not picked a leader.
3. "Play this leader" is unchanged and plays the ready-made scenario exactly as printed (MC56 pp. 7 to 8). A player who
   never opens the builder never sees any of it.

### 2.2 The builder is one scene with five steps

Title: "Build a Civil War scenario". A step rail (left on desktop and tablet, a bottom segmented control on phone) lists
five steps; each shows its current pick as one line so the whole scenario is readable from the rail. Every step can be
visited in any order; Back returns to Scenario select with the draft kept for this session.

**Step 1, Side.** Two large cards, "Registration" and "Resistance", each with the two leaders' names beneath it and the
rulebook's own one-line description of the side if the content carries one (never invented copy). Default: the side of
the scenario the player came from, or Registration. Choosing the other side changes the leader (to that side's first
leader, in the offer's order) and resets everything below to that leader's ready-made picks; if the player had changed
anything the scene says so once in the status line ("Changed to Resistance. Picks reset to Captain America's
ready-made scenario.") rather than silently discarding work.

**Step 2, Leader.** Two leader cards for the chosen side (Iron Man, Captain Marvel / Captain America, Spider-Woman), each
showing the leader's stage I and II hit points per player as printed (`view/scaling-text.ts` and the offer's data, not
scaled; the same rule as Scenario select's detail) and, in Expert, the note "Expert uses leader stages III and IV". The
leader's own encounter set is shown as a fixed, always-in row ("Iron Man set, 10 cards"), as modular-sets.ts draws
"required" cards. Choosing a leader sets the defaults: **that leader's ready-made stages and four modular sets**.

**Step 3, Main scheme.** Two single-choice rows of four stage cards each (a small card face from the card art pipeline
with the generated frame when a scan is missing, name, target threat per player and its printed "Setup" or "Hinder"
text in a one-line gist from the offer). Row 1: "Stage 1 (it goes on top)"; row 2: "Stage 2". Exactly one in each row
is always chosen (the recommendation by default), so there is no "none" state and no way to pick two. Tapping a card
selects it; long-press or the Inspect button opens the existing Inspect overlay (`scenes/inspect.ts`) on that stage's
card. Beneath the rows a summary sentence: "Public Outrage, then No Going Back." Stages of the other side are not in the
rows (the offer lists only this side's four per number), so the "wrong side" case cannot occur here.

**Step 4, Modular sets.** A grid built with the existing plan (`view/modular-grid-plan.ts`, scroll region and the tile
look of `table-setup.ts`): each tile has the set's name, real card count and dominant-type word (`descriptorForSet`),
exactly as the D05 correction asks. Sections, in this order:

- "Registration sets" (or "Resistance sets"): the side's eight sets, the leader's own recommended four first and marked
  "Recommended".
- "Other products": the modular sets of every unlocked pack from `view/modular-candidates.ts` (Core's five, and so on)
  that carry no side. Under question 2's default A they count toward the three or four.
- "The other side's sets" (collapsed by default, one row: "8 sets from the Resistance are not used with Iron Man"): when
  expanded the tiles are disabled and show the offer's refusal text, for example "Heroes for Hire is a registration
  set; Captain America leads the resistance (MC56 p. 4)". Nothing is hidden outright (the project's "dashed, not
  omitted" convention, `modular-exclusions.ts`), and the main spec's sketch of "hides the other side's sets" is met by
  the default collapse. A keyboard or pad user can reach the tiles and hear/read the reason.
- A counter line above the grid: "3 to 4 sets. Chosen: 4." with the engine's problem text when out of range.
  Selecting: tap toggles. Below three chosen, Start is disabled and the line reads the engine's text, "uses 3 to 4
  modular sets, got 2" (shown verbatim from `checkModularPickCount`'s problem). At four chosen, the unchosen tiles turn
  disabled with the reason "Four is the most (MC56 p. 4)" rather than rolling the oldest pick out (the rolling window
  in `modular-sets.ts` suits a cap of one, and is surprising for a 3 to 4 range). To swap, deselect first. A pick
  outside the range can only arise through a draft restored from an older session; the same engine text appears.
  Extras on top (the Longshot row, `extraModularSetIds`) stays under the grid as "Extra sets (not counted)", unchanged.

**Step 5, Review and play.** Reads like the table-setup preview (`view/table-setup-preview.ts`): the leader and its
stage line, the two main scheme stages, the leader's set, the Standard set (the Expert set in Expert), the chosen modular
sets, and the totals the offer returns (encounter deck size, if the offer provides it). A line says whether it is
"Ready-made" or "Custom". Buttons: **Continue to heroes** (to Take your seats, then Table setup), **Preconstructed**
(reset to the ready-made scenario for the current leader, same side), **Random** (2.5) and **Back**. Below them the
game-mode row (section 4): "Cooperative" (selected, enabled) and "Competitive, coming soon" (disabled).

Difficulty is not a builder step: it stays on Table setup where every scenario has it. The builder shows the difficulty's
effect as a note only (Expert: stages III and IV, the Expert set). The draft already carries `difficulty`.

### 2.3 What the defaults and the resets are

- Opening for a leader: side, leader, stages and four sets equal that leader's record (`mainSchemeStages.recommended`,
  `recommendedModularSetIds`). `isPreconstructed` is computed by comparing the picks to the record as sets (order of
  sets does not matter; stage order is fixed by number), so picking back to the recommendation reads "Ready-made" again
  and the engine's own record is the source of truth.
- "Preconstructed" restores that. It is enabled only when the picks differ.
- Changing leader or side always resets stages and sets (the recommendation of a different leader would be wrong for
  the old picks), with the status-line notice.

### 2.4 Validation and messages (all from the engine or the offer)

| Situation                                   | What the player sees                                                                                                                   | Source                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Fewer than three sets                       | Start disabled; counter line "uses 3 to 4 modular sets, got 2"                                                                         | `checkModularPickCount` text, via the offer                                   |
| Four chosen, player taps a fifth            | The fifth tile is disabled with "Four is the most"; nothing changes                                                                    | the range from the offer's `modularSetCount`                                  |
| A set of the other side                     | Disabled tile in the collapsed group with the refusal text                                                                             | `modularPickProblem` text, via the offer (see 2.7)                            |
| A stage not of this side / two of a kind    | Cannot be made in the UI; if a restored draft holds one it is dropped with a notice and the recommendation returns                     | `chooseMainSchemeStages`, via the offer                                       |
| Competitive tapped                          | Nothing changes; the focus stays; the status line repeats "Competitive mode is coming soon. Play this scenario cooperatively for now." | `view/game-mode-options.ts`; same sentence as the engine's `mode_unavailable` |
| Engine refuses at Start (should not happen) | The existing setup error line on Table setup; the message is the engine's, never reworded                                              | `SessionConfig` -> `createGame`                                               |

The scene never counts, never checks sides and never checks stage membership; it renders `view.problems` and the
per-tile `disabledReason` from the view model, and those come from the offer. The count-in-range rule exists once, in
`@mc/cards`.

### 2.5 The Random button

"Random" asks `randomCivilWarScenario(seed, { side?, leaderId?, modularCount? })` (main spec 3.3) and loads the result
into the builder as an ordinary pick, so the player sees it and can still edit anything (and "Preconstructed" still
resets). What it randomizes: side, leader, stage 1, stage 2 and the modular sets, in that fixed order; the player's
pins carry through. A small lock toggle sits on Side and Leader (and a "Sets: 3 / 4" stepper, default 4, question 9 of the
main spec): a locked side or leader is passed as `side` / `leaderId`, the stepper as `modularCount`. Stages and sets
cannot be locked (they are what is being drawn). The seed is the draft's seed, advanced one step per press (the client's
`view/seed.ts` already owns the seed text), so "Random" twice gives two different scenarios and the same seed gives the
same scenario (the test pins this). It draws only from scripted playable sets (the function does this, not the client).

"Random and blind" (second button, only beside Random) does the same and sets `blind: true` (2.6). The result view shows
the leader and side only: "Stage 2: hidden", "Modular sets: 4 hidden", with a "Show me" toggle that clears `blind` and
shows them (a player who changes their mind loses nothing).

### 2.6 Played blind (a presentation of known state)

MC56 p. 5: players "won't know all the cards in the encounter deck or what main scheme abilities to expect". The engine
hides nothing (main spec 3.3), so the client adds a `blind` flag to the session config (additive, 2.9) and hides:
the builder review lines; Table setup's preview and the Pause panel's scenario sheet (`view/pause-model.ts`, the
encounter-set list); `view/encounter-preview.ts` (the deck-contents preview); the main scheme card's other stages in
Inspect (a stage not yet reached shows its back); the main scheme stage pips' names in `view/board-model.ts` for stages
after the current one; log lines that list the picks at setup. A set is revealed in those lists the first time a card of
it is revealed (derived from the log, so no new state is stored). The client's honest limit: a player who opens the save
or reads the log can still see the picks; blind play is a courtesy to the player at the table, as the rulebook's method
is.

### 2.7 What the offer must carry (a request to `@mc/cards`, task C0)

The main spec 3.1 promises `playableScenarioOffer` gains `mainSchemeStages`, a ranged `modularSetCount` and `sides`. The
builder needs a little more, listed here so the cards agent adds it once and the client never reads card data to fill
the gap:

- `sides`: for each side, its leaders (scenario id, display name, the leader card id for the art), in order;
- `mainSchemeStages`: per stage number, each option's `printedCardId`, name, target threat (a `ScalingValue`) and a
  one-line gist (the setup or hinder text trimmed to the card's first sentence), plus the recommendation;
- `modularSetCount: { min, max }` and the exact problem strings for out-of-range counts;
- `modularSets`: every candidate set the builder may show with its `side` (or none), card count, descriptor, and either
  `ok` or a `problem` string (the other side's reason, "Four is the most" is the client's, from the range). The existing
  `modular-candidates.ts` stays the source of which neutral sets are unlocked; the offer states legality only;
- `randomCivilWarScenario` exported from the same index.

If the cards agent prefers the client to call `modularPickProblem` per tile, that is equivalent; what the client may not
do is compare `side` fields itself.

### 2.8 Phone, tablet and desktop

- **Phone** (`formFactorFor` in `view/layout.ts`): one step per screen, a bottom step bar (five dots with labels on
  press), Next and Back at the foot, the modular grid two tiles wide in a scroll region (grid plan already handles
  height), Start and Random in a sticky foot. Stage cards stack two by two. Touch targets 44 px minimum
  (`tokens.ts`). The collapsed "other side" row is a single line.
- **Tablet**: the rail on the left with step lines, the active step on the right; the stage rows are one row of four.
- **Desktop**: the rail as in tablet but the review (step 5) is also a persistent right column, so every change is
  visible as it is made; modular grid four to five tiles wide.
- Text never below the type roles in `tokens.ts` (`typeRole.label` smallest); a tile name that does not fit wraps to two
  lines before it is cut. Layout is a pure function in `view/civil-war-builder-layout.ts`, tested at the three sizes.

### 2.9 Keyboard, pad and screen reader

- Every control is an action string, as `setup-options.ts`: `civil:side:registration`, `civil:leader:<scenarioId>`,
  `civil:stage:1:<printedCardId>`, `civil:stage:2:<printedCardId>`, `civil:set:<setId>`, `civil:sets:count:3|4`,
  `civil:random`, `civil:random:blind`, `civil:reset`, `civil:lock:side|leader`, `civil:mode:cooperative`,
  `civil:mode:competitive`, `civil:next`, `civil:back`. The view model returns the focus order as a list of these
  strings (`view.focusOrder`); the scene hands focus to `view/focus.ts` and `view/screen-focus.ts`, the same stops list
  every other screen exposes, and the rows are single-choice groups: arrow keys move inside a group, Tab moves between
  groups, Enter selects, Escape goes Back. Pad: D-pad inside a group, shoulder buttons between steps, A select, B back
  (`view/gamepad.ts`). Disabled tiles stay focusable and read their reason (they are not skipped).
- Selection and disabled state are never colour-only: a check mark and a thick border for chosen, a hatched fill plus the
  lock glyph for disabled, a side icon shape for the two sides.
- **Screen readers.** The client has no DOM mirror of the canvas today, so there is no existing screen reader support
  to extend, and this plan does not invent one. What it does: the model keeps a single plain-English `statusLine` ("Iron
  Man, Cut Off Support then Negative Zone Prison, 4 modular sets chosen of 3 to 4.") that is drawn in a fixed status strip
  and exposed on the debug hook (`__mcBuilderDebug`) for tests. A shared visually hidden live region for the whole app
  would be the proper fix and is listed as out of scope (not built in this wave) so it is not forgotten.

### 2.10 What leaving the builder does

Continue writes the picks into the `SetupDraft` (6.5) and goes to Take your seats. Table setup
for a `cw` scenario no longer shows the modular picker: it shows the builder's summary as a read-only card with an
"Edit scenario" button that returns to the builder (the stage and set picks are not changed on two screens). Difficulty,
seed, first player and the rest of Table setup behave as for every scenario.

## 3. Where the client is wired to the new scenarios

- `packages/client/src/content/pool.ts`: spread the four `cw` records through the same
  `PLAYABLE_SCENARIO_RECORDS.filter(...)` line as wave 9 (so an unscripted card keeps a scenario out until it is
  scripted), the box's and the two hero packs' starter decks, and `POOL_PACKS` names for `cw` and the hero packs'
  codes. `POOL_VERSION` is a hash of the card data; it bumps itself when the cards land, and must be changed by nobody by
  hand (the doc comment above it records which wave moved it; add wave 10's line).
- `packages/client/src/progression/unlocks.ts`: a new `UNLOCK_WAVES` row for `cycle10`. The gate and the hero rewards
  are a product decision (question 4). A new box needs its `GlossaryBoxId` (`packages/content/src/schema/glossary.ts`),
  its `BOXES` row and its unlock key, all `cycle10`.
- `@mc/cards` `playable/index.ts`: `playableScenario` gains a `wave10Playable` branch next to `wave9Playable` (cards
  agent, task C0); the client calls it through `engine/session-core.ts` `scenarioFor` with the new options.
- `view/modular-candidates.ts`: for a `cw` scenario the candidate rule is the offer's, with the side filter; the file
  keeps serving the "Other products" section.

## 4. The "coming soon" notice

### 4.1 Where it lives

One data list, `GAME_MODE_OPTIONS` in new `view/game-mode-options.ts`:

```ts
[
  { id: "cooperative", label: "Cooperative", enabled: true },
  { id: "competitive", label: "Competitive", enabled: false, note: "Coming soon" },
];
```

It is read in two places and nowhere else (so enabling it later is flipping one field, plan task 15):

1. **The builder**, step 5 (and visible from step 1 on desktop in the review column): a labelled row "Game mode" with
   the two options as a radio pair; "Competitive, coming soon" is greyed, hatched, focusable, announces its reason, and
   cannot be selected. Its one-line reason sits under it.
2. **The box's "New in this box" page** (`view/new-in-box-model.ts`, `BOXES` row `cycle10`, page drawn by
   `scenes/new-in-box.ts`): a plain line under the Scenario mechanics group: "Competitive mode coming soon." It shows
   even when no mechanic is tagged yet, so the page exists as soon as the box is unlocked (the box page is built from
   `GLOSSARY_ENTRIES`; this line is the box row's own `notice`, a new optional string field on `BoxDef`).

It is also appropriate (not required) on the Scenario select detail panel of a `cw` scenario as one muted line, since a
player looks for a two-team option on the scenario screen; this is the third place and uses the same data, so it is one
line of scene code. The notice is never an error colour and never a toast; it is a normal disabled option.

### 4.2 Exact wording options

The plan (task 15) gave "Competitive mode, Coming soon" and "Two teams face each other's leaders. Not available yet.";
the engine's refusal text is "Competitive mode is coming soon. Play this scenario cooperatively for now." Options:

- **A (recommended):** option label "Competitive" with the tag "Coming soon"; reason line "Two teams, each against the
  other's leader. Not available yet."; box page line "Competitive mode coming soon."
- **B:** label "Competitive (coming soon)" in one string; reason "Two teams face each other's leaders. Not available yet."
  (the plan's text); box page line the same.
- **C:** like A but with "Co-op only for now" on the cooperative option to explain why there is a choice at all.

A is built. Under all three the box page line is exactly "Competitive mode coming soon." (the owner's words of
2026-10-11). The reason line says what the mode is, from MC56 p. 14 in one sentence, not a rulebook paragraph.

### 4.3 How the mode reaches the engine

The client always sends `gameMode: "cooperative"` (explicitly, so a future default change cannot flip a saved
meaning). `SessionConfig.gameMode?: "cooperative"` is additive and, like `modes`, absent in old saves (absent =
cooperative). The type of the client field is the literal `"cooperative"`, so a competitive config cannot be
constructed in client code: a future enabling is a type change in one line and a flip of `enabled`. The engine's
`mode_unavailable` error is still handled (Table setup's existing setup-error line shows its text), though the option
being disabled means it cannot be reached from the UI.

## 5. What else the specs say the client owes

### 5.1 Prompts made on behalf of the enemy team (main spec 3.5, plan task 7)

The pending choice carries `authority: "enemyTeam"` and is addressed to the first player (question 6 of the main spec,
default A). The client:

- `view/villain-walkthrough.ts` `decisionLabel` gets the case: yours: "As first player, you choose for the enemy team";
  not yours: "<Name> chooses for the enemy team as first player".
- The choice sheet header (`scenes/choice.ts`, the generic sheet and the attack sheet's tag at ~1007) shows a tag
  "ENEMY TEAM'S CHOICE" in place of "AUTHORITY: PLAYER", an icon shape (a flag outline) and the one-line instruction the
  engine provides ("Choose as the enemy team would."). Under it a "Why?" disclosure with the grim rule quoted from MC56
  p. 6 exactly: "Imagine what an opponent would do if it were their choice." The source card is shown by
  `view/choice-source-panel.ts` as for every choice (its name and text are already there).
- A choice with one candidate has no prompt (the engine does that), so the client adds nothing for it, but the log line
  says it happened (5.7).
- A cooperative prompt that is not the enemy's looks as it does today. If question 6 is answered B or C the engine's
  chooser changes and this label's authority string is the only thing that follows it.

### 5.2 The leader and its boost cards

- Frame and wording: `printedType: "leader"` draws the villain frame with the type line "Leader" (generated frame
  `art/card-face.ts`, a one-word label change), and the board's villain panel title is "Leader" (C1).
- Minions given to the leader as facedown boost cards (main spec 3.10): the leader's panel shows a facedown card back
  with a count badge "n boost cards waiting" (`boostCount` already exists for instances in `board-model.ts`; the
  panel reads it, and the text states "turned up at the next activation, in addition to the one dealt", RRG p. 11).
  The face is not shown; the log line says which card was given (it was seen when defeated).
- Targets and threat on the main scheme with defeated allies under it: see 5.4.

### 5.3 Hercules: the Labor and Gift decks (hero-packs H2.2, H3.1, H5)

- Two small facedown decks beside Hercules's identity, labelled "Labor" and "Gift", each with a count. They reuse
  `SeparateDeckPile` (`board-model.ts`) with two new fields: `inspectable: boolean` and `owner` (the per-pile wording
  "Hercules's Labor deck"). With `topCardFaceup: false` and `discardPile: "none"` the pile has no top face and no discard
  count; Inspect on it opens a small sheet reading "Facedown. No one may look at it." plus the count, not the cards
  (`view/hidden-reverse.ts` already stops at hidden information; it is the model here too).
- The action to reveal a Labor card ("New Labors of Hercules"): shown on the identity as any action. Its unavailable
  reasons ("only in alter-ego form", "a Labor card is in play", "the Labor deck is empty") are the engine's refusal
  messages, mapped to a short tag by a table with a test that lists every engine message (the pattern of
  `view/hand-reason.ts`); the client invents none.
- A Labor card in play is marked "Hercules's Labor" with a small badge (an owner label, plus the labor counters via the
  existing counter reader `board-model-counters`), on the minion or side scheme it attached to, or in Hercules's area;
  Labor cards in the victory display are listed there. The find prompt (H3.4) lists candidates "in the encounter deck",
  "in the discard", "in play" as a text suffix per option so the area is known without colour.
- Gift cards are permanent upgrades; the count of Gift cards he controls is shown on the cards that read it
  (a corner badge from a value the engine exposes, below).

### 5.4 Defeated allies facedown under the main scheme (main spec 3.15)

Tucked cards already render (`tucked-row-layout.ts`); here they render as card backs in a row under the main scheme
panel with the label "Defeated allies, facedown: 2". The scheme's target threat is read from the state as every
other scheme value is (the engine applies the "reduce by 1 for each facedown card"); the main scheme panel shows the
current target with the contribution as text, "Target 9, 2 facedown, now 7", where the pieces come from the state's
printed target and its modifiers list if the board model exposes them; if not, the panel shows the final number
and the count and the arithmetic is not displayed (the client never subtracts). Whether a player may look at their own
facedown ally is the engine's visibility answer (`faceVisible`); Inspect follows it.

### 5.5 Wonder Man (hero-packs H2.1, H3.12 to H3.14)

- Ionic Physiology beside the identity with its tucked cards fanned faceup under it, a count "2 of 3" and the ATK bonus
  on the hero panel (the ATK on the panel is already the state's number; the bonus note is the upgrade's own text). This
  is the tucked row in a new place: `tucked-row.ts` takes the host card, a maximum, and the card faces.
- The pay prompt (`view/payment-model.ts`, `scenes/board/payment-bar.ts`): shows "Overpaid by 2 (1 energy, 1 mental)" for
  an overpay-reading card, and Mr. Hollywood as an option that appears only once the engine's payment query says the
  cost is covered. An X cost is chosen before paying (the `any-number-cost.spec.ts` flow). **What the client can show:**
  the engine's overpaid amounts by type from the payment query (a field to request from the engine agent, task C14),
  and the card's printed text with its overpay line highlighted. **What it cannot:** compute "what the card will do with
  it" itself; if the card needs that said, a one-line note comes from a `how-this-works` entry (static, keyed by card id).
- Coordinated Effort (any player helping to pay): the payment sheet shows a helper's contribution as its own line
  "Helped by <name>: 1 energy" taken from the payment query's per-source breakdown (a field to request).

### 5.6 Hulkling and Tigra (box-heroes B2)

The box-heroes spec names no client work beyond ordinary cards. Two small readability items, both from state:

- The Shapeshift upgrade in play is marked "Current shape" (a tag from the `SHAPESHIFT` trait, which the client reads as
  data; not a rule), and when a new shape enters play the other shapes' discard shows in the log and the existing
  discard beat. Teddy Altman's refusal to play a second shape is the engine's refusal message on the hand card
  (mapped like 5.3's reasons).
- Tigra: the engaged minion count is the state's; nothing to add. Hunted's additional cost (take a minion from the
  encounter deck or discard) uses the find prompt of 5.3 (area suffix).

### 5.7 New log lines (`view/log-lines.ts`; one test row each)

The lines are written from the events the engine adds; the exact event names are theirs (`game-rules-architect`), the
wording is here:

- boost card given: "Falcon was given to Captain America as a facedown boost card." (voice: scenario)
- ally tucked: "Black Panther was defeated and placed facedown under Negative Zone Prison."
- enemy team choice: "The enemy team (decided by Ana) chose Stark Tower."; the one-candidate case: "The enemy team found Stark Tower."
- Labor revealed / put on the bottom / reaches the victory display; Gift put into play: "Hercules: Atonement puts Gift
  of ... into play."
- tucked under Ionic Physiology / discarded by the basic attack.
- a card gives heroes the Unregistered trait / "Hunting Rebel Heroes deals 2 damage to Jones."
- shapeshift: "Winged Shape enters play; Hulk Shape is discarded and Hulkling readies."

### 5.8 Art and music slots (`art/README.md`, `music/README.md`)

- `art/scenarios/<id>/` for `registration-iron-man`, `registration-captain-marvel`, `resistance-captain-america`,
  `resistance-spider-woman`, each with `villain.<ext>`, `villain-wins`, `villain-loses` (file names use "villain" even for
  a leader; the lookup is the scenario id, and the README gets one sentence saying so) and optionally `intro`.
  Create the four folders with `.gitkeep`; a missing picture is a supported outcome.
- `music/scenarios/<id>/` with `battle`, `villain-wins`, `villain-loses`, and `TRACK_TITLES` entries
  (`progression/extras.ts`) in the same commit as the tracks (the test requires every path to have a title and vice
  versa). Neither folder exists on disk today.
- Heroes: `art/heroes/<identityId>-<slug>/hero.<ext>` for Wonder Man, Hercules (and Tigra, Hulkling).
- Team-Up art: `art/teamups/hercules-thor/splash.*` and `badge.*` (the pair slug is the two names lowercased and
  sorted), a row in `docs/team-ups.md` ("Ancient Rivalry", 59026, pack of Hercules, no pictures yet), and the item on
  the wave PR's "Content to add" list. The client needs no code for it.

### 5.9 Guided mode (guided-mode.md section 3.14, wave-definition-of-done section 5)

New things a player cannot learn from the Core lessons: the enemy team, "your leader" alternates, playing Civil War
cooperatively, tucking facedown under a scheme, boost cards given to the leader, the Labor and Gift decks, Wonder Man's
Ionic Physiology and overpaying, Shapeshift, Unregistered. For each:

- glossary entries in `@mc/content` `GLOSSARY_ENTRIES` with cites and `introducedIn: "cycle10"` (the new
  `GlossaryBoxId`); the plan's task 14 entry "Playing Civil War cooperatively" is one of them; "Teamwork" the player
  event (59021) and the Teamwork keyword are two entries with distinct ids (hero-packs H5);
- `situation:<mechanic>` opportunistic tips in `view/guide-tips.ts` (Full only, once each): enemy-team prompt first
  shown, a Labor card first revealed, first tuck under Ionic Physiology, first overpay;
- "How this works" lines in Inspect (`view/how-this-works.ts`) for tricky wording: "the enemy team", "your leader",
  Appeal to Athena's count of 0, overpaid;
- Try-it lessons for a hero-defining mechanic (`guide/mechanic-tryits.ts`, `mechanic-tryit-config.ts`,
  `mechanic-lessons.ts`): Hercules (a Labor to a Gift) and Wonder Man (tuck, spend with a basic attack); the pages list
  under the box's "New in this box" page;
- the `BOXES` row `{ id: "cycle10", name: "Civil War", unlockKey: "cycle10" }` (the heroes' pages share it).

## 6. View models to add or extend, with their tests

All in `packages/client/src/view/`, plain TypeScript, no Phaser import.

### 6.1 `civil-war-builder-model.ts` (new): `civil-war-builder-model.test.ts`

State: `CivilWarDraft { side, leaderScenarioId, stageIds: [string, string], modularSetIds, blind, seed, locks }`.
Functions: `openBuilder(scenarioId | undefined, offer)`, `applyAction(draft, action, offer)`, `builderViewOf(draft,
offer, difficulty)` returning `{ steps, problems, sets sections, focusOrder, statusLine, canContinue,
isPreconstructed, summary lines, modeOptions }`, `draftToSetup(draft)`.

Tests (cases, using a stubbed offer matching the cards agent's shape; the live-offer integration case is in e2e):

1. Defaults per leader (4 cases, parameterized): the four ready-made records give side, stages and four sets equal to the
   record; `isPreconstructed` true.
2. Changing leader within a side resets stages and sets to the new leader's record and sets a status-line notice (1).
3. Changing side picks that side's first leader and resets (1); changing to the same side/leader changes nothing and has
   no notice (1).
4. Stage pick replaces within its number; there is no way to hold zero or two; stage order in the output is 1 then 2 (3).
5. Set toggling: 2 chosen: `canContinue` false and `problems[0]` equals the offer's range text (1); 3: ok (1); 4: ok and
   every unchosen tile has `disabledReason` "Four is the most" (1); a fifth toggle changes nothing (1); deselect then
   select swaps (1).
6. Other-side sets: every one appears in the collapsed group, disabled, with the offer's refusal text; none selectable by
   an action (a `civil:set:<otherSideId>` action returns the same draft) (2). Neutral sets from other products are
   selectable and count (1) (question 2's default; the B reading is a one-line change and its test is ready in the file
   as a skipped case named for question 2).
7. "Preconstructed": enabled only when the picks differ; restores exactly; set order irrelevant to `isPreconstructed` (3).
8. Random: applies the result of the cards function stub; pinned leader stays (1); pinned side stays (1); set count
   stepper passed through (1); same seed gives same draft and the next press gives the next seed (1); "Random and blind"
   sets `blind` (1).
9. Blind: summary lines hide stage 2 and the set names ("hidden") and show the leader; "Show me" restores them (2).
10. Game mode: `modeOptions` is exactly `GAME_MODE_OPTIONS` (1); `civil:mode:competitive` leaves `mode` cooperative and
    leaves the status line with the engine's sentence (1); `draftToSetup` for each of the 4 ready-made records contains
    `gameMode: "cooperative"` and never "competitive" (4, parameterized).
11. Expert note appears only when difficulty is expert (1); the leader line reads "Leader", never "Villain" (1).
12. Focus order contains every enabled control once and each disabled tile (other-side, over-count) exactly once, and
    the action strings round-trip through `applyAction` without throwing (2).

### 6.2 `civil-war-builder-layout.ts` (new): `civil-war-builder-layout.test.ts`

Pure geometry for phone, tablet and desktop. Cases: the step rail, the stage rows (4 cards in a row on tablet and
desktop, 2 by 2 on phone), the grid width in tiles, the foot buttons; nothing overlaps; every touch target at least
44 px on phone; the layout fits within 360 x 640 (a small phone), 768 x 1024 and 1280 x 720 without clipping (3 sizes x
3 checks = 9); the grid plan height grows with the set count and the region scrolls (1).

### 6.3 `game-mode-options.ts` (new): `game-mode-options.test.ts`

The list has exactly 2 entries (1); `competitive` is disabled with the label "Coming soon" (1); `selectMode(draft,
"competitive")` returns the draft unchanged (1).

### 6.4 `foe-words.ts` (new): `foe-words.test.ts`

`foeWord(card | scenario)` returns "Leader"/"leader" for a `printedType: "leader"` villain card and "Villain" otherwise.
Cases: Iron Man (leader) (1), Rhino (1), a multi-villain scenario (Breakout) says "villains" (1), a `bySetup` scenario
whose villain is not yet known keeps its existing wording (1), "Villain Phase" is never changed (1), plural forms (1).
Existing tests that assert the word "Villain" for villains stay green (the sweep adds, never replaces, behaviour for
non-leaders).

### 6.5 `setup-draft.ts` (extend): `setup-draft.test.ts`

Add `civilWar: { stageIds, blind } | null` to `SetupDraft`; `toSessionConfig` sends `mainSchemeStageIds`, `blind` and
`gameMode: "cooperative"` only for a scenario with a side; `reconcileWithOffer` drops stale stage ids. Tests: the
existing byte-for-byte round trip still holds for every non-`cw` scenario (the new fields are absent, 1 parameterized
over three scenarios); a `cw` draft round-trips (1); `setScenario` to a non-`cw` scenario clears `civilWar` (1); `setScenario` to another leader resets the picks (1); stage ids of
the wrong side are dropped by `reconcileWithOffer` (1); `modularSetIds: null` still means the recommendation (1).

### 6.6 `view/modular-sets.ts` and `view/modular-candidates.ts` (extend)

The cap becomes `{ min, max }`. Keep the one-pick behaviour byte-for-byte for a cap of 1. Tests: the existing suite
unchanged and green; plus a range 3 to 4 case in the builder's own tests above (the builder calls the grid helpers for
the "Other products" section; the rolling window is not used for a range). `modular-candidates.test.ts`: a `cw`
scenario's candidates exclude none by side in the "Other products" list (neutral sets only) (1).

### 6.7 `view/villain-walkthrough.ts` `decisionLabel` and `view/highlights.ts` (extend)

`ChoiceLike.authority` gains `"enemyTeam"`. Cases: yours (1), another seat's (1), the grim-rule text constant equals
MC56 p. 6's sentence exactly (1), the authority string for the log line (1). Existing authority cases unchanged.

### 6.8 `board-model.ts` (extend): `board-model-civil-war.test.ts`, `board-model-separate-decks.test.ts`

- Leader flag and word on the foe panel (1); facedown boost count on the leader (1); defeated allies facedown under the
  main scheme listed as backs with a count (1); target threat shown is the state's number (1).
- Separate decks: a Labor and Gift pair give two piles, `inspectable: false`, no top, no discard count (2); the
  Invocation deck is unchanged (1); a Labor attachment in play carries an owner badge (1); an empty Gift deck shows 0 (1);
  Labor cards in the victory display listed (1).
- Ionic Physiology: tucked cards faceup with `count` and `max` 3 (1); the hero's ATK is the state's (1).

### 6.9 `new-in-box-model.ts` (extend): `new-in-box-model.test.ts`

`BOXES` has the `cycle10` row (1, the existing test that checks names against the unlock path covers the name); the page
contains "Competitive mode coming soon." exactly once (1); a locked box has no page (1); the notice is not added to any
other box (1); the existing 51-row loop over `BOXES` still passes.

### 6.10 `scenario-detail.ts`, `table-setup-preview.ts`, `scenario-select-layout.ts` (extend)

Leader wording and side tag (4: Iron Man, Cap in preview and detail, Rhino unchanged); the "Customize" action exists only
for scenarios whose offer has `mainSchemeStages` (2); the detail shows the one muted competitive line (1).

### 6.11 `log-lines.ts` (extend): `log-lines-wave10.test.ts`

One test per line in 5.7 (about 8), and a test that an unknown event still falls through to the generic line.

### 6.12 `engine/host.ts` `SessionConfig` and `engine/session-core.ts`

Additive: `mainSchemeStageIds?`, `gameMode?: "cooperative"`, `blind?`. Tests in `session-core` suite: a config with the
fields starts a game whose `mainScheme.stageOrder` matches; the same config without them starts the old game; replay of
a stored log with the fields reproduces the state hash (3).

## 7. Components reused, and what changes in each (by file)

| File                                                                                                                      | Reused for                                        | Change                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `scenes/scenario-select.ts`, `view/scenario-detail.ts`                                                                    | the four scenarios on a shelf                     | side tag; "Customize" button and the builder tile; "Play this leader"; detail panel leader wording; search placeholder |
| `view/scenario-select-layout.ts`                                                                                          | panel geometry                                    | room for a second button on phone                                                                                      |
| `scenes/table-setup.ts` (do not grow it)                                                                                  | preview, difficulty, seed, seats                  | for `cw`, replace the modular section by a read-only summary and "Edit scenario"; nothing else (it is 2,344 lines)     |
| `view/table-setup-preview.ts`                                                                                             | "the game you'll get"                             | leader wording; blind masking                                                                                          |
| `view/modular-sets.ts`, `modular-grid-plan.ts`, `modular-candidates.ts`, `modular-exclusions.ts`                          | tile data, grid geometry, candidate rule, reasons | range cap; builder calls these helpers; no copy of their logic in the builder                                          |
| `view/setup-draft.ts`, `setup-options.ts`                                                                                 | the draft and the offer-driven options pattern    | section 6.5; the builder follows the `offerOf` / `reconcileWithOffer` / action-string pattern                          |
| `scenes/inspect.ts`, `view/inspect-model.ts`                                                                              | reading a stage card                              | blind hides unreached stages; shows only this scenario's two chosen stages (not the card's eight)                      |
| `view/focus.ts`, `screen-focus.ts`, `gamepad.ts`                                                                          | keyboard and pad                                  | none; the builder supplies stops                                                                                       |
| `view/layout.ts` (`formFactorFor`)                                                                                        | phone/tablet/desktop                              | none                                                                                                                   |
| `scenes/choice.ts`, `view/villain-walkthrough.ts`, `view/highlights.ts`, `view/choice-source-panel.ts`                    | choice sheet and authority label                  | enemy-team tag, label, grim rule disclosure (5.1)                                                                      |
| `view/board-model.ts`, `scenes/board/zones.ts`, `tucked-row.ts`                                                           | zones, separate decks, tucked cards               | leader flag; facedown boost badge; Labor/Gift piles; tucked under scheme facedown; tucked under an upgrade with max    |
| `view/payment-model.ts`, `scenes/board/payment-bar.ts`                                                                    | the pay prompt                                    | overpaid amounts, helper line, the "covered" gate on Mr. Hollywood (all from the engine query)                         |
| `view/new-in-box-model.ts`, `scenes/new-in-box.ts`                                                                        | the page per box                                  | `cycle10` row, `notice` field                                                                                          |
| `view/log-lines.ts`, `view/guide-tips.ts`, `view/how-this-works.ts`, `guide/mechanic-tryits.ts`                           | log and Guided mode                               | section 5.7 and 5.9                                                                                                    |
| `art/card-face.ts`                                                                                                        | generated frame when a scan is missing            | the "Leader" type word                                                                                                 |
| `content/pool.ts`, `progression/unlocks.ts`                                                                               | the pool and the unlock path                      | section 3                                                                                                              |
| `engine/host.ts`, `engine/session-core.ts`, `engine/game-record.ts`, `view/save-data-model.ts`, `view/game-over-model.ts` | config and saves                                  | additive fields; the "Custom" label (section 9)                                                                        |

## 8. Things the specs say that the client cannot do as written (and what it does instead)

1. **"The builder's picker is built from the offer and never from card data."** The offer as specified lacks the leaders,
   per-set side and refusal texts, stage gists; section 2.7 lists what to add. Until then the client cannot build the
   screen without reading card data, which the plan forbids.
2. **"Hides the other side's sets."** The project convention is to show a refused pairing disabled with a reason, not
   omit it. The plan collapses the group by default (question 2).
3. **Blind play "nothing in the engine hides them".** True, so the client hides picks in about six places (2.6), but the
   save and the log still contain them. It is a courtesy, not secrecy; the spec's own wording ("a client presentation")
   accepts that.
4. **Wonder Man: "the pay prompt shows what the card will do with the overpay."** The client will not compute card effects.
   It shows the overpaid amounts by type from the payment query and the card text; the effect sentence would need a
   static `how-this-works` line (5.5).
5. **Hercules: "the Gift count with the reason while Appeal to Athena is in play."** The count and the reason must come
   from the engine (a readable value and a reason string, or the client names the in-play obligation from the state as a
   fact, not a rule). Requested in task C13.
6. **Music folders "already named by the four scenario ids"** do not exist on disk (neither `music/scenarios/<id>/` nor
   `_pending`); nothing is playable from them yet. Art likewise. The plan creates the slots; the owner supplies files.
7. **Team-Up art for Hercules and Thor** is art, not code; the client is ready once `art/teamups/hercules-thor/` has a
   file.
8. **Screen readers.** There is no DOM mirror in the app, so this wave adds none; section 2.9 states the limit.
9. **A tucked defeated ally "facedown": may the owner look?** The engine's visibility answer decides; if it says no, Inspect
   shows the back. The plan does not guess.

## 9. Save, resume, replay and what is stored for a custom scenario

- A save is the setup config, the state right after setup, and every command (`engine/game-storage.ts`); resuming is
  replaying the log. A custom scenario therefore survives save and resume with no builder code on the resume path: the
  baseline state already holds the chosen main scheme stages (`mainScheme.stageOrder`), the shuffled encounter deck and
  the sets, and replay never re-runs setup.
- **What the client adds to the stored `SessionConfig`** (additive, optional, so older saves read unchanged and
  `SAVE_SCHEMA` does not change, the same way `modes` was added): `mainSchemeStageIds` (two printed ids), the existing
  `modularSetIds`, `gameMode: "cooperative"`, `blind`. They are needed to: label the save ("Custom Civil War: Iron Man,
  Cut Off Support then Negative Zone Prison, 4 sets"), "Play again" on Game Over with the same scenario, and the
  Pause panel's scenario sheet. Blind is stored so the hiding survives resume; which sets have been revealed is derived
  from the log, never stored.
- A random scenario is stored as its result (the picks), not as the seed that made it, so a later change to the random
  function cannot alter a saved or repeated game. The seed that deals the game is the draft's seed as always.
- "Play again" repeats the picks; "New random scenario" on Game Over (only for a game that began as Random) re-rolls.
- The pool version: a save made before the wave retires only if `POOL_VERSION` differs for its cards, as always; nothing
  here changes that rule. `describeCivilWar(config)` (in `save-data-model.ts` or a new `view/civil-war-label.ts` with
  3 tests: ready-made label, custom label, blind label that hides the hidden pieces) builds the label from the config
  only.
- Nothing is stored about the builder's UI state beyond the session draft; closing the app mid-build forgets it (question
  5 asks whether named scenarios should be kept).

## 10. Numbered task list

Each task is one agent in one sitting; files do not overlap unless noted. "Waits on" names the piece it needs; a task
marked "now" can start with a stubbed offer or fixture and be finished when the piece lands. Run lint/format on your own
files, stage only your own hunks, commit with an explicit pathspec, and add a changie fragment (Added) per the project
instructions.

**C0. The offer (cards agent, not the client).** Add to `playableScenarioOffer` the fields in section 2.7 and export
`randomCivilWarScenario`. Files: `packages/cards/src/playable/scenario-options.ts` (and its test). Waits on: main spec
3.1 and 3.3 (`wave10Scenario`, `chooseMainSchemeStages`, `randomCivilWarScenario`).

**C1a. Foe words, part 1: the helper and the scenario screens.** `view/foe-words.ts` and its test (6.4), then
`scenes/scenario-select.ts`, `view/scenario-detail.ts`, `view/table-setup-preview.ts`, `view/scenario-select-layout.ts`
(6.10). Waits on: nothing (fixture card with `printedType: "leader"`).

**C1b. Foe words, part 2: the board and the text.** `view/board-model.ts` ("Villain · Stage I", "VILLAIN"),
`scenes/board/zones.ts`, `view/log-lines.ts`, `view/inspect-model.ts`, `view/game-over-model.ts`,
`view/setup-walkthrough.ts`, `view/pause-model.ts`, `art/card-face.ts` ("Leader" type word). Keeps "Villain Phase". Waits
on: C1a (the helper).

**C2. Game mode options and the notice.** `view/game-mode-options.ts` + test (6.3); `view/new-in-box-model.ts` (`BOXES`
row `cycle10`, `notice`), `scenes/new-in-box.ts`, the `GlossaryBoxId` addition in
`packages/content/src/schema/glossary.ts`, test (6.9). Waits on: the data agent confirming `cycle10` as the box id
(present in `data/cw`).

**C3. Config and draft plumbing.** `engine/host.ts`, `engine/session-core.ts`, `view/setup-draft.ts`,
`view/setup-options.ts` (`reconcileWithOffer`), tests (6.5, 6.12). Waits on: C0, engine `mainSchemeStageIndexes` and
`gameMode` (main spec 3.2, 1.9), `wave10Scenario`.

**C4. Builder view model.** `view/civil-war-builder-model.ts` + test (6.1). Waits on: C0 (stub offer until then), C2, C3.

**C5. Builder layout.** `view/civil-war-builder-layout.ts` + test (6.2). Waits on: nothing (geometry only).

**C6. Modular range.** `view/modular-sets.ts`, `view/modular-candidates.ts` and their tests (6.6). Waits on:
`modularSetCountRangeOf` exported from `@mc/content` (main spec 1.4).

**C7. Builder scene and entry points.** `scenes/civil-war-builder.ts` (thin), registration in the scene list
(`main.ts`/`boot.ts` as other scenes), the "Customize" and builder-tile buttons in `scenes/scenario-select.ts` (only
those lines; C1a owns the rest of the file, so C7 runs after C1a), `__mcBuilderDebug` hook. Waits on: C4, C5, C1a.

**C8. Table setup for a custom scenario.** `scenes/table-setup.ts` (only the modular section: summary and "Edit
scenario"), `view/table-setup-layout.ts` if geometry changes. Waits on: C3, C7.

**C9. Random and blind.** Random button wiring in the builder model/scene (6.1 cases 8 and 9), blind masking in
`view/encounter-preview.ts`, `view/pause-model.ts`, `view/inspect-model.ts`, `view/board-model.ts` stage pips. Waits on:
C0 (`randomCivilWarScenario`), C4, C7.

**C10. Pool, unlock and shelves.** `content/pool.ts`, `progression/unlocks.ts` (the `cycle10` row), Title/Scenario
shelves and the `scenario-chip:product:cw` chip, `POOL_PACKS` names. Waits on: the cards agent registering the wave in
`playable/index.ts`, the data records, and question 4.

**C11. Enemy-team prompts.** `view/villain-walkthrough.ts`, `view/highlights.ts`, `scenes/choice.ts` (the tag and the
disclosure) and tests (6.7). Waits on: engine `enemyTeam` authority (plan task 7).

**C12. Board: the leader, boost cards and tucked allies.** `view/board-model.ts` extensions (6.8 first bullet),
`scenes/board/schemes.ts`, `scenes/board/tucked-row.ts`. Waits on: engine primitives for 3.10 and 3.15.

**C13. Hercules zones.** `SeparateDeckPile` changes in `view/board-model.ts`, `scenes/board/zones.ts`, the Labor owner
badge, the find prompt's area suffix (`view/look-at-choice.ts` or the choice sheet), the Gift count badge; unavailable
reason map with its test (like `hand-reason.ts`). Waits on: hero-packs H3.1 to H3.4, H3.9, and a readable Gift-count
value and reason from the engine. Do not run in parallel with C12 (same board-model file); run after.

**C14. Wonder Man.** Ionic Physiology tucked row, overpaid amounts and helper lines in `view/payment-model.ts` and
`scenes/board/payment-bar.ts`, X-before-paying check. Waits on: H3.12 to H3.14 and H3.19, and the payment query
returning overpaid amounts and per-helper contributions.

**C15. Hulkling and Tigra readability, and new log lines.** The "Current shape" tag, refusal-reason maps, and every line in
5.7 with `log-lines-wave10.test.ts`. Waits on: engine event names for 3.10, 3.15, the enemy-team search, Labor/Gift and
the tuck events.

**C16a. Guided mode: glossary and box page.** `GLOSSARY_ENTRIES` additions in `@mc/content` with cites and the
`cycle10` tag, the plan's task 14 entry, tests of the entries. Waits on: C2.

**C16b. Guided mode: tips and Inspect notes.** `view/guide-tips.ts`, `view/how-this-works.ts` and tests. Waits on: C16a.

**C16c. Guided mode: Try-it lessons.** Hercules and Wonder Man in `guide/mechanic-tryits.ts`,
`mechanic-tryit-config.ts`, `mechanic-lessons.ts` and `e2e/wave10-tryit.spec.ts`. Waits on: the scripted kits for both
heroes (H8.4) and C16a.

**C17. Art, music and Team-Up slots.** `art/scenarios/<id>/.gitkeep` x4, `music/scenarios/<id>/.gitkeep` x4 (or the
tracks, when supplied, with their `TRACK_TITLES` entries), `art/teamups/hercules-thor/`, `docs/team-ups.md` row, one
sentence in `art/README.md` on "villain" file names for leaders. Waits on: nothing for the folders; the owner for files.

**C18. Save label and Play again.** `view/civil-war-label.ts` + test, `view/save-data-model.ts`,
`view/game-over-model.ts` (Play again / New random scenario). Waits on: C3.

**C19. End-to-end specs** (section 11), written after the pieces they exercise; one agent per spec file.

**C20. Play it.** Play each ready-made scenario and one custom and one random scenario end to end in the browser
(wave-definition-of-done section 5 items: Title offers every new scenario; every new scenario starts with a new hero),
run the whole Playwright suite (`pnpm e2e:verify`) before the last push, and write down what the board did not make
clear (which minion is engaged with whom, which facedown cards belong to whom). Waits on: all of the above.

## 11. E2E specs to add (`packages/client/e2e/`)

Pattern: the wave 9 smoke (`wave9-smoke.spec.ts`: No guide, a fixed seed, Scenario select, Take your seats, Set the
table, Deal it out, through the opening hands and any setup decision to round 1's first player turn), the
`__mc...Debug` hooks of `mojo-setup.spec.ts`, and the `scenario-chip:product:cw` chip.

1. `civil-war-smoke.spec.ts`: the four ready-made scenarios start with a different wave 10 hero each (Wonder Man,
   Hercules, Tigra, Hulkling), reach the first turn; the board shows the leader's name with the word "Leader" (and no
   "VILLAIN" label) and the main scheme's stage 1; one case in Expert shows leader stage III (4 cases + 1).
2. `civil-war-builder.spec.ts`: opens from "Customize"; defaults equal the ready-made scenario for each leader; picking
   two sets disables Continue and shows "uses 3 to 4 modular sets, got 2"; four sets disable the rest with "Four is the
   most"; the other side's group is collapsed, expands, and its tile shows the refusal text and cannot be selected;
   changing a stage changes the review; "Preconstructed" restores; the keyboard path (Tab, arrows, Enter, Escape) makes
   a full scenario without the mouse; a phone-size viewport shows one step at a time; then Start: the board shows the
   chosen stage 1 and, after completing it (debug helper), stage 2.
3. `civil-war-coming-soon.spec.ts`: the builder's "Competitive" option is visible, disabled, labelled "Coming soon";
   clicking it leaves "Cooperative" selected and the game that starts is cooperative; the box's "New in this box" page
   (How to play hub) shows "Competitive mode coming soon." once. This is the gate for task 15 of the plan.
4. `civil-war-random.spec.ts`: Random with a locked leader keeps the leader; the same seed gives the same picks; "Random
   and blind" hides stage 2 and the set names in the review, on Table setup and in Pause; a revealed set appears in the
   Pause sheet after its first card is revealed.
5. `civil-war-save-resume.spec.ts`: build a custom scenario, play a turn, reload, Continue: the same stages and sets,
   the same log, blind still hidden; Game Over's "Play again" reuses the picks.
6. `civil-war-enemy-team.spec.ts`: Iron Man's Setup shows the enemy-team prompt (tag "ENEMY TEAM'S CHOICE", the grim
   rule under "Why?"), addressed to the first player in a two-seat game, and the log line afterwards. The case where
   there is one candidate shows no prompt.
7. `hercules-decks.spec.ts`: the Labor and Gift decks are visible with counts and not inspectable; the action's
   unavailable reason in hero form; revealing a Labor card marks it as Hercules's; finishing it puts a Gift card into
   play. `wonder-man-tuck.spec.ts`: playing an energy event tucks it, the count reads "1 of 3", a basic attack empties
   it; overpay shows in the pay prompt. `wave10-tryit.spec.ts`: both Try-it lessons from the box's page to completion.
8. Existing specs touched: `scenario-smoke.spec.ts` (its `/^villain$/i` label check at line ~78 stays for villains; a
   leader case is added in spec 1 instead); `how-to-play.spec.ts` (the box list gains a row); `scenario-select` coverage
   is in the smoke specs by chip. All are local-gate runs (e2e is not a CI check).

## 12. Open questions for the owner

Plain words; A is the recommended default and is what gets built. Numbered across the wave's pages (1 to 22 are in the
spec files); these are 23 to 27. "7b" is not a separate question: it follows the main spec's question 7, and the
other side's sets are shown disabled with the reason, as the client's "disabled, not omitted" convention has it.

- **Question 23.** **How does a player reach the builder?** A: from the Civil War shelf on Scenario select, through a "Customize" button
  on each ready-made scenario and one "Build your own" tile; the ready-made scenarios play exactly as printed without
  opening it. B: a separate Title menu entry "Civil War builder", and Scenario select shows only the four ready-made
  scenarios.
- **Question 7b.** **The other side's modular sets in the builder.** A: shown in a collapsed group, disabled, with the reason, and sets
  from other products count toward the three or four (the main spec's question 7 default). B: not shown at all, and
  sets from other products are chosen in the existing "extra sets" row and do not count.
- **Question 24.** **What does Random do?** A: Random fills the builder with a random scenario that the player sees and can still edit;
  a separate "Random and blind" button hides stage 2 and the set list until each shows up in the game. B: Random is
  always blind and cannot be edited afterwards.
- **Question 25.** **When does the Civil War box open?** A: after the player finishes the Agents of S.H.I.E.L.D. campaign, like the
  chain of earlier boxes, with Wonder Man and Hercules as that box's hero unlocks in the order the pool lists them (the
  box has no campaign of its own, so the hero rewards are tied to the four scenarios). B: open from the start on a new
  profile, because it is a custom-scenario box with no campaign.
- **Question 26.** **Should a custom scenario be saved by name?** A: no; the last build is remembered for the session and a finished or
  saved game can be played again with the same picks. B: a "My scenarios" list where a player can name, keep and delete
  builds (adds a screen and a stored list).
- **Question 27.** **Wording of the "coming soon" option.** A: "Competitive" with a "Coming soon" tag, reason "Two teams, each against
  the other's leader. Not available yet." B: "Competitive (coming soon)" with "Two teams face each other's leaders.
  Not available yet." C: A plus "Co-op only for now" on the cooperative option. The box page line is "Competitive mode
  coming soon." under all three.

Questions of the main spec that change client wording only (6 who answers for the enemy team, 7 other products' sets, 9 the
random count) are answered there; the client builds the default A of each and the labels in this plan follow them.
