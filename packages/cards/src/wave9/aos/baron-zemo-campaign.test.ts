import { createGame, type CampaignLog, type GameState, type InstanceId } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { applyOk, endTurn, firstLegal, patchInstance, settle, type Picker } from "../../testing/harness.js";
import { WAVE9_DEPS } from "../index.js";
import { wave9Scenario } from "../setup.js";
import { BLANK, ONE_ICON, SPIDER_MAN, codeOf, heroForm, onlyDeck } from "../testing.js";
import { buildGame, compose, newLog, zemoDefinition } from "./campaign/testing.js";

vi.setConfig({ testTimeout: 300_000 });

/**
 * The campaign branches of Zemo's Manipulations (50167a Setup, 50167b Response; docs/phase7-wave9.md section 3.75,
 * MC50 pp. 18 to 19). The standalone behavior is pinned in `baron-zemo.test.ts`; this file plays the same scenario inside a
 * campaign game (a log holding the A.I.M. envelope and the evidence gained, seeded into the piles by the definition's
 * `seedHiddenPiles` step) and next to it a standalone game for comparison.
 *
 * "If not playing campaign mode, place 2 secret counters on each Board Member environment" and "Prepare the evidence"
 * (the deal) are skipped in a campaign; "to gain 2 cards from the S.H.I.E.L.D. envelope (1 card instead in campaign mode)".
 */
const MEMBERS = ["50181a", "50182a", "50183a"];
const SWORD = "50170";

const aimOf = (s: GameState): readonly string[] => (s.hiddenPiles?.["aim"] ?? []).map((c) => c as string);
const shieldOf = (s: GameState): readonly string[] => (s.hiddenPiles?.["shield"] ?? []).map((c) => c as string);
const gainedOf = (s: GameState): readonly string[] => (s.revealedPileCards?.["shield"] ?? []).map((c) => c as string);
const secretsOn = (s: GameState, code: string): number => {
  const id = (Object.keys(s.instances) as InstanceId[]).find((i) => codeOf(s, i) === code)!;
  return s.instances[id]!.counters["secret"] ?? 0;
};
const idsOf = (log: CampaignLog, field: string, hidden: boolean): readonly string[] => {
  const value = (hidden ? log.hidden : log.shared)[field];
  return value?.kind === "cardList" ? value.cardIds.map((id) => id as string) : [];
};

/** The shared tail of both games: the encounter deck cut to filler and the Sword, heroes in hero form. */
const ready = (state: GameState): GameState =>
  heroForm(onlyDeck(state, BLANK, BLANK, ONE_ICON, "01187", "01189", "01190", SWORD));

function campaignGame(gained: number) {
  const definition = zemoDefinition(gained);
  const composed = compose(definition, newLog(definition));
  const built = buildGame(definition, composed);
  const state = settle(built.state, firstLegal, (s) => s.step.phase === "player", WAVE9_DEPS);
  return { composed, state: ready(state) };
}

function standaloneGame(): GameState {
  const created = createGame(wave9Scenario("baron-zemo", { players: [SPIDER_MAN], seed: 1 }), WAVE9_DEPS);
  if (!created.ok) throw new Error(created.error.message);
  return ready(settle(created.state, firstLegal, (s) => s.step.phase === "player", WAVE9_DEPS));
}

/** Ends the player phase; the first player takes 1B's gain offer, and declines advancing. */
function takeTheGain(start: GameState): GameState {
  const pick: Picker = (s) => {
    const choice = s.pendingChoice!;
    if (choice.prompt.kind === "chooseTriggers") {
      const hit = choice.options.find((o) => (o.optionId as string).includes("zemos-manipulations"));
      return hit ? [hit.optionId] : [];
    }
    if (choice.prompt.kind === "chooseOption") {
      const gain = choice.options.find((o) => o.label.startsWith("Place 2 secret counters"));
      if (gain) return [gain.optionId];
      const no = choice.options.find((o) => o.label.startsWith("Do not"));
      if (no) return [no.optionId];
    }
    return firstLegal(s);
  };
  let state = start;
  for (const player of state.players) state = applyOk(state, endTurn(player.playerId), WAVE9_DEPS).state;
  for (let guard = 0; state.pendingChoice && !state.outcome && guard < 200; guard++) {
    const choice = state.pendingChoice;
    // Zemo's own interrupt (Unmasked) comes after everything this test is about.
    if (choice.options.some((o) => o.label.startsWith("Give Baron Zemo an additional boost card"))) break;
    state = applyOk(
      state,
      { type: "resolveChoice", playerId: choice.playerId, choiceId: choice.choiceId, selectedOptionIds: pick(state) },
      WAVE9_DEPS,
    ).state;
  }
  return state;
}

