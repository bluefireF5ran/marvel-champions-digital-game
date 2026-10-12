import { CW_CARDS, trait } from "@mc/content";
import {
  SINGLE_TEAM,
  applyCommand,
  hasKeyword,
  keywordTotal,
  maxHitPoints,
  statBonus,
  traitsOf,
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
  patchInstance,
  putOnTopOfDeck,
  stackEncounterDeck,
  type Picker,
} from "../../../testing/harness.js";
import {
  defeatWithAttack,
  driveEventsPicking,
  encounterCardInVillainArea,
  playFromHand,
  withForm,
} from "../../../testing/staging.js";
import { attachToHost } from "../../../wave6/mut_gen/project-wideawake-testing.js";
import { codeOf, heroAttacks, heroForm, inDiscardPile, piles, types, without } from "../../../wave9/testing.js";
import { WAVE10_CARDS } from "../../cards.js";
import {
  IRON_MAN_SCENARIO,
  WAVE10_DEPS,
  civilWarGame,
  cardOption,
  civilWarSetup,
  isEnemyTeamChoice,
  type CivilWarGameOptions,
} from "../../testing.js";
import { LEADERS_IRON_MAN, LEADERS_IRON_MAN_SKIPPED } from "./iron-man.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Iron Man, the Civil War leader (56059 to 56062) and his set (56065 to 56072), docs/phase7-wave10.md sections 2.2, 3.5,
 * 3.7. Every test is a real Civil War game in the `registration-iron-man` scenario seated with the Tigra precon (and the
 * Core Spider-Man deck as a second seat). The main scheme's and the modular sets' abilities are not relied on: the
 * cards under test are staged by surgery (an attachment placed on Iron Man, Stark Tower in the villain area) or stacked
 * on the encounter deck. Built locally, not in `testing.ts`: `findingCard` (answers the enemy team's search),
 * `toEnemyChoice`, `withTech`, `handFor`.
 */
const DEPS = WAVE10_DEPS;
const GAUNTLETS = "56065";
const BOOTS = "56066";
const HELMET = "56067";
const REACTOR = "56068";
const ARMOR = "56069";
const BLAST = "56070";
const PUNCH = "56071";
const TOWER = "56072";
const ATTACHMENTS = [GAUNTLETS, BOOTS, HELMET, REACTOR, ARMOR];
const AERIAL = trait("AERIAL");

const REFS = [
  "56059.iron-man-constant",
  "56059.setup",
  "56060.iron-man-constant",
  "56060.when-revealed",
  "56061.iron-man-constant",
  "56061.setup",
  "56062.iron-man-constant",
  "56062.when-revealed",
  "56065.powered-gauntlets-constant",
  "56065.powered-gauntlets-response",
  "56065.boost",
  "56066.rocket-boots-constant",
  "56066.rocket-boots-response",
  "56066.boost",
  "56067.mark-v-helmet-constant",
  "56067.mark-v-helmet-constant-2",
  "56067.mark-v-helmet-response",
  "56068.arc-reactor-constant",
  "56068.arc-reactor-constant-2",
  "56068.arc-reactor-response",
  "56069.mark-v-armor-forced-interrupt",
  "56069.boost",
  "56070.when-revealed-alter-ego",
  "56070.when-revealed-hero",
  "56071.when-revealed-alter-ego",
  "56071.when-revealed-hero",
  "56072.when-defeated",
];
const dataOf = (code: string) => CW_CARDS.find((c) => (c.id as string) === code)! as unknown as Record<string, unknown>;

/** Answers the enemy team's choice with the card `code` and every other choice with its first legal option. */
const findingCard =
  (code: string): Picker =>
  (s) => {
    const option = isEnemyTeamChoice(s) ? cardOption(s, code) : undefined;
    return option ? [option.optionId] : firstLegal(s);
  };

const villainOf = (s: GameState): InstanceId => s.activeVillainId!;
const attachedCodes = (s: GameState): string[] => inst(s, villainOf(s)).attachments.map((a) => codeOf(s, a));
const damageOn = (s: GameState, id: InstanceId): number => inst(s, id).damage;
const everyone = (s: GameState): PlayerId[] => s.players.map((p) => p.playerId);
const discardCodes = (s: GameState): string[] => piles(s).discard.map((id) => codeOf(s, id));
const opts = (o: CivilWarGameOptions) => o;

/** The setup game, parked on the enemy team's Setup prompt (the mulligans answered with their first legal option). */
function toEnemyChoice(created: GameState): GameState {
  let state = created;
  for (let guard = 0; guard < 50 && !isEnemyTeamChoice(state); guard++) {
    const choice = state.pendingChoice;
    if (!choice) throw new Error("setup ended without the enemy team's prompt");
    const result = applyCommand(
      state,
      {
        type: "resolveChoice",
        playerId: choice.playerId,
        choiceId: choice.choiceId,
        selectedOptionIds: firstLegal(state),
      },
      DEPS,
    );
    if (!result.ok) throw new Error(result.error.message);
    state = result.state;
  }
  return state;
}

/**
 * The scenario past setup with `found` revealed by the Setup, every seat in hero form. Stage 1A also revealed Stark Tower;
 * most tests stack or stage it themselves as an ordinary card, so it starts back in the encounter deck (pass
 * `leaderSideScheme: "inPlay"` for the real board).
 */
function game(o: CivilWarGameOptions & { readonly found?: string } = {}): GameState {
  const { found = GAUNTLETS, ...rest } = o;
  const played = civilWarGame(IRON_MAN_SCENARIO, { leaderSideScheme: "discarded", ...rest }, findingCard(found));
  return heroForm(played, ...everyone(played));
}

/** Every attachment taken off Iron Man (back to the encounter discard pile), then `codes` attached to him by surgery. */
function withTech(state: GameState, codes: readonly string[]): GameState {
  const iron = villainOf(state);
  const old = inst(state, iron).attachments;
  let current = patchInstance(state, iron, { attachments: [], statuses: { ...inst(state, iron).statuses, tough: 0 } });
  for (const id of old) current = patchInstance(current, id, { attachedTo: null });
  const deckId = Object.keys(current.encounterDecks)[0]!;
  const pile = current.encounterDecks[deckId]!;
  current = {
    ...current,
    encounterDecks: { ...current.encounterDecks, [deckId]: { deck: pile.deck, discard: [...old, ...pile.discard] } },
  };
  for (const code of codes) current = attachToHost(current, code, iron).state;
  return current;
}

/** Stunned cancels his attack and confused cancels his scheme: either way his own activation passes with no boost card. */
const disabled = (state: GameState, id: InstanceId, status: "stunned" | "confused"): GameState =>
  patchInstance(state, id, { statuses: { ...inst(state, id).statuses, [status]: 1 } });
const stunned = (state: GameState, id: InstanceId): GameState => disabled(state, id, "stunned");
const confused = (state: GameState, id: InstanceId): GameState => disabled(state, id, "confused");
const alterEgo = (state: GameState): GameState => withForm(state, "alterEgo");
const ready = (state: GameState, player: PlayerId = P1): GameState =>
  patchInstance(state, identityOf(state, player), { exhausted: false });

/** Every player ends the turn: the villain phase runs on the stacked encounter deck (top first). */
const villainPhase = (state: GameState, pick: Picker, ...stack: string[]) =>
  driveEventsPicking(
    DEPS,
    stack.length > 0 ? stackEncounterDeck(state, ...stack) : state,
    pick,
    ...everyone(state).map((p) => endTurn(p)),
  );

/** The resolved damage events of attacks, with the keywords the attack carried. */
const attackDamage = (events: readonly GameEvent[]) =>
  events.flatMap((e) =>
    e.type === "triggerEvent" && e.event.kind === "dealDamage" && e.phase === "resolved" && e.event.fromAttack
      ? [e.event]
      : [],
  );
const toughRemoved = (events: readonly GameEvent[]) =>
  types(events, "statusRemoved").filter((e) => e.status === "tough");
const schemes = (events: readonly GameEvent[]) => types(events, "schemeResolved");
const attacks = (events: readonly GameEvent[]) => types(events, "attackResolved");

/** `n` cards of each listed printed resource type (and of no other) moved from the player's deck into their hand. */
function handFor(state: GameState, wanted: readonly ("energy" | "mental" | "physical")[], player: PlayerId = P1) {
  const owner = state.players.find((p) => p.playerId === player)!;
  const used: InstanceId[] = [];
  for (const type of wanted) {
    const id = [...owner.hand, ...owner.deck].find((i) => {
      const card = state.cardPool[state.instances[i]!.cardId]!;
      const icons = ("resourceIcons" in card ? card.resourceIcons : undefined) ?? {};
      const others = Object.entries(icons).filter(([k, n]) => k !== type && (n ?? 0) > 0);
      return !used.includes(i) && (icons[type] ?? 0) > 0 && others.length === 0;
    });
    if (!id) throw new Error(`no ${type}-only card for ${player}`);
    used.push(id);
  }
  return {
    ids: used,
    state: {
      ...state,
      players: state.players.map((p) =>
        p.playerId === player
          ? {
              ...p,
              deck: p.deck.filter((i) => !used.includes(i)),
              hand: [...p.hand.filter((i) => !used.includes(i)), ...used],
            }
          : p,
      ),
    },
  };
}

describe("registry", () => {
  it("registers every ref of the nine cards (none skipped), each a valid definition", () => {
    expect(Object.keys(LEADERS_IRON_MAN).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(LEADERS_IRON_MAN)) expect(validateDefinition(def), id).toEqual([]);
    expect(LEADERS_IRON_MAN_SKIPPED).toEqual({});
  });

  it("the data names exactly these refs for the four stages and the eight cards of the set", () => {
    const codes = ["56059", "56065", "56066", "56067", "56068", "56069", "56070", "56071", "56072"];
    const refs = codes.flatMap((code) => abilityRefIds(WAVE10_CARDS.find((c) => (c.id as string) === code)!));
    expect([...refs].sort()).toEqual([...REFS].sort());
  });
});

describe("data", () => {
  it("the four stages: I 1/1/12, II Steady 1/2/16, III 1/2/16, IV Steady 1/3/20 (SCH, ATK, hit points per player)", () => {
    const stages = (
      dataOf("56059").sides as {
        stages: { sch: number; atk: number; hp: { perPlayer: number }; keywords: { name: string }[] }[];
      }[]
    )[0]!.stages;
    expect(stages.map((s) => [s.sch, s.atk, s.hp.perPlayer, s.keywords.map((k) => k.name)])).toEqual([
      [1, 1, 12, []],
      [1, 2, 16, ["steady"]],
      [1, 2, 16, []],
      [1, 3, 20, ["steady"]],
    ]);
    expect(dataOf("56059").printedType).toBe("leader");
  });
});

describe("Setup (stage I and stage III): the enemy team searches the encounter deck for an Iron Man attachment", () => {
  it.each([
    ["standard", false, 12, 0],
    ["standard", true, 24, 0],
    ["expert", false, 16, 2],
    ["expert", true, 32, 2],
  ] as const)(
    "%s, two players %s: one prompt marked as the enemy team's offers the five attachments; Iron Man has %i hit points at stage index %i",
    (difficulty, twoPlayers, hp, stageIndex) => {
      const state = toEnemyChoice(civilWarSetup(IRON_MAN_SCENARIO, opts({ difficulty, twoPlayers })));
      const choice = state.pendingChoice!;
      expect(choice.authority).toBe("enemyTeam");
      expect(choice.playerId).toBe(P1);
      expect(choice.onBehalfOf).toEqual({ kind: "enemyTeam", teamId: SINGLE_TEAM, facingPlayerId: P1 });
      expect([choice.minSelections, choice.maxSelections]).toEqual([1, 1]);
      const offered = choice.options.map((o) => codeOf(state, (o.ref as { instanceId: InstanceId }).instanceId));
      expect(offered.sort()).toEqual([...ATTACHMENTS].sort());
      expect(state.villains[0]!.stageIndex).toBe(stageIndex);
      expect(maxHitPoints(state, villainOf(state), DEPS)).toBe(hp);
      expect(attachedCodes(state)).toEqual([]);
    },
  );

  it("the chosen card is revealed and attaches to Iron Man with its When Revealed resolved (Mark V Helmet: a tough status card)", () => {
    const parked = toEnemyChoice(civilWarSetup(IRON_MAN_SCENARIO, opts({ twoPlayers: true })));
    const run = driveEventsPicking(DEPS, parked, findingCard(HELMET));
    const state = run.state;
    const helmet = inst(state, villainOf(state)).attachments[0]!;
    expect(attachedCodes(state)).toEqual([HELMET]);
    expect(inst(state, helmet).attachedTo).toBe(villainOf(state));
    expect(types(run.events, "encounterCardRevealed").map((e) => [e.instanceId, e.playerId])).toContainEqual([
      helmet,
      P1,
    ]);
    expect(inst(state, villainOf(state)).statuses.tough).toBe(1);
    expect(piles(state).deck.map((id) => codeOf(state, id))).not.toContain(HELMET);
    expect(piles(state).deck.map((id) => codeOf(state, id))).toEqual(
      expect.arrayContaining([GAUNTLETS, BOOTS, REACTOR, ARMOR]),
    );
    // The prompt was answered once; no second search prompt follows.
    expect(types(run.events, "choiceRequested").filter((e) => e.choice.authority === "enemyTeam")).toEqual([]);
  });

  it("two players: the second player's answer is refused (p1 must make this choice); the first player's is accepted", () => {
    const state = toEnemyChoice(civilWarSetup(IRON_MAN_SCENARIO, opts({ twoPlayers: true })));
    const choice = state.pendingChoice!;
    const pick = cardOption(state, ARMOR)!.optionId;
    const answer = (playerId: PlayerId) =>
      applyCommand(
        state,
        { type: "resolveChoice", playerId, choiceId: choice.choiceId, selectedOptionIds: [pick] },
        DEPS,
      );
    const refused = answer(P2);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.code).toBe("invalid_choice");
      expect(refused.error.message).toBe("p1 must make this choice");
    }
    expect(answer(P1).ok).toBe(true);
  });

  it("the main scheme's Setup also reveals Stark Tower: it is in play from the start, in neither the deck nor the discard pile", () => {
    const state = civilWarGame(IRON_MAN_SCENARIO, opts({}), findingCard(GAUNTLETS));
    expect(state.villainArea.map((id) => codeOf(state, id))).toEqual([TOWER]);
    expect(piles(state).deck.map((id) => codeOf(state, id))).not.toContain(TOWER);
    expect(discardCodes(state)).not.toContain(TOWER);
  });

  it("each of the five attachments can be the one found: exactly that one ends up on Iron Man (stage I and stage III)", () => {
    for (const difficulty of ["standard", "expert"] as const) {
      for (const code of ATTACHMENTS) {
        const parked = toEnemyChoice(civilWarSetup(IRON_MAN_SCENARIO, opts({ difficulty })));
        const state = driveEventsPicking(DEPS, parked, findingCard(code)).state;
        expect([difficulty, code, attachedCodes(state)]).toEqual([difficulty, code, [code]]);
      }
    }
  });

  it("expert mode: stage III's own Setup runs (the data label is Setup, not When Revealed), 16 hit points and no damage", () => {
    const state = game({ difficulty: "expert", found: REACTOR });
    expect(state.villains[0]!.stageIndex).toBe(2);
    expect(attachedCodes(state)).toEqual([REACTOR]);
    expect(maxHitPoints(state, villainOf(state), DEPS)).toBe(16);
    expect(damageOn(state, villainOf(state))).toBe(0);
  });
});

