/**
 * `AOS_CAMPAIGN_DEFINITION` (Agents of S.H.I.E.L.D., MC50) played through the real runner and real games at every node
 * (docs/phase7-wave9.md section 8.4 items 79 and 80; `aos.test.ts` is the definition's own per-node unit file).
 *
 * - **A standard campaign** of all five scenarios (Black Widow, Batroc, M.O.D.O.K., Thunderbolts, Baron Zemo), two
 *   players (Spider-Man, Captain Marvel): at every node the composed log starts a real game (`buildGame`: the scenario,
 *   the composed encounter sets' deck and set-aside cards), the opening is **played for real** by the greedy driver
 *   (`../testing/driver.ts`), the session is replayed to a deep-equal state, and the node's result is derived by
 *   `campaignResultOf` and folded into the log, which is then checked against the printed bullets (MC50 pp. 5 to 6, 9
 *   to 19) and against the game's own cards. Scenario 5's opening is the accusation made from the grid, played by
 *   commands.
 * - **A lost and retried scenario** (item 80): scenario 2 lost with a Board Member flipped during the lost game, the
 *   retry from the node's start, then won; scenario 4 lost, with the member flipped in scenario 2 still an attachment
 *   (stands in for a permanent removal, which this box has none of); scenario 5 lost twice.
 * - **An expert campaign** (modes `expertCampaign` and `expert`): persistent damage through four scenarios, the heal for
 *   a secret counter taken (flipping a Board Member at the expert threshold), a defeated player rejoining and one
 *   sitting out, and scenario 5 lost: `status` `"lost"`.
 *
 * **How the games are finished (test surgery, as `mojo.qa.test.ts` and `mut_gen.qa.test.ts` do).** The greedy driver
 * cannot win these scenarios (probe: scenario 1 is lost in four rounds), so each game is played for real for a bounded
 * number of commands (the Setup, the mulligans, the evidence offers and the first rounds), then the state is edited and
 * its outcome set: cards the printed Victory bullet counts are put on the table (minions and side schemes, Rescued
 * Captives, Adaptoid environments, a Thunderbolt), Board Member secret counters are set, a member is flipped to its
 * attachment face, and `outcome` is overridden to a win or a loss. Everything before the surgery (Setup, offers, replay)
 * is the engine's own; every record and every log assertion after it is derived from the edited state, by the runner.
 */
import { describe, expect, it, vi } from "vitest";
import {
  AOS_CARDS,
  AOS_EVIDENCE_COMBINATIONS,
  AOS_THUNDERBOLT_MINIONS,
  cardId,
  type EvidenceCombination,
} from "@mc/content";
import type { PlayModes } from "@mc/content";
import {
  applyCampaignResult,
  campaignResultOf,
  characterProfile,
  evidenceRowId,
  evidenceRowsLeft,
  remainingHitPoints,
  replay,
  sessionApply,
  startSession,
  type CampaignGameResult,
  type CampaignLog,
  type Command,
  type GameEvent,
  type GameSession,
  type GameState,
  type InstanceId,
  type LogValue,
} from "@mc/engine";
import { playToOutcome } from "../testing/driver.js";
import { firstLegal, patchInstance, settle, type Picker } from "../testing/harness.js";
import { WAVE9_DEPS } from "../wave9/index.js";
import { codeOf, piles } from "../wave9/testing.js";
import { BOARD_MEMBER_FRONTS, attachmentFaceOf } from "../wave9/aos/campaign/executive-board.js";
import { DEPS, buildGame, compose, newLog } from "../wave9/aos/campaign/testing.js";
import { AOS_CAMPAIGN_DEFINITION, EVIDENCE_IDS } from "./aos.js";
import { HEAL_REC_LABEL, REJOIN_REC_LABEL, SIT_OUT_LABEL } from "./expert-helpers.js";

vi.setConfig({ testTimeout: 300_000 });

const DEF = AOS_CAMPAIGN_DEFINITION;
const STANDARD: PlayModes = { campaign: { campaignId: DEF.campaignId } };
const EXPERT: PlayModes = { campaign: { campaignId: DEF.campaignId, expertCampaign: true }, expert: true };
const [MEDICAL, SURVEILLANCE, TACTICAL] = BOARD_MEMBER_FRONTS as [string, string, string];
const NODES = ["black-widow", "batroc", "modok", "thunderbolts", "baron-zemo"] as const;
const GRID = AOS_EVIDENCE_COMBINATIONS;
const KIND_OF = new Map(
  AOS_CARDS.flatMap((card) => (card.type === "evidence" ? [[card.id as string, card.evidence]] : [])),
);
const JOLT = AOS_THUNDERBOLT_MINIONS.find((row) => !row.elite)!.minionId as string;
const STANDARD_SEED = 7;
const EXPERT_SEED = 11;
/** Commands of real play before the surgery (the greedy driver; Setup and the offers come before these). */
const OPENING = 40;

// ---------------------------------------------------------------------------------------------------------------
// Reading state and logs
// ---------------------------------------------------------------------------------------------------------------

const instances = (s: GameState): InstanceId[] => Object.keys(s.instances) as InstanceId[];
const all = (s: GameState, code: string): InstanceId[] => instances(s).filter((id) => codeOf(s, id) === code);
const hpOf = (s: GameState, seat: number): number =>
  remainingHitPoints(s, s.players[seat]!.identity.instanceId, WAVE9_DEPS) ?? Number.NaN;
const recOf = (s: GameState, seat: number): number =>
  characterProfile(s, s.players[seat]!.identity.instanceId, WAVE9_DEPS)!.rec;
const maxHpOf = (s: GameState, seat: number): number =>
  characterProfile(s, s.players[seat]!.identity.instanceId, WAVE9_DEPS)!.maxHp;
const typeOf = (s: GameState, id: InstanceId): string =>
  AOS_CARDS.find((card) => (card.id as string) === codeOf(s, id))?.type ?? "";
const listOf = (log: CampaignLog, field: string): readonly string[] => {
  const value = log.shared[field] ?? log.hidden[field];
  return value?.kind === "cardList" ? value.cardIds.map(String) : [];
};
const numberOf = (log: CampaignLog, field: string): number => {
  const value = log.shared[field];
  return value?.kind === "number" ? value.value : Number.NaN;
};
const seatHp = (log: CampaignLog): (number | undefined)[] =>
  log.seats.map((seat) => {
    const value = seat.fields["remainingHp"];
    return value?.kind === "number" ? value.value : undefined;
  });

