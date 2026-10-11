/**
 * docs/phase7-wave9.md §3.57: a linked card whose parentheses name an encounter card, by title and card type ("Linked
 * (Brute minion)"), is set aside when the scenario's encounter cards hold that card, and the player who defeats the
 * minion takes the set-aside ally.
 *
 * Sources: RRG 1.8 "Linked (Card Title)" (p. 27): "they are set aside at the start of the game if any deck includes the
 * card that brings the linked cards into play (indicated in the parentheses following the keyword)"; "The number of
 * linked cards set aside during setup is equal to the number of those cards included in the product from which the
 * linked card came"; "When a player takes control of a card with the linked keyword, that player becomes the owner of
 * that card." MC55 p. 2 (transcribed in docs/phase7-wave9.md §3.57): a linked card "is set aside at the start of the
 * game if any encounter card or card in a player's deck includes the card that brings the linked card into play".
 *
 * Synthetic cards only; the engine never names a card.
 */
import { setCode, type AnyCard, type CardId, type KeywordInstance } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import { startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { linkedKeywordNames } from "./linked.js";
import { mustInstance, mustPlayer } from "./query.js";
import { createGame, type GameSetupConfig } from "./setup.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession, runCommands } from "./testing/drive.js";
import { stubAlly, stubMinion, stubUpgrade } from "./testing/fixtures.js";
import {
  DEFAULT_CARDS,
  DEFAULT_DECK,
  HERO,
  MAIN_SCHEME,
  TREACHERY,
  VILLAIN,
  seatIdentities,
} from "./testing/scenario.js";
import { copiesOf, minionEngagedWith, P1, P2, playerCardIntoPlay } from "./testing/wave3.js";

/** A linked keyword as data item 23 of docs/phase7-wave9.md §8.1 describes it: a title and a card type. */
const linkedKeyword = (cardTitle: string, cardType?: string) =>
  ({ name: "linked", cardTitle, ...(cardType ? { cardType } : {}) }) as Extract<KeywordInstance, { name: "linked" }>;
const linkedTo = (cardTitle: string, cardType?: string) => [linkedKeyword(cardTitle, cardType)] as const;
const self = { kind: "self" } as const;

/** "When Defeated: The player who defeated this minion puts the set-aside [title] ally into play under their control." */
const TAKEN = stubAbility("brute.when-defeated", {
  trigger: { kind: "whenDefeated" },
  effects: [
    {
      kind: "chooseCards",
      slot: "ally",
      from: { kind: "encounterSetAside", filter: { categories: ["ally"], sharesTitleWith: self } },
      chooser: { kind: "defeatingPlayer" },
      min: 1,
      max: 1,
    },
    { kind: "putIntoPlay", card: { kind: "slot", slot: "ally" }, controller: { kind: "defeatingPlayer" } },
  ],
});
/** "Does not count against your ally limit." */
const UNCOUNTED = stubAbility("brute-ally.constant", {
  trigger: { kind: "constant", rules: [{ kind: "excludedFromAllyLimit", target: { self: true } }] },
  effects: [],
});
const deps: EngineDeps = depsOf(TAKEN, UNCOUNTED);

const BRUTE_MINION: AnyCard = {
  ...stubMinion({ id: "brute-minion", atk: 1, sch: 1, hp: 2, abilities: [TAKEN.ref] }),
  name: "Brute",
  keywords: [{ name: "victory", value: 1 }],
};
const bruteAlly = (keywords: readonly KeywordInstance[]): AnyCard => ({
  ...stubAlly({ id: "brute-ally", cost: 3, atk: 1, thw: 1, hp: 3, abilities: [UNCOUNTED.ref] }),
  name: "Brute",
  keywords: [...keywords, { name: "victory", value: 0 }],
});
/** The two shapes the keyword is read in: a title and a type as two fields, and the parentheses as printed. */
const BRUTE_ALLY = bruteAlly(linkedTo("Brute", "minion"));
const BRUTE_ALLY_PRINTED = bruteAlly(linkedTo("Brute minion"));
/** A player upgrade and the linked upgrade its title brings: "Linked (Mentor upgrade)". */
const MENTOR_UPGRADE: AnyCard = { ...stubUpgrade({ id: "mentor-upgrade", cost: 1 }), name: "Mentor" };
const MENTOR_ALLY: AnyCard = { ...stubAlly({ id: "mentor-ally", cost: 1, atk: 1, thw: 1, hp: 2 }), name: "Mentor" };
const BADGE = stubUpgrade({ id: "badge", cost: 1, keywords: linkedTo("Mentor upgrade") });
const FILLER_ALLY = stubAlly({ id: "filler-ally", cost: 0, atk: 1, thw: 1, hp: 2 });

function create(options: {
  readonly linked: readonly AnyCard[];
  readonly encounter?: readonly CardId[];
  readonly decks?: readonly (readonly CardId[])[];
  readonly setAside?: GameSetupConfig["setAside"];
}) {
  const decks = options.decks ?? [DEFAULT_DECK];
  const identities = seatIdentities(HERO, decks.length);
  const result = createGame(
    {
      seed: 11,
      cards: [
        ...DEFAULT_CARDS,
        ...identities.slice(1),
        BRUTE_MINION,
        MENTOR_UPGRADE,
        MENTOR_ALLY,
        FILLER_ALLY,
        ...options.linked,
      ],
      villainCardId: VILLAIN.id,
      mainSchemeCardId: MAIN_SCHEME.id,
      encounterDeck: options.encounter ?? [BRUTE_MINION.id, ...copiesOf(TREACHERY.id, 30)],
      includeIdentitySets: false,
      players: identities.map((identity, seat) => ({ identityCardId: identity.id, deck: decks[seat]! })),
      ...(options.setAside ? { setAside: options.setAside } : {}),
    },
    deps,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result;
}
const linkedEvents = (events: readonly GameEvent[]) => events.filter((e) => e.type === "linkedCardsSetAside");
const cardIdsOf = (state: GameState, ids: readonly InstanceId[]) => ids.map((id) => mustInstance(state, id).cardId);

describe("§3.57 linked cards named by an encounter card are set aside at setup", () => {
  it("the named minion is in the encounter deck: one set for the game, ownerless, logged with no player", () => {
    for (const linked of [BRUTE_ALLY, BRUTE_ALLY_PRINTED]) {
      const { state, events } = create({ linked: [linked], decks: [DEFAULT_DECK, DEFAULT_DECK] });
      expect(cardIdsOf(state, state.encounterSetAside)).toEqual([linked.id]);
      const [ally] = state.encounterSetAside as [InstanceId];
      expect(mustInstance(state, ally)).toMatchObject({ ownerId: null, controllerId: null, faceup: true });
      expect(linkedEvents(events)).toEqual([
        { type: "linkedCardsSetAside", forPlayer: null, cardIds: [linked.id], instanceIds: [ally] },
      ]);
      for (const player of state.players)
        for (const zone of [player.deck, player.hand, player.discard, player.playArea, player.setAside])
          expect(zone).not.toContain(ally);
    }
  });

  it("a scenario without the named minion sets nothing aside", () => {
    const { state, events } = create({ linked: [BRUTE_ALLY], encounter: copiesOf(TREACHERY.id, 30) });
    expect(state.encounterSetAside).toEqual([]);
    expect(linkedEvents(events)).toEqual([]);
  });

  it("the card type narrows the name: the ally of the same title is not the named card", () => {
    // The linked ally itself is titled Brute and so is a set-aside ally the scenario lists; neither is a Brute minion.
    const { state, events } = create({
      linked: [BRUTE_ALLY],
      encounter: copiesOf(TREACHERY.id, 30),
      setAside: [MENTOR_ALLY.id],
    });
    expect(cardIdsOf(state, state.encounterSetAside)).toEqual([MENTOR_ALLY.id]);
    expect(linkedEvents(events)).toEqual([]);
    expect(linkedKeywordNames(linkedKeyword("Brute", "minion"), BRUTE_MINION)).toBe(true);
    expect(linkedKeywordNames(linkedKeyword("Brute", "minion"), BRUTE_ALLY)).toBe(false);
    expect(linkedKeywordNames(linkedKeyword("Brute minion"), BRUTE_ALLY)).toBe(false);
  });

  it("another product's minion of the same title and type is not the card that brings it into play", () => {
    // A nemesis minion titled Brute from another product is in the encounter deck; the linked ally's own is not.
    const OTHER_BRUTE: AnyCard = { ...BRUTE_MINION, id: "other-brute" as CardId, setCode: setCode("elsewhere") };
    const identities = seatIdentities(HERO, 1);
    const result = createGame(
      {
        seed: 11,
        cards: [...DEFAULT_CARDS, BRUTE_MINION, OTHER_BRUTE, BRUTE_ALLY],
        villainCardId: VILLAIN.id,
        mainSchemeCardId: MAIN_SCHEME.id,
        encounterDeck: [OTHER_BRUTE.id, ...copiesOf(TREACHERY.id, 30)],
        includeIdentitySets: false,
        players: identities.map((identity) => ({ identityCardId: identity.id, deck: DEFAULT_DECK })),
      },
      deps,
    );
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.encounterSetAside).toEqual([]);
    expect(linkedEvents(result.events)).toEqual([]);
  });

  it("copies the scenario already set aside itself are not set aside a second time", () => {
    const { state, events } = create({ linked: [BRUTE_ALLY], setAside: [BRUTE_ALLY.id] });
    expect(cardIdsOf(state, state.encounterSetAside)).toEqual([BRUTE_ALLY.id]);
    expect(linkedEvents(events)).toEqual([]);
  });

  it("a player's deck: 'Linked (Mentor upgrade)' is set aside for the deck holding the upgrade, not the ally", () => {
    const withUpgrade = [...DEFAULT_DECK, MENTOR_UPGRADE.id];
    const withAlly = [...DEFAULT_DECK, MENTOR_ALLY.id];
    const { state, events } = create({ linked: [BADGE], decks: [withAlly, withUpgrade] });
    expect(cardIdsOf(state, state.encounterSetAside)).toEqual([BADGE.id]);
    expect(linkedEvents(events)).toEqual([
      { type: "linkedCardsSetAside", forPlayer: P2, cardIds: [BADGE.id], instanceIds: state.encounterSetAside },
    ]);
  });
});

describe("§3.57 the player who defeats the minion takes the set-aside ally", () => {
  it("player 1 at the ally limit defeats it: the ally is theirs, ready, owned; no ally discarded; Victory 1 and 0", () => {
    const deck = [...DEFAULT_DECK, ...copiesOf(FILLER_ALLY.id, 3)];
    const created = create({ linked: [BRUTE_ALLY], decks: [deck] });
    let state = driveSession(startSession(created.state), deps).session.state;
    const [ally] = state.encounterSetAside as [InstanceId];
    // Three allies in play: the ally limit (RRG 1.8 "Ally Limit", p. 7).
    for (let i = 0; i < 3; i++) state = playerCardIntoPlay(state, FILLER_ALLY.id).state;
    const allies = mustPlayer(state, P1).playArea.filter((id) => mustInstance(state, id).cardId === FILLER_ALLY.id);
    expect(allies).toHaveLength(3);
    const hero: GameState = {
      ...state,
      players: state.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" as const } })),
    };
    const brute = minionEngagedWith(hero, BRUTE_MINION.id);
    const { session } = runCommands(brute.state, deps, {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: mustPlayer(brute.state, P1).identity.instanceId,
      targetInstanceId: brute.id,
    });
    const after = session.state;
    expect(mustPlayer(after, P1).playArea).toContain(ally);
    expect(mustInstance(after, ally)).toMatchObject({ ownerId: P1, controllerId: P1, exhausted: false, faceup: true });
    expect(after.encounterSetAside).not.toContain(ally);
    // "Does not count against your ally limit": the three allies stay.
    for (const id of allies) expect(mustPlayer(after, P1).playArea).toContain(id);
    expect(mustPlayer(after, P1).discard).toEqual(mustPlayer(brute.state, P1).discard);
    // The minion is in the victory display (Victory 1), so it is never defeated twice.
    expect(after.victoryDisplay).toContain(brute.id);

    // The ally defeated: Victory 0 sends it to the victory display, not to a discard pile.
    const hurt: GameState = {
      ...after,
      instances: { ...after.instances, [ally]: { ...mustInstance(after, ally), damage: 3 } },
    };
    const settled = driveSession(startSession(hurt), deps, [{ type: "endTurn", playerId: P1 }]).session.state;
    expect(settled.victoryDisplay).toEqual(expect.arrayContaining([brute.id, ally]));
    expect(mustPlayer(settled, P1).discard).not.toContain(ally);
  });
});
