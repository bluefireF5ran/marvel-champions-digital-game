import { CW_CARDS, PLAYABLE_CARDS, cardId, type AnyCard } from "@mc/content";
import {
  characterProfile,
  createGame,
  hasKeyword,
  keywordTotal,
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
import { ANGEL_EVENTS } from "../../../wave7/angel/events.js";
import { DRS_PACK_CARDS } from "../../../wave1/drs/pack-cards.js";
import { MSM_PACK_CARDS } from "../../../wave1/msm/pack-cards.js";
import { ADAM_WARLOCK_PACK_CARDS } from "../../../wave4/mts/adam-warlock-pack-cards.js";
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
  toHero,
  use,
  play,
  type Picker,
} from "../../../testing/harness.js";
import { driveEventsPicking, withDamage, withForm } from "../../../testing/staging.js";
import { WAVE10_DEPS as DEPS } from "../../index.js";
import { engageMinion, stagedInPlay } from "../../testing.js";
import { ASPECT_BASIC_PROTECTION as REGISTRY, ASPECT_BASIC_PROTECTION_SKIPPED as SKIPPED } from "./protection.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Wave 10 `cw/aspect-basic/protection` (56041 to 56051), docs/phase7-wave10-box-heroes.md B3 and B7. Every new card is
 * played from the deck of a Core hero (Black Panther, the Protection precon, with the card added to his deck; definition
 * of done 4b), so a script that assumes Hulkling fails. The villain is Core's Rhino with two Advance cards stacked
 * (boost 0), so his attack in the villain phase is the plain attack the interrupts and responses answer.
 */
const PATRIOT = "56041";
const VOODOO = "56042";
const HIDDEN_BASE = "56043";
const NIGHT_NURSE = "56044";
const EXCELSIOR = "56045";
const CONDITIONING = "56046";
const ALL_DAY = "56047";
const TAUNT = "56048";
const TACKLE = "56049";
const CUTS = "56050";
const PRESERVATION = "56051";

const REF = {
  [PATRIOT]: "56041.patriot-response",
  [VOODOO]: "56042.brother-voodoo-response",
  [HIDDEN_BASE]: "56043.hidden-base-response",
  [NIGHT_NURSE]: "56044.the-night-nurse-action",
  [EXCELSIOR]: "56045.excelsior-response",
  [CONDITIONING]: "56046.defensive-conditioning-constant",
  [ALL_DAY]: "56047.i-can-do-this-all-day-interrupt",
  [TAUNT]: "56048.taunt-action",
  [TACKLE]: "56049.tackle-action",
  [CUTS]: "56050.cuts-both-ways-interrupt",
  [PRESERVATION]: "56051.preservation-response",
} as const;
const ENERGY = "01088"; // Core resource: one energy
const SHOCKER = "01103"; // Core minion
const ADVANCE = "01186"; // Core treachery, boost 0: "The villain schemes"

const BLACK_PANTHER = "core-black-panther-protection";
const SPIDER_MAN = "core-spider-man-justice";

const card = (code: string): AnyCard => PLAYABLE_CARDS.find((c) => c.id === cardId(code))!;
const textOf = (code: string): string => (card(code) as { text: { current: string } }).text.current;
const codeOf = (s: GameState, id: InstanceId): string => inst(s, id).cardId as string;
const villainOf = (s: GameState): InstanceId => s.activeVillainId!;

/** A seat: a Core precon deck with every legal copy of `code` added (a legal deck, checked by `createGame`). */
const seatWith = (code: string, heroDeck = BLACK_PANTHER): PlayerSetup =>
  buildCrossHeroDeck(PLAYABLE_CARDS, heroDeck, code);

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

/** The play the engine offers for `id` (`legalActions`' example command), or null when it is not offered. */
function playCommand(state: GameState, id: InstanceId, player: PlayerId = P1): Command | null {
  const actions = legalActions(state, player, DEPS);
  if (actions.kind !== "turn") return null;
  return actions.legal.find((a) => a.action.kind === "playCard" && a.action.instanceId === id)?.example ?? null;
}
const offered = (state: GameState, ability: string, player: PlayerId = P1): boolean => {
  const actions = legalActions(state, player, DEPS);
  return (
    actions.kind === "turn" &&
    actions.legal.some((a) => a.action.kind === "useAbility" && (a.action.abilityId as string) === ability)
  );
};

