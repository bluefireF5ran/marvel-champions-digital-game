/**
 * docs/phase7-wave9.md §3.30: a hero from the collection in play as a minion. Synthetic cards shaped like Reluctant Foe
 * (`aos` 50171): "Treat attached hero as an Elite minion with SCH equal to its printed THW. Replace its printed text
 * box with: 'Villainous. When Defeated: Remove this hero and Reluctant Foe from the game.' When Revealed: Search your
 * collection for a hero whose title does not match a character in play and put it into play engaged with you. Attach
 * this card to it."
 *
 * Sources: MC50 rulebook p. 22 ("choose an identity card from a Marvel Champions hero you are not using in your
 * current game whose title does not match the title of a character in play … with its hero side faceup. That hero
 * becomes a minion with the villainous keyword, SCH equal to its THW value, and hit points equal to its starting hit
 * point value. Its DEF value has no effect. When you defeat that minion, both the identity card and Reluctant Foe are
 * removed from the game."); RRG 1.8 "Double-Sided Card" (p. 17), "Villainous" (p. 47), "Enters Play" and "Engage"
 * (p. 18), "Unique Icon" (pp. 45–46); owner decisions §4.1 Q39–Q43 (all A) and Q47.
 */

import { trait, type AnyCard, type HeroIdentityCard } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { hasKeyword, keywordsOf } from "./keywords.js";
import { legalActions } from "./legal.js";
import {
  characterProfile,
  isMinion,
  isSeatlessIdentity,
  locateCard,
  minionsEngagedWith,
  mustInstance,
  mustPlayer,
  titleShowing,
} from "./query.js";
import { collectionCandidates } from "./resolve/collection.js";
import { activeAbilityRefs, cardTypeOf, categoriesOf, controllerOf, traitsOf } from "./select.js";
import type { EffectSpec, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommandsPicking } from "./testing/drive.js";
import { stubAlly, stubAttachment, stubEvent, stubIdentity, stubSupport } from "./testing/fixtures.js";
import { defaultPick, giveCard, HERO, TREACHERY } from "./testing/scenario.js";
import { auditVillainPhases } from "./villain/audit.js";
import { copiesOf, gameAtFirstTurn, onTopOfEncounterDeck, P1, playerCardIntoPlay } from "./testing/wave3.js";

const ELITE = trait("ELITE");
const AVENGER = trait("AVENGER");
const self: TargetRef = { kind: "self" };
const one = { kind: "const", value: 1 } as const;
const mainScheme: TargetRef = { kind: "each", query: { categories: ["mainScheme"] } };

/** The hero's own printed text, which the attachment replaces: an action and a keyword. */
const WANDERER_ACTION = stubAbility("wanderer.action", {
  trigger: { kind: "action" },
  effects: [{ kind: "addCounters", target: mainScheme, counterType: "own-text", amount: one }],
});
const identity = (id: string, title: string, extra: Partial<Parameters<typeof stubIdentity>[0]> = {}) => {
  const card = stubIdentity({
    id,
    hp: 12,
    atk: 2,
    thw: 2,
    def: 3,
    rec: 4,
    heroHandSize: 5,
    alterEgoHandSize: 6,
    ...extra,
  });
  // An identity card's own name is its hero title, as in the card data.
  return { ...card, name: title, hero: { ...card.hero, faceName: title } } satisfies HeroIdentityCard;
};
/** THW 2, ATK 2, DEF 3, 12 hit points; an Avenger with retaliate 1 and an action of its own. */
const WANDERER = identity("wanderer", "Wanderer", {
  heroTraits: [AVENGER],
  heroKeywords: [{ name: "retaliate", value: 1 }],
  heroAbilities: [WANDERER_ACTION.ref],
});
/** Its hero title is an ally's title. */
const TWIN = identity("twin", "Twin");
const TWIN_ALLY: AnyCard = { ...stubAlly({ id: "twin-ally", cost: 0, atk: 1, thw: 1, hp: 3 }), name: "Twin" };
/** Its hero title is the hero title of the identity a player is using. */
const NAMESAKE = identity("namesake", HERO.hero.faceName);
/** Its alter-ego title is an ally's title, which is not compared (§4.1 Q42 = A). */
const MASKED = (() => {
  const card = identity("masked", "Masked");
  return { ...card, alterEgo: { ...card.alterEgo, faceName: "Bystander" } } satisfies HeroIdentityCard;
})();
const BYSTANDER: AnyCard = { ...stubAlly({ id: "bystander", cost: 0, atk: 1, thw: 1, hp: 3 }), name: "Bystander" };

