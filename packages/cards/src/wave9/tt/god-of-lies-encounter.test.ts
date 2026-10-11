import { TT_CARDS } from "@mc/content";
import {
  applyCommand,
  cardsInPlay,
  hasKeyword,
  createGame,
  maxHitPoints,
  replay,
  sessionApply,
  sharedVillain,
  startSession,
  type EngineDeps,
  type GameEvent,
  type GameSession,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { abilityRefIds } from "../../ability-refs.js";
import { mergeRegistries } from "../../dsl/index.js";
import { validateDefinition } from "../../dsl/validate.js";
import {
  P1,
  P2,
  P3,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  patchInstance,
  playerOf,
  settle,
  use,
  type Picker,
} from "../../testing/harness.js";
import { WAVE8_ABILITIES } from "../../wave8/index.js";
import { wave9Scenario } from "../setup.js";
import { IRON_MAN, SHE_HULK, SPIDER_MAN, codeOf, heroForm } from "../testing.js";
import { TT_ASPECT_BASIC } from "./aspect-basic.js";
import { GOD_OF_LIES, GOD_OF_LIES_SKIPPED } from "./god-of-lies.js";
import { TRICKSTER_MAGIC } from "./trickster-magic.js";

vi.setConfig({ testTimeout: 300_000 });

/**
 * The encounter cards of the God of Lies scenario, 55035 to 55051 (docs/phase7-wave9.md sections 3.60, 3.61, 3.65,
 * 3.67, 3.70, 3.71 and 8.4 item 69; MC55 pp. 10 and 18 to 23), on the real scenario in Single Group Mode with real turns
 * and prompts. The frame (the Avatars, the Fading Figments, the Synergy environments) is in `god-of-lies.test.ts`.
 *
 * Every card is revealed the way a game reveals it: the encounter deck is replaced by `onlyDeck(...)` (top first: the
 * Avatar's boost card, then one dealt card per player, then whatever the test wants discarded) and the players end
 * their turns. Test surgery (damage, counters, a hand) starts a new session from the changed state; every session's log
 * replays deep-equal.
 */
const DEPS: EngineDeps = { abilities: mergeRegistries(WAVE8_ABILITIES, GOD_OF_LIES, TRICKSTER_MAGIC, TT_ASPECT_BASIC) };

const AVATARS = ["55029a", "55030a", "55031a", "55032a"] as const;
type Avatar = (typeof AVATARS)[number];
const KNAVE = "55031a" as const;
const ENVIRONMENTS = ["55052", "55053", "55054", "55055"] as const;
/** The environment each card names (docs/phase7-wave9.md section 3.61). */
const DOMINEERING = "55052";
const FEIGNED = "55053";
const MOUNTING = "55054";
const UNIFIED = "55055";

/** The Avatar activates against each player: this many quiet boost cards, then the dealt cards. */
const boosts = (n: number): string[] => ["01186", "01186", "01188", "01189"].slice(0, n);

/** Core "Standard" treacheries. 01186 Advance is the Avatar's boost card; none has a boost ability. */
const BOOST = "01186";
const TREACHERY = "01187";
const FILLERS = ["01186", "01186", "01188", "01187", "01187", "01189", "01190"] as const;

type Seat = typeof SPIDER_MAN | typeof IRON_MAN | typeof SHE_HULK;
interface Sim {
  session: GameSession;
  events: GameEvent[];
  past: GameSession[];
  /** Every card of the encounter deck as the game began: `stack` draws from it, since a deck keeps only what it uses. */
  readonly pool: readonly InstanceId[];
}
const stateOf = (sim: Sim): GameState => sim.session.state;
const begin = (state: GameState): Sim => {
  const piles = Object.values(state.encounterDecks)[0]!;
  return { session: startSession(state), events: [], past: [], pool: [...piles.deck, ...piles.discard] };
};

function open(
  players: readonly Seat[] = [SPIDER_MAN],
  opts: { readonly difficulty?: "standard" | "expert"; readonly seed?: number; readonly avatar?: Avatar } = {},
): GameState {
  const difficulty = opts.difficulty ?? "standard";
  for (let seed = opts.seed ?? 1; seed < (opts.seed ?? 1) + 60; seed++) {
    const config = wave9Scenario("god-of-lies", { players, seed, difficulty });
    const created = createGame(config, DEPS);
    if (!created.ok) throw new Error(created.error.message);
    const state = settle(created.state, firstLegal, (s) => s.step.phase === "player", DEPS);
    const active = state.instances[state.activeVillainId]!.cardId as string;
    if (opts.avatar === undefined || active === opts.avatar)
      return heroForm(state, ...players.map((_, i) => `p${i + 1}` as PlayerId));
  }
  throw new Error(`no seed deals ${opts.avatar}`);
}

function apply(sim: Sim, command: Parameters<typeof applyCommand>[1], pick: Picker = firstLegal): void {
  const take = (c: Parameters<typeof applyCommand>[1]) => {
    const result = sessionApply(sim.session, c, DEPS);
    if (!result.ok) throw new Error(`${c.type}: ${result.error.message}`);
    sim.session = result.session;
    sim.events.push(...result.events);
  };
  take(command);
  for (let guard = 0; stateOf(sim).pendingChoice && !stateOf(sim).outcome; guard++) {
    if (guard > 300) throw new Error("choices did not settle");
    const choice = stateOf(sim).pendingChoice!;
    take({
      type: "resolveChoice",
      playerId: choice.playerId,
      choiceId: choice.choiceId,
      selectedOptionIds: pick(stateOf(sim)),
    });
  }
}

/** Test surgery: a new session from the changed state (the old one's log is kept to be replayed). */
function edit(sim: Sim, change: (s: GameState) => GameState): void {
  sim.past.push(sim.session);
  sim.session = startSession(change(stateOf(sim)));
}

function expectReplays(sim: Sim): void {
  for (const session of [...sim.past, sim.session]) {
    const replayed = replay(session.log, DEPS);
    expect(replayed.ok && replayed.state).toEqual(session.state);
  }
}

const types = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const villainId = (s: GameState): InstanceId => s.activeVillainId;
const avatarCode = (s: GameState): string => codeOf(s, villainId(s));
const onTable = (s: GameState, code: string): InstanceId | undefined =>
  cardsInPlay(s).find((id) => codeOf(s, id) === code);
const need = (s: GameState, code: string): InstanceId => {
  const id = onTable(s, code);
  if (!id) throw new Error(`${code} is not in play`);
  return id;
};
const synergyOn = (s: GameState, code: string): number => inst(s, need(s, code)).counters["synergy"] ?? 0;
const shatterOn = (s: GameState): number => inst(s, villainId(s)).counters["shatter"] ?? 0;
const maxHp = (s: GameState, id: InstanceId): number => maxHitPoints(s, id, DEPS)!;
const encounterPiles = (s: GameState) => Object.values(s.encounterDecks)[0]!;
const discardCodes = (s: GameState): string[] => encounterPiles(s).discard.map((id) => codeOf(s, id));
const identity = (s: GameState, p: PlayerId = P1): InstanceId => identityOf(s, p);
const attachedCodes = (s: GameState, id: InstanceId): string[] => inst(s, id).attachments.map((a) => codeOf(s, a));
/**
 * Answers the prompts a test cares about and declines the rest (`firstLegal`): the optional trigger whose label matches
 * `trigger`, the cost paid with the first `cost` hand cards whose label matches `pay`, the target `target`, the option
 * whose label matches `option`.
 */
const answer =
  (o: {
    readonly trigger?: RegExp;
    readonly pay?: RegExp;
    readonly target?: InstanceId;
    readonly option?: RegExp;
  }): Picker =>
  (s) => {
    const c = s.pendingChoice!;
    if (c.prompt.kind === "chooseTriggers" && o.trigger) {
      const hit = c.options.find((x) => o.trigger!.test(x.label));
      if (hit) return [hit.optionId];
    }
    if ((c.prompt.kind === "payForAbility" || c.prompt.kind === "payForCard") && o.pay) {
      const cost = (c.prompt as { readonly cost?: number }).cost ?? 1;
      return c.options
        .filter((x) => o.pay!.test(x.label))
        .slice(0, cost)
        .map((x) => x.optionId);
    }
    if (c.prompt.kind === "chooseTarget" && o.target) {
      const hit = c.options.find((x) => x.ref.kind === "card" && x.ref.instanceId === o.target);
      if (hit) return [hit.optionId];
    }
    if (o.option) {
      const hit = c.options.find((x) => o.option!.test(x.label));
      if (hit) return [hit.optionId];
    }
    return firstLegal(s);
  };
/** The damage a card dealt (an attack, an indirect-damage effect), summed over the events. */
const damageFrom = (s: GameState, events: readonly GameEvent[], code: string): number =>
  types(events, "damageDealt")
    .filter((e) => e.sourceInstanceId !== null && codeOf(s, e.sourceInstanceId) === code)
    .reduce((n, e) => n + e.amount, 0);
const attacksBy = (s: GameState, events: readonly GameEvent[], code: string) =>
  types(events, "attackResolved").filter((a) => codeOf(s, a.enemyInstanceId) === code);
const revealed = (s: GameState, events: readonly GameEvent[]): string[] =>
  types(events, "encounterCardRevealed").map((e) => codeOf(s, e.instanceId));
const threatFrom = (s: GameState, events: readonly GameEvent[], code: string): number[] =>
  types(events, "threatPlaced")
    .filter((e) => e.sourceInstanceId !== null && codeOf(s, e.sourceInstanceId) === code)
    .map((e) => e.amount);
const statusOf = (s: GameState, id: InstanceId, status: "stunned" | "confused" | "tough"): number =>
  inst(s, id).statuses[status] ?? 0;

/**
 * The encounter deck exactly these cards, top first, taken from the scenario's own cards that are not in play, with a few
 * quiet fillers underneath so the deck never runs out; the discard pile is emptied.
 */
function stack(sim: Sim, ...codes: readonly string[]): void {
  stackWithDiscard(sim, codes, []);
}
/** `stack`, with these cards already in the encounter discard pile. */
function stackWithDiscard(sim: Sim, codes: readonly string[], inDiscard: readonly string[]): void {
  edit(sim, (s) => {
    const inPlay = new Set(cardsInPlay(s));
    const taken = new Set<InstanceId>();
    const take = (code: string): InstanceId | undefined => {
      const id = sim.pool.find((i) => !inPlay.has(i) && !taken.has(i) && codeOf(s, i) === code);
      if (id) taken.add(id);
      return id;
    };
    const deck: InstanceId[] = [];
    for (const code of codes) {
      const id = take(code);
      if (!id) throw new Error(`no ${code} available`);
      deck.push(id);
    }
    const discard: InstanceId[] = [];
    for (const code of inDiscard) {
      const id = take(code);
      if (!id) throw new Error(`no ${code} available for the discard pile`);
      discard.push(id);
    }
    for (const code of FILLERS) {
      const id = take(code);
      if (id) deck.push(id);
    }
    const key = Object.keys(s.encounterDecks)[0]!;
    return { ...s, encounterDecks: { ...s.encounterDecks, [key]: { deck, discard } } };
  });
}

/**
 * One villain phase on this deck, top first: the Avatar's boost card, then one dealt card per player, then the cards the
 * ability under test discards. The rest of the deck is quiet fillers. Every listed player ends their turn.
 */
function villainPhase(
  sim: Sim,
  deck: readonly string[],
  pick: Picker = firstLegal,
  players: readonly PlayerId[] = [P1],
  inDiscard: readonly string[] = [],
): void {
  stackWithDiscard(sim, deck, inDiscard);
  sim.events = [];
  for (const p of players) apply(sim, endTurn(p), pick);
}

/** The player whose turn it is (the first player token moves on every round). */
const activePlayer = (s: GameState): PlayerId => {
  if (s.step.phase !== "player" || s.step.kind !== "turn") throw new Error("not a player turn");
  return s.step.activePlayerId;
};

/** A hero's basic attack on `target`, which is made one point from falling (statuses cleared, identity readied). */
function finishOff(sim: Sim, target: InstanceId, pick: Picker = firstLegal, who?: PlayerId): void {
  const player = who ?? activePlayer(stateOf(sim));
  edit(sim, (s) =>
    patchInstance(
      patchInstance(s, target, {
        damage: maxHp(s, target) - 1,
        statuses: { ...inst(s, target).statuses, tough: 0 },
      }),
      identityOf(s, player),
      { exhausted: false },
    ),
  );
  apply(
    sim,
    {
      type: "basicAttack",
      playerId: player,
      attackerInstanceId: identityOf(stateOf(sim), player),
      targetInstanceId: target,
    },
    pick,
  );
}

/** A hero's basic thwart on `scheme`, which is made one point from falling. */
function finishThwart(sim: Sim, scheme: InstanceId, pick: Picker = firstLegal, who?: PlayerId): void {
  const player = who ?? activePlayer(stateOf(sim));
  edit(sim, (s) => patchInstance(patchInstance(s, scheme, { threat: 1 }), identityOf(s, player), { exhausted: false }));
  apply(
    sim,
    {
      type: "basicThwart",
      playerId: player,
      thwarterInstanceId: identityOf(stateOf(sim), player),
      schemeInstanceId: scheme,
    },
    pick,
  );
}

const REFS = [
  "55035.wrapped-in-chains-constant",
  "55035.when-revealed",
  "55035.wrapped-in-chains-action",
  "55036.dark-scepter-constant",
  "55036.dark-scepter-constant-2",
  "55036.dark-scepter-response",
  "55037.when-defeated",
  "55038.grendell-forced-interrupt",
  "55038.when-defeated",
  "55039.malekith-forced-response",
  "55039.when-defeated",
  "55040.when-revealed",
  "55040.when-defeated",
  "55041.the-mangog-constant",
  "55041.when-defeated",
  "55042.when-defeated",
  "55043.when-revealed",
  "55043.when-defeated",
  "55044.laufey-forced-response",
  "55044.when-defeated",
  "55045.when-revealed",
  "55046.door-between-worlds-constant",
  "55046.when-defeated",
  "55047.when-defeated",
  "55047.boost",
  "55048.when-defeated",
  "55049.dark-arts-constant",
  "55049.when-revealed",
  "55049.boost",
  "55050.when-revealed",
  "55050.boost",
  "55051.when-revealed",
];

describe("registry (55035 to 55051)", () => {
  const cardOf = (code: string) => TT_CARDS.find((c) => (c.id as string) === code) as never;
  const codes = Array.from({ length: 17 }, (_, i) => String(55035 + i));

  it("registers the 32 refs the data names for the 17 encounter cards, each a valid definition, and skips none", () => {
    const named = codes.flatMap((code) => abilityRefIds(cardOf(code)));
    expect([...named].sort()).toEqual([...REFS].sort());
    for (const id of named) {
      expect(id in GOD_OF_LIES, id).toBe(true);
      expect(validateDefinition(GOD_OF_LIES[id as keyof typeof GOD_OF_LIES]!), id).toEqual([]);
    }
    expect(Object.keys(GOD_OF_LIES_SKIPPED)).toEqual([]);
  });

  it("carries the per-group numbers in the data: The Mangog 10 hit points per group, Door Between Worlds 7 threat per group", () => {
    expect(cardOf("55041")).toMatchObject({ hp: 10, hpPerGroup: true });
    expect(cardOf("55046")).toMatchObject({ startingThreat: { base: 0, perPlayer: 0, perGroup: 7 } });
  });
});

/** Spider-Woman, one wild resource each. */
const WILD = "01011";
/**
 * Test surgery: the player's hand is exactly these cards, padded with Spider-Woman (a wild resource) to the hand size of
 * 5, so the end-of-turn discard never asks anything; the cards that were in the hand go under the deck.
 */
function withHand(s: GameState, player: PlayerId, ...codes: string[]): GameState {
  const owner = playerOf(s, player);
  const wanted = [...codes, ...Array.from({ length: Math.max(0, 5 - codes.length) }, () => WILD)];
  if (owner.hand.length < wanted.length) throw new Error("hand too small");
  const keep = owner.hand.slice(0, wanted.length);
  const rest = owner.hand.slice(wanted.length);
  const patched = wanted.reduce((acc, code, i) => patchInstance(acc, keep[i]!, { cardId: code as never }), s);
  return {
    ...patched,
    players: patched.players.map((p) => (p.playerId === player ? { ...p, hand: keep, deck: [...p.deck, ...rest] } : p)),
  };
}

describe("Wrapped in Chains 55035", () => {
  it("attaches to your identity and exhausts it; the identity does not ready at the end of the round", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55035"]);
    const s = stateOf(sim);
    const chains = need(s, "55035");
    expect(inst(s, chains).attachedTo).toBe(identity(s));
    expect(attachedCodes(s, identity(s))).toContain("55035");
    // The ready step ended the round: a readied identity would be upright, this one is held down.
    expect(s.step.phase).toBe("player");
    expect(inst(s, identity(s)).exhausted).toBe(true);
    expectReplays(sim);
  });

  it("without it the same identity readies at the end of the round (the control)", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55045", "55037", "55037"]);
    expect(inst(stateOf(sim), identity(stateOf(sim))).exhausted).toBe(false);
  });

  it("Hero Action: spend 2 resources of the same type, discard it, place 1 shatter counter on the Avatar", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55035"]);
    const chains = need(stateOf(sim), "55035");
    edit(sim, (st) => withHand(st, P1, WILD, WILD));
    const [a, b] = playerOf(stateOf(sim), P1).hand;
    const before = shatterOn(stateOf(sim));
    apply(sim, use(P1, chains, "55035.wrapped-in-chains-action", [{ fromHand: a! }, { fromHand: b! }]));
    const s = stateOf(sim);
    expect(onTable(s, "55035")).toBeUndefined();
    expect(discardCodes(s)).toContain("55035");
    expect(shatterOn(s)).toBe(before + 1);
    expect(attachedCodes(s, identity(s))).not.toContain("55035");
    expectReplays(sim);
  });
});

