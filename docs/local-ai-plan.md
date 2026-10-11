# Local AI helper: plan

**Status:** not started. To be picked up as its own PRs **after the Fear No Evil wave (MC60) is in place**, when every
released expansion's cards, scenarios and campaigns are in the pool. Written 2026-10-11 at the owner's request.

**Goal.** An optional helper that runs entirely on the player's device and does two things:

1. **In a game:** suggests a move and says why in a few plain words ("thwart: the scheme completes next round").
2. **In the deck builder:** rates a deck against a scenario, and suggests cards to add or cut.

No game state, deck or play history leaves the device. The game stays fully playable with the helper switched off.

## The short version

- The helper is built in three layers, each useful on its own: **a search player** (no training), **a recorded
  dataset** of its games, and **a small trained network** that makes the search fast enough for a phone.
- The engine is the training ground. It is deterministic, headless and replayable, so it can generate as many games
  as there is compute for. The card data and the saved decklists are inputs to that, not the training set.
- A model you can ask questions in words is **out of scope**: it cannot be trained from game data, and a
  pre-trained language model is gigabytes to ship.

## Why not train on today's data

| What exists (October 2026)                   | Why it is not enough by itself                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| About 3,460 cards with text, stats, traits   | Describes cards. Says nothing about which plays or decks win.                    |
| 68 tested MarvelCDB decklists                | A deck recommender wants thousands of decks.                                     |
| The engine, with `legalActions`, `preview`,  | The real asset, but it needs a competent player to generate games worth learning |
| `applyCommand`, `replay`                     | from.                                                                            |
| The greedy test driver (`testing/driver.ts`) | Too weak to learn from: about 830 purposeful wave 9 games produced 0 wins.       |

A network trained on the greedy driver's games learns to play like the greedy driver. So the first deliverable is a
better player, and it needs no training.

## Design rules

These follow the project's existing boundaries (CLAUDE.md, PLAN.md Phase 4).

- **The engine stays the only authority.** The helper proposes commands; the engine validates and applies them. A
  suggestion is always one of the engine's own `legalActions`.
- **No hidden information.** The helper sees exactly the sealed state the client holds (`sealHiddenInformation`): no
  deck order, no facedown encounter cards, no hidden piles, no sealed campaign values. It samples what it cannot see.
- **Nothing card-specific in the helper.** It works from the engine's legal actions and state, so a new pack needs no
  helper change beyond retraining.
- **Dependency direction.** A new package `@mc/advisor` sits beside `@mc/cards`: `client → advisor → cards → engine →
content`. The engine never imports it.
- **Off by default, opt-in, and labeled.** It is a help feature under Guided mode's settings. It never plays for the
  player without being asked, and a game played with suggestions on is marked so in the game record.
- **Deterministic and testable.** Given a state and a seed, a suggestion is reproducible. View models stay plain
  TypeScript tested with Vitest.

## Phase A: a search player (no training)

The foundation, and worth shipping without anything after it.

- **A1. Fast simulation path.** Measure games per second today; profile the engine under repeated
  `applyCommand`; add a rollout mode that skips event logging and view work. Target: thousands of commands per second
  on a laptop core, hundreds on a phone. This decides how much search fits in a turn.
- **A2. Determinization.** From the sealed state, sample the unknowns consistently with what is known: shuffle the
  unseen cards of each deck, deal plausible facedown encounter cards, fill hidden piles from their possible contents.
  One sampler, tested to never contradict a visible fact.
- **A3. Search.** Information-set Monte Carlo tree search over the player's turn: the tree branches on the engine's
  legal actions, each simulation plays out the villain phase and a few rounds with a rollout policy, and the result is
  scored. The first rollout policy is a set of plain heuristics (do not let the scheme complete, do not die, spend the
  hand, ready allies before attacking).
- **A4. Scoring.** A win is 1 and a loss 0; inside the horizon, a hand-written evaluation (threat against target,
  hit points on both sides, cards in hand and in play, villain stage). Phase C replaces this with the trained value.
- **A5. Calibration suite.** The measure of success, run in CI's nightly or on demand rather than on every push: win
  rates by scenario, mode and player count against a fixed set of decks and seeds, starting with the Core Set (a
  competent player beats standard Rhino most of the time) and ending with every scenario in the pool. This also
  answers, for every wave, the question wave 9 raised: is a scenario winnable as built.
- **A6. Replace the greedy driver in QA.** Scenario soak tests and the modular matrix can use the search player at a
  small budget, so "plays to an outcome" also means "is sometimes won".

**Exit:** the search player beats standard Core Set scenarios at a healthy rate with precons, wins every scenario in
the pool at least sometimes, and returns a suggestion within the time budget on a laptop.

## Phase B: the dataset

Cheap to add once Phase A exists, and it is what any later training needs.

- **B1. A stable record format**, versioned, one line per decision: an encoded state (see C1), the legal actions,
  the search's visit counts over them, the move taken, and the game's final outcome and length. Stored outside the
  repo; a manifest in the repo names what was generated, by which engine version and card-pool version.
- **B2. A generation script** that plays the search player against itself across the whole matrix: every scenario,
  standard and expert, one to four players, precons plus the saved community decklists plus randomized legal decks
  (`testing/random-deck.ts`), with modular sets drawn from the modular matrix.
- **B3. Deck outcome table.** The by-product for deck building: for each (deck, scenario, mode, player count), games
  played and won. This is real evidence about which cards and decks perform, generated from our own engine.
- **B4. Invalidation.** A rules fix or errata changes what good play is. Records carry the engine and pool version, and
  the manifest says which records a given change makes stale.

