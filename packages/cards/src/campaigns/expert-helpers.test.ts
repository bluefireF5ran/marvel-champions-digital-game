/**
 * `healRecForSecret` (docs/phase7-wave9.md section 3.78; MC50 pp. 11, 13, 15, 19): "Expert Campaign Only: Each player may
 * place one secret counter on a Board Member environment to heal damage from their identity equal to their REC."
 *
 * A one-node campaign over Batroc with the Executive Board prepared (scenario #1's two counters each) and the
 * instruction under test, played in a real game.
 */
import { describe, expect, it, vi } from "vitest";
import {
  remainingHitPoints,
  type CampaignInstruction,
  type CampaignLog,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { firstLegal, settle, type Picker } from "../testing/harness.js";
import { WAVE9_CARDS } from "../wave9/cards.js";
import { WAVE9_DEPS } from "../wave9/index.js";
import { codeOf } from "../wave9/testing.js";
import {
  BOARD_MEMBER_FRONTS,
  BOARD_SET_ASIDE_OPS,
  attachmentFaceOf,
  SCENARIO_ONE_BOARD,
  prepareBoard,
} from "../wave9/aos/campaign/executive-board.js";
import {
  EXPERT,
  SEATS,
  STANDARD,
  between,
  buildGame,
  compose,
  definitionOf,
  inGame,
  newLog,
  node,
} from "../wave9/aos/campaign/testing.js";
import {
  HEAL_REC_LABEL,
  REJOIN_REC_LABEL,
  SIT_OUT_LABEL,
  healRecForSecret,
  hpSet,
  rejoinOrSitOut,
} from "./expert-helpers.js";

vi.setConfig({ testTimeout: 300_000 });

const afterMulligans = (instruction: CampaignInstruction): CampaignInstruction =>
  instruction.step.kind === "inGame"
    ? { ...instruction, step: { ...instruction.step, window: "afterMulligans" } }
    : instruction;

const DEFINITION = {
  ...definitionOf([
    node("two", "batroc", {
      composition: [between("t.compose", BOARD_SET_ASIDE_OPS)],
      setup: [
        // Q66 = B: a defeated seat answers before the scenario is set up, so a seat sitting out is not one of its players.
        rejoinOrSitOut("t.rejoin", "MC50 p. 6", REJOIN_REC_LABEL),
        inGame("t.board", "beforeStartingHands", [...prepareBoard(SCENARIO_ONE_BOARD)]),
        // Q13 = B: the shaded expert bullets resolve after the mulligans, once the board has its counters.
        afterMulligans(hpSet("t.hp-set", "MC50 p. 11")),
        afterMulligans(healRecForSecret("t.heal", "MC50 p. 11")),
      ],
    }),
  ]),
};
const withRemainingHp = {
  ...DEFINITION,
  logFields: [
    ...DEFINITION.logFields,
    {
      id: "remainingHp",
      label: "Remaining hit points",
      scope: "perSeat" as const,
      type: { kind: "number" as const, min: 0 },
      whenModes: { expertCampaign: true as const },
      citation: "MC50 p. 24",
    },
  ],
};

/** A log whose seats recorded these hit points (a seat with no entry has no record). */
const logRecording = (recorded: readonly (number | undefined)[], modes = EXPERT): CampaignLog => {
  const log = newLog(withRemainingHp, modes);
  return {
    ...log,
    seats: log.seats.map((seat, index) => {
      const value = recorded[index];
      return value === undefined
        ? seat
        : { ...seat, fields: { ...seat.fields, remainingHp: { kind: "number", value } } };
    }),
  };
};

const isHealOffer = (state: GameState): boolean =>
  state.pendingChoice?.prompt.kind === "chooseOption" &&
  state.pendingChoice.options.some((option) => [HEAL_REC_LABEL, REJOIN_REC_LABEL].includes(option.label));

const answering =
  (label: string): Picker =>
  (state) =>
    isHealOffer(state)
      ? [state.pendingChoice!.options.find((option) => option.label === label)!.optionId]
      : firstLegal(state);

const hpOf = (state: GameState, seat: number): number =>
  remainingHitPoints(state, state.players[seat]!.identity.instanceId, WAVE9_DEPS) ?? Number.NaN;
const recOf = (state: GameState, seat: number): number => {
  const card = WAVE9_CARDS.find((c) => c.id === state.instances[state.players[seat]!.identity.instanceId]!.cardId);
  return (card as unknown as { alterEgo: { rec: number } }).alterEgo.rec;
};
/** Either face of each Board Member: the third counter flips an environment in expert mode (threshold 3). */
const MEMBER_CODES = [...BOARD_MEMBER_FRONTS, ...BOARD_MEMBER_FRONTS.map(attachmentFaceOf)];
const secretsOnBoard = (state: GameState): number[] =>
  (Object.keys(state.instances) as InstanceId[])
    .filter((id) => MEMBER_CODES.includes(codeOf(state, id)))
    .map((id) => state.instances[id]!.counters["secret"] ?? 0)
    .sort();

const hasCard = (state: GameState, code: string): boolean =>
  (Object.keys(state.instances) as InstanceId[]).some((id) => codeOf(state, id) === code);

const toOffer = (log: CampaignLog): GameState => {
  const built = buildGame(withRemainingHp, compose(withRemainingHp, log));
  return settle(built.state, firstLegal, isHealOffer, WAVE9_DEPS);
};
/** One answer to the open choice. */
const step = (state: GameState, pick: Picker): GameState => {
  const choice = state.pendingChoice!;
  // The paid option asks which Board Member environment gets the counter (the first), so settle past that choice.
  return settle(
    state,
    pick,
    (s) => s.pendingChoice === null || (isHealOffer(s) && s.pendingChoice.choiceId !== choice.choiceId),
    WAVE9_DEPS,
  );
};
const labels = (state: GameState): readonly string[] => state.pendingChoice!.options.map((o) => o.label);

describe("healRecForSecret (MC50 pp. 11 to 19, expert campaign only)", () => {
  it("is the expert campaign's in-game instruction at the default window, and names its id and page", () => {
    const instruction = healRecForSecret("mc50.test.heal", "MC50 p. 11");
    expect(instruction).toMatchObject({
      id: "mc50.test.heal",
      citation: "MC50 p. 11",
      whenModes: { expertCampaign: true },
      step: { kind: "inGame", window: "afterScenarioSetup" },
    });
    expect(instruction.text).toBe(
      "Expert Campaign Only: Each player may place one secret counter on a Board Member environment to heal damage from their identity equal to their REC.",
    );
    expect(JSON.parse(JSON.stringify(instruction))).toEqual(instruction);
  });

  it("offers each player in turn the heal or a decline, at the hit points the log recorded", () => {
    const asked = toOffer(logRecording([4, 6]));
    expect(asked.pendingChoice!.playerId).toBe(asked.players[0]!.playerId);
    expect(labels(asked)).toEqual([HEAL_REC_LABEL, "Decline"]);
    expect([hpOf(asked, 0), hpOf(asked, 1)]).toEqual([4, 6]);
    expect(secretsOnBoard(asked)).toEqual([2, 2, 2]);
  });

  it("paying puts one secret counter on a Board Member environment and heals exactly the player's REC", () => {
    const asked = toOffer(logRecording([4, 6]));
    const paid = step(asked, answering(HEAL_REC_LABEL));
    expect(hpOf(paid, 0)).toBe(4 + recOf(paid, 0));
    expect(secretsOnBoard(paid)).toEqual([2, 2, 3]);
    // The third counter is the expert threshold: that environment flips to its attachment (its own text).
    expect(MEMBER_CODES.filter((code) => hasCard(paid, code)).filter((code) => code.endsWith("b"))).toHaveLength(1);
    // Seat 2 is asked next, and its own REC is the amount.
    expect(isHealOffer(paid)).toBe(true);
    expect(paid.pendingChoice!.playerId).toBe(paid.players[1]!.playerId);
    const both = step(paid, answering(HEAL_REC_LABEL));
    expect(hpOf(both, 1)).toBe(6 + recOf(both, 1));
    expect(secretsOnBoard(both).reduce((a, b) => a + b, 0)).toBe(8);
  });

  it("declining changes nothing", () => {
    const asked = toOffer(logRecording([4, 6]));
    const neither = step(step(asked, answering("Decline")), answering("Decline"));
    expect([hpOf(neither, 0), hpOf(neither, 1)]).toEqual([4, 6]);
    expect(secretsOnBoard(neither)).toEqual([2, 2, 2]);
  });

  it("does not heal past the printed hit points (the heal is REC, capped by the damage)", () => {
    const asked = toOffer(logRecording([5, 5]));
    const full = recOf(asked, 0);
    expect(hpOf(asked, 0)).toBe(5);
    const paid = step(asked, answering(HEAL_REC_LABEL));
    expect(hpOf(paid, 0)).toBeLessThanOrEqual(5 + full);
  });

  it("a seat recorded at 0 is asked to rejoin or sit out before the scenario is set up, and rejoining heals REC for the same counter (Q14 = A, Q66 = B)", () => {
    const asked = toOffer(logRecording([5, 0]));
    // Seat 2 (defeated) answers first, before Appendix II step 6: nothing is shuffled, placed or drawn yet.
    expect(asked.pendingChoice!.playerId).toBe(asked.players[1]!.playerId);
    expect(labels(asked)).toEqual([REJOIN_REC_LABEL, SIT_OUT_LABEL]);
    expect(asked.players.map((player) => player.hand.length)).toEqual([0, 0]);
    // It rejoins: seat 1 is then offered its own heal after the mulligans, and seat 2 pays without being asked again.
    const second = step(asked, answering(REJOIN_REC_LABEL));
    expect(second.pendingChoice!.playerId).toBe(second.players[0]!.playerId);
    expect(labels(second)).toEqual([HEAL_REC_LABEL, "Decline"]);
    const back = step(second, answering("Decline"));
    expect(hpOf(back, 1)).toBe(recOf(back, 1));
    expect(back.players[1]!.eliminated).toBe(false);
    expect(back.startingPlayerCount).toBe(2);
    expect(secretsOnBoard(back)).toEqual([2, 2, 3]);
  });

  it("a seat that sits out leaves before setup, pays nothing, is not a player of the scenario, and the game goes on with the others", () => {
    const asked = toOffer(logRecording([5, 0]));
    const out = step(step(asked, answering(SIT_OUT_LABEL)), answering("Decline"));
    expect(out.players.map((player) => player.eliminated)).toEqual([false, true]);
    expect(out.players.map((player) => player.sittingOut === true)).toEqual([false, true]);
    expect(out.startingPlayerCount).toBe(1);
    expect(out.players[1]!.hand).toEqual([]);
    expect(secretsOnBoard(out)).toEqual([2, 2, 2]);
  });

  it("a seat with no record at all is asked the same two answers as one recorded at 0", () => {
    const asked = toOffer(logRecording([5, undefined]));
    expect(asked.pendingChoice!.playerId).toBe(asked.players[1]!.playerId);
    expect(labels(asked)).toEqual([REJOIN_REC_LABEL, SIT_OUT_LABEL]);
  });

  it("is ignored in a standard campaign: no offer is ever made", () => {
    const log = logRecording([4, 6], STANDARD);
    const built = buildGame(withRemainingHp, compose(withRemainingHp, log));
    const state = settle(built.state, firstLegal, (s) => s.step.phase === "player", WAVE9_DEPS);
    expect(state.outcome).toBeNull();
    expect(SEATS).toHaveLength(2);
    expect(state.pendingChoice).toBeNull();
  });
});
