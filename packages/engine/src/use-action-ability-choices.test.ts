/**
 * `EffectSpec useActionAbility` (#890 item 6), the PR #903 review's cases. Out of turn: a forced response to the
 * end-of-player-phase ready step (`endPhaseCardsReadied`), with the player in hero form.
 *
 * - The payment is an ability's: a resource "for an upgrade ability" (`generatesForAbility`, #890 item 3, With Great
 *   Firepower's shape) pays an upgrade's Action when it is the only resource there is.
 * - The Action's own cost picks are the player's: with two allies to discard one is asked for, and a cost of "up to 2"
 *   takes what the player picks, not its minimum.
 * - Only printed Actions: one another card grants (`RuleSpec gainsAbility`) is not offered.
 * - "Action", "Hero Action" and "Alter-Ego Action" may all be picked, each only in its own form (the designer, PR #903).
 */

import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps } from "./abilities.js";
import { replay, startSession } from "./engine.js";
import type { InstanceId } from "./ids.js";
import { mustInstance, mustPlayer } from "./query.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubAlly, stubSupport, stubUpgrade } from "./testing/fixtures.js";
import { defaultPick } from "./testing/scenario.js";
import { gameAtFirstTurn, P1, playerCardIntoPlay } from "./testing/wave3.js";

const counter = (type: string) =>
  ({ kind: "addCounters", target: { kind: "self" }, counterType: type, amount: { kind: "const", value: 1 } }) as const;

const ARMOR = stubAbility("armor.response", {
  trigger: { kind: "response", forced: true, on: { on: "endPhaseCardsReadied", playerIs: "controller" } },
  effects: [{ kind: "useActionAbility", player: { kind: "controller" } }],
} satisfies AbilityDefinition);
const ARMOR_CARD = stubSupport({ id: "armor", cost: 0, abilities: [ARMOR.ref] });

/** With Great Firepower's shape: "Resource: exhaust this → [wild] for an upgrade ability". */
const FIREPOWER_RESOURCE = stubAbility("firepower.resource", {
  trigger: { kind: "resource" },
  cost: { exhaustSelf: true },
  generates: { wild: 1 },
  generatesFor: { categories: ["upgrade"] },
  generatesForAbility: true,
  effects: [],
} satisfies AbilityDefinition);
const FIREPOWER = stubSupport({ id: "firepower", cost: 0, abilities: [FIREPOWER_RESOURCE.ref] });
/** "Action: Spend 1 resource → place 1 counter here." */
const GUN_ACTION = stubAbility("gun.action", {
  trigger: { kind: "action" },
  cost: { resources: 1 },
  effects: [counter("shot")],
} satisfies AbilityDefinition);
const GUN = stubUpgrade({ id: "gun", cost: 0, abilities: [GUN_ACTION.ref] });

/** "Action: Discard an ally you control → place 1 counter here." */
const RECRUIT_ACTION = stubAbility("recruit.action", {
  trigger: { kind: "action" },
  cost: { discardCards: { slot: "discarded", query: { categories: ["ally"], controller: "you" }, min: 1, max: 1 } },
  effects: [counter("recruited")],
} satisfies AbilityDefinition);
const RECRUIT = stubSupport({ id: "recruit", cost: 0, abilities: [RECRUIT_ACTION.ref] });
/** "Action: Exhaust up to 2 allies you control → place 1 counter here." */
const VOLLEY_ACTION = stubAbility("volley.action", {
  trigger: { kind: "action" },
  cost: { exhaustCards: { slot: "exhausted", query: { categories: ["ally"], controller: "you" }, min: 1, max: 2 } },
  effects: [counter("volley")],
} satisfies AbilityDefinition);
const VOLLEY = stubSupport({ id: "volley", cost: 0, abilities: [VOLLEY_ACTION.ref] });
const ALLY = stubAlly({ id: "ally", cost: 0, atk: 1, thw: 1, hp: 3 });

