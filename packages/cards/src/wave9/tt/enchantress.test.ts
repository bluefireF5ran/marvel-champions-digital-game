import { CORE_CARDS, TT_CARDS } from "@mc/content";
import {
  applyCommand,
  createGame,
  cardsInPlay,
  hasKeyword,
  maxHitPoints,
  otherFaceVisible,
  sealHiddenInformation,
  traitsOf,
  type EngineDeps,
  type GameEvent,
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
  applyOk,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  patchInstance,
  play,
  playerOf,
  moveToHand,
  payWith,
  putOnTopOfDeck,
  settle,
  use,
  type Picker,
} from "../../testing/harness.js";
import { WAVE8_ABILITIES } from "../../wave8/index.js";
import { wave9Scenario } from "../setup.js";
import { CAPTAIN_MARVEL, IRON_MAN, SPIDER_MAN, codeOf, heroForm, onlyDeck } from "../testing.js";
import { ENCHANTRESS, ENCHANTRESS_SKIPPED } from "./enchantress.js";

vi.setConfig({ testTimeout: 300_000 });

/**
 * The frame of the Enchantress scenario: the villain 55001 to 55003, both main schemes (55004, 55005), Future of Despair
 * 55006 and the five Hypnotic Gazes with their Trance reverse sides 55007 to 55011 (docs/phase7-wave9.md sections 2.8,
 * 3.53 to 3.55 and 8.4 item 66). The real scenario (`wave9Scenario("enchantress")`) with real turns and real prompts.
 *
 * **Trickster Magic** is the scenario's required modular set and is unscripted: every game here replaces the encounter
 * deck with `onlyDeck(...)` (Standard set fillers only), so no Trickster Magic card is ever revealed. Its four linked
 * allies stay set aside as the scenario builder leaves them.
 */
const DEPS: EngineDeps = { abilities: mergeRegistries(WAVE8_ABILITIES, ENCHANTRESS) };

const GAZES = ["55007a", "55008a", "55009a", "55010a", "55011a"] as const;
type Gaze = (typeof GAZES)[number];
const TRANCE_OF: Readonly<Record<Gaze, string>> = {
  "55007a": "Trance of Envy",
  "55008a": "Trance of Greed",
  "55009a": "Trance of Pride",
  "55010a": "Trance of Sloth",
  "55011a": "Trance of Wrath",
};
const FORCED_ACTION_OF: Readonly<Record<Gaze, string>> = {
  "55007a": "55007b.trance-of-envy-forced-action",
  "55008a": "55008b.trance-of-greed-forced-action",
  "55009a": "55009b.trance-of-pride-forced-action",
  "55010a": "55010b.trance-of-sloth-forced-action",
  "55011a": "55011b.trance-of-wrath-forced-action",
};
/** Every id or name that would give away which Trance is under a Gaze. */
const SECRETS = [
  ...GAZES.map((g) => `${g.slice(0, -1)}b`),
  ...Object.values(TRANCE_OF),
  ...Object.values(FORCED_ACTION_OF),
];

const REFS = [
  "55001.enchantress-forced-response",
  "55002.enchantress-forced-response",
  "55002.when-revealed",
  "55003.enchantress-forced-response",
  "55003.when-revealed",
  "55004a.setup",
  "55004b.prime-real-estate-forced-interrupt",
  "55005a.when-revealed",
  "55005b.sovereign-sorceress-forced-interrupt",
  "55006.future-of-despair-constant",
  "55006.when-revealed",
  "55007a.hypnotic-gaze-constant",
  "55007a.hypnotic-gaze-constant-2",
  "55008a.hypnotic-gaze-constant",
  "55008a.hypnotic-gaze-constant-2",
  "55009a.hypnotic-gaze-constant",
  "55009a.hypnotic-gaze-constant-2",
  "55010a.hypnotic-gaze-constant",
  "55010a.hypnotic-gaze-constant-2",
  "55011a.hypnotic-gaze-constant",
  "55011a.hypnotic-gaze-constant-2",
  "55007b.trance-of-envy-constant",
  "55007b.when-revealed",
  "55007b.trance-of-envy-forced-action",
  "55008b.trance-of-greed-constant",
  "55008b.when-revealed",
  "55008b.trance-of-greed-forced-action",
  "55009b.trance-of-pride-constant",
  "55009b.when-revealed",
  "55009b.trance-of-pride-forced-action",
  "55010b.trance-of-sloth-constant",
  "55010b.when-revealed",
  "55010b.trance-of-sloth-forced-action",
  "55011b.trance-of-wrath-constant",
  "55011b.when-revealed",
  "55011b.trance-of-wrath-forced-action",
];

interface Sim {
  state: GameState;
  events: GameEvent[];
}

