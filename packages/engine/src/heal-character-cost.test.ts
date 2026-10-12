/**
 * `AbilityCost.healCharacter` (docs/phase7-wave10-hero-packs.md H3.17): healing damage from a character the payer
 * picks, as a cost. A synthetic event shaped like "Hero Action: Heal 2 damage from an enemy → confuse that enemy."
 *
 * Sources: RRG 1.8 "Cost" (p. 13: paid before the effects; p. 14: "An ability's cost cannot be paid if that ability's
 * effect requires one or more targets and there is not at least one valid target", and a cost is paid in full or not
 * at all); "Target" (p. 43: "The cost of an ability or game function is not considered when determining if that
 * ability or game function can affect a target"); "Status Cards" (p. 41); "Stalwart" (p. 40).
 */

import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps, RuleSpec } from "./abilities.js";
import type { Command, CostChoices } from "./commands.js";
import { applyCommand, startSession } from "./engine.js";
import type { InstanceId } from "./ids.js";
import { legalActions } from "./legal.js";
import { mustInstance } from "./query.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubEvent, stubMinion, stubSideScheme } from "./testing/fixtures.js";
import { giveCard, TREACHERY } from "./testing/scenario.js";
import { copiesOf, encounterCardInVillainArea, gameAtFirstTurn, minionEngagedWith, P1 } from "./testing/wave3.js";

const def = (definition: AbilityDefinition) => definition;
const CONFUSABLE = { categories: ["enemy"], canTakeStatus: "confused" } as const;
// "Hero Action: Heal 2 damage from an enemy → confuse that enemy."
const MERCY_ACTION = stubAbility(
  "mercy.action",
  def({
    trigger: { kind: "action" },
    cost: { healCharacter: { slot: "healed", query: CONFUSABLE, amount: 2 } },
    effects: [{ kind: "giveStatus", target: { kind: "slot", slot: "healed" }, status: "confused" }],
  }),
);
const MERCY = stubEvent({ id: "mercy", cost: 0, abilities: [MERCY_ACTION.ref] });
const THUG = stubMinion({ id: "thug", atk: 1, sch: 1, hp: 9, boostIcons: 0 });
const BRUTE = stubMinion({ id: "brute", atk: 1, sch: 1, hp: 9, boostIcons: 0 });
const WALL = stubMinion({ id: "wall", atk: 1, sch: 1, hp: 9, boostIcons: 0, keywords: [{ name: "stalwart" }] });
const CALM = stubMinion({ id: "calm", atk: 1, sch: 1, hp: 9, boostIcons: 0, keywords: [{ name: "steady" }] });
const ruleCard = (id: string, rule: RuleSpec) => {
  const ability = stubAbility(`${id}.constant`, def({ trigger: { kind: "constant", rules: [rule] }, effects: [] }));
  return { ability, card: stubSideScheme({ id, startingThreat: 5, abilities: [ability.ref] }) };
};
// "thug cannot be healed by player card effects."
const SEALED = ruleCard("sealed", { kind: "cannotBeHealed", target: { name: "thug" }, bySource: "playerCard" });

const deps: EngineDeps = depsOf(MERCY_ACTION, SEALED.ability);

interface Table {
  readonly state: GameState;
  readonly mercy: InstanceId;
  readonly villain: InstanceId;
  readonly minions: Readonly<Record<string, InstanceId>>;
}

/** `damage` on each named enemy ("villain" is the villain); minions are engaged with the first player. */
function start(damage: Readonly<Record<string, number>>, extra: readonly string[] = []): Table {
  const names = Object.keys(damage).filter((name) => name !== "villain");
  const cards = [THUG, BRUTE, WALL, CALM].filter((card) => names.includes(card.id));
  let state = gameAtFirstTurn({
    cards: [MERCY, SEALED.card, ...cards],
    deps,
    encounter: [...copiesOf(TREACHERY.id, 25), ...cards.map((card) => card.id), SEALED.card.id],
    deck: [MERCY.id],
  });
  const villain = state.villains[0]!.instanceId;
  const wound = (id: InstanceId, amount: number) => {
    state = { ...state, instances: { ...state.instances, [id]: { ...mustInstance(state, id), damage: amount } } };
  };
  wound(villain, damage.villain ?? 0);
  const minions: Record<string, InstanceId> = {};
  for (const card of cards) {
    const engaged = minionEngagedWith(state, card.id);
    state = engaged.state;
    minions[card.id] = engaged.id;
    wound(engaged.id, damage[card.id] ?? 0);
  }
  if (extra.includes("sealed")) state = encounterCardInVillainArea(state, SEALED.card.id, 5).state;
  const given = giveCard(state, P1, MERCY.id);
  return { state: given.state, mercy: given.id, villain, minions };
}