describe("the constant: +1 SCH for each Tech attachment on him (to a maximum of +3 SCH)", () => {
  it.each([
    [0, []],
    [1, [ARMOR]],
    [3, [ARMOR, GAUNTLETS, BOOTS]],
    [4, [ARMOR, GAUNTLETS, BOOTS, HELMET]],
  ] as const)("%i Tech attachment(s): SCH 1 + %i is the scheme he resolves, plus the boost icons", (count, codes) => {
    const t = withTech(alterEgo(game()), codes);
    const bonus = Math.min(count, 3);
    expect(statBonus(t, DEPS, villainOf(t), "sch")).toBe(bonus);
    // The activation: a Repulsor Blast as the boost card (1 icon), another dealt to the player (alter-ego: nothing to discard).
    const run = villainPhase(t, firstLegal, BLAST, BLAST);
    expect(schemes(run.events).filter((e) => e.enemyInstanceId === villainOf(t))).toMatchObject([
      { baseSch: 1 + bonus, boostIcons: 1, threatPlaced: 2 + bonus },
    ]);
  });

  it("every Tech attachment counts alike, whichever card it is, and a fifth adds nothing past the +3", () => {
    const t = withTech(game(), ATTACHMENTS);
    expect(attachedCodes(t).sort()).toEqual([...ATTACHMENTS].sort());
    expect(statBonus(t, DEPS, villainOf(t), "sch")).toBe(3);
  });

  it("the attachments are Tech in the data (Armor. Tech.)", () => {
    for (const code of ATTACHMENTS) {
      expect((dataOf(code).traits as string[]).map(String), code).toContain("TECH");
    }
  });
});

