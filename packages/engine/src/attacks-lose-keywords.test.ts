/**
 * "Attacks against them lose piercing" (docs/phase7-wave10.md §3.18; Cap's Shield, `cw` 56143): `RuleSpec
 * attacksLoseKeywords`. While it applies, an attack does not have the keyword against a character matching `target`,
 * whatever gave it. RRG 1.8 "Lose" (p. 27): "A lost characteristic cannot be regained while the ability causing it to
 * be lost is in effect, even if a new effect would cause the characteristic to be gained." "Piercing" (p. 32):
 * "Before this attack deals damage to a character, discard each tough status card from that character." "Tough"
 * (p. 44); "Overkill" (p. 31); "Ranged" (p. 35) and "Retaliate X" (p. 38). Synthetic cards only.
 */

import { flat, type CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps, RuleSpec } from "./abilities.js";
import type { Command } from "./commands.js";
import { replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { attackKeywordsOf } from "./keywords.js";
import { mustInstance, mustPlayer } from "./query.js";
import { cardsInPlay } from "./select.js";
import type { AttackKeyword, TargetQuery } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommands } from "./testing/drive.js";
import { stubAttachment, stubEvent, stubMainScheme, stubMinion, stubSupport, stubVillain } from "./testing/fixtures.js";
import { giveCard } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, minionEngagedWith, P1, playerCardIntoPlay } from "./testing/wave3.js";

const HOST: TargetQuery = { hostOfSelf: true };
const constant = (id: string, part: Omit<Extract<AbilityDefinition["trigger"], { kind: "constant" }>, "kind">) =>
  stubAbility(`${id}.constant`, { trigger: { kind: "constant", ...part }, effects: [] });
const loses = (keywords: readonly AttackKeyword[]): RuleSpec => ({
  kind: "attacksLoseKeywords",
  keywords,
  target: HOST,
});

/** "Attacks against attached character lose piercing." */
const WARD_CONSTANT = constant("ward", { rules: [loses(["piercing"])] });
const WARD = stubAttachment({ id: "ward", abilities: [WARD_CONSTANT.ref] });
/** "Attacks against attached character lose overkill and ranged." */
const ANCHOR_CONSTANT = constant("anchor", { rules: [loses(["overkill", "ranged"])] });
const ANCHOR = stubAttachment({ id: "anchor", abilities: [ANCHOR_CONSTANT.ref] });
/** "Attached character gains retaliate 1." */
const THORNS_CONSTANT = constant("thorns", {
  keywordGrants: [{ keyword: { name: "retaliate", value: 1 }, target: HOST }],
});
const THORNS = stubAttachment({ id: "thorns", abilities: [THORNS_CONSTANT.ref] });

/** "The villain's attacks gain piercing." (Venom's shape: a rule, not the villain's own keyword.) */
const FANGS_CONSTANT = constant("fangs", {
  rules: [{ kind: "attackKeywords", keywords: ["piercing"], attacker: { categories: ["villain"] } }],
});
const FANGS = stubSupport({ id: "fangs", cost: 0, abilities: [FANGS_CONSTANT.ref] });
const yourBasicAttacksGain = (id: string, keywords: readonly AttackKeyword[], atk = 0) =>
  constant(id, {
    ...(atk > 0 ? { modifiers: [{ stat: "atk" as const, amount: atk, target: { categories: ["identity"] } }] } : {}),
    rules: [{ kind: "attackKeywords", keywords, attacker: { categories: ["identity"] }, basicOnly: true }],
  });
/** "Your basic attacks gain piercing." */
const CLAWS_CONSTANT = yourBasicAttacksGain("claws", ["piercing"]);
const CLAWS = stubSupport({ id: "claws", cost: 0, abilities: [CLAWS_CONSTANT.ref] });
/** "You get +1 ATK. Your basic attacks gain overkill." */
const MAUL_CONSTANT = yourBasicAttacksGain("maul", ["overkill"], 1);
const MAUL = stubSupport({ id: "maul", cost: 0, abilities: [MAUL_CONSTANT.ref] });
/** "Your basic attacks gain ranged." */
const BOW_CONSTANT = yourBasicAttacksGain("bow", ["ranged"]);
const BOW = stubSupport({ id: "bow", cost: 0, abilities: [BOW_CONSTANT.ref] });
/** "Hero Action (attack): Deal 3 damage to the villain. This attack gains piercing." */
const LANCE_ACTION = stubAbility("lance.action", {
  trigger: { kind: "action" },
  label: ["attack"],
  effects: [
    { kind: "attack", target: { kind: "villain" }, amount: { kind: "const", value: 3 }, keywords: ["piercing"] },
  ],
});
const LANCE = stubEvent({ id: "lance", cost: 0, abilities: [LANCE_ACTION.ref] });

/** ATK 2, the keyword printed on the villain itself when asked. */
const villainCard = (id: string, piercing: boolean) =>
  stubVillain({
    id,
    stages: [{ hp: flat(30), atk: 2, sch: 0, ...(piercing ? { keywords: [{ name: "piercing" as const }] } : {}) }],
  });
