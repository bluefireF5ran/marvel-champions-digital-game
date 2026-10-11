/**
 * Rules QA, "can each wave 9 scenario be won": Thunderbolts (MC50 p. 15; 50129a to 50133), standard mode, four
 * players.
 *
 * No honest win was found. SEARCH (offline, not re-run here): 135 games at 1 to 4 players (the same pool, seeds 1 and
 * 2, margins 3, 4 and 99, attacking the villain, the weakest minion or the best finish): 0 wins. Of the 131 with an
 * outcome log, 80 were lost to the scheme and 51 to every hero defeated; Citizen V took at most 15 damage. Every game
 * was played from the printed setup with the natural shuffle by the purposeful player of `qa-wins.shared.ts`; for
 * Thunderbolts it attacks the weakest minion in reach and thwarts only within the margin, because Citizen V "cannot be
 * defeated unless there are at least 1 [per hero] Thunderbolt minions in the victory display" (50129a), so the minions
 * must go first.
 *
 * Where the games end, and why (the pinned line: Thor, Hulk, Spider-Man, Black Panther, seed 1): the clock is the
 * gentlest of the six (1 per hero to 11 per hero, +1 per hero, 50130b scan) and the table never threatens it: the main
 * scheme never rises above 14 of 44. The game is lost because all four heroes are defeated in round 4: every player
 * starts engaged with a random Elite Thunderbolt minion (50131a), each minion gains guard, and one that is attacked
 * engages the attacker (50130b); the heroes attack, take their damage back from several enemies at once, and nothing
 * is left. Citizen V himself is not damaged (he does not activate and heals 4 while any player is engaged with a
 * Thunderbolt, 50129a). No Thunderbolt minion reached the victory display. Every printed number matches the scan (qa-
 * wins-clock.qa.test.ts).
 */
import { replay } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { DEPS } from "./qa-gaps.shared.js";
import { DECKS, ledgerTable, runLine, type Line } from "./qa-wins.shared.js";

vi.setConfig({ testTimeout: 600_000 });

const LINE: Line = {
  scenario: "thunderbolts",
  team: [DECKS.thorJustice, DECKS.hulkJustice, DECKS.spiderManLeadership, DECKS.blackPantherLeadership],
  seed: 1,
  policy: { margin: 99, attack: "minion", thwart: "smart" },
};
let memo: ReturnType<typeof runLine> | undefined;
const played = () => (memo ??= runLine(LINE));

describe("Thunderbolts, four players, a minion-first line (Thor + Hulk + Spider-Man + Black Panther, seed 1)", () => {
  it("is lost when every player is defeated in round 4 (RRG 1.8 'Defeated' p. 12), not to the scheme", () => {
    const run = played();
    expect(run.outcome).toEqual({ result: "loss", reason: "allPlayersDefeated" });
    expect(run.rounds).toBe(4);
    expect(Math.max(...run.rounds_.map((r) => Math.max(r.threatIn, r.threatBeforeVillain)))).toBe(14);
  });

  it("threat in and out per round: [round, heroes removed, villain phase placed, villain phase removed, damage to Citizen V, damage to the players]", () => {
    expect(ledgerTable(played().ledger)).toEqual([
      [1, 4, 12, 0, 0, 13],
      [2, 2, 4, 0, 3, 26],
      [3, 6, 4, 0, 0, 18],
      [4, 7, 5, 0, 0, 10],
    ]);
  });

  it("all four identities are defeated and nothing reaches the victory display; Citizen V has no damage on him", () => {
    const run = played();
    const state = run.session.state;
    const identities = run.events.filter(
      (e) => e.type === "characterDefeated" && /^(01040a|06001a|01001a|10001a)$/.test(e.cardId),
    );
    expect(identities).toHaveLength(4);
    expect(state.instances[state.activeVillainId]!.damage).toBe(0);
  });

  it("the log replays deep-equal", () => {
    const run = played();
    const replayed = replay(run.session.log, DEPS);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(run.session.state);
  });
});