function open(
  players: readonly (typeof SPIDER_MAN | typeof IRON_MAN | typeof CAPTAIN_MARVEL)[] = [SPIDER_MAN],
  opts: { readonly difficulty?: "standard" | "expert"; readonly seed?: number } = {},
): Sim & { created: readonly GameEvent[] } {
  const config = wave9Scenario("enchantress", {
    players,
    seed: opts.seed ?? 1,
    difficulty: opts.difficulty ?? "standard",
  });
  const created = createGame(config, DEPS);
  if (!created.ok) throw new Error(created.error.message);
  const state = settle(created.state, firstLegal, (s) => s.step.phase === "player", DEPS);
  return {
    state: heroForm(state, ...players.map((_, i) => `p${i + 1}` as PlayerId)),
    events: [],
    created: created.events,
  };
}

/** The Standard-set fillers, top first: no Trickster Magic or unscripted Enchantress card is in the deck. */
const stack = (sim: Sim, ...codes: string[]): void => {
  sim.state = onlyDeck(sim.state, ...codes);
};
/**
 * Standard-set fillers, top first, for a one-player round. The attack's boost card is Advance (01186, no boost icon);
 * the encounter card dealt is the second Advance ("The villain schemes", a quiet card: no attack, so no extra charm
 * counter), whose scheme boost is Caught Off Guard (one icon); the rest are Trance of Wrath's top 5.
 */
const PAD = ["01186", "01186", "01188", "01187", "01187", "01189", "01190", "01165"] as const;

const gazeOn = (s: GameState, player: PlayerId = P1): InstanceId => {
  const [gaze] = inst(s, identityOf(s, player)).attachments;
  if (!gaze) throw new Error(`${player} has no Hypnotic Gaze`);
  return gaze;
};
const charm = (s: GameState, id: InstanceId): number => inst(s, id).counters["charm"] ?? 0;
const villainOf = (s: GameState): InstanceId => s.villains[0]!.instanceId;

/** Swaps which Hypnotic Gaze the player holds (test surgery: the deal is random), keeping the other card set aside. */
function withGaze(s: GameState, player: PlayerId, code: Gaze): GameState {
  const held = gazeOn(s, player);
  if (codeOf(s, held) === code) return s;
  const other = Object.values(s.instances).find((i) => (i.cardId as string) === code)!;
  const heldCard = inst(s, held).cardId;
  return patchInstance(patchInstance(s, other.instanceId, { cardId: heldCard }), held, { cardId: other.cardId });
}

const withCharm = (s: GameState, id: InstanceId, n: number): GameState =>
  patchInstance(s, id, { counters: { charm: n } });

/** Answers every prompt by `pick` until the next player phase or the end of the game. */
function toNextPlayerPhase(sim: Sim, pick: Picker = firstLegal, players: readonly PlayerId[] = [P1]): void {
  const take = (result: { readonly state: GameState; readonly events: readonly GameEvent[] }) => {
    sim.state = result.state;
    sim.events.push(...result.events);
  };
  for (const p of players) take(applyOk(sim.state, endTurn(p), DEPS));
  for (let guard = 0; sim.state.pendingChoice && !sim.state.outcome; guard++) {
    if (guard > 300) throw new Error("choices did not settle");
    const choice = sim.state.pendingChoice;
    take(
      applyOk(
        sim.state,
        {
          type: "resolveChoice",
          playerId: choice.playerId,
          choiceId: choice.choiceId,
          selectedOptionIds: pick(sim.state),
        },
        DEPS,
      ),
    );
  }
}

/** Runs a command and answers its prompts by `pick`. */
function run(sim: Sim, command: Parameters<typeof applyOk>[1], pick: Picker = firstLegal): void {
  const first = applyOk(sim.state, command, DEPS);
  sim.state = first.state;
  sim.events.push(...first.events);
  for (let guard = 0; sim.state.pendingChoice && !sim.state.outcome; guard++) {
    if (guard > 100) throw new Error("choices did not settle");
    const choice = sim.state.pendingChoice;
    const next = applyOk(
      sim.state,
      {
        type: "resolveChoice",
        playerId: choice.playerId,
        choiceId: choice.choiceId,
        selectedOptionIds: pick(sim.state),
      },
      DEPS,
    );
    sim.state = next.state;
    sim.events.push(...next.events);
  }
}

/** The Gaze takes the player's 5th charm counter from Enchantress's own attack: a real flip in the villain phase. */
function flipByAttack(sim: Sim, code: Gaze, pick: Picker = firstLegal): InstanceId {
  sim.state = withGaze(sim.state, P1, code);
  const gaze = gazeOn(sim.state);
  sim.state = withCharm(sim.state, gaze, 4);
  toNextPlayerPhase(sim, pick);
  return gaze;
}

