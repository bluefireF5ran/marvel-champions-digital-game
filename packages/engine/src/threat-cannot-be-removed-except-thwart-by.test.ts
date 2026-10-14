/**
 * docs/phase7-wave10-hero-packs.md H3.6: "Threat cannot be removed from attached scheme except by Hercules's thwarts"
 * (Embody Pathos, `hercules` 59003) is `RuleSpec threatCannotBeRemoved` with `exceptThwartBy`, a query on the
 * **thwarting character**. It is narrower than `exceptBy` (docs/phase7-wave7.md §3.51, "Characters other than [X]
 * cannot remove threat"): every removal is stopped, and only a thwart by the named character gets through.
 *
 * - RRG 1.8 "'Cannot'" (p. 11): a "cannot" is absolute, so an encounter card's removal and a support's are stopped too.
 * - RRG 1.8 "Thwart" (p. 44): a basic thwart is a thwart by the thwarting character.
 * - RRG 1.8 "Labeled Ability" (p. 26): a "(thwart)"-labeled ability "is considered to be a thwart made by that
 *   player's identity", whichever card the label is on (an event, a support).
 * - RRG 1.8 "Target" (p. 43): "A target that cannot be thwarted is not a valid target for a thwart-labeled ability."
 * - RRG 1.8 "Move" (p. 30): threat moved off a scheme "is considered to be removed from that scheme".
 *
 * Synthetic cards throughout: P1's hero is the named identity (THW 2), P2's is another hero. The vigil, the other
 * side scheme and the main scheme each hold 6 threat.
 */

