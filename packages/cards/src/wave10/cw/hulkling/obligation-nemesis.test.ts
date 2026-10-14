import { CW_CARDS, cardId } from "@mc/content";
import {
  activeEncounterDeck,
  activeEncounterDeckId,
  applyCommand,
  characterProfile,
  keywordsOf,
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
  moveToHand,
  patchInstance,
  playerOf,
  putOnTopOfDeck,
  type Picker,
} from "../../../testing/harness.js";
import { driveEventsPicking, driveStepwise, stageNemesisCardForReveal, withForm } from "../../../testing/staging.js";
import { WAVE10_DEPS, hulklingGame, hulklingHeroGame } from "../../testing.js";
import {
  HULKLING_OBLIGATION_NEMESIS as REGISTRY,
  HULKLING_OBLIGATION_NEMESIS_SKIPPED as SKIPPED,
} from "./obligation-nemesis.js";

vi.setConfig({ testTimeout: 180_000 });

/**
 * Hulkling's obligation and nemesis set (56054 Complicated Lineage; 56055 Super Skrull, 56056 Skrull Business, 56057
 * Fantastic Powers, 56058 You're Coming With Me!), docs/phase7-wave10-box-heroes.md B3.3, B3.12, B3.13, B3.15. The
 * printed precon `hulkling-protection` against Core's Rhino (ATK 2, SCH 1). The obligation is in the encounter deck and
 * is revealed in a real villain phase; the nemesis set is set aside, so its cards are moved by surgery or staged for a
 * real reveal. Hulkling's hand is full (5) when the turn ends, so no card is drawn before the villain phase reads the
 * deck. Owner's answers of 2026-10-11, provisional: question 14 = A (Skrull Business takes the discarded cards, yet
 * Super Skrull and You're Coming With Me! still count them), question 15 = B (Fantastic Powers moves a Super Skrull
 * already in play to engage the revealing player). The cards the deck discards are the deck's own: Shapeshifter Strike
 * 56037 (energy), Defensive Conditioning 56046 (physical), "I Can Do This All Day" 56047 (mental), Shapeshifter 56040
 * (wild), Winged Shape 56032 (energy and mental), Imitation Shape 56035 (mental, mental).
 */
const OBLIGATION = "56054";
const SKRULL = "56055";
const BUSINESS = "56056";
const POWERS = "56057";
const COMING = "56058";
const REFS = [
  "56054.obligation",
  "56055.super-skrull-forced-interrupt",
  "56056.skrull-business-forced-response",
  "56057.fantastic-powers-constant",
  "56057.when-revealed",
  "56058.when-revealed-alter-ego",
  "56058.when-revealed-hero",
];
const FORCED_INTERRUPT = "56055.super-skrull-forced-interrupt";
const BUSINESS_RESPONSE = "56056.skrull-business-forced-response";
const CHOSEN_SHAPE = "56029a.chosen-shape";
const ENERGY = "56037";
const PHYSICAL = "56046";
const MENTAL = "56047";
const WILD = "56040";
const ENERGY_MENTAL = "56032";
const MENTAL_MENTAL = "56035";
const HULK_SHAPE = "56033";
const ALIEN = "56036";
const ADVANCE = "01186";

const data = (code: string) => CW_CARDS.find((c) => (c.id as string) === code)! as any;
const codeOf = (s: GameState, id: InstanceId): string => inst(s, id).cardId as string;
const piles = (s: GameState) => activeEncounterDeck(s);
const villainOf = (s: GameState): InstanceId => s.activeVillainId!;
const damageOf = (s: GameState, id: InstanceId = identityOf(s)): number => inst(s, id).damage;
const profile = (s: GameState, id: InstanceId) => characterProfile(s, id, WAVE10_DEPS)!;
const ofType = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const damageFrom = (events: readonly GameEvent[], source: InstanceId, target?: InstanceId) =>
  ofType(events, "damageDealt")
    .filter((e) => e.sourceInstanceId === source && (target === undefined || e.targetInstanceId === target))
    .reduce((sum, e) => sum + e.amount, 0);
const threatFrom = (events: readonly GameEvent[], source: InstanceId) =>
  ofType(events, "threatPlaced")
    .filter((e) => e.sourceInstanceId === source)
    .reduce((sum, e) => sum + e.amount, 0);
const discardedFromDeckBy = (events: readonly GameEvent[], by: InstanceId, player: PlayerId) =>
  ofType(events, "cardDiscardedFromDeck").filter((e) => e.by === by && e.playerId === player);
const resolvedAbility = (events: readonly GameEvent[], ability: string) =>
  events.filter((e) => e.type === "abilityResolved" && e.abilityId === ability);
const skrullOf = (s: GameState): InstanceId =>
  (Object.keys(s.instances) as InstanceId[]).find((i) => codeOf(s, i) === SKRULL)!;
const tucked = (s: GameState, scheme: InstanceId): readonly InstanceId[] => inst(s, scheme).tucked;