**Exit:** a reproducible dataset of at least a few million decisions covering every scenario, with the outcome table.

## Phase C: a small trained network

Makes the helper fast enough for a phone and better than the hand-written evaluation.

- **C1. State and action encoding.** A fixed encoding that does not grow with the card pool: each card in play, in
  hand or in a known discard pile is a set of features (type, cost, resources, stats, counters, exhausted, keywords,
  traits as a hashed bag) plus a learned embedding looked up by card id; zones are sets, pooled with attention.
  Actions are scored one at a time against the encoded state, so the action space can be anything the engine lists.
- **C2. The model.** A small set transformer, on the order of 1 to 5 million parameters, with two heads: a value
  (chance of winning from here) and a policy (a score per legal action). Trained on the Phase B records, then improved
  by further self-play with the network guiding the search.
- **C3. Training.** Off-device, in Python, on a workstation GPU or rented compute; none of it ships. Exported to ONNX
  and quantized to a few megabytes.
- **C4. On-device inference.** ONNX Runtime Web: the WebGPU backend where present, WebNN where the browser exposes the
  device's neural chip, WebAssembly as the fallback. In the packaged apps (Phase 8) the same model runs through Core ML
  on Apple devices and NNAPI or the vendor runtime on Android. The model is downloaded on first use of the feature,
  cached, and versioned with the card pool.
- **C5. Acceptance.** The network-guided search must beat the Phase A player on the calibration suite at the same time
  budget, on every scenario family, before it replaces it. A new pack ships with the Phase A player until its model is
  retrained.

**Exit:** a quantized model under about 10 MB that gives a suggestion in well under a second on a recent phone and
beats the heuristic search on the calibration suite.

## Phase D: the product

- **D1. In-game help.** A "Suggest" control under Guided mode: highlights the suggested play on the board, with one
  short reason drawn from what the search saw (the outcome it avoids or reaches) and the fuller explanation in a
  sheet. Also "Why not this?" on a card the player is about to play, when the search rates it much worse. Uses the
  existing highlight and tip surfaces; no new board chrome.
- **D2. Deck rating.** In the deck builder and on the Decks screen: "How does this do?" plays the deck in the
  background (a worker, at a small budget) against a chosen scenario and reports an estimated win rate with its
  uncertainty, and where games were lost (threat or damage).
- **D3. Card suggestions.** For a hero and aspect: cards whose swap raised the estimated win rate most, from the
  outcome table and a few fresh games. Always legal under `validateDeck`, always within the player's unlocked pool.
- **D4. A better opponent-side player for tests and demos.** Not a player-facing feature; the villain side stays
  rules-driven, as the game requires.
- **D5. Settings and honesty.** Off by default; a setting for the time budget; a visible mark on a game or a campaign
  record that used suggestions; no effect on champion points unless the owner decides otherwise.

## What is deliberately not in this plan

- **A chat assistant or rules explainer in words.** Rules lookups stay with the glossary, Inspect and Guided mode.
- **Any model trained on, or shipped with, card art or card text as generated content.**
- **Server-side inference or telemetry.** Everything runs locally; nothing is collected.
- **Multiplayer advice.** Suggestions for a single local player first; table talk and other players' hidden hands are
  a later question for the multiplayer phase.

## Risks and how each is met

| Risk                                               | Answer                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The engine is too slow for search or self-play     | A1 comes first and gates everything; if rollouts stay slow, shorten horizons and lean on the value |
| The search exploits hidden information by accident | It only ever receives the sealed state; a test feeds it two games that differ only in hidden cards |
| Retraining on every pack is a burden               | Phase A player covers a new pack on day one; retraining is batched per wave                        |
| A rules bug teaches the model wrong play           | Records are versioned and invalidated (B4); the calibration suite reruns after rules fixes         |
| The model file is large for a web game             | Size budget in C3; downloaded only when the feature is first switched on                           |
| Suggestions make the game feel solved              | Opt-in, labeled, and framed as teaching: it shows the reason, not just the move                    |
| Browser support for neural hardware is uneven      | WebGPU and WebAssembly fallbacks; the Phase A player needs none of it                              |

## More decklists (optional, needs the owner's go-ahead)

Deck suggestions improve with real decks. MarvelCDB has thousands of public decklists. Fetching them at scale is a
separate decision: it needs explicit approval for the network requests, a read of MarvelCDB's terms for bulk use, and
credit to authors as the community decks feature already gives. The plan works without it, from the outcome table.

## Order of work and sizing

Each line is one small agent task or a short series, in the project's usual fan-out style.

1. A1 simulation speed (engine): measure, profile, rollout mode.
2. A2 determinization, with its consistency tests.
3. A3 and A4 search and heuristic scoring, in `@mc/advisor`.
4. A5 calibration suite; A6 swap into the soak tests.
5. D1 in-game suggestion on the Phase A player (the first thing a player sees).
6. B1 to B4 dataset format, generation, outcome table.
7. D2 and D3 deck rating and card suggestions from the outcome table.
8. C1 to C5 encoding, model, training, on-device inference, acceptance.
9. D5 settings and marks; a pass through Guided mode's how-tos for the new help.

Steps 1 to 5 deliver the helper with no training at all. Steps 6 and 7 deliver deck help. Step 8 is the only part that
needs a GPU and a training pipeline, and it can wait as long as the search player is fast enough on the devices that
matter.

## Open decisions for the owner

1. Does a game played with suggestions on still earn champion points and count toward unlocks?
2. Is the helper available in campaigns, or only in standalone games at first?
3. Where does training run, and what budget is acceptable for it?
4. Whether to fetch MarvelCDB decklists at scale (see above).
5. The smallest device the suggestion must feel instant on.