describe("Powered Gauntlets (56065)", () => {
  it("CONSTANT: Iron Man's attacks gain ranged (and the +1 ATK box: ATK 2, 3 damage with a 1-icon boost)", () => {
    const t = withTech(game(), [GAUNTLETS]);
    expect(statBonus(t, DEPS, villainOf(t), "atk")).toBe(1);
    const run = villainPhase(t, firstLegal, BLAST, BOOTS);
    expect(attacks(run.events).filter((a) => a.enemyInstanceId === villainOf(t))).toMatchObject([
      { baseAtk: 2, boostIcons: 1, damageDealt: 3 },
    ]);
    const hit = attackDamage(run.events).find((d) => d.sourceInstanceId === villainOf(t))!;
    expect(Boolean(hit.ranged)).toBe(true);
  });

  it("CONSTANT: without it his attack is not ranged (ATK 1, 2 damage with the same boost)", () => {
    const t = withTech(game(), [ARMOR]);
    const run = villainPhase(t, firstLegal, BLAST, BOOTS);
    expect(attacks(run.events).filter((a) => a.enemyInstanceId === villainOf(t))).toMatchObject([
      { baseAtk: 1, boostIcons: 1, damageDealt: 2 },
    ]);
    const hit = attackDamage(run.events).find((d) => d.sourceInstanceId === villainOf(t))!;
    expect(Boolean(hit.ranged)).toBe(false);
  });
});

