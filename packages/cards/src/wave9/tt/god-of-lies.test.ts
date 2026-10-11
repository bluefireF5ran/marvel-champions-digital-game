import { TT_CARDS } from "@mc/content";
import {
  applyCommand,
  cardsInPlay,
  createGame,
  maxHitPoints,
  podOf,
  replay,
  sessionApply,
  sharedScheme,
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
  moveToHand,
  patchInstance,
  payWith,
  play,
  playerOf,
  resourceAbility,
  settle,
  use,
  type Picker,
} from "../../testing/harness.js";
import { WAVE8_ABILITIES } from "../../wave8/index.js";
import { wave9Scenario } from "../setup.js";
import { IRON_MAN, SHE_HULK, SPIDER_MAN, codeOf, heroForm, onlyDeck } from "../testing.js";
import { TT_ASPECT_BASIC } from "./aspect-basic.js";
import { GOD_OF_LIES, GOD_OF_LIES_SKIPPED } from "./god-of-lies.js";
import { TRICKSTER_MAGIC } from "./trickster-magic.js";

vi.setConfig({ testTimeout: 300_000 });

/**
 * The frame of the God of Lies scenario in Single Group Mode (docs/phase7-wave9.md sections 3.59 to 3.67 and 8.4 item
 * 68): Loki, God of Lies and Worlds Collide in the neutral area, the four Avatars of Loki and their Fading Figments
 * with the Shatter the Illusion helper, Mischief and Mayhem 1A and 1B, Intense Focus and Total Focus, and the four
 * Synergy environments. The real scenario (`wave9Scenario("god-of-lies")`) with real turns and real prompts, one
 * player and three. The encounter cards 55035 to 55051 are the second half of the module.
 *
 * **Trickster Magic** is the scenario's required modular set and is scripted, but every game here replaces the
 * encounter deck with `onlyDeck(...)` (Standard set fillers only), so no Trickster Magic or God of Lies encounter card
 * is revealed or dealt. The cards dealt by Shatter the Illusion's step 3 stay facedown in front of their players.
 *
 * Test surgery (damage on a villain, counters, a hero's damage) is applied to a state and a new session starts from it:
 * every session's log replays deep-equal.
 */
const DEPS: EngineDeps = { abilities: mergeRegistries(WAVE8_ABILITIES, GOD_OF_LIES, TRICKSTER_MAGIC, TT_ASPECT_BASIC) };

const AVATARS = ["55029a", "55030a", "55031a", "55032a"] as const;
type Avatar = (typeof AVATARS)[number];
/** The environment named in each Avatar's Fading Figment (the second sentence of its When Revealed). */
const ENVIRONMENT_OF: Readonly<Record<Avatar, string>> = {
  "55029a": "55055", // Unified Front
  "55030a": "55054", // Mounting Resistance
  "55031a": "55052", // Domineering Force
  "55032a": "55053", // Feigned Retreat
};
const ENVIRONMENTS = ["55052", "55053", "55054", "55055"] as const;

const REFS = [
  "55027a.loki-god-of-lies-constant",
  "55027b.when-revealed",
  "55027b.loki-god-of-lies-constant",
  "55028a.setup",
  "55028b.worlds-collide-constant",
  "55028b.worlds-collide-constant-2",
  "55028b.worlds-collide-constant-3",
  "55029a.loki-the-rascal-forced-response",
  "55029a.loki-the-rascal-forced-interrupt",
  "55029b.when-revealed",
  "55030a.loki-the-miscreant-forced-response",
  "55030a.loki-the-miscreant-forced-interrupt",
  "55030b.when-revealed",
  "55031a.loki-the-knave-forced-response",
  "55031a.loki-the-knave-forced-interrupt",
  "55031b.when-revealed",
  "55032a.loki-the-wretch-forced-interrupt",
  "55032a.loki-the-wretch-forced-interrupt-2",
  "55032b.when-revealed",
  "55033a.setup",
  "55033a.mischief-and-mayhem-constant",
  "55033a.mischief-and-mayhem-constant-2",
  "55033a.mischief-and-mayhem-constant-3",
  "55033b.mischief-and-mayhem-forced-interrupt",
  "55033b.mischief-and-mayhem-forced-interrupt-2",
  "55034a.intense-focus-constant",
  "55034a.when-revealed",
  "55034b.total-focus-constant",
  "55034b.when-revealed",
  "55052.domineering-force-constant",
  "55052.domineering-force-interrupt",
  "55053.feigned-retreat-constant",
  "55053.feigned-retreat-interrupt",
  "55054.mounting-resistance-constant",
  "55054.mounting-resistance-interrupt",
  "55055.unified-front-constant",
  "55055.unified-front-resource",
];
const FRAME_CARDS = ["55027a", "55028a", ...AVATARS.slice(), "55033a", "55034a", ...ENVIRONMENTS] as const;

