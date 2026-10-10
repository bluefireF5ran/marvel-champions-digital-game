import {
  activeEncounterDeckId,
  applyCommand,
  createGame,
  type EngineDeps,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { CORE_CARDS } from "@mc/content";
import { describe, expect, it, vi } from "vitest";
import { mergeRegistries } from "../../dsl/index.js";
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
  settle,
  stackEncounterDeck,
  use,
  type Picker,
} from "../../testing/harness.js";
import { driveEventsPicking, encounterCardInVillainArea, playFromHand, withDamage } from "../../testing/staging.js";
import { WAVE8_ABILITIES } from "../../wave8/index.js";
import { wave9Scenario } from "../setup.js";
import {
  BLANK,
  IRON_MAN,
  ONE_ICON,
  SPIDER_MAN,
  codeOf,
  heroAttacks,
  heroForm,
  heroThwarts,
  inPlayCard,
  onlyDeck,
  piles,
  schemesBy,
} from "../testing.js";
import { BARON_ZEMO, BARON_ZEMO_SKIPPED } from "./baron-zemo.js";
import { EXECUTIVE_BOARD } from "./executive-board.js";

vi.setConfig({ testTimeout: 300_000 });

/**
 * The encounter cards of the Baron Zemo set (50170 to 50177; docs/phase7-wave9.md sections 3.27, 3.30, 3.31, owner
 * answer Q28 = A). The real Zemo scenario with the Executive Board, driven by real turns: the encounter deck is stacked
 * top first (Zemo's boost card, then the cards the players are dealt). Reluctant Foe (engine task 21) is skipped.
 */
const DEPS: EngineDeps = { abilities: mergeRegistries(WAVE8_ABILITIES, BARON_ZEMO, EXECUTIVE_BOARD) };

const MEDICAL = "50181a";
const SURVEILLANCE = "50182a";
const TACTICAL = "50183a";
const MEMBERS = [MEDICAL, SURVEILLANCE, TACTICAL];
const SWORD = "50170";
const AGENT = "50172";
const ZEMO = "50165a";
const SPARE = "01189";

const REFS = [
  "50165a.baron-zemo-forced-interrupt",
  "50165b.baron-zemo-forced-interrupt",
  "50166a.baron-zemo-forced-interrupt",
  "50166b.baron-zemo-forced-interrupt",
  "50167a.setup",
  "50167b.zemos-manipulations-response",
  "50168a.when-revealed",
  "50168b.when-revealed",
  "50168b.the-accusation-constant",
  "50168b.the-accusation-constant-2",
  "50168b.the-accusation-constant-3",
  "50168b.the-accusation-constant-4",
  "50169a.when-revealed",
  "50169b.when-revealed",
  "50170.baron-zemos-sword-forced-response",
  "50170.baron-zemos-sword-action",
  "50172.shield-agent-forced-interrupt",
  "50173.divided-loyalties-constant",
  "50173.when-defeated",
  "50174.undermine-support-constant",
  "50174.when-defeated",
  "50176.when-revealed-alter-ego",
  "50176.when-revealed-hero",
  "50175.when-revealed",
  "50177.when-revealed",
];

const SKIPPED = ["50171.reluctant-foe-constant", "50171.when-defeated", "50171.when-revealed"];

function open(players: readonly (typeof SPIDER_MAN | typeof IRON_MAN)[] = [SPIDER_MAN], hero = true): GameState {
  const created = createGame(wave9Scenario("baron-zemo", { players, seed: 1, difficulty: "standard" }), DEPS);
  if (!created.ok) throw new Error(created.error.message);
  const state = settle(created.state, firstLegal, (s) => s.step.phase === "player", DEPS);
  return hero ? heroForm(state, ...state.players.map((p) => p.playerId)) : state;
}

const villainOf = (s: GameState): InstanceId => s.villains[0]!.instanceId;
const memberOf = (s: GameState, code: string): InstanceId =>
  (Object.keys(s.instances) as InstanceId[]).find((i) => codeOf(s, i) === code && s.villainArea.includes(i))!;