/** "When Defeated: Remove this hero and Reluctant Foe from the game." It is the hero's ability: `self` is the hero. */
const FOE_DEFEATED = stubAbility("foe.when-defeated", {
  trigger: { kind: "whenDefeated" },
  effects: [
    {
      kind: "moveCards",
      cards: { kind: "ref", ref: { kind: "each", query: { name: "foe", host: self } } },
      to: "removedFromGame",
    },
    { kind: "moveCards", cards: { kind: "ref", ref: self }, to: "removedFromGame" },
  ],
});
const FOE_CONSTANT = stubAbility("foe.constant", {
  trigger: {
    kind: "constant",
    rules: [
      { kind: "treatHostAsMinion", traits: [ELITE], keepPrintedTraits: true, schFromThw: true },
      { kind: "gainsAbility", abilityId: FOE_DEFEATED.ref.id, to: { hostOfSelf: true } },
    ],
    keywordGrants: [{ target: { hostOfSelf: true }, keyword: { name: "villainous" } }],
  },
  effects: [],
});
const FOE_REVEALED = stubAbility("foe.when-revealed", {
  trigger: { kind: "whenRevealed" },
  effects: [
    { kind: "searchCollection", player: { kind: "controller" }, filter: { heroTitleNotInPlay: true }, bind: "hero" },
    {
      kind: "putIntoPlayAsHost",
      card: { kind: "slot", slot: "hero" },
      attachment: self,
      engagedWith: { kind: "controller" },
    },
  ],
});
const FOE = stubAttachment({
  id: "foe",
  name: "foe",
  abilities: [FOE_CONSTANT.ref, FOE_REVEALED.ref],
});

/** An attachment with the same When Revealed and no "treat attached hero as a minion". */
const INERT_REVEALED = stubAbility("inert.when-revealed", FOE_REVEALED.definition);
const INERT = stubAttachment({ id: "inert", name: "inert", abilities: [INERT_REVEALED.ref] });