describe("Dark Scepter 55036", () => {
  const payTwoWild = answer({ trigger: /Dark Scepter/, pay: /Spider-Woman/ });

  it("is revealed onto the Avatar: stalwart, and the Avatar's next attack has +1 ATK", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55036"]);
    let s = stateOf(sim);
    const scepter = need(s, "55036");
    expect(inst(s, scepter).attachedTo).toBe(villainId(s));
    expect(attachedCodes(s, villainId(s))).toEqual(["55036"]);
    expect(hasKeyword(s, villainId(s), "stalwart", DEPS)).toBe(true);
    // The first phase's attack came before the Scepter arrived; the second has its +1 ATK.
    expect(attacksBy(s, sim.events, KNAVE).map((a) => a.baseAtk)).toEqual([1]);
    villainPhase(sim, [BOOST, "55037"]);
    s = stateOf(sim);
    expect(attacksBy(s, sim.events, KNAVE).map((a) => a.baseAtk)).toEqual([2]);
    expectReplays(sim);
  });

  it("treacheries cannot be canceled: Enhanced Spider-Sense cancels Dirty Trick without it and is not offered with it", () => {
    const control = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    edit(control, (st) => withHand(st, P1, "01004"));
    villainPhase(control, [BOOST, "55050"], answer({ trigger: /Enhanced Spider-Sense/, pay: /./ }));
    expect(types(control.events, "revealCancelled")).toHaveLength(1);
    expect(damageFrom(stateOf(control), control.events, "55050")).toBe(0);

    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55036"]);
    edit(sim, (st) => withHand(st, P1, "01004"));
    const offered: string[] = [];
    const probe: Picker = (st) => {
      if (st.pendingChoice!.prompt.kind === "chooseTriggers")
        offered.push(...st.pendingChoice!.options.map((o) => o.label));
      return answer({ trigger: /Enhanced Spider-Sense/, pay: /./ })(st);
    };
    villainPhase(sim, [BOOST, "55050"], probe);
    expect(offered).not.toContain("Enhanced Spider-Sense");
    expect(types(sim.events, "revealCancelled")).toHaveLength(0);
    expect(damageFrom(stateOf(sim), sim.events, "55050")).toBe(2);
    expectReplays(sim);
  });

  it("Hero Response: after you resolve a treachery, spend 2 resources of the same type to discard it", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55036"]);
    edit(sim, (st) => withHand(st, P1, WILD, WILD));
    villainPhase(sim, [BOOST, "55050"], payTwoWild);
    const s = stateOf(sim);
    expect(onTable(s, "55036")).toBeUndefined();
    expect(discardCodes(s)).toContain("55036");
    expect(attachedCodes(s, villainId(s))).toEqual([]);
    expectReplays(sim);
  });

  it("is not discarded when the offer is declined, or after a card that is not a treachery", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55036"]);
    edit(sim, (st) => withHand(st, P1, WILD, WILD));
    villainPhase(sim, [BOOST, "55050"]);
    expect(onTable(stateOf(sim), "55036")).toBeDefined();
    const offered = vi.fn();
    villainPhase(sim, [BOOST, "55037"], (st) => {
      if (st.pendingChoice!.prompt.kind === "chooseTriggers") offered(st.pendingChoice!.options.map((o) => o.label));
      return firstLegal(st);
    });
    expect(onTable(stateOf(sim), "55036")).toBeDefined();
    expect(offered.mock.calls.flat(2)).not.toContain("Dark Scepter");
  });
});