const secrets = (s: GameState, code: string): number => inst(s, memberOf(s, code)).counters["secret"] ?? 0;
const total = (s: GameState): number => MEMBERS.reduce((sum, code) => sum + secrets(s, code), 0);
const counts = (s: GameState): readonly number[] => MEMBERS.map((code) => secrets(s, code));
/** The three Board Member environments with 2, 1 and 3 secret counters: the Surveillance one is the fewest. */
const withCounters = (s: GameState, a = 2, b = 1, c = 3): GameState =>
  [
    [MEDICAL, a],
    [SURVEILLANCE, b],
    [TACTICAL, c],
  ].reduce(
    (acc, [code, n]) =>
      patchInstance(acc, memberOf(acc, code as string), { counters: n ? { secret: n as number } : {} }),
    s,
  );

/** An attachment taken out of the encounter deck and onto Zemo, as Fighting Zemo's find would leave it. */
function withSword(state: GameState): GameState {
  const pile = piles(state);
  const sword = [...pile.deck, ...pile.discard].find((i) => codeOf(state, i) === SWORD)!;
  const zemo = villainOf(state);
  return {
    ...state,
    encounterDecks: {
      ...state.encounterDecks,
      [activeEncounterDeckId(state)]: {
        deck: pile.deck.filter((i) => i !== sword),
        discard: pile.discard.filter((i) => i !== sword),
      },
    },
    instances: {
      ...state.instances,
      [sword]: { ...state.instances[sword]!, attachedTo: zemo, faceup: true, controllerId: null },
      [zemo]: { ...state.instances[zemo]!, attachments: [...state.instances[zemo]!.attachments, sword] },
    },
  };
}
const swordOf = (s: GameState): InstanceId | undefined =>
  s.instances[villainOf(s)]!.attachments.find((a) => codeOf(s, a) === SWORD);

interface Opts {
  readonly label?: string;
  readonly target?: InstanceId;
  readonly defender?: InstanceId;
  readonly pay?: number;
}
/** Answers an option by label, a target by instance and a payment from the hand; anything else as `firstLegal`. */
function scripted(opts: Opts = {}): Picker {
  return (s) => {
    const choice = s.pendingChoice!;
    if (choice.prompt.kind === "chooseOption" && opts.label) {
      const hit = choice.options.find((o) => o.label.includes(opts.label!));
      if (hit) return [hit.optionId];
    }
    if (choice.prompt.kind === "declareDefender" && opts.defender) {
      const hit = choice.options.find((o) => o.ref.kind === "card" && o.ref.instanceId === opts.defender);
      if (hit) return [hit.optionId];
    }
    if (choice.prompt.kind === "chooseTarget" && opts.target) {
      const hit = choice.options.find((o) => o.ref.kind === "card" && o.ref.instanceId === opts.target);
      if (hit) return [hit.optionId];
    }
    if (choice.prompt.kind === "spendResources" || choice.prompt.kind === "payForAbility") {
      return choice.options
        .map((o) => o.optionId)
        .filter((id) => id.startsWith("hand:"))
        .slice(0, opts.pay ?? 0);
    }
    return firstLegal(s);
  };
}

/** Every player ends their turn: the villain phase runs on the encounter deck exactly `deck` (top first). */
function villainPhase(state: GameState, deck: readonly string[], pick: Picker = firstLegal, keepRest = false) {
  const staged = keepRest ? stackEncounterDeck(state, ...deck) : onlyDeck(state, ...deck);
  return driveEventsPicking(DEPS, staged, pick, ...state.players.map((p) => endTurn(p.playerId)));
}

describe("registry", () => {
  it("registers the frame and the encounter cards, each a valid definition", () => {
    expect(Object.keys(BARON_ZEMO).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(BARON_ZEMO)) expect(validateDefinition(def), id).toEqual([]);
  });

  it("skips exactly Reluctant Foe, with its reason with its reason", () => {
    expect(Object.keys(BARON_ZEMO_SKIPPED).sort()).toEqual([...SKIPPED].sort());
    expect(BARON_ZEMO_SKIPPED["50171.when-revealed"]).toContain("engine task 21");
    for (const id of SKIPPED) expect(BARON_ZEMO[id]).toBeUndefined();
  });
});

