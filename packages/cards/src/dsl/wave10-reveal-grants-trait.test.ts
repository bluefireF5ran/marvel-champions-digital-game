/**
 * docs/phase7-wave10.md §3.16: `on.cardRevealedGranting(trait, …)` and `grantedTo(trait, …)`, "a card is revealed that
 * gives heroes a trait", in a real two-player Civil War game (`civilWarGame`, Registration: Captain Marvel, the Tigra
 * and Core Spider-Man starter decks, cooperative mode). The engine side is driven by
 * `packages/engine/src/reveal-grants-trait.test.ts`.
 *
 * The real cards are the main scheme stage Hunting Rebel Heroes 56097b ("Each hero gains the Unregistered trait.
 * Forced Response: After another card is revealed that gives 1 or more heroes the Unregistered trait, deal 2 damage to
 * each of those heroes.") and the side scheme Government Contractor 56120 ("Each identity gains the Unregistered
 * trait."). Their modules are scripted elsewhere, so this file registers its own scripts of the texts under test over
 * the wave's registry. The main scheme is put on stage 2B by surgery, and the encounter deck is stacked: one boost card
 * for each player's activation (Advance 01186 and Assault 01187, Core standard treacheries with no boost icon), then
 * Government Contractor as the card player 1 is dealt.
 *
 * Which heroes "those heroes" are when they already had the trait is the owner's question 12 (docs/phase7-wave10.md
 * §4.1), answered A (2026-10-11, provisional): every hero the revealed card's text gives the trait to.
 */

import { trait, type AnyCard } from "@mc/content";
import { traitsOf, type EngineDeps, type GameState, type InstanceId } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { P1, P2, endTurn, firstLegal, identityOf, stackEncounterDeck } from "../testing/harness.js";
import { driveEventsPicking, withForm } from "../testing/staging.js";
import { inPlayCard, types } from "../wave9/testing.js";
import { WAVE10_CARDS } from "../wave10/cards.js";
import { CAPTAIN_MARVEL_SCENARIO, WAVE10_DEPS, civilWarGame } from "../wave10/testing.js";
import { constant, forcedInterrupt, forcedResponse, gainsTrait, on } from "./abilities.js";
import { dealDamage } from "./effects.js";
import { defineAbilities, validateDefinition } from "./validate.js";
import { grantedTo, query } from "./values.js";

vi.setConfig({ testTimeout: 120_000 });

const UNREGISTERED = trait("UNREGISTERED");
const HUNTING = "56097b";
const CONTRACTOR = "56120";
const ADVANCE = "01186";
const ASSAULT = "01187";

const huntingResponse = forcedResponse(
  on.cardRevealedGranting(UNREGISTERED, { to: query("hero"), another: true }),
  dealDamage(2, grantedTo(UNREGISTERED, query("hero"))),
);
const SCRIPTS = defineAbilities({
  "56097b.hunting-rebel-heroes-constant": constant(gainsTrait(UNREGISTERED, query("hero"))),
  "56097b.hunting-rebel-heroes-forced-response": huntingResponse,
  "56120.government-contractor-constant": constant(gainsTrait(UNREGISTERED, query("identity"))),
});
const deps: EngineDeps = { ...WAVE10_DEPS, abilities: { ...WAVE10_DEPS.abilities, ...SCRIPTS } };

/** Surgery: the main scheme on the stage whose printed B face is `code`. */
function onStage(state: GameState, code: string): GameState {
  const card = WAVE10_CARDS.find((c: AnyCard) => c.id === state.mainScheme.cardId);
  if (card?.type !== "main_scheme") throw new Error("no main scheme card");
  const stageIndex = card.stages.findIndex((stage) => (stage.printedCardId as string | undefined) === code);
  if (stageIndex < 0) throw new Error(`no stage ${code}`);
  return { ...state, mainScheme: { ...state.mainScheme, stageIndex } };
}

type Form = "hero" | "alterEgo";

/** The game on Hunting Rebel Heroes with each seat in the form given and Government Contractor about to be dealt. */
function game(forms: readonly [Form, Form]): GameState {
  let state = onStage(civilWarGame(CAPTAIN_MARVEL_SCENARIO, { twoPlayers: true, deps }), HUNTING);
  [P1, P2].forEach((player, seat) => {
    state = withForm(state, forms[seat] === "hero" ? { heroForm: 0 } : "alterEgo", player);
  });
  return stackEncounterDeck(state, ADVANCE, ASSAULT, CONTRACTOR);
}

