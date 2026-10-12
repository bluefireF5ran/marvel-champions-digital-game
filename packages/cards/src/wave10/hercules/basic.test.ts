import { HERCULES_CARDS, cardId, trait } from "@mc/content";
import {
  applyCommand,
  createGame,
  legalActions,
  playCostOf,
  traitsOf,
  type Command,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { coreScenario } from "../../core/setup.js";
import { drive } from "../../dsl/wave10-labor.testing.js";
import {
  P1,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  instancesOf,
  moveToHand,
  patchInstance,
  play,
  playerOf,
  settle,
  type Picker,
} from "../../testing/harness.js";
import { moveToDiscard, withForm } from "../../testing/staging.js";
import { codeOf } from "../../wave9/testing.js";
import {
  CORE_SPIDER_MAN,
  HERCULES_DECK,
  HERO_PACK_CARDS,
  WAVE10_DEPS,
  heroPackConfig,
  herculesHeroGame,
} from "../testing.js";
import { WAVE10_CARDS } from "../cards.js";
import { BASIC } from "../../core/aspects/basic.js";
import { BKW_PACK_CARDS } from "../../wave1/bkw/pack-cards.js";
import { SPDR_EVENTS } from "../../wave5/spdr/events.js";
import { validateDefinition } from "../../dsl/validate.js";
import { HERCULES_BASIC as REGISTRY, HERCULES_BASIC_SKIPPED as SKIPPED } from "./basic.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Wave 10 `hercules/basic` (docs/phase7-wave10-hero-packs.md H8.4, HS0 for the reprints, HS15 for the rest): the
 * reprints, 59025 Gilgamesh, 59026 Ancient Rivalry and 59028 Evaluate Threat, played from real Hercules games against
 * Core's Rhino. 59029 Energy, 59030 Genius and 59031 Strength print no ability and need nothing; 59032 Avengers
 * Compound reprints 58034 (`wonder_man/basic`, not scripted yet), so it stays skipped.
 *
 * Rulings: June 2, 2026 - Ruling 2 (4) and July 9, 2026 - Ruling 3 (3) for Evaluate Threat (a found card's reduction
 * survives a bounce but is used by its next play only).
 */
const GILGAMESH = "59025";
const RIVALRY = "59026";
const EVALUATE_THREAT = "59028";
const THOR = "59020";
const OLYMPUS = "59012"; // a support of Hercules's set
const GAUNTLETS = "59013"; // an upgrade of Hercules's set
const LIMITLESS_CONSTANT = "59027.limitless-stamina-constant";
const LIMITLESS_ACTION = "59027.limitless-stamina-action";
const HELICARRIER = "59033.helicarrier-action";
const QUINCARRIER = "59034.quincarrier-resource";
const GILGAMESH_REF = "59025.gilgamesh-constant";
const OWN = [GILGAMESH_REF, "59026.ancient-rivalry-action", "59028.evaluate-threat-constant", "59028.when-defeated"];

const dataOf = (code: string) =>
  [...WAVE10_CARDS, ...HERCULES_CARDS].find((c) => c.id === code) as unknown as {
    cost?: number;
    resourceIcons?: unknown;
    traits?: unknown;
    keywords?: unknown[];
    abilities: { id: string }[];
  };

describe("reprints", () => {
  it("scripts the four aliased refs and the three cards' own, each validating and none skipped", () => {
    expect(Object.keys(REGISTRY).sort()).toEqual(
      [LIMITLESS_ACTION, LIMITLESS_CONSTANT, HELICARRIER, QUINCARRIER, ...OWN].sort(),
    );
    for (const id of Object.keys(REGISTRY)) {
      expect(validateDefinition(REGISTRY[id]!), id).toEqual([]);
      expect(Object.keys(SKIPPED)).not.toContain(id);
    }
    expect(Object.keys(SKIPPED).sort()).toEqual(["59032.avengers-compound-action"]);
  });

  it("each copy resolves to the definition object of its original", () => {
    expect(REGISTRY[LIMITLESS_CONSTANT]).toBe(SPDR_EVENTS["31023.limitless-stamina-constant"]);
    expect(REGISTRY[LIMITLESS_ACTION]).toBe(SPDR_EVENTS["31023.limitless-stamina-action"]);
    expect(REGISTRY[HELICARRIER]).toBe(BASIC["01092.helicarrier-action"]);
    expect(REGISTRY[QUINCARRIER]).toBe(BKW_PACK_CARDS["08023.quincarrier-resource"]);
  });

  it("the copies print the originals' cost, icons and traits and name the same refs", () => {
    for (const [copy, original] of [
      ["59027", "31023"],
      ["59033", "01092"],
      ["59034", "08023"],
    ] as const) {
      const a = dataOf(copy);
      const b = dataOf(original);
      expect(a.cost, copy).toBe(b.cost);
      expect(a.resourceIcons, copy).toEqual(b.resourceIcons);
      expect(a.traits, copy).toEqual(b.traits);
      expect(
        a.abilities.map((r) => r.id.slice(5)),
        copy,
      ).toEqual(b.abilities.map((r) => r.id.slice(5)));
    }
  });

  it("59029 Energy, 59030 Genius and 59031 Strength print no ability, like 01088 to 01090", () => {
    for (const code of ["59029", "59030", "59031", "01088", "01089", "01090"])
      expect(dataOf(code).abilities, code).toEqual([]);
  });
});

const handCodes = (s: GameState, p: PlayerId = P1): string[] => playerOf(s, p).hand.map((i) => codeOf(s, i));
const run = (s: GameState, command: Command, pick: Picker = firstLegal) => drive(s, command, pick, WAVE10_DEPS);
const refused = (s: GameState, command: Command): string | null => {
  const r = applyCommand(s, command, WAVE10_DEPS);
  return r.ok ? null : r.error.code;
};

/** Exactly `code` and `payerCount` other cards in P1's hand; Hercules in hero form. */
function staged(code: string, payerCount: number) {
  const base = herculesHeroGame({ deps: WAVE10_DEPS });
  const given = moveToHand(base, P1, code);
  const id = given.ids[0]!;
  const payers = playerOf(given.state, P1)
    .hand.filter((i) => i !== id)
    .slice(0, payerCount);
  const state: GameState = {
    ...given.state,
    players: given.state.players.map((p) =>
      p.playerId === P1
        ? { ...p, hand: [id, ...payers], deck: [...p.deck, ...p.hand.filter((i) => i !== id && !payers.includes(i))] }
        : p,
    ),
  };
  return { state, id, payers };
}

/** Thor (59020) put straight into play under P1, exhausted when `exhausted`. */
function withThorInPlay(state: GameState, exhausted: boolean): { state: GameState; thor: InstanceId } {
  const given = moveToHand(state, P1, THOR);
  const thor = given.ids[0]!;
  const placed: GameState = {
    ...given.state,
    players: given.state.players.map((p) =>
      p.playerId === P1 ? { ...p, hand: p.hand.filter((i) => i !== thor), playArea: [...p.playArea, thor] } : p,
    ),
  };
  return { state: patchInstance(placed, thor, { exhausted, faceup: true }), thor };
}

/**
 * 59025 Gilgamesh, "As an additional cost to play this card, if you do not have the Eternal trait, confuse your
 * identity." RRG 1.8 "Cost" (p. 13: an additional cost is paid with the cost it is added to, or neither is paid),
 * "Confuse, Confused" (p. 12), "Status Cards" (p. 41: one status card of each type). The engine primitive is tested in
 * `packages/engine/src/conditional-additional-play-cost.test.ts`.
 */
describe("59025 Gilgamesh: confuse your identity to play him, unless you have the Eternal trait", () => {
  const ETERNAL = trait("Eternal");
  const confused = (s: GameState): number => inst(s, identityOf(s)).statuses.confused;
  const inPlay = (s: GameState, id: InstanceId): boolean => playerOf(s, P1).playArea.includes(id);
  /**
   * No identity in the pool has the Eternal trait and no card gives it, so Hercules gains it the way "gain the
   * [trait] trait until the end of the phase" records it (the engine's lasting `traitGrant`), by surgery.
   */
  function withEternal(state: GameState): GameState {
    const id = identityOf(state);
    return {
      ...state,
      lastingEffects: [
        ...state.lastingEffects,
        {
          id: "test-eternal",
          kind: "traitGrant",
          trait: ETERNAL,
          targets: [id],
          affects: null,
          scope: { selfInstanceId: id, controllerId: P1, vars: {}, bindings: {} },
          duration: { kind: "endOfPhase" },
        },
      ],
    };
  }
  function playAction(state: GameState, id: InstanceId) {
    const actions = legalActions(state, P1, WAVE10_DEPS);
    if (actions.kind !== "turn") throw new Error(`expected P1's turn, got ${actions.kind}`);
    const isPlay = (a: { action: { kind: string; instanceId?: InstanceId } }) =>
      a.action.kind === "playCard" && a.action.instanceId === id;
    return { legal: actions.legal.find(isPlay), illegal: actions.illegal.find(isPlay) };
  }

  it("is an additional cost to play on his one printed ability, and he has the Eternal trait himself", () => {
    expect(dataOf(GILGAMESH).abilities.map((r) => r.id)).toEqual([GILGAMESH_REF]);
    expect(REGISTRY[GILGAMESH_REF]!.trigger).toEqual({ kind: "constant", additionalCostToPlay: {} });
    expect(dataOf(GILGAMESH).traits).toContain(ETERNAL);
  });

  it("played by Hercules (no Eternal trait): his 3 resources are paid, the identity is confused and Gilgamesh enters play", () => {
    const { state, id, payers } = staged(GILGAMESH, 3);
    expect(traitsOf(state, identityOf(state), WAVE10_DEPS)).not.toContain(ETERNAL);
    expect(confused(state)).toBe(0);
    expect(playAction(state, id).legal).toBeDefined();
    const out = run(state, play(P1, id, payers));
    expect(confused(out.state)).toBe(1);
    expect(inPlay(out.state, id)).toBe(true);
    for (const payer of payers) expect(playerOf(out.state, P1).discard).toContain(payer);
  });

  it("in alter-ego form too: 'your identity' is whichever side is up", () => {
    const { state, id, payers } = staged(GILGAMESH, 3);
    const out = run(withForm(state, "alterEgo"), play(P1, id, payers));
    expect(confused(out.state)).toBe(1);
    expect(inPlay(out.state, id)).toBe(true);
  });

  it("with the Eternal trait: no additional cost, and the identity is not confused", () => {
    const { state: base, id, payers } = staged(GILGAMESH, 3);
    const state = withEternal(base);
    expect(traitsOf(state, identityOf(state), WAVE10_DEPS)).toContain(ETERNAL);
    const out = run(state, play(P1, id, payers));
    expect(confused(out.state)).toBe(0);
    expect(inPlay(out.state, id)).toBe(true);
  });

  it("an identity that is already confused cannot pay: not offered, refused with the cost's reason, nothing spent", () => {
    const { state: base, id, payers } = staged(GILGAMESH, 3);
    const state = patchInstance(base, identityOf(base), {
      statuses: { ...inst(base, identityOf(base)).statuses, confused: 1 },
    });
    const { legal, illegal } = playAction(state, id);
    expect(legal).toBeUndefined();
    expect(illegal?.reason).toBe("no_valid_target");
    expect(illegal?.message).toContain("cannot be given another confused status card");
    expect(refused(state, play(P1, id, payers))).toBe("no_valid_target");
    expect(playerOf(state, P1).hand).toEqual([id, ...payers]);
  });

  it("already confused with the Eternal trait: there is no cost to fail, so he is played and no status card is added", () => {
    const { state: base, id, payers } = staged(GILGAMESH, 3);
    const state = withEternal(
      patchInstance(base, identityOf(base), { statuses: { ...inst(base, identityOf(base)).statuses, confused: 1 } }),
    );
    const out = run(state, play(P1, id, payers));
    expect(confused(out.state)).toBe(1);
    expect(inPlay(out.state, id)).toBe(true);
  });

  it("without enough resources nothing is paid: the identity is not confused", () => {
    const { state, id, payers } = staged(GILGAMESH, 3);
    expect(refused(state, play(P1, id, payers.slice(0, 1)))).toBe("insufficient_resources");
    expect(confused(state)).toBe(0);
  });
});

describe("59026 Ancient Rivalry: search the discard pile for an identity-specific upgrade, ready Hercules and Thor", () => {
  it("is a Hero Action event with Team-Up (Hercules and Thor)", () => {
    expect(REGISTRY["59026.ancient-rivalry-action"]!.trigger).toMatchObject({ kind: "action" });
    expect(dataOf(RIVALRY).keywords).toContainEqual({ name: "teamUp", names: ["Hercules", "Thor"] });
  });

  it("adds an identity-specific upgrade from the discard pile to the hand and readies Hercules and Thor", () => {
    const { state, id, payers } = staged(RIVALRY, 1);
    const discarded = moveToDiscard(moveToHand(state, P1, GAUNTLETS).state, P1, GAUNTLETS);
    const { state: withThor, thor } = withThorInPlay(discarded.state, true);
    const table = patchInstance(withThor, identityOf(withThor), { exhausted: true });
    expect(playerOf(table, P1).discard).toContain(discarded.id);
    const take: Picker = (s) => {
      const choice = s.pendingChoice;
      return choice?.prompt.kind === "chooseCards" && choice.options.some((o) => o.optionId === discarded.id)
        ? [discarded.id]
        : firstLegal(s);
    };
    const out = run(table, play(P1, id, payers), take);
    expect(playerOf(out.state, P1).hand).toContain(discarded.id);
    expect(playerOf(out.state, P1).discard).not.toContain(discarded.id);
    expect(inst(out.state, identityOf(out.state)).exhausted).toBe(false);
    expect(inst(out.state, thor).exhausted).toBe(false);
  });

  it("offers only identity-specific upgrades: Hercules's support in the discard pile is not found", () => {
    const { state, id, payers } = staged(RIVALRY, 1);
    const withThor = withThorInPlay(state, true).state;
    const both = moveToDiscard(
      moveToDiscard(moveToHand(moveToHand(withThor, P1, GAUNTLETS).state, P1, OLYMPUS).state, P1, GAUNTLETS).state,
      P1,
      OLYMPUS,
    );
    const seen: string[] = [];
    const watch: Picker = (s) => {
      const choice = s.pendingChoice;
      if (choice?.prompt.kind === "chooseCards")
        seen.push(...choice.options.map((o) => codeOf(s, o.optionId as InstanceId)));
      return firstLegal(s);
    };
    run(both.state, play(P1, id, payers), watch);
    expect(seen).toContain(GAUNTLETS);
    expect(seen).not.toContain(OLYMPUS);
  });

  it("with no such upgrade in the discard pile, it still readies Hercules and Thor", () => {
    const { state, id, payers } = staged(RIVALRY, 1);
    const { state: withThor, thor } = withThorInPlay(state, true);
    const tired = patchInstance(withThor, identityOf(withThor), { exhausted: true });
    const out = run(tired, play(P1, id, payers));
    expect(inst(out.state, identityOf(out.state)).exhausted).toBe(false);
    expect(inst(out.state, thor).exhausted).toBe(false);
  });

  it("cannot be played without Thor in play (Team-Up needs both characters)", () => {
    const { state, id, payers } = staged(RIVALRY, 1);
    expect(refused(state, play(P1, id, payers))).toBe("no_valid_target");
  });
});

/** Evaluate Threat in play with 1 threat, as a player side scheme Hercules controls (surgery). */
function withEvaluateThreat(state: GameState): { state: GameState; scheme: InstanceId } {
  const scheme = instancesOf(state, EVALUATE_THREAT)[0]!;
  const out: GameState = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      hand: p.hand.filter((id) => id !== scheme),
      deck: p.deck.filter((id) => id !== scheme),
      discard: p.discard.filter((id) => id !== scheme),
    })),
    villainArea: [...state.villainArea, scheme],
  };
  return { scheme, state: patchInstance(out, scheme, { faceup: true, threat: 1, controllerId: P1 }) };
}
/** Thor goes from the hand to the top of Hercules's deck, so the search can find him. */
function thorInDeck(state: GameState): { state: GameState; thor: InstanceId } {
  const thor = instancesOf(state, THOR)[0]!;
  return {
    thor,
    state: {
      ...state,
      players: state.players.map((p) =>
        p.playerId === P1
          ? { ...p, hand: p.hand.filter((id) => id !== thor), deck: [thor, ...p.deck.filter((id) => id !== thor)] }
          : p,
      ),
    },
  };
}
/** Hercules takes `mine`; anyone else the first card offered. */
const finding =
  (mine: InstanceId): Picker =>
  (state) => {
    const choice = state.pendingChoice;
    if (choice?.prompt.kind !== "chooseCards") return firstLegal(state);
    if (choice.playerId === P1) return choice.options.some((o) => o.optionId === mine) ? [mine] : [];
    return choice.options.slice(0, 1).map((o) => o.optionId);
  };
