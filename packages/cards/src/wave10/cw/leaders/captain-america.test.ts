import { CW_CARDS } from "@mc/content";
import {
  applyCommand,
  hasKeyword,
  maxHitPoints,
  remainingHitPoints,
  villainStage,
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
  moveToHand,
  patchInstance,
  payWith,
  play,
  stackEncounterDeck,
  type Picker,
} from "../../../testing/harness.js";
import { defeatWithAttack, driveEventsPicking } from "../../../testing/staging.js";
import { choosing, withShieldOn } from "../../../dsl/wave10-caps-shield.testing.js";
import { attachToHost } from "../../../wave6/mut_gen/project-wideawake-testing.js";
import { attacksBy, codeOf, heroAttacks, heroForm, heroThwarts, piles, schemesBy } from "../../../wave9/testing.js";
import { WAVE10_CARDS } from "../../cards.js";
import {
  CAPTAIN_AMERICA_SCENARIO,
  WAVE10_DEPS,
  civilWarGame,
  engageMinion,
  stagedInPlay,
  type CivilWarGameOptions,
} from "../../testing.js";
import { LEADERS_CAPTAIN_AMERICA, LEADERS_CAPTAIN_AMERICA_SKIPPED } from "./captain-america.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Captain America, the Resistance leader (56137 to 56140) and his set (56143 to 56149), docs/phase7-wave10.md sections
 * 2.4, 3.7, 3.17 to 3.19 and 3.22. Every test is a real Civil War game in the `resistance-captain-america` scenario
 * seated with the Tigra precon (and the Core Spider-Man deck as a second seat), through real commands. Tigra's ATK is
 * 2 and her basic attack is the only attack the first seat makes unless a test says otherwise.
 *
 * Captain America starts with Cap's Shield and a tough status card from the Setup, so the first damage any test deals
 * to him is absorbed unless the test removes the status card (`bare`). The Shield's retaliate 1 hits the attacker.
 */
const REFS = [
  "56137.setup",
  "56137.captain-america-forced-response",
  "56138.when-revealed",
  "56138.captain-america-forced-response",
  "56139.setup",
  "56139.captain-america-forced-response",
  "56140.when-revealed",
  "56140.captain-america-forced-response",
  "56143.caps-shield-constant",
  "56143.caps-shield-forced-response",
  "56144.caps-helmet-constant",
  "56144.caps-helmet-response",
  "56144.boost",
  "56145.super-soldier-serum-forced-interrupt",
  "56145.boost",
  "56146.when-revealed",
  "56147.when-revealed-alter-ego",
  "56147.when-revealed-hero",
  "56148.when-revealed-alter-ego",
  "56148.when-revealed-hero",
  "56149.when-defeated",
];
const SET = ["56137", "56143", "56144", "56145", "56146", "56147", "56148", "56149"];
const SHIELD = "56143";
const HELMET = "56144";
const SERUM = "56145";
const BLOCK = "56146";
const TOSS = "56147";
const STRIKE = "56148";
const FEARLESS = "56149";
const ADVANCE = "01186";
const ASSAULT = "01187";
const GANG_UP = "01189";
const CAPE_KILLER = "56105";
const MOON_KNIGHT = "56002";
const MODOK = "01184";
const CLAWS = "56005";
const CLAWS_INTERRUPT = "56005.sharp-claws-interrupt";
const TOOTH = "56008";

const dataOf = (code: string) => CW_CARDS.find((c) => (c.id as string) === code)! as unknown as Record<string, unknown>;
const leaderOf = (s: GameState): InstanceId => s.activeVillainId!;
const hero = (s: GameState, player: PlayerId = P1): InstanceId => identityOf(s, player);
const shieldOf = (s: GameState): InstanceId =>
  Object.keys(s.instances).find((i) => codeOf(s, i as InstanceId) === SHIELD) as InstanceId;
const holder = (s: GameState): InstanceId | null => inst(s, shieldOf(s)).attachedTo;
const damageOn = (s: GameState, id: InstanceId): number => inst(s, id).damage;
const toughOn = (s: GameState, id: InstanceId): number => inst(s, id).statuses.tough;
const attachedCodes = (s: GameState): string[] => inst(s, leaderOf(s)).attachments.map((a) => codeOf(s, a));
const discardCodes = (s: GameState): string[] => piles(s).discard.map((i) => codeOf(s, i));
const setStatus = (s: GameState, id: InstanceId, name: "stunned" | "confused" | "tough", n: number): GameState =>
  patchInstance(s, id, { statuses: { ...inst(s, id).statuses, [name]: n } });
/** Captain America with no tough status card (the Setup gave him one). */
const bare = (s: GameState): GameState => setStatus(s, leaderOf(s), "tough", 0);
const ready = (s: GameState, player: PlayerId = P1): GameState =>
  patchInstance(s, hero(s, player), { exhausted: false });

/** Stage 1A revealed Fearless Determination at Setup; most tests deal it later as an ordinary card, so it starts back in the deck. */
const alterEgoGame = (opts: CivilWarGameOptions = {}) =>
  civilWarGame(CAPTAIN_AMERICA_SCENARIO, { leaderSideScheme: "discarded", ...opts });
