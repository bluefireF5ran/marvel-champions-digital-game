/**
 * Rules QA, wave 10 part 1: the registration side of Civil War. A seeded greedy game (testing/driver.ts, which knows no
 * card names) of each ready-made registration scenario: one player at standard and two players (the Tigra and
 * Hulkling starter decks) at expert, plus more seeds, modes and a three-player table (the Core Spider-Man deck as
 * third seat), to an outcome or a command cap. Per game: the driver throws on any command the engine refuses and on a
 * stuck prompt, so "plays on" is the first claim; a finished game leaves no prompt pending; and the session log
 * replays from its first state to a deep-equal state (PLAN.md Phase 1).
 * Run on 2026-10-12, every game a loss (the greedy driver is weak), none stalled, refused a command or left a prompt:
 * iron-man 1p standard s1 round 2 (16 commands), 2p expert s2 round 5 (102), 1p standard s3 round 5 (53), 1p expert
 * s5 round 3 (29), 2p standard s4 round 3 (53), 3p standard s5 round 6 (186); captain-marvel 1p standard s1 round 6
 * (78), 2p expert s2 round 5 (86), 1p standard s3 round 3 (28), 1p expert s5 round 2 (19), 2p standard s4 round 9
 * (157), 3p standard s5 round 7 (201). Findings: docs/phase7-wave10-qa-registration.md.
 */
import { createGame, replay, type GameSetupConfig } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { playToOutcome } from "../testing/driver.js";
import { wave10Scenario } from "./setup.js";
import {
  CAPTAIN_MARVEL_SCENARIO,
  CORE_SPIDER_MAN,
  HULKLING_DECK,
  IRON_MAN_SCENARIO,
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
    players: [
      seatOf(TIGRA_DECK),
      ...(players >= 2 ? [seatOf(HULKLING_DECK)] : []),
      ...(players >= 3 ? [{ starterDeckId: CORE_SPIDER_MAN }] : []),
    ],
  });
}

describe("seeded greedy games of the ready-made registration scenarios", () => {
  for (const scenario of [IRON_MAN_SCENARIO, CAPTAIN_MARVEL_SCENARIO])
    for (const [players, difficulty, seed] of [
      [1, "standard", 1],
      [2, "expert", 2],
      [1, "standard", 3],
      [1, "expert", 5],
      [2, "standard", 4],
      [3, "standard", 5],
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
      });
});
