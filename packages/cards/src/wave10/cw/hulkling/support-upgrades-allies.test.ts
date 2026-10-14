import { CW_CARDS, cardId } from "@mc/content";
import {
  activeEncounterDeckId,
  characterProfile,
  keywordsOf,
  paymentFor,
  replay,
  sessionApply,
  startSession,
  traitsOf,
  type Command,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { validateDefinition } from "../../../dsl/validate.js";
import {
  P1,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  mainThreat,
  moveToHand,
  patchInstance,
  payWith,
  play,
  playerOf,
  resourceAbility,
  stackEncounterDeck,
  use,
  type Picker,
} from "../../../testing/harness.js";
import { WAVE10_DEPS, engageMinion, hulklingGame, hulklingHeroGame, stagedInPlay } from "../../testing.js";
import {
  HULKLING_SUPPORT_UPGRADES_ALLIES,
  HULKLING_SUPPORT_UPGRADES_ALLIES_SKIPPED,
} from "./support-upgrades-allies.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Hulkling's ally, support and Shapeshift upgrades, docs/phase7-wave10-box-heroes.md B2, B3.9, B3.10 and B7.2: Wiccan
 * 56030, Altman Residence 56031, Winged / Hulk / Armored / Imitation Shape 56032 to 56035, in the printed precon
 * `hulkling-protection` against Core's Rhino, and Alien Physiology 56036 (B7.2). Hero face: THW 1, ATK 1, DEF 1.
 * Hulkling's own Chosen Shape (56029a) is another module: every game here arranges its one Shapeshift upgrade by
 * surgery, and nothing relies on that ability firing.
 */
const WICCAN = "56030.wiccan-response";
const RESIDENCE = "56031.altman-residence-action";
const WINGED_C = "56032.winged-shape-constant";
const WINGED_R = "56032.winged-shape-response";
const HULK_C = "56033.hulk-shape-constant";
const HULK_R = "56033.hulk-shape-response";
const ARMORED_C = "56034.armored-shape-constant";
const ARMORED_R = "56034.armored-shape-response";
const IMITATION_C = "56035.imitation-shape-constant";
const IMITATION_I = "56035.imitation-shape-forced-interrupt";
const IMITATION_R = "56035.imitation-shape-response";
const REFS = [
  WICCAN,
  RESIDENCE,
  WINGED_C,
  WINGED_R,
  HULK_C,
  HULK_R,
  ARMORED_C,
  ARMORED_R,
  IMITATION_C,
  IMITATION_I,
  IMITATION_R,
  "56036.alien-physiology-resource",
];
const ALIEN = "56036.alien-physiology-resource";
const STRIKE = "56037"; // Shapeshifter Strike: an identity-specific event of the Hulkling set
const FIRST_AID = "01086"; // Core basic event, cost 1: "Action: Heal 2 damage from any character."
const MODOK = "01184"; // Core minion, 8 hit points
const ADVANCE = "01186"; // Core treachery: "The villain schemes"
const CHARGE = "01099"; // Rhino attachment, 2 boost icons
const MODOK_ID = "modok" as InstanceId;

const ofType = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const piles = (s: GameState) => s.encounterDecks[activeEncounterDeckId(s)]!;
const villainOf = (s: GameState): InstanceId => s.activeVillainId!;
const hero = (s: GameState) => characterProfile(s, identityOf(s), WAVE10_DEPS)!;

/** Applies `command`, answering each choice with `pick`; the log replays to the same state. */
function drive(state: GameState, command: Command, pick: Picker = firstLegal) {
  let session = startSession(state);
  const events: GameEvent[] = [];
  const first = sessionApply(session, command, WAVE10_DEPS);
  if (!first.ok) throw new Error(`${command.type} rejected: ${first.error.code}: ${first.error.message}`);
  session = first.session;
  events.push(...first.events);
  for (let guard = 0; session.state.pendingChoice && !session.state.outcome; guard++) {
    if (guard > 100) throw new Error(`choices did not settle (${session.state.pendingChoice.prompt.kind})`);
    const choice = session.state.pendingChoice;
    const next = sessionApply(
      session,
      {
        type: "resolveChoice",
        playerId: choice.playerId,
        choiceId: choice.choiceId,
        selectedOptionIds: pick(session.state),
      },
      WAVE10_DEPS,
    );
    if (!next.ok) throw new Error(`resolveChoice rejected: ${next.error.code}: ${next.error.message}`);
    session = next.session;
    events.push(...next.events);
  }
  const replayed = replay(session.log, WAVE10_DEPS);
  if (!replayed.ok) throw new Error(replayed.error.message);
  expect(replayed.state).toEqual(session.state);
  return { state: session.state, events };
}
const rejected = (state: GameState, command: Command): boolean =>
  !sessionApply(startSession(state), command, WAVE10_DEPS).ok;

/**
 * Picks, in order of preference: the card wanted by `targets` (the first listed one on offer), the option whose id ends
 * with an accepted ability; anything else as `firstLegal`.
 */
const choosing =
  (opts: { targets?: readonly InstanceId[]; accept?: readonly string[] } = {}): Picker =>
  (state) => {
    const choice = state.pendingChoice;
    if (!choice) return [];
    const wanted = (opts.targets ?? []).find((t) =>
      choice.options.some((o) => o.ref.kind === "card" && o.ref.instanceId === t),
    );
    if (wanted) return [choice.options.find((o) => o.ref.kind === "card" && o.ref.instanceId === wanted)!.optionId];
    const accepted = choice.options.filter((o) => (opts.accept ?? []).some((a) => o.optionId.endsWith(`:${a}`)));
    if (accepted.length > 0) return [accepted[0]!.optionId];
    return firstLegal(state);
  };

/** Moves instance `id` of the first seat to the top of its deck, to its discard pile, or to the bottom of its deck. */
function relocate(state: GameState, id: InstanceId, to: "deck" | "discard" | "bottom"): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      if (p.playerId !== P1) return p;
      const rest = {
        ...p,
        hand: p.hand.filter((i) => i !== id),
        deck: p.deck.filter((i) => i !== id),
        discard: p.discard.filter((i) => i !== id),
      };
      if (to === "discard") return { ...rest, discard: [...rest.discard, id] };
      return to === "deck" ? { ...rest, deck: [id, ...rest.deck] } : { ...rest, deck: [...rest.deck, id] };
    }),
  };
}
const copiesOf = (s: GameState, code: string): InstanceId[] => {
  const p = playerOf(s, P1);
  return [...p.hand, ...p.deck, ...p.discard].filter((i) => inst(s, i).cardId === cardId(code));
};
const relabel = (s: GameState, id: InstanceId, code: string): GameState =>
  patchInstance(s, id, { cardId: cardId(code) });