/** Test surgery: an environment with no secret counter, so that 1B's offer is made. */
const bare = (state: GameState, code: string): GameState => {
  const id = (Object.keys(state.instances) as InstanceId[]).find((i) => codeOf(state, i) === code)!;
  return patchInstance(state, id, { counters: {} });
};

describe("1A Setup (50167a) in a campaign (MC50 p. 18: place the envelopes within reach)", () => {
  it("deals nothing: the piles are the log's A.I.M. envelope, the S.H.I.E.L.D. envelope's rest and the evidence gained", () => {
    const { composed, state } = campaignGame(2);
    const envelope = idsOf(composed, "aimEnvelope", true);
    const gained = idsOf(composed, "evidence", false);
    expect(envelope).toHaveLength(3);
    expect(gained).toHaveLength(2);
    // The log's three cards are the A.I.M. pile (as a set: the pile is a shuffled copy), the two gained are face up,
    // and the S.H.I.E.L.D. pile is the four cards in neither.
    expect([...aimOf(state)].sort()).toEqual([...envelope].sort());
    expect([...gainedOf(state)].sort()).toEqual([...gained].sort());
    expect(shieldOf(state)).toHaveLength(4);
    expect(new Set([...aimOf(state), ...gainedOf(state), ...shieldOf(state)]).size).toBe(9);
  });

  it("places no starting counters: the Board Member environments start bare (the log's counters are the definition's)", () => {
    const { state } = campaignGame(0);
    for (const member of MEMBERS) expect(secretsOn(state, member)).toBe(0);
  });

  it("a standalone game, for comparison, deals its own piles (3 and 6) and places 2 secret counters on each", () => {
    const state = standaloneGame();
    expect(aimOf(state)).toHaveLength(3);
    expect(shieldOf(state)).toHaveLength(6);
    expect(gainedOf(state)).toHaveLength(0);
    for (const member of MEMBERS) expect(secretsOn(state, member)).toBe(2);
  });

  it("holds none of the nine evidence cards in the encounter deck or a player's cards, as outside a campaign", () => {
    const { state } = campaignGame(1);
    const all = Object.values(state.instances).map((i) => i.cardId as string);
    for (let n = 50185; n <= 50193; n++) expect(all).not.toContain(String(n));
  });
});

describe("1B Response (50167b) in a campaign: 1 card instead of 2", () => {
  it("gains 1 evidence card from the S.H.I.E.L.D. envelope for the 2 counters", () => {
    const { state: start } = campaignGame(1);
    const before = gainedOf(start);
    // All three environments start bare in a campaign game here: the first player names one for the 2 counters.
    const after = takeTheGain(start);
    expect(MEMBERS.map((member) => secretsOn(after, member)).sort()).toEqual([0, 0, 2]);
    expect(gainedOf(after)).toHaveLength(before.length + 1);
    expect(shieldOf(after)).toHaveLength(shieldOf(start).length - 1);
    // The card gained came from the S.H.I.E.L.D. pile, not the A.I.M. envelope.
    const gained = gainedOf(after).filter((id) => !before.includes(id));
    expect(gained).toHaveLength(1);
    expect(aimOf(after)).toEqual(aimOf(start));
    expect(shieldOf(start)).toContain(gained[0]);
  });

  it("a standalone game gains 2 for the same 2 counters", () => {
    const start = standaloneGame();
    const after = takeTheGain(bare(start, MEMBERS[1]!));
    expect(gainedOf(after)).toHaveLength(2);
    expect(shieldOf(after)).toHaveLength(4);
  });

  it("declining gains nothing in a campaign either", () => {
    const { state: start } = campaignGame(1);
    let state = start;
    for (const player of state.players) state = applyOk(state, endTurn(player.playerId), WAVE9_DEPS).state;
    for (let guard = 0; state.pendingChoice && !state.outcome && guard < 200; guard++) {
      const choice = state.pendingChoice;
      if (choice.options.some((o) => o.label.startsWith("Give Baron Zemo an additional boost card"))) break;
      const no = choice.options.find((o) => o.label.startsWith("Do not"));
      state = applyOk(
        state,
        {
          type: "resolveChoice",
          playerId: choice.playerId,
          choiceId: choice.choiceId,
          selectedOptionIds: no ? [no.optionId] : firstLegal(state),
        },
        WAVE9_DEPS,
      ).state;
    }
    expect(gainedOf(state)).toEqual(gainedOf(start));
    expect(MEMBERS.map((member) => secretsOn(state, member))).toEqual([0, 0, 0]);
  });
});
