/**
 * Rules QA, gaps from the wave 9 scenario tests: Baron Zemo standalone (MC50 pp. 18-19; docs/phase7-wave9.md section 1.4).
 * Why the greedy driver loses in one or two rounds (it takes every optional trigger, so it advances to the accusation at the
 * end of round 1 with no evidence and accuses the first row), the opening numbers against the printed cards, the Sword's Hero
 * Action in a whole game, and purposeful lines (testing: `zemoDecide`) that reach the accusation and the Unmasked fight
 * at one and two players from the printed setup with the natural encounter deck. A FINDING comment marks where the game and
 * its source disagree: the expected behavior is an `it.fails`, with a passing companion that pins today's behavior.
 */
import { AOS_EVIDENCE_COMBINATIONS, type EvidenceCombination } from "@mc/content";
import { applyCommand, cardOf, legalActions, replay, wrongGuessesOf, type InstanceId } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { P1, endTurn, inst, moveToHand, playerOf, use } from "../testing/harness.js";
import { IRON_MAN, SPIDER_MAN, codeOf } from "./testing.js";
import {
  DEPS,
  act,
  inPlayAll,
  mainThreatOf,
  openScenario,
  playPolicy,
  targetThreatOf,
  villainHp,
  villainPhaseDealing,
  zemoDecide,
} from "./qa-gaps.shared.js";

vi.setConfig({ testTimeout: 300_000 });

const MEMBERS = ["50181a", "50182a", "50183a"] as const;
const secretsOn = (s: ReturnType<typeof openScenario>) =>
  MEMBERS.map((code) => {
    const id = (Object.keys(s.instances) as InstanceId[]).find(
      (i) =>
        (codeOf(s, i) === code && s.villainArea.includes(i)) ||
        (codeOf(s, i) === `${code.slice(0, -1)}b` && s.instances[i]!.attachedTo !== null),
    )!;
    return s.instances[id]!.counters["secret"] ?? 0;
  });
const moleRow = (s: ReturnType<typeof openScenario>): EvidenceCombination => {
  const aim = new Set((s.hiddenPiles?.["aim"] ?? []).map((c) => c as string));
  return AOS_EVIDENCE_COMBINATIONS.find((row) =>
    (["means", "motive", "opportunity"] as const).every((g) => aim.has(row[g] as string)),
  )!;
};

describe("Baron Zemo, opening numbers against the printed cards (50165a, 50167a, 50181a-50183a), one to four players", () => {
  for (const n of [1, 2, 3, 4])
    it(`${n} player(s): Zemo ATK 2, SCH 3, 12 fixed hit points; ${2 * n} threat, target ${12 * n}; stage 1B, no Sword yet`, () => {
      const s = openScenario("baron-zemo", n);
      const villain = cardOf(s, s.activeVillainId) as unknown as {
        sides: { stages: { atk: number; sch: number }[] }[];
      };
      expect(villain.sides[0]!.stages[0]).toMatchObject({ atk: 2, sch: 3 });
      expect(villainHp(s)).toBe(12);
      expect(mainThreatOf(s)).toBe(2 * n);
      expect(targetThreatOf(s)).toBe(12 * n);
      expect(s.mainScheme.stageIndex).toBe(0);
      expect(inPlayAll(s, "50170"), "the Sword is found at stage 3A, not before").toHaveLength(0);
      expect(secretsOn(s)).toEqual([2, 2, 2]);
    });
});

describe("why the greedy player loses a Baron Zemo game in round 1 or 2 (MC50 p. 19)", () => {
  // The driver accepts every optional trigger: the stage 1B Response's "may advance" at the end of round 1 and then the first
  // listed row. MC50 p. 19: each wrong guess puts a secret counter on EVERY Board Member, a wrong accusation also puts 3 on the
  // accused, and a member at 4 secrets (3 in expert) joins Zemo; "if all of the board members join Baron Zemo, the players
  // lose". Starting at 2 each (not campaign mode), two wrong guesses already flip all three.
  it("an immediate accusation with no evidence has at least two wrong guesses, every member reaches 4, and the players lose", () => {
    const s = openScenario("baron-zemo", 1, { seed: 1, seats: [SPIDER_MAN] });
    const mole = moleRow(s);
    const accused = AOS_EVIDENCE_COMBINATIONS[0]!;
    const wrong = wrongGuessesOf(accused, mole);
    expect(
      wrong.length,
      "a wrong row differs in its member and at least one of the three cards",
    ).toBeGreaterThanOrEqual(2);
    const r = act(s, { take: ["zemos-manipulations-response"], options: ["Advance"] }, endTurn(P1));
    expect(r.state.outcome).toMatchObject({ result: "loss", reason: "cardAbility" });
    expect(secretsOn(r.state).every((n) => n >= 4)).toBe(true);
    // 2 + one per wrong guess on every member; the accused also takes 3 more.
    const totals = secretsOn(r.state);
    expect(Math.min(...totals)).toBe(2 + wrong.length);
  });

  it("the Response is offered with nothing to place (no empty member) and declining it keeps the game going", () => {
    const s = openScenario("baron-zemo", 1, { seed: 1, seats: [SPIDER_MAN] });
    const r = act(s, { take: ["zemos-manipulations-response"], options: ["Do not advance"] }, endTurn(P1));
    expect(r.state.outcome).toBeNull();
    expect(r.state.mainScheme.stageIndex).toBe(0);
    expect(r.state.round).toBe(2);
  });
});

