/**
 * `InPlayCostPick.combined`: a cost whose picks must together exceed a number (docs/phase7-wave9.md §3.49). Synthetic
 * cards shaped like Tech-Pac (`falcon` 53040): "Attached enemy gets +1 SCH. Action: Exhaust any number of characters
 * you control with a combined THW greater than attached enemy's SCH → discard this card."
 *
 * Sources: RRG 1.8 "Cost" (p. 13-14: "A cost requiring 'any number' … of game elements requires a minimum of one";
 * costs are paid with cards the player controls), "Cost Arrow Icon" (p. 14: the text before the arrow "must be paid
 * and/or resolved in full"), "Initiating Abilities" (p. 24, steps 3 and 5), "Dash (Value)" (p. 15).
 */
import { describe, expect, it } from "vitest";
import type { Command, CostChoices } from "./commands.js";
import { applyCommand } from "./engine.js";
import type { InstanceId } from "./ids.js";
import { legalActions } from "./legal.js";
import { characterProfile, getInstance, mustInstance, mustPlayer } from "./query.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommands } from "./testing/drive.js";
import { stubAlly, stubAttachment, stubMinion, stubTreachery } from "./testing/fixtures.js";
import { copiesOf, gameAtFirstTurn, minionEngagedWith, P1, P2, playerCardIntoPlay } from "./testing/wave3.js";

const hostOfSelf = { kind: "each", query: { categories: ["enemy"], hostOfSelf: true } } as const;
/** "Action: Exhaust any number of characters you control with a combined THW greater than attached enemy's SCH → discard this card." */
const PACK_ACTION = stubAbility("pack.action", {
  trigger: { kind: "action" },
  cost: {
    exhaustCards: {
      slot: "exhausted",
      query: { categories: ["identity", "ally"] },
      min: 1,
      combined: { stat: "thw", moreThan: { kind: "stat", of: hostOfSelf, stat: "sch" } },
    },
  },
  effects: [{ kind: "discardFromPlay", target: { kind: "self" } }],
});
const PACK = stubAttachment({
  id: "pack",
  attachesTo: { kind: "minion" },
  statModifiers: { sch: 1 },
  abilities: [PACK_ACTION.ref],
});
const TINKER = stubMinion({ id: "tinker", atk: 1, sch: 2, hp: 9 });
/** THW 1. */
const SCOUT = stubAlly({ id: "scout", cost: 0, atk: 1, thw: 1, hp: 3 });
/** THW "—". */
const BRUISER = stubAlly({ id: "bruiser", cost: 0, atk: 3, thw: null, hp: 3 });
const FILLER = stubTreachery({ id: "filler", boostIcons: 0 });
const deps = depsOf(PACK_ACTION);

interface Table {
  readonly state: GameState;
  readonly pack: InstanceId;
  readonly tinker: InstanceId;
  readonly hero: InstanceId;
}

/** The Tinker engaged with P1 with the Pack on it: SCH 2 + 1 = 3. The hero has THW 2. */
function table(players: 1 | 2 = 1): Table {
  const start = gameAtFirstTurn({
    cards: [PACK, TINKER, SCOUT, BRUISER, FILLER],
    deps,
    players,
    deck: [SCOUT.id, SCOUT.id, SCOUT.id, BRUISER.id],
    encounter: [PACK.id, TINKER.id, ...copiesOf(FILLER.id, 20)],
  });
  const tinker = minionEngagedWith(start, TINKER.id);
  // Surgery: the Pack out of the encounter deck and onto the Tinker.
  const deckId = Object.keys(tinker.state.encounterDecks)[0] as keyof typeof tinker.state.encounterDecks;
  const piles = tinker.state.encounterDecks[deckId]!;
  const pack = piles.deck.find((id) => tinker.state.instances[id]?.cardId === PACK.id)!;
  const state: GameState = {
    ...tinker.state,
    players: tinker.state.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" as const } })),
    encounterDecks: {
      ...tinker.state.encounterDecks,
      [deckId]: { ...piles, deck: piles.deck.filter((x) => x !== pack) },
    },
    instances: {
      ...tinker.state.instances,
      [pack]: { ...mustInstance(tinker.state, pack), attachedTo: tinker.id, faceup: true },
      [tinker.id]: { ...mustInstance(tinker.state, tinker.id), attachments: [pack] },
    },
  };
  return { state, pack, tinker: tinker.id, hero: mustPlayer(state, P1).identity.instanceId };
}
const withAllies = (t: Table, cards: readonly { readonly id: string }[], player = P1) => {
  let state = t.state;
  const ids: InstanceId[] = [];
  for (const card of cards) {
    const placed = playerCardIntoPlay(state, card.id as never, player);
    state = placed.state;
    ids.push(placed.id);
  }
  return { state, ids };
};
const use = (t: Table, costChoices?: CostChoices): Command => ({
  type: "useAbility",
  playerId: P1,
  cardInstanceId: t.pack,
  abilityId: PACK_ACTION.ref.id,
  payment: [],
  ...(costChoices ? { costChoices } : {}),
});
function refusal(state: GameState, command: Command): string {
  const result = applyCommand(state, command, deps);
  if (result.ok) throw new Error("the command was accepted");
  return result.error.code;
}
function example(state: GameState, card: InstanceId): Command | undefined {
  const result = legalActions(state, P1, deps);
  if (result.kind !== "turn") throw new Error(`not P1's turn: ${result.kind}`);
  return result.legal.find((a) => a.action.kind === "useAbility" && a.action.instanceId === card)?.example;
}
const exhausted = (state: GameState, id: InstanceId) => mustInstance(state, id).exhausted;
const inPlay = (state: GameState, id: InstanceId) => getInstance(state, id)?.attachedTo != null;