describe("Rocket Boots (56066)", () => {
  it("CONSTANT: Iron Man gains the Aerial trait while it is attached, and loses it with the card (+1 ATK is data)", () => {
    const base = game();
    const t = withTech(base, [BOOTS]);
    expect(traitsOf(t, villainOf(t), DEPS)).toContainEqual(AERIAL);
    expect(statBonus(t, DEPS, villainOf(t), "atk")).toBe(1);
    const without = withTech(base, [ARMOR]);
    expect(traitsOf(without, villainOf(without), DEPS)).not.toContainEqual(AERIAL);
    expect(statBonus(without, DEPS, villainOf(without), "atk")).toBe(0);
  });
});

describe("Mark V Helmet (56067) and Arc Reactor (56068)", () => {
  it("Helmet: found by the Setup it gives him a tough status card, and he has stalwart; SCH +1", () => {
    const t = game({ found: HELMET });
    expect(inst(t, villainOf(t)).statuses.tough).toBe(1);
    expect(hasKeyword(t, villainOf(t), "stalwart", DEPS)).toBe(true);
    expect(statBonus(t, DEPS, villainOf(t), "sch")).toBe(1);
  });

  it("Reactor: found by the Setup it gives him a tough status card, and retaliate 1 (SCH +1)", () => {
    const t = game({ found: REACTOR });
    expect(inst(t, villainOf(t)).statuses.tough).toBe(1);
    expect(keywordTotal(t, villainOf(t), "retaliate", DEPS)).toBe(1);
    expect(statBonus(t, DEPS, villainOf(t), "sch")).toBe(1);
  });

  it("the keywords belong to the cards: with only Armor attached he has neither stalwart nor retaliate, and no tough", () => {
    const t = game({ found: ARMOR });
    expect(hasKeyword(t, villainOf(t), "stalwart", DEPS)).toBe(false);
    expect(keywordTotal(t, villainOf(t), "retaliate", DEPS)).toBe(0);
    expect(inst(t, villainOf(t)).statuses.tough).toBe(0);
  });

  it("Reactor's retaliate 1: a basic attack on Iron Man (tough soaks it) costs Tigra 1 damage", () => {
    const t = game({ found: REACTOR });
    const run = heroAttacks(DEPS, t, villainOf(t));
    expect(damageOn(run.state, villainOf(run.state))).toBe(0);
    expect(inst(run.state, villainOf(run.state)).statuses.tough).toBe(0);
    expect(damageOn(run.state, identityOf(run.state))).toBe(1);
  });
});

