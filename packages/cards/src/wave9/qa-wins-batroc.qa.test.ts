/**
 * Rules QA, "can each wave 9 scenario be won": Batroc (MC50 p. 11; 50087a to 50091), standard mode, four players.
 *
 * No honest win was found. SEARCH (offline, not re-run here): 217 games at 1 to 4 players (the same decklist pool,
 * seeds 1 to 3, margins 0 to 99): 0 wins. Of the 93 with a stage log, 89 ended at stage 1B and 4 reached stage 2; 60
 * were lost to the scheme, 26 to a card ability (Alert Level High at 4 per hero, or no Rescued Captive) and 7 to every
 * hero defeated. Every game was played from the printed setup with the natural shuffle by the purposeful player of
 * `qa-wins.shared.ts`; for Batroc it thwarts the main scheme with every basic action (margin 99), because the win is
 * "no threat left at stage 3B" (50089b) and Batroc cannot be defeated for good (50086: reset to 12 hit points, remove
 * 6 threat).
 *
 * Where the games end, and why (the pinned line: She-Hulk, Iron Man, Captain Marvel, Captain America, seed 1): stage
 * 1B starts at 6 per hero (24), target 12 per hero (48) with +1 per hero each round (50087b scan). Round 1 is the
 * heroes' best: 13 off (24 to 11). The villain phase then puts 9 back (4 escalation, 5 from activations and cards),
 * and the heroes' output decays as they are hurt and their hands empty: 6, 1, 2 off in rounds 2 to 4 against 10, 8 and
 * 19 on. Four rounds in, 31 of 48; the 19 of round 4 completes the scheme. Stage 2 (3 per hero, 50088b) is never
 * reached. Every printed number was checked against the scan (qa-wins-clock.qa.test.ts); nothing runs harsher than
 * printed. Stage 3B (12 per hero, with every enemy attacking a Rescued Captive and a loss with none in play) is a
 * further burst the table never gets near.
 */
import { replay } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { DEPS } from "./qa-gaps.shared.js";
import { DECKS, ledgerTable, runLine, type Line } from "./qa-wins.shared.js";

vi.setConfig({ testTimeout: 600_000 });

const LINE: Line = {
  scenario: "batroc",
  team: [
    DECKS.sheHulkLeadership,
    DECKS.ironManAggression,
    DECKS.captainMarvelLeadership,
    DECKS.captainAmericaProtection,
  ],
  seed: 1,
  policy: { margin: 99, attack: "smart", thwart: "smart" },
};
let memo: ReturnType<typeof runLine> | undefined;
const played = () => (memo ??= runLine(LINE));

describe("Batroc, four players, a thwart-only line (She-Hulk + Iron Man + Captain Marvel + Captain America, seed 1)", () => {
  it("is lost to the main scheme in round 4 at stage 1B (50087b: 'If this stage is completed, the players lose the game')", () => {
    const run = played();
    expect(run.outcome).toEqual({ result: "loss", reason: "mainSchemeCompleted" });
    expect(run.rounds).toBe(4);
    expect(run.session.state.mainScheme.stageIndex).toBe(0);
  });

  it("threat in and out per round: [round, heroes removed, villain phase placed, villain phase removed, damage to Batroc, damage to the players]", () => {
    expect(ledgerTable(played().ledger)).toEqual([
      [1, 13, 9, 0, 4, 4],
      [2, 6, 10, 0, 4, 24],
      [3, 1, 8, 0, 2, 33],
      [4, 2, 19, 0, 0, 11],
    ]);
    expect(played().rounds_.map((r) => [r.threatIn, r.threatBeforeVillain, r.target])).toEqual([
      [24, 11, 48],
      [20, 14, 48],
      [24, 23, 48],
      [31, 29, 48],
    ]);
  });

  it("every hero is hurt badly enough that four allies and an identity fall before the scheme does", () => {
    const defeated = played().events.filter((e) => e.type === "characterDefeated");
    expect(defeated.map((e) => e.cardId)).toEqual(["03011", "01083", "01067", "03013", "01076", "01019a"]);
  });

  it("the log replays deep-equal", () => {
    const run = played();
    const replayed = replay(run.session.log, DEPS);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(run.session.state);
  });
});