const play = (table: Table, costChoices?: CostChoices): Command => ({
  type: "playCard",
  playerId: P1,
  cardInstanceId: table.mercy,
  payment: [],
  attachToInstanceId: null,
  ...(costChoices ? { costChoices } : {}),
});
const run = (state: GameState, command: Command) => driveSession(startSession(state), deps, [command]).session.state;
const withStatus = (state: GameState, id: InstanceId, confused: number): GameState => ({
  ...state,
  instances: {
    ...state.instances,
    [id]: { ...mustInstance(state, id), statuses: { ...mustInstance(state, id).statuses, confused } },
  },
});
const offered = (table: Table): readonly InstanceId[] => {
  const legal = legalActions(table.state, P1, deps);
  if (legal.kind !== "turn") throw new Error(`expected a turn, got ${legal.kind}`);
  const action = legal.legal.find((a) => a.example.type === "playCard" && a.example.cardInstanceId === table.mercy);
  return action?.targets ?? [];
};
const isOffered = (table: Table): boolean => {
  const legal = legalActions(table.state, P1, deps);
  if (legal.kind !== "turn") throw new Error(`expected a turn, got ${legal.kind}`);
  return legal.legal.some((a) => a.example.type === "playCard" && a.example.cardInstanceId === table.mercy);
};

describe("a heal cost on a character the payer picks", () => {
  it("an enemy with 5 damage: 2 are healed as the cost, then the effect confuses that enemy", () => {
    const table = start({ thug: 5 });
    const after = run(table.state, play(table, { healed: [table.minions.thug!] }));
    expect(mustInstance(after, table.minions.thug!)).toMatchObject({ damage: 3, statuses: { confused: 1 } });
    expect(mustInstance(after, table.villain).statuses.confused).toBe(0);
  });

  it("the heal is logged before the status card is given", () => {
    const table = start({ thug: 2 });
    const { events } = driveSession(startSession(table.state), deps, [play(table)]);
    const healed = events.findIndex((e) => e.type === "damageHealed" && e.targetInstanceId === table.minions.thug);
    const confused = events.findIndex((e) => e.type === "statusGiven" && e.instanceId === table.minions.thug);
    expect(healed).toBeGreaterThanOrEqual(0);
    expect(confused).toBeGreaterThan(healed);
  });

  it("an enemy with 1 damage only: no candidate, so the event cannot be played and is not offered", () => {
    const table = start({ thug: 1 });
    const result = applyCommand(table.state, play(table, { healed: [table.minions.thug!] }), deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("no_valid_target");
    expect(applyCommand(table.state, play(table), deps).ok).toBe(false);
    expect(isOffered(table)).toBe(false);
    expect(mustInstance(table.state, table.minions.thug!).damage).toBe(1);
  });

  it("one candidate: the pick is forced and may be omitted", () => {
    const table = start({ thug: 4, brute: 1 });
    const after = run(table.state, play(table));
    expect(mustInstance(after, table.minions.thug!)).toMatchObject({ damage: 2, statuses: { confused: 1 } });
  });

  it("several candidates: the command must name exactly one, and legalActions offers each", () => {
    const table = start({ villain: 3, thug: 4, brute: 2 });
    expect(applyCommand(table.state, play(table), deps).ok).toBe(false);
    const both = play(table, { healed: [table.minions.thug!, table.minions.brute!] });
    expect(applyCommand(table.state, both, deps).ok).toBe(false);
    expect(new Set(offered(table))).toEqual(new Set([table.villain, table.minions.thug, table.minions.brute]));
    const after = run(table.state, play(table, { healed: [table.villain] }));
    expect(mustInstance(after, table.villain)).toMatchObject({ damage: 1, statuses: { confused: 1 } });
    expect(mustInstance(after, table.minions.thug!)).toMatchObject({ damage: 4, statuses: { confused: 0 } });
  });

  it("a stalwart enemy is no candidate: the effect could not confuse it, whatever damage it holds", () => {
    const table = start({ wall: 6, thug: 3 });
    expect(offered(table)).toEqual([table.minions.thug]);
    const result = applyCommand(table.state, play(table, { healed: [table.minions.wall!] }), deps);
    expect(result.ok).toBe(false);
    const alone = start({ wall: 6 });
    expect(isOffered(alone)).toBe(false);
    expect(applyCommand(alone.state, play(alone), deps).ok).toBe(false);
  });

  it("an enemy already confused has no room for the status card and is no candidate; a steady one has room", () => {
    const table = start({ thug: 3, calm: 3 });
    const full = withStatus(withStatus(table.state, table.minions.thug!, 1), table.minions.calm!, 1);
    const confused = { ...table, state: full };
    expect(offered(confused)).toEqual([table.minions.calm]);
    const after = run(full, play(table));
    expect(mustInstance(after, table.minions.calm!)).toMatchObject({ damage: 1, statuses: { confused: 2 } });
  });

  it("an enemy that cannot be healed by player cards is no candidate", () => {
    const table = start({ thug: 5, brute: 5 }, ["sealed"]);
    expect(offered(table)).toEqual([table.minions.brute]);
    expect(applyCommand(table.state, play(table, { healed: [table.minions.thug!] }), deps).ok).toBe(false);
  });

  it("a character the query does not name is refused: the payer's own identity is not 'an enemy'", () => {
    const table = start({ thug: 5 });
    const hero = table.state.players[0]!.identity.instanceId;
    const hurt: GameState = {
      ...table.state,
      instances: { ...table.state.instances, [hero]: { ...mustInstance(table.state, hero), damage: 4 } },
    };
    expect(applyCommand(hurt, play(table, { healed: [hero] }), deps).ok).toBe(false);
  });
});
