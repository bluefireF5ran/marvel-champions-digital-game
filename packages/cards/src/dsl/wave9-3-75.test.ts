/**
 * docs/phase7-wave9.md §3.75 (b): the DSL builders for a campaign game's envelopes. `seedHiddenPiles` fills the hidden
 * piles from the campaign log (MC50 p. 19: "Set the A.I.M. and S.H.I.E.L.D. envelopes aside so that you can access
 * them during the scenario"), and `inCampaign` is the printed "If not playing campaign mode" / "(1 card instead in
 * campaign mode)" of Zemo's Manipulations (`aos` 50167a/b). The engine's own test (`campaign/sealed-draw.test.ts`)
 * plays them; this one pins the compiled shapes and the validator.
 */

import { describe, expect, it } from "vitest";
import { whenRevealed } from "./abilities.js";
import { dealHiddenPiles, gainFromHiddenPile, ifThen, seedHiddenPiles } from "./effects.js";
import { validateDefinition } from "./validate.js";
import { ifElse, inCampaign, not } from "./values.js";

describe("§3.75 the envelopes of a campaign game", () => {
  it("seedHiddenPiles compiles each pile to the log field it is read from", () => {
    expect(seedHiddenPiles({ aim: "aimEnvelope" }, "evidence", { set: "syn-evidence", to: "shield" })).toEqual({
      kind: "seedHiddenPiles",
      piles: { aim: { campaignLogField: "aimEnvelope" } },
      revealed: { campaignLogField: "evidence" },
      rest: { set: "syn-evidence", to: "shield" },
    });
  });

  it("inCampaign compiles, and gates a deal and a gain the way the card prints them", () => {
    expect(inCampaign).toEqual({ kind: "inCampaign" });
    const setup = whenRevealed([
      ifThen(not(inCampaign), [dealHiddenPiles("syn-evidence", { onePerGroupTo: "aim", restTo: "shield" })]),
      gainFromHiddenPile("shield", ifElse(inCampaign, 1, 2)),
    ]);
    expect(validateDefinition(setup)).toEqual([]);
  });

  it("the validator refuses a seed with no pile, a pile named twice and a nameless field or set", () => {
    const problemsOf = (...args: Parameters<typeof seedHiddenPiles>) =>
      validateDefinition(whenRevealed([seedHiddenPiles(...args)]));
    expect(problemsOf({ aim: "aimEnvelope" }, "evidence", { set: "syn-evidence", to: "shield" })).toEqual([]);
    expect(problemsOf({}, "evidence", { set: "syn-evidence", to: "shield" })).toEqual([
      "seedHiddenPiles: names no pile to fill from the campaign log",
    ]);
    expect(problemsOf({ shield: "aimEnvelope" }, "evidence", { set: "syn-evidence", to: "shield" })).toEqual([
      "seedHiddenPiles: rest.to must not be one of the piles filled from the campaign log",
    ]);
    expect(problemsOf({ aim: "" }, "evidence", { set: "", to: "shield" })).toEqual([
      "seedHiddenPiles: names no encounter set for the rest of the cards",
      "seedHiddenPiles: a campaign log field has no name",
    ]);
    expect(problemsOf({ aim: "aimEnvelope" }, "evidence", { set: "syn-evidence", to: "" })).toEqual([
      "seedHiddenPiles: a pile has no name",
    ]);
  });
});