const heroGame = (opts: CivilWarGameOptions = {}) => heroForm(alterEgoGame(opts));

/** The first player ends the turn and the villain phase runs on the stacked deck. */
const villainPhase = (state: GameState, pick: Picker, ...stack: string[]) =>
  driveEventsPicking(WAVE10_DEPS, stack.length > 0 ? stackEncounterDeck(state, ...stack) : state, pick, endTurn(P1));

describe("registry", () => {
  it("registers the twenty-one refs of the eight cards, each a valid definition, and skips nothing", () => {
    expect(Object.keys(LEADERS_CAPTAIN_AMERICA).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(LEADERS_CAPTAIN_AMERICA)) expect(validateDefinition(def), id).toEqual([]);
    expect(LEADERS_CAPTAIN_AMERICA_SKIPPED).toEqual({});
  });

  it("the data names exactly these refs for the cards", () => {
    const refs = WAVE10_CARDS.filter((c) => SET.includes(c.id as string)).flatMap(abilityRefIds);
    expect(refs.sort()).toEqual([...REFS].sort());
  });
});

describe("Setup: the enemy team finds Cap's Shield and attaches it to Captain America (stage I and stage III)", () => {
  it.each([
    ["standard", 1, 1, 14],
    ["standard", 2, 1, 28],
    ["expert", 1, 3, 18],
    ["expert", 2, 3, 36],
  ] as const)(
    "%s, %i player(s): stage %s with %i hit points, the Shield attached, one tough card, no question asked",
    (mode, players, stage, hp) => {
      const s = civilWarGame(CAPTAIN_AMERICA_SCENARIO, { difficulty: mode, twoPlayers: players === 2 });
      const v = leaderOf(s);
      expect(s.pendingChoice).toBeNull();
      expect(codeOf(s, v)).toBe("56137");
      expect(villainStage(s).stageNumber).toBe(stage);
      expect([maxHitPoints(s, v), remainingHitPoints(s, v)]).toEqual([hp, hp]);
      expect(attachedCodes(s)).toEqual([SHIELD]);
      expect(holder(s)).toBe(v);
      expect(inst(s, shieldOf(s)).faceup).toBe(true);
      expect(toughOn(s, v)).toBe(1);
      expect(hasKeyword(s, v, "retaliate", WAVE10_DEPS)).toBe(true);
      // Not in the deck or the discard pile any more; the rest of his set is still there.
      expect([...piles(s).deck, ...piles(s).discard].filter((i) => codeOf(s, i) === SHIELD)).toEqual([]);
      expect([...piles(s).deck, ...piles(s).discard].filter((i) => codeOf(s, i) === HELMET)).toHaveLength(1);
      // Stage 1A revealed his side scheme at Setup.
      expect(s.villainArea.map((i) => codeOf(s, i))).toEqual([FEARLESS]);
    },
  );
});

const basicAttack = (s: GameState, target: InstanceId) =>
  ({ type: "basicAttack", playerId: P1, attackerInstanceId: hero(s), targetInstanceId: target }) as const;

/** Tooth and Claw (Tigra's event, cost 4: "Deal 4 damage to an enemy. Deal 4 damage to an enemy.") played at `leader`. */
function playTooth(state: GameState, leader: InstanceId) {
  const given = moveToHand(state, P1, TOOTH);
  const [id] = given.ids as [InstanceId];
  return driveEventsPicking(
    WAVE10_DEPS,
    given.state,
    choosing({ targets: [leader] }),
    play(P1, id, payWith(given.state, P1, 4, [id])),
  );
}

describe("Cap's Shield (56143): the constant", () => {
  it("is data: a Permanent unique attachment to the villain", () => {
    const card = dataOf(SHIELD);
    expect([card.type, card.unique, card.keywords, card.attachesTo, card.boostIcons]).toEqual([
      "attachment",
      true,
      [{ name: "permanent" }],
      { kind: "villain" },
      0,
    ]);
  });

  it("the holder has retaliate 1: wherever the Shield is, and not otherwise", () => {
    const start = heroGame();
    const onHero = withShieldOn(start, hero(start));
    expect(hasKeyword(start, leaderOf(start), "retaliate", WAVE10_DEPS)).toBe(true);
    expect(hasKeyword(onHero, hero(onHero), "retaliate", WAVE10_DEPS)).toBe(true);
    expect(hasKeyword(onHero, leaderOf(onHero), "retaliate", WAVE10_DEPS)).toBe(false);
  });

  it("attacks against the holder lose piercing: Tigra's piercing attack (Sharp Claws, 3 ATK) leaves his tough card to absorb it", () => {
    const claws = stagedInPlay(ready(heroGame()), CLAWS, { attach: true });
    const leader = leaderOf(claws.state);
    const run = driveEventsPicking(
      WAVE10_DEPS,
      claws.state,
      choosing({ accept: [CLAWS_INTERRUPT], label: /piercing/i }),
      basicAttack(claws.state, leader),
    );
    expect(damageOn(run.state, leader)).toBe(0);
    expect(toughOn(run.state, leader)).toBe(0);
    expect(holder(run.state)).toBe(leader);
  });

  it("control: the same piercing attack on a villain without the Shield removes the tough card and deals all 3", () => {
    const claws = stagedInPlay(ready(heroGame()), CLAWS, { attach: true });
    const away = withShieldOn(claws.state, hero(claws.state));
    const leader = leaderOf(away);
    expect(toughOn(away, leader)).toBe(1);
    const run = driveEventsPicking(
      WAVE10_DEPS,
      away,
      choosing({ accept: [CLAWS_INTERRUPT], label: /piercing/i }),
      basicAttack(away, leader),
    );
    expect(damageOn(run.state, leader)).toBe(3);
    expect(toughOn(run.state, leader)).toBe(0);
  });
});

