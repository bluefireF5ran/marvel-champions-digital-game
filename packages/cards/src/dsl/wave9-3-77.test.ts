/**
 * docs/phase7-wave9.md §3.77: "a different" card in a collection search (the evidence cards' Setup abilities, `aos`
 * 50185 to 50193; §4.1 Q12 = A). Wiretap 50186: "Each player may add 1 secret counter to a Board Member environment
 * to search their collection for a different Justice ally and shuffle it into their deck." The engine's own test
 * (`search-collection-different.test.ts`) plays the filter; this one pins the compiled shape and that a program
 * using it validates.
 */

import { describe, expect, it } from "vitest";
import { whenRevealed } from "./abilities.js";
import { aDifferentCard, moveCards, searchCollection } from "./effects.js";
import { validateDefinition } from "./validate.js";
import { chosen, you } from "./values.js";

describe("§3.77 a collection search for a different card", () => {
  it("aDifferentCard is the filter's own half, spread into it", () => {
    expect(aDifferentCard).toEqual({ notAmongOwnCards: true });
    expect(searchCollection({ categories: ["ally"], aspects: ["justice"], ...aDifferentCard }, "found", you)).toEqual({
      kind: "searchCollection",
      player: { kind: "controller" },
      filter: { categories: ["ally"], aspects: ["justice"], notAmongOwnCards: true },
      bind: "found",
    });
  });

  it("search, then shuffle the card found into the deck: the slot is bound for the move", () => {
    const definition = whenRevealed([
      searchCollection({ categories: ["upgrade"], aspects: ["protection"], ...aDifferentCard }, "found"),
      moveCards({ kind: "ref", ref: chosen("found") }, "deckShuffle"),
    ]);
    expect(validateDefinition(definition)).toEqual([]);
  });
});