/** The first set-aside copy of `code` of `player`'s, taken out of the set-aside cards. */
function fromSetAside(state: GameState, code: string, player: PlayerId = P1): { state: GameState; id: InstanceId } {
  const id = playerOf(state, player).setAside.find((i) => codeOf(state, i) === code);
  if (!id) throw new Error(`no set-aside ${code}`);
  return {
    id,
    state: {
      ...state,
      players: state.players.map((p) =>
        p.playerId === player ? { ...p, setAside: p.setAside.filter((i) => i !== id) } : p,
      ),
    },
  };
}
/** Super Skrull (the set-aside copy) in `player`'s play area, faceup, engaged with `player`, as if revealed earlier. */
function engagedSkrull(state: GameState, player: PlayerId = P1, extra: Parameters<typeof patchInstance>[2] = {}) {
  const found = fromSetAside(state, SKRULL);
  const placed: GameState = {
    ...found.state,
    players: found.state.players.map((p) =>
      p.playerId === player ? { ...p, playArea: [...p.playArea, found.id] } : p,
    ),
  };
  return {
    id: found.id,
    state: patchInstance(placed, found.id, { faceup: true, controllerId: null, engagedWith: player, ...extra }),
  };
}
/** Skrull Business in the villain area with 5 threat. */
function withBusiness(state: GameState) {
  const found = fromSetAside(state, BUSINESS);
  const placed: GameState = { ...found.state, villainArea: [...found.state.villainArea, found.id] };
  return { id: found.id, state: patchInstance(placed, found.id, { faceup: true, threat: 5 }) };
}
/** An upgrade of the deck (a copy of `code`) attached to `player`'s identity and controlled by them. */
function upgradeInPlay(state: GameState, code: string, player: PlayerId = P1) {
  const given = moveToHand(state, P1, code);
  const id = given.ids[0]!;
  const host = identityOf(given.state, player);
  const staged: GameState = {
    ...given.state,
    players: given.state.players.map((p) => (p.playerId === P1 ? { ...p, hand: p.hand.filter((i) => i !== id) } : p)),
  };
  const placed = patchInstance(staged, id, { faceup: true, controllerId: player, attachedTo: host });
  return { id, state: patchInstance(placed, host, { attachments: [...inst(placed, host).attachments, id] }) };
}
/** Hand cards back from the bottom of the deck until `size` again, so no draw reads the deck before the villain phase. */
function refilled(state: GameState, size: number): GameState {
  const seat = playerOf(state, P1);
  const missing = Math.max(0, size - seat.hand.length);
  if (missing === 0) return state;
  const moved = seat.deck.slice(-missing);
  return {
    ...state,
    players: state.players.map((p) =>
      p.playerId === P1 ? { ...p, deck: p.deck.slice(0, -missing), hand: [...p.hand, ...moved] } : p,
    ),
  };
}
/** `codes` stacked on top of P1's deck, the hand still as full as before. */
function stackedDeck(state: GameState, ...codes: readonly string[]) {
  const stacked = putOnTopOfDeck(state, P1, ...codes);
  return { ids: stacked.ids, state: refilled(stacked.state, playerOf(state, P1).hand.length) };
}
/** The top `n` encounter cards made into Advance (0 boost icons): any activation's boost card is harmless. */
const fillers = (state: GameState, n = 14): GameState =>
  piles(state)
    .deck.slice(0, n)
    .reduce((acc, id) => patchInstance(acc, id, { cardId: cardId(ADVANCE) }), state);
/** Declines to defend; otherwise the first legal answer. */
const picker =
  (choose?: (s: GameState) => readonly string[] | undefined): Picker =>
  (s) => {
    if (s.pendingChoice!.prompt.kind === "declareDefender") return ["decline"];
    const picked = choose?.(s);
    if (picked) return picked;
    if (s.pendingChoice!.prompt.kind === "orderEnemies") return s.pendingChoice!.options.map((o) => o.optionId);
    return firstLegal(s);
  };
const pickLabels = (...labels: readonly string[]) =>
  picker((s) => {
    for (const label of labels) {
      const hit = s.pendingChoice!.options.find((o) => o.label.startsWith(label));
      if (hit) return [hit.optionId];
    }
    return undefined;
  });
const endRound = (s: GameState, pick: Picker = picker(), ...players: readonly PlayerId[]) =>
  driveEventsPicking(WAVE10_DEPS, s, pick, ...(players.length ? players : [P1]).map((p) => endTurn(p)));

describe("registry", () => {
  it("registers every printed ref; nothing is skipped", () => {
    const printed = [OBLIGATION, SKRULL, BUSINESS, POWERS, COMING].flatMap((c) => abilityRefIds(data(c)));
    expect([...printed].sort()).toEqual([...REFS].sort());
    expect(Object.keys(REGISTRY).sort()).toEqual([...REFS].sort());
    expect(Object.keys(SKIPPED)).toEqual([]);
  });
  it.each([...REFS])("%s validates", (ref) => {
    expect(validateDefinition(REGISTRY[ref]!)).toEqual([]);
  });
  it("timing: When Revealed, a Forced Interrupt, a Forced Response (marked as still counted) and a constant", () => {
    expect(REGISTRY["56054.obligation"]!.trigger).toMatchObject({ kind: "whenRevealed" });
    expect(REGISTRY[FORCED_INTERRUPT]!.trigger).toMatchObject({ kind: "interrupt", forced: true });
    expect(REGISTRY[BUSINESS_RESPONSE]!.trigger).toMatchObject({ kind: "response", forced: true });
    expect(REGISTRY[BUSINESS_RESPONSE]!.discardsStayCounted).toBe(true);
    expect(REGISTRY[FORCED_INTERRUPT]!.discardsStayCounted).toBeUndefined();
    expect(REGISTRY["56057.fantastic-powers-constant"]!.trigger).toMatchObject({ kind: "constant" });
    expect(REGISTRY["56057.when-revealed"]!.trigger).toMatchObject({ kind: "whenRevealed" });
    expect(REGISTRY["56058.when-revealed-alter-ego"]!.trigger).toMatchObject({ kind: "whenRevealed" });
    expect(REGISTRY["56058.when-revealed-hero"]!.trigger).toMatchObject({ kind: "whenRevealed" });
  });
});