describe("Cap's Shield (56143): the Forced Response, the Shield changing hands", () => {
  it("a hero's basic attack that damages him takes it: 2 damage (14 to 12), retaliate 1 hits Tigra, the Shield is hers", () => {
    const start = ready(bare(heroGame()));
    const leader = leaderOf(start);
    const run = heroAttacks(WAVE10_DEPS, start, leader);
    expect(remainingHitPoints(run.state, leader)).toBe(12);
    expect(damageOn(run.state, hero(run.state))).toBe(1);
    expect(holder(run.state)).toBe(hero(run.state));
    expect(attachedCodes(run.state)).toEqual([]);
    expect(inst(run.state, hero(run.state)).attachments).toEqual([shieldOf(run.state)]);
    // It left him: no new tough card for Captain America.
    expect(toughOn(run.state, leader)).toBe(0);
  });

  it("his tough status card absorbs the attack: no damage, the Shield stays, retaliate still hits Tigra", () => {
    const start = ready(heroGame());
    const leader = leaderOf(start);
    const run = heroAttacks(WAVE10_DEPS, start, leader);
    expect(remainingHitPoints(run.state, leader)).toBe(14);
    expect(toughOn(run.state, leader)).toBe(0);
    expect(holder(run.state)).toBe(leader);
    expect(damageOn(run.state, hero(run.state))).toBe(1);
  });

  it("his attack that damages the holder takes it back: Tigra takes 2, her retaliate 1 hits him, he gets a tough card", () => {
    const base = heroGame();
    const start = bare(withShieldOn(base, hero(base)));
    const leader = leaderOf(start);
    const run = villainPhase(start, firstLegal, ADVANCE, ADVANCE);
    expect(attacksBy(run.state, run.events, "56137")).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    expect(damageOn(run.state, hero(run.state))).toBe(2);
    expect(damageOn(run.state, leader)).toBe(1);
    expect(holder(run.state)).toBe(leader);
    // The Shield's arrival is "attached to Captain America": the stage's Forced Response gives the tough card.
    expect(toughOn(run.state, leader)).toBe(1);
  });

  it("the holder's tough status card absorbs his attack: no damage, the Shield stays with her, retaliate still hits him", () => {
    const base = heroGame();
    const held = withShieldOn(base, hero(base));
    const start = setStatus(bare(held), hero(base), "tough", 1);
    const run = villainPhase(start, firstLegal, ADVANCE, ADVANCE);
    expect(damageOn(run.state, hero(run.state))).toBe(0);
    expect(toughOn(run.state, hero(run.state))).toBe(0);
    expect(holder(run.state)).toBe(hero(run.state));
    expect(damageOn(run.state, leaderOf(run.state))).toBe(1);
    expect(toughOn(run.state, leaderOf(run.state))).toBe(0);
  });

  it("a thwart does not move it: Tigra thwarts the main scheme", () => {
    const start = ready(heroGame());
    const run = heroThwarts(
      WAVE10_DEPS,
      patchInstance(start, start.mainScheme.instanceId, { threat: 3 }),
      start.mainScheme.instanceId,
    );
    expect(inst(run.state, run.state.mainScheme.instanceId).threat).toBe(2);
    expect(holder(run.state)).toBe(leaderOf(run.state));
  });

  it("an attack ability dealing a flat amount does not move it: Tooth and Claw, 4 and 4, one retaliate", () => {
    const start = bare(heroGame());
    const leader = leaderOf(start);
    const run = playTooth(start, leader);
    expect(damageOn(run.state, leader)).toBe(8);
    expect(damageOn(run.state, hero(run.state))).toBe(1);
    expect(holder(run.state)).toBe(leader);
  });

  // FFG ruling January 11, 2026 R1 and R2; overkill counts damage taken (January 26, 2026 R3).
  it("overkill damage that reaches him moves it though he was not the target: a defeated minion's 2 excess damage", () => {
    const claws = stagedInPlay(bare(ready(heroGame())), CLAWS, { attach: true });
    const state = patchInstance(engageMinion(claws.state, MODOK, "target"), "target" as InstanceId, { damage: 7 });
    const leader = leaderOf(state);
    const run = driveEventsPicking(
      WAVE10_DEPS,
      state,
      choosing({ accept: [CLAWS_INTERRUPT], label: /overkill/i }),
      basicAttack(state, "target" as InstanceId),
    );
    expect(damageOn(run.state, leader)).toBe(2);
    // He was not attacked, so his retaliate does not answer (RRG 1.8 "Overkill", p. 31).
    expect(damageOn(run.state, hero(run.state))).toBe(0);
    expect(holder(run.state)).toBe(hero(run.state));
  });

  it("overkill damage his tough card absorbs is not taken: the Shield stays", () => {
    const claws = stagedInPlay(ready(heroGame()), CLAWS, { attach: true });
    const state = patchInstance(engageMinion(claws.state, MODOK, "target"), "target" as InstanceId, { damage: 7 });
    const leader = leaderOf(state);
    const run = driveEventsPicking(
      WAVE10_DEPS,
      state,
      choosing({ accept: [CLAWS_INTERRUPT], label: /overkill/i }),
      basicAttack(state, "target" as InstanceId),
    );
    expect(damageOn(run.state, leader)).toBe(0);
    expect(toughOn(run.state, leader)).toBe(0);
    expect(holder(run.state)).toBe(leader);
  });

  it("an ally's attack is not 'a hero' attacking: Moon Knight (ATK 2) damages him and the Shield stays", () => {
    const ally = stagedInPlay(bare(ready(heroGame())), MOON_KNIGHT);
    const leader = leaderOf(ally.state);
    const run = driveEventsPicking(WAVE10_DEPS, ally.state, firstLegal, {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: ally.id,
      targetInstanceId: leader,
    });
    expect(damageOn(run.state, leader)).toBe(2);
    expect(holder(run.state)).toBe(leader);
  });

  it("the second player's hero takes it too (Spider-Man, ATK 2): 2 damage, the Shield is his", () => {
    const base = heroForm(alterEgoGame({ twoPlayers: true }), P1, P2);
    const start = bare(base);
    const leader = leaderOf(start);
    const run = driveEventsPicking(WAVE10_DEPS, start, firstLegal, endTurn(P1), {
      type: "basicAttack",
      playerId: P2,
      attackerInstanceId: hero(start, P2),
      targetInstanceId: leader,
    });
    expect(damageOn(run.state, leader)).toBe(2);
    expect(damageOn(run.state, hero(run.state, P2))).toBe(1);
    expect(holder(run.state)).toBe(hero(run.state, P2));
  });

  it("the holder defeated: the Shield attaches to Captain America again and he gets a tough card (MC56 p. 20 FAQ)", () => {
    const base = heroGame({ twoPlayers: true });
    const hp = maxHitPoints(base, hero(base))!;
    const dying = patchInstance(withShieldOn(bare(base), hero(base)), hero(base), { damage: hp - 2 });
    const run = driveEventsPicking(
      WAVE10_DEPS,
      stackEncounterDeck(dying, ADVANCE, ASSAULT, FEARLESS),
      firstLegal,
      endTurn(P1),
      endTurn(P2),
    );
    expect(run.state.players[0]!.eliminated).toBe(true);
    expect(holder(run.state)).toBe(leaderOf(run.state));
    expect(toughOn(run.state, leaderOf(run.state))).toBe(1);
    expect(attachedCodes(run.state)).toEqual([SHIELD]);
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

/** Picks `id` when a prompt offers it as an option (a target to discard) and the first legal option otherwise. */
const picksCard =
  (id: InstanceId): Picker =>
  (s) => {
    const choice = s.pendingChoice!;
    return choice.options.some((o) => (o.optionId as string) === id) ? [id] : firstLegal(s);
  };

/** Picks `defender` when a defender is asked for and the first legal option otherwise. */
const choosingDefender =
  (defender: InstanceId): Picker =>
  (s) => {
    const choice = s.pendingChoice!;
    if (choice.prompt.kind === "declareDefender" && choice.options.some((o) => (o.optionId as string) === defender))
      return [defender];
    return firstLegal(s);
  };

describe("advancing: stage I to II (standard) and III to IV (expert)", () => {
  it.each([
    ["standard", 2, 18, 2, 2],
    ["expert", 4, 22, 3, 2],
  ] as const)("%s: stage %i has %i hit points, ATK %i, SCH %i, Steady", (mode, stage, hp, atk, sch) => {
    const start = ready(bare(heroGame({ difficulty: mode })));
    const v = leaderOf(start);
    const defeated = defeatWithAttack(WAVE10_DEPS, stackEncounterDeck(start, FEARLESS), v);
    expect(villainStage(defeated).stageNumber).toBe(stage);
    expect([maxHitPoints(defeated, v), remainingHitPoints(defeated, v)]).toEqual([hp, hp]);
    expect([villainStage(defeated).atk, villainStage(defeated).sch]).toEqual([atk, sch]);
    expect(hasKeyword(defeated, v, "steady", WAVE10_DEPS)).toBe(true);
    // The attack that defeated the stage damaged the holder: the Shield went to Tigra, and retaliate hit her.
    expect(holder(defeated)).toBe(hero(defeated));
    expect(damageOn(defeated, hero(defeated))).toBe(1);
    // Deal each player an encounter card: the stacked Fearless Determination, after the minion stage 1 B dealt.
    expect(defeated.players[0]!.dealtEncounter.map((i) => codeOf(defeated, i)).at(-1)).toBe(FEARLESS);
  });

  it.each([
    ["standard", 2],
    ["expert", 4],
  ] as const)(
    "%s, stage %i: he cannot take damage this phase; in the villain phase his attack takes the Shield back (this stage's Forced Response)",
    (mode, stage) => {
      const start = ready(bare(heroGame({ difficulty: mode })));
      const v = leaderOf(start);
      const defeated = defeatWithAttack(WAVE10_DEPS, stackEncounterDeck(start, FEARLESS), v);
      expect(villainStage(defeated).stageNumber).toBe(stage);
      const again = ready(defeated);
      const refused = applyCommand(again, basicAttack(again, v), WAVE10_DEPS);
      expect(refused).toMatchObject({ ok: false, error: { code: "no_valid_target" } });
      // The next villain phase: he attacks Tigra, who holds the Shield; it returns to him with a tough card (this stage's
      // Forced Response), and her retaliate 1 hit him.
      const next = villainPhase(again, firstLegal, ADVANCE, ADVANCE);
      expect(holder(next.state)).toBe(v);
      expect(toughOn(next.state, v)).toBe(1);
      expect(damageOn(next.state, v)).toBe(1);
      const atk = stage === 2 ? 2 : 3;
      expect(attacksBy(next.state, next.events, "56137")).toMatchObject([{ baseAtk: atk, damageDealt: atk }]);
    },
  );
});

describe("Cap's Helmet (56144)", () => {
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

  it("revealed it attaches to Captain America: stalwart, and +1 SCH on his scheme (1 + 1 = 2)", () => {
    const base = alterEgoGame();
    expect(hasKeyword(base, leaderOf(base), "stalwart", WAVE10_DEPS)).toBe(false);
    const run = villainPhase(setStatus(base, leaderOf(base), "confused", 1), firstLegal, HELMET);
    expect(attachedCodes(run.state)).toEqual([SHIELD, HELMET]);
    expect(hasKeyword(run.state, leaderOf(run.state), "stalwart", WAVE10_DEPS)).toBe(true);
    const withHelmet = attachToHost(base, HELMET, leaderOf(base));
    const scheme = villainPhase(withHelmet.state, firstLegal, ADVANCE, FEARLESS);
    expect(schemesBy(scheme.state, scheme.events, "56137")).toMatchObject([{ baseSch: 2 }]);
    const plain = villainPhase(base, firstLegal, ADVANCE, FEARLESS);
    expect(schemesBy(plain.state, plain.events, "56137")).toMatchObject([{ baseSch: 1 }]);
  });

  describe("Hero Response: after you make a basic attack against Captain America, spend 3 resources of the same type -> discard", () => {
    const attacked = (resources: readonly ("energy" | "mental" | "physical")[], pay: number) => {
      const base = ready(heroGame());
      const attached = attachToHost(base, HELMET, leaderOf(base));
      const staged = handFor(attached.state, resources);
      const offered: string[] = [];
      const run = heroAttacks(WAVE10_DEPS, staged.state, leaderOf(staged.state), {
        pick: respondingTo(HELMET, staged.ids.slice(0, pay), offered),
      });
      return { staged, run, offered };
    };

    it("three physical resources paid: the Helmet is discarded with them", () => {
      const { staged, run, offered } = attacked(["physical", "physical", "physical"], 3);
      expect(offered.some((o) => o.includes("56144.caps-helmet-response"))).toBe(true);
      expect(attachedCodes(run.state)).toEqual([SHIELD]);
      expect(discardCodes(run.state)).toContain(HELMET);
      for (const id of staged.ids) expect(run.state.players[0]!.discard).toContain(id);
    });

    it("declined, it stays attached and nothing is spent", () => {
      const { staged, run } = attacked(["physical", "physical", "physical"], 0);
      expect(attachedCodes(run.state)).toEqual([SHIELD, HELMET]);
      expect(run.state.players[0]!.hand).toEqual(expect.arrayContaining([...staged.ids]));
    });

    it("three resources that are not of one type (2 physical, 1 energy) cannot pay", () => {
      const { staged, run } = attacked(["physical", "physical", "energy"], 3);
      expect(attachedCodes(run.state)).toEqual([SHIELD, HELMET]);
      expect(run.state.players[0]!.hand).toEqual(expect.arrayContaining([...staged.ids]));
    });

    it("an ally's attack is not 'you make a basic attack': no response", () => {
      const base = heroGame();
      const attached = attachToHost(base, HELMET, leaderOf(base));
      const ally = stagedInPlay(attached.state, MOON_KNIGHT);
      const staged = handFor(ally.state, ["physical", "physical", "physical"]);
      const offered: string[] = [];
      const run = driveEventsPicking(WAVE10_DEPS, staged.state, respondingTo(HELMET, staged.ids, offered), {
        type: "basicAttack",
        playerId: P1,
        attackerInstanceId: ally.id,
        targetInstanceId: leaderOf(staged.state),
      });
      expect(offered.some((o) => o.includes("56144.caps-helmet-response"))).toBe(false);
      expect(attachedCodes(run.state)).toEqual([SHIELD, HELMET]);
    });
  });

  it("[star] BOOST: revealed from the boost card, it attaches (no boost icons)", () => {
    const run = villainPhase(heroGame(), firstLegal, HELMET, FEARLESS);
    expect(attacksBy(run.state, run.events, "56137")).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    expect(attachedCodes(run.state)).toEqual([SHIELD, HELMET]);
  });
});

describe("Super-Soldier Serum (56145)", () => {
  /** Moon Knight with `damage` on him in play defends Tigra. */
  const defendedBy = (damage: number) => {
    const base = heroGame();
    const serum = attachToHost(base, SERUM, leaderOf(base));
    const ally = stagedInPlay(serum.state, MOON_KNIGHT);
    return { ally: ally.id, serum: serum.id, state: patchInstance(ally.state, ally.id, { damage }) };
  };

  it("is data: +2 ATK, a boost star, two copies", () => {
    const card = dataOf(SERUM);
    expect([card.statModifiers, card.starIcon, card.boostIcons, card.quantityInSet]).toEqual([{ atk: 2 }, true, 0, 2]);
  });

  it("when he attacks, the attack has overkill and +2 ATK (2 + 2 = 4), and the card is discarded after it", () => {
    const { ally, state } = defendedBy(2);
    const run = villainPhase(state, choosingDefender(ally), ADVANCE, FEARLESS);
    expect(attacksBy(run.state, run.events, "56137")).toMatchObject([{ baseAtk: 4, boostIcons: 0, damageDealt: 4 }]);
    // Moon Knight had 1 hit point left; 3 excess damage reaches Tigra.
    expect(run.state.players[0]!.discard).toContain(ally);
    expect(damageOn(run.state, hero(run.state))).toBe(3);
    expect(attachedCodes(run.state)).toEqual([SHIELD]);
    expect(discardCodes(run.state)).toContain(SERUM);
  });

  it("without the card the same attack has no overkill: the excess is lost (control)", () => {
    const base = heroGame();
    const ally = stagedInPlay(base, MOON_KNIGHT);
    const state = patchInstance(ally.state, ally.id, { damage: 2 });
    const run = villainPhase(state, choosingDefender(ally.id), ADVANCE, FEARLESS);
    expect(run.state.players[0]!.discard).toContain(ally.id);
    expect(damageOn(run.state, hero(run.state))).toBe(0);
  });

  it("[star] BOOST: revealed from the boost card it attaches, and its +2 ATK counts for this attack (2 + 2 = 4, no overkill)", () => {
    const run = villainPhase(heroGame(), firstLegal, SERUM, FEARLESS);
    expect(attacksBy(run.state, run.events, "56137")).toMatchObject([{ baseAtk: 4, boostIcons: 0, damageDealt: 4 }]);
    expect(attachedCodes(run.state)).toEqual([SHIELD, SERUM]);
  });
});

describe("Shield Block (56146)", () => {
  /** A stunned Captain America loses the status instead of attacking: Shield Block is the only card that does anything. */
  const stunnedGame = (shieldOnHero: boolean) => {
    const base = bare(heroGame());
    const held = shieldOnHero ? withShieldOn(base, hero(base)) : base;
    return setStatus(held, leaderOf(held), "stunned", 1);
  };

  it("WHEN REVEALED with the Shield on him: a tough card and a facedown boost card (the next card of the deck)", () => {
    const run = villainPhase(stunnedGame(false), firstLegal, BLOCK, ASSAULT);
    const v = leaderOf(run.state);
    expect(toughOn(run.state, v)).toBe(1);
    expect(holder(run.state)).toBe(v);
    expect(inst(run.state, v).boostCards.map((i) => codeOf(run.state, i))).toEqual([ASSAULT]);
  });

  it("otherwise the Shield attaches to him (and the Forced Response gives the tough card) and he gets the boost card", () => {
    const run = villainPhase(stunnedGame(true), firstLegal, BLOCK, ASSAULT);
    const v = leaderOf(run.state);
    expect(holder(run.state)).toBe(v);
    expect(toughOn(run.state, v)).toBe(1);
    expect(inst(run.state, hero(run.state)).attachments).toEqual([]);
    expect(inst(run.state, v).boostCards.map((i) => codeOf(run.state, i))).toEqual([ASSAULT]);
  });

  it("the facedown boost card is flipped at his next activation: ASSAULT has no icon, the attack stays at 2", () => {
    const first = villainPhase(stunnedGame(false), firstLegal, BLOCK, ASSAULT);
    const second = villainPhase(ready(first.state), firstLegal, ADVANCE, ADVANCE);
    expect(attacksBy(second.state, second.events, "56137")).toMatchObject([{ baseAtk: 2, boostIcons: 0 }]);
    expect(inst(second.state, leaderOf(second.state)).boostCards).toEqual([]);
  });

  it("[3 boost icons] as a boost card: it adds 3 to the attack and does nothing else", () => {
    const run = villainPhase(heroGame(), firstLegal, BLOCK, FEARLESS);
    expect(attacksBy(run.state, run.events, "56137")).toMatchObject([{ baseAtk: 2, boostIcons: 3, damageDealt: 5 }]);
    expect(inst(run.state, leaderOf(run.state)).boostCards).toEqual([]);
  });
});

describe("Shield Toss (56147)", () => {
  it("(Alter-Ego) Captain America schemes (SCH 1 + 1 boost icon)", () => {
    const base = alterEgoGame();
    const run = villainPhase(setStatus(base, leaderOf(base), "confused", 1), firstLegal, TOSS, GANG_UP);
    expect(schemesBy(run.state, run.events, "56137")).toMatchObject([{ baseSch: 1, boostIcons: 1 }]);
  });

  it("(Hero) with the Shield on him: 2 damage to each character you control (Tigra and Moon Knight), the Shield stays", () => {
    const ally = stagedInPlay(heroGame(), MOON_KNIGHT);
    const start = setStatus(ally.state, leaderOf(ally.state), "stunned", 1);
    const run = villainPhase(start, firstLegal, TOSS);
    expect(damageOn(run.state, hero(run.state))).toBe(2);
    expect(damageOn(run.state, ally.id)).toBe(2);
    expect(holder(run.state)).toBe(leaderOf(run.state));
  });

  it("(Hero) otherwise the Shield attaches to him (tough card from the Forced Response) and nothing is damaged", () => {
    const ally = stagedInPlay(bare(heroGame()), MOON_KNIGHT);
    const start = setStatus(withShieldOn(ally.state, hero(ally.state)), leaderOf(ally.state), "stunned", 1);
    const run = villainPhase(start, firstLegal, TOSS);
    expect(holder(run.state)).toBe(leaderOf(run.state));
    expect(toughOn(run.state, leaderOf(run.state))).toBe(1);
    expect(damageOn(run.state, hero(run.state))).toBe(0);
    expect(damageOn(run.state, ally.id)).toBe(0);
  });

  it("[2 boost icons] as a boost card it adds 2", () => {
    const run = villainPhase(heroGame(), firstLegal, TOSS, FEARLESS);
    expect(attacksBy(run.state, run.events, "56137")).toMatchObject([{ baseAtk: 2, boostIcons: 2, damageDealt: 4 }]);
  });
});

describe("Heroic Strike (56148)", () => {
  /** A stunned Captain America loses the status instead of attacking, so the card's attack is the one attack. */
  const quiet = (s: GameState) => setStatus(s, leaderOf(s), "stunned", 1);

  it("(Alter-Ego) discards the ally or upgrade you choose, not the other", () => {
    const knight = stagedInPlay(alterEgoGame(), MOON_KNIGHT);
    const upgrade = stagedInPlay(knight.state, CLAWS, { attach: true });
    const run = villainPhase(
      setStatus(upgrade.state, leaderOf(upgrade.state), "confused", 1),
      picksCard(upgrade.id),
      STRIKE,
    );
    expect(run.state.players[0]!.discard).toContain(upgrade.id);
    expect(run.state.players[0]!.playArea).toContain(knight.id);
  });

  it("(Alter-Ego) with no ally or upgrade nothing is discarded", () => {
    const base = alterEgoGame();
    const run = villainPhase(setStatus(base, leaderOf(base), "confused", 1), firstLegal, STRIKE);
    expect(run.state.players[0]!.discard.filter((i) => codeOf(run.state, i) === STRIKE)).toEqual([]);
    expect(damageOn(run.state, hero(run.state))).toBe(0);
  });

  it("(Hero) Captain America attacks you (ATK 2 + 1 boost icon = 3); the damaged hero is stunned", () => {
    const run = villainPhase(quiet(heroGame()), firstLegal, STRIKE, GANG_UP);
    expect(attacksBy(run.state, run.events, "56137")).toMatchObject([{ baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
    expect(damageOn(run.state, hero(run.state))).toBe(3);
    expect(inst(run.state, hero(run.state)).statuses.stunned).toBe(1);
  });

  it("(Hero) the defending ally the attack damages is stunned, not the hero", () => {
    const ally = stagedInPlay(heroGame(), MOON_KNIGHT);
    const run = villainPhase(quiet(ally.state), choosingDefender(ally.id), STRIKE, ADVANCE);
    expect(damageOn(run.state, ally.id)).toBe(2);
    expect(inst(run.state, ally.id).statuses.stunned).toBe(1);
    expect(inst(run.state, hero(run.state)).statuses.stunned).toBe(0);
    expect(damageOn(run.state, hero(run.state))).toBe(0);
  });

  it("(Hero) an attack that damages nothing (the hero's tough status card absorbs it) stuns nobody", () => {
    const base = heroGame();
    const run = villainPhase(setStatus(quiet(base), hero(base), "tough", 1), firstLegal, STRIKE, ADVANCE);
    expect(damageOn(run.state, hero(run.state))).toBe(0);
    expect(inst(run.state, hero(run.state)).statuses.stunned).toBe(0);
  });

  it("(Hero) his attack on the holder of the Shield takes it back, as any attack of his that damages her", () => {
    const base = bare(heroGame());
    const run = villainPhase(quiet(withShieldOn(base, hero(base))), firstLegal, STRIKE, ADVANCE);
    expect(holder(run.state)).toBe(leaderOf(run.state));
    expect(toughOn(run.state, leaderOf(run.state))).toBe(1);
    expect(inst(run.state, hero(run.state)).statuses.stunned).toBe(1);
  });

  it("[1 boost icon] as a boost card it adds 1", () => {
    const run = villainPhase(heroGame(), firstLegal, STRIKE, FEARLESS);
    expect(attacksBy(run.state, run.events, "56137")).toMatchObject([{ baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
  });
});

describe("Fearless Determination (56149)", () => {
  const board = (opts: CivilWarGameOptions = {}) => ready(heroGame({ leaderSideScheme: "inPlay", ...opts }));
  const fearlessOf = (s: GameState): InstanceId => s.villainArea.find((i) => codeOf(s, i) === FEARLESS)!;

  it("is data: 3 threat per player, an amplify icon, 3 boost icons", () => {
    const card = dataOf(FEARLESS);
    expect([card.startingThreat, card.amplifyIcons, card.boostIcons]).toEqual([{ base: 0, perPlayer: 3 }, 1, 3]);
  });

  it("stage 1A revealed it at Setup with 3 threat", () => {
    const start = board();
    expect(inst(start, fearlessOf(start)).threat).toBe(3);
  });

  it("WHEN DEFEATED: the Shield (on Tigra) attaches to him with a tough card, and he activates against the player: 2 + 1 amplify = 3", () => {
    const start = board();
    const held = patchInstance(withShieldOn(bare(start), hero(start)), fearlessOf(start), { threat: 1 });
    const run = heroThwarts(WAVE10_DEPS, stackEncounterDeck(held, ADVANCE), fearlessOf(held));
    expect(holder(run.state)).toBe(leaderOf(run.state));
    expect(toughOn(run.state, leaderOf(run.state))).toBe(1);
    // Fearless Determination is in play until its When Defeated resolves: its amplify icon counts (FFG ruling Jan 11, 2026 R1).
    expect(attacksBy(run.state, run.events, "56137")).toMatchObject([{ baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
    expect(damageOn(run.state, hero(run.state))).toBe(3);
    expect(discardCodes(run.state)).toContain(FEARLESS);
  });

  it("WHEN DEFEATED with the Shield already on him: no second tough card, he still activates", () => {
    const start = board();
    const held = patchInstance(start, fearlessOf(start), { threat: 1 });
    const run = heroThwarts(WAVE10_DEPS, stackEncounterDeck(held, ADVANCE), fearlessOf(held));
    expect(holder(run.state)).toBe(leaderOf(run.state));
    expect(toughOn(run.state, leaderOf(run.state))).toBe(1);
    expect(attacksBy(run.state, run.events, "56137")).toMatchObject([{ boostIcons: 1, damageDealt: 3 }]);
  });

  it("he activates against the player who defeated it, not the first player: Spider-Man thwarts, Tigra is in alter-ego form", () => {
    const base = heroForm(alterEgoGame({ leaderSideScheme: "inPlay", twoPlayers: true }), P2);
    const start = patchInstance(base, fearlessOf(base), { threat: 1 });
    const run = driveEventsPicking(WAVE10_DEPS, stackEncounterDeck(start, ADVANCE), firstLegal, endTurn(P1), {
      type: "basicThwart",
      playerId: P2,
      thwarterInstanceId: hero(start, P2),
      schemeInstanceId: fearlessOf(start),
    });
    expect(attacksBy(run.state, run.events, "56137")).toMatchObject([
      { targetInstanceId: hero(start, P2), baseAtk: 2, boostIcons: 1, damageDealt: 3 },
    ]);
    expect(schemesBy(run.state, run.events, "56137")).toEqual([]);
    expect(damageOn(run.state, hero(run.state, P2))).toBe(3);
    expect(damageOn(run.state, hero(run.state))).toBe(0);
  });

  it("not defeated (3 threat, 1 removed): the Shield stays where it is and he does not activate", () => {
    const start = board();
    const held = withShieldOn(start, hero(start));
    const run = heroThwarts(WAVE10_DEPS, held, fearlessOf(held));
    expect(inst(run.state, fearlessOf(held)).threat).toBe(2);
    expect(holder(run.state)).toBe(hero(run.state));
    expect(attacksBy(run.state, run.events, "56137")).toEqual([]);
  });

  it("[3 boost icons] as a boost card it adds 3 and is discarded", () => {
    const run = villainPhase(heroGame(), firstLegal, FEARLESS, ADVANCE);
    expect(attacksBy(run.state, run.events, "56137")).toMatchObject([{ baseAtk: 2, boostIcons: 3, damageDealt: 5 }]);
  });
});

describe("the leader's stage text and the Shield together", () => {
  it("a second player in the game: Setup attaches one Shield and one tough card (not one per player)", () => {
    const s = civilWarGame(CAPTAIN_AMERICA_SCENARIO, { twoPlayers: true });
    expect(attachedCodes(s)).toEqual([SHIELD]);
    expect(toughOn(s, leaderOf(s))).toBe(1);
  });

  it("Cape-Killer's attack (a minion, ATK 2) on the holder of the Shield does not take it: only the leader and heroes do", () => {
    const base = heroGame();
    const held = withShieldOn(base, hero(base));
    const withMinion = engageMinion(setStatus(held, leaderOf(held), "stunned", 1), CAPE_KILLER, P1);
    const run = villainPhase(withMinion, firstLegal, ADVANCE, FEARLESS);
    expect(attacksBy(run.state, run.events, CAPE_KILLER)).toHaveLength(1);
    expect(holder(run.state)).toBe(hero(run.state));
  });
});