describe("S.H.I.E.L.D. Agent (50172)", () => {
  /** Round 1: the Agent is revealed, engages and (Quickstrike) attacks, which is an activation. */
  const revealed = () => {
    const start = withCounters(open());
    return { start, run: villainPhase(start, [BLANK, AGENT, ONE_ICON, SPARE]) };
  };
  const agentOf = (s: GameState): InstanceId => inPlayCard(s, AGENT)!;

  it("when it activates: 1 secret counter on the Board Member environment with the fewest", () => {
    const { run } = revealed();
    expect(run.state.outcome).toBeNull();
    expect(inst(run.state, agentOf(run.state)).engagedWith).not.toBeNull();
    expect(counts(run.state)).toEqual([2, 2, 3]);
  });

  it("when it is defeated: 1 secret counter on the environment with the fewest", () => {
    const { run } = revealed();
    const agent = agentOf(run.state);
    const wounded = withDamage(run.state, agent, 2);
    const hit = heroAttacks(DEPS, wounded, agent);
    expect(piles(hit.state).discard).toContain(agent);
    // Round 1 left 2, 2, 3; the tie for the fewest goes to the first card listed.
    expect(total(hit.state)).toBe(total(run.state) + 1);
  });

  it("a tie for the fewest is the first player's pick", () => {
    const start = withCounters(open(), 2, 2, 3);
    const run = villainPhase(start, [BLANK, AGENT, ONE_ICON, SPARE], scripted({ target: memberOf(start, MEDICAL) }));
    expect(counts(run.state)).toEqual([3, 2, 3]);
  });
});

describe("Baron Zemo's Sword (50170)", () => {
  it("Forced Response: after Zemo attacks and defeats a character (an ally defender), 1 secret counter on the fewest", () => {
    const base = withSword(withCounters(open()));
    const cat = playFromHand(DEPS, base, "01002", 2);
    const run = villainPhase(cat.state, [BLANK, ONE_ICON], scripted({ defender: cat.id }));
    expect(run.events.some((e) => e.type === "characterDefeated" && e.instanceId === cat.id)).toBe(true);
    expect(counts(run.state)).toEqual([2, 2, 3]);
  });

  it("an attack that defeats nobody places nothing", () => {
    const base = withSword(withCounters(open()));
    const run = villainPhase(base, [BLANK, ONE_ICON]);
    expect(run.events.some((e) => e.type === "playerEliminated")).toBe(false);
    expect(counts(run.state)).toEqual([2, 1, 3]);
  });

  describe("Hero Action: spend three [energy] or three [physical], remove 1 secret counter, discard the Sword", () => {
    const ENERGY = ["01002", "01006", "01007"];
    const PHYSICAL = ["01003", "01008", "01009"];
    /** The hand is exactly `cards`, so the type the Sword is paid in is the only one on offer. */
    function table(cards: readonly string[]) {
      const base = withSword(withCounters(open()));
      const emptied = {
        ...base,
        players: base.players.map((p) => ({ ...p, deck: [...p.deck, ...p.hand], hand: [] })),
      };
      const moved = moveToHand(emptied, P1, ...cards);
      return { state: moved.state, ids: moved.ids, sword: swordOf(moved.state)! };
    }
    const act = (state: GameState, sword: InstanceId, pick: Picker) =>
      driveEventsPicking(DEPS, state, pick, use(P1, sword, "50170.baron-zemos-sword-action"));

    it.each([
      ["energy", ENERGY],
      ["physical", PHYSICAL],
    ])("three %s resources", (type, cards) => {
      const { state, ids, sword } = table(cards);
      const run = act(state, sword, scripted({ label: type, pay: 3, target: memberOf(state, TACTICAL) }));
      expect(counts(run.state)).toEqual([2, 1, 2]);
      expect(swordOf(run.state)).toBeUndefined();
      expect(piles(run.state).discard).toContain(sword);
      for (const id of ids) expect(playerOf(run.state, P1).discard).toContain(id);
    });

    it("two resources are not enough: the Sword stays", () => {
      const { state, sword } = table(ENERGY.slice(0, 2));
      const result = (() => {
        try {
          return act(state, sword, scripted({ label: "energy", pay: 2 })).state;
        } catch {
          return state;
        }
      })();
      expect(swordOf(result)).toBe(sword);
      expect(counts(result)).toEqual([2, 1, 3]);
    });
  });
});