const event = (id: string, effects: readonly EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
const minions: TargetRef = { kind: "each", query: { categories: ["minion"] } };
const REVEAL = event("reveal", [{ kind: "revealEncounterCard", player: { kind: "controller" } }]);
const SMITE = event("smite", [{ kind: "dealDamage", target: minions, amount: { kind: "const", value: 12 } }]);
const JAB = event("jab", [{ kind: "dealDamage", target: minions, amount: { kind: "const", value: 5 } }]);
const FREE = event("free", [
  { kind: "discardFromPlay", target: { kind: "each", query: { categories: ["attachment"] } } },
]);
const BANISH = event("banish", [{ kind: "discardFromPlay", target: minions }]);
const EVENTS = [REVEAL, SMITE, JAB, FREE, BANISH];

/** "After a minion enters play" and "after a minion engages a player": a counter each on the main scheme. */
const ENTER_WATCH = stubAbility("watch.enters", {
  trigger: { kind: "response", forced: true, on: { on: "cardEntersPlay", targetIs: { categories: ["minion"] } } },
  effects: [{ kind: "addCounters", target: mainScheme, counterType: "entered", amount: one }],
});
const ENGAGE_WATCH = stubAbility("watch.engages", {
  trigger: { kind: "response", forced: true, on: { on: "minionEngaged" } },
  effects: [{ kind: "addCounters", target: mainScheme, counterType: "engaged", amount: one }],
});
const WATCHER = stubSupport({ id: "watcher", cost: 0, abilities: [ENTER_WATCH.ref, ENGAGE_WATCH.ref] });

const deps: EngineDeps = depsOf(
  WANDERER_ACTION,
  FOE_DEFEATED,
  FOE_CONSTANT,
  FOE_REVEALED,
  ENTER_WATCH,
  ENGAGE_WATCH,
  INERT_REVEALED,
  ...EVENTS.map((e) => e.ability),
);

const withForm = (state: GameState, form: "hero" | "alterEgo"): GameState => ({
  ...state,
  players: state.players.map((p) => ({ ...p, identity: { ...p.identity, form } })),
});

function table(heroes: readonly AnyCard[] = [WANDERER]): GameState {
  return gameAtFirstTurn({
    cards: [...heroes, TWIN_ALLY, BYSTANDER, FOE, INERT, WATCHER, ...EVENTS.map((e) => e.card)],
    deps,
    encounter: [FOE.id, INERT.id, ...copiesOf(TREACHERY.id, 20)],
    deck: [TWIN_ALLY.id, BYSTANDER.id, WATCHER.id, ...EVENTS.flatMap((e) => copiesOf(e.card.id, 2))],
  });
}

/** Plays an event for 0, answering a collection search with `pick` (a card id; null finds nothing). */
function play(state: GameState, card: { card: AnyCard }, pick: string | null = WANDERER.id) {
  const given = giveCard(state, P1, card.card.id);
  const offered: string[][] = [];
  const command: Command = {
    type: "playCard",
    playerId: P1,
    cardInstanceId: given.id,
    payment: [],
    attachToInstanceId: null,
  };
  const picker = (current: GameState): readonly string[] => {
    const choice = current.pendingChoice!;
    if (choice.prompt.kind !== "searchCollection") return defaultPick(current);
    offered.push(choice.options.map((o) => o.optionId));
    return pick === null ? [] : [pick];
  };
  const run = runCommandsPicking(given.state, deps, picker, command);
  return { ...run, offered, before: given.state, commands: [command] };
}

/** P1 reveals the attachment from the top of the encounter deck. */
const reveal = (state: GameState, pick: string | null = WANDERER.id) =>
  play(onTopOfEncounterDeck(state, FOE.id), REVEAL, pick);

const instanceOf = (state: GameState, card: AnyCard): InstanceId | undefined =>
  Object.values(state.instances).find((i) => i.cardId === card.id)?.instanceId;
const countersOn = (state: GameState, type: string): number =>
  mustInstance(state, state.mainScheme.instanceId).counters[type] ?? 0;
/** Whether any legal action of P1's turn names the card. */
const namedInLegal = (state: GameState, id: InstanceId): boolean => {
  const actions = legalActions(state, P1, deps);
  return actions.kind === "turn" && actions.legal.some((a) => JSON.stringify(a.action).includes(`"${id}"`));
};
const moved = (events: readonly GameEvent[], id: InstanceId): readonly string[] =>
  events.flatMap((e) => (e.type === "cardMoved" && e.instanceId === id ? [e.to.kind] : []));

describe("§3.30 the collection search for a hero no character in play is titled as", () => {
  it("finds an identity card by its hero-side title, never the hero a player is using", () => {
    const state = table([WANDERER, TWIN, NAMESAKE, MASKED]);
    const filter = { heroTitleNotInPlay: true } as const;
    expect(collectionCandidates(state, filter).map((c) => c.id)).toEqual([MASKED.id, TWIN.id, WANDERER.id]);
    // An ally titled as the hero side: that hero is not found. One titled as the alter-ego side changes nothing.
    const withAllies = playerCardIntoPlay(playerCardIntoPlay(state, TWIN_ALLY.id).state, BYSTANDER.id).state;
    expect(collectionCandidates(withAllies, filter).map((c) => c.id)).toEqual([MASKED.id, WANDERER.id]);
  });

  it("offers those heroes to the revealing player, and a hero in the game is not found again", () => {
    const first = reveal(table([WANDERER, TWIN]));
    expect(first.offered).toEqual([[TWIN.id, WANDERER.id]]);
    expect(collectionCandidates(first.state, { heroTitleNotInPlay: true }).map((c) => c.id)).toEqual([TWIN.id]);
  });

  it("with no hero to find, nothing enters play and the attachment is discarded", () => {
    const { state, offered } = reveal(table([]));
    expect(offered).toEqual([]);
    expect(locateCard(state, instanceOf(state, FOE)!)?.kind).toBe("encounterDiscard");
    expect(minionsEngagedWith(state, P1)).toEqual([]);
  });

  it("a player who finds nothing leaves the attachment with no host: it is discarded", () => {
    const { state } = reveal(table(), null);
    expect(instanceOf(state, WANDERER)).toBeUndefined();
    expect(locateCard(state, instanceOf(state, FOE)!)?.kind).toBe("encounterDiscard");
  });
});

describe("§3.30 the hero in play as a minion", () => {
  it("is an Elite minion engaged with the revealing player: ATK and hit points printed, SCH its THW, no DEF", () => {
    const { state } = reveal(table());
    const hero = instanceOf(state, WANDERER)!;
    const foe = instanceOf(state, FOE)!;
    expect(isSeatlessIdentity(state, hero)).toBe(true);
    expect(mustInstance(state, foe).attachedTo).toBe(hero);
    expect(isMinion(state, hero)).toBe(true);
    expect(cardTypeOf(state, hero)).toBe("minion");
    expect(categoriesOf(state, hero)).toEqual(["minion", "enemy", "character"]);
    expect(minionsEngagedWith(state, P1)).toEqual([hero]);
    expect(mustPlayer(state, P1).playArea).toContain(hero);
    expect(controllerOf(state, hero)).toBeNull();
    expect(mustInstance(state, hero).faceup).toBe(true);
    expect(characterProfile(state, hero, deps)).toEqual({
      kind: "minion",
      missing: [],
      atk: 2,
      thw: 0,
      def: 0,
      rec: 0,
      sch: 2,
      maxHp: 12,
    });
    expect(titleShowing(state, hero)).toBe("Wanderer");
  });

  it("keeps its printed traits beside Elite; its text box is the attachment's two lines", () => {
    const { state } = reveal(table());
    const hero = instanceOf(state, WANDERER)!;
    expect([...traitsOf(state, hero, deps)].sort()).toEqual([AVENGER, ELITE].sort());
    expect(keywordsOf(state, hero, deps)).toEqual([{ name: "villainous" }]);
    expect(hasKeyword(state, hero, "retaliate", deps)).toBe(false);
    expect(activeAbilityRefs(state, hero, deps).map((ref) => ref.id)).toEqual([FOE_DEFEATED.ref.id]);
    expect(namedInLegal(state, hero)).toBe(false);
  });

  it("'minion enters play' and 'engages' abilities hear it, once each, as the minion it is by then", () => {
    const watched = playerCardIntoPlay(table(), WATCHER.id).state;
    const { state, events } = reveal(watched);
    expect(countersOn(state, "entered")).toBe(1);
    expect(countersOn(state, "engaged")).toBe(1);
    // The attachment was on it before either was announced.
    const hero = instanceOf(state, WANDERER)!;
    const treated = events.findIndex((e) => e.type === "treatedAsChanged" && e.instanceId === hero);
    const announced = events.findIndex((e) => e.type === "counterAdded");
    expect(treated).toBeGreaterThanOrEqual(0);
    expect(announced).toBeGreaterThan(treated);
  });

  it("activates in the villain phase as a villainous minion: a boost card, and it schemes for its THW", () => {
    const { state } = reveal(table());
    const hero = instanceOf(state, WANDERER)!;
    const before = mustInstance(state, state.mainScheme.instanceId).threat;
    const phase = runCommandsPicking(state, deps, defaultPick, { type: "endTurn", playerId: P1 });
    const activations = phase.events.flatMap((e) =>
      e.type === "enemyActivated" && e.enemyInstanceId === hero ? [e.activation] : [],
    );
    expect(activations).toEqual(["scheme"]);
    expect(phase.events.some((e) => e.type === "boostCardDealt" && e.enemyInstanceId === hero)).toBe(true);
    // SCH 2 and a boost card worth 1, besides whatever the villain and the main scheme's own step placed.
    const placed = phase.events.flatMap((e) =>
      e.type === "threatPlaced" && e.sourceInstanceId === hero ? [e.amount] : [],
    );
    expect(placed).toEqual([3]);
    expect(mustInstance(phase.state, phase.state.mainScheme.instanceId).threat).toBeGreaterThan(before);
  });

  it("against a player in hero form it attacks for its printed ATK, and that player can attack it", () => {
    const { state } = reveal(withForm(table(), "hero"));
    const hero = instanceOf(state, WANDERER)!;
    const attacked = runCommandsPicking(state, deps, defaultPick, {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: mustPlayer(state, P1).identity.instanceId,
      targetInstanceId: hero,
    }).state;
    expect(mustInstance(attacked, hero).damage).toBe(HERO.hero.atk);
    const phase = runCommandsPicking(attacked, deps, defaultPick, { type: "endTurn", playerId: P1 });
    const activations = phase.events.flatMap((e) =>
      e.type === "enemyActivated" && e.enemyInstanceId === hero ? [e.activation] : [],
    );
    expect(activations).toEqual(["attack"]);
    // ATK 2 and a boost card worth 1, undefended.
    const dealt = phase.events.flatMap((e) =>
      e.type === "damageDealt" && e.sourceInstanceId === hero ? [e.amount] : [],
    );
    expect(dealt).toEqual([3]);
  });

  it("an attachment that does not make it a minion: the hero is removed from the game, never left in play", () => {
    const { state, events } = play(onTopOfEncounterDeck(table(), INERT.id), REVEAL);
    const hero = instanceOf(state, WANDERER)!;
    expect(state.removedFromGame).toContain(hero);
    expect(mustPlayer(state, P1).playArea).not.toContain(hero);
    expect(events.some((e) => e.type === "putIntoPlayRefused" && e.instanceId === hero)).toBe(true);
    expect(locateCard(state, instanceOf(state, INERT)!)?.kind).toBe("encounterDiscard");
  });

  it("revealed and activating within one log, the villain phase audit finds nothing wrong", () => {
    const given = giveCard(onTopOfEncounterDeck(table(), FOE.id), P1, REVEAL.card.id);
    const picker = (current: GameState): readonly string[] =>
      current.pendingChoice?.prompt.kind === "searchCollection" ? [WANDERER.id] : defaultPick(current);
    const run = runCommandsPicking(
      given.state,
      deps,
      picker,
      { type: "playCard", playerId: P1, cardInstanceId: given.id, payment: [], attachToInstanceId: null },
      { type: "endTurn", playerId: P1 },
    );
    const hero = instanceOf(run.state, WANDERER)!;
    expect(run.events.some((e) => e.type === "enemyActivated" && e.enemyInstanceId === hero)).toBe(true);
    expect(auditVillainPhases(run.session.log, deps).violations).toEqual([]);
  });

  it("takes damage as a minion and is not defeated short of its printed hit points", () => {
    const { state } = play(reveal(table()).state, JAB);
    const hero = instanceOf(state, WANDERER)!;
    expect(mustInstance(state, hero).damage).toBe(5);
    expect(isMinion(state, hero)).toBe(true);
  });
});

describe("§3.30 the hero and the attachment leave the game together", () => {
  it("defeated: its When Defeated removes the hero and the attachment from the game", () => {
    const start = reveal(table());
    const hero = instanceOf(start.state, WANDERER)!;
    const foe = instanceOf(start.state, FOE)!;
    const { state, events } = play(start.state, SMITE);
    expect(events.some((e) => e.type === "characterDefeated" && e.instanceId === hero)).toBe(true);
    expect(state.removedFromGame).toEqual(expect.arrayContaining([hero, foe]));
    expect(moved(events, hero)).toEqual(["removedFromGame"]);
    expect(moved(events, foe)).toEqual(["removedFromGame"]);
    expect(mustPlayer(state, P1).discard).not.toContain(hero);
    expect(minionsEngagedWith(state, P1)).toEqual([]);
    expect(mustInstance(state, hero).treatedAs ?? null).toBeNull();
    // Removed from the game, it is no part of the collection (ruling, December 17, 2025 - Ruling 4, answer 1).
    expect(collectionCandidates(state, { heroTitleNotInPlay: true })).toEqual([]);
  });

  it("the attachment leaves play first: the hero is removed from the game with it, not defeated (Q39 = A)", () => {
    const start = reveal(table());
    const hero = instanceOf(start.state, WANDERER)!;
    const foe = instanceOf(start.state, FOE)!;
    const { state, events } = play(start.state, FREE);
    expect(locateCard(state, foe)?.kind).toBe("encounterDiscard");
    expect(state.removedFromGame).toContain(hero);
    expect(moved(events, hero)).toEqual(["removedFromGame"]);
    expect(events.some((e) => e.type === "characterDefeated")).toBe(false);
    expect(mustPlayer(state, P1).playArea).not.toContain(hero);
  });

  it("discarded without being defeated: a double-sided card, it is removed from the game (RRG p. 17)", () => {
    const start = reveal(table());
    const hero = instanceOf(start.state, WANDERER)!;
    const foe = instanceOf(start.state, FOE)!;
    const { state, events } = play(start.state, BANISH);
    expect(moved(events, hero)).toEqual(["removedFromGame"]);
    expect(locateCard(state, foe)?.kind).toBe("encounterDiscard");
    expect(events.some((e) => e.type === "characterDefeated")).toBe(false);
  });

  it("a player may then play an ally of that title, and not while the hero is in play", () => {
    // The unique rule matches the two by the ally's subtitle and the identity card's alter-ego title (RRG 1.8 "Unique
    // Icon", pp. 45–46), which the hero's card still prints while it is a minion.
    const withAlly = { ...TWIN_ALLY, unique: true, subtitle: TWIN.alterEgo.faceName } as AnyCard;
    const base = gameAtFirstTurn({
      cards: [TWIN, withAlly, FOE, ...EVENTS.map((e) => e.card)],
      deps,
      encounter: [FOE.id, ...copiesOf(TREACHERY.id, 20)],
      deck: [withAlly.id, ...EVENTS.flatMap((e) => copiesOf(e.card.id, 2))],
    });
    const start = reveal(base, TWIN.id);
    const hero = instanceOf(start.state, TWIN)!;
    expect(isMinion(start.state, hero)).toBe(true);
    const ally = giveCard(start.state, P1, withAlly.id);
    expect(namedInLegal(ally.state, ally.id)).toBe(false);
    const gone = play(ally.state, SMITE);
    expect(gone.state.removedFromGame).toContain(hero);
    expect(namedInLegal(gone.state, ally.id)).toBe(true);
  });

  it("replays to the same state from the recorded commands", () => {
    const start = reveal(table());
    const end = play(start.state, SMITE);
    const again = replay(end.session.log, deps);
    if (!again.ok) throw new Error(again.error.message);
    expect(again.state).toEqual(end.state);
  });
});
