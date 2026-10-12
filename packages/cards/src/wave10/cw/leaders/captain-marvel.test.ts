import { CW_CARDS } from "@mc/content";
import {
  applyCommand,
  createGame,
  hasKeyword,
  maxHitPoints,
  remainingHitPoints,
  villainStage,
  type GameEvent,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { abilityRefIds } from "../../../ability-refs.js";
import { validateDefinition } from "../../../dsl/validate.js";
import {
  P1,
  P2,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  mainThreat,
  moveToHand,
  patchInstance,
  payWith,
  play,
  settle,
  stackEncounterDeck,
  type Picker,
} from "../../../testing/harness.js";
import { defeatWithAttack, driveEventsPicking, withForm } from "../../../testing/staging.js";
import { attachToHost, engageMinion } from "../../../wave6/mut_gen/project-wideawake-testing.js";
import {
  attacksBy,
  codeOf,
  heroAttacks,
  heroForm,
  heroThwarts,
  piles,
  schemesBy,
  types,
} from "../../../wave9/testing.js";
import { WAVE10_CARDS } from "../../cards.js";
import { wave10Scenario } from "../../setup.js";
import {
  CAPTAIN_MARVEL_SCENARIO,
  WAVE10_DEPS,
  civilWarGame,
  stagedInPlay,
  withoutLeaderSideScheme,
  type CivilWarGameOptions,
} from "../../testing.js";
import { LEADERS_CAPTAIN_MARVEL, LEADERS_CAPTAIN_MARVEL_SKIPPED } from "./captain-marvel.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Captain Marvel, the Registration leader (56092 to 56095) and her set (56098 to 56104), docs/phase7-wave10.md sections
 * 2.3, 3.7, 3.8, 3.20 and 3.22. Every test is a real Civil War game in the `registration-captain-marvel` scenario
 * seated with the Tigra precon (and the Core Spider-Man deck as a second seat), through real commands. The main scheme
 * pair is Homeland Security (56121b) and No Going Back (56124b): stage 1 B has no When Revealed, so the start is quiet.
 * The encounter deck's order (`stackEncounterDeck`), counters on Energy Channel and the odd ally in play are the only
 * surgery.
 *
 * The villain phase draws the villain's boost card first, then deals each player a card (RRG 1.8 "Villain Phase"), so a
 * stack reads "boost, dealt". The Core standard set supplies the boost cards: Advance 01186 and Assault 01187 print no
 * boost icon, Caught Off Guard 01188 and Gang-Up 01189 one, Shadow of the Past 01190 two. Alpha Flight Station 56104 (a
 * side scheme, 3 boost icons) is the harmless card to deal: it enters play and does nothing to the player. A stunned
 * villain's attack and a confused one's scheme are cancelled with no boost card (the status is removed instead).
 */
const REFS = [
  "56092.setup",
  "56092.captain-marvel-forced-response",
  "56093.when-revealed",
  "56093.captain-marvel-forced-response",
  "56094.setup",
  "56094.captain-marvel-forced-response",
  "56095.when-revealed",
  "56095.captain-marvel-forced-response",
  "56098.energy-channel-forced-response",
  "56099.captain-marvels-helmet-constant",
  "56099.captain-marvels-helmet-response",
  "56099.boost",
  "56100.cosmic-flight-forced-interrupt",
  "56100.boost",
  "56101.when-revealed-alter-ego",
  "56101.when-revealed-hero",
  "56102.when-revealed-alter-ego",
  "56102.when-revealed-hero",
  "56103.when-revealed",
  "56103.boost",
  "56104.when-defeated",
];
const SET = ["56092", "56098", "56099", "56100", "56101", "56102", "56103", "56104"];
const HOMELAND_SECURITY = "56121b";
const NO_GOING_BACK = "56124b";
const ADVANCE = "01186";
const ASSAULT = "01187";
const GANG_UP = "01189";
const CAPE_KILLER = "56105";
const CHANNEL = "56098";
const HELMET = "56099";
const ALPHA = "56104";
const ABSORPTION = "56103";
const FLIGHT = "56100";
const BLAST = "56101";
const CRISIS = "56102";
const TWO_GUN_KID = "56010";
const CAPTAIN_MARVEL_DECK = "core-captain-marvel-leadership";
const HAYMAKER = "01087";
const UPPERCUT = "01054";
const WEB_KICK = "01005"; // Swinging Web Kick: an attack event for 8
const MOON_KNIGHT = "56002";

const dataOf = (code: string) => CW_CARDS.find((c) => (c.id as string) === code)! as unknown as Record<string, unknown>;
const villainOf = (s: GameState): InstanceId => s.activeVillainId!;
const hero = (s: GameState, player: PlayerId = P1): InstanceId => identityOf(s, player);
const channelOf = (s: GameState): InstanceId =>
  Object.keys(s.instances).find((i) => codeOf(s, i as InstanceId) === CHANNEL) as InstanceId;
const energyOn = (s: GameState): number => inst(s, channelOf(s)).counters["energy"] ?? 0;
const withEnergy = (s: GameState, n: number): GameState =>
  patchInstance(s, channelOf(s), { counters: { ...inst(s, channelOf(s)).counters, energy: n } });
const damageOn = (s: GameState, id: InstanceId): number => inst(s, id).damage;
const withDamage = (s: GameState, id: InstanceId, n: number): GameState => patchInstance(s, id, { damage: n });
const attachedCodes = (s: GameState): string[] => inst(s, villainOf(s)).attachments.map((a) => codeOf(s, a));
const inEncounterPiles = (s: GameState, code: string) =>
  [...piles(s).deck, ...piles(s).discard].filter((i) => codeOf(s, i) === code).length;
const discardCodes = (s: GameState): string[] => piles(s).discard.map((i) => codeOf(s, i));
const status = (s: GameState, id: InstanceId, name: "stunned" | "confused" | "tough", n: number): GameState =>
  patchInstance(s, id, { statuses: { ...inst(s, id).statuses, [name]: n } });
const ready = (s: GameState, player: PlayerId = P1): GameState =>
  patchInstance(s, hero(s, player), { exhausted: false });

/** Stage 1A revealed Alpha Flight Station at Setup; most tests deal it later as an ordinary card, so it starts back in the discard pile. */
const alterEgoGame = (opts: CivilWarGameOptions = {}) =>
  civilWarGame(CAPTAIN_MARVEL_SCENARIO, {
    mainSchemeStageIds: [HOMELAND_SECURITY, NO_GOING_BACK] as never,
    leaderSideScheme: "discarded",
    ...opts,
  });
const heroGame = (opts: CivilWarGameOptions = {}) => heroForm(alterEgoGame(opts));

/** The first player ends the turn and the villain phase runs on the stacked deck. */
const villainPhase = (state: GameState, pick: Picker, ...stack: string[]) =>
  driveEventsPicking(WAVE10_DEPS, stack.length > 0 ? stackEncounterDeck(state, ...stack) : state, pick, endTurn(P1));

/** An ally attack on the villain with a basic attack. */
const allyAttacks = (state: GameState, ally: InstanceId, pick: Picker = firstLegal) =>
  driveEventsPicking(WAVE10_DEPS, state, pick, {
    type: "basicAttack",
    playerId: P1,
    attackerInstanceId: ally,
    targetInstanceId: villainOf(state),
  });

/** Picks `defender` when a defender is asked for and the first legal option otherwise. */
const choosing =
  (defender: InstanceId): Picker =>
  (s) => {
    const choice = s.pendingChoice!;
    if (choice.prompt.kind === "declareDefender" && choice.options.some((o) => (o.optionId as string) === defender))
      return [defender];
    return firstLegal(s);
  };

describe("registry", () => {
  it("registers the twenty-one refs of the eight cards, each a valid definition, and skips nothing", () => {
    expect(Object.keys(LEADERS_CAPTAIN_MARVEL).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(LEADERS_CAPTAIN_MARVEL)) expect(validateDefinition(def), id).toEqual([]);
    expect(LEADERS_CAPTAIN_MARVEL_SKIPPED).toEqual({});
  });

  it("the data names exactly these refs for the cards", () => {
    const refs = WAVE10_CARDS.filter((c) => SET.includes(c.id as string)).flatMap(abilityRefIds);
    expect(refs.sort()).toEqual([...REFS].sort());
  });
});

describe("Setup: the enemy team finds Energy Channel and attaches it to Captain Marvel (stage I and stage III)", () => {
  it.each([
    ["standard", 1, 1, 14],
    ["standard", 2, 1, 28],
    ["expert", 1, 3, 18],
    ["expert", 2, 3, 36],
  ] as const)(
    "%s, %i player(s): stage %s with %i hit points, Energy Channel attached with no counter, no question asked",
    (mode, players, stage, hp) => {
      const s = civilWarGame(CAPTAIN_MARVEL_SCENARIO, {
        difficulty: mode,
        twoPlayers: players === 2,
        mainSchemeStageIds: [HOMELAND_SECURITY, NO_GOING_BACK] as never,
      });
      const v = villainOf(s);
      expect(s.pendingChoice).toBeNull();
      expect(codeOf(s, v)).toBe("56092");
      expect(villainStage(s).stageNumber).toBe(stage);
      expect([maxHitPoints(s, v), remainingHitPoints(s, v)]).toEqual([hp, hp]);
      expect(attachedCodes(s)).toEqual([CHANNEL]);
      expect(inst(s, channelOf(s)).attachedTo).toBe(v);
      expect(inst(s, channelOf(s)).faceup).toBe(true);
      expect(inst(s, channelOf(s)).counters).toEqual({});
      // Not in the deck or the discard pile any more; the rest of her set is still there.
      expect(inEncounterPiles(s, CHANNEL)).toBe(0);
      expect(inEncounterPiles(s, HELMET)).toBe(1);
      // Stage 1A revealed her side scheme at Setup.
      expect(inEncounterPiles(s, ALPHA)).toBe(0);
      expect(s.villainArea.map((i) => codeOf(s, i))).toEqual([ALPHA]);
    },
  );
});

describe("Energy Channel (56098)", () => {
  it("is data: a Permanent attachment to the villain, with the erratum's text", () => {
    const card = dataOf(CHANNEL);
    expect([card.type, card.keywords, card.attachesTo]).toEqual([
      "attachment",
      [{ name: "permanent" }],
      { kind: "villain" },
    ]);
    expect((card.text as { current: string }).current).toContain(
      "remove all of them and Captain Marvel attacks that character",
    );
  });

  it("FORCED RESPONSE: after the hero attacks Captain Marvel, one energy counter is placed (14 - 2 = 12 hit points)", () => {
    const start = ready(heroGame());
    const run = heroAttacks(WAVE10_DEPS, start, villainOf(start));
    expect(remainingHitPoints(run.state, villainOf(run.state))).toBe(12);
    expect(energyOn(run.state)).toBe(1);
    expect(attacksBy(run.state, run.events, "56092")).toEqual([]);
  });

  it("an ally's attack places one too (Moon Knight, ATK 2)", () => {
    const ally = stagedInPlay(heroGame(), MOON_KNIGHT);
    const run = allyAttacks(ally.state, ally.id);
    expect(remainingHitPoints(run.state, villainOf(run.state))).toBe(12);
    expect(energyOn(run.state)).toBe(1);
    expect(damageOn(run.state, ally.id)).toBe(1);
  });

  it("the attack is what counts, not the damage: a tough status card absorbs it and the counter is still placed", () => {
    const base = heroGame();
    const start = ready(status(base, villainOf(base), "tough", 1));
    const run = heroAttacks(WAVE10_DEPS, start, villainOf(start));
    expect(remainingHitPoints(run.state, villainOf(run.state))).toBe(14);
    expect(inst(run.state, villainOf(run.state)).statuses.tough).toBe(0);
    expect(energyOn(run.state)).toBe(1);
  });

  it.each([
    [0, 1],
    [1, 2],
    [2, 3],
  ])("%i counter(s) before the attack: %i after, and Captain Marvel does not attack", (before, after) => {
    const start = ready(withEnergy(heroGame(), before));
    const run = heroAttacks(WAVE10_DEPS, start, villainOf(start));
    expect(energyOn(run.state)).toBe(after);
    expect(attacksBy(run.state, run.events, "56092")).toEqual([]);
    expect(damageOn(run.state, hero(run.state))).toBe(0);
  });

  it("the fourth counter: all four are removed and Captain Marvel attacks the hero with overkill (ATK 2 + 1 boost icon = 3)", () => {
    const start = ready(withEnergy(heroGame(), 3));
    const run = driveEventsPicking(WAVE10_DEPS, stackEncounterDeck(start, GANG_UP), firstLegal, {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: hero(start),
      targetInstanceId: villainOf(start),
    });
    expect(energyOn(run.state)).toBe(0);
    expect(attacksBy(run.state, run.events, "56092")).toMatchObject([{ baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
    expect(damageOn(run.state, hero(run.state))).toBe(3);
    expect(remainingHitPoints(run.state, villainOf(run.state))).toBe(12);
  });

  // RRG 1.8 "Consequential Damage" (p. 13) is dealt after the attack and its own responses (tier 5), so the response
  // sees the ally with the hit points it had before the attack: docs/phase7-wave10.md section 3.20 expected an ally to
  // die to its consequential damage before the response, which the rule does not allow.
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
  ])(
    "an ally with %i damage attacks: Captain Marvel (ATK 2 + 1 icon = 3) defeats it and %i excess damage reaches the hero (overkill)",
    (damage, spilled) => {
      const ally = stagedInPlay(withEnergy(heroGame(), 3), MOON_KNIGHT);
      const hurt = withDamage(ally.state, ally.id, damage);
      const run = driveEventsPicking(WAVE10_DEPS, stackEncounterDeck(hurt, GANG_UP), firstLegal, {
        type: "basicAttack",
        playerId: P1,
        attackerInstanceId: ally.id,
        targetInstanceId: villainOf(hurt),
      });
      expect(attacksBy(run.state, run.events, "56092")).toMatchObject([{ baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
      expect(run.state.players[0]!.discard).toContain(ally.id);
      expect(damageOn(run.state, hero(run.state))).toBe(spilled);
      // The fourth counter emptied the card; her attack that defeated the ally placed one new counter.
      expect(energyOn(run.state)).toBe(1);
    },
  );

  it("a fifth counter in reach: 5 counters before the attack still empty the card to 0 (the threshold is at least 4)", () => {
    const start = ready(withEnergy(heroGame(), 5));
    const run = heroAttacks(WAVE10_DEPS, start, villainOf(start));
    expect(energyOn(run.state)).toBe(0);
    expect(attacksBy(run.state, run.events, "56092")).toHaveLength(1);
  });

  it("without Energy Channel in play the attack places nothing and nothing breaks", () => {
    const base = ready(heroGame());
    const gone = patchInstance(patchInstance(base, villainOf(base), { attachments: [] }), channelOf(base), {
      attachedTo: null,
    });
    const run = heroAttacks(WAVE10_DEPS, gone, villainOf(gone));
    expect(remainingHitPoints(run.state, villainOf(run.state))).toBe(12);
  });
});

describe("Captain Marvel's Forced Response: after she attacks and defeats a character, place 1 energy counter on Energy Channel", () => {
  /** Moon Knight with `damage` on him in play; the villain phase runs with him as the defender. */
  const defended = (damage: number, ...stack: string[]) => {
    const ally = stagedInPlay(heroGame(), MOON_KNIGHT);
    const state = withDamage(ally.state, ally.id, damage);
    return { ally: ally.id, run: villainPhase(state, choosing(ally.id), ADVANCE, ...stack) };
  };

  it("an ally she defeats in an attack: one counter (Moon Knight, 1 hit point left... ATK 2 defeats 2 hit points)", () => {
    const { ally, run } = defended(1, ALPHA);
    expect(attacksBy(run.state, run.events, "56092")).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    expect(run.state.players[0]!.discard).toContain(ally);
    expect(damageOn(run.state, hero(run.state))).toBe(0);
    expect(energyOn(run.state)).toBe(1);
  });

  it("an ally that survives her attack: no counter", () => {
    const { ally, run } = defended(0, ALPHA);
    expect(run.state.players[0]!.playArea).toContain(ally);
    expect(damageOn(run.state, ally)).toBe(2);
    expect(energyOn(run.state)).toBe(0);
  });

  it("an attack on the hero that does not defeat the hero: no counter", () => {
    const run = villainPhase(heroGame(), firstLegal, ADVANCE, ALPHA);
    expect(damageOn(run.state, hero(run.state))).toBe(2);
    expect(energyOn(run.state)).toBe(0);
  });

  it("a minion's attack that defeats an ally is not hers: no counter", () => {
    const base = heroGame();
    const ally = stagedInPlay(base, MOON_KNIGHT);
    const hurt = withDamage(ally.state, ally.id, 1);
    // Stunned, her own attack is cancelled with no boost card; Cape-Killer (ATK 2) attacks and the ally defends.
    const quiet = status(hurt, villainOf(hurt), "stunned", 1);
    const withMinion = engageMinion(quiet, CAPE_KILLER, P1);
    const run = villainPhase(withMinion.state, choosing(ally.id), ADVANCE, ALPHA);
    expect(attacksBy(run.state, run.events, "56092")).toEqual([]);
    expect(attacksBy(run.state, run.events, CAPE_KILLER)).toHaveLength(1);
    expect(run.state.players[0]!.discard).toContain(ally.id);
    expect(energyOn(run.state)).toBe(0);
  });

  it("the hero she defeats counts too (a character is an identity as well as an ally)", () => {
    const base = heroGame({ twoPlayers: true });
    const hp = maxHitPoints(base, hero(base))!;
    const dying = withDamage(base, hero(base), hp - 2);
    const run = driveEventsPicking(
      WAVE10_DEPS,
      stackEncounterDeck(dying, ADVANCE, ASSAULT, ALPHA),
      firstLegal,
      endTurn(P1),
      endTurn(P2),
    );
    expect(attacksBy(run.state, run.events, "56092")[0]).toMatchObject({ baseAtk: 2, damageDealt: 2 });
    expect(run.state.players[0]!.eliminated).toBe(true);
    expect(run.state.players[1]!.eliminated).toBe(false);
    expect(energyOn(run.state)).toBe(1);
  });

  it("once per character defeated (FFG ruling Jan 11, 2026): with overkill she defeats an ally and then the identity, 2 counters", () => {
    // Two players so the game goes on. The fourth counter makes her attack the ally with overkill; Moon Knight has 1 hit
    // point left and the first player's hero 1, so ATK 2 + 1 icon = 3 defeats the ally (1) and then the hero (2 excess).
    const base = withEnergy(heroGame({ twoPlayers: true }), 3);
    const ally = stagedInPlay(base, MOON_KNIGHT);
    const dying = withDamage(withDamage(ally.state, ally.id, 2), hero(base), maxHitPoints(base, hero(base))! - 1);
    const run = driveEventsPicking(WAVE10_DEPS, stackEncounterDeck(dying, GANG_UP), firstLegal, {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: ally.id,
      targetInstanceId: villainOf(dying),
    });
    expect(attacksBy(run.state, run.events, "56092")).toMatchObject([{ baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
    expect(run.state.players[0]!.discard).toContain(ally.id);
    expect(run.state.players[0]!.eliminated).toBe(true);
    expect(energyOn(run.state)).toBe(2);
  });
});

describe("advancing: stage I to II (standard) and III to IV (expert)", () => {
  it.each([
    ["standard", 2, 18, 2, 2],
    ["expert", 4, 22, 3, 2],
  ] as const)("%s: stage %i has %i hit points, ATK %i, SCH %i, Steady", (mode, stage, hp, atk, sch) => {
    const start = withEnergy(heroGame({ difficulty: mode }), 2);
    const v = villainOf(start);
    const defeated = defeatWithAttack(WAVE10_DEPS, stackEncounterDeck(start, ALPHA), v);
    expect(villainStage(defeated).stageNumber).toBe(stage);
    expect([maxHitPoints(defeated, v), remainingHitPoints(defeated, v)]).toEqual([hp, hp]);
    expect([villainStage(defeated).atk, villainStage(defeated).sch]).toEqual([atk, sch]);
    expect(hasKeyword(defeated, v, "steady", WAVE10_DEPS)).toBe(true);
    // Energy Channel stays on her with its counters (the stage change is not a Setup), and the attack that defeated stage I
    // was an attack on her: 2 + 1.
    expect(attachedCodes(defeated)).toEqual([CHANNEL]);
    expect(energyOn(defeated)).toBe(3);
    // Deal each player an encounter card: the stacked Alpha Flight Station.
    expect(defeated.players[0]!.dealtEncounter.map((i) => codeOf(defeated, i))).toEqual([ALPHA]);
  });

  it.each([
    ["standard", 2],
    ["expert", 4],
  ] as const)("%s, stage %i: she cannot take damage this phase, and can in the next", (mode, stage) => {
    const start = heroGame({ difficulty: mode });
    const v = villainOf(start);
    const defeated = defeatWithAttack(WAVE10_DEPS, stackEncounterDeck(start, ALPHA), v);
    expect(villainStage(defeated).stageNumber).toBe(stage);
    const full = remainingHitPoints(defeated, v)!;
    const again = ready(defeated);
    const refused = applyCommand(
      again,
      { type: "basicAttack", playerId: P1, attackerInstanceId: hero(again), targetInstanceId: v },
      WAVE10_DEPS,
    );
    expect(refused).toMatchObject({ ok: false, error: { code: "no_valid_target" } });
    const next = villainPhase(again, firstLegal, ADVANCE, ABSORPTION);
    const hit = heroAttacks(WAVE10_DEPS, ready(next.state), v);
    expect(remainingHitPoints(hit.state, v)).toBe(full - 2);
  });

  it.each([
    ["standard", 2, 2],
    ["expert", 4, 3],
  ] as const)("%s, stage %i: Forced Response places a counter when she defeats a character", (mode, _stage, atk) => {
    const start = heroGame({ difficulty: mode });
    const defeated = defeatWithAttack(WAVE10_DEPS, stackEncounterDeck(start, ALPHA), villainOf(start));
    const ally = stagedInPlay(ready(defeated), MOON_KNIGHT);
    const hurt = withDamage(ally.state, ally.id, 3 - atk);
    expect(energyOn(hurt)).toBe(1);
    const run = villainPhase(hurt, choosing(ally.id), ADVANCE, HELMET);
    expect(attacksBy(run.state, run.events, "56092")).toMatchObject([{ baseAtk: atk, damageDealt: atk }]);
    expect(run.state.players[0]!.discard).toContain(ally.id);
    // The attack that defeated the previous stage placed the first counter, her defeat of the ally the second.
    expect(energyOn(run.state)).toBe(2);
  });

  it("stage I (no restriction): a hero hit takes 2 hit points", () => {
    const start = ready(heroGame());
    expect(remainingHitPoints(heroAttacks(WAVE10_DEPS, start, villainOf(start)).state, villainOf(start))).toBe(12);
  });
});

/** `n` cards of each listed printed resource type (and of no other) moved from the player's deck into their hand. */
function handFor(state: GameState, wanted: readonly ("energy" | "mental" | "physical")[]) {
  const owner = state.players.find((p) => p.playerId === P1)!;
  const used: InstanceId[] = [];
  for (const type of wanted) {
    const id = [...owner.hand, ...owner.deck].find((i) => {
      const card = state.cardPool[state.instances[i]!.cardId]!;
      const icons = ("resourceIcons" in card ? card.resourceIcons : undefined) ?? {};
      const others = Object.entries(icons).filter(([k, n]) => k !== type && (n ?? 0) > 0);
      return !used.includes(i) && (icons[type] ?? 0) > 0 && others.length === 0;
    });
    if (!id) throw new Error(`no ${type}-only card for p1`);
    used.push(id);
  }
  return {
    ids: used,
    state: {
      ...state,
      players: state.players.map((p) =>
        p.playerId === P1 ? { ...p, deck: p.deck.filter((i) => !used.includes(i)), hand: [...used] } : p,
      ),
    },
  };
}

/** Takes the card's response when it is offered, pays with `pay`, and records every option offered. */
const respondingTo = (code: string, pay: readonly InstanceId[], offered: string[] = []): Picker => {
  return (s) => {
    const c = s.pendingChoice!;
    if (c.prompt.kind === "chooseTriggers") {
      offered.push(...c.options.map((o) => o.optionId));
      const take = c.options.find((o) => o.optionId.includes(`${code}.`) && o.optionId.includes("response"));
      return take ? [take.optionId] : firstLegal(s);
    }
    if (c.prompt.kind === "payForAbility") return pay.map((id) => `hand:${id}`);
    return firstLegal(s);
  };
};

describe("Captain Marvel's Helmet (56099)", () => {
  it("is data: a unique attachment with +1 SCH and a boost star", () => {
    const card = dataOf(HELMET);
    expect([card.type, card.unique, card.statModifiers, card.starIcon, card.boostIcons]).toEqual([
      "attachment",
      true,
      { sch: 1 },
      true,
      0,
    ]);
  });

  it("revealed it attaches to Captain Marvel: stalwart, and +1 SCH on her scheme (1 + 1 = 2)", () => {
    const base = alterEgoGame();
    const without = hasKeyword(base, villainOf(base), "stalwart", WAVE10_DEPS);
    const run = villainPhase(status(base, villainOf(base), "confused", 1), firstLegal, HELMET);
    expect(without).toBe(false);
    expect(attachedCodes(run.state)).toEqual([CHANNEL, HELMET]);
    expect(hasKeyword(run.state, villainOf(run.state), "stalwart", WAVE10_DEPS)).toBe(true);
    const withHelmet = attachToHost(base, HELMET, villainOf(base));
    const scheme = villainPhase(withHelmet.state, firstLegal, ADVANCE, ALPHA);
    expect(schemesBy(scheme.state, scheme.events, "56092")).toMatchObject([{ baseSch: 2 }]);
    const plain = villainPhase(base, firstLegal, ADVANCE, ALPHA);
    expect(schemesBy(plain.state, plain.events, "56092")).toMatchObject([{ baseSch: 1 }]);
  });

  describe("Hero Response: after you make a basic attack against Captain Marvel, spend 3 resources of the same type -> discard", () => {
    const attacked = (types: readonly ("energy" | "mental" | "physical")[], pay: number) => {
      const base = ready(heroGame());
      const attached = attachToHost(base, HELMET, villainOf(base));
      const staged = handFor(attached.state, types);
      const offered: string[] = [];
      const run = heroAttacks(WAVE10_DEPS, staged.state, villainOf(staged.state), {
        pick: respondingTo(HELMET, staged.ids.slice(0, pay), offered),
      });
      return { staged, run, offered };
    };

    it("three physical resources paid: the Helmet is discarded with them, and Captain Marvel took the 2 damage", () => {
      const { staged, run, offered } = attacked(["physical", "physical", "physical"], 3);
      expect(offered.some((o) => o.includes("56099.captain-marvels-helmet-response"))).toBe(true);
      expect(attachedCodes(run.state)).toEqual([CHANNEL]);
      expect(discardCodes(run.state)).toContain(HELMET);
      for (const id of staged.ids) expect(run.state.players[0]!.discard).toContain(id);
      expect(damageOn(run.state, villainOf(run.state))).toBe(2);
    });

    it("declined, it stays attached and nothing is spent", () => {
      const { staged, run } = attacked(["physical", "physical", "physical"], 0);
      expect(attachedCodes(run.state)).toEqual([CHANNEL, HELMET]);
      expect(run.state.players[0]!.hand).toEqual(expect.arrayContaining([...staged.ids]));
    });

    it("three resources that are not of one type (2 physical, 1 energy) cannot pay: the Helmet stays and the cards are not spent", () => {
      const { staged, run } = attacked(["physical", "physical", "energy"], 3);
      expect(attachedCodes(run.state)).toEqual([CHANNEL, HELMET]);
      expect(run.state.players[0]!.hand).toEqual(expect.arrayContaining([...staged.ids]));
    });

    it("only two resources in hand cannot pay either", () => {
      const { run, offered } = attacked(["physical", "physical"], 2);
      expect(offered.some((o) => o.includes("56099.captain-marvels-helmet-response"))).toBe(false);
      expect(attachedCodes(run.state)).toEqual([CHANNEL, HELMET]);
    });

    it("an ally's attack is not 'you make a basic attack': no response", () => {
      const base = heroGame();
      const attached = attachToHost(base, HELMET, villainOf(base));
      const ally = stagedInPlay(attached.state, MOON_KNIGHT);
      const staged = handFor(ally.state, ["physical", "physical", "physical"]);
      const offered: string[] = [];
      const run = allyAttacks(staged.state, ally.id, respondingTo(HELMET, staged.ids, offered));
      expect(offered.some((o) => o.includes("56099.captain-marvels-helmet-response"))).toBe(false);
      expect(attachedCodes(run.state)).toEqual([CHANNEL, HELMET]);
    });
  });

  it("[star] BOOST: revealed from the boost card, it attaches (no boost icons)", () => {
    const run = villainPhase(heroGame(), firstLegal, HELMET, ALPHA);
    expect(attacksBy(run.state, run.events, "56092")).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    expect(attachedCodes(run.state)).toEqual([CHANNEL, HELMET]);
  });
});

describe("Cosmic Flight (56100)", () => {
  /** An attack event from hand (swapped into the Tigra deck), played against Captain Marvel. */
  const playEvent = (state: GameState, code: string, cost: number): GameState => {
    const given = moveToHand(state, P1, code);
    return driveEventsPicking(
      WAVE10_DEPS,
      given.state,
      firstLegal,
      play(P1, given.ids[0]!, payWith(given.state, P1, cost, given.ids)),
    ).state;
  };
  const haymaker = (state: GameState) => playEvent(state, HAYMAKER, 2);
  const uppercut = (state: GameState) => playEvent(state, UPPERCUT, 3);
  const flightGame = (copies: number, third?: string) => {
    let state = ready(
      heroGame({ swap: { "56012": HAYMAKER, "56013": UPPERCUT, ...(third ? { "56014": third } : {}) } }),
    );
    for (let i = 0; i < copies; i++) state = attachToHost(state, FLIGHT, villainOf(state)).state;
    return state;
  };

  it("is data: +1 ATK, a boost star", () => {
    const card = dataOf(FLIGHT);
    expect([card.statModifiers, card.starIcon, card.boostIcons, card.quantityInSet]).toEqual([{ atk: 1 }, true, 0, 2]);
  });

  it("an attack that deals 3 damage is left alone and the card stays (exactly 3 is not more than 3)", () => {
    const state = flightGame(1);
    const after = haymaker(state);
    expect(damageOn(after, villainOf(after))).toBe(3);
    expect(attachedCodes(after)).toEqual([CHANNEL, FLIGHT]);
  });

  it("an attack that deals 2 damage is left alone and the card stays", () => {
    const state = flightGame(1);
    const run = heroAttacks(WAVE10_DEPS, state, villainOf(state));
    expect(damageOn(run.state, villainOf(run.state))).toBe(2);
    expect(attachedCodes(run.state)).toEqual([CHANNEL, FLIGHT]);
  });

  it("an attack that would deal more than 3 is reduced to 3 and the card is discarded (Uppercut: 5 becomes 3)", () => {
    const after = uppercut(flightGame(1));
    expect(damageOn(after, villainOf(after))).toBe(3);
    expect(attachedCodes(after)).toEqual([CHANNEL]);
    expect(discardCodes(after)).toContain(FLIGHT);
  });

  it("without the card the same attack deals its 5 (control)", () => {
    const after = uppercut(ready(heroGame({ swap: { "56012": HAYMAKER, "56013": UPPERCUT } })));
    expect(damageOn(after, villainOf(after))).toBe(5);
  });

  /** The same play, with its events. */
  const playEventRun = (state: GameState, code: string, cost: number) => {
    const given = moveToHand(state, P1, code);
    return driveEventsPicking(
      WAVE10_DEPS,
      given.state,
      firstLegal,
      play(P1, given.ids[0]!, payWith(given.state, P1, cost, given.ids)),
    );
  };
  const flightsOn = (state: GameState) => attachedCodes(state).filter((c) => c === FLIGHT);
  const flightsDiscarded = (state: GameState) => discardCodes(state).filter((c) => c === FLIGHT);
  const lapsed = (events: readonly GameEvent[]) =>
    events.flatMap((e) => (e.type === "interruptConditionLapsed" ? [[e.abilityId as string, e.event.kind]] : []));
  const capped = (events: readonly GameEvent[]) => events.flatMap((e) => (e.type === "damageCapped" ? [e.amount] : []));

  // Owner's answer to question 29 = B (2026-10-12), an interpretation of RRG 1.8 "Interrupt" (p. 25: "If an interrupt
  // changes (via a replacement effect) or cancels an imminent triggering condition, further interrupts to the original
  // triggering condition cannot be triggered") and "Replacement Effect" (p. 37), not an FFG ruling on this card.
  it("two copies, one hit of 8 (Swinging Web Kick): the first copy makes it 3, which the second no longer answers: 3 taken, one copy discarded, one still attached", () => {
    const run = playEventRun(flightGame(2, WEB_KICK), WEB_KICK, 3);
    expect(damageOn(run.state, villainOf(run.state))).toBe(3);
    expect(flightsOn(run.state)).toEqual([FLIGHT]);
    expect(flightsDiscarded(run.state)).toEqual([FLIGHT]);
    expect(capped(run.events)).toEqual([5]);
    expect(lapsed(run.events)).toEqual([["56100.cosmic-flight-forced-interrupt", "dealDamage"]]);
    expect(
      run.events.filter((e) => e.type === "abilityResolved" && e.abilityId === "56100.cosmic-flight-forced-interrupt"),
    ).toHaveLength(1);
  });

  it("two copies, then a second hit of 5 (Uppercut): the copy that stayed makes it 3 and is discarded: 6 taken in all, none attached", () => {
    const first = playEventRun(flightGame(2, WEB_KICK), WEB_KICK, 3);
    // Three more cards from the deck to pay for the second event.
    let refilled = ready(first.state);
    for (const id of first.state.players[0]!.deck.slice(0, 3))
      refilled = moveToHand(refilled, P1, codeOf(refilled, id)).state;
    const second = playEventRun(refilled, UPPERCUT, 3);
    expect(damageOn(second.state, villainOf(second.state))).toBe(6);
    expect(flightsOn(second.state)).toEqual([]);
    expect(flightsDiscarded(second.state)).toEqual([FLIGHT, FLIGHT]);
    expect(capped(second.events)).toEqual([2]);
    expect(lapsed(second.events)).toEqual([]);
  });

  it("two copies, a hit of exactly 3 (Haymaker): neither triggers and both stay", () => {
    const run = playEventRun(flightGame(2), HAYMAKER, 2);
    expect(damageOn(run.state, villainOf(run.state))).toBe(3);
    expect(flightsOn(run.state)).toEqual([FLIGHT, FLIGHT]);
    expect(capped(run.events)).toEqual([]);
    expect(lapsed(run.events)).toEqual([]);
  });

  it("one copy and a tough status card, a hit of 5: the tough card resolves first and prevents it all (RRG 1.8 'Ability', Simultaneous Timing Priority, p. 5: status card Forced Interrupts before Forced Interrupts), so the copy does not trigger and stays", () => {
    const base = flightGame(1);
    const tough = patchInstance(base, villainOf(base), {
      statuses: { ...inst(base, villainOf(base)).statuses, tough: 1 },
    });
    const run = playEventRun(tough, UPPERCUT, 3);
    expect(inst(run.state, villainOf(run.state)).statuses.tough).toBe(0);
    expect(damageOn(run.state, villainOf(run.state))).toBe(0);
    expect(flightsOn(run.state)).toEqual([FLIGHT]);
    expect(capped(run.events)).toEqual([]);
  });

  it("[star] BOOST: revealed from the boost card it attaches", () => {
    const run = villainPhase(heroGame(), firstLegal, FLIGHT, ALPHA);
    expect(attachedCodes(run.state)).toEqual([CHANNEL, FLIGHT]);
  });
});

/** Picks `id` when a prompt offers it as an option (a target, a defender) and the first legal option otherwise. */
const picksCard =
  (id: InstanceId): Picker =>
  (s) => {
    const choice = s.pendingChoice!;
    return choice.options.some((o) => (o.optionId as string) === id) ? [id] : firstLegal(s);
  };

describe("Photonic Blast (56101)", () => {
  it("(Alter-Ego) discards an ally or support you control: the chosen one, not the other", () => {
    const base = alterEgoGame();
    const kid = stagedInPlay(base, TWO_GUN_KID);
    const knight = stagedInPlay(kid.state, MOON_KNIGHT);
    const run = villainPhase(status(knight.state, villainOf(base), "confused", 1), picksCard(kid.id), BLAST);
    expect(run.state.players[0]!.discard).toContain(kid.id);
    expect(run.state.players[0]!.playArea).toContain(knight.id);
    expect(energyOn(run.state)).toBe(0);
  });

  it("(Alter-Ego) with no ally or support in play nothing is discarded and nothing else happens", () => {
    const base = alterEgoGame();
    const run = villainPhase(status(base, villainOf(base), "confused", 1), firstLegal, BLAST);
    expect(run.state.players[0]!.discard.filter((i) => codeOf(run.state, i) === BLAST)).toEqual([]);
    expect(energyOn(run.state)).toBe(0);
    expect(damageOn(run.state, hero(run.state))).toBe(0);
  });

  it("(Hero) Captain Marvel attacks you (ATK 2 + 1 boost icon = 3) and one energy counter is placed", () => {
    const base = heroGame();
    // Stunned, her own activation only loses the status; Blast's attack is the one attack of the phase.
    const run = villainPhase(status(base, villainOf(base), "stunned", 1), firstLegal, BLAST, GANG_UP);
    expect(attacksBy(run.state, run.events, "56092")).toMatchObject([{ baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
    expect(damageOn(run.state, hero(run.state))).toBe(3);
    expect(energyOn(run.state)).toBe(1);
  });

  it("(Hero) the counter is placed even when the attack is stopped by a tough status card", () => {
    const base = heroGame();
    const prepared = status(status(base, villainOf(base), "stunned", 1), hero(base), "tough", 1);
    const run = villainPhase(prepared, firstLegal, BLAST, GANG_UP);
    expect(damageOn(run.state, hero(run.state))).toBe(0);
    expect(energyOn(run.state)).toBe(1);
  });

  it("the boost icon alone: as a boost card it adds 1 and places no counter", () => {
    const run = villainPhase(heroGame(), firstLegal, BLAST, ALPHA);
    expect(attacksBy(run.state, run.events, "56092")).toMatchObject([{ baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
    expect(energyOn(run.state)).toBe(0);
  });
});

describe("Crisis Interdiction (56102)", () => {
  it("(Alter-Ego) Captain Marvel schemes (SCH 1 + 1 boost icon) and one energy counter is placed", () => {
    const base = alterEgoGame();
    const run = villainPhase(status(base, villainOf(base), "confused", 1), firstLegal, CRISIS, GANG_UP);
    expect(schemesBy(run.state, run.events, "56092")).toMatchObject([{ baseSch: 1, boostIcons: 1 }]);
    expect(energyOn(run.state)).toBe(1);
  });

  it("(Hero) 2 threat on each scheme: the main scheme and every side scheme in play", () => {
    const base = heroGame({ leaderSideScheme: "inPlay" });
    const alpha = base.villainArea.find((i) => codeOf(base, i) === ALPHA)!;
    expect(inst(base, alpha).threat).toBe(3);
    const quiet = status(base, villainOf(base), "stunned", 1);
    const control = villainPhase(quiet, firstLegal, HELMET);
    const run = villainPhase(quiet, firstLegal, CRISIS);
    expect(inst(run.state, alpha).threat).toBe(inst(control.state, alpha).threat + 2);
    expect(inst(run.state, alpha).threat).toBe(5);
    // The villain phase's own step 1 put 1 threat on the main scheme in both runs; Crisis Interdiction adds 2.
    expect(mainThreat(control.state)).toBe(1);
    expect(mainThreat(run.state)).toBe(3);
    expect(energyOn(run.state)).toBe(0);
  });

  it("(Hero) with no side scheme in play only the main scheme gets the threat", () => {
    const base = heroGame();
    const quiet = status(base, villainOf(base), "stunned", 1);
    const control = villainPhase(quiet, firstLegal, HELMET);
    const run = villainPhase(quiet, firstLegal, CRISIS);
    expect([mainThreat(control.state), mainThreat(run.state)]).toEqual([1, 3]);
  });
});

describe("Energy Absorption (56103)", () => {
  const confusedStart = (energy: number, damage: number) => {
    const base = alterEgoGame();
    return withDamage(withEnergy(status(base, villainOf(base), "confused", 1), energy), villainOf(base), damage);
  };

  it.each([
    [2, 5, 3, 2],
    [0, 5, 1, 4],
    [3, 1, 4, 0],
  ])(
    "WHEN REVEALED with %i counter(s) and %i damage on her: %i counter(s), then she heals that many: %i damage",
    (energy, damage, counters, left) => {
      const run = villainPhase(confusedStart(energy, damage), firstLegal, ABSORPTION);
      expect(energyOn(run.state)).toBe(counters);
      expect(damageOn(run.state, villainOf(run.state))).toBe(left);
    },
  );

  it("[star] BOOST: one energy counter is placed, no boost icons", () => {
    const run = villainPhase(heroGame(), firstLegal, ABSORPTION, ALPHA);
    expect(attacksBy(run.state, run.events, "56092")).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    expect(energyOn(run.state)).toBe(1);
  });
});

describe("Alpha Flight Station (56104)", () => {
  /** The real board: stage 1A's Setup revealed it; the hero thwarts with Tigra's THW. */
  const board = () => heroGame({ leaderSideScheme: "inPlay" });
  const alphaOf = (s: GameState): InstanceId => s.villainArea.find((i) => codeOf(s, i) === ALPHA)!;

  it("is data: 3 threat per player, an amplify icon, 3 boost icons", () => {
    const card = dataOf(ALPHA);
    expect([card.startingThreat, card.amplifyIcons, card.boostIcons]).toEqual([{ base: 0, perPlayer: 3 }, 1, 3]);
  });

  it("WHEN DEFEATED: 3 energy counters are placed on Energy Channel", () => {
    const start = ready(board());
    const nearly = patchInstance(start, alphaOf(start), { threat: 1 });
    const run = heroThwarts(WAVE10_DEPS, nearly, alphaOf(start));
    expect(inst(run.state, alphaOf(start)).threat).toBe(0);
    expect(energyOn(run.state)).toBe(3);
    expect(discardCodes(run.state)).toContain(ALPHA);
  });

  it("not defeated (3 threat, 1 removed): nothing is placed", () => {
    const start = ready(board());
    const run = heroThwarts(WAVE10_DEPS, start, alphaOf(start));
    expect(inst(run.state, alphaOf(start)).threat).toBe(2);
    expect(energyOn(run.state)).toBe(0);
  });

  it("counters past the threshold wait for the next trigger: 2 + 3 = 5, Captain Marvel does not attack, the next hero attack empties it", () => {
    const start = ready(withEnergy(board(), 2));
    const nearly = patchInstance(start, alphaOf(start), { threat: 1 });
    const thwarted = heroThwarts(WAVE10_DEPS, nearly, alphaOf(start));
    expect(energyOn(thwarted.state)).toBe(5);
    expect(attacksBy(thwarted.state, thwarted.events, "56092")).toEqual([]);
    const attacked = heroAttacks(WAVE10_DEPS, ready(thwarted.state), villainOf(thwarted.state));
    expect(energyOn(attacked.state)).toBe(0);
    expect(attacksBy(attacked.state, attacked.events, "56092")).toHaveLength(1);
  });

  it("boosting its 3 icons adds 3 and it is discarded (not revealed)", () => {
    const run = villainPhase(heroGame(), firstLegal, ALPHA, ABSORPTION);
    expect(attacksBy(run.state, run.events, "56092")).toMatchObject([{ baseAtk: 2, boostIcons: 3, damageDealt: 5 }]);
    expect(energyOn(run.state)).toBe(1);
  });
});

describe("Boost icons of the rest of the set", () => {
  it.each([
    [BLAST, 1],
    [CRISIS, 2],
  ] as const)("%s flipped as a boost card carries %i boost icon(s) and does nothing else", (code, icons) => {
    const run = villainPhase(heroGame(), firstLegal, code, ALPHA);
    expect(attacksBy(run.state, run.events, "56092")).toMatchObject([
      { baseAtk: 2, boostIcons: icons, damageDealt: 2 + icons },
    ]);
    expect(energyOn(run.state)).toBe(0);
    expect(attachedCodes(run.state)).toEqual([CHANNEL]);
  });
});

describe("Captain Marvel's Helmet 56099 against the Core upgrade 01016 (RRG 1.8 'Unique Icon', pp. 45-46)", () => {
  const HELMET_UPGRADE = "01016";
  /** A Civil War game past setup with the Core Captain Marvel deck in the one seat, in hero form. */
  const marvelGame = (): GameState => {
    const config = wave10Scenario(CAPTAIN_MARVEL_SCENARIO, {
      seed: 1,
      players: [{ starterDeckId: CAPTAIN_MARVEL_DECK }],
      mainSchemeStageIds: [HOMELAND_SECURITY, NO_GOING_BACK] as never,
    });
    const created = createGame(config, WAVE10_DEPS);
    if (!created.ok) throw new Error(`${created.error.code}: ${created.error.message}`);
    const started = settle(created.state, firstLegal, (s) => s.step.phase === "player", WAVE10_DEPS);
    return withForm(withoutLeaderSideScheme(started), { heroForm: 0 });
  };
  const idOfCode = (s: GameState, code: string): InstanceId =>
    Object.values(s.instances).find((i) => (i.cardId as string) === code)!.instanceId;

  it("with the hero's own Helmet in play: the leader's is discarded, never attached, and the player is dealt one facedown card", () => {
    const start = stagedInPlay(marvelGame(), HELMET_UPGRADE);
    const run = villainPhase(start.state, firstLegal, ADVANCE, HELMET, ALPHA);
    const helmet = idOfCode(run.state, HELMET);
    expect(types(run.events, "uniqueEntryBlocked")).toEqual([
      {
        type: "uniqueEntryBlocked",
        instanceId: helmet,
        cardId: HELMET,
        matchedInstanceId: start.id,
        disposition: "discarded",
      },
    ]);
    expect(inst(run.state, helmet).attachedTo).toBeNull();
    expect(attachedCodes(run.state)).toEqual([CHANNEL]);
    expect(hasKeyword(run.state, villainOf(run.state), "stalwart", WAVE10_DEPS)).toBe(false);
    expect(discardCodes(run.state)).toContain(HELMET);
    // The hero's own Helmet is untouched, and the card the unique rule dealt is the Alpha Flight Station revealed after it.
    expect(run.state.players[0]!.playArea).toContain(start.id);
    expect(run.state.villainArea.map((i) => codeOf(run.state, i))).toEqual([ALPHA]);
  });

  it("without the hero's Helmet in play: it attaches and she gains stalwart (negative: no block)", () => {
    const start = marvelGame();
    const run = villainPhase(start, firstLegal, ADVANCE, HELMET, ALPHA);
    expect(types(run.events, "uniqueEntryBlocked")).toEqual([]);
    expect(attachedCodes(run.state)).toEqual([CHANNEL, HELMET]);
    expect(hasKeyword(run.state, villainOf(run.state), "stalwart", WAVE10_DEPS)).toBe(true);
    // The Alpha Flight Station is still in the deck: nothing was dealt in place of the Helmet.
    expect(run.state.villainArea).toEqual([]);
  });

  it("the reverse: with the leader's Helmet attached the hero's upgrade 01016 is refused by the unique rule", () => {
    const start = marvelGame();
    const attached = attachToHost(start, HELMET, villainOf(start));
    const given = moveToHand(attached.state, P1, HELMET_UPGRADE);
    const upgrade = given.ids[0]!;
    const result = applyCommand(given.state, play(P1, upgrade, payWith(given.state, P1, 2, [upgrade])), WAVE10_DEPS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe(
      "Captain Marvel's Helmet matches Captain Marvel's Helmet, already in play: the players as a group may have only one copy of each unique card in play",
    );
    expect(given.state.players[0]!.hand).toContain(upgrade);
  });

  it("as a boost card with the hero's Helmet in play: discarded and never attached (the reveal from a boost ability is checked too)", () => {
    const start = stagedInPlay(marvelGame(), HELMET_UPGRADE);
    const run = villainPhase(start.state, firstLegal, HELMET, ALPHA);
    expect(types(run.events, "uniqueEntryBlocked")).toHaveLength(1);
    expect(attachedCodes(run.state)).toEqual([CHANNEL]);
    expect(hasKeyword(run.state, villainOf(run.state), "stalwart", WAVE10_DEPS)).toBe(false);
  });
});
