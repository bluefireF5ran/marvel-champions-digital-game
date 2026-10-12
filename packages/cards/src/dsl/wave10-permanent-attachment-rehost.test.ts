/**
 * docs/phase7-wave10.md §3.19: a permanent encounter attachment whose host leaves play resolves its "attach to" text
 * again, in a real Resistance: Captain America game with Cap's Shield 56143 ("Permanent. Attach to Captain America.").
 * MC56 p. 20: "Cap's Shield attaches to the Captain America leader. When an attachment with the permanent keyword
 * becomes unattached, resolve its 'attach to' text." MC56 p. 9 and RRG 1.8 "Permanent" (p. 32); RRG 1.8 "Player
 * Elimination" (p. 34).
 *
 * The engine does this by rule, with no script: only the leader's "Forced Response: After Cap's Shield is attached
 * to Captain America, give him a tough status card." (56137 stage I, 56138 stage II) is registered here, written as
 * the leader's module can write it, to show that the rehost is announced as an attaching.
 */

import { maxHitPoints, type GameEvent, type GameState, type InstanceId } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { P1, P2, endTurn, identityOf, inst, patchInstance, playerOf, stackEncounterDeck } from "../testing/harness.js";
import { forcedResponse, on } from "./abilities.js";
import { giveTough } from "./effects.js";
import { validateDefinition } from "./validate.js";
import { query, self } from "./values.js";
import { depsWith, drive, leaderOf, shieldGame, shieldOf, withShieldOn } from "./wave10-caps-shield.testing.js";

vi.setConfig({ testTimeout: 120_000 });

const ADVANCE = "01186"; // Standard set: no boost icon, no Boost ability
const DEFEND = "56193"; // Defend Hell's Kitchen, a side scheme of the Hell's Kitchen set
const SETS = { modularSetIds: ["new_avengers", "defenders", "hells_kitchen"] } as const;

/** "Forced Response: After Cap's Shield is attached to Captain America, give him a tough status card." */
const TOUGH_ON_SHIELD = forcedResponse(
  on.cardAttached(query([], { name: "Cap's Shield" }), { to: "self" }),
  giveTough(self),
);
const DEPS = depsWith({
  "56137.captain-america-forced-response": TOUGH_ON_SHIELD,
  "56138.captain-america-forced-response": TOUGH_ON_SHIELD,
});

const ofType = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const withDamage = (s: GameState, id: InstanceId, damage: number): GameState => patchInstance(s, id, { damage });

describe("§3.19 Cap's Shield (56143) and the leader's Forced Response", () => {
  it("the response is a valid definition", () => {
    expect(validateDefinition(TOUGH_ON_SHIELD)).toEqual([]);
  });

  it("two players, the Shield on player 1's hero: player 1 is defeated, the Shield attaches to Captain America and he gains a tough status card", () => {
    const base = shieldGame(DEPS, { ...SETS, twoPlayers: true });
    const leader = leaderOf(base);
    const hero = identityOf(base, P1);
    const held = withShieldOn(base, hero);
    const shield = shieldOf(held);
    expect(inst(held, leader).statuses.tough).toBe(0);
    // One hit point left, so Captain America's attack in the villain phase defeats her.
    const hurt = withDamage(held, hero, maxHitPoints(held, hero, DEPS)! - 1);
    const state = stackEncounterDeck(hurt, ADVANCE, ADVANCE, DEFEND);
    // Both players end their turns; the villain phase follows.
    const passed = drive(DEPS, state, endTurn(P1));
    expect(ofType(passed.events, "playerEliminated")).toEqual([]);
    const { state: after, events } = drive(DEPS, passed.state, endTurn(P2));

    expect(ofType(events, "playerEliminated").map((e) => e.playerId)).toEqual([P1]);
    expect(after.outcome).toBeNull();
    expect(playerOf(after, P2).eliminated).toBe(false);
    expect(inst(after, shield).attachedTo).toBe(leader);
    expect(inst(after, leader).attachments).toContain(shield);
    expect(ofType(events, "permanentAttachmentRehosted")).toEqual([
      { type: "permanentAttachmentRehosted", instanceId: shield, fromInstanceId: hero, hostInstanceId: leader },
    ]);
    expect(ofType(events, "statusGiven").filter((e) => e.instanceId === leader && e.status === "tough")).toHaveLength(
      1,
    );
    expect(inst(after, leader).statuses.tough).toBe(1);
  });

  it("the Shield on Captain America when stage I is defeated: it stays on him through the stage change and no tough status card is given", () => {
    const base = shieldGame(DEPS, SETS);
    const leader = leaderOf(base);
    const shield = shieldOf(base);
    expect(base.villains[0]!.stageIndex).toBe(0);
    // One hit point left on stage I; Tigra's basic attack (ATK 2) defeats it.
    const state = withDamage(base, leader, maxHitPoints(base, leader, DEPS)! - 1);
    const { state: after, events } = drive(DEPS, state, {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: identityOf(state, P1),
      targetInstanceId: leader,
    });
    expect(after.outcome).toBeNull();
    expect(after.villains[0]!.stageIndex).toBe(1);
    expect(leaderOf(after)).toBe(leader);
    expect(inst(after, shield).attachedTo).toBe(leader);
    expect(inst(after, leader).attachments).toContain(shield);
    expect(ofType(events, "permanentAttachmentRehosted")).toEqual([]);
    expect(ofType(events, "statusGiven").filter((e) => e.status === "tough")).toEqual([]);
    expect(inst(after, leader).statuses.tough).toBe(0);
  });
});
