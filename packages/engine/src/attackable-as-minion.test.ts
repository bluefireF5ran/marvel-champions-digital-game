/**
 * docs/phase7-wave9.md §3.50: `RuleSpec attackableAsMinion`, a card that is no character but that players attack "as
 * if it were a minion". Synthetic cards shaped like Encased in Ice (`winter` 54035): "Attach to your identity. Attached
 * character cannot attack enemies other than this card. Any player can attack this card as if it were a minion. If
 * there is 3 or more damage here, move all but 3 damage here to attached character and discard this card."
 *
 * Sources: RRG 1.8 "Attack (Player Ability Type)" (p. 10), "Labeled Ability" (p. 26), "Guard" (p. 21: it protects
 * villains), "Overkill" (p. 31: excess is damage beyond a character's remaining hit points), "Move" (p. 30: damage
 * moved to a character "is considered to be dealt to that character"), "Target" (pp. 42-43).
 */

import { describe, expect, it } from "vitest";
import type { Command } from "./commands.js";
import { applyCommand } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { legalActions } from "./legal.js";
import { locateCard, mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec, TargetQuery, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommandsPicking } from "./testing/drive.js";
import { canAttack } from "./select.js";
import { stubAlly, stubAttachment, stubEvent, stubMinion, stubTreachery, stubUpgrade } from "./testing/fixtures.js";
import { ALLY, defaultPick } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, minionEngagedWith, P1, P2, playerCardIntoPlay } from "./testing/wave3.js";

const self = { kind: "self" } as const;
const you = { kind: "controller" } as const;
const n = (value: number) => ({ kind: "const", value }) as const;
const chosen = (slot: string): TargetRef => ({ kind: "slot", slot });
const damageHere = { kind: "damage", of: self } as const;

/** "Attached character cannot attack enemies other than this card. Any player can attack this card as if it were a minion." */
const ICE_RULES = stubAbility("ice.constant", {
  trigger: {
    kind: "constant",
    rules: [
      { kind: "cannotAttack", attacker: { hostOfSelf: true }, target: { categories: ["enemy"], self: false } },
      { kind: "attackableAsMinion", card: { self: true } },
    ],
  },
  effects: [],
});
/** "If there is 3 or more damage here, move all but 3 damage here to attached character and discard this card." */
const ICE_CHECK = stubAbility("ice.check", {
  trigger: { kind: "stateCheck", when: { kind: "compare", left: damageHere, op: "atLeast", right: n(3) } },
  effects: [
    { kind: "dealDamage", target: { kind: "host" }, amount: { kind: "sum", values: [damageHere, n(-3)] } },
    { kind: "discardFromPlay", target: self },
  ],
});
const ICE = stubAttachment({
  id: "ice",
  attachesTo: { kind: "yourIdentity" },
  abilities: [ICE_RULES.ref, ICE_CHECK.ref],
});

