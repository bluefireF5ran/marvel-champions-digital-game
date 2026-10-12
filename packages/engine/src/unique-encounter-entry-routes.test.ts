/**
 * docs/phase7-wave10.md §3.8: the unique rule on an encounter card entering play, for a revealed attachment and for
 * every route an encounter card takes into play. Captain Marvel's Helmet (`cw` 56099, a unique attachment, "Attach to
 * Captain Marvel. … [star] Boost: Reveal this card.") matches the Core upgrade Captain Marvel's Helmet 01016.
 *
 * RRG 1.8 "Unique Icon" (pp. 45-46): "A non-villain card in an out-of-play state that matches a card in play cannot
 * enter play. If the out-of-play card is … a non-villain encounter card, it is discarded and any effects of it entering
 * play are ignored. If it was being revealed, any effects of it being revealed are ignored and the player revealing it
 * is dealt a facedown encounter card." The dealt card waits facedown (docs/phase7-wave9.md §4.1 Q38).
 *
 * A revealed attachment is checked before it attaches, whichever way it would have attached: a printed host, a host
 * the player picks, its attach instruction, or its own When Revealed. Synthetic cards; every card has 0 boost icons.
 */

import { flat, trait, type AttachmentCard, type CardId, type MinionCard, type UpgradeCard } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import { applyCommand, replay, type GameSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { activeEncounterDeck, mustInstance, mustPlayer } from "./query.js";
import type { EffectSpec, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommands } from "./testing/drive.js";
import { stubAttachment, stubEvent, stubMinion, stubTreachery, stubUpgrade, stubVillain } from "./testing/fixtures.js";
import { giveCard } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, minionEngagedWith, P1, playerCardIntoPlay, playFree } from "./testing/wave3.js";
import { uniqueBlockedMessage } from "./unique.js";

const you = { kind: "controller" } as const;
const n = (value: number) => ({ kind: "const", value }) as const;
const self: TargetRef = { kind: "self" };
const villain: TargetRef = { kind: "villain" };
const HELM = "Helm";

/** "When Revealed: place 1 seen counter on the main scheme." It must not resolve for a card turned away. */
const seen: EffectSpec = { kind: "addCounters", target: { kind: "mainScheme" }, counterType: "seen", amount: n(1) };
const SEEN = stubAbility("helm.when-revealed", { trigger: { kind: "whenRevealed" }, effects: [seen] });

/** The player's unique upgrade. */
const UPGRADE: UpgradeCard = { ...stubUpgrade({ id: "helm-upgrade", cost: 0 }), name: HELM, unique: true };
const unique = (card: AttachmentCard): AttachmentCard => ({ ...card, unique: true });
/** "Attach to the villain." The villain gets +1 ATK. */
const HELM_VILLAIN = unique(
  stubAttachment({
    id: "helm-villain",
    name: HELM,
    attachesTo: { kind: "villain" },
    statModifiers: { atk: 1 },
    abilities: [SEEN.ref],
  }),
);
/** "Attach to a minion." */
const HELM_MINION = unique(
  stubAttachment({ id: "helm-minion", name: HELM, attachesTo: { kind: "minion" }, abilities: [SEEN.ref] }),
);
/** An attach instruction: "Attach to the villain." */
const INSTRUCTION = stubAbility("helm-instructed.attach", {
  trigger: { kind: "whenRevealed" },
  attachInstruction: true,
  effects: [{ kind: "attach", card: self, to: villain }, seen],
});
const HELM_INSTRUCTED = unique(stubAttachment({ id: "helm-instructed", name: HELM, abilities: [INSTRUCTION.ref] }));
/** No "attach to" text: "When Revealed: Attach this card to the villain." */
const SELF_ATTACH = stubAbility("helm-self.when-revealed", {
  trigger: { kind: "whenRevealed" },
  effects: [{ kind: "attach", card: self, to: villain }, seen],
});
const HELM_SELF = unique(stubAttachment({ id: "helm-self", name: HELM, abilities: [SELF_ATTACH.ref] }));
/** "Attach to the villain. [star] Boost: Reveal this card." */
const BOOST_REVEAL = stubAbility("helm-boost.boost", {
  trigger: { kind: "boost" },
  effects: [{ kind: "revealCard", cards: self, player: you }],
});
const HELM_BOOST = unique(
  stubAttachment({
    id: "helm-boost",
    name: HELM,
    attachesTo: { kind: "villain" },
    abilities: [SEEN.ref, BOOST_REVEAL.ref],
  }),
);