/** What the game holds of each Board Member (either face): its secret counters and whether it is an attachment now. */
function boardOf(state: GameState): Record<string, { secret: number; attachment: boolean }> {
  const out: Record<string, { secret: number; attachment: boolean }> = {};
  for (const front of BOARD_MEMBER_FRONTS) {
    const back = attachmentFaceOf(front);
    const id = all(state, front)[0] ?? all(state, back)[0];
    if (id)
      out[front] = { secret: state.instances[id]!.counters["secret"] ?? 0, attachment: codeOf(state, id) === back };
  }
  return out;
}
/** The recorded `secretsN` field of a log, in the same shape as `boardOf`. */
function recordedBoard(log: CampaignLog, field: string): Record<string, { secret: number; attachment: boolean }> {
  const value: LogValue | undefined = log.shared[field];
  if (value?.kind !== "cardState") throw new Error(`${field} is not recorded`);
  return Object.fromEntries(
    Object.entries(value.cards).map(([front, state]) => [
      front,
      { secret: state.counters["secret"] ?? 0, attachment: state.face !== undefined },
    ]),
  );
}
/** Whether a Board Member *environment* with no secret counter is in play: the Victory gain's condition (MC50 p. 9). */
/** Copies of a card on the table: in the villain area or in a player's play area (both are "in play"). */
const inPlayCount = (state: GameState, code: string): number =>
  all(state, code).filter((id) => state.villainArea.includes(id) || state.players.some((p) => p.playArea.includes(id)))
    .length;
const hasCleanMember = (state: GameState): boolean =>
  Object.values(boardOf(state)).some((member) => !member.attachment && member.secret === 0);

/** Every id of the envelope must appear nowhere in the log except its hidden field (MC50 p. 5, "without looking"). */
function withoutHidden(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutHidden);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "hidden")
        .map(([key, item]) => [key, withoutHidden(item)]),
    );
  }
  return value;
}
function expectEnvelopeHidden(log: CampaignLog, envelope: readonly string[]): void {
  const text = JSON.stringify(withoutHidden(log));
  for (const id of envelope)
    expect(text.includes(`"${id}"`), `envelope card ${id} appears outside the hidden field`).toBe(false);
  expect(log.hidden["aimEnvelope"]?.sealed).toBe(true);
}

// ---------------------------------------------------------------------------------------------------------------
// Test surgery
// ---------------------------------------------------------------------------------------------------------------

/** These cards leave the encounter deck, discard and set-aside areas and sit on the table (a Victory bullet counts them). */
function putOnTable(state: GameState, ids: readonly InstanceId[]): GameState {
  const strip = (zone: readonly InstanceId[]) => zone.filter((id) => !ids.includes(id));
  return {
    ...state,
    encounterDecks: Object.fromEntries(
      Object.entries(state.encounterDecks).map(([key, deck]) => [
        key,
        { deck: strip(deck.deck), discard: strip(deck.discard) },
      ]),
    ),
    encounterSetAside: strip(state.encounterSetAside),
    villainArea: [...state.villainArea, ...ids.filter((id) => !state.villainArea.includes(id))],
  };
}
const memberId = (state: GameState, front: string): InstanceId =>
  all(state, front)[0] ?? all(state, attachmentFaceOf(front))[0]!;
/** The members that are environments in this state, by front face. */
const environmentsIn = (state: GameState): string[] =>
  BOARD_MEMBER_FRONTS.filter((front) => all(state, front).length > 0);
/** Sets a member's secret counters and puts it on its environment face (test surgery: undoes a flip the game made). */
const asEnvironment = (state: GameState, front: string, secrets: number): GameState =>
  patchInstance(state, memberId(state, front), {
    cardId: cardId(front),
    counters: secrets > 0 ? { secret: secrets } : {},
  });
/** Sets a member's secret counters on whichever face it has. */
const setSecrets = (state: GameState, front: string, secrets: number): GameState =>
  patchInstance(state, memberId(state, front), { counters: secrets > 0 ? { secret: secrets } : {} });
/** Flips a member to its attachment face holding these counters (the flip itself is the engine's, tested in the card files). */
const flipped = (state: GameState, front: string, secrets: number): GameState =>
  patchInstance(state, memberId(state, front), {
    cardId: cardId(attachmentFaceOf(front)),
    counters: { secret: secrets },
  });
const ended = (state: GameState, result: "win" | "loss"): GameState => ({
  ...state,
  outcome:
    result === "win" ? { result: "win", reason: "villainDefeated" } : { result: "loss", reason: "mainSchemeCompleted" },
});
const onTableOfType = (state: GameState, type: string, count: number): InstanceId[] => {
  const found = piles(state)
    .deck.filter((id) => typeOf(state, id) === type)
    .slice(0, count);
  expect(found, `${count} ${type} cards in the encounter deck`).toHaveLength(count);
  return found;
};

// ---------------------------------------------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------------------------------------------

const labelOf = (s: GameState, ...wanted: string[]): string | undefined => {
  for (const text of wanted) {
    const hit = s.pendingChoice!.options.find((o) => o.label.startsWith(text));
    if (hit) return hit.optionId;
  }
  return undefined;
};
/** Declines every evidence Setup offer ("Do not ..."), takes the first of anything else. */
const declining: Picker = (s) => {
  const no = labelOf(s, "Do not", "Decline");
  return no ? [no] : firstLegal(s);
};
/** Takes every evidence Setup offer (the option that is not "Do not ..."), and answers a search with its first card. */
const taking: Picker = (s) => {
  const choice = s.pendingChoice!;
  if (choice.prompt.kind === "chooseOption") {
    const yes = choice.options.find((o) => !o.label.startsWith("Do not") && o.label !== "Decline");
    return yes ? [yes.optionId] : firstLegal(s);
  }
  if (choice.prompt.kind === "chooseCards" && choice.options.length > 0 && choice.minSelections === 0) {
    // A search result or a mulligan: a mulligan is "mulligan", a search is "chooseCards"; take one card of a search.
    return [choice.options[0]!.optionId];
  }
  return firstLegal(s);
};

// ---------------------------------------------------------------------------------------------------------------
// Running one node
// ---------------------------------------------------------------------------------------------------------------

