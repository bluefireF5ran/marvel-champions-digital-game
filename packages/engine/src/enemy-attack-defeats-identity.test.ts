/**
 * An enemy attack that reduces an identity to zero hit points defeats a character, and the attack's result says so.
 *
 * Sources: RRG 1.8 "Character" (p. 12): "Identities (heroes and alter-egos), allies, villains, and minions are all
 * characters"; "Defeat" (p. 15): "If a character has zero or fewer remaining hit points … it is defeated … If an identity
 * or stage of the villain is defeated, it is removed from the game"; "Player Elimination" (p. 34). So "after [enemy]
 * attacks and defeats a character" answers the defeat of a hero as it answers an ally's, in a game that continues.
 */

import { flat } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { replay, startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import { playerId } from "./ids.js";
import { mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubMainScheme, stubTreachery, stubVillain } from "./testing/fixtures.js";
import { defaultPick, newGame, runWith } from "./testing/scenario.js";

const p1 = playerId("p1");
const p2 = playerId("p2");
const mark = (amount: number): EffectSpec => ({
  kind: "dealDamage",
  target: { kind: "villain" },
  amount: { kind: "const", value: amount },
});

/** "Forced Response: After the villain attacks and defeats a character, deal 4 damage to the villain." */
const TROPHY = stubAbility("trophy.forced-response", {
  trigger: {
    kind: "response",
    forced: true,
    on: { on: "enemyAttack", sourceIs: { categories: ["villain"] }, requireResults: { defeated: 1 } },
  },
  effects: [mark(4)],
});
/** "Forced Response: After an identity is defeated, deal 1 damage to the villain." Its listening puts the defeat on the stack. */
const MOURN = stubAbility("mourn.forced-response", {
  trigger: {
    kind: "response",
    forced: true,
    on: { on: "characterDefeated", targetIs: { categories: ["identity"] } },
  },
  effects: [mark(1)],
});

const BLANK = stubTreachery({ id: "blank", boostIcons: 0 });
const VILLAIN = stubVillain({ id: "villain", stages: [{ hp: flat(30), atk: 12, sch: 1 }] });
const scheme = (id: string, abilities: readonly { readonly ref: { readonly id: string } }[]) =>
  stubMainScheme({
    id,
    stages: [
      {
        startingThreat: flat(0),
        targetThreat: flat(40),
        acceleration: flat(0),
        abilities: abilities.map((a) => a.ref) as never,
      },
    ],
  });
const deps: EngineDeps = depsOf(TROPHY, MOURN);

/** Two players; player 1 in hero form (10 hit points), player 2 in alter-ego form; the villain's ATK is 12. */
function villainPhase(...abilities: readonly { readonly ref: { readonly id: string } }[]) {
  const state: GameState = runWith(
    deps,
    newGame({
      players: 2,
      villain: VILLAIN,
      mainScheme: scheme("main", abilities),
      extraCards: [BLANK],
      encounterDeck: Array.from({ length: 30 }, () => BLANK.id),
      deps,
    }),
    { type: "changeForm", playerId: p1 },
  );
  const commands: Command[] = [
    { type: "endTurn", playerId: p1 },
    { type: "endTurn", playerId: p2 },
  ];
  const { session, events } = driveSession(startSession(state), deps, commands, defaultPick);
  return { state: session.state, events, session };
}

const of = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const villainDamage = (state: GameState): number =>
  mustInstance(state, Object.values(state.instances).find((i) => i.cardId === "villain")!.instanceId).damage;
const attackResults = (events: readonly GameEvent[]) =>
  of(events, "triggerEvent")
    .filter((e) => e.phase === "resolved" && e.event.kind === "enemyAttack")
    .map((e) => ("results" in e.event ? e.event.results : undefined));

describe("an enemy attack that defeats an identity", () => {
  it("records the defeat on the attack, so 'attacks and defeats a character' answers it and the game goes on", () => {
    const { state, events, session } = villainPhase(TROPHY);
    const hero = mustPlayer(state, p1).identity.instanceId;
    expect(of(events, "playerEliminated")).toMatchObject([{ playerId: p1 }]);
    expect(of(events, "characterDefeated")).toMatchObject([{ instanceId: hero }]);
    expect(attackResults(events)).toMatchObject([{ defeated: 1 }]);
    expect(villainDamage(state)).toBe(4);
    expect(state.outcome).toBeNull();
    expect(mustPlayer(state, p2).eliminated).toBe(false);
    const replayed = replay(session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(session.state);
  });

  it("with nothing listening the defeat is still logged and recorded on the attack", () => {
    const { state, events } = villainPhase();
    expect(of(events, "characterDefeated")).toHaveLength(1);
    expect(attackResults(events)).toMatchObject([{ defeated: 1 }]);
    expect(villainDamage(state)).toBe(0);
  });

  it("records it as well when the defeat goes on the stack for an ability that hears it", () => {
    const { state, events } = villainPhase(TROPHY, MOURN);
    expect(of(events, "characterDefeated")).toHaveLength(1);
    expect(attackResults(events)).toMatchObject([{ defeated: 1 }]);
    expect(villainDamage(state)).toBe(5);
    expect(state.outcome).toBeNull();
  });
});