const mentions = (value: unknown, needles: readonly string[]): readonly string[] => {
  const text = JSON.stringify(value);
  return needles.filter((needle) => text.includes(`"${needle}"`) || text.includes(needle));
};
const types = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
/**
 * The threat a card placed on schemes, from the events. (The main scheme's total is no measure: 6 threat completes
 * Prime Real Estate 1B and Sovereign Sorceress's own 2 per hero start the next stage.)
 */
const placedBy = (sim: Sim, source: InstanceId): number[] =>
  types(sim.events, "threatPlaced")
    .filter((e) => e.sourceInstanceId === source)
    .map((e) => e.amount);
const cardNameOf = (s: GameState, id: InstanceId): string | undefined =>
  CORE_CARDS.find((c) => (c.id as string) === codeOf(s, id))?.name;
const cardNames = (s: GameState, ids: readonly InstanceId[]): string[] => ids.map((id) => codeOf(s, id));

describe("registry", () => {
  it("registers the 33 refs of the frame, each a valid definition (the encounter cards are in enchantress-encounter.test.ts)", () => {
    const encounter = Array.from({ length: 15 }, (_, i) => String(55012 + i)).flatMap((code) =>
      abilityRefIds(TT_CARDS.find((c) => (c.id as string) === code) as never),
    );
    expect(
      Object.keys(ENCHANTRESS)
        .filter((id) => !encounter.includes(id))
        .sort(),
    ).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(ENCHANTRESS)) expect(validateDefinition(def), id).toEqual([]);
  });

  it("registers every ref the data names for 55001 to 55026 and skips none", () => {
    const all = [
      "55001",
      "55004a",
      "55006",
      ...GAZES,
      ...Array.from({ length: 15 }, (_, i) => String(55012 + i)),
    ].flatMap((code) => abilityRefIds(TT_CARDS.find((c) => (c.id as string) === code) as never));
    expect(all.filter((id) => !(id in ENCHANTRESS)).sort()).toEqual([]);
    expect(Object.keys(ENCHANTRESS_SKIPPED)).toEqual([]);
  });
});

describe("1A Setup (55004a)", () => {
  it("one player: Future of Despair set aside, one random Gaze attached with its reverse hidden, the other four aside", () => {
    const { state } = open();
    const aside = cardNames(state, state.encounterSetAside);
    expect(aside).toContain("55006");
    const gaze = gazeOn(state);
    expect(GAZES).toContain(codeOf(state, gaze));
    expect(inst(state, gaze).reverseHidden).toBe(true);
    expect(inst(state, gaze).faceup).toBe(true);
    expect(aside.filter((c) => (GAZES as readonly string[]).includes(c))).toHaveLength(4);
    const deck = Object.values(state.encounterDecks)[0]!.deck;
    expect(cardNames(state, deck)).not.toContain("55006");
    for (const g of GAZES) expect(cardNames(state, deck)).not.toContain(g);
    // "Your identity gains the Defiant trait."
    expect(traitsOf(state, identityOf(state), DEPS)).toContain("DEFIANT");
    expect(traitsOf(state, identityOf(state), DEPS)).not.toContain("ENTHRALLED");
  });

  it("three players: three different Gazes dealt in player order, two left aside, all five hidden", () => {
    const { state } = open([SPIDER_MAN, IRON_MAN, CAPTAIN_MARVEL]);
    const held = (["p1", "p2", "p3"] as PlayerId[]).map((p) => codeOf(state, gazeOn(state, p)));
    expect(new Set(held).size).toBe(3);
    const all = Object.values(state.instances).filter((i) => (GAZES as readonly string[]).includes(i.cardId as string));
    expect(all).toHaveLength(5);
    for (const i of all) {
      expect(i.reverseHidden).toBe(true);
      expect(otherFaceVisible(state, i.instanceId)).toBe(false);
    }
  });

  it("the same seed deals the same Gaze; another seed can deal another", () => {
    const heldBy = (seed: number) => {
      const { state } = open([SPIDER_MAN], { seed });
      return codeOf(state, gazeOn(state));
    };
    expect(heldBy(1)).toBe(heldBy(1));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(heldBy)).size).toBeGreaterThan(1);
  });

  it("nothing a player can see names the Trance under a Gaze: the sealed state and the events", () => {
    const { state, created } = open([SPIDER_MAN, IRON_MAN]);
    // The authority holds the pair's card ids (the front's, as for any double-sided card), never the reverse's.
    const { cardPool: _pool, rng: _rng, ...sealed } = sealHiddenInformation(state);
    expect(mentions(sealed, SECRETS)).toEqual([]);
    expect(mentions(created, SECRETS)).toEqual([]);
    // Every hidden Gaze reads as the same stand-in card, so which one a player holds is not shown either.
    const standIns = new Set(
      Object.values(sealed.instances)
        .filter((i) => i.reverseHidden)
        .map((i) => i.cardId as string),
    );
    expect(standIns.size).toBe(1);
    expect(created.some((e) => e.type === "reversesHidden")).toBe(true);
  });
});

