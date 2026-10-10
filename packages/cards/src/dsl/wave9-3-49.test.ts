import { trait } from "@mc/content";
import { describe, expect, it } from "vitest";
import {
  boost,
  chooseCards,
  chosen,
  constant,
  countOf,
  discard,
  encounterCards,
  enemyActivates,
  exhaustCardsCost,
  find,
  forcedInterrupt,
  forcedResponse,
  gainsTrait,
  gets,
  heroAction,
  host,
  ifThen,
  modifyAttack,
  named,
  not,
  on,
  placeThreat,
  preventDamage,
  query,
  replaceAttachHost,
  revealCard,
  self,
  shuffleEncounterDeck,
  statOf,
  surge,
  validateDefinition,
  varAtLeast,
  whenRevealed,
  you,
} from "./index.js";

const TECH = trait("TECH");
const AERIAL = trait("AERIAL");
const ATTACHED_ENEMY = query("enemy", { hostOfSelf: true });
const TECH_BOUND_FOR_THE_VILLAIN = on.cardWouldBeAttached(
  query("attachment", { trait: TECH, scenarioSpecific: false }),
  { to: query("villain") },
);

describe("docs/phase7-wave9.md §3.49: an attachment bound for the villain attached to another enemy", () => {
  it("on.cardWouldBeAttached: the card is the source, the host it is bound for the target", () => {
    expect(TECH_BOUND_FOR_THE_VILLAIN).toEqual({
      on: "cardAttached",
      sourceIs: { categories: ["attachment"], trait: TECH, scenarioSpecific: false },
      targetIs: { categories: ["villain"] },
    });
    expect(on.cardWouldBeAttached(query("attachment"))).toEqual({
      on: "cardAttached",
      sourceIs: { categories: ["attachment"] },
    });
  });

  it("replaceAttachHost: the new host, and whether 'the villain' on the card becomes it", () => {
    expect(replaceAttachHost(self)).toEqual({ kind: "replaceAttachHost", to: { kind: "self" } });
    expect(replaceAttachHost(self, { villainAlias: true })).toEqual({
      kind: "replaceAttachHost",
      to: { kind: "self" },
      villainAlias: true,
    });
  });

  it("Fixer (falcon 53038): a forced interrupt that sends the attachment to itself", () => {
    const fixer = forcedInterrupt(TECH_BOUND_FOR_THE_VILLAIN, replaceAttachHost(self, { villainAlias: true }));
    expect(validateDefinition(fixer)).toEqual([]);
    expect(fixer.trigger).toMatchObject({ kind: "interrupt", forced: true });
  });

  it("replaceAttachHost is refused anywhere but an interrupt to an attach about to happen", () => {
    const wanted = /replaceAttachHost needs an interrupt on an attach about to happen/;
    expect(validateDefinition(heroAction(replaceAttachHost(self)))[0]).toMatch(wanted);
    expect(
      validateDefinition(forcedResponse(on.cardAttached(query("attachment")), replaceAttachHost(self)))[0],
    ).toMatch(wanted);
    expect(validateDefinition(forcedInterrupt(on.entersPlay("self"), replaceAttachHost(self)))[0]).toMatch(wanted);
  });
});

describe("the rest of the Techno set (falcon 53039–53042) from builders that already exist", () => {
  it("Jet Pack (53039): Aerial for the attached enemy; 3 or more damage is prevented and the card discarded", () => {
    expect(validateDefinition(constant(gainsTrait(AERIAL, ATTACHED_ENEMY)))).toEqual([]);
    const interrupt = forcedInterrupt(
      { ...on.damage("host"), eventAtLeast: { amount: 3 } },
      preventDamage(),
      discard(self),
    );
    expect(validateDefinition(interrupt)).toEqual([]);
  });

  it("Tech-Pac (53040): +1 ATK for each other Tech attachment; a cost with a combined THW above the enemy's SCH", () => {
    const others = query("attachment", { trait: TECH, host, self: false });
    expect(validateDefinition(constant(gets("atk", countOf(others), ATTACHED_ENEMY)))).toEqual([]);
    const cost = exhaustCardsCost(query(["identity", "ally"]), {
      max: "any",
      combined: { stat: "thw", moreThan: statOf(host, "sch") },
    });
    expect(cost).toEqual({
      exhaustCards: {
        slot: "exhausted",
        query: { categories: ["identity", "ally"] },
        min: 1,
        combined: { stat: "thw", moreThan: { kind: "stat", of: { kind: "host" }, stat: "sch" } },
      },
    });
    expect(validateDefinition(heroAction({ cost }, discard(self)))).toEqual([]);
    expect(() => exhaustCardsCost(query("ally"), { each: true, combined: { stat: "thw", moreThan: 1 } })).toThrow(
      /combined/,
    );
  });

  it("Technological Innovation (53041) and Techno (53042)", () => {
    const innovation = whenRevealed(
      chooseCards("found", encounterCards(["deck", "discard"], query("attachment", { trait: TECH })), {
        min: 1,
        max: 1,
      }),
      revealCard(chosen("found"), you),
      shuffleEncounterDeck(),
      placeThreat(countOf(query([], { trait: TECH })), self),
    );
    expect(validateDefinition(innovation)).toEqual([]);
    const techno = whenRevealed(
      revealCard(find(query("minion", { name: "Fixer" })), you),
      enemyActivates(named("Fixer"), { against: you, bind: "activated" }),
      ifThen(not(varAtLeast("activated.made")), surge()),
    );
    expect(validateDefinition(techno)).toEqual([]);
    expect(validateDefinition(boost(modifyAttack({ keywords: ["piercing"] })))).toEqual([]);
  });
});
