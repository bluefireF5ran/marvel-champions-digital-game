/**
 * "Each Avenger minion gains the printed keywords of each other Avenger minion." (Earth's Mightiest Heroes, `cw`
 * 56077; docs/phase7-wave10.md §3.12): `KeywordGrantSpec.keywordsOf`. Synthetic cards: a side scheme with that
 * sentence over the Squad trait, minions printing retaliate, toughness, guard and quickstrike, and an attachment that
 * gives its host the trait.
 *
 * RRG 1.8 "Gains" (p. 21): a gained keyword is not printed, so nothing gained is passed on. "Keywords" (p. 26):
 * instances of a numbered keyword add. "Toughness" (p. 44) and "Quickstrike" (p. 35) act as the card enters play and
 * engages, so they do nothing for a minion already in play.
 */

import { flat, trait, type CardId, type KeywordInstance } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { replay } from "./engine.js";
import type { InstanceId } from "./ids.js";
import { keywordsOf, keywordTotal, printedKeywordsOf } from "./keywords.js";
import { activeEncounterDeckId, mustInstance, mustPlayer } from "./query.js";
import { cardsInPlay } from "./select.js";
import type { TargetQuery } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommands } from "./testing/drive.js";
import {
  stubAttachment,
  stubEvent,
  stubMainScheme,
  stubMinion,
  stubSideScheme,
  stubVillain,
} from "./testing/fixtures.js";
import { giveCard } from "./testing/scenario.js";
import {
  copiesOf,
  encounterCardInVillainArea,
  gameAtFirstTurn,
  minionEngagedWith,
  onTopOfEncounterDeck,
  P1,
} from "./testing/wave3.js";

const SQUAD = trait("SQUAD");
const SQUAD_MINION: TargetQuery = { categories: ["minion"], trait: SQUAD };

/** "Each Squad minion gains the printed keywords of each other Squad minion." */
const RALLY_CONSTANT = stubAbility("rally.constant", {
  trigger: { kind: "constant", keywordGrants: [{ keywordsOf: SQUAD_MINION, target: SQUAD_MINION }] },
  effects: [],
});
const RALLY = stubSideScheme({ id: "rally", startingThreat: 2, abilities: [RALLY_CONSTANT.ref] });

/** "Attached minion gains the Squad trait." */
const BADGE_CONSTANT = stubAbility("badge.constant", {
  trigger: { kind: "constant", traitGrants: [{ trait: SQUAD, target: { hostOfSelf: true } }] },
  effects: [],
});
const BADGE = stubAttachment({ id: "badge", abilities: [BADGE_CONSTANT.ref] });

const minion = (id: string, keywords: readonly KeywordInstance[], more: { squad?: boolean; atk?: number } = {}) =>
  stubMinion({
    id,
    atk: more.atk ?? 0,
    sch: 0,
    hp: 6,
    boostIcons: 0,
    traits: more.squad === false ? [] : [SQUAD],
    keywords,
  });
const AGENT = minion("agent", [{ name: "retaliate", value: 1 }, { name: "toughness" }]);
const DOC = minion("doc", [{ name: "guard" }]);
const BRUISER = minion("bruiser", [{ name: "retaliate", value: 2 }]);
const CAT = minion("cat", [{ name: "quickstrike" }], { atk: 3 });
const DRIFTER = minion("drifter", [{ name: "piercing" }], { squad: false });
const FILLER = minion("filler", [], { squad: false });

const REVEAL_ACTION = stubAbility("reveal.action", {
  trigger: { kind: "action" },
  effects: [{ kind: "revealEncounterCard", player: { kind: "controller" } }],
});
const REVEAL = stubEvent({ id: "reveal", cost: 0, abilities: [REVEAL_ACTION.ref] });

const TYRANT = stubVillain({ id: "tyrant", stages: [{ hp: flat(30), atk: 0, sch: 0 }] });
const SCHEME = stubMainScheme({
  id: "long",
  stages: [{ startingThreat: flat(0), targetThreat: flat(99), acceleration: flat(0) }],
});

const deps: EngineDeps = depsOf(RALLY_CONSTANT, BADGE_CONSTANT, REVEAL_ACTION);