/** "Alter-Ego Action: place 1 counter here." */
const NAP_ACTION = stubAbility("nap.action", {
  trigger: { kind: "action", form: "alterEgo" },
  effects: [counter("nap")],
} satisfies AbilityDefinition);
const NAP = stubSupport({ id: "nap", cost: 0, abilities: [NAP_ACTION.ref] });
/** "Hero Action: place 1 counter here." */
const PUNCH_ACTION = stubAbility("punch.action", {
  trigger: { kind: "action", form: "hero" },
  effects: [counter("punch")],
} satisfies AbilityDefinition);
const PUNCH = stubSupport({ id: "punch", cost: 0, abilities: [PUNCH_ACTION.ref] });
/** A support granting the plain gun Action to the punch support: gained, not printed there. */
const GIFT_CONSTANT = stubAbility("gift.constant", {
  trigger: { kind: "constant", rules: [{ kind: "gainsAbility", abilityId: GUN_ACTION.ref.id, to: { name: "punch" } }] },
  effects: [],
} satisfies AbilityDefinition);
const GIFT = stubSupport({ id: "gift", cost: 0, abilities: [GIFT_CONSTANT.ref] });

/** A support with two "Resource: exhaust this support → generate 1" abilities: either pays, both cannot. */
const TWIN_A = stubAbility("twin.resource-a", {
  trigger: { kind: "resource" },
  cost: { exhaustSelf: true },
  generates: { wild: 1 },
  effects: [],
} satisfies AbilityDefinition);
const TWIN_B = stubAbility("twin.resource-b", {
  trigger: { kind: "resource" },
  cost: { exhaustSelf: true },
  generates: { wild: 1 },
  effects: [],
} satisfies AbilityDefinition);
const TWIN = stubSupport({ id: "twin", cost: 0, abilities: [TWIN_A.ref, TWIN_B.ref] });
/** Power Man's shape (21012): "Action: Remove up to 2 chi counters from this card → …". */
const CHI_ACTION = stubAbility("chi.action", {
  trigger: { kind: "action" },
  cost: { spendCounters: { counterType: "chi", amount: 2, upTo: true, bind: "n" } },
  effects: [counter("focus")],
} satisfies AbilityDefinition);
const CHI = stubSupport({ id: "chi", cost: 0, abilities: [CHI_ACTION.ref] });

const CARDS = [ARMOR_CARD, FIREPOWER, GUN, RECRUIT, VOLLEY, ALLY, NAP, PUNCH, GIFT, TWIN, CHI];
const deps: EngineDeps = depsOf(
  ARMOR,
  FIREPOWER_RESOURCE,
  GUN_ACTION,
  RECRUIT_ACTION,
  VOLLEY_ACTION,
  NAP_ACTION,
  PUNCH_ACTION,
  GIFT_CONSTANT,
  TWIN_A,
  TWIN_B,
  CHI_ACTION,
);

/** P1 in hero form with Armor and `cards` in play, the hand and deck emptied when `noHand`. */
function start(cards: readonly string[], noHand = false): { state: GameState; ids: Record<string, InstanceId[]> } {
  const base = gameAtFirstTurn({ cards: CARDS, deps, deck: CARDS.flatMap((c) => [c.id, c.id, c.id]) });
  let state: GameState = {
    ...base,
    players: base.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" as const } })),
  };
  const ids: Record<string, InstanceId[]> = {};
  for (const id of ["armor", ...cards]) {
    const put = playerCardIntoPlay(state, id as never, P1);
    state = put.state;
    (ids[id] ??= []).push(put.id);
  }
  if (noHand)
    state = { ...state, players: state.players.map((p) => (p.playerId === P1 ? { ...p, hand: [], deck: [] } : p)) };
  return { state, ids };
}

/** Plays the turn's end, picking the Action named `ability`, then answering with `answers` by prompt kind. */
function endTurnUsing(
  state: GameState,
  ability: string,
  answers: {
    cards?: (options: readonly string[]) => readonly string[];
    number?: (options: readonly string[]) => readonly string[];
  } = {},
) {
  const offered: string[][] = [];
  const pick = (s: GameState): readonly string[] => {
    const choice = s.pendingChoice!;
    const ids = choice.options.map((o) => o.optionId);
    if (choice.prompt.kind === "chooseOption" && ids.some((id) => id.includes("|"))) {
      offered.push(ids);
      const wanted = ids.find((id) => id.endsWith(`|${ability}`));
      return wanted ? [wanted] : [];
    }
    if (choice.prompt.kind === "chooseCards" && answers.cards) return answers.cards(ids);
    if (choice.prompt.kind === "chooseNumber" && answers.number) return answers.number(ids);
    if (choice.prompt.kind === "spendResources") return [ids[0]!];
    return defaultPick(s);
  };
  const driven = driveSession(startSession(state), deps, [{ type: "endTurn", playerId: P1 }], pick);
  const replayed = replay(driven.session.log, deps);
  if (!replayed.ok) throw new Error(replayed.error.message);
  return { state: driven.session.state, offered };
}

