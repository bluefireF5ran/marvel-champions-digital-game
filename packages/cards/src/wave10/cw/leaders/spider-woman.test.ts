import { CW_CARDS } from "@mc/content";
import {
  applyCommand,
  hasKeyword,
  maxHitPoints,
  remainingHitPoints,
  villainStage,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { validateDefinition } from "../../../dsl/validate.js";
import {
  P1,
  endTurn,
  firstLegal,
  inst,
  moveToHand,
  patchInstance,
  payWith,
  play,
  stackEncounterDeck,
  type Picker,
} from "../../../testing/harness.js";
import { defeatWithAttack, driveEventsPicking, playFromHand } from "../../../testing/staging.js";
import { attacksBy, codeOf, heroAttacks, inPlayCard, piles, schemesBy, stunWith } from "../../../wave9/testing.js";
import { SPIDER_WOMAN_SCENARIO, WAVE10_DEPS, civilWarGame, civilWarHeroGame } from "../../testing.js";
import { LEADERS_SPIDER_WOMAN, LEADERS_SPIDER_WOMAN_SKIPPED } from "./spider-woman.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Spider-Woman, the Resistance leader (56168 to 56171) and her set (56174 to 56179), docs/phase7-wave10.md section 2.5,
 * 3.7 and 7.4. Every test plays the real `resistance-spider-woman` scenario (`civilWarGame`, the Tigra starter deck,
 * seed 1) through real commands; the encounter deck's order (`stackEncounterDeck`) and a Finesse counter count are the
 * only surgery. The main scheme's and the modular sets' abilities are unscripted stubs and nothing here depends on them.
 *
 * The villain phase draws the villain's boost card first, then deals each player a card (RRG 1.8 "Villain Phase"), so a
 * stack reads "boost, dealt". The Core standard set supplies the boost cards: Advance 01186 and Assault 01187 print no
 * boost icon, Caught Off Guard 01188 and Gang-Up 01189 one, Shadow of the Past 01190 two. Self-propelled Glide 56179
 * (a side scheme, 3 boost icons) is the harmless card to deal: it enters play and does nothing to the player.
 */
const REFS = [
  "56168.setup",
  "56168.spider-woman-forced-interrupt",
  "56169.when-revealed",
  "56169.spider-woman-forced-interrupt",
  "56170.setup",
  "56170.spider-woman-forced-interrupt",
  "56171.when-revealed",
  "56171.spider-woman-forced-interrupt",
  "56174.finesse-constant",
  "56174.finesse-forced-interrupt",
  "56175.contaminant-immunity-forced-interrupt",
  "56175.boost",
  "56176.when-revealed",
  "56176.boost",
  "56177.when-revealed-alter-ego",
  "56177.when-revealed-hero",
  "56178.when-revealed",
  "56178.boost",
  "56179.self-propelled-glide-forced-interrupt",
];
const SET = ["56168", "56174", "56175", "56176", "56177", "56178", "56179"];
const ADVANCE = "01186";
const GANG_UP = "01189";
const PHEROMONES = "56176";
const GLIDE = "56179";

const villainOf = (s: GameState): InstanceId => s.activeVillainId!;
const finesseOf = (s: GameState): InstanceId =>
  Object.keys(s.instances).find((i) => codeOf(s, i as InstanceId) === "56174") as InstanceId;
const skillOn = (s: GameState): number => inst(s, finesseOf(s)).counters["skill"] ?? 0;
const withSkill = (s: GameState, n: number): GameState =>
  patchInstance(s, finesseOf(s), { counters: { ...inst(s, finesseOf(s)).counters, skill: n } });
const hero = (s: GameState): InstanceId => s.players[0]!.identity.instanceId as InstanceId;
const damageOn = (s: GameState, id: InstanceId): number => inst(s, id).damage;
const attachedCodes = (s: GameState, id: InstanceId) => inst(s, id).attachments.map((a) => codeOf(s, a));
const inEncounterPiles = (s: GameState, code: string) =>
  [...piles(s).deck, ...piles(s).discard].filter((i) => codeOf(s, i) === code).length;

/** The first player ends the turn and the villain phase runs on the stacked deck. */
const villainPhase = (state: GameState, ...stack: string[]) =>
  driveEventsPicking(WAVE10_DEPS, stackEncounterDeck(state, ...stack), firstLegal, endTurn(P1));

const heroGame = (opts: Parameters<typeof civilWarHeroGame>[1] = {}) => civilWarHeroGame(SPIDER_WOMAN_SCENARIO, opts);
const dataOf = (code: string) => CW_CARDS.find((c) => (c.id as string) === code)! as unknown as Record<string, unknown>;

describe("registry", () => {
  it("registers the nineteen refs of the seven cards, each a valid definition, and skips nothing", () => {
    expect(Object.keys(LEADERS_SPIDER_WOMAN).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(LEADERS_SPIDER_WOMAN)) expect(validateDefinition(def), id).toEqual([]);
    expect(LEADERS_SPIDER_WOMAN_SKIPPED).toEqual({});
  });

  it("the data names exactly these refs for the cards", () => {
    const refs = SET.flatMap((code) => {
      const card = dataOf(code);
      const stages = ((card.sides as { stages?: { abilities: { id: string }[] }[] }[] | undefined) ?? []).flatMap(
        (side) => side.stages ?? [],
      );
      return [...((card.abilities ?? []) as { id: string }[]), ...stages.flatMap((s) => s.abilities)].map((a) => a.id);
    });
    expect(refs.sort()).toEqual([...REFS].sort());
  });
});

describe("Setup: the enemy team finds Finesse and attaches it to Spider-Woman (stage I and stage III)", () => {
  it.each([
    ["standard", 1, 1, 13],
    ["standard", 2, 1, 26],
    ["expert", 1, 3, 17],
    ["expert", 2, 3, 34],
  ] as const)(
    "%s, %i player(s): stage %s with %i hit points, Finesse attached, no counter",
    (mode, players, stage, hp) => {
      const s = civilWarGame(SPIDER_WOMAN_SCENARIO, { difficulty: mode, twoPlayers: players === 2 });
      const v = villainOf(s);
      expect(s.pendingChoice).toBeNull();
      expect(codeOf(s, v)).toBe("56168");
      expect(villainStage(s).stageNumber).toBe(stage);
      expect([maxHitPoints(s, v), remainingHitPoints(s, v)]).toEqual([hp, hp]);
      expect(attachedCodes(s, v)).toEqual(["56174"]);
      expect(inst(s, finesseOf(s)).attachedTo).toBe(v);
      expect(inst(s, finesseOf(s)).faceup).toBe(true);
      expect(inst(s, finesseOf(s)).counters).toEqual({});
      // Not in the deck or the discard pile any more; the rest of her set is still there.
      expect(inEncounterPiles(s, "56174")).toBe(0);
      expect(inEncounterPiles(s, "56179")).toBe(1);
      expect(inEncounterPiles(s, "56176")).toBe(2);
    },
  );
});

describe("Finesse (56174)", () => {
  it("is data: a Permanent attachment to the villain", () => {
    const card = dataOf("56174");
    expect([card.type, card.keywords, card.attachesTo]).toEqual([
      "attachment",
      [{ name: "permanent" }],
      { kind: "villain" },
    ]);
  });

  it("FORCED INTERRUPT: a treachery revealed places one skill counter before its own When Revealed (Inconspicuous: 1)", () => {
    // Boost card (Advance, a treachery turned over as a boost: not revealed), then Inconspicuous dealt.
    const run = villainPhase(heroGame(), ADVANCE, "56178", GLIDE);
    expect(attacksBy(run.state, run.events, "56168")).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    expect(skillOn(run.state)).toBe(1);
  });

  it("a card that is not a treachery places none (Self-propelled Glide dealt)", () => {
    const run = villainPhase(heroGame(), ADVANCE, GLIDE);
    expect(skillOn(run.state)).toBe(0);
  });

  it("MAX 3: a fourth counter is not placed (Pheromones places two itself)", () => {
    // Alter-ego form: the villain schemes, so no attack spends the counters standing on Finesse.
    const alterEgo = (n: number) => withSkill(civilWarGame(SPIDER_WOMAN_SCENARIO), n);
    const run = villainPhase(alterEgo(2), ADVANCE, PHEROMONES);
    expect(skillOn(run.state)).toBe(3);
    const full = villainPhase(alterEgo(3), ADVANCE, PHEROMONES);
    expect(skillOn(full.state)).toBe(3);
    const empty = villainPhase(alterEgo(0), ADVANCE, PHEROMONES);
    expect(skillOn(empty.state)).toBe(2);
  });
});

describe("Spider-Woman's Forced Interrupt: +1 ATK for each skill counter on Finesse for this attack, then remove them", () => {
  it.each([
    [0, 2],
    [1, 3],
    [2, 4],
    [3, 5],
  ])("%i skill counter(s): ATK %i, all removed afterwards", (counters, atk) => {
    const s = withSkill(heroGame(), counters);
    const run = villainPhase(s, ADVANCE, GLIDE);
    expect(attacksBy(run.state, run.events, "56168")).toMatchObject([
      { baseAtk: atk, boostIcons: 0, defenseReduction: 0, damageDealt: atk },
    ]);
    expect(damageOn(run.state, hero(run.state))).toBe(atk);
    expect(skillOn(run.state)).toBe(0);
  });

  it("adds to the boost icons (3 counters, Gang-Up's 1 icon: 5 + 1 damage)", () => {
    const run = villainPhase(withSkill(heroGame(), 3), GANG_UP, GLIDE);
    expect(attacksBy(run.state, run.events, "56168")).toMatchObject([{ baseAtk: 5, boostIcons: 1, damageDealt: 6 }]);
    expect(skillOn(run.state)).toBe(0);
  });

  it("counters placed in one villain phase are spent by the next attack, and only that one", () => {
    const first = villainPhase(heroGame(), ADVANCE, PHEROMONES);
    expect(skillOn(first.state)).toBe(2);
    const second = driveEventsPicking(
      WAVE10_DEPS,
      stackEncounterDeck(first.state, ADVANCE, "56178", GLIDE),
      firstLegal,
      endTurn(P1),
    );
    expect(attacksBy(second.state, second.events, "56168")).toMatchObject([{ baseAtk: 4, damageDealt: 4 }]);
    expect(skillOn(second.state)).toBe(1);
  });
});

describe("Self-propelled Glide (56179)", () => {
  it("is data: a side scheme with 3 threat per player and an acceleration icon", () => {
    const card = dataOf(GLIDE);
    expect([card.type, card.startingThreat, card.icons, card.boostIcons]).toEqual([
      "side_scheme",
      { base: 0, perPlayer: 3 },
      ["acceleration"],
      3,
    ]);
  });

  it("boosts its 3 icons", () => {
    const run = villainPhase(heroGame(), GLIDE, "56175");
    expect(attacksBy(run.state, run.events, "56168")).toMatchObject([{ baseAtk: 2, boostIcons: 3, damageDealt: 5 }]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Part 2: the stages, the treacheries, Contaminant Immunity and Self-propelled Glide
// ---------------------------------------------------------------------------------------------------------------

const VENOM_BLAST = "56177";
const CONTAMINANT = "56175";
const INCONSPICUOUS = "56178";
const MOCKINGBIRD_SWAP = { "56007": "01083" } as const;
const SPIDER_WOMAN_ALLY_SWAP = { "56008": "01011" } as const;

const statusesOf = (s: GameState, id: InstanceId) => inst(s, id).statuses;
const withStatuses = (s: GameState, id: InstanceId, change: Partial<ReturnType<typeof statusesOf>>): GameState =>
  patchInstance(s, id, { statuses: { ...inst(s, id).statuses, ...change } });
const discardCodes = (s: GameState) => piles(s).discard.map((i) => codeOf(s, i));

/** Picks the `chooseOption` option starting with `label`, and the ally `defender` (if any) as the defender. */
const choosing =
  (label: string, defender?: InstanceId): Picker =>
  (s) => {
    const choice = s.pendingChoice!;
    if (choice.prompt.kind === "chooseOption") {
      const hit = choice.options.find((o) => o.label.startsWith(label));
      if (hit) return [hit.optionId];
    }
    if (choice.prompt.kind === "declareDefender" && defender) {
      const hit = choice.options.find((o) => (o.optionId as string) === defender);
      if (hit) return [hit.optionId];
    }
    return firstLegal(s);
  };

describe("advancing: stage I to II (standard) and III to IV (expert)", () => {
  it.each([
    ["standard", 2, 17, 2, 2],
    ["expert", 4, 21, 3, 2],
  ] as const)("%s: stage %i has %i hit points, ATK %i, SCH %i, Steady", (mode, stage, hp, atk, sch) => {
    const start = withSkill(heroGame({ difficulty: mode }), 2);
    const v = villainOf(start);
    // A card to be dealt by the stage's When Revealed, known in advance.
    const defeated = defeatWithAttack(WAVE10_DEPS, stackEncounterDeck(start, GLIDE), v);
    expect(villainStage(defeated).stageNumber).toBe(stage);
    expect([maxHitPoints(defeated, v), remainingHitPoints(defeated, v)]).toEqual([hp, hp]);
    expect([villainStage(defeated).atk, villainStage(defeated).sch]).toEqual([atk, sch]);
    expect(hasKeyword(defeated, v, "steady", WAVE10_DEPS)).toBe(true);
    // Finesse stays on her with its counters.
    expect(attachedCodes(defeated, v)).toEqual(["56174"]);
    expect(skillOn(defeated)).toBe(2);
    // Deal each player an encounter card: one facedown card, the stacked Glide.
    expect(defeated.players[0]!.dealtEncounter.map((i) => codeOf(defeated, i))).toEqual([GLIDE]);
  });

  it.each([
    ["standard", 2],
    ["expert", 4],
  ] as const)("%s, stage %i: she cannot take damage this phase, and can in the next", (mode, stage) => {
    const start = heroGame({ difficulty: mode });
    const v = villainOf(start);
    const defeated = defeatWithAttack(WAVE10_DEPS, stackEncounterDeck(start, GLIDE), v);
    expect(villainStage(defeated).stageNumber).toBe(stage);
    const full = remainingHitPoints(defeated, v)!;
    // Ready the hero again by surgery and hit her: nothing happens.
    const ready = patchInstance(defeated, hero(defeated), { exhausted: false });
    const refused = applyCommand(
      ready,
      { type: "basicAttack", playerId: P1, attackerInstanceId: hero(ready), targetInstanceId: v },
      WAVE10_DEPS,
    );
    expect(refused).toMatchObject({ ok: false, error: { code: "no_valid_target" } });
    // The next round: the Glide dealt by the stage is revealed, the restriction is gone and Tigra (ATK 2) hurts her.
    const next = villainPhase(ready, ADVANCE, "56175");
    const hit = heroAttacks(WAVE10_DEPS, next.state, v);
    expect(remainingHitPoints(hit.state, v)).toBe(full - 2);
  });

  it("stage II attacks with her counters like stage I: ATK 2 + 2 counters", () => {
    const start = withSkill(heroGame(), 2);
    const defeated = defeatWithAttack(WAVE10_DEPS, stackEncounterDeck(start, GLIDE), villainOf(start));
    const run = villainPhase(defeated, ADVANCE, "56175");
    expect(attacksBy(run.state, run.events, "56168")).toMatchObject([{ baseAtk: 4, boostIcons: 0, damageDealt: 4 }]);
    expect(skillOn(run.state)).toBe(0);
  });

  it("stage IV (expert) attacks with ATK 3 + 3 counters = 6", () => {
    const start = heroGame({ difficulty: "expert" });
    const defeated = withSkill(defeatWithAttack(WAVE10_DEPS, stackEncounterDeck(start, GLIDE), villainOf(start)), 3);
    const run = villainPhase(defeated, ADVANCE, "56175");
    expect(attacksBy(run.state, run.events, "56168")).toMatchObject([{ baseAtk: 6, boostIcons: 0, damageDealt: 6 }]);
    expect(skillOn(run.state)).toBe(0);
  });

  it("stage I (no restriction): a hero hit takes 2 hit points", () => {
    const start = heroGame();
    const v = villainOf(start);
    expect(remainingHitPoints(heroAttacks(WAVE10_DEPS, start, v).state, v)).toBe(11);
  });
});

describe("Pheromones (56176)", () => {
  it("WHEN REVEALED: the player is stunned and confused, and Finesse gets two counters (its own and the interrupt's)", () => {
    const run = villainPhase(heroGame(), ADVANCE, PHEROMONES);
    expect(statusesOf(run.state, hero(run.state))).toMatchObject({ stunned: 1, confused: 1 });
    expect(skillOn(run.state)).toBe(2);
  });

  it("BOOST: the player is stunned; it is not a reveal, so Finesse gets no counter", () => {
    const run = villainPhase(heroGame(), PHEROMONES, GLIDE);
    expect(attacksBy(run.state, run.events, "56168")).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
    expect(statusesOf(run.state, hero(run.state))).toMatchObject({ stunned: 1, confused: 0 });
    expect(skillOn(run.state)).toBe(0);
  });

  it("BOOST: otherwise (already stunned) the player is confused", () => {
    const stunned = withStatuses(heroGame(), hero(heroGame()), { stunned: 1 });
    const run = villainPhase(stunned, PHEROMONES, GLIDE);
    expect(statusesOf(run.state, hero(run.state))).toMatchObject({ stunned: 1, confused: 1 });
  });

  it("BOOST: stunned and confused already, nothing more to give", () => {
    const base = heroGame();
    const both = withStatuses(base, hero(base), { stunned: 1, confused: 1 });
    const run = villainPhase(both, PHEROMONES, GLIDE);
    expect(statusesOf(run.state, hero(run.state))).toMatchObject({ stunned: 1, confused: 1 });
  });
});

describe("Inconspicuous (56178)", () => {
  it("WHEN REVEALED with no card to discard: Spider-Woman schemes (the only option)", () => {
    const run = villainPhase(heroGame(), ADVANCE, INCONSPICUOUS, GLIDE);
    expect(schemesBy(run.state, run.events, "56168")).toMatchObject([{ baseSch: 1 }]);
    expect(skillOn(run.state)).toBe(1);
  });

  it("WHEN REVEALED: the player may discard the highest-cost card they control (Two-Gun Kid, cost 3, not Moon Knight, cost 1)", () => {
    const base = heroGame();
    const kid = playFromHand(WAVE10_DEPS, base, "56010", 3);
    const knight = playFromHand(WAVE10_DEPS, kid.state, "56002", 1);
    const run = driveEventsPicking(
      WAVE10_DEPS,
      stackEncounterDeck(knight.state, ADVANCE, INCONSPICUOUS, GLIDE),
      choosing("Discard the highest-cost"),
      endTurn(P1),
    );
    expect(run.state.players[0]!.discard).toContain(kid.id);
    expect(run.state.players[0]!.playArea).toContain(knight.id);
    expect(schemesBy(run.state, run.events, "56168")).toEqual([]);
  });

  it("WHEN REVEALED: or Spider-Woman schemes, and the cards stay", () => {
    const base = heroGame();
    const kid = playFromHand(WAVE10_DEPS, base, "56010", 3);
    const run = driveEventsPicking(
      WAVE10_DEPS,
      stackEncounterDeck(kid.state, ADVANCE, INCONSPICUOUS, GLIDE),
      choosing("Spider-Woman schemes"),
      endTurn(P1),
    );
    expect(run.state.players[0]!.playArea).toContain(kid.id);
    expect(schemesBy(run.state, run.events, "56168")).toMatchObject([{ baseSch: 1 }]);
  });

  it("BOOST: one more boost icon for each status card on the player's identity", () => {
    const plain = villainPhase(heroGame(), INCONSPICUOUS, GLIDE);
    expect(attacksBy(plain.state, plain.events, "56168")).toMatchObject([
      { baseAtk: 2, boostIcons: 1, damageDealt: 3 },
    ]);
    const base = heroGame();
    const marked = withStatuses(base, hero(base), { stunned: 1, confused: 1 });
    const run = villainPhase(marked, INCONSPICUOUS, GLIDE);
    expect(attacksBy(run.state, run.events, "56168")).toMatchObject([{ baseAtk: 2, boostIcons: 3, damageDealt: 5 }]);
    expect(skillOn(run.state)).toBe(0);
  });
});

describe("Venom Blast (56177)", () => {
  /** Spider-Woman stunned, so her activation neither attacks nor deals a boost card; `pre` counters stand on Finesse. */
  const stunnedStart = (pre: number, hurt: Partial<ReturnType<typeof statusesOf>> = {}) => {
    const base = heroGame();
    const stunned = withStatuses(base, villainOf(base), { stunned: 1 });
    return withStatuses(withSkill(stunned, pre), hero(base), hurt);
  };

  it("BOOST: its single icon, no ability", () => {
    const run = villainPhase(heroGame(), VENOM_BLAST, GLIDE);
    expect(attacksBy(run.state, run.events, "56168")).toMatchObject([{ baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
  });

  it("WHEN REVEALED (alter-ego): it gains surge and the next card is revealed; Finesse gets one counter", () => {
    const run = villainPhase(civilWarGame(SPIDER_WOMAN_SCENARIO), ADVANCE, VENOM_BLAST, GLIDE);
    expect(skillOn(run.state)).toBe(1);
    expect(inPlayCard(run.state, GLIDE)).toBeDefined();
    expect(attacksBy(run.state, run.events, "56168")).toEqual([]);
  });

  it.each([
    [0, 3],
    [1, 4],
    [2, 5],
    [3, 5],
  ])(
    "WHEN REVEALED (hero) with %i counters before the reveal: ATK %i (the reveal adds one, the cap is 3)",
    (pre, atk) => {
      const run = driveEventsPicking(
        WAVE10_DEPS,
        stackEncounterDeck(stunnedStart(pre), VENOM_BLAST, GANG_UP),
        firstLegal,
        endTurn(P1),
      );
      // The stunned villain lost the status instead of attacking; Venom Blast's attack is the only one.
      expect(attacksBy(run.state, run.events, "56168")).toMatchObject([
        { baseAtk: atk, boostIcons: 1, damageDealt: atk + 1 },
      ]);
      expect(damageOn(run.state, hero(run.state))).toBe(atk + 1);
      expect(statusesOf(run.state, villainOf(run.state)).stunned).toBe(0);
      expect(skillOn(run.state)).toBe(0);
    },
  );

  it("with 1 counter in all (ranged only), a tough hero is protected; with 2 (piercing) the tough card goes and the damage lands", () => {
    const ranged = driveEventsPicking(
      WAVE10_DEPS,
      stackEncounterDeck(stunnedStart(0, { tough: 1 }), VENOM_BLAST, GANG_UP),
      firstLegal,
      endTurn(P1),
    );
    expect(damageOn(ranged.state, hero(ranged.state))).toBe(0);
    expect(statusesOf(ranged.state, hero(ranged.state)).tough).toBe(0);
    const piercing = driveEventsPicking(
      WAVE10_DEPS,
      stackEncounterDeck(stunnedStart(1, { tough: 1 }), VENOM_BLAST, GANG_UP),
      firstLegal,
      endTurn(P1),
    );
    expect(damageOn(piercing.state, hero(piercing.state))).toBe(5);
    expect(statusesOf(piercing.state, hero(piercing.state)).tough).toBe(0);
  });

  it("with 3 counters (overkill) an ally that defends passes its excess damage to the hero; with 2 it does not", () => {
    const run = (pre: number) => {
      const ally = playFromHand(WAVE10_DEPS, stunnedStart(pre), "56002", 1);
      const result = driveEventsPicking(
        WAVE10_DEPS,
        stackEncounterDeck(ally.state, VENOM_BLAST, GANG_UP),
        choosing("", ally.id),
        endTurn(P1),
      );
      return { result, ally: ally.id };
    };
    // Moon Knight has 3 hit points. One counter before the reveal makes two (ATK 4 + 1 icon = 5, piercing, no overkill:
    // the ally dies and the hero is spared); two make three (ATK 5 + 1 icon = 6, overkill: 3 more damage reach the hero).
    const two = run(1);
    expect(attacksBy(two.result.state, two.result.events, "56168")).toMatchObject([{ baseAtk: 4, boostIcons: 1 }]);
    expect(two.result.state.players[0]!.discard).toContain(two.ally);
    expect(damageOn(two.result.state, hero(two.result.state))).toBe(0);
    const three = run(2);
    expect(attacksBy(three.result.state, three.result.events, "56168")).toMatchObject([{ baseAtk: 5, boostIcons: 1 }]);
    expect(three.result.state.players[0]!.discard).toContain(three.ally);
    expect(damageOn(three.result.state, hero(three.result.state))).toBe(3);
  });
});

describe("Contaminant Immunity (56175)", () => {
  it("is data: +1 SCH", () => {
    expect(dataOf(CONTAMINANT).statModifiers).toEqual({ sch: 1 });
  });

  it("WHEN REVEALED it attaches to Spider-Woman; as a BOOST it is revealed and attaches too", () => {
    const dealt = villainPhase(heroGame(), ADVANCE, CONTAMINANT);
    expect(attachedCodes(dealt.state, villainOf(dealt.state))).toEqual(["56174", CONTAMINANT]);
    const boosted = villainPhase(heroGame(), CONTAMINANT, GLIDE);
    expect(attachedCodes(boosted.state, villainOf(boosted.state))).toEqual(["56174", CONTAMINANT]);
    expect(attacksBy(boosted.state, boosted.events, "56168")).toMatchObject([{ baseAtk: 2, boostIcons: 0 }]);
  });

  it("a stun is replaced by discarding this card and a tough status card; a second stun lands", () => {
    const attached = villainPhase(heroGame({ swap: MOCKINGBIRD_SWAP }), ADVANCE, CONTAMINANT);
    const v = villainOf(attached.state);
    expect(attachedCodes(attached.state, v)).toEqual(["56174", CONTAMINANT]);
    const first = stunWith(WAVE10_DEPS, attached.state, v);
    expect(statusesOf(first.state, v)).toMatchObject({ stunned: 0, confused: 0, tough: 1 });
    expect(attachedCodes(first.state, v)).toEqual(["56174"]);
    expect(discardCodes(first.state)[0]).toBe(CONTAMINANT);
  });

  it("a confuse is replaced the same way", () => {
    const attached = villainPhase(heroGame({ swap: SPIDER_WOMAN_ALLY_SWAP }), ADVANCE, CONTAMINANT);
    const v = villainOf(attached.state);
    const given = moveToHand(attached.state, P1, "01011");
    const allyId = given.ids[0]!;
    const played = driveEventsPicking(
      WAVE10_DEPS,
      given.state,
      (s) => {
        const choice = s.pendingChoice!;
        const take = choice.options.find((o) => o.optionId !== "decline" && o.optionId.includes("spider-woman"));
        return take ? [take.optionId] : firstLegal(s);
      },
      play(P1, allyId, payWith(given.state, P1, 3, [allyId])),
    );
    expect(statusesOf(played.state, v)).toMatchObject({ stunned: 0, confused: 0, tough: 1 });
    expect(attachedCodes(played.state, v)).toEqual(["56174"]);
  });

  it("without it the stun lands (control)", () => {
    const base = heroGame({ swap: MOCKINGBIRD_SWAP });
    const run = stunWith(WAVE10_DEPS, base, villainOf(base));
    expect(statusesOf(run.state, villainOf(base))).toMatchObject({ stunned: 1, tough: 0 });
  });

  it("two copies attached: one stun discards one and leaves the other", () => {
    const first = villainPhase(heroGame({ swap: MOCKINGBIRD_SWAP }), ADVANCE, CONTAMINANT);
    const second = villainPhase(first.state, ADVANCE, CONTAMINANT);
    const v = villainOf(second.state);
    expect(attachedCodes(second.state, v)).toEqual(["56174", CONTAMINANT, CONTAMINANT]);
    const run = stunWith(WAVE10_DEPS, second.state, v);
    expect(attachedCodes(run.state, v)).toEqual(["56174", CONTAMINANT]);
    expect(statusesOf(run.state, v)).toMatchObject({ stunned: 0, tough: 1 });
  });
});

describe("Self-propelled Glide (56179), in play", () => {
  /** Glide dealt in the first villain phase, then Tigra (ATK 2) attacks Spider-Woman with `n` counters on Finesse. */
  const hitWith = (n: number, glide = true) => {
    const phase = villainPhase(heroGame(), ADVANCE, glide ? GLIDE : "56175");
    const v = villainOf(phase.state);
    const run = heroAttacks(WAVE10_DEPS, withSkill(phase.state, n), v);
    return { run, v, after: remainingHitPoints(run.state, v) };
  };

  it.each([
    [0, 11],
    [1, 12],
    [2, 13],
    [3, 13],
  ])("%i counter(s): Tigra's 2 damage is reduced by that many (to 0 at most): %i hit points left", (n, left) => {
    expect(hitWith(n).after).toBe(left);
  });

  it("is not in play: the full 2 damage whatever the counters", () => {
    expect(hitWith(3, false).after).toBe(11);
  });
});