const event = (id: string, effects: readonly EffectSpec[], labeled = true) => {
  const ability = stubAbility(`${id}.action`, {
    trigger: { kind: "action" },
    ...(labeled ? { label: ["attack" as const] } : {}),
    effects,
  });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
const choose = (query: TargetQuery): EffectSpec => ({ kind: "chooseTarget", slot: "enemy", query, chooser: you });
const AN_ENEMY: TargetQuery = { categories: ["enemy"] };
/** "Hero Action (attack): Deal 7 damage to an enemy. This attack gains overkill." (an `attack` instruction) */
const PUNCH = event("punch", [
  choose(AN_ENEMY),
  { kind: "attack", target: chosen("enemy"), amount: n(7), overkill: true },
]);
/** "Hero Action (attack): Deal 7 damage to an enemy." (the label alone makes it an attack) */
const BLAST = event("blast", [choose(AN_ENEMY), { kind: "dealDamage", target: chosen("enemy"), amount: n(7) }]);
/** "Hero Action (attack): Deal 3 damage to an enemy." */
const TAP = event("tap", [choose(AN_ENEMY), { kind: "attack", target: chosen("enemy"), amount: n(3) }]);
/** "Hero Action (attack): Deal 3 damage to a minion engaged with you." */
const SWAT = event("swat", [
  choose({ categories: ["minion"], engagedWith: "you" }),
  { kind: "attack", target: chosen("enemy"), amount: n(3) },
]);
/** "Action: Deal 1 damage to an enemy." (no label: not an attack) */
const ZAP = event("zap", [choose(AN_ENEMY), { kind: "dealDamage", target: chosen("enemy"), amount: n(1) }], false);
/** "Hero Action (attack): Deal 1 damage to each enemy." (enemies named as a group) */
const SWEEP = event("sweep", [{ kind: "dealDamage", target: { kind: "each", query: AN_ENEMY }, amount: n(1) }]);
/** "Response: After you attack and defeat an enemy, place 1 kill counter here." */
const TROPHY_RESPONSE = stubAbility("trophy.response", {
  trigger: {
    kind: "response",
    forced: true,
    on: { on: "attack", playerIs: "controller", requireResults: { defeated: 1 } },
  },
  effects: [{ kind: "addCounters", target: self, counterType: "kill", amount: n(1) }],
});
/**
 * "Forced Response: After Frost attacks a character, search the encounter deck and discard pile for Ice and attach it
 * to that character. (Shuffle.) Otherwise, stun the attacked character."
 */
const FROST_RESPONSE = stubAbility("frost.response", {
  trigger: { kind: "response", forced: true, on: { on: "enemyAttack", selfIs: "source" } },
  effects: [
    {
      kind: "selectCards",
      slot: "found",
      cards: {
        kind: "atMost",
        count: n(1),
        of: { kind: "encounter", zones: ["deck", "discard"], filter: { name: "ice" } },
      },
    },
    {
      kind: "if",
      condition: { kind: "compare", left: { kind: "refCount", of: chosen("found") }, op: "atLeast", right: n(1) },
      then: [{ kind: "attach", card: chosen("found"), to: { kind: "eventTarget" } }],
      otherwise: [{ kind: "giveStatus", target: { kind: "eventTarget" }, status: "stunned" }],
    },
    { kind: "shuffleEncounterDeck" },
  ],
});
const FROST = stubMinion({ id: "frost", atk: 0, sch: 1, hp: 9, boostIcons: 0, abilities: [FROST_RESPONSE.ref] });
const frost = { kind: "each", query: { name: "frost" } } as const;
/** "Action: Frost attacks you." / "Action: Frost attacks an ally you control." (no boost card) */
const PROVOKE = event("provoke", [{ kind: "enemyAttack", enemies: frost, against: you, boost: false }], false);
const BAIT = event(
  "bait",
  [
    {
      kind: "enemyAttack",
      enemies: frost,
      against: you,
      boost: false,
      targetCharacter: { kind: "each", query: { categories: ["ally"], controller: "you" } },
    },
  ],
  false,
);
/** "Brute cannot attack minions." */
const BRUTE_RULE = stubAbility("brute.constant", {
  trigger: {
    kind: "constant",
    rules: [{ kind: "cannotAttack", attacker: { self: true }, target: { categories: ["minion"] } }],
  },
  effects: [],
});
/** "Pacifist cannot attack." */
const PACIFIST_RULE = stubAbility("pacifist.constant", {
  trigger: {
    kind: "constant",
    rules: [{ kind: "cannotAttack", attacker: { self: true }, target: { categories: ["enemy"] } }],
  },
  effects: [],
});
const BRUTE = stubAlly({ id: "brute", cost: 0, atk: 2, thw: 1, hp: 3, abilities: [BRUTE_RULE.ref] });
const PACIFIST = stubAlly({ id: "pacifist", cost: 0, atk: 2, thw: 1, hp: 3, abilities: [PACIFIST_RULE.ref] });
const TROPHY = stubUpgrade({ id: "trophy", cost: 0, abilities: [TROPHY_RESPONSE.ref] });
const DUMMY = stubMinion({ id: "dummy", atk: 1, sch: 1, hp: 9, boostIcons: 0 });
const SENTRY = stubMinion({ id: "sentry", atk: 1, sch: 1, hp: 9, boostIcons: 0, keywords: [{ name: "guard" }] });
const FILLER = stubTreachery({ id: "filler", boostIcons: 0 });
const EVENTS = [PUNCH, BLAST, TAP, SWAT, ZAP, SWEEP, PROVOKE, BAIT];
const deps = depsOf(
  ICE_RULES,
  ICE_CHECK,
  BRUTE_RULE,
  PACIFIST_RULE,
  TROPHY_RESPONSE,
  FROST_RESPONSE,
  ...EVENTS.map((e) => e.ability),
);

interface Table {
  readonly state: GameState;
  readonly ice: InstanceId;
  readonly hero: InstanceId;
  readonly villain: InstanceId;
}

/** Surgery: the first copy of the Ice in the encounter deck goes onto `host`. */
function encase(state: GameState, host: InstanceId): { readonly state: GameState; readonly ice: InstanceId } {
  const deckId = Object.keys(state.encounterDecks)[0] as keyof typeof state.encounterDecks;
  const piles = state.encounterDecks[deckId]!;
  const ice = piles.deck.find((id) => state.instances[id]?.cardId === ICE.id)!;
  return {
    ice,
    state: {
      ...state,
      encounterDecks: { ...state.encounterDecks, [deckId]: { ...piles, deck: piles.deck.filter((x) => x !== ice) } },
      instances: {
        ...state.instances,
        [ice]: { ...mustInstance(state, ice), attachedTo: host, faceup: true },
        [host]: { ...mustInstance(state, host), attachments: [...mustInstance(state, host).attachments, ice] },
      },
    },
  };
}

/** P1's hero (ATK 2, in hero form) encased. */
function table(players: 1 | 2 = 1): Table {
  const start = gameAtFirstTurn({
    cards: [ICE, TROPHY, BRUTE, PACIFIST, DUMMY, SENTRY, FROST, FILLER, ...EVENTS.map((e) => e.card)],
    deps,
    players,
    deck: [TROPHY.id, BRUTE.id, PACIFIST.id, ...EVENTS.map((e) => e.card.id)],
    encounter: [ICE.id, ICE.id, DUMMY.id, SENTRY.id, FROST.id, ...copiesOf(FILLER.id, 20)],
  });
  const heroes: GameState = {
    ...start,
    players: start.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" as const } })),
  };
  const hero = mustPlayer(heroes, P1).identity.instanceId;
  const encased = encase(heroes, hero);
  return { state: encased.state, ice: encased.ice, hero, villain: encased.state.activeVillainId! };
}

const damageOn = (state: GameState, id: InstanceId) => mustInstance(state, id).damage;
const attachedNow = (state: GameState, id: InstanceId) => mustInstance(state, id).attachedTo;
const basic = (attacker: InstanceId, target: InstanceId, playerId: PlayerId = P1): Command => ({
  type: "basicAttack",
  playerId,
  attackerInstanceId: attacker,
  targetInstanceId: target,
});
/** Picks `wanted` when a pending choice offers it, else the default pick. */
const picking =
  (wanted: InstanceId) =>
  (state: GameState): readonly string[] =>
    state.pendingChoice?.options.some((o) => o.optionId === wanted) ? [wanted] : defaultPick(state);
/** The options of the first target choice a play of `card` asks for (null when it asks for none). */
function offered(state: GameState, card: (typeof EVENTS)[number]): readonly string[] | null {
  const given = playerCardIntoPlay(state, card.card.id);
  // Back into the hand: `playerCardIntoPlay` took it out of the deck.
  const inHand: GameState = {
    ...given.state,
    players: given.state.players.map((p) =>
      p.playerId === P1
        ? { ...p, playArea: p.playArea.filter((id) => id !== given.id), hand: [...p.hand, given.id] }
        : p,
    ),
  };
  const result = applyCommand(
    inHand,
    { type: "playCard", playerId: P1, cardInstanceId: given.id, payment: [], attachToInstanceId: null },
    deps,
  );
  if (!result.ok) return null;
  const choice = result.state.pendingChoice;
  return choice?.prompt.kind === "chooseTarget" ? choice.options.map((o) => o.optionId) : null;
}
function play(state: GameState, card: (typeof EVENTS)[number], target: InstanceId) {
  const given = playerCardIntoPlay(state, card.card.id);
  const inHand: GameState = {
    ...given.state,
    players: given.state.players.map((p) =>
      p.playerId === P1
        ? { ...p, playArea: p.playArea.filter((id) => id !== given.id), hand: [...p.hand, given.id] }
        : p,
    ),
  };
  return runCommandsPicking(inHand, deps, picking(target), {
    type: "playCard",
    playerId: P1,
    cardInstanceId: given.id,
    payment: [],
    attachToInstanceId: null,
  });
}
const attackTargets = (state: GameState, attacker: InstanceId, playerId: PlayerId = P1) => {
  const result = legalActions(state, playerId, deps);
  if (result.kind !== "turn") throw new Error(`not ${playerId}'s turn: ${result.kind}`);
  const action = result.legal.find((a) => a.action.kind === "basicAttack" && a.action.instanceId === attacker);
  return action?.targets ?? [];
};
const defeats = (events: readonly GameEvent[]) => events.filter((e) => e.type === "characterDefeated");
const run = (state: GameState, ...commands: Command[]) => runCommandsPicking(state, deps, defaultPick, ...commands);

describe("§3.50 a card players attack as if it were a minion (RuleSpec attackableAsMinion)", () => {
  it("the encased hero's basic attack offers only the card, and ATK 2 places 2 damage on it", () => {
    const t = table();
    const withMinion = minionEngagedWith(t.state, DUMMY.id);
    expect(attackTargets(withMinion.state, t.hero)).toEqual([t.ice]);
    const { state, events } = run(withMinion.state, basic(t.hero, t.ice));
    expect(damageOn(state, t.ice)).toBe(2);
    expect(attachedNow(state, t.ice)).toBe(t.hero);
    expect(damageOn(state, t.hero)).toBe(0);
    expect(defeats(events)).toEqual([]);
    // The villain and the minion are refused to that character: "cannot attack enemies other than this card".
    const refused = applyCommand(withMinion.state, basic(t.hero, t.villain), deps);
    expect(refused.ok).toBe(false);
  });

  it("a second character's attack for 2 makes 4: 1 damage is dealt to the attached character and the card is discarded", () => {
    const t = table();
    const ally = playerCardIntoPlay(t.state, ALLY.id);
    // The ally is not the attached character: it may attack the villain and the card alike.
    expect(attackTargets(ally.state, ally.id)).toEqual([t.villain, t.ice]);
    const { state, events } = run(ally.state, basic(t.hero, t.ice), basic(ally.id, t.ice));
    expect(damageOn(state, t.hero)).toBe(1);
    expect(attachedNow(state, t.ice)).toBeNull();
    expect(locateCard(state, t.ice)?.kind).toBe("encounterDiscard");
    // Discarded, not defeated.
    expect(defeats(events)).toEqual([]);
    // Out of play it holds no damage.
    expect(damageOn(state, t.ice)).toBe(0);
  });

  it("an attack for 7 with overkill: 4 dealt to the attached character, no excess damage anywhere", () => {
    const t = table();
    const { state, events } = play(t.state, PUNCH, t.ice);
    expect(damageOn(state, t.hero)).toBe(4);
    expect(damageOn(state, t.villain)).toBe(0);
    expect(attachedNow(state, t.ice)).toBeNull();
    expect(defeats(events)).toEqual([]);
  });

  it("a label-only attack's chosen damage is an attack on it too: 7 places 7, 4 dealt to the attached character", () => {
    const t = table();
    expect(offered(t.state, BLAST)).toEqual([t.ice]);
    const { state } = play(t.state, BLAST, t.ice);
    expect(damageOn(state, t.hero)).toBe(4);
    expect(attachedNow(state, t.ice)).toBeNull();
  });

  it("an attack for exactly 3: 0 dealt to the attached character, and the card is discarded", () => {
    const t = table();
    const { state } = play(t.state, TAP, t.ice);
    expect(damageOn(state, t.hero)).toBe(0);
    expect(attachedNow(state, t.ice)).toBeNull();
  });

  it("where an attack chooses an enemy the card is a candidate; the encased hero is offered nothing else", () => {
    const t = table();
    const withMinion = minionEngagedWith(t.state, DUMMY.id);
    // The encased hero may attack no enemy, so its attack events offer the card alone.
    expect(offered(withMinion.state, PUNCH)).toEqual([t.ice]);
    // "A minion engaged with you": the card is engaged with no one, and the hero cannot attack the minion.
    expect(offered(withMinion.state, SWAT)).toBeNull();
  });

  it("it is no candidate for an ability that is not an attack, nor hit by an attack that names enemies as a group", () => {
    const t = table();
    const withMinion = minionEngagedWith(t.state, DUMMY.id);
    expect(offered(withMinion.state, ZAP)).toEqual([t.villain, withMinion.id]);
    // The encased hero may attack none of the enemies a group attack names: it cannot be played at all.
    expect(offered(withMinion.state, SWEEP)).toBeNull();
    // With the card on an ally instead, the hero's "each enemy" attack hits the villain and the minion, not the card.
    const ally = playerCardIntoPlay(withMinion.state, ALLY.id);
    const moved: GameState = {
      ...ally.state,
      instances: {
        ...ally.state.instances,
        [t.ice]: { ...mustInstance(ally.state, t.ice), attachedTo: ally.id },
        [t.hero]: { ...mustInstance(ally.state, t.hero), attachments: [] },
        [ally.id]: { ...mustInstance(ally.state, ally.id), attachments: [t.ice] },
      },
    };
    const swept = play(moved, SWEEP, t.ice);
    expect(damageOn(swept.state, t.ice)).toBe(0);
    expect(damageOn(swept.state, t.villain)).toBe(1);
    expect(damageOn(swept.state, withMinion.id)).toBe(1);
  });

  it("any player can attack it, and a guard minion engaged with that player does not protect it", () => {
    const t = table(2);
    const guarded = minionEngagedWith(t.state, SENTRY.id, P2);
    const theirs = mustPlayer(guarded.state, P2).identity.instanceId;
    // P2's turn (surgery): the active player of the turn step.
    const step = guarded.state.step;
    if (step.phase !== "player" || step.kind !== "turn") throw new Error("not a player turn");
    const turn: GameState = { ...guarded.state, step: { ...step, activePlayerId: P2 } };
    expect(attackTargets(turn, theirs, P2)).toEqual([guarded.id, t.ice]);
    const { state } = run(turn, basic(theirs, t.ice, P2));
    expect(damageOn(state, t.ice)).toBe(2);
  });

  it("it is never defeated: 'after you attack and defeat an enemy' does not answer its discard", () => {
    const t = table();
    const trophy = playerCardIntoPlay(t.state, TROPHY.id);
    const { state, events } = play(trophy.state, PUNCH, t.ice);
    expect(attachedNow(state, t.ice)).toBeNull();
    expect(mustInstance(state, trophy.id).counters.kill ?? 0).toBe(0);
    expect(defeats(events)).toEqual([]);
  });

  it("on an ally: that ally may attack only the card, and its identity attacks as before", () => {
    const start = table();
    // A second copy on an ally of the same player.
    const ally = playerCardIntoPlay(start.state, ALLY.id);
    const second = encase(ally.state, ally.id);
    // "Enemies other than this card": the other copy is no enemy (RRG 1.8 "Enemy", p. 18), so each encased character
    // may attack either copy and no enemy.
    expect(attackTargets(second.state, ally.id)).toEqual([start.ice, second.ice]);
    expect(attackTargets(second.state, start.hero)).toEqual([start.ice, second.ice]);
    // Another character may attack either copy.
    const other = playerCardIntoPlay(second.state, ALLY.id);
    expect(attackTargets(other.state, other.id)).toEqual([start.villain, start.ice, second.ice]);
  });

  it("attached by an enemy's 'after it attacks a character': the attacked ally is encased", () => {
    // One copy is on the hero already; the other is in the encounter deck.
    const t = table();
    const ally = playerCardIntoPlay(minionEngagedWith(t.state, FROST.id).state, ALLY.id);
    const baited = play(ally.state, BAIT, ally.id);
    const [second] = mustInstance(baited.state, ally.id).attachments;
    expect(second === undefined ? null : mustInstance(baited.state, second).cardId).toBe(ICE.id);
    // The card's own "attach to your identity" was not read: another ability named the host (RRG 1.8 p. 8).
    expect(mustInstance(baited.state, second!).attachedTo).toBe(ally.id);
    // Readied (surgery), the ally may attack either copy and no enemy: the hero's copy is not an enemy.
    const readied: GameState = {
      ...baited.state,
      instances: {
        ...baited.state.instances,
        [ally.id]: { ...mustInstance(baited.state, ally.id), exhausted: false },
      },
    };
    expect(attackTargets(readied, ally.id)).toEqual([t.ice, second]);
    expect(canAttack(readied, ally.id, t.villain, deps)).toBe(false);
    expect(mustInstance(baited.state, ally.id).statuses.stunned).toBe(0);
  });

  it("two copies on one character: it may attack either copy, and still no enemy", () => {
    const t = table();
    const withMinion = minionEngagedWith(t.state, DUMMY.id);
    const both = encase(withMinion.state, t.hero);
    expect(attackTargets(both.state, t.hero)).toEqual([t.ice, both.ice]);
    expect(canAttack(both.state, t.hero, t.villain, deps)).toBe(false);
    expect(canAttack(both.state, t.hero, withMinion.id, deps)).toBe(false);
    // Where its attack chooses an enemy, both copies and nothing else are candidates.
    expect(offered(both.state, PUNCH)).toEqual([t.ice, both.ice]);
    const { state } = run(both.state, basic(t.hero, both.ice));
    expect(damageOn(state, both.ice)).toBe(2);
    expect(damageOn(state, t.ice)).toBe(0);
  });

  it("'cannot attack minions' forbids attacking it: the attack is made as on a minion", () => {
    const t = table();
    const ally = playerCardIntoPlay(t.state, ALLY.id);
    const brute = playerCardIntoPlay(ally.state, BRUTE.id);
    expect(canAttack(brute.state, brute.id, t.ice, deps)).toBe(false);
    expect(canAttack(brute.state, brute.id, t.villain, deps)).toBe(true);
    expect(canAttack(brute.state, ally.id, t.ice, deps)).toBe(true);
  });

  it("the printed 'cannot attack' (every enemy, unqualified) forbids attacking it too", () => {
    const t = table();
    const ally = playerCardIntoPlay(t.state, ALLY.id);
    const pacifist = playerCardIntoPlay(ally.state, PACIFIST.id);
    expect(canAttack(pacifist.state, pacifist.id, t.ice, deps)).toBe(false);
    expect(canAttack(pacifist.state, pacifist.id, t.villain, deps)).toBe(false);
    expect(canAttack(pacifist.state, ally.id, t.ice, deps)).toBe(true);
  });

  it("with no copy left in the deck or the discard pile, the attacked character is stunned instead", () => {
    const t = table();
    const ally = playerCardIntoPlay(minionEngagedWith(t.state, FROST.id).state, ALLY.id);
    const both = encase(ally.state, ally.id);
    const provoked = play(both.state, PROVOKE, t.hero);
    expect(mustInstance(provoked.state, t.hero).statuses.stunned).toBe(1);
    expect(mustInstance(provoked.state, t.hero).attachments).toEqual([t.ice]);
  });
});