/** A First Aid in P1's hand (the top card of the deck relabelled and drawn) and the command that plays it, paying 1. */
function stagedAid(state: GameState) {
  const top = playerOf(state, P1).deck[0]!;
  return staged(relabel(state, top, FIRST_AID), FIRST_AID, 1);
}

/** `code` in P1's hand and the command that plays it, paying `cost` with other hand cards. */
function staged(state: GameState, code: string, cost: number) {
  const given = moveToHand(state, P1, code);
  const [id] = given.ids as [InstanceId];
  return { state: given.state, id, command: play(P1, id, payWith(given.state, P1, cost, [id])) };
}

describe("Hulkling supports, upgrades and ally registry", () => {
  const printed = (code: string): string[] =>
    (CW_CARDS.find((c) => c.id === cardId(code))! as unknown as { abilities: { id: string }[] }).abilities.map(
      (a) => a.id as string,
    );

  it("every ability validates, with the printed timing", () => {
    for (const id of REFS) expect(validateDefinition(HULKLING_SUPPORT_UPGRADES_ALLIES[id]!), id).toEqual([]);
    const t = (id: string) => HULKLING_SUPPORT_UPGRADES_ALLIES[id]!.trigger;
    expect(t(WICCAN)).toMatchObject({ kind: "response", forced: false });
    expect(t(RESIDENCE)).toMatchObject({ kind: "action", form: "alterEgo" });
    for (const id of [WINGED_C, HULK_C, ARMORED_C, IMITATION_C]) expect(t(id)).toMatchObject({ kind: "constant" });
    for (const id of [WINGED_R, HULK_R, ARMORED_R, IMITATION_R])
      expect(t(id)).toMatchObject({ kind: "response", forced: false, form: "hero" });
    expect(t(IMITATION_I)).toMatchObject({ kind: "interrupt", forced: true });
    expect(t(ALIEN)).toEqual({ kind: "resource" });
    expect(HULKLING_SUPPORT_UPGRADES_ALLIES[ALIEN]!.cost).toEqual({ exhaustSelf: true });
  });

  it("all twelve printed refs are registered and none is skipped", () => {
    expect(printed("56030")).toEqual([WICCAN]);
    expect(printed("56031")).toEqual([RESIDENCE]);
    expect(printed("56032")).toEqual([WINGED_C, WINGED_R]);
    expect(printed("56033")).toEqual([HULK_C, HULK_R]);
    expect(printed("56034")).toEqual([ARMORED_C, ARMORED_R]);
    expect(printed("56035")).toEqual([IMITATION_C, IMITATION_I, IMITATION_R]);
    expect(Object.keys(HULKLING_SUPPORT_UPGRADES_ALLIES).sort()).toEqual([...REFS].sort());
    expect(printed("56036")).toEqual([ALIEN]);
    expect(HULKLING_SUPPORT_UPGRADES_ALLIES_SKIPPED).toEqual({});
  });
});