interface Step {
  readonly nodeId: string;
  readonly before: CampaignLog;
  readonly composed: CampaignLog;
  /** The real game after Setup, mulligans and the Setup offers, parked on its first player turn. */
  readonly opened: GameState;
  /** The game the driver played, before the surgery. */
  readonly played: GameState;
  /** The state the result was read from (surgery applied, outcome set). */
  readonly final: GameState;
  readonly result: CampaignGameResult;
  readonly after: CampaignLog;
  /** Every `chooseOption` the game asked during Setup, as its option labels. */
  readonly offers: string[][];
}

interface NodeOptions {
  readonly pick?: Picker;
  readonly commands?: number;
  readonly outcome?: "win" | "loss";
  /** Edits the state the driver stopped on, before the outcome is set. */
  readonly surgery?: (played: GameState, opened: GameState) => GameState;
  /** Replaces the greedy driver: plays the opened game by commands. */
  readonly play?: (opened: GameState) => GameSession;
}

/** The session replays from its log to a deep-equal state (the replay trace is the regression ground truth). */
function expectReplays(session: GameSession): readonly GameEvent[] {
  const replayed = replay(session.log, WAVE9_DEPS);
  expect(replayed.ok, "the session log replays").toBe(true);
  if (!replayed.ok) throw new Error("replay failed");
  expect(replayed.state).toEqual(session.state);
  return replayed.events;
}

function fold(composed: CampaignLog, result: CampaignGameResult): CampaignLog {
  const applied = applyCampaignResult(DEF, composed, result, { at: 1_700_000_000_000, gameId: "qa" }, DEPS);
  if (applied.kind !== "done") throw new Error(`unexpected pending choice: ${applied.choice.instructionId}`);
  return applied.value;
}

function runNode(before: CampaignLog, options: NodeOptions = {}): Step {
  const composed = compose(DEF, before);
  const built = buildGame(DEF, composed);
  const offers: string[][] = [];
  const pick = options.pick ?? declining;
  const opened = settle(
    built.state,
    (s) => {
      if (s.pendingChoice!.prompt.kind === "chooseOption") offers.push(s.pendingChoice!.options.map((o) => o.label));
      return pick(s);
    },
    (s) => s.step.phase === "player",
    WAVE9_DEPS,
  );
  const session = options.play
    ? options.play(opened)
    : playToOutcome(opened, WAVE9_DEPS, { maxCommands: options.commands ?? OPENING }).session;
  const replayedEvents = expectReplays(session);
  const played = session.state;
  const final = ended(options.surgery ? options.surgery(played, opened) : played, options.outcome ?? "win");
  const result = campaignResultOf(DEF, composed, final, [...built.events, ...replayedEvents], WAVE9_DEPS);
  const after = fold(composed, result);
  return { nodeId: composed.attempt!.nodeId, before, composed, opened, played, final, result, after, offers };
}

const recordOf = (result: CampaignGameResult, field: string) =>
  result.records.find((r) => r.write.field === field && r.write.seatNumber == null)?.write.value;

// ---------------------------------------------------------------------------------------------------------------
// The standard campaign (played once, read by several tests)
// ---------------------------------------------------------------------------------------------------------------

interface Standard {
  readonly steps: readonly Step[];
  /** The same Setup with every offer declined, for comparison with the offers taken (scenario 2). */
  readonly declinedTwo: GameState;
  readonly minionsBase: number;
  /** The member the scenario 2 surgery flipped. */
  readonly flippedFront: string;
}

let memo: Standard | undefined;
const standard = (): Standard => (memo ??= playStandard());

/** The first member that is an environment when the scenario opened (the real game may have flipped it since). */
const firstEnvironment = (opened: GameState, not: readonly string[] = []): string => {
  const front = environmentsIn(opened).find((f) => !not.includes(f));
  if (!front) throw new Error("no Board Member environment left to use for the surgery");
  return front;
};

function playStandard(): Standard {
  const log0 = newLog(DEF, STANDARD, STANDARD_SEED);
  // ---- 1: Black Widow (MC50 p. 9) ----
  let minionsBase = 0;
  const one = runNode(log0, {
    surgery: (played, opened) => {
      const before = recordOf(
        campaignResultOf(DEF, compose(DEF, log0), ended(played, "win"), [], WAVE9_DEPS),
        "minionsAndSideSchemes",
      );
      minionsBase = before?.kind === "number" ? before.value : Number.NaN;
      const minions = onTableOfType(played, "minion", 3);
      const schemes = onTableOfType(played, "side_scheme", 1);
      // A Board Member is investigated down to no secret counters: the gain is owed.
      return asEnvironment(putOnTable(played, [...minions, ...schemes]), firstEnvironment(opened), 0);
    },
  });
  // ---- 2: Batroc (p. 11): the evidence gained in scenario 1 is offered and taken ----
  const composedTwo = compose(DEF, one.after);
  const declinedTwo = settle(
    buildGame(DEF, composedTwo).state,
    declining,
    (s) => s.step.phase === "player",
    WAVE9_DEPS,
  );
  let flippedFront = "";
  const two = runNode(one.after, {
    pick: taking,
    surgery: (played, opened) => {
      const captives = all(played, "50091")
        .filter((id) => !played.villainArea.includes(id))
        .slice(0, 3);
      expect(captives, "3 Rescued Captives in the game").toHaveLength(3);
      // One member is cleaned out (the gain is owed) and another flips in this won scenario: it must stay an attachment.
      flippedFront = firstEnvironment(opened);
      const clean = firstEnvironment(opened, [flippedFront]);
      return flipped(asEnvironment(putOnTable(played, captives), clean, 0), flippedFront, 5);
    },
  });
  // ---- 3: M.O.D.O.K. (p. 13): offers declined; every member environment holds a counter, so no evidence is gained ----
  const three = runNode(two.after, {
    surgery: (played) => {
      const environments = [...all(played, "50109"), ...all(played, "50111")].filter(
        (id) => !played.villainArea.includes(id),
      );
      let state = putOnTable(played, environments);
      for (const front of environmentsIn(state))
        state = setSecrets(state, front, Math.max(1, boardOf(state)[front]!.secret));
      return state;
    },
  });
  // ---- 4: Thunderbolts (p. 15): a Thunderbolt in play, a member bare again: evidence gained ----
  const four = runNode(three.after, {
    surgery: (played, opened) => {
      const jolt = all(played, JOLT).filter((id) => !played.villainArea.includes(id));
      expect(jolt, "Jolt's minion is in the game").not.toHaveLength(0);
      return asEnvironment(putOnTable(played, [jolt[0]!]), firstEnvironment(opened), 0);
    },
  });
  // ---- 5: Baron Zemo (p. 19): the accusation made from the grid, then the campaign is won ----
  const five = runNode(four.after, { play: accuseTheMole });
  return { steps: [one, two, three, four, five], declinedTwo, minionsBase, flippedFront };
}