interface Plan {
  /** A prompt option (trigger, defender, card, target) whose id ends with or equals one of these is chosen. */
  readonly take?: readonly string[];
  /** Hand cards that survive the end-of-turn discard. */
  readonly keep?: readonly InstanceId[];
  /** Cards that pay a cost, when a prompt asks for them. */
  readonly pay?: readonly InstanceId[];
  /** Filled with every trigger window's offered option ids. */
  readonly windows?: string[][];
}
/** Answers a prompt: `take` where offered, never discarding `keep`, otherwise the fewest selections allowed. */
const planned =
  (plan: Plan = {}): Picker =>
  (s) => {
    const choice = s.pendingChoice!;
    const ids = choice.options.map((o) => o.optionId as string);
    if (choice.prompt.kind === "chooseTriggers") plan.windows?.push(ids);
    if (choice.prompt.kind === "discardDownToHandSize") {
      const spare = ids.filter((i) => !(plan.keep ?? []).includes(i as InstanceId));
      return spare.slice(0, choice.minSelections);
    }
    if (choice.prompt.kind === "payForCard") {
      // Option ids read `hand:<instance>`: the named cards, else the first card offered.
      const named = ids.filter((i) => (plan.pay ?? []).includes(i.replace("hand:", "") as InstanceId));
      return (named.length > 0 ? named : ids.slice(0, 1)).slice(0, choice.maxSelections);
    }
    const hit = (plan.take ?? []).find((t) => ids.some((i) => i === t || i.endsWith(t)));
    if (hit !== undefined) return [ids.find((i) => i === hit || i.endsWith(hit))!];
    return firstLegal(s);
  };
const drive = (s: GameState, plan?: Plan, ...commands: Command[]): GameState =>
  settle(runWith(DEPS, s, ...commands), planned(plan), undefined, DEPS);

/** Ends the turn of every seat: the villain phase (Rhino attacks, the encounter cards are dealt), then the next player phase. */
const villainPhase = (s: GameState, plan?: Plan): GameState =>
  s.players.reduce((state, p) => drive(state, plan, endTurn(p.playerId)), s);

/** Surgery: a copy of `code` from the deck put into the play area (an ally, a support) without playing it. */
const inPlay = (s: GameState, code: string, counters: Readonly<Record<string, number>> = {}) =>
  stagedInPlay(s, code, { counters });
/** Surgery: a copy of `code` attached to P1's identity as an upgrade. */
const attached = (s: GameState, code: string) => stagedInPlay(s, code, { attach: true });

describe("registry", () => {
  const MINE = Object.values(REF);
  const cwData = (code: string) =>
    CW_CARDS.find((c) => c.id === cardId(code)) as AnyCard & { abilities: { id: string }[] };

  it("registers every printed ref of 56041 to 56051 and skips none", () => {
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
    expect(kind(REF[PATRIOT])).toMatchObject({ kind: "response", forced: false });
    expect(kind(REF[HIDDEN_BASE])).toMatchObject({ kind: "response", forced: false, form: "alterEgo" });
    expect(kind(REF[EXCELSIOR])).toMatchObject({ kind: "response", forced: false });
    expect(REGISTRY[REF[EXCELSIOR]]!.cost).toMatchObject({ resources: { energy: 1 } });
    expect(kind(REF[CONDITIONING])).toMatchObject({ kind: "constant" });
    expect(kind(REF[ALL_DAY])).toMatchObject({ kind: "interrupt", forced: false, form: "hero" });
    expect(kind(REF[CUTS])).toMatchObject({ kind: "interrupt", forced: false, form: "hero" });
    expect(REGISTRY[REF[HIDDEN_BASE]]!.cost).toMatchObject({
      exhaustSelf: true,
      spendCounters: { counterType: "stronghold", amount: 1 },
    });
  });

  it("the reprints alias the source card's script, and their printed text is the source's", () => {
    expect(REGISTRY[REF[VOODOO]]).toBe(DRS_PACK_CARDS["09012.brother-voodoo-response"]);
    expect(REGISTRY[REF[NIGHT_NURSE]]).toBe(DRS_PACK_CARDS["09019.the-night-nurse-action"]);
    expect(REGISTRY[REF[TAUNT]]).toBe(ANGEL_EVENTS["42016.taunt-action"]);
    expect(REGISTRY[REF[TACKLE]]).toBe(MSM_PACK_CARDS["05015.tackle-action"]);
    expect(REGISTRY[REF[PRESERVATION]]).toBe(ADAM_WARLOCK_PACK_CARDS["21064.preservation-response"]);
    for (const [copy, source] of [
      [VOODOO, "09012"],
      [NIGHT_NURSE, "09019"],
      [TAUNT, "42016"],
      [TACKLE, "05015"],
      [PRESERVATION, "21064"],
    ] as const) {
      expect(textOf(copy), copy).toBe(textOf(source));
      expect((card(copy) as { cost?: number }).cost, copy).toBe((card(source) as { cost?: number }).cost);
    }
  });
});

