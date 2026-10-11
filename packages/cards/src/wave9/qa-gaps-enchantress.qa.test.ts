/**
 * Rules QA, gap from the wave 9 scenario tests: a Forced Action at the end of the player phase that has a payment in it
 * (Enchantress, MC55 pp. 6-7, 22; docs/phase7-wave9.md section 3.53). MC55 p. 7: "A player may perform a forced action at any
 * time during the player phase they could normally perform an action, but the player phase cannot end until all possible
 * forced actions among all players have been performed." RRG 1.8 "Action" (p. 6) and "Forced Action" (p. 20) say the same.
 * Findings are in the report; a FINDING comment marks where the game and its source disagree.
 */
import { applyCommand, outstandingForcedActions, type GameState, type InstanceId } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { P1, P2, endTurn, identityOf, inst, moveToHand, patchInstance, playerOf, use } from "../testing/harness.js";
import { IRON_MAN, SPIDER_MAN, codeOf } from "./testing.js";
import { putOnTopOfDeck } from "../testing/harness.js";
import { DEPS, act, inPlayAll, openScenario, resolveWith, villainPhaseDealing } from "./qa-gaps.shared.js";

vi.setConfig({ testTimeout: 300_000 });

const FORCED_ACTIONS = [
  "55012.alluring-call-forced-action",
  "55013.kiss-of-temptation-forced-action",
  "55014.love-concoction-forced-action",
  "55007b.trance-of-envy-forced-action",
  "55008b.trance-of-greed-forced-action",
  "55009b.trance-of-pride-forced-action",
  "55010b.trance-of-sloth-forced-action",
  "55011b.trance-of-wrath-forced-action",
];

describe("every Forced Action in the pack costs 'Exhaust this card' and nothing else (docs/phase7-wave9.md section 3.53)", () => {
  for (const id of FORCED_ACTIONS)
    it(id, () => {
      const definition = DEPS.abilities[id]!;
      expect(definition, "scripted").toBeDefined();
      expect(definition.trigger).toMatchObject({ kind: "action", forced: true });
      const cost = definition.cost ?? {};
      expect(Object.keys(cost).sort()).toEqual(["exhaustSelf"].filter((k) => k in cost));
      expect(cost).not.toHaveProperty("resources");
      expect(cost).not.toHaveProperty("resourcesX");
      expect(cost).not.toHaveProperty("payPrintedCostOf");
    });
});

/** The charm counters on the Enchantment (Hypnotic Gaze or Trance) attached to a player's identity. */
const charmOn = (s: GameState, player: typeof P1): number => {
  const gaze = inst(s, identityOf(s, player)).attachments.find((id) => /^550(0[7-9]|1[01])[ab]$/.test(codeOf(s, id)));
  return gaze ? (inst(s, gaze).counters["charm"] ?? 0) : -1;
};

/** Two players, p1 holding Alluring Call (55012), in round 2 with p1 first; Spider-Man in hero form with Haymaker in hand. */
const putOnTop = (s: GameState, code: string): GameState => putOnTopOfDeck(s, P1, code).state;

function withAlluringCall(): { s: GameState; call: InstanceId; haymaker: InstanceId } {
  let s = openScenario("enchantress", 2, { seats: [SPIDER_MAN, IRON_MAN], firstPlayerIndex: 1 });
  // p2 is first in round 1, so the second card goes to p1.
  s = villainPhaseDealing(s, ["55017", "55012"], {}).state;
  const call = inst(s, identityOf(s, P1)).attachments.find((id) => codeOf(s, id) === "55012");
  expect(call, "Alluring Call is on p1's identity").toBeDefined();
  expect(s.firstPlayerId, "the token passed").toBe(P1);
  s = act(s, {}, { type: "changeForm", playerId: P1 }).state;
  const given = moveToHand(s, P1, "01087");
  return { s: given.state, call: call!, haymaker: given.ids[0]! };
}