describe("the printed cards", () => {
  it("Complicated Lineage: an obligation in no encounter set, 2 boost icons", () => {
    expect(data(OBLIGATION)).toMatchObject({ type: "obligation", boostIcons: 2, encounterSetIds: [] });
  });
  it("Super Skrull: Elite Skrull minion, ATK 1, SCH 1, 5 hit points, 2 boost icons, the nemesis minion", () => {
    expect(data(SKRULL)).toMatchObject({ type: "minion", atk: 1, sch: 1, hp: 5, boostIcons: 2, unique: true });
    expect(data(SKRULL).traits).toEqual(["ELITE", "SKRULL"]);
  });
  it("Skrull Business: a side scheme of 5 threat flat with an acceleration icon and 3 boost icons", () => {
    expect(data(BUSINESS)).toMatchObject({
      type: "side_scheme",
      startingThreat: { base: 5, perPlayer: 0 },
      boostIcons: 3,
    });
    expect(data(BUSINESS).icons).toEqual(["acceleration"]);
  });
  it("Fantastic Powers: +1 ATK and +1 SCH as data, 2 boost icons; You're Coming With Me!: 2 copies, 1 boost icon", () => {
    expect(data(POWERS)).toMatchObject({ type: "attachment", statModifiers: { atk: 1, sch: 1 }, boostIcons: 2 });
    expect(data(COMING)).toMatchObject({ type: "treachery", quantityInSet: 2, boostIcons: 1 });
  });
});