describe("a cost whose picks must have a combined stat greater than a number (InPlayCostPick.combined)", () => {
  it("the fixture: the attached enemy's SCH is 3 with the card's own +1, the hero's THW 2", () => {
    const t = table();
    expect(characterProfile(t.state, t.tinker, deps)?.sch).toBe(3);
    expect(characterProfile(t.state, t.hero, deps)?.thw).toBe(2);
  });

  it("a combined THW of 4 (2 + 1 + 1) pays: the three are exhausted and the card is discarded", () => {
    const t = table();
    const allies = withAllies(t, [SCOUT, SCOUT]);
    const { state } = runCommands(allies.state, deps, use(t, { exhausted: [t.hero, ...allies.ids] }));
    expect([t.hero, ...allies.ids].map((id) => exhausted(state, id))).toEqual([true, true, true]);
    expect(inPlay(state, t.pack)).toBe(false);
    expect(characterProfile(state, t.tinker, deps)?.sch).toBe(2);
  });

  it("a combined THW of 3 (2 + 1) does not: equal is not greater, nothing is exhausted, the card stays", () => {
    const t = table();
    const allies = withAllies(t, [SCOUT, SCOUT]);
    expect(refusal(allies.state, use(t, { exhausted: [t.hero, allies.ids[0]!] }))).toBe("invalid_choice");
    expect(exhausted(allies.state, t.hero)).toBe(false);
    expect(inPlay(allies.state, t.pack)).toBe(true);
  });

  it("more than is needed is legal: 2 + 1 + 1 + 1 = 5 pays", () => {
    const t = table();
    const allies = withAllies(t, [SCOUT, SCOUT, SCOUT]);
    const { state } = runCommands(allies.state, deps, use(t, { exhausted: [t.hero, ...allies.ids] }));
    expect(inPlay(state, t.pack)).toBe(false);
  });

  it("not payable while everything that could pay totals 3 or less: not offered, and refused as no_valid_target", () => {
    const t = table();
    // The hero (2) and one THW 1 ally; a '—' THW adds 0.
    const allies = withAllies(t, [SCOUT, BRUISER]);
    expect(example(allies.state, t.pack)).toBeUndefined();
    expect(refusal(allies.state, use(t, { exhausted: [t.hero, ...allies.ids] }))).toBe("no_valid_target");
    // An exhausted character cannot pay: 2 allies but the hero exhausted leaves 2.
    const more = withAllies(t, [SCOUT, SCOUT]);
    const tired: GameState = {
      ...more.state,
      instances: { ...more.state.instances, [t.hero]: { ...mustInstance(more.state, t.hero), exhausted: true } },
    };
    expect(example(tired, t.pack)).toBeUndefined();
  });

  it("legalActions' default pick is the fewest cards that exceed it, highest first, and that command is accepted", () => {
    const t = table();
    const allies = withAllies(t, [SCOUT, SCOUT, SCOUT]);
    const command = example(allies.state, t.pack);
    expect(command).toMatchObject({ costChoices: { exhausted: [t.hero, allies.ids[0], allies.ids[1]] } });
    const { state } = runCommands(allies.state, deps, command!);
    expect(inPlay(state, t.pack)).toBe(false);
    expect(exhausted(state, allies.ids[2]!)).toBe(false);
  });

  it("another player's characters do not pay (RRG 1.8 'Cost', p. 14)", () => {
    const t = table(2);
    const mine = withAllies(t, [SCOUT]);
    const theirs = withAllies({ ...t, state: mine.state }, [SCOUT], P2);
    expect(example(theirs.state, t.pack)).toBeUndefined();
    expect(refusal(theirs.state, use(t, { exhausted: [t.hero, ...mine.ids, ...theirs.ids] }))).toBe("no_valid_target");
  });
});
