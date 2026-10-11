/**
 * Rules QA, gaps from the wave 9 scenario tests: a seeded greedy game (testing/driver.ts, which knows no card names) of
 * each Agents of S.H.I.E.L.D. scenario, Enchantress and God of Lies at three and at four players, to an outcome or a
 * command cap. Per game: the driver throws on any command the engine refuses and on a stuck prompt (a state with no
 * prompt that is not a player turn), so "plays on" is the first claim; the session log replays from its first state to a
 * deep-equal state (the engine's replay guarantee, PLAN.md Phase 1); and a finished game leaves no prompt pending.
 * The scenario numbers are asserted in qa-gaps-setup.qa.test.ts; this file is the whole-game soak at the player counts
 * the scenario tests do not play (docs/phase7-wave9-qa.md "could not check").
 */
import { vi } from "vitest";
import { greedySoak } from "./qa-gaps.shared.js";

vi.setConfig({ testTimeout: 600_000 });

greedySoak("seeded greedy games at three and four players", [
  "baron-zemo",
  "thunderbolts",
  "enchantress",
  "god-of-lies",
]);
