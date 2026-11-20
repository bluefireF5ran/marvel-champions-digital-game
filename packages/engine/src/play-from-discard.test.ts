/**
 * `EffectSpec playFromHand.from: "discard"` (#890 item 5): "Hero Action: Exhaust Warzone … → play an Attack event from
 * your discard pile, paying its costs" (Warzone, the `punisher-msp` community pack). The card is played from the
 * player's own discard pile and paid for, and it is not counted as played from the hand.
 */
import type { AnyCard, CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityDefinition } from "./abilities.js";
import type { Command } from "./commands.js";
import { replay, startSession } from "./engine.js";
import type { InstanceId } from "./ids.js";
import { locateCard, mustInstance, mustPlayer } from "./query.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubSupport, stubTreachery, stubUpgrade } from "./testing/fixtures.js";
import { defaultPick, giveCard } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, P1, playerCardIntoPlay } from "./testing/wave3.js";

const def = (definition: AbilityDefinition) => definition;
const you = { kind: "controller" } as const;

/** A support whose Action plays an upgrade from your discard pile, paying its cost. */
const WARZONE_ACTION = stubAbility(
  "warzone.action",
  def({
    trigger: { kind: "action" },
    effects: [
      {
        kind: "playFromHand",
        player: you,
        from: "discard",
        costReduction: { kind: "const", value: 0 },
        filter: { categories: ["upgrade"] },
      },
    ],
  }),
);
const WARZONE = stubSupport({ id: "warzone", cost: 0, abilities: [WARZONE_ACTION.ref] });
const GUN = stubUpgrade({ id: "gun", cost: 1 });
const BLANK = stubTreachery({ id: "blank", boostIcons: 0 });

const deps = depsOf(WARZONE_ACTION);
const PLAYER_CARDS = [WARZONE, GUN];
const CARDS: readonly AnyCard[] = [...PLAYER_CARDS, BLANK];
const DECK: readonly CardId[] = PLAYER_CARDS.flatMap((card) => Array.from({ length: 10 }, () => card.id));

/** One player in hero form, the support in play and one Gun in the discard pile. */
function start(): { state: GameState; gun: InstanceId; warzone: InstanceId } {
  const base = gameAtFirstTurn({ cards: CARDS, deps, deck: DECK, encounter: copiesOf(BLANK.id, 20) });
  const hero: GameState = {
    ...base,
    players: base.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" } })),
  };
  const given = giveCard(hero, P1, GUN.id);
  const seat = mustPlayer(given.state, P1);
  const discarded: GameState = {
    ...given.state,
    players: given.state.players.map((p) =>
      p.playerId === P1
        ? { ...p, hand: seat.hand.filter((id) => id !== given.id), discard: [...seat.discard, given.id] }
        : p,
    ),
  };
  const warzone = playerCardIntoPlay(discarded, WARZONE.id);
  return { state: warzone.state, gun: given.id, warzone: warzone.id };
}

function run(state: GameState, commands: readonly Command[], pick = defaultPick) {
  const driven = driveSession(startSession(state), deps, commands, pick);
  return { state: driven.session.state, events: driven.events, session: driven.session };
}

const useWarzone = (warzone: InstanceId): Command => ({
  type: "useAbility",
  playerId: P1,
  cardInstanceId: warzone,
  abilityId: WARZONE_ACTION.ref.id,
  payment: [],
});

describe("playFromHand from the discard pile (#890 item 5)", () => {
  it("plays the card from the discard pile, paid for, and logs it as played from there", () => {
    const { state: base, gun, warzone } = start();
    const handBefore = mustPlayer(base, P1).hand.length;
    const pick = (state: GameState): readonly string[] => {
      const choice = state.pendingChoice;
      if (choice?.prompt.kind === "spendResources") return [choice.options[0]!.optionId];
      return defaultPick(state);
    };
    const { state, events, session } = run(base, [useWarzone(warzone)], pick);
    expect(mustPlayer(state, P1).discard).not.toContain(gun);
    expect(mustInstance(state, gun).controllerId).toBe(P1);
    // A stub upgrade enters play attached to its player's identity.
    expect(locateCard(state, gun)?.kind).toBe("attachment");
    expect(mustPlayer(state, P1).hand.length).toBe(handBefore - 1); // one card spent for its cost of 1
    const played = events.find((event) => event.type === "cardPlayed" && event.instanceId === gun);
    expect(played).toMatchObject({ from: "discard" });
    expect(played).not.toHaveProperty("countsAsFrom");
    const replayed = replay(session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(state);
  });

  it("offers nothing when no matching card is in the discard pile", () => {
    const { state: base, gun, warzone } = start();
    const emptied: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.playerId === P1 ? { ...p, discard: p.discard.filter((id) => id !== gun), deck: [...p.deck, gun] } : p,
      ),
    };
    const { state } = run(emptied, [useWarzone(warzone)]);
    expect(locateCard(state, gun)?.kind).toBe("deck");
  });
});