describe("Alluring Call (55012): 'place 1 charm counter ... Play a card from your hand, reducing its resource cost by 1' (MC55 p. 7)", () => {
  it("the end of the turn is refused until it is used (RRG p. 6); the player picks the card AND the cards that pay for it", () => {
    const { s, call, haymaker } = withAlluringCall();
    const refused = applyCommand(s, endTurn(P1), DEPS);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("forced_action_outstanding");
    const hand = playerOf(s, P1).hand;
    const pay = hand.find((id) => codeOf(s, id) === "01063" || codeOf(s, id) === "01007")!; // any one resource-bearing card
    const seen: string[] = [];
    const r = act(s, { cards: ["Haymaker"], payWith: [pay], seen }, use(P1, call, "55012.alluring-call-forced-action"));
    expect(seen.map((l) => l.split(":")[0])).toEqual(["chooseCards", "spendResources", "chooseTarget"]);
    // Haymaker costs 2, reduced by 1: one card pays; exactly the card the player chose is the one discarded with it.
    expect(playerOf(r.state, P1).discard).toContain(pay);
    expect(playerOf(r.state, P1).hand).not.toContain(haymaker);
    expect(inst(r.state, call).exhausted).toBe(true);
    expect(charmOn(r.state, P1)).toBe(1);
    // The turn can end now.
    expect(applyCommand(r.state, endTurn(P1), DEPS).ok).toBe(true);
  });

  it("pins: a card may be chosen and its payment declined; the card stays in hand and the forced action still counts as performed", () => {
    // MC55 p. 7 does not say whether declining the play is allowed once a card is playable ("Play a card from your hand" has
    // no 'may'). Today's script lets the player pick a card and then pay nothing. Report: rules question for the owner.
    const { s, call, haymaker } = withAlluringCall();
    const seen: string[] = [];
    const r = act(s, { cards: ["Haymaker"], payWith: [], seen }, use(P1, call, "55012.alluring-call-forced-action"));
    expect(seen.map((l) => l.split(":")[0])).toEqual(["chooseCards", "spendResources"]);
    expect(playerOf(r.state, P1).hand, "not played, not discarded").toContain(haymaker);
    expect(outstandingForcedActions(r.state, P1, DEPS)).toHaveLength(0);
    expect(charmOn(r.state, P1)).toBe(1);
  });

  it("pins: the 'which card' prompt requires one card while a playable card is in hand (no opting out of the play itself)", () => {
    const { s, call } = withAlluringCall();
    let min = -1;
    const r = act(
      s,
      (st) => {
        const c = st.pendingChoice!;
        if (c.prompt.kind === "chooseCards") {
          min = c.minSelections;
          return [c.options[0]!.optionId];
        }
        return [];
      },
      use(P1, call, "55012.alluring-call-forced-action"),
    );
    expect(min).toBe(1);
    expect(r.state.outcome).toBeNull();
  });

  it("the late path (its card readied after its player's turn ended): the engine asks 'which', then asks what to play and how to pay; nothing is paid for the player", () => {
    // RRG p. 6 and docs section 3.53: a forced action that became outstanding after its controller's turn is put to that
    // controller before the phase ends, "as a prompt that has only 'resolve it'". Here p1 used the Call in turn, ended the
    // turn, and p2's action readies it again (staged: no scripted card readies an attachment).
    const { s, call } = withAlluringCall();
    const used = act(s, { cards: [], payWith: [] }, use(P1, call, "55012.alluring-call-forced-action"), endTurn(P1));
    expect(used.state.step).toMatchObject({ phase: "player", kind: "turn", activePlayerId: P2 });
    const readied = patchInstance(used.state, call, { exhausted: false });
    // p2's own turn ends: p1 is asked to resolve its outstanding forced action.
    const ending = applyCommand(readied, endTurn(P2), DEPS);
    expect(ending.ok).toBe(true);
    if (!ending.ok) return;
    const ask = ending.state.pendingChoice!;
    expect(ask.playerId).toBe(P1);
    expect(ask.prompt).toMatchObject({ kind: "chooseOption", forcedAction: true });
    expect(ask.options).toHaveLength(1);
    // Resolve it: the cost has no resource part, so the example command carries an empty payment; the card play inside it is asked.
    const handBefore = playerOf(ending.state, P1).hand;
    const kinds: string[] = [];
    let cur = ending.state;
    for (let guard = 0; cur.pendingChoice && guard < 6; guard++) {
      kinds.push(`${cur.pendingChoice.playerId}:${cur.pendingChoice.prompt.kind}`);
      const pickHaymaker = (st: GameState): readonly string[] => {
        const choice = st.pendingChoice!;
        if (choice.prompt.kind === "chooseCards")
          return [choice.options.find((o) => o.label.includes("Haymaker"))?.optionId ?? choice.options[0]!.optionId];
        if (choice.prompt.kind === "spendResources") return [];
        return [choice.options[0]!.optionId];
      };
      cur = resolveWith(cur, pickHaymaker).state;
      if (kinds.at(-1)?.endsWith("discardDownToHandSize") || cur.step.phase !== "player") break;
    }
    expect(kinds.slice(0, 3)).toEqual(["p1:chooseOption", "p1:chooseCards", "p1:spendResources"]);
    expect(playerOf(cur, P1).hand.length, "declined: no card left the hand because of the play").toBeGreaterThanOrEqual(
      handBefore.length - 1,
    );
  });
});

