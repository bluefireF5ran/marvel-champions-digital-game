/**
 * Rules QA, gaps from the wave 9 scenario tests: three and four players. Every number below is a printed value read from
 * the card (docs/phase7-wave9.md section 1.4's scan-checked table, the MC50 / MC55 card transcriptions in
 * packages/content) multiplied by the player count under RRG 1.8 "Per Hero" / "[per_hero]" (p. 34), and the setup order
 * is RRG 1.8 Appendix II "Game Setup" (pp. 50 and 51, steps 12 and 14). First-player passing is RRG 1.8 "First Player"
 * (p. 19) and "Villain Phase" step 5 (p. 47). Cards dealt to each player are the villain phase's step 3 (p. 47).
 */
import { describe, expect, it, vi } from "vitest";
import {
  cardsInPlay,
  iconsInPlay,
  sharedScheme,
  sharedVillain,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { inst } from "../testing/harness.js";
import { codeOf } from "./testing.js";
import {
  DEPS,
  accelerationOf,
  countersOf,
  handSizeOf,
  idleRounds,
  inPlayAll,
  mainThreatOf,
  openScenario,
  targetThreatOf,
  villainHp,
} from "./qa-gaps.shared.js";

vi.setConfig({ testTimeout: 300_000 });

const COUNTS = [1, 2, 3, 4] as const;
const pid = (n: number) => `p${n}` as PlayerId;

const minionsEngagedWith = (s: GameState, player: PlayerId): InstanceId[] =>
  cardsInPlay(s).filter((id) => inst(s, id).engagedWith === player);

describe("every scenario: the opening hand is the printed hand size at three and four players (RRG Setup step 14, p. 51)", () => {
  for (const scenario of ["black-widow", "batroc", "modok", "baron-zemo", "thunderbolts", "enchantress", "god-of-lies"])
    for (const n of [3, 4])
      it(`${scenario}, ${n} players`, () => {
        const s = openScenario(scenario, n);
        expect(s.startingPlayerCount).toBe(n);
        expect(s.players).toHaveLength(n);
        for (const p of s.players) expect(p.hand.length, `${p.playerId} hand`).toBe(handSizeOf(s, p.playerId));
        expect(s.firstPlayerId).toBe("p1");
      });
});

describe("Black Widow (MC50 p. 9; 50064, 50067a): the per-hero numbers and one searched minion per player", () => {
  for (const n of COUNTS)
    it(`${n} player(s)`, () => {
      const s = openScenario("black-widow", n);
      expect(villainHp(s)).toBe(13 * n); // 50064 stage 1: 13 [per_hero]
      expect(mainThreatOf(s)).toBe(2 * n); // 50067a: starting threat 2 [per_hero]
      expect(targetThreatOf(s)).toBe(10 * n);
      // X = Black Widow's stage number (1), per hero
      // 50067a Setup: "Each player searches the encounter deck for a minion and puts it into play engaged with them."
      for (let i = 1; i <= n; i++) {
        const mine = minionsEngagedWith(s, pid(i));
        expect(mine, `p${i}'s minion`).toHaveLength(1);
        expect(DEPS.abilities).toBeDefined();
      }
      const all = new Set(s.players.flatMap((p) => minionsEngagedWith(s, p.playerId)));
      expect(all.size).toBe(n);
    });
  for (const n of [3, 4])
    it(`${n} players, expert: Black Widow (II), and her When Revealed adds 2 [per_hero] threat to the scheme's 2 [per_hero]`, () => {
      const s = openScenario("black-widow", n, { difficulty: "expert" });
      expect(villainHp(s)).toBe(16 * n); // 50065 stage 2
      expect(mainThreatOf(s)).toBe(2 * n + 2 * n);
    });
});

describe("Batroc (MC50 p. 11; 50086a, 50087a, 50090a): fixed hit points, 6 / 12 / 1 per hero, Alert Level", () => {
  for (const n of COUNTS)
    it(`${n} player(s)`, () => {
      const s = openScenario("batroc", n);
      expect(villainHp(s)).toBe(8); // not per hero
      expect(mainThreatOf(s)).toBe(6 * n);
      expect(targetThreatOf(s)).toBe(12 * n);
      expect(accelerationOf(s)).toBe(1 * n);
      const alert = inPlayAll(s, "50090a");
      expect(alert).toHaveLength(1);
      expect(countersOf(s, alert[0]!).threat ?? inst(s, alert[0]!).threat ?? 0).toBe(0);
      // "Set each Rescued Captive ally aside": none in play.
      expect(inPlayAll(s, "50091")).toHaveLength(0);
    });
  for (const n of [3, 4])
    it(`${n} players, expert: Batroc (B) 12 hit points and 2 [per_hero] threat on Alert Level`, () => {
      const s = openScenario("batroc", n, { difficulty: "expert" });
      expect(villainHp(s)).toBe(12);
      const alert = inPlayAll(s, "50090a")[0]!;
      expect(inst(s, alert).threat).toBe(2 * n);
    });
});

describe("M.O.D.O.K. (MC50 p. 13; 50103a, 50104a, 50106a-50108a, 50113): lock counters and Adaptoids scale per player", () => {
  for (const n of COUNTS)
    it(`${n} player(s)`, () => {
      const s = openScenario("modok", n);
      expect(villainHp(s)).toBe(10);
      // 1 [per_hero] starting threat, plus incite 1 on each of the n revealed Adaptoids when Flying Upgrade (50109) is the
      // random environment (50109: "Each Adaptoid ... gains incite 1"; RRG "Incite", MC55 p. 2: when revealed, place X threat).
      const incite = inPlayAll(s, "50109").length > 0 ? n : 0;
      expect(mainThreatOf(s)).toBe(1 * n + incite);
      expect(targetThreatOf(s)).toBe(7 * n);
      expect(accelerationOf(s)).toBe(1 * n);
      // The Holding Cell enters play with 2 [per_hero] lock counters (50105a-50108a).
      const cells = ["50105a", "50106a", "50107a", "50108a"].flatMap((c) => inPlayAll(s, c));
      expect(cells).toHaveLength(1);
      expect(countersOf(s, cells[0]!).lock).toBe(2 * n);
      // Setup: "Each player searches the encounter deck for a copy of Adaptoid and reveals it": n Adaptoids, one engaged with each.
      expect(inPlayAll(s, "50113")).toHaveLength(n);
      for (let i = 1; i <= n; i++) expect(minionsEngagedWith(s, pid(i)).map((id) => codeOf(s, id))).toEqual(["50113"]);
      // One random Adaptoid environment in standard mode.
      const upgrades = ["50109", "50110", "50111", "50112"].flatMap((c) => inPlayAll(s, c));
      expect(upgrades).toHaveLength(1);
    });
  for (const n of [3, 4])
    it(`${n} players, expert: two Adaptoid environments, M.O.D.O.K. (B) with 14 hit points`, () => {
      const s = openScenario("modok", n, { difficulty: "expert" });
      expect(villainHp(s)).toBe(14);
      expect(["50109", "50110", "50111", "50112"].flatMap((c) => inPlayAll(s, c))).toHaveLength(2);
      expect(inPlayAll(s, "50113")).toHaveLength(n);
    });
});

describe("Baron Zemo (MC50 p. 18; 50165a, 50167a, 50181a-50183a): 12 hit points, 2 / 12 / 2 per hero, 2 secrets on each member", () => {
  for (const n of COUNTS)
    it(`${n} player(s)`, () => {
      const s = openScenario("baron-zemo", n);
      expect(villainHp(s)).toBe(12);
      expect(mainThreatOf(s)).toBe(2 * n);
      expect(targetThreatOf(s)).toBe(12 * n);
      expect(accelerationOf(s)).toBe(2 * n);
      for (const code of ["50181a", "50182a", "50183a"]) {
        const member = inPlayAll(s, code);
        expect(member, code).toHaveLength(1);
        expect(countersOf(s, member[0]!).secret, `${code} secret counters (not per player)`).toBe(2);
      }
    });
  for (const n of [3, 4])
    it(`${n} players, expert: Baron Zemo (B1) 16 hit points; a member flips at 3 secrets`, () => {
      const s = openScenario("baron-zemo", n, { difficulty: "expert" });
      expect(villainHp(s)).toBe(16);
      expect(mainThreatOf(s)).toBe(2 * n);
    });
});

describe("Thunderbolts (MC50 p. 15; 50129a, 50130a, 50131a): 12 per hero, 1 / 11 / 1, one minion per player and one attached", () => {
  for (const n of COUNTS)
    it(`${n} player(s)`, () => {
      const s = openScenario("thunderbolts", n);
      expect(villainHp(s)).toBe(12 * n);
      expect(mainThreatOf(s)).toBe(1 * n);
      expect(targetThreatOf(s)).toBe(11 * n);
      expect(accelerationOf(s)).toBe(1 * n);
      // "Each player reveals a random set-aside Thunderbolt minion": one engaged with each; the remaining one attached to 50131.
      for (let i = 1; i <= n; i++) expect(minionsEngagedWith(s, pid(i)), `p${i}`).toHaveLength(1);
      const justice = inPlayAll(s, "50131a").concat(inPlayAll(s, "50131b"));
      expect(justice).toHaveLength(1);
      expect(inst(s, justice[0]!).attachments).toHaveLength(1);
    });
});

describe("Enchantress (MC55 p. 6; 55001, 55004a): 15 per hero, 1 / 6 / 1, a Hypnotic Gaze on each identity", () => {
  for (const n of COUNTS)
    it(`${n} player(s)`, () => {
      const s = openScenario("enchantress", n);
      expect(villainHp(s)).toBe(15 * n);
      expect(mainThreatOf(s)).toBe(1 * n);
      expect(targetThreatOf(s)).toBe(6 * n);
      expect(accelerationOf(s)).toBe(1 * n);
      const gazes = ["55007a", "55008a", "55009a", "55010a", "55011a"].flatMap((c) => inPlayAll(s, c));
      expect(gazes).toHaveLength(n);
      const hosts = new Set(gazes.map((g) => inst(s, g).attachedTo));
      expect(hosts.size).toBe(n);
      for (const p of s.players) expect(hosts.has(p.identity.instanceId)).toBe(true);
      // Future of Despair is set aside.
      expect(inPlayAll(s, "55006")).toHaveLength(0);
    });
});

describe("God of Lies (MC55 pp. 10, 18-21; 55027a, 55028a, 55029a-55032a, 55033a, 55052-55055)", () => {
  for (const n of COUNTS)
    it(`${n} player(s), standard: Loki ${20 * n} hit points flipping at ${10 * n}, Avatar ${15 * n}, Mischief and Mayhem ${8 * n}, Worlds Collide target 2 (per group)`, () => {
      const s = openScenario("god-of-lies", n);
      const loki = sharedVillain(s)!;
      expect(loki.hp).toBe(20 * n);
      expect(loki.flipAtRemaining).toBe(10 * n);
      expect(loki.damage).toBe(0);
      expect(loki.flipped).toBe(false);
      const wc = sharedScheme(s)!;
      expect(wc.threat).toBe(0);
      expect(wc.target).toBe(2); // 2 [per_group], one group in Single Group Mode, whatever the player count
      expect(villainHp(s)).toBe(15 * n); // Loki the Rascal (55029a)
      expect(mainThreatOf(s)).toBe(0);
      expect(targetThreatOf(s)).toBe(8 * n);
      expect(accelerationOf(s)).toBe(1 * n);
      // Four Synergy environments in play, none yet holding more than 1 per player.
      for (const code of ["55052", "55053", "55054", "55055"]) {
        const env = inPlayAll(s, code);
        expect(env, code).toHaveLength(1);
        expect(countersOf(s, env[0]!).synergy ?? 0).toBeLessThanOrEqual(n);
      }
      // Standard mode: Intense Focus is set aside; expert attaches it.
      expect(inPlayAll(s, "55034a")).toHaveLength(0);
    });
  for (const n of [3, 4])
    it(`${n} players, expert: Intense Focus (Total Focus) is attached to the Avatar at setup (55033a Setup step 3)`, () => {
      const s = openScenario("god-of-lies", n, { difficulty: "expert" });
      const focus = inPlayAll(s, "55034a");
      expect(focus).toHaveLength(1);
      expect(inst(s, focus[0]!).attachedTo).toBe(s.activeVillainId);
    });
});

describe("first-player passing and the encounter cards dealt to each player, round after round", () => {
  const scenarios = ["black-widow", "batroc", "modok", "baron-zemo", "thunderbolts", "enchantress", "god-of-lies"];
  for (const scenario of scenarios)
    for (const n of [3, 4])
      it(`${scenario}, ${n} players: the token passes clockwise at the end of each round and wraps; every player is dealt a card each villain phase`, () => {
        // Idle players can lose before round 1 ends (Baron Zemo at four players with seed 1: his four boosts include
        // A.I.M. Interference, which flips the last Board Member); the first seed that survives the villain phase is used.
        let run: ReturnType<typeof idleRounds> | undefined;
        let first: GameState | undefined;
        for (const seed of [1, 2, 3, 4]) {
          first = openScenario(scenario, n, { seed });
          run = idleRounds(first, n + 2);
          if (run.firstPlayers.length > 1) break;
        }
        const { state, events, firstPlayers } = run!;
        expect(firstPlayers.length, "a seed survives round 1").toBeGreaterThan(1);
        // The first threat placed on the main scheme in the villain phase is its acceleration: n times the printed
        // per-hero value (Black Widow: X, her stage number, so 1 per hero; RRG Villain Phase step 1, p. 47).
        const firstThreat = events.find(
          (e) => e.type === "threatPlaced" && e.schemeInstanceId === first!.mainScheme.instanceId,
        ) as { amount: number } | undefined;
        const perHero: Record<string, number> = {
          "black-widow": 1,
          batroc: 1,
          modok: 1,
          "baron-zemo": 2,
          thunderbolts: 1,
          enchantress: 1,
          "god-of-lies": 1,
        };
        // plus each acceleration token and each acceleration icon on a card in play (RRG "Acceleration Icon" / "Acceleration
        // Token", p. 5; A.I.M. Abductor 50080 carries one, which is why Black Widow's seeds 1 and 2 place one more).
        const extra = first!.mainScheme.accelerationTokens + iconsInPlay(first!, DEPS, "acceleration");
        expect(firstThreat?.amount, "acceleration").toBe(perHero[scenario]! * n + extra);
        // The players may lose long before the wrap on a scenario with a fast clock; the rotation up to there holds.
        const expected = Array.from({ length: firstPlayers.length }, (_, i) => pid((i % n) + 1));
        expect(firstPlayers).toEqual(expected);
        if (!state.outcome) expect(firstPlayers.length).toBeGreaterThanOrEqual(n + 1);
        // Round 1's villain phase: every player revealed at least one dealt encounter card, the first player's first.
        const firstRoundReveals = events
          .filter((e) => e.type === "encounterCardRevealed")
          .map((e) => (e as { playerId: PlayerId }).playerId);
        if (scenario !== "god-of-lies") {
          for (let i = 1; i <= n; i++) expect(firstRoundReveals, `p${i} was dealt a card`).toContain(pid(i));
          expect(firstRoundReveals[0]).toBe("p1");
        }
        // The first player changed event names the new first player at each pass.
        const changes = events
          .filter((e) => e.type === "firstPlayerChanged")
          .map((e) => (e as { playerId: PlayerId }).playerId);
        expect(changes.slice(0, firstPlayers.length - 1)).toEqual(firstPlayers.slice(1));
      });
});