describe(`${REF[PATRIOT]}: Response: after you engage a minion, give Patriot a tough status card`, () => {
  /**
   * The villain is stunned: his attack on the hero form is spent on the stun (no attack, no boost card), so the villain
   * phase only deals the stacked encounter cards, one per player in turn order.
   */
  const dealt = (s: GameState, ...codes: string[]): GameState => {
    const stunned = patchInstance(s, villainOf(s), { statuses: { ...inst(s, villainOf(s)).statuses, stunned: 1 } });
    return stackEncounterDeck(stunned, ...codes);
  };

  it("plays from a Core hero's deck as an ally for 3", () => {
    const { state, id } = coreGame(PATRIOT);
    const cmd = playCommand(state, id)!;
    expect(cmd).not.toBeNull();
    const after = drive(state, undefined, cmd);
    expect(playerOf(after, P1).playArea).toContain(id);
    expect(inst(after, id).statuses.tough).toBe(0);
  });

  it("after a minion engages its controller, Patriot may take a tough status card; the hero gets none", () => {
    const { state } = coreGame(PATRIOT);
    const patriot = inPlay(state, PATRIOT);
    const windows: string[][] = [];
    const after = villainPhase(dealt(patriot.state, SHOCKER), { take: [REF[PATRIOT]], windows });
    expect(windows.some((w) => w.some((o) => o.endsWith(REF[PATRIOT])))).toBe(true);
    expect(inst(after, patriot.id).statuses.tough).toBe(1);
    expect(inst(after, identityOf(after, P1)).statuses.tough).toBe(0);
    expect(playerOf(after, P1).playArea.some((i) => codeOf(after, i) === SHOCKER)).toBe(true);
  });

  it("the response is optional: declined, Patriot stays without a tough card", () => {
    const patriot = inPlay(coreGame(PATRIOT).state, PATRIOT);
    const after = villainPhase(dealt(patriot.state, SHOCKER));
    expect(playerOf(after, P1).playArea.some((i) => codeOf(after, i) === SHOCKER)).toBe(true);
    expect(inst(after, patriot.id).statuses.tough).toBe(0);
  });

  it("is not offered when no minion engages (an Advance is dealt instead)", () => {
    const patriot = inPlay(coreGame(PATRIOT).state, PATRIOT);
    const windows: string[][] = [];
    const after = villainPhase(dealt(patriot.state, ADVANCE), { take: [REF[PATRIOT]], windows });
    expect(windows.flat().some((o) => o.endsWith(REF[PATRIOT]))).toBe(false);
    expect(inst(after, patriot.id).statuses.tough).toBe(0);
  });

  it("a minion engaging another player does not answer Patriot's controller", () => {
    const { state } = coreGame(PATRIOT, { twoPlayers: true });
    const patriot = inPlay(state, PATRIOT);
    // The second seat is in alter-ego form, so the villain schemes against it and draws a boost card (an Advance) first;
    // then the first player is dealt an Advance and the second the minion.
    const windows: string[][] = [];
    const after = villainPhase(dealt(patriot.state, ADVANCE, ADVANCE, SHOCKER), { take: [REF[PATRIOT]], windows });
    expect(playerOf(after, P2).playArea.some((i) => codeOf(after, i) === SHOCKER)).toBe(true);
    expect(windows.flat().some((o) => o.endsWith(REF[PATRIOT]))).toBe(false);
    expect(inst(after, patriot.id).statuses.tough).toBe(0);
  });
});