const villainPhase = (state: GameState) => driveEventsPicking(deps, state, firstLegal, endTurn(P1), endTurn(P2));
/** The damage the main scheme dealt, as [target, amount], sorted by target. */
const schemeDamage = (state: GameState, events: ReturnType<typeof villainPhase>["events"]) =>
  types(events, "damageDealt")
    .filter((e) => e.sourceInstanceId === state.mainScheme.instanceId)
    .map((e): [InstanceId, number] => [e.targetInstanceId, e.amount])
    .sort(([a], [b]) => a.localeCompare(b));
const resolved = (events: ReturnType<typeof villainPhase>["events"]) =>
  types(events, "abilityResolved").filter((e) => e.abilityId === "56097b.hunting-rebel-heroes-forced-response").length;

describe("§3.16 Hunting Rebel Heroes: 'another card is revealed that gives 1 or more heroes the Unregistered trait'", () => {
  it("the script is plain data, and the validator accepts it", () => {
    expect(huntingResponse.trigger).toEqual({
      kind: "response",
      forced: true,
      on: {
        on: "cardRevealed",
        grantsTrait: "UNREGISTERED",
        grantedToIs: { categories: ["hero"] },
        targetIs: { self: false },
      },
    });
    expect(huntingResponse.effects).toEqual([
      {
        kind: "dealDamage",
        target: { kind: "grantedTo", trait: "UNREGISTERED", filter: { categories: ["hero"] } },
        amount: { kind: "const", value: 2 },
      },
    ]);
    expect(validateDefinition(huntingResponse)).toEqual([]);
    expect(JSON.parse(JSON.stringify(huntingResponse))).toEqual(huntingResponse);
    expect(grantedTo(UNREGISTERED)).toEqual({ kind: "grantedTo", trait: "UNREGISTERED" });
  });

  it("the validator rejects the pattern outside a response, and 'those heroes' without the pattern", () => {
    const early = forcedInterrupt(on.cardRevealedGranting(UNREGISTERED), dealDamage(2, grantedTo(UNREGISTERED)));
    expect(validateDefinition(early)).toEqual([
      "a pattern's grantsTrait is read after a card is revealed: a response on cardRevealed alone (response(on.cardRevealedGranting(…), …))",
    ]);
    const unasked = forcedResponse(on.youRevealEncounterCard(), dealDamage(2, grantedTo(UNREGISTERED)));
    expect(validateDefinition(unasked)).toEqual([
      'grantedTo("UNREGISTERED") reads the revealed card of on.cardRevealedGranting("UNREGISTERED", …): this ability\'s trigger does not ask for that trait',
    ]);
    const narrowed = forcedResponse(
      { ...on.youRevealEncounterCard(), grantedToIs: query("hero") },
      dealDamage(1, grantedTo(UNREGISTERED)),
    );
    expect(validateDefinition(narrowed)).toContain(
      "a pattern's grantedToIs narrows grantsTrait: name the trait (on.cardRevealedGranting(trait, { to }))",
    );
  });

  it("question 12 = A: Government Contractor revealed with both heroes already Unregistered deals 2 damage to each", () => {
    const start = game(["hero", "hero"]);
    const heroes = [identityOf(start, P1), identityOf(start, P2)];
    // Hunting Rebel Heroes itself already gives each hero the trait.
    expect(heroes.map((id) => traitsOf(start, id, deps).includes(UNREGISTERED))).toEqual([true, true]);
    const { state, events } = villainPhase(start);
    expect(inPlayCard(state, CONTRACTOR)).toBeDefined();
    expect(resolved(events)).toBe(1);
    expect(schemeDamage(state, events)).toEqual(
      heroes.map((id): [InstanceId, number] => [id, 2]).sort(([a], [b]) => a.localeCompare(b)),
    );
  });

  it("an identity in alter-ego form is given the trait and is not one of 'those heroes'", () => {
    const start = game(["alterEgo", "hero"]);
    const { state, events } = villainPhase(start);
    expect(inPlayCard(state, CONTRACTOR)).toBeDefined();
    expect(resolved(events)).toBe(1);
    expect(schemeDamage(state, events)).toEqual([[identityOf(state, P2), 2]]);
    expect(traitsOf(state, identityOf(state, P1), deps)).toContain(UNREGISTERED);
  });

  it("with no hero in hero form the revealed card gives no hero the trait, and the response does not trigger", () => {
    const start = game(["alterEgo", "alterEgo"]);
    const { state, events } = villainPhase(start);
    expect(inPlayCard(state, CONTRACTOR)).toBeDefined();
    expect(resolved(events)).toBe(0);
    expect(schemeDamage(state, events)).toEqual([]);
  });
});