const AVENGER = trait("AVENGER");
/** A unique minion with teamwork; two copies are in the encounter deck. */
const TWIN: MinionCard = {
  ...stubMinion({
    id: "twin",
    traits: [AVENGER],
    atk: 1,
    sch: 1,
    hp: 9,
    boostIcons: 0,
    keywords: [{ name: "teamwork", sharedTrait: AVENGER }],
  }),
  unique: true,
};
const GRUNT = stubMinion({ id: "grunt", traits: [AVENGER], atk: 0, sch: 0, hp: 9, boostIcons: 0 });
const A = stubTreachery({ id: "a", boostIcons: 0 });
const B = stubTreachery({ id: "b", boostIcons: 0 });
const FILLER = stubTreachery({ id: "filler", boostIcons: 0 });
const BOSS = stubVillain({ id: "boss", stages: [{ hp: flat(30), atk: 1, sch: 1 }] });

const event = (id: string, effects: readonly EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
const topOfDeck = { kind: "encounter", zones: ["deck"], top: n(1) } as const;
const found: TargetRef = { kind: "slot", slot: "found" };
// "Reveal the top card of the encounter deck."
const REVEAL_TOP = event("reveal-top", [{ kind: "revealEncounterCard", player: you }]);
// "Search the encounter deck for [the card] and reveal it." (the card is stacked on top)
const SEARCH_AND_REVEAL = event("search-and-reveal", [
  { kind: "selectCards", slot: "found", cards: topOfDeck },
  { kind: "revealCard", cards: found, player: you },
  { kind: "shuffleEncounterDeck" },
]);
// "Deal [the card] to yourself as a facedown encounter card."
const DEAL_AS_ENCOUNTER = event("deal-as-encounter", [
  { kind: "selectCards", slot: "found", cards: topOfDeck },
  { kind: "dealAsEncounterCard", cards: found, player: you },
]);
// "Put [the card] into play."
const PUT_INTO_PLAY = event("put-into-play", [
  { kind: "selectCards", slot: "found", cards: topOfDeck },
  { kind: "putIntoPlay", card: found, controller: you },
]);
const EVENTS = [REVEAL_TOP, SEARCH_AND_REVEAL, DEAL_AS_ENCOUNTER, PUT_INTO_PLAY];
const HELMS = [HELM_VILLAIN, HELM_MINION, HELM_INSTRUCTED, HELM_SELF, HELM_BOOST];
const deps: EngineDeps = depsOf(SEEN, INSTRUCTION, SELF_ATTACH, BOOST_REVEAL, ...EVENTS.map((e) => e.ability));

/** P1's turn, a minion engaged with them; with `upgrade`, their unique Helm upgrade in play. */
function start(upgrade = true): { readonly state: GameState; readonly inPlay: InstanceId | null } {
  const base = gameAtFirstTurn({
    cards: [UPGRADE, ...HELMS, TWIN, GRUNT, A, B, FILLER, BOSS, ...EVENTS.map((e) => e.card)],
    deps,
    villain: BOSS,
    deck: [UPGRADE.id, ...EVENTS.map((e) => e.card.id)],
    encounter: [...copiesOf(FILLER.id, 20), ...HELMS.map((h) => h.id), TWIN.id, TWIN.id, GRUNT.id, A.id, B.id],
  });
  const state = minionEngagedWith(base, GRUNT.id).state;
  if (!upgrade) return { state, inPlay: null };
  const placed = playerCardIntoPlay(state, UPGRADE.id);
  return { state: placed.state, inPlay: placed.id };
}

/** The encounter deck with a card of each of `codes` on top, the first of them topmost (test surgery). */
const stacked = (state: GameState, ...codes: readonly CardId[]): GameState => {
  const [deckId, piles] = Object.entries(state.encounterDecks)[0]!;
  const rest = [...piles.deck];
  const top = codes.map((code) => {
    const at = rest.findIndex((id) => mustInstance(state, id).cardId === code);
    if (at < 0) throw new Error(`no ${code} left in the encounter deck`);
    return rest.splice(at, 1)[0]!;
  });
  return { ...state, encounterDecks: { ...state.encounterDecks, [deckId]: { ...piles, deck: [...top, ...rest] } } };
};
const playRound = (state: GameState) => runCommands(state, deps, { type: "endTurn", playerId: P1 });
const of = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const reveals = (events: readonly GameEvent[]) => of(events, "encounterCardRevealed").map((e) => e.cardId as string);
const dealtTo = (state: GameState) =>
  mustPlayer(state, P1).dealtEncounter.map((id) => [
    mustInstance(state, id).cardId as string,
    mustInstance(state, id).faceup,
  ]);
const discardPile = (state: GameState) =>
  activeEncounterDeck(state).discard.map((id) => mustInstance(state, id).cardId as string);
const attachedCards = (state: GameState) =>
  Object.values(state.instances)
    .filter((i) => i.attachedTo !== null)
    .map((i) => i.cardId as string);
const seenCount = (state: GameState) => mustInstance(state, state.mainScheme.instanceId).counters.seen ?? 0;
const instanceOf = (state: GameState, card: CardId) => Object.values(state.instances).find((i) => i.cardId === card)!;
function expectReplays(session: GameSession) {
  const replayed = replay(session.log, deps);
  if (!replayed.ok) throw new Error(replayed.error.message);
  expect(replayed.state).toEqual(session.state);
}

/** What the rule leaves of a card it turned away while it was being revealed, with the next card (A) dealt facedown. */
function expectTurnedAway(
  out: { readonly state: GameState; readonly events: readonly GameEvent[]; readonly session: GameSession },
  card: AttachmentCard,
  inPlay: InstanceId,
) {
  expect(reveals(out.events)).toEqual([card.id]);
  expect(of(out.events, "uniqueEntryBlocked")).toEqual([
    {
      type: "uniqueEntryBlocked",
      instanceId: instanceOf(out.state, card.id).instanceId,
      cardId: card.id,
      matchedInstanceId: inPlay,
      disposition: "discarded",
    },
  ]);
  // Never attached and not in play: in the encounter discard pile, with nothing on any host.
  expect(discardPile(out.state)).toEqual([card.id]);
  expect(instanceOf(out.state, card.id).attachedTo).toBeNull();
  expect(attachedCards(out.state)).toEqual([]);
  expect(out.events.filter((e) => e.type === "cardMoved" && e.to.kind === "attachment")).toEqual([]);
  // None of its abilities resolved: no attach instruction, no When Revealed.
  expect(seenCount(out.state)).toBe(0);
  expect(
    of(out.events, "abilityResolved").filter(
      (e) => e.instanceId !== undefined && e.abilityId !== REVEAL_TOP.ability.ref.id,
    ),
  ).toEqual([]);
  // The player revealing it is dealt one facedown encounter card, which is not revealed now.
  expect(dealtTo(out.state)).toEqual([[A.id, false]]);
  expectReplays(out.session);
}

describe("§3.8 a unique attachment being revealed while a matching card is in play", () => {
  it.each([
    ["a printed host (Attach to the villain)", HELM_VILLAIN],
    ["a host among the minions in play", HELM_MINION],
    ["an attach instruction", HELM_INSTRUCTED],
    ["its own When Revealed (no 'attach to' text)", HELM_SELF],
  ] as const)("attaching by %s: discarded before it attaches, and one facedown card is dealt", (_how, card) => {
    const { state, inPlay } = start();
    const out = playFree(stacked(state, card.id, A.id), deps, REVEAL_TOP.card.id);
    expectTurnedAway(out, card, inPlay!);
    // The upgrade is untouched.
    expect(mustPlayer(out.state, P1).playArea).toContain(inPlay);
  });

  it("the villain does not get the attachment's +1 ATK: it attacks for its printed 1", () => {
    const { state } = start();
    const out = playFree(stacked(state, HELM_VILLAIN.id, A.id), deps, REVEAL_TOP.card.id);
    const hero = {
      ...out.state,
      players: out.state.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" as const } })),
    };
    const round = playRound(stacked(hero, FILLER.id, B.id));
    expect(
      of(round.events, "attackResolved")
        .filter((e) => e.enemyInstanceId === round.state.activeVillainId)
        .map((e) => e.baseAtk),
    ).toEqual([1]);
  });

  it.each([
    ["a printed host", HELM_VILLAIN],
    ["a host among the minions in play", HELM_MINION],
    ["an attach instruction", HELM_INSTRUCTED],
    ["its own When Revealed", HELM_SELF],
  ] as const)("with no matching card in play, attaching by %s: it attaches and its abilities resolve", (_how, card) => {
    const { state } = start(false);
    const out = playFree(stacked(state, card.id, A.id), deps, REVEAL_TOP.card.id);
    expect(of(out.events, "uniqueEntryBlocked")).toEqual([]);
    expect(attachedCards(out.state)).toEqual([card.id]);
    expect(seenCount(out.state)).toBe(1);
    expect(dealtTo(out.state)).toEqual([]);
    expect(discardPile(out.state)).toEqual([]);
  });

  it("the reverse: with the attachment in play, playing the matching upgrade is refused with the unique message", () => {
    const { state } = start(false);
    const attached = playFree(stacked(state, HELM_VILLAIN.id, A.id), deps, REVEAL_TOP.card.id).state;
    const given = giveCard(attached, P1, UPGRADE.id);
    const result = applyCommand(
      given.state,
      { type: "playCard", playerId: P1, cardInstanceId: given.id, payment: [], attachToInstanceId: null },
      deps,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain(uniqueBlockedMessage(UPGRADE, HELM_VILLAIN));
  });
});

describe("§3.8 audit: every route an encounter card takes into play, with a matching card in play", () => {
  it("revealed off the encounter deck by an effect", () => {
    const { state, inPlay } = start();
    expectTurnedAway(playFree(stacked(state, HELM_VILLAIN.id, A.id), deps, REVEAL_TOP.card.id), HELM_VILLAIN, inPlay!);
  });

  it("found by a search and revealed", () => {
    const { state, inPlay } = start();
    const out = playFree(stacked(state, HELM_VILLAIN.id, A.id), deps, SEARCH_AND_REVEAL.card.id);
    expect(reveals(out.events)).toEqual([HELM_VILLAIN.id]);
    expect(of(out.events, "uniqueEntryBlocked")).toMatchObject([
      { cardId: HELM_VILLAIN.id, matchedInstanceId: inPlay, disposition: "discarded" },
    ]);
    expect(discardPile(out.state)).toEqual([HELM_VILLAIN.id]);
    expect(attachedCards(out.state)).toEqual([]);
    expect(seenCount(out.state)).toBe(0);
    // One facedown card, off the top of the deck as it stood when the rule dealt it.
    expect(dealtTo(out.state)).toEqual([[A.id, false]]);
    expectReplays(out.session);
  });

  it("dealt to the player in the villain phase and revealed in step four", () => {
    const { state, inPlay } = start();
    // The boost card is a filler; step three deals the attachment; the rule's replacement is A, revealed in that step.
    const round = playRound(stacked(state, FILLER.id, HELM_VILLAIN.id, A.id));
    expect(reveals(round.events)).toEqual([HELM_VILLAIN.id, A.id]);
    expect(of(round.events, "uniqueEntryBlocked")).toMatchObject([
      { cardId: HELM_VILLAIN.id, matchedInstanceId: inPlay, disposition: "discarded" },
    ]);
    expect(attachedCards(round.state)).toEqual([]);
    expect(seenCount(round.state)).toBe(0);
    expect(dealtTo(round.state)).toEqual([]);
    expectReplays(round.session);
  });

  it("dealt as a facedown encounter card by an effect, then revealed in step four", () => {
    const { state, inPlay } = start();
    const dealt = playFree(stacked(state, HELM_VILLAIN.id, FILLER.id, A.id, B.id), deps, DEAL_AS_ENCOUNTER.card.id);
    expect(dealtTo(dealt.state)).toEqual([[HELM_VILLAIN.id, false]]);
    expect(of(dealt.events, "uniqueEntryBlocked")).toEqual([]);
    // Step three deals A behind it; the rule's replacement is B, at the back of the queue.
    const round = playRound(dealt.state);
    expect(reveals(round.events)).toEqual([HELM_VILLAIN.id, A.id, B.id]);
    expect(of(round.events, "uniqueEntryBlocked")).toMatchObject([
      { cardId: HELM_VILLAIN.id, matchedInstanceId: inPlay, disposition: "discarded" },
    ]);
    expect(attachedCards(round.state)).toEqual([]);
    expect(seenCount(round.state)).toBe(0);
    expectReplays(round.session);
  });

  it("revealed by its own Boost ability ('Reveal this card') as the villain's boost card", () => {
    const { state, inPlay } = start();
    // The boost card is the attachment: the rule deals A during the activation, and step three deals B behind it.
    const round = playRound(stacked(state, HELM_BOOST.id, A.id, B.id));
    expect(reveals(round.events)).toEqual([HELM_BOOST.id, A.id, B.id]);
    expect(of(round.events, "uniqueEntryBlocked")).toMatchObject([
      { cardId: HELM_BOOST.id, matchedInstanceId: inPlay, disposition: "discarded" },
    ]);
    expect(attachedCards(round.state)).toEqual([]);
    expect(seenCount(round.state)).toBe(0);
    expect(discardPile(round.state).filter((id) => id === HELM_BOOST.id)).toEqual([HELM_BOOST.id]);
    expect(mustInstance(round.state, round.state.activeVillainId!).boostCards).toEqual([]);
    expectReplays(round.session);
  });

  it("the same Boost ability with no matching card in play: the card attaches to the villain", () => {
    const { state } = start(false);
    const round = playRound(stacked(state, HELM_BOOST.id, A.id, B.id));
    expect(reveals(round.events)).toEqual([HELM_BOOST.id, A.id]);
    expect(of(round.events, "uniqueEntryBlocked")).toEqual([]);
    expect(attachedCards(round.state)).toEqual([HELM_BOOST.id]);
    expect(seenCount(round.state)).toBe(1);
  });

  it("put into play by an effect: discarded, and no facedown card is dealt (it was not being revealed)", () => {
    const { state, inPlay } = start();
    const out = playFree(stacked(state, HELM_VILLAIN.id, A.id), deps, PUT_INTO_PLAY.card.id);
    expect(reveals(out.events)).toEqual([]);
    expect(of(out.events, "uniqueEntryBlocked")).toMatchObject([
      { cardId: HELM_VILLAIN.id, matchedInstanceId: inPlay, disposition: "discarded" },
    ]);
    expect(discardPile(out.state)).toEqual([HELM_VILLAIN.id]);
    expect(attachedCards(out.state)).toEqual([]);
    expect(seenCount(out.state)).toBe(0);
    expect(dealtTo(out.state)).toEqual([]);
    expectReplays(out.session);
  });

  it("a unique teamwork minion revealed beside its copy never entered play: teamwork does not resolve", () => {
    const { state } = start(false);
    const first = minionEngagedWith(state, TWIN.id);
    const out = playFree(stacked(first.state, TWIN.id, A.id), deps, REVEAL_TOP.card.id);
    expect(of(out.events, "uniqueEntryBlocked")).toMatchObject([
      { cardId: TWIN.id, matchedInstanceId: first.id, disposition: "discarded" },
    ]);
    // Another AVENGER minion is in play (the grunt, and the copy itself), yet nothing activates.
    expect(of(out.events, "keywordResolved")).toEqual([]);
    expect(of(out.events, "enemyActivated" as GameEvent["type"])).toEqual([]);
    expect(of(out.events, "attackResolved")).toEqual([]);
    expect(of(out.events, "schemeResolved")).toEqual([]);
    expect(mustPlayer(out.state, P1).playArea.filter((id) => mustInstance(out.state, id).cardId === TWIN.id)).toEqual([
      first.id,
    ]);
    expect(dealtTo(out.state)).toEqual([[A.id, false]]);
  });

  it("the same minion with no copy in play enters play and its teamwork resolves", () => {
    const { state } = start(false);
    const out = playFree(stacked(state, TWIN.id, A.id), deps, REVEAL_TOP.card.id);
    expect(of(out.events, "uniqueEntryBlocked")).toEqual([]);
    expect(of(out.events, "keywordResolved").map((e) => e.keyword)).toEqual(["teamwork"]);
    expect(dealtTo(out.state)).toEqual([]);
  });
});