const heroOf = (state: GameState) => mustPlayer(state, P1).identity.instanceId;
const names = (state: GameState, id: InstanceId) =>
  keywordsOf(state, id, deps)
    .map((k) => ("value" in k ? `${k.name} ${k.value}` : k.name))
    .sort();
const retaliate = (state: GameState, id: InstanceId) => keywordTotal(state, id, "retaliate", deps);
const toHero: Command = { type: "changeForm", playerId: P1 };
const basicAttack = (state: GameState, target: InstanceId): Command => ({
  type: "basicAttack",
  playerId: P1,
  attackerInstanceId: heroOf(state),
  targetInstanceId: target,
});

/** P1 in hero form, the scheme in play with 2 threat (unless `rally` is false), and `minions` engaged (surgery). */
function table(minions: readonly { readonly id: CardId }[], options: { rally?: boolean } = {}) {
  let state = gameAtFirstTurn({
    cards: [RALLY, BADGE, AGENT, DOC, BRUISER, CAT, DRIFTER, FILLER, REVEAL],
    deps,
    villain: TYRANT,
    mainScheme: SCHEME,
    encounter: [RALLY.id, BADGE.id, AGENT.id, DOC.id, BRUISER.id, CAT.id, DRIFTER.id, ...copiesOf(FILLER.id, 12)],
    deck: [REVEAL.id],
  });
  state = runCommands(state, deps, toHero).state;
  const rally = options.rally === false ? null : encounterCardInVillainArea(state, RALLY.id, 2);
  if (rally) state = rally.state;
  const ids: Record<string, InstanceId> = {};
  for (const card of minions) {
    const engaged = minionEngagedWith(state, card.id);
    state = engaged.state;
    ids[card.id] = engaged.id;
  }
  return { state, rally: rally?.id ?? null, ids };
}

/** Attaches the Badge to `to` (surgery: no reveal). */
function attachBadge(state: GameState, to: InstanceId): GameState {
  const deckId = activeEncounterDeckId(state);
  const piles = state.encounterDecks[deckId]!;
  const id = piles.deck.find((key) => state.instances[key]?.cardId === BADGE.id);
  if (!id) throw new Error("no badge in the encounter deck");
  return {
    ...state,
    encounterDecks: { ...state.encounterDecks, [deckId]: { ...piles, deck: piles.deck.filter((x) => x !== id) } },
    instances: {
      ...state.instances,
      [id]: { ...mustInstance(state, id), faceup: true, attachedTo: to },
      [to]: { ...mustInstance(state, to), attachments: [...mustInstance(state, to).attachments, id] },
    },
  };
}

/** Reveals `card` to P1 through the 0-cost Reveal event. */
function reveal(state: GameState, card: CardId) {
  const given = giveCard(onTopOfEncounterDeck(state, card), P1, REVEAL.id);
  const run = runCommands(given.state, deps, {
    type: "playCard",
    playerId: P1,
    cardInstanceId: given.id,
    payment: [],
    attachToInstanceId: null,
  });
  const id = cardsInPlay(run.state).find((key) => run.state.instances[key]?.cardId === card);
  if (!id) throw new Error(`${card} did not enter play`);
  return { ...run, id };
}

