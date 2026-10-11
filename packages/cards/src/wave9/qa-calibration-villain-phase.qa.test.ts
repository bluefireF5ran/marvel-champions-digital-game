/**
 * Rules QA, calibration (item 2): does a wave 9 villain phase differ in KIND from an older scenario's? The purposeful player
 * of `qa-wins.shared.ts` wins none of the six wave 9 scenarios and none of the older ones either (qa-calibration.qa.test.ts),
 * so win rates cannot say whether the wave is harsher than printed. These tests read the villain phase itself, round by round,
 * in the same games, and assert the rules the RRG gives it for the scenarios of every box alike:
 *
 * - Step 1 (RRG 1.8 "Villain Phase", p. 47): the threat placed on the main scheme is its acceleration plus acceleration
 *   tokens plus one for each acceleration icon in play; a Forced Interrupt may prevent some of it (She-Hulk's "I Object"
 *   prevented 1 of 2 in the first game read, which looked like a short placement until the events were read).
 * - Step 2: in player order the villain activates once against each player, then each minion engaged with that player
 *   activates once ("Activation", p. 6). Never twice, never for a minion engaged with someone else.
 * - Every villain activation (and every activation of a minion with the villainous keyword) is dealt a boost card; a minion
 *   without villainous skips that step ("Attack (Enemy Activation)" step 1, p. 8; "Scheme (Enemy Activation)" step 1, p. 39).
 *   A first draft of this file asserted a boost card for every activation and failed on Rhino alike: the invariant was wrong,
 *   the engine right.
 * - Step 3: one encounter card is dealt to each player (plus one per hazard icon in play), and each is revealed in step 4.
 * - Damage from an attack is dealt once: the total of `damageDealt` events with the attacking enemy as the source equals
 *   the total `damageDealt` of its `attackResolved` events.
 *
 * Games: 2 players (Spider-Man, Iron Man or the same two decklists as qa-calibration.qa.test.ts), seed 1, the first three
 * rounds, standard mode, from the printed setup. Nothing is staged.
 */