describe("useActionAbility: the PR #903 review's cases (#890 item 6)", () => {
  it("a resource for an upgrade ability is the only way to pay, and it pays the upgrade's Action", () => {
    const { state, ids } = start(["firepower", "gun"], true);
    expect(mustPlayer(state, P1).hand).toEqual([]);
    const after = endTurnUsing(state, GUN_ACTION.ref.id);
    expect(after.offered[0]?.some((id) => id.endsWith(`|${GUN_ACTION.ref.id}`))).toBe(true);
    expect(mustInstance(after.state, ids.gun![0]!).counters.shot).toBe(1);
  });

  it("with two allies to discard, the player is asked which, and that one goes", () => {
    const { state, ids } = start(["recruit", "ally", "ally"]);
    const [first, second] = ids.ally!;
    const after = endTurnUsing(state, RECRUIT_ACTION.ref.id, {
      cards: (options) => options.filter((o) => o === second),
    });
    expect(mustInstance(after.state, ids.recruit![0]!).counters.recruited).toBe(1);
    expect(mustPlayer(after.state, P1).discard).toContain(second);
    expect(mustPlayer(after.state, P1).playArea).toContain(first);
  });

  it("a cost of up to 2 takes what the player picks, not its minimum", () => {
    const { state, ids } = start(["volley", "ally", "ally"]);
    const after = endTurnUsing(state, VOLLEY_ACTION.ref.id, { cards: (options) => options.slice(0, 2) });
    expect(mustInstance(after.state, ids.volley![0]!).counters.volley).toBe(1);
    for (const ally of ids.ally!) expect(mustInstance(after.state, ally).exhausted).toBe(true);
  });

  it("a Hero Action is offered in hero form, an Alter-Ego Action is not, and a granted Action is not", () => {
    const { state } = start(["punch", "nap", "gift"]);
    const after = endTurnUsing(state, PUNCH_ACTION.ref.id);
    const offered = after.offered[0] ?? [];
    expect(offered.some((id) => id.endsWith(`|${PUNCH_ACTION.ref.id}`))).toBe(true);
    expect(offered.some((id) => id.endsWith(`|${NAP_ACTION.ref.id}`))).toBe(false);
    expect(offered.some((id) => id.endsWith(`|${GUN_ACTION.ref.id}`))).toBe(false);
  });

  it("an Alter-Ego Action is offered in alter-ego form", () => {
    const { state, ids } = start(["nap"]);
    const alterEgo: GameState = {
      ...state,
      players: state.players.map((p) => ({ ...p, identity: { ...p.identity, form: "alterEgo" as const } })),
    };
    const after = endTurnUsing(alterEgo, NAP_ACTION.ref.id);
    expect(mustInstance(after.state, ids.nap![0]!).counters.nap).toBe(1);
  });

  it("two resources that cannot pay together still offer the Action, and one of them pays it", () => {
    const { state, ids } = start(["twin", "gun"], true);
    const after = endTurnUsing(state, GUN_ACTION.ref.id);
    expect(after.offered[0]?.some((id) => id.endsWith(`|${GUN_ACTION.ref.id}`))).toBe(true);
    expect(mustInstance(after.state, ids.gun![0]!).counters.shot).toBe(1);
    expect(mustInstance(after.state, ids.twin![0]!).exhausted).toBe(true);
  });

  it("an 'up to 2' counter cost asks how many: choosing 1 keeps the second counter", () => {
    const { state, ids } = start(["chi"]);
    const chi = ids.chi![0]!;
    const charged: GameState = {
      ...state,
      instances: { ...state.instances, [chi]: { ...mustInstance(state, chi), counters: { chi: 2 } } },
    };
    const after = endTurnUsing(charged, CHI_ACTION.ref.id, { number: (options) => options.filter((o) => o === "1") });
    expect(mustInstance(after.state, chi).counters.focus).toBe(1);
    expect(mustInstance(after.state, chi).counters.chi).toBe(1);
  });
});
