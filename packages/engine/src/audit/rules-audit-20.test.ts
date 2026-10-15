/**
 * Rules audit chunk 20 (Appendix IV FAQ: GENERAL QUESTIONS ... QUICKSILVER). Audit proofs only: each `it.fails` marks a
 * place the engine does something the FAQ forbids, and flips to a failure when it is fixed.
 *
 * RRG 1.8 Appendix IV FAQ, "Q: Can Jennifer Walters remove threat from a side scheme as it enters play?" (printed p. 57):
 * "No. Side schemes enter play with threat already on them, meaning threat is not 'placed' at this point." The engine
 * enters a side scheme with a `placeThreat` event frame (`enter-play.ts` `enterPlayOnReveal`), the same event a
 * "When threat would be placed on a scheme" interrupt (I Object!) matches, so the interrupt is offered and prevents it.
 */
import { flat } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityDefinition } from "../abilities.js";
import type { Command } from "../commands.js";
import { playerId } from "../ids.js";
import type { GameState } from "../state.js";
import { depsOf, stubAbility } from "../testing/abilities.js";
import { stubIdentity, stubMainScheme, stubSideScheme, stubTreachery, stubVillain } from "../testing/fixtures.js";
import { newGame, runWith, settle, defaultPick } from "../testing/scenario.js";

const p1 = playerId("p1");
const def = (definition: AbilityDefinition) => definition;
const endTurn: Command = { type: "endTurn", playerId: p1 };

const iObject = stubAbility(
  "i-object",
  def({
    trigger: { kind: "interrupt", forced: false, form: "alterEgo", on: { on: "placeThreat" } },
    effects: [{ kind: "preventThreat", amount: { kind: "const", value: 1 } }],
  }),
);
const identity = stubIdentity({
  id: "walters",
  hp: 15,
  atk: 3,
  thw: 1,
  def: 2,
  rec: 5,
  heroHandSize: 4,
  alterEgoHandSize: 6,
  alterEgoAbilities: [iObject.ref],
});
const VILLAIN = stubVillain({ id: "villain", stages: [{ hp: flat(30), atk: 0, sch: 0 }] });
const SCHEME = stubMainScheme({
  id: "scheme",
  stages: [{ startingThreat: flat(5), targetThreat: flat(40), acceleration: flat(0) }],
});
const SIDE = stubSideScheme({ id: "side", startingThreat: 3 });
const BLANK = stubTreachery({ id: "blank", boostIcons: 0 });

describe("I Object! against a side scheme entering play (RRG 1.8 App. IV FAQ, Jennifer Walters, p. 57)", () => {
  it.fails("is not offered: a side scheme enters with its threat, nothing is 'placed'", () => {
    const deps = depsOf(iObject);
    const state = newGame({
      villain: VILLAIN,
      mainScheme: SCHEME,
      identity,
      extraCards: [BLANK, SIDE],
      encounterDeck: [SIDE.id, ...Array.from({ length: 19 }, () => BLANK.id)],
      deps,
    });
    // Always take the I Object! option when it is offered; otherwise the default answer.
    const takeIObject = (s: GameState): readonly string[] => {
      const choice = s.pendingChoice;
      if (choice?.prompt.kind === "chooseTriggers") {
        const option = choice.options.find((o) => o.optionId.includes("i-object") || o.optionId.includes(":"));
        if (option) return [option.optionId];
      }
      return defaultPick(s);
    };
    const after = settle(runWith(deps, state, endTurn), takeIObject, deps);
    const side = Object.values(after.instances).find((i) => i.cardId === SIDE.id);
    expect(side).toBeDefined();
    expect(side?.threat).toBe(3);
  });
});