/** The envelope's row of the grid: the combination the three hidden evidence cards name. */
const moleRowOf = (envelope: readonly string[]): EvidenceCombination => {
  const row = GRID.find(
    (r) =>
      envelope.includes(r.means as string) &&
      envelope.includes(r.motive as string) &&
      envelope.includes(r.opportunity as string),
  );
  if (!row) throw new Error("the envelope names no row of the grid");
  return row;
};

/**
 * Scenario 5's opening by commands: both players end their turns, the first player takes stage 1B's Response to advance
 * to 2A, and makes the accusation by choosing a row of the grid (MC50 pp. 18 to 19). The row chosen is the mole's.
 */
function accuseTheMole(opened: GameState): GameSession {
  const mole = moleRowOf((opened.hiddenPiles?.["aim"] ?? []).map(String));
  let session = startSession(opened);
  const send = (command: Command) => {
    const result = sessionApply(session, command, WAVE9_DEPS);
    if (!result.ok) throw new Error(`illegal ${command.type}: ${result.error.code}: ${result.error.message}`);
    session = result.session;
  };
  for (let guard = 0; guard < 80 && !session.state.accusation && !session.state.outcome; guard++) {
    const s = session.state;
    const choice = s.pendingChoice;
    if (choice) {
      let picked: readonly string[];
      if (choice.prompt.kind === "accuse") {
        const row = choice.options.find((o) => (o.optionId as string) === evidenceRowId(mole));
        if (!row) throw new Error("the mole's row is not an open row of the grid");
        picked = [row.optionId];
      } else if (choice.prompt.kind === "chooseTriggers") {
        const hit = choice.options.find((o) => (o.optionId as string).includes("zemos-manipulations"));
        picked = hit ? [hit.optionId] : [];
      } else if (choice.prompt.kind === "chooseOption") {
        const hit = choice.options.find((o) => o.label.startsWith("Advance to stage 2A"));
        const no = choice.options.find((o) => o.label.startsWith("Do not"));
        picked = hit ? [hit.optionId] : no ? [no.optionId] : firstLegal(s);
      } else if (choice.prompt.kind === "declareDefender") picked = ["decline"];
      else picked = firstLegal(s);
      send({ type: "resolveChoice", playerId: choice.playerId, choiceId: choice.choiceId, selectedOptionIds: picked });
    } else if (s.step.phase === "player" && s.step.kind === "turn") {
      send({ type: "endTurn", playerId: s.step.activePlayerId });
    } else throw new Error(`stuck at ${s.step.phase}/${s.step.kind}`);
  }
  return session;
}

