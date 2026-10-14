/**
 * A permanent encounter attachment whose host leaves play (docs/phase7-wave10.md §3.19). MC56 p. 20: "Cap's Shield
 * attaches to the Captain America leader. When an attachment with the permanent keyword becomes unattached, resolve
 * its 'attach to' text." MC56 p. 9, "Permanent": it "cannot be defeated, leave play, or have any part of its text box
 * blanked"; RRG 1.8 "Permanent" (p. 32), "Attach To" (p. 8), "Player Elimination" (p. 34).
 *
 * A synthetic attachment shaped like Cap's Shield (`cw` 56143: "Permanent. Attach to Captain America.") and a villain
 * with the leader's "Forced Response: After Cap's Shield is attached to Captain America, give him a tough status
 * card." The attaching is announced (`cardAttached`), so that response answers a rehost.
 */

import { flat, type CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import { replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { activeEncounterDeckId, mustInstance, mustPlayer } from "./query.js";
import { permanentRehostFor } from "./resolve/attach.js";
import { cardsInPlay } from "./select.js";
import type { EffectSpec, TargetRef, ValueSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import {
  stubAttachment,
  stubEvent,
  stubMainScheme,
  stubMinion,
  stubSupport,
  stubUpgrade,
  stubVillain,
} from "./testing/fixtures.js";
import { copiesOf, gameAtFirstTurn, minionEngagedWith, P1, P2, playerCardIntoPlay, playFree } from "./testing/wave3.js";

const n = (value: number): ValueSpec => ({ kind: "const", value });
const self: TargetRef = { kind: "self" };
const named = (name: string): TargetRef => ({ kind: "named", name });

/** "Permanent. Attach to the villain." */
const AEGIS = stubAttachment({ id: "aegis", attachesTo: { kind: "villain" }, keywords: [{ name: "permanent" }] });
/** The same text without the keyword. */
const CHARM = stubAttachment({ id: "charm", attachesTo: { kind: "villain" } });
/** "Permanent. Attach to a minion." */
const LEECH = stubAttachment({ id: "leech", attachesTo: { kind: "minion" }, keywords: [{ name: "permanent" }] });
/** A player's permanent upgrade. */
const HEIRLOOM = stubUpgrade({ id: "heirloom", cost: 0, keywords: [{ name: "permanent" }] });

/** "Forced Response: After Aegis is attached to this villain, give it a tough status card." */
const WARDEN_RESPONSE = stubAbility("warden.response", {
  trigger: {
    kind: "response",
    forced: true,
    on: { on: "cardAttached", sourceIs: { name: AEGIS.name }, selfIs: "target" },
  },
  effects: [{ kind: "giveStatus", target: self, status: "tough" }],
});
const WARDEN = stubVillain({
  id: "warden",
  stages: [
    { hp: flat(4), atk: 0, sch: 0, abilities: [WARDEN_RESPONSE.ref] },
    { hp: flat(30), atk: 0, sch: 0, abilities: [WARDEN_RESPONSE.ref] },
  ],
});
const SCHEME = stubMainScheme({
  id: "long",
  stages: [{ startingThreat: flat(0), targetThreat: flat(99), acceleration: flat(0) }],
});
const THUG = stubMinion({ id: "thug", atk: 0, sch: 0, hp: 3, boostIcons: 0 });
const FILLER = stubMinion({ id: "filler", atk: 0, sch: 0, hp: 9, boostIcons: 0 });

/** "Forced Response: After a card leaves play, place 1 counter here." */
const LEDGER_RESPONSE = stubAbility("ledger.response", {
  trigger: { kind: "response", forced: true, on: { on: "cardLeavesPlay", targetIs: { categories: ["attachment"] } } },
  effects: [{ kind: "addCounters", target: self, counterType: "left", amount: n(1) }],
});
const LEDGER = stubSupport({ id: "ledger", cost: 0, abilities: [LEDGER_RESPONSE.ref] });

const action = (id: string, ...effects: EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
const DEFEAT_THUG = action("defeat-thug", { kind: "defeat", target: named(THUG.name) });
const DOOM = action("doom", {
  kind: "dealDamage",
  target: { kind: "identityOf", player: { kind: "controller" } },
  amount: n(99),
});
const STRIKE = action("strike", { kind: "dealDamage", target: { kind: "villain" }, amount: n(4) });
const EVENTS = [DEFEAT_THUG, DOOM, STRIKE];

const deps: EngineDeps = depsOf(WARDEN_RESPONSE, LEDGER_RESPONSE, ...EVENTS.map((e) => e.ability));

function start(players: 1 | 2 = 1): GameState {
  return gameAtFirstTurn({
    cards: [AEGIS, CHARM, LEECH, HEIRLOOM, LEDGER, THUG, FILLER, ...EVENTS.map((e) => e.card)],
    deps,
    villain: WARDEN,
    mainScheme: SCHEME,
    players,
    encounter: [AEGIS.id, CHARM.id, LEECH.id, THUG.id, ...copiesOf(FILLER.id, 14)],
    deck: [HEIRLOOM.id, LEDGER.id, ...EVENTS.map((e) => e.card.id)],
  });
}
const of = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const villainOf = (state: GameState) => state.villains[0]!.instanceId;
const heroOf = (state: GameState, player = P1) => mustPlayer(state, player).identity.instanceId;
const toughOn = (state: GameState, id: InstanceId) => mustInstance(state, id).statuses.tough;
const discardOf = (state: GameState) => state.encounterDecks[activeEncounterDeckId(state)]!.discard;

/** Attaches an encounter attachment to `to` (surgery: no reveal, nothing announced). */
function attach(state: GameState, card: CardId, to: InstanceId): { state: GameState; id: InstanceId } {
  const id = (Object.keys(state.instances) as InstanceId[]).find(
    (key) => state.instances[key]?.cardId === card && !cardsInPlay(state).includes(key),
  );
  if (!id) throw new Error(`no ${card} out of play`);
  return {
    id,
    state: {
      ...state,
      encounterDecks: Object.fromEntries(
        Object.entries(state.encounterDecks).map(([deckId, piles]) => [
          deckId,
          { ...piles, deck: piles.deck.filter((x) => x !== id) },
        ]),
      ),
      instances: {
        ...state.instances,
        [id]: { ...mustInstance(state, id), faceup: true, attachedTo: to, controllerId: null },
        [to]: { ...mustInstance(state, to), attachments: [...mustInstance(state, to).attachments, id] },
      },
    },
  };
}

describe("docs/phase7-wave10.md §3.19: a permanent encounter attachment resolves its 'attach to' again", () => {
  it("its host minion is defeated: it goes to the villain without leaving play, and the attaching is answered", () => {
    const ledger = playerCardIntoPlay(start(), LEDGER.id);
    const thug = minionEngagedWith(ledger.state, THUG.id);
    const aegis = attach(thug.state, AEGIS.id, thug.id);
    const withCounters: GameState = {
      ...aegis.state,
      instances: {
        ...aegis.state.instances,
        [aegis.id]: { ...mustInstance(aegis.state, aegis.id), counters: { charge: 2 } },
      },
    };
    expect(permanentRehostFor(withCounters, deps, aegis.id, thug.id)).toBe(villainOf(withCounters));
    const run = playFree(withCounters, deps, DEFEAT_THUG.card.id);
    const villain = villainOf(run.state);
    expect(cardsInPlay(run.state)).not.toContain(thug.id);
    expect(mustInstance(run.state, aegis.id).attachedTo).toBe(villain);
    expect(mustInstance(run.state, villain).attachments).toEqual([aegis.id]);
    expect(discardOf(run.state)).not.toContain(aegis.id);
    // It never left play: what was on it is still there, and nothing heard it leave.
    expect(mustInstance(run.state, aegis.id).counters).toEqual({ charge: 2 });
    expect(mustInstance(run.state, ledger.id).counters.left ?? 0).toBe(0);
    expect(of(run.events, "permanentAttachmentRehosted")).toEqual([
      { type: "permanentAttachmentRehosted", instanceId: aegis.id, fromInstanceId: thug.id, hostInstanceId: villain },
    ]);
    expect(toughOn(run.state, villain)).toBe(1);
    const replayed = replay(run.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(run.state);
  });

  it("the same card without the keyword is discarded with its host, and that is a card leaving play", () => {
    const ledger = playerCardIntoPlay(start(), LEDGER.id);
    const thug = minionEngagedWith(ledger.state, THUG.id);
    const charm = attach(thug.state, CHARM.id, thug.id);
    const run = playFree(charm.state, deps, DEFEAT_THUG.card.id);
    expect(discardOf(run.state)).toContain(charm.id);
    expect(mustInstance(run.state, charm.id).attachedTo).toBeNull();
    expect(mustInstance(run.state, ledger.id).counters.left).toBe(1);
    expect(of(run.events, "permanentAttachmentRehosted")).toEqual([]);
    expect(toughOn(run.state, villainOf(run.state))).toBe(0);
  });

  it("'attach to a minion' with no other minion in play names no host: discarded (wave 5 §4.2 Q26), never back onto the leaving host", () => {
    const thug = minionEngagedWith(start(), THUG.id);
    const leech = attach(thug.state, LEECH.id, thug.id);
    expect(permanentRehostFor(leech.state, deps, leech.id, thug.id)).toBeNull();
    const run = playFree(leech.state, deps, DEFEAT_THUG.card.id);
    expect(discardOf(run.state)).toContain(leech.id);
    expect(of(run.events, "permanentAttachmentRehosted")).toEqual([]);
  });

  it("with another minion in play it goes to that minion", () => {
    const thug = minionEngagedWith(start(), THUG.id);
    const other = minionEngagedWith(thug.state, FILLER.id);
    const leech = attach(other.state, LEECH.id, thug.id);
    const run = playFree(leech.state, deps, DEFEAT_THUG.card.id);
    expect(mustInstance(run.state, leech.id).attachedTo).toBe(other.id);
    expect(mustInstance(run.state, other.id).attachments).toEqual([leech.id]);
  });

  it("a player's permanent card is not an encounter attachment: it has no 'attach to' to resolve", () => {
    const thug = minionEngagedWith(start(), THUG.id);
    const heirloom = playerCardIntoPlay(thug.state, HEIRLOOM.id);
    expect(permanentRehostFor(heirloom.state, deps, heirloom.id, thug.id)).toBeNull();
    expect(permanentRehostFor(heirloom.state, deps, thug.id, null)).toBeNull();
  });
});

describe("player elimination (RRG 1.8 p. 34): the eliminated player's hero held the attachment", () => {
  it("two players, player 1 is defeated: it attaches to the villain, which gains a tough status card", () => {
    const base = start(2);
    const aegis = attach(base, AEGIS.id, heroOf(base));
    const run = playFree(aegis.state, deps, DOOM.card.id);
    const villain = villainOf(run.state);
    expect(of(run.events, "playerEliminated").map((e) => e.playerId)).toEqual([P1]);
    expect(run.state.outcome).toBeNull();
    expect(mustInstance(run.state, aegis.id).attachedTo).toBe(villain);
    expect(mustInstance(run.state, villain).attachments).toEqual([aegis.id]);
    expect(of(run.events, "permanentAttachmentRehosted")).toEqual([
      {
        type: "permanentAttachmentRehosted",
        instanceId: aegis.id,
        fromInstanceId: heroOf(base),
        hostInstanceId: villain,
      },
    ]);
    expect(toughOn(run.state, villain)).toBe(1);
    expect(mustPlayer(run.state, P2).eliminated).toBe(false);
    const replayed = replay(run.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(run.state);
  });

  it("the only player is defeated: the game is lost, and the attachment is still moved to the villain", () => {
    const base = start(1);
    const aegis = attach(base, AEGIS.id, heroOf(base));
    const run = playFree(aegis.state, deps, DOOM.card.id);
    expect(run.state.outcome).toMatchObject({ result: "loss" });
    expect(mustInstance(run.state, aegis.id).attachedTo).toBe(villainOf(run.state));
  });
});

describe("a villain stage is defeated: the villain does not leave play", () => {
  it("the attachment stays on the villain through the stage change, and no tough status card is given", () => {
    const base = start();
    const aegis = attach(base, AEGIS.id, villainOf(base));
    const run = playFree(aegis.state, deps, STRIKE.card.id);
    const villain = villainOf(run.state);
    expect(run.state.villains[0]!.stageIndex).toBe(1);
    expect(run.state.outcome).toBeNull();
    expect(mustInstance(run.state, aegis.id).attachedTo).toBe(villain);
    expect(mustInstance(run.state, villain).attachments).toEqual([aegis.id]);
    expect(of(run.events, "permanentAttachmentRehosted")).toEqual([]);
    expect(toughOn(run.state, villain)).toBe(0);
  });
});
