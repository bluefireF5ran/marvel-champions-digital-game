import { CORE_CARDS, CW_CARDS, cardId, type AnyCard } from "@mc/content";
import {
  activeEncounterDeckId,
  replay,
  sessionApply,
  startSession,
  type Command,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { validateDefinition } from "../../../dsl/validate.js";
import {
  P1,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  mainThreat,
  moveToHand,
  patchInstance,
  payWith,
  play,
  playerOf,
  resourceAbility,
  stackEncounterDeck,
  use,
  type Picker,
} from "../../../testing/harness.js";
import { WAVE10_DEPS, engageMinion, stagedInPlay, tigraGame, tigraHeroGame } from "../../testing.js";
import { TIGRA_SUPPORT_UPGRADES_ALLIES, TIGRA_SUPPORT_UPGRADES_ALLIES_SKIPPED } from "./support-upgrades-allies.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Tigra's allies, supports and upgrades, docs/phase7-wave10-box-heroes.md B3.6, B3.8, B3.17 and B7.1: Moon Knight 56002,
 * Precinct HQ 56003, Cat's Head Amulet 56004, Sharp Claws 56005 and Cat-Like Reflexes 56006, in the printed precon
 * `tigra-aggression` against Core's Rhino. Hunted 56007 waits on box-heroes B8.2 task 1 (B3.1) and is skipped.
 *
 * Question 18 = A (owner, 2026-10-11, provisional): a quickstrike minion Moon Knight fetches attacks first, when the
 * player is in hero form, and is then stunned and confused (February 28, 2026 rulings 1 and 4). Question 17 (Hunted with
 * nothing to find) is Hunted's and waits with it.
 */
const MOON_KNIGHT = "56002.moon-knight-forced-response";
const PRECINCT = "56003.precinct-hq-action";
const AMULET = "56004.cats-head-amulet-resource";
const CLAWS = "56005.sharp-claws-interrupt";
const REFLEXES = "56006.cat-like-reflexes-interrupt";
const REFS = [MOON_KNIGHT, PRECINCT, AMULET, CLAWS, REFLEXES];
const MK = "56002";
const HQ = "56003";
const AMULET_CODE = "56004";
const CLAWS_CODE = "56005";
const REFLEXES_CODE = "56006";
const SHOCKER = "01103"; // Core minion without guard, 3 hit points
const MODOK = "01184"; // Core minion, 8 hit points
const VULTURE = "01167"; // Core minion: quickstrike, ATK 3, 4 hit points
const ADVANCE = "01186"; // Core treachery: "The villain schemes"
const CHARGE = "01099"; // Rhino attachment, 2 boost icons

const typeOf = (s: GameState, id: InstanceId): string =>
  (CORE_CARDS.find((c: AnyCard) => c.id === inst(s, id).cardId) ?? { type: "?" }).type;
const ofType = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const villainOf = (s: GameState): InstanceId => s.activeVillainId!;
const piles = (s: GameState) => s.encounterDecks[activeEncounterDeckId(s)]!;
const stunnedOf = (s: GameState, id: InstanceId): number => inst(s, id).statuses.stunned;
const confusedOf = (s: GameState, id: InstanceId): number => inst(s, id).statuses.confused;
const withMainThreat = (s: GameState, threat: number): GameState =>
  patchInstance(s, s.mainScheme.instanceId, { threat });

/** Applies `command`, answering each choice with `pick`; the log replays to the same state. */
function drive(state: GameState, command: Command, pick: Picker = firstLegal) {
  let session = startSession(state);
  const events: GameEvent[] = [];
  const first = sessionApply(session, command, WAVE10_DEPS);
  if (!first.ok) throw new Error(`${command.type} rejected: ${first.error.code}: ${first.error.message}`);
  session = first.session;
  events.push(...first.events);
  for (let guard = 0; session.state.pendingChoice && !session.state.outcome; guard++) {
    if (guard > 100) throw new Error(`choices did not settle (${session.state.pendingChoice.prompt.kind})`);
    const choice = session.state.pendingChoice;
    const next = sessionApply(
      session,
      {
        type: "resolveChoice",
        playerId: choice.playerId,
        choiceId: choice.choiceId,
        selectedOptionIds: pick(session.state),
      },
      WAVE10_DEPS,
    );
    if (!next.ok) throw new Error(`resolveChoice rejected: ${next.error.code}: ${next.error.message}`);
    session = next.session;
    events.push(...next.events);
  }
  const replayed = replay(session.log, WAVE10_DEPS);
  if (!replayed.ok) throw new Error(replayed.error.message);
  expect(replayed.state).toEqual(session.state);
  return { state: session.state, events };
}
const rejected = (state: GameState, command: Command): boolean =>
  !sessionApply(startSession(state), command, WAVE10_DEPS).ok;

/**
 * Picks, in order of preference: the card wanted by `targets` (taking the first listed one on offer), the option whose
 * id ends with an accepted ability, the option labelled `label`; anything else as `firstLegal`.
 */
const choosing =
  (opts: { targets?: readonly InstanceId[]; accept?: readonly string[]; label?: RegExp } = {}): Picker =>
  (state) => {
    const choice = state.pendingChoice;
    if (!choice) return [];
    const wanted = (opts.targets ?? []).find((t) =>
      choice.options.some((o) => o.ref.kind === "card" && o.ref.instanceId === t),
    );
    if (wanted) return [choice.options.find((o) => o.ref.kind === "card" && o.ref.instanceId === wanted)!.optionId];
    const accepted = choice.options.filter((o) => (opts.accept ?? []).some((a) => o.optionId.endsWith(`:${a}`)));
    if (accepted.length > 0) return [accepted[0]!.optionId];
    const labelled = opts.label ? choice.options.find((o) => opts.label!.test(o.label)) : undefined;
    return labelled ? [labelled.optionId] : firstLegal(state);
  };

/** `code` in P1's hand and the command that plays it, paying `cost` with other hand cards. */
function staged(state: GameState, code: string, cost: number) {
  const given = moveToHand(state, P1, code);
  const [id] = given.ids as [InstanceId];
  return { state: given.state, id, command: play(P1, id, payWith(given.state, P1, cost, [id])) };
}

/**
 * Test surgery on the encounter deck: the top `inDeck.length` cards become minions `inDeck` (relabelled, so the Core
 * Rhino deck needs none of its own), and `inDiscard.length` more are moved to its discard pile as minions `inDiscard`.
 * Every other minion in either pile becomes an Advance treachery, so the piles hold exactly these minions.
 */
function withEncounterMinions(state: GameState, inDeck: readonly string[], inDiscard: readonly string[] = []) {
  const pile = piles(state);
  let cur = state;
  for (const id of [...pile.deck, ...pile.discard])
    if (typeOf(cur, id) === "minion") cur = patchInstance(cur, id, { cardId: cardId(ADVANCE) });
  const ids = [...piles(cur).deck, ...piles(cur).discard].slice(0, inDeck.length + inDiscard.length);
  const deckIds = ids.slice(0, inDeck.length);
  const discardIds = ids.slice(inDeck.length);
  [...deckIds, ...discardIds].forEach((id, n) => {
    cur = patchInstance(cur, id, { cardId: cardId([...inDeck, ...inDiscard][n]!) });
  });
  const rest = piles(cur);
  const deckId = activeEncounterDeckId(cur);
  return {
    state: {
      ...cur,
      encounterDecks: {
        ...cur.encounterDecks,
        [deckId]: {
          deck: [...deckIds, ...rest.deck.filter((i) => !ids.includes(i))],
          discard: [...discardIds, ...rest.discard.filter((i) => !ids.includes(i))],
        },
      },
    },
    deckIds,
    discardIds,
  };
}

describe("Tigra supports, upgrades and ally registry", () => {
  const printed = (code: string): string[] =>
    (CW_CARDS.find((c) => c.id === cardId(code))! as unknown as { abilities: { id: string }[] }).abilities.map(
      (a) => a.id as string,
    );

  it("every ability validates, with the printed timing", () => {
    for (const id of REFS) expect(validateDefinition(TIGRA_SUPPORT_UPGRADES_ALLIES[id]!), id).toEqual([]);
    const t = (id: string) => TIGRA_SUPPORT_UPGRADES_ALLIES[id]!.trigger;
    expect(t(MOON_KNIGHT)).toMatchObject({ kind: "response", forced: true });
    expect(t(PRECINCT)).toMatchObject({ kind: "action", form: "alterEgo" });
    expect(t(AMULET)).toMatchObject({ kind: "resource" });
    expect(t(CLAWS)).toMatchObject({ kind: "interrupt", forced: false });
    expect(t(REFLEXES)).toMatchObject({ kind: "interrupt", forced: false, form: "hero" });
  });

  it("five printed refs are registered; Hunted's two wait on box-heroes B8.2 task 1 (B3.1)", () => {
    expect(printed(MK)).toEqual([MOON_KNIGHT]);
    expect(printed(HQ)).toEqual([PRECINCT]);
    expect(printed(AMULET_CODE)).toEqual([AMULET]);
    expect(printed(CLAWS_CODE)).toEqual([CLAWS]);
    expect(printed(REFLEXES_CODE)).toEqual([REFLEXES]);
    expect(Object.keys(TIGRA_SUPPORT_UPGRADES_ALLIES).sort()).toEqual([...REFS].sort());
    expect(printed("56007")).toEqual(Object.keys(TIGRA_SUPPORT_UPGRADES_ALLIES_SKIPPED));
    for (const reason of Object.values(TIGRA_SUPPORT_UPGRADES_ALLIES_SKIPPED))
      expect(reason).toContain("waits on box-heroes B8.2 task 1 (B3.1)");
  });
});

describe(`${MOON_KNIGHT}: search the encounter deck and discard pile for a minion, put it into play engaged with you, stun and confuse it (question 18 = A)`, () => {
  it("with a minion in the deck and one in the discard pile the player picks; the pick is engaged, stunned and confused", () => {
    const seeded = withEncounterMinions(tigraGame(), [SHOCKER], [MODOK]);
    const [fromDeck] = seeded.deckIds as [InstanceId];
    const [fromDiscard] = seeded.discardIds as [InstanceId];
    const { state, id, command } = staged(seeded.state, MK, 1);
    const offered: InstanceId[] = [];
    const watching: Picker = (s) => {
      const choice = s.pendingChoice!;
      if (choice.prompt.kind === "chooseCards")
        for (const o of choice.options) if (o.ref.kind === "card") offered.push(o.ref.instanceId);
      return choosing({ targets: [fromDiscard], accept: [MOON_KNIGHT] })(s);
    };
    const { state: after, events } = drive(state, command, watching);
    expect(offered.sort()).toEqual([fromDeck, fromDiscard].sort());
    expect(playerOf(after, P1).playArea).toEqual(expect.arrayContaining([id, fromDiscard]));
    expect(inst(after, fromDiscard).engagedWith).toBe(P1);
    expect(stunnedOf(after, fromDiscard)).toBe(1);
    expect(confusedOf(after, fromDiscard)).toBe(1);
    expect(piles(after).discard).not.toContain(fromDiscard);
    expect(piles(after).deck).toContain(fromDeck);
    expect(inst(after, fromDeck).engagedWith).toBeNull();
    expect(stunnedOf(after, fromDeck)).toBe(0);
    expect(ofType(events, "deckShuffled")).toHaveLength(1);
  });

  it("the pick may come from the deck as well", () => {
    const seeded = withEncounterMinions(tigraGame(), [SHOCKER], [MODOK]);
    const [fromDeck] = seeded.deckIds as [InstanceId];
    const [fromDiscard] = seeded.discardIds as [InstanceId];
    const { state, command } = staged(seeded.state, MK, 1);
    const { state: after } = drive(state, command, choosing({ targets: [fromDeck], accept: [MOON_KNIGHT] }));
    expect(inst(after, fromDeck).engagedWith).toBe(P1);
    expect(stunnedOf(after, fromDeck)).toBe(1);
    expect(confusedOf(after, fromDeck)).toBe(1);
    expect(piles(after).discard).toContain(fromDiscard);
    expect(inst(after, fromDiscard).engagedWith).toBeNull();
  });

  it("with no minion to find the deck is still shuffled and nothing is put into play", () => {
    const seeded = withEncounterMinions(tigraGame(), [], []);
    const { state, id, command } = staged(seeded.state, MK, 1);
    const minionsBefore = Object.values(state.instances).filter((i) => i.engagedWith === P1).length;
    const { state: after, events } = drive(state, command, choosing({ accept: [MOON_KNIGHT] }));
    expect(playerOf(after, P1).playArea).toContain(id);
    expect(Object.values(after.instances).filter((i) => i.engagedWith === P1)).toHaveLength(minionsBefore);
    expect(ofType(events, "deckShuffled")).toHaveLength(1);
  });

  it("a quickstrike minion attacks you first in hero form (ATK 3 damage), and is then stunned and confused", () => {
    const seeded = withEncounterMinions(tigraHeroGame(), [VULTURE]);
    const [vulture] = seeded.deckIds as [InstanceId];
    const { state, command } = staged(seeded.state, MK, 1);
    const hero = identityOf(state);
    expect(inst(state, hero).damage).toBe(0);
    const { state: after, events } = drive(state, command, choosing({ targets: [vulture], accept: [MOON_KNIGHT] }));
    expect(inst(after, hero).damage).toBe(3);
    expect(inst(after, vulture).engagedWith).toBe(P1);
    expect(stunnedOf(after, vulture)).toBe(1);
    expect(confusedOf(after, vulture)).toBe(1);
    const order = events.map((e) => e.type);
    const attacked = order.indexOf("damageDealt");
    const stunnedAt = events.findIndex((e) => e.type === "statusGiven" && e.instanceId === vulture);
    expect(attacked).toBeGreaterThan(-1);
    expect(stunnedAt).toBeGreaterThan(attacked);
  });

  it("in alter-ego form a quickstrike minion does not attack (it engages the alter-ego, not the hero)", () => {
    const seeded = withEncounterMinions(tigraGame(), [VULTURE]);
    const [vulture] = seeded.deckIds as [InstanceId];
    const { state, command } = staged(seeded.state, MK, 1);
    const { state: after } = drive(state, command, choosing({ targets: [vulture], accept: [MOON_KNIGHT] }));
    expect(inst(after, identityOf(after)).damage).toBe(0);
    expect(stunnedOf(after, vulture)).toBe(1);
    expect(confusedOf(after, vulture)).toBe(1);
  });
});

describe(`${PRECINCT}: Alter-Ego Action, exhaust: remove 1 threat from a scheme, plus 1 for each minion engaged with you`, () => {
  const hqGame = (minions: number, threat: number, hero = false) => {
    let s = withMainThreat(hero ? tigraHeroGame() : tigraGame(), threat);
    for (let n = 0; n < minions; n++) s = engageMinion(s, MODOK, `modok-${n}`);
    return stagedInPlay(s, HQ);
  };

  it.each([
    [0, 1],
    [1, 2],
    [2, 3],
    [4, 5],
  ])("with %i engaged minion(s) it removes %i threat and exhausts", (minions, removed) => {
    const { state, id } = hqGame(minions, 9);
    const { state: after, events } = drive(state, use(P1, id, PRECINCT));
    expect(mainThreat(after)).toBe(9 - removed);
    expect(inst(after, id).exhausted).toBe(true);
    expect(ofType(events, "threatRemoved").map((e) => e.amount)).toEqual([removed]);
  });

  it("removes only what is there: 3 threat with 4 minions engaged empties the scheme", () => {
    const { state, id } = hqGame(4, 3);
    expect(mainThreat(drive(state, use(P1, id, PRECINCT)).state)).toBe(0);
  });

  it("only minions engaged with you count: one engaged with the other player does not", () => {
    const two = engageMinion(tigraGame({ twoPlayers: true }), MODOK, "theirs", "p2" as never);
    const { state, id } = stagedInPlay(withMainThreat(two, 9), HQ);
    expect(mainThreat(drive(state, use(P1, id, PRECINCT)).state)).toBe(8);
  });

  it("is an Alter-Ego Action: refused in hero form, and refused once exhausted", () => {
    const hero = hqGame(0, 5, true);
    expect(rejected(hero.state, use(P1, hero.id, PRECINCT))).toBe(true);
    const spent = patchInstance(hqGame(0, 5).state, hqGame(0, 5).id, { exhausted: true });
    expect(rejected(spent, use(P1, hqGame(0, 5).id, PRECINCT))).toBe(true);
  });

  it("is not a thwart: a confused alter-ego still removes the threat and stays confused", () => {
    const { state, id } = hqGame(1, 5);
    const identity = identityOf(state);
    const confused = patchInstance(state, identity, { statuses: { ...inst(state, identity).statuses, confused: 1 } });
    const { state: after } = drive(confused, use(P1, id, PRECINCT));
    expect(mainThreat(after)).toBe(3);
    expect(confusedOf(after, identity)).toBe(1);
  });
});

describe(`${AMULET}: Resource, exhaust: generate a physical resource for each minion engaged with you, to a maximum of 3`, () => {
  /** Pays Precinct HQ's cost of 2 with the amulet first and `rest` hand cards beside it. */
  function payWithAmulet(minions: number, rest: number) {
    let s = tigraGame();
    for (let n = 0; n < minions; n++) s = engageMinion(s, MODOK, `modok-${n}`);
    const amulet = stagedInPlay(s, AMULET_CODE, { attach: true });
    const given = moveToHand(amulet.state, P1, HQ);
    const [hq] = given.ids as [InstanceId];
    const command = play(P1, hq, payWith(given.state, P1, rest, [hq]), {
      abilities: [resourceAbility(amulet.id, AMULET)],
    });
    return { state: given.state, hq, amulet: amulet.id, command };
  }

  it.each([
    [1, 1],
    [2, 0],
    [3, 0],
  ])("with %i engaged minion(s) it pays for %i of the 2-cost card, the rest from the hand", (minions, rest) => {
    const { state, hq, amulet, command } = payWithAmulet(minions, rest === 0 ? 0 : 2 - minions);
    const { state: after, events } = drive(state, command);
    expect(playerOf(after, P1).playArea).toContain(hq);
    expect(inst(after, amulet).exhausted).toBe(true);
    expect(ofType(events, "resourcesGenerated").map((e) => e.amount)).toEqual([minions]);
    expect(playerOf(after, P1).hand).toHaveLength(playerOf(state, P1).hand.length - 1 - Math.max(0, 2 - minions));
  });

  it("generates at most 3: with 5 engaged minions it generates 3", () => {
    const { state, command } = payWithAmulet(5, 0);
    const { events } = drive(state, command);
    expect(ofType(events, "resourcesGenerated").map((e) => e.amount)).toEqual([3]);
  });

  it("generates physical resources", () => {
    const { state, command } = payWithAmulet(2, 0);
    const { events } = drive(state, command);
    expect(ofType(events, "resourcesGenerated")[0]!.pool).toMatchObject({ physical: 2 });
  });

  it("with no minion engaged it may still be used and generates nothing", () => {
    const { state, hq, amulet, command } = payWithAmulet(0, 2);
    const { state: after, events } = drive(state, command);
    expect(playerOf(after, P1).playArea).toContain(hq);
    expect(inst(after, amulet).exhausted).toBe(true);
    expect(ofType(events, "resourcesGenerated").map((e) => e.amount)).toEqual([0]);
  });

  it("only minions engaged with you count", () => {
    const two = engageMinion(tigraGame({ twoPlayers: true }), MODOK, "theirs", "p2" as never);
    const amulet = stagedInPlay(two, AMULET_CODE, { attach: true });
    const given = moveToHand(amulet.state, P1, HQ);
    const [hq] = given.ids as [InstanceId];
    const command = play(P1, hq, payWith(given.state, P1, 2, [hq]), {
      abilities: [resourceAbility(amulet.id, AMULET)],
    });
    const { events } = drive(given.state, command);
    expect(ofType(events, "resourcesGenerated").map((e) => e.amount)).toEqual([0]);
  });
});

describe(`${CLAWS}: Interrupt, when you make a basic attack, exhaust: +1 ATK for this attack; choose overkill or piercing`, () => {
  /** Tigra (ATK 2) in hero form with Sharp Claws attached, and an 8-hit-point MODOK carrying `damage` and `tough`. */
  function game(opts: { damage?: number; tough?: number } = {}) {
    const claws = stagedInPlay(tigraHeroGame(), CLAWS_CODE, { attach: true });
    let s = engageMinion(claws.state, MODOK, "target");
    s = patchInstance(s, "target" as InstanceId, {
      damage: opts.damage ?? 0,
      statuses: { stunned: 0, confused: 0, tough: opts.tough ?? 0 },
    });
    const attack: Command = {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: identityOf(s),
      targetInstanceId: "target" as InstanceId,
    };
    return { state: s, claws: claws.id, attack };
  }
  const use1 = (label: RegExp) => choosing({ accept: [CLAWS], label });

  it("without the interrupt the basic attack deals ATK 2", () => {
    const { state, attack } = game();
    expect(inst(drive(state, attack).state, "target" as InstanceId).damage).toBe(2);
  });

  it("taking it adds 1 ATK (3 damage), exhausts Sharp Claws and offers overkill and piercing", () => {
    const { state, claws, attack } = game();
    const labels: string[] = [];
    const watching: Picker = (s) => {
      if (s.pendingChoice?.prompt.kind === "chooseOption") labels.push(...s.pendingChoice.options.map((o) => o.label));
      return use1(/overkill/i)(s);
    };
    const { state: after, events } = drive(state, attack, watching);
    expect(labels).toEqual(["This attack gains overkill", "This attack gains piercing"]);
    expect(
      ofType(events, "damageDealt")
        .filter((e) => e.targetInstanceId === "target")
        .map((e) => e.amount),
    ).toEqual([3]);
    expect(inst(after, claws).exhausted).toBe(true);
  });

  it("overkill: 3 ATK against a minion with 1 hit point left defeats it and the excess 2 reaches the villain", () => {
    const { state, attack } = game({ damage: 7 });
    const villain = villainOf(state);
    const { state: after } = drive(state, attack, use1(/overkill/i));
    expect(piles(after).discard).toContain("target");
    expect(inst(after, villain).damage).toBe(inst(state, villain).damage + 2);
  });

  it("the same kill with piercing chosen instead: the villain takes nothing", () => {
    const { state, attack } = game({ damage: 7 });
    const villain = villainOf(state);
    const { state: after } = drive(state, attack, use1(/piercing/i));
    expect(piles(after).discard).toContain("target");
    expect(inst(after, villain).damage).toBe(inst(state, villain).damage);
  });

  it("piercing: the minion's tough status card does not stop the 3 damage (it is discarded)", () => {
    const { state, attack } = game({ tough: 1 });
    const { state: after } = drive(state, attack, use1(/piercing/i));
    expect(inst(after, "target" as InstanceId).damage).toBe(3);
    expect(inst(after, "target" as InstanceId).statuses.tough).toBe(0);
  });

  it("the same attack without piercing: the tough status card absorbs the damage", () => {
    const { state, attack } = game({ tough: 1 });
    const { state: after } = drive(state, attack);
    expect(inst(after, "target" as InstanceId).damage).toBe(0);
    expect(inst(after, "target" as InstanceId).statuses.tough).toBe(0);
  });

  it("the chosen keyword is for this attack only: piercing does not carry to the next attack", () => {
    const { state, attack } = game({ tough: 1 });
    const first = drive(state, attack, use1(/piercing/i)).state;
    const ready = patchInstance(first, identityOf(first), { exhausted: false });
    const withTough = patchInstance(ready, "target" as InstanceId, {
      damage: 0,
      statuses: { stunned: 0, confused: 0, tough: 1 },
    });
    const { state: second } = drive(withTough, attack);
    expect(inst(second, "target" as InstanceId).damage).toBe(0);
  });

  it("is not available while exhausted: the attack deals ATK 2 with no choice offered", () => {
    const { state, claws, attack } = game();
    const spent = patchInstance(state, claws, { exhausted: true });
    const { state: after, events } = drive(spent, attack, use1(/overkill/i));
    expect(
      ofType(events, "damageDealt")
        .filter((e) => e.targetInstanceId === "target")
        .map((e) => e.amount),
    ).toEqual([2]);
    expect(inst(after, claws).exhausted).toBe(true);
  });
});

describe(`${REFLEXES}: Hero Interrupt, when you would take damage, discard: prevent 3 of it; you may confuse an engaged minion`, () => {
  /** Tigra in hero form with Cat-Like Reflexes, a stunned minion engaged, and Rhino about to attack with a 2-icon boost. */
  function game(minion = true) {
    const reflexes = stagedInPlay(tigraHeroGame(), REFLEXES_CODE, { attach: true });
    let s = reflexes.state;
    if (minion) {
      s = engageMinion(s, MODOK, "modok");
      s = patchInstance(s, "modok" as InstanceId, { statuses: { stunned: 1, confused: 0, tough: 0 } });
    }
    return { state: stackEncounterDeck(s, CHARGE, ADVANCE), reflexes: reflexes.id };
  }
  const villainPhase = (s: GameState, pick: Picker) => drive(s, endTurn(), pick);
  const take =
    (confuseMinion: boolean): Picker =>
    (s) => {
      const choice = s.pendingChoice!;
      if (choice.prompt.kind === "chooseTarget" && confuseMinion)
        return choosing({ targets: ["modok" as InstanceId] })(s);
      return choosing({ accept: [REFLEXES] })(s);
    };

  it("prevents 3 of the damage: Rhino's 4 (ATK 2, 2 boost icons) becomes 1, and the card is discarded", () => {
    const { state, reflexes } = game();
    const { state: after, events } = villainPhase(state, take(false));
    expect(inst(after, identityOf(after)).damage).toBe(1);
    expect(playerOf(after, P1).discard).toContain(reflexes);
    expect(ofType(events, "damagePrevented").map((e) => e.amount)).toEqual([3]);
  });

  it("without it the same attack deals 4", () => {
    const { state, reflexes } = game();
    const { state: after } = villainPhase(state, firstLegal);
    expect(inst(after, identityOf(after)).damage).toBe(4);
    expect(inst(after, reflexes).attachedTo).toBe(identityOf(after));
  });

  it("you may confuse a minion engaged with you", () => {
    const { state } = game();
    const { state: after } = villainPhase(state, take(true));
    expect(confusedOf(after, "modok" as InstanceId)).toBe(1);
    expect(inst(after, identityOf(after)).damage).toBe(1);
  });

  it("the confusion is optional: declining it still prevents the damage and confuses nobody", () => {
    const { state } = game();
    const { state: after } = villainPhase(state, take(false));
    expect(confusedOf(after, "modok" as InstanceId)).toBe(0);
  });

  it("with no minion engaged the damage is still prevented", () => {
    const { state } = game(false);
    const { state: after } = villainPhase(state, take(true));
    expect(inst(after, identityOf(after)).damage).toBe(1);
  });
});
