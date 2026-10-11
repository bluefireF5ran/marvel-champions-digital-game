/**
 * Shared staging for the calibration QA (`qa-calibration.qa.test.ts`): the unchanged purposeful player of
 * `qa-wins.shared.ts` pointed at any playable scenario (older boxes included) through `playableScenario`, with the same
 * MarvelCDB decklists. `DEPS` (waves 1 to 8 plus Agents of S.H.I.E.L.D. and Trickster Takeover) already holds every older
 * scenario's scripts, so the shared drivers run unchanged; the game is built from the playable pool's setup.
 */
import { characterProfile, createGame, defendPreview, type GameState } from "@mc/engine";
import { playableScenario, playableStarterDeckSetup } from "../playable/index.js";
import { wave9Scenario } from "./setup.js";
import { DEPS, choose, targetThreatOf } from "./qa-gaps.shared.js";
import {
  DECKS,
  playTraced,
  seatOf,
  threatLedger,
  winsDecide,
  type LedgerRow,
  type TracedRun,
  type WinsPolicy,
} from "./qa-wins.shared.js";

/** The first N of these make an N-hero table (the order the wave 9 pinned lines use). */
export const TEAM_ORDER = [
  DECKS.sheHulkLeadership,
  DECKS.ironManAggression,
  DECKS.captainMarvelLeadership,
  DECKS.captainAmericaProtection,
] as const;

/** Solo seats rotated by seed, so a solo sample is not one hero. */
export const SOLO_SEATS = [
  DECKS.sheHulkLeadership,
  DECKS.ironManAggression,
  DECKS.captainMarvelLeadership,
  DECKS.captainAmericaProtection,
  DECKS.spiderManLeadership,
  DECKS.blackPantherLeadership,
] as const;

export function teamFor(players: number, seed: number): readonly string[] {
  if (players === 1) return [SOLO_SEATS[seed % SOLO_SEATS.length]!];
  return TEAM_ORDER.slice(0, players);
}

/** A seat by name: a `qa-wins.shared.ts` decklist, or \`starter:<id>\` for a printed starter deck. */
export const seatNamed = (name: string) =>
  name.startsWith("starter:") ? playableStarterDeckSetup(name.slice(8)) : seatOf(name);

const WAVE9_IDS: ReadonlySet<string> = new Set([
  "black-widow",
  "batroc",
  "modok",
  "thunderbolts",
  "baron-zemo",
  "god-of-lies",
  "enchantress",
]);

/** A fresh standard game of any playable scenario with one seat per decklist. */
export function newPlayableGame(scenario: string, team: readonly string[], seed: number): GameState {
  const players = team.map(seatNamed);
  const config = WAVE9_IDS.has(scenario)
    ? wave9Scenario(scenario, { players, seed })
    : playableScenario(scenario, { players, seed });
  const created = createGame(config, DEPS);
  if (!created.ok) throw new Error(`${scenario}: ${created.error.message}`);
  return created.state;
}

export interface CalRun extends TracedRun {
  readonly ledger: readonly LedgerRow[];
}

export const BASE_POLICY: WinsPolicy = { margin: 6, attack: "smart", thwart: "smart" };

export function runCal(
  scenario: string,
  team: readonly string[],
  seed: number,
  policy: WinsPolicy = BASE_POLICY,
  maxCommands = 3000,
  decide: (s: GameState) => ReturnType<ReturnType<typeof winsDecide>> | null = winsDecide(policy),
): CalRun {
  const run = playTraced(newPlayableGame(scenario, team, seed), decide, maxCommands);
  return { ...run, ledger: threatLedger(run) };
}

export interface Summary {
  readonly games: number;
  readonly wins: number;
  readonly losses: number;
  readonly capped: number;
  readonly avgRounds: number;
  /** Main scheme target at round 1, and the villain phase's threat as a share of it per round. */
  readonly target: number;
  readonly startThreat: number;
  readonly placedShare: number;
  readonly avgRemoved: number;
  readonly avgVillainPlaced: number;
  readonly avgDamageToVillain: number;
  readonly avgDamageToHeroes: number;
}

