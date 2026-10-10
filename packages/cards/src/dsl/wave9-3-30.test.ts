/**
 * docs/phase7-wave9.md §3.30: the builders for a hero from the collection in play as a minion (Reluctant Foe, `aos`
 * 50171: "Treat attached hero as an Elite minion with SCH equal to its printed THW. Replace its printed text box with:
 * 'Villainous. When Defeated: Remove this hero and Reluctant Foe from the game.' When Revealed: Search your collection
 * for a hero whose title does not match a character in play and put it into play engaged with you. Attach this card
 * to it."). The engine's `hero-as-minion.test.ts` drives the same plain data.
 */

import { trait } from "@mc/content";
import { describe, expect, it } from "vitest";
import {
  constant,
  gainsAbility,
  gainsKeyword,
  treatAttachedHeroAsMinion,
  whenDefeated,
  whenRevealed,
} from "./abilities.js";
import { cards, heroNoCharacterIsTitledAs, moveCards, putIntoPlayAsHost, searchCollection } from "./effects.js";
import { validateDefinition } from "./validate.js";
import { chosen, each, query, self } from "./values.js";

const ELITE = trait("ELITE");
const attached = { hostOfSelf: true } as const;

describe("§3.30 a hero from the collection in play as a minion", () => {
  it("the constant: the treatment, villainous for the host, and the host's When Defeated", () => {
    const definition = constant(
      treatAttachedHeroAsMinion([ELITE]),
      gainsKeyword({ name: "villainous" }, attached),
      gainsAbility("x.when-defeated", { to: attached }),
    );
    expect(definition.trigger).toEqual({
      kind: "constant",
      keywordGrants: [{ keyword: { name: "villainous" }, target: { hostOfSelf: true } }],
      rules: [
        { kind: "treatHostAsMinion", traits: [ELITE], schFromThw: true, keepPrintedTraits: true },
        { kind: "gainsAbility", abilityId: "x.when-defeated", to: { hostOfSelf: true } },
      ],
    });
    expect(validateDefinition(definition)).toEqual([]);
  });

  it("the When Revealed: the collection search by hero title, then the hero enters play as this card's host", () => {
    const definition = whenRevealed(
      searchCollection(heroNoCharacterIsTitledAs, "hero"),
      putIntoPlayAsHost(chosen("hero")),
    );
    expect(definition.effects).toEqual([
      { kind: "searchCollection", player: { kind: "controller" }, filter: { heroTitleNotInPlay: true }, bind: "hero" },
      {
        kind: "putIntoPlayAsHost",
        card: { kind: "slot", slot: "hero" },
        attachment: { kind: "self" },
        engagedWith: { kind: "controller" },
      },
    ]);
    expect(validateDefinition(definition)).toEqual([]);
  });

  it("`putIntoPlayAsHost` names another attachment or player, and binds what entered play", () => {
    const effect = putIntoPlayAsHost(chosen("hero"), {
      attachment: chosen("card"),
      engagedWith: { kind: "firstPlayer" },
      bind: "foe",
    });
    expect(effect).toEqual({
      kind: "putIntoPlayAsHost",
      card: { kind: "slot", slot: "hero" },
      attachment: { kind: "slot", slot: "card" },
      engagedWith: { kind: "firstPlayer" },
      bind: "foe",
    });
  });

  it("the host's When Defeated: the attachment by name on the hero, then the hero, out of the game", () => {
    const definition = whenDefeated(
      moveCards(cards(each(query("attachment", { name: "Reluctant Foe", host: self }))), "removedFromGame"),
      moveCards(cards(self), "removedFromGame"),
    );
    expect(validateDefinition(definition)).toEqual([]);
  });
});