describe(`${WICCAN}: after you play Wiccan from your hand, search for an identity-specific event, add it to your hand, shuffle`, () => {
  /** Strike copies: one in the discard pile, one on top of the deck, one at the bottom; a First Aid on top of the deck. */
  function game() {
    let s = hulklingGame();
    const [a, b, c] = copiesOf(s, STRIKE) as [InstanceId, InstanceId, InstanceId];
    s = relocate(relocate(relocate(s, a, "discard"), b, "deck"), c, "bottom");
    const aid = playerOf(s, P1).deck.find((i) => ![a, b, c].includes(i))!;
    s = relabel(relocate(s, aid, "deck"), aid, FIRST_AID);
    return { state: s, fromDiscard: a, fromDeck: b, other: c, basic: aid };
  }

  it("offers only the identity-specific events of deck and discard pile; the pick is added to the hand and the deck shuffled", () => {
    const g = game();
    const { state, id, command } = staged(g.state, "56030", 2);
    const offered: InstanceId[] = [];
    const watching: Picker = (s) => {
      const choice = s.pendingChoice!;
      if (choice.prompt.kind === "chooseCards")
        for (const o of choice.options) if (o.ref.kind === "card") offered.push(o.ref.instanceId);
      return choosing({ targets: [g.fromDiscard], accept: [WICCAN] })(s);
    };
    const { state: after, events } = drive(state, command, watching);
    expect(offered).toEqual(expect.arrayContaining([g.fromDeck, g.fromDiscard, g.other]));
    expect(offered).not.toContain(g.basic);
    for (const o of offered) expect(["56037", "56038", "56039", "56040"]).toContain(inst(state, o).cardId);
    expect(playerOf(after, P1).playArea).toContain(id);
    expect(playerOf(after, P1).hand).toContain(g.fromDiscard);
    expect(playerOf(after, P1).discard).not.toContain(g.fromDiscard);
    expect(playerOf(after, P1).deck).toContain(g.fromDeck);
    expect(playerOf(after, P1).deck).toContain(g.basic);
    expect(ofType(events, "deckShuffled")).toHaveLength(1);
  });

  it("the pick may come from the deck", () => {
    const g = game();
    const { state, command } = staged(g.state, "56030", 2);
    const { state: after } = drive(state, command, choosing({ targets: [g.fromDeck], accept: [WICCAN] }));
    expect(playerOf(after, P1).hand).toContain(g.fromDeck);
    expect(playerOf(after, P1).discard).toContain(g.fromDiscard);
  });

  it("with no identity-specific event to find nothing is added and the deck is still shuffled", () => {
    const g = game();
    let s = g.state;
    const p = playerOf(s, P1);
    for (const id of [...p.hand, ...p.deck, ...p.discard])
      if (["56037", "56038", "56039", "56040"].includes(inst(s, id).cardId as string)) s = relabel(s, id, FIRST_AID);
    const { state, command } = staged(s, "56030", 2);
    const handBefore = playerOf(state, P1).hand.length;
    const { state: after, events } = drive(state, command, choosing({ accept: [WICCAN] }));
    expect(playerOf(after, P1).hand).toHaveLength(handBefore - 1 - 2);
    expect(ofType(events, "deckShuffled")).toHaveLength(1);
  });
});