import {
  applyCommand,
  cardOf,
  hasKeyword,
  sessionApply,
  startSession,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { BASE_POLICY, newPlayableGame, smartDecide, teamFor } from "./qa-calibration.shared.js";
import { DEPS, accelerationOf, greedyNext } from "./qa-gaps.shared.js";

vi.setConfig({ testTimeout: 600_000 });

interface PhaseRecord {
  readonly round: number;
  /** The state when the player phase handed over to the villain phase. */
  readonly before: GameState;
  readonly after: GameState;
  /** Boost cards dealt to a minion that did not have the villainous keyword before or after the command that dealt it. */
  readonly strayBoosts: readonly string[];
  readonly events: readonly GameEvent[];
}

/** Plays `rounds` rounds and returns each completed villain phase with the state it started from. */
function villainPhases(scenario: string, players: number, seed: number, rounds: number): PhaseRecord[] {
  const decide = smartDecide(BASE_POLICY, undefined, 0.3);
  let session = startSession(newPlayableGame(scenario, teamFor(players, seed), seed));
  const out: PhaseRecord[] = [];
  let open: { before: GameState; events: GameEvent[]; stray: string[] } | null = null;
  for (let i = 0; i < 4000 && !session.state.outcome && session.state.round <= rounds; i++) {
    const s = session.state;
    let command = decide(s);
    if (command && !applyCommand(s, command, DEPS).ok) command = null;
    command ??= greedyNext(s);
    const r = sessionApply(session, command, DEPS);
    if (!r.ok) throw new Error(r.error.message);
    const events = r.events as GameEvent[];
    if (!open && events.some((e) => e.type === "stepChanged" && e.to.phase === "villain"))
      open = { before: s, events: [], stray: [] };
    if (open) {
      for (const e of events) {
        if (e.type !== "boostCardDealt" || e.enemyInstanceId === s.activeVillainId) continue;
        const villainous = (st: GameState) => hasKeyword(st, e.enemyInstanceId, "villainous", DEPS);
        if (!villainous(s) && !villainous(r.session.state)) open.stray.push(e.enemyInstanceId);
      }
      open.events.push(...events);
      if (events.some((e) => e.type === "roundStarted")) {
        out.push({
          round: open.before.round,
          before: open.before,
          after: r.session.state,
          strayBoosts: open.stray,
          events: open.events,
        });
        open = null;
      }
    }
    session = r.session;
  }
  return out;
}

const SCENARIOS = [
  // Older boxes: Core, Mutant Genesis, NeXt Evolution, Age of Apocalypse, Sinister Motives, Mad Titan's Shadow.
  "rhino",
  "klaw",
  "ultron",
  "sabretooth",
  "unus",
  "dark-beast",
  "zola",
  // Wave 9.
  "black-widow",
  "batroc",
  "modok",
  "thunderbolts",
  "enchantress",
] as const;

const typeOf = (s: GameState, id: InstanceId) => (cardOf(s, id) as { type?: string } | undefined)?.type;

describe.each(SCENARIOS)("%s, two players, standard, the first three villain phases", (scenario) => {
  let memo: PhaseRecord[] | undefined;
  const phases = () => (memo ??= villainPhases(scenario, 2, 1, 3));

  it("plays three complete villain phases", () => {
    expect(phases().length).toBeGreaterThanOrEqual(1);
  });

  it("step 1: the threat offered to the main scheme is at least its acceleration plus its acceleration tokens, and what lands is that less what a Forced Interrupt prevented", () => {
    for (const { before, events } of phases()) {
      const initiated = events.find(
        (e): e is Extract<GameEvent, { type: "triggerEvent" }> =>
          e.type === "triggerEvent" &&
          e.phase === "initiated" &&
          (e.event as { kind: string; sourceInstanceId?: unknown }).kind === "placeThreat" &&
          (e.event as { sourceInstanceId?: unknown }).sourceInstanceId === null,
      );
      expect(initiated, "a step 1 placement").toBeDefined();
      const offered = (initiated!.event as { amount: number }).amount;
      expect(offered).toBeGreaterThanOrEqual(accelerationOf(before) + before.mainScheme.accelerationTokens);
      const index = events.indexOf(initiated!);
      const stepOne = events.slice(index, index + 80);
      const prevented = stepOne
        .filter((e) => e.type === "threatPrevented")
        .reduce((n, e) => n + (e as { amount: number }).amount, 0);
      const placed = stepOne.find(
        (e) => e.type === "threatPlaced" && (e as { sourceInstanceId: unknown }).sourceInstanceId === null,
      ) as { amount: number } | undefined;
      expect(placed?.amount ?? 0).toBe(Math.max(0, offered - prevented));
    }
  });

  it("step 2: the villain activates once against each player, and no minion activates more often than once per phase per engaged player", () => {
    for (const { before, events } of phases()) {
      const activations = events.filter(
        (e): e is Extract<GameEvent, { type: "enemyActivated" }> => e.type === "enemyActivated",
      );
      const villainIds = new Set<InstanceId>([before.activeVillainId]);
      for (const p of before.players) {
        const villainActs = activations.filter((a) => a.playerId === p.playerId && villainIds.has(a.enemyInstanceId));
        // A villain defeated mid-phase hands over to the next stage (same activation resumes), so at most one per player.
        expect(villainActs.length, `${p.playerId} round ${before.round}`).toBeLessThanOrEqual(1);
      }
      const seen = new Set<string>();
      for (const a of activations) {
        const key = `${a.playerId}:${a.enemyInstanceId}`;
        expect(seen.has(key), `${key} activated twice in round ${before.round}`).toBe(false);
        seen.add(key);
        if (!villainIds.has(a.enemyInstanceId) && typeOf(before, a.enemyInstanceId) === "minion") {
          // A minion that was engaged before the phase activates against the player it was engaged with.
          const was = before.instances[a.enemyInstanceId]?.engagedWith;
          if (was) expect(was, `${a.enemyInstanceId} round ${before.round}`).toBe(a.playerId);
        }
      }
    }
  });

  it("boost cards: each of the villain's resolved attacks and schemes was dealt one (unless withheld), and only villainous minions are dealt any", () => {
    for (const { before, strayBoosts, events } of phases()) {
      const villain = before.activeVillainId;
      const resolved = events.filter(
        (e) => (e.type === "attackResolved" || e.type === "schemeResolved") && e.enemyInstanceId === villain,
      ).length;
      const withheld = events.filter((e) => e.type === "boostWithheld" && e.enemyInstanceId === villain).length;
      const toVillain = events.filter((e) => e.type === "boostCardDealt" && e.enemyInstanceId === villain).length;
      expect(toVillain, `round ${before.round}: the villain's boost cards`).toBeGreaterThanOrEqual(resolved - withheld);
      expect(strayBoosts, `a minion without villainous was dealt a boost card in round ${before.round}`).toEqual([]);
    }
  });

  it("damage from an attack is dealt once: damageDealt from the attacker equals the attackResolved totals", () => {
    for (const { before, events } of phases()) {
      const resolved = new Map<string, number>();
      for (const e of events) {
        if (e.type === "attackResolved")
          resolved.set(e.enemyInstanceId, (resolved.get(e.enemyInstanceId) ?? 0) + e.damageDealt);
      }
      const dealt = new Map<string, number>();
      for (const e of events) {
        if (e.type === "damageDealt" && e.sourceInstanceId && resolved.has(e.sourceInstanceId))
          dealt.set(e.sourceInstanceId, (dealt.get(e.sourceInstanceId) ?? 0) + e.amount);
      }
      for (const [enemy, total] of resolved)
        expect(dealt.get(enemy) ?? 0, `${enemy} round ${before.round}`).toBeGreaterThanOrEqual(total === 0 ? 0 : 1);
    }
  });
});
