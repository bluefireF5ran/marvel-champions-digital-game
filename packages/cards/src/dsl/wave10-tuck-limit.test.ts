import {
  replay,
  sessionApply,
  startSession,
  tuckLimitOf,
  tuckRoom,
  type AbilityRegistry,
  type Command,
  type EngineDeps,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { P1, identityOf, inst, instancesOf, moveToHand, patchInstance, play, playerOf } from "../testing/harness.js";
import { WAVE10_DEPS, wonderManHeroGame } from "../wave10/testing.js";
import { constant, on, response, tuckLimit } from "./abilities.js";
import { andThen, cards, heal, tuckCards } from "./effects.js";
import { defineAbilities, validateDefinition } from "./validate.js";
import { eventTarget, perHero, query, self, yourIdentity } from "./values.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * docs/phase7-wave10-hero-packs.md §H3.12: `tuckLimit`, "Max 3 cards tucked here." (Ionic Physiology, `wonder_man`
 * 58002), in a real Wonder Man game against Core's Rhino. The engine's `tuck-limit.test.ts` drives the plain data.
 *
 * Ionic Physiology's two abilities are scripted here, for this test only: the identity module
 * (`wave10/wonder_man/wonder-man/identity.ts`) is the scripting agent's and is not registered yet. The card is put
 * into play by hand for the same reason (Simon Williams's Setup ability is that module's too).
 *
 * Sources: the card as errata'd (RRG 1.8 p. 70: the cost arrow became "Then"); ruling March 6, 2026 (3) #1 (he may
 * tuck at full hit points) and (4) step 3 ("trigger Ionic Physiology to tuck Leading Blow (if under 3 cards)"); the
 * Wonder Man insert, clarification 1; RRG 1.8 "'Then'" (p. 44).
 */
const CONSTANT = "58002.ionic-physiology-constant";
const RESPONSE = "58002.ionic-physiology-response";
const IONIC: AbilityRegistry = defineAbilities({
  [CONSTANT]: constant(tuckLimit(3)),
  [RESPONSE]: response(
    on.youPlayedCard(query("event", { printedResource: "energy" })),
    tuckCards(cards(eventTarget), self),
    andThen(heal(1, yourIdentity)),
  ),
});
const DEPS: EngineDeps = { abilities: { ...WAVE10_DEPS.abilities, ...IONIC } };

const PHYSIOLOGY = "58002";
const ALTRUISM = "58003"; // Active Altruism: cost 0, [energy]

/** A hero-form Wonder Man game with Ionic Physiology in play, `held` deck cards tucked under it and `damage` on him. */
function table(held: number, damage: number) {
  const base = wonderManHeroGame({ deps: DEPS });
  const physiology = instancesOf(base, PHYSIOLOGY)[0]!;
  const seat = playerOf(base, P1);
  const fodder = seat.deck.filter((id) => inst(base, id).cardId !== ALTRUISM).slice(0, held);
  const without = (ids: readonly InstanceId[]) => ids.filter((id) => id !== physiology && !fodder.includes(id));
  let state: GameState = {
    ...base,
    players: base.players.map((p) =>
      p.playerId === P1
        ? {
            ...p,
            deck: without(p.deck),
            hand: without(p.hand),
            discard: without(p.discard),
            setAside: without(p.setAside),
            playArea: [...without(p.playArea), physiology],
          }
        : p,
    ),
  };
  state = patchInstance(state, physiology, { controllerId: P1, faceup: true, tucked: fodder });
  state = patchInstance(state, identityOf(state, P1), { damage });
  const given = moveToHand(state, P1, ALTRUISM);
  return { state: given.state, physiology, altruism: given.ids[0]!, hero: identityOf(state, P1) };
}

/**
 * Plays Active Altruism, answering each choice: Ionic Physiology's Response is taken whenever it is offered, anything
 * else takes its first option. Returns whether the Response was offered. The log replays to the same state.
 */