describe(`${RESIDENCE}: Alter-Ego Action, exhaust: heal 2 from Teddy Altman and shuffle 1 Hulkling card from the discard pile into the deck`, () => {
  function game(hero = false, hulklingInDiscard = true) {
    let s = hero ? hulklingHeroGame() : hulklingGame();
    const [a, b] = copiesOf(s, STRIKE) as [InstanceId, InstanceId];
    s = relocate(relocate(s, a, "discard"), b, "discard");
    // b stands for a card that is not Hulkling's: a Core event in the discard pile.
    s = relabel(s, b, FIRST_AID);
    if (!hulklingInDiscard) s = relabel(s, a, FIRST_AID);
    s = patchInstance(s, identityOf(s), { damage: 3 });
    return { ...stagedInPlay(s, "56031"), hulkling: a, foreign: b };
  }

  it("heals 2 from the alter-ego, exhausts, and shuffles the Hulkling card (not the Core one) into the deck", () => {
    const g = game();
    const offered: InstanceId[] = [];
    const watching: Picker = (s) => {
      for (const o of s.pendingChoice?.options ?? []) if (o.ref.kind === "card") offered.push(o.ref.instanceId);
      return firstLegal(s);
    };
    const { state: after, events } = drive(g.state, use(P1, g.id, RESIDENCE), watching);
    expect(inst(after, identityOf(after)).damage).toBe(1);
    expect(inst(after, g.id).exhausted).toBe(true);
    expect(playerOf(after, P1).deck).toContain(g.hulkling);
    expect(playerOf(after, P1).discard).not.toContain(g.hulkling);
    expect(playerOf(after, P1).discard).toContain(g.foreign);
    expect(offered).not.toContain(g.foreign);
    expect(ofType(events, "deckShuffled")).toHaveLength(1);
  });

  it("with no Hulkling card in the discard pile it still heals", () => {
    const g = game(false, false);
    const { state: after } = drive(g.state, use(P1, g.id, RESIDENCE));
    expect(inst(after, identityOf(after)).damage).toBe(1);
    expect(inst(after, g.id).exhausted).toBe(true);
    expect(playerOf(after, P1).discard).toContain(g.foreign);
  });

  it("is an Alter-Ego Action: refused in hero form, and refused once exhausted", () => {
    const hero = game(true);
    expect(rejected(hero.state, use(P1, hero.id, RESIDENCE))).toBe(true);
    const alter = game();
    expect(rejected(patchInstance(alter.state, alter.id, { exhausted: true }), use(P1, alter.id, RESIDENCE))).toBe(
      true,
    );
  });
});

