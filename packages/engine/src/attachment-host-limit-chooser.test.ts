/**
 * docs/phase7-wave10.md §3.5: an encounter attachment's data host at the reveal, with a printed per-host limit and a
 * host the card's text leaves to the enemy team. Proven with synthetic cards.
 *
 * - "(Limit 1 per character.)" is `AttachmentCard.playRestrictions.maxPerHost`. RRG 1.8 "Max, Maximum" (p. 28): "'Max 1
 *   per [game element]' restricts the number of copies of that card that can be attached to each indicated game
 *   element"; "Attach To" (p. 8): the attach text "is checked for legality when the card would be attached", and a card
 *   that cannot attach is discarded. So a host already at the limit is no legal host.
 * - "Of the enemy team's choice" is `AttachmentCard.hostChosenBy`. MC56 p. 6: cooperatively "any rule or ability that
 *   refers to 'the enemy team' refers to the players"; the owner's decision (2026-10-11, question 6, answer A) is the
 *   first player, in a prompt marked as the enemy team's, as a scripted enemy-team choice is asked.
 */

import { flat, type AttachmentHost, type CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { applyCommand } from "./engine.js";
import type { GameEvent } from "./events.js";
import { playerId, type InstanceId, type PlayerId } from "./ids.js";
import { activeEncounterDeck, mustInstance } from "./query.js";
import { attachmentHostCandidates } from "./resolve/index.js";
import { createGame } from "./setup.js";
import type { GameState } from "./state.js";
import { SINGLE_TEAM } from "./team.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommands } from "./testing/drive.js";
import { stubAttachment, stubMainScheme, stubMinion, stubTreachery, stubVillain } from "./testing/fixtures.js";
import {
  DEFAULT_CARDS,
  DEFAULT_DECK,
  HERO,
  seatIdentities,
  settleUntil,
  withEncounterPiles,
} from "./testing/scenario.js";

const P1 = playerId("p1");
const P2 = playerId("p2");
const copies = (id: CardId, n: number): readonly CardId[] => Array.from({ length: n }, () => id);

const BLANK = stubTreachery({ id: "blank", boostIcons: 0 });
const QUIET_VILLAIN = stubVillain({ id: "quiet", stages: [{ hp: flat(50), atk: 0, sch: 0 }] });
const LONG_SCHEME = stubMainScheme({
  id: "long",
  stages: [{ startingThreat: flat(0), targetThreat: flat(99), acceleration: flat(0) }],
});
const GRUNT = stubMinion({ id: "grunt", atk: 0, sch: 0, hp: 4, boostIcons: 0 });
const BRUTE = stubMinion({ id: "brute", atk: 0, sch: 0, hp: 4, boostIcons: 0 });

const A_MINION: AttachmentHost = { kind: "minion" };
const A_MINION_OR_THE_LEADER: AttachmentHost = { kind: "anyOf", hosts: [A_MINION, { kind: "leader", of: "enemy" }] };

/** "The enemy team attaches this card to a minion or their leader. (Limit 1 per character.)" */
const DECOY = stubAttachment({
  id: "decoy",
  attachesTo: A_MINION_OR_THE_LEADER,
  hostChosenBy: "enemyTeam",
  maxPerHost: 1,
});
/** "Attach to a minion. (Limit 1 per character.)": no chooser, no fallback. */
const TAG = stubAttachment({ id: "tag", attachesTo: A_MINION, maxPerHost: 1 });
/** "Attach to a minion. (Limit 2 per character.)" */
const PAIR = stubAttachment({ id: "pair", attachesTo: A_MINION, maxPerHost: 2 });
/** "Attach to a minion." with no limit: a second copy goes on the same minion. */
const PATCH = stubAttachment({ id: "patch", attachesTo: A_MINION });
const SURGES = stubAbility("badge.cannot-attach", {
  trigger: { kind: "cannotAttach" },
  effects: [{ kind: "gainSurge" }],
});
/** "Attach to a minion of the enemy team's choice. (Limit 1 per character.) Otherwise, this card gains surge." */
const BADGE = stubAttachment({
  id: "badge",
  attachesTo: A_MINION,
  hostChosenBy: "enemyTeam",
  maxPerHost: 1,
  abilities: [SURGES.ref],
});

const deps: EngineDeps = depsOf(SURGES);
const CARDS = [...DEFAULT_CARDS, QUIET_VILLAIN, LONG_SCHEME, BLANK, GRUNT, BRUTE, DECOY, TAG, PAIR, PATCH, BADGE];

function game(encounter: readonly CardId[], players = 1): GameState {
  const identities = seatIdentities(HERO, players);
  const result = createGame(
    {
      seed: 6,
      cards: [...CARDS, ...identities],
      villainCardId: QUIET_VILLAIN.id,
      mainSchemeCardId: LONG_SCHEME.id,
      encounterDeck: [...encounter, ...copies(BLANK.id, 16 - encounter.length)],
      includeIdentitySets: false,
      players: identities.map((identity) => ({ identityCardId: identity.id, deck: DEFAULT_DECK })),
    },
    deps,
  );
  if (!result.ok) throw new Error(result.error.message);
  return runCommands(result.state, deps).state;
}

const inDeck = (state: GameState, cardId: CardId): readonly InstanceId[] =>
  activeEncounterDeck(state).deck.filter((id) => mustInstance(state, id).cardId === cardId);
const villainOf = (state: GameState): InstanceId => state.villains[0]!.instanceId;

/** Test surgery: the first copy of the minion in the encounter deck is in play, engaged with `player`. */
function engaged(state: GameState, cardId: CardId, player: PlayerId = P1): { state: GameState; id: InstanceId } {
  const id = inDeck(state, cardId)[0]!;
  const deck = activeEncounterDeck(state).deck.filter((x) => x !== id);
  return {
    id,
    state: {
      ...withEncounterPiles(state, { deck }),
      players: state.players.map((p) => (p.playerId === player ? { ...p, playArea: [...p.playArea, id] } : p)),
      instances: { ...state.instances, [id]: { ...mustInstance(state, id), faceup: true, engagedWith: player } },
    },
  };
}

/** Test surgery: the first copy of the attachment in the encounter deck is attached to `host`, with no reveal. */
function attached(state: GameState, cardId: CardId, host: InstanceId): { state: GameState; id: InstanceId } {
  const id = inDeck(state, cardId)[0]!;
  const deck = activeEncounterDeck(state).deck.filter((x) => x !== id);
  return {
    id,
    state: {
      ...withEncounterPiles(state, { deck }),
      instances: {
        ...state.instances,
        [id]: { ...mustInstance(state, id), faceup: true, attachedTo: host },
        [host]: { ...mustInstance(state, host), attachments: [...mustInstance(state, host).attachments, id] },
      },
    },
  };
}

/** Stacks the deck: one boost card per player, then one dealt card each, `id` being the last player's. */
function dealtToLast(state: GameState, id: InstanceId): GameState {
  const players = state.players.length;
  const rest = activeEncounterDeck(state).deck.filter((candidate) => candidate !== id);
  const before = rest.slice(0, players * 2 - 1);
  return withEncounterPiles(state, { deck: [...before, id, ...rest.slice(players * 2 - 1)] });
}

const endTurns = (state: GameState): readonly Command[] =>
  state.players.map((p) => ({ type: "endTurn", playerId: p.playerId }));
/** Every player ends the turn; the villain phase runs to its end, or to a pending choice of host. */
function reveal(state: GameState, id: InstanceId): GameState {
  let current = dealtToLast(state, id);
  for (const command of endTurns(current)) {
    const result = applyCommand(current, command, deps);
    if (!result.ok) throw new Error(result.error.message);
    current = result.state;
  }
  return settleUntil(current, "chooseAttachmentTarget", deps);
}
const revealEvents = (state: GameState, id: InstanceId) =>
  runCommands(dealtToLast(state, id), deps, ...endTurns(state));
const ofType = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const hostsOf = (state: GameState, id: InstanceId, player: PlayerId = P1): readonly InstanceId[] =>
  attachmentHostCandidates(state, (state.cardPool[mustInstance(state, id).cardId] as typeof TAG).attachesTo!, {
    selfInstanceId: id,
    controllerId: player,
    event: null,
    bindings: {},
    deps,
  });

describe("an encounter attachment's 'Limit N per character' at the reveal", () => {
  it("a character already holding a copy is not a legal host: the second copy goes on the other minion, unasked", () => {
    const grunt = engaged(game([GRUNT.id, BRUTE.id, TAG.id, TAG.id]), GRUNT.id);
    const brute = engaged(grunt.state, BRUTE.id);
    const first = attached(brute.state, TAG.id, grunt.id);
    const [second] = inDeck(first.state, TAG.id) as [InstanceId];
    expect(hostsOf(first.state, second)).toEqual([brute.id]);

    const after = reveal(first.state, second);
    expect(after.pendingChoice).toBeNull();
    expect(mustInstance(after, second).attachedTo).toBe(brute.id);
    expect(mustInstance(after, brute.id).attachments).toEqual([second]);
    expect(mustInstance(after, grunt.id).attachments).toEqual([first.id]);
  });

  it("with every candidate holding one it has no host: discarded, nothing revealed in its place, no surge", () => {
    const grunt = engaged(game([GRUNT.id, TAG.id, TAG.id]), GRUNT.id);
    const first = attached(grunt.state, TAG.id, grunt.id);
    const [second] = inDeck(first.state, TAG.id) as [InstanceId];
    expect(hostsOf(first.state, second)).toEqual([]);

    const { state, events } = revealEvents(first.state, second);
    expect(mustInstance(state, second).attachedTo).toBeNull();
    expect(activeEncounterDeck(state).discard).toContain(second);
    expect(mustInstance(state, grunt.id).attachments).toEqual([first.id]);
    expect(ofType(events, "surgeTriggered")).toEqual([]);
    expect(ofType(events, "encounterCardRevealed").map((e) => e.instanceId)).toEqual([second]);
  });

  it("with every candidate holding one, a card that prints 'Otherwise, this card gains surge' surges once", () => {
    const grunt = engaged(game([GRUNT.id, BADGE.id, BADGE.id]), GRUNT.id);
    const first = attached(grunt.state, BADGE.id, grunt.id);
    const [second] = inDeck(first.state, BADGE.id) as [InstanceId];

    const { state, events } = revealEvents(first.state, second);
    expect(mustInstance(state, second).attachedTo).toBeNull();
    expect(activeEncounterDeck(state).discard).toContain(second);
    expect(ofType(events, "surgeTriggered").map((e) => e.instanceId)).toEqual([second]);
    expect(ofType(events, "choiceRequested").filter((e) => e.choice.prompt.kind === "chooseAttachmentTarget")).toEqual(
      [],
    );
  });

  it("the limit is the printed number: a host with one copy takes a second at 'Limit 2', and no third", () => {
    const grunt = engaged(game([GRUNT.id, PAIR.id, PAIR.id, PAIR.id]), GRUNT.id);
    const first = attached(grunt.state, PAIR.id, grunt.id);
    const [second, third] = inDeck(first.state, PAIR.id) as [InstanceId, InstanceId];
    expect(hostsOf(first.state, second)).toEqual([grunt.id]);

    const after = reveal(first.state, second);
    expect(mustInstance(after, grunt.id).attachments).toEqual([first.id, second]);
    expect(hostsOf(after, third)).toEqual([]);
  });

  it("copies are counted by title: another attachment on the host does not use the limit up", () => {
    const grunt = engaged(game([GRUNT.id, TAG.id, PATCH.id]), GRUNT.id);
    const other = attached(grunt.state, PATCH.id, grunt.id);
    const [tag] = inDeck(other.state, TAG.id) as [InstanceId];
    expect(hostsOf(other.state, tag)).toEqual([grunt.id]);
    const after = reveal(other.state, tag);
    expect(mustInstance(after, grunt.id).attachments).toEqual([other.id, tag]);
  });

  it("control: a card with no limit goes on a host that already holds a copy", () => {
    const grunt = engaged(game([GRUNT.id, PATCH.id, PATCH.id]), GRUNT.id);
    const first = attached(grunt.state, PATCH.id, grunt.id);
    const [second] = inDeck(first.state, PATCH.id) as [InstanceId];
    const after = reveal(first.state, second);
    expect(mustInstance(after, grunt.id).attachments).toEqual([first.id, second]);
  });

  it("'a minion or their leader': with the minion at the limit only the leader is left, and with both, no host", () => {
    const grunt = engaged(game([GRUNT.id, DECOY.id, DECOY.id, DECOY.id]), GRUNT.id);
    const onMinion = attached(grunt.state, DECOY.id, grunt.id);
    const [second, third] = inDeck(onMinion.state, DECOY.id) as [InstanceId, InstanceId];
    const villain = villainOf(onMinion.state);
    expect(hostsOf(onMinion.state, second)).toEqual([villain]);

    const after = reveal(onMinion.state, second);
    expect(after.pendingChoice).toBeNull();
    expect(mustInstance(after, villain).attachments).toEqual([second]);
    expect(hostsOf(after, third)).toEqual([]);
  });
});

describe("a data host the card gives to the enemy team", () => {
  /** Two players; a grunt and a brute engaged with p2, who reveals the card. */
  function twoHosts(cardId: CardId) {
    const grunt = engaged(game([GRUNT.id, BRUTE.id, cardId], 2), GRUNT.id, P2);
    const brute = engaged(grunt.state, BRUTE.id, P2);
    const [card] = inDeck(brute.state, cardId) as [InstanceId];
    return { state: brute.state, grunt: grunt.id, brute: brute.id, card };
  }

  it("p2 reveals it: the first player is asked, marked as the enemy team's, over every legal host", () => {
    const { state, grunt, brute, card } = twoHosts(BADGE.id);
    const asked = reveal(state, card);
    const choice = asked.pendingChoice!;
    expect(asked.firstPlayerId).toBe(P1);
    expect(choice.playerId).toBe(P1);
    expect(choice.authority).toBe("enemyTeam");
    expect(choice.onBehalfOf).toEqual({ kind: "enemyTeam", teamId: SINGLE_TEAM, facingPlayerId: P2 });
    expect(choice.prompt).toEqual({ kind: "chooseAttachmentTarget", instanceId: card });
    expect([choice.minSelections, choice.maxSelections]).toEqual([1, 1]);
    expect(choice.options.map((option) => option.optionId)).toEqual([grunt, brute]);
  });

  it("the revealing player's answer is refused; the first player's attaches it, and the log says for whom", () => {
    const { state, brute, grunt, card } = twoHosts(BADGE.id);
    const asked = reveal(state, card);
    const choice = asked.pendingChoice!;
    const answer = (player: PlayerId): Command => ({
      type: "resolveChoice",
      playerId: player,
      choiceId: choice.choiceId,
      selectedOptionIds: [brute],
    });
    const refused = applyCommand(asked, answer(P2), deps);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe("invalid_choice");
    expect(refused.error.message).toBe("p1 must make this choice");

    const answered = applyCommand(asked, answer(P1), deps);
    if (!answered.ok) throw new Error(answered.error.message);
    expect(mustInstance(answered.state, card).attachedTo).toBe(brute);
    expect(mustInstance(answered.state, brute).attachments).toEqual([card]);
    expect(mustInstance(answered.state, grunt).attachments).toEqual([]);
    expect(ofType(answered.events, "choiceResolved")[0]).toEqual({
      type: "choiceResolved",
      choiceId: choice.choiceId,
      playerId: P1,
      selectedOptionIds: [brute],
      onBehalfOf: { kind: "enemyTeam", teamId: SINGLE_TEAM, facingPlayerId: P2 },
    });
  });

  it("the choice follows the first player token: with it at p2, p1 is dealt last and reveals, and p2 is asked", () => {
    const { state, card } = twoHosts(BADGE.id);
    const asked = reveal({ ...state, firstPlayerId: P2 }, card);
    expect(asked.pendingChoice!.playerId).toBe(P2);
    expect(asked.pendingChoice!.authority).toBe("enemyTeam");
    expect(asked.pendingChoice!.onBehalfOf).toEqual({ kind: "enemyTeam", teamId: SINGLE_TEAM, facingPlayerId: P1 });
  });

  it("one legal host is no choice: nobody is asked", () => {
    const grunt = engaged(game([GRUNT.id, BADGE.id], 2), GRUNT.id, P2);
    const [card] = inDeck(grunt.state, BADGE.id) as [InstanceId];
    const { state, events } = revealEvents(grunt.state, card);
    expect(mustInstance(state, card).attachedTo).toBe(grunt.id);
    expect(ofType(events, "choiceRequested").filter((e) => e.choice.prompt.kind === "chooseAttachmentTarget")).toEqual(
      [],
    );
  });

  it("the limit narrows what the enemy team is offered: a minion holding a copy is not an option", () => {
    const grunt = engaged(game([GRUNT.id, BRUTE.id, DECOY.id, DECOY.id], 2), GRUNT.id, P2);
    const brute = engaged(grunt.state, BRUTE.id, P2);
    const held = attached(brute.state, DECOY.id, grunt.id);
    const [card] = inDeck(held.state, DECOY.id) as [InstanceId];
    const asked = reveal(held.state, card);
    expect(asked.pendingChoice!.authority).toBe("enemyTeam");
    expect(asked.pendingChoice!.options.map((option) => option.optionId)).toEqual([brute.id, villainOf(asked)]);
  });

  it("control: the same host without the words is an unmarked first-player choice over the same options", () => {
    const marked = twoHosts(BADGE.id);
    const plain = twoHosts(TAG.id);
    const own = reveal(plain.state, plain.card).pendingChoice!;
    expect(own.playerId).toBe(P1);
    expect(own.authority).toBe("firstPlayerTargets");
    expect("onBehalfOf" in own).toBe(false);
    expect(own.options.map((option) => option.optionId)).toEqual([plain.grunt, plain.brute]);
    expect(reveal(marked.state, marked.card).pendingChoice!.options.map((option) => option.optionId)).toEqual([
      marked.grunt,
      marked.brute,
    ]);
  });
});