describe("Draugr Buddy 55037", () => {
  const revealDraugr = (players: readonly Seat[] = [SPIDER_MAN]) => {
    const sim = begin(open([...players], { avatar: KNAVE }));
    villainPhase(
      sim,
      [BOOST, "55037"],
      firstLegal,
      players.map((_, i) => `p${i + 1}` as PlayerId).slice(0, players.length),
    );
    return sim;
  };

  it("defeated: the top card is discarded; a treachery deals Draugr Buddy to the defeating player facedown", () => {
    const sim = revealDraugr();
    const buddy = need(stateOf(sim), "55037");
    stack(sim, TREACHERY);
    finishOff(sim, buddy);
    const s = stateOf(sim);
    expect(discardCodes(s)).toContain(TREACHERY);
    expect(playerOf(s, P1).dealtEncounter).toContain(buddy);
    expect(discardCodes(s)).not.toContain("55037");
    expect(onTable(s, "55037")).toBeUndefined();
    expectReplays(sim);
  });

  it("defeated: any other card discarded and Draugr Buddy goes to the discard pile", () => {
    const sim = revealDraugr();
    const buddy = need(stateOf(sim), "55037");
    stack(sim, "55045");
    finishOff(sim, buddy);
    const s = stateOf(sim);
    expect(discardCodes(s).sort()).toEqual(["55037", "55045"]);
    expect(playerOf(s, P1).dealtEncounter).toEqual([]);
  });

  it("three players: dealt to the player who defeated it, not to the one it was engaged with", () => {
    const sim = begin(open([SPIDER_MAN, IRON_MAN, SHE_HULK], { avatar: KNAVE }));
    // The Avatar activates against each player, so three boost cards come off the top before the three dealt cards.
    villainPhase(sim, [BOOST, BOOST, "01188", "55037", "55045", "55047"], firstLegal, [P1, P2, P3]);
    const buddy = need(stateOf(sim), "55037");
    stack(sim, TREACHERY);
    finishOff(sim, buddy, firstLegal, P2);
    const s = stateOf(sim);
    expect(playerOf(s, P2).dealtEncounter).toContain(buddy);
    expect(playerOf(s, P1).dealtEncounter).not.toContain(buddy);
    expectReplays(sim);
  });
});