describe("56055.super-skrull-forced-interrupt: when Super Skrull attacks you, discard the top card of your deck (question 14 = A)", () => {
  /**
   * Super Skrull engaged with P1 in hero form, the villain stunned (its stun card is its activation), the top of the
   * encounter deck all Advance, the top of P1's deck `top`. P1's turn ends: Super Skrull attacks and nothing else does.
   */
  function attack(
    top: readonly string[],
    opts: {
      readonly scheme?: boolean;
      readonly upgrades?: readonly string[];
      readonly pick?: Picker;
      readonly mutate?: (s: GameState) => GameState;
    } = {},
  ) {
    let s: GameState = hulklingHeroGame();
    for (const code of opts.upgrades ?? []) s = upgradeInPlay(s, code).state;
    const skrull = engagedSkrull(s);
    s = patchInstance(skrull.state, villainOf(skrull.state), { statuses: { stunned: 1, confused: 0, tough: 0 } });
    const scheme = opts.scheme ? withBusiness(s) : null;
    s = scheme?.state ?? s;
    const stacked = stackedDeck(s, ...top);
    s = fillers(stacked.state);
    s = opts.mutate ? opts.mutate(s) : s;
    const before = s;
    const run = endRound(s, opts.pick ?? picker());
    return { ...run, before, skrull: skrull.id, top: stacked.ids, scheme: scheme?.id ?? null };
  }
  const identityDamage = (r: ReturnType<typeof attack>) => damageOf(r.state) - damageOf(r.before);

  it.each([false, true])("energy: +2 ATK for this attack, 3 damage in all (Skrull Business in play: %s)", (scheme) => {
    const r = attack([ENERGY], { scheme });
    expect(resolvedAbility(r.events, FORCED_INTERRUPT)).toHaveLength(1);
    expect(discardedFromDeckBy(r.events, r.skrull, P1).map((e) => e.instanceId)).toEqual(r.top);
    expect(damageFrom(r.events, r.skrull, identityOf(r.state))).toBe(3);
    expect(identityDamage(r)).toBe(3);
    expect(playerOf(r.state, P1).hand).toHaveLength(5);
    expect(inst(r.state, r.skrull).statuses.tough).toBe(0);
  });

  it("energy: the bonus is for this attack only: a later attack by him is 1", () => {
    const r = attack([ENERGY, ENERGY]);
    expect(damageFrom(r.events, r.skrull)).toBe(3);
    const second = endRound(
      patchInstance(r.state, villainOf(r.state), { statuses: { stunned: 1, confused: 0, tough: 0 } }),
    );
    // Energy again: 3, never 5: the first +2 did not stay.
    expect(damageFrom(second.events, r.skrull)).toBe(3);
  });

  it.each([false, true])("mental: discard 1 card from your hand, 1 damage (Skrull Business in play: %s)", (scheme) => {
    const r = attack([MENTAL], { scheme });
    expect(identityDamage(r)).toBe(1);
    expect(playerOf(r.state, P1).hand).toHaveLength(4);
    expect(playerOf(r.state, P1).discard.filter((i) => !r.top.includes(i))).toHaveLength(
      playerOf(r.before, P1).discard.length + 1,
    );
    expect(inst(r.state, r.skrull).statuses.tough).toBe(0);
  });

  it("mental: the player picks which hand card goes", () => {
    const start = hulklingHeroGame();
    const hand = playerOf(start, P1).hand;
    const target = hand[3]!;
    const r = attack([MENTAL], {
      pick: picker((s) =>
        s.pendingChoice!.options.some((o) => o.ref.kind === "card" && o.ref.instanceId === target)
          ? [s.pendingChoice!.options.find((o) => o.ref.kind === "card" && o.ref.instanceId === target)!.optionId]
          : undefined,
      ),
    });
    const handBefore = playerOf(r.before, P1).hand;
    const gone = handBefore.filter((i) => !playerOf(r.state, P1).hand.includes(i));
    expect(gone).toHaveLength(1);
    expect(playerOf(r.state, P1).discard).toContain(gone[0]);
  });

  it.each([false, true])(
    "physical: Super Skrull gets a tough status card, 1 damage (Skrull Business in play: %s)",
    (scheme) => {
      const r = attack([PHYSICAL], { scheme });
      expect(inst(r.state, r.skrull).statuses.tough).toBe(1);
      expect(identityDamage(r)).toBe(1);
      expect(playerOf(r.state, P1).hand).toHaveLength(5);
    },
  );

  it.each([false, true])("wild: discard an upgrade you control (Skrull Business in play: %s)", (scheme) => {
    const r = attack([WILD], { scheme, upgrades: [HULK_SHAPE] });
    expect(inst(r.state, identityOf(r.state)).attachments).toEqual([]);
    expect(playerOf(r.state, P1).discard.map((i) => codeOf(r.state, i))).toContain(HULK_SHAPE);
    // Hulk Shape's +1 DEF does not matter undefended: 1 damage.
    expect(identityDamage(r)).toBe(1);
    expect(inst(r.state, r.skrull).statuses.tough).toBe(0);
  });

  it("wild with two upgrades: only the one the player picks is discarded", () => {
    const r = attack([WILD], {
      upgrades: [HULK_SHAPE, ALIEN],
      pick: picker((s) => {
        const opts = s.pendingChoice!.options;
        const alien = opts.find((o) => o.ref.kind === "card" && codeOf(s, o.ref.instanceId) === ALIEN);
        return alien ? [alien.optionId] : undefined;
      }),
    });
    const codes = inst(r.state, identityOf(r.state)).attachments.map((i) => codeOf(r.state, i));
    expect(codes).toEqual([HULK_SHAPE]);
  });

  it("wild with no upgrade in play: nothing is discarded, 1 damage", () => {
    const r = attack([WILD]);
    expect(identityDamage(r)).toBe(1);
    expect(playerOf(r.state, P1).discard).toHaveLength(playerOf(r.before, P1).discard.length + 1);
  });

  it("a card with two different icons gives both results (energy and mental): +2 ATK and a hand card", () => {
    const r = attack([ENERGY_MENTAL]);
    expect(identityDamage(r)).toBe(3);
    expect(playerOf(r.state, P1).hand).toHaveLength(4);
  });

  it("a card with two icons of one kind gives that result once (mental, mental): one hand card", () => {
    const r = attack([MENTAL_MENTAL]);
    expect(identityDamage(r)).toBe(1);
    expect(playerOf(r.state, P1).hand).toHaveLength(4);
  });

  it("question 14 = A: with Skrull Business the discarded energy card is under the scheme, yet counted", () => {
    const r = attack([ENERGY], { scheme: true });
    expect(tucked(r.state, r.scheme!)).toEqual(r.top);
    expect(inst(r.state, r.top[0]!).faceup).toBe(false);
    expect(playerOf(r.state, P1).discard).not.toContain(r.top[0]);
    expect(resolvedAbility(r.events, BUSINESS_RESPONSE)).toHaveLength(1);
    expect(identityDamage(r)).toBe(3);
  });

  it("without Skrull Business the card is simply in the discard pile, and no response ran", () => {
    const r = attack([ENERGY]);
    expect(playerOf(r.state, P1).discard).toContain(r.top[0]);
    expect(resolvedAbility(r.events, BUSINESS_RESPONSE)).toEqual([]);
  });

  it("it is Super Skrull's own attack on you: in alter-ego form he schemes and no card is discarded", () => {
    let s: GameState = hulklingGame();
    s = engagedSkrull(s).state;
    const skrull = skrullOf(s);
    s = patchInstance(s, villainOf(s), { statuses: { stunned: 1, confused: 0, tough: 0 } });
    const stacked = stackedDeck(s, ENERGY);
    const run = endRound(fillers(stacked.state));
    expect(ofType(run.events, "enemyActivated").filter((e) => e.enemyInstanceId === skrull)).toEqual([
      expect.objectContaining({ activation: "scheme", playerId: P1 }),
    ]);
    expect(discardedFromDeckBy(run.events, skrull, P1)).toEqual([]);
    expect(resolvedAbility(run.events, FORCED_INTERRUPT)).toEqual([]);
  });

  it("two players: Super Skrull engaged with the other seat discards from that seat's deck, not yours", () => {
    let s: GameState = withForm(hulklingHeroGame({ twoPlayers: true }), { heroForm: 0 }, P2);
    const skrull = engagedSkrull(s, P2);
    s = patchInstance(skrull.state, villainOf(skrull.state), { statuses: { stunned: 1, confused: 0, tough: 0 } });
    const run = endRound(fillers(s), picker(), P1, P2);
    expect(discardedFromDeckBy(run.events, skrull.id, P2)).toHaveLength(1);
    expect(discardedFromDeckBy(run.events, skrull.id, P1)).toEqual([]);
    expect(resolvedAbility(run.events, FORCED_INTERRUPT)).toHaveLength(1);
  });
});

