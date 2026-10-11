/**
 * Shared staging for the wave 9 "can each scenario be won" QA tests (`qa-wins-*.qa.test.ts`): real MarvelCDB decklists
 * as
 * seats, a purposeful player (`winsDecide`) built on the greedy driver of `qa-gaps.shared.ts`, and a traced game loop
 * that
 * records the threat in and out of the main scheme every round. Nothing here changes a game: every move is a real
 * command
 * the engine accepts, from the printed setup with the natural shuffle of the seed.
 */
import { AOS_EVIDENCE_COMBINATIONS, PLAYABLE_CARDS, parseMarvelCdbDeckJsonText, type CoreAspect } from "@mc/content";
import {
  applyCommand,
  cardOf,
  createGame,
  legalActions,
  maxHitPoints,
  openEvidenceRows,
  sessionApply,
  startSession,
  type Command,
  type GameEvent,
  type GameSession,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { DEPS, choose, greedyNext, mainThreatOf, targetThreatOf, type GuidedResult } from "./qa-gaps.shared.js";
import { wave9Scenario } from "./setup.js";

// `import.meta.glob` (Vite/vitest's static-file loader) rather than `node:fs`: `@mc/cards`'s tsconfig has no `node` types.
interface ImportMetaEnv {
  readonly glob: (pattern: string, opts: object) => unknown;
}
const WAVE9_FIXTURES = (import.meta as unknown as ImportMetaEnv).glob("./fixtures/decklists/*.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const EARLIER_FIXTURES = (import.meta as unknown as ImportMetaEnv).glob("../playable/fixtures/*.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/**
 * The decklists used as seats: a wave 9 fixture by file name (`maria-hill-justice`) or an earlier MarvelCDB decklist by
 * its id (`../playable/fixtures/marvelcdb-decklist-<id>.json`). Only heroes whose scripts live in `DEPS` (waves 1 to 8,
 * Agents of S.H.I.E.L.D. and Trickster Takeover) can be driven by the shared drivers.
 */
export const DECKS = {
  mariaHillJustice: "maria-hill-justice",
  nickFuryAggression: "nick-fury-aggression",
  spiderManLeadership: "103",
  ironManAggression: "113",
  blackPantherLeadership: "449",
  captainAmericaProtection: "482",
  sheHulkLeadership: "543",
  captainMarvelLeadership: "577",
  thorJustice: "1081",
  hulkJustice: "6252",
  hawkeyeAggression: "10940",
} as const;

export type SeatName = (typeof DECKS)[keyof typeof DECKS];

export function seatOf(name: string): never {
  const text =
    WAVE9_FIXTURES[`./fixtures/decklists/${name}.json`] ??
    EARLIER_FIXTURES[`../playable/fixtures/marvelcdb-decklist-${name}.json`];
  if (text === undefined) throw new Error(`no decklist fixture ${name}`);
  const parsed = parseMarvelCdbDeckJsonText(text, PLAYABLE_CARDS);
  if (!parsed.ok) throw new Error(`decklist ${name} does not import: ${JSON.stringify(parsed.problems)}`);
  const c = parsed.contents;
  return {
    identityCardId: c.identityCardId,
    deck: c.cards.flatMap(({ cardId, quantity }) => Array.from({ length: quantity }, () => cardId)),
    aspects: c.aspects as readonly CoreAspect[],
  } as never;
}

/** A fresh game of `scenario` (standard mode, printed setup, no stacking) with one seat per decklist. */
export function newGame(scenario: string, team: readonly string[], seed: number): GameState {
  const created = createGame(wave9Scenario(scenario, { players: team.map(seatOf), seed }), DEPS);
  if (!created.ok) throw new Error(created.error.message);
  return created.state;
}

const inst = (s: GameState, id: InstanceId) => s.instances[id]!;
const remaining = (s: GameState, id: InstanceId): number => (maxHitPoints(s, id, DEPS) ?? 99) - inst(s, id).damage;

/** Ability ids that only burn resources in these games (the Alert Level's "spend 1 resource: remove 1 threat"). */
const WASTEFUL = ["alert-level"];

export interface WinsPolicy {
  /** Thwart the main scheme instead of attacking once its threat is within this many of the target. */
  readonly margin: number;
  /** Attack choice: the villain only, the weakest minion in reach, or any minion a hit can finish first. */
  readonly attack: "villain" | "minion" | "smart";
  /** Thwart choice: the main scheme only (`basic`), or a side scheme with icons / little threat first (`smart`). */
  readonly thwart: "basic" | "smart";
}

/**
 * The purposeful player: the greedy driver's play of cards and abilities (each used once per turn, the Alert Level's
 * resource sink never), every hero in hero form defending the attack aimed at it, and its basic attack or thwart
 * redirected by `policy`. Returns the command for this state, or null to leave it to the greedy driver.
 */
export function winsDecide(policy: WinsPolicy): (s: GameState) => Command | null {
  let memoKey = "";
  const used = new Set<string>();
  return (s) => {
    const choice = s.pendingChoice;
    if (choice) {
      if (choice.prompt.kind === "declareDefender") {
        const attacked = (choice.prompt as { attack: { targetCharacterInstanceId: InstanceId } }).attack
          .targetCharacterInstanceId;
        const mine = s.players.find((p) => p.identity.instanceId === attacked);
        const option = choice.options.find((o) => o.optionId === attacked);
        if (mine && option && mine.identity.form === "hero") return choose(s, option.optionId as string);
      }
      return null;
    }
    if (s.step.phase !== "player" || s.step.kind !== "turn") return null;
    const player = s.step.activePlayerId;
    const proposed = greedyNext(s);
    const turn = `${s.round}:${player}`;
    if (turn !== memoKey) {
      memoKey = turn;
      used.clear();
    }
    let banned = false;
    if (proposed.type === "useAbility") {
      const key = `${proposed.cardInstanceId}:${proposed.abilityId}`;
      banned = WASTEFUL.some((w) => (proposed.abilityId as string).includes(w)) || used.has(key);
      used.add(key);
    }
    if (!banned && proposed.type !== "basicAttack" && proposed.type !== "basicThwart") return proposed;
    const acts = legalActions(s, player, DEPS);
    if (acts.kind !== "turn") return proposed;
    const danger = mainThreatOf(s) >= targetThreatOf(s) - policy.margin;
    const want = danger ? "basicThwart" : "basicAttack";
    const find = (kind: string) => acts.legal.find((l) => l.action.kind === kind);
    const action = find(want) ?? find(want === "basicThwart" ? "basicAttack" : "basicThwart");
    if (!action) return banned ? { type: "endTurn", playerId: player } : proposed;
    const command = { ...action.example } as {
      type: string;
      schemeInstanceId?: InstanceId;
      targetInstanceId?: InstanceId;
    };
    const targets = action.targets;
    if (command.type === "basicThwart") {
      const main = s.mainScheme.instanceId;
      let pick = targets.includes(main) ? main : targets[0]!;
      if (!danger && policy.thwart === "smart" && targets.includes(main)) {
        const icons = (id: InstanceId) => (cardOf(s, id) as { icons?: readonly string[] } | undefined)?.icons ?? [];
        const sides = targets.filter((t) => t !== main).sort((a, b) => inst(s, a).threat - inst(s, b).threat);
        const best = sides.find((t) => icons(t).length > 0) ?? sides[0];
        if (best !== undefined && (inst(s, best).threat <= 3 || icons(best).length > 0)) pick = best;
      }
      command.schemeInstanceId = pick;
    } else {
      const villain = s.activeVillainId;
      const minions = targets.filter((t) => t !== villain).sort((a, b) => remaining(s, a) - remaining(s, b));
      let pick = targets[0]!;
      if (policy.attack === "villain") pick = targets.includes(villain) ? villain : pick;
      else if (policy.attack === "minion") pick = minions[0] ?? (targets.includes(villain) ? villain : pick);
      else {
        const finish = minions.find((t) => remaining(s, t) <= 3);
        pick = finish ?? (targets.includes(villain) ? villain : (minions[0] ?? pick));
      }
      command.targetInstanceId = pick;
    }
    return command as unknown as Command;
  };
}

/**
 * A Baron Zemo player on top of `winsDecide`: every Board Member's Hero Action is used while it holds secret counters
 * (the Surveillance Officer's first, it thwarts), and the stage 1B Response "may advance to stage 2A" is accepted only when
 * `advanceRows` or fewer evidence rows are left, or the main scheme is within `danger` of its target.
 */
export function zemoWinsDecide(
  policy: WinsPolicy,
  advanceRows: number,
  danger: number,
): (s: GameState) => Command | null {
  const base = winsDecide(policy);
  return (s) => {
    const choice = s.pendingChoice;
    if (choice) {
      if (
        choice.prompt.kind === "chooseOption" &&
        choice.options.some((o) => o.label.startsWith("Advance to stage 2A"))
      ) {
        const rows = openEvidenceRows(s, AOS_EVIDENCE_COMBINATIONS).length;
        const forced = mainThreatOf(s) >= targetThreatOf(s) - danger;
        const pick =
          rows <= advanceRows || forced
            ? choice.options.find((o) => o.label.startsWith("Advance"))!
            : choice.options.find((o) => o.label.startsWith("Do not"))!;
        return choose(s, pick.optionId as string);
      }
      return base(s);
    }
    if (s.step.phase === "player" && s.step.kind === "turn") {
      const player = s.step.activePlayerId;
      if (s.players.find((p) => p.playerId === player)!.identity.form === "hero") {
        const acts = legalActions(s, player, DEPS);
        if (acts.kind === "turn")
          for (const code of ["50182a", "50181a", "50183a"])
            for (const l of acts.legal) {
              if (l.action.kind !== "useAbility") continue;
              const card = s.instances[l.action.instanceId]!;
              if ((card.cardId as string) === code && (card.counters["secret"] ?? 0) > 0) return l.example;
            }
      }
    }
    return base(s);
  };
}

export interface RoundRecord {
  readonly round: number;
  /** Threat on the main scheme when the round's player phase opened. */
  readonly threatIn: number;
  /** ... and when the last player ended their turn (what the villain phase starts from). */
  readonly threatBeforeVillain: number;
  readonly target: number;
  /** Damage on the villain at the start of the round's player phase. */
  readonly villainDamage: number;
}

export interface TracedRun extends GuidedResult {
  readonly rounds_: readonly RoundRecord[];
  readonly events: readonly GameEvent[];
  /** Every instance that was the main scheme at some moment of the game. */
  readonly mainSchemeIds: ReadonlySet<InstanceId>;
}

export interface LedgerRow {
  readonly round: number;
  /** Threat on the main scheme placed / removed during the player phase (heroes), and in the villain phase. */
  readonly playerPlaced: number;
  readonly playerRemoved: number;
  readonly villainPlaced: number;
  readonly villainRemoved: number;
  /** Damage dealt to the villain, and to heroes' identities and allies, by anyone during the round. */
  readonly damageToVillain: number;
  /** Damage dealt to the players' identities and allies during the round (damage in, the other half of the race). */
  readonly damageToHeroes: number;
}

const isPlayerSide = (s: GameState, id: InstanceId): boolean =>
  s.players.some((p) => p.identity.instanceId === id) ||
  (cardOf(s, id) as { type?: string } | undefined)?.type === "ally";

/**
 * Per round, the threat that went onto and off the main scheme in each phase, read from the events (`stepChanged` marks the
 * phase; `threatPlaced` / `threatRemoved` on any card that was the main scheme).
 */
export function threatLedger(run: TracedRun): readonly LedgerRow[] {
  const rows: { -readonly [K in keyof LedgerRow]: LedgerRow[K] }[] = [];
  let phase = "setup";
  let current: (typeof rows)[number] | undefined;
  const villainIds = new Set<InstanceId>([run.session.state.activeVillainId]);
  for (const e of run.events) {
    if (e.type === "roundStarted") {
      current = {
        round: e.round,
        playerPlaced: 0,
        playerRemoved: 0,
        villainPlaced: 0,
        villainRemoved: 0,
        damageToVillain: 0,
        damageToHeroes: 0,
      };
      rows.push(current);
    } else if (e.type === "stepChanged") phase = e.to.phase;
    else if (
      current &&
      (e.type === "threatPlaced" || e.type === "threatRemoved") &&
      run.mainSchemeIds.has(e.schemeInstanceId)
    ) {
      const key =
        phase === "villain"
          ? e.type === "threatPlaced"
            ? "villainPlaced"
            : "villainRemoved"
          : e.type === "threatPlaced"
            ? "playerPlaced"
            : "playerRemoved";
      current[key] += e.amount;
    } else if (current && e.type === "damageDealt") {
      if (villainIds.has(e.targetInstanceId)) current.damageToVillain += e.amount;
      else if (isPlayerSide(run.session.state, e.targetInstanceId)) current.damageToHeroes += e.amount;
    }
  }
  return rows;
}

/** `playPolicy` (qa-gaps.shared.ts) with every event kept and one record per round. Same turn-length guard. */
export function playTraced(
  initial: GameState,
  decide: (s: GameState) => Command | null,
  maxCommands: number,
  until?: (s: GameState) => boolean,
): TracedRun {
  let session: GameSession = startSession(initial);
  const events: GameEvent[] = [];
  const rounds: { -readonly [K in keyof RoundRecord]: RoundRecord[K] }[] = [];
  const mainSchemeIds = new Set<InstanceId>([session.state.mainScheme.instanceId]);
  let commands = 0;
  let turnKey = "";
  let inTurn = 0;
  while (!session.state.outcome && commands < maxCommands && !until?.(session.state)) {
    const state = session.state;
    mainSchemeIds.add(state.mainScheme.instanceId);
    if (state.step.phase === "player" && !state.pendingChoice) {
      const open = rounds.at(-1);
      if (!open || open.round !== state.round)
        rounds.push({
          round: state.round,
          threatIn: mainThreatOf(state),
          threatBeforeVillain: mainThreatOf(state),
          target: targetThreatOf(state),
          villainDamage: inst(state, state.activeVillainId).damage,
        });
      else open.threatBeforeVillain = mainThreatOf(state);
    }
    let command = decide(state);
    if (command && !applyCommand(state, command, DEPS).ok) command = null;
    if (!command && !state.pendingChoice && state.step.phase === "player" && state.step.kind === "turn") {
      const key = `${state.round}:${state.step.activePlayerId}`;
      inTurn = key === turnKey ? inTurn + 1 : 1;
      turnKey = key;
      if (inTurn > 30) command = { type: "endTurn", playerId: state.step.activePlayerId };
    }
    command ??= greedyNext(state);
    const result = sessionApply(session, command, DEPS);
    if (!result.ok) throw new Error(`traced ${command.type} refused: ${result.error.code}: ${result.error.message}`);
    session = result.session;
    events.push(...result.events);
    commands++;
  }
  return {
    session,
    outcome: session.state.outcome,
    commands,
    rounds: session.state.round,
    rounds_: rounds,
    events,
    mainSchemeIds,
  };
}

export interface Line {
  readonly scenario: string;
  readonly team: readonly string[];
  readonly seed: number;
  readonly policy: WinsPolicy;
  /** Baron Zemo only: advance to the accusation at `advanceRows` open rows or fewer, or within `danger` of the target. */
  readonly zemo?: { readonly advanceRows: number; readonly danger: number };
}

/** Plays one pinned line from the printed setup to its outcome (or 3000 commands). */
export function runLine(line: Line): TracedRun & { readonly ledger: readonly LedgerRow[] } {
  const decide = line.zemo
    ? zemoWinsDecide(line.policy, line.zemo.advanceRows, line.zemo.danger)
    : winsDecide(line.policy);
  const run = playTraced(newGame(line.scenario, line.team, line.seed), decide, 3000);
  return { ...run, ledger: threatLedger(run) };
}

/**
 * `[round, threat removed by heroes, threat placed in the villain phase, threat removed in the villain phase, damage to the
 * villain, damage to the players' identities and allies]`.
 */
export const ledgerTable = (ledger: readonly LedgerRow[]): number[][] =>
  ledger.map((r) => [r.round, r.playerRemoved, r.villainPlaced, r.villainRemoved, r.damageToVillain, r.damageToHeroes]);