const PLAIN = villainCard("plain", false);
const PIERCER = villainCard("piercer", true);
const SCHEME = stubMainScheme({
  id: "long",
  stages: [{ startingThreat: flat(0), targetThreat: flat(99), acceleration: flat(0) }],
});
const GRUNT = stubMinion({ id: "grunt", atk: 0, sch: 0, hp: 1, boostIcons: 0 });
const FILLER = stubMinion({ id: "filler", atk: 0, sch: 0, hp: 9, boostIcons: 0 });

const deps: EngineDeps = depsOf(
  WARD_CONSTANT,
  ANCHOR_CONSTANT,
  THORNS_CONSTANT,
  FANGS_CONSTANT,
  CLAWS_CONSTANT,
  MAUL_CONSTANT,
  BOW_CONSTANT,
  LANCE_ACTION,
);

const toHero: Command = { type: "changeForm", playerId: P1 };
const endTurn: Command = { type: "endTurn", playerId: P1 };
const heroOf = (state: GameState) => mustPlayer(state, P1).identity.instanceId;
const villainOf = (state: GameState) => state.villains[0]!.instanceId;
const damageOn = (state: GameState, id: InstanceId) => mustInstance(state, id).damage;
const toughOn = (state: GameState, id: InstanceId) => mustInstance(state, id).statuses.tough;
const of = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const withTough = (state: GameState, id: InstanceId): GameState => ({
  ...state,
  instances: {
    ...state.instances,
    [id]: { ...mustInstance(state, id), statuses: { ...mustInstance(state, id).statuses, tough: 1 } },
  },
});
const basicAttack = (state: GameState, target: InstanceId): Command => ({
  type: "basicAttack",
  playerId: P1,
  attackerInstanceId: heroOf(state),
  targetInstanceId: target,
});

/** Attaches an encounter attachment to `to` (surgery: no reveal). */
function attach(state: GameState, card: CardId, to: InstanceId): GameState {
  const id = (Object.keys(state.instances) as InstanceId[]).find(
    (key) => state.instances[key]?.cardId === card && !cardsInPlay(state).includes(key),
  );
  if (!id) throw new Error(`no ${card} out of play`);
  return {
    ...state,
    encounterDecks: Object.fromEntries(
      Object.entries(state.encounterDecks).map(([deckId, piles]) => [
        deckId,
        { ...piles, deck: piles.deck.filter((x) => x !== id) },
      ]),
    ),
    instances: {
      ...state.instances,
      [id]: { ...mustInstance(state, id), faceup: true, attachedTo: to },
      [to]: { ...mustInstance(state, to), attachments: [...mustInstance(state, to).attachments, id] },
    },
  };
}

/** P1 in hero form against `villain`, with `supports` in play. */
function table(villain = PLAIN, supports: readonly { readonly id: CardId }[] = []): GameState {
  let state = gameAtFirstTurn({
    cards: [WARD, ANCHOR, THORNS, FANGS, CLAWS, MAUL, BOW, LANCE, GRUNT, FILLER],
    deps,
    villain,
    mainScheme: SCHEME,
    encounter: [WARD.id, ANCHOR.id, THORNS.id, GRUNT.id, ...copiesOf(FILLER.id, 12)],
    deck: [FANGS.id, CLAWS.id, MAUL.id, BOW.id, LANCE.id],
  });
  for (const support of supports) state = playerCardIntoPlay(state, support.id).state;
  return runCommands(state, deps, toHero).state;
}
const piercedBy = (events: readonly GameEvent[]) =>
  of(events, "statusRemoved").filter((e) => e.status === "tough" && e.reason === "piercing");