describe("56056.skrull-business-forced-response: after cards are discarded from the top of a player's deck, place them facedown under this scheme", () => {
  it("Super Skrull's one card goes under it; the scheme keeps its 5 threat", () => {
    const start = withBusiness(hulklingHeroGame());
    expect(inst(start.state, start.id).threat).toBe(5);
    expect(tucked(start.state, start.id)).toEqual([]);
  });

  it("another player's deck counts too: a card Skrull makes the other seat discard goes under the scheme", () => {
    let s: GameState = withForm(hulklingHeroGame({ twoPlayers: true }), { heroForm: 0 }, P2);
    const business = withBusiness(s);
    const skrull = engagedSkrull(business.state, P2);
    s = patchInstance(skrull.state, villainOf(skrull.state), { statuses: { stunned: 1, confused: 0, tough: 0 } });
    const run = endRound(fillers(s), picker(), P1, P2);
    const discarded = discardedFromDeckBy(run.events, skrull.id, P2).map((e) => e.instanceId);
    expect(discarded).toHaveLength(1);
    expect(tucked(run.state, business.id)).toEqual(discarded);
    expect(playerOf(run.state, P2).discard).not.toContain(discarded[0]);
  });
});

describe("56058: You're Coming With Me! discards the top 3 cards of your deck and counts the different resource icons (question 14 = A)", () => {
  /** You're Coming With Me! revealed to P1 over `top`, in the form of `start`, with or without Skrull Business. */
  function revealed(top: readonly string[], opts: { readonly scheme: boolean; readonly alterEgo?: boolean }) {
    const start = opts.alterEgo ? hulklingGame() : hulklingHeroGame();
    const business = opts.scheme ? withBusiness(start) : null;
    const stacked = stackedDeck(business?.state ?? start, ...top);
    const staged = stageNemesisCardForReveal(stacked.state, COMING);
    const treachery = fromSetAside(start, COMING).id;
    const run = endRound(staged);
    return { ...run, treachery, top: stacked.ids, scheme: business?.id ?? null, before: staged };
  }

  it.each([false, true])(
    "hero: energy, physical and mental: 3 different icons, 3 damage (Skrull Business: %s)",
    (scheme) => {
      const r = revealed([ENERGY, PHYSICAL, MENTAL], { scheme });
      expect(damageFrom(r.events, r.treachery, identityOf(r.state))).toBe(3);
      if (scheme) expect(tucked(r.state, r.scheme!)).toEqual(r.top);
      else expect(playerOf(r.state, P1).discard).toEqual(expect.arrayContaining([...r.top]));
    },
  );

  it.each([false, true])("hero: three energy cards are 1 different icon: 1 damage (Skrull Business: %s)", (scheme) => {
    const r = revealed([ENERGY, ENERGY, ENERGY], { scheme });
    expect(damageFrom(r.events, r.treachery, identityOf(r.state))).toBe(1);
  });

  it("hero: wild is its own icon: wild, energy and mental are 3", () => {
    const r = revealed([WILD, ENERGY, MENTAL], { scheme: false });
    expect(damageFrom(r.events, r.treachery, identityOf(r.state))).toBe(3);
  });

  it("hero: a card with two icons counts both: energy and mental on one card, plus physical, are 3; plus energy again, still 3", () => {
    const r = revealed([ENERGY_MENTAL, PHYSICAL, ENERGY], { scheme: false });
    expect(damageFrom(r.events, r.treachery, identityOf(r.state))).toBe(3);
  });

  it("hero: energy and mental on one card and two copies of it are 2 icons: 2 damage", () => {
    const r = revealed([ENERGY_MENTAL, ENERGY, MENTAL], { scheme: false });
    expect(damageFrom(r.events, r.treachery, identityOf(r.state))).toBe(2);
  });

  it.each([false, true])(
    "alter-ego: 3 different icons place 3 threat on the main scheme (Skrull Business: %s)",
    (scheme) => {
      const r = revealed([ENERGY, PHYSICAL, MENTAL], { scheme, alterEgo: true });
      expect(threatFrom(r.events, r.treachery)).toBe(3);
      expect(damageFrom(r.events, r.treachery)).toBe(0);
    },
  );

  it("alter-ego: three mental cards place 1 threat", () => {
    const r = revealed([MENTAL, MENTAL, MENTAL], { scheme: false, alterEgo: true });
    expect(threatFrom(r.events, r.treachery)).toBe(1);
  });

  it("alter-ego: wild, energy and physical place 3 threat; wild counts as its own icon", () => {
    const r = revealed([WILD, ENERGY, PHYSICAL], { scheme: false, alterEgo: true });
    expect(threatFrom(r.events, r.treachery)).toBe(3);
  });

  it("only the Hulkling form that was revealed to answers: hero form never places threat, alter-ego never takes damage", () => {
    const hero = revealed([ENERGY, PHYSICAL, MENTAL], { scheme: false });
    expect(threatFrom(hero.events, hero.treachery)).toBe(0);
    const ego = revealed([ENERGY, PHYSICAL, MENTAL], { scheme: false, alterEgo: true });
    expect(damageFrom(ego.events, ego.treachery)).toBe(0);
  });

  it("the three cards are discarded from the top of the deck, in order, and no other card leaves it", () => {
    const r = revealed([ENERGY, PHYSICAL, MENTAL], { scheme: false });
    const discarded = discardedFromDeckBy(r.events, r.treachery, P1).map((e) => e.instanceId);
    expect(discarded).toEqual(r.top);
  });
});