describe("a Hypnotic Gaze flips at the fifth charm counter (55007a to 55011a)", () => {
  it.each(GAZES)(
    "%s: Enchantress's attack places the fifth counter, which removes them all and flips the card",
    (code) => {
      const sim = open();
      stack(sim, ...PAD);
      const gaze = flipByAttack(sim, code, (s) => {
        const choice = s.pendingChoice!;
        // Trance of Wrath asks which card to reveal; Trance of Envy has nothing to discard and mills 8.
        if (choice.prompt.kind === "chooseCards")
          return [choice.options.find((o) => o.label.includes("Advance"))?.optionId ?? choice.options[0]!.optionId];
        return firstLegal(s);
      });
      expect(charm(sim.state, gaze)).toBe(0);
      expect(inst(sim.state, gaze).flipped).toBe(true);
      expect(inst(sim.state, gaze).reverseHidden).toBeUndefined();
      expect(otherFaceVisible(sim.state, gaze)).toBe(true);
      // Flipped, the card is sealed no more: a client reads the Trance's card.
      expect(sealHiddenInformation(sim.state).instances[gaze]!.cardId).toBe(code);
      const traits = traitsOf(sim.state, identityOf(sim.state), DEPS);
      expect(traits).toContain("ENTHRALLED");
      expect(traits).not.toContain("DEFIANT");
      expect(types(sim.events, "cardFlipped")).toHaveLength(1);
    },
  );

  it("an unflipped Gaze at 4 counters holds them: Defiant keeps the counter and the main scheme only accelerates", () => {
    const sim = open();
    stack(sim, ...PAD);
    sim.state = withCharm(sim.state, gazeOn(sim.state), 2);
    toNextPlayerPhase(sim);
    expect(charm(sim.state, gazeOn(sim.state))).toBe(3);
    expect(inst(sim.state, gazeOn(sim.state)).flipped).toBeFalsy();
    expect(otherFaceVisible(sim.state, gazeOn(sim.state))).toBe(false);
  });

  it("the hidden reverse stays hidden in every event until the flip, and the flip's events name the Trance", () => {
    const sim = open([SPIDER_MAN, IRON_MAN]);
    stack(sim, ...PAD);
    // Player 2's Gaze is swapped to a known card; player 1's Gaze stays unflipped.
    sim.state = withGaze(sim.state, P2, "55009a");
    sim.state = withCharm(sim.state, gazeOn(sim.state, P2), 4);
    toNextPlayerPhase(sim, firstLegal, [P1, P2]);
    const other = gazeOn(sim.state, P1);
    expect(inst(sim.state, other).reverseHidden).toBe(true);
    const { cardPool: _pool, rng: _rng, ...sealed } = sealHiddenInformation(sim.state);
    // Player 2's Gaze flipped (Trance of Pride is open knowledge now); player 1's four unflipped ones are not, in the
    // state or in any event of the round (Pride's own When Revealed and ids may be named).
    const open9 = (secret: string) => !secret.includes("55009b") && secret !== "Trance of Pride";
    expect(mentions(sealed, SECRETS.filter(open9))).toEqual([]);
    expect(mentions(sim.events, SECRETS.filter(open9))).toEqual([]);
  });
});