describe("Hero Response: after you make a basic attack against Iron Man, spend two resources -> discard this card", () => {
  const SPEND = {
    [GAUNTLETS]: ["energy", "physical"],
    [BOOTS]: ["energy", "physical"],
    [HELMET]: ["mental", "physical"],
    [REACTOR]: ["mental", "physical"],
  } as const;
  /** Takes the card's response when it is offered and pays with `pay`. */
  const accepting =
    (code: string, pay: readonly InstanceId[]): Picker =>
    (s) => {
      const c = s.pendingChoice!;
      if (c.prompt.kind === "chooseTriggers") {
        const take = c.options.find((o) => o.optionId.includes(`${code}.`) && o.optionId.includes("response"));
        return take ? [take.optionId] : firstLegal(s);
      }
      if (c.prompt.kind === "payForAbility") return pay.map((id) => `hand:${id}`);
      return firstLegal(s);
    };
  const attacked = (code: keyof typeof SPEND, take: boolean, spendOnly?: number) => {
    const staged = handFor(ready(withTech(game(), [code])), SPEND[code]);
    const pay = take ? staged.ids.slice(0, spendOnly ?? staged.ids.length) : [];
    return { staged, run: heroAttacks(DEPS, staged.state, villainOf(staged.state), { pick: accepting(code, pay) }) };
  };

  it.each([
    [GAUNTLETS, 0],
    [BOOTS, 0],
    [HELMET, 0],
    [REACTOR, 1],
  ] as const)(
    "%s: paid, it is discarded and Iron Man took the attack's 2 damage (Tigra takes %i from retaliate)",
    (code, retaliate) => {
      const { staged, run } = attacked(code, true);
      expect(attachedCodes(run.state)).toEqual([]);
      expect(discardCodes(run.state)).toContain(code);
      for (const id of staged.ids) expect(run.state.players[0]!.discard).toContain(id);
      expect(damageOn(run.state, villainOf(run.state))).toBe(2);
      expect(damageOn(run.state, identityOf(run.state))).toBe(retaliate);
    },
  );

  it.each([GAUNTLETS, BOOTS, HELMET, REACTOR] as const)("%s: left unused it stays on Iron Man", (code) => {
    const { run } = attacked(code, false);
    expect(attachedCodes(run.state)).toEqual([code]);
    expect(discardCodes(run.state)).not.toContain(code);
  });

  it("Armor's own attack window has no response: it is only a Forced Interrupt (no response is offered)", () => {
    const t = ready(withTech(game(), [ARMOR]));
    const offered: string[] = [];
    heroAttacks(DEPS, t, villainOf(t), {
      pick: (s) => {
        offered.push(...s.pendingChoice!.options.map((o) => o.optionId));
        return firstLegal(s);
      },
    });
    expect(offered.filter((o) => o.includes("response"))).toEqual([]);
  });
});

describe("Mark V Armor (56069): Forced Interrupt, the damage is placed here instead", () => {
  const armorOf = (s: GameState) => inst(s, villainOf(s)).attachments[0]!;

  it("a 2 damage basic attack: Iron Man takes none, 2 damage is placed on the armor, which stays", () => {
    const t = game({ found: ARMOR });
    const armor = armorOf(t);
    const run = heroAttacks(DEPS, t, villainOf(t));
    expect(damageOn(run.state, villainOf(run.state))).toBe(0);
    expect(damageOn(run.state, armor)).toBe(2);
    expect(attachedCodes(run.state)).toEqual([ARMOR]);
    expect(types(run.events, "damagePlaced")).toMatchObject([{ targetInstanceId: armor, amount: 2 }]);
    expect(types(run.events, "damageDealt").filter((e) => e.targetInstanceId === villainOf(t))).toEqual([]);
  });

  it("it accumulates: 2 damage already there, a second attack makes 4, and the armor still stays", () => {
    const t = game({ found: ARMOR });
    const armor = armorOf(t);
    const run = heroAttacks(DEPS, patchInstance(t, armor, { damage: 2 }), villainOf(t));
    expect(damageOn(run.state, armor)).toBe(4);
    expect(attachedCodes(run.state)).toEqual([ARMOR]);
    expect(damageOn(run.state, villainOf(run.state))).toBe(0);
  });

  it("the hit that brings it to exactly 5 (3 + 2) is absorbed in full and then the armor is discarded", () => {
    const t = game({ found: ARMOR });
    const armor = armorOf(t);
    const run = heroAttacks(DEPS, patchInstance(t, armor, { damage: 3 }), villainOf(t));
    expect(attachedCodes(run.state)).toEqual([]);
    expect(discardCodes(run.state)).toContain(ARMOR);
    expect(inst(run.state, armor).attachedTo).toBeNull();
    expect(damageOn(run.state, villainOf(run.state))).toBe(0);
  });

  it("a hit past 5 (4 + 2 = 6) is still all placed there: nothing spills onto Iron Man", () => {
    const t = game({ found: ARMOR });
    const armor = armorOf(t);
    const run = heroAttacks(DEPS, patchInstance(t, armor, { damage: 4 }), villainOf(t));
    expect(attachedCodes(run.state)).toEqual([]);
    expect(discardCodes(run.state)).toContain(ARMOR);
    expect(damageOn(run.state, villainOf(run.state))).toBe(0);
  });

  it("once it is gone the next attack hurts him: 2 damage", () => {
    const t = game({ found: ARMOR });
    const gone = heroAttacks(DEPS, patchInstance(t, armorOf(t), { damage: 3 }), villainOf(t)).state;
    const again = heroAttacks(DEPS, ready(gone), villainOf(gone)).state;
    expect(damageOn(again, villainOf(again))).toBe(2);
  });

  it("without the armor an attack deals its 2 damage to him (negative: no damage is placed anywhere)", () => {
    const t = game({ found: GAUNTLETS });
    const run = heroAttacks(DEPS, t, villainOf(t));
    expect(damageOn(run.state, villainOf(run.state))).toBe(2);
    expect(types(run.events, "damagePlaced")).toEqual([]);
  });
});