describe("the Shapeshift upgrades' constants (hero form only)", () => {
  const base = hero(hulklingHeroGame());
  const alterBase = hero(hulklingGame());
  const withShape = (code: string, heroForm = true) =>
    stagedInPlay(heroForm ? hulklingHeroGame() : hulklingGame(), code, { attach: true });

  it("the printed hero face is THW 1, ATK 1, DEF 1", () => {
    expect([base.thw, base.atk, base.def]).toEqual([1, 1, 1]);
  });

  it.each([
    ["56032", [2, 2, 2]],
    ["56033", [1, 3, 2]],
    ["56034", [1, 2, 3]],
    ["56035", [3, 1, 1]],
  ])("%s gives THW, ATK, DEF %j", (code, stats) => {
    const { state } = withShape(code as string);
    const p = hero(state);
    expect([p.thw, p.atk, p.def]).toEqual(stats);
  });

  it("the bonuses name Hulkling, so the alter-ego face keeps its own stats", () => {
    for (const code of ["56032", "56033", "56034", "56035"]) {
      const { state } = withShape(code, false);
      const p = hero(state);
      expect([p.thw, p.atk, p.def], code).toEqual([alterBase.thw, alterBase.atk, alterBase.def]);
    }
  });

  it("Winged Shape gives the Aerial trait, and no other shape does", () => {
    const winged = withShape("56032").state;
    expect(traitsOf(winged, identityOf(winged), WAVE10_DEPS)).toContain("AERIAL");
    const plain = hulklingHeroGame();
    expect(traitsOf(plain, identityOf(plain), WAVE10_DEPS)).not.toContain("AERIAL");
    for (const code of ["56033", "56034", "56035"]) {
      const { state } = withShape(code);
      expect(traitsOf(state, identityOf(state), WAVE10_DEPS), code).not.toContain("AERIAL");
    }
    const alter = withShape("56032", false).state;
    expect(traitsOf(alter, identityOf(alter), WAVE10_DEPS)).not.toContain("AERIAL");
  });

  it("Armored Shape gives retaliate 1 in hero form; the others do not, and the alter-ego has none", () => {
    const armored = withShape("56034").state;
    expect(keywordsOf(armored, identityOf(armored), WAVE10_DEPS)).toEqual([{ name: "retaliate", value: 1 }]);
    for (const code of ["56032", "56033", "56035"]) {
      const { state } = withShape(code);
      expect(keywordsOf(state, identityOf(state), WAVE10_DEPS), code).toEqual([]);
    }
    const alter = withShape("56034", false).state;
    expect(keywordsOf(alter, identityOf(alter), WAVE10_DEPS)).toEqual([]);
  });

  it("Armored Shape's retaliate hits the villain that attacks Hulkling", () => {
    const { state } = withShape("56034");
    const stacked = stackEncounterDeck(state, ADVANCE, ADVANCE);
    const rhino = villainOf(stacked);
    const { state: after, events } = drive(stacked, endTurn());
    expect(ofType(events, "damageDealt").some((e) => e.targetInstanceId === identityOf(after))).toBe(true);
    expect(inst(after, rhino).damage).toBe(inst(stacked, rhino).damage + 1);
  });
});

