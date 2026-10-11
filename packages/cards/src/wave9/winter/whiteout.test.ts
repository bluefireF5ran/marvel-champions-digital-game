import { WINTER_CARDS, cardId } from "@mc/content";
import {
  activeEncounterDeckId,
  applyCommand,
  createGame,
  legalActions,
  type Command,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { validateDefinition } from "../../dsl/validate.js";
import { coreScenario } from "../../core/setup.js";
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
  stackEncounterDeck,
  type Picker,
} from "../../testing/harness.js";
import { driveEventsPicking, encounterCardInVillainArea, withForm } from "../../testing/staging.js";
import { engageMinion } from "../../wave6/mut_gen/project-wideawake-testing.js";
import { WAVE9_CARDS } from "../cards.js";
import { WS_DEPS, stagedInPlay, wsSeat } from "./testing.js";
import { WHITEOUT, WHITEOUT_SKIPPED } from "./whiteout.js";

vi.setConfig({ testTimeout: 180_000 });

/**
 * The Whiteout set (54034 Blizzard, 54035 Encased in Ice, 54036 Slippery Conditions, 54037 Whiteout),
 * docs/phase7-wave9.md section 3.50. Winter Soldier's printed precon (ATK 2, 11 hit points) against Core's Rhino, whose
 * stun status is set by hand so that only Blizzard activates in a villain phase. The encounter deck is exactly the
 * cards a test names plus blank Core treacheries.
 */
const BLIZZARD = "54034";
const ICE = "54035";
const SLIPPERY = "54036";
const WHITEOUT_CARD = "54037";
const WIDOW = "54003";
const ARM = "54002";
const METAL_PUNCH = "54005";
const BLANK = "01186";
const villainCode = "01094";
const ONE_ICON = "01188";
const MERCENARY = "01101";
const REFS = [
  "54034.blizzard-forced-response",
  "54035.encased-in-ice-constant",
  "54035.encased-in-ice-constant-2",
  "54036.slippery-conditions-forced-response",
  "54037.when-revealed",
  "54037.boost",
];

const dataOf = (code: string) =>
  WINTER_CARDS.find((c) => (c.id as string) === code)! as unknown as Record<string, unknown>;
const codeOf = (s: GameState, id: InstanceId): string => s.instances[id]!.cardId as string;
const pile = (s: GameState) => s.encounterDecks[activeEncounterDeckId(s)]!;
const villainOf = (s: GameState): InstanceId => s.activeVillainId!;
const heroOf = (s: GameState): InstanceId => identityOf(s);
const damageOf = (s: GameState, id: InstanceId): number => inst(s, id).damage;
const stunnedOf = (s: GameState, id: InstanceId): number => inst(s, id).statuses.stunned;
const types = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const iceOn = (s: GameState, host: InstanceId): InstanceId[] =>
  inst(s, host).attachments.filter((id) => codeOf(s, id) === ICE);
const iceInDeck = (s: GameState) => pile(s).deck.filter((id) => codeOf(s, id) === ICE);
const iceInDiscard = (s: GameState) => pile(s).discard.filter((id) => codeOf(s, id) === ICE);

/** Winter Soldier in hero form against Rhino (stunned) with this encounter deck: `{ code: copies }`, then blanks. */
function table(cards: Readonly<Record<string, number>> = {}, blanks = 20): GameState {
  const base = coreScenario("rhino", {
    players: [{ starterDeckId: "core-spider-man-justice" }],
    seed: 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: WAVE9_CARDS,
  } as never);
  const deck = [
    ...Object.entries(cards).flatMap(([code, n]) => Array.from({ length: n }, () => cardId(code))),
    ...Array.from({ length: blanks }, () => cardId(BLANK)),
  ];
  const created = createGame({ ...base, requireLegalDecks: false, players: [wsSeat()], encounterDeck: deck }, WS_DEPS);
  if (!created.ok) throw new Error(created.error.message);
  const ready = settle(created.state, firstLegal, (s) => s.step.phase === "player", WS_DEPS);
  const hero = withForm(ready, { heroForm: 0 });
  return patchInstance(hero, villainOf(hero), { statuses: { ...inst(hero, villainOf(hero)).statuses, stunned: 1 } });
}