describe("Boost", () => {
  const ICONS = [
    [GAUNTLETS, 0],
    [BOOTS, 0],
    [HELMET, 2],
    [REACTOR, 2],
    [ARMOR, 0],
    [BLAST, 1],
    [PUNCH, 2],
    [TOWER, 3],
  ] as const;
  const REVEALED_BY_BOOST: readonly string[] = [GAUNTLETS, BOOTS, ARMOR];
  const SPARE: Record<string, string> = {
    [GAUNTLETS]: BOOTS,
    [BOOTS]: GAUNTLETS,
    [HELMET]: BOOTS,
    [REACTOR]: BOOTS,
    [ARMOR]: BOOTS,
    [BLAST]: BOOTS,
    [PUNCH]: BOOTS,
    [TOWER]: BOOTS,
  };

  it.each(ICONS)("%s flipped as the boost card of Iron Man's scheme carries %i boost icon(s)", (code, icons) => {
    const t = withTech(alterEgo(game()), []);
    const run = villainPhase(t, firstLegal, code, SPARE[code]!);
    expect(types(run.events, "boostCardFlipped").map((e) => [codeOf(run.state, e.instanceId), e.boostIcons])).toEqual([
      [code, icons],
    ]);
    // A revealed boost attachment is on him before the scheme resolves: its Tech counts toward SCH (+1).
    const revealed = REVEALED_BY_BOOST.includes(code) ? 1 : 0;
    expect(schemes(run.events).filter((e) => e.enemyInstanceId === villainOf(t))).toMatchObject([
      { baseSch: 1 + revealed, boostIcons: icons, threatPlaced: 1 + revealed + icons },
    ]);
  });

  it.each([GAUNTLETS, BOOTS, ARMOR] as const)(
    "%s: 'Reveal this card' attaches it to Iron Man, revealed by the player",
    (code) => {
      const t = withTech(alterEgo(game()), []);
      const run = villainPhase(t, firstLegal, code, SPARE[code]!);
      const card = types(run.events, "boostCardFlipped")[0]!.instanceId;
      expect(types(run.events, "encounterCardRevealed").map((e) => [e.instanceId, e.playerId])).toContainEqual([
        card,
        P1,
      ]);
      expect(inst(run.state, card).attachedTo).toBe(villainOf(t));
      expect(attachedCodes(run.state)).toContain(code);
    },
  );

  it.each([HELMET, REACTOR] as const)("%s has no boost ability: it is only discarded, never attached", (code) => {
    const t = withTech(alterEgo(game()), []);
    const run = villainPhase(t, firstLegal, code, SPARE[code]!);
    expect(attachedCodes(run.state)).not.toContain(code);
    expect(discardCodes(run.state)).toContain(code);
    expect(inst(run.state, villainOf(t)).statuses.tough).toBe(0);
  });
});

describe("Repulsor Blast (56070)", () => {
  it("(Alter-Ego) discards an upgrade or support you control: Precinct HQ", () => {
    const base = alterEgo(game());
    const { state: withHq, id: hq } = playFromHand(DEPS, withTech(base, [ARMOR]), "56003", 2);
    const t = confused(withHq, villainOf(withHq));
    const run = villainPhase(t, firstLegal, BLAST);
    expect(run.state.players[0]!.discard).toContain(hq);
    expect(run.state.players[0]!.playArea).not.toContain(hq);
  });

  it("(Alter-Ego) with no upgrade or support in play nothing is discarded and nothing else happens", () => {
    const base = alterEgo(withTech(game(), [ARMOR]));
    const t = confused(base, villainOf(base));
    const before = t.players[0]!.playArea;
    const run = villainPhase(t, firstLegal, BLAST);
    expect(run.state.players[0]!.playArea).toEqual(before);
    expect(damageOn(run.state, identityOf(run.state))).toBe(0);
  });

  it("(Hero) discards the top 4 cards of the deck and deals 1 damage for each printed energy and wild resource: 2 energy + 1 wild = 3", () => {
    const base = withTech(game(), [ARMOR]);
    const { state, ids } = putOnTopOfDeck(stunned(base, villainOf(base)), P1, "56004", "56006", "56005", "56002");
    const run = villainPhase(state, firstLegal, BLAST);
    for (const id of ids) expect(run.state.players[0]!.discard).toContain(id);
    expect(damageOn(run.state, identityOf(run.state))).toBe(3);
  });

  it("(Hero) no energy or wild among the four (mental, mental, physical, mental): no damage", () => {
    const base = withTech(game(), [ARMOR]);
    const { state, ids } = putOnTopOfDeck(stunned(base, villainOf(base)), P1, "56003", "56007", "56008", "56009");
    const run = villainPhase(state, firstLegal, BLAST);
    for (const id of ids) expect(run.state.players[0]!.discard).toContain(id);
    expect(damageOn(run.state, identityOf(run.state))).toBe(0);
  });
});

describe("Supersonic Punch (56071)", () => {
  /** Iron Man stunned (his own activation passes without a boost card), then the Punch, then a 1-icon boost for its attack or scheme. */
  const punch = (form: "alterEgo" | "hero", tech: boolean, tough = false) => {
    const base = withTech(form === "hero" ? game() : alterEgo(game()), tech ? [ARMOR] : []);
    const hurt = tough
      ? patchInstance(base, identityOf(base), { statuses: { ...inst(base, identityOf(base)).statuses, tough: 1 } })
      : base;
    const off = form === "hero" ? stunned : confused;
    return villainPhase(off(hurt, villainOf(hurt)), firstLegal, PUNCH, BLAST);
  };

  it("(Alter-Ego) with a Tech attachment: Iron Man schemes (SCH 1 + 1 Tech + 1 boost = 3 threat) and you are confused", () => {
    const run = punch("alterEgo", true);
    expect(schemes(run.events)).toMatchObject([{ baseSch: 2, boostIcons: 1, threatPlaced: 3 }]);
    expect(inst(run.state, identityOf(run.state)).statuses.confused).toBe(1);
  });

  it("(Alter-Ego) with no Tech attachment: he schemes (SCH 1 + 1 boost = 2 threat) and you are not confused", () => {
    const run = punch("alterEgo", false);
    expect(schemes(run.events)).toMatchObject([{ baseSch: 1, boostIcons: 1, threatPlaced: 2 }]);
    expect(inst(run.state, identityOf(run.state)).statuses.confused).toBe(0);
  });

  it("(Hero) with a Tech attachment the attack gains piercing: the tough card is discarded and the 2 damage (ATK 1 + 1 boost) is dealt", () => {
    const run = punch("hero", true, true);
    expect(attacks(run.events)).toMatchObject([{ baseAtk: 1, boostIcons: 1, damageDealt: 2 }]);
    expect(toughRemoved(run.events)).toMatchObject([{ status: "tough", reason: "piercing" }]);
    expect(damageOn(run.state, identityOf(run.state))).toBe(2);
    expect(inst(run.state, identityOf(run.state)).statuses.tough).toBe(0);
  });

  it("(Hero) with no Tech attachment the attack is not piercing: the tough card prevents it and takes no damage", () => {
    const run = punch("hero", false, true);
    expect(toughRemoved(run.events)).toMatchObject([{ status: "tough", reason: "preventedDamage" }]);
    expect(damageOn(run.state, identityOf(run.state))).toBe(0);
  });
});

