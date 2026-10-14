/**
 * docs/phase7-wave10-box-heroes.md B3.4: `cannotEnterPlay` with `player`, on an identity face, in a real game: the
 * Hulkling starter deck against Core's Rhino. The engine side is driven by
 * `packages/engine/src/cannot-enter-play-per-player.test.ts`.
 *
 * Teddy Altman 56029b: "You cannot have more than 1 Shapeshift upgrade in play." Hulkling's identity module is
 * scripted elsewhere, so this file registers the constant itself, written as that module can write it. The upgrades
 * are the deck's own: Winged Shape 56032 and Hulk Shape 56033 (Shapeshift, cost 2).
 *
 * Ruling January 11, 2026 - Ruling 1: "Teddy Altman's constant ability prevents playing another Shapeshift upgrade
 * while already having one in play (cannot play a second and discard down)." RRG 1.8 "'Cannot'" (p. 11).
 */

import { trait } from "@mc/content";
import {
  cannotEnterPlay as barredFromPlay,
  cardsInPlay,
  legalActions,
  sessionApply,
  startSession,
  type EngineDeps,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { P1, P2, firstLegal, moveToHand, payWith, play } from "../testing/harness.js";
import { driveEventsPicking } from "../testing/staging.js";
import { WAVE10_DEPS, hulklingGame, hulklingHeroGame, stagedInPlay } from "../wave10/testing.js";
import { cannotEnterPlay, constant, rule } from "./abilities.js";
import { defineAbilities, validateDefinition } from "./validate.js";
import { exists, query, you } from "./values.js";

vi.setConfig({ testTimeout: 120_000 });

const WINGED_SHAPE = "56032";
const HULK_SHAPE = "56033";
const HELICARRIER = "01092"; // Core basic support, in the Core Spider-Man starter deck

const SHAPESHIFT = trait("Shapeshift");
/** "You cannot have more than 1 Shapeshift upgrade in play." */
const CONSTANT = constant(
  rule(
    cannotEnterPlay(query("upgrade", { trait: SHAPESHIFT }), {
      while: exists(query("upgrade", { trait: SHAPESHIFT, controller: "you" })),
      player: you,
    }),
  ),
);
const SCRIPTS = defineAbilities({ "56029b.teddy-altman-constant": CONSTANT });
const deps: EngineDeps = { ...WAVE10_DEPS, abilities: { ...WAVE10_DEPS.abilities, ...SCRIPTS } };

/** `code` in player 1's hand, and the command that plays it paying with two other cards. */
function inHand(state: GameState, code: string) {
  const given = moveToHand(state, P1, code);
  const [id] = given.ids as [InstanceId];
  return { state: given.state, id, command: play(P1, id, payWith(given.state, P1, 2, [id])) };
}
const offered = (state: GameState, id: InstanceId): boolean => {
  const listed = legalActions(state, P1, deps);
  if (listed.kind !== "turn") throw new Error(listed.kind);
  return listed.legal.some((a) => a.action.kind === "playCard" && a.action.instanceId === id);
};

describe("B3.4 the DSL surface", () => {
  it("builds the rule with its player, plain data the validator accepts", () => {
    expect(CONSTANT.trigger).toEqual({
      kind: "constant",
      rules: [
        {
          kind: "cannotEnterPlay",
          cards: { categories: ["upgrade"], trait: "SHAPESHIFT" },
          while: { kind: "exists", query: { categories: ["upgrade"], trait: "SHAPESHIFT", controller: "you" } },
          player: { kind: "controller" },
        },
      ],
    });
    expect(validateDefinition(CONSTANT)).toEqual([]);
    expect(JSON.parse(JSON.stringify(CONSTANT))).toEqual(CONSTANT);
    // Without the option the rule is the scenario rule it was.
    expect(cannotEnterPlay(query("ally", { name: "Professor X" }))).toEqual({
      kind: "cannotEnterPlay",
      cards: { categories: ["ally"], name: "Professor X" },
    });
  });
});

describe("B3.4 Teddy Altman 56029b against Core Rhino", () => {
  it("with Hulk Shape in play, Winged Shape is not offered and the refusal names Teddy Altman", () => {
    const shaped = stagedInPlay(hulklingGame({ deps }), HULK_SHAPE, { attach: true });
    const winged = inHand(shaped.state, WINGED_SHAPE);
    expect(offered(winged.state, winged.id)).toBe(false);
    const tried = sessionApply(startSession(winged.state), winged.command, deps);
    expect(tried.ok).toBe(false);
    if (tried.ok) return;
    expect(tried.error.code).toBe("no_valid_target");
    expect(tried.error.message).toBe("Teddy Altman: Winged Shape cannot enter play");
  });

  it("with no shape in play, Winged Shape is offered and enters play, and then Hulk Shape is refused", () => {
    const winged = inHand(hulklingGame({ deps }), WINGED_SHAPE);
    expect(offered(winged.state, winged.id)).toBe(true);
    const { state } = driveEventsPicking(deps, winged.state, firstLegal, winged.command);
    expect(cardsInPlay(state)).toContain(winged.id);
    const hulk = inHand(state, HULK_SHAPE);
    expect(offered(hulk.state, hulk.id)).toBe(false);
  });

  it("as Hulkling the face is down: a second shape may be played; his own Chosen Shape then discards the first", () => {
    const shaped = stagedInPlay(hulklingHeroGame({ deps }), HULK_SHAPE, { attach: true });
    const winged = inHand(shaped.state, WINGED_SHAPE);
    expect(offered(winged.state, winged.id)).toBe(true);
    const { state } = driveEventsPicking(deps, winged.state, firstLegal, winged.command);
    // Teddy's bar is the alter-ego face's, so Winged Shape enters play; Hulkling's Chosen Shape (56029a, scripted in
    // wave10/cw/hulkling/identity.ts) then discards each other Shapeshift upgrade he controls.
    expect(cardsInPlay(state)).toContain(winged.id);
    expect(cardsInPlay(state)).not.toContain(shaped.id);
  });

  it("only Teddy's player is stopped: Winged Shape is barred for seat 1 and not for seat 2, who plays a support", () => {
    const shaped = stagedInPlay(hulklingGame({ deps, twoPlayers: true }), HULK_SHAPE, { attach: true });
    const winged = inHand(shaped.state, WINGED_SHAPE);
    expect(barredFromPlay(winged.state, deps, winged.id, P1)).toBe(true);
    expect(barredFromPlay(winged.state, deps, winged.id, P2)).toBe(false);
    const ended = driveEventsPicking(deps, shaped.state, firstLegal, { type: "endTurn", playerId: P1 }).state;
    const given = moveToHand(ended, P2, HELICARRIER);
    const [id] = given.ids as [InstanceId];
    const { state } = driveEventsPicking(
      deps,
      given.state,
      firstLegal,
      play(P2, id, payWith(given.state, P2, 3, [id])),
    );
    expect(cardsInPlay(state)).toContain(id);
  });
});