describe("the Shapeshift upgrades' Hero Responses: after you play an event, exhaust -> ...", () => {
  /** Hulkling (hero) with `shape` attached, a MODOK with 3 damage engaged, 8 threat, and a First Aid ready to play. */
  function game(shape: string, opts: { hero?: boolean } = {}) {
    const attached = stagedInPlay(opts.hero === false ? hulklingGame() : hulklingHeroGame(), shape, { attach: true });
    let s = engageMinion(attached.state, MODOK, "modok");
    s = patchInstance(s, MODOK_ID, { damage: 3 });
    s = patchInstance(s, s.mainScheme.instanceId, { threat: 8 });
    const aid = stagedAid(s);
    return { state: aid.state, shape: attached.id, command: aid.command };
  }
  /** First Aid heals MODOK; the response of `code` is accepted. */
  const healModok = (code: string): Picker => choosing({ targets: [MODOK_ID], accept: [code] });

  it("Winged Shape removes 2 threat from a scheme and exhausts", () => {
    const g = game("56032");
    const { state: after, events } = drive(g.state, g.command, healModok(WINGED_R));
    expect(mainThreat(after)).toBe(6);
    expect(inst(after, g.shape).exhausted).toBe(true);
    expect(ofType(events, "threatRemoved").map((e) => e.amount)).toEqual([2]);
    expect(inst(after, MODOK_ID).damage).toBe(1);
  });

  it("Hulk Shape deals 2 damage to an enemy and exhausts", () => {
    const g = game("56033");
    const { state: after } = drive(g.state, g.command, healModok(HULK_R));
    // First Aid heals 2 from MODOK (3 -> 1), then Hulk Shape deals 2 (1 -> 3).
    expect(inst(after, MODOK_ID).damage).toBe(3);
    expect(inst(after, g.shape).exhausted).toBe(true);
  });

  it("Armored Shape heals 2 from Hulkling and exhausts", () => {
    const g = game("56034");
    const hurt = patchInstance(g.state, identityOf(g.state), { damage: 4 });
    const { state: after } = drive(hurt, g.command, healModok(ARMORED_R));
    expect(inst(after, identityOf(after)).damage).toBe(2);
    expect(inst(after, MODOK_ID).damage).toBe(1);
    expect(inst(after, g.shape).exhausted).toBe(true);
  });

  it("Imitation Shape draws 1 card and exhausts", () => {
    const g = game("56035");
    const before = playerOf(g.state, P1).hand.length;
    const { state: after } = drive(g.state, g.command, healModok(IMITATION_R));
    // The event and the card that paid for it leave the hand; Imitation Shape draws one.
    expect(playerOf(after, P1).hand).toHaveLength(before - 2 + 1);
    expect(inst(after, g.shape).exhausted).toBe(true);
  });

  it.each([["56032"], ["56033"], ["56034"], ["56035"]])(
    "%s: declining the response leaves it ready and does nothing",
    (code) => {
      const g = game(code as string);
      const hurt = patchInstance(g.state, identityOf(g.state), { damage: 4 });
      const before = playerOf(hurt, P1).hand.length;
      const { state: after } = drive(hurt, g.command, choosing({ targets: [MODOK_ID] }));
      expect(inst(after, g.shape).exhausted).toBe(false);
      expect(mainThreat(after)).toBe(8);
      expect(inst(after, identityOf(after)).damage).toBe(4);
      expect(inst(after, MODOK_ID).damage).toBe(1);
      expect(playerOf(after, P1).hand).toHaveLength(before - 2);
    },
  );

  it("is a Hero Response: in alter-ego form it is not offered", () => {
    const g = game("56032", { hero: false });
    const { state: after } = drive(g.state, g.command, healModok(WINGED_R));
    expect(mainThreat(after)).toBe(8);
    expect(inst(after, g.shape).exhausted).toBe(false);
  });

  it("an exhausted shape does not answer", () => {
    const g = game("56032");
    const spent = patchInstance(g.state, g.shape, { exhausted: true });
    const { state: after } = drive(spent, g.command, healModok(WINGED_R));
    expect(mainThreat(after)).toBe(8);
  });

  it("it answers once: a second event finds the shape exhausted", () => {
    const g = game("56032");
    const { state: mid } = drive(g.state, g.command, healModok(WINGED_R));
    expect(mainThreat(mid)).toBe(6);
    const again = stagedAid(mid);
    const { state: after } = drive(again.state, again.command, healModok(WINGED_R));
    expect(mainThreat(after)).toBe(6);
  });
});