describe("Grendell 55038", () => {
  /**
   * Grendell revealed in the first villain phase; in the second the Avatar's boost card comes off the top (a minion
   * without villainous is given none, RRG 1.8 "Attack (Enemy Activation)"), then Grendell's 3 discards.
   */
  const attackWith = (discards: readonly string[]) => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "38"].slice(0, 1).concat("55038"));
    villainPhase(sim, [BOOST, ...discards, "55037"]);
    return sim;
  };

  it("discards the top 3 cards and gets +1 ATK for each treachery among them", () => {
    const sim = attackWith([TREACHERY, "55045", TREACHERY]);
    const s = stateOf(sim);
    const [attack] = attacksBy(s, sim.events, "55038");
    expect(attack).toMatchObject({ baseAtk: 3, damageDealt: 3 });
    expect(discardCodes(s)).toEqual(expect.arrayContaining(["55045", TREACHERY]));
    expectReplays(sim);
  });

  it("no treachery among them: no bonus; three: +3", () => {
    const none = attackWith(["55037", "55045", "55047"]);
    expect(attacksBy(stateOf(none), none.events, "55038")[0]).toMatchObject({ baseAtk: 1, damageDealt: 1 });
    const all = attackWith([TREACHERY, TREACHERY, "01188"]);
    expect(attacksBy(stateOf(all), all.events, "55038")[0]).toMatchObject({ baseAtk: 4 });
  });

  it("When Defeated: 3 shatter counters on the Avatar", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55038"]);
    const before = shatterOn(stateOf(sim));
    finishOff(sim, need(stateOf(sim), "55038"));
    expect(shatterOn(stateOf(sim))).toBe(before + 3);
    expect(discardCodes(stateOf(sim))).toContain("55038");
    expectReplays(sim);
  });
});

