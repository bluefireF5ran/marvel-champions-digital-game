/**
 * docs/phase7-wave9.md §3.74 (b): the DSL builders for reading a `cardState` campaign-log field inside a game, and the
 * validator's checks on the raw shape. MC50 p. 11: "Place secret counters on each Board Member environment equal to
 * the number of secret counters recorded for that environment"; p. 6: "once a board member flips to its attachment
 * side, it remains an attachment for the rest of the campaign."
 */

import { cardId } from "@mc/content";
import { CAMPAIGN_LOG_FRONT_FACE } from "@mc/engine";
import { describe, expect, it } from "vitest";
import { whenRevealed } from "./abilities.js";
import { addCounters, flipCard, ifThen } from "./effects.js";
import { validateDefinition } from "./validate.js";
import { campaignLogCardCounter, campaignLogCardRecorded, each, eachPlayer, query } from "./values.js";

describe("§3.74 reading a cardState field", () => {
  it("compiles the recorded counter of one card", () => {
    expect(campaignLogCardCounter("secrets1", "syn-officer-a", "secret")).toEqual({
      kind: "campaignLog",
      field: "secrets1",
      card: "syn-officer-a",
      counter: "secret",
    });
    expect(campaignLogCardCounter("perSeat", "syn-officer-a", "secret", { seat: eachPlayer })).toEqual({
      kind: "campaignLog",
      field: "perSeat",
      card: "syn-officer-a",
      counter: "secret",
      seat: { kind: "each" },
    });
  });

  it("compiles recorded at all, on a named face, and on the front face", () => {
    expect(campaignLogCardRecorded("secrets1", "syn-officer-a")).toEqual({
      kind: "campaignLog",
      field: "secrets1",
      card: "syn-officer-a",
    });
    expect(campaignLogCardRecorded("secrets1", "syn-officer-a", "syn-officer-b")).toEqual({
      kind: "campaignLog",
      field: "secrets1",
      card: "syn-officer-a",
      face: "syn-officer-b",
    });
    expect(campaignLogCardRecorded("secrets1", "syn-officer-a", CAMPAIGN_LOG_FRONT_FACE)).toMatchObject({
      face: "front",
    });
  });

  it("the board bullet for one member validates: the recorded counters, then the recorded face", () => {
    const member = each(query("environment", { printedId: cardId("syn-officer-a") }));
    const definition = whenRevealed([
      addCounters("secret", campaignLogCardCounter("secrets1", "syn-officer-a", "secret"), member),
      ifThen(campaignLogCardRecorded("secrets1", "syn-officer-a", "syn-officer-b"), [
        flipCard(member, { keepCounters: ["secret"] }),
      ]),
    ]);
    expect(validateDefinition(definition)).toEqual([]);
  });

  it("the validator refuses a counter or a face read that names no card, and the two together", () => {
    const withAmount = (amount: object) =>
      whenRevealed([addCounters("secret", amount as ReturnType<typeof campaignLogCardCounter>)]);
    expect(validateDefinition(withAmount({ kind: "campaignLog", field: "secrets1", counter: "secret" }))).toEqual([
      expect.stringContaining("a campaignLog counter read names no card"),
    ]);
    expect(
      validateDefinition(withAmount({ kind: "campaignLog", field: "secrets1", card: "syn-officer-a", counter: "" })),
    ).toEqual([expect.stringContaining("names no counter")]);
    const withCondition = (condition: object) =>
      whenRevealed([ifThen(condition as ReturnType<typeof campaignLogCardRecorded>, [])]);
    expect(
      validateDefinition(withCondition({ kind: "campaignLog", field: "secrets1", face: "syn-officer-b" })),
    ).toEqual([expect.stringContaining("a campaignLog face read names no card")]);
    expect(
      validateDefinition(
        withCondition({
          kind: "campaignLog",
          field: "secrets1",
          card: "syn-officer-a",
          face: "syn-officer-b",
          counter: "secret",
        }),
      ),
    ).toEqual([expect.stringContaining("not both")]);
  });
});