describe("Stark Tower (56072): When Defeated, the enemy team searches the deck and the discard pile for an Iron Man attachment", () => {
  /** Stark Tower with 1 threat in the villain area, Gauntlets on Iron Man (found by the Setup), Boots in the discard pile. */
  function tower(players: 1 | 2 = 1, remove: readonly string[] = []) {
    const base = game({ found: GAUNTLETS, twoPlayers: players === 2 });
    const { state, id } = encounterCardInVillainArea(inDiscardPile(base, BOOTS), TOWER, 1);
    return { state: remove.reduce(without, state), id };
  }
  const thwartCommand = (state: GameState, id: InstanceId, player: PlayerId) =>
    ({
      type: "basicThwart",
      playerId: player,
      thwarterInstanceId: identityOf(state, player),
      schemeInstanceId: id,
    }) as const;
  /** `player` thwarts the tower away; choices are answered with their first legal option. */
  const thwart = (state: GameState, id: InstanceId, player: PlayerId) =>
    driveEventsPicking(DEPS, ready(state, player), firstLegal, thwartCommand(state, id, player));
  /** The same thwart, parked on the enemy team's prompt. */
  function parkedOnPrompt(state: GameState, id: InstanceId, player: PlayerId): GameState {
    const first = applyCommand(ready(state, player), thwartCommand(state, id, player), DEPS);
    if (!first.ok) throw new Error(first.error.message);
    let current = first.state;
    for (let guard = 0; guard < 20 && current.pendingChoice && !isEnemyTeamChoice(current); guard++) {
      const choice = current.pendingChoice;
      const next = applyCommand(
        current,
        {
          type: "resolveChoice",
          playerId: choice.playerId,
          choiceId: choice.choiceId,
          selectedOptionIds: firstLegal(current),
        },
        DEPS,
      );
      if (!next.ok) throw new Error(next.error.message);
      current = next.state;
    }
    return current;
  }

  it("one player: the prompt is the enemy team's, for the first player; the deck's three and the discard pile's one are offered", () => {
    const t = tower();
    const state = parkedOnPrompt(t.state, t.id, P1);
    const choice = state.pendingChoice!;
    expect([choice.authority, choice.playerId]).toEqual(["enemyTeam", P1]);
    expect(choice.onBehalfOf).toMatchObject({ kind: "enemyTeam", teamId: SINGLE_TEAM });
    expect([choice.minSelections, choice.maxSelections]).toEqual([1, 1]);
    const offered = choice.options.map((o) => codeOf(state, (o.ref as { instanceId: InstanceId }).instanceId));
    expect(offered.sort()).toEqual([BOOTS, HELMET, REACTOR, ARMOR].sort());
  });

  it("the card taken from the discard pile is revealed and attaches: Boots join the Gauntlets (two Tech attachments, SCH +2)", () => {
    const t = tower();
    const run = driveEventsPicking(DEPS, parkedOnPrompt(t.state, t.id, P1), findingCard(BOOTS));
    expect(attachedCodes(run.state).sort()).toEqual([BOOTS, GAUNTLETS].sort());
    expect(types(run.events, "encounterCardRevealed").map((e) => codeOf(run.state, e.instanceId))).toContain(BOOTS);
    expect(discardCodes(run.state)).not.toContain(BOOTS);
    expect(discardCodes(run.state)).toContain(TOWER);
    expect(statBonus(run.state, DEPS, villainOf(run.state), "sch")).toBe(2);
  });

  it("the card taken from the deck works the same way (Mark V Helmet: a tough status card too)", () => {
    const t = tower();
    const run = driveEventsPicking(DEPS, parkedOnPrompt(t.state, t.id, P1), findingCard(HELMET));
    expect(attachedCodes(run.state).sort()).toEqual([GAUNTLETS, HELMET].sort());
    expect(inst(run.state, villainOf(run.state)).statuses.tough).toBe(1);
  });

  it("two players: the second player defeats it and the first player is still the one asked; the second player is refused", () => {
    const t = tower(2);
    const secondTurn = driveEventsPicking(DEPS, t.state, firstLegal, endTurn(P1)).state;
    const state = parkedOnPrompt(secondTurn, t.id, P2);
    const choice = state.pendingChoice!;
    expect([choice.authority, choice.playerId]).toEqual(["enemyTeam", P1]);
    const pick = cardOption(state, ARMOR)!.optionId;
    const refused = applyCommand(
      state,
      { type: "resolveChoice", playerId: P2, choiceId: choice.choiceId, selectedOptionIds: [pick] },
      DEPS,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.message).toBe("p1 must make this choice");
    const after = driveEventsPicking(DEPS, state, findingCard(ARMOR)).state;
    expect(attachedCodes(after).sort()).toEqual([ARMOR, GAUNTLETS].sort());
  });

  it("with a single candidate left there is no prompt: it is found and attached", () => {
    const t = tower(1, [HELMET, REACTOR, ARMOR]);
    // Every prompt the thwart raises is recorded: none is the enemy team's, and none is a choice of cards.
    const asked: string[] = [];
    const run = driveEventsPicking(
      DEPS,
      ready(t.state, P1),
      (s) => {
        asked.push(`${s.pendingChoice!.prompt.kind}:${s.pendingChoice!.authority}`);
        return firstLegal(s);
      },
      thwartCommand(t.state, t.id, P1),
    );
    expect(asked.filter((a) => a.startsWith("chooseCards") || a.endsWith("enemyTeam"))).toEqual([]);
    expect(run.state.pendingChoice).toBeNull();
    expect(attachedCodes(run.state).sort()).toEqual([BOOTS, GAUNTLETS].sort());
  });

  it("with no candidate left nothing is found, nobody is asked and the tower is still defeated", () => {
    const t = tower(1, [BOOTS, HELMET, REACTOR, ARMOR]);
    const run = thwart(t.state, t.id, P1);
    expect(run.state.pendingChoice).toBeNull();
    expect(attachedCodes(run.state)).toEqual([GAUNTLETS]);
    expect(discardCodes(run.state)).toContain(TOWER);
  });

  it("negative: thwarting without defeating it (2 threat, 1 removed) searches nothing", () => {
    const t = tower();
    const run = thwart(patchInstance(t.state, t.id, { threat: 2 }), t.id, P1);
    expect(run.state.pendingChoice).toBeNull();
    expect(attachedCodes(run.state)).toEqual([GAUNTLETS]);
    expect(inst(run.state, t.id).threat).toBe(1);
  });
});

