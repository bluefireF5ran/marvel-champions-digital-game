import { CORE_CARDS, TT_CARDS } from "@mc/content";
import {
  applyCommand,
  cardsInPlay,
  createGame,
  hasKeyword,
  keywordTotal,
  maxHitPoints,
  otherFaceVisible,
  sealHiddenInformation,
  sealHiddenReverses,
  traitsOf,
  type Command,
  type EngineDeps,
  type GameEvent,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { mergeRegistries } from "../../dsl/index.js";
import {
  P1,
  P2,
  applyOk,
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
import { IRON_MAN, SPIDER_MAN, codeOf, piles, types } from "../testing.js";
import { TT_ASPECT_BASIC } from "./aspect-basic.js";
import { ENCHANTRESS } from "./enchantress.js";
import { TRICKSTER_MAGIC } from "./trickster-magic.js";

vi.setConfig({ testTimeout: 300_000 });

/**
 * Full seeded games of the Enchantress scenario (Trickster Takeover, MC55; docs/phase7-wave9.md section 8.4 item 70)
 * through the engine's public actions, with Trickster Magic in the encounter deck and its four linked allies set
 * aside. Every game is a list of ops on the state (a staged card or a command with the answers to its prompts), so the
 * game replays from `open()` deep-equal. Staging is test surgery on the table only (an encounter deck stacked, damage
 * or threat set to put a stage one hit from its end); every game rule is exercised by a real command.
 */
const DEPS: EngineDeps = {
  abilities: mergeRegistries(WAVE8_ABILITIES, ENCHANTRESS, TRICKSTER_MAGIC, TT_ASPECT_BASIC),
};

const GAZES = ["55007a", "55008a", "55009a", "55010a", "55011a"] as const;
type Gaze = (typeof GAZES)[number];
const TRANCE_NAME: Readonly<Record<Gaze, string>> = {
  "55007a": "Trance of Envy",
  "55008a": "Trance of Greed",
  "55009a": "Trance of Pride",
  "55010a": "Trance of Sloth",
  "55011a": "Trance of Wrath",
};
const TRANCE_ACTION: Readonly<Record<Gaze, string>> = {
  "55007a": "55007b.trance-of-envy-forced-action",
  "55008a": "55008b.trance-of-greed-forced-action",
  "55009a": "55009b.trance-of-pride-forced-action",
  "55010a": "55010b.trance-of-sloth-forced-action",
  "55011a": "55011b.trance-of-wrath-forced-action",
};
/** Everything that would name the Trance under a Gaze that has not flipped: the reverse's id, name and action. */
const secretsOf = (gaze: Gaze): string[] => [`${gaze.slice(0, -1)}b`, TRANCE_NAME[gaze], TRANCE_ACTION[gaze]];

/** Standard-set and Core fillers. */
const BLANK = "01186"; // Advance: no boost icon
const ONE_ICON = "01188";
const ENCHANTRESS_I = "55001";
/** Side scheme with no When Revealed: a quiet card to deal. */
const SPELLBOUND = "55022";
const ALLY_OF: Readonly<Record<string, string>> = {
  "55056": "55063",
  "55057": "55064",
  "55058": "55065",
  "55059": "55066",
};

// ---------------------------------------------------------------------------------------------------------------
// A small driver: every step is an op on the state, so a game replays from its ops
// ---------------------------------------------------------------------------------------------------------------

type Op = (s: GameState) => GameState;

interface Sim {
  state: GameState;
  /** Every event since the game was created. */
  log: GameEvent[];
  /** Everything done to the game since `open`, in order. */
  ops: Op[];
  readonly players: readonly PlayerId[];
}

interface Plan {
  /** An optional trigger whose id contains one of these texts is taken; every other optional trigger is declined. */
  readonly take?: readonly string[];
  /** A `chooseOption` option whose label starts with one of these texts; with none, the first. */
  readonly options?: readonly string[];
  /** Targets chosen when offered, in order of preference. */
  readonly targets?: readonly InstanceId[];
  /** A `chooseCards` option whose label contains one of these texts, else the first. */
  readonly cards?: readonly string[];
  /** Hand cards paid when a payment is asked for, by count. */
  readonly pay?: number;
  readonly defender?: InstanceId;
}

const planner =
  (plan: Plan): Picker =>
  (s) => {
    const choice = s.pendingChoice!;
    const offered = choice.options;
    switch (choice.prompt.kind) {
      case "chooseTriggers": {
        const hit = offered.find((o) => (plan.take ?? []).some((t) => (o.optionId as string).includes(t)));
        return hit ? [hit.optionId] : [];
      }
      case "declareDefender": {
        const hit = plan.defender
          ? offered.find((o) => o.ref.kind === "card" && o.ref.instanceId === plan.defender)
          : undefined;
        return hit ? [hit.optionId] : ["decline"];
      }
      case "chooseOption": {
        // "Choose one" takes the first wanted option; "do both" (two selections) takes them in the order wanted.
        const picked = (plan.options ?? [])
          .map((wanted) => offered.find((o) => o.label.startsWith(wanted)))
          .filter((o): o is NonNullable<typeof o> => o !== undefined)
          .map((o) => o.optionId);
        const rest = offered.map((o) => o.optionId).filter((id) => !picked.includes(id));
        const chosen = [...picked, ...rest].slice(0, Math.max(choice.minSelections, picked.length > 0 ? 1 : 0));
        return chosen.length > 0 ? chosen : firstLegal(s);
      }
      case "chooseTarget": {
        for (const target of plan.targets ?? []) {
          const hit = offered.find((o) => o.ref.kind === "card" && o.ref.instanceId === target);
          if (hit) return [hit.optionId];
        }
        return firstLegal(s);
      }
      case "chooseCards": {
        for (const wanted of plan.cards ?? []) {
          const hit = offered.find((o) => o.label.includes(wanted));
          if (hit) return [hit.optionId];
        }
        return firstLegal(s);
      }
      case "spendResources":
      case "payForAbility":
        return offered
          .map((o) => o.optionId)
          .filter((id) => id.startsWith("hand:"))
          .slice(0, plan.pay ?? 0);
      default:
        return firstLegal(s);
    }
  };

/** The scenario past setup, to the first player turn. */
function open(
  players: readonly (typeof SPIDER_MAN | typeof IRON_MAN)[],
  difficulty: "standard" | "expert" = "standard",
  seed = 1,
): Sim {
  const config = wave9Scenario("enchantress", { players, seed, difficulty });
  const created = createGame(config, DEPS);
  if (!created.ok) throw new Error(created.error.message);
  const state = settle(created.state, firstLegal, (s) => s.step.phase === "player", DEPS);
  return { state, log: [...created.events], ops: [], players: players.map((_, i) => `p${i + 1}` as PlayerId) };
}

/** An op that is not a command: a card stacked, damage set. */
const stage = (sim: Sim, op: Op) => {
  sim.state = op(sim.state);
  sim.ops.push(op);
};

/**
 * Runs commands, answering each prompt by `plan` (a `Plan` or a picker), until nothing is pending. Returns only the
 * events produced.
 */
function act(sim: Sim, plan: Plan | Picker, ...commands: readonly Command[]): GameEvent[] {
  const pick = typeof plan === "function" ? plan : planner(plan);
  let produced: GameEvent[] = [];
  const run: Op = (start) => {
    let current = start;
    const events: GameEvent[] = [];
    const settleOne = () => {
      for (let guard = 0; current.pendingChoice && !current.outcome; guard++) {
        if (guard > 300) throw new Error(`choices did not settle (stuck on ${current.pendingChoice.prompt.kind})`);
        const choice = current.pendingChoice;
        const r = applyOk(
          current,
          {
            type: "resolveChoice",
            playerId: choice.playerId,
            choiceId: choice.choiceId,
            selectedOptionIds: pick(current),
          },
          DEPS,
        );
        current = r.state;
        events.push(...r.events);
      }
    };
    settleOne();
    for (const command of commands) {
      const r = applyOk(current, command, DEPS);
      current = r.state;
      events.push(...r.events);
      settleOne();
    }
    produced = events;
    return current;
  };
  sim.state = run(sim.state);
  sim.log = [...sim.log, ...produced];
  sim.ops.push((s) => run(s));
  return [...produced];
}

/**
 * The encounter deck with exactly these cards on top, in order, taken from the deck and discard pile (the rest of
 * both stays beneath, so nothing leaves the game). A card in play or set aside is never taken.
 */
function stackedOn(state: GameState, codes: readonly string[]): GameState {
  const pile = piles(state);
  const all = [...pile.deck, ...pile.discard];
  const used: InstanceId[] = [];
  for (const code of codes) {
    const id = all.find((i) => codeOf(state, i) === code && !used.includes(i));
    if (!id) throw new Error(`no ${code} in the encounter deck or discard`);
    used.push(id);
  }
  const rest = all.filter((i) => !used.includes(i));
  const key = Object.keys(state.encounterDecks)[0]!;
  return { ...state, encounterDecks: { ...state.encounterDecks, [key]: { deck: [...used, ...rest], discard: [] } } };
}
const stack = (sim: Sim, ...codes: string[]) => stage(sim, (s) => stackedOn(s, codes));

// Commands
const toHero = (player: PlayerId = P1): Command => ({ type: "changeForm", playerId: player });
const attack = (s: GameState, target: InstanceId, by?: InstanceId, player: PlayerId = P1): Command => ({
  type: "basicAttack",
  playerId: player,
  attackerInstanceId: by ?? identityOf(s, player),
  targetInstanceId: target,
});
const thwart = (s: GameState, scheme: InstanceId, by?: InstanceId, player: PlayerId = P1): Command => ({
  type: "basicThwart",
  playerId: player,
  thwarterInstanceId: by ?? identityOf(s, player),
  schemeInstanceId: scheme,
});
/** The error a command would be rejected with, or null when it is legal (the state is not changed). */
const rejection = (s: GameState, command: Command): string | null => {
  const r = applyCommand(s, command, DEPS);
  return r.ok ? null : r.error.code;
};

// State readers
const villainOf = (s: GameState): InstanceId => s.villains[0]!.instanceId;
const mainOf = (s: GameState): InstanceId => s.mainScheme.instanceId;
const enchantmentOf = (s: GameState, player: PlayerId = P1): InstanceId | undefined =>
  inst(s, identityOf(s, player)).attachments.find((a) => /^5500[7-9][ab]|^5501[01][ab]/.test(codeOf(s, a)));
const gazeOn = (s: GameState, player: PlayerId = P1): InstanceId => {
  const gaze = enchantmentOf(s, player);
  if (!gaze) throw new Error(`${player} has no Enchantment card`);
  return gaze;
};
/** The Gaze's own front code, flipped or not (the instance keeps the front's card id until it is flipped in view). */
const heldGaze = (s: GameState, player: PlayerId = P1): Gaze => {
  const code = codeOf(s, gazeOn(s, player));
  return `${code.slice(0, -1)}a` as Gaze;
};
const charm = (s: GameState, id: InstanceId): number => inst(s, id).counters["charm"] ?? 0;
const attached = (s: GameState, host: InstanceId, code: string): InstanceId | undefined =>
  inst(s, host).attachments.find((a) => codeOf(s, a) === code);
const inPlay = (s: GameState, code: string): InstanceId | undefined =>
  cardsInPlay(s).find((id) => codeOf(s, id) === code);
const has = (s: GameState, id: InstanceId, trait: string): boolean => traitsOf(s, id, DEPS).includes(trait as never);
const statusOf = (s: GameState, id: InstanceId, status: "stunned" | "confused" | "tough"): number =>
  inst(s, id).statuses[status] ?? 0;
const mainThreat = (s: GameState): number => inst(s, mainOf(s)).threat;
const mentions = (value: unknown, needles: readonly string[]): string[] => {
  const text = JSON.stringify(value);
  return needles.filter((n) => text.includes(n));
};

/** Test surgery: the hero is healed (the games run longer than a hero would live under Enchantress's attacks). */
const heal = (sim: Sim, player: PlayerId = P1) =>
  stage(sim, (s) => patchInstance(s, identityOf(s, player), { damage: 0 }));
/** Test surgery: the main scheme's threat. */
const setThreat = (sim: Sim, threat: number) => stage(sim, (s) => patchInstance(s, mainOf(s), { threat }));
/** Test surgery: the villain is one damage from defeat. */
const nearDefeat = (sim: Sim) =>
  stage(sim, (s) =>
    patchInstance(s, villainOf(s), {
      damage: maxHitPoints(s, villainOf(s), DEPS)! - 1,
      statuses: { ...inst(s, villainOf(s)).statuses, tough: 0 },
    }),
  );

/** The players whose turn is still to come this player phase, the active player first. */
const toAct = (sim: Sim): PlayerId[] => {
  const step = sim.state.step;
  if (step.phase !== "player" || step.kind !== "turn") return [];
  return [step.activePlayerId, ...step.remainingPlayerIds];
};
/**
 * The encounter deck stacked, every player whose turn is left ends it, and the villain phase runs to the next player
 * phase.
 */
function villainPhase(sim: Sim, deck: readonly string[], plan: Plan | Picker = {}): GameEvent[] {
  stack(sim, ...deck);
  return act(sim, plan, ...toAct(sim).map((p) => endTurn(p)));
}

/** The ability id of each Temptation's Forced Action. */
const TEMPTATION_ACTION: Readonly<Record<string, string>> = {
  "55012": "55012.alluring-call-forced-action",
  "55013": "55013.kiss-of-temptation-forced-action",
  "55014": "55014.love-concoction-forced-action",
};
/**
 * Uses every Forced Action a player owes: each ready Temptation attached to the identity and a flipped, ready Trance.
 * Returns how many were used.
 */
function payForcedActions(sim: Sim, plan: Plan | Picker = {}, player: PlayerId = P1): number {
  let used = 0;
  for (const id of inst(sim.state, identityOf(sim.state, player)).attachments) {
    const code = codeOf(sim.state, id);
    const ability = TEMPTATION_ACTION[code] ?? (inst(sim.state, id).flipped ? TRANCE_ACTION[code as Gaze] : undefined);
    if (!ability || inst(sim.state, id).exhausted) continue;
    act(sim, plan, use(player, id, ability));
    used++;
  }
  return used;
}

/**
 * What a player at the table can read: the sealed state (the authority's own `rng` and card pool aside) and every
 * event so far name no Trance but the ones in `flipped`.
 */
function expectHidden(sim: Sim, flipped: readonly Gaze[] = []) {
  const hidden = GAZES.filter((g) => !flipped.includes(g)).flatMap(secretsOf);
  const { cardPool: _pool, rng: _rng, ...sealed } = sealHiddenInformation(sim.state);
  const { cardPool: _pool2, rng: _rng2, ...stood } = sealHiddenReverses(sim.state);
  expect(mentions(sealed, hidden), "sealed state").toEqual([]);
  expect(mentions(stood, hidden), "state with the reverses sealed").toEqual([]);
  expect(mentions(sim.log, hidden), "events").toEqual([]);
  // Every Gaze that has not flipped is still hidden on the table.
  for (const p of sim.players) {
    const gaze = enchantmentOf(sim.state, p);
    // A defeated hero's Gaze has left the table with it; the state checks above still cover it.
    if (gaze && !flipped.includes(heldGaze(sim.state, p))) {
      expect(inst(sim.state, gaze).reverseHidden, `${p}'s Gaze`).toBe(true);
      expect(otherFaceVisible(sim.state, gaze)).toBe(false);
    }
  }
}

/** The same game played again from its first op: the same state, deep-equal (the engine is deterministic by seed). */
function replayOf(sim: Sim, again: () => Sim): GameState {
  return sim.ops.reduce((s, op) => op(s), again().state);
}

function zoneIndex(s: GameState): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const add = (id: InstanceId, label: string) => index.set(id, [...(index.get(id) ?? []), label]);
  for (const p of s.players) {
    for (const zone of ["hand", "deck", "discard", "playArea", "dealtEncounter", "resolving", "setAside"] as const)
      for (const id of p[zone]) add(id, `${p.playerId}.${zone}`);
    add(p.identity.instanceId, `${p.playerId}.identity`);
  }
  for (const [deckId, pile] of Object.entries(s.encounterDecks)) {
    for (const id of pile.deck) add(id, `enc.${deckId}.deck`);
    for (const id of pile.discard) add(id, `enc.${deckId}.discard`);
  }
  for (const id of s.encounterSetAside) add(id, "encounterSetAside");
  for (const id of s.villainArea) add(id, "villainArea");
  for (const id of s.victoryDisplay) add(id, "victoryDisplay");
  for (const id of s.removedFromGame) add(id, "removedFromGame");
  return index;
}
/** The closing invariants of every game: no unanswered prompt, no card instance in two zones. */
function expectInvariants(sim: Sim) {
  expect(sim.state.pendingChoice).toBeNull();
  expect([...zoneIndex(sim.state)].filter(([, labels]) => labels.length > 1)).toEqual([]);
}

/** A card in the player's hand that prints this resource. */
const handWith = (
  s: GameState,
  resource: "energy" | "mental" | "physical",
  player: PlayerId = P1,
  skip: readonly InstanceId[] = [],
) => {
  const found = playerOf(s, player).hand.find((id) => {
    const card = CORE_CARDS.find((c) => (c.id as string) === codeOf(s, id)) as
      | { resourceIcons?: Record<string, number> }
      | undefined;
    return !skip.includes(id) && (card?.resourceIcons?.[resource] ?? 0) > 0;
  });
  if (!found) throw new Error(`no ${resource} card in ${player}'s hand`);
  return found;
};

// ---------------------------------------------------------------------------------------------------------------
// Game A: solo, standard, Spider-Man, seed 1, played to a win
// ---------------------------------------------------------------------------------------------------------------

describe("Enchantress, game A: solo (Spider-Man), standard, seed 1, played to a win", () => {
  const a = open([SPIDER_MAN]);
  const me = () => identityOf(a.state);
  const gaze = () => gazeOn(a.state);

  it("setup (MC55 p. 6): Enchantress I, Prime Real Estate, a random Gaze on the hero with its reverse hidden, Future of Despair and the four linked allies set aside", () => {
    expect(codeOf(a.state, villainOf(a.state))).toBe(ENCHANTRESS_I);
    expect(codeOf(a.state, mainOf(a.state))).toBe("55004a");
    expect(a.state.villains[0]!.stageIndex).toBe(0);
    // Seed 1 deals the Gaze of Sloth; the other four stay set aside.
    expect(heldGaze(a.state)).toBe("55010a");
    expect(inst(a.state, gaze()).reverseHidden).toBe(true);
    const aside = a.state.encounterSetAside.map((i) => codeOf(a.state, i));
    expect(aside).toContain("55006");
    expect(aside.filter((c) => (GAZES as readonly string[]).includes(c)).sort()).toEqual(
      GAZES.filter((g) => g !== "55010a"),
    );
    expect(aside.filter((c) => Object.values(ALLY_OF).includes(c)).sort()).toEqual(Object.values(ALLY_OF));
    // Trickster Magic is in the encounter deck; Future of Despair and the Gazes are not.
    const deck = piles(a.state).deck.map((i) => codeOf(a.state, i));
    for (const minion of Object.keys(ALLY_OF)) expect(deck).toContain(minion);
    expect(deck).not.toContain("55006");
    expect(has(a.state, me(), "DEFIANT")).toBe(true);
    expect(has(a.state, me(), "ENTHRALLED")).toBe(false);
    expect(playerOf(a.state, P1).identity.form).toBe("alterEgo");
    expectHidden(a);
  });

  it("round 1: the hero changes form; Enchantress attacks, her Forced Response places the first charm counter; Kiss of Temptation is dealt and attached", () => {
    act(a, {}, toHero());
    heal(a);
    const events = villainPhase(a, [BLANK, "55013"]);
    expect(types(events, "attackResolved").map((e) => codeOf(a.state, e.enemyInstanceId))).toEqual([ENCHANTRESS_I]);
    expect(charm(a.state, gaze())).toBe(1);
    expect(attached(a.state, me(), "55013")).toBeDefined();
    expect(has(a.state, me(), "DEFIANT")).toBe(true);
    expectHidden(a);
  });

  it("round 2: End Turn is refused until Kiss of Temptation's Forced Action is used (counter, draw 1, discard 1); a boosting Law of Attraction adds a counter", () => {
    const kiss = attached(a.state, me(), "55013")!;
    expect(inst(a.state, kiss).exhausted).toBeFalsy();
    expect(rejection(a.state, endTurn(P1))).not.toBeNull();
    act(a, {}, use(P1, kiss, "55013.kiss-of-temptation-forced-action"));
    expect(charm(a.state, gaze())).toBe(2);
    expect(inst(a.state, kiss).exhausted).toBe(true);
    expect(rejection(a.state, endTurn(P1))).toBeNull();
    expectHidden(a);
    heal(a);
    const events = villainPhase(a, ["55021", "55015"]);
    // The boost card's counter and Enchantress's own: 2 + 1 + 1.
    expect(types(events, "boostCardFlipped")).toHaveLength(1);
    expect(charm(a.state, gaze())).toBe(4);
    expect(attached(a.state, me(), "55015")).toBeDefined();
    expect(has(a.state, me(), "DEFIANT")).toBe(true);
    expectHidden(a);
  });

  it("round 3: the Kiss's fifth counter flips the Gaze; the Trance of Sloth stuns the hero, makes it Enthralled, and its Forced Action is owed", () => {
    const kiss = attached(a.state, me(), "55013")!;
    // Seduced: the identity cannot make a basic attack.
    expect(rejection(a.state, attack(a.state, villainOf(a.state)))).not.toBeNull();
    expect(inst(a.state, kiss).exhausted).toBeFalsy();
    const before = inst(a.state, gaze());
    expect(before.flipped).toBeFalsy();
    const events = act(a, {}, use(P1, kiss, "55013.kiss-of-temptation-forced-action"));
    expect(types(events, "cardFlipped")).toHaveLength(1);
    const after = inst(a.state, gaze());
    expect(after.flipped).toBe(true);
    expect(after.reverseHidden).toBeUndefined();
    expect(otherFaceVisible(a.state, gaze())).toBe(true);
    expect(charm(a.state, gaze())).toBe(0);
    expect(has(a.state, me(), "ENTHRALLED")).toBe(true);
    expect(has(a.state, me(), "DEFIANT")).toBe(false);
    // Trance of Sloth's When Revealed: the hero was not stunned, so it is.
    expect(statusOf(a.state, me(), "stunned")).toBe(1);
    expectHidden(a, ["55010a"]);
    // Its Forced Action is owed.
    expect(rejection(a.state, endTurn(P1))).not.toBeNull();
    const handBefore = playerOf(a.state, P1).hand.length;
    act(a, {}, use(P1, gaze(), TRANCE_ACTION["55010a"]));
    expect(inst(a.state, gaze()).exhausted).toBe(true);
    expect(playerOf(a.state, P1).hand.length).toBe(handBefore); // draw 1, discard 1
    expect(rejection(a.state, endTurn(P1))).toBeNull();
  });

  it("round 3 villain phase: Enthralled, Enchantress's attack places 1 threat on the main scheme (Prime Real Estate), not a counter; the Crown is revealed onto her", () => {
    heal(a);
    const before = mainThreat(a.state);
    const events = villainPhase(a, [BLANK, "55016"]);
    expect(charm(a.state, gaze())).toBe(0);
    expect(types(events, "counterAdded").filter((e) => e.counterType === "charm")).toEqual([]);
    // One for the villain phase's acceleration and one for the attack's counter turned into threat.
    expect(mainThreat(a.state) - before).toBe(2);
    expect(inst(a.state, inPlay(a.state, "55016")!).attachedTo).toBe(villainOf(a.state));
    expect(hasKeyword(a.state, villainOf(a.state), "stalwart", DEPS)).toBe(false);
    expectHidden(a, ["55010a"]);
  });

  it("round 4: both Forced Actions are owed again (readied at the end of the player phase); the Kiss's counter is threat; Seduced is paid off in alter-ego form", () => {
    const kiss = attached(a.state, me(), "55013")!;
    const seduced = attached(a.state, me(), "55015")!;
    expect(inst(a.state, kiss).exhausted).toBeFalsy();
    expect(inst(a.state, gaze()).exhausted).toBeFalsy();
    expect(rejection(a.state, endTurn(P1))).not.toBeNull();
    // Test surgery: the threat is set back so the game stays on stage 1 (6 per hero) until game B walks the stages.
    setThreat(a, 1);
    const before = mainThreat(a.state);
    act(a, {}, use(P1, kiss, "55013.kiss-of-temptation-forced-action"));
    expect(mainThreat(a.state) - before).toBe(1);
    expect(charm(a.state, gaze())).toBe(0);
    expect(rejection(a.state, endTurn(P1))).not.toBeNull();
    act(a, {}, use(P1, gaze(), TRANCE_ACTION["55010a"]));
    expect(rejection(a.state, endTurn(P1))).toBeNull();
    // Seduced's Alter-Ego Action: an energy and a mental resource.
    act(a, {}, toHero());
    expect(playerOf(a.state, P1).identity.form).toBe("alterEgo");
    const energy = handWith(a.state, "energy");
    const mental = handWith(a.state, "mental", P1, [energy]);
    act(a, {}, use(P1, seduced, "55015.seduced-action", [{ fromHand: energy }, { fromHand: mental }]));
    expect(attached(a.state, me(), "55015")).toBeUndefined();
    expect(piles(a.state).discard.map((i) => codeOf(a.state, i))).toContain("55015");
    expectHidden(a, ["55010a"]);
  });

  it("round 4 villain phase: Enchantress schemes against the alter ego and the Crown's Forced Response is threat for an Enthralled hero; Zzzax (Trickster Magic) is revealed and engages", () => {
    heal(a);
    setThreat(a, 0);
    const deckBefore = playerOf(a.state, P1).deck.length;
    const events = villainPhase(a, [BLANK, "55059"]);
    expect(types(events, "schemeResolved").map((e) => codeOf(a.state, e.enemyInstanceId))).toContain(ENCHANTRESS_I);
    expect(charm(a.state, gaze())).toBe(0);
    // Acceleration 1, her scheme 2, then the Crown's counter turned into 1 threat by Prime Real Estate.
    expect(types(events, "threatPlaced").map((e) => e.amount)).toEqual([1, 2, 1]);
    expect(mainThreat(a.state)).toBe(4);
    const zzzax = inPlay(a.state, "55059")!;
    expect(zzzax).toBeDefined();
    // When Revealed: the top 4 cards of the deck are discarded.
    expect(playerOf(a.state, P1).deck.length).toBeLessThanOrEqual(deckBefore - 4);
    expect(inst(a.state, zzzax).engagedWith ?? null).not.toBeNull();
    expectHidden(a, ["55010a"]);
  });

  it("round 5: the Crown's Hero Action is unusable while a player's tough status card would absorb its damage (owner decision 57 A), then exhausts the hero, deals 1 and is discarded", () => {
    heal(a);
    setThreat(a, 0);
    act(a, {}, toHero());
    expect(playerOf(a.state, P1).identity.form).toBe("hero");
    const crown = inPlay(a.state, "55016")!;
    const withTough = patchInstance(a.state, me(), { statuses: { ...inst(a.state, me()).statuses, tough: 1 } });
    expect(rejection(withTough, use(P1, crown, "55016.crown-of-the-enchantress-action"))).not.toBeNull();
    const damage = inst(a.state, me()).damage;
    act(a, {}, use(P1, crown, "55016.crown-of-the-enchantress-action"));
    expect(inst(a.state, me()).exhausted).toBe(true);
    expect(inst(a.state, me()).damage).toBe(damage + 1);
    expect(inPlay(a.state, "55016")).toBeUndefined();
    expect(piles(a.state).discard.map((i) => codeOf(a.state, i))).toContain("55016");
    // The Trance and the Kiss are still owed.
    const kiss = attached(a.state, me(), "55013")!;
    act(a, {}, use(P1, kiss, "55013.kiss-of-temptation-forced-action"), use(P1, gaze(), TRANCE_ACTION["55010a"]));
    expectHidden(a, ["55010a"]);
    villainPhase(a, [BLANK, BLANK]);
    expectHidden(a, ["55010a"]);
  });

  it("round 6: the stunned hero's attack on Zzzax only removes the stun status", () => {
    heal(a);
    setThreat(a, 0);
    const zzzax = inPlay(a.state, "55059")!;
    expect(statusOf(a.state, me(), "stunned")).toBe(1);
    act(a, {}, attack(a.state, zzzax));
    expect(statusOf(a.state, me(), "stunned")).toBe(0);
    expect(inst(a.state, zzzax).damage).toBe(0);
    const kiss = attached(a.state, me(), "55013")!;
    act(a, {}, use(P1, kiss, "55013.kiss-of-temptation-forced-action"), use(P1, gaze(), TRANCE_ACTION["55010a"]));
    villainPhase(a, [BLANK, BLANK]);
  });

  it("round 7: Zzzax is defeated by the hero; the Zzzax ally from the set-aside is put into play under that player, and its Response searches the deck", () => {
    heal(a);
    setThreat(a, 0);
    const zzzax = inPlay(a.state, "55059")!;
    stage(a, (s) => patchInstance(s, zzzax, { damage: maxHitPoints(s, zzzax, DEPS)! - 1 }));
    const handBefore = playerOf(a.state, P1).hand.length;
    const events = act(a, { take: ["zzzax"] }, attack(a.state, zzzax));
    // Response: the search offered the top 5 cards of the deck and one with an energy resource went to the hand.
    expect(types(events, "choiceRequested").some((e) => e.choice.prompt.kind === "chooseCards")).toBe(true);
    expect(playerOf(a.state, P1).hand.length).toBe(handBefore + 1);
    expect(types(events, "characterDefeated").map((e) => codeOf(a.state, e.instanceId))).toContain("55059");
    const ally = playerOf(a.state, P1).playArea.find((i) => codeOf(a.state, i) === "55066");
    expect(ally).toBeDefined();
    expect(a.state.encounterSetAside.map((i) => codeOf(a.state, i))).not.toContain("55066");
    expect(a.state.victoryDisplay.map((i) => codeOf(a.state, i))).toContain("55059");
    const kiss = attached(a.state, me(), "55013")!;
    act(a, {}, use(P1, kiss, "55013.kiss-of-temptation-forced-action"), use(P1, gaze(), TRANCE_ACTION["55010a"]));
    villainPhase(a, [BLANK, BLANK]);
  });

  it("round 8: stage I is defeated; stage II puts the set-aside Future of Despair into play with 2 + 3 threat and does not reveal it; Enchantress cannot be hurt until the ally thwarts it away", () => {
    heal(a);
    setThreat(a, 0);
    nearDefeat(a);
    const threat = mainThreat(a.state);
    const events = act(a, {}, attack(a.state, villainOf(a.state)));
    expect(a.state.villains[0]!.stageIndex).toBe(1);
    const despair = inPlay(a.state, "55006")!;
    expect(despair).toBeDefined();
    expect(inst(a.state, despair).threat).toBe(5);
    expect(a.state.encounterSetAside.map((i) => codeOf(a.state, i))).not.toContain("55006");
    // Put into play, not revealed (owner decision 56 A): its When Revealed (a charm counter on each Enchantment card,
    // which for an Enthralled hero would be threat on the main scheme) did not resolve.
    expect(types(events, "counterAdded").filter((e) => e.counterType === "charm")).toEqual([]);
    expect(mainThreat(a.state)).toBe(threat);
    expect(types(events, "encounterCardRevealed").map((e) => e.cardId as string)).not.toContain("55006");
    expect(hasKeyword(a.state, villainOf(a.state), "stalwart", DEPS)).toBe(true);
    expect(
      rejection(
        a.state,
        attack(
          a.state,
          villainOf(a.state),
          playerOf(a.state, P1).playArea.find((i) => codeOf(a.state, i) === "55066"),
        ),
      ),
    ).not.toBeNull();
    // The Zzzax ally thwarts the last of it away (threat set to 1 so one thwart does it).
    stage(a, (s) => patchInstance(s, despair, { threat: 1 }));
    const ally = playerOf(a.state, P1).playArea.find((i) => codeOf(a.state, i) === "55066")!;
    act(a, {}, thwart(a.state, despair, ally));
    expect(inPlay(a.state, "55006")).toBeUndefined();
    expect(hasKeyword(a.state, villainOf(a.state), "stalwart", DEPS)).toBe(false);
    const kiss = attached(a.state, me(), "55013")!;
    act(a, {}, use(P1, kiss, "55013.kiss-of-temptation-forced-action"), use(P1, gaze(), TRANCE_ACTION["55010a"]));
    villainPhase(a, [BLANK, BLANK]);
    expectHidden(a, ["55010a"]);
  });

  it("round 9: stage II is defeated and the game is won", () => {
    heal(a);
    setThreat(a, 0);
    nearDefeat(a);
    expect(a.state.outcome).toBeNull();
    act(a, {}, attack(a.state, villainOf(a.state)));
    expect(a.state.outcome).toMatchObject({ result: "win" });
    expectInvariants(a);
  });

  it("replay: the game again from its first op ends in the same state", () => {
    expect(replayOf(a, () => open([SPIDER_MAN]))).toEqual(a.state);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Game B: two losses (solo, standard): the main scheme completed at 2B, and the hero defeated
// ---------------------------------------------------------------------------------------------------------------

describe("Enchantress, game B1: solo, standard, lost to Sovereign Sorceress (2B)", () => {
  const b = open([SPIDER_MAN]);
  const me = () => identityOf(b.state);

  it("stage 1B completes in the villain phase: 2A searches the encounter deck for the Crown and reveals it onto Enchantress", () => {
    act(b, {}, toHero());
    expect(inPlay(b.state, "55016")).toBeUndefined();
    setThreat(b, 6 - 1);
    const events = villainPhase(b, [BLANK, BLANK]);
    expect(b.state.mainScheme.stageIndex).toBe(1);
    expect(codeOf(b.state, mainOf(b.state))).toBe("55004a");
    const crown = inPlay(b.state, "55016")!;
    expect(crown).toBeDefined();
    expect(inst(b.state, crown).attachedTo).toBe(villainOf(b.state));
    // Nobody is stunned by the stage: the Crown was not in play when it was revealed.
    expect(types(events, "statusGiven").filter((e) => e.status === "stunned")).toEqual([]);
    expect(b.state.outcome).toBeNull();
    expect(has(b.state, me(), "DEFIANT")).toBe(true);
    expectHidden(b);
  });

  it("2B completes: the game is lost, with the Gaze still hidden", () => {
    heal(b);
    setThreat(b, 8);
    // 2A's search shuffled the deck, so a Temptation may have been dealt: its Forced Action is owed first.
    payForcedActions(b);
    villainPhase(b, [BLANK, BLANK]);
    expect(b.state.outcome).toEqual({ result: "loss", reason: "mainSchemeCompleted" });
    expectHidden(b);
    expectInvariants(b);
  });

  it("replay: the game again from its first op ends in the same state", () => {
    expect(replayOf(b, () => open([SPIDER_MAN]))).toEqual(b.state);
  });
});

describe("Enchantress, game B2: solo, standard, lost with the hero defeated", () => {
  const c = open([SPIDER_MAN]);

  it("Enchantress's attack on a hero one damage from defeat defeats it, and the game is lost", () => {
    act(c, {}, toHero());
    stage(c, (s) => patchInstance(s, identityOf(s), { damage: 99 }));
    const events = villainPhase(c, [BLANK, BLANK]);
    expect(types(events, "characterDefeated").map((e) => e.instanceId)).toContain(identityOf(c.state));
    expect(c.state.outcome).toEqual({ result: "loss", reason: "allPlayersDefeated" });
    expectHidden(c);
  });

  it("replay: the game again from its first op ends in the same state", () => {
    expect(replayOf(c, () => open([SPIDER_MAN]))).toEqual(c.state);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Game C: solo, expert, to a win; what differs from standard is read against a standard game of the same seed
// ---------------------------------------------------------------------------------------------------------------

describe("Enchantress, game C: solo (Spider-Man), expert, seed 1, played to a win", () => {
  const e = open([SPIDER_MAN], "expert");
  /** The same opening in standard mode, to read what the mode changes. */
  const std = open([SPIDER_MAN], "standard");
  const gazeOf = (sim: Sim) => heldGaze(sim.state);
  const me = () => identityOf(e.state);
  /** The villain phase, after any Forced Action the game owes (Crown and counters flip the Gaze on the way). */
  const endRound = (sim: Sim) => {
    payForcedActions(sim);
    return villainPhase(sim, [BLANK, BLANK]);
  };

  it("opening (RRG 1.8 p. 28, Enchantress II and III): the villain starts on stage II with 16 hit points and no Future of Despair; the Gaze is dealt as in standard", () => {
    expect(e.state.villains[0]!.stageIndex).toBe(1);
    expect(maxHitPoints(e.state, villainOf(e.state), DEPS)).toBe(16);
    expect(std.state.villains[0]!.stageIndex).toBe(0);
    expect(inPlay(e.state, "55006")).toBeUndefined();
    expect(e.state.encounterSetAside.map((i) => codeOf(e.state, i))).toContain("55006");
    // Seed 1 deals the Gaze of Wrath in expert mode; the mode's setup draws differ from standard's.
    expect(gazeOf(e)).toBe("55011a");
    expect(hasKeyword(e.state, villainOf(e.state), "stalwart", DEPS)).toBe(false);
    expectHidden(e);
  });

  it("the Crown of the Enchantress gives Enchantress stalwart in expert mode only", () => {
    act(e, {}, toHero());
    act(std, {}, toHero());
    villainPhase(e, [BLANK, "55016"]);
    villainPhase(std, [BLANK, "55016"]);
    expect(inst(e.state, inPlay(e.state, "55016")!).attachedTo).toBe(villainOf(e.state));
    expect(hasKeyword(e.state, villainOf(e.state), "stalwart", DEPS)).toBe(true);
    expect(hasKeyword(std.state, villainOf(std.state), "stalwart", DEPS)).toBe(false);
    expectHidden(e);
  });

  it("stage II is defeated: stage III puts Future of Despair into play with 2 + 4 = 6 threat; thwarted away, stage III is defeated and the game is won", () => {
    heal(e);
    nearDefeat(e);
    const events = act(e, {}, attack(e.state, villainOf(e.state)));
    expect(e.state.villains[0]!.stageIndex).toBe(2);
    expect(maxHitPoints(e.state, villainOf(e.state), DEPS)).toBe(18);
    const despair = inPlay(e.state, "55006")!;
    expect(inst(e.state, despair).threat).toBe(6);
    expect(types(events, "encounterCardRevealed").map((x) => x.cardId as string)).not.toContain("55006");
    expect(hasKeyword(e.state, villainOf(e.state), "stalwart", DEPS)).toBe(true);
    // Stage III's scheme with Advance places 5 threat, which completes stage 1 (test surgery sets the threat to 0 first
    // so it does not also finish stage 2): Sovereign Sorceress 2A, with the Crown in play, stuns each identity.
    setThreat(e, 0);
    const turn = endRound(e);
    expect(e.state.mainScheme.stageIndex).toBe(1);
    expect(types(turn, "statusGiven").filter((x) => x.status === "stunned")).toHaveLength(1);
    expect(statusOf(e.state, me(), "stunned")).toBe(1);
    // The stun is not a reason to keep the Future of Despair: the hero thwarts it away, and the stage falls a round on.
    heal(e);
    setThreat(e, 0);
    stage(e, (s) => patchInstance(s, despair, { threat: 1 }));
    act(e, {}, thwart(e.state, despair));
    expect(inPlay(e.state, "55006")).toBeUndefined();
    setThreat(e, 0);
    endRound(e);
    heal(e);
    setThreat(e, 0);
    nearDefeat(e);
    // The stunned hero's attack only removes the stun status; the villain is not hurt.
    act(e, {}, attack(e.state, villainOf(e.state)));
    expect(statusOf(e.state, me(), "stunned")).toBe(0);
    expect(e.state.outcome).toBeNull();
    setThreat(e, 0);
    endRound(e);
    heal(e);
    nearDefeat(e);
    act(e, {}, attack(e.state, villainOf(e.state)));
    expect(e.state.outcome).toMatchObject({ result: "win" });
    expectInvariants(e);
  });

  it("replay: the expert game again from its first op ends in the same state", () => {
    expect(replayOf(e, () => open([SPIDER_MAN], "expert"))).toEqual(e.state);
  });

  it("replay: the standard game beside it ends in the same state", () => {
    expect(replayOf(std, () => open([SPIDER_MAN], "standard"))).toEqual(std.state);
  });
});

describe("Enchantress, game C2: the cards that read the mode, each in an expert game and a standard one beside it", () => {
  /** One round of each mode with `deck` stacked: the hero in hero form, healed. */
  function pair(deck: readonly string[], plan: Plan = {}) {
    const games = (["expert", "standard"] as const).map((mode) => {
      const sim = open([SPIDER_MAN], mode);
      act(sim, {}, toHero());
      const events = villainPhase(sim, deck, plan);
      return { mode, sim, events };
    });
    return { expert: games[0]!, standard: games[1]! };
  }
  const replays = (g: ReturnType<typeof pair>["expert"]) =>
    expect(replayOf(g.sim, () => open([SPIDER_MAN], g.mode))).toEqual(g.sim.state);

  it("Ulik has toughness in expert mode only", () => {
    const { expert, standard } = pair([BLANK, "55020"]);
    expect(hasKeyword(expert.sim.state, inPlay(expert.sim.state, "55020")!, "toughness", DEPS)).toBe(true);
    expect(hasKeyword(standard.sim.state, inPlay(standard.sim.state, "55020")!, "toughness", DEPS)).toBe(false);
    replays(expert);
    replays(standard);
  });

  it("Puppet Master has hinder 1 per hero in expert mode only", () => {
    const { expert, standard } = pair([BLANK, "55061"]);
    expect(keywordTotal(expert.sim.state, inPlay(expert.sim.state, "55061")!, "hinder", DEPS)).toBe(1);
    expect(keywordTotal(standard.sim.state, inPlay(standard.sim.state, "55061")!, "hinder", DEPS)).toBe(0);
    replays(expert);
    replays(standard);
  });

  it("Spell Blast: a Defiant hero chooses Enchantress's attack, which has +1 ATK in expert mode only; the other option, her scheme, has +1 SCH", () => {
    const attackOf = (g: ReturnType<typeof pair>["expert"]) =>
      types(g.events, "attackResolved")
        .filter((x) => codeOf(g.sim.state, x.enemyInstanceId) === ENCHANTRESS_I)
        .map((x) => x.baseAtk);
    const { expert, standard } = pair([BLANK, "55025"], { options: ["Enchantress attacks you"] });
    for (const g of [expert, standard]) expect(attackOf(g)).toHaveLength(2);
    expect(attackOf(expert)[1]! - attackOf(expert)[0]!).toBe(1);
    expect(attackOf(standard)[1]! - attackOf(standard)[0]!).toBe(0);
    replays(expert);
    replays(standard);
    const schemeOf = (g: ReturnType<typeof pair>["expert"]) =>
      types(g.events, "schemeResolved")
        .filter((x) => codeOf(g.sim.state, x.enemyInstanceId) === ENCHANTRESS_I)
        .map((x) => x.baseSch);
    const schemes = pair([BLANK, "55025"], { options: ["Enchantress schemes"] });
    expect(schemeOf(schemes.expert)[0]! - schemeOf(schemes.standard)[0]!).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Game D: two players (Spider-Man, Iron Man), standard, a Gaze flipped for each, first-player passing
// ---------------------------------------------------------------------------------------------------------------

describe("Enchantress, game D: two players, standard, seed 1: a Gaze flipped for each player", () => {
  const d = open([SPIDER_MAN, IRON_MAN]);
  const firstPlayers: PlayerId[] = [];
  const gaze = (p: PlayerId) => gazeOn(d.state, p);
  const me = (p: PlayerId) => identityOf(d.state, p);
  /** The villain phase's deck: each player's boost card, then each player's dealt card, in first-player order. */
  const deckFor = (boosts: Readonly<Record<string, string>>, deals: Readonly<Record<string, string>>): string[] => {
    const first = d.state.firstPlayerId;
    const turnOrder = [first, ...d.players.filter((p) => p !== first)];
    return [...turnOrder.map((p) => boosts[p]!), ...turnOrder.map((p) => deals[p]!)];
  };
  const healBoth = () => d.players.forEach((p) => heal(d, p));

  it("setup: each hero has a different Gaze with its reverse hidden; the other three are set aside; the first player is p1", () => {
    expect(heldGaze(d.state, P1)).toBe("55009a");
    expect(heldGaze(d.state, P2)).toBe("55010a");
    for (const p of d.players) expect(inst(d.state, gaze(p)).reverseHidden).toBe(true);
    const aside = d.state.encounterSetAside.map((i) => codeOf(d.state, i));
    expect(aside.filter((c) => (GAZES as readonly string[]).includes(c)).sort()).toEqual([
      "55007a",
      "55008a",
      "55011a",
    ]);
    expect(d.state.firstPlayerId).toBe(P1);
    firstPlayers.push(d.state.firstPlayerId);
    expect(mainThreat(d.state)).toBe(2); // 1 per hero
    expectHidden(d);
  });

  it("round 1: each hero's turn, then Enchantress attacks both; each Enchantment card gets only its own counters; the first player passes to p2", () => {
    act(d, {}, toHero(P1), endTurn(P1), toHero(P2));
    healBoth();
    const events = villainPhase(d, deckFor({ p1: "55021", p2: BLANK }, { p1: "55013", p2: SPELLBOUND }));
    // p1: the boost card's counter and the attack's; p2: the attack's.
    expect(charm(d.state, gaze(P1))).toBe(2);
    expect(charm(d.state, gaze(P2))).toBe(1);
    expect(types(events, "attackResolved").map((e) => e.targetInstanceId)).toEqual([me(P1), me(P2)]);
    expect(attached(d.state, me(P1), "55013")).toBeDefined();
    expect(d.state.firstPlayerId).toBe(P2);
    firstPlayers.push(d.state.firstPlayerId);
    expectHidden(d);
  });

  it("round 2: p2 acts first; p1's Kiss and two boosting Law of Attraction cards bring p1's Gaze to its fifth counter, which flips in the villain phase; p2's does not", () => {
    expect(d.state.step).toMatchObject({ phase: "player", activePlayerId: P2 });
    // p2 has nothing owed; p1's Kiss is owed before p1 may end the turn.
    act(d, {}, endTurn(P2));
    const kiss = attached(d.state, me(P1), "55013")!;
    expect(rejection(d.state, endTurn(P1))).not.toBeNull();
    act(d, {}, use(P1, kiss, "55013.kiss-of-temptation-forced-action"));
    expect(charm(d.state, gaze(P1))).toBe(3);
    healBoth();
    const events = villainPhase(d, deckFor({ p1: "55021", p2: "55021" }, { p1: "55023", p2: "55024" }), {
      options: ["You are stunned", "Search for a minion"],
      cards: ["Enthralled Lackey", "Spellbound"],
    });
    // p1's Gaze flipped to the Trance of Pride; p2's is untouched and still sealed.
    expect(inst(d.state, gaze(P1)).flipped).toBe(true);
    expect(types(events, "cardFlipped").map((e) => e.instanceId)).toEqual([gaze(P1)]);
    expect(has(d.state, me(P1), "ENTHRALLED")).toBe(true);
    expect(has(d.state, me(P2), "DEFIANT")).toBe(true);
    expect(inst(d.state, gaze(P2)).flipped).toBeFalsy();
    expect(inst(d.state, gaze(P2)).reverseHidden).toBe(true);
    expectHidden(d, ["55009a"]);
    firstPlayers.push(d.state.firstPlayerId);
    expect(d.state.firstPlayerId).toBe(P1);
  });

  it("round 2 (cont.): p1, now Enthralled, did both of Do My Bidding's searches; p2, still Defiant, chose one of Magical Restraints", () => {
    const revealed = types(d.log, "encounterCardRevealed").map((e) => [e.cardId as string, e.playerId] as const);
    const kind = (code: string) => [...CORE_CARDS, ...TT_CARDS].find((c) => (c.id as string) === code)?.type;
    // (The flip of p1's Gaze is a reveal too, of the card the table already knows by its front's id.)
    const p1Reveals = revealed.filter(([c, p]) => p === P1 && c !== "55009a").map(([c]) => c);
    // Kiss (round 1), Do My Bidding, then both of its searches: a minion and a side scheme, all revealed for p1.
    expect(p1Reveals).toHaveLength(4);
    expect(p1Reveals.slice(0, 2)).toEqual(["55013", "55023"]);
    expect(p1Reveals.slice(2).map(kind).sort()).toEqual(["minion", "side_scheme"]);
    // Magical Restraints for the Defiant p2: one option (stunned + a charm counter), not both.
    expect(statusOf(d.state, me(P2), "stunned")).toBe(1);
    expect(statusOf(d.state, me(P2), "confused")).toBe(0);
    expect(charm(d.state, gaze(P2))).toBe(4);
    expect(inst(d.state, gaze(P2)).flipped).toBeFalsy();
    expectHidden(d, ["55009a"]);
  });

  it("round 3: p1's Trance of Pride is owed (p2 owes nothing, its Gaze is sealed); Enchantress's attack on p2 places the fifth counter and p2's Gaze flips", () => {
    expect(d.state.firstPlayerId).toBe(P1);
    expect(d.state.step).toMatchObject({ phase: "player", activePlayerId: P1 });
    // p1: the Kiss (its counter is threat now) and the flipped Trance; End Turn is refused until both are used.
    expect(rejection(d.state, endTurn(P1))).not.toBeNull();
    const kiss = attached(d.state, me(P1), "55013")!;
    const kissEvents = act(d, {}, use(P1, kiss, "55013.kiss-of-temptation-forced-action"));
    expect(types(kissEvents, "threatPlaced").map((e) => e.amount)).toEqual([1]);
    expect(rejection(d.state, endTurn(P1))).not.toBeNull();
    // Pride: 1 threat on the main scheme, then 2 threat removed from a side scheme (the one the search revealed).
    const pride = act(d, {}, use(P1, gaze(P1), TRANCE_ACTION["55009a"]));
    expect(types(pride, "threatPlaced").map((e) => e.amount)).toEqual([1]);
    expect(types(pride, "threatRemoved").map((e) => e.amount)).toEqual([2]);
    expect(inst(d.state, gaze(P1)).exhausted).toBe(true);
    act(d, {}, endTurn(P1));
    // p2 (stunned, Defiant, sealed Gaze) has no Forced Action and may end the turn at once.
    expect(rejection(d.state, endTurn(P2))).toBeNull();
    expectHidden(d, ["55009a"]);
    healBoth();
    const events = villainPhase(d, [BLANK, BLANK, ONE_ICON, "55060", "55061"]);
    expect(inst(d.state, gaze(P2)).flipped).toBe(true);
    expect(types(events, "cardFlipped").map((e) => e.instanceId)).toEqual([gaze(P2)]);
    expect(has(d.state, me(P2), "ENTHRALLED")).toBe(true);
    expect(has(d.state, me(P1), "ENTHRALLED")).toBe(true);
    expect(charm(d.state, gaze(P2))).toBe(0);
    // Trance of Sloth: p2 was already stunned, so 2 threat on the main scheme instead of a second status card.
    expect(statusOf(d.state, me(P2), "stunned")).toBe(1);
    expect(
      types(events, "threatPlaced")
        .filter((e) => e.sourceInstanceId === gaze(P2))
        .map((e) => e.amount),
    ).toEqual([2]);
    expect(types(events, "statusGiven").filter((e) => e.instanceId === me(P2))).toEqual([]);
    firstPlayers.push(d.state.firstPlayerId);
    expectHidden(d, ["55009a", "55010a"]);
  });

  it("round 4: each Trance's Forced Action is owed again, in first-player order (p2 first); both Enthralled players' counters are now threat", () => {
    expect(d.state.firstPlayerId).toBe(P2);
    expect(d.state.step).toMatchObject({ phase: "player", activePlayerId: P2 });
    expect(inst(d.state, gaze(P1)).exhausted).toBeFalsy();
    expect(inst(d.state, gaze(P2)).exhausted).toBeFalsy();
    expect(rejection(d.state, endTurn(P2))).not.toBeNull();
    act(d, {}, use(P2, gaze(P2), TRANCE_ACTION["55010a"]), endTurn(P2));
    expect(rejection(d.state, endTurn(P1))).not.toBeNull();
    act(d, {}, use(P1, attached(d.state, me(P1), "55013")!, "55013.kiss-of-temptation-forced-action"));
    expect(rejection(d.state, endTurn(P1))).not.toBeNull();
    act(d, {}, use(P1, gaze(P1), TRANCE_ACTION["55009a"]));
    // Round 3's boost cards may have attached a second Temptation to p1: it is owed too.
    payForcedActions(d, {}, P1);
    expect(rejection(d.state, endTurn(P1))).toBeNull();
    // Each player owed their own Trance's action and nothing of the other's.
    healBoth();
    const counters = types(d.log, "counterAdded").filter((e) => e.counterType === "charm").length;
    // The cards dealt are the deck's own: the quiet side schemes are all in play by now.
    const events = villainPhase(d, [BLANK, BLANK, ONE_ICON]);
    expect(types(events, "attackResolved").length).toBeGreaterThanOrEqual(2);
    // Defiant no more, neither Gaze takes a counter: it is threat (Prime Real Estate).
    expect(types(d.log, "counterAdded").filter((e) => e.counterType === "charm").length).toBe(counters);
    expect(charm(d.state, gaze(P1))).toBe(0);
    expect(charm(d.state, gaze(P2))).toBe(0);
    firstPlayers.push(d.state.firstPlayerId);
    // The first player token went p1, p2, p1, p2 and then p1 again.
    expect(firstPlayers).toEqual([P1, P2, P1, P2, P1]);
    expectHidden(d, ["55009a", "55010a"]);
    expectInvariants(d);
  });

  it("replay: the game again from its first op ends in the same state", () => {
    expect(replayOf(d, () => open([SPIDER_MAN, IRON_MAN]))).toEqual(d.state);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Game E: two players at the table, standard and expert: Future of Despair per hero, the Crown, a linked ally
// ---------------------------------------------------------------------------------------------------------------

describe("Enchantress, game E: two players (Spider-Man, Iron Man), standard, seed 1", () => {
  const f = open([SPIDER_MAN, IRON_MAN]);
  const me = (p: PlayerId) => identityOf(f.state, p);

  it("round 1: both heroes in hero form; a Trickster Magic minion (Titania) is dealt to p1 and the Crown is dealt to p2 onto Enchantress", () => {
    act(f, {}, toHero(P1), endTurn(P1), toHero(P2));
    const events = villainPhase(f, [BLANK, BLANK, "55057", "55016"]);
    const titania = inPlay(f.state, "55057")!;
    expect(titania).toBeDefined();
    expect(inst(f.state, titania).engagedWith).toBe(P1);
    expect(inst(f.state, inPlay(f.state, "55016")!).attachedTo).toBe(villainOf(f.state));
    expect(types(events, "encounterCardRevealed").map((e) => [e.cardId as string, e.playerId])).toEqual(
      expect.arrayContaining([
        ["55057", P1],
        ["55016", P2],
      ]),
    );
    expectHidden(f);
  });

  it("round 2: the Crown's cost is every player's: unusable while p2's tough status would absorb the damage; otherwise both exhaust and take 1", () => {
    expect(f.state.step).toMatchObject({ phase: "player", activePlayerId: P2 });
    act(f, {}, endTurn(P2));
    payForcedActions(f, {}, P1);
    const crown = inPlay(f.state, "55016")!;
    const toughP2 = patchInstance(f.state, me(P2), { statuses: { ...inst(f.state, me(P2)).statuses, tough: 1 } });
    expect(rejection(toughP2, use(P1, crown, "55016.crown-of-the-enchantress-action"))).not.toBeNull();
    const damage = [P1, P2].map((p) => inst(f.state, me(p)).damage);
    act(f, {}, use(P1, crown, "55016.crown-of-the-enchantress-action"));
    [P1, P2].forEach((p, i) => {
      expect(inst(f.state, me(p)).exhausted).toBe(true);
      expect(inst(f.state, me(p)).damage).toBe(damage[i]! + 1);
    });
    expect(inPlay(f.state, "55016")).toBeUndefined();
    villainPhase(f, [BLANK, BLANK, "55060", "55061"]);
  });

  it("round 3: p1 defeats stage I; Future of Despair comes into play with (2 + 3) x 2 = 10 threat", () => {
    expect(f.state.step).toMatchObject({ phase: "player", activePlayerId: P1 });
    setThreat(f, 0);
    payForcedActions(f, {}, P1);
    nearDefeat(f);
    act(f, {}, attack(f.state, villainOf(f.state), undefined, P1));
    expect(f.state.villains[0]!.stageIndex).toBe(1);
    expect(inst(f.state, inPlay(f.state, "55006")!).threat).toBe(10);
    act(f, {}, endTurn(P1));
  });

  it("round 3 (p2): p2 defeats the Titania engaged with p1; p2, not p1, puts the Titania ally into play", () => {
    expect(f.state.step).toMatchObject({ phase: "player", activePlayerId: P2 });
    heal(f, P1);
    heal(f, P2);
    payForcedActions(f, {}, P2);
    const titania = inPlay(f.state, "55057")!;
    stage(f, (s) => patchInstance(s, titania, { damage: maxHitPoints(s, titania, DEPS)! - 1 }));
    act(f, {}, attack(f.state, titania, undefined, P2));
    expect(playerOf(f.state, P2).playArea.map((i) => codeOf(f.state, i))).toContain("55064");
    expect(playerOf(f.state, P1).playArea.map((i) => codeOf(f.state, i))).not.toContain("55064");
    expect(f.state.encounterSetAside.map((i) => codeOf(f.state, i))).not.toContain("55064");
    act(f, {}, endTurn(P2));
    expectInvariants(f);
  });

  it("replay: the game again from its first op ends in the same state", () => {
    expect(replayOf(f, () => open([SPIDER_MAN, IRON_MAN]))).toEqual(f.state);
  });
});

describe("Enchantress, game E2: two players, expert, seed 1: Future of Despair at (2 + 4) x 2 = 12", () => {
  const g = open([SPIDER_MAN, IRON_MAN], "expert");

  it("stage II is defeated and stage III puts Future of Despair into play with 12 threat; the villain is stalwart and cannot be hurt", () => {
    expect(g.state.villains[0]!.stageIndex).toBe(1);
    expect(maxHitPoints(g.state, villainOf(g.state), DEPS)).toBe(32);
    act(g, {}, toHero(P1), endTurn(P1), toHero(P2));
    nearDefeat(g);
    act(g, {}, attack(g.state, villainOf(g.state), undefined, P2));
    expect(g.state.villains[0]!.stageIndex).toBe(2);
    expect(inst(g.state, inPlay(g.state, "55006")!).threat).toBe(12);
    expect(hasKeyword(g.state, villainOf(g.state), "stalwart", DEPS)).toBe(true);
    expect(rejection(g.state, attack(g.state, villainOf(g.state), undefined, P1))).not.toBeNull();
    expectHidden(g);
  });

  it("replay: the game again from its first op ends in the same state", () => {
    expect(replayOf(g, () => open([SPIDER_MAN, IRON_MAN], "expert"))).toEqual(g.state);
  });
});