describe("Malekith 55039", () => {
  const attackedBy = (discard: string) => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55039"]);
    villainPhase(sim, [BOOST, discard, "55037"]);
    return sim;
  };

  it("after he attacks you: a treachery discarded is dealt to you and revealed", () => {
    const sim = attackedBy("01187");
    const s = stateOf(sim);
    expect(attacksBy(s, sim.events, "55039")).toHaveLength(1);
    // The treachery was discarded, dealt from the discard pile, and revealed in the same villain phase.
    expect(revealed(s, sim.events)).toEqual(["01187", "55037"]);
    expectReplays(sim);
  });

  it("after he attacks you: any other card is only discarded", () => {
    const sim = attackedBy("55045");
    const s = stateOf(sim);
    expect(revealed(s, sim.events)).toEqual(["55037"]);
    expect(discardCodes(s)).toContain("55045");
  });

  it("Retaliate 1 is data: he hits back 1 when attacked; When Defeated places 2 shatter counters", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55039"]);
    const malekith = need(stateOf(sim), "55039");
    expect(hasKeyword(stateOf(sim), malekith, "retaliate", DEPS)).toBe(true);
    const before = shatterOn(stateOf(sim));
    finishOff(sim, malekith);
    expect(shatterOn(stateOf(sim))).toBe(before + 2);
  });
});

describe("Minotaur 55040", () => {
  /** The discard pile holds `n` treacheries; the Avatar's boost card is a minion, so it adds none. */
  const withDiscarded = (n: number, difficulty: "standard" | "expert" = "standard") => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE, difficulty }));
    const treacheries = ["01186", "01186", "01187", "01187", "01188"].slice(0, n);
    villainPhase(sim, ["55037", "55040"], firstLegal, [P1], treacheries);
    return sim;
  };

  it("5 treacheries in the encounter discard pile: it activates against you", () => {
    const sim = withDiscarded(5);
    expect(attacksBy(stateOf(sim), sim.events, "55040")).toHaveLength(1);
    expectReplays(sim);
  });

  it("4 treacheries: it only enters play", () => {
    const sim = withDiscarded(4);
    expect(onTable(stateOf(sim), "55040")).toBeDefined();
    expect(attacksBy(stateOf(sim), sim.events, "55040")).toHaveLength(0);
  });

  it("Toughness is data, and When Defeated places 2 shatter counters", () => {
    const sim = withDiscarded(0);
    const minotaur = need(stateOf(sim), "55040");
    expect(hasKeyword(stateOf(sim), minotaur, "toughness", DEPS)).toBe(true);
    const before = shatterOn(stateOf(sim));
    finishOff(sim, minotaur);
    expect(shatterOn(stateOf(sim))).toBe(before + 2);
  });
});

describe("Hraesvelgr 55043", () => {
  it("When Revealed: discard 3; a treachery among them is 2 indirect damage to you", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55043", "55037", "55037", TREACHERY]);
    const s = stateOf(sim);
    expect(discardCodes(s)).toEqual(expect.arrayContaining(["55037", TREACHERY]));
    expect(damageFrom(s, sim.events, "55043")).toBe(2);
    expectReplays(sim);
  });

  it("no treachery among the 3: no damage", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55043", "55037", "55037", "55045"]);
    expect(damageFrom(stateOf(sim), sim.events, "55043")).toBe(0);
    expect(discardCodes(stateOf(sim))).toEqual(expect.arrayContaining(["55037", "55045"]));
  });
});

describe("Laufey 55044", () => {
  const attackLaufey = (top: string) => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55044"]);
    const laufey = need(stateOf(sim), "55044");
    stack(sim, top);
    edit(sim, (s) => patchInstance(s, identity(s), { exhausted: false }));
    apply(sim, {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: identity(stateOf(sim)),
      targetInstanceId: laufey,
    });
    return sim;
  };

  it("after a character attacks him: a treachery discarded stuns the attacker", () => {
    const sim = attackLaufey(TREACHERY);
    const s = stateOf(sim);
    expect(discardCodes(s)).toContain(TREACHERY);
    expect(statusOf(s, identity(s), "stunned")).toBe(1);
    expectReplays(sim);
  });

  it("any other card discarded: the attacker is not stunned", () => {
    const sim = attackLaufey("55045");
    const s = stateOf(sim);
    expect(discardCodes(s)).toContain("55045");
    expect(statusOf(s, identity(s), "stunned")).toBe(0);
  });
});

describe("Aura of Stasis 55045", () => {
  const exhausted = (s: GameState, events: readonly GameEvent[]) =>
    types(events, "cardExhausted").some((e) => e.instanceId === identity(s));

  it("standard: discards 2; a treachery among them exhausts your identity", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55045", "55037", TREACHERY, "55037"]);
    const s = stateOf(sim);
    expect(onTable(s, "55045")).toBeDefined();
    expect(inst(s, need(s, "55045")).threat).toBe(4);
    expect(exhausted(s, sim.events)).toBe(true);
    expect(discardCodes(s)).toEqual(expect.arrayContaining(["55037", TREACHERY]));
    expectReplays(sim);
  });

  it("standard: the third card is not discarded, so a treachery there changes nothing", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55045", "55037", "55037", TREACHERY]);
    const s = stateOf(sim);
    expect(exhausted(s, sim.events)).toBe(false);
    expect(discardCodes(s)).not.toContain(TREACHERY);
  });

  it("expert: discards 3, so the third card counts", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE, difficulty: "expert" }));
    villainPhase(sim, [BOOST, "55045", "55037", "55037", TREACHERY]);
    const s = stateOf(sim);
    expect(exhausted(s, sim.events)).toBe(true);
    expect(discardCodes(s)).toContain(TREACHERY);
    expectReplays(sim);
  });

  it("no treachery among the discards: nothing is exhausted", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55045", "55037", "55037"]);
    expect(exhausted(stateOf(sim), sim.events)).toBe(false);
  });
});