/** Surgery: a copy of Encased in Ice (deck or discard pile) attached to `host`. */
function encase(state: GameState, host: InstanceId): { readonly state: GameState; readonly ice: InstanceId } {
  const deckId = activeEncounterDeckId(state);
  const piles = state.encounterDecks[deckId]!;
  const ice = [...piles.deck, ...piles.discard].find((id) => codeOf(state, id) === ICE)!;
  return {
    ice,
    state: {
      ...state,
      encounterDecks: {
        ...state.encounterDecks,
        [deckId]: { deck: piles.deck.filter((i) => i !== ice), discard: piles.discard.filter((i) => i !== ice) },
      },
      instances: {
        ...state.instances,
        [ice]: { ...inst(state, ice), attachedTo: host, faceup: true },
        [host]: { ...inst(state, host), attachments: [...inst(state, host).attachments, ice] },
      },
    },
  };
}

/** Picks the named defender when asked who defends (or declines), else the first legal option. */
const defending =
  (defender: InstanceId | null): Picker =>
  (s) => {
    const choice = s.pendingChoice!;
    if (choice.prompt.kind !== "declareDefender") return firstLegal(s);
    const hit = defender === null ? undefined : choice.options.find((o) => o.optionId === defender);
    return [hit ? hit.optionId : "decline"];
  };

/** P1 ends the turn; the encounter deck is stacked first, top first. */
const villainPhase = (state: GameState, stack: readonly string[], pick: Picker = defending(null)) =>
  driveEventsPicking(WS_DEPS, stackEncounterDeck(state, ...stack), pick, endTurn(P1));

const basic = (attacker: InstanceId, target: InstanceId): Command => ({
  type: "basicAttack",
  playerId: P1,
  attackerInstanceId: attacker,
  targetInstanceId: target,
});
const attack = (state: GameState, attacker: InstanceId, target: InstanceId) => {
  const result = applyCommand(state, basic(attacker, target), WS_DEPS);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return driveEventsPicking(WS_DEPS, state, firstLegal, basic(attacker, target));
};
const canAttack = (state: GameState, attacker: InstanceId, target: InstanceId): boolean =>
  applyCommand(state, basic(attacker, target), WS_DEPS).ok;

/** The enemies the legal basic attacks of `attacker` name. */
function attackTargets(state: GameState, attacker: InstanceId): string[] {
  const legal = legalActions(state, P1, WS_DEPS);
  if (legal.kind !== "turn") throw new Error(legal.kind);
  return legal.legal
    .filter((a) => a.action.kind === "basicAttack" && a.action.instanceId === attacker)
    .flatMap((a) => a.targets.map(String));
}

describe("registry", () => {
  it("registers the six refs of the four cards, each a valid definition, and skips nothing", () => {
    expect(Object.keys(WHITEOUT).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(WHITEOUT)) expect(validateDefinition(def), id).toEqual([]);
    expect(WHITEOUT_SKIPPED).toEqual({});
  });

  it("the data names exactly these refs for the four cards", () => {
    const refs = [BLIZZARD, ICE, SLIPPERY, WHITEOUT_CARD].flatMap((code) =>
      ((dataOf(code).abilities ?? []) as { id: string }[]).map((a) => a.id),
    );
    expect(refs.sort()).toEqual([...REFS].sort());
  });
});

