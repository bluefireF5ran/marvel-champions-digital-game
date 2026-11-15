/**
 * docs/phase7-wave4.md §3.34: "the attacking enemy" from a trigger that is not the attack's own (Flow Like Water,
 * `vision` 26016). The in-attack case is driven in a real game (`packages/cards/src/wave4/vision/vision-pack-cards.test.ts`,
 * Mass Increase during Rhino's attack); here, the two edges of the ref.
 */

import { describe, expect, it } from "vitest";
import { resolveRef } from "./select.js";
import type { InstanceId } from "./ids.js";
import type { GameState } from "./state.js";
import { gameAtFirstTurn, P1 } from "./testing/wave3.js";
import { NO_ABILITIES } from "./abilities.js";

const deps = { abilities: NO_ABILITIES };
const context = { selfInstanceId: null, controllerId: P1, event: null, bindings: {}, deps };

describe("§3.34 the attacking enemy", () => {
  it("names nothing outside an attack", () => {
    const state = gameAtFirstTurn({ cards: [], deps });
    expect(resolveRef(state, { kind: "attackingEnemy" }, context)).toEqual([]);
  });

  it("names the enemy of the innermost attack in progress, while it is in play", () => {
    const state = gameAtFirstTurn({ cards: [], deps });
    const villain = state.activeVillainId;
    expect(resolveRef(attackedBy(state, villain), { kind: "attackingEnemy" }, context)).toEqual([villain]);
  });

  it("names nothing once the attacking enemy has left play", () => {
    const state = gameAtFirstTurn({ cards: [], deps });
    expect(resolveRef(attackedBy(state, "gone" as InstanceId), { kind: "attackingEnemy" }, context)).toEqual([]);
  });

  // Old Rivals (22031): Gamora, a friendly character attacking her own player, "is not considered 'an enemy' during
  // the attack" (ruling Oct 26, 2023 (102); owner decision 2026-11-15, #525 item 1).
  it("names nothing when the attacker of an enemy attack is not an enemy (a friendly identity stands in)", () => {
    const state = gameAtFirstTurn({ cards: [], deps });
    const friendly = state.players[0]!.identity.instanceId;
    expect(resolveRef(attackedBy(state, friendly), { kind: "attackingEnemy" }, context)).toEqual([]);
  });

  it("names nothing while a friendly attack is the innermost attack, even with an enemy attack beneath it", () => {
    const state = gameAtFirstTurn({ cards: [], deps });
    const beneath = attackedBy(state, state.activeVillainId);
    const hero = state.players[0]!.identity.instanceId;
    const friendly: GameState = {
      ...beneath,
      stack: [
        {
          frameId: "f-friendly" as never,
          kind: "event",
          event: {
            kind: "attack",
            attackerInstanceId: hero,
            targetInstanceId: hero,
            amount: 3,
            attackedPlayerId: P1,
          },
          stage: "apply",
          vars: {},
          slots: {},
        } as never,
        ...beneath.stack,
      ],
    };
    expect(resolveRef(friendly, { kind: "attackingEnemy" }, context)).toEqual([]);
  });
});

/** `state` with an enemy attack by `attacker` on P1's identity as the innermost frame. */
function attackedBy(state: GameState, attacker: InstanceId): GameState {
  return {
    ...state,
    stack: [
      {
        frameId: "f-attack" as never,
        kind: "event",
        event: {
          kind: "enemyAttack",
          enemyInstanceId: attacker,
          attackedPlayerId: P1,
          targetPlayerId: P1,
          targetInstanceId: state.players[0]!.identity.instanceId,
        },
        stage: "apply",
        vars: {},
        slots: {},
      } as never,
      ...state.stack,
    ],
  };
}
