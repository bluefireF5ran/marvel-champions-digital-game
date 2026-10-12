/**
 * docs/phase7-wave10-box-heroes.md B3.2: `EffectSpec defeat` with `ignoreWhenDefeated`. Synthetic cards shaped like
 * Coup de Grâce ("Defeat a non-[Elite] minion with an upgrade attached. Ignore any 'When Defeated' abilities on that
 * minion.", `cw` 56016).
 *
 * Sources: RRG 1.8 "Ignore" (p. 23): an ability that ignores an ability treats it "as not being in effect or present
 * while that ability is resolving"; "When Defeated Abilities" (p. 48); "Victory X" (p. 46); "Villain Defeat" (p. 47).
 */

import { flat, type CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import { replay } from "./engine.js";
import { activeEncounterDeck, activeVillain, mustInstance } from "./query.js";
import type { EffectSpec, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { stubEvent, stubMinion, stubSupport, stubVillain } from "./testing/fixtures.js";
import { copiesOf, gameAtFirstTurn, minionEngagedWith, playFree, playerCardIntoPlay } from "./testing/wave3.js";

const amount = (value: number) => ({ kind: "const", value }) as const;
const plot = (threat: number): EffectSpec => ({
  kind: "placeThreat",
  target: { kind: "mainScheme" },
  amount: amount(threat),
});
const hitVillain = (damage: number): EffectSpec => ({
  kind: "dealDamage",
  target: { kind: "villain" },
  amount: amount(damage),
});

/** "When Defeated: Place 2 threat on the main scheme." */
const PLOT = stubAbility("plotter.when-defeated", { trigger: { kind: "whenDefeated" }, effects: [plot(2)] });
/** "When Defeated: Place 3 threat on the main scheme." */
const SCHEME = stubAbility("schemer.when-defeated", { trigger: { kind: "whenDefeated" }, effects: [plot(3)] });
const PLOTTER = stubMinion({ id: "plotter", atk: 1, sch: 1, hp: 4, abilities: [PLOT.ref] });
const SCHEMER = stubMinion({ id: "schemer", atk: 1, sch: 1, hp: 4, abilities: [SCHEME.ref] });
const BOUNTY = stubMinion({
  id: "bounty",
  atk: 1,
  sch: 1,
  hp: 4,
  keywords: [{ name: "victory", value: 1 }],
  abilities: [PLOT.ref],
});

/** Another card's "Forced Interrupt: When a minion is defeated, deal 2 damage to the villain." */
const WATCH_I = stubAbility("watch.interrupt", {
  trigger: { kind: "interrupt", forced: true, on: { on: "characterDefeated", targetIs: { categories: ["minion"] } } },
  effects: [hitVillain(2)],
});
/** Another card's "Forced Response: After a minion is defeated, deal 1 damage to the villain." */
const WATCH_R = stubAbility("watch.response", {
  trigger: { kind: "response", forced: true, on: { on: "characterDefeated", targetIs: { categories: ["minion"] } } },
  effects: [hitVillain(1)],
});
const WATCH = stubSupport({ id: "watch", cost: 0, abilities: [WATCH_I.ref, WATCH_R.ref] });

/** A stage whose "When Defeated" places 5 threat on the main scheme. */
const FALL = stubAbility("stage.when-defeated", { trigger: { kind: "whenDefeated" }, effects: [plot(5)] });
const TWO_STAGE = stubVillain({
  id: "two-stage",
  stages: [
    { hp: flat(20), atk: 1, sch: 1, abilities: [FALL.ref] },
    { hp: flat(25), atk: 2, sch: 1 },
  ],
});

const actionEvent = (id: string, effects: readonly EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
const minions: TargetRef = { kind: "each", query: { categories: ["minion"] } };
const COUP = actionEvent("coup", [{ kind: "defeat", target: minions, ignoreWhenDefeated: true }]);
const SLAY = actionEvent("slay", [{ kind: "defeat", target: minions }]);
const COUP_VILLAIN = actionEvent("coup-villain", [
  { kind: "defeat", target: { kind: "villain" }, ignoreWhenDefeated: true },
]);
const SLAY_VILLAIN = actionEvent("slay-villain", [{ kind: "defeat", target: { kind: "villain" } }]);
const EVENTS = [COUP, SLAY, COUP_VILLAIN, SLAY_VILLAIN];

const deps: EngineDeps = depsOf(PLOT, SCHEME, WATCH_I, WATCH_R, FALL, ...EVENTS.map((e) => e.ability));
const CARDS = [PLOTTER, SCHEMER, BOUNTY, WATCH, TWO_STAGE, ...EVENTS.map((e) => e.card)];
const ENCOUNTER: readonly CardId[] = [PLOTTER.id, SCHEMER.id, BOUNTY.id];

const start = (): GameState =>
  gameAtFirstTurn({
    cards: CARDS,
    deps,
    villain: TWO_STAGE,
    encounter: ENCOUNTER,
    deck: [...EVENTS.flatMap((e) => copiesOf(e.card.id, 2)), ...copiesOf(WATCH.id, 2)],
  });
const threat = (state: GameState) => mustInstance(state, state.mainScheme.instanceId).threat;
const villainDamage = (state: GameState) => mustInstance(state, activeVillain(state).instanceId).damage;

describe("B3.2 `EffectSpec defeat` with `ignoreWhenDefeated`", () => {
  it("the defeated minion's When Defeated does not resolve; the same minion defeated without the flag resolves it", () => {
    const plotter = minionEngagedWith(start(), PLOTTER.id);
    const before = threat(plotter.state);

    const ignored = playFree(plotter.state, deps, COUP.card.id);
    expect(activeEncounterDeck(ignored.state).discard).toContain(plotter.id);
    expect(ignored.events).toContainEqual(
      expect.objectContaining({ type: "characterDefeated", instanceId: plotter.id }),
    );
    expect(threat(ignored.state)).toBe(before);
    expect(ignored.events.filter((e) => e.type === "abilityResolved" && e.abilityId === PLOT.ref.id)).toHaveLength(0);

    const normal = playFree(plotter.state, deps, SLAY.card.id);
    expect(activeEncounterDeck(normal.state).discard).toContain(plotter.id);
    expect(threat(normal.state)).toBe(before + 2);
  });

  it("other cards still answer the defeat: a 'when a minion is defeated' interrupt and an 'after' response", () => {
    const watch = playerCardIntoPlay(start(), WATCH.id);
    const plotter = minionEngagedWith(watch.state, PLOTTER.id);
    const before = threat(plotter.state);
    const { state } = playFree(plotter.state, deps, COUP.card.id);
    expect(activeEncounterDeck(state).discard).toContain(plotter.id);
    // 2 from the interrupt, then 1 from the response; no threat from the ignored When Defeated.
    expect(villainDamage(state)).toBe(3);
    expect(threat(state)).toBe(before);
  });

  it("Victory X still sends the minion to the victory display, with its When Defeated ignored", () => {
    const bounty = minionEngagedWith(start(), BOUNTY.id);
    const before = threat(bounty.state);
    const { state } = playFree(bounty.state, deps, COUP.card.id);
    expect(state.victoryDisplay).toContain(bounty.id);
    expect(activeEncounterDeck(state).discard).not.toContain(bounty.id);
    expect(threat(state)).toBe(before);
  });

  it("minions defeated together by one effect: none of their When Defeated abilities resolves, and none is ordered", () => {
    const plotter = minionEngagedWith(start(), PLOTTER.id);
    const both = minionEngagedWith(plotter.state, SCHEMER.id);
    const before = threat(both.state);

    const ignored = playFree(both.state, deps, COUP.card.id);
    expect(ignored.state.pendingChoice).toBeNull();
    expect(activeEncounterDeck(ignored.state).discard).toEqual(expect.arrayContaining([plotter.id, both.id]));
    expect(threat(ignored.state)).toBe(before);
    expect(ignored.events.filter((e) => e.type === "choiceRequested")).toHaveLength(0);

    const normal = playFree(both.state, deps, SLAY.card.id);
    expect(activeEncounterDeck(normal.state).discard).toEqual(expect.arrayContaining([plotter.id, both.id]));
    expect(threat(normal.state)).toBe(before + 5);
  });

  it("a villain stage defeated this way still falls to its next stage, without its When Defeated", () => {
    const base = start();
    const before = threat(base);
    const ignored = playFree(base, deps, COUP_VILLAIN.card.id);
    expect(activeVillain(ignored.state).stageIndex).toBe(1);
    expect(threat(ignored.state)).toBe(before);

    const normal = playFree(base, deps, SLAY_VILLAIN.card.id);
    expect(activeVillain(normal.state).stageIndex).toBe(1);
    expect(threat(normal.state)).toBe(before + 5);
  });

  it("replays to the same state", () => {
    const watch = playerCardIntoPlay(start(), WATCH.id);
    const plotter = minionEngagedWith(watch.state, PLOTTER.id);
    const { session } = playFree(plotter.state, deps, COUP.card.id);
    const replayed = replay(session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(session.state);
    expect(JSON.parse(JSON.stringify(session.state))).toEqual(session.state);
  });
});
