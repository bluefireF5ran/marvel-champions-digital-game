/**
 * docs/competitive-mode-plan.md §3.3 and §4 task 5 (docs/phase7-wave10.md §3.6): the DSL words `enemyLeader`,
 * `yourLeader`, `yourTeam` and `enemyTeam`, so a script writes what the card prints. The engine's `leader-refs.test.ts`
 * reads the same specs on a two-team state.
 *
 * Sources: MC56 p. 6 (cooperative play): "'the enemy team' refers to the players", "The leader in play is called 'the
 * enemy leader.'", "A card ability that refers to 'your leader' cannot be resolved. … Do as much as you can."; ruling of
 * July 9, 2026 (3) answer 2: outside Civil War scenarios "enemy leader" refers to the villain.
 *
 * The games here are real Core games against Rhino, which is not a Civil War scenario: Helicarrier's action is rebound
 * to each ability under test, so it resolves through the real play and use commands.
 */

import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps, GameState, InstanceId } from "@mc/engine";
import { CORE_DEPS } from "../core/index.js";
import { coreScenario } from "../core/setup.js";
import {
  identityOf as identityInstance,
  inst,
  mainThreat,
  moveToHand,
  P1,
  P2,
  P3,
  payWith,
  play,
  playerOf,
  runWith,
  startCoreGame,
  use,
} from "../testing/harness.js";
import { action } from "./abilities.js";
import { choosePlayer, dealDamage, forEachPlayer, ifThen, placeThreat, stun } from "./effects.js";
import { validateDefinition } from "./validate.js";
import {
  enemyLeader,
  enemyTeam,
  identityOf,
  nextAfter,
  refCount,
  theMainScheme,
  valueAtLeast,
  you,
  yourIdentity,
  yourLeader,
  yourTeam,
} from "./values.js";

const STARTERS = ["core-spider-man-justice", "core-captain-marvel-leadership", "core-iron-man-aggression"] as const;

/** A Core game against Rhino with Helicarrier in play under P1, its action rebound to `definition`. */
function rhinoGame(definition: AbilityDefinition, players: 1 | 3) {
  const deps: EngineDeps = { abilities: { ...CORE_DEPS.abilities, "01092.helicarrier-action": definition } };
  const config = coreScenario("rhino", {
    players: STARTERS.slice(0, players).map((starterDeckId) => ({ starterDeckId })),
    seed: 11,
  });
  const given = moveToHand(startCoreGame(config, deps), P1, "01092");
  const [helicarrier] = given.ids as [InstanceId];
  const state = runWith(deps, given.state, play(P1, helicarrier, payWith(given.state, P1, 3, given.ids)));
  expect(playerOf(state, P1).playArea).toContain(helicarrier);
  const resolve = (): GameState => runWith(deps, state, use(P1, helicarrier, "01092.helicarrier-action"));
  return { state, resolve };
}

const rhino = (state: GameState): InstanceId => state.activeVillainId;
const damageOn = (state: GameState, id: InstanceId): number => inst(state, id).damage;

describe("the builders emit the engine's plain specs", () => {
  it("each word is one plain record", () => {
    expect(enemyLeader).toEqual({ kind: "leader", of: "enemy" });
    expect(yourLeader).toEqual({ kind: "leader", of: "yours" });
    expect(yourTeam).toEqual({ kind: "team", of: "yours" });
    expect(enemyTeam).toEqual({ kind: "team", of: "enemy" });
  });

  it("a script with all four survives serialization unchanged", () => {
    const definition = action(
      dealDamage(2, enemyLeader),
      stun(yourLeader),
      forEachPlayer(yourTeam, placeThreat(1, theMainScheme)),
      choosePlayer("picked", you, { among: enemyTeam }),
    );
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
    expect(definition.effects).toEqual([
      { kind: "dealDamage", target: { kind: "leader", of: "enemy" }, amount: { kind: "const", value: 2 } },
      { kind: "giveStatus", target: { kind: "leader", of: "yours" }, status: "stunned" },
      {
        kind: "forEachPlayer",
        players: { kind: "team", of: "yours" },
        effects: [{ kind: "placeThreat", target: { kind: "mainScheme" }, amount: { kind: "const", value: 1 } }],
      },
      { kind: "choosePlayer", slot: "picked", chooser: { kind: "controller" }, among: { kind: "team", of: "enemy" } },
    ]);
  });
});

