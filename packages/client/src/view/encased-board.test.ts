/**
 * Encased in Ice (`winter` 54035): an attachment on a hero that bars the host from attacking any enemy but it, that
 * any player may attack as if it were a minion, and that holds the damage. The board reads all of this from the engine
 * (`legalActions`' targets, `breakPointOf`'s state check, the card's own text for the bar); nothing here decides a rule.
 * The state is a real Thunderbolts game (Whiteout set, solo Spider-Man) with the cards attached by hand.
 */
import { describe, expect, test } from "vitest";
import {
  cardsInPlay,
  legalActions,
  type CardInstance,
  type GameState,
  type InstanceId,
  type PlayerId,
  type LegalActions,
  type OutcomePreview,
} from "@mc/engine";
import { LocalEngineHost } from "../engine/local-host.js";
import { POOL_DEPS } from "../content/pool.js";
import { SessionStore } from "../store/session-store.js";
import { nextTurn } from "../store/dev-game-steps.js";
import {
  ATTACK_REFUSED_MESSAGE,
  attackBarNote,
  attackBarsOn,
  attackRefusalWording,
  withAttackBarWording,
} from "./attack-bar.js";
import { attachmentChipDamage, attachmentChipDamageTag, characterPanel } from "./board-model.js";
import { breakPointOf } from "./break-point.js";
import { highlights } from "./highlights.js";
import { inspectModel } from "./inspect-model.js";
import { attachedLinks, placementNotes, tuckedSiblings } from "./inspect-notes.js";
import { outcomeLines } from "./targeting-panel.js";

const ICE = "54035";
const seat = (state: GameState): PlayerId => state.players[0]!.playerId;
/** A started solo game on the Thunderbolts board, past setup, on the player's turn. */
async function opened(): Promise<GameState> {
  const store = new SessionStore(new LocalEngineHost());
  await store.start({
    scenarioId: "thunderbolts",
    difficulty: "standard",
    players: [{ starterDeckId: "core-spider-man-justice" }],
    setAsideModularSetIds: ["whiteout", "power_of_the_atom"],
    seed: 2,
  });
  const turn = await nextTurn(store);
  // Spider-Man starts as Peter Parker; the attacks are the hero's.
  const flip = turn?.legal.find((entry) => entry.action.kind === "changeForm");
  if (flip) await store.dispatch(flip.example);
  return store.state.game!;
}

/** `state` with a copy of `code` taken out of wherever it waits and attached to `host`, as its own text would have. */
function attach(state: GameState, host: InstanceId, code: string, patch: Partial<CardInstance> = {}) {
  const inPlay = new Set(cardsInPlay(state));
  const found = Object.values(state.instances).find(
    (instance) => (instance.cardId as string) === code && !inPlay.has(instance.instanceId),
  )!;
  const id = found.instanceId;
  const take = (ids: readonly InstanceId[]) => ids.filter((other) => other !== id);
  const next = {
    ...state,
    encounterDecks: Object.fromEntries(
      Object.entries(state.encounterDecks).map(([key, pile]) => [
        key,
        { ...pile, deck: take(pile.deck), discard: take(pile.discard) },
      ]),
    ),
    instances: {
      ...state.instances,
      [id]: { ...found, attachedTo: host, faceup: true, ...patch },
      [host]: { ...state.instances[host]!, attachments: [...state.instances[host]!.attachments, id] },
    },
  } as GameState;
  return { state: next, id };
}

const damaged = (state: GameState, id: InstanceId, damage: number): GameState =>
  ({ ...state, instances: { ...state.instances, [id]: { ...state.instances[id]!, damage } } }) as GameState;

