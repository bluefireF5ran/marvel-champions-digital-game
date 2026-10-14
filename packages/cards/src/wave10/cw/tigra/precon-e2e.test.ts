import { WAVE10_STARTER_DECKS } from "@mc/content";
import {
  applyCommand,
  cardsInPlay,
  hasKeyword,
  replay,
  sessionApply,
  startSession,
  type Command,
  type GameEvent,
  type GameSession,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import {
  P1,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  moveToHand,
  play,
  playerOf,
  stackEncounterDeck,
  use,
  type Picker,
} from "../../../testing/harness.js";
import { codeOf } from "../../../wave9/testing.js";
import { IRON_MAN_SCENARIO, TIGRA_DECK, WAVE10_DEPS as DEPS, civilWarGame } from "../../testing.js";

vi.setConfig({ testTimeout: 240_000 });

/**
 * Whole-game test for Tigra's printed starter deck (`tigra-aggression`, cards 56002 to 56022, checked against the MC56
 * rulebook p. 18) in the Civil War scenario `registration-iron-man`: docs/phase7-wave10-box-heroes.md B8.4 line 5.
 * Three rounds of real commands, one decision at a time, the deck as printed (the opening hand and the draws are the
 * seed's; the cards a round needs and the encounter cards of a villain phase are placed by test surgery, each
 * surgery closing a logged segment and opening the next, so every segment replays deep-equal from its own log).
 *
 * The board is quiet by choice: the main scheme pair Homeland Security (56121b, "Each minion gains guard") and No Going
 * Back, and Stark Tower (the leader's side scheme) put back in the deck.
 *
 * Authorities: the printed cards; MC56 p. 18 (the starter deck and its play notes); RRG 1.8 (mc_rulesreference_v18_
 * compressed.md): "Guard" p. 21 (a guard minion engaged with you stops you attacking a villain without guard), "Quickstrike"
 * p. 36, "Cost" p. 13 (an additional cost is paid before the effect), "Search" p. 39 (the searched deck is shuffled),
 * "Nemesis Encounter Set" p. 30 (set aside until a card brings it in), "Stun, Stunned" p. 41 (a stunned minion that
 * would attack discards the card instead and attacks not). FFG rulings: February 28, 2026 Rulings 1 and 4 (a
 * quickstrike minion attacks as soon as it engages, before what follows the cost arrow: owner answer 18 = A), March
 * 30, 2026 Ruling 1 (On the Hunt caps its draw at 3 per trigger). Deck order and the encounter deck are seeded (1).
 */

interface Plan {
  /** Optional triggers to take, by id suffix; every other optional trigger is declined. */
  readonly take?: readonly string[];
  /** Card prompts: the first of these codes on offer is chosen. */
  readonly cards?: readonly string[];
  /** Declare Tigra the defender (otherwise no defense). */
  readonly defend?: boolean;
}
const planner =
  (plan: Plan): Picker =>
  (s) => {
    const choice = s.pendingChoice!;
    const offered = choice.options.map((o) => o.optionId as string);
    switch (choice.prompt.kind) {
      case "chooseTriggers": {
        const hit = offered.find((o) => plan.take?.some((t) => o.endsWith(t)));
        return hit ? [hit] : [];
      }
      case "declareDefender":
        return plan.defend && offered.includes(identityOf(s) as string) ? [identityOf(s) as string] : ["decline"];
      default: {
        for (const code of plan.cards ?? []) {
          const hit = choice.options.find((o) => o.ref.kind === "card" && codeOf(s, o.ref.instanceId) === code);
          if (hit) return [hit.optionId];
        }
        return firstLegal(s);
      }
    }
  };

let session: GameSession;
let state: GameState;
/** Logged segments: a replay of each from its first state must end where the segment ended. */
const segments: { readonly log: GameSession["log"]; readonly end: GameState }[] = [];

/** Runs commands, answering each prompt by `plan`, through the session log; returns the events they produced. */
const act = (plan: Plan, ...commands: readonly Command[]): GameEvent[] => {
  const events: GameEvent[] = [];
  const settleOne = () => {
    while (state.pendingChoice && !state.outcome) {
      const choice = state.pendingChoice;
      const r = sessionApply(
        session,
        {
          type: "resolveChoice",
          playerId: choice.playerId,
          choiceId: choice.choiceId,
          selectedOptionIds: planner(plan)(state),
        },
        DEPS,
      );
      if (!r.ok) throw new Error(r.error.message);
      session = r.session;
      state = r.session.state;
      events.push(...r.events);
    }
  };
  settleOne();
  for (const command of commands) {
    const r = sessionApply(session, command, DEPS);
    if (!r.ok) throw new Error(`${command.type}: ${r.error.code}: ${r.error.message}`);
    session = r.session;
    state = r.session.state;
    events.push(...r.events);
    settleOne();
  }
  return events;
};
/** Test-only surgery: closes the logged segment and opens the next one from the changed state. */
const surgery = (next: GameState) => {
  segments.push({ log: session.log, end: state });
  state = next;
  session = startSession(next);
};
const give = (...codes: string[]) => surgery(moveToHand(state, P1, ...codes).state);
const stack = (...codes: string[]) => surgery(stackEncounterDeck(state, ...codes));

const ofType = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const indexOf = (events: readonly GameEvent[], pred: (e: GameEvent) => boolean) => events.findIndex(pred);

const encId = (code: string): InstanceId => {
  const pile = state.encounterDecks[Object.keys(state.encounterDecks)[0]!]!;
  const id = [...pile.deck, ...pile.discard].find((i) => codeOf(state, i) === code);
  if (!id) throw new Error(`no ${code} in the encounter deck or discard`);
  return id;
};
const encounterCodes = (): string[] => {
  const pile = state.encounterDecks[Object.keys(state.encounterDecks)[0]!]!;
  return [...pile.deck, ...pile.discard].map((i) => codeOf(state, i));
};
const handId = (code: string): InstanceId => {
  const id = playerOf(state, P1).hand.find((i) => codeOf(state, i) === code);
  if (!id) throw new Error(`${code} is not in hand`);
  return id;
};
const handCodes = (): string[] => playerOf(state, P1).hand.map((i) => codeOf(state, i));
const inPlayId = (code: string): InstanceId => {
  const id = cardsInPlay(state).find((i) => codeOf(state, i) === code);
  if (!id) throw new Error(`${code} is not in play`);
  return id;
};
const isInPlay = (code: string): boolean => cardsInPlay(state).some((i) => codeOf(state, i) === code);
const tigra = (): InstanceId => identityOf(state);
const damageOn = (id: InstanceId): number => inst(state, id).damage;
const guards = (code: string): boolean => hasKeyword(state, inPlayId(code), "guard", DEPS);
const basicAttack = (attacker: InstanceId, target: InstanceId): Command => ({
  type: "basicAttack",
  playerId: P1,
  attackerInstanceId: attacker,
  targetInstanceId: target,
});
const HUNTED = "56007";
const HUNT = "56001a.on-the-hunt";
const UNDERCOVER = "56001b.undercover-work";

describe("Tigra (Aggression) precon against Iron Man in registration-iron-man, seed 1", () => {
  it("setup: the printed 40 cards, hand of 6 in alter-ego form, quiet board", () => {
    state = civilWarGame(IRON_MAN_SCENARIO, {
      starterDeckId: TIGRA_DECK,
      mainSchemeStageIds: ["56121b", "56124b"] as never,
      leaderSideScheme: "discarded",
    });
    session = startSession(state);
    const p = playerOf(state, P1);
    expect(p.identity.form).toBe("alterEgo");
    expect(p.hand).toHaveLength(6);
    expect(p.deck).toHaveLength(34);
    const printed = WAVE10_STARTER_DECKS.find((d) => d.id === TIGRA_DECK)!.cards.flatMap((c) =>
      Array.from({ length: c.quantity }, () => c.cardId as string),
    );
    expect(printed).toHaveLength(40);
    const dealt = [...p.hand, ...p.deck].map((i) => codeOf(state, i));
    expect([...dealt].sort()).toEqual([...printed].sort());
    // Her nemesis set is set aside (RRG "Nemesis Encounter Set"), not in the encounter deck; the obligation is.
    expect(p.setAside.map((i) => codeOf(state, i)).sort()).toEqual(["56024", "56025", "56026", "56027", "56028"]);
    expect(encounterCodes()).toContain("56023");
    expect(encounterCodes()).toContain("01190");
    expect(handCodes()).toContain(HUNTED);
  });

  it("round 1, alter ego: Undercover Work adds a second Hunted from the deck (limit once per round), then she flips", () => {
    const events = act({}, use(P1, tigra(), UNDERCOVER));
    expect(handCodes().filter((c) => c === HUNTED)).toHaveLength(2);
    expect(playerOf(state, P1).deck).toHaveLength(33);
    expect(ofType(events, "deckShuffled")).toHaveLength(1);
    // Limit once per round (the card's own).
    expect(applyCommand(state, use(P1, tigra(), UNDERCOVER), DEPS).ok).toBe(false);
    const flipped = act({}, { type: "changeForm", playerId: P1 });
    expect(ofType(flipped, "formChanged")).toMatchObject([{ to: "hero" }]);
  });

  it("round 1: Hunted (cost 0) puts quickstrike Hellcat into play engaged; Hellcat attacks first, then wears Hunted and is stunned", () => {
    const hellcat = encId("56079");
    const hunted = handId(HUNTED);
    const events = act({}, play(P1, hunted, [], { costChoices: { hunted: [hellcat] } }));
    expect(ofType(events, "cardPlayed")).toMatchObject([{ instanceId: hunted, resourcesPaid: 0 }]);
    expect(inst(state, hellcat).engagedWith).toBe(P1);
    expect(inst(state, hunted).attachedTo).toBe(hellcat);
    expect(inst(state, hellcat).statuses.stunned).toBe(1);
    // Quickstrike (RRG p. 36) after engaging a hero-form player; the attack is resolved before what follows the cost
    // arrow, so Hunted is attached and Hellcat stunned afterwards (FFG Feb 28, 2026 Rulings 1 and 4; owner 18 = A).
    const hit = indexOf(events, (e) => e.type === "damageDealt" && e.targetInstanceId === tigra());
    const stunned = indexOf(events, (e) => e.type === "statusGiven" && e.instanceId === hellcat);
    expect(hit).toBeGreaterThan(-1);
    expect(stunned).toBeGreaterThan(hit);
    expect(ofType(events, "damageDealt").filter((e) => e.targetInstanceId === tigra())).toMatchObject([
      { amount: 2, sourceInstanceId: hellcat },
    ]);
    expect(damageOn(tigra())).toBe(2);
    // Put into play is not a reveal: Hellcat's When Revealed (it would stun Tigra) did not resolve.
    expect(inst(state, tigra()).statuses.stunned).toBe(0);
    expect(ofType(events, "encounterCardRevealed")).toHaveLength(0);
    expect(ofType(events, "deckShuffled")).toHaveLength(1);
  });

  it("round 1: a second Hunted on Doc Samson (printed guard): Tigra's constant takes his guard, Homeland Security gives it to the rest", () => {
    const samson = encId("56078");
    act({}, play(P1, handId(HUNTED), [], { costChoices: { hunted: [samson] } }));
    expect(inst(state, samson).attachments).toHaveLength(1);
    expect(inst(state, samson).statuses.stunned).toBe(1);
    expect(guards("56078")).toBe(false);
    expect(guards("56079")).toBe(false);
  });

  it("round 1: Moon Knight (cost 1) finds Bullseye, who comes in engaged, stunned and confused; he has guard, so the villain cannot be attacked", () => {
    give("56002");
    const strength = handId("56022");
    const events = act({ cards: ["56088"] }, play(P1, handId("56002"), [strength]));
    const bullseye = inPlayId("56088");
    expect(inst(state, bullseye).engagedWith).toBe(P1);
    expect(inst(state, bullseye).statuses).toMatchObject({ stunned: 1, confused: 1 });
    expect(ofType(events, "deckShuffled")).toHaveLength(1);
    expect(guards("56088")).toBe(true);
    // RRG "Guard": while a guard minion is engaged with you, you cannot use cards you control to attack the villain.
    const probe = applyCommand(state, basicAttack(inPlayId("56002"), state.activeVillainId!), DEPS);
    expect(probe.ok).toBe(false);
  });

  it("round 1 villain phase: the stunned minions lose their stun instead of attacking; Venom is dealt and engages; On the Hunt then draws exactly 3 for four engaged minions (the cap)", () => {
    stack("01186", "56087");
    const handBefore = playerOf(state, P1).hand.length;
    expect(handBefore).toBe(4);
    const events = act({ defend: true, take: [HUNT] }, endTurn());
    // Hellcat, Doc Samson and Bullseye were stunned: each activation is replaced by discarding the stunned card.
    expect(ofType(events, "statusRemoved")).toHaveLength(3);
    expect(ofType(events, "enemyActivated").filter((e) => e.activation === "attack")).toHaveLength(4);
    const venom = inPlayId("56087");
    expect(inst(state, venom).engagedWith).toBe(P1);
    expect(state.round).toBe(2);
    // End of the player phase drew 1 (hand size 5); the draw of the Response is the cards drawn after the round began.
    const afterRound = events.slice(indexOf(events, (e) => e.type === "roundStarted"));
    expect(ofType(afterRound, "cardDrawn")).toHaveLength(3);
    expect(playerOf(state, P1).hand).toHaveLength(8);
  });
});

describe("rounds 2 and 3", () => {
  const HUNTED_READY = "56007.hunted-interrupt";
  it("round 2: Tigra starts exhausted (she defended); Tooth and Claw costs nothing with four minions engaged, and Hunted readies her when Doc Samson falls", () => {
    expect(inst(state, tigra()).exhausted).toBe(true);
    const samson = inPlayId("56078");
    const venom = inPlayId("56087");
    const events = act({ cards: ["56078", "56087"], take: [HUNTED_READY] }, play(P1, handId("56008"), []));
    // Cost 4, reduced by 1 for each of the four engaged minions: nothing paid.
    expect(ofType(events, "cardPlayed")).toMatchObject([{ resourcesPaid: 0 }]);
    expect(ofType(events, "damageDealt").map((e) => [e.targetInstanceId, e.amount])).toEqual([
      [samson, 4],
      [venom, 4],
    ]);
    expect(ofType(events, "characterDefeated").map((e) => e.instanceId)).toEqual([samson, venom]);
    // Hunted: "When attached minion is defeated, ready Tigra" (an Interrupt, so before the defeat finishes).
    expect(inst(state, tigra()).exhausted).toBe(false);
  });

  it("round 2: with Samson and Venom gone the second Tooth and Claw costs 2 (Hellcat and Bullseye engaged)", () => {
    const second = handId("56008");
    expect(applyCommand(state, play(P1, second, []), DEPS).ok).toBe(false);
    const others = playerOf(state, P1).hand.filter((i) => i !== second);
    expect(applyCommand(state, play(P1, second, others.slice(0, 2)), DEPS).ok).toBe(true);
    expect(applyCommand(state, play(P1, second, others.slice(0, 1)), DEPS).ok).toBe(false);
  });

  it("round 2: a basic attack on Bullseye; the second Tooth and Claw defeats him, and then its second 4 damage may go to Iron Man (no guard minion is left)", () => {
    const bullseye = inPlayId("56088");
    const villain = state.activeVillainId!;
    // While Bullseye lives he guards (Homeland Security) and Moon Knight cannot attack the villain.
    expect(applyCommand(state, basicAttack(inPlayId("56002"), villain), DEPS).ok).toBe(false);
    act({}, basicAttack(tigra(), bullseye));
    expect(damageOn(bullseye)).toBe(2);
    const second = handId("56008");
    const pay = playerOf(state, P1)
      .hand.filter((i) => i !== second)
      .slice(0, 2);
    const events = act({ cards: ["56088", "56059"] }, play(P1, second, pay));
    expect(ofType(events, "characterDefeated").map((e) => e.instanceId)).toEqual([bullseye]);
    expect(isInPlay("56079")).toBe(true);
    expect(guards("56079")).toBe(false);
    // The second damage went to the villain: Hunted Hellcat does not guard.
    expect(ofType(events, "damageDealt").map((e) => e.targetInstanceId)).toContain(villain);
  });
});

describe("round 2 villain phase and round 3: the nemesis set", () => {
  it("round 2 villain phase: Shadow of the Past brings in The Hood (engaged) and Criminal Underworld; the rest of the set is shuffled into the encounter deck", () => {
    const player = playerOf(state, P1);
    expect(player.setAside).toHaveLength(5);
    stack("01186", "01190");
    act({ defend: true, take: [HUNT] }, endTurn());
    expect(state.round).toBe(3);
    const hood = inPlayId("56024");
    expect(inst(state, hood).engagedWith).toBe(P1);
    const underworld = inPlayId("56025");
    expect(state.villainArea).toContain(underworld);
    expect(playerOf(state, P1).setAside).toHaveLength(0);
    const codes = encounterCodes();
    for (const c of ["56026", "56027", "56028"]) expect(codes).toContain(c);
    expect(codes).not.toContain("56024");
    expect(codes).not.toContain("56025");
  });

  it("round 2 villain phase, continued: On the Hunt drew 2 for the two engaged minions (Hellcat, The Hood); Criminal Underworld came in with its printed 4 threat", () => {
    const hood = inPlayId("56024");
    const underworld = inPlayId("56025");
    expect(inst(state, underworld).threat).toBe(4);
    expect(inst(state, hood).engagedWith).toBe(P1);
    expect(damageOn(tigra())).toBe(7);
    expect(handCodes()).toHaveLength(7);
  });

  it("round 3: Bring It! draws 1 card per engaged minion (2); Cat-Like Reflexes is attached for 1", () => {
    const events = act({}, play(P1, handId("56015"), []));
    expect(ofType(events, "cardDrawn")).toHaveLength(2);
    const reflexes = handId("56006");
    act({}, play(P1, reflexes, [handId("56012")], { attachToInstanceId: tigra() }));
    expect(inst(state, reflexes).attachedTo).toBe(tigra());
  });

  it("round 3: Criminal Underworld: the Criminal Hood cannot take damage, so a basic attack cannot target him (RRG 'Target' p. 43; FFG Mar 19, 2026 Ruling 2)", () => {
    const hood = inPlayId("56024");
    const attempt = applyCommand(state, basicAttack(inPlayId("56002"), hood), DEPS);
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.error.code).toBe("no_valid_target");
    expect(damageOn(hood)).toBe(0);
    // The non-Criminal minion Hellcat is still a target.
    expect(applyCommand(state, basicAttack(inPlayId("56002"), inPlayId("56079")), DEPS).ok).toBe(true);
  });

  it("round 3 villain phase: Iron Man is defended; Cat-Like Reflexes stops Hellcat's 2; The Hood hits for 1 and places 1 threat on Criminal Underworld; his Mantle attaches to him", () => {
    const hood = inPlayId("56024");
    const hellcat = inPlayId("56079");
    const underworld = inPlayId("56025");
    const threatBefore = inst(state, underworld).threat;
    stack("01186", "01186", "56026");
    const events = act({ defend: true, take: ["56006.cat-like-reflexes-interrupt", HUNT] }, endTurn());
    expect(state.outcome).toBeNull();
    const prevented = ofType(events, "damagePrevented").filter((e) => e.targetInstanceId === tigra());
    expect(prevented).toMatchObject([{ amount: 2 }]);
    expect(isInPlay("56006")).toBe(false);
    const hits = ofType(events, "damageDealt").filter((e) => e.targetInstanceId === tigra());
    expect(hits).toMatchObject([{ amount: 1, sourceInstanceId: hood }]);
    expect(damageOn(tigra())).toBe(8);
    // Hellcat's attack was the one Cat-Like Reflexes met; the Hood's came later and its Forced Response followed it.
    const hellcatAt = indexOf(events, (e) => e.type === "attackResolved" && e.enemyInstanceId === hellcat);
    const hoodAt = indexOf(events, (e) => e.type === "attackResolved" && e.enemyInstanceId === hood);
    const placed = events.findIndex((e) => e.type === "threatPlaced" && e.schemeInstanceId === underworld);
    expect(hellcatAt).toBeGreaterThan(-1);
    expect(hoodAt).toBeGreaterThan(-1);
    expect(placed).toBeGreaterThan(hoodAt);
    expect(ofType(events, "threatPlaced").filter((e) => e.schemeInstanceId === underworld)).toMatchObject([
      { amount: 1 },
    ]);
    expect(inst(state, underworld).threat).toBe(threatBefore + 1);
    expect(inst(state, inPlayId("56026")).attachedTo).toBe(hood);
    expect(state.round).toBe(4);
  });
});

describe("the whole game", () => {
  it("ends in round 4 with the player phase's On the Hunt answered and no prompt or outcome left open", () => {
    expect(state.round).toBe(4);
    expect(state.outcome).toBeNull();
    expect(state.pendingChoice).toBeNull();
    // Tigra is alive with 8 damage; Moon Knight, Hellcat (with Hunted), the Hood (with his Mantle) are in play.
    for (const code of ["56001a", "56002", "56079", "56007", "56024", "56026", "56025"]) {
      expect(cardsInPlay(state).some((i) => codeOf(state, i) === code)).toBe(true);
    }
    expect(damageOn(tigra())).toBe(8);
  });

  it("every logged segment replays from its own first state, command by command, to the state it ended in (deep-equal)", () => {
    const all = [...segments, { log: session.log, end: state }];
    expect(all).toHaveLength(5);
    for (const { log, end } of all) {
      const replayed = replay(log, DEPS);
      if (!replayed.ok) throw new Error(`replay failed: ${replayed.error.message}`);
      expect(replayed.state).toEqual(end);
    }
    expect(all.reduce((n, seg) => n + seg.log.commands.length, 0)).toBeGreaterThan(30);
  });
});