describe(`${REF[HIDDEN_BASE]}: Alter-Ego Response: after you change form, exhaust and remove a stronghold counter: give your identity a tough status card`, () => {
  const changeToAlterEgo = (s: GameState, take = true): GameState =>
    drive(s, take ? { take: [REF[HIDDEN_BASE]] } : undefined, toHero());

  it("plays from a Core hero's deck with 3 stronghold counters", () => {
    const { state, id } = coreGame(HIDDEN_BASE);
    const after = drive(state, undefined, playCommand(state, id)!);
    expect(playerOf(after, P1).playArea).toContain(id);
    expect(inst(after, id).counters.stronghold).toBe(3);
    expect(inst(after, id).exhausted).toBe(false);
  });

  it("changing from hero to alter-ego form: the identity gets a tough card, the base exhausts and loses a counter", () => {
    const base = inPlay(coreGame(HIDDEN_BASE).state, HIDDEN_BASE, { stronghold: 3 });
    const windows: string[][] = [];
    const after = drive(base.state, { take: [REF[HIDDEN_BASE]], windows }, toHero());
    expect(playerOf(after, P1).identity.form).toBe("alterEgo");
    expect(windows.flat().some((o) => o.endsWith(REF[HIDDEN_BASE]))).toBe(true);
    expect(inst(after, identityOf(after, P1)).statuses.tough).toBe(1);
    expect(inst(after, base.id).exhausted).toBe(true);
    expect(inst(after, base.id).counters.stronghold).toBe(2);
  });

  it("declined: no tough card, nothing exhausted, no counter spent", () => {
    const base = inPlay(coreGame(HIDDEN_BASE).state, HIDDEN_BASE, { stronghold: 3 });
    const after = changeToAlterEgo(base.state, false);
    expect(inst(after, identityOf(after, P1)).statuses.tough).toBe(0);
    expect(inst(after, base.id).exhausted).toBe(false);
    expect(inst(after, base.id).counters.stronghold).toBe(3);
  });

  it("changing from alter-ego to hero form does not offer it", () => {
    const alterEgo = coreGame(HIDDEN_BASE, { alterEgo: true });
    const base = inPlay(alterEgo.state, HIDDEN_BASE, { stronghold: 3 });
    const windows: string[][] = [];
    const after = drive(base.state, { take: [REF[HIDDEN_BASE]], windows }, toHero());
    expect(playerOf(after, P1).identity.form).toBe("hero");
    expect(windows.flat().some((o) => o.endsWith(REF[HIDDEN_BASE]))).toBe(false);
    expect(inst(after, identityOf(after, P1)).statuses.tough).toBe(0);
    expect(inst(after, base.id).counters.stronghold).toBe(3);
  });

  it("is not offered exhausted or with no stronghold counter left", () => {
    for (const change of [{ exhausted: true }, { counters: { stronghold: 0 } }] as const) {
      const base = inPlay(coreGame(HIDDEN_BASE).state, HIDDEN_BASE, { stronghold: 3 });
      const worn = patchInstance(base.state, base.id, change);
      const windows: string[][] = [];
      const after = drive(worn, { take: [REF[HIDDEN_BASE]], windows }, toHero());
      expect(windows.flat().some((o) => o.endsWith(REF[HIDDEN_BASE]))).toBe(false);
      expect(inst(after, identityOf(after, P1)).statuses.tough).toBe(0);
    }
  });
});

