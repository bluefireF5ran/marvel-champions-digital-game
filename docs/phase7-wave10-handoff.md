# Wave 10 handoff (cycle 10, Civil War)

For any session picking up the Wave 10 PR, local or cloud. The PR body has the checklist and, at its top, anything
waiting on the owner; this page carries how to resume, the scope, and anything decided along the way. Rules for running
agents are the same as earlier waves ([phase7-wave5-handoff.md](phase7-wave5-handoff.md) "Rules for agents" and "Lessons
from review", [phase7-wave9-handoff.md](phase7-wave9-handoff.md)) and CLAUDE.md "How to split work across agents".
Started 2026-10-11.

## Resuming

- **Branch:** `feature/wave-10`, off `main` at 57141e32 (v0.19.0, #111; Wave 9 is #109, merged 2026-10-11).
  Everything finished and verified is pushed there; each verified commit goes up as it lands.
- **Read first:** the PR's top section and checklist, this page, then `docs/phase7-wave10-sources.md`,
  `docs/phase7-wave10-data-survey.md` and the spec `docs/phase7-wave10.md` (by outline only:
  `grep -n '^## \|^### '`, then `awk` between headings).
- **Definition of done:** [wave-definition-of-done.md](wave-definition-of-done.md), including §4b (custom decks) and
  Guided mode coverage in §5. **Step 6 (the box's campaign) does not apply:** MC56 p. 3 says the Civil War expansion
  "does not include five interconnected scenarios and a campaign mode". What the box has instead is custom scenario
  building, which is part of step 5 here.
- **Order of work** (as waves 5 to 9): sources doc and data survey → spec (`game-rules-architect`, in passes) → schema
  changes and `cw` / `hercules` emitted (`wonder_man` re-checked) → engine primitives one at a time (one engine agent
  at a time) → scripting per hero / per leader / per modular set (at most 3 agents, one small task each) → rules QA →
  custom decks → client wiring (the scenario builder, art, music, Guided mode) → progression → shipping.
- **Push often (owner, 2026-10-11).** Every verified piece is pushed at once and the PR's top section and working
  notes are updated with it, so any session can resume from GitHub alone.
- **Tools on this machine (Windows):** `node` is on the PATH; if `pnpm` is not, run it as
  `C:/Users/quinc/scoop/shims/mise.exe exec -- pnpm …`. Files are checked out CRLF.
- **Reading rulebook pages:** the Read tool cannot open PDF pages here (no poppler). Render them to PNGs and read
  those: `uv run docs/extract_pages.py docs/campaign-modes/mc56_rulebook-web_1.pdf -p 1-20 --dpi 110 -o <scratch dir>`.
  The Markdown transcription jumbles card callouts into the rules text, so check a rule against the page image.

## The push hook

`.githooks/pre-push` is in place on this branch and runs the whole Playwright suite on any push that changes
`packages/` or `pnpm-lock.yaml` (about 15 minutes, needs a clean working tree). Wave 9 removed it until its client step
at the owner's request; that has **not** been asked for this wave. If engine and scripting pushes become too slow
behind it, ask the owner before touching it, and never push past it with `--no-verify`.

## Rules policy (owner, 2026-10-07, carried over)

Where an official FFG ruling says a card's printed wording gives a result the designers did not intend, the intended
behavior is built, and the spec's §4.1 row cites the ruling by its date heading with the RRG page it clarifies. Where a
ruling and the RRG disagree with no statement of intent, the conflict goes to the owner as a short multiple-choice
question with a recommended default. Known bugs are fixed in the wave, not left as expected-fail tests.

## Scope

RRG 1.8 Appendix VI, "Limited Environment" (p. 71): "**10.** The _Civil War_ custom scenario expansion, the _Wonder Man
Hero Pack_, and the _Hercules Hero Pack_." Our id is `cycleId("cycle10")`.

| Pack         | Product         | Type                      | Card data at the start       |
| ------------ | --------------- | ------------------------- | ---------------------------- |
| `cw`         | Civil War, MC56 | Custom scenario expansion | not emitted (raw cache only) |
| `wonder_man` | Wonder Man      | Hero pack                 | emitted, data only           |
| `hercules`   | Hercules        | Hero pack                 | not emitted (raw cache only) |

**The box (MC56):** heroes Tigra (56001a) and Hulkling (56029a). Four leaders, used in place of villains and working
exactly as villains do (MC56 p. 3): Iron Man and Captain Marvel for registration, Captain America and Spider-Woman for
resistance. Each has four stages (III and IV replace I and II in expert mode) and a 10-card encounter set. Per side: four main scheme stage 1s and four stage 2s (sixteen stages in the box) and eight 5-card modular sets (sixteen in the box), a Standard PvP
encounter set and four basic player cards per leader, both used only in competitive mode. Rulebook:
`docs/campaign-modes/mc56_rulebook-web_1.pdf` (transcribed, roughly, at
`docs/campaign-modes/markdown/mc56_civil_war.md`).

**The four ready-made scenarios (MC56 pp. 7–8)** and their ids, which are also their music folders:

| Scenario id                   | Leader          | Main schemes                                | Modular sets                                                    |
| ----------------------------- | --------------- | ------------------------------------------- | --------------------------------------------------------------- |
| `registration-iron-man`       | Iron Man        | Cut Off Support, Negative Zone Prison       | Mighty Avengers, The Initiative, Maria Hill, Dangerous Recruits |
| `registration-captain-marvel` | Captain Marvel  | S.H.I.E.L.D. Recruits, Hunting Rebel Heroes | Cape-Killers, Martial Law, Heroes for Hire, Paladin             |
| `resistance-captain-america`  | Captain America | Gathering Support, Secret Avengers          | New Avengers, Secret Avengers, Namor, Atlanteans                |
| `resistance-spider-woman`     | Spider-Woman    | Open Rebellion, Neighborhood Protectors     | Spider-Man, Defenders, Hell's Kitchen, Cloak & Dagger           |

**Custom scenarios (MC56 pp. 4–6):** choose a side, a leader of that side, three or four modular sets of that side, the
standard set, and one stage 1 and one stage 2 main scheme of that side; p. 5 gives a random method. This is new for the
game: every scenario so far is a fixed record with swappable modular sets.

**Competitive mode (MC56 pp. 14–17):** two teams, each playing against the other's leader. **Owner, 2026-10-11
(question 1, answer A, with an addition):** not shipped in this wave, but the game must say "Competitive mode coming
soon" where a player would look for it (the Civil War scenario builder and the box's "New in this box" page), and the
scaffolding is built now so the mode is easy to drop in later: a written plan for the multiplayer phase
(`docs/competitive-mode-plan.md`, as `docs/epic-multiplayer-plan.md` was for Epic Multiplayer), the Standard PvP set
and the sixteen leader player cards emitted and scripted where the engine can already run them, a game-mode field on
the scenario setup that the builder passes (`cooperative` today, `competitive` refused with a clear message), team
and "enemy team" / "your leader" resolution written against a team count rather than hard-wired to one team, and
tests for each piece. Every "In competitive mode" clause still has to read correctly in cooperative play.

**Hero packs:** Wonder Man (a nemesis set and no modular set) and Hercules (a nemesis set, the All Versus All set, and
Gift and Labor decks that only his insert defines). The inserts are one-sheet pictures linked from the sources page.
Two cards need their errata applied when emitted: Energy Channel 56098 and Ionic Physiology 58002.

Already in the repo: raw MarvelCDB caches `packages/content/raw/marvelcdb/{cw,wonder_man,hercules}.json`; hero art
waiting in `art/heroes/_pending/{56001a-tigra,56029a-hulkling,59001a-hercules}/`.

Carried over from earlier waves: a box's scenario obligations are emitted with `encounterSetIds: []` unless the
normalizer fix made for `mut_gen` / `mojo` is applied to them too; a full re-emit drifts in unrelated fields, so emit
pack by pack. Card art is WebP q72 via `mise run card-art-compress`, committed once, never in CI. RRG 1.8 "Unique Icon"
(pp. 45–46): the branch for a matching unique encounter card being revealed was left unbuilt in `engine/src/unique.ts`
because nothing could reach it; heroes as encounter minions make it reachable in this box.

## Music

Twelve prompts (three per leader) are at the top of [music-prompts-ready.md](music-prompts-ready.md) under "Wave 10:
Civil War". Files go to `music/scenarios/_pending/<scenario id>/` until the scenario is playable, then to
`music/scenarios/<scenario id>/` with their `TRACK_TITLES` entries. A custom scenario plays its leader's music.

## Session log

- **2026-10-11, first session.** Branch and draft PR opened. Music prompts written. Three agents started side by side,
  each writing one doc: sources (`content-release-tracker`), data survey (`card-data-pipeline`), spec pass 1a, Civil
  War in cooperative play (`game-rules-architect`).
- **Same session, later.** Owner answered question 1 (competitive mode: not now, a "coming soon" notice, scaffolding).
  A fourth agent wrote `docs/competitive-mode-plan.md` (15 build-now tasks in its §4, 17 open questions in its §1.9;
  its Q1 and Q2 are about cooperative play and go to the owner through the spec's §4). The sources page is in; its §10
  questions are the PR's questions 2 to 5. The owner runs up to four agents at once on this PC.
- **Spec pass 1a is in** (`docs/phase7-wave10.md`): 23 primitives (5 new, 12 to extend, 6 reusable), a 19-task engine
  queue (§8.2) and 25 scripting lines (§8.4). Owner questions are numbered across all pages: 1 answered; 2 to 5 from
  the sources page; 6 to 13 from pass 1a (8 closed by reading the scan: Iron Man III prints "Setup"). The unique
  reveal branch turned out to be built already (`reveal.ts`, stage `uniqueCheck`); the gap is attachments (§3.8).
  Passes 1b (`docs/phase7-wave10-box-heroes.md`, sections prefixed B) and 2 (`docs/phase7-wave10-hero-packs.md`,
  prefixed H) are separate files so two agents can write side by side; their questions get the next free numbers.
