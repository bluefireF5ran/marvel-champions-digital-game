/**
 * Rules QA, "can each wave 9 scenario be won": Black Widow (MC50 p. 9; 50064 to 50067b), standard mode, four players.
 *
 * No honest win was found. SEARCH (offline, not re-run here): 103 games at 1 to 4 players (11 MarvelCDB decklists of
 * earlier waves and Maria Hill / Nick Fury, rotated over the seats; seeds 1 and 2; margins 3, 4 and 99): 0 wins. Of
 * the 99 with an outcome log, 94 were lost to the main scheme in rounds 3 to 6 and 5 to every hero defeated; the best
 * took 39 of Black Widow I's 52 hit points. Every game was played from the printed setup with the natural shuffle by
 * the purposeful player of `qa-wins.shared.ts` (the greedy driver's card play, heroes defending, the Alert-Level-style
 * resource sinks skipped, basic attack / thwart redirected by a margin to the target).
 *
 * Where the games end, and why (the pinned line below, a four-player table of Nick Fury, She-Hulk, Iron Man and
 * Captain Marvel, seed 2): the main scheme starts at 2 per hero (8) with a target of 10 per hero (40) and "+X per
 * hero" each round with X the stage number (50067b scan: "X is Black Widow's stage number"; stage I is +1 per hero).
 * The heroes took 5, 3, 0, 3, 3, 1 threat off it in rounds 1 to 6 (it falls as heroes are hurt and hands empty), while
 * the villain phase put 4, 5, 10, 10, 13 and 15 on: the escalation, every acceleration icon in play (A.I.M. Scientist
 * 50083, Mad Science 50085, Destroy Evidence) and each activation that schemes (alter-ego players, "The villain
 * schemes" cards). The scheme is completed in round 6 with Black Widow at 39 of her 52 stage I hit points: stages II
 * (16 per hero) and III (13 per hero) were never reached, 168 hit points in all at four players. Every printed number
 * was checked against the scan (see qa-wins-clock.qa.test.ts); no rule runs harsher than printed. The scenario is a
 * race that this player loses by a wide margin, not one the engine forbids.
 */
import { replay } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { DEPS } from "./qa-gaps.shared.js";
import { DECKS, ledgerTable, runLine, type Line } from "./qa-wins.shared.js";

vi.setConfig({ testTimeout: 600_000 });

const LINE: Line = {
  scenario: "black-widow",
  team: [DECKS.nickFuryAggression, DECKS.sheHulkLeadership, DECKS.ironManAggression, DECKS.captainMarvelLeadership],
  seed: 2,
  policy: { margin: 4, attack: "smart", thwart: "smart" },
};
let memo: ReturnType<typeof runLine> | undefined;
const played = () => (memo ??= runLine(LINE));

describe("Black Widow, four players, a purposeful line (Nick Fury + She-Hulk + Iron Man + Captain Marvel, seed 2)", () => {
  it("is lost to the main scheme in round 6 (50067b: 'If this stage is completed, the players lose the game')", () => {
    const run = played();
    expect(run.outcome).toEqual({ result: "loss", reason: "mainSchemeCompleted" });
    expect(run.rounds).toBe(6);
  });

  it("threat in and out per round: [round, heroes removed, villain phase placed, villain phase removed, damage to Widow, damage to the players]", () => {
    expect(ledgerTable(played().ledger)).toEqual([
      [1, 5, 4, 0, 11, 13],
      [2, 3, 5, 0, 5, 19],
      [3, 0, 10, 0, 3, 17],
      [4, 3, 10, 0, 11, 8],
      [5, 3, 13, 0, 8, 6],
      [6, 1, 15, 0, 3, 0],
    ]);
  });

  it("Black Widow I (50064, 13 hit points per hero = 52) is not defeated: 39 damage, so stage II is never revealed", () => {
    const state = played().session.state;
    expect(state.instances[state.activeVillainId]!.damage).toBe(39);
    expect(state.mainScheme.stageIndex).toBe(0);
  });

  it("the log replays deep-equal", () => {
    const run = played();
    const replayed = replay(run.session.log, DEPS);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(run.session.state);
  });
});
