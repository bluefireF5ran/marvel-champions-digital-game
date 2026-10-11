import { describe, expect, it } from "vitest";
import {
  attachCard,
  attackableAsMinion,
  boost,
  chosen,
  constant,
  damageOn,
  dealDamage,
  discard,
  encounterCards,
  enemyActivates,
  eventTarget,
  exhaust,
  find,
  forcedResponse,
  hasStatus,
  host,
  ifThen,
  named,
  not,
  on,
  oneCopyOf,
  query,
  refCount,
  revealCard,
  rule,
  selectCards,
  self,
  shuffleEncounterDeck,
  stateCheck,
  stun,
  sum,
  surge,
  takeDamage,
  validateDefinition,
  valueAtLeast,
  varAtLeast,
  whenRevealed,
  you,
  yourIdentity,
} from "./index.js";

describe("attackableAsMinion: 'any player can attack this card as if it were a minion' (docs/phase7-wave9.md §3.50)", () => {
  it("builds the rule over this card by default, or over the cards named", () => {
    expect(attackableAsMinion()).toEqual({ rules: [{ kind: "attackableAsMinion", card: { self: true } }] });
    expect(attackableAsMinion(query("attachment", { hostOfSelf: false }))).toEqual({
      rules: [{ kind: "attackableAsMinion", card: { categories: ["attachment"], hostOfSelf: false } }],
    });
  });

  it("Encased in Ice (winter 54035): the two rules, and the state check that moves all but 3 damage", () => {
    const rules = constant(
      rule({ kind: "cannotAttack", attacker: { hostOfSelf: true }, target: query("enemy", { self: false }) }),
      attackableAsMinion(),
    );
    expect(validateDefinition(rules)).toEqual([]);
    expect(rules.trigger).toMatchObject({
      kind: "constant",
      rules: [{ kind: "cannotAttack" }, { kind: "attackableAsMinion" }],
    });
    const check = stateCheck(valueAtLeast(damageOn(self), 3), dealDamage(sum(damageOn(self), -3), host), discard(self));
    expect(validateDefinition(check)).toEqual([]);
  });
});

describe("the rest of the Whiteout set (winter 54034, 54036, 54037) from builders that already exist", () => {
  it("Blizzard (54034): after it attacks, Encased in Ice from the deck or discard pile, otherwise a stunned card", () => {
    const blizzard = forcedResponse(
      on.enemyAttacks("self"),
      selectCards("found", oneCopyOf(encounterCards(["deck", "discard"], { name: "Encased in Ice" }))),
      ifThen(valueAtLeast(refCount(chosen("found")), 1), attachCard(chosen("found"), eventTarget), stun(eventTarget)),
      shuffleEncounterDeck(),
    );
    expect(validateDefinition(blizzard)).toEqual([]);
  });

  it("Slippery Conditions (54036) and Whiteout (54037)", () => {
    expect(validateDefinition(forcedResponse(on.entersPlay(query("ally")), exhaust(eventTarget)))).toEqual([]);
    const whiteout = whenRevealed(
      revealCard(find(query("minion", { name: "Blizzard" })), you),
      enemyActivates(named("Blizzard"), { against: you, bind: "activated" }),
      ifThen(not(varAtLeast("activated.made")), surge()),
    );
    expect(validateDefinition(whiteout)).toEqual([]);
    expect(
      validateDefinition(boost(ifThen(hasStatus(yourIdentity, "stunned"), takeDamage(1), stun(yourIdentity)))),
    ).toEqual([]);
  });
});