describe("The Mangog 55041 and Door Between Worlds 55046 (per group, from the whole pod)", () => {
  const pickEnvironment = (code: string) => (s: GameState) => answer({ target: need(s, code) })(s);

  it("The Mangog has 10 hit points at one table, with one player or three (10 per group)", () => {
    for (const seats of [[SPIDER_MAN], [SPIDER_MAN, IRON_MAN, SHE_HULK]]) {
      const sim = begin(open([...seats], { avatar: KNAVE }));
      villainPhase(
        sim,
        [...boosts(seats.length), "55041"],
        firstLegal,
        seats.map((_, i) => `p${i + 1}` as PlayerId),
      );
      const s = stateOf(sim);
      expect(maxHp(s, need(s, "55041"))).toBe(10);
      expect(inst(s, need(s, "55041")).damage).toBe(0);
    }
  });

  it("The Mangog defeated: 3 shatter counters on the Avatar and 1 synergy counter on the environment the first player chooses", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55041"]);
    const mangog = need(stateOf(sim), "55041");
    const before = shatterOn(stateOf(sim));
    finishOff(sim, mangog, (st) => pickEnvironment(UNIFIED)(st));
    const s = stateOf(sim);
    expect(shatterOn(s)).toBe(before + 3);
    expect(synergyOn(s, UNIFIED)).toBe(1);
    for (const env of [DOMINEERING, FEIGNED, MOUNTING]) expect(synergyOn(s, env)).toBe(0);
    // Victory 1: it goes to the victory display, not the discard pile.
    expect(s.victoryDisplay).toContain(mangog);
    expectReplays(sim);
  });

  it("The Mangog defeated with the chosen environment already full: the shatter counters are placed, the synergy counter is not", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55041"]);
    const mangog = need(stateOf(sim), "55041");
    edit(sim, (s) => patchInstance(s, need(s, MOUNTING), { counters: { synergy: 1 } }));
    const before = shatterOn(stateOf(sim));
    finishOff(sim, mangog, (st) => pickEnvironment(MOUNTING)(st));
    const s = stateOf(sim);
    expect(shatterOn(s)).toBe(before + 3);
    expect(synergyOn(s, MOUNTING)).toBe(1);
    expect(types(sim.events, "countersNotPlaced").map((e) => [e.counterType, e.amount, e.reason])).toEqual([
      ["synergy", 1, "limit"],
    ]);
    expectReplays(sim);
  });

  it("Door Between Worlds enters with 7 threat for the one group (one player or three), and is thwarted like any side scheme", () => {
    for (const seats of [[SPIDER_MAN], [SPIDER_MAN, IRON_MAN, SHE_HULK]]) {
      const sim = begin(open([...seats], { avatar: KNAVE }));
      villainPhase(
        sim,
        [...boosts(seats.length), "55046"],
        firstLegal,
        seats.map((_, i) => `p${i + 1}` as PlayerId),
      );
      const s = stateOf(sim);
      expect(inst(s, need(s, "55046")).threat).toBe(7);
    }
  });

  it("Door Between Worlds defeated: Victory, 3 shatter counters and 1 synergy counter on a chosen environment", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55046"]);
    const door = need(stateOf(sim), "55046");
    const before = shatterOn(stateOf(sim));
    finishThwart(sim, door, (st) => pickEnvironment(DOMINEERING)(st));
    const s = stateOf(sim);
    expect(shatterOn(s)).toBe(before + 3);
    expect(synergyOn(s, DOMINEERING)).toBe(1);
    expect(s.victoryDisplay).toContain(door);
    expectReplays(sim);
  });
});

describe.each([
  ["Fenris Wolf", "55042", MOUNTING],
  ["Hraesvelgr", "55043", DOMINEERING],
  ["Laufey", "55044", UNIFIED],
] as const)("%s When Defeated (%s)", (_name, code, environment) => {
  const defeated = (players: readonly Seat[], preset = 0) => {
    const ids = players.map((_, i) => `p${i + 1}` as PlayerId);
    const sim = begin(open([...players], { avatar: KNAVE }));
    // Hraesvelgr's When Revealed discards 3 cards: harmless fillers (Draugr Buddy is no treachery).
    villainPhase(sim, [...boosts(ids.length), code, "55037", "55037", "55045"], firstLegal, ids);
    const minion = need(stateOf(sim), code);
    if (preset > 0) edit(sim, (s) => patchInstance(s, need(s, environment), { counters: { synergy: preset } }));
    const before = shatterOn(stateOf(sim));
    // Any card but a treachery on top, so Laufey's response does not stun the attacker.
    stack(sim, "55048");
    finishOff(sim, minion);
    return { sim, before };
  };

  it("one player: 3 shatter counters on the Avatar and 1 synergy counter on the named environment, nobody asked which group", () => {
    const { sim, before } = defeated([SPIDER_MAN]);
    const s = stateOf(sim);
    expect(shatterOn(s)).toBe(before + 3);
    expect(synergyOn(s, environment)).toBe(1);
    expect(types(sim.events, "groupChosen").map((e) => e.groupId)).toEqual(["g1"]);
    for (const other of ENVIRONMENTS.filter((e) => e !== environment)) expect(synergyOn(s, other)).toBe(0);
    expectReplays(sim);
  });

  it("one player, the environment full (max 1): the counter is not placed and the overflow is logged", () => {
    const { sim, before } = defeated([SPIDER_MAN], 1);
    const s = stateOf(sim);
    expect(shatterOn(s)).toBe(before + 3);
    expect(synergyOn(s, environment)).toBe(1);
    expect(types(sim.events, "countersNotPlaced").map((e) => [e.counterType, e.amount, e.reason])).toEqual([
      ["synergy", 1, "limit"],
    ]);
  });

  it("three players: the limit is 3, so a second counter fits at 1 and the fourth does not", () => {
    const players = [SPIDER_MAN, IRON_MAN, SHE_HULK];
    const open1 = defeated(players, 1);
    expect(synergyOn(stateOf(open1.sim), environment)).toBe(2);
    const full = defeated(players, 3);
    expect(synergyOn(stateOf(full.sim), environment)).toBe(3);
    expect(types(full.sim.events, "countersNotPlaced")).toHaveLength(1);
    // 3 shatter counters regardless of the player count (the Avatar's own 5 per player is a different card).
    expect(shatterOn(stateOf(full.sim))).toBe(full.before + 3);
  });
});

describe("New Jotunheim 55048, Lofty Goals 55047", () => {
  it("New Jotunheim: 6 threat; defeated, 3 shatter counters and 1 synergy counter on Feigned Retreat", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55048"]);
    const scheme = need(stateOf(sim), "55048");
    expect(inst(stateOf(sim), scheme).threat).toBe(6);
    const before = shatterOn(stateOf(sim));
    finishThwart(sim, scheme);
    const s = stateOf(sim);
    expect(shatterOn(s)).toBe(before + 3);
    expect(synergyOn(s, FEIGNED)).toBe(1);
    expect(types(sim.events, "groupChosen").map((e) => e.groupId)).toEqual(["g1"]);
    expectReplays(sim);
  });

  it("New Jotunheim with Feigned Retreat full: nothing is placed past the limit", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55048"]);
    edit(sim, (s) => patchInstance(s, need(s, FEIGNED), { counters: { synergy: 1 } }));
    finishThwart(sim, need(stateOf(sim), "55048"));
    expect(synergyOn(stateOf(sim), FEIGNED)).toBe(1);
    expect(types(sim.events, "countersNotPlaced")).toHaveLength(1);
  });

  it("Lofty Goals: 5 threat; defeated, 2 shatter counters on the Avatar", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55047"]);
    const scheme = need(stateOf(sim), "55047");
    expect(inst(stateOf(sim), scheme).threat).toBe(5);
    const before = shatterOn(stateOf(sim));
    finishThwart(sim, scheme);
    expect(shatterOn(stateOf(sim))).toBe(before + 2);
    expectReplays(sim);
  });

  it("Lofty Goals as a boost card: 1 indirect damage for each character you control (identity alone, then with an ally)", () => {
    const alone = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(alone, ["55047"]);
    expect(damageFrom(stateOf(alone), alone.events, "55047")).toBe(1);
    const withAlly = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    edit(withAlly, (s) => allyInPlay(s, P1));
    villainPhase(withAlly, ["55047"]);
    expect(damageFrom(stateOf(withAlly), withAlly.events, "55047")).toBe(2);
    expectReplays(withAlly);
  });
});