describe("56057 Fantastic Powers: attached minion gets +3 hit points and gains retaliate 1; When Revealed finds Super Skrull (question 15 = B)", () => {
  /**
   * Fantastic Powers revealed to P1 in a real villain phase. The villain activates once for each player and takes one
   * Advance boost card off the top for each (a minion draws none unless it is Villainous), then the cards are dealt:
   * Powers to P1 and an Advance to the second seat. A Super Skrull engaged with P1 is stunned, so that his own
   * activation is spent (a stun card replaces an attack only: one engaged with the other seat, in alter-ego form,
   * schemes there and keeps no stun card).
   */
  function reveal(opts: {
    readonly where: "setAside" | "deck" | "discard" | "engagedP1" | "engagedP2" | "gone";
    readonly alterEgo?: boolean;
    readonly twoPlayers?: boolean;
    readonly damage?: number;
    readonly tough?: number;
  }) {
    const twoPlayers = opts.twoPlayers ?? opts.where === "engagedP2";
    let s: GameState = opts.alterEgo ? hulklingGame({ twoPlayers }) : hulklingHeroGame({ twoPlayers });
    if (twoPlayers) s = withForm(s, "alterEgo", P2);
    const powers = fromSetAside(s, POWERS);
    s = powers.state;
    let skrull: InstanceId = skrullOf(s);
    if (opts.where === "engagedP1" || opts.where === "engagedP2") {
      const placed = engagedSkrull(s, opts.where === "engagedP1" ? P1 : P2, {
        damage: opts.damage ?? 0,
        statuses: { stunned: opts.where === "engagedP1" ? 1 : 0, confused: 0, tough: opts.tough ?? 0 },
      });
      s = placed.state;
    } else if (opts.where === "setAside") {
      s = patchInstance(s, skrull, { damage: opts.damage ?? 0 });
    }
    const deckId = activeEncounterDeckId(s);
    const pile = s.encounterDecks[deckId]!;
    const boosts = s.players.length;
    let deck = [...pile.deck];
    let discardPile = [...pile.discard];
    if (opts.where === "deck" || opts.where === "discard" || opts.where === "gone") {
      const found = fromSetAside(s, SKRULL);
      s = found.state;
      if (opts.where === "deck") deck = [...deck.slice(0, 20), found.id, ...deck.slice(20)];
      if (opts.where === "discard") discardPile = [found.id, ...discardPile];
      if (opts.where === "gone") s = { ...s, removedFromGame: [...s.removedFromGame, found.id] };
      s = patchInstance(s, found.id, { damage: opts.damage ?? 0 });
    }
    s = { ...s, encounterDecks: { ...s.encounterDecks, [deckId]: { deck, discard: discardPile } } };
    // Advance in every slot from the top down to the cards dealt, Fantastic Powers the first card dealt.
    const advance = deck.filter((i) => codeOf(s, i) !== SKRULL).slice(0, boosts + s.players.length + 6);
    for (const id of advance) s = patchInstance(s, id, { cardId: cardId(ADVANCE) });
    const rest = deck.filter((i) => !advance.includes(i));
    const stacked = [...advance.slice(0, boosts), powers.id, ...advance.slice(boosts), ...rest];
    s = { ...s, encounterDecks: { ...s.encounterDecks, [deckId]: { deck: stacked, discard: discardPile } } };
    s = patchInstance(s, powers.id, { faceup: false });
    skrull = skrullOf(s);
    const before = s;
    const run = endRound(s, picker(), ...(twoPlayers ? [P1, P2] : [P1]));
    return { ...run, before, skrull, powers: powers.id, top: playerOf(before, P1).deck[0]! };
  }
  const attachedTo = (r: { state: GameState; powers: InstanceId }) => inst(r.state, r.powers).attachedTo;
  const shuffles = (events: readonly GameEvent[]) =>
    ofType(events, "deckShuffled").filter((e) => (e.zone as unknown as { kind?: string }).kind === "encounterDeck");

  it("hero form, Super Skrull set aside: he enters engaged with you, wears Fantastic Powers and attacks you", () => {
    const r = reveal({ where: "setAside" });
    expect(attachedTo(r)).toBe(r.skrull);
    expect(inst(r.state, r.skrull).attachments).toEqual([r.powers]);
    expect(inst(r.state, r.skrull).engagedWith).toBe(P1);
    expect(playerOf(r.state, P1).playArea).toContain(r.skrull);
    expect(playerOf(r.state, P1).setAside).not.toContain(r.skrull);
    // ATK 1 + 1 from Fantastic Powers, and 0 boost icons on the Advance.
    expect(damageFrom(r.events, r.skrull, identityOf(r.state))).toBe(2);
    expect(discardedFromDeckBy(r.events, r.skrull, P1)).toHaveLength(1);
  });

  it("the attached Super Skrull has 8 hit points, ATK 2, SCH 2 and retaliate 1", () => {
    const r = reveal({ where: "setAside" });
    expect(profile(r.state, r.skrull)).toMatchObject({ maxHp: 8, atk: 2, sch: 2 });
    expect(keywordsOf(r.state, r.skrull, WAVE10_DEPS)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "retaliate" })]),
    );
  });

  it("alter-ego form: he enters engaged and wears it, but does not attack", () => {
    const r = reveal({ where: "setAside", alterEgo: true });
    expect(attachedTo(r)).toBe(r.skrull);
    expect(inst(r.state, r.skrull).engagedWith).toBe(P1);
    expect(damageFrom(r.events, r.skrull)).toBe(0);
    expect(discardedFromDeckBy(r.events, r.skrull, P1)).toEqual([]);
    expect(resolvedAbility(r.events, FORCED_INTERRUPT)).toEqual([]);
  });

  it("Super Skrull in the encounter deck: found there, and the encounter deck is shuffled", () => {
    const r = reveal({ where: "deck" });
    expect(attachedTo(r)).toBe(r.skrull);
    expect(inst(r.state, r.skrull).engagedWith).toBe(P1);
    expect(piles(r.state).deck).not.toContain(r.skrull);
    expect(damageFrom(r.events, r.skrull, identityOf(r.state))).toBe(2);
    expect(shuffles(r.events)).toHaveLength(1);
  });

  it("Super Skrull in the encounter discard pile: found there, with the damage he had", () => {
    const r = reveal({ where: "discard", damage: 2 });
    expect(attachedTo(r)).toBe(r.skrull);
    expect(piles(r.state).discard).not.toContain(r.skrull);
    expect(inst(r.state, r.skrull).engagedWith).toBe(P1);
    expect(damageFrom(r.events, r.skrull, identityOf(r.state))).toBe(2);
    expect(shuffles(r.events)).toEqual([]);
  });

  it("Super Skrull already engaged with you: he stays, wears it and attacks you; nothing re-engages", () => {
    const r = reveal({ where: "engagedP1", damage: 2, tough: 1 });
    expect(attachedTo(r)).toBe(r.skrull);
    expect(inst(r.state, r.skrull).engagedWith).toBe(P1);
    expect(playerOf(r.state, P1).playArea.filter((i) => i === r.skrull)).toHaveLength(1);
    expect(inst(r.state, r.skrull).damage).toBe(2);
    expect(inst(r.state, r.skrull).statuses.tough).toBe(1);
    expect(damageFrom(r.events, r.skrull, identityOf(r.state))).toBe(2);
  });

  it("question 15 = B, two players: Super Skrull engaged with the other seat moves to engage you, keeping his damage and status card", () => {
    const r = reveal({ where: "engagedP2", damage: 2, tough: 1 });
    expect(inst(r.before, r.skrull).engagedWith).toBe(P2);
    expect(playerOf(r.before, P2).playArea).toContain(r.skrull);
    expect(inst(r.state, r.skrull).engagedWith).toBe(P1);
    expect(playerOf(r.state, P1).playArea).toContain(r.skrull);
    expect(playerOf(r.state, P2).playArea).not.toContain(r.skrull);
    expect(attachedTo(r)).toBe(r.skrull);
    expect(inst(r.state, r.skrull).damage).toBe(2);
    expect(inst(r.state, r.skrull).statuses.tough).toBe(1);
    expect(damageFrom(r.events, r.skrull, identityOf(r.state, P1))).toBe(2);
    expect(damageFrom(r.events, r.skrull, identityOf(r.state, P2))).toBe(0);
  });

  it("question 15 = B, the revealing player in alter-ego form: he moves to engage you and does not attack", () => {
    const r = reveal({ where: "engagedP2", alterEgo: true });
    expect(inst(r.state, r.skrull).engagedWith).toBe(P1);
    expect(attachedTo(r)).toBe(r.skrull);
    expect(damageFrom(r.events, r.skrull, identityOf(r.state, P1))).toBe(0);
  });

  it("Super Skrull nowhere to be found: nothing is attached and Fantastic Powers is discarded", () => {
    const r = reveal({ where: "gone" });
    expect(attachedTo(r)).toBeNull();
    expect(piles(r.state).discard).toContain(r.powers);
    expect(damageFrom(r.events, r.skrull)).toBe(0);
    expect(r.state.removedFromGame).toContain(r.skrull);
    // Not known to be anywhere else: the find looked through the encounter deck, which is shuffled (RRG "Search", p. 39).
    expect(shuffles(r.events)).toHaveLength(1);
  });

  it('Super Skrull set aside, or in play: his place is known, so the encounter deck is not looked through or shuffled (RRG "Find", p. 19)', () => {
    expect(shuffles(reveal({ where: "setAside" }).events)).toEqual([]);
    expect(shuffles(reveal({ where: "engagedP1" }).events)).toEqual([]);
    expect(shuffles(reveal({ where: "engagedP2" }).events)).toEqual([]);
  });
});

