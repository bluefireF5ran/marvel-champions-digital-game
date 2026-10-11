import { trait } from "@mc/content";
import { describe, expect, it } from "vitest";
import {
  addCounters,
  alterEgoAction,
  discard,
  discardFromHand,
  draw,
  each,
  exhaustThis,
  forcedAction,
  identityOf,
  query,
  ready,
  self,
  validateDefinition,
  you,
} from "./index.js";

/** "The Enchantment card in your play area": the Enchantment attached to your identity. */
const yourEnchantment = each(query("attachment", { trait: trait("ENCHANTMENT"), host: identityOf(you) }));

describe("forcedAction: 'Forced Action:' (docs/phase7-wave9.md §3.53; RRG 1.8 'Action' p. 6, 'Forced Action' p. 20)", () => {
  it("builds an action trigger marked forced, with its cost", () => {
    const ability = forcedAction({ cost: exhaustThis }, draw(1));
    expect(ability.trigger).toEqual({ kind: "action", forced: true });
    expect(ability.cost).toEqual({ exhaustSelf: true });
    expect(validateDefinition(ability)).toEqual([]);
  });

  it("is an ordinary action otherwise: the Alter-Ego Action beside it is not forced", () => {
    const out = alterEgoAction({ cost: exhaustThis }, discard(self));
    expect(out.trigger).toEqual({ kind: "action", form: "alterEgo" });
  });

  it("Kiss of Temptation (tt 55013) and Love Concoction (55014): the counter first, then the rest", () => {
    const kiss = forcedAction(
      { cost: exhaustThis },
      addCounters("charm", 1, yourEnchantment),
      draw(1),
      discardFromHand(1),
    );
    expect(validateDefinition(kiss)).toEqual([]);
    expect(kiss.effects.map((effect) => effect.kind)).toEqual(["addCounters", "draw", "discardFromHand"]);
    const concoction = forcedAction(
      { cost: exhaustThis },
      addCounters("charm", 1, yourEnchantment),
      ready(identityOf(you)),
    );
    expect(validateDefinition(concoction)).toEqual([]);
    expect(concoction.trigger).toMatchObject({ kind: "action", forced: true });
  });
});
