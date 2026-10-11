/**
 * `putLinkedAllyIntoPlay` (docs/phase7-wave9.md §3.57): "When Defeated: The player who defeated this minion puts the
 * set-aside Titania ally into play under their control." (Titania 55057, `tt`.) The engine's `linked-encounter.test.ts`
 * drives the plain data: the set-aside at setup and the take.
 */

import { describe, expect, it } from "vitest";
import { constant, excludedFromAllyLimit, whenDefeated } from "./abilities.js";
import { putLinkedAllyIntoPlay } from "./effects.js";
import { validateDefinition } from "./validate.js";
import { defeatingPlayer, firstPlayer, playerOrElse, query } from "./values.js";

describe("`putLinkedAllyIntoPlay`", () => {
  it("selects the set-aside ally sharing this card's title and puts it into play under the defeating player", () => {
    const definition = whenDefeated(putLinkedAllyIntoPlay(defeatingPlayer));
    expect(definition.effects).toEqual([
      {
        kind: "selectCards",
        slot: "linkedAlly",
        cards: { kind: "encounterSetAside", filter: { categories: ["ally"], sharesTitleWith: { kind: "self" } } },
      },
      { kind: "putIntoPlay", card: { kind: "slot", slot: "linkedAlly" }, controller: { kind: "defeatingPlayer" } },
    ]);
    expect(validateDefinition(definition)).toEqual([]);
  });

  it("takes a fallback player and a slot name", () => {
    const [, put] = putLinkedAllyIntoPlay(playerOrElse(defeatingPlayer, firstPlayer), "ally");
    expect(put).toMatchObject({ kind: "putIntoPlay", card: { kind: "slot", slot: "ally" } });
  });

  it("the ally's own constant: it does not count against the ally limit", () => {
    const rule = constant(excludedFromAllyLimit(query("ally", { self: true })));
    expect(validateDefinition(rule)).toEqual([]);
  });
});
