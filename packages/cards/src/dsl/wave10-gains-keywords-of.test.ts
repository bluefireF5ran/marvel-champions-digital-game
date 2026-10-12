/**
 * docs/phase7-wave10.md §3.12: `gainsKeywordsOf`, in a real Registration: Iron Man game (its Mighty Avengers and The
 * Initiative sets, the Tigra starter deck). The engine side is driven by
 * `packages/engine/src/gains-keywords-of.test.ts`.
 *
 * Earth's Mightiest Heroes 56077: "Each Avenger minion gains the printed keywords of each other Avenger minion." The
 * Mighty Avengers module is scripted elsewhere, so this file registers the constant itself, written as that module
 * can write it. The minions are the game's own: U.S. Agent 56075 (Retaliate 1, Toughness), Doc Samson 56078 (Guard),
 * Hellcat 56079 (Quickstrike), and Bullseye 56088 (a Thunderbolt, no keyword) under Drafted 56080 ("Attached minion
 * gets +2 hit points and gains the Avenger trait").
 *
 * RRG 1.8 "Gains" (p. 21), "Keywords" (p. 26), "Toughness" (p. 44), "Quickstrike" (p. 35), "Retaliate X" (p. 38).
 */

import { cardId, trait } from "@mc/content";
import {
  activeEncounterDeckId,
  cardsInPlay,
  keywordsOf,
  type AbilityDefinition,
  type EngineDeps,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { P1, endTurn, firstLegal, identityOf, inst, patchInstance, stackEncounterDeck } from "../testing/harness.js";
import { driveEventsPicking, encounterCardInVillainArea } from "../testing/staging.js";
import { attacksBy, heroAttacks, heroThwarts } from "../wave9/testing.js";
import { IRON_MAN_SCENARIO, WAVE10_DEPS, civilWarHeroGame } from "../wave10/testing.js";
import { constant, gainsKeywordsOf } from "./abilities.js";
import { defineAbilities, validateDefinition } from "./validate.js";
import { query } from "./values.js";

vi.setConfig({ testTimeout: 120_000 });

const US_AGENT = "56075";
const HEROES = "56077"; // Earth's Mightiest Heroes
const DOC_SAMSON = "56078";
const HELLCAT = "56079";
const DRAFTED = "56080";
const BULLSEYE = "56088";
const ADVANCE = "01186"; // Standard set: no boost icon, no Boost ability

const AVENGER_MINION = query("minion", { trait: trait("AVENGER") });
/** "Each Avenger minion gains the printed keywords of each other Avenger minion." */
const CONSTANT = constant(gainsKeywordsOf(AVENGER_MINION, AVENGER_MINION));
const SCRIPTS = defineAbilities({ "56077.earths-mightiest-heroes-constant": CONSTANT });
const deps: EngineDeps = { ...WAVE10_DEPS, abilities: { ...WAVE10_DEPS.abilities, ...SCRIPTS } };

const hero = (s: GameState) => identityOf(s, P1);
const names = (s: GameState, id: InstanceId) =>
  keywordsOf(s, id, deps)
    .map((k) => ("value" in k ? `${k.name} ${k.value}` : k.name))
    .sort();
const minionsInPlay = (s: GameState) =>
  cardsInPlay(s).filter((id) => s.cardPool[inst(s, id).cardId]?.type === "minion");

/** Surgery: the encounter deck's own copy of `code` out of the deck and its discard pile. */
function taken(state: GameState, code: string): { readonly state: GameState; readonly id: InstanceId } {
  const deckId = activeEncounterDeckId(state);
  const pile = state.encounterDecks[deckId]!;
  const id = [...pile.deck, ...pile.discard].find((i) => state.instances[i]?.cardId === cardId(code));
  if (!id) throw new Error(`no ${code} in the encounter deck or discard`);
  return {
    id,
    state: {
      ...state,
      encounterDecks: {
        ...state.encounterDecks,
        [deckId]: { deck: pile.deck.filter((i) => i !== id), discard: pile.discard.filter((i) => i !== id) },
      },
    },
  };
}
/** Surgery: minion `code` engaged with player 1 (no reveal, no When Revealed, no enter-play keyword). */
function engaged(state: GameState, code: string): { readonly state: GameState; readonly id: InstanceId } {
  const out = taken(state, code);
  const seated: GameState = {
    ...out.state,
    players: out.state.players.map((p) => (p.playerId === P1 ? { ...p, playArea: [...p.playArea, out.id] } : p)),
  };
  return { id: out.id, state: patchInstance(seated, out.id, { engagedWith: P1, faceup: true }) };
}
/** Surgery: Drafted attached to `host`. */
function drafted(state: GameState, host: InstanceId): GameState {
  const out = taken(state, DRAFTED);
  const attached = patchInstance(out.state, out.id, { faceup: true, attachedTo: host });
  return patchInstance(attached, host, { attachments: [...inst(attached, host).attachments, out.id] });
}

/** Hero form, no other minion in play, the scheme in play with 1 threat, U.S. Agent and Doc Samson engaged. */
function table(opts: { readonly scheme?: boolean } = {}) {
  const start = civilWarHeroGame(IRON_MAN_SCENARIO, { deps, leaderSideScheme: "discarded" });
  expect(minionsInPlay(start)).toEqual([]);
  const scheme = opts.scheme === false ? null : encounterCardInVillainArea(start, HEROES, 1);
  const agent = engaged(scheme?.state ?? start, US_AGENT);
  const doc = engaged(agent.state, DOC_SAMSON);
  return { state: doc.state, scheme: scheme?.id ?? null, agent: agent.id, doc: doc.id };
}

describe("§3.12 the DSL surface", () => {
  it("builds a keywordsOf grant, plain data the validator accepts", () => {
    expect(CONSTANT.trigger).toEqual({
      kind: "constant",
      keywordGrants: [
        {
          keywordsOf: { categories: ["minion"], trait: "AVENGER" },
          target: { categories: ["minion"], trait: "AVENGER" },
        },
      ],
    });
    expect(validateDefinition(CONSTANT)).toEqual([]);
    expect(JSON.parse(JSON.stringify(CONSTANT))).toEqual(CONSTANT);
  });

  it("the validator refuses a grant with both sources, with neither, and a copied grant that loses", () => {
    const grant = (g: object): AbilityDefinition =>
      ({ trigger: { kind: "constant", keywordGrants: [{ target: AVENGER_MINION, ...g }] }, effects: [] }) as never;
    const one = "a keyword grant needs exactly one of keyword and keywordsOf";
    expect(validateDefinition(grant({}))).toEqual([one]);
    expect(validateDefinition(grant({ keyword: { name: "guard" }, keywordsOf: AVENGER_MINION }))).toEqual([one]);
    expect(validateDefinition(grant({ keywordsOf: AVENGER_MINION, loses: true }))).toEqual([
      "a keywordsOf grant gains keywords as printed: no value, no loses",
    ]);
  });
});

describe("§3.12 Earth's Mightiest Heroes 56077 in a Registration: Iron Man game", () => {
  it("U.S. Agent and Doc Samson: each has the other's keywords, Doc Samson gets no tough card", () => {
    const at = table();
    expect(names(at.state, at.doc)).toEqual(["guard", "retaliate 1", "toughness"]);
    expect(names(at.state, at.agent)).toEqual(["guard", "retaliate 1", "toughness"]);
    expect(inst(at.state, at.doc).statuses.tough).toBe(0);
    const bare = table({ scheme: false });
    expect(names(bare.state, bare.doc)).toEqual(["guard"]);
  });

  it("Tigra's basic attack on Doc Samson is answered by his gained retaliate 1", () => {
    const at = table();
    const before = inst(at.state, hero(at.state)).damage;
    const { state } = heroAttacks(deps, at.state, at.doc);
    expect(inst(state, at.doc).damage).toBeGreaterThan(0);
    expect(inst(state, hero(state)).damage).toBe(before + 1);
  });

  it("Hellcat revealed afterwards: a tough card, guard and retaliate 1, and her own quickstrike attack", () => {
    const at = table();
    const stacked = stackEncounterDeck(at.state, ADVANCE, HELLCAT);
    const { state, events } = driveEventsPicking(deps, stacked, firstLegal, endTurn());
    const hellcat = cardsInPlay(state).find((id) => inst(state, id).cardId === cardId(HELLCAT));
    if (!hellcat) throw new Error("Hellcat is not in play");
    expect(inst(state, hellcat).statuses.tough).toBe(1);
    expect(names(state, hellcat)).toEqual(["guard", "quickstrike", "retaliate 1", "toughness"]);
    expect(attacksBy(state, events, HELLCAT)).toHaveLength(1);
    // The two already in play gained quickstrike and toughness after entering play: no tough card for either.
    expect(names(state, at.doc)).toEqual(["guard", "quickstrike", "retaliate 1", "toughness"]);
    expect([at.doc, at.agent].map((id) => inst(state, id).statuses.tough)).toEqual([0, 0]);
  });

  it("Bullseye gains nothing until Drafted makes him an Avenger", () => {
    const at = table();
    const bullseye = engaged(at.state, BULLSEYE);
    expect(names(bullseye.state, bullseye.id)).toEqual([]);
    const state = drafted(bullseye.state, bullseye.id);
    expect(names(state, bullseye.id)).toEqual(["guard", "retaliate 1", "toughness"]);
    expect(inst(state, bullseye.id).statuses.tough).toBe(0);
    // He prints no keyword, so the others gain nothing from him.
    expect(names(state, at.doc)).toEqual(["guard", "retaliate 1", "toughness"]);
  });

  it("the scheme thwarted to 0: the gained keywords are gone", () => {
    const at = table();
    const { state } = heroThwarts(deps, at.state, at.scheme!);
    expect(cardsInPlay(state)).not.toContain(at.scheme);
    expect(names(state, at.doc)).toEqual(["guard"]);
    expect(names(state, at.agent)).toEqual(["retaliate 1", "toughness"]);
  });
});
