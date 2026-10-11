/**
 * A unique linked card and the unique card that brings it into play share a title and neither has a subtitle (Zzzax,
 * `tt` 55059 the minion and 55066 the ally: "When Defeated: The player who defeated this minion puts the set-aside
 * Zzzax ally into play under their control.").
 *
 * The rules as written: RRG 1.8 "Unique Icon" (pp. 45–46), "A non-villain card in an out-of-play state that matches a
 * card in play cannot enter play", and two cards match that "share the same title and neither has a subtitle"; RRG 1.8
 * "When Defeated Abilities" (p. 48), "A defeated card leaves play after its 'When Defeated' ability is resolved". So the
 * minion is in play while its own ability brings the ally in, and to the letter the ally could never arrive. No FFG
 * ruling names the case. Built on the card's evident purpose: the card a linked keyword names (RRG 1.8 "Linked (Card
 * Title)", p. 27: "the card that brings the linked cards into play") is not held against the linked card its own
 * ability puts into play. Nothing else about the unique rule moves.
 */
import type { AnyCard, CardId, KeywordInstance } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import { replay, startSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { mustInstance, mustPlayer } from "./query.js";
import { createGame } from "./setup.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubAlly, stubMinion, stubUpgrade } from "./testing/fixtures.js";
import { DEFAULT_CARDS, DEFAULT_DECK, HERO, MAIN_SCHEME, TREACHERY, VILLAIN } from "./testing/scenario.js";
import { copiesOf, minionEngagedWith, P1, playerCardIntoPlay } from "./testing/wave3.js";

const self = { kind: "self" } as const;
/** "When Defeated: The player who defeated this minion puts the set-aside [title] ally into play under their control." */
const TAKEN = stubAbility("spark.when-defeated", {
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
const deps: EngineDeps = depsOf(TAKEN);

/** A unique minion and a unique ally of one title, neither with a subtitle. */
const SPARK_MINION: AnyCard = {
  ...stubMinion({ id: "spark-minion", atk: 1, sch: 1, hp: 2, abilities: [TAKEN.ref] }),
  name: "Spark",
  unique: true,
};
const sparkAlly = (keywords: readonly KeywordInstance[]): AnyCard => ({
  ...stubAlly({ id: "spark-ally", cost: 3, atk: 1, thw: 1, hp: 3 }),
  name: "Spark",
  unique: true,
  keywords,
});
const LINKED_ALLY = sparkAlly([{ name: "linked", cardTitle: "Spark", cardType: "minion" } as KeywordInstance]);
/** The same ally with no linked keyword, set aside by the scenario: nothing says the minion brings it in. */
const UNLINKED_ALLY = sparkAlly([]);
/** A third unique card of that title: a player's upgrade. */
const SPARK_UPGRADE: AnyCard = { ...stubUpgrade({ id: "spark-upgrade", cost: 0 }), name: "Spark", unique: true };

function table(ally: AnyCard, options: { setAside?: readonly CardId[]; deck?: readonly CardId[] } = {}): GameState {
  const result = createGame(
    {
      seed: 11,
      cards: [...DEFAULT_CARDS, SPARK_MINION, SPARK_UPGRADE, ally],
      villainCardId: VILLAIN.id,
      mainSchemeCardId: MAIN_SCHEME.id,
      encounterDeck: [SPARK_MINION.id, ...copiesOf(TREACHERY.id, 30)],
      includeIdentitySets: false,
      players: [{ identityCardId: HERO.id, deck: [...DEFAULT_DECK, ...(options.deck ?? [])] }],
      ...(options.setAside ? { setAside: options.setAside } : {}),
    },
    deps,
  );
  if (!result.ok) throw new Error(result.error.message);
  const state = driveSession(startSession(result.state), deps).session.state;
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" as const } })),
  };
}
function defeatMinion(state: GameState) {
  const minion = minionEngagedWith(state, SPARK_MINION.id);
  const { session, events } = driveSession(startSession(minion.state), deps, [
    {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: mustPlayer(minion.state, P1).identity.instanceId,
      targetInstanceId: minion.id,
    },
  ]);
  const replayed = replay(session.log, deps);
  expect(replayed.ok && replayed.state).toEqual(session.state);
  return { state: session.state, events, minion: minion.id };
}
const blocked = (events: readonly GameEvent[]) =>
  events.flatMap((e) => (e.type === "uniqueEntryBlocked" ? [{ cardId: e.cardId, by: e.matchedInstanceId }] : []));
const allyOf = (state: GameState): InstanceId =>
  Object.keys(state.instances).find((id) => state.instances[id]?.cardId === LINKED_ALLY.id) as InstanceId;
const inPlayArea = (state: GameState, id: InstanceId) => mustPlayer(state, P1).playArea.includes(id);

describe("a unique linked card brought into play by the unique card that names it", () => {
  it("the defeated minion is not held against its linked ally: the defeating player takes it", () => {
    const start = table(LINKED_ALLY);
    const ally = allyOf(start);
    expect(start.encounterSetAside).toContain(ally);
    const { state, events, minion } = defeatMinion(start);
    expect(blocked(events)).toEqual([]);
    expect(inPlayArea(state, ally)).toBe(true);
    expect(mustInstance(state, ally)).toMatchObject({ controllerId: P1, ownerId: P1, exhausted: false });
    expect(state.encounterSetAside).not.toContain(ally);
    // The minion left play after its When Defeated, as ever.
    expect(inPlayArea(state, minion)).toBe(false);
  });

  it("an ally of that title with no linked keyword is still refused while the minion is in play", () => {
    const start = table(UNLINKED_ALLY, { setAside: [UNLINKED_ALLY.id] });
    const ally = allyOf(start);
    const { state, events, minion } = defeatMinion(start);
    expect(blocked(events)).toEqual([{ cardId: UNLINKED_ALLY.id, by: minion }]);
    expect(inPlayArea(state, ally)).toBe(false);
  });

  it("another matching card in play still blocks the linked ally", () => {
    const start = table(LINKED_ALLY, { deck: [SPARK_UPGRADE.id] });
    const ally = allyOf(start);
    const upgrade = playerCardIntoPlay(start, SPARK_UPGRADE.id);
    const { state, events } = defeatMinion(upgrade.state);
    expect(blocked(events)).toEqual([{ cardId: LINKED_ALLY.id, by: upgrade.id }]);
    expect(inPlayArea(state, ally)).toBe(false);
    expect(state.encounterSetAside).toContain(ally);
  });
});
