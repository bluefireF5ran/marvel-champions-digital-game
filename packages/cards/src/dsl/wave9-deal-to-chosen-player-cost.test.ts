/**
 * `dealEncounterCardsToChosenPlayerCost`: "Hero Action: Exhaust Aerial Recon and deal a player 1 facedown encounter
 * card → place 1 recon counter here." (Aerial Recon, `falcon` 53009.) The engine's
 * `deal-to-chosen-player-cost.test.ts` drives the plain data.
 */

import { describe, expect, it } from "vitest";
import { dealEncounterCardsToChosenPlayerCost, exhaustThis, heroAction, response, after } from "./abilities.js";
import { addCounters, draw } from "./effects.js";
import { validateDefinition } from "./validate.js";
import { chosen, controllerOf } from "./values.js";

describe("`dealEncounterCardsToChosenPlayerCost`", () => {
  it("builds the cost beside an exhaust, and binds the picked player's identity for the effects", () => {
    const definition = heroAction(
      { cost: [exhaustThis, dealEncounterCardsToChosenPlayerCost()] },
      addCounters("recon", 1),
      draw(1, controllerOf(chosen("dealtPlayer"))),
    );
    expect(definition.cost).toEqual({ exhaustSelf: true, dealEncounterCardsTo: { count: 1, slot: "dealtPlayer" } });
    expect(validateDefinition(definition)).toEqual([]);
  });

  it("takes a count and a slot name", () => {
    expect(dealEncounterCardsToChosenPlayerCost(2, "victim")).toEqual({
      dealEncounterCardsTo: { count: 2, slot: "victim" },
    });
  });

  it("is refused with a count below 1, with no slot, and on an ability that is not an action", () => {
    const zero = heroAction({ cost: dealEncounterCardsToChosenPlayerCost(0) }, draw(1));
    expect(validateDefinition(zero)).toContain("cost dealEncounterCardsTo: count must be a whole number of at least 1");
    const unnamed = heroAction({ cost: dealEncounterCardsToChosenPlayerCost(1, "") }, draw(1));
    expect(validateDefinition(unnamed)).toContain("cost dealEncounterCardsTo: needs a slot for the player's identity");
    const windowed = response(
      after.phaseBeginning("villain"),
      { cost: dealEncounterCardsToChosenPlayerCost() },
      draw(1),
    );
    expect(validateDefinition(windowed)).toContain(
      "cost dealEncounterCardsTo: only on an action (a window cannot ask which player is dealt the card)",
    );
  });
});