/** Test surgery: Spider-Woman (01011) in the player's play area under their control. */
function allyInPlay(s: GameState, player: PlayerId): GameState {
  const owner = playerOf(s, player);
  const id = owner.deck[0]!;
  return {
    ...patchInstance(s, id, { cardId: "01011" as never, faceup: true }),
    players: s.players.map((p) =>
      p.playerId === player ? { ...p, deck: p.deck.filter((i) => i !== id), playArea: [...p.playArea, id] } : p,
    ),
  };
}

describe("Dark Arts 55049", () => {
  it("When Revealed: searches the encounter discard pile for a minion and reveals it (no threat)", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55049"], firstLegal, [P1], ["55037"]);
    const s = stateOf(sim);
    expect(onTable(s, "55037")).toBeDefined();
    expect(revealed(s, sim.events)).toEqual(["55049", "55037"]);
    expect(threatFrom(s, sim.events, "55049")).toEqual([]);
    expectReplays(sim);
  });

  it("with several minions in the discard pile, the player chooses which one", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55049"], answer({ option: /Malekith/ }), [P1], ["55037", "55039"]);
    const s = stateOf(sim);
    expect(onTable(s, "55039")).toBeDefined();
    expect(onTable(s, "55037")).toBeUndefined();
  });

  it("Otherwise (no minion in the discard pile): 3 threat on the main scheme", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(sim, [BOOST, "55049"], firstLegal, [P1], ["55045"]);
    const s = stateOf(sim);
    expect(threatFrom(s, sim.events, "55049")).toEqual([3]);
    expect(revealed(s, sim.events)).toEqual(["55049"]);
    expectReplays(sim);
  });

  it("expert: gains incite 1 (1 more threat on the main scheme when it is revealed); standard does not", () => {
    const standard = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(standard, [BOOST, "55049"], firstLegal, [P1], ["55045"]);
    const expert = begin(open([SPIDER_MAN], { avatar: KNAVE, difficulty: "expert" }));
    villainPhase(expert, [BOOST, "55049"], firstLegal, [P1], ["55045"]);
    expect(threatFrom(stateOf(standard), standard.events, "55049").reduce((a, b) => a + b, 0)).toBe(3);
    expect(threatFrom(stateOf(expert), expert.events, "55049").reduce((a, b) => a + b, 0)).toBe(4);
    expectReplays(expert);
  });

  it("Boost: 1 threat on the main scheme for each character you control", () => {
    const alone = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(alone, ["55049"]);
    expect(threatFrom(stateOf(alone), alone.events, "55049")).toEqual([1]);
    const withAlly = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    edit(withAlly, (s) => allyInPlay(s, P1));
    villainPhase(withAlly, ["55049"]);
    expect(threatFrom(stateOf(withAlly), withAlly.events, "55049")).toEqual([2]);
    expectReplays(withAlly);
  });
});

describe("Dirty Trick 55050", () => {
  const reveal = (difficulty: "standard" | "expert", shatter: number) => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE, difficulty }));
    edit(sim, (s) => patchInstance(s, villainId(s), { counters: { shatter } }));
    villainPhase(sim, [BOOST, "55050"]);
    return sim;
  };

  it("removes 1 shatter counter from the Avatar and deals you 2 damage (3 in expert mode)", () => {
    const standard = reveal("standard", 4);
    expect(shatterOn(stateOf(standard))).toBe(3);
    expect(damageFrom(stateOf(standard), standard.events, "55050")).toBe(2);
    const expert = reveal("expert", 4);
    expect(shatterOn(stateOf(expert))).toBe(3);
    expect(damageFrom(stateOf(expert), expert.events, "55050")).toBe(3);
    expectReplays(standard);
    expectReplays(expert);
  });

  it("with no shatter counter to remove, the damage is still taken", () => {
    const sim = reveal("standard", 0);
    expect(shatterOn(stateOf(sim))).toBe(0);
    expect(damageFrom(stateOf(sim), sim.events, "55050")).toBe(2);
  });

  it("Boost: 1 indirect damage for each character you control", () => {
    const alone = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    villainPhase(alone, ["55050"]);
    expect(damageFrom(stateOf(alone), alone.events, "55050")).toBe(1);
    const withAlly = begin(open([SPIDER_MAN], { avatar: KNAVE }));
    edit(withAlly, (s) => allyInPlay(s, P1));
    villainPhase(withAlly, ["55050"]);
    expect(damageFrom(stateOf(withAlly), withAlly.events, "55050")).toBe(2);
  });
});