describe("the validator", () => {
  it("accepts each word where its kind of thing belongs", () => {
    expect(
      validateDefinition(
        action(
          dealDamage(2, enemyLeader),
          stun(yourLeader),
          forEachPlayer(yourTeam, placeThreat(1, theMainScheme)),
          forEachPlayer(enemyTeam, placeThreat(1, theMainScheme)),
          dealDamage(1, identityOf(enemyTeam)),
          ifThen(valueAtLeast(refCount(identityOf(yourTeam)), 2), placeThreat(1, theMainScheme)),
        ),
      ),
    ).toEqual([]);
  });

  it("refuses a leader where a player is needed", () => {
    const asPlayers = action({ kind: "forEachPlayer", players: yourLeader as never, effects: [] });
    expect(validateDefinition(asPlayers)).toEqual([
      "effects[0] forEachPlayer: players needs a player, and a leader is a card (yourTeam / enemyTeam name players)",
    ]);
    expect(validateDefinition(action(dealDamage(1, identityOf(enemyLeader as never))))).toEqual([
      "effects[0] dealDamage: player needs a player, and a leader is a card (yourTeam / enemyTeam name players)",
    ]);
    expect(validateDefinition(action(dealDamage(1, identityOf(nextAfter(enemyLeader as never)))))).toEqual([
      "effects[0] dealDamage: of needs a player, and a leader is a card (yourTeam / enemyTeam name players)",
    ]);
  });

  it("refuses a team where a card is needed", () => {
    expect(validateDefinition(action(dealDamage(1, enemyTeam as never)))).toEqual([
      "effects[0] dealDamage: target needs a card, and a team is players (identityOf(team) names their identities)",
    ]);
  });

  it("refuses a word of neither side", () => {
    expect(validateDefinition(action(dealDamage(1, { kind: "leader", of: "ally" } as never)))).toEqual([
      'effects[0] dealDamage: leader is of "yours" or "enemy"',
    ]);
    expect(validateDefinition(action(forEachPlayer({ kind: "team" } as never, placeThreat(1, theMainScheme))))).toEqual(
      ['effects[0] forEachPlayer: team is of "yours" or "enemy"'],
    );
  });
});

describe("a real cooperative game against Rhino", () => {
  it.each([1, 3] as const)("%i players: 'the enemy leader' is Rhino: 2 damage on him", (players) => {
    const game = rhinoGame(action(dealDamage(2, enemyLeader)), players);
    const after = game.resolve();
    expect(damageOn(after, rhino(game.state))).toBe(damageOn(game.state, rhino(game.state)) + 2);
  });

  it.each([1, 3] as const)(
    "%i players: the part on 'your leader' does nothing and the rest resolves: 0 damage, 2 threat",
    (players) => {
      const game = rhinoGame(
        action(dealDamage(3, yourLeader), stun(yourLeader), placeThreat(2, theMainScheme)),
        players,
      );
      const after = game.resolve();
      expect(mainThreat(after)).toBe(mainThreat(game.state) + 2);
      expect(inst(after, rhino(game.state))).toEqual(inst(game.state, rhino(game.state)));
      for (const seat of [P1, P2, P3].slice(0, players)) {
        const id = identityInstance(game.state, seat);
        expect(damageOn(after, id)).toBe(damageOn(game.state, id));
        expect(inst(after, id).statuses.stunned ?? 0).toBe(0);
      }
      expect(after.pendingChoice).toBeNull();
      expect(after.stack).toEqual([]);
    },
  );

  it("'Stun your leader. Otherwise, you are stunned.' stuns the player, not Rhino", () => {
    const clause = ifThen(valueAtLeast(refCount(yourLeader), 1), stun(yourLeader), stun(yourIdentity));
    const game = rhinoGame(action(clause), 1);
    const after = game.resolve();
    expect(inst(after, identityInstance(game.state, P1)).statuses.stunned).toBe(1);
    expect(inst(after, rhino(game.state)).statuses.stunned ?? 0).toBe(0);
  });

  it.each([1, 3] as const)("%i players: each player on your team places 1 threat, the enemy team 2 each", (players) => {
    const yours = rhinoGame(action(forEachPlayer(yourTeam, placeThreat(1, theMainScheme))), players);
    expect(mainThreat(yours.resolve())).toBe(mainThreat(yours.state) + players);
    const enemy = rhinoGame(action(forEachPlayer(enemyTeam, placeThreat(2, theMainScheme))), players);
    expect(mainThreat(enemy.resolve())).toBe(mainThreat(enemy.state) + 2 * players);
  });

  it.each([
    [1, 0],
    [3, 4],
  ] as const)("%i players: 'more than 1 player on your team' places %i threat", (players, placed) => {
    const clause = ifThen(valueAtLeast(refCount(identityOf(yourTeam)), 2), placeThreat(4, theMainScheme));
    const game = rhinoGame(action(clause), players);
    expect(mainThreat(game.resolve())).toBe(mainThreat(game.state) + placed);
  });

  it("1 damage to each identity on the enemy team is 1 on each of the three players", () => {
    const game = rhinoGame(action(dealDamage(1, identityOf(enemyTeam))), 3);
    const after = game.resolve();
    for (const seat of [P1, P2, P3]) {
      const id = identityInstance(game.state, seat);
      expect(damageOn(after, id)).toBe(damageOn(game.state, id) + 1);
    }
    expect(damageOn(after, rhino(game.state))).toBe(damageOn(game.state, rhino(game.state)));
  });
});
