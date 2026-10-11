import {
  applyCommand,
  cardsInPlay,
  createGame,
  maxHitPoints,
  podOf,
  replay,
  sessionApply,
  sharedScheme,
  sharedVillain,
  startSession,
  type EngineDeps,
  type GameEvent,
  type GameOutcome,
  type GameSession,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { afterAll, describe, expect, it, vi } from "vitest";
import { mergeRegistries } from "../../dsl/index.js";
import { P1, P2, P3, firstLegal, identityOf, patchInstance, settle } from "../../testing/harness.js";
import { playToOutcome } from "../../testing/driver.js";
import { WAVE8_ABILITIES } from "../../wave8/index.js";
import { wave9Scenario } from "../setup.js";
import { IRON_MAN, SHE_HULK, SPIDER_MAN, codeOf, heroForm } from "../testing.js";
import { TT_ASPECT_BASIC } from "./aspect-basic.js";
import { GOD_OF_LIES } from "./god-of-lies.js";
import { TRICKSTER_MAGIC } from "./trickster-magic.js";

vi.setConfig({ testTimeout: 300_000 });

/**
 * Full greedy-driver games of the God of Lies scenario (Trickster Takeover, MC55; docs/phase7-wave9.md section 8.4
 * item 71): the real scenario (`wave9Scenario("god-of-lies")`, Single Group Mode at every player count, Trickster
 * Magic in the encounter deck with its allies set aside) played by `playToOutcome` (testing/driver.ts, which knows no
 * card names), at one, two and three players, standard and expert, several seeds each.
 *
 * Per game: no thrown error (the driver throws on a rejected command), an outcome and no pending prompt at the end,
 * the session log replays from the first state deep-equal (`replay`), and the log walked one command at a time
 * ends in the same state with every printed invariant below holding after every command.
 *
 * Reachability. The greedy player never wins a natural game: it has no plan beyond "attack whatever is attackable",
 * and Worlds Collide (a 2-threat target per player, MC55 p. 18) is completed within 3 to 10 rounds. Those games all
 * end in the same loss, asserted below. The win is reached from staged states (test surgery on the shared record, as
 * god-of-lies.test.ts does): Loki already flipped and one Avatar hit away from the last shatter, and Loki a flip away
 * with the greedy player doing the rest. Surgery is only on the table; every rule is exercised by real commands.
 */
const DEPS: EngineDeps = { abilities: mergeRegistries(WAVE8_ABILITIES, GOD_OF_LIES, TRICKSTER_MAGIC, TT_ASPECT_BASIC) };

const AVATARS = ["55029a", "55030a", "55031a", "55032a"] as const;
const ENVIRONMENTS = ["55052", "55053", "55054", "55055"] as const;
/** Intense Focus and Total Focus are the two faces of one card, 55034. */
const FOCUS = ["55034a"] as const;

type Seat = typeof SPIDER_MAN | typeof IRON_MAN | typeof SHE_HULK;
const SEATS: readonly Seat[] = [SPIDER_MAN, IRON_MAN, SHE_HULK];
type Difficulty = "standard" | "expert";

const open = (players: number, difficulty: Difficulty, seed: number): GameState => {
  const created = createGame(
    wave9Scenario("god-of-lies", { players: SEATS.slice(0, players), seed, difficulty }),
    DEPS,
  );
  if (!created.ok) throw new Error(created.error.message);
  return created.state;
};

/** The opening state with the setup prompts answered: the first player phase, nothing played yet. */
const opened = (players: number, difficulty: Difficulty, seed: number): GameState =>
  settle(open(players, difficulty, seed), firstLegal, (s) => s.step.phase === "player", DEPS);

const playerIds = (state: GameState): PlayerId[] => ([P1, P2, P3] as PlayerId[]).slice(0, state.startingPlayerCount);
const onTable = (s: GameState, code: string): InstanceId | undefined =>
  cardsInPlay(s).find((id) => codeOf(s, id) === code);
const maxHp = (s: GameState, id: InstanceId): number => maxHitPoints(s, id, DEPS)!;

// ---------------------------------------------------------------------------------------------------------------
// The walk: the log one command at a time, with the scenario's printed invariants checked after each
// ---------------------------------------------------------------------------------------------------------------

interface Stats {
  swaps: number;
  flips: number;
  steps: number;
}

/**
 * Invariants of the printed cards (MC55 pp. 18 to 23), after every command:
 * - Loki, God of Lies: 20 hit points per player, damage between 0 and that and never going down, flips at 10 per
 *   player remaining and never flips back (Loki, God of Lies A: "Max hit points"; p. 20 "flip when damage...").
 * - Loki is never defeated unless the game is won, and the game is won only when he is.
 * - Outside a pending prompt (a prompt mid-resolution may be inside Shatter the Illusion), the villain in play is an
 *   Avatar of Loki side A, never a Fading Figment, and a Fading Figment never sits in the villain deck as the active.
 * - Synergy: 4 Synergy environments in play all game, each holding 0 to (players in the group) synergy counters
 *   (Synergy environments: "Max 1 [per player] synergy counters here").
 * - Shatter counters never go negative; the Avatar is never marked defeated.
 */
/** `expect` is slow in a loop over every card of every command; the hot checks throw plainly. */
function must(ok: boolean, message: string): void {
  if (!ok) throw new Error(message);
}

function checkInvariants(prev: GameState, next: GameState, events: readonly GameEvent[], stats: Stats): void {
  const players = next.startingPlayerCount;
  const loki = sharedVillain(next)!;
  const before = sharedVillain(prev)!;
  expect(loki.hp, "Loki hit points").toBe(20 * players);
  expect(loki.flipAtRemaining, "Loki flips at").toBe(10 * players);
  expect(loki.damage, "Loki damage is never lost").toBeGreaterThanOrEqual(before.damage);
  expect(loki.damage).toBeGreaterThanOrEqual(0);
  if (before.flipped) expect(loki.flipped, "Loki does not flip back").toBe(true);
  if (loki.flipped)
    expect(loki.remaining, "flipped means 10 per player or fewer remain").toBeLessThanOrEqual(10 * players);
  if (loki.remaining > 10 * players) expect(loki.flipped, "not flipped above 10 per player").toBe(false);
  if (next.outcome?.result === "win") expect(loki.defeated, "a win means Loki fell").toBe(true);
  // Loki's fall waits for the whole Shatter the Illusion ability to finish (MC55 p. 20): a prompt inside it (the
  // deal order of step 3) may still be open with Loki defeated and the game not yet won.
  if (loki.defeated && !next.pendingChoice) expect(next.outcome?.result, "Loki fell means a win").toBe("win");

  stats.flips += events.filter((e) => e.type === "sharedResultApplied" && e.result === "sharedVillainFlipped").length;
  stats.swaps += events.filter((e) => e.type === "villainReplaced").length;

  if (!next.pendingChoice && !next.outcome) {
    expect(AVATARS, "the villain in play is an Avatar of Loki, side A").toContain(codeOf(next, next.activeVillainId));
    expect(next.villains.find((v) => v.instanceId === next.activeVillainId)).toMatchObject({
      side: "A",
      defeated: false,
    });
    // Max 1 [per player] synergy counters, on all four environments, throughout.
    for (const code of ENVIRONMENTS) {
      const env = onTable(next, code);
      must(env !== undefined, `${code} is not in play`);
      const synergy = next.instances[env!]!.counters["synergy"] ?? 0;
      must(
        synergy >= 0 && synergy <= players,
        `${code} holds ${synergy} synergy counters (max 1 per player of ${players})`,
      );
    }
  }
  for (const id of cardsInPlay(next)) {
    for (const [type, n] of Object.entries(next.instances[id]!.counters)) {
      must(n >= 0, `${codeOf(next, id)} has ${n} ${type} counters`);
      must(type !== "synergy" || /^5505[2-5]$/.test(codeOf(next, id)), `synergy counters on ${codeOf(next, id)}`);
    }
  }
  // Intense Focus / Total Focus never leave play once attached (ruling February 28, 2026, Ruling 3).
  for (const code of FOCUS) {
    const was = onTable(prev, code);
    if (was) must(onTable(next, code) !== undefined, `${code} left play`);
  }
  // Each swap leaves the Avatar slot with a different Avatar at 0 damage that the dial reads as printed (+ Focus).
  for (const e of events) {
    if (e.type !== "villainReplaced" || e.reason !== "swap") continue;
    expect(e.toCardId, "the swap picks another Avatar").not.toBe(e.fromCardId);
    expect(AVATARS as readonly string[]).toContain(e.toCardId as string);
  }
}

function walk(session: GameSession): { final: GameState; stats: Stats } {
  const stats: Stats = { swaps: 0, flips: 0, steps: 0 };
  let current = startSession(session.log.initialState);
  for (const command of session.log.commands) {
    const result = sessionApply(current, command, DEPS);
    if (!result.ok) throw new Error(`replayed ${command.type} refused: ${result.error.message}`);
    checkInvariants(current.state, result.session.state, result.events, stats);
    current = result.session;
    stats.steps++;
  }
  return { final: current.state, stats };
}

// ---------------------------------------------------------------------------------------------------------------
// Playing and tallying
// ---------------------------------------------------------------------------------------------------------------

interface Tally {
  readonly mode: string;
  readonly players: number;
  readonly difficulty: Difficulty;
  readonly outcome: GameOutcome;
  readonly rounds: number;
}
const tallies: Tally[] = [];

function playAndCheck(initial: GameState, mode: string, difficulty: Difficulty, maxCommands = 3000, mustFinish = true) {
  const run = playToOutcome(initial, DEPS, { maxCommands });
  const s = run.session.state;
  // No stuck prompt, no stall: the game ended and nothing is left to answer.
  if (mustFinish) expect(run.outcome, `no outcome after ${run.commands} commands, round ${run.rounds}`).not.toBeNull();
  expect(s.pendingChoice, "a prompt is still open at the end").toBeNull();
  // The log replays from the first state to a deep-equal state, by the engine's own replay and by the walk.
  const replayed = replay(run.session.log, DEPS);
  if (!replayed.ok) throw new Error(`replay failed: ${replayed.error.message}`);
  expect(replayed.state, "replay diverged").toEqual(s);
  const { final, stats } = walk(run.session);
  expect(final, "the walk diverged").toEqual(s);
  if (run.outcome)
    tallies.push({ mode, players: initial.startingPlayerCount, difficulty, outcome: run.outcome, rounds: run.rounds });
  return { run, state: s, stats };
}

afterAll(() => {
  const mix: Record<string, string> = {};
  for (const t of tallies) {
    const key = `${t.mode} ${t.difficulty} ${t.players}p`;
    const cell = `${t.outcome.result}:${t.outcome.reason}`;
    mix[key] = `${mix[key] ? `${mix[key]}, ` : ""}${cell}@r${t.rounds}`;
  }
  console.log("God of Lies greedy games", mix);
});

// ---------------------------------------------------------------------------------------------------------------
// Natural games: the greedy player from the printed setup to a finish
// ---------------------------------------------------------------------------------------------------------------

describe("God of Lies, natural greedy games (setup to finish)", () => {
  // Two seeds for one and two players, one for three (a three-player expert game costs about 15 s with its replays).
  // GOD_OF_LIES_FULL=1 plays more seeds of every configuration.
  const full =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.GOD_OF_LIES_FULL === "1";
  const configs: [number, Difficulty, readonly number[]][] = [
    [1, "standard", full ? [1, 2, 3, 4, 5] : [1, 2]],
    [1, "expert", full ? [1, 2, 3, 4, 5] : [1, 2]],
    [2, "standard", full ? [1, 2, 3, 4] : [1, 2]],
    [2, "expert", full ? [1, 2, 3, 4] : [1, 2]],
    [3, "standard", full ? [1, 2, 3] : [1]],
    [3, "expert", full ? [1, 2, 3] : [1]],
  ];
  for (const [players, difficulty, seeds] of configs)
    for (const seed of seeds)
      it(`${players} player${players > 1 ? "s" : ""}, ${difficulty}, seed ${seed}: plays to a finish, replays deep-equal, and the invariants hold`, () => {
        const initial = open(players, difficulty, seed);
        const { state, run } = playAndCheck(initial, "natural", difficulty);
        // Worlds Collide (the neutral main scheme) is what ends every greedy game: its completion loses (MC55 p. 18,
        // Worlds Collide B: "If this scheme is completed, the players lose" via the pod; Q9 = A, final player phase).
        expect(run.outcome).toMatchObject({ result: "loss", reason: "cardAbility" });
        const lost = run.outcome as Extract<GameOutcome, { result: "loss" }> & { sourceInstanceId?: InstanceId };
        expect(lost.sourceInstanceId).toBe(podOf(state).neutral!.mainSchemeInstanceId);
        expect(sharedScheme(state)!.threat).toBeGreaterThanOrEqual(0);
      });
});

// ---------------------------------------------------------------------------------------------------------------
// Staged games: the win and the flip, played out by the greedy player
// ---------------------------------------------------------------------------------------------------------------

/** Loki with `remaining` hit points left (flipped when at or below 10 per player), the Avatar one point from falling. */
function stageLoki(state: GameState, remaining: number, avatarDamage?: number): GameState {
  const players = state.startingPlayerCount;
  const shared = podOf(state).shared!;
  const lokiId = podOf(state).neutral!.villainInstanceId;
  const flipped = remaining <= 10 * players;
  let s: GameState = {
    ...state,
    pod: {
      ...podOf(state),
      shared: { ...shared, villainDamage: shared.villainHp - remaining, villainFlipped: flipped },
    },
    instances: { ...state.instances, [lokiId]: { ...state.instances[lokiId]!, flipped } },
  };
  const avatar = s.activeVillainId;
  s = patchInstance(s, avatar, {
    damage: avatarDamage ?? maxHp(s, avatar) - 1,
    statuses: { ...s.instances[avatar]!.statuses, tough: 0 },
  });
  return heroForm(s, ...playerIds(s));
}

describe("God of Lies, staged greedy games: the win is reachable", () => {
  for (const players of [1, 2, 3] as const)
    for (const difficulty of ["standard", "expert"] as const)
      it(`${players} player${players > 1 ? "s" : ""}, ${difficulty}: Loki flipped with one shatter left, the Avatar one hit from falling: the greedy player wins`, () => {
        // Q9 = A: a completion in a player phase is lost only at that phase's end unless Loki falls first, so the
        // win is not racing the scheme here; the Avatar's fall adds 5 per player shatter counters, which is exactly
        // Loki's remaining 5 per player.
        let won = 0;
        for (const seed of [1, 2]) {
          const initial = stageLoki(opened(players, difficulty, seed), 5 * players);
          const { state, run, stats } = playAndCheck(initial, "staged win", difficulty);
          if (run.outcome!.result === "win") {
            won++;
            expect(sharedVillain(state)).toMatchObject({ defeated: true, flipped: true });
            expect(stats.swaps, "the last Avatar is not swapped, Loki falls first").toBeGreaterThanOrEqual(0);
          }
        }
        expect(won, "the greedy player wins at least one of the seeds").toBeGreaterThanOrEqual(1);
      });
});

describe("God of Lies, staged greedy games: the flip at 10 per player", () => {
  for (const players of [1, 2, 3] as const)
    for (const difficulty of ["standard", "expert"] as const)
      it(`${players} player${players > 1 ? "s" : ""}, ${difficulty}: the first shatter takes Loki past 10 per player; Focus is attached to the Avatar swapped in`, () => {
        const initial = stageLoki(opened(players, difficulty, 1), 10 * players + 1);
        const { state, stats } = playAndCheck(initial, "staged flip", difficulty, 70, false);
        expect(stats.swaps, "an Avatar was shattered and swapped").toBeGreaterThanOrEqual(1);
        expect(stats.flips, "Loki flipped once").toBe(1);
        expect(sharedVillain(state)!.flipped).toBe(true);
        // Standard flips to Intense Focus on the Avatar; expert turns it into Total Focus (docs 3.59, Q10 = B).
        const focus = onTable(state, "55034a");
        // Intense/Total Focus is attached to whichever Avatar is in play (it never leaves play, February 28, 2026).
        expect(focus, "Focus on the table after the flip").toBeDefined();
        expect(state.instances[focus!]!.attachedTo).toBe(state.activeVillainId);
      });
});

// ---------------------------------------------------------------------------------------------------------------
// The Avatar swap carries the dial, counters and status cards
// ---------------------------------------------------------------------------------------------------------------

describe("God of Lies, Shatter the Illusion swap (ruling February 28, 2026, Ruling 3)", () => {
  for (const players of [1, 2, 3] as const)
    it(`${players} player${players > 1 ? "s" : ""}, expert: Total Focus, other counters and status cards stay on the Avatar; the dial is the printed value plus Focus`, () => {
      let s = stageLoki(opened(players, "expert", 1), 20 * players);
      const avatar = s.activeVillainId;
      const focus = onTable(s, "55034a")!;
      const printed = 15 * players;
      expect(s.instances[focus]!.attachedTo).toBe(avatar);
      // A counter and two status cards the swap must leave alone; no shatter counters are staged (they are removed).
      s = patchInstance(s, avatar, {
        counters: { ...s.instances[avatar]!.counters, hinder: 2 },
        statuses: { stunned: 1, confused: 1, tough: 0 },
      });
      const before = s.instances[avatar]!;
      const code = codeOf(s, avatar);
      const hero = identityOf(s, P1);
      const result = applyCommand(
        patchInstance(s, hero, { exhausted: false }),
        { type: "basicAttack", playerId: P1, attackerInstanceId: hero, targetInstanceId: avatar },
        DEPS,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // A prompt (a trigger or a choice) may stand in the way; settle it with the first option each time.
      let after = result.state;
      for (let guard = 0; after.pendingChoice && guard < 50; guard++) {
        const choice = after.pendingChoice;
        const next = applyCommand(
          after,
          {
            type: "resolveChoice",
            playerId: choice.playerId,
            choiceId: choice.choiceId,
            selectedOptionIds: choice.options.slice(0, Math.max(choice.minSelections, 0)).map((o) => o.optionId),
          },
          DEPS,
        );
        if (!next.ok) throw new Error(next.error.message);
        after = next.state;
      }
      expect(after.activeVillainId, "same villain slot").toBe(avatar);
      expect(codeOf(after, avatar), "another Avatar").not.toBe(code);
      expect(AVATARS as readonly string[]).toContain(codeOf(after, avatar));
      const now = after.instances[avatar]!;
      expect(now.attachments, "Focus and every attachment stay").toEqual(before.attachments);
      expect(onTable(after, "55034a")).toBe(focus);
      expect(now.counters["hinder"], "other counters stay").toBe(2);
      expect(now.counters["shatter"] ?? 0, "the shatter counters were spent on Loki").toBe(0);
      expect(now.statuses, "status cards stay").toMatchObject({ stunned: 1, confused: 1 });
      expect(now.damage, "the dial is reset").toBe(0);
      expect(maxHp(after, avatar), "printed value plus Focus's bonus (Q8 = A)").toBeGreaterThanOrEqual(printed);
      // Loki took exactly the 5 per player shatter counters.
      expect(sharedVillain(after)!.damage).toBe(5 * players);
    });
});
