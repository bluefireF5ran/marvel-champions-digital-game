import {
  applyCommand,
  legalActions,
  paymentFor,
  replay,
  sessionApply,
  startSession,
  tryPayment,
  type AbilityRegistry,
  type Command,
  type EngineDeps,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { P1, P2, identityOf, inst, moveToHand, patchInstance, play, playerOf, use } from "../testing/harness.js";
import { WAVE10_DEPS } from "../wave10/testing.js";
import { constant, costsPayableByAnyPlayer } from "./abilities.js";
import { defineAbilities, validateDefinition } from "./validate.js";
import { query } from "./values.js";
import {
  APPEAL,
  APPEAL_ACTION,
  BACKFLIP,
  EFFORT_REF,
  EXHAUST_BRANCH,
  GENIUS,
  SPEND_BRANCH,
  UNREGISTERED_ACTION,
  UNREGISTERED_SUPER,
  effortInHand,
  effortOn,
  emptyHand,
  herculesTable,
  obligationHeld,
} from "./wave10-costs-payable-by-any-player.testing.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * docs/phase7-wave10-hero-packs.md H3.19 (engine task HT16): `costsPayableByAnyPlayer`, "While paying costs on
 * attached card, any player may help pay those costs." (Coordinated Effort, `wonder_man` 58032), in a real two-player
 * game against Core's Rhino: Hercules holds the obligation, Core's Spider-Man helps pay. The engine's
 * `costs-payable-by-any-player.test.ts` drives the plain data, including the parts no card in this pool prints on an
 * encounter card ("take 2 damage").
 *
 * The card is scripted here, for this test only, so the test stands whatever the pack's module registers.
 *
 * Sources: RRG 1.8 "Cost" (pp. 13-14); "Alliance" (p. 6: "any player may contribute to paying those costs", the same
 * words); "Obligation" (p. 30: only the player with the obligation in their play area triggers it). Owner answer 21B
 * (docs/phase7-wave10.md section 4.0), an interpretation: no ruling names the card.
 */
const EFFORT_SCRIPT: AbilityRegistry = defineAbilities({ [EFFORT_REF]: constant(costsPayableByAnyPlayer()) });
const DEPS: EngineDeps = { abilities: { ...WAVE10_DEPS.abilities, ...EFFORT_SCRIPT } };

/** Applies the commands through a session, taking each choice's first option; the log replays to the same state. */
function drive(state: GameState, ...commands: readonly Command[]) {
  let session = startSession(state);
  const events: GameEvent[] = [];
  const apply = (command: Command) => {
    const result = sessionApply(session, command, DEPS);
    if (!result.ok) throw new Error(`${command.type} rejected: ${result.error.code}: ${result.error.message}`);
    session = result.session;
    events.push(...result.events);
  };
  for (const command of commands) {
    apply(command);
    for (let guard = 0; session.state.pendingChoice && !session.state.outcome; guard++) {
      if (guard > 50) throw new Error(`choices did not settle (${session.state.pendingChoice.prompt.kind})`);
      const choice = session.state.pendingChoice;
      apply({
        type: "resolveChoice",
        playerId: choice.playerId,
        choiceId: choice.choiceId,
        selectedOptionIds: choice.options.slice(0, Math.max(1, choice.minSelections)).map((o) => o.optionId),
      });
    }
  }
  const replayed = replay(session.log, DEPS);
  if (!replayed.ok) throw new Error(replayed.error.message);
  expect(replayed.state).toEqual(session.state);
  return { state: session.state, events };
}
const refusal = (state: GameState, command: Command) => {
  const result = applyCommand(state, command, DEPS);
  return result.ok ? null : result.error.code;
};
const fromHand = (...ids: readonly InstanceId[]) => ids.map((id) => ({ fromHand: id }));

/**
 * Two players, Appeal to Athena in Hercules's play area, his hand empty, a Genius in Spider-Man's hand; with `effort`,
 * Coordinated Effort played onto the obligation.
 */
function table(effort: boolean) {
  const held = obligationHeld(herculesTable({ twoPlayers: true, deps: DEPS }), APPEAL);
  const attached = effort ? effortOn(held.state, held.id, DEPS).state : held.state;
  const given = moveToHand(emptyHand(attached, P1), P2, GENIUS);
  return { state: given.state, appeal: held.id, genius: given.ids[0]! };
}

describe("§H3.19 `costsPayableByAnyPlayer`", () => {
  it("builds the rule on the attached card by default, or on the cards a query names, and refuses an empty query", () => {
    const definition = constant(costsPayableByAnyPlayer());
    expect(definition.trigger).toEqual({
      kind: "constant",
      rules: [{ kind: "costsPayableByAnyPlayer", card: { hostOfSelf: true } }],
    });
    expect(validateDefinition(definition)).toEqual([]);
    expect(constant(costsPayableByAnyPlayer(query("obligation"))).trigger).toMatchObject({
      rules: [{ kind: "costsPayableByAnyPlayer", card: { categories: ["obligation"] } }],
    });
    expect(validateDefinition(constant(costsPayableByAnyPlayer({})))).toEqual([
      "costsPayableByAnyPlayer: the rule names the card whose costs are shared (default: the attached card); an empty query names every card in play",
    ]);
    expect(validateDefinition(EFFORT_SCRIPT[EFFORT_REF]!)).toEqual([]);
  });

  it("Coordinated Effort attaches to an encounter card in play, one per card", () => {
    const held = obligationHeld(herculesTable({ twoPlayers: true, deps: DEPS }), APPEAL);
    const first = effortOn(held.state, held.id, DEPS);
    expect(inst(first.state, first.id).attachedTo).toBe(held.id);
    expect(inst(first.state, first.id).controllerId).toBe(P1);
    // "Max 1 per encounter card": a second copy has other hosts (the villain, the main scheme), not this card.
    const second = effortInHand(first.state);
    expect(refusal(second.state, play(P1, second.id, [], { attachToInstanceId: held.id }))).not.toBeNull();
    expect(
      refusal(second.state, play(P1, second.id, [], { attachToInstanceId: second.state.mainScheme.instanceId })),
    ).toBeNull();
  });

  it("Appeal to Athena, Hercules's hand empty: the other player spends a Genius and the obligation is removed from the game", () => {
    const t = table(true);
    const { state, events } = drive(
      t.state,
      use(P1, t.appeal, APPEAL_ACTION, fromHand(t.genius), undefined, SPEND_BRANCH),
    );
    expect(state.removedFromGame).toContain(t.appeal);
    expect(playerOf(state, P2).discard).toContain(t.genius);
    // Hercules paid nothing of his own and did not exhaust: the helper's Genius is the whole payment.
    expect(inst(state, identityOf(state, P1)).exhausted).toBe(false);
    const spent = events.filter((e) => e.type === "cardDiscardedFromHand");
    expect(spent.map((e) => (e.type === "cardDiscardedFromHand" ? e.playerId : null))).toEqual([P2]);
  });

  it("legalActions offers the spend branch with the helper's Genius, and the pay prompt lists the helper's hand", () => {
    const t = table(true);
    const actions = legalActions(t.state, P1, DEPS);
    const legal =
      actions.kind === "turn"
        ? actions.legal.find((a) => a.action.kind === "useAbility" && a.action.instanceId === t.appeal)
        : undefined;
    expect(legal?.costBranches).toEqual([0, 1]);
    const ATHENA = { kind: "useAbility", instanceId: t.appeal, abilityId: APPEAL_ACTION as never } as const;
    const query = paymentFor(t.state, P1, ATHENA, { costSelection: SPEND_BRANCH }, DEPS);
    // Hercules's hand is empty, so every hand card listed is the helper's.
    const handCards = query?.sources.filter((source) => source.kind === "handCard").map((source) => source.instanceId);
    expect(handCards).toEqual(playerOf(t.state, P2).hand);
    // The engine's own suggestion is made of the helper's cards, the Genius among them; the Genius alone pays it.
    expect(query?.suggested).toContain(`hand:${t.genius}`);
    const alone = tryPayment(t.state, P1, ATHENA, [`hand:${t.genius}`], { costSelection: SPEND_BRANCH }, DEPS);
    expect(alone.ok).toBe(true);
  });

  it("without the upgrade the other player's Genius is refused, and Hercules alone cannot afford the spend branch", () => {
    const t = table(false);
    const command = use(P1, t.appeal, APPEAL_ACTION, fromHand(t.genius), undefined, SPEND_BRANCH);
    expect(refusal(t.state, command)).toBe("card_not_in_zone");
    const actions = legalActions(t.state, P1, DEPS);
    const legal =
      actions.kind === "turn"
        ? actions.legal.find((a) => a.action.kind === "useAbility" && a.action.instanceId === t.appeal)
        : undefined;
    expect(legal?.costBranches).toEqual([0]);
  });

  it("only the player holding the obligation triggers it: the helper pays, and cannot use the ability themself", () => {
    const t = table(true);
    const command = use(P2, t.appeal, APPEAL_ACTION, fromHand(t.genius), undefined, SPEND_BRANCH);
    expect(refusal(t.state, command)).not.toBeNull();
  });

  it("'Exhaust Hercules' names the user's own card: an exhausted Hercules cannot pay it and no other player exhausts for him", () => {
    const t = table(true);
    const tired = patchInstance(t.state, identityOf(t.state, P1), { exhausted: true });
    expect(refusal(tired, use(P1, t.appeal, APPEAL_ACTION, [], undefined, EXHAUST_BRANCH))).toBe("already_exhausted");
    const handed = { ...EXHAUST_BRANCH, paidBy: { exhaustIdentity: P2 } } as never;
    expect(refusal(tired, use(P1, t.appeal, APPEAL_ACTION, [], undefined, handed))).toBe("invalid_choice");
    // Paid by Hercules, it exhausts Hercules and nobody else.
    const { state } = drive(t.state, use(P1, t.appeal, APPEAL_ACTION, [], undefined, EXHAUST_BRANCH));
    expect(inst(state, identityOf(state, P1)).exhausted).toBe(true);
    expect(inst(state, identityOf(state, P2)).exhausted).toBe(false);
  });

  it("a cost on another encounter card is not shared, and a discard from hand may be the helper's on the attached one", () => {
    // Unregistered Super: "Alter-Ego Action: Discard an identity-specific card from your hand → discard this card."
    const appeal = obligationHeld(herculesTable({ twoPlayers: true, deps: DEPS }), APPEAL);
    const other = obligationHeld(appeal.state, UNREGISTERED_SUPER);
    const onAppeal = effortOn(other.state, appeal.id, DEPS).state;
    const given = moveToHand(emptyHand(onAppeal, P1), P2, BACKFLIP);
    const flip = given.ids[0]!;
    const discardHelpers = use(P1, other.id, UNREGISTERED_ACTION, [], { discard: [flip] });
    // The upgrade is on Appeal to Athena, so Unregistered Super's cost is Hercules's alone.
    expect(refusal(given.state, discardHelpers)).toBe("card_not_in_zone");

    // A second copy on Unregistered Super: Spider-Man's Backflip pays the discard.
    const onBoth = effortOn(given.state, other.id, DEPS).state;
    const { state } = drive(emptyHand(onBoth, P1), discardHelpers);
    expect(playerOf(state, P2).discard).toContain(flip);
    expect(playerOf(state, P1).playArea).not.toContain(other.id);
  });
});
