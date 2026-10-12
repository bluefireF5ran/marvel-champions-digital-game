/**
 * docs/phase7-wave10-hero-packs.md H3.10 (engine task HT8): `reduceNextCardCost(player, "toZero", …)`, with the real
 * Recruitment Drive 59023 in a real Hercules game against Core's Rhino. The script is this test's own; the pack's
 * Leadership module (`../wave10/hercules/leadership.ts`) is scripted elsewhere. The engine's
 * `next-card-cost-to-zero.test.ts` drives the plain data.
 *
 * Recruitment Drive: "Alter-ego form only. Action: Discard Recruitment Drive and choose a player → reduce the resource
 * cost of the next ally that player plays this phase to 0." Allies used: Thor 59020 (cost 4), Namora 59019 (cost 4) and
 * Deathcry 59018 (cost 3). RRG 1.8 "Lasting Effects" (p. 26): the effect expires at the end of the phase whether or not
 * it was used.
 */

import {
  applyCommand,
  createGame,
  playCostOf,
  type AbilityDefinition,
  type EngineDeps,
  type GameEvent,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import {
  action,
  choosePlayer,
  chosenPlayer,
  discardThis,
  query,
  reduceNextCardCost,
  validateDefinition,
  you,
} from "./index.js";
import { coreScenario } from "../core/setup.js";
import {
  P1,
  P2,
  endTurn,
  firstLegal,
  inst,
  moveToHand,
  play,
  playerOf,
  settle,
  use,
  type Picker,
} from "../testing/harness.js";
import {
  CORE_SPIDER_MAN,
  HERCULES_DECK,
  HERO_PACK_CARDS,
  herculesGame,
  heroPackConfig,
  stagedInPlay,
} from "../wave10/testing.js";
import { depsWith, drive } from "./wave10-labor.testing.js";

vi.setConfig({ testTimeout: 120_000 });

const RECRUITMENT_DRIVE = "59023";
const ACTION = "59023.recruitment-drive-action";
const THOR = "59020";
const NAMORA = "59019";
const DEATHCRY = "59018";

const SCRIPTS: Readonly<Record<string, AbilityDefinition>> = {
  [ACTION]: action(
    { cost: discardThis },
    choosePlayer("player"),
    reduceNextCardCost(chosenPlayer("player"), "toZero", "phase", query("ally")),
  ),
};
const DEPS: EngineDeps = depsWith(SCRIPTS);

const reductions = (state: GameState) => state.lastingEffects.filter((e) => e.kind === "costReduction");
const ended = (events: readonly GameEvent[]) =>
  events.flatMap((e) => (e.type === "lastingEffectEnded" ? [e.reason] : []));
/** Answers "choose a player" with `player`, everything else by default. */
const choosing =
  (player: PlayerId): Picker =>
  (state) => {
    const choice = state.pendingChoice;
    if (choice?.prompt.kind !== "choosePlayer") return firstLegal(state);
    const option = choice.options.find((o) => JSON.stringify(o).includes(`"${player}"`));
    return option ? [option.optionId] : firstLegal(state);
  };
/** Recruitment Drive in play under Hercules's control, used for `player`: the state after its Action. */
function driven(base: GameState, player: PlayerId = P1) {
  const staged = stagedInPlay(base, RECRUITMENT_DRIVE);
  const run = drive(staged.state, use(P1, staged.id, ACTION), choosing(player), DEPS);
  return { ...run, drive: staged.id };
}
/** The card in `player`'s hand and what it costs them to play now. */
function priced(state: GameState, code: string, player: PlayerId = P1) {
  const given = moveToHand(state, player, code);
  const id = given.ids[0]!;
  return { state: given.state, id, cost: playCostOf(given.state, player, id, DEPS) };
}
/** Plays `id` from `player`'s hand paying with `n` other cards from it; the refusal code when it is refused. */
function playPaying(state: GameState, id: InstanceId, n: number, player: PlayerId = P1) {
  const payers = playerOf(state, player)
    .hand.filter((card) => card !== id)
    .slice(0, n);
  if (payers.length < n) throw new Error(`${player} has fewer than ${n} other cards in hand`);
  const result = applyCommand(state, play(player, id, payers), DEPS);
  if (!result.ok) return { ok: false as const, code: result.error.code };
  const settled = settle(result.state, firstLegal, (s) => !s.pendingChoice, DEPS);
  return { ok: true as const, state: settled, events: result.events };
}

/** Hercules (first player) and Core's Spider-Man against Rhino, at Hercules's first turn, both in alter-ego form. */
function twoPlayerGame(): GameState {
  const config = heroPackConfig(HERCULES_DECK);
  const second = coreScenario("rhino", {
    players: [{ starterDeckId: CORE_SPIDER_MAN }],
    seed: 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: HERO_PACK_CARDS,
  } as never).players[0]!;
  const created = createGame({ ...config, players: [...config.players, second] }, DEPS);
  if (!created.ok) throw new Error(`${created.error.code}: ${created.error.message}`);
  return settle(created.state, firstLegal, (s) => s.step.phase === "player", DEPS);
}

describe("H3.10 the script", () => {
  it("is a valid definition that names the chosen player and sets the cost to 0", () => {
    expect(validateDefinition(SCRIPTS[ACTION]!)).toEqual([]);
    expect(SCRIPTS[ACTION]!.effects[1]).toEqual({
      kind: "reduceNextCardCost",
      player: { kind: "slot", slot: "player" },
      amount: { kind: "const", value: 0 },
      toZero: true,
      duration: "phase",
      cardFilter: { categories: ["ally"] },
    });
    expect(reduceNextCardCost(you, 2, "phase")).not.toHaveProperty("toZero");
  });

  it("the validator refuses 'to 0' on a reduction by destination", () => {
    const bad = action(reduceNextCardCost(you, "toZero", "phase", query("ally"), { into: { scenarioPlayArea: "m" } }));
    expect(validateDefinition(bad)).toEqual([
      "reduceNextCardCost: a cost is reduced to 0 for a play to the player's own area, not with `into`",
    ]);
  });
});

describe("H3.10 Recruitment Drive 59023: the next ally that player plays this phase costs 0", () => {
  it("Recruitment Drive is discarded, and Thor (cost 4) costs 0 and is played with no resources", () => {
    const run = driven(herculesGame({ deps: DEPS }));
    expect(playerOf(run.state, P1).discard).toContain(run.drive);
    expect(reductions(run.state)).toMatchObject([
      { playerId: P1, amount: 0, toZero: true, duration: { kind: "endOfPhase" } },
    ]);
    const thor = priced(run.state, THOR);
    expect(thor.cost).toMatchObject({ printed: 4, current: 0, reduction: 4 });
    const played = playPaying(thor.state, thor.id, 0);
    if (!played.ok) throw new Error(played.code);
    expect(playerOf(played.state, P1).playArea).toContain(thor.id);
    expect(ended(played.events)).toEqual(["consumed"]);
    expect(reductions(played.state)).toEqual([]);
  });

  it("a second ally that phase costs its full cost: Namora 4, not playable for less", () => {
    const run = driven(herculesGame({ deps: DEPS }));
    const thor = priced(run.state, THOR);
    const first = playPaying(thor.state, thor.id, 0);
    if (!first.ok) throw new Error(first.code);
    const namora = priced(first.state, NAMORA);
    expect(namora.cost).toMatchObject({ printed: 4, current: 4, reduction: 0 });
    expect(playPaying(namora.state, namora.id, 0)).toEqual({ ok: false, code: "insufficient_resources" });
  });

  it("a card that is not an ally is priced as printed and leaves the effect waiting", () => {
    const run = driven(herculesGame({ deps: DEPS }));
    const other = playerOf(run.state, P1).hand.find((id) => {
      const card = run.state.cardPool[inst(run.state, id).cardId];
      return card !== undefined && card.type !== "ally" && "cost" in card && typeof card.cost === "number";
    });
    if (!other) throw new Error("no card with a cost that is not an ally in hand");
    const cost = playCostOf(run.state, P1, other, DEPS)!;
    expect(cost.current).toBe(cost.printed);
    expect(cost.reduction).toBe(0);
    expect(priced(run.state, DEATHCRY).cost).toMatchObject({ printed: 3, current: 0, reduction: 3 });
  });

  it("unused at the end of the phase it is gone: next round Thor costs 4", () => {
    const run = driven(herculesGame({ deps: DEPS }));
    const ending = applyCommand(run.state, endTurn(P1), DEPS);
    if (!ending.ok) throw new Error(ending.error.message);
    const next = settle(ending.state, firstLegal, (s) => s.step.phase === "player" && !s.pendingChoice, DEPS);
    expect(next.round).toBe(2);
    expect(reductions(next)).toEqual([]);
    expect(priced(next, THOR).cost).toMatchObject({ printed: 4, current: 4, reduction: 0 });
  });

  it("another player chosen: their next ally costs 0 on their turn of the same phase, and Hercules's Thor costs 4", () => {
    const run = driven(twoPlayerGame(), P2);
    expect(reductions(run.state)).toMatchObject([{ playerId: P2, toZero: true }]);
    expect(priced(run.state, THOR).cost).toMatchObject({ printed: 4, current: 4, reduction: 0 });
    const passed = applyCommand(run.state, endTurn(P1), DEPS);
    if (!passed.ok) throw new Error(passed.error.message);
    const theirs = settle(passed.state, firstLegal, (s) => !s.pendingChoice, DEPS);
    expect(theirs.step.phase).toBe("player");
    const seat = playerOf(theirs, P2);
    const allyCode = [...seat.hand, ...seat.deck]
      .map((id) => theirs.cardPool[inst(theirs, id).cardId]!)
      .find((card) => card.type === "ally" && typeof card.cost === "number" && card.cost > 0)!;
    const ally = priced(theirs, allyCode.id as string, P2);
    expect(ally.cost).toMatchObject({ current: 0, reduction: ally.cost!.printed });
    const played = playPaying(ally.state, ally.id, 0, P2);
    if (!played.ok) throw new Error(played.code);
    expect(playerOf(played.state, P2).playArea).toContain(ally.id);
    expect(reductions(played.state)).toEqual([]);
  });
});
