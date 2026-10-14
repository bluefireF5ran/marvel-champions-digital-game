/**
 * Rules QA, wave 10 part 2: the resistance side of Civil War. A seeded greedy game (testing/driver.ts, which knows no
 * card names) of each ready-made resistance scenario, once with one player at standard and once with two players
 * (Tigra and Hulkling starter decks) at expert, to an outcome or a command cap. Per game: the driver throws on any
 * command the engine refuses and on a stuck prompt, so "plays on" is the first claim; a finished game leaves no prompt
 * pending; and the session log replays from its first state to a deep-equal state (PLAN.md Phase 1).
 * Findings: docs/phase7-wave10-qa-resistance.md.
 */
import { createGame, replay, type GameSetupConfig } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { playToOutcome } from "../testing/driver.js";
import { wave10Scenario } from "./setup.js";
import {
  SPIDER_WOMAN_SCENARIO,
  HULKLING_DECK,
  CAPTAIN_AMERICA_SCENARIO,
  TIGRA_DECK,
  WAVE10_DEPS,
  cwSeat,
} from "./testing.js";

vi.setConfig({ testTimeout: 600_000 });

const CAP = 3000;

const seatOf = (deck: string) => {
  const s = cwSeat(deck);
  return { identityCardId: s.identityCardId, deck: s.deck, ...(s.aspects ? { aspects: s.aspects } : {}) };
};

function config(scenario: string, players: number, difficulty: "standard" | "expert", seed: number): GameSetupConfig {
  return wave10Scenario(scenario, {
    difficulty,
    seed,
    players: players === 1 ? [seatOf(TIGRA_DECK)] : [seatOf(TIGRA_DECK), seatOf(HULKLING_DECK)],
  });
}

describe("seeded greedy games of the ready-made resistance scenarios", () => {
  for (const scenario of [CAPTAIN_AMERICA_SCENARIO, SPIDER_WOMAN_SCENARIO])
    for (const [players, difficulty, seed] of [
      [1, "standard", 1],
      [2, "expert", 2],
    ] as const)
      it(`${scenario}, ${players} player(s), ${difficulty}, seed ${seed}: plays to an outcome or ${CAP} commands, replays deep-equal`, () => {
        const created = createGame(config(scenario, players, difficulty, seed), WAVE10_DEPS);
        if (!created.ok) throw new Error(`${created.error.code}: ${created.error.message}`);
        const run = playToOutcome(created.state, WAVE10_DEPS, { maxCommands: CAP });
        const end = run.session.state;
        expect(run.outcome !== null || run.commands >= CAP, "an outcome or the cap").toBe(true);
        if (run.outcome) expect(end.pendingChoice, "no prompt left open after the outcome").toBeNull();
        const replayed = replay(run.session.log, WAVE10_DEPS);
        if (!replayed.ok) throw new Error(`replay failed: ${replayed.error.message}`);
        expect(replayed.state).toEqual(end);
        console.log(
          `GREEDY ${scenario} ${players}p ${difficulty} seed ${seed}: ${run.outcome ? `${run.outcome.result}/${(run.outcome as { reason?: string }).reason}` : "cap"} round ${run.rounds} commands ${run.commands}`,
        );
      });
});