describe(`${IMITATION_I}: Forced Interrupt, when an enemy would attack you, it schemes instead`, () => {
  /** Hulkling in hero form; the encounter deck stacked so Rhino has a 2-icon boost card and then a scheming treachery. */
  const game = (shape = true) => {
    const s = shape ? stagedInPlay(hulklingHeroGame(), "56035", { attach: true }).state : hulklingHeroGame();
    return stackEncounterDeck(s, CHARGE, ADVANCE);
  };

  it("without the shape Rhino attacks Hulkling (the control)", () => {
    const { state: after, events } = drive(game(false), endTurn());
    expect(ofType(events, "damageDealt").some((e) => e.targetInstanceId === identityOf(after))).toBe(true);
  });

  it("with the shape Rhino schemes instead: threat on the main scheme, no damage to Hulkling, no defender asked", () => {
    const state = game();
    const before = mainThreat(state);
    const { state: after, events } = drive(state, endTurn());
    expect(inst(after, identityOf(after)).damage).toBe(0);
    expect(mainThreat(after)).toBeGreaterThan(before);
    expect(ofType(events, "damageDealt").filter((e) => e.targetInstanceId === identityOf(after))).toEqual([]);
    expect(ofType(events, "threatPlaced").length).toBeGreaterThan(0);
  });

  it("a stunned Rhino discards its stunned card and neither attacks nor schemes (status cards come first)", () => {
    const stacked = game();
    const state = patchInstance(stacked, villainOf(stacked), { statuses: { stunned: 1, confused: 0, tough: 0 } });
    const control = drive(game(), endTurn()).state;
    const { state: after } = drive(state, endTurn());
    expect(inst(after, identityOf(after)).damage).toBe(0);
    expect(inst(after, villainOf(after)).statuses.stunned).toBe(0);
    expect(mainThreat(after)).toBeLessThan(mainThreat(control));
  });

  it("an engaged minion's attack is replaced too: the hero is not damaged", () => {
    const placed = engageMinion(game(), MODOK, "modok");
    const { state: after, events } = drive(placed, endTurn());
    expect(inst(after, identityOf(after)).damage).toBe(0);
    expect(ofType(events, "enemyActivated").length).toBeGreaterThanOrEqual(2);
  });

  it("is forced: it applies with no choice made, and the shape stays in play", () => {
    const state = game();
    const shape = inst(state, identityOf(state)).attachments[0]!;
    const { state: after } = drive(state, endTurn(), firstLegal);
    expect(inst(after, shape).attachedTo).toBe(identityOf(after));
    expect(piles(after).discard.length).toBeGreaterThan(0);
  });
});