describe("Baron Zemo's Sword (50170) Hero Action in a whole game: '[physical][physical][physical] or [energy][energy][energy] -> remove 1 secret counter and discard this card'", () => {
  function armed() {
    let s = openScenario("baron-zemo", 1, { seed: 1, seats: [SPIDER_MAN] });
    s = villainPhaseDealing(s, ["50170"], { options: ["Do not"], take: [] }).state;
    const sword = inPlayAll(s, "50170")[0]!;
    expect(inst(s, sword).attachedTo, "revealed, it attaches to Zemo").toBe(s.activeVillainId);
    s = act(s, {}, { type: "changeForm", playerId: P1 }).state;
    return { s, sword };
  }
  const total = (s: ReturnType<typeof openScenario>) => secretsOn(s).reduce((a, b) => a + b, 0);

  it("three physical resources: the physical branch of the cost is paid, 1 secret counter leaves a member and the Sword is discarded", () => {
    const { s, sword } = armed();
    const given = moveToHand(s, P1, "01003", "01003", "01008");
    const before = total(given.state);
    const r = act(
      given.state,
      {},
      use(
        P1,
        sword,
        "50170.baron-zemos-sword-action",
        given.ids.map((fromHand) => ({ fromHand })),
        undefined,
        { branch: 0 },
      ),
    );
    expect(total(r.state)).toBe(before - 1);
    expect(inst(r.state, sword).attachedTo, "discarded").toBeNull();
  });

  it("the wrong type does not pay it (three mental resources toward the physical branch): refused, nothing spent", () => {
    const { s, sword } = armed();
    const given = moveToHand(s, P1, "01004", "01004", "01061");
    const r = applyCommand(
      given.state,
      use(
        P1,
        sword,
        "50170.baron-zemos-sword-action",
        given.ids.map((fromHand) => ({ fromHand })),
        undefined,
        { branch: 0 },
      ),
      DEPS,
    );
    expect(r.ok).toBe(false);
    expect(inst(given.state, sword).attachedTo).toBe(s.activeVillainId);
  });

  // The Sword's cost is the ability's own (`eitherCost`), so a player who holds neither three [physical] nor three
  // [energy] cannot initiate it (RRG 1.8 "Cost", p. 13; "Initiating Abilities" step 5, Appendix, p. 49).
  const unpayable = () => {
    const { s, sword } = armed();
    // A hand of one card: neither three physical nor three energy resources can be made.
    const keep = playerOf(s, P1).hand.slice(0, 1);
    const stripped = { ...s, players: s.players.map((p) => (p.playerId === P1 ? { ...p, hand: keep } : p)) };
    return { s: stripped, sword };
  };
  const useSword = (sword: InstanceId) => ({
    type: "useAbility" as const,
    playerId: P1,
    cardInstanceId: sword,
    abilityId: "50170.baron-zemos-sword-action" as never,
    payment: [],
  });

  it("with nothing payable the Hero Action is not offered and cannot be initiated (RRG p. 13 / p. 49)", () => {
    const { s, sword } = unpayable();
    const legal = legalActions(s, P1, DEPS);
    const listed =
      legal.kind === "turn" && legal.legal.some((l) => l.action.kind === "useAbility" && l.action.instanceId === sword);
    expect(listed).toBe(false);
    expect(applyCommand(s, useSword(sword), DEPS).ok).toBe(false);
  });
});

describe("purposeful Baron Zemo lines from the printed setup (natural encounter deck): clear members, gain evidence, accuse", () => {
  // `zemoDecide` uses each Board Member's Hero Action to empty it, takes the Response, and advances only when two or fewer
  // rows are left or the main scheme is within 6 of the target. It does not win (see the report: 0 of 50 seeds), but it reaches
  // the accusation and the Unmasked fight, which the greedy driver cannot.
  const lines: [string, number, number][] = [
    ["1 player", 1, 2],
    ["1 player", 1, 6],
    ["2 players", 2, 3],
    ["2 players", 2, 4],
  ];
  for (const [label, n, seed] of lines)
    it(`${label}, seed ${seed}: the accusation (stage 2) is made and stage 3A is reached; the Unmasked Zemo, if the players are alive, has ${18} hit points per hero; the log replays`, () => {
      const seats = n === 1 ? [SPIDER_MAN] : [SPIDER_MAN, IRON_MAN];
      const initial = openScenario("baron-zemo", n, { seed, seats });
      // Stop at the first quiet moment of the player phase once 3A is current (its When Revealed has resolved).
      const run = playPolicy(
        initial,
        zemoDecide,
        700,
        (s) => s.mainScheme.stageIndex >= 2 && !s.pendingChoice && s.step.phase === "player",
      );
      const st = run.session.state;
      expect(st.mainScheme.stageIndex, "the accusation (stage 2) was made and 3A reached").toBeGreaterThanOrEqual(2);
      if (!st.outcome) {
        // 3A: "Flip Baron Zemo to his Unmasked side and reset his hit points to his printed hit point value."
        expect(st.villains.find((v) => v.instanceId === st.activeVillainId)).toMatchObject({ side: "B" });
        expect(villainHp(st)).toBe(18 * n);
        expect(inst(st, st.activeVillainId).damage).toBe(0);
      } else {
        // A wrong accusation loses by the Board Members (cardAbility) or the clock (mainSchemeCompleted) or the heroes.
        expect(st.outcome.result).toBe("loss");
      }
      const replayed = replay(run.session.log, DEPS);
      if (!replayed.ok) throw new Error(replayed.error.message);
      expect(replayed.state).toEqual(st);
    });
});
