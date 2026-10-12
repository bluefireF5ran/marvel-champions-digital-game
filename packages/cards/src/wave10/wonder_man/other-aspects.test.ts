import { HERCULES_CARDS, cardId } from "@mc/content";
import {
  activeEncounterDeck,
  activeEncounterDeckId,
  locateCard,
  type Command,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { validateDefinition } from "../../dsl/validate.js";
import {
  P1,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  moveToHand,
  patchInstance,
  playerOf,
  type Picker,
} from "../../testing/harness.js";
import { driveEventsPicking } from "../../testing/staging.js";
import { ANGEL_PACK_CARDS } from "../../wave7/angel/pack-cards.js";
import { WAVE10_CARDS } from "../cards.js";
import { WAVE10_DEPS, engageMinion, stagedInPlay, wonderManHeroGame } from "../testing.js";
import { WONDER_MAN_OTHER_ASPECTS as REGISTRY, WONDER_MAN_OTHER_ASPECTS_SKIPPED as SKIPPED } from "./other-aspects.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Wave 10 `wonder_man/other-aspects` (docs/phase7-wave10-hero-packs.md H8.4, HS6): the reprint 58017 Bombs Away and the
 * scripted 58019 Stronger Together, 58020 Unified Strike, 58030 Caught in the Crossfire and 58033 Disarming Defense,
 * played from real Wonder Man games against Core's Rhino. 58031 Cameo (HT15) and 58032 Coordinated Effort (HT16) stay
 * in the skip map. No ruling in marvel-champions-rulings-post-rrg-1-7.md names the scripted cards.
 */
const BOMBS_AWAY = "58017.bombs-away-action";
const TOGETHER = "58019.stronger-together-interrupt";
const STRIKE = "58020.unified-strike-interrupt";
const CROSSFIRE = "58030.caught-in-the-crossfire-interrupt";
const DISARMING = "58033.disarming-defense-interrupt";
const CAMEO = "58031.setup";
const EFFORT = "58032.coordinated-effort-constant";
const SCRIPTED = [TOGETHER, STRIKE, CROSSFIRE, DISARMING];

const FIREBIRD = "58012"; // Avenger like Wonder Man; 2 hp, consequential damage 2 on an attack
const HAWKEYE = "58013"; // Avenger; 3 hp, ATK 1, THW 1, consequential damage 1
const CHO = "59008"; // Genius: shares no trait with Wonder Man (Aerial, Avenger)
const RADIOACTIVE_MAN = "01129"; // Core minion, 7 hit points
const MERCENARY = "01101"; // Hydra Mercenary: 3 hit points
const CAUGHT_OFF_GUARD = "01188"; // treachery, 1 boost icon
const SWORD = "48029"; // Azazel's Sword: an attachment with a Hero Response
const SUIT = "01098"; // Armored Rhino Suit: an attachment with no Hero Action or Response
const SONIC_CONVERTER = "01118"; // 3 boost icons
const MINION = "minion" as InstanceId;
const OTHER = "other" as InstanceId;

const dataOf = (code: string) =>
  [...WAVE10_CARDS, ...HERCULES_CARDS].find((c) => c.id === code) as unknown as {
    cost: number;
    resourceIcons: unknown;
    traits: unknown;
    abilities: { id: string }[];
  };
const run = (state: GameState, pick: Picker, ...commands: Command[]) =>
  driveEventsPicking(WAVE10_DEPS, state, pick, ...commands);
const offeredRefs = (s: GameState): string[] =>
  s.pendingChoice?.prompt.kind === "chooseTriggers"
    ? s.pendingChoice.options.flatMap((o) => (o.ref.kind === "ability" ? [o.ref.abilityId as string] : []))
    : [];
/** Takes the listed refs when offered, recording every ref that was on offer; otherwise as it comes. */
const taking =
  (refs: readonly string[], offered: string[] = []): Picker =>
  (s) => {
    const choice = s.pendingChoice;
    if (choice?.prompt.kind === "chooseTriggers") {
      offered.push(...offeredRefs(s));
      const wanted = choice.options.filter((o) => o.ref.kind === "ability" && refs.includes(o.ref.abilityId as string));
      if (wanted.length > 0) return wanted.map((o) => o.optionId);
      return choice.minSelections > 0 ? [choice.options[0]!.optionId] : [];
    }
    if (choice?.prompt.kind === "payForCard") return [choice.options[0]!.optionId];
    return firstLegal(s);
  };
const basicAttack = (attacker: InstanceId, target: InstanceId): Command => ({
  type: "basicAttack",
  playerId: P1,
  attackerInstanceId: attacker,
  targetInstanceId: target,
});
const basicThwart = (thwarter: InstanceId, scheme: InstanceId): Command => ({
  type: "basicThwart",
  playerId: P1,
  thwarterInstanceId: thwarter,
  schemeInstanceId: scheme,
});
/** Test surgery: the last card of P1's deck becomes a copy of `code` (a card the Justice deck does not hold). */
const conjured = (state: GameState, code: string): GameState => {
  const deck = state.players.find((p) => p.playerId === P1)!.deck;
  return patchInstance(state, deck[deck.length - 1]!, { cardId: cardId(code) });
};
const withInPlay = (state: GameState, ...codes: string[]) => {
  let current = state;
  const ids: InstanceId[] = [];
  for (const code of codes) {
    const staged = stagedInPlay(conjured(current, code), code);
    current = staged.state;
    ids.push(staged.id);
  }
  return { state: current, ids };
};
/** Declares the hero as the defender when that is on offer, else answers as it comes. */
const heroDefends: Picker = (s) => {
  const hero = s.pendingChoice!.options.find((o) => o.ref.kind === "card" && o.ref.instanceId === identityOf(s));
  return hero ? [hero.optionId] : firstLegal(s);
};
/** The card in P1's hand, as a game state. */
const holding = (state: GameState, code: string): GameState => moveToHand(state, P1, code).state;

describe("registry", () => {
  it("scripts the four cards and the reprint, each validating, and skips only Cameo and Coordinated Effort", () => {
    expect(Object.keys(REGISTRY).sort()).toEqual([BOMBS_AWAY, ...SCRIPTED].sort());
    for (const id of Object.keys(REGISTRY)) expect(validateDefinition(REGISTRY[id]!), id).toEqual([]);
    expect(Object.keys(SKIPPED).sort()).toEqual([CAMEO, EFFORT].sort());
    for (const id of SCRIPTED) expect(Object.keys(SKIPPED)).not.toContain(id);
  });

  it("every ref the module's seven cards print is scripted or skipped, and nothing else", () => {
    const printed = ["58017", "58019", "58020", "58030", "58031", "58032", "58033"].flatMap((c) =>
      dataOf(c).abilities.map((a) => a.id),
    );
    expect(printed.sort()).toEqual([BOMBS_AWAY, ...SCRIPTED, CAMEO, EFFORT].sort());
  });

  it("the skipped refs name their engine tasks and spec sections", () => {
    expect(SKIPPED[CAMEO]).toMatch(/^waits on engine task HT15 .*H3\.18/);
    expect(SKIPPED[EFFORT]).toMatch(/^waits on engine task HT16 .*H3\.19/);
  });

  it("prints the timings: three Hero Interrupts and a plain Interrupt on the upgrade", () => {
    for (const id of [TOGETHER, STRIKE, DISARMING])
      expect(REGISTRY[id]!.trigger, id).toMatchObject({ kind: "interrupt", form: "hero" });
    const crossfire = REGISTRY[CROSSFIRE]!.trigger as { kind: string; form?: string };
    expect(crossfire.kind).toBe("interrupt");
    expect(crossfire.form).toBeUndefined();
  });
});

describe("reprints", () => {
  it("58017 Bombs Away aliases the script of 42029, the same definition object", () => {
    expect(REGISTRY[BOMBS_AWAY]).toBe(ANGEL_PACK_CARDS["42029.bombs-away-action"]);
    expect(Object.keys(SKIPPED)).not.toContain(BOMBS_AWAY);
    const a = dataOf("58017");
    const b = dataOf("42029");
    expect(a.cost).toBe(b.cost);
    expect(a.resourceIcons).toEqual(b.resourceIcons);
    expect(a.traits).toEqual(b.traits);
    expect(a.abilities.map((r) => r.id)).toEqual([BOMBS_AWAY]);
  });
});

describe("58020 Unified Strike", () => {
  /** Hero form, Hawkeye (ATK 1, THW 1, consequential 1) in play, a 7 hit point minion engaged, the event in hand. */
  function armed() {
    const ally = withInPlay(wonderManHeroGame({ deps: WAVE10_DEPS }), HAWKEYE);
    const engaged = engageMinion(ally.state, RADIOACTIVE_MAN, MINION, P1);
    return { state: holding(engaged, "58020"), hawkeye: ally.ids[0]! };
  }

  it("declined, Hawkeye's basic attack deals his 1 and he takes 1 consequential damage", () => {
    const { state, hawkeye } = armed();
    const { state: after } = run(state, taking([]), basicAttack(hawkeye, MINION));
    expect(inst(after, MINION).damage).toBe(1);
    expect(inst(after, hawkeye).damage).toBe(1);
    expect(inst(after, identityOf(after)).exhausted).toBe(false);
  });

  it("taken, the hero exhausts, the attack deals 1 + the hero's 1 ATK and Hawkeye takes no consequential damage", () => {
    const { state, hawkeye } = armed();
    const { state: after } = run(state, taking([STRIKE]), basicAttack(hawkeye, MINION));
    expect(inst(after, MINION).damage).toBe(2);
    expect(inst(after, hawkeye).damage).toBe(0);
    expect(inst(after, hawkeye).exhausted).toBe(true);
    expect(inst(after, identityOf(after)).exhausted).toBe(true);
  });

  it("a basic thwart adds the hero's THW (2): 1 + 2 threat comes off, and again no consequential damage", () => {
    const { state, hawkeye } = armed();
    const scheme = state.mainScheme.instanceId;
    const { state: after } = run(
      patchInstance(state, scheme, { threat: 6 }),
      taking([STRIKE]),
      basicThwart(hawkeye, scheme),
    );
    expect(inst(after, scheme).threat).toBe(3);
    expect(inst(after, hawkeye).damage).toBe(0);
  });

  it("is for that one use: Hawkeye's next attack is plain again", () => {
    const { state, hawkeye } = armed();
    const first = run(state, taking([STRIKE]), basicAttack(hawkeye, MINION)).state;
    const readied = patchInstance(patchInstance(first, hawkeye, { exhausted: false }), identityOf(first), {
      exhausted: false,
    });
    const second = run(readied, taking([]), basicAttack(hawkeye, MINION)).state;
    expect(inst(second, MINION).damage).toBe(2 + 1);
    expect(inst(second, hawkeye).damage).toBe(1);
  });

  it("is not offered for the hero's own basic attack (an ally uses the power)", () => {
    const { state } = armed();
    const offered: string[] = [];
    run(state, taking([STRIKE], offered), basicAttack(identityOf(state), MINION));
    expect(offered).not.toContain(STRIKE);
  });

  it("is not offered when the hero is exhausted (the cost cannot be paid)", () => {
    const { state, hawkeye } = armed();
    const tired = patchInstance(state, identityOf(state), { exhausted: true });
    const offered: string[] = [];
    run(tired, taking([STRIKE], offered), basicAttack(hawkeye, MINION));
    expect(offered).not.toContain(STRIKE);
  });
});

describe("58019 Stronger Together", () => {
  /** Hero form, the ally in play, a 7 hit point minion engaged, the event in hand. Wonder Man's DEF is 2. */
  function armed(ally: string) {
    const staged = withInPlay(wonderManHeroGame({ deps: WAVE10_DEPS }), ally);
    const engaged = engageMinion(staged.state, RADIOACTIVE_MAN, MINION, P1);
    return { state: holding(engaged, "58019"), ally: staged.ids[0]! };
  }

  it("Firebird (Avenger, like Wonder Man) takes 2 consequential damage less the hero's DEF 2: none", () => {
    const { state, ally } = armed(FIREBIRD);
    const offered: string[] = [];
    const { state: after } = run(state, taking([TOGETHER], offered), basicAttack(ally, MINION));
    expect(offered).toContain(TOGETHER);
    expect(inst(after, ally).damage).toBe(0);
    expect(inst(after, MINION).damage).toBe(2);
    expect(inst(after, identityOf(after)).damage).toBe(0);
  });

  it("declined, the same 2 damage defeats her (2 hit points)", () => {
    const { state, ally } = armed(FIREBIRD);
    const { state: after } = run(state, taking([]), basicAttack(ally, MINION));
    expect(playerOf(after, P1).playArea).not.toContain(ally);
  });

  it("the reduction stops at the damage there is: Hawkeye's 1 consequential damage is prevented, no more", () => {
    const { state, ally } = armed(HAWKEYE);
    const { state: after } = run(state, taking([TOGETHER]), basicAttack(ally, MINION));
    expect(inst(after, ally).damage).toBe(0);
  });

  it("is not offered for an ally that shares no trait with the hero (Cho is a Genius)", () => {
    const { state, ally } = armed(CHO);
    const offered: string[] = [];
    const { state: after } = run(state, taking([TOGETHER], offered), basicAttack(ally, MINION));
    expect(offered).not.toContain(TOGETHER);
    expect(inst(after, ally).damage).toBe(1);
  });

  it("is not offered for the hero's own damage (a character other than your hero)", () => {
    const staged = engageMinion(holding(wonderManHeroGame({ deps: WAVE10_DEPS }), "58019"), MERCENARY, MINION, P1);
    const offered: string[] = [];
    const pick: Picker = (s) =>
      s.pendingChoice!.prompt.kind === "declareDefender" ? heroDefends(s) : taking([TOGETHER], offered)(s);
    const out = run(staged, pick, endTurn(P1));
    expect(inst(out.state, identityOf(out.state)).damage).toBeGreaterThan(0);
    expect(offered).not.toContain(TOGETHER);
  });
});

describe("58030 Caught in the Crossfire", () => {
  /** A minion (the host) with the upgrade attached, a second minion to attack, Hawkeye in play. */
  function armed() {
    const staged = withInPlay(wonderManHeroGame({ deps: WAVE10_DEPS }), HAWKEYE, "58030");
    const [hawkeye, up] = staged.ids as [InstanceId, InstanceId];
    const two = engageMinion(engageMinion(staged.state, MERCENARY, MINION, P1), RADIOACTIVE_MAN, OTHER, P1);
    const attached = patchInstance(patchInstance(two, up, { attachedTo: MINION }), MINION, { attachments: [up] });
    const state: GameState = {
      ...attached,
      players: attached.players.map((p) =>
        p.playerId === P1 ? { ...p, playArea: p.playArea.filter((i) => i !== up) } : p,
      ),
    };
    return { state, hawkeye, up };
  }

  it("when an ally attacks another enemy, the attached minion takes 1 damage and the attack goes ahead", () => {
    const { state, hawkeye } = armed();
    const { state: after } = run(state, taking([CROSSFIRE]), basicAttack(hawkeye, OTHER));
    expect(inst(after, MINION).damage).toBe(1);
    expect(inst(after, OTHER).damage).toBe(1);
  });

  it("when the hero attacks too (any friendly character)", () => {
    const { state } = armed();
    const { state: after } = run(state, taking([CROSSFIRE]), basicAttack(identityOf(state), OTHER));
    expect(inst(after, MINION).damage).toBe(1);
    expect(inst(after, OTHER).damage).toBe(1);
  });

  it("when the attacker attacks the host itself, it takes the 1 and then the attack's 1", () => {
    const { state, hawkeye } = armed();
    const { state: after } = run(state, taking([CROSSFIRE]), basicAttack(hawkeye, MINION));
    expect(inst(after, MINION).damage).toBe(2);
  });

  it("every friendly attack costs the minion 1 more: its third hit point goes on the third attack and it leaves play", () => {
    const { state: start, hawkeye } = armed();
    let state = start;
    for (let n = 0; n < 2; n++) {
      state = run(state, taking([CROSSFIRE]), basicAttack(identityOf(state), OTHER)).state;
      state = patchInstance(state, identityOf(state), { exhausted: false });
    }
    expect(inst(state, MINION).damage).toBe(2);
    state = run(state, taking([CROSSFIRE]), basicAttack(hawkeye, OTHER)).state;
    expect(locateCard(state, MINION)?.kind).not.toBe("playArea");
  });

  it("is optional: declined, the attached minion takes nothing", () => {
    const { state, hawkeye } = armed();
    const { state: after } = run(state, taking([]), basicAttack(hawkeye, OTHER));
    expect(inst(after, MINION).damage).toBe(0);
  });

  it("an enemy's attack is not a friendly character's: it is not offered in the villain phase", () => {
    const { state } = armed();
    const offered: string[] = [];
    const pick: Picker = (s) =>
      s.pendingChoice!.prompt.kind === "declareDefender" ? heroDefends(s) : taking([CROSSFIRE], offered)(s);
    run(state, pick, endTurn(P1));
    expect(offered).not.toContain(CROSSFIRE);
  });
});

describe("58033 Disarming Defense", () => {
  /** The encounter deck's top cards turned into `code`: a boost card for each attack the villain makes. */
  const boostedWith = (s: GameState, code: string): GameState =>
    activeEncounterDeck(s)
      .deck.slice(0, 8)
      .reduce((acc, id) => patchInstance(acc, id, { cardId: cardId(code) }), s);
  /** The `nth` card from the bottom of the encounter deck turned into `code` and attached to `host` by surgery. */
  function attach(s: GameState, code: string, host: InstanceId, nth: number) {
    const deckId = activeEncounterDeckId(s);
    const pile = s.encounterDecks[deckId]!;
    const id = pile.deck[pile.deck.length - 1 - nth]!;
    const moved: GameState = {
      ...s,
      encounterDecks: { ...s.encounterDecks, [deckId]: { ...pile, deck: pile.deck.filter((i) => i !== id) } },
    };
    const placed = patchInstance(moved, id, {
      attachedTo: host,
      faceup: true,
      cardId: cardId(code),
    });
    return { state: patchInstance(placed, host, { attachments: [...inst(placed, host).attachments, id] }), id };
  }
  /** Hero form, the event in hand, Azazel's Sword and an Armored Rhino Suit on Rhino, the boost cards `boost`. */
  function armed(boost: string) {
    const base = wonderManHeroGame({ deps: WAVE10_DEPS });
    const villain = base.activeVillainId!;
    const withSword = attach(base, SWORD, villain, 0);
    const withSuit = attach(withSword.state, SUIT, villain, 1);
    const state = boostedWith(holding(conjured(withSuit.state, "58033"), "58033"), boost);
    return { state, sword: withSword.id, suit: withSuit.id };
  }
  const defend =
    (take: boolean, offered: string[] = []): Picker =>
    (s) =>
      s.pendingChoice!.prompt.kind === "declareDefender" ? heroDefends(s) : taking(take ? [DISARMING] : [], offered)(s);
  /** Damage dealt to the hero by the villain's attack: what happened before the villain phase dealt its first encounter card. */
  const heroDamage = (out: { state: GameState; events: readonly GameEvent[] }) => {
    const dealt = out.events.findIndex((e) => e.type === "encounterCardRevealed");
    const own = dealt < 0 ? out.events : out.events.slice(0, dealt);
    return own.reduce(
      (n, e) => (e.type === "damageDealt" && e.targetInstanceId === identityOf(out.state) ? n + e.amount : n),
      0,
    );
  };
  const attached = (s: GameState, id: InstanceId) => inst(s, id).attachedTo !== null;

  it("no damage taken (ATK 3 with the Sword + 1 icon, DEF 2 + 2): the Hero Response attachment is discarded, the other stays", () => {
    const { state, sword, suit } = armed(CAUGHT_OFF_GUARD);
    const out = run(state, defend(true), endTurn(P1));
    expect(heroDamage(out)).toBe(0);
    expect(attached(out.state, sword)).toBe(false);
    expect(attached(out.state, suit)).toBe(true);
  });

  it("control: without the event the same attack costs the hero 2 and the Sword stays", () => {
    const { state, sword } = armed(CAUGHT_OFF_GUARD);
    const out = run(state, defend(false), endTurn(P1));
    expect(heroDamage(out)).toBe(2);
    expect(attached(out.state, sword)).toBe(true);
  });

  it("damage taken anyway (3 icons: 6 against DEF 4): the Sword is not discarded", () => {
    const { state, sword } = armed(SONIC_CONVERTER);
    const out = run(state, defend(true), endTurn(P1));
    expect(heroDamage(out)).toBe(2);
    expect(attached(out.state, sword)).toBe(true);
  });

  it("with no Hero Action or Hero Response attachment on the enemy it just gives the DEF", () => {
    const base = wonderManHeroGame({ deps: WAVE10_DEPS });
    const withSuit = attach(base, SUIT, base.activeVillainId!, 0);
    const state = boostedWith(holding(conjured(withSuit.state, "58033"), "58033"), CAUGHT_OFF_GUARD);
    const out = run(state, defend(true), endTurn(P1));
    expect(heroDamage(out)).toBe(0);
    expect(attached(out.state, withSuit.id)).toBe(true);
  });
});