describe("a standard Agents of S.H.I.E.L.D. campaign: five real games, the log checked after each (MC50 pp. 5 to 19)", () => {
  it("scenario 1 (p. 9): the evidence is prepared sealed, the board opens at two counters, the Victory records and gains", () => {
    const s = standard().steps[0]!;
    const envelope = listOf(s.composed, "aimEnvelope");
    expect(envelope.map((id) => KIND_OF.get(id))).toEqual(["means", "motive", "opportunity"]);
    expect(listOf(s.composed, "evidence")).toEqual([]);
    expect(s.offers).toEqual([]);
    for (const front of BOARD_MEMBER_FRONTS) expect(boardOf(s.opened)[front]).toEqual({ secret: 2, attachment: false });
    expect(s.result.outcome).toBe("won");
    // "Record the total number of minions and side schemes in play": the 4 put on the table plus what was already there.
    expect(numberOf(s.after, "minionsAndSideSchemes")).toBe(standard().minionsBase + 4);
    // "Record the number of secret counters on each Board Member card": exactly what the game held.
    expect(recordedBoard(s.after, "secrets1")).toEqual(boardOf(s.final));
    expect(hasCleanMember(s.final)).toBe(true);
    // "If at least one Board Member environment ... has no secret counters on it, gain one evidence card".
    const evidence = listOf(s.after, "evidence");
    expect(evidence).toHaveLength(1);
    expect(EVIDENCE_IDS).toContain(evidence[0]);
    expect(envelope).not.toContain(evidence[0]);
    expect(listOf(s.after, "aimEnvelope")).toEqual(envelope);
    expectEnvelopeHidden(s.composed, envelope);
    expectEnvelopeHidden(s.after, envelope);
    expect(s.after.position.nextNodeId).toBe("batroc");
    expect(s.after.status).toBe("active");
    // A standard campaign records no hit points.
    expect(seatHp(s.after)).toEqual([undefined, undefined]);
  });

  it("scenario 2 (p. 11): Alert Level, the restored board, and the evidence Setup offered, taken and (in a comparison) declined", () => {
    const [one, two] = standard().steps as [Step, Step];
    const recorded = numberOf(one.after, "minionsAndSideSchemes");
    const alert = all(two.opened, "50090a")[0]!;
    // "Place threat on the Alert Level environment equal to the number of minions and side schemes recorded ... #1."
    if (recorded < 8) expect(two.opened.instances[alert]!.threat).toBe(recorded);
    expect(two.opened.instances[alert]!.flipped).toBeFalsy();
    // The board is the scenario 1 record, before any offer: the declined game has exactly the recorded counters.
    expect(boardOf(standard().declinedTwo)).toEqual(recordedBoard(one.after, "secrets1"));
    // One evidence card earned: its Setup offers to each player (two players), none made in scenario 1.
    expect(two.offers.length).toBeGreaterThan(0);
    expect(one.offers).toEqual([]);
    // Taken: Board Members hold more secret counters (or a threat went on the scheme) than with every offer declined.
    const secrets = (st: GameState) => Object.values(boardOf(st)).reduce((n, m) => n + m.secret, 0);
    const threat = (st: GameState) => st.instances[st.mainScheme.instanceId]!.threat;
    expect(
      secrets(two.opened) > secrets(standard().declinedTwo) || threat(two.opened) > threat(standard().declinedTwo),
    ).toBe(true);
    // Victory: the captives in play, the secrets as the game held them, and the Tactical Officer's flip recorded.
    // (The 3 put on the table; the driver's opening rescued none for real.)
    expect(numberOf(two.after, "rescuedCaptives")).toBe(inPlayCount(two.final, "50091"));
    expect(inPlayCount(two.final, "50091")).toBeGreaterThanOrEqual(3);
    expect(recordedBoard(two.after, "secrets2")).toEqual(boardOf(two.final));
    expect(recordedBoard(two.after, "secrets2")[standard().flippedFront]).toEqual({ secret: 5, attachment: true });
    const evidence = listOf(two.after, "evidence");
    expect(evidence).toHaveLength(2);
    expect(new Set(evidence).size).toBe(2);
    expect(evidence[0]).toBe(listOf(one.after, "evidence")[0]);
    for (const card of evidence) expect(listOf(two.after, "aimEnvelope")).not.toContain(card);
    expectEnvelopeHidden(two.after, listOf(two.after, "aimEnvelope"));
  });

  it("scenario 3 (p. 13): the Holding Cell's locks follow the Rescued Captives; the flipped member is still an attachment; no counters free, no evidence", () => {
    const [, two, three] = standard().steps as [Step, Step, Step];
    const captives = numberOf(two.after, "rescuedCaptives");
    // "Place 3[per_hero] additional lock counters ... then remove X[per_hero]": two players, so 2 x (5 - X) (aos.test's arithmetic).
    const cell = three.opened.villainArea.filter(
      (id) => codeOf(three.opened, id).startsWith("5010") && codeOf(three.opened, id).endsWith("a"),
    );
    expect(cell).toHaveLength(1);
    expect(three.opened.instances[cell[0]!]!.counters["lock"] ?? 0).toBe(2 * (5 - Math.min(captives, 5)));
    // "once a board member flips to its attachment side, it remains an attachment for the rest of the campaign" (p. 6).
    const f = standard().flippedFront;
    expect(boardOf(three.opened)[f]).toEqual(recordedBoard(two.after, "secrets2")[f]);
    expect(boardOf(three.opened)[f]!.attachment).toBe(true);
    expect(all(three.opened, f)).toHaveLength(0);
    // Each Adaptoid environment in play is recorded by card id, and nothing else (109 and 111 were put on the table).
    const adaptoids = ["50109", "50110", "50111", "50112"].filter((code) => inPlayCount(three.final, code) > 0);
    expect(adaptoids).toEqual(expect.arrayContaining(["50109", "50111"]));
    expect([...listOf(three.after, "adaptoidEnvironments")].sort()).toEqual(adaptoids);
    expect(recordedBoard(three.after, "secrets3")).toEqual(boardOf(three.final));
    // Every member environment holds a counter at the end: no gain.
    expect(hasCleanMember(three.final)).toBe(false);
    expect(listOf(three.after, "evidence")).toEqual(listOf(two.after, "evidence"));
    expect(three.after.position.nextNodeId).toBe("thunderbolts");
  });

  it("scenario 4 (p. 15): the Tactical Officer is an attachment two scenarios after its flip; the Thunderbolt is recorded; evidence is gained again", () => {
    const [, , three, four] = standard().steps as [Step, Step, Step, Step];
    // Still an attachment, and its counters are what the game held.
    expect(recordedBoard(three.after, "secrets3")[standard().flippedFront]!.attachment).toBe(true);
    // Flipped in scenario 2 (won), an attachment in scenario 4's opening game.
    expect(boardOf(four.opened)).toEqual(recordedBoard(three.after, "secrets3"));
    expect(boardOf(four.opened)[standard().flippedFront]!.attachment).toBe(true);
    expect(listOf(four.after, "survivingThunderbolts")).toContain(JOLT);
    expect(recordedBoard(four.after, "secrets4")).toEqual(boardOf(four.final));
    const evidence = listOf(four.after, "evidence");
    expect(evidence).toHaveLength(3);
    expect(new Set(evidence).size).toBe(3);
    for (const card of evidence) expect(listOf(four.after, "aimEnvelope")).not.toContain(card);
    expectEnvelopeHidden(four.after, listOf(four.after, "aimEnvelope"));
    expect(four.after.position.nextNodeId).toBe("baron-zemo");
  });

  it("scenario 5 (p. 19): the setup against the printed bullets, the accusation made from the grid, and the campaign is won", () => {
    const [, , , four, five] = standard().steps as [Step, Step, Step, Step, Step];
    const state = five.opened;
    const envelope = listOf(four.after, "aimEnvelope");
    const evidence = listOf(four.after, "evidence");
    // "Put into play each Adaptoid environment marked as 'in play'": exactly the recorded ones.
    const recordedEnvironments = listOf(four.after, "adaptoidEnvironments");
    for (const id of ["50109", "50110", "50111", "50112"]) {
      expect(inPlayCount(state, id) > 0, `Adaptoid environment ${id}`).toBe(recordedEnvironments.includes(id));
    }
    // "Shuffle each copy of the Adaptoid minion (113)" and the surviving Thunderbolt into the encounter deck.
    const deck = piles(state).deck.map((id) => codeOf(state, id));
    expect(deck.filter((code) => code === "50113")).toHaveLength(4);
    expect(deck.filter((code) => code === JOLT)).toHaveLength(1);
    // "Set the A.I.M. and S.H.I.E.L.D. envelopes aside": the piles hold the envelope and the unearned evidence.
    expect(state.hiddenPiles?.["aim"]?.map(String).sort()).toEqual([...envelope].sort());
    expect(state.hiddenPiles?.["shield"]).toHaveLength(9 - 3 - evidence.length);
    expect(state.revealedPileCards?.["shield"]?.map(String).sort()).toEqual([...evidence].sort());
    // "Place secret counters ... equal to the number recorded for that environment in scenario #4": the attachment too.
    expect(boardOf(state)).toEqual(recordedBoard(four.after, "secrets4"));
    expect(boardOf(state)[standard().flippedFront]!.attachment).toBe(true);
    // Three evidence cards earned: three Setups, offered after the mulligans.
    expect(five.offers.length).toBeGreaterThan(0);
    // The accusation: the mole's row was an open row of the grid (the earned evidence crossed out the rest), it was chosen, and was right.
    const mole = moleRowOf(envelope);
    expect(evidenceRowsLeft(GRID, evidence.map(cardId))).toContainEqual(mole);
    expect(five.played.accusation).toMatchObject({ accused: mole, mole, wrong: [] });
    expect(five.played.revealedPileCards?.["aim"]).toHaveLength(3);
    // Victory: "the players win the campaign!"
    expect(five.after.status).toBe("won");
    expect(five.after.history.map((h) => [h.nodeId, h.outcome])).toEqual(NODES.map((id) => [id, "won"]));
    expect(five.after.position.nextNodeId).toBeNull();
  });

  it("the envelope never changes over a won campaign and never appears in the log outside its hidden field", () => {
    const { steps } = standard();
    const envelope = listOf(steps[0]!.after, "aimEnvelope");
    for (const step of steps) {
      expect(listOf(step.after, "aimEnvelope")).toEqual(envelope);
      expectEnvelopeHidden(step.after, envelope);
      expectEnvelopeHidden(step.composed, envelope);
    }
    // The step trace of the sealed draw holds a count and no cards.
    const draw = steps[0]!.composed.attempt!.steps.find((t) => t.instructionId === "mc50.s1.setup.evidence")!;
    expect(draw.choices).toHaveLength(3);
    for (const choice of draw.choices) expect(choice.picked).toEqual([]);
  });

  it("the same campaign seed deals the same envelope and the same first scenario", () => {
    const again = compose(DEF, newLog(DEF, STANDARD, STANDARD_SEED));
    expect(listOf(again, "aimEnvelope")).toEqual(listOf(standard().steps[0]!.composed, "aimEnvelope"));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Item 80: a lost and retried scenario proves the log survives
// ---------------------------------------------------------------------------------------------------------------

/** The part of a log a retry must restore: everything the lost game could not change. */
const restorable = (log: CampaignLog) => ({
  shared: log.shared,
  hidden: log.hidden,
  seats: log.seats,
  removedFromCampaign: log.removedFromCampaign,
  nextNodeId: log.position.nextNodeId,
  resolved: log.position.resolved,
});

describe("a lost scenario is retried with the log intact (MC50 p. 4: 'reset the scenario and try again with no penalty')", () => {
  it("scenario 2 lost with a Board Member flipped in the lost game: the log equals the node's start, the member is an environment again, then the retry is won", () => {
    const start = standard().steps[1]!.before;
    let member = "";
    const first = runNode(start, {
      outcome: "loss",
      // A Board Member flipped during the game that is lost (a flip is not recorded by a loss).
      surgery: (played, opened) => {
        member = firstEnvironment(opened);
        return flipped(played, member, 5);
      },
    });
    expect(first.result.outcome).toBe("lost");
    expect(boardOf(first.opened)[member]!.attachment).toBe(false);
    expect(boardOf(first.final)[member]).toEqual({ secret: 5, attachment: true });
    const lost = first.after;
    expect(lost.status).toBe("active");
    expect(lost.position.nextNodeId).toBe("batroc");
    expect(lost.position.resolved["batroc"]).toBeUndefined();
    expect(lost.history.map((h) => [h.nodeId, h.outcome])).toEqual([
      ["black-widow", "won"],
      ["batroc", "lost"],
    ]);
    // "no penalty": the log equals the node's start (envelope, evidence, decks, secrets1, hit points) and nothing of the lost game.
    expect(restorable(lost)).toEqual(restorable(start));
    expect(lost.shared["secrets2"]).toBeUndefined();
    expect(lost.shared["rescuedCaptives"]).toBeUndefined();
    expectEnvelopeHidden(lost, listOf(start, "aimEnvelope"));

    // The retry: the same node composed again from the restored log opens with that member as an environment again.
    const retry = runNode(lost, {
      surgery: (played, opened) => asEnvironment(played, firstEnvironment(opened), 0),
    });
    // That member is an environment again, with the counters the node's start gave it.
    expect(boardOf(retry.opened)[member]).toEqual(boardOf(first.opened)[member]);
    expect(all(retry.opened, member)).toHaveLength(1);
    expect(listOf(retry.composed, "aimEnvelope")).toEqual(listOf(start, "aimEnvelope"));
    expect(listOf(retry.composed, "evidence")).toEqual(listOf(start, "evidence"));
    expect(retry.after.history.map((h) => [h.nodeId, h.outcome])).toEqual([
      ["black-widow", "won"],
      ["batroc", "lost"],
      ["batroc", "won"],
    ]);
    expect(retry.after.position.nextNodeId).toBe("modok");
    // The retry's own result, not the lost game's, is what was recorded: the flipped member is not in secrets2.
    expect(recordedBoard(retry.after, "secrets2")[member]!.attachment).toBe(false);
    expect(listOf(retry.after, "aimEnvelope")).toEqual(listOf(start, "aimEnvelope"));
  });

  it("scenario 4 lost: the member flipped in scenario 2 is still an attachment on the retry (stands in for a permanent removal this box does not have)", () => {
    // The box removes no card from the campaign, so the definition of done's third proof (a permanent removal that
    // sticks across a retry) has no subject here. What sticks across a retry in this box is the board: a member flipped
    // in an earlier, won scenario is recorded in the log the retry restores.
    const start = standard().steps[3]!.before;
    const member = standard().flippedFront;
    expect(recordedBoard(start, "secrets3")[member]!.attachment).toBe(true);
    const lost = runNode(start, { outcome: "loss" });
    expect(restorable(lost.after)).toEqual(restorable(start));
    const retry = runNode(lost.after, { outcome: "loss" });
    expect(boardOf(retry.opened)[member]).toEqual(recordedBoard(start, "secrets3")[member]);
    expect(restorable(retry.after)).toEqual(restorable(start));
    expect(retry.after.history.filter((h) => h.nodeId === "thunderbolts").map((h) => h.outcome)).toEqual([
      "lost",
      "lost",
    ]);
  });

  it("scenario 5 lost twice in a standard campaign: a new envelope and the same number of fresh evidence cards after each (p. 19, section 3.76)", () => {
    const start = standard().steps[4]!.before;
    const n = listOf(start, "evidence").length;
    expect(n).toBe(3);
    const firstLoss = runNode(start, { outcome: "loss", commands: 40 });
    const afterOne = firstLoss.after;
    const secondLoss = runNode(afterOne, { outcome: "loss", commands: 40 });
    const afterTwo = secondLoss.after;
    for (const log of [afterOne, afterTwo]) {
      expect(log.status).toBe("active");
      expect(log.position.nextNodeId).toBe("baron-zemo");
      const envelope = listOf(log, "aimEnvelope");
      const evidence = listOf(log, "evidence");
      // "Prepare the evidence as if you are starting a new campaign": one card of each kind.
      expect(envelope.map((id) => KIND_OF.get(id))).toEqual(["means", "motive", "opportunity"]);
      // "Gain one evidence card ... for each scenario in which you had at least one Board Member environment with no secret counters".
      expect(evidence).toHaveLength(n);
      expect(new Set(evidence).size).toBe(n);
      for (const card of evidence) expect(envelope).not.toContain(card);
      // What the node's start held stays: the recorded board, the Adaptoid environments, the Thunderbolts, the decks.
      for (const field of ["secrets4", "adaptoidEnvironments", "survivingThunderbolts"]) {
        expect(log.shared[field]).toEqual(start.shared[field]);
      }
      expect(log.seats.map((seat) => seat.deck)).toEqual(start.seats.map((seat) => seat.deck));
    }
    // A second loss deals again: this seed's two deals differ (the mix can repeat a deal by chance; the seed is fixed).
    const dealOf = (log: CampaignLog) => [listOf(log, "aimEnvelope"), listOf(log, "evidence")].join("|");
    expect(dealOf(afterTwo)).not.toBe(dealOf(afterOne));
    // The retry runs Setup as printed with the new deal.
    expect(secondLoss.opened.hiddenPiles?.["aim"]?.map(String).sort()).toEqual(
      [...listOf(afterOne, "aimEnvelope")].sort(),
    );
    expect(secondLoss.opened.revealedPileCards?.["shield"]?.map(String).sort()).toEqual(
      [...listOf(afterOne, "evidence")].sort(),
    );
    expect(afterTwo.history.filter((h) => h.nodeId === "baron-zemo").map((h) => h.outcome)).toEqual(["lost", "lost"]);
    // The DEFEAT block's draws are sealed: the step trace holds counts and no card ids.
    for (const entry of afterTwo.history.filter((h) => h.nodeId === "baron-zemo")) {
      const defeat = entry.steps.find((t) => t.instructionId === "mc50.s5.defeat.standard");
      expect(defeat, "the DEFEAT block ran").toBeDefined();
      for (const choice of defeat!.choices.filter((c) => ["means", "motive", "opportunity"].includes(c.slot))) {
        expect(choice.picked).toEqual([]);
      }
    }
    // The lost games' own in-game evidence gains are nowhere in the log: N cards, as counted above.
    // Replaying the campaign from its seed reproduces both deals.
    const againOne = runNode(start, { outcome: "loss", commands: 40 }).after;
    const againTwo = runNode(againOne, { outcome: "loss", commands: 40 }).after;
    expect(dealOf(againOne)).toBe(dealOf(afterOne));
    expect(dealOf(againTwo)).toBe(dealOf(afterTwo));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Expert campaign
// ---------------------------------------------------------------------------------------------------------------

/** Picks by seat: the heal answers, the Board Member each pays a secret counter on, and every evidence offer declined. */
function expertPicker(
  heal: readonly ("pay" | "decline" | "sitOut")[],
  target: readonly (string | undefined)[],
  seen: { hp: number[] },
): Picker {
  return (s) => {
    const choice = s.pendingChoice!;
    const seat = s.players.findIndex((p) => p.playerId === choice.playerId);
    if (choice.prompt.kind === "chooseOption") {
      const labels = choice.options.map((o) => o.label);
      if (labels.includes(HEAL_REC_LABEL) || labels.includes(REJOIN_REC_LABEL)) {
        seen.hp[seat] = hpOf(s, seat);
        const want = heal[seat];
        const hit =
          want === "pay"
            ? labelOf(s, HEAL_REC_LABEL, REJOIN_REC_LABEL)
            : labelOf(s, want === "sitOut" ? SIT_OUT_LABEL : "Decline");
        return hit ? [hit] : firstLegal(s);
      }
      return declining(s);
    }
    if (choice.prompt.kind === "chooseTarget" && target[seat]) {
      const hit = choice.options.find((o) => o.label === target[seat]);
      if (hit) return [hit.optionId];
    }
    return firstLegal(s);
  };
}

describe("an expert Agents of S.H.I.E.L.D. campaign: persistent damage, the heal for a secret counter, rejoin or sit out, and a lost scenario 5 (MC50 pp. 6, 11 to 19)", () => {
  it("records hit points through four scenarios, heals REC for a counter that flips a member at three, rejoins one player and sits another out, then loses scenario 5", () => {
    // Persistent damage is staged: the identity's damage is set at the end of each game so the recorded value is known.
    const damage = (state: GameState, seat: number, amount: number): GameState =>
      patchInstance(state, state.players[seat]!.identity.instanceId, { damage: amount });
    const eliminate = (state: GameState, seat: number): GameState => ({
      ...state,
      players: state.players.map((p, i) => (i === seat ? { ...p, eliminated: true } : p)),
    });

    // ---- E1: seat 1 hurt, seat 2 defeated in a scenario the team wins; the Medical Officer left at 2 counters ----
    const e1 = runNode(newLog(DEF, EXPERT, EXPERT_SEED), {
      // (The game may have flipped members for real at the expert threshold of three; they are put back so the heal below is staged.)
      surgery: (played) =>
        eliminate(
          damage(asEnvironment(asEnvironment(asEnvironment(played, MEDICAL, 2), SURVEILLANCE, 0), TACTICAL, 2), 0, 3),
          1,
        ),
    });
    // The expert board opens with two counters each (the modular-set rule), and flips at three, not four.
    for (const front of BOARD_MEMBER_FRONTS) expect(boardOf(e1.opened)[front]!.secret).toBe(2);
    const base0 = maxHpOf(e1.final, 0);
    expect(seatHp(e1.after)[0]).toBe(Math.min(hpOf(e1.final, 0), base0));
    expect(seatHp(e1.after)[0]).toBe(base0 - 3);
    // "the defeated player does not participate in the Victory steps": no record; the last record is cleared to 0.
    expect(seatHp(e1.after)[1]).toBe(0);
    expect(e1.result.sittingOut).toEqual([2]);

    // ---- E2: seat 1 pays the counter on the Medical Officer (2 -> 3, which flips it in expert mode) and heals REC; seat 2 rejoins ----
    const seen = { hp: [] as number[] };
    const e2 = runNode(e1.after, {
      pick: expertPicker(["pay", "pay"], ["Chief Medical Officer", "Chief Surveillance Officer"], seen),
      surgery: (played) => eliminate(damage(played, 0, 1), 1),
    });
    // "Set each player's hit points to their remaining hit point value recorded": seat 1 was offered the heal at its recorded value.
    expect(seen.hp[0]).toBe(seatHp(e1.after)[0]);
    // A defeated player (recorded 0) is asked to rejoin; both seats were offered the paid heal.
    expect(e2.offers).toContainEqual([HEAL_REC_LABEL, "Decline"]);
    expect(e2.offers).toContainEqual([REJOIN_REC_LABEL, SIT_OUT_LABEL]);
    // Q66 = B: the defeated seat answers first, before the scenario is set up, so a seat sitting out is not one of its
    // players. Its price is paid with the printed heal, without a second question.
    expect(e2.offers[0]).toEqual([REJOIN_REC_LABEL, SIT_OUT_LABEL]);
    // Printed order (Q13 = B): every evidence Setup offer comes before the paid heal.
    const isHeal = (labels: readonly string[]) => labels.includes(HEAL_REC_LABEL);
    const printed = e2.offers.slice(1);
    expect(printed.findIndex(isHeal)).toBeGreaterThan(0);
    expect(printed.slice(printed.findIndex(isHeal)).every(isHeal)).toBe(true);
    // The heal is REC, not the full value (reading A of section 4.1 Q14; p. 6 prints "full hit points"): reported as a question.
    const healedTo = Math.min(seatHp(e1.after)[0]! + recOf(e2.opened, 0), maxHpOf(e2.opened, 0));
    expect(hpOf(e2.opened, 0)).toBe(healedTo);
    expect(hpOf(e2.opened, 1)).toBe(Math.min(recOf(e2.opened, 1), maxHpOf(e2.opened, 1)));
    expect(e2.opened.players[1]!.eliminated).toBe(false);
    // The secret counter flipped the Medical Officer at the expert threshold of three, and the heal still resolved.
    expect(boardOf(e2.opened)[MEDICAL]).toEqual({ secret: 3, attachment: true });
    // The rejoining player's counter went on the Surveillance Officer (0 recorded, 1 now).
    expect(boardOf(e2.opened)[SURVEILLANCE]).toEqual({ secret: 1, attachment: false });
    expect(e2.result.outcome).toBe("won");
    expect(seatHp(e2.after)[0]).toBe(base0 - 1);
    // The flipped member is recorded as the attachment it is.
    expect(recordedBoard(e2.after, "secrets2")[MEDICAL]!.attachment).toBe(true);

    // ---- E3: seat 1 declines the heal (hit points are the record, persistent), seat 2, defeated again, sits this scenario out ----
    const e3 = runNode(e2.after, {
      pick: expertPicker(["decline", "sitOut"], [], { hp: [] }),
      // Seat 1 alone, hurt, against M.O.D.O.K.: a short opening (by command 11 the greedy driver has it defeated in M.O.D.O.K.'s first villain phase, which is the game's own damage).
      commands: 4,
      // The Surveillance Officer is the last environment: it is left bare so the rejoin below does not flip the third member (three attachments lose the game).
      surgery: (played) => damage(asEnvironment(played, SURVEILLANCE, 0), 0, 2),
    });
    expect(hpOf(e3.opened, 0)).toBe(base0 - 1);
    expect(e3.opened.players[1]!.eliminated).toBe(true);
    // The seat never started scenario 3, so it is played with one player's numbers (Q66 = B).
    expect(e3.opened.players[1]!.sittingOut).toBe(true);
    expect(e3.opened.startingPlayerCount).toBe(1);
    expect(e3.result.outcome).toBe("won");
    expect(e3.result.sittingOut).toEqual([2]);
    expect(seatHp(e3.after)[0]).toBe(base0 - 2);
    expect(seatHp(e3.after)[1]).toBe(0);
    expect(boardOf(e3.opened)[MEDICAL]!.attachment).toBe(true);

    // ---- E4: seat 2 rejoins at REC; seat 1 declines again; damage keeps carrying over ----
    const e4 = runNode(e3.after, {
      pick: expertPicker(["decline", "pay"], [undefined, "Chief Surveillance Officer"], { hp: [] }),
      commands: 10,
      surgery: (played) => damage(played, 0, 3),
    });
    expect(hpOf(e4.opened, 0)).toBe(seatHp(e3.after)[0]);
    expect(hpOf(e4.opened, 1)).toBe(Math.min(recOf(e4.opened, 1), maxHpOf(e4.opened, 1)));
    expect(e4.opened.players[1]!.eliminated).toBe(false);
    const record4 = seatHp(e4.after);
    expect(record4[0]).toBe(base0 - 3);
    expect(e4.after.position.nextNodeId).toBe("baron-zemo");

    // ---- E5: scenario 5 opens with the hit points carried through four scenarios, and is lost: the campaign is lost ----
    const e5 = runNode(e4.after, {
      pick: expertPicker(["decline", "decline"], [], { hp: [] }),
      outcome: "loss",
      commands: 40,
    });
    expect(e5.opened.hiddenPiles?.["aim"]).toHaveLength(3);
    if (record4[0]! > 0) expect(hpOf(e5.opened, 0)).toBe(record4[0]);
    expect(e5.after.status).toBe("lost");
    expect(e5.after.history.map((h) => [h.nodeId, h.outcome])).toEqual([
      ["black-widow", "won"],
      ["batroc", "won"],
      ["modok", "won"],
      ["thunderbolts", "won"],
      ["baron-zemo", "lost"],
    ]);
    // No retry is offered and the Victory-only fields of the lost game were not recorded.
    expect(e5.after.position.nextNodeId).toBeNull();
  });
});