describe("docs/phase7-wave10.md §3.12: gains the printed keywords of each other [trait] minion", () => {
  it("two minions in play: each has the other's printed keywords, and one already in play gets no tough card", () => {
    const at = table([AGENT, DOC]);
    const { agent, doc } = at.ids as { agent: InstanceId; doc: InstanceId };
    expect(names(at.state, doc)).toEqual(["guard", "retaliate 1", "toughness"]);
    expect(names(at.state, agent)).toEqual(["guard", "retaliate 1", "toughness"]);
    expect(retaliate(at.state, doc)).toBe(1);
    expect(mustInstance(at.state, doc).statuses.tough).toBe(0);
    // What is printed is unchanged: a gained keyword is not printed (RRG 1.8 "Gains", p. 21).
    expect(printedKeywordsOf(at.state, doc, deps)).toEqual([{ name: "guard" }]);
  });

  it("the gained retaliate 1 answers a basic attack: 2 damage on the minion, 1 on the hero", () => {
    const at = table([AGENT, DOC]);
    const doc = at.ids.doc!;
    const run = runCommands(at.state, deps, basicAttack(at.state, doc));
    expect(mustInstance(run.state, doc).damage).toBe(2);
    expect(mustInstance(run.state, heroOf(run.state)).damage).toBe(1);
    const replayed = replay(run.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(run.state);
  });

  it("without the scheme the same attack is not answered", () => {
    const at = table([AGENT, DOC], { rally: false });
    const doc = at.ids.doc!;
    expect(names(at.state, doc)).toEqual(["guard"]);
    const run = runCommands(at.state, deps, basicAttack(at.state, doc));
    expect(mustInstance(run.state, doc).damage).toBe(2);
    expect(mustInstance(run.state, heroOf(run.state)).damage).toBe(0);
  });

  it("two sources of retaliate add, and nothing gained is passed on", () => {
    const at = table([AGENT, DOC, BRUISER]);
    const { agent, doc, bruiser } = at.ids as { agent: InstanceId; doc: InstanceId; bruiser: InstanceId };
    // Doc: retaliate 1 (Agent) + retaliate 2 (Bruiser). Agent: its own 1 + Bruiser's 2. Bruiser: its own 2 + Agent's 1.
    // Chaining would give Agent Doc's gained 3 as well.
    expect(retaliate(at.state, doc)).toBe(3);
    expect(retaliate(at.state, agent)).toBe(3);
    expect(retaliate(at.state, bruiser)).toBe(3);
    expect(names(at.state, bruiser)).toEqual(["guard", "retaliate 1", "retaliate 2", "toughness"]);
  });

  it("a minion revealed afterwards enters with a tough card and every keyword, and makes its own quickstrike attack", () => {
    const at = table([AGENT, DOC]);
    const run = reveal(at.state, CAT.id);
    expect(mustInstance(run.state, run.id).statuses.tough).toBe(1);
    expect(names(run.state, run.id)).toEqual(["guard", "quickstrike", "retaliate 1", "toughness"]);
    // Its quickstrike attack (3 ATK) against the 2 DEF hero, who does not defend: 3 damage.
    expect(mustInstance(run.state, heroOf(run.state)).damage).toBe(3);
    // The minions already in play gained quickstrike and did not attack; they still have no tough card.
    expect(names(run.state, at.ids.doc!)).toEqual(["guard", "quickstrike", "retaliate 1", "toughness"]);
    expect(mustInstance(run.state, at.ids.doc!).statuses.tough).toBe(0);
    expect(mustInstance(run.state, at.ids.agent!).statuses.tough).toBe(0);
  });

  it("a gained quickstrike is made by a minion that enters play after its source", () => {
    const at = table([CAT]);
    const before = mustInstance(at.state, heroOf(at.state)).damage;
    const run = reveal(at.state, BRUISER.id);
    expect(names(run.state, run.id)).toEqual(["quickstrike", "retaliate 2"]);
    // Bruiser has 0 ATK: its quickstrike attack is made and deals nothing.
    expect(mustInstance(run.state, heroOf(run.state)).damage).toBe(before);
    expect(run.events.filter((e) => e.type === "attackResolved" && e.enemyInstanceId === run.id)).toHaveLength(1);
  });

  it("a minion without the trait neither gains nor gives; given the trait, it does both", () => {
    const at = table([AGENT, DRIFTER]);
    const { agent, drifter } = at.ids as { agent: InstanceId; drifter: InstanceId };
    expect(names(at.state, drifter)).toEqual(["piercing"]);
    expect(names(at.state, agent)).toEqual(["retaliate 1", "toughness"]);
    const drafted = attachBadge(at.state, drifter);
    expect(names(drafted, drifter)).toEqual(["piercing", "retaliate 1", "toughness"]);
    expect(names(drafted, agent)).toEqual(["piercing", "retaliate 1", "toughness"]);
  });

  it("the scheme thwarted to 0: every gained keyword is gone", () => {
    const at = table([AGENT, DOC]);
    const run = runCommands(at.state, deps, {
      type: "basicThwart",
      playerId: P1,
      thwarterInstanceId: heroOf(at.state),
      schemeInstanceId: at.rally!,
    });
    expect(cardsInPlay(run.state)).not.toContain(at.rally);
    expect(names(run.state, at.ids.doc!)).toEqual(["guard"]);
    expect(names(run.state, at.ids.agent!)).toEqual(["retaliate 1", "toughness"]);
    expect(retaliate(run.state, at.ids.doc!)).toBe(0);
  });
});