describe("Undermine Support (50174) and Divided Loyalties (50173)", () => {
  /** An exhausted support in play and the side scheme in the villain area. */
  function table(scheme: string, players: readonly (typeof SPIDER_MAN | typeof IRON_MAN)[] = [SPIDER_MAN]) {
    const base = withCounters(open(players));
    const played = playFromHand(DEPS, base, "01063", 1);
    const exhausted = patchInstance(played.state, played.id, { exhausted: true });
    const staged = encounterCardInVillainArea(exhausted, scheme, 3);
    return { state: staged.state, support: played.id, scheme: staged.id };
  }

  it("Undermine Support: a player who does not pay the resource does not ready the support", () => {
    const { state, support } = table("50174");
    const run = villainPhase(state, [BLANK, SPARE]);
    expect(inst(run.state, support).exhausted).toBe(true);
  });

  it("Undermine Support: paying 1 resource readies it", () => {
    const { state, support } = table("50174");
    const run = villainPhase(state, [BLANK, SPARE], scripted({ pay: 1 }));
    expect(inst(run.state, support).exhausted).toBe(false);
  });

  it("without the side scheme the support readies for free", () => {
    const base = withCounters(open());
    const played = playFromHand(DEPS, base, "01063", 1);
    const exhausted = patchInstance(played.state, played.id, { exhausted: true });
    const run = villainPhase(exhausted, [BLANK, SPARE]);
    expect(inst(run.state, played.id).exhausted).toBe(false);
  });

  it.each([["50173"], ["50174"]])(
    "%s When Defeated: 1 secret counter per hero removed from among the environments",
    (code) => {
      const { state, scheme } = table(code);
      const thin = patchInstance(state, scheme, { threat: 1 });
      const run = heroThwarts(DEPS, thin, scheme);
      expect(piles(run.state).discard).toContain(scheme);
      expect(total(run.state)).toBe(total(state) - 1);
    },
  );

  it("50173 When Defeated with two heroes: 2 removed, the first player splitting them", () => {
    const { state, scheme } = table("50173", [SPIDER_MAN, IRON_MAN]);
    const thin = patchInstance(state, scheme, { threat: 1 });
    const run = heroThwarts(DEPS, thin, scheme);
    expect(total(run.state)).toBe(total(state) - 2);
  });
});

describe("Might Makes Right (50176)", () => {
  it("(Alter-Ego): 2 secret counters on the environment with the fewest", () => {
    const start = withCounters(open([SPIDER_MAN], false));
    const run = villainPhase(start, [BLANK, "50176"]);
    expect(counts(run.state)).toEqual([2, 3, 3]);
  });

  it("(Hero): Zemo attacks you, and a character that takes damage keeps the counters", () => {
    const start = withCounters(open());
    const run = villainPhase(start, [BLANK, "50176", ONE_ICON]);
    expect(run.events.filter((e) => e.type === "attackResolved")).toHaveLength(2);
    expect(counts(run.state)).toEqual([2, 1, 3]);
  });

  it("(Hero): if no character takes damage, 3 secret counters are removed from among the environments", () => {
    const start = withCounters(open());
    const identity = identityOf(start, P1);
    // Zemo is stunned, so his villain-phase attack only discards the stun; the card's attack meets a tough status card.
    const staged = patchInstance(
      patchInstance(start, identity, { statuses: { ...inst(start, identity).statuses, tough: 1 } }),
      villainOf(start),
      { statuses: { ...inst(start, villainOf(start)).statuses, stunned: 1 } },
    );
    const run = villainPhase(staged, ["50176", BLANK], firstLegal, true);
    expect(run.events.filter((e) => e.type === "attackResolved")).toHaveLength(1);
    expect(inst(run.state, identity).damage).toBe(0);
    expect(total(run.state)).toBe(total(start) - 3);
  });
});

