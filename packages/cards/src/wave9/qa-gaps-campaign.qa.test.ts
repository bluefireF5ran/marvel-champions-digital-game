/**
 * Rules QA, the expert Agents of S.H.I.E.L.D. campaign (MC50) through `AOS_CAMPAIGN_DEFINITION`: the sit-out path played
 * by the remaining player, and a paid heal that flips the third Board Member. Sources: the MC50 rulebook as transcribed in
 * docs/campaign-modes/markdown/mc50_agents_of_shield.md (page 5 the Board Members, page 6 "Board Member Betrayal",
 * "Persistent Damage", "Elimination and Victory", page 11 scenario 2 Setup), and the printed text of the Board Member
 * attachments (50181b to 50183b): "If there are 3 Board Member attachments in play, the players lose the game."
 * Runs are built the way `campaigns/aos.qa.test.ts` builds them: the composed log starts a real game, the opening is
 * played by commands, and (as there) the result is read from a state whose outcome is set by test surgery.
 */
import { describe, expect, it, vi } from "vitest";
import { cardId } from "@mc/content";
import type { PlayModes } from "@mc/content";
import {
  applyCampaignResult,
  campaignResultOf,
  remainingHitPoints,
  replay,
  type CampaignGameResult,
  type CampaignLog,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { AOS_CAMPAIGN_DEFINITION } from "../campaigns/aos.js";
import { HEAL_REC_LABEL, REJOIN_REC_LABEL, SIT_OUT_LABEL } from "../campaigns/expert-helpers.js";
import { playToOutcome } from "../testing/driver.js";
import { firstLegal, patchInstance, settle, type Picker } from "../testing/harness.js";
import { WAVE9_DEPS } from "./index.js";
import { BOARD_MEMBER_FRONTS, attachmentFaceOf } from "./aos/campaign/executive-board.js";
import { DEPS, buildGame, compose, newLog } from "./aos/campaign/testing.js";
import { codeOf } from "./testing.js";

vi.setConfig({ testTimeout: 300_000 });

const DEF = AOS_CAMPAIGN_DEFINITION;
const EXPERT: PlayModes = { campaign: { campaignId: DEF.campaignId, expertCampaign: true }, expert: true };
const SEED = 11;
const [MEDICAL, SURVEILLANCE, TACTICAL] = BOARD_MEMBER_FRONTS as [string, string, string];

const all = (s: GameState, code: string): InstanceId[] =>
  (Object.keys(s.instances) as InstanceId[]).filter((id) => codeOf(s, id) === code);
const memberId = (s: GameState, front: string): InstanceId => all(s, front)[0] ?? all(s, attachmentFaceOf(front))[0]!;
const asEnvironment = (s: GameState, front: string, secrets: number): GameState =>
  patchInstance(s, memberId(s, front), { cardId: cardId(front), counters: secrets > 0 ? { secret: secrets } : {} });
const flipped = (s: GameState, front: string, secrets: number): GameState =>
  patchInstance(s, memberId(s, front), { cardId: cardId(attachmentFaceOf(front)), counters: { secret: secrets } });
const damage = (s: GameState, seat: number, amount: number): GameState =>
  patchInstance(s, s.players[seat]!.identity.instanceId, { damage: amount });
const eliminate = (s: GameState, seat: number): GameState => ({
  ...s,
  players: s.players.map((p, i) => (i === seat ? { ...p, eliminated: true } : p)),
});
const hp = (s: GameState, seat: number): number =>
  remainingHitPoints(s, s.players[seat]!.identity.instanceId, WAVE9_DEPS) ?? Number.NaN;
const faceOf = (s: GameState, front: string): "environment" | "attachment" =>
  all(s, front).length > 0 ? "environment" : "attachment";

const labelOf = (s: GameState, ...wanted: string[]): string | undefined => {
  for (const text of wanted) {
    const hit = s.pendingChoice!.options.find((o) => o.label.startsWith(text));
    if (hit) return hit.optionId;
  }
  return undefined;
};
/** Declines every evidence offer; the heal answers and targets are by seat. */
function picker(heal: readonly ("pay" | "decline" | "sitOut")[], target: readonly (string | undefined)[]): Picker {
  return (s) => {
    const choice = s.pendingChoice!;
    const seat = s.players.findIndex((p) => p.playerId === choice.playerId);
    if (choice.prompt.kind === "chooseOption") {
      const labels = choice.options.map((o) => o.label);
      if (labels.includes(HEAL_REC_LABEL) || labels.includes(REJOIN_REC_LABEL)) {
        const want = heal[seat];
        const hit =
          want === "pay"
            ? labelOf(s, HEAL_REC_LABEL, REJOIN_REC_LABEL)
            : labelOf(s, want === "sitOut" ? SIT_OUT_LABEL : "Decline");
        return hit ? [hit] : firstLegal(s);
      }
      const no = labelOf(s, "Do not", "Decline");
      return no ? [no] : firstLegal(s);
    }
    if (choice.prompt.kind === "chooseTarget" && target[seat]) {
      const hit = choice.options.find((o) => o.label === target[seat]);
      if (hit) return [hit.optionId];
    }
    return firstLegal(s);
  };
}

function fold(composed: CampaignLog, result: CampaignGameResult): CampaignLog {
  const applied = applyCampaignResult(DEF, composed, result, { at: 1_700_000_000_000, gameId: "qa" }, DEPS);
  if (applied.kind !== "done") throw new Error(`unexpected pending choice: ${applied.choice.instructionId}`);
  return applied.value;
}

interface Run {
  readonly composed: CampaignLog;
  readonly opened: GameState;
  readonly played: GameState;
  readonly final: GameState;
  readonly result: CampaignGameResult;
  readonly after: CampaignLog;
  readonly events: readonly GameEvent[];
}

/** One node: Setup answered by `pick`, `commands` of real play, a surgery, then the outcome set (as aos.qa.test.ts does). */
function runNode(
  before: CampaignLog,
  pick: Picker,
  commands: number,
  surgery: (played: GameState) => GameState = (s) => s,
): Run {
  const composed = compose(DEF, before);
  const built = buildGame(DEF, composed);
  const opened = settle(built.state, pick, (s) => s.step.phase === "player", WAVE9_DEPS);
  const session = playToOutcome(opened, WAVE9_DEPS, { maxCommands: commands }).session;
  const replayed = replay(session.log, WAVE9_DEPS);
  if (!replayed.ok) throw new Error("replay failed");
  expect(replayed.state, "the played opening replays deep-equal").toEqual(session.state);
  const played = session.state;
  const final: GameState = {
    ...surgery(played),
    outcome: { result: "win", reason: "villainDefeated" },
  };
  const result = campaignResultOf(DEF, composed, final, [...built.events, ...replayed.events], WAVE9_DEPS);
  return { composed, opened, played, final, result, after: fold(composed, result), events: replayed.events };
}

const SURVEILLANCE_LABEL = "Chief Surveillance Officer";
const seatHp = (log: CampaignLog): (number | undefined)[] =>
  log.seats.map((seat) => {
    const value = seat.fields["remainingHp"];
    return value?.kind === "number" ? value.value : undefined;
  });

describe("expert campaign, a defeated player sits out the next scenario and the remaining player plays it (MC50 p. 6; p. 11)", () => {
  // p. 6, "Elimination and Victory": a player defeated in a won scenario "does not participate in the Victory steps of that
  // scenario" and at the next Setup "can rejoin their teammates ... by following that scenario's Setup instructions for
  // healing their identity". Declining is the sit-out (owner decision Q14 = A, provisional, docs/phase7-wave9.md section
  // 4.1). RRG 1.8 "Player Elimination" p. 34: the eliminated player's elements are removed and the rest play on;
  // "Per Player Icon": the value is multiplied by the number of players who STARTED the scenario.
  const e1 = () => runNode(newLog(DEF, EXPERT, SEED), picker([], []), 4, (p) => eliminate(damage(p, 0, 3), 1));

  it("scenario 1 won with seat 2 defeated: the Victory steps skip it (record 0) and the log lists it as sitting out", () => {
    const r = e1();
    expect(r.result.sittingOut).toEqual([2]);
    expect(seatHp(r.after)[1]).toBe(0);
    expect(seatHp(r.after)[0]).toBeGreaterThan(0);
  });

  it("scenario 2, seat 2 sits out: it is eliminated at the start and the game is played by seat 1 alone, with no turn, card or damage for seat 2", () => {
    const first = e1();
    const second = runNode(first.after, picker(["decline", "sitOut"], []), 14);
    const [p1, p2] = second.opened.players;
    expect(p2!.eliminated, "the sitting-out seat starts eliminated").toBe(true);
    expect(p1!.eliminated).toBe(false);
    // the heroes' hit points: seat 1 starts at its recorded value (persistent damage, p. 6)
    expect(hp(second.opened, 0)).toBe(seatHp(first.after)[0]);
    const turnsOf = second.events.filter((e) => e.type === "turnStarted") as { playerId?: string }[];
    expect(turnsOf.length, "at least one real round was played").toBeGreaterThan(0);
    expect(
      turnsOf.every((e) => e.playerId === p1!.playerId),
      "no turn ever starts for seat 2",
    ).toBe(true);
    const revealed = second.events.filter((e) => e.type === "encounterCardRevealed") as { playerId: string }[];
    expect(
      revealed.every((e) => e.playerId === p1!.playerId),
      "no encounter card is dealt to seat 2",
    ).toBe(true);
    // Victory: seat 1's record carries on, seat 2 stays recorded 0 and is offered the way back next time
    expect(second.result.sittingOut).toEqual([2]);
    expect(seatHp(second.after)[1]).toBe(0);
    const third = compose(DEF, second.after);
    const opened3 = settle(
      buildGame(DEF, third).state,
      picker(["decline", "sitOut"], []),
      (s) => s.step.phase === "player",
      WAVE9_DEPS,
    );
    expect(opened3.players[1]!.eliminated, "still sitting out when it declines again").toBe(true);
  });

  it("scenario 2 with seat 2 sitting out still scales [per_hero] by 2 players (RRG 'Per Player Icon': players who started)", () => {
    // PINNED, a rules question (see the report): the sitting-out seat is eliminated at the start of the game, so whether it
    // "started the scenario" is open. Today it counts (A).
    const first = e1();
    const sat = runNode(first.after, picker(["decline", "sitOut"], []), 0);
    const paid = runNode(first.after, picker(["decline", "pay"], []), 0);
    const threat = (s: GameState) => s.instances[s.mainScheme.instanceId]!.threat;
    expect(sat.opened.startingPlayerCount).toBe(2);
    expect(threat(sat.opened)).toBe(threat(paid.opened));
  });
});

describe("expert campaign, a paid heal that flips the third Board Member (MC50 pp. 5, 6, 11)", () => {
  // p. 11 Setup: "Place secret counters on each Board Member environment equal to the number recorded ... (This will cause the
  // environment to flip to its attachment side if enough secrets are placed on it.)"; "Expert Campaign Only: Each player may
  // place one secret counter on a Board Member environment to heal damage from their identity equal to their REC." p. 6:
  // at three secrets (expert) a member flips and "once a board member flips ... it remains an attachment for the rest of the
  // campaign". Attachments 50181b to 50183b: "If there are 3 Board Member attachments in play, the players lose the game."
  // Nothing printed exempts Setup, so the third flip, paid for by a player's own choice, loses the game then.
  const twoFlipped = () =>
    runNode(newLog(DEF, EXPERT, SEED), picker([], []), 4, (p) =>
      damage(flipped(flipped(asEnvironment(p, SURVEILLANCE, 2), MEDICAL, 3), TACTICAL, 3), 0, 4),
    );

  it("the log carries two members as attachments and the third as an environment with 2 counters into scenario 2", () => {
    const r = twoFlipped();
    const composed = compose(DEF, r.after);
    const opened = settle(
      buildGame(DEF, composed).state,
      picker(["decline", "decline"], []),
      (s) => s.step.phase === "player",
      WAVE9_DEPS,
    );
    expect(faceOf(opened, MEDICAL)).toBe("attachment");
    expect(faceOf(opened, TACTICAL)).toBe("attachment");
    expect(faceOf(opened, SURVEILLANCE)).toBe("environment");
    expect(opened.instances[memberId(opened, SURVEILLANCE)]!.counters["secret"]).toBe(2);
    expect(opened.outcome, "declining the heal keeps the game going").toBeNull();
  });

  it("seat 1 pays the counter on the last environment (2 -> 3): it flips, three attachments are in play and the players lose during Setup", () => {
    const r = twoFlipped();
    const composed = compose(DEF, r.after);
    const hpBefore = seatHp(r.after)[0]!;
    const built = buildGame(DEF, composed);
    const state = settle(built.state, picker(["pay", "decline"], [SURVEILLANCE_LABEL]), undefined, WAVE9_DEPS);
    expect(faceOf(state, SURVEILLANCE), "the third member flipped").toBe("attachment");
    expect(state.outcome).toMatchObject({ result: "loss" });
    expect(state.step.phase).toBe("gameOver");
    // The state check ends the game the moment the third attachment is in play; the heal (which follows the counter) never
    // resolves, which no longer matters once the game is lost.
    expect(hp(state, 0)).toBe(hpBefore);
  });
});