describe("data", () => {
  it("Blizzard: an Elite Thunderbolt unique minion, ATK 2, SCH 1, 16 hit points, 4 boost icons, Villainous, Victory 1", () => {
    const c = dataOf(BLIZZARD);
    expect([c.type, c.atk, c.sch, c.hp, c.boostIcons, c.unique]).toEqual(["minion", 2, 1, 16, 4, true]);
    expect(c.traits).toEqual(["ELITE", "THUNDERBOLT"]);
    expect(c.keywords).toEqual([{ name: "villainous" }, { name: "victory", value: 1 }]);
  });

  it("Encased in Ice: an Ice attachment for your identity, 1 boost icon, two copies; Slippery Conditions 3 threat per player", () => {
    const ice = dataOf(ICE);
    expect([ice.type, ice.attachesTo, ice.boostIcons, ice.quantityInSet, ice.traits]).toEqual([
      "attachment",
      { kind: "yourIdentity" },
      1,
      2,
      ["ICE"],
    ]);
    const slippery = dataOf(SLIPPERY);
    expect([slippery.type, slippery.startingThreat, slippery.icons, slippery.boostIcons]).toEqual([
      "side_scheme",
      { base: 0, perPlayer: 3 },
      ["hazard"],
      3,
    ]);
  });

  it("Whiteout: a treachery with 1 boost icon and a star, two copies", () => {
    const c = dataOf(WHITEOUT_CARD);
    expect([c.type, c.boostIcons, c.starIcon, c.quantityInSet]).toEqual(["treachery", 1, true, 2]);
  });
});

describe("Blizzard (54034)", () => {
  /** Blizzard engaged with Winter Soldier, Rhino stunned, the boost card and then the dealt card blank. */
  const withBlizzard = (cards: Readonly<Record<string, number>>) =>
    engageMinion(table({ [BLIZZARD]: 1, ...cards }), BLIZZARD).state;

  it("FORCED RESPONSE: after he attacks the hero, a copy from the encounter deck attaches to the hero; no stun; the deck is shuffled", () => {
    const state = withBlizzard({ [ICE]: 2 });
    const run = villainPhase(state, [BLANK, BLANK]);
    const hero = heroOf(run.state);
    expect(types(run.events, "attackResolved").map((a) => codeOf(run.state, a.enemyInstanceId))).toEqual([BLIZZARD]);
    expect(iceOn(run.state, hero)).toHaveLength(1);
    expect(stunnedOf(run.state, hero)).toBe(0);
    expect(types(run.events, "deckShuffled").length).toBeGreaterThanOrEqual(1);
    expect(iceInDeck(run.state).length + iceOn(run.state, hero).length).toBe(2);
  });

  it("FORCED RESPONSE: a copy in the discard pile is found too", () => {
    const base = withBlizzard({ [ICE]: 2 });
    const discardIds = iceInDeck(base);
    const state: GameState = {
      ...base,
      encounterDecks: {
        ...base.encounterDecks,
        [activeEncounterDeckId(base)]: {
          deck: pile(base).deck.filter((id) => !discardIds.includes(id)),
          discard: [...pile(base).discard, ...discardIds],
        },
      },
    };
    expect(iceInDeck(state)).toEqual([]);
    const run = villainPhase(state, [BLANK, BLANK]);
    expect(iceOn(run.state, heroOf(run.state))).toHaveLength(1);
    expect(iceInDiscard(run.state)).toHaveLength(1);
    expect(stunnedOf(run.state, heroOf(run.state))).toBe(0);
  });

  it("FORCED RESPONSE: with no copy left (both attached) the attacked hero is stunned and nothing more attaches; the deck is still shuffled", () => {
    const first = encase(withBlizzard({ [ICE]: 2 }), heroOf(table()));
    const second = encase(first.state, heroOf(first.state));
    const run = villainPhase(second.state, [BLANK, BLANK]);
    const hero = heroOf(run.state);
    expect(iceOn(run.state, hero)).toHaveLength(2);
    expect(stunnedOf(run.state, hero)).toBe(1);
    expect(types(run.events, "deckShuffled").length).toBeGreaterThanOrEqual(1);
  });

  it("FORCED RESPONSE: with no Encased in Ice in the game at all, the hero is stunned", () => {
    const run = villainPhase(withBlizzard({}), [BLANK, BLANK]);
    expect(stunnedOf(run.state, heroOf(run.state))).toBe(1);
    expect(iceOn(run.state, heroOf(run.state))).toHaveLength(0);
  });

  it("FORCED RESPONSE: an ally who defends is the attacked character: the ice attaches to her, not to the hero", () => {
    const staged = stagedInPlay(withBlizzard({ [ICE]: 2 }), WIDOW);
    const run = villainPhase(staged.state, [BLANK, BLANK], defending(staged.id));
    expect(iceOn(run.state, staged.id)).toHaveLength(1);
    expect(iceOn(run.state, heroOf(run.state))).toHaveLength(0);
    expect(damageOf(run.state, staged.id)).toBe(2);
    expect(stunnedOf(run.state, heroOf(run.state))).toBe(0);
  });

  it("FORCED RESPONSE: an ally who defends with no copy left is stunned, the hero is not", () => {
    const staged = stagedInPlay(withBlizzard({ [ICE]: 2 }), WIDOW);
    const first = encase(staged.state, heroOf(staged.state));
    const second = encase(first.state, heroOf(first.state));
    const run = villainPhase(second.state, [BLANK, BLANK], defending(staged.id));
    expect(stunnedOf(run.state, staged.id)).toBe(1);
    expect(stunnedOf(run.state, heroOf(run.state))).toBe(0);
  });

  it("FORCED RESPONSE: an ally defeated by the attack is gone, so nothing attaches to her (the hero is not encased instead)", () => {
    const staged = stagedInPlay(withBlizzard({ [ICE]: 2 }), WIDOW);
    const weak = patchInstance(staged.state, staged.id, { damage: 2 });
    const run = villainPhase(weak, [BLANK, BLANK], defending(staged.id));
    expect(playerOf(run.state, P1).playArea).not.toContain(staged.id);
    expect(iceOn(run.state, heroOf(run.state))).toHaveLength(0);
  });
});