describe("Stages: advancing from I to II (standard) and from III to IV (expert)", () => {
  /** The scenario in hero form, an inert attachment on top of the encounter deck for the card the advance deals. */
  const advanced = (difficulty: "standard" | "expert", twoPlayers: boolean) => {
    const base = game({ difficulty, twoPlayers, found: GAUNTLETS });
    const staged = stackEncounterDeck(base, BOOTS);
    return defeatWithAttack(DEPS, staged, villainOf(staged));
  };

  it.each([
    ["standard", false, 1, 16],
    ["standard", true, 1, 32],
    ["expert", false, 3, 20],
    ["expert", true, 3, 40],
  ] as const)(
    "%s, two players %s: the next stage (index %i) is in play with %i hit points, no damage, Steady, and no Setup prompt",
    (difficulty, twoPlayers, stageIndex, hp) => {
      const state = advanced(difficulty, twoPlayers);
      expect(state.villains[0]!.stageIndex).toBe(stageIndex);
      expect(state.outcome).toBeNull();
      expect(state.pendingChoice).toBeNull();
      expect(maxHitPoints(state, villainOf(state), DEPS)).toBe(hp);
      expect(damageOn(state, villainOf(state))).toBe(0);
      expect(hasKeyword(state, villainOf(state), "steady", DEPS)).toBe(true);
    },
  );

  it.each([
    ["standard", false],
    ["standard", true],
    ["expert", false],
    ["expert", true],
  ] as const)(
    "%s, two players %s: When Revealed deals each player one facedown encounter card",
    (difficulty, twoPlayers) => {
      const state = advanced(difficulty, twoPlayers);
      expect(state.players.map((p) => p.dealtEncounter.length)).toEqual(twoPlayers ? [1, 1] : [1]);
    },
  );

  it("stage I and stage III have no Steady (it appears with the advance)", () => {
    for (const difficulty of ["standard", "expert"] as const) {
      const t = game({ difficulty });
      expect(hasKeyword(t, villainOf(t), "steady", DEPS), difficulty).toBe(false);
    }
  });

  it.each(["standard", "expert"] as const)(
    "%s: 'cannot take damage this phase' holds for the rest of the phase and ends with it",
    (difficulty) => {
      const state = advanced(difficulty, false);
      const iron = villainOf(state);
      const refused = applyCommand(
        ready(state),
        { type: "basicAttack", playerId: P1, attackerInstanceId: identityOf(state), targetInstanceId: iron },
        DEPS,
      );
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.code).toBe("no_valid_target");
      expect(damageOn(state, iron)).toBe(0);
      const same = state;
      // The next round: the dealt card (Boots) is revealed in the villain phase, then a new player phase.
      const round = villainPhase(same, firstLegal, BLAST, BLAST).state;
      expect(round.step.phase).toBe("player");
      const later = heroAttacks(DEPS, ready(round), iron).state;
      expect(damageOn(later, iron)).toBe(2);
    },
  );

  it.each(["standard", "expert"] as const)(
    "%s: the new stage has its own +1 SCH per Tech attachment, to a maximum of +3",
    (difficulty) => {
      const state = advanced(difficulty, false);
      const iron = villainOf(state);
      const codes = [ARMOR, GAUNTLETS, HELMET, REACTOR];
      for (const count of [0, 1, 2, 4]) {
        const t = withTech(state, codes.slice(0, count));
        expect([count, statBonus(t, DEPS, iron, "sch")]).toEqual([count, Math.min(count, 3)]);
      }
    },
  );
});