describe("Stories and Lies 55051", () => {
  const AVATAR_DATA = Object.fromEntries(
    AVATARS.map((code) => {
      const card = JSON.parse(JSON.stringify(TT_CARDS.find((c) => (c.id as string) === code))) as Record<
        string,
        unknown
      >;
      const find = (o: unknown, key: string): number | undefined => {
        if (o === null || typeof o !== "object") return undefined;
        const rec = o as Record<string, unknown>;
        if (typeof rec[key] === "number") return rec[key] as number;
        for (const v of Object.values(rec)) {
          const hit = find(v, key);
          if (hit !== undefined) return hit;
        }
        return undefined;
      };
      return [code, { atk: find(card, "atk")!, sch: find(card, "sch")! }];
    }),
  );
  const FOCUS = TT_CARDS.find((c) => (c.id as string) === "55034a") as unknown as {
    readonly statModifiers: { readonly atk: number; readonly sch: number };
  };

  /** Stories and Lies dealt in a villain phase; the Knave is damaged, shattered and tough first. */
  const reveal = (seed: number, difficulty: "standard" | "expert") => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE, seed, difficulty }));
    const id = villainId(stateOf(sim));
    edit(sim, (s) =>
      patchInstance(s, id, {
        damage: 6,
        counters: { shatter: 3 },
        statuses: { ...inst(s, id).statuses, tough: 1 },
      }),
    );
    // The Avatar's boost card, Stories and Lies, then a quiet boost card for the attack Stories and Lies may start.
    villainPhase(sim, [BOOST, "55051", "55037"]);
    return { sim, id };
  };

  it("swaps the Avatar for another one and keeps its damage, shatter counters and tough status card; the old one is set aside", () => {
    const { sim, id } = reveal(1, "standard");
    const s = stateOf(sim);
    expect(s.activeVillainId).toBe(id);
    expect(avatarCode(s)).not.toBe(KNAVE);
    expect(AVATARS).toContain(avatarCode(s) as Avatar);
    expect(inst(s, id)).toMatchObject({ damage: 6 });
    expect(shatterOn(s)).toBe(3);
    expect(statusOf(s, id, "tough")).toBe(1);
    expect(s.encounterSetAside.map((i) => codeOf(s, i))).toContain(KNAVE);
    expect(types(sim.events, "villainReplaced").map((e) => [e.fromCardId, e.reason])).toEqual([[KNAVE, "swap"]]);
    // A swap is not a leave, an entry or a reveal (RRG 1.8 erratum p. 70): only the dealt card was revealed.
    expect(revealed(s, sim.events)).toEqual(["55051"]);
    expectReplays(sim);
  });

  it("then he schemes (Knave, Miscreant) or attacks you (Rascal, Wretch), with +1 in expert mode: every Avatar seen", () => {
    const seen = new Set<string>();
    for (const difficulty of ["standard", "expert"] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const { sim, id } = reveal(seed, difficulty);
        const s = stateOf(sim);
        const code = avatarCode(s);
        seen.add(code);
        const focus = difficulty === "expert" ? FOCUS.statModifiers : { atk: 0, sch: 0 };
        const bonus = difficulty === "expert" ? 1 : 0;
        const schemes = types(sim.events, "schemeResolved").filter((e) => e.enemyInstanceId === id);
        const attacks = types(sim.events, "attackResolved").filter((e) => e.enemyInstanceId === id);
        // The Knave's own activation came first (an attack, as the old Avatar); Stories and Lies' is the last of its kind.
        if (code === "55030a" || code === "55031a") {
          expect(schemes, `${code} ${difficulty} ${seed}`).toHaveLength(1);
          expect(schemes[0]!.baseSch).toBe(AVATAR_DATA[code]!.sch + focus.sch + bonus);
          expect(attacks).toHaveLength(1);
        } else {
          expect(schemes, `${code} ${difficulty} ${seed}`).toHaveLength(0);
          expect(attacks).toHaveLength(2);
          expect(attacks[1]!.baseAtk).toBe(AVATAR_DATA[code]!.atk + focus.atk + bonus);
        }
      }
    }
    expect([...seen].sort()).toEqual(["55029a", "55030a", "55032a"]);
  });

  it("three players: the same swap, the dial and the 15-per-player counters kept", () => {
    const sim = begin(open([SPIDER_MAN, IRON_MAN, SHE_HULK], { avatar: KNAVE }));
    const id = villainId(stateOf(sim));
    edit(sim, (s) => patchInstance(s, id, { damage: 20, counters: { shatter: 7 } }));
    villainPhase(sim, [...boosts(3), "55051", "55037", "55037"], firstLegal, [P1, P2, P3]);
    const s = stateOf(sim);
    expect(avatarCode(s)).not.toBe(KNAVE);
    expect(inst(s, id)).toMatchObject({ damage: 20 });
    expect(shatterOn(s)).toBe(7);
    expect(maxHp(s, id)).toBe(45);
    expectReplays(sim);
  });
});

/** Loki the Wretch's printed ATK and SCH. */
const AVATAR_ATK = 1;
const AVATAR_SCH = 1;

describe("Loki the Wretch 55032a, the half of its activation the frame's tests did not reach", () => {
  const activation = (top: string, form: "hero" | "alterEgo") => {
    const sim = begin(open([SPIDER_MAN], { avatar: "55032a" }));
    if (form === "alterEgo")
      edit(sim, (s) => ({
        ...s,
        players: s.players.map((p) => ({
          ...p,
          identity: { ...p.identity, form: "alterEgo" as const, heroFormIndex: null },
        })),
      }));
    // The forced interrupt discards the top card first; the boost card is the one after it.
    villainPhase(sim, [top, BOOST, "55037"]);
    return sim;
  };

  it("a treachery discarded: +1 ATK against a hero", () => {
    const sim = activation(TREACHERY, "hero");
    const [attack] = types(sim.events, "attackResolved");
    expect(attack!.baseAtk).toBe(AVATAR_ATK + 1);
  });

  it("a card that is not a treachery discarded: no bonus against a hero", () => {
    const sim = activation("55045", "hero");
    expect(types(sim.events, "attackResolved")[0]!.baseAtk).toBe(AVATAR_ATK);
    expect(discardCodes(stateOf(sim))).toContain("55045");
  });

  it("a treachery discarded: +1 SCH against an alter-ego, and none otherwise", () => {
    const withBonus = activation(TREACHERY, "alterEgo");
    expect(types(withBonus.events, "schemeResolved")[0]!.baseSch).toBe(AVATAR_SCH + 1);
    const without = activation("55045", "alterEgo");
    expect(types(without.events, "schemeResolved")[0]!.baseSch).toBe(AVATAR_SCH);
    expectReplays(withBonus);
  });
});

describe("Dark Scepter 55036 found by Total Focus (the first half proves the deck and in-play cases)", () => {
  it("in the encounter discard pile: revealed onto the Avatar and the Avatar is given no tough status card", () => {
    const sim = begin(open([SPIDER_MAN], { avatar: KNAVE, difficulty: "expert" }));
    stackWithDiscard(sim, [], ["55036"]);
    finishOff(sim, villainId(stateOf(sim)));
    finishOff(sim, villainId(stateOf(sim)));
    const s = stateOf(sim);
    expect(sharedVillain(s)!.flipped).toBe(true);
    const scepter = need(s, "55036");
    expect(inst(s, scepter).attachedTo).toBe(villainId(s));
    expect(statusOf(s, villainId(s), "tough")).toBe(0);
    expect(discardCodes(s)).not.toContain("55036");
    // Revealed onto the Avatar, it now does what it says: stalwart, and treacheries cannot be canceled.
    expect(hasKeyword(s, villainId(s), "stalwart", DEPS)).toBe(true);
    expectReplays(sim);
  });
});