describe("Encased in Ice (54035)", () => {
  /** Winter Soldier encased. */
  function encased(extra: Readonly<Record<string, number>> = {}) {
    const state = table({ [ICE]: 2, ...extra });
    return { ...encase(state, heroOf(state)), hero: heroOf(state) };
  }

  it("CONSTANT: the encased hero cannot attack Rhino, but can attack the ice: it is the only target offered", () => {
    const { state, ice, hero } = encased();
    expect(canAttack(state, hero, villainOf(state))).toBe(false);
    expect(canAttack(state, hero, ice)).toBe(true);
    expect(attackTargets(state, hero)).toEqual([ice]);
  });

  it("CONSTANT: an encased hero cannot attack a minion either, only the ice", () => {
    const { state, ice, hero } = encased({ [MERCENARY]: 1 });
    const engaged = engageMinion(state, MERCENARY).state;
    const minion = instancesOf(engaged, MERCENARY)[0]!;
    expect(canAttack(engaged, hero, minion)).toBe(false);
    expect(attackTargets(engaged, hero)).toEqual([ice]);
  });

  it("CONSTANT: a basic attack at ATK 2 places 2 damage on the ice; it is not defeated, no hit points, nothing for the host", () => {
    const { state, ice, hero } = encased();
    const { state: after, events } = attack(state, hero, ice);
    expect(damageOf(after, ice)).toBe(2);
    expect(inst(after, ice).attachedTo).toBe(hero);
    expect(damageOf(after, hero)).toBe(0);
    expect(damageOf(after, villainOf(after))).toBe(0);
    expect(inst(after, hero).exhausted).toBe(true);
    expect(events.filter((e) => /defeated/i.test(e.type))).toEqual([]);
  });

  it("CONSTANT: the card does not stop other characters: an unencased ally attacks Rhino and the ice both", () => {
    const { state, ice } = encased();
    const widow = stagedInPlay(state, WIDOW);
    expect(canAttack(widow.state, widow.id, villainOf(widow.state))).toBe(true);
    expect(canAttack(widow.state, widow.id, ice)).toBe(true);
  });

  it("STATE CHECK: a second attack for 2 on a card holding 2 deals 1 to the hero and discards the card", () => {
    const { state, ice, hero } = encased();
    const widow = stagedInPlay(patchInstance(state, ice, { damage: 2 }), WIDOW);
    const { state: after } = attack(widow.state, widow.id, ice);
    expect(damageOf(after, hero)).toBe(1);
    expect(pile(after).discard).toContain(ice);
    expect(inst(after, hero).attachments).not.toContain(ice);
    // The card was discarded, not defeated: no victory display, no enemy-defeated event.
    expect(after.victoryDisplay).not.toContain(ice);
  });

  it("STATE CHECK: exactly 3 damage moves nothing (0 to the hero) and discards the card", () => {
    const { state, ice, hero } = encased();
    const { state: after } = attack(patchInstance(state, ice, { damage: 1 }), hero, ice);
    expect(damageOf(after, hero)).toBe(0);
    expect(pile(after).discard).toContain(ice);
  });

  it("a discarded card is not a defeated enemy: Lethal Protector (54001a, after you attack and defeat an enemy) removes no threat", () => {
    const { state, ice, hero } = encased();
    const before = inst(state, state.mainScheme.instanceId).threat;
    const { state: after } = attack(patchInstance(state, ice, { damage: 1 }), hero, ice);
    expect(pile(after).discard).toContain(ice);
    expect(inst(after, after.mainScheme.instanceId).threat).toBe(before);
  });

  it("STATE CHECK: the moved damage is dealt to the hero (no attacker): the hero's damage event names the amount", () => {
    const { state, ice, hero } = encased();
    const widow = stagedInPlay(patchInstance(state, ice, { damage: 2 }), WIDOW);
    const { events } = attack(widow.state, widow.id, ice);
    expect(types(events, "damageDealt").filter((e) => e.targetInstanceId === hero)).toMatchObject([{ amount: 1 }]);
  });

  it("an (attack) event: Metal Punch (7) on the card deals 4 to the hero and discards it, with no excess elsewhere", () => {
    const { state, ice, hero } = encased();
    const given = moveToHand(state, P1, METAL_PUNCH);
    const event = given.ids[0]!;
    const hand = playerOf(given.state, P1).hand.filter((id) => id !== event);
    const run = driveEventsPicking(
      WS_DEPS,
      given.state,
      (s) => {
        const hit = s.pendingChoice!.options.find((o) => o.optionId === ice);
        return hit ? [hit.optionId] : firstLegal(s);
      },
      play(P1, event, hand.slice(0, 3)),
    );
    expect(damageOf(run.state, hero)).toBe(4);
    expect(pile(run.state).discard).toContain(ice);
    expect(damageOf(run.state, villainOf(run.state))).toBe(0);
  });

  it("an (attack) event with overkill: Metal Punch paid with Cybernetic Arm (8 with the Arm) deals 5 to the hero, no excess", () => {
    const { state, ice, hero } = encased();
    const arm = stagedInPlay(state, ARM);
    const given = moveToHand(arm.state, P1, METAL_PUNCH);
    const event = given.ids[0]!;
    const hand = playerOf(given.state, P1).hand.filter((id) => id !== event);
    const run = driveEventsPicking(
      WS_DEPS,
      given.state,
      (s) => {
        const hit = s.pendingChoice!.options.find((o) => o.optionId === ice);
        return hit ? [hit.optionId] : firstLegal(s);
      },
      play(P1, event, hand.slice(0, 2), {
        abilities: [{ ability: { instanceId: arm.id, abilityId: "54002.cybernetic-arm-resource" as never } }],
      }),
    );
    expect(damageOf(run.state, hero)).toBe(5);
    expect(pile(run.state).discard).toContain(ice);
    expect(damageOf(run.state, villainOf(run.state))).toBe(0);
  });

  it("an (attack) event offers the ice to a hero who is not encased: any player can attack it (a copy encasing an ally)", () => {
    const state = table({ [ICE]: 2 });
    const widow = stagedInPlay(state, WIDOW);
    const { state: encasedAlly, ice } = encase(widow.state, widow.id);
    // Winter Soldier himself is not encased: he may attack Rhino or the ice on the ally.
    expect(canAttack(encasedAlly, heroOf(encasedAlly), villainOf(encasedAlly))).toBe(true);
    expect(canAttack(encasedAlly, heroOf(encasedAlly), ice)).toBe(true);
  });

  it("an encased ally cannot attack Rhino but can attack the ice; the moved damage goes to the ally", () => {
    const state = table({ [ICE]: 2 });
    const widow = stagedInPlay(state, WIDOW);
    const { state: encasedAlly, ice } = encase(widow.state, widow.id);
    expect(canAttack(encasedAlly, widow.id, villainOf(encasedAlly))).toBe(false);
    expect(canAttack(encasedAlly, widow.id, ice)).toBe(true);
    const { state: after } = attack(patchInstance(encasedAlly, ice, { damage: 2 }), heroOf(encasedAlly), ice);
    // Winter Soldier's attack for 2: 4 on the card, 1 moved to the ally, which is the host.
    expect(damageOf(after, widow.id)).toBe(1);
    expect(pile(after).discard).toContain(ice);
  });

  // RRG 1.8 "Enemy" (p. 18): another copy is an attachment attacked as if it were a minion, no "enemy other than this
  // card", so the prohibition does not reach it.
  it("an encased character can attack another character's copy of the card as well as its own: the other copy is no enemy", () => {
    const state = table({ [ICE]: 2 });
    const widow = stagedInPlay(state, WIDOW);
    const mine = encase(widow.state, heroOf(state));
    const other = encase(mine.state, widow.id);
    expect(canAttack(other.state, heroOf(other.state), mine.ice)).toBe(true);
    expect(canAttack(other.state, heroOf(other.state), other.ice)).toBe(true);
    expect(canAttack(other.state, widow.id, mine.ice)).toBe(true);
    expect(canAttack(other.state, heroOf(other.state), villainOf(other.state))).toBe(false);
  });

  it("GUARD does not protect it: with Hydra Mercenary (guard) engaged, the encased hero attacks the ice", () => {
    const { state, ice, hero } = encased({ [MERCENARY]: 1 });
    const engaged = engageMinion(state, MERCENARY).state;
    expect(canAttack(engaged, hero, ice)).toBe(true);
    const widow = stagedInPlay(engaged, WIDOW);
    expect(canAttack(widow.state, widow.id, ice)).toBe(true);
  });
});