describe(`${REF[EXCELSIOR]}: Response: after your hero defends against an enemy attack, spend an energy resource: deal 2 damage to an enemy`, () => {
  const heroOf = (s: GameState) => identityOf(s, P1);
  /** The first hand card producing one energy and nothing else (a Core Energy resource), conjured into hand. */
  const withEnergy = (s: GameState): { state: GameState; id: InstanceId } => {
    const given = moveToHand(s, P1, ENERGY);
    return { state: given.state, id: given.ids[0]! };
  };
  /** Rhino attacks once the turn ends; the hero (or no one) defends; the response is accepted when `respond`. */
  const attackWith = (s: GameState, opts: { defend: boolean; respond: boolean; keep?: InstanceId[] }) => {
    const windows: string[][] = [];
    const take = [
      ...(opts.defend ? [heroOf(s) as string] : ["decline"]),
      ...(opts.respond ? [REF[EXCELSIOR], ...(opts.keep ?? [])] : []),
    ];
    return { windows, state: villainPhase(s, { take, keep: opts.keep ?? [], windows }) };
  };

  it("plays from a Core hero's deck, attaching to the hero for 1", () => {
    const { state, id } = coreGame(EXCELSIOR);
    const cmd = playCommand(state, id)!;
    expect(cmd).not.toBeNull();
    const after = drive(state, undefined, cmd);
    expect(inst(after, id).attachedTo).toBe(heroOf(after));
    expect(hasKeyword(after, id, "restricted", DEPS)).toBe(true);
  });

  it("after the hero defends, the 2 damage lands on the enemy chosen and an energy resource is spent", () => {
    const upgrade = attached(coreGame(EXCELSIOR).state, EXCELSIOR);
    const energy = withEnergy(upgrade.state);
    const control = attackWith(energy.state, { defend: true, respond: false, keep: [energy.id] });
    const taken = attackWith(energy.state, { defend: true, respond: true, keep: [energy.id] });
    expect(taken.windows.flat().some((o) => o.endsWith(REF[EXCELSIOR]))).toBe(true);
    // The villain is the only enemy: the response puts 2 damage on it, on top of whatever the defense itself did.
    const villainDamage = (r: { state: GameState }) => inst(r.state, villainOf(r.state)).damage;
    expect(villainDamage(taken)).toBe(villainDamage(control) + 2);
    expect(playerOf(taken.state, P1).discard).toContain(energy.id);
    expect(playerOf(control.state, P1).discard).not.toContain(energy.id);
    expect(inst(taken.state, heroOf(taken.state)).damage).toBe(inst(control.state, heroOf(control.state)).damage);
  });

  it("is not offered when nobody defends (an undefended attack)", () => {
    const upgrade = attached(coreGame(EXCELSIOR).state, EXCELSIOR);
    const energy = withEnergy(upgrade.state);
    const { windows, state: after } = attackWith(energy.state, { defend: false, respond: true, keep: [energy.id] });
    expect(windows.flat().some((o) => o.endsWith(REF[EXCELSIOR]))).toBe(false);
    const control = attackWith(energy.state, { defend: false, respond: false, keep: [energy.id] }).state;
    expect(inst(after, villainOf(after)).damage).toBe(inst(control, villainOf(control)).damage);
    expect(playerOf(after, P1).hand).toContain(energy.id);
  });
});

describe(`${REF[CONDITIONING]}: you get +3 hit points and your hero gets +1 DEF`, () => {
  const profile = (s: GameState, player: PlayerId = P1) => characterProfile(s, identityOf(s, player), DEPS)!;

  it("played from a Core hero's deck: the identity has 3 more hit points and the hero 1 more DEF", () => {
    const { state, id } = coreGame(CONDITIONING);
    const before = profile(state);
    const cmd = playCommand(state, id)!;
    expect(cmd).not.toBeNull();
    const after = drive(state, undefined, cmd);
    expect(inst(after, id).attachedTo).toBe(identityOf(after, P1));
    expect(profile(after).maxHp).toBe(before.maxHp + 3);
    expect(profile(after).def).toBe(before.def + 1);
    expect(profile(after).atk).toBe(before.atk);
  });

  it("in alter-ego form the identity still has +3 hit points, and the alter ego's stats are unchanged", () => {
    const { state } = coreGame(CONDITIONING, { alterEgo: true });
    const before = profile(state);
    const upgrade = attached(state, CONDITIONING);
    expect(profile(upgrade.state).maxHp).toBe(before.maxHp + 3);
    expect(profile(upgrade.state).def).toBe(before.def);
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
    expect(profile(detached).def).toBe(before.def);
  });

  it("under another player's control: only that player's identity gets the bonus", () => {
    const { state, id } = coreGame(CONDITIONING, { twoPlayers: true });
    const before = [profile(state, P1), profile(state, P2)];
    const onP2 = { ...(playCommand(state, id)! as Extract<Command, { type: "playCard" }>), controllerId: P2 };
    const after = drive(state, undefined, onP2);
    expect(inst(after, id).attachedTo).toBe(identityOf(after, P2));
    expect(profile(after, P2).maxHp).toBe(before[1]!.maxHp + 3);
    expect(profile(after, P1).maxHp).toBe(before[0]!.maxHp);
    expect(profile(after, P1).def).toBe(before[0]!.def);
  });
});