describe("Encased in Ice on the hero", () => {
  test("the chip counts the damage against the 3 it takes, in words", async () => {
    const game = await opened();
    const hero = game.players[0]!.identity.instanceId;
    const { state, id } = attach(game, hero, ICE);
    expect(breakPointOf(state, id, POOL_DEPS)).toBe(3);

    const chip = (s: GameState) => characterPanel(s, hero, POOL_DEPS).attachments.find((a) => a.instanceId === id)!;
    expect(attachmentChipDamage(chip(state))).toBe("0/3");
    expect(attachmentChipDamageTag(chip(damaged(state, id, 2)))).toBe("2/3 dmg");
  }, 120_000);

  test("the hero's attacks can only go to the ice, and the character names what limits them", async () => {
    const game = await opened();
    const hero = game.players[0]!.identity.instanceId;
    const { state, id } = attach(game, hero, ICE);
    const actions = legalActions(state, seat(state), POOL_DEPS);
    if (actions.kind !== "turn") throw new Error(actions.kind);
    const attack = actions.legal.find((entry) => entry.action.kind === "basicAttack");
    expect(attack?.targets).toEqual([id]);

    expect(attackBarsOn(state, hero, POOL_DEPS)).toEqual([id]);
    expect(attackBarNote(state, POOL_DEPS, hero)).toBe("Limited by Encased in Ice");
    expect(inspectModel(state, hero, actions, seat(state), POOL_DEPS).attackBarNote).toBe("Limited by Encased in Ice");
    // A hero with nothing on it has no such line.
    expect(attackBarNote(game, POOL_DEPS, hero)).toBeNull();
  }, 120_000);

  test("a refused attack names the ice, not a guard minion", async () => {
    const game = await opened();
    const hero = game.players[0]!.identity.instanceId;
    const { state } = attach(game, hero, ICE);
    const actions = legalActions(state, seat(state), POOL_DEPS);
    if (actions.kind !== "turn") throw new Error(actions.kind);
    const attack = actions.legal.find((entry) => entry.action.kind === "basicAttack")!;
    // The other enemies are refused with the engine's one message for every refused attack.
    expect(attack.blockedTargets.length).toBeGreaterThan(0);
    for (const target of attack.blockedTargets) expect(target.message).toBe(ATTACK_REFUSED_MESSAGE);

    // (A card in hand that can aim at an enemy keeps its own block out of this: only the attack's refusals are reworded.)
    const marks = withAttackBarWording({ ...highlights(actions), anyTarget: new Set() }, actions, state, POOL_DEPS);
    const reason = "Encased in Ice stops Spider-Man attacking it";
    for (const target of attack.blockedTargets) expect(marks.blocked.get(target.instanceId)).toBe(reason);

    // When no enemy is left for the hero to hit, the dimmed Attack button gives the same reason.
    const none: LegalActions = {
      ...actions,
      legal: actions.legal.filter((entry) => entry.action.kind !== "basicAttack"),
      illegal: [
        ...actions.illegal,
        {
          action: attack.action,
          reason: "no_valid_target",
          message: ATTACK_REFUSED_MESSAGE,
          blockedTargets: attack.blockedTargets,
        },
      ],
    };
    const dimmed = withAttackBarWording(highlights(none), none, state, POOL_DEPS).basics.find(
      (basic) => basic.action === "attack",
    )!;
    expect(dimmed.enabled).toBe(false);
    expect(dimmed.reason).toBe(reason);

    // A refusal that is not the engine's catch-all, or an attacker nothing bars, keeps the engine's own words.
    expect(attackRefusalWording(state, POOL_DEPS, hero, "that enemy is in another game area")).toBe(
      "that enemy is in another game area",
    );
    expect(attackRefusalWording(game, POOL_DEPS, hero, ATTACK_REFUSED_MESSAGE)).toBe(ATTACK_REFUSED_MESSAGE);
  }, 120_000);

  test("Inspect lists what is attached as links, and steps between the host and its attachment", async () => {
    const game = await opened();
    const hero = game.players[0]!.identity.instanceId;
    const { state, id } = attach(game, hero, ICE);
    expect(attachedLinks(state, hero)).toEqual({
      host: null,
      attachments: [{ instanceId: id, name: "Encased in Ice" }],
    });
    expect(attachedLinks(state, id)).toEqual({ host: { instanceId: hero, name: "Spider-Man" }, attachments: [] });
    expect(attachedLinks(game, hero)).toBeNull();
    expect(inspectModel(state, hero, null, seat(state), POOL_DEPS).attached?.attachments).toHaveLength(1);
    expect(placementNotes(state, id)).toEqual([]);
    expect(tuckedSiblings(state, hero)).toEqual([hero, id]);
    expect(tuckedSiblings(state, id)).toEqual([hero, id]);
    expect(tuckedSiblings(game, hero)).toEqual([]);
  }, 120_000);

  test("a preview of an attack on the ice says what it does to the count, and where it breaks", () => {
    const snapshot = (damage: number, inPlay = true) => ({
      inPlay,
      damage,
      remainingHitPoints: null,
      maxHitPoints: null,
      threat: null,
      threatLimit: null,
      exhausted: false,
      statuses: { stunned: 0, confused: 0, tough: 0 },
    });
    const preview = (before: number, after: number, stays = true): OutcomePreview =>
      ({
        stop: { kind: "complete" },
        events: [],
        counters: [{ instanceId: "ice" as InstanceId, before: snapshot(before), after: snapshot(after, stays) }],
        outcome: null,
      }) as unknown as OutcomePreview;
    const name = (id: InstanceId) => id as string;
    expect(outcomeLines(preview(0, 2), name, "ice" as InstanceId, () => 3)).toEqual(["0 → 2 damage (breaks at 3)"]);
    expect(outcomeLines(preview(2, 4, false), name, "ice" as InstanceId, () => 3)).toEqual(["2 damage → Breaks"]);
    expect(outcomeLines(preview(0, 2), name, "ice" as InstanceId)).toEqual(["0 → 2 damage"]);
  });
});