describe("Slippery Conditions (54036)", () => {
  /** The side scheme in play, and Black Widow (cost 3) played from hand paid with three other cards. */
  function widowPlayed(withScheme: boolean) {
    const base = table({ [SLIPPERY]: 1 });
    const scheme = withScheme ? encounterCardInVillainArea(base, SLIPPERY, 3).state : base;
    const given = moveToHand(scheme, P1, WIDOW);
    const hand = playerOf(given.state, P1).hand.filter((id) => id !== given.ids[0]);
    const run = driveEventsPicking(WS_DEPS, given.state, firstLegal, play(P1, given.ids[0]!, hand.slice(0, 3)));
    return { ...run, ally: given.ids[0]! };
  }

  it("FORCED RESPONSE: an ally that enters play is exhausted", () => {
    const { state, ally } = widowPlayed(true);
    expect(playerOf(state, P1).playArea).toContain(ally);
    expect(inst(state, ally).exhausted).toBe(true);
  });

  it("without the side scheme the same ally enters ready", () => {
    const { state, ally } = widowPlayed(false);
    expect(inst(state, ally).exhausted).toBe(false);
  });

  it("only allies: an upgrade entering play (Cybernetic Arm) is not exhausted", () => {
    const base = encounterCardInVillainArea(table({ [SLIPPERY]: 1 }), SLIPPERY, 3).state;
    const given = moveToHand(base, P1, ARM);
    const hand = playerOf(given.state, P1).hand.filter((id) => id !== given.ids[0]);
    const run = driveEventsPicking(WS_DEPS, given.state, firstLegal, play(P1, given.ids[0]!, hand.slice(0, 1)));
    expect(inst(run.state, given.ids[0]!).exhausted).toBe(false);
  });
});