/** Rhino (or a minion) attacks the hero form once the turn ends; the cards are played or declined as `plan` says. */
function attackedBy(
  s: GameState,
  card: InstanceId,
  plan: { readonly respond?: string; readonly defender: "hero" | "none" },
  turnsOver: (state: GameState) => GameState = (state) => state,
) {
  const windows: string[][] = [];
  const take = [
    ...(plan.respond ? [plan.respond] : []),
    ...(plan.defender === "hero" ? [identityOf(s, P1) as string] : ["decline"]),
  ];
  const inner = planned({ take, keep: [card], windows });
  const state = s.players.reduce((st, p) => settle(runWith(DEPS, st, endTurn(p.playerId)), inner, undefined, DEPS), s);
  return { windows, state: turnsOver(state) };
}
const heroDamage = (s: GameState): number => inst(s, identityOf(s, P1)).damage;
const heroExhausted = (s: GameState): boolean => inst(s, identityOf(s, P1)).exhausted;
const villainDamage = (s: GameState): number => inst(s, villainOf(s)).damage;
const offeredIn = (windows: string[][], ref: string): boolean => windows.flat().some((o) => o.endsWith(ref));

describe(`${REF[ALL_DAY]}: Hero Interrupt (defense): when an enemy attacks, declare your hero the defender without exhausting`, () => {
  it("plays from a Core hero's deck as the villain attacks: the event is played and the hero defends", () => {
    const { state, id } = coreGame(ALL_DAY);
    const played = attackedBy(state, id, { respond: REF[ALL_DAY], defender: "none" });
    expect(offeredIn(played.windows, REF[ALL_DAY])).toBe(true);
    expect(playerOf(played.state, P1).discard).toContain(id);
    expect(playerOf(played.state, P1).hand).not.toContain(id);
  });

  it("the hero takes only what his DEF leaves, and is not exhausted (declaring himself would exhaust him)", () => {
    const { state, id } = coreGame(ALL_DAY);
    const played = attackedBy(state, id, { respond: REF[ALL_DAY], defender: "none" });
    const declared = attackedBy(state, id, { defender: "hero" });
    const undefended = attackedBy(state, id, { defender: "none" });
    expect(heroExhausted(declared.state)).toBe(true);
    expect(heroExhausted(played.state)).toBe(false);
    expect(heroDamage(played.state)).toBe(heroDamage(declared.state));
    expect(heroDamage(undefended.state)).toBeGreaterThan(heroDamage(played.state));
    expect(heroExhausted(undefended.state)).toBe(false);
  });

  it("answers any enemy's attack, a minion's included", () => {
    const { state, id } = coreGame(ALL_DAY);
    const minion = "shocker-1" as InstanceId;
    const stunnedVillain = patchInstance(engageMinion(state, SHOCKER, minion), villainOf(state), {
      statuses: { stunned: 1, confused: 0, tough: 0 },
    });
    const played = attackedBy(stunnedVillain, id, { respond: REF[ALL_DAY], defender: "none" });
    expect(offeredIn(played.windows, REF[ALL_DAY])).toBe(true);
    expect(playerOf(played.state, P1).discard).toContain(id);
    expect(heroExhausted(played.state)).toBe(false);
  });

  it("is a hero card: not offered in alter-ego form", () => {
    const { state, id } = coreGame(ALL_DAY, { alterEgo: true });
    const minion = "shocker-1" as InstanceId;
    const attacked = attackedBy(engageMinion(state, SHOCKER, minion), id, { respond: REF[ALL_DAY], defender: "none" });
    expect(offeredIn(attacked.windows, REF[ALL_DAY])).toBe(false);
    expect(playerOf(attacked.state, P1).hand).toContain(id);
  });
});

describe(`${REF[CUTS]}: Hero Interrupt (defense): when an enemy attacks, you gain retaliate 1 until the end of the phase`, () => {
  const retaliate = (s: GameState) => keywordTotal(s, identityOf(s, P1), "retaliate", DEPS);

  it("plays for free from a Core hero's deck; the defending hero then deals 1 more damage back to the attacker", () => {
    const { state, id } = coreGame(CUTS);
    const control = attackedBy(state, id, { defender: "hero" });
    const played = attackedBy(state, id, { respond: REF[CUTS], defender: "hero" });
    expect(offeredIn(played.windows, REF[CUTS])).toBe(true);
    expect(playerOf(played.state, P1).discard).toContain(id);
    expect(villainDamage(played.state)).toBe(villainDamage(control.state) + 1);
    // The attack is defended either way, so the hero takes the same damage.
    expect(heroDamage(played.state)).toBe(heroDamage(control.state));
  });

  it("the keyword ends with the phase", () => {
    const { state, id } = coreGame(CUTS);
    const control = attackedBy(state, id, { defender: "hero" });
    const played = attackedBy(state, id, { respond: REF[CUTS], defender: "hero" });
    expect(played.state.step.phase).toBe("player");
    expect(retaliate(played.state)).toBe(retaliate(control.state));
  });

  it("answers a minion's attack too, and is a hero card: not offered in alter-ego form", () => {
    const { state, id } = coreGame(CUTS);
    const minion = "shocker-1" as InstanceId;
    const stunned = (s: GameState) =>
      patchInstance(engageMinion(s, SHOCKER, minion), villainOf(s), {
        statuses: { stunned: 1, confused: 0, tough: 0 },
      });
    const hero = attackedBy(stunned(state), id, { respond: REF[CUTS], defender: "hero" });
    expect(offeredIn(hero.windows, REF[CUTS])).toBe(true);
    expect(inst(hero.state, minion).damage).toBe(
      inst(attackedBy(stunned(state), id, { defender: "hero" }).state, minion).damage + 1,
    );
    const alter = coreGame(CUTS, { alterEgo: true });
    const attacked = attackedBy(stunned(alter.state), alter.id, { respond: REF[CUTS], defender: "none" });
    expect(offeredIn(attacked.windows, REF[CUTS])).toBe(false);
    expect(playerOf(attacked.state, P1).hand).toContain(alter.id);
  });
});