describe("docs/phase7-wave10.md §3.18: attacks against a character lose piercing", () => {
  it("the control: a villain with piercing discards the hero's tough status card and deals its 2 damage", () => {
    const state = withTough(table(PIERCER), heroOf(table(PIERCER)));
    const run = runCommands(state, deps, endTurn);
    expect(piercedBy(run.events)).toHaveLength(1);
    expect(toughOn(run.state, heroOf(run.state))).toBe(0);
    expect(damageOn(run.state, heroOf(run.state))).toBe(2);
  });

  it("the villain's own piercing keyword: the tough status card stays for the attack and absorbs it", () => {
    const base = table(PIERCER);
    const state = attach(withTough(base, heroOf(base)), WARD.id, heroOf(base));
    const run = runCommands(state, deps, endTurn);
    expect(piercedBy(run.events)).toHaveLength(0);
    expect(damageOn(run.state, heroOf(run.state))).toBe(0);
    // Used up by the damage it prevented (RRG 1.8 "Tough", p. 44), not by piercing.
    expect(toughOn(run.state, heroOf(run.state))).toBe(0);
    expect(of(run.events, "statusRemoved").map((e) => [e.status, e.reason])).toEqual([["tough", "preventedDamage"]]);
    const replayed = replay(run.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(run.state);
  });

  it("piercing from a rule ('the villain's attacks gain piercing'): the loss beats the gain", () => {
    const control = withTough(table(PLAIN, [FANGS]), heroOf(table(PLAIN, [FANGS])));
    expect(damageOn(runCommands(control, deps, endTurn).state, heroOf(control))).toBe(2);
    const state = attach(control, WARD.id, heroOf(control));
    const run = runCommands(state, deps, endTurn);
    expect(piercedBy(run.events)).toHaveLength(0);
    expect(damageOn(run.state, heroOf(run.state))).toBe(0);
  });

  it("a hero's piercing basic attack does not strip the tough status card of a villain attacks lose piercing against", () => {
    const base = table(PLAIN, [CLAWS]);
    const tough = withTough(base, villainOf(base));
    const control = runCommands(tough, deps, basicAttack(tough, villainOf(tough)));
    expect(piercedBy(control.events)).toHaveLength(1);
    expect(damageOn(control.state, villainOf(control.state))).toBe(2);

    const warded = attach(tough, WARD.id, villainOf(tough));
    const run = runCommands(warded, deps, basicAttack(warded, villainOf(warded)));
    expect(piercedBy(run.events)).toHaveLength(0);
    expect(damageOn(run.state, villainOf(run.state))).toBe(0);
    expect(toughOn(run.state, villainOf(run.state))).toBe(0);
  });

  it("'this attack gains piercing' on the card making the attack is lost too", () => {
    const base = table();
    const warded = attach(withTough(base, villainOf(base)), WARD.id, villainOf(base));
    const given = giveCard(warded, P1, LANCE.id);
    const run = runCommands(given.state, deps, {
      type: "playCard",
      playerId: P1,
      cardInstanceId: given.id,
      payment: [],
      attachToInstanceId: null,
    });
    expect(piercedBy(run.events)).toHaveLength(0);
    expect(damageOn(run.state, villainOf(run.state))).toBe(0);
  });

  it("only against that character: the same piercing basic attack still pierces a minion", () => {
    const base = table(PLAIN, [CLAWS]);
    const warded = attach(base, WARD.id, villainOf(base));
    const minion = minionEngagedWith(warded, FILLER.id);
    const state = withTough(minion.state, minion.id);
    const run = runCommands(state, deps, basicAttack(state, minion.id));
    expect(piercedBy(run.events).map((e) => e.instanceId)).toEqual([minion.id]);
    expect(damageOn(run.state, minion.id)).toBe(2);
  });

  it("`attackKeywordsOf` leaves the keyword out only when it is given the attacked character", () => {
    const base = table(PIERCER, [FANGS]);
    const state = attach(base, WARD.id, heroOf(base));
    const attack = { attackerInstanceId: villainOf(state) };
    expect(attackKeywordsOf(state, deps, attack)).toEqual(["piercing"]);
    expect(attackKeywordsOf(state, deps, { ...attack, targetInstanceId: heroOf(state) })).toEqual([]);
    expect(
      attackKeywordsOf(state, deps, { ...attack, keywords: ["piercing"], targetInstanceId: heroOf(state) }),
    ).toEqual([]);
    expect(
      attackKeywordsOf(state, deps, { ...attack, vars: { piercing: 1 }, targetInstanceId: heroOf(state) }),
    ).toEqual([]);
  });
});

describe("the rule is general: any attack keyword may be lost against a character", () => {
  it("overkill: a 3 ATK basic attack with overkill defeats a 1-hit-point minion and nothing spills to the villain", () => {
    const base = table(PLAIN, [MAUL]);
    const grunt = minionEngagedWith(base, GRUNT.id);
    const control = runCommands(grunt.state, deps, basicAttack(grunt.state, grunt.id));
    expect(damageOn(control.state, villainOf(control.state))).toBe(2);

    const anchored = attach(grunt.state, ANCHOR.id, grunt.id);
    const run = runCommands(anchored, deps, basicAttack(anchored, grunt.id));
    expect(cardsInPlay(run.state)).not.toContain(grunt.id);
    expect(of(run.events, "overkillSpilled")).toHaveLength(0);
    expect(damageOn(run.state, villainOf(run.state))).toBe(0);
  });

  it("ranged: a ranged basic attack is answered by the retaliate of a character attacks lose ranged against", () => {
    const base = table(PLAIN, [BOW]);
    const thorny = attach(base, THORNS.id, villainOf(base));
    const control = runCommands(thorny, deps, basicAttack(thorny, villainOf(thorny)));
    expect(damageOn(control.state, heroOf(control.state))).toBe(0);

    const anchored = attach(thorny, ANCHOR.id, villainOf(thorny));
    const run = runCommands(anchored, deps, basicAttack(anchored, villainOf(anchored)));
    expect(damageOn(run.state, villainOf(run.state))).toBe(2);
    expect(damageOn(run.state, heroOf(run.state))).toBe(1);
  });
});