describe("Divided Loyalties (50173): an ally's attack, thwart and defense cost 1 more resource", () => {
  /** Spider-Man with Black Cat (an ally) in play and the side scheme in the villain area. */
  function loyal(withScheme = true) {
    const base = withCounters(open());
    const cat = playFromHand(DEPS, base, "01002", 2);
    const staged = withScheme ? encounterCardInVillainArea(cat.state, "50173", 3) : { state: cat.state, id: undefined };
    return { state: staged.state, cat: cat.id, scheme: staged.id! };
  }
  const handOf = (s: GameState) => playerOf(s, P1).hand;
  const attackBy = (s: GameState, cat: InstanceId, payment?: readonly { fromHand: InstanceId }[]) =>
    applyCommand(
      s,
      {
        type: "basicAttack",
        playerId: P1,
        attackerInstanceId: cat,
        targetInstanceId: villainOf(s),
        ...(payment ? { payment } : {}),
      },
      DEPS,
    );
  const thwartBy = (s: GameState, cat: InstanceId, scheme: InstanceId, payment?: readonly { fromHand: InstanceId }[]) =>
    applyCommand(
      s,
      {
        type: "basicThwart",
        playerId: P1,
        thwarterInstanceId: cat,
        schemeInstanceId: scheme,
        ...(payment ? { payment } : {}),
      },
      DEPS,
    );

  it("an ally's basic attack pays 1 resource from the hand, and the attack resolves", () => {
    const { state, cat } = loyal();
    const [card] = handOf(state);
    const result = attackBy(state, cat, [{ fromHand: card! }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(handOf(result.state)).toHaveLength(handOf(state).length - 1);
    expect(playerOf(result.state, P1).discard).toContain(card);
    expect(inst(result.state, cat).exhausted).toBe(true);
    expect(inst(result.state, villainOf(state)).damage).toBeGreaterThan(0);
  });

  it("an ally's basic thwart pays 1 resource from the hand", () => {
    const { state, cat, scheme } = loyal();
    const [card] = handOf(state);
    const result = thwartBy(state, cat, scheme, [{ fromHand: card! }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(handOf(result.state)).toHaveLength(handOf(state).length - 1);
    expect(inst(result.state, cat).exhausted).toBe(true);
    expect(inst(result.state, scheme).threat).toBeLessThan(3);
  });

  it("unpaid, the ally's attack and thwart are refused and it stays ready", () => {
    const { state, cat, scheme } = loyal();
    for (const result of [attackBy(state, cat), thwartBy(state, cat, scheme)]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("insufficient_resources");
    }
    expect(inst(state, cat).exhausted).toBe(false);
  });

  it("the hero's own attack and thwart cost nothing", () => {
    const { state, scheme } = loyal();
    const hand = handOf(state);
    const attack = heroAttacks(DEPS, state, villainOf(state));
    expect(handOf(attack.state)).toEqual(hand);
    expect(inst(attack.state, villainOf(state)).damage).toBeGreaterThan(0);
    const thwart = heroThwarts(DEPS, state, scheme);
    expect(handOf(thwart.state)).toEqual(hand);
    expect(inst(thwart.state, scheme).threat).toBeLessThan(3);
  });

  it("an ally defending pays 1 resource; an ally that is not paid for does not defend", () => {
    const { state, cat } = loyal();
    const paid = villainPhase(state, [BLANK, ONE_ICON], scripted({ defender: cat, pay: 1 }));
    expect(paid.events.some((e) => e.type === "characterDefeated" && e.instanceId === cat)).toBe(true);
    expect(paid.events.some((e) => e.type === "additionalPowerCostPaid" && e.power === "defend")).toBe(true);
    const unpaid = villainPhase(state, [BLANK, ONE_ICON], scripted({ defender: cat, pay: 0 }));
    expect(unpaid.events.some((e) => e.type === "characterDefeated" && e.instanceId === cat)).toBe(false);
    expect(unpaid.events.some((e) => e.type === "additionalPowerCostPaid")).toBe(false);
  });

  it("the cost ends when Divided Loyalties leaves play", () => {
    const { state, cat, scheme } = loyal();
    expect(attackBy(state, cat).ok).toBe(false);
    const thin = patchInstance(state, scheme, { threat: 1 });
    const gone = heroThwarts(DEPS, thin, scheme);
    expect(piles(gone.state).discard).toContain(scheme);
    const [card] = handOf(gone.state);
    const free = attackBy(gone.state, cat);
    expect(free.ok).toBe(true);
    if (free.ok) expect(handOf(free.state)).toEqual(handOf(gone.state));
    expect(card).toBeDefined();
  });

  it("without the side scheme an ally attacks for free", () => {
    const { state, cat } = loyal(false);
    expect(attackBy(state, cat).ok).toBe(true);
  });
});

describe("The Ends Justify the Means (50177)", () => {
  it("choice 1: Zemo defeats the minion with the fewest remaining hit points, then schemes", () => {
    const start = withCounters(open());
    const round1 = villainPhase(start, [BLANK, AGENT, ONE_ICON], firstLegal, true);
    const agent = inPlayCard(round1.state, AGENT)!;
    const before = total(round1.state);
    const run = villainPhase(round1.state, [BLANK, "50177"], scripted({ label: "defeats the minion" }), true);
    expect(piles(run.state).discard).toContain(agent);
    expect(schemesBy(run.state, run.events, ZEMO)).toHaveLength(1);
    // The Agent's own Forced Interrupt adds a counter when it activates in the villain phase and another when it is defeated.
    expect(total(run.state)).toBe(before + 2);
  });

  it("choice 2: discard an ally you control, remove counters equal to its printed cost (the first player splits)", () => {
    const base = withCounters(open());
    const cat = playFromHand(DEPS, base, "01002", 2);
    const before = total(cat.state);
    const run = villainPhase(cat.state, [BLANK, "50177"], scripted({ label: "Discard an ally", target: cat.id }), true);
    expect(playerOf(run.state, P1).discard).toContain(cat.id);
    expect(total(run.state)).toBe(before - 2);
  });

  it("choice 2 removes fewer when the environments hold fewer", () => {
    const base = withCounters(open(), 1, 0, 0);
    const cat = playFromHand(DEPS, base, "01002", 2);
    const run = villainPhase(cat.state, [BLANK, "50177"], scripted({ label: "Discard an ally", target: cat.id }), true);
    expect(total(run.state)).toBe(0);
  });
});

describe("Battle of Wits (50175)", () => {
  const WITS = "50175";
  /** Core treachery with no boost icons and no Boost ability, a second filler. */
  const ASSAULT = "01187";
  const MENTAL_CARDS = ["01004", "01004", "01061"];
  const PHYSICAL_CARDS = ["01003", "01003", "01008"];

  /** The player's hand is exactly these cards (the rest of it goes to the discard pile). */
  const handOf = (state: GameState, player: typeof P1, ...codes: string[]): GameState => {
    const emptied = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === player ? { ...p, hand: [], discard: [...p.discard, ...p.hand] } : p,
      ),
    };
    return moveToHand(emptied, player, ...codes).state;
  };

  /** The player holds no card that pays [mental] anywhere (the hand is drawn back up before the villain phase). */
  const withoutMental = (state: GameState, player: typeof P1): GameState => ({
    ...state,
    players: state.players.map((p) => {
      const keep = (id: InstanceId) => {
        const card = CORE_CARDS.find((c) => (c.id as string) === codeOf(state, id)) as
          | { resourceIcons?: Record<string, number>; producesIcons?: Record<string, number> }
          | undefined;
        const icons = { ...card?.resourceIcons, ...card?.producesIcons };
        return !icons["mental"] && !icons["wild"];
      };
      return p.playerId === player
        ? { ...p, hand: p.hand.filter(keep), deck: p.deck.filter(keep), discard: p.discard.filter(keep) }
        : p;
    }),
  });

  /** Spends `spend` [mental] resources one at a time (paying from the hand), then declines; records each prompt. */
  const spending = (spend: number, asked: string[][] = [], payer?: string): Picker => {
    let spent = 0;
    return (s) => {
      const choice = s.pendingChoice!;
      if (choice.prompt.kind === "chooseOption") {
        asked.push(choice.options.map((o) => o.label));
        const wanted = spent < spend ? "Spend 1 [mental]" : "Spend no more";
        const hit = choice.options.find((o) => o.label.includes(wanted));
        if (hit) {
          if (wanted !== "Spend no more") spent++;
          return [hit.optionId];
        }
      }
      if (payer && choice.prompt.kind === "spendResources") expect(choice.playerId).toBe(payer);
      if (choice.prompt.kind === "spendResources" || choice.prompt.kind === "payForAbility") {
        return choice.options
          .map((o) => o.optionId)
          .filter((id) => id.startsWith("hand:"))
          .slice(0, 1);
      }
      return firstLegal(s);
    };
  };

  /** Round 1: Zemo's own attack takes a blank boost, then Battle of Wits is revealed and Zemo's scheme boosts blank. */
  const reveal = (start: GameState, pick: Picker) => villainPhase(start, [BLANK, WITS, ASSAULT], pick);
  /** The threat Zemo's activations actually put on the main scheme (`schemeResolved.threatPlaced` is before prevention). */
  const placed = (run: ReturnType<typeof reveal>): number =>
    run.events
      .filter(
        (e) =>
          e.type === "threatPlaced" &&
          e.schemeInstanceId === run.state.mainScheme.instanceId &&
          e.sourceInstanceId === villainOf(run.state),
      )
      .reduce((sum, e) => sum + (e.type === "threatPlaced" ? e.amount : 0), 0);
  const staged = (...mental: string[]) => withCounters(handOf(open(), P1, ...mental), 2, 2, 2);

  it("nothing spent: Zemo schemes for his full amount, no counter is removed, and the prompt comes once per threat", () => {
    const asked: string[][] = [];
    const start = staged(...MENTAL_CARDS);
    const run = reveal(start, spending(0, asked));
    expect(placed(run)).toBe(3);
    expect(total(run.state)).toBe(total(start));
    // Known gap (reported, not worked around): "Spend no more" ends one threat's turn, not the loop, so the prompt
    // comes once per threat about to be placed (3 here) instead of once.
    expect(asked).toHaveLength(3);
  });

  it("spending 1 [mental] resource prevents 1 threat and removes 1 secret counter; the first player picks where", () => {
    const start = staged(...MENTAL_CARDS);
    const run = reveal(start, spending(1));
    expect(placed(run)).toBe(2);
    expect(total(run.state)).toBe(total(start) - 1);
  });

  it("spending 2 prevents 2 threat and removes 2 secret counters", () => {
    const start = staged(...MENTAL_CARDS);
    const run = reveal(start, spending(2));
    expect(placed(run)).toBe(1);
    expect(total(run.state)).toBe(total(start) - 2);
  });

  it("the removal does not depend on a counter being left: prevention still happens with the environments bare", () => {
    const start = withCounters(handOf(open(), P1, ...MENTAL_CARDS), 0, 0, 0);
    const run = reveal(start, spending(2));
    expect(placed(run)).toBe(1);
    expect(total(run.state)).toBe(0);
  });

  it("the first player chooses which environments lose the counters", () => {
    const start = staged(...MENTAL_CARDS);
    const medical = memberOf(start, MEDICAL);
    const spend = spending(1);
    const run = reveal(start, (s) => {
      const choice = s.pendingChoice!;
      const hit =
        choice.prompt.kind === "chooseTarget"
          ? choice.options.find((o) => o.ref.kind === "card" && o.ref.instanceId === medical)
          : undefined;
      return hit ? [hit.optionId] : spend(s);
    });
    expect(placed(run)).toBe(2);
    expect(counts(run.state)).toEqual([1, 2, 2]);
  });

  it("a non-mental resource does not pay: with only physical cards in hand the spend is not offered", () => {
    const asked: string[][] = [];
    const start = withoutMental(staged(...PHYSICAL_CARDS), P1);
    const run = reveal(start, spending(1, asked));
    expect(asked).toEqual([]);
    expect(placed(run)).toBe(3);
    expect(total(run.state)).toBe(total(start));
  });

  it("no threat to place (Zemo is confused and removes the status instead of scheming): nothing is offered", () => {
    const asked: string[][] = [];
    const base = staged(...MENTAL_CARDS);
    const start = patchInstance(base, villainOf(base), {
      statuses: { ...inst(base, villainOf(base)).statuses, confused: 1 },
    });
    const run = reveal(start, spending(1, asked));
    expect(asked).toEqual([]);
    expect(placed(run)).toBe(0);
    expect(total(run.state)).toBe(total(start));
  });

  it("two players: the revealing player pays and the first player chooses the environments", () => {
    const base = withCounters(open([IRON_MAN, SPIDER_MAN]), 2, 2, 2);
    const p2 = base.players.find((p) => p.playerId !== P1)!.playerId;
    const start = handOf(withoutMental(base, P1), p2, ...MENTAL_CARDS);
    // Zemo attacks each hero (two boost cards), then the first player is dealt the Sword and the second Battle of Wits.
    const pay = spending(1, [], p2);
    const dividers: string[] = [];
    const run = villainPhase(start, [BLANK, ASSAULT, SWORD, WITS, ASSAULT], (s) => {
      if (s.pendingChoice!.prompt.kind === "divide") dividers.push(s.pendingChoice!.playerId as string);
      return pay(s);
    });
    expect(dividers).toEqual([P1]);
    expect(placed(run)).toBe(2);
    expect(total(run.state)).toBe(total(start) - 1);
  });

  it("a boost-card flip of Battle of Wits does none of this", () => {
    const asked: string[][] = [];
    const start = staged(...MENTAL_CARDS);
    // Zemo's attack flips Battle of Wits as its boost card (1 boost icon); nothing is revealed.
    const run = villainPhase(start, [WITS, ASSAULT], spending(1, asked));
    expect(asked).toEqual([]);
    expect(schemesBy(run.state, run.events, ZEMO)).toHaveLength(0);
    expect(total(run.state)).toBe(total(start));
  });
});

// A hero is a character (RRG 1.8 "Character", p. 12) and is defeated at zero hit points ("Defeat", p. 15), so the
// Sword answers an attack that eliminates a player while the game goes on.
describe("Baron Zemo's Sword (50170): the attack defeats a hero in a two-player game", () => {
  it("Forced Response: Spider-Man is defeated and eliminated, 1 secret counter goes on the fewest, and Iron Man plays on", () => {
    const base = withSword(withCounters(open([SPIDER_MAN, IRON_MAN])));
    const spiderMan = playerOf(base, P1).identity.instanceId;
    // One hit point left: Zemo's undefended attack defeats him.
    const start = patchInstance(base, spiderMan, { damage: 9 });
    const run = villainPhase(start, [BLANK, BLANK, ONE_ICON]);
    expect(run.events.some((e) => e.type === "characterDefeated" && e.instanceId === spiderMan)).toBe(true);
    expect(run.events.filter((e) => e.type === "playerEliminated")).toMatchObject([{ playerId: P1 }]);
    expect(counts(run.state)).toEqual([2, 2, 3]);
    expect(run.state.outcome).toBeNull();
    expect(run.state.players.find((p) => p.playerId !== P1)!.eliminated).toBe(false);
  });
});
