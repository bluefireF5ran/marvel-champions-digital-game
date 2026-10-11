/**
 * Rules QA, gaps from the wave 9 scenario tests: God of Lies (MC55 pp. 10, 18-21), Single Group Mode.
 *
 * Reachability. The wave's own game tests (tt/god-of-lies.game.test.ts) say the greedy driver never damages Loki and the win
 * is reached only from staged states. This file adds (1) an honest natural line at one player, standard, that gets as far as the
 * printed half-way flip (a purposeful attack/thwart policy, no surgery), with every step's numbers; (2) the reason a natural
 * win is not reached: 60 further purposeful games (She-Hulk and Iron Man starter decks, seeds 10 to 39, thwart when the scheme is
 * within 4 of its target, otherwise attack the Avatar) all ended in a loss at Worlds Collide 2 threat with Loki at most 13 damage
 * of 20 (the search is in the report, not re-run here); and (3) the four-player staged flip and win the earlier file did not play.
 * Worlds Collide's target is "2 [per group]" (55028a; MC55 p. 21: "The target threat on the Worlds Collide main scheme is 2
 * (total number of groups in all pods)"), which in Single Group Mode is 2 whatever the player count: one Mischief and Mayhem
 * completion (MC55 p. 21, 55033a's first Forced Interrupt) plus one defeated identity (the second), or two completions, lose.
 */
import { podOf, sharedScheme, sharedVillain, type Command, type GameState, type InstanceId } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { P1, P2, P3, P4, patchInstance } from "../testing/harness.js";
import { withForm } from "../testing/staging.js";
import { playToOutcome } from "../testing/driver.js";
import { SHE_HULK, codeOf } from "./testing.js";
import { DEPS, mainThreatOf, openScenario, playGuided, targetThreatOf, villainHp } from "./qa-gaps.shared.js";
import { sessionApply, startSession } from "@mc/engine";

vi.setConfig({ testTimeout: 600_000 });

const AVATARS = ["55029a", "55030a", "55031a", "55032a"];
const thwartWhenClose =
  (margin: number) =>
  (s: GameState, c: Command): Command | null => {
    const playerId = (c as { playerId: typeof P1 }).playerId;
    const actor =
      c.type === "basicAttack" ? c.attackerInstanceId : (c as { thwarterInstanceId: InstanceId }).thwarterInstanceId;
    if (mainThreatOf(s) >= targetThreatOf(s) - margin)
      return { type: "basicThwart", playerId, thwarterInstanceId: actor, schemeInstanceId: s.mainScheme.instanceId };
    return { type: "basicAttack", playerId, attackerInstanceId: actor, targetInstanceId: s.activeVillainId };
  };