describe("Trance of Greed (55008b): 'Draw 1 card, then play that card (paying its cost). If you cannot, take 1 damage.'", () => {
  // MC55 p. 7: the Trance side's When Revealed triggers as the Gaze flips; its Forced Action then repeats each round.
  function greed() {
    for (let seed = 1; seed <= 60; seed++) {
      const s = openScenario("enchantress", 1, { seed, seats: [SPIDER_MAN] });
      const gaze = inst(s, identityOf(s, P1)).attachments.find((id) => codeOf(s, id) === "55008a");
      if (!gaze) continue;
      // Five charm counters flip the Gaze (staged, as the scenario tests do; the flip itself is a state check).
      const staged = patchInstance(s, gaze, { counters: { charm: 5 } });
      const flipped = act(staged, {}, { type: "changeForm", playerId: P1 }).state;
      expect(inst(flipped, gaze).flipped, "flipped to Trance of Greed").toBe(true);
      return { s: flipped, gaze, seed };
    }
    throw new Error("no seed deals Trance of Greed");
  }

  it("pays for the drawn card when the player pays; takes 1 damage when the payment is declined (and the card stays in hand)", () => {
    const { s, gaze } = greed();
    // The top of the deck is Black Cat (ally, cost 2); the hand supplies the payment.
    const top = putOnTop(s, "01002");
    const hand = playerOf(top, P1).hand;
    const paying = hand.slice(0, 2);
    const damageBefore = inst(top, identityOf(top, P1)).damage;
    const paid = act(top, { payWith: paying }, use(P1, gaze, "55008b.trance-of-greed-forced-action"));
    expect(inPlayAll(paid.state, "01002"), "Black Cat was played").toHaveLength(1);
    expect(inst(paid.state, identityOf(paid.state, P1)).damage).toBe(damageBefore);
    // Declined: the same Forced Action, nothing paid.
    const seen: string[] = [];
    const declined = act(top, { payWith: [], seen }, use(P1, gaze, "55008b.trance-of-greed-forced-action"));
    expect(
      seen.some((l) => l.startsWith("spendResources")),
      "the payment is asked, not made for the player",
    ).toBe(true);
    expect(inPlayAll(declined.state, "01002"), "not played").toHaveLength(0);
    expect(playerOf(declined.state, P1).hand.some((id) => codeOf(declined.state, id) === "01002")).toBe(true);
    // The script treats a declined payment as "cannot" and charges 1 damage instead: a rules question (report), pinned here.
    expect(inst(declined.state, identityOf(declined.state, P1)).damage).toBe(damageBefore + 1);
  });
});