describe("56054.obligation: Complicated Lineage", () => {
  /**
   * Complicated Lineage revealed to the Teddy Altman player in a real villain phase, behind one boost card for each
   * player. `choices` are the labels picked in order. Returns the state and events and the state at the first prompt.
   */
  function reveal(
    start: GameState,
    opts: { readonly choices: readonly string[]; readonly players?: readonly PlayerId[] },
  ) {
    const filled = fillers(start);
    const deckId = activeEncounterDeckId(filled);
    const original = piles(start).deck.find((i) => codeOf(start, i) === OBLIGATION)!;
    const rest = piles(filled).deck.filter((i) => i !== original);
    const stacked: GameState = {
      ...filled,
      instances: { ...filled.instances, [original]: start.instances[original]! },
      encounterDecks: {
        ...filled.encounterDecks,
        [deckId]: {
          ...piles(filled),
          deck: [...rest.slice(0, start.players.length), original, ...rest.slice(start.players.length)],
        },
      },
    };
    const events: GameEvent[] = [];
    let atPrompt: GameState | null = null;
    const hook = (st: GameState): GameState => {
      if (!atPrompt && st.pendingChoice!.prompt.kind === "chooseOption") atPrompt = st;
      return st;
    };
    let current = stacked;
    for (const player of opts.players ?? [P1]) {
      const result = applyCommand(current, endTurn(player), WAVE10_DEPS);
      if (!result.ok) throw new Error(result.error.message);
      events.push(...result.events);
      const done = driveStepwise(WAVE10_DEPS, result.state, pickLabels(...opts.choices), hook);
      events.push(...done.events);
      current = done.state;
    }
    if (!atPrompt) throw new Error("the obligation never prompted");
    return { state: current, events, before: atPrompt as GameState, obligation: original };
  }
  const attached = (s: GameState, player: PlayerId = P1) =>
    inst(s, identityOf(s, player)).attachments.map((i) => codeOf(s, i));

  it("hero form: asks first about flipping, then to choose; the exhaust option is not offered in hero form", () => {
    const start = upgradeInPlay(hulklingHeroGame(), HULK_SHAPE).state;
    const r = reveal(start, { choices: ["Stay", "Discard each"] });
    expect(r.before.pendingChoice!.options.map((o) => o.label)).toEqual([
      "Flip to alter-ego form",
      "Stay in hero form",
    ]);
    expect(r.state.pendingChoice).toBeNull();
  });

  it("hero form, second option: every Shapeshift upgrade you control is discarded, then the card; Chosen Shape stays silent", () => {
    const start = upgradeInPlay(upgradeInPlay(hulklingHeroGame(), HULK_SHAPE).state, ENERGY_MENTAL).state;
    expect(attached(start)).toEqual([HULK_SHAPE, ENERGY_MENTAL]);
    const r = reveal(start, { choices: ["Stay", "Discard each"] });
    expect(attached(r.state)).toEqual([]);
    expect(piles(r.state).discard).toContain(r.obligation);
    expect(r.state.removedFromGame).not.toContain(r.obligation);
    expect(playerOf(r.state, P1).discard.map((i) => codeOf(r.state, i))).toEqual(
      expect.arrayContaining([HULK_SHAPE, ENERGY_MENTAL]),
    );
    expect(resolvedAbility(r.events, CHOSEN_SHAPE)).toEqual([]);
  });

  it("an upgrade that is not a Shapeshift upgrade stays in play", () => {
    const start = upgradeInPlay(upgradeInPlay(hulklingHeroGame(), HULK_SHAPE).state, ALIEN).state;
    const r = reveal(start, { choices: ["Stay", "Discard each"] });
    expect(attached(r.state)).toEqual([ALIEN]);
  });

  it("with no Shapeshift upgrade the second option may still be chosen: the card is discarded", () => {
    const r = reveal(hulklingHeroGame(), { choices: ["Stay", "Discard each"] });
    expect(piles(r.state).discard).toContain(r.obligation);
    expect(attached(r.state)).toEqual([]);
  });

  it("flip, then exhaust Teddy Altman: the card is removed from the game and the shape stays", () => {
    const start = upgradeInPlay(hulklingHeroGame(), HULK_SHAPE).state;
    const r = reveal(start, { choices: ["Flip", "Exhaust"] });
    expect(playerOf(r.state, P1).identity.form).toBe("alterEgo");
    expect(r.state.removedFromGame).toContain(r.obligation);
    expect(piles(r.state).discard).not.toContain(r.obligation);
    expect(inst(r.state, identityOf(r.state)).exhausted).toBe(true);
    expect(attached(r.state)).toEqual([HULK_SHAPE]);
  });

  it("flip, then the second option: Teddy Altman has no shape to keep, and the card is discarded", () => {
    const start = upgradeInPlay(hulklingHeroGame(), HULK_SHAPE).state;
    const r = reveal(start, { choices: ["Flip", "Discard each"] });
    expect(playerOf(r.state, P1).identity.form).toBe("alterEgo");
    expect(attached(r.state)).toEqual([]);
    expect(piles(r.state).discard).toContain(r.obligation);
  });

  it("alter-ego form: no flip is asked; both options are offered with Teddy ready", () => {
    const r = reveal(hulklingGame(), { choices: ["Discard each"] });
    expect(r.before.pendingChoice!.options.map((o) => o.label)).toEqual([
      "Exhaust Teddy Altman → remove this obligation from the game",
      "Discard each Shapeshift upgrade you control",
    ]);
  });

  it("two players: only your Shapeshift upgrades go; the other seat's stays", () => {
    const mine = upgradeInPlay(hulklingHeroGame({ twoPlayers: true }), HULK_SHAPE);
    const theirs = upgradeInPlay(mine.state, ENERGY_MENTAL, P2);
    const r = reveal(theirs.state, { choices: ["Stay", "Discard each"], players: [P1, P2] });
    expect(attached(r.state, P1)).toEqual([]);
    expect(attached(r.state, P2)).toEqual([ENERGY_MENTAL]);
    expect(piles(r.state).discard).toContain(r.obligation);
  });

  it("the obligation is dealt to the Teddy Altman player, not to the seat whose turn it is in the deal order", () => {
    const start = hulklingHeroGame({ twoPlayers: true });
    const r = reveal(start, { choices: ["Stay", "Discard each"], players: [P1, P2] });
    expect(r.before.pendingChoice!.playerId).toBe(P1);
    expect(piles(r.state).discard).toContain(r.obligation);
  });
});