describe("the Trances' When Revealed: 'X. Otherwise, Y'", () => {
  it("Envy: with no card to discard, the top 8 cards of the deck are discarded", () => {
    const sim = open();
    stack(sim, ...PAD);
    const deckBefore = playerOf(sim.state, P1).deck.length;
    flipByAttack(sim, "55007a");
    expect(playerOf(sim.state, P1).deck.length).toBeLessThan(deckBefore);
    expect(playerOf(sim.state, P1).deck.length).toBeLessThanOrEqual(deckBefore - 8);
  });

  it("Envy: with a support in play it is the card offered, and discarded instead of the deck", () => {
    const sim = open();
    stack(sim, ...PAD);
    const given = moveToHand(sim.state, P1, "01006");
    const [may] = given.ids as [InstanceId];
    sim.state = given.state;
    run(sim, play(P1, may, payWith(sim.state, P1, 1, [may])));
    expect(cardsInPlay(sim.state)).toContain(may);
    const deckBefore = playerOf(sim.state, P1).deck.length;
    flipByAttack(sim, "55007a");
    expect(playerOf(sim.state, P1).discard).toContain(may);
    expect(cardsInPlay(sim.state)).not.toContain(may);
    // Nothing milled: the deck changed only by the next turn's draws, never by 8.
    expect(playerOf(sim.state, P1).deck.length).toBeGreaterThan(deckBefore - 8);
  });

  it("Greed: confuses the player; already confused, the player takes 2 damage instead", () => {
    const fresh = open();
    stack(fresh, ...PAD);
    flipByAttack(fresh, "55008a");
    expect(inst(fresh.state, identityOf(fresh.state)).statuses.confused).toBeGreaterThan(0);
    const confused = open();
    stack(confused, ...PAD);
    confused.state = patchInstance(confused.state, identityOf(confused.state), {
      statuses: { ...inst(confused.state, identityOf(confused.state)).statuses, confused: 1 },
    });
    flipByAttack(confused, "55008a");
    expect(inst(confused.state, identityOf(confused.state)).statuses.confused).toBe(1);
    // The attack's own damage plus the 2.
    expect(inst(confused.state, identityOf(confused.state)).damage).toBeGreaterThanOrEqual(2);
  });

  it("Pride: exhausts the identity; already exhausted, discards 1 card at random from the hand", () => {
    const fresh = open();
    stack(fresh, ...PAD);
    flipByAttack(fresh, "55009a");
    // Readied again by the next player phase, so the proof is the events.
    expect(types(fresh.events, "cardExhausted").some((e) => e.instanceId === identityOf(fresh.state))).toBe(true);
    const tired = open();
    stack(tired, ...PAD);
    tired.state = patchInstance(tired.state, identityOf(tired.state), { exhausted: true });
    const handBefore = playerOf(tired.state, P1).hand.length;
    const discardBefore = playerOf(tired.state, P1).discard.length;
    flipByAttack(tired, "55009a");
    void handBefore;
    expect(playerOf(tired.state, P1).discard.length).toBeGreaterThan(discardBefore);
  });

  it("Sloth: stuns the player; already stunned, places 2 threat on the main scheme", () => {
    const fresh = open();
    stack(fresh, ...PAD);
    const freshGaze = flipByAttack(fresh, "55010a");
    expect(types(fresh.events, "statusGiven").some((e) => e.status === "stunned")).toBe(true);
    expect(placedBy(fresh, freshGaze)).toEqual([]);
    const stunned = open();
    stack(stunned, ...PAD);
    stunned.state = patchInstance(stunned.state, identityOf(stunned.state), {
      statuses: { ...inst(stunned.state, identityOf(stunned.state)).statuses, stunned: 1 },
    });
    const stunnedGaze = flipByAttack(stunned, "55010a");
    expect(types(stunned.events, "statusGiven").some((e) => e.status === "stunned")).toBe(false);
    expect(placedBy(stunned, stunnedGaze)).toEqual([2]);
  });

  it("Wrath: searches the top 5 cards of the encounter deck, reveals the chosen one and shuffles", () => {
    const sim = open();
    stack(sim, ...PAD);
    const asked: string[][] = [];
    flipByAttack(sim, "55011a", (s) => {
      const choice = s.pendingChoice!;
      if (choice.prompt.kind === "chooseCards") {
        asked.push(choice.options.map((o) => o.label));
        return [choice.options[0]!.optionId];
      }
      return firstLegal(s);
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toHaveLength(5);
  });
});

describe("a Trance's Forced Action (55007b to 55011b)", () => {
  /** A flipped Trance of this Gaze in the next player phase, ready to be used. */
  function afterFlip(code: Gaze, setup: (sim: Sim) => void = () => {}): { sim: Sim; gaze: InstanceId } {
    const sim = open();
    stack(sim, ...PAD);
    setup(sim);
    const gaze = flipByAttack(sim, code);
    expect(sim.state.step.phase).toBe("player");
    return { sim, gaze };
  }

  it.each(GAZES)(
    "%s: the player phase cannot end until it is used; using it exhausts the card, then the phase ends",
    (code) => {
      const { sim, gaze } = afterFlip(code);
      const refused = applyCommand(sim.state, endTurn(P1), DEPS);
      expect(refused.ok).toBe(false);
      run(sim, use(P1, gaze, FORCED_ACTION_OF[code]));
      expect(inst(sim.state, gaze).exhausted).toBe(true);
      // The cost is paid: nothing outstanding.
      expect(applyCommand(sim.state, endTurn(P1), DEPS).ok).toBe(true);
    },
  );

  it("Envy: gives Enchantress a facedown boost card and readies the identity", () => {
    const { sim, gaze } = afterFlip("55007a");
    sim.state = patchInstance(sim.state, identityOf(sim.state), { exhausted: true });
    run(sim, use(P1, gaze, FORCED_ACTION_OF["55007a"]));
    expect(types(sim.events, "boostCardDealt").some((e) => e.enemyInstanceId === villainOf(sim.state))).toBe(true);
    expect(inst(sim.state, identityOf(sim.state)).exhausted).toBeFalsy();
  });

  it("Pride: 1 threat on the main scheme; with no side scheme in play nothing is removed", () => {
    const { sim, gaze } = afterFlip("55009a");
    sim.events = [];
    run(sim, use(P1, gaze, FORCED_ACTION_OF["55009a"]));
    expect(placedBy(sim, gaze)).toEqual([1]);
    expect(types(sim.events, "threatRemoved")).toEqual([]);
  });

  it("Sloth: heals 1 damage from Enchantress, draws 1 card and discards 1 card", () => {
    const { sim, gaze } = afterFlip("55010a");
    sim.state = patchInstance(sim.state, villainOf(sim.state), { damage: 3 });
    const hand = playerOf(sim.state, P1).hand.length;
    run(sim, use(P1, gaze, FORCED_ACTION_OF["55010a"]));
    expect(inst(sim.state, villainOf(sim.state)).damage).toBe(2);
    expect(playerOf(sim.state, P1).hand.length).toBe(hand);
  });

  it("Wrath: the player takes 1 indirect damage; with no minion in play there is no one to deal 2 damage to", () => {
    const { sim, gaze } = afterFlip("55011a");
    const before = inst(sim.state, identityOf(sim.state)).damage;
    run(sim, use(P1, gaze, FORCED_ACTION_OF["55011a"]));
    expect(inst(sim.state, identityOf(sim.state)).damage).toBe(before + 1);
  });

  it("Greed: a playable card drawn is played, paying its cost, and costs no damage", () => {
    const { sim, gaze } = afterFlip("55008a");
    sim.state = putOnTopOfDeck(sim.state, P1, "01006").state;
    const damageBefore = inst(sim.state, identityOf(sim.state)).damage;
    // The payment is asked for (a card from the hand pays the Support's 1): pay with the first card offered.
    const pay: Picker = (st) =>
      st.pendingChoice!.prompt.kind === "spendResources" ? [st.pendingChoice!.options[0]!.optionId] : firstLegal(st);
    run(sim, use(P1, gaze, FORCED_ACTION_OF["55008a"]), pay);
    const may = Object.values(sim.state.instances).find((i) => (i.cardId as string) === "01006")!.instanceId;
    expect(cardsInPlay(sim.state)).toContain(may);
    expect(inst(sim.state, identityOf(sim.state)).damage).toBe(damageBefore);
  });

  it("Greed: a resource card cannot be played, so the player takes 1 damage and keeps the card", () => {
    const { sim, gaze } = afterFlip("55008a");
    const power = [...playerOf(sim.state, P1).deck, ...playerOf(sim.state, P1).hand].find(
      (id) => cardNameOf(sim.state, id) === "The Power of Justice",
    )!;
    sim.state = putOnTopOfDeck(sim.state, P1, codeOf(sim.state, power)).state;
    const damageBefore = inst(sim.state, identityOf(sim.state)).damage;
    run(sim, use(P1, gaze, FORCED_ACTION_OF["55008a"]));
    expect(inst(sim.state, identityOf(sim.state)).damage).toBe(damageBefore + 1);
    expect(playerOf(sim.state, P1).hand).toContain(power);
  });
});

describe("Prime Real Estate 1B and Sovereign Sorceress 2B: a charm counter for an Enthralled identity is 1 threat", () => {
  it("a Defiant player's counter is placed as a counter (the control for the next test)", () => {
    const sim = open();
    stack(sim, ...PAD);
    toNextPlayerPhase(sim);
    expect(charm(sim.state, gazeOn(sim.state))).toBe(1);
  });

  it("an Enthralled player (a flipped Gaze) is attacked again: 1 threat instead, and the Trance holds 0 counters", () => {
    const sim = open();
    stack(sim, ...PAD);
    const gaze = flipByAttack(sim, "55010a");
    const main = sim.state.mainScheme.instanceId;
    // The fifth counter was placed while the player was Defiant: it was a counter, and there was no replacement.
    expect(placedBy(sim, main)).toEqual([]);
    // The Trance's Forced Action first (the phase cannot end without it), then another round.
    run(sim, use(P1, gaze, FORCED_ACTION_OF["55010a"]));
    sim.state = patchInstance(sim.state, main, { threat: 0 });
    stack(sim, ...PAD);
    sim.events = [];
    toNextPlayerPhase(sim);
    expect(charm(sim.state, gaze)).toBe(0);
    expect(types(sim.events, "counterAdded").filter((e) => e.counterType === "charm")).toEqual([]);
    // One attack, one counter, so 1 threat placed by Prime Real Estate itself.
    expect(types(sim.events, "attackResolved")).toHaveLength(1);
    expect(placedBy(sim, main)).toEqual([1]);
  });
});

describe("Enchantress (55001 to 55003)", () => {
  it("standard mode starts on stage I (15 per hero) and expert on stage II (16 per hero)", () => {
    const standard = open([SPIDER_MAN, IRON_MAN]);
    expect(codeOf(standard.state, villainOf(standard.state))).toBe("55001");
    expect(standard.state.villains[0]!.stageIndex).toBe(0);
    expect(maxHitPoints(standard.state, villainOf(standard.state), DEPS)).toBe(30);
    const expert = open([SPIDER_MAN], { difficulty: "expert" });
    expect(expert.state.villains[0]!.stageIndex).toBe(1);
    expect(maxHitPoints(expert.state, villainOf(expert.state), DEPS)).toBe(16);
  });

  it("the attack puts one charm counter on the attacked player's Enchantment card, and only on theirs", () => {
    const sim = open([SPIDER_MAN, IRON_MAN]);
    stack(sim, ...PAD);
    toNextPlayerPhase(sim, firstLegal, [P1, P2]);
    // One counter per attack on that player (the Standard fillers may add an attack or two).
    for (const player of [P1, P2] as PlayerId[]) {
      const attacks = types(sim.events, "attackResolved").filter(
        (a) => a.targetInstanceId === identityOf(sim.state, player),
      );
      expect(attacks.length).toBeGreaterThan(0);
      expect(charm(sim.state, gazeOn(sim.state, player))).toBe(attacks.length);
    }
  });
});

/** The hero basic-attacks the villain (every prompt answered by `firstLegal`); the villain is one hit from defeat. */
function defeatVillainStage(sim: Sim, player: PlayerId = P1): void {
  const villain = villainOf(sim.state);
  const max = maxHitPoints(sim.state, villain, DEPS)!;
  sim.state = patchInstance(sim.state, villain, {
    damage: max - 1,
    statuses: { ...inst(sim.state, villain).statuses, tough: 0 },
  });
  run(sim, {
    type: "basicAttack",
    playerId: player,
    attackerInstanceId: identityOf(sim.state, player),
    targetInstanceId: villain,
  });
}
const futureOfDespair = (s: GameState): InstanceId | undefined =>
  cardsInPlay(s).find((id) => codeOf(s, id) === "55006");

describe("Future of Despair (55006) and the stage When Reveals (55002, 55003)", () => {
  it("standard, one player: defeating stage I puts it into play with 2 + 3 = 5 threat; Enchantress is stalwart and takes no damage", () => {
    const sim = open();
    stack(sim, ...PAD);
    expect(futureOfDespair(sim.state)).toBeUndefined();
    defeatVillainStage(sim);
    expect(sim.state.villains[0]!.stageIndex).toBe(1);
    const despair = futureOfDespair(sim.state)!;
    expect(despair).toBeDefined();
    expect(inst(sim.state, despair).threat).toBe(5);
    const villain = villainOf(sim.state);
    expect(hasKeyword(sim.state, villain, "stalwart", DEPS)).toBe(true);
    // It is put into play, not revealed, so its When Revealed does not trigger (RRG "When Revealed", p. 52).
    expect(charm(sim.state, gazeOn(sim.state))).toBe(0);
    // "Cannot take damage": a basic attack on Enchantress is not a legal command.
    const attack = applyCommand(
      sim.state,
      { type: "basicAttack", playerId: P1, attackerInstanceId: identityOf(sim.state), targetInstanceId: villain },
      DEPS,
    );
    expect(attack.ok).toBe(false);
  });

  it("standard, two players: 2 + 3 = 5 threat per hero, 10 in all", () => {
    const sim = open([SPIDER_MAN, IRON_MAN]);
    stack(sim, ...PAD);
    defeatVillainStage(sim);
    expect(inst(sim.state, futureOfDespair(sim.state)!).threat).toBe(10);
  });

  it("expert starts on stage II with no Future of Despair; defeating it brings stage III's card in with 2 + 4 = 6 per hero", () => {
    const sim = open([SPIDER_MAN], { difficulty: "expert" });
    stack(sim, ...PAD);
    expect(futureOfDespair(sim.state)).toBeUndefined();
    defeatVillainStage(sim);
    expect(sim.state.villains[0]!.stageIndex).toBe(2);
    expect(inst(sim.state, futureOfDespair(sim.state)!).threat).toBe(6);
    expect(maxHitPoints(sim.state, villainOf(sim.state), DEPS)).toBe(18);
  });

  it("Future of Despair leaves play and Enchantress takes damage again", () => {
    const sim = open();
    stack(sim, ...PAD);
    defeatVillainStage(sim);
    const despair = futureOfDespair(sim.state)!;
    sim.state = patchInstance(patchInstance(sim.state, despair, { threat: 1 }), identityOf(sim.state), {
      exhausted: false,
    });
    run(sim, {
      type: "basicThwart",
      playerId: P1,
      thwarterInstanceId: identityOf(sim.state),
      schemeInstanceId: despair,
    });
    expect(futureOfDespair(sim.state)).toBeUndefined();
    expect(hasKeyword(sim.state, villainOf(sim.state), "stalwart", DEPS)).toBe(false);
  });
});

describe("Sovereign Sorceress 2A (55005a) and the stage's completion (55005b)", () => {
  /** Stage 1 one threat short of its target of 6 per hero; the villain phase's acceleration completes it. */
  const nearlyComplete = (sim: Sim) => {
    sim.state = patchInstance(sim.state, sim.state.mainScheme.instanceId, { threat: 6 * sim.state.players.length - 1 });
  };

  it("with the Crown not in play, searches the encounter deck for it and reveals it onto Enchantress", () => {
    const sim = open();
    stack(sim, "01186", "55016");
    nearlyComplete(sim);
    toNextPlayerPhase(sim);
    expect(sim.state.mainScheme.stageIndex).toBe(1);
    const crown = Object.values(sim.state.instances).find((i) => (i.cardId as string) === "55016")!;
    expect(crown.attachedTo).toBe(villainOf(sim.state));
    expect(types(sim.events, "statusGiven").filter((e) => e.status === "stunned")).toEqual([]);
  });

  it("with the Crown in play, stuns each identity", () => {
    const sim = open([SPIDER_MAN, IRON_MAN]);
    // Round 1 reveals the Crown as a player's dealt encounter card; round 2 completes stage 1.
    stack(sim, "01186", "01186", "55016", "01188");
    toNextPlayerPhase(sim, firstLegal, [P1, P2]);
    const crown = Object.values(sim.state.instances).find((i) => (i.cardId as string) === "55016")!;
    expect(crown.attachedTo).toBe(villainOf(sim.state));
    nearlyComplete(sim);
    sim.events = [];
    stack(sim, "01186", "01186", "01188");
    // The first player token passed to player 2.
    toNextPlayerPhase(sim, firstLegal, [P2, P1]);
    expect(sim.state.mainScheme.stageIndex).toBe(1);
    const stunned = types(sim.events, "statusGiven")
      .filter((e) => e.status === "stunned")
      .map((e) => e.instanceId);
    expect(stunned).toContain(identityOf(sim.state, P1));
    expect(stunned).toContain(identityOf(sim.state, P2));
  });

  it("stage 2B's Forced Interrupt turns an Enthralled player's counters into threat as well", () => {
    const sim = open();
    stack(sim, ...PAD);
    const gaze = flipByAttack(sim, "55010a");
    run(sim, use(P1, gaze, FORCED_ACTION_OF["55010a"]));
    nearlyComplete(sim);
    // Stage 2A's When Revealed searches the encounter deck for the Crown and shuffles it (printed "(Shuffle.)", even when
    // the Crown is not there), so the stacked order is lost at the stage change. PAD holds two Assaults (01187, "the
    // villain attacks you"), which a shuffle can deal: that was the second attack seen in this round. A deck without any
    // card that attacks leaves the one activation.
    stack(sim, "01186", "01186", "01188");
    sim.events = [];
    toNextPlayerPhase(sim);
    expect(sim.state.mainScheme.stageIndex).toBe(1);
    expect(charm(sim.state, gaze)).toBe(0);
    // The threat is placed by stage 2B itself, 1 for the one attack on the player.
    expect(types(sim.events, "attackResolved")).toHaveLength(1);
    expect(placedBy(sim, sim.state.mainScheme.instanceId)).toEqual([1]);
  });

  it("completing stage 2B loses the game", () => {
    const sim = open();
    stack(sim, ...PAD);
    nearlyComplete(sim);
    toNextPlayerPhase(sim);
    expect(sim.state.mainScheme.stageIndex).toBe(1);
    expect(sim.state.outcome).toBeNull();
    sim.state = patchInstance(sim.state, sim.state.mainScheme.instanceId, { threat: 8 });
    stack(sim, ...PAD);
    toNextPlayerPhase(sim);
    expect(sim.state.outcome).toEqual({ result: "loss", reason: "mainSchemeCompleted" });
  });
});

describe("hidden information across a whole round", () => {
  it("no event of a round with no flip names a Trance, and none names the Gaze beyond what is on the table", () => {
    const sim = open([SPIDER_MAN, IRON_MAN]);
    stack(sim, ...PAD);
    toNextPlayerPhase(sim, firstLegal, [P1, P2]);
    expect(mentions(sim.events, SECRETS)).toEqual([]);
    for (const player of [P1, P2] as PlayerId[])
      expect(inst(sim.state, gazeOn(sim.state, player)).reverseHidden).toBe(true);
    const { cardPool: _pool, rng: _rng, ...sealed } = sealHiddenInformation(sim.state);
    expect(mentions(sealed, SECRETS)).toEqual([]);
  });
});