import type { AnyCard } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { applyCommand, replay, startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { legalActions } from "./legal.js";
import { mustInstance, mustPlayer } from "./query.js";
import { characterCannotRemoveThreat } from "./rules.js";
import type { EffectSpec, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility, type StubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import {
  stubAlly,
  stubEnvironment,
  stubEvent,
  stubSideScheme,
  stubSupport,
  stubTreachery,
  stubUpgrade,
} from "./testing/fixtures.js";
import { giveCard } from "./testing/scenario.js";
import { copiesOf, encounterCardInVillainArea, gameAtFirstTurn, P1, P2, playerCardIntoPlay } from "./testing/wave3.js";

const def = (definition: AbilityDefinition) => definition;
const n = (value: number) => ({ kind: "const", value }) as const;
const MAIN = { kind: "mainScheme" } as const;
const EACH_SIDE: TargetRef = { kind: "each", query: { categories: ["sideScheme"] } };
const THE_VIGIL: TargetRef = { kind: "each", query: { categories: ["sideScheme"], name: "vigil" } };
const CHOSEN: TargetRef = { kind: "slot", slot: "scheme" };
const CHOOSE_A_SCHEME: EffectSpec = {
  kind: "chooseTarget",
  slot: "scheme",
  query: { categories: ["scheme"] },
  chooser: { kind: "controller" },
};
const SWEEP_EFFECT: EffectSpec = { kind: "removeThreat", target: EACH_SIDE, amount: n(1) };
const THWART_EACH: EffectSpec = { kind: "thwart", target: EACH_SIDE, amount: n(1) };
const action = (id: string, effects: readonly EffectSpec[], labeled = false): StubAbility =>
  stubAbility(
    id,
    def({ trigger: { kind: "action" }, ...(labeled ? { label: ["thwart" as const] } : {}), effects: [...effects] }),
  );

/** "Threat cannot be removed from this scheme except by hero (hero)'s thwarts." P1's identity shows that title as a hero. */
const VIGIL_RULE = stubAbility("vigil.constant", {
  trigger: {
    kind: "constant",
    rules: [
      {
        kind: "threatCannotBeRemoved",
        target: { self: true },
        exceptThwartBy: { categories: ["identity"], name: "hero (hero)" },
      },
    ],
  },
  effects: [],
});
const VIGIL = stubSideScheme({ id: "vigil", startingThreat: 6, abilities: [VIGIL_RULE.ref] });
const OTHER = stubSideScheme({ id: "other", startingThreat: 6 });

/** An event: "Remove 1 threat from each side scheme." (no label) */
const SWEEP_ACTION = action("sweep.action", [SWEEP_EFFECT]);
const SWEEP = stubEvent({ id: "sweep", cost: 0, abilities: [SWEEP_ACTION.ref] });
/** An event: "Hero Action (thwart): Remove 1 threat from each side scheme." */
const STRIKE_ACTION = action("strike.action", [THWART_EACH], true);
const STRIKE = stubEvent({ id: "strike", cost: 0, abilities: [STRIKE_ACTION.ref] });
/** An event: "Hero Action (thwart): Remove 1 threat from a scheme." */
const PROBE_ACTION = action("probe.action", [CHOOSE_A_SCHEME, { kind: "thwart", target: CHOSEN, amount: n(1) }], true);
const PROBE = stubEvent({ id: "probe", cost: 0, abilities: [PROBE_ACTION.ref] });
/** An upgrade, an ally and a support, each with "Action: Remove 1 threat from each side scheme." (no label) */
const GEAR_ACTION = action("gear.action", [SWEEP_EFFECT]);
const GEAR = stubUpgrade({ id: "gear", cost: 0, abilities: [GEAR_ACTION.ref] });
const ACE_ACTION = action("ace.action", [SWEEP_EFFECT]);
const ACE = stubAlly({ id: "ace", cost: 0, atk: 1, thw: 3, hp: 3, abilities: [ACE_ACTION.ref] });
const BASE_ACTION = action("base.action", [SWEEP_EFFECT]);
const BASE = stubSupport({ id: "base", cost: 0, abilities: [BASE_ACTION.ref] });
/** A support: "Action (thwart): Remove 1 threat from each side scheme." A thwart by its player's identity (p. 26). */
const DESK_ACTION = action("desk.action", [THWART_EACH], true);
const DESK = stubSupport({ id: "desk", cost: 0, abilities: [DESK_ACTION.ref] });
/** An event that removes no threat itself: "Place 1 threat on the main scheme." */
const CUE_ACTION = action("cue.action", [{ kind: "placeThreat", target: MAIN, amount: n(1) }]);
const CUE = stubEvent({ id: "cue", cost: 0, abilities: [CUE_ACTION.ref] });
/** An environment: "Forced Response: After threat is placed on the main scheme, remove 1 threat from each side scheme." */
const SABOTAGE_FORCED = stubAbility(
  "sabotage.forced-response",
  def({
    trigger: { kind: "response", forced: true, on: { on: "placeThreat", targetIs: { categories: ["mainScheme"] } } },
    effects: [SWEEP_EFFECT],
  }),
);
const SABOTAGE = stubEnvironment({ id: "sabotage", abilities: [SABOTAGE_FORCED.ref] });
/** An event: "Move 2 threat from the vigil to the main scheme." */
const SHIFT_OFF_ACTION = action("shift-off.action", [{ kind: "moveThreat", from: THE_VIGIL, to: MAIN, amount: n(2) }]);
const SHIFT_OFF = stubEvent({ id: "shift-off", cost: 0, abilities: [SHIFT_OFF_ACTION.ref] });
const FILLER = stubTreachery({ id: "filler", boostIcons: 0 });

const ABILITIES = [
  VIGIL_RULE,
  SWEEP_ACTION,
  STRIKE_ACTION,
  PROBE_ACTION,
  GEAR_ACTION,
  ACE_ACTION,
  BASE_ACTION,
  DESK_ACTION,
  CUE_ACTION,
  SABOTAGE_FORCED,
  SHIFT_OFF_ACTION,
];
const deps: EngineDeps = depsOf(...ABILITIES);
const PLAYER_CARDS: readonly AnyCard[] = [SWEEP, STRIKE, PROBE, GEAR, ACE, BASE, DESK, CUE, SHIFT_OFF];

interface Table {
  readonly state: GameState;
  readonly vigil: InstanceId;
  readonly other: InstanceId;
  readonly main: InstanceId;
}
/** Two players at P1's first turn, both heroes unless `p1Form` says otherwise; vigil, other and main scheme at 6 threat. */
function start(p1Form: "hero" | "alterEgo" = "hero"): Table {
  const base = gameAtFirstTurn({
    players: 2,
    cards: [...PLAYER_CARDS, VIGIL, OTHER, SABOTAGE, FILLER],
    deps,
    deck: PLAYER_CARDS.map((card) => card.id),
    encounter: [VIGIL.id, OTHER.id, SABOTAGE.id, ...copiesOf(FILLER.id, 30)],
  });
  const main = base.mainScheme.instanceId;
  const formed: GameState = {
    ...base,
    players: base.players.map((p) => ({
      ...p,
      identity: { ...p.identity, form: p.playerId === P1 ? p1Form : ("hero" as const) },
    })),
    instances: { ...base.instances, [main]: { ...mustInstance(base, main), threat: 6 } },
  };
  const vigil = encounterCardInVillainArea(formed, VIGIL.id, 6);
  const other = encounterCardInVillainArea(vigil.state, OTHER.id, 6);
  return { state: other.state, vigil: vigil.id, other: other.id, main };
}

interface Step {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}
function run(state: GameState, ...commands: readonly Command[]): Step {
  const { session, events } = driveSession(startSession(state), deps, commands);
  const replayed = replay(session.log, deps);
  expect(replayed.ok && replayed.state).toEqual(session.state);
  return { state: session.state, events };
}
const playCommand = (player: PlayerId, id: InstanceId): Command => ({
  type: "playCard",
  playerId: player,
  cardInstanceId: id,
  payment: [],
  attachToInstanceId: null,
});
function play(state: GameState, card: AnyCard, player: PlayerId = P1): Step {
  const given = giveCard(state, player, card.id);
  return run(given.state, playCommand(player, given.id));
}
const use = (player: PlayerId, card: InstanceId, ability: StubAbility): Command => ({
  type: "useAbility",
  playerId: player,
  cardInstanceId: card,
  abilityId: ability.ref.id as Extract<Command, { type: "useAbility" }>["abilityId"],
  payment: [],
});
const hero = (state: GameState, player: PlayerId) => mustPlayer(state, player).identity.instanceId;
const basicThwart = (
  state: GameState,
  player: PlayerId,
  scheme: InstanceId,
  thwarter: InstanceId = hero(state, player),
): Extract<Command, { type: "basicThwart" }> => ({
  type: "basicThwart",
  playerId: player,
  thwarterInstanceId: thwarter,
  schemeInstanceId: scheme,
});
const threat = (state: GameState, id: InstanceId) => mustInstance(state, id).threat;
/** P2's turn: P1 ends theirs. */
const p2Turn = (state: GameState) => run(state, { type: "endTurn", playerId: P1 }).state;
/** `card` in `player`'s play area, attached to `host` when given (surgery). */
function inPlay(state: GameState, card: AnyCard, player: PlayerId, host: InstanceId | null = null) {
  const placed = playerCardIntoPlay(state, card.id, player);
  const instance = mustInstance(placed.state, placed.id);
  return {
    id: placed.id,
    state: {
      ...placed.state,
      instances: { ...placed.state.instances, [placed.id]: { ...instance, attachedTo: host } },
    },
  };
}
function thwartTargets(state: GameState, player: PlayerId, thwarter: InstanceId) {
  const actions = legalActions(state, player, deps);
  if (actions.kind !== "turn") throw new Error(`not ${player}'s turn: ${actions.kind}`);
  const mine = (a: { readonly action: { readonly kind: string; readonly instanceId?: InstanceId } }) =>
    a.action.kind === "basicThwart" && a.action.instanceId === thwarter;
  const legal = actions.legal.find(mine);
  const illegal = actions.illegal.find(mine);
  return { targets: legal?.targets ?? [], blocked: legal?.blockedTargets ?? illegal?.blockedTargets ?? [] };
}
const BLOCKED = (scheme: InstanceId) => ({ type: "threatRemovalBlocked", schemeInstanceId: scheme, reason: "rule" });
const blockedOn = (events: readonly GameEvent[], scheme: InstanceId) =>
  events.filter((e) => e.type === "threatRemovalBlocked" && e.schemeInstanceId === scheme);
const offered = (state: GameState): readonly InstanceId[] =>
  (state.pendingChoice?.options ?? []).flatMap((o) => (o.ref.kind === "card" ? [o.ref.instanceId] : []));

describe("H3.6 the named character's thwarts remove threat", () => {
  it("its basic thwart (THW 2): 6 to 4, and legalActions offers the scheme", () => {
    const { state, vigil } = start();
    expect(thwartTargets(state, P1, hero(state, P1)).targets).toContain(vigil);
    expect(characterCannotRemoveThreat(state, deps, vigil, hero(state, P1))).toBe(false);
    const after = run(state, basicThwart(state, P1, vigil));
    expect(threat(after.state, vigil)).toBe(4);
    expect(blockedOn(after.events, vigil)).toEqual([]);
  });

  it("a '(thwart)'-labeled event its player plays: 6 to 5 on both side schemes", () => {
    const { state, vigil, other } = start();
    const struck = play(state, STRIKE);
    expect([threat(struck.state, vigil), threat(struck.state, other)]).toEqual([5, 5]);
    expect(blockedOn(struck.events, vigil)).toEqual([]);
  });

  it("a '(thwart)'-labeled ability on its player's support is that identity's thwart: 6 to 5", () => {
    const { state, vigil, other } = start();
    const desk = inPlay(state, DESK, P1);
    const after = run(desk.state, use(P1, desk.id, DESK_ACTION));
    expect([threat(after.state, vigil), threat(after.state, other)]).toEqual([5, 5]);
  });

  it("a thwart event that chooses a scheme is offered the vigil", () => {
    const { state, vigil, other, main } = start();
    const given = giveCard(state, P1, PROBE.id);
    const asked = applyCommand(given.state, playCommand(P1, given.id), deps);
    if (!asked.ok) throw new Error(asked.error.message);
    expect([...offered(asked.state)].sort()).toEqual([main, other, vigil].sort());
  });

  it("the scheme defeated by that thwart leaves play, and the rule with it", () => {
    const table = start();
    const low: GameState = {
      ...table.state,
      instances: { ...table.state.instances, [table.vigil]: { ...mustInstance(table.state, table.vigil), threat: 2 } },
    };
    const after = run(low, basicThwart(low, P1, table.vigil)).state;
    expect(after.villainArea).not.toContain(table.vigil);
  });
});

describe("H3.6 the named character's removals that are not thwarts remove nothing", () => {
  it("an unlabeled event its player plays: the vigil stays at 6, the other scheme goes to 5", () => {
    const { state, vigil, other } = start();
    const swept = play(state, SWEEP);
    expect([threat(swept.state, vigil), threat(swept.state, other)]).toEqual([6, 5]);
    expect(blockedOn(swept.events, vigil)).toEqual([BLOCKED(vigil)]);
  });

  it("an unlabeled ability on an upgrade attached to it: 6", () => {
    const { state, vigil, other } = start();
    const gear = inPlay(state, GEAR, P1, hero(state, P1));
    const after = run(gear.state, use(P1, gear.id, GEAR_ACTION));
    expect([threat(after.state, vigil), threat(after.state, other)]).toEqual([6, 5]);
    expect(blockedOn(after.events, vigil)).toEqual([BLOCKED(vigil)]);
  });

  it("an unlabeled ability on its player's support: 6 (under exceptBy a support is not bound; here it is)", () => {
    const { state, vigil, other } = start();
    const base = inPlay(state, BASE, P1);
    const after = run(base.state, use(P1, base.id, BASE_ACTION));
    expect([threat(after.state, vigil), threat(after.state, other)]).toEqual([6, 5]);
    expect(blockedOn(after.events, vigil)).toEqual([BLOCKED(vigil)]);
  });

  it("its own event cannot move threat off the scheme (RRG p. 30: moved off is removed): the event is refused", () => {
    const { state, vigil, main } = start();
    const given = giveCard(state, P1, SHIFT_OFF.id);
    const refused = applyCommand(given.state, playCommand(P1, given.id), deps);
    expect(refused).toMatchObject({ ok: false, error: { code: "no_valid_target" } });
    expect(mustPlayer(given.state, P1).hand).toContain(given.id);
    expect([threat(given.state, vigil), threat(given.state, main)]).toEqual([6, 6]);
  });

  it("while it shows its alter-ego's title it is not the named character: its player's thwart event removes 0 from the vigil", () => {
    const { state, vigil, other } = start("alterEgo");
    expect(characterCannotRemoveThreat(state, deps, vigil, hero(state, P1))).toBe(true);
    const struck = play(state, STRIKE);
    expect([threat(struck.state, vigil), threat(struck.state, other)]).toEqual([6, 5]);
    expect(blockedOn(struck.events, vigil)).toEqual([BLOCKED(vigil)]);
  });
});

describe("H3.6 every other character's thwart removes nothing", () => {
  it.each([
    ["the named identity's player", P1],
    ["another player", P2],
  ] as const)(
    "an ally of %s (THW 3): the scheme is not a legal target of its basic thwart, and its ability removes 0",
    (_label, player) => {
      const table = start();
      const turn = player === P1 ? table.state : p2Turn(table.state);
      const ace = inPlay(turn, ACE, player);
      const { targets, blocked } = thwartTargets(ace.state, player, ace.id);
      expect(targets).toContain(table.other);
      expect(targets).not.toContain(table.vigil);
      expect(blocked.find((b) => b.instanceId === table.vigil)).toMatchObject({
        reason: "no_valid_target",
        message: "this character cannot remove threat from that scheme",
      });
      expect(applyCommand(ace.state, basicThwart(ace.state, player, table.vigil, ace.id), deps)).toMatchObject({
        ok: false,
        error: { code: "no_valid_target" },
      });
      expect(mustInstance(ace.state, ace.id).exhausted).toBe(false);
      const after = run(ace.state, use(player, ace.id, ACE_ACTION));
      expect([threat(after.state, table.vigil), threat(after.state, table.other)]).toEqual([6, 5]);
      // The other scheme is still the ally's to thwart: 6 to 3.
      expect(threat(run(ace.state, basicThwart(ace.state, player, table.other, ace.id)).state, table.other)).toBe(3);
    },
  );

  it("another hero's basic thwart is refused before any cost; the other scheme is still its to thwart (6 to 4)", () => {
    const table = start();
    const state = p2Turn(table.state);
    const p2 = hero(state, P2);
    expect(thwartTargets(state, P2, p2).targets).not.toContain(table.vigil);
    expect(applyCommand(state, basicThwart(state, P2, table.vigil), deps)).toMatchObject({
      ok: false,
      error: { code: "no_valid_target" },
    });
    expect(mustInstance(state, p2).exhausted).toBe(false);
    expect(threat(run(state, basicThwart(state, P2, table.other)).state, table.other)).toBe(4);
  });

  it("another player's thwart event is refused that target, and one that sweeps removes threat from the other scheme only", () => {
    const table = start();
    const state = p2Turn(table.state);
    const given = giveCard(state, P2, PROBE.id);
    const asked = applyCommand(given.state, playCommand(P2, given.id), deps);
    if (!asked.ok) throw new Error(asked.error.message);
    expect([...offered(asked.state)].sort()).toEqual([table.main, table.other].sort());
    const struck = play(state, STRIKE, P2);
    expect([threat(struck.state, table.vigil), threat(struck.state, table.other)]).toEqual([6, 5]);
    expect(blockedOn(struck.events, table.vigil)).toEqual([BLOCKED(table.vigil)]);
  });
});

describe("H3.6 a removal no character makes is stopped too (RRG 1.8 'Cannot', p. 11)", () => {
  it("an encounter card's forced effect: the vigil stays at 6, the other scheme goes to 5", () => {
    const table = start();
    const sabotage = encounterCardInVillainArea(table.state, SABOTAGE.id).state;
    const after = play(sabotage, CUE);
    expect([
      threat(after.state, table.vigil),
      threat(after.state, table.other),
      threat(after.state, table.main),
    ]).toEqual([6, 5, 7]);
    expect(blockedOn(after.events, table.vigil)).toEqual([BLOCKED(table.vigil)]);
  });
});