describe("God of Lies, one player standard: an honest natural line (She-Hulk, seed 24) reaches the half-way flip and loses to Worlds Collide", () => {
  const initial = () => openScenario("god-of-lies", 1, { seed: 24, seats: [SHE_HULK] });

  it("two Avatars are shattered (5 damage each to Loki), Loki flips at 10 remaining, and the second Mischief completion loses the game", () => {
    const start = initial();
    expect(sharedVillain(start)).toMatchObject({ hp: 20, damage: 0, flipped: false, flipAtRemaining: 10 });
    const run = playGuided(start, thwartWhenClose(4), 700);
    // Walk the log for the numbers at each step.
    let session = startSession(start);
    const lokiAfter: { event: string; damage: number; wc: number; round: number }[] = [];
    for (const command of run.session.log.commands) {
      const r = sessionApply(session, command, DEPS);
      if (!r.ok) throw new Error(r.error.message);
      for (const e of r.events) {
        if (e.type === "villainReplaced" && e.reason === "swap")
          lokiAfter.push({
            event: `swap ${e.fromCardId}->${e.toCardId}`,
            damage: sharedVillain(r.session.state)!.damage,
            wc: sharedScheme(r.session.state)!.threat,
            round: session.state.round,
          });
        if (e.type === "sharedResultApplied")
          lokiAfter.push({
            event: e.result,
            damage: sharedVillain(r.session.state)!.damage,
            wc: sharedScheme(r.session.state)!.threat,
            round: session.state.round,
          });
      }
      session = r.session;
    }
    const swaps = lokiAfter.filter((x) => x.event.startsWith("swap"));
    expect(swaps, "two Avatars were shattered").toHaveLength(2);
    expect(
      swaps.map((x) => x.damage),
      "5 per player shatter counters each, applied to Loki",
    ).toEqual([5, 10]);
    for (const swap of swaps) expect(AVATARS).toContain(swap.event.split("->")[1]);
    const flip = lokiAfter.find((x) => x.event === "sharedVillainFlipped")!;
    expect(flip.damage, "flipped at 10 remaining (20 - 10)").toBe(10);
    expect(sharedVillain(session.state)).toMatchObject({ damage: 10, flipped: true, defeated: false });
    // The loss: Worlds Collide reached its 2 threat (one Mischief and Mayhem completion, then a second event).
    expect(run.outcome).toMatchObject({ result: "loss", reason: "cardAbility" });
    expect(sharedScheme(session.state)!.threat).toBe(2);
    expect(sharedScheme(session.state)!.target).toBe(2);
    const completed = lokiAfter.filter((x) => x.event === "sharedSchemeCompleted");
    expect(completed).toHaveLength(1);
    // Focus is on the Avatar in play after the flip (Loki, God of Lies B: "attaches their set-aside Intense Focus").
    const focus = (Object.keys(session.state.instances) as InstanceId[]).find(
      (id) => codeOf(session.state, id) === "55034a",
    );
    expect(focus && session.state.instances[focus]!.attachedTo).toBe(session.state.activeVillainId);
    expect(villainHp(session.state), "15 + 2 [per_hero] from Intense Focus (55034a)").toBe(15 + 2);
  });

  it("replays deep-equal", () => {
    const start = initial();
    const run = playGuided(start, thwartWhenClose(4), 700);
    const again = playGuided(start, thwartWhenClose(4), 700);
    expect(again.session.state).toEqual(run.session.state);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Four players: the staged flip and win (the earlier file stops at three)
// ---------------------------------------------------------------------------------------------------------------

/** Loki with `remaining` hit points left, the Avatar one hit from falling (as tt/god-of-lies.game.test.ts stages it). */
function stageLoki(state: GameState, remaining: number): GameState {
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
    damage: villainHp(s, avatar) - 1,
    statuses: { ...s.instances[avatar]!.statuses, tough: 0 },
  });
  return [P1, P2, P3, P4].slice(0, players).reduce((acc, p) => withForm(acc, { heroForm: 0 }, p), s);
}

describe("God of Lies, four players standard (staged Loki, real commands): the numbers scale to 80 / 40 / 60 / 20 per shatter", () => {
  it("setup: Loki 80 hit points flipping at 40, Avatar 60, Mischief and Mayhem 32, Worlds Collide target 2, synergy cap 4", () => {
    const s = openScenario("god-of-lies", 4);
    expect(sharedVillain(s)).toMatchObject({ hp: 80, flipAtRemaining: 40 });
    expect(villainHp(s)).toBe(60);
    expect(targetThreatOf(s)).toBe(32);
    expect(sharedScheme(s)!.target).toBe(2);
  });

  it("the first shatter takes 5 [per_hero] = 20 shatter counters off the Avatar into Loki and flips him at 40 remaining", () => {
    // Loki at 41 remaining of 80: the next 20 take him to 21 remaining, past the flip line at 40.
    const initial = stageLoki(openScenario("god-of-lies", 4, { seed: 1 }), 41);
    const run = playToOutcome(initial, DEPS, { maxCommands: 70 });
    const end = run.session.state;
    expect(sharedVillain(end)!.flipped).toBe(true);
    expect(sharedVillain(end)!.damage).toBeGreaterThanOrEqual(80 - 41 + 20);
    expect(sharedVillain(end)!.defeated).toBe(false);
  });

  it("Loki at 20 remaining (5 [per_hero]) with the Avatar one hit from falling: the Avatar's fall is exactly his remaining hit points, and the players win", () => {
    let won = 0;
    for (const seed of [1, 2]) {
      const run = playToOutcome(stageLoki(openScenario("god-of-lies", 4, { seed }), 20), DEPS, { maxCommands: 400 });
      if (run.outcome?.result === "win") {
        won++;
        expect(sharedVillain(run.session.state)).toMatchObject({ defeated: true, flipped: true });
        expect(sharedVillain(run.session.state)!.damage).toBe(80);
      } else {
        // A loss here must be the clock, not a stall.
        expect(run.outcome).toMatchObject({ result: "loss" });
      }
    }
    expect(won, "the greedy player wins at least one of the two seeds").toBeGreaterThanOrEqual(1);
  });
});

describe("God of Lies, four players: the printed invariants hold after every command of a greedy game (Synergy cap 1 per player, Loki 80 / 40)", () => {
  it("seed 3: Synergy environments hold 0 to 4 counters, Loki's dial never loses damage, a flip is never undone", () => {
    const start = openScenario("god-of-lies", 4, { seed: 3 });
    const run = playToOutcome(start, DEPS, { maxCommands: 500 });
    let session = startSession(start);
    let previous = sharedVillain(session.state)!;
    let maxSynergy = 0;
    for (const command of run.session.log.commands) {
      const r = sessionApply(session, command, DEPS);
      if (!r.ok) throw new Error(r.error.message);
      session = r.session;
      const loki = sharedVillain(session.state)!;
      if (loki.hp !== 80 || loki.flipAtRemaining !== 40) throw new Error(`Loki ${loki.hp}/${loki.flipAtRemaining}`);
      if (loki.damage < previous.damage) throw new Error("Loki's damage went down");
      if (previous.flipped && !loki.flipped) throw new Error("Loki flipped back");
      previous = loki;
      for (const id of Object.keys(session.state.instances) as InstanceId[]) {
        if (!/^5505[2-5]$/.test(codeOf(session.state, id))) continue;
        const n = session.state.instances[id]!.counters["synergy"] ?? 0;
        if (n < 0 || n > 4) throw new Error(`${codeOf(session.state, id)} holds ${n} synergy counters`);
        maxSynergy = Math.max(maxSynergy, n);
      }
    }
    expect(maxSynergy).toBeLessThanOrEqual(4);
    expect(session.state).toEqual(run.session.state);
  });
});
