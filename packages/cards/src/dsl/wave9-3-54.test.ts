import { trait } from "@mc/content";
import { describe, expect, it } from "vitest";
import {
  attachCard,
  chosen,
  constant,
  countersOn,
  eachPlayer,
  encounterSetAside,
  flipCard,
  forEachPlayer,
  gainsTrait,
  identityOf,
  query,
  selectCards,
  self,
  setup,
  stateCheck,
  thatPlayer,
  validateDefinition,
  valueAtLeast,
} from "./index.js";

describe("attachCard hideReverse: '(players cannot look at the reverse sides)' (docs/phase7-wave9.md §3.54; MC55 p. 7)", () => {
  it("builds the option only when asked", () => {
    expect(attachCard(chosen("gaze"), self, { hideReverse: true })).toEqual({
      kind: "attach",
      card: { kind: "slot", slot: "gaze" },
      to: { kind: "self" },
      hideReverse: true,
    });
    expect(attachCard(chosen("gaze"), self)).toEqual({
      kind: "attach",
      card: { kind: "slot", slot: "gaze" },
      to: { kind: "self" },
    });
  });

  it("Prime Real Estate 1A (tt 55004a): a random set-aside Hypnotic Gaze to each identity, in player order", () => {
    const ability = setup(
      forEachPlayer(
        eachPlayer,
        selectCards("gaze", encounterSetAside(query([], { name: "Hypnotic Gaze" }), { random: 1 })),
        attachCard(chosen("gaze"), identityOf(thatPlayer), { hideReverse: true }),
      ),
    );
    expect(validateDefinition(ability)).toEqual([]);
    expect(ability.effects).toEqual([
      {
        kind: "forEachPlayer",
        players: { kind: "each" },
        effects: [
          {
            kind: "selectCards",
            slot: "gaze",
            cards: {
              kind: "encounterSetAside",
              filter: { name: "Hypnotic Gaze" },
              random: { kind: "const", value: 1 },
            },
          },
          {
            kind: "attach",
            card: { kind: "slot", slot: "gaze" },
            to: { kind: "identityOf", player: { kind: "scoped" } },
            hideReverse: true,
          },
        ],
      },
    ]);
  });

  it("Hypnotic Gaze (55007a to 55011a): the trait to the attached identity, and the flip with a reveal at 5 counters", () => {
    const defiant = constant(gainsTrait(trait("DEFIANT"), query("identity", { hostOfSelf: true })));
    expect(validateDefinition(defiant)).toEqual([]);
    const flip = stateCheck(
      valueAtLeast(countersOn(self, "charm"), 5),
      { kind: "removeCounters", target: self, counterType: "charm" },
      flipCard(self, { reveal: true }),
    );
    expect(validateDefinition(flip)).toEqual([]);
    expect(flip.effects.map((effect) => effect.kind)).toEqual(["removeCounters", "flipCard"]);
  });
});