const takingNothing: Picker = (s) => (s.pendingChoice?.prompt.kind === "chooseCards" ? [] : firstLegal(s));
const reductions = (state: GameState) => state.lastingEffects.filter((e) => e.kind === "costReduction");
const priceOf = (state: GameState, id: InstanceId, player: PlayerId = P1) => playCostOf(state, player, id, WAVE10_DEPS);
/** Hercules thwarts Evaluate Threat's last threat away, and the When Defeated search resolves. */
function defeated(base: GameState, pick: (thor: InstanceId) => Picker = finding) {
  const { state: prepared, thor } = thorInDeck(base);
  const { state, scheme } = withEvaluateThreat(prepared);
  const thwart: Command = {
    type: "basicThwart",
    playerId: P1,
    thwarterInstanceId: identityOf(state),
    schemeInstanceId: scheme,
  };
  return { ...drive(state, thwart, pick(thor), WAVE10_DEPS), thor, scheme };
}
function playPaying(state: GameState, id: InstanceId, n: number, player: PlayerId = P1) {
  const payers = playerOf(state, player)
    .hand.filter((card) => card !== id)
    .slice(0, n);
  if (payers.length < n) throw new Error(`${player} has fewer than ${n} other cards in hand`);
  const result = applyCommand(state, play(player, id, payers), WAVE10_DEPS);
  if (!result.ok) return { ok: false as const, code: result.error.code };
  return { ok: true as const, state: settle(result.state, firstLegal, undefined, WAVE10_DEPS) };
}
/** Surgery: the card goes from wherever its owner has it to that zone of theirs. */
function moveTo(state: GameState, id: InstanceId, to: "hand" | "discard"): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      const without = {
        ...p,
        hand: p.hand.filter((i) => i !== id),
        discard: p.discard.filter((i) => i !== id),
        playArea: p.playArea.filter((i) => i !== id),
      };
      return inst(state, id).ownerId === p.playerId ? { ...without, [to]: [...without[to], id] } : without;
    }),
  };
}
/** Hercules (first player) and Core's Spider-Man against Rhino, both in hero form. */
function twoPlayerGame(): GameState {
  const config = heroPackConfig(HERCULES_DECK);
  const second = coreScenario("rhino", {
    players: [{ starterDeckId: CORE_SPIDER_MAN }],
    seed: 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: HERO_PACK_CARDS,
  } as never).players[0]!;
  const created = createGame({ ...config, players: [...config.players, second] }, WAVE10_DEPS);
  if (!created.ok) throw new Error(`${created.error.code}: ${created.error.message}`);
  const opened = settle(created.state, firstLegal, (s) => s.step.phase === "player", WAVE10_DEPS);
  return withForm(withForm(opened, { heroForm: 0 }, P1), { heroForm: 0 }, cardIdOfSecond(opened));
}
const cardIdOfSecond = (s: GameState): PlayerId => s.players[1]!.playerId;