export function summarize(runs: readonly CalRun[]): Summary {
  const rows = runs.flatMap((r) => r.ledger);
  const avg = (f: (r: LedgerRow) => number) => (rows.length ? rows.reduce((a, r) => a + f(r), 0) / rows.length : 0);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    games: runs.length,
    wins: runs.filter((r) => r.outcome?.result === "win").length,
    losses: runs.filter((r) => r.outcome?.result === "loss").length,
    capped: runs.filter((r) => !r.outcome).length,
    avgRounds: r1(runs.reduce((a, r) => a + r.rounds, 0) / Math.max(1, runs.length)),
    target: r1(runs.reduce((a, r) => a + (r.rounds_[0]?.target ?? 0), 0) / Math.max(1, runs.length)),
    startThreat: r1(runs.reduce((a, r) => a + (r.rounds_[0]?.threatIn ?? 0), 0) / Math.max(1, runs.length)),
    placedShare:
      Math.round(
        (avg((r) => r.villainPlaced) /
          Math.max(1, runs.reduce((a, r) => a + (r.rounds_[0]?.target ?? 0), 0) / Math.max(1, runs.length))) *
          100,
      ) / 100,
    avgRemoved: r1(avg((r) => r.playerRemoved)),
    avgVillainPlaced: r1(avg((r) => r.villainPlaced)),
    avgDamageToVillain: r1(avg((r) => r.damageToVillain)),
    avgDamageToHeroes: r1(avg((r) => r.damageToHeroes)),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The improved player: `winsDecide` with the defend decision made from the engine's own damage preview
// ---------------------------------------------------------------------------------------------------------------

/**
 * Why `winsDecide` loses the older scenarios too: it declares the hero the defender of every attack aimed at it. A
 * defender exhausts (RRG 1.8 "Defend, Defense", p. 16) and cards ready only at the end of the player phase (p. 35,
 * "Player Phase"), so a hero that defended in the villain phase starts the next round exhausted and cannot attack or
 * thwart. Defending always therefore costs the hero's next action; a purposeful player defends when the damage it
 * prevents is worth that action, or when the hit would defeat the hero, and otherwise lets an ally take it or takes it.
 */
export interface DefendWeights {
  /** What a point of damage on the hero costs. */
  readonly heroDamage: number;
  /** What the hero's next action is worth (about one basic attack or thwart). */
  readonly heroExhaust: number;
  /** An ally's damage and exhaustion cost less than the hero's. */
  readonly allyDamage: number;
  readonly allyExhaust: number;
  /** An ally defeated by the attack is a card and a board position lost. */
  readonly allyDefeat: number;
}

export const DEFEND_WEIGHTS: DefendWeights = {
  heroDamage: 1,
  heroExhaust: 3,
  allyDamage: 0.5,
  allyExhaust: 1.5,
  allyDefeat: 5,
};

export function smartDecide(
  policy: WinsPolicy,
  weights: DefendWeights = DEFEND_WEIGHTS,
  /** Thwart rather than attack once the main scheme holds this share of its target (the rest is `winsDecide`'s margin). */
  threatShare?: number,
  /** The hero turns to alter-ego at the end of its turn only when this many hit points or fewer are left (the greedy driver: 4). */
  flipAt = 4,
): (s: GameState) => ReturnType<ReturnType<typeof winsDecide>> {
  const mutable = { ...policy };
  const base = winsDecide(mutable);
  return (s) => {
    if (threatShare !== undefined) mutable.margin = Math.ceil(targetThreatOf(s) * (1 - threatShare));
    const choice = s.pendingChoice;
    if (choice && choice.prompt.kind === "declareDefender") {
      const previews = defendPreview(s, DEPS);
      if (previews) {
        let best: { id: string; cost: number } | undefined;
        for (const p of previews) {
          const worst = p.bands.reduce((a, b) => (b.damageTaken > a.damageTaken ? b : a), p.bands[0]!);
          const mean = p.bands.reduce((a, b) => a + b.damageTaken, 0) / Math.max(1, p.bands.length);
          const target = p.targetInstanceId;
          const isHeroTarget = s.players.some((pl) => pl.identity.instanceId === target);
          const defenderIsHero = p.defenderInstanceId
            ? s.players.some((pl) => pl.identity.instanceId === p.defenderInstanceId)
            : false;
          const exhaustCost = p.exhausts.length === 0 ? 0 : defenderIsHero ? weights.heroExhaust : weights.allyExhaust;
          let cost = exhaustCost;
          if (isHeroTarget) {
            cost += mean * weights.heroDamage + (worst.defeated ? 100 : 0);
          } else {
            cost += mean * weights.allyDamage + (worst.defeated ? weights.allyDefeat : 0);
          }
          if (!best || cost < best.cost) best = { id: p.optionId, cost };
        }
        if (best) return choose(s, best.id);
      }
    }
    const proposed = base(s);
    if (proposed && proposed.type === "changeForm" && s.step.phase === "player" && s.step.kind === "turn") {
      const pl = s.players.find((x) => x.playerId === (s.step as { activePlayerId: string }).activePlayerId)!;
      if (pl.identity.form === "hero") {
        const profile = characterProfile(s, pl.identity.instanceId, DEPS);
        const left = profile ? profile.maxHp - s.instances[pl.identity.instanceId]!.damage : 0;
        if (left > flipAt) return { type: "endTurn", playerId: pl.playerId };
      }
    }
    return proposed;
  };
}
