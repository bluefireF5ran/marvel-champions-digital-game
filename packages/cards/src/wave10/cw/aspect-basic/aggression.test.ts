import { CW_CARDS, PLAYABLE_CARDS, cardId, type AnyCard } from "@mc/content";
import {
  activeEncounterDeck,
  characterProfile,
  createGame,
  legalActions,
  type Command,
  type GameState,
  type InstanceId,
  type PlayerId,
  type PlayerSetup,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { coreScenario } from "../../../core/setup.js";
import { validateDefinition } from "../../../dsl/validate.js";
import { buildCrossHeroDeck } from "../../../testing/cross-hero.js";
import { DRAX_PACK_CARDS } from "../../../wave3/drax/drax-pack-cards.js";
import { SPIDER_WOMAN_KIT } from "../../../wave2/trors/spider-woman-kit.js";
import { ADAM_WARLOCK_PACK_CARDS } from "../../../wave4/mts/adam-warlock-pack-cards.js";
import { ICEMAN_ASPECT_BASIC } from "../../../wave8/iceman/aspect-basic.js";
import {
  P1,
  P2,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  moveToHand,
  patchInstance,
  playerOf,
  runWith,
  settle,
  stackEncounterDeck,
  play,
  type Picker,
} from "../../../testing/harness.js";
import { withDamage, withForm } from "../../../testing/staging.js";
import { WAVE10_DEPS as DEPS } from "../../index.js";
import { engageMinion, stagedInPlay } from "../../testing.js";
import { ASPECT_BASIC_AGGRESSION as REGISTRY, ASPECT_BASIC_AGGRESSION_SKIPPED as SKIPPED } from "./aggression.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Wave 10 `cw/aspect-basic/aggression` (56010 to 56018), docs/phase7-wave10-box-heroes.md B3 and B7. Every new card is
 * played from the deck of a Core hero (She-Hulk, the Aggression precon, with the card added to her deck; definition of
 * done 4b), so a script that assumes Tigra fails. The villain is Core's Rhino with two Advance cards stacked (boost 0).
 */
const TWO_GUN = "56010";
const SPIDER_GIRL = "56011";
const AIR_COVER = "56012";
const CONDITIONING = "56013";
const SUPPRESSING = "56014";
const BRING_IT = "56015";
const COUP = "56016";
const SAVAGE = "56017";
const AUDACITY = "56018";

const REF = {
  [TWO_GUN]: "56010.two-gun-kid-interrupt",
  [SPIDER_GIRL]: "56011.spider-girl-response",
  [AIR_COVER]: "56012.air-cover-response",
  [CONDITIONING]: "56013.aggressive-conditioning-constant",
  [SUPPRESSING]: "56014.suppressing-fire-interrupt",
  [BRING_IT]: "56015.bring-it-action",
  [COUP]: "56016.coup-de-grace-action",
  [SAVAGE]: "56017.savage-strike-interrupt",
  [AUDACITY]: "56018.audacity-response",
} as const;

const SHOCKER = "01103"; // Core minion: ATK 2, 3 hit points
const MERCENARY = "01101"; // Core minion: guard, 3 hit points
const WHIPLASH = "01172"; // Core minion: retaliate 1, 4 hit points
const ADVANCE = "01186"; // Core treachery, boost 0
const VEST = "01081"; // Core protection upgrade, cost 1
const HYDRA_SOLDIER = "01182"; // Core minion: 4 hit points, "When Defeated: Deal the engaged player an encounter card."
const MADAME_HYDRA = "01181"; // Core minion: Elite
const HORN = "01100"; // Core encounter attachment (Enhanced Ivory Horn)

const SHE_HULK = "core-she-hulk-aggression";
const SPIDER_MAN = "core-spider-man-justice";

const card = (code: string): AnyCard => PLAYABLE_CARDS.find((c) => c.id === cardId(code))!;
const textOf = (code: string): string => (card(code) as { text: { current: string } }).text.current;
const codeOf = (s: GameState, id: InstanceId): string => inst(s, id).cardId as string;
const villainOf = (s: GameState): InstanceId => s.activeVillainId!;

const seatWith = (code: string): PlayerSetup => buildCrossHeroDeck(PLAYABLE_CARDS, SHE_HULK, code);

interface Opts {
  readonly alterEgo?: boolean;
  readonly twoPlayers?: boolean;
}
/** A Core hero (hero form unless `alterEgo`) with a copy of `code` in hand, against Rhino with Advance stacked. */
function coreGame(code: string, opts: Opts = {}): { readonly state: GameState; readonly id: InstanceId } {
  const players = opts.twoPlayers
    ? [seatWith(code), coreScenario("rhino", { players: [{ starterDeckId: SPIDER_MAN }], seed: 1 }).players[0]!]
    : [seatWith(code)];
  const config = coreScenario("rhino", {
    players,
    seed: 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: PLAYABLE_CARDS,
  } as never);
  const created = createGame(config, DEPS);
  if (!created.ok) throw new Error(`${code}: ${created.error.code}: ${created.error.message}`);
  const opened = settle(created.state, firstLegal, (s) => s.step.phase === "player", DEPS);
  const form = opts.alterEgo ? opened : withForm(opened, { heroForm: 0 });
  const given = moveToHand(form, P1, code);
  return { state: stackEncounterDeck(given.state, ADVANCE, ADVANCE), id: given.ids[0]! };
}

/** Surgery: turns a deck card of P1's (not one of `keep`) into a copy of `code`; returns its instance id. */
function convertDeckCard(
  s: GameState,
  code: string,
  keep: readonly InstanceId[] = [],
): { readonly state: GameState; readonly id: InstanceId } {
  const id = playerOf(s, P1).deck.find((i) => !keep.includes(i) && codeOf(s, i) !== code)!;
  return { state: patchInstance(s, id, { cardId: cardId(code) as never }), id };
}

function playCommand(state: GameState, id: InstanceId, player: PlayerId = P1): Command | null {
  const actions = legalActions(state, player, DEPS);
  if (actions.kind !== "turn") return null;
  return actions.legal.find((a) => a.action.kind === "playCard" && a.action.instanceId === id)?.example ?? null;
}

interface Plan {
  readonly take?: readonly string[];
  readonly keep?: readonly InstanceId[];
  readonly pay?: readonly InstanceId[];
  /** Filled with every trigger window's offered option ids. */
  readonly windows?: string[][];
  /** Filled with the option ids of every target prompt (not a trigger window, not a payment). */
  readonly targets?: string[][];
}
const planned =
  (plan: Plan = {}): Picker =>
  (s) => {
    const choice = s.pendingChoice!;
    const ids = choice.options.map((o) => o.optionId as string);
    if (choice.prompt.kind === "chooseTriggers") plan.windows?.push(ids);
    else if (choice.prompt.kind !== "discardDownToHandSize" && choice.prompt.kind !== "payForCard")
      plan.targets?.push(ids);
    if (choice.prompt.kind === "discardDownToHandSize") {
      const spare = ids.filter((i) => !(plan.keep ?? []).includes(i as InstanceId));
      return spare.slice(0, choice.minSelections);
    }
    if (choice.prompt.kind === "payForCard") {
      const named = ids.filter((i) => (plan.pay ?? []).includes(i.replace("hand:", "") as InstanceId));
      return (named.length > 0 ? named : ids.slice(0, 1)).slice(0, choice.maxSelections);
    }
    const hit = (plan.take ?? []).find((t) => ids.some((i) => i === t || i.endsWith(t)));
    if (hit !== undefined) return [ids.find((i) => i === hit || i.endsWith(hit))!];
    return firstLegal(s);
  };
const drive = (s: GameState, plan?: Plan, ...commands: Command[]): GameState =>
  settle(runWith(DEPS, s, ...commands), planned(plan), undefined, DEPS);
const villainPhase = (s: GameState, plan?: Plan): GameState =>
  s.players.reduce((state, p) => drive(state, plan, endTurn(p.playerId)), s);

const inPlay = (s: GameState, code: string, counters: Readonly<Record<string, number>> = {}) =>
  stagedInPlay(s, code, { counters });
const attached = (s: GameState, code: string) => stagedInPlay(s, code, { attach: true });
const offeredIn = (windows: string[][], ref: string): boolean => windows.flat().some((o) => o.endsWith(ref));
const basicAttack = (attacker: InstanceId, target: InstanceId): Command => ({
  type: "basicAttack",
  playerId: P1,
  attackerInstanceId: attacker,
  targetInstanceId: target,
});
const stunned = (s: GameState, id: InstanceId): GameState =>
  patchInstance(s, id, { statuses: { ...inst(s, id).statuses, stunned: 1 } });
const profile = (s: GameState, player: PlayerId = P1) => characterProfile(s, identityOf(s, player), DEPS)!;
const handCards = (s: GameState, except: InstanceId): InstanceId[] => playerOf(s, P1).hand.filter((i) => i !== except);

describe("registry", () => {
  const MINE = Object.values(REF);
  const cwData = (code: string) =>
    CW_CARDS.find((c) => c.id === cardId(code)) as AnyCard & { abilities: { id: string }[] };

  it("registers every printed ref of 56010 to 56018, and none is skipped", () => {
    expect(SKIPPED).toEqual({});
    const printed = Object.keys(REF).flatMap((code) => cwData(code).abilities.map((a) => a.id as string));
    expect(printed.sort()).toEqual([...MINE].sort());
    expect(Object.keys(REGISTRY).sort()).toEqual([...MINE].sort());
  });

  it("every script validates", () => {
    for (const [id, def] of Object.entries(REGISTRY)) expect(validateDefinition(def), id).toEqual([]);
  });

  it("names every ref with its printed timing", () => {
    const kind = (ref: string) => REGISTRY[ref]!.trigger;
    expect(kind(REF[TWO_GUN])).toMatchObject({ kind: "interrupt", forced: false });
    expect(kind(REF[AIR_COVER])).toMatchObject({ kind: "response", forced: false });
    expect(REGISTRY[REF[AIR_COVER]]!.cost).toMatchObject({
      exhaustSelf: true,
      spendCounters: { counterType: "fuel", amount: 1 },
    });
    expect(kind(REF[CONDITIONING])).toMatchObject({ kind: "constant" });
    expect(kind(REF[COUP])).toMatchObject({ kind: "action", form: "hero" });
    expect(REGISTRY[REF[COUP]]!.label).toEqual(["attack"]);
    expect(kind(REF[SAVAGE])).toMatchObject({ kind: "interrupt", forced: false, form: "hero" });
  });

  it("the reprints alias the source card's script, and their printed text is the source's", () => {
    expect(REGISTRY[REF[SPIDER_GIRL]]).toBe(SPIDER_WOMAN_KIT["04040.spider-girl-response"]);
    expect(REGISTRY[REF[SUPPRESSING]]).toBe(ICEMAN_ASPECT_BASIC["46014.suppressing-fire-interrupt"]);
    expect(REGISTRY[REF[BRING_IT]]).toBe(DRAX_PACK_CARDS["19030.bring-it-action"]);
    expect(REGISTRY[REF[AUDACITY]]).toBe(ADAM_WARLOCK_PACK_CARDS["21046.audacity-response"]);
    for (const [copy, source] of [
      [SPIDER_GIRL, "04040"],
      [SUPPRESSING, "46014"],
      [BRING_IT, "19030"],
      [AUDACITY, "21046"],
    ] as const) {
      expect(textOf(copy), copy).toBe(textOf(source));
      expect((card(copy) as { cost?: number }).cost, copy).toBe((card(source) as { cost?: number }).cost);
    }
  });
});

describe(`${REF[TWO_GUN]}: Interrupt: when Two-Gun Kid makes a basic attack, resolve it against a second enemy too`, () => {
  /** Two-Gun Kid in play, ready, with the villain stunned out of the way of nothing: P1 attacks as the kid. */
  const kid = () => {
    const { state } = coreGame(TWO_GUN);
    return inPlay(state, TWO_GUN);
  };
  const dmg = (s: GameState, id: InstanceId) => inst(s, id).damage;

  it("plays from a Core hero's deck as an ally for 3", () => {
    const { state, id } = coreGame(TWO_GUN);
    const cmd = playCommand(state, id)!;
    expect(cmd).not.toBeNull();
    const after = drive(state, undefined, cmd);
    expect(playerOf(after, P1).playArea).toContain(id);
    expect(characterProfile(after, id, DEPS)).toMatchObject({ atk: 2, thw: 1, maxHp: 3 });
  });

  it("the villain and a minion without guard each take 2; the kid takes 1 consequential damage", () => {
    const k = kid();
    const staged = engageMinion(k.state, SHOCKER, "shocker-1");
    const windows: string[][] = [];
    const after = drive(staged, { take: [REF[TWO_GUN], "shocker-1"], windows }, basicAttack(k.id, villainOf(staged)));
    expect(offeredIn(windows, REF[TWO_GUN])).toBe(true);
    expect(dmg(after, villainOf(after))).toBe(2);
    expect(dmg(after, "shocker-1" as InstanceId)).toBe(2);
    expect(dmg(after, k.id)).toBe(1);
  });

  it("declined, only the one enemy is attacked", () => {
    const k = kid();
    const staged = engageMinion(k.state, SHOCKER, "shocker-1");
    const declined = drive(staged, { take: ["decline"] }, basicAttack(k.id, villainOf(staged)));
    expect(dmg(declined, villainOf(declined))).toBe(2);
    expect(dmg(declined, "shocker-1" as InstanceId)).toBe(0);
    expect(dmg(declined, k.id)).toBe(1);
  });

  it("a guard minion bars the villain as the second target: only the other minion is offered", () => {
    const k = kid();
    const staged = engageMinion(engageMinion(k.state, MERCENARY, "guard-1"), SHOCKER, "shocker-1");
    const targets: string[][] = [];
    const after = drive(
      staged,
      { take: [REF[TWO_GUN], "shocker-1"], targets },
      basicAttack(k.id, "guard-1" as InstanceId),
    );
    expect(targets).toEqual([["shocker-1"]]);
    expect(dmg(after, "guard-1" as InstanceId)).toBe(2);
    expect(dmg(after, "shocker-1" as InstanceId)).toBe(2);
    expect(dmg(after, villainOf(after))).toBe(0);
    expect(dmg(after, k.id)).toBe(1);
  });

  it("two minions with 4 hit points and retaliate 1: each takes 2, the kid takes 1 + 1 + 1 and is defeated", () => {
    const k = kid();
    const staged = engageMinion(engageMinion(k.state, WHIPLASH, "whip-1"), WHIPLASH, "whip-2");
    const after = drive(staged, { take: [REF[TWO_GUN], "whip-2"] }, basicAttack(k.id, "whip-1" as InstanceId));
    expect(dmg(after, "whip-1" as InstanceId)).toBe(2);
    expect(dmg(after, "whip-2" as InstanceId)).toBe(2);
    expect(playerOf(after, P1).playArea).not.toContain(k.id);
    expect(playerOf(after, P1).discard).toContain(k.id);
  });

  it("with one enemy in play the interrupt is not offered and the attack is a plain one", () => {
    const k = kid();
    const windows: string[][] = [];
    const after = drive(k.state, { take: [REF[TWO_GUN]], windows }, basicAttack(k.id, villainOf(k.state)));
    expect(offeredIn(windows, REF[TWO_GUN])).toBe(false);
    expect(dmg(after, villainOf(after))).toBe(2);
    expect(dmg(after, k.id)).toBe(1);
  });

  it("a stunned Two-Gun Kid makes no basic attack: nothing is dealt and the interrupt is not offered", () => {
    const k = kid();
    const staged = stunned(engageMinion(k.state, SHOCKER, "shocker-1"), k.id);
    const windows: string[][] = [];
    const after = drive(staged, { take: [REF[TWO_GUN], "shocker-1"], windows }, basicAttack(k.id, villainOf(staged)));
    expect(offeredIn(windows, REF[TWO_GUN])).toBe(false);
    expect(dmg(after, villainOf(after))).toBe(0);
    expect(dmg(after, "shocker-1" as InstanceId)).toBe(0);
    expect(inst(after, k.id).statuses.stunned).toBe(0);
  });

  it("is not offered when the hero attacks (it answers Two-Gun Kid's own attack only)", () => {
    const k = kid();
    const staged = engageMinion(k.state, SHOCKER, "shocker-1");
    const windows: string[][] = [];
    const after = drive(
      staged,
      { take: [REF[TWO_GUN], "shocker-1"], windows },
      basicAttack(identityOf(staged, P1), villainOf(staged)),
    );
    expect(offeredIn(windows, REF[TWO_GUN])).toBe(false);
    expect(dmg(after, "shocker-1" as InstanceId)).toBe(0);
    expect(dmg(after, k.id)).toBe(0);
  });
});

describe(`${REF[SPIDER_GIRL]} (reprint of 04040): after you play her from your hand, stun and confuse a minion`, () => {
  it("plays the 56011 copy from a Core hero's deck: the chosen minion is stunned and confused, others are not", () => {
    const { state, id } = coreGame(SPIDER_GIRL);
    const staged = engageMinion(engageMinion(state, SHOCKER, "shocker-1"), SHOCKER, "shocker-2");
    const windows: string[][] = [];
    const after = drive(staged, { take: [REF[SPIDER_GIRL], "shocker-2"], windows }, playCommand(staged, id)!);
    expect(offeredIn(windows, REF[SPIDER_GIRL])).toBe(true);
    expect(playerOf(after, P1).playArea).toContain(id);
    expect(inst(after, "shocker-2" as InstanceId).statuses).toEqual({ stunned: 1, confused: 1, tough: 0 });
    expect(inst(after, "shocker-1" as InstanceId).statuses).toEqual({ stunned: 0, confused: 0, tough: 0 });
  });

  it("with no minion in play the response is not offered", () => {
    const { state, id } = coreGame(SPIDER_GIRL);
    const windows: string[][] = [];
    const after = drive(state, { take: [REF[SPIDER_GIRL]], windows }, playCommand(state, id)!);
    expect(offeredIn(windows, REF[SPIDER_GIRL])).toBe(false);
    expect(playerOf(after, P1).playArea).toContain(id);
  });
});

describe(`${REF[AIR_COVER]}: Response: after a minion enters play, exhaust and remove a fuel counter: find a Tactic upgrade for it`, () => {
  /** The villain is stunned so the villain phase only deals the stacked encounter cards. */
  const dealt = (s: GameState, ...codes: string[]): GameState => stackEncounterDeck(stunned(s, villainOf(s)), ...codes);
  /** Air Cover in play (2 fuel), with Suppressing Fire converted from a deck card. */
  const cover = () => {
    const { state } = coreGame(AIR_COVER);
    const support = inPlay(state, AIR_COVER, { fuel: 2 });
    const fire = convertDeckCard(support.state, SUPPRESSING, [support.id]);
    return { state: fire.state, support: support.id, fire: fire.id };
  };

  it("plays from a Core hero's deck for 1 with 2 fuel counters", () => {
    const { state, id } = coreGame(AIR_COVER);
    const after = drive(state, undefined, playCommand(state, id)!);
    expect(playerOf(after, P1).playArea).toContain(id);
    expect(inst(after, id).counters.fuel).toBe(2);
  });

  it("after a minion enters play it finds Suppressing Fire, exhausts and spends a counter", () => {
    const c = cover();
    const windows: string[][] = [];
    const after = villainPhase(dealt(c.state, SHOCKER), { take: [REF[AIR_COVER], c.fire], windows });
    expect(offeredIn(windows, REF[AIR_COVER])).toBe(true);
    expect(playerOf(after, P1).hand).toContain(c.fire);
    expect(playerOf(after, P1).deck).not.toContain(c.fire);
    expect(inst(after, c.support).exhausted).toBe(true);
    expect(inst(after, c.support).counters.fuel).toBe(1);
  });

  it("only a Tactic upgrade that can be attached to that minion is offered", () => {
    const c = cover();
    // A non-Tactic upgrade in the deck, and a second Suppressing Fire already attached to the arriving minion's kind:
    // the minion is new, so only the Tactic is a candidate.
    const other = convertDeckCard(c.state, CONDITIONING, [c.support, c.fire]);
    const targets: string[][] = [];
    const after = villainPhase(dealt(other.state, SHOCKER), { take: [REF[AIR_COVER], c.fire], targets });
    expect(targets.flat()).toContain(c.fire as string);
    expect(targets.flat()).not.toContain(other.id as string);
    expect(playerOf(after, P1).hand).toContain(c.fire);
    expect(playerOf(after, P1).hand).not.toContain(other.id);
  });

  it("a Suppressing Fire that is in the discard pile is found there too", () => {
    const c = cover();
    const moved = {
      ...c.state,
      players: c.state.players.map((p) =>
        p.playerId === P1 ? { ...p, deck: p.deck.filter((i) => i !== c.fire), discard: [...p.discard, c.fire] } : p,
      ),
    };
    const after = villainPhase(dealt(moved, SHOCKER), { take: [REF[AIR_COVER], c.fire] });
    expect(playerOf(after, P1).hand).toContain(c.fire);
    expect(playerOf(after, P1).discard).not.toContain(c.fire);
  });

  it("is not offered when no minion enters play or with no fuel left", () => {
    const c = cover();
    const none = [
      dealt(c.state, ADVANCE),
      patchInstance(dealt(c.state, SHOCKER), c.support, { counters: { fuel: 0 } }),
    ];
    for (const s of none) {
      const windows: string[][] = [];
      const after = villainPhase(s, { take: [REF[AIR_COVER]], windows });
      expect(offeredIn(windows, REF[AIR_COVER]), "no minion, or no fuel counter left").toBe(false);
      expect(playerOf(after, P1).hand).not.toContain(c.fire);
    }
  });
});

describe(`${REF[CONDITIONING]}: you get +3 hit points and your hero gets +1 ATK`, () => {
  it("played from a Core hero's deck: the identity has 3 more hit points and the hero 1 more ATK", () => {
    const { state, id } = coreGame(CONDITIONING);
    const before = profile(state);
    const cmd = playCommand(state, id)!;
    expect(cmd).not.toBeNull();
    const after = drive(state, undefined, cmd);
    expect(inst(after, id).attachedTo).toBe(identityOf(after, P1));
    expect(profile(after).maxHp).toBe(before.maxHp + 3);
    expect(profile(after).atk).toBe(before.atk + 1);
    expect(profile(after).def).toBe(before.def);
  });

  it("in alter-ego form the identity still has +3 hit points, and the alter ego's stats are unchanged", () => {
    const { state } = coreGame(CONDITIONING, { alterEgo: true });
    const before = profile(state);
    const upgrade = attached(state, CONDITIONING);
    expect(profile(upgrade.state).maxHp).toBe(before.maxHp + 3);
    expect(profile(upgrade.state).atk).toBe(before.atk);
  });

  it("goes away with the upgrade: the bonus is gone once it is discarded", () => {
    const { state } = coreGame(CONDITIONING);
    const before = profile(state);
    const upgrade = attached(state, CONDITIONING);
    const detached = patchInstance(
      patchInstance(upgrade.state, identityOf(upgrade.state, P1), { attachments: [] }),
      upgrade.id,
      { attachedTo: null, home: { kind: "discard", playerId: P1 } as never },
    );
    expect(profile(detached).maxHp).toBe(before.maxHp);
    expect(profile(detached).atk).toBe(before.atk);
  });

  it("under another player's control: only that player's identity gets the bonus", () => {
    const { state, id } = coreGame(CONDITIONING, { twoPlayers: true });
    const before = [profile(state, P1), profile(state, P2)];
    const onP2 = { ...(playCommand(state, id)! as Extract<Command, { type: "playCard" }>), controllerId: P2 };
    const after = drive(state, undefined, onP2);
    expect(inst(after, id).attachedTo).toBe(identityOf(after, P2));
    expect(profile(after, P2).maxHp).toBe(before[1]!.maxHp + 3);
    expect(profile(after, P1).maxHp).toBe(before[0]!.maxHp);
    expect(profile(after, P1).atk).toBe(before[0]!.atk);
  });
});

describe(`${REF[SUPPRESSING]} (reprint of 46014): when you attack and defeat the attached minion, heal 2 from your hero`, () => {
  it("plays the 56014 copy onto a minion, and defeating that minion heals the hero by 2", () => {
    const { state, id } = coreGame(SUPPRESSING);
    const staged = engageMinion(state, SHOCKER, "shocker-1");
    const attachedTo = drive(
      staged,
      { take: ["shocker-1"] },
      {
        ...(playCommand(staged, id)! as Extract<Command, { type: "playCard" }>),
        attachToInstanceId: "shocker-1" as never,
      },
    );
    expect(inst(attachedTo, id).attachedTo).toBe("shocker-1");
    const hurt = withDamage(attachedTo, identityOf(attachedTo, P1), 3);
    const hero = identityOf(hurt, P1);
    const after = drive(
      patchInstance(hurt, "shocker-1" as InstanceId, { damage: 2 }),
      { take: [REF[SUPPRESSING]] },
      basicAttack(hero, "shocker-1" as InstanceId),
    );
    expect(playerOf(after, P1).playArea).not.toContain("shocker-1" as InstanceId);
    expect(inst(after, hero).damage).toBe(1);
  });
});

describe(`${REF[BRING_IT]} (reprint of 19030): draw 1 card for each minion engaged with you`, () => {
  it("draws one card per engaged minion; none with no minion", () => {
    const { state, id } = coreGame(BRING_IT);
    const two = engageMinion(engageMinion(state, SHOCKER, "shocker-1"), SHOCKER, "shocker-2");
    const handBefore = playerOf(two, P1).hand.length;
    const after = drive(two, undefined, playCommand(two, id)!);
    expect(playerOf(after, P1).hand).toHaveLength(handBefore - 1 + 2);
    const none = drive(state, undefined, playCommand(state, id)!);
    expect(playerOf(none, P1).hand).toHaveLength(playerOf(state, P1).hand.length - 1);
  });

  it("max 1 per phase: a second copy is not offered after the first is played", () => {
    const { state, id } = coreGame(BRING_IT);
    const second = convertDeckCard(state, BRING_IT, [id]);
    const both = moveToHand(second.state, P1, BRING_IT, BRING_IT);
    const [a, b] = both.ids as [InstanceId, InstanceId];
    const staged = engageMinion(both.state, SHOCKER, "shocker-1");
    expect(playCommand(staged, b)).not.toBeNull();
    const after = drive(staged, undefined, playCommand(staged, a)!);
    expect(playerOf(after, P1).discard).toContain(a);
    expect(playCommand(after, b)).toBeNull();
  });
});

describe(`${REF[COUP]}: Hero Action (attack): defeat a non-Elite minion with an upgrade attached, ignoring its When Defeated abilities`, () => {
  const SOLDIER = "soldier" as InstanceId;
  /** Surgery: a deck card of P1's becomes a copy of the player upgrade `code`, attached to `host` under P1's control. */
  function upgradeOn(s: GameState, code: string, host: InstanceId, keep: readonly InstanceId[]) {
    const made = convertDeckCard(s, code, keep);
    const off: GameState = {
      ...made.state,
      players: made.state.players.map((p) =>
        p.playerId === P1 ? { ...p, deck: p.deck.filter((i) => i !== made.id) } : p,
      ),
    };
    const on = patchInstance(off, made.id, { attachedTo: host, controllerId: P1, faceup: true });
    return { id: made.id, state: patchInstance(on, host, { attachments: [...inst(on, host).attachments, made.id] }) };
  }
  /** Surgery: a fresh copy of the encounter attachment `code` attached to `host`. */
  function encounterAttachmentOn(s: GameState, code: string, host: InstanceId): GameState {
    const id = "encounter-attachment" as InstanceId;
    const instance = { ...inst(s, host), instanceId: id, cardId: cardId(code), attachedTo: host, engagedWith: null };
    const placed: GameState = { ...s, instances: { ...s.instances, [id]: instance as never } };
    return patchInstance(placed, host, { attachments: [...inst(placed, host).attachments, id] });
  }
  /** Coup de Grace in hand against `minion` (engaged as `SOLDIER`) with Suppressing Fire (a player upgrade) attached. */
  function game(minion: string = HYDRA_SOLDIER) {
    const { state, id } = coreGame(COUP);
    const engaged = engageMinion(state, minion, SOLDIER);
    const upgrade = upgradeOn(engaged, SUPPRESSING, SOLDIER, [id]);
    return { state: upgrade.state, id, upgrade: upgrade.id };
  }
  const dealt = (s: GameState): number => playerOf(s, P1).dealtEncounter.length;
  const encounterDiscard = (s: GameState): readonly InstanceId[] => activeEncounterDeck(s).discard;

  it("plays for 2 from a Core hero's deck: the minion is defeated with no damage dealt, and its When Defeated does not resolve", () => {
    const { state, id, upgrade } = game();
    expect((card(COUP) as { cost?: number }).cost).toBe(2);
    expect(textOf(HYDRA_SOLDIER)).toContain("When Defeated: Deal the engaged player an encounter card.");
    const targets: string[][] = [];
    const after = drive(state, { targets, keep: [id] }, playCommand(state, id)!);
    expect(targets).toEqual([[SOLDIER]]);
    expect(playerOf(after, P1).playArea).not.toContain(SOLDIER);
    expect(encounterDiscard(after)).toContain(SOLDIER);
    // Hydra Soldier's "When Defeated: Deal the engaged player an encounter card" is ignored.
    expect(dealt(state)).toBe(0);
    expect(dealt(after)).toBe(0);
    // The rest of the defeat happens: its attached upgrade is discarded with it, and the event is discarded.
    expect(playerOf(after, P1).discard).toContain(upgrade);
    expect(playerOf(after, P1).discard).toContain(id);
    expect(inst(after, villainOf(after)).damage).toBe(0);
  });

  it("the same minion defeated by a basic attack resolves its When Defeated: the engaged player is dealt 1 encounter card", () => {
    const { state } = game();
    const hero = identityOf(state, P1);
    const worn = patchInstance(state, SOLDIER, { damage: 4 - profile(state).atk });
    const after = drive(worn, { take: ["decline"] }, basicAttack(hero, SOLDIER));
    expect(encounterDiscard(after)).toContain(SOLDIER);
    expect(dealt(after)).toBe(1);
  });

  it("Suppressing Fire on the defeated minion still answers the defeat: the hero heals 2 (box-heroes B3.2)", () => {
    const { state, id } = game();
    const hero = identityOf(state, P1);
    const hurt = withDamage(state, hero, 3);
    const windows: string[][] = [];
    const after = drive(hurt, { take: [REF[SUPPRESSING]], windows, keep: [id] }, playCommand(hurt, id)!);
    expect(offeredIn(windows, REF[SUPPRESSING])).toBe(true);
    expect(encounterDiscard(after)).toContain(SOLDIER);
    expect(inst(after, hero).damage).toBe(1);
    expect(dealt(after)).toBe(0);
  });

  it("no damage is dealt, so a tough status card does not stop the defeat", () => {
    const { state, id } = game();
    const tough = patchInstance(state, SOLDIER, { statuses: { ...inst(state, SOLDIER).statuses, tough: 1 } });
    const after = drive(tough, { keep: [id] }, playCommand(tough, id)!);
    expect(encounterDiscard(after)).toContain(SOLDIER);
    expect(dealt(after)).toBe(0);
  });

  it("retaliate deals nothing: the defeated minion is no longer in play", () => {
    const { state, id } = game(WHIPLASH);
    const hero = identityOf(state, P1);
    const after = drive(state, { keep: [id] }, playCommand(state, id)!);
    expect(encounterDiscard(after)).toContain(SOLDIER);
    expect(inst(state, hero).damage).toBe(0);
    expect(inst(after, hero).damage).toBe(0);
  });

  it("only a minion with an upgrade attached is offered: a second minion without one is left alone", () => {
    const { state, id } = game();
    const two = engageMinion(state, SHOCKER, "shocker-1");
    const targets: string[][] = [];
    const after = drive(two, { targets, keep: [id] }, playCommand(two, id)!);
    expect(targets).toEqual([[SOLDIER]]);
    expect(playerOf(after, P1).playArea).toContain("shocker-1" as InstanceId);
    expect(inst(after, "shocker-1" as InstanceId).damage).toBe(0);
  });

  it("cannot be played with no minion in play, or when the only minion has no upgrade attached", () => {
    const { state, id } = coreGame(COUP);
    expect(playCommand(state, id)).toBeNull();
    const bare = engageMinion(state, HYDRA_SOLDIER, SOLDIER);
    expect(playCommand(bare, id)).toBeNull();
  });

  it("an encounter attachment is not an upgrade: a minion with only one attached is not a legal target", () => {
    const { state, id } = coreGame(COUP);
    const engaged = engageMinion(state, HYDRA_SOLDIER, SOLDIER);
    expect(card(HORN).type).toBe("attachment");
    const horned = encounterAttachmentOn(engaged, HORN, SOLDIER);
    expect(inst(horned, SOLDIER).attachments).toHaveLength(1);
    expect(playCommand(horned, id)).toBeNull();
  });

  it("an Elite minion with an upgrade attached is not a legal target", () => {
    const { state, id } = game(MADAME_HYDRA);
    expect((card(MADAME_HYDRA) as unknown as { traits: string[] }).traits).toContain("ELITE");
    expect(inst(state, SOLDIER).attachments).toHaveLength(1);
    expect(playCommand(state, id)).toBeNull();
  });

  it("is a Hero Action: not playable in alter-ego form", () => {
    const { state, id } = coreGame(COUP, { alterEgo: true });
    const engaged = engageMinion(state, HYDRA_SOLDIER, SOLDIER);
    const staged = upgradeOn(engaged, SUPPRESSING, SOLDIER, [id]).state;
    expect(playCommand(staged, id)).toBeNull();
  });

  it("it is an attack by the hero: a stunned hero discards the stunned card and the minion is not defeated", () => {
    const { state, id, upgrade } = game();
    const hero = identityOf(state, P1);
    const dazed = stunned(state, hero);
    const after = drive(dazed, { keep: [id] }, playCommand(dazed, id)!);
    expect(inst(after, hero).statuses.stunned).toBe(0);
    expect(playerOf(after, P1).playArea).toContain(SOLDIER);
    expect(inst(after, SOLDIER).attachments).toEqual([upgrade]);
    expect(playerOf(after, P1).discard).toContain(id);
    expect(dealt(after)).toBe(0);
  });
});

describe(`${REF[SAVAGE]}: Hero Interrupt: when you make a basic attack, +6 ATK and piercing for that attack`, () => {
  /** The hand cards that pay the event's cost of 3: three one-icon cards. */
  const payers = (s: GameState, id: InstanceId): InstanceId[] =>
    handCards(s, id)
      .filter((i) => {
        const c = card(codeOf(s, i)) as {
          resourceIcons?: Record<string, number>;
          producesIcons?: Record<string, number>;
        };
        const icons = c.resourceIcons ?? c.producesIcons ?? {};
        return Object.values(icons).reduce((a, b) => a + b, 0) === 1;
      })
      .slice(0, 3);
  const attackWith = (s: GameState, id: InstanceId, target: InstanceId, respond: boolean, windows?: string[][]) =>
    drive(
      s,
      { take: respond ? [REF[SAVAGE]] : ["decline"], pay: payers(s, id), keep: [id], ...(windows ? { windows } : {}) },
      basicAttack(identityOf(s, P1), target),
    );

  it("plays for 3 from a Core hero's deck; the villain takes ATK + 6 and the event is discarded", () => {
    const { state, id } = coreGame(SAVAGE);
    expect(payers(state, id)).toHaveLength(3);
    const atk = profile(state).atk;
    const windows: string[][] = [];
    const after = attackWith(state, id, villainOf(state), true, windows);
    expect(offeredIn(windows, REF[SAVAGE])).toBe(true);
    expect(playerOf(after, P1).discard).toContain(id);
    expect(inst(after, villainOf(after)).damage).toBe(atk + 6);
    const plain = attackWith(state, id, villainOf(state), false);
    expect(inst(plain, villainOf(plain)).damage).toBe(atk);
    expect(playerOf(plain, P1).hand).toContain(id);
  });

  it("with Aggressive Conditioning the attack deals ATK + 1 + 6 (MC56 p. 18)", () => {
    const { state, id } = coreGame(SAVAGE);
    const atk = profile(state).atk;
    const withUpgrade = attached(convertDeckCard(state, CONDITIONING, [id]).state, CONDITIONING);
    const after = attackWith(withUpgrade.state, id, villainOf(state), true);
    expect(inst(after, villainOf(after)).damage).toBe(atk + 1 + 6);
  });

  it("the attack gains piercing: a tough status card neither stops the damage nor is discarded", () => {
    const { state, id } = coreGame(SAVAGE);
    const staged = patchInstance(engageMinion(state, SHOCKER, "shocker-1"), "shocker-1" as InstanceId, {
      statuses: { stunned: 0, confused: 0, tough: 1 },
    });
    const piercing = attackWith(staged, id, "shocker-1" as InstanceId, true);
    // A tough status card would have stopped all of it (the control below); piercing let it through and the minion fell.
    expect(playerOf(piercing, P1).playArea).not.toContain("shocker-1" as InstanceId);
    const plain = attackWith(staged, id, "shocker-1" as InstanceId, false);
    expect(inst(plain, "shocker-1" as InstanceId).statuses.tough).toBe(0);
    expect(inst(plain, "shocker-1" as InstanceId).damage).toBe(0);
  });

  it("is not offered when an ally makes the basic attack", () => {
    const { state, id } = coreGame(SAVAGE);
    const ally = inPlay(convertDeckCard(state, TWO_GUN, [id]).state, TWO_GUN);
    const windows: string[][] = [];
    const after = drive(
      ally.state,
      { take: [REF[SAVAGE]], keep: [id], windows },
      basicAttack(ally.id, villainOf(ally.state)),
    );
    expect(offeredIn(windows, REF[SAVAGE])).toBe(false);
    expect(inst(after, villainOf(after)).damage).toBe(2);
    expect(playerOf(after, P1).hand).toContain(id);
  });
});

describe(`${REF[AUDACITY]} (reprint of 21046): Hero Response: after you spend this card, deal 1 damage to the villain`, () => {
  it("spent to pay for a card, the 56018 copy deals 1 damage to the villain", () => {
    const { state, id } = coreGame(AUDACITY);
    const vest = moveToHand(convertDeckCard(state, VEST, [id]).state, P1, VEST);
    const target = identityOf(vest.state, P1);
    const spend = (take: string[]) =>
      drive(vest.state, { take }, play(P1, vest.ids[0]!, [id], { attachToInstanceId: target }));
    const hit = spend([REF[AUDACITY]]);
    expect(playerOf(hit, P1).discard).toContain(id);
    expect(inst(hit, villainOf(hit)).damage).toBe(1);
    expect(inst(spend(["decline"]), villainOf(hit)).damage).toBe(0);
  });
});
