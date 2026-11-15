/**
 * docs/phase7-wave9.md §3.46 (b): `paidCards`, the cards that paid for a play (the engine's slot `paid.cards`): "tuck 1
 * card used to pay for her under her" (Spectrum, `falcon` 53018). The engine's `paid-cards-slot.test.ts` drives the
 * plain data.
 */

import { PAID_CARDS_SLOT, PAID_IN_PLAY_CARDS_SLOT } from "@mc/engine";
import { describe, expect, it } from "vitest";
import { after, constant, gets, response } from "./abilities.js";
import { anyOfCards, chooseCards, cards, tuckCards, zone } from "./effects.js";
import {
  chosen,
  eachPlayer,
  PAID_CARDS,
  paidCards,
  paidInPlayCards,
  query,
  refCount,
  self,
  tuckedCount,
  valueAtLeast,
} from "./values.js";
import { validateDefinition } from "./validate.js";

describe("§3.46 (b) `paidCards`", () => {
  it("is the engine's slot `paid.cards`", () => {
    expect(PAID_CARDS).toBe(PAID_CARDS_SLOT);
    expect(PAID_CARDS).toBe("paid.cards");
    expect(paidCards).toEqual({ kind: "slot", slot: "paid.cards" });
    expect(refCount(paidCards)).toEqual({ kind: "refCount", of: { kind: "slot", slot: "paid.cards" } });
  });

  it("validates in a response to the play: choose one still in a discard pile and tuck it under this card", () => {
    const definition = response(
      after.youPlayThis(),
      chooseCards("tucked", zone("discard", eachPlayer, { filter: { inSlot: PAID_CARDS } }), { min: 1, max: 1 }),
      tuckCards(cards(chosen("tucked")), self),
    );
    expect(definition.effects[0]).toMatchObject({
      kind: "chooseCards",
      from: { kind: "zone", zone: "discard", player: { kind: "each" }, filter: { inSlot: "paid.cards" } },
    });
    expect(validateDefinition(definition)).toEqual([]);
  });

  // Owner decision 2026-11-15 (#525 item 11), replacing §3.46 (b) on this point; ruling Aug 22, 2025.
  it("`paidInPlayCards` is the engine's slot `paid.inPlayCards`, the cards in play whose resource ability paid", () => {
    expect(paidInPlayCards).toEqual({ kind: "slot", slot: PAID_IN_PLAY_CARDS_SLOT });
    expect(PAID_IN_PLAY_CARDS_SLOT).toBe("paid.inPlayCards");
  });

  it("validates a tuck offering both kinds of payer, with a note the prompt carries", () => {
    const definition = response(
      after.youPlayThis(),
      chooseCards(
        "tucked",
        anyOfCards(zone("discard", eachPlayer, { filter: { inSlot: PAID_CARDS } }), cards(paidInPlayCards)),
        { min: 1, max: 1, note: "A tucked card is out of play." },
      ),
      tuckCards(cards(chosen("tucked")), self),
    );
    expect(definition.effects[0]).toMatchObject({
      kind: "chooseCards",
      from: { kind: "anyOf" },
      note: "A tucked card is out of play.",
    });
    expect(validateDefinition(definition)).toEqual([]);
  });

  it("a constant reads the tucked card's printed resources", () => {
    const definition = constant(
      gets("thw", 2, query("ally", { self: true }), {
        while: valueAtLeast(tuckedCount(self, { anyPrintedResource: ["mental", "wild"] }), 1),
      }),
    );
    expect(validateDefinition(definition)).toEqual([]);
  });
});