describe("59028 Evaluate Threat", () => {
  it("is a Play only if constant and a When Defeated", () => {
    expect(REGISTRY["59028.evaluate-threat-constant"]!.trigger).toMatchObject({ kind: "constant" });
    expect(REGISTRY["59028.when-defeated"]!.trigger).toMatchObject({ kind: "whenDefeated" });
  });

  it("can be played by Hercules (Avenger) and not by an identity with neither trait", () => {
    const { state, id, payers } = staged(EVALUATE_THREAT, 1);
    expect(refused(state, play(P1, id, payers))).toBeNull();
    const spider = patchInstance(state, identityOf(state), { cardId: cardId(EVALUATE_THREAT) });
    // No hero in the pool lacks both traits; the identity instance reads as Evaluate Threat's own data (no traits).
    expect(refused(spider, play(P1, id, payers))).not.toBeNull();
  });

  it("Thor is added to Hercules's hand and costs 2 less; his reduction ends when he is played", () => {
    const r = defeated(herculesHeroGame({ deps: WAVE10_DEPS }));
    expect(r.state.villainArea).not.toContain(r.scheme);
    expect(playerOf(r.state, P1).hand).toContain(r.thor);
    expect(reductions(r.state)).toMatchObject([
      { playerId: P1, amount: 2, cardInstanceId: r.thor, duration: { kind: "endOfPhase" } },
    ]);
    expect(priceOf(r.state, r.thor)).toMatchObject({ printed: 4, current: 2 });
    expect(playPaying(r.state, r.thor, 1)).toEqual({ ok: false, code: "insufficient_resources" });
    const played = playPaying(r.state, r.thor, 2);
    if (!played.ok) throw new Error(played.code);
    expect(playerOf(played.state, P1).playArea).toContain(r.thor);
    expect(reductions(played.state)).toEqual([]);
  });

  it("a found card bounced the same phase is still reduced (June 2, 2026 - Ruling 2 (4)); a second play is not (July 9, 2026 - Ruling 3 (3))", () => {
    const r = defeated(herculesHeroGame({ deps: WAVE10_DEPS }));
    const back = moveTo(moveTo(r.state, r.thor, "discard"), r.thor, "hand");
    expect(priceOf(back, r.thor)).toMatchObject({ printed: 4, current: 2 });
    const first = playPaying(r.state, r.thor, 2);
    if (!first.ok) throw new Error(first.code);
    expect(priceOf(moveTo(first.state, r.thor, "hand"), r.thor)).toMatchObject({ printed: 4, current: 4 });
  });

  it("ends with the phase: next round Thor costs 4", () => {
    const r = defeated(herculesHeroGame({ deps: WAVE10_DEPS }));
    const ending = applyCommand(r.state, endTurn(P1), WAVE10_DEPS);
    if (!ending.ok) throw new Error(ending.error.message);
    const next = settle(ending.state, firstLegal, undefined, WAVE10_DEPS);
    expect(reductions(next)).toEqual([]);
    expect(priceOf(moveTo(next, r.thor, "hand"), r.thor)).toMatchObject({ printed: 4, current: 4 });
  });

  it("a player may take no card: no reduction and nothing added to the hand", () => {
    const r = defeated(herculesHeroGame({ deps: WAVE10_DEPS }), () => takingNothing);
    expect(r.state.villainArea).not.toContain(r.scheme);
    expect(reductions(r.state)).toEqual([]);
    expect(handCodes(r.state)).not.toContain(THOR);
  });

  it("two players each search their own cards and each card taken is reduced, for whoever plays it", () => {
    const r = defeated(twoPlayerGame());
    const bound = reductions(r.state);
    expect(bound).toHaveLength(2);
    const theirs = bound.find((e) => e.cardInstanceId !== r.thor)!.cardInstanceId!;
    expect(playerOf(r.state, r.state.players[1]!.playerId).hand).toContain(theirs);
    expect(bound.find((e) => e.cardInstanceId === r.thor)).toMatchObject({ playerId: P1, amount: 2 });
    const first = playPaying(r.state, r.thor, 2);
    if (!first.ok) throw new Error(first.code);
    expect(reductions(first.state).map((e) => e.cardInstanceId)).toEqual([theirs]);
  });
});