describe("registry", () => {
  const cardOf = (code: string) => TT_CARDS.find((c) => (c.id as string) === code) as never;

  it("registers the 37 refs of the frame, each a valid definition", () => {
    expect(Object.keys(GOD_OF_LIES).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(GOD_OF_LIES)) expect(validateDefinition(def), id).toEqual([]);
  });

  it("registers every ref the data names for the frame cards and skips none of them", () => {
    const refs = FRAME_CARDS.flatMap((code) => abilityRefIds(cardOf(code)));
    expect(refs.filter((id) => !(id in GOD_OF_LIES)).sort()).toEqual([]);
    expect([...refs].sort()).toEqual([...REFS].sort());
  });

  it("skips exactly the encounter cards 55035 to 55051 (the second half), each with its reason", () => {
    const encounter = Array.from({ length: 17 }, (_, i) => String(55035 + i)).flatMap((code) =>
      abilityRefIds(cardOf(code)),
    );
    expect(Object.keys(GOD_OF_LIES_SKIPPED).sort()).toEqual([...encounter].sort());
    for (const reason of Object.values(GOD_OF_LIES_SKIPPED)) expect(reason).toBe("second half, not scripted yet");
    expect(Object.keys(GOD_OF_LIES_SKIPPED).filter((id) => id in GOD_OF_LIES)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// A small driver: a session per stretch of play; surgery starts a new one
// ---------------------------------------------------------------------------------------------------------------

type Seat = typeof SPIDER_MAN | typeof IRON_MAN | typeof SHE_HULK;
interface Sim {
  session: GameSession;
  events: GameEvent[];
  /** Every session this game has had: each one's log must replay to its last state. */
  past: GameSession[];
}

const stateOf = (sim: Sim): GameState => sim.session.state;
const begin = (state: GameState): Sim => ({ session: startSession(state), events: [], past: [] });

function open(
  players: readonly Seat[] = [SPIDER_MAN],
  opts: { readonly difficulty?: "standard" | "expert"; readonly seed?: number; readonly avatar?: Avatar } = {},
): GameState {
  const difficulty = opts.difficulty ?? "standard";
  // The Avatar in play is a random draw of the seed; a test that needs one scans seeds for it.
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

/** Standard-set fillers, top first: nothing from God of Lies or Trickster Magic is ever revealed or dealt. */
const FILLERS = ["01186", "01186", "01188", "01187", "01187", "01189", "01190"] as const;
const stacked = (state: GameState, ...codes: string[]): GameState =>
  onlyDeck(state, ...(codes.length ? codes : FILLERS));

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
const names = (s: GameState, ids: readonly InstanceId[]): string[] => ids.map((id) => codeOf(s, id));
const villainId = (s: GameState): InstanceId => s.activeVillainId;
const avatarCode = (s: GameState): string => codeOf(s, villainId(s));
const loki = (s: GameState) => sharedVillain(s)!;
const worlds = (s: GameState) => sharedScheme(s)!;
const neutralIds = (s: GameState): InstanceId[] => [...(s.scenarioPlayAreas?.["neutral"]?.cards ?? [])];
const onTable = (s: GameState, code: string): InstanceId | undefined =>
  cardsInPlay(s).find((id) => codeOf(s, id) === code);
const asideCodes = (s: GameState): string[] => names(s, s.encounterSetAside);
const synergyOn = (s: GameState, code: string): number => inst(s, onTable(s, code)!).counters["synergy"] ?? 0;
const maxHp = (s: GameState, id: InstanceId): number => maxHitPoints(s, id, DEPS)!;

/** A hero's basic attack on the Avatar that is one point from falling (everything else answered by `pick`). */
function defeatAvatar(sim: Sim, pick: Picker = firstLegal, player: PlayerId = P1): void {
  const id = villainId(stateOf(sim));
  edit(sim, (s) =>
    patchInstance(
      patchInstance(s, id, { damage: maxHp(s, id) - 1, statuses: { ...inst(s, id).statuses, tough: 0 } }),
      identityOf(s, player),
      {
        exhausted: false,
      },
    ),
  );
  apply(
    sim,
    {
      type: "basicAttack",
      playerId: player,
      attackerInstanceId: identityOf(stateOf(sim), player),
      targetInstanceId: id,
    },
    pick,
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The opening state (docs/phase7-wave9.md section 3.59)
// ---------------------------------------------------------------------------------------------------------------

describe("the opening state (Worlds Collide A, then Mischief and Mayhem 1A)", () => {
  it("one player, standard: Loki and Worlds Collide in a closed neutral area, one Avatar in play, the others aside", () => {
    const s = open();
    expect(names(s, neutralIds(s)).sort()).toEqual(["55027a", "55028a"]);
    expect(s.scenarioPlayAreas?.["neutral"]?.closed).toBe(true);
    // The shared record: 20 hit points, flips at 10 remaining, Worlds Collide's target is 2 per group (one group).
    expect(podOf(s)).toMatchObject({
      groupId: "g1",
      coordinator: "local",
      groupsInPodAtStart: 1,
      groupsInGameAtStart: 1,
      playersInGameAtStart: 1,
    });
    expect(loki(s)).toMatchObject({ hp: 20, remaining: 20, flipAtRemaining: 10, flipped: false, defeated: false });
    expect(worlds(s)).toMatchObject({ threat: 0, target: 2, status: "playing" });
    // Neither neutral card is the villain or the main scheme of the game.
    expect(AVATARS).toContain(avatarCode(s) as Avatar);
    expect(codeOf(s, s.mainScheme.instanceId)).toBe("55033a");
    expect(neutralIds(s)).not.toContain(s.mainScheme.instanceId);
    expect(neutralIds(s)).not.toContain(villainId(s));
    // One random Avatar of Loki at its printed 15 hit points; the other three set aside; Intense Focus set aside.
    expect(maxHp(s, villainId(s))).toBe(15);
    expect(inst(s, villainId(s)).damage).toBe(0);
    const others = AVATARS.filter((a) => a !== avatarCode(s));
    expect(
      asideCodes(s)
        .filter((c) => (AVATARS as readonly string[]).includes(c))
        .sort(),
    ).toEqual([...others].sort());
    expect(asideCodes(s)).toContain("55034a");
    expect(inst(s, villainId(s)).attachments).toEqual([]);
    // The four Synergy environments are in play with no counters.
    for (const code of ENVIRONMENTS) {
      expect(onTable(s, code), code).toBeDefined();
      expect(synergyOn(s, code)).toBe(0);
    }
    expect(inst(s, s.mainScheme.instanceId).threat).toBe(0);
    expect(s.outcome).toBeNull();
  });

  it("one player, expert: Intense Focus is attached to the Avatar in play (+2 hit points, steady)", () => {
    const s = open([SPIDER_MAN], { difficulty: "expert" });
    const focus = onTable(s, "55034a")!;
    expect(inst(s, focus).attachedTo).toBe(villainId(s));
    expect(inst(s, villainId(s)).attachments).toEqual([focus]);
    expect(asideCodes(s)).not.toContain("55034a");
    expect(maxHp(s, villainId(s))).toBe(17);
    expect(loki(s)).toMatchObject({ hp: 20 });
  });

  it("three players: 60 hit points, flip at 30, target still 2; the Avatar has 45 (expert 51)", () => {
    const standard = open([SPIDER_MAN, IRON_MAN, SHE_HULK]);
    expect(loki(standard)).toMatchObject({ hp: 60, remaining: 60, flipAtRemaining: 30 });
    expect(worlds(standard)).toMatchObject({ target: 2, threat: 0 });
    expect(podOf(standard).playersInGameAtStart).toBe(3);
    expect(maxHp(standard, villainId(standard))).toBe(45);
    const expert = open([SPIDER_MAN, IRON_MAN, SHE_HULK], { difficulty: "expert" });
    expect(maxHp(expert, villainId(expert))).toBe(51);
    expect(loki(expert)).toMatchObject({ hp: 60 });
  });

  it("the Avatar is a random draw of the seed: all four come up, and a seed always deals the same one", () => {
    const dealt = new Set<string>();
    for (let seed = 1; seed <= 40 && dealt.size < 4; seed++) dealt.add(avatarCode(open([SPIDER_MAN], { seed })));
    expect([...dealt].sort()).toEqual([...AVATARS].sort());
    expect(avatarCode(open([SPIDER_MAN], { seed: 7 }))).toBe(avatarCode(open([SPIDER_MAN], { seed: 7 })));
  });

  it("keeps the neutral cards out of the encounter deck, the set-aside area and the villain list", () => {
    const s = open();
    const deckCodes = Object.values(s.encounterDecks).flatMap((d) => names(s, [...d.deck, ...d.discard]));
    for (const code of ["55027a", "55027b", "55028a", "55028b"]) {
      expect(deckCodes).not.toContain(code);
      expect(asideCodes(s)).not.toContain(code);
    }
    expect(s.villains.map((v) => v.cardId as string)).not.toContain("55027a");
  });
});

describe("a neutral card cannot be reached by a card that does not name it", () => {
  it("a basic attack on Loki, God of Lies and a basic thwart of Worlds Collide are refused; neither is a legal target", () => {
    const s = open();
    const [lokiId, schemeId] = [podOf(s).neutral!.villainInstanceId, podOf(s).neutral!.mainSchemeInstanceId];
    const attack = applyCommand(
      s,
      { type: "basicAttack", playerId: P1, attackerInstanceId: identityOf(s), targetInstanceId: lokiId },
      DEPS,
    );
    expect(attack.ok).toBe(false);
    const thwart = applyCommand(
      patchInstance(s, schemeId, { threat: 1 }),
      { type: "basicThwart", playerId: P1, thwarterInstanceId: identityOf(s), schemeInstanceId: schemeId },
      DEPS,
    );
    expect(thwart.ok).toBe(false);
    // The Avatar is attackable and Mischief and Mayhem thwartable, so the refusals are about the neutral cards.
    expect(
      applyCommand(
        s,
        { type: "basicAttack", playerId: P1, attackerInstanceId: identityOf(s), targetInstanceId: villainId(s) },
        DEPS,
      ).ok,
    ).toBe(true);
    expect(
      applyCommand(
        patchInstance(s, s.mainScheme.instanceId, { threat: 1 }),
        {
          type: "basicThwart",
          playerId: P1,
          thwarterInstanceId: identityOf(s),
          schemeInstanceId: s.mainScheme.instanceId,
        },
        DEPS,
      ).ok,
    ).toBe(true);
  });

  it("step one of the villain phase places its threat on Mischief and Mayhem and none on Worlds Collide", () => {
    const sim = begin(stacked(open([SPIDER_MAN], { avatar: "55030a" })));
    apply(sim, endTurn(P1));
    const s = stateOf(sim);
    expect(inst(s, s.mainScheme.instanceId).threat).toBeGreaterThanOrEqual(1);
    expect(worlds(s).threat).toBe(0);
    expect(inst(s, podOf(s).neutral!.mainSchemeInstanceId).threat).toBe(0);
    expectReplays(sim);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Shatter the Illusion (the four Avatars and Fading Figments)
// ---------------------------------------------------------------------------------------------------------------

describe.each(AVATARS)("Shatter the Illusion from %s", (avatar) => {
  it("one player: 5 shatter counters (plus 2 already there) are removed and dealt to Loki; a different Avatar, a card dealt, 1 synergy counter", () => {
    const sim = begin(stacked(open([SPIDER_MAN], { avatar })));
    const id = villainId(stateOf(sim));
    edit(sim, (s) => patchInstance(s, id, { counters: { shatter: 2 } }));
    defeatAvatar(sim);
    const s = stateOf(sim);
    // Defeat replaced by the flip: 2 + 5 counters were on it, all removed by the Figment's When Revealed.
    const placed = types(sim.events, "counterAdded").filter((e) => e.counterType === "shatter");
    expect(placed.map((e) => e.amount)).toEqual([5]);
    const removed = types(sim.events, "counterRemoved").filter((e) => e.counterType === "shatter");
    expect(removed.map((e) => e.amount)).toEqual([7]);
    expect(types(sim.events, "villainFlipped").map((e) => [e.instanceId, e.from, e.to])).toContainEqual([id, "A", "B"]);
    expect(s.outcome).toBeNull();
    // Loki, God of Lies took 7 of 20 through exactly one numbered shared event.
    expect(types(sim.events, "sharedEventEmitted").map((e) => [e.seq, e.event])).toEqual([
      [1, { type: "sharedVillainDamaged", groupId: "g1", amount: 7 }],
    ]);
    expect(loki(s)).toMatchObject({ remaining: 13, damage: 7, flipped: false });
    // A different Avatar, front side up, at its printed 15 with no damage and no counters; the old one set aside.
    expect(s.activeVillainId).toBe(id);
    expect(s.villains.find((v) => v.instanceId === id)).toMatchObject({ side: "A", defeated: false });
    expect(AVATARS).toContain(avatarCode(s) as Avatar);
    expect(avatarCode(s)).not.toBe(avatar);
    expect(inst(s, id)).toMatchObject({ damage: 0 });
    expect(inst(s, id).counters["shatter"] ?? 0).toBe(0);
    expect(maxHp(s, id)).toBe(15);
    expect(asideCodes(s)).toContain(avatar);
    expect(asideCodes(s)).not.toContain(avatarCode(s));
    // Each player was dealt 1 facedown encounter card, and the Figment's environment holds 1 synergy counter.
    expect(playerOf(s, P1).dealtEncounter).toHaveLength(1);
    expect(synergyOn(s, ENVIRONMENT_OF[avatar])).toBe(1);
    for (const code of ENVIRONMENTS.filter((c) => c !== ENVIRONMENT_OF[avatar])) expect(synergyOn(s, code)).toBe(0);
    // One chosen group, with nobody asked.
    expect(types(sim.events, "groupChosen").map((e) => e.groupId)).toEqual(["g1"]);
    expect(types(sim.events, "villainReplaced").map((e) => [e.fromCardId, e.toCardId, e.reason])).toEqual([
      [avatar, avatarCode(s), "swap"],
    ]);
    expectReplays(sim);
  });

  it("three players: 15 counters from the defeat, 15 of Loki's 60 hit points, 3 cards dealt, 3 synergy counters", () => {
    const sim = begin(stacked(open([SPIDER_MAN, IRON_MAN, SHE_HULK], { avatar })));
    defeatAvatar(sim);
    const s = stateOf(sim);
    expect(types(sim.events, "counterAdded").find((e) => e.counterType === "shatter")?.amount).toBe(15);
    expect(loki(s)).toMatchObject({ hp: 60, remaining: 45 });
    for (const p of [P1, P2, P3]) expect(playerOf(s, p).dealtEncounter).toHaveLength(1);
    expect(synergyOn(s, ENVIRONMENT_OF[avatar])).toBe(3);
    expect(maxHp(s, villainId(s))).toBe(45);
    expectReplays(sim);
  });
});

describe("Shatter the Illusion: the rest of the card", () => {
  it("the Synergy environment holds at most 1 per player: a second Figment of the same environment places nothing", () => {
    const sim = begin(stacked(open([SPIDER_MAN], { avatar: "55031a" })));
    const domineering = onTable(stateOf(sim), "55052")!;
    edit(sim, (s) => patchInstance(s, domineering, { counters: { synergy: 1 } }));
    defeatAvatar(sim);
    const s = stateOf(sim);
    expect(synergyOn(s, "55052")).toBe(1);
    expect(types(sim.events, "countersNotPlaced")).toEqual([
      { type: "countersNotPlaced", instanceId: domineering, counterType: "synergy", amount: 1, reason: "limit" },
    ]);
    expect(types(sim.events, "counterAdded").filter((e) => e.counterType === "synergy")).toEqual([]);
    expectReplays(sim);
  });

  it("three players at 2 of 3: a Figment's 3 synergy counters place 1", () => {
    const sim = begin(stacked(open([SPIDER_MAN, IRON_MAN, SHE_HULK], { avatar: "55030a" })));
    const resistance = onTable(stateOf(sim), "55054")!;
    edit(sim, (s) => patchInstance(s, resistance, { counters: { synergy: 2 } }));
    defeatAvatar(sim);
    expect(synergyOn(stateOf(sim), "55054")).toBe(3);
    expect(types(sim.events, "countersNotPlaced").map((e) => e.amount)).toEqual([2]);
  });

  it("the Avatar is never defeated: excess damage is lost, no 'villain defeated' is announced, and the game goes on", () => {
    const sim = begin(stacked(open()));
    const id = villainId(stateOf(sim));
    const before = avatarCode(stateOf(sim));
    edit(sim, (s) => patchInstance(s, id, { damage: maxHp(s, id) - 1 }));
    apply(sim, {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: identityOf(stateOf(sim)),
      targetInstanceId: id,
    });
    expect(stateOf(sim).outcome).toBeNull();
    expect(stateOf(sim).villains.find((v) => v.instanceId === id)?.defeated).toBe(false);
    expect(avatarCode(stateOf(sim))).not.toBe(before);
  });

  it("expert: Intense Focus stays on the swapped-in Avatar, no card leaves play, and its +2 is in the dial (Q8 = A)", () => {
    const sim = begin(stacked(open([SPIDER_MAN], { difficulty: "expert" })));
    const focus = onTable(stateOf(sim), "55034a")!;
    defeatAvatar(sim);
    const s = stateOf(sim);
    expect(inst(s, focus).attachedTo).toBe(villainId(s));
    expect(inst(s, villainId(s)).attachments).toEqual([focus]);
    expect(onTable(s, "55034a")).toBe(focus);
    expect(types(sim.events, "cardMoved").filter((e) => e.instanceId === focus)).toEqual([]);
    // Printed 15 plus Intense Focus's 2, no damage: 17 remaining.
    expect(maxHp(s, villainId(s))).toBe(17);
    expect(inst(s, villainId(s)).damage).toBe(0);
    expectReplays(sim);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Loki, God of Lies: the flip at 10 per player and the defeat
// ---------------------------------------------------------------------------------------------------------------

describe("Loki, God of Lies", () => {
  it("standard, one player: flips after the second shatter (10 left) and attaches Intense Focus to the Avatar swapped in", () => {
    const sim = begin(stacked(open()));
    defeatAvatar(sim);
    expect(loki(stateOf(sim))).toMatchObject({ remaining: 15, flipped: false });
    expect(onTable(stateOf(sim), "55034a")).toBeUndefined();
    defeatAvatar(sim);
    const s = stateOf(sim);
    expect(loki(s)).toMatchObject({ remaining: 10, flipped: true });
    expect(inst(s, podOf(s).neutral!.villainInstanceId).flipped).toBe(true);
    // Loki's When Revealed resolved after the whole Figment ability: Intense Focus is on the Avatar now in play.
    const focus = onTable(s, "55034a")!;
    expect(inst(s, focus).attachedTo).toBe(villainId(s));
    expect(maxHp(s, villainId(s))).toBe(17);
    // Attached, not revealed (Q10 = B): its own When Revealed did not discard anything.
    expect(types(sim.events, "encounterCardRevealed").filter((e) => e.instanceId === focus)).toEqual([]);
    expect(playerOf(s, P1).discard.length).toBe(0);
    expect(s.outcome).toBeNull();
    expectReplays(sim);
  });

  it("expert, one player: the flip turns Intense Focus over to Total Focus (+3 hit points) and reveals it", () => {
    const sim = begin(stacked(open([SPIDER_MAN], { difficulty: "expert" }), ...FILLERS));
    defeatAvatar(sim);
    defeatAvatar(sim);
    const s = stateOf(sim);
    expect(loki(s)).toMatchObject({ remaining: 10, flipped: true });
    const focus = onTable(s, "55034a")!;
    expect(inst(s, focus).flipped).toBe(true);
    expect(inst(s, focus).attachedTo).toBe(villainId(s));
    expect(maxHp(s, villainId(s))).toBe(18);
    expect(types(sim.events, "encounterCardRevealed").filter((e) => e.instanceId === focus)).toHaveLength(1);
    // Total Focus's When Revealed: Dark Scepter was not in the stacked deck, so the Avatar was given a tough card.
    expect(inst(s, villainId(s)).statuses.tough).toBe(1);
    expectReplays(sim);
  });

  it("three players: 60 hit points, the flip at 30 remaining, after the second shatter of 15", () => {
    const sim = begin(stacked(open([SPIDER_MAN, IRON_MAN, SHE_HULK])));
    defeatAvatar(sim);
    expect(loki(stateOf(sim))).toMatchObject({ remaining: 45, flipped: false });
    defeatAvatar(sim);
    expect(loki(stateOf(sim))).toMatchObject({ remaining: 30, flipped: true });
    expect(onTable(stateOf(sim), "55034a")).toBeDefined();
  });

  it("the fourth shatter brings Loki to 0: the players win, by his own line", () => {
    const sim = begin(stacked(open()));
    for (let i = 0; i < 3; i++) defeatAvatar(sim);
    expect(loki(stateOf(sim))).toMatchObject({ remaining: 5, flipped: true, defeated: false });
    expect(stateOf(sim).outcome).toBeNull();
    defeatAvatar(sim);
    const s = stateOf(sim);
    expect(loki(s)).toMatchObject({ remaining: 0, defeated: true });
    expect(s.outcome).toMatchObject({ result: "win" });
    expect(types(sim.events, "sharedResultApplied").map((e) => e.result)).toEqual([
      "sharedVillainFlipped",
      "sharedVillainDefeated",
    ]);
    // The pod's record and no outside event: the log has no externalEvent command.
    expect(sim.session.log.commands.some((c) => (c as { type: string }).type === "externalEvent")).toBe(false);
    expectReplays(sim);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Worlds Collide and Mischief and Mayhem 1B
// ---------------------------------------------------------------------------------------------------------------

describe("Mischief and Mayhem 1B and Worlds Collide", () => {
  it("completed in step one: all threat removed, 1 threat on Worlds Collide, the stage stays; the second is the loss", () => {
    const sim = begin(stacked(open([SPIDER_MAN], { avatar: "55030a" })));
    const main = stateOf(sim).mainScheme.instanceId;
    edit(sim, (s) => patchInstance(s, main, { threat: 7 }));
    apply(sim, endTurn(P1));
    let s = stateOf(sim);
    // All 8 threat came off; the rest of the villain phase (the Miscreant's responses) put a little back.
    expect(
      types(sim.events, "threatRemoved")
        .filter((e) => e.schemeInstanceId === main)
        .map((e) => e.amount),
    ).toEqual([8]);
    expect(inst(s, main).threat).toBeLessThan(8);
    expect(worlds(s)).toMatchObject({ threat: 1, status: "playing" });
    expect(s.outcome).toBeNull();
    expect(codeOf(s, s.mainScheme.instanceId)).toBe("55033a");
    expect(types(sim.events, "sharedEventEmitted").map((e) => e.event)).toEqual([
      { type: "sharedSchemeThreatPlaced", groupId: "g1", amount: 1, cause: "schemeCompleted" },
    ]);
    // Next round: the second completion, in the villain phase, is lost at once.
    edit(sim, (st) => stacked(patchInstance(st, main, { threat: 7 })));
    apply(sim, endTurn(P1));
    s = stateOf(sim);
    expect(worlds(s)).toMatchObject({ threat: 2, status: "lost" });
    expect(s.outcome).toMatchObject({ result: "loss" });
    expectReplays(sim);
  });

  it("an identity that would be defeated in the villain phase is not: alter-ego, 1 hit point, 1 threat on Worlds Collide", () => {
    const sim = begin(stacked(open([SPIDER_MAN], { avatar: "55030a" })));
    const hero = identityOf(stateOf(sim));
    edit(sim, (s) => patchInstance(s, hero, { damage: maxHp(s, hero) - 1 }));
    apply(sim, endTurn(P1));
    const s = stateOf(sim);
    expect(s.outcome).toBeNull();
    expect(playerOf(s, P1).identity.form).toBe("alterEgo");
    expect(inst(s, hero).damage).toBe(maxHp(s, hero) - 1);
    expect(playerOf(s, P1).eliminated ?? false).toBe(false);
    expect(worlds(s).threat).toBe(1);
    expect(types(sim.events, "sharedEventEmitted").map((e) => e.event)).toContainEqual({
      type: "sharedSchemeThreatPlaced",
      groupId: "g1",
      amount: 1,
      cause: "identityDefeated",
    });
    expectReplays(sim);
  });

  it("Q9 = A: the completion in a player phase lets that phase finish; the loss comes when it ends unless Loki is defeated", () => {
    const sim = begin(stacked(open([SHE_HULK])));
    const hero = identityOf(stateOf(sim));
    // She-Hulk with Focused Rage in play: its action takes 1 damage, which her 1 remaining hit point cannot take.
    const hand = moveToHand(stateOf(sim), P1, "01027");
    const rage = hand.ids[0]!;
    edit(sim, () => hand.state);
    apply(sim, play(P1, rage, payWith(stateOf(sim), P1, 3, [rage])));
    edit(sim, (s) =>
      patchInstance(
        {
          ...s,
          pod: { ...podOf(s), shared: { ...podOf(s).shared!, schemeThreat: 1 } },
        },
        hero,
        { damage: maxHp(s, hero) - 1, exhausted: false },
      ),
    );
    apply(sim, use(P1, rage, "01027.focused-rage-action"));
    let s = stateOf(sim);
    expect(s.outcome).toBeNull();
    expect(worlds(s)).toMatchObject({ threat: 2, status: "schemeCompleted", finalPlayerPhase: true });
    expect(playerOf(s, P1).identity.form).toBe("alterEgo");
    // The phase is played to its end and then the players lose.
    apply(sim, endTurn(P1));
    s = stateOf(sim);
    expect(s.outcome).toMatchObject({ result: "loss" });
    expectReplays(sim);
  });

  it("Q9 = A: Loki defeated in that last player phase is a win", () => {
    const sim = begin(stacked(open([SHE_HULK])));
    const hero = identityOf(stateOf(sim));
    const hand = moveToHand(stateOf(sim), P1, "01027");
    const rage = hand.ids[0]!;
    edit(sim, () => hand.state);
    apply(sim, play(P1, rage, payWith(stateOf(sim), P1, 3, [rage])));
    edit(sim, (s) =>
      patchInstance(
        {
          ...s,
          pod: {
            ...podOf(s),
            shared: { ...podOf(s).shared!, schemeThreat: 1, villainDamage: 15, villainFlipped: true },
          },
          instances: {
            ...s.instances,
            [podOf(s).neutral!.villainInstanceId]: { ...inst(s, podOf(s).neutral!.villainInstanceId), flipped: true },
          },
        },
        hero,
        { damage: maxHp(s, hero) - 1, exhausted: false },
      ),
    );
    apply(sim, use(P1, rage, "01027.focused-rage-action"));
    expect(worlds(stateOf(sim)).status).toBe("schemeCompleted");
    expect(stateOf(sim).outcome).toBeNull();
    // She-Hulk is exhausted by the action's alter-ego change: the Avatar falls to the next hit instead.
    edit(sim, (s) => patchInstance(s, hero, { exhausted: false }));
    apply(sim, { type: "changeForm", playerId: P1 });
    defeatAvatar(sim);
    expect(loki(stateOf(sim)).defeated).toBe(true);
    expect(stateOf(sim).outcome).toMatchObject({ result: "win" });
    expectReplays(sim);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The Avatars' own text
// ---------------------------------------------------------------------------------------------------------------

describe("the Avatars' printed abilities", () => {
  const resolved = (sim: Sim, ability: string) =>
    types(sim.events, "abilityResolved").filter((e) => (e.abilityId as string) === ability).length;
  /** The treacheries revealed to the player in a villain phase: Advance (01186) among the fillers. */
  const treacheriesRevealed = (sim: Sim) =>
    types(sim.events, "encounterCardRevealed").filter((e) => (e.cardId as string).startsWith("011")).length;

  it("Loki the Miscreant: after you resolve a treachery, 1 threat on the main scheme and 1 on a side scheme", () => {
    const sim = begin(stacked(open([SPIDER_MAN], { avatar: "55030a" })));
    const main = stateOf(sim).mainScheme.instanceId;
    apply(sim, endTurn(P1));
    expect(treacheriesRevealed(sim)).toBeGreaterThanOrEqual(1);
    expect(resolved(sim, "55030a.loki-the-miscreant-forced-response")).toBe(treacheriesRevealed(sim));
    // No side scheme is in play, so the main scheme takes the Miscreant's 1 threat each time and nothing else does.
    const byVillain = types(sim.events, "threatPlaced").filter((e) => e.sourceInstanceId === villainId(stateOf(sim)));
    expect(byVillain.every((e) => e.schemeInstanceId === main)).toBe(true);
    expect(byVillain.filter((e) => e.amount === 1).length).toBeGreaterThanOrEqual(treacheriesRevealed(sim));
    expectReplays(sim);
  });

  it("Loki the Knave: after you resolve a treachery, 1 damage to your identity (and 1 to an ally you control)", () => {
    const sim = begin(stacked(open([SPIDER_MAN], { avatar: "55031a" })));
    const hero = identityOf(stateOf(sim));
    apply(sim, endTurn(P1));
    expect(resolved(sim, "55031a.loki-the-knave-forced-response")).toBe(treacheriesRevealed(sim));
    expect(treacheriesRevealed(sim)).toBeGreaterThanOrEqual(1);
    const dealtBy = types(sim.events, "damageDealt").filter(
      (e) => e.targetInstanceId === hero && e.sourceInstanceId === villainId(stateOf(sim)),
    );
    expect(dealtBy.filter((e) => e.amount === 1).length).toBeGreaterThanOrEqual(1);
    expectReplays(sim);
  });
});

describe("the Avatars' printed abilities: Rascal and Wretch", () => {
  it("Loki the Rascal: a treachery boost card is dealt to you facedown, or you spend 1 resource (your choice)", () => {
    const sim = begin(stacked(open([SPIDER_MAN], { avatar: "55029a" })));
    let dealtOnce = false;
    // Deal the first boost treachery to yourself; spend a resource for every later one.
    const pick: Picker = (s) => {
      const choice = s.pendingChoice!;
      if (choice.prompt.kind === "chooseOption") {
        const wanted = dealtOnce ? "Spend 1 resource" : "Deal it";
        const hit = choice.options.find((o) => o.label.startsWith(wanted));
        if (hit) {
          dealtOnce = true;
          return [hit.optionId];
        }
      }
      return firstLegal(s);
    };
    apply(sim, endTurn(P1), pick);
    const prompts = types(sim.events, "abilityResolved").filter(
      (e) => (e.abilityId as string) === "55029a.loki-the-rascal-forced-response",
    );
    expect(prompts.length).toBeGreaterThanOrEqual(1);
    expect(dealtOnce).toBe(true);
    // The card dealt by the first choice was revealed with the other dealt cards at the end of the villain phase.
    const dealt = types(sim.events, "cardMoved").filter(
      (e) => e.to.kind === "dealtEncounter" && e.from.kind === "boost",
    );
    expect(dealt).toHaveLength(1);
    // Spending a resource discarded cards from the hand.
    expect(types(sim.events, "cardMoved").some((e) => e.from.kind === "hand" && e.to.kind === "discard")).toBe(true);
    expectReplays(sim);
  });

  it("Loki the Wretch: when it activates against you the top card of the encounter deck is discarded; a treachery gives +1 ATK for the activation", () => {
    const sim = begin(stacked(open([SPIDER_MAN], { avatar: "55032a" })));
    const hero = identityOf(stateOf(sim));
    const wretch = villainId(stateOf(sim));
    apply(sim, endTurn(P1));
    const s = stateOf(sim);
    const discarded = types(sim.events, "cardMoved").find(
      (e) => e.from.kind === "encounterDeck" && e.to.kind === "encounterDiscard",
    );
    expect(discarded?.cardId).toBe("01186");
    // The Wretch's ATK 1 and the discarded treachery's +1: the first attack on the hero deals 2.
    const first = types(sim.events, "damageDealt").find(
      (e) => e.targetInstanceId === hero && e.sourceInstanceId === wretch,
    );
    expect(first?.amount).toBe(2);
    expectReplays(sim);
    expect(s.outcome).toBeNull();
  });
});

describe("Total Focus: find Dark Scepter and reveal it", () => {
  const expertAtFlip = () => {
    const sim = begin(stacked(open([SPIDER_MAN], { difficulty: "expert" })));
    return sim;
  };
  it("found in the encounter deck: revealed onto the Avatar, no tough status card", () => {
    const sim = begin(stacked(open([SPIDER_MAN], { difficulty: "expert" }), ...FILLERS, "55036"));
    defeatAvatar(sim);
    defeatAvatar(sim);
    const s = stateOf(sim);
    expect(loki(s).flipped).toBe(true);
    const scepter = onTable(s, "55036")!;
    expect(scepter).toBeDefined();
    expect(inst(s, scepter).attachedTo).toBe(villainId(s));
    expect(inst(s, villainId(s)).statuses.tough).toBe(0);
    // Total Focus discarded the top 2 encounter cards and the top 5 of the player's deck first.
    expect(playerOf(s, P1).discard.length).toBeGreaterThanOrEqual(5);
    expectReplays(sim);
  });

  it("already attached: revealed where it is, and the Avatar is given a tough status card", () => {
    const sim = expertAtFlip();
    edit(sim, (state) => {
      const id = Object.keys(state.instances).find(
        (k) => state.instances[k as InstanceId]!.cardId === "55036",
      ) as InstanceId;
      const host = state.activeVillainId;
      const decks = Object.fromEntries(
        Object.entries(state.encounterDecks).map(([deckId, piles]) => [
          deckId,
          { deck: piles.deck.filter((x) => x !== id), discard: piles.discard.filter((x) => x !== id) },
        ]),
      );
      return {
        ...state,
        encounterDecks: decks,
        instances: {
          ...state.instances,
          [id]: { ...state.instances[id]!, faceup: true, attachedTo: host },
          [host]: { ...state.instances[host]!, attachments: [...state.instances[host]!.attachments, id] },
        },
      };
    });
    defeatAvatar(sim);
    defeatAvatar(sim);
    const s = stateOf(sim);
    expect(loki(s).flipped).toBe(true);
    expect(names(s, inst(s, villainId(s)).attachments).sort()).toEqual(["55034a", "55036"]);
    expect(inst(s, villainId(s)).statuses.tough).toBe(1);
    expectReplays(sim);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The Synergy environments
// ---------------------------------------------------------------------------------------------------------------

describe("the Synergy environments", () => {
  it("each holds at most 1 synergy counter per player: 1 for one player, 3 for three", () => {
    for (const [seats, max] of [[[SPIDER_MAN], 1] as const, [[SPIDER_MAN, IRON_MAN, SHE_HULK], 3] as const]) {
      const sim = begin(open([...seats], { avatar: "55029a" }));
      const front = onTable(stateOf(sim), "55055")!;
      edit(sim, (s) => patchInstance(s, front, { counters: { synergy: max } }));
      defeatAvatar(sim);
      expect(synergyOn(stateOf(sim), "55055")).toBe(max);
    }
  });

  it("Domineering Force: when a friendly character attacks, remove 1 synergy counter → 4 additional damage", () => {
    const sim = begin(stacked(open()));
    const force = onTable(stateOf(sim), "55052")!;
    const id = villainId(stateOf(sim));
    edit(sim, (s) => patchInstance(s, force, { counters: { synergy: 1 } }));
    apply(
      sim,
      { type: "basicAttack", playerId: P1, attackerInstanceId: identityOf(stateOf(sim)), targetInstanceId: id },
      (s) => {
        const choice = s.pendingChoice!;
        const ours = choice.options.find((o) => (o.optionId as string).includes("55052.domineering-force-interrupt"));
        return ours ? [ours.optionId] : firstLegal(s);
      },
    );
    const s = stateOf(sim);
    expect(synergyOn(s, "55052")).toBe(0);
    // Spider-Man's basic attack deals 2; the counter makes it 6.
    expect(inst(s, id).damage).toBe(6);
    expectReplays(sim);
  });

  it("Mounting Resistance: when a friendly character thwarts, remove 1 synergy counter → 4 additional threat removed", () => {
    const sim = begin(stacked(open()));
    const resistance = onTable(stateOf(sim), "55054")!;
    const main = stateOf(sim).mainScheme.instanceId;
    edit(sim, (s) => patchInstance(patchInstance(s, resistance, { counters: { synergy: 1 } }), main, { threat: 6 }));
    apply(
      sim,
      { type: "basicThwart", playerId: P1, thwarterInstanceId: identityOf(stateOf(sim)), schemeInstanceId: main },
      (s) => {
        const choice = s.pendingChoice!;
        const ours = choice.options.find((o) => (o.optionId as string).includes("55054.mounting-resistance-interrupt"));
        return ours ? [ours.optionId] : firstLegal(s);
      },
    );
    const s = stateOf(sim);
    expect(synergyOn(s, "55054")).toBe(0);
    expect(inst(s, main).threat).toBe(6 - 1 - 4);
    expectReplays(sim);
  });

  it("Unified Front: remove 1 synergy counter → generate two [wild] resources, for any player", () => {
    const sim = begin(stacked(open()));
    const front = onTable(stateOf(sim), "55055")!;
    const hand = moveToHand(stateOf(sim), P1, "01002"); // Black Cat, cost 2
    const cat = hand.ids[0]!;
    edit(sim, () => patchInstance(hand.state, front, { counters: { synergy: 1 } }));
    apply(sim, play(P1, cat, [], { abilities: [resourceAbility(front, "55055.unified-front-resource")] }));
    const s = stateOf(sim);
    expect(synergyOn(s, "55055")).toBe(0);
    expect(playerOf(s, P1).playArea).toContain(cat);
    expect(playerOf(s, P1).hand).not.toContain(cat);
    expectReplays(sim);
  });

  it("Feigned Retreat: when an identity would take damage, remove 1 synergy counter → prevent 4 of it", () => {
    const sim = begin(stacked(open([SPIDER_MAN], { avatar: "55030a" })));
    const retreat = onTable(stateOf(sim), "55053")!;
    const hero = identityOf(stateOf(sim));
    edit(sim, (s) => patchInstance(s, retreat, { counters: { synergy: 1 } }));
    apply(sim, endTurn(P1), (s) => {
      const choice = s.pendingChoice!;
      const ours = choice.options.find((o) => (o.optionId as string).includes("55053.feigned-retreat-interrupt"));
      return ours ? [ours.optionId] : firstLegal(s);
    });
    const s = stateOf(sim);
    expect(synergyOn(s, "55053")).toBe(0);
    expect(inst(s, hero).damage).toBe(0);
    expectReplays(sim);
  });
});