function playAltruism(t: ReturnType<typeof table>) {
  let session = startSession(t.state);
  const events: GameEvent[] = [];
  let offered = false;
  const apply = (command: Command) => {
    const result = sessionApply(session, command, DEPS);
    if (!result.ok) throw new Error(`${command.type} rejected: ${result.error.code}: ${result.error.message}`);
    session = result.session;
    events.push(...result.events);
  };
  apply(play(P1, t.altruism));
  for (let guard = 0; session.state.pendingChoice && !session.state.outcome; guard++) {
    if (guard > 50) throw new Error(`choices did not settle (${session.state.pendingChoice.prompt.kind})`);
    const choice = session.state.pendingChoice;
    const mine = choice.options.find((o) => JSON.stringify(o).includes(RESPONSE));
    if (mine) offered = true;
    apply({
      type: "resolveChoice",
      playerId: choice.playerId,
      choiceId: choice.choiceId,
      selectedOptionIds: [(mine ?? choice.options[0]!).optionId],
    });
  }
  const replayed = replay(session.log, DEPS);
  if (!replayed.ok) throw new Error(replayed.error.message);
  expect(replayed.state).toEqual(session.state);
  return { state: session.state, events, offered };
}
const tucked = (state: GameState, id: InstanceId) => inst(state, id).tucked;
const healed = (events: readonly GameEvent[]) => events.filter((e) => e.type === "damageHealed").length;

describe("§H3.12 `tuckLimit`", () => {
  it("builds the rule on its own card, or on another, with a fixed or a per-player maximum", () => {
    const definition = constant(tuckLimit(3));
    expect(definition.trigger).toEqual({
      kind: "constant",
      rules: [{ kind: "tuckLimit", card: { self: true }, max: { kind: "const", value: 3 } }],
    });
    expect(validateDefinition(definition)).toEqual([]);
    expect(constant(tuckLimit(perHero(1), query("support"))).trigger).toMatchObject({
      rules: [{ kind: "tuckLimit", card: { categories: ["support"] }, max: { kind: "perPlayer" } }],
    });
    for (const id of [CONSTANT, RESPONSE]) expect(validateDefinition(IONIC[id]!), id).toEqual([]);
  });

  it("0 tucked, Wonder Man at full hit points: Active Altruism is tucked from the discard pile and nothing heals", () => {
    const t = table(0, 0);
    expect(tuckRoom(t.state, DEPS, t.physiology)).toBe(3);
    expect(tuckLimitOf(t.state, DEPS, t.physiology)).toBe(3);
    const { state, events, offered } = playAltruism(t);
    expect(offered).toBe(true);
    expect(tucked(state, t.physiology)).toEqual([t.altruism]);
    expect(playerOf(state, P1).discard).not.toContain(t.altruism);
    expect(inst(state, t.hero).damage).toBe(0);
    expect(healed(events)).toBe(0);
    expect(events.filter((e) => e.type === "thenSkipped")).toEqual([]);
  });

  it("2 tucked, 3 damage: the event is the third card and 1 damage heals", () => {
    const t = table(2, 3);
    expect(tuckRoom(t.state, DEPS, t.physiology)).toBe(1);
    const { state, offered } = playAltruism(t);
    expect(offered).toBe(true);
    expect(tucked(state, t.physiology)).toHaveLength(3);
    expect(tucked(state, t.physiology)[2]).toBe(t.altruism);
    expect(inst(state, t.hero).damage).toBe(2);
    expect(tuckRoom(state, DEPS, t.physiology)).toBe(0);
  });

  it("3 tucked: the Response is not offered, the event stays in the discard pile and nothing heals", () => {
    const t = table(3, 3);
    const before = tucked(t.state, t.physiology);
    const { state, events, offered } = playAltruism(t);
    expect(offered).toBe(false);
    expect(tucked(state, t.physiology)).toEqual(before);
    expect(playerOf(state, P1).discard).toContain(t.altruism);
    expect(inst(state, t.hero).damage).toBe(3);
    expect(healed(events)).toBe(0);
    expect(events.some((e) => e.type === "cardNotTucked")).toBe(false);
  });
});