describe("reprints: the 56xxx copies play as their source cards do", () => {
  it(`${REF[VOODOO]}: after Brother Voodoo enters play, find an event among the top 5 cards and shuffle`, () => {
    const { state, id } = coreGame(VOODOO);
    const deck = playerOf(state, P1).deck;
    const events = deck.filter((i) => card(codeOf(state, i)).type === "event");
    const others = deck.filter((i) => card(codeOf(state, i)).type !== "event");
    expect(events.length).toBeGreaterThan(0);
    const stack = (top: readonly InstanceId[]): GameState => ({
      ...state,
      players: state.players.map((p) =>
        p.playerId === P1 ? { ...p, deck: [...top, ...p.deck.filter((i) => !top.includes(i))] } : p,
      ),
    });
    const found = stack([...others.slice(0, 4), events[0]!]);
    const run = driveEventsPicking(DEPS, found, planned({ take: [REF[VOODOO]], keep: [id] }), playCommand(found, id)!);
    expect(playerOf(run.state, P1).playArea).toContain(id);
    expect(playerOf(run.state, P1).hand).toContain(events[0]);
    expect(run.events.filter((e) => e.type === "deckShuffled")).toHaveLength(1);
    // The sixth card from the top is out of reach.
    const missed = stack([...others.slice(0, 5), events[0]!]);
    const none = driveEventsPicking(
      DEPS,
      missed,
      planned({ take: [REF[VOODOO]], keep: [id] }),
      playCommand(missed, id)!,
    );
    expect(playerOf(none.state, P1).hand).not.toContain(events[0]);
  });

  it(`${REF[NIGHT_NURSE]}: exhaust and remove a medical counter: heal 1 damage from a hero and discard a status card from it`, () => {
    const { state, id } = coreGame(NIGHT_NURSE);
    const played = drive(state, undefined, playCommand(state, id)!);
    expect(playerOf(played, P1).playArea).toContain(id);
    expect(inst(played, id).counters.medical).toBe(3);
    const hero = identityOf(played, P1);
    const hurt = patchInstance(withDamage(played, hero, 3), hero, { statuses: { stunned: 1, confused: 0, tough: 0 } });
    const healed = drive(hurt, undefined, use(P1, id, REF[NIGHT_NURSE]));
    expect(inst(healed, hero).damage).toBe(2);
    expect(inst(healed, hero).statuses).toEqual({ stunned: 0, confused: 0, tough: 0 });
    expect(inst(healed, id).exhausted).toBe(true);
    expect(inst(healed, id).counters.medical).toBe(2);
    expect(offered(healed, REF[NIGHT_NURSE])).toBe(false);
  });

  it(`${REF[TAUNT]}: the villain attacks you, other characters cannot defend, draw 3 cards`, () => {
    const { state, id } = coreGame(TAUNT);
    const allyCode = codeOf(
      state,
      playerOf(state, P1).deck.find((i) => card(codeOf(state, i)).type === "ally")!,
    );
    const ally = inPlay(state, allyCode);
    const before = playerOf(ally.state, P1);
    const defenders = (start: GameState, ...commands: Command[]): { after: GameState; asked: string[][] } => {
      const asked: string[][] = [];
      const pick: Picker = (s) => {
        if (s.pendingChoice!.prompt.kind === "declareDefender")
          asked.push(s.pendingChoice!.options.map((o) => o.optionId as string));
        return planned({ take: ["decline"], keep: [id] })(s);
      };
      return { after: settle(runWith(DEPS, start, ...commands), pick, undefined, DEPS), asked };
    };
    // Control: in the villain phase the ready ally may defend beside the hero.
    const control = defenders(ally.state, endTurn(P1));
    expect(control.asked.flat()).toContain(ally.id);
    const { after, asked } = defenders(ally.state, playCommand(ally.state, id)!);
    expect(asked).toEqual([["decline", identityOf(after, P1)]]);
    expect(heroDamage(after)).toBe(characterProfile(after, villainOf(after), DEPS)!.atk);
    expect(playerOf(after, P1).deck).toHaveLength(before.deck.length - 3);
    expect(playerOf(after, P1).hand).toHaveLength(before.hand.length - 2 + 3);
  });

  describe(`${REF[TACKLE]}: stun an enemy; paid with a physical resource, deal 3 damage to it`, () => {
    const iconsOf = (s: GameState, i: InstanceId): Record<string, number> => {
      const c = card(codeOf(s, i)) as {
        resourceIcons?: Record<string, number>;
        producesIcons?: Record<string, number>;
      };
      return c.resourceIcons ?? c.producesIcons ?? {};
    };
    const isPhysical = (s: GameState, i: InstanceId): boolean => "physical" in iconsOf(s, i);
    const payOf = (s: GameState, tackle: InstanceId, physical: boolean): InstanceId[] => {
      const singles = playerOf(s, P1).hand.filter(
        (i) => i !== tackle && Object.values(iconsOf(s, i)).reduce((a, b) => a + b, 0) === 1,
      );
      const plain = singles.filter((i) => !isPhysical(s, i) && !("wild" in iconsOf(s, i)));
      const chosen = physical ? [...singles.filter((i) => isPhysical(s, i)).slice(0, 1), ...plain] : plain;
      expect(chosen.length, "single resources to pay with").toBeGreaterThanOrEqual(3);
      return chosen.slice(0, 3);
    };
    const tackle = (physical: boolean) => {
      const { state, id } = coreGame(TACKLE);
      const given = physical ? moveToHand(state, P1, "01090") : { state };
      return drive(given.state, undefined, play(P1, id, payOf(given.state, id, physical)));
    };

    it("paid with a physical resource: the villain is stunned and takes 3 damage", () => {
      const after = tackle(true);
      expect(inst(after, villainOf(after)).statuses.stunned).toBe(1);
      expect(villainDamage(after)).toBe(3);
    });
    it("paid with no physical resource: the villain is stunned and takes no damage", () => {
      const after = tackle(false);
      expect(inst(after, villainOf(after)).statuses.stunned).toBe(1);
      expect(villainDamage(after)).toBe(0);
    });
  });

  it(`${REF[PRESERVATION]}: Hero Response: after you spend this card, heal 1 damage from your hero`, () => {
    const { state, id } = coreGame(PRESERVATION);
    const vestIn = (s: GameState) => moveToHand(withDamage(s, identityOf(s, P1), 2), P1, "01081");
    const spend = (s: GameState, vest: InstanceId, take: string[], windows?: string[][]): GameState =>
      drive(
        s,
        { take, ...(windows ? { windows } : {}) },
        play(P1, vest, [id], { attachToInstanceId: identityOf(s, P1) }),
      );
    const staged = vestIn(state);
    const vest = staged.ids[0]!;
    const healed = spend(staged.state, vest, [REF[PRESERVATION]]);
    expect(heroDamage(healed)).toBe(1);
    expect(inst(healed, vest).attachedTo).toBe(identityOf(healed, P1));
    expect(playerOf(healed, P1).discard).toContain(id);
    expect(heroDamage(spend(staged.state, vest, []))).toBe(2);
    // A hero response: in alter-ego form it is not offered.
    const alter = coreGame(PRESERVATION, { alterEgo: true });
    const alterStaged = vestIn(alter.state);
    const windows: string[][] = [];
    const after = drive(
      alterStaged.state,
      { take: [REF[PRESERVATION]], windows },
      play(P1, alterStaged.ids[0]!, [alter.id], { attachToInstanceId: identityOf(alterStaged.state, P1) }),
    );
    expect(offeredIn(windows, REF[PRESERVATION])).toBe(false);
    expect(heroDamage(after)).toBe(2);
  });
});
