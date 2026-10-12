/**
 * docs/phase7-wave10.md §3.21: `on.characterWouldAct`, in a real Resistance: Spider-Woman game (its Spider-Man set,
 * the Tigra starter deck). The engine side is driven by `packages/engine/src/character-would-act.test.ts`.
 *
 * Tangled Up 56181: "Attach to your leader. Otherwise, attach to your hero. Forced Interrupt: When attached character
 * would scheme, thwart, or attack, discard this card instead." The Spider-Man module is scripted elsewhere, so this
 * file registers the interrupt itself, written as that module can write it. The attacks and thwarts are Tigra's own:
 * her basic powers, Tooth and Claw 56008 ("Hero Action (attack): Deal 4 damage to an enemy. Deal 4 damage to an
 * enemy.", cost 4) and Feline Senses 56009 ("Hero Action (thwart): Remove 3 threat from a scheme. …", cost 2).
 *
 * RRG 1.8 "'Would'" (p. 48), "Replacement Effect" (p. 37), "Cost" (p. 13), "Labeled Ability" (p. 26).
 */

import { cardId } from "@mc/content";
import {
  activeEncounterDeckId,
  cardsInPlay,
  type EngineDeps,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import {
  P1,
  firstLegal,
  identityOf,
  inst,
  moveToHand,
  patchInstance,
  payWith,
  play,
  playerOf,
  threatOn,
} from "../testing/harness.js";
import { driveEventsPicking } from "../testing/staging.js";
import { heroAttacks, heroThwarts, piles } from "../wave9/testing.js";
import { SPIDER_WOMAN_SCENARIO, WAVE10_DEPS, civilWarHeroGame } from "../wave10/testing.js";
import { forcedInterrupt, on } from "./abilities.js";
import { discard, instead } from "./effects.js";
import { defineAbilities, validateDefinition } from "./validate.js";
import { self } from "./values.js";

vi.setConfig({ testTimeout: 120_000 });

const TANGLED_UP = "56181";
const TOOTH_AND_CLAW = "56008";
const FELINE_SENSES = "56009";

/** "Forced Interrupt: When attached character would … thwart, or attack, discard this card instead." */
const INTERRUPT = forcedInterrupt(on.characterWouldAct("host"), instead(discard(self)));
const SCRIPTS = defineAbilities({ "56181.tangled-up-forced-interrupt": INTERRUPT });
const deps: EngineDeps = { ...WAVE10_DEPS, abilities: { ...WAVE10_DEPS.abilities, ...SCRIPTS } };

const hero = (s: GameState) => identityOf(s, P1);
const leaderOf = (s: GameState): InstanceId => s.activeVillainId!;
const mainScheme = (s: GameState) => s.mainScheme.instanceId;
const wouldActs = (events: readonly GameEvent[]) =>
  events.flatMap((e) =>
    e.type === "triggerEvent" && e.event.kind === "characterWouldAct" ? [`${e.event.act} ${e.phase}`] : [],
  );

/** Hero form, the main scheme at 5 threat, and Tangled Up attached to Tigra (surgery: no reveal). */
function tangled() {
  const start = civilWarHeroGame(SPIDER_WOMAN_SCENARIO, {
    deps,
    leaderSideScheme: "discarded",
    mainSchemeStageIds: ["56172b", "56173b"] as never,
  });
  const deckId = activeEncounterDeckId(start);
  const pile = start.encounterDecks[deckId]!;
  const id = [...pile.deck, ...pile.discard].find((i) => start.instances[i]?.cardId === cardId(TANGLED_UP));
  if (!id) throw new Error("no Tangled Up in the encounter deck");
  const host = hero(start);
  const out: GameState = {
    ...start,
    encounterDecks: {
      ...start.encounterDecks,
      [deckId]: { deck: pile.deck.filter((i) => i !== id), discard: pile.discard.filter((i) => i !== id) },
    },
  };
  const attached = patchInstance(patchInstance(out, id, { faceup: true, attachedTo: host }), host, {
    attachments: [...inst(out, host).attachments, id],
    exhausted: false,
  });
  return { state: patchInstance(attached, mainScheme(attached), { threat: 5 }), id };
}
/** `code` in hand and played, paying with `cost` other cards from hand. */
function playing(state: GameState, code: string, cost: number) {
  const given = moveToHand(state, P1, code);
  const [id] = given.ids as [InstanceId];
  const run = driveEventsPicking(deps, given.state, firstLegal, play(P1, id, payWith(given.state, P1, cost, [id])));
  return { ...run, id, handBefore: playerOf(given.state, P1).hand.length };
}
const gone = (state: GameState, id: InstanceId) =>
  !cardsInPlay(state).includes(id) && inst(state, id).attachedTo === null && piles(state).discard.includes(id);

describe("§3.21 the DSL surface", () => {
  it("builds the pattern, and the interrupt is plain data the validator accepts", () => {
    expect(on.characterWouldAct("host")).toEqual({ on: "characterWouldAct", targetIs: { hostOfSelf: true } });
    expect(on.characterWouldAct("host", { act: "attack" })).toEqual({
      on: "characterWouldAct",
      targetIs: { hostOfSelf: true },
      eventIs: { act: "attack" },
    });
    expect(INTERRUPT.effects).toEqual([
      { kind: "replaceTriggeringEvent", with: [{ kind: "discardFromPlay", target: { kind: "self" } }] },
    ]);
    expect(validateDefinition(INTERRUPT)).toEqual([]);
    expect(JSON.parse(JSON.stringify(INTERRUPT))).toEqual(INTERRUPT);
  });
});

describe("§3.21 Tangled Up 56181 on Tigra in a Resistance: Spider-Woman game", () => {
  it("her basic attack: Tigra is exhausted, the leader takes nothing, Tangled Up is discarded; the next attack lands", () => {
    const at = tangled();
    const before = inst(at.state, leaderOf(at.state)).damage;
    const { state, events } = heroAttacks(deps, at.state, leaderOf(at.state));
    expect(inst(state, hero(state)).exhausted).toBe(true);
    expect(inst(state, leaderOf(state)).damage).toBe(before);
    expect(gone(state, at.id)).toBe(true);
    expect(wouldActs(events)).toEqual(["attack initiated", "attack cancelled"]);
    expect(events.filter((e) => e.type === "triggerEvent" && e.event.kind === "attack")).toEqual([]);

    const ready = patchInstance(state, hero(state), { exhausted: false });
    const next = heroAttacks(deps, ready, leaderOf(ready));
    expect(inst(next.state, leaderOf(next.state)).damage).toBeGreaterThan(before);
    expect(wouldActs(next.events)).toEqual([]);
  });

  it("her basic thwart: Tigra is exhausted, the main scheme keeps its 5 threat, Tangled Up is discarded", () => {
    const at = tangled();
    const { state, events } = heroThwarts(deps, at.state, mainScheme(at.state));
    expect(inst(state, hero(state)).exhausted).toBe(true);
    expect(threatOn(state, mainScheme(state))).toBe(5);
    expect(gone(state, at.id)).toBe(true);
    expect(wouldActs(events)).toEqual(["thwart initiated", "thwart cancelled"]);
  });

  it("Tooth and Claw (cost 4): paid for and discarded, no damage, Tangled Up discarded", () => {
    const at = tangled();
    const before = inst(at.state, leaderOf(at.state)).damage;
    const run = playing(at.state, TOOTH_AND_CLAW, 4);
    expect(inst(run.state, leaderOf(run.state)).damage).toBe(before);
    expect(gone(run.state, at.id)).toBe(true);
    expect(playerOf(run.state, P1).discard).toContain(run.id);
    // The event and the four cards that paid for it left the hand.
    expect(playerOf(run.state, P1).hand.length).toBe(run.handBefore - 5);
    expect(wouldActs(run.events)).toEqual(["attack initiated", "attack cancelled"]);
    expect(run.events.filter((e) => e.type === "damageDealt")).toEqual([]);
    // A labeled ability does not exhaust her.
    expect(inst(run.state, hero(run.state)).exhausted).toBe(false);
  });

  it("Feline Senses (cost 2): paid for and discarded, the main scheme keeps its 5 threat, Tangled Up discarded", () => {
    const at = tangled();
    const run = playing(at.state, FELINE_SENSES, 2);
    expect(threatOn(run.state, mainScheme(run.state))).toBe(5);
    expect(gone(run.state, at.id)).toBe(true);
    expect(playerOf(run.state, P1).discard).toContain(run.id);
    expect(wouldActs(run.events)).toEqual(["thwart initiated", "thwart cancelled"]);
    // Played again without it: 3 threat removed.
    const again = playing(run.state, FELINE_SENSES, 2);
    expect(threatOn(again.state, mainScheme(again.state))).toBe(2);
  });
});