describe(`${ALIEN}: Resource, exhaust: generate a wild resource, two instead if paying for a Hulkling card`, () => {
  const WICCAN_CODE = "56030"; // Hulkling ally, cost 2
  const RESIDENCE_CODE = "56031"; // Hulkling support, cost 1
  const BASE_CODE = "56043"; // Hidden Base: Protection support, cost 2
  const ALIEN_CODE = "56036";
  const WILD = (n: number) => ({ physical: 0, mental: 0, energy: 0, wild: n });

  /** Alien Physiology in play on Teddy Altman, `code` in hand, and the command playing it with the upgrade and `rest` hand cards. */
  function payingFor(code: string, rest: number, exhausted = false) {
    const alien = stagedInPlay(hulklingGame(), ALIEN_CODE, { attach: true });
    const given = moveToHand(patchInstance(alien.state, alien.id, { exhausted }), P1, code);
    const [id] = given.ids as [InstanceId];
    const command = play(P1, id, payWith(given.state, P1, rest, [id]), {
      abilities: [resourceAbility(alien.id, ALIEN)],
    });
    return { state: given.state, id, alien: alien.id, command };
  }
  const sourceOf = (state: GameState, id: InstanceId, alien: InstanceId) =>
    paymentFor(state, P1, { kind: "playCard", instanceId: id }, {}, WAVE10_DEPS)?.sources.find(
      (source) => source.instanceId === alien,
    );

  it("paying for a Hulkling card of cost 2 (Wiccan): it generates 2 wild and pays for it alone", () => {
    const { state, id, alien, command } = payingFor(WICCAN_CODE, 0);
    expect(command).toMatchObject({ payment: [{ ability: { instanceId: alien, abilityId: ALIEN } }] });
    const { state: after, events } = drive(state, command);
    expect(ofType(events, "resourcesGenerated").map((e) => [e.abilityId, e.amount, e.pool])).toEqual([
      [ALIEN, 2, WILD(2)],
    ]);
    expect(ofType(events, "cardPlayed").map((e) => [e.instanceId, e.resourcesPaid])).toEqual([[id, 2]]);
    expect(playerOf(after, P1).playArea).toContain(id);
    expect(inst(after, alien).exhausted).toBe(true);
  });

  it("paying for a card that is not Hulkling's (Hidden Base, cost 2): it generates 1 wild, so one more resource is needed", () => {
    const alone = payingFor(BASE_CODE, 0);
    expect(rejected(alone.state, alone.command)).toBe(true);
    const { state, id, alien, command } = payingFor(BASE_CODE, 1);
    const hand = playerOf(state, P1).hand.length;
    const { state: after, events } = drive(state, command);
    expect(ofType(events, "resourcesGenerated").map((e) => [e.abilityId, e.amount, e.pool])).toEqual([
      [ALIEN, 1, WILD(1)],
    ]);
    expect(playerOf(after, P1).playArea).toContain(id);
    expect(inst(after, alien).exhausted).toBe(true);
    expect(playerOf(after, P1).hand).toHaveLength(hand - 2);
  });

  it("toward a Hulkling card of cost 1 (Altman Residence) it still generates 2: the second is overpaid", () => {
    const { state, id, command } = payingFor(RESIDENCE_CODE, 0);
    const { state: after, events } = drive(state, command);
    expect(ofType(events, "resourcesGenerated").map((e) => e.amount)).toEqual([2]);
    expect(playerOf(after, P1).playArea).toContain(id);
  });

  it("the payment prompt lists it with 2 wild for the Hulkling card and 1 wild for the other, and suggests it alone for Wiccan", () => {
    const wiccan = payingFor(WICCAN_CODE, 0);
    expect(sourceOf(wiccan.state, wiccan.id, wiccan.alien)).toMatchObject({ kind: "resourceAbility", pool: WILD(2) });
    const query = paymentFor(wiccan.state, P1, { kind: "playCard", instanceId: wiccan.id }, {}, WAVE10_DEPS)!;
    expect(query.suggested).toEqual([`ability:${wiccan.alien}:${ALIEN}`]);
    const base = payingFor(BASE_CODE, 0);
    expect(sourceOf(base.state, base.id, base.alien)).toMatchObject({ kind: "resourceAbility", pool: WILD(1) });
  });

  it("already exhausted it cannot pay its own cost: it is not offered as a source and a payment naming it is refused", () => {
    const { state, id, alien, command } = payingFor(WICCAN_CODE, 0, true);
    expect(sourceOf(state, id, alien)).toBeUndefined();
    expect(rejected(state, command)).toBe(true);
  });

  it("it cannot pay for itself: Alien Physiology in hand is paid for from the hand", () => {
    const given = moveToHand(hulklingGame(), P1, ALIEN_CODE);
    const [id] = given.ids as [InstanceId];
    const query = paymentFor(given.state, P1, { kind: "playCard", instanceId: id }, {}, WAVE10_DEPS)!;
    expect(query.sources.some((source) => source.instanceId === id)).toBe(false);
    expect(query.requirement).toMatchObject({ generic: 3 });
  });
});
