/**
 * docs/phase7-wave9.md §3.48: counting different traits. "For each different Trait on friendly characters in play,
 * choose: …" (Strength in Diversity, `falcon` 53019).
 *
 * Sources: RRG 1.8 "Traits" (p. 45); "'For Each'" (p. 20); "Gains" (p. 21: a trait already had is not had twice).
 */

import { trait } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { InstanceId } from "./ids.js";
import type { TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { resolveValue } from "./select.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { stubAlly, stubIdentity, stubUpgrade } from "./testing/fixtures.js";
import { DEFAULT_DECK, newGame } from "./testing/scenario.js";
import { P1, P2, playerCardIntoPlay } from "./testing/wave3.js";

const AERIAL = trait("AERIAL");
const AVENGER = trait("AVENGER");
const BIRD = trait("BIRD");
const GENIUS = trait("GENIUS");
const WAKANDA = trait("WAKANDA");
const SHIELD = trait("S.H.I.E.L.D.");

const stats = { hp: 10, atk: 2, thw: 2, def: 2, rec: 3, heroHandSize: 5, alterEgoHandSize: 6 };
const FLYER = stubIdentity({ id: "flyer", ...stats, heroTraits: [AERIAL, AVENGER] });
const THINKER_ALLY = stubAlly({ id: "thinker-ally", cost: 0, atk: 1, thw: 1, hp: 2, traits: [GENIUS, WAKANDA] });
const BIRD_ALLY = stubAlly({ id: "bird-ally", cost: 0, atk: 1, thw: 1, hp: 2, traits: [AERIAL, AVENGER, BIRD] });
const DEPUTY_GRANT = stubAbility("deputy.grant", {
  trigger: { kind: "constant", traitGrants: [{ trait: SHIELD, target: { categories: ["ally"], controller: "you" } }] },
  effects: [],
});
const DEPUTY = stubUpgrade({ id: "deputy", cost: 0, abilities: [DEPUTY_GRANT.ref] });
/** Grants a trait a character already prints: it adds no new trait to the count. */
const SECOND_GRANT = stubAbility("second.grant", {
  trigger: { kind: "constant", traitGrants: [{ trait: AERIAL, target: { categories: ["ally"], controller: "you" } }] },
  effects: [],
});
const WINGS = stubUpgrade({ id: "wings", cost: 0, abilities: [SECOND_GRANT.ref] });

const deps = depsOf(DEPUTY_GRANT, SECOND_GRANT);
const FRIENDLY_CHARACTERS: TargetRef = {
  kind: "each",
  query: { categories: ["identity", "ally"], controller: "any" },
};

/** Two seats, each with the same hero face (Aerial, Avenger). */
const game = (): GameState =>
  newGame({
    identity: FLYER,
    players: 2,
    extraCards: [THINKER_ALLY, BIRD_ALLY, DEPUTY, WINGS],
    deck: [...DEFAULT_DECK, THINKER_ALLY.id, BIRD_ALLY.id, DEPUTY.id, WINGS.id],
    deps,
  });

const inHeroForm = (state: GameState): GameState => ({
  ...state,
  players: state.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" as const } })),
});

const count = (state: GameState, of: TargetRef = FRIENDLY_CHARACTERS, picked: readonly InstanceId[] = []): number =>
  resolveValue(
    state,
    { kind: "distinctTraits", of },
    { selfInstanceId: null, controllerId: P1, event: null, bindings: { picked }, deps },
  );

describe("§3.48 ValueSpec distinctTraits", () => {
  it("counts each trait once across every friendly character, another player's included", () => {
    // Aerial and Avenger on both heroes: 2. Genius and Wakanda on the second player's ally: 4.
    expect(count(inHeroForm(game()))).toBe(2);
    const heroes = playerCardIntoPlay(inHeroForm(game()), THINKER_ALLY.id, P2).state;
    expect(count(heroes)).toBe(4);
    // The ally shares Aerial and Avenger and adds Bird.
    const withAlly = playerCardIntoPlay(heroes, BIRD_ALLY.id, P1);
    expect(count(withAlly.state)).toBe(5);
    // Reads only the cards named: the ally alone has 3.
    expect(count(withAlly.state, { kind: "slot", slot: "picked" }, [withAlly.id])).toBe(3);
  });

  it("counts a gained trait, and a gained trait a character already has only once", () => {
    const others = playerCardIntoPlay(inHeroForm(game()), THINKER_ALLY.id, P2).state;
    const withAlly = playerCardIntoPlay(others, BIRD_ALLY.id, P1).state;
    const deputized = playerCardIntoPlay(withAlly, DEPUTY.id, P1).state;
    expect(count(deputized)).toBe(6);
    expect(count(playerCardIntoPlay(deputized, WINGS.id, P1).state)).toBe(6);
    // The other player's copy reaches that player's ally instead: still one new trait.
    expect(count(playerCardIntoPlay(withAlly, DEPUTY.id, P2).state)).toBe(6);
  });

  it("reads the faceup side of an identity: an alter-ego with no traits adds none", () => {
    const state = game();
    const alterEgos = {
      ...state,
      players: state.players.map((p) => ({ ...p, identity: { ...p.identity, form: "alterEgo" as const } })),
    };
    expect(count(alterEgos)).toBe(0);
    expect(count(alterEgos, { kind: "each", query: { categories: ["minion"] } })).toBe(0);
  });
});