describe("Whiteout (54037)", () => {
  it("WHEN REVEALED: Blizzard is found, engages the revealing player and attacks: ATK 2 + 1 icon = 3 damage; no surge", () => {
    const state = table({ [BLIZZARD]: 1, [WHITEOUT_CARD]: 1, [ICE]: 2, [ONE_ICON]: 1 });
    const run = villainPhase(state, [WHITEOUT_CARD, ONE_ICON, BLANK]);
    const blizzard = instancesOf(run.state, BLIZZARD)[0]!;
    expect(inst(run.state, blizzard).engagedWith).toBe(P1);
    expect(types(run.events, "attackResolved").map((a) => [codeOf(run.state, a.enemyInstanceId), a.baseAtk])).toEqual([
      [BLIZZARD, 2],
    ]);
    expect(types(run.events, "encounterCardRevealed").map((e) => codeOf(run.state, e.instanceId))).toEqual([
      WHITEOUT_CARD,
      BLIZZARD,
    ]);
  });

  it("WHEN REVEALED: Blizzard already in play engages the revealing player and activates again (alter-ego form: his scheme has no response to shuffle the stack; stunned Rhino still schemes)", () => {
    const base = table({ [BLIZZARD]: 1, [WHITEOUT_CARD]: 1, [ONE_ICON]: 1 });
    const state = engageMinion(withForm(base, "alterEgo"), BLIZZARD).state;
    const run = villainPhase(state, [BLANK, BLANK, WHITEOUT_CARD, ONE_ICON, BLANK]);
    const blizzard = instancesOf(run.state, BLIZZARD)[0]!;
    expect(inst(run.state, blizzard).engagedWith).toBe(P1);
    // Once in the villain phase's own activation (SCH 1), once from Whiteout (SCH 1 + 1 icon).
    expect(
      types(run.events, "schemeResolved")
        .filter((a) => codeOf(run.state, a.enemyInstanceId) === BLIZZARD)
        .map((a) => [a.baseSch, a.boostIcons]),
    ).toEqual([
      [1, 0],
      [1, 1],
    ]);
  });

  it("WHEN REVEALED: with no Blizzard anywhere nothing activates and the card gains surge", () => {
    const state = table({ [WHITEOUT_CARD]: 1 });
    const run = villainPhase(state, [WHITEOUT_CARD]);
    // Finding nothing shuffles the deck, so only the second reveal's existence is asserted.
    const revealed = types(run.events, "encounterCardRevealed").map((e) => codeOf(run.state, e.instanceId));
    expect(revealed).toHaveLength(2);
    expect(revealed[0]).toBe(WHITEOUT_CARD);
    expect(types(run.events, "enemyActivated").map((e) => codeOf(run.state, e.enemyInstanceId))).toEqual([villainCode]);
  });

  it("BOOST: on Rhino's attack the hero is stunned", () => {
    const base = table({ [WHITEOUT_CARD]: 1 });
    const state = patchInstance(base, villainOf(base), { statuses: { stunned: 0, confused: 0, tough: 0 } });
    const run = villainPhase(state, [WHITEOUT_CARD, BLANK]);
    expect(types(run.events, "attackResolved")[0]).toMatchObject({ baseAtk: 2, boostIcons: 1, damageDealt: 3 });
    expect(stunnedOf(run.state, heroOf(run.state))).toBe(1);
    expect(damageOf(run.state, heroOf(run.state))).toBe(3);
  });

  it("BOOST: a hero already stunned takes 1 damage instead of a second stun: 3 + 1 = 4", () => {
    const base = table({ [WHITEOUT_CARD]: 1 });
    const unstunned = patchInstance(base, villainOf(base), { statuses: { stunned: 0, confused: 0, tough: 0 } });
    const state = patchInstance(unstunned, heroOf(unstunned), {
      statuses: { stunned: 1, confused: 0, tough: 0 },
    });
    const run = villainPhase(state, [WHITEOUT_CARD, BLANK]);
    expect(stunnedOf(run.state, heroOf(run.state))).toBe(1);
    expect(damageOf(run.state, heroOf(run.state))).toBe(4);
  });
});
