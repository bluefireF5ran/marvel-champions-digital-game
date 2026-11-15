/**
 * A permanent encounter attachment whose villain leaves play while no other villain is in play: it stays in play,
 * unattached, and attaches to the next villain the moment one enters play (`waitsForVillainHost`,
 * `attachWaitingPermanents`). Owner decision 2026-11-15 (#525 item 8), revising docs/phase7-wave5.md §4.1 row 26 (it
 * was discarded to its encounter discard pile); RRG 1.8 "Permanent" p. 32; ruling May 10, 2024 (165), naming Morlock
 * Siege and Mansion Attack: "keep the attachment in play (because it's permanent) and attach it immediately to the next
 * eligible villain that enters play". The scenario is the Mansion Attack shape (`mansion-attack-sequence.test.ts`): a
 * defeated villain goes to the victory display and a response adds a random set-aside villain of another title.
 */

import { flat, type VillainCard } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import { replay, startSession } from "./engine.js";
import { activeEncounterDeckId, mustInstance, undefeatedVillains } from "./query.js";
import type { InstanceId } from "./ids.js";
import { createGame } from "./setup.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { driveSession } from "./testing/drive.js";
import { stubAttachment, stubEvent, stubMainScheme, stubTreachery, stubVillain } from "./testing/fixtures.js";
import { DEFAULT_CARDS, DEFAULT_DECK, HERO } from "./testing/scenario.js";
import { copiesOf, encounterCardInVillainArea, playFree } from "./testing/wave3.js";

const brother = (id: string, name: string): VillainCard =>
  stubVillain({ id, name, stages: [{ hp: flat(10), atk: 0, sch: 1, keywords: [{ name: "victory", value: 1 }] }] });
const AVALANCHE = brother("avalanche", "Avalanche");
const BLOB = brother("blob", "Blob");

/** After the villain is defeated, add a random set-aside villain (Save the School's shape, MC32 p. 15). */
const NEXT_VILLAIN = stubAbility("next-villain.response", {
  trigger: { kind: "response", forced: true, on: { on: "characterDefeated", targetIs: { categories: ["villain"] } } },
  effects: [
    {
      kind: "selectCards",
      slot: "next",
      cards: { kind: "encounterSetAside", filter: { categories: ["villain"] }, random: { kind: "const", value: 1 } },
    },
    { kind: "addVillain", villain: { kind: "slot", slot: "next" }, reveal: true },
  ],
});
const MAIN = stubMainScheme({
  id: "sequence",
  stages: [{ startingThreat: flat(0), targetThreat: flat(99), acceleration: flat(0), abilities: [NEXT_VILLAIN.ref] }],
});
const SLAY_ABILITY = stubAbility("slay.action", {
  trigger: { kind: "action" },
  effects: [{ kind: "dealDamage", target: { kind: "villain" }, amount: { kind: "const", value: 10 } }],
});
const SLAY = stubEvent({ id: "slay", cost: 0, abilities: [SLAY_ABILITY.ref] });
const FILLER = stubTreachery({ id: "filler", boostIcons: 0 });
/** Flight's shape (`next_evol` 40151): "Attach to the villain. Permanent." */
const WINGS = stubAttachment({ id: "wings", attachesTo: { kind: "villain" }, keywords: [{ name: "permanent" }] });
/** The same card without the keyword: discarded with its host (RRG 1.8 "Attach To", p. 8). */
const PLAIN_WINGS = stubAttachment({ id: "plain-wings", attachesTo: { kind: "villain" } });

const deps: EngineDeps = depsOf(NEXT_VILLAIN, SLAY_ABILITY);

/** Avalanche in play with `card` attached, Blob set aside. */
function start(card: typeof WINGS): { readonly state: GameState; readonly id: InstanceId } {
  const result = createGame(
    {
      seed: 8,
      cards: [...DEFAULT_CARDS, AVALANCHE, BLOB, MAIN, FILLER, SLAY, card],
      villainCardId: AVALANCHE.id,
      setAsideVillainCardIds: [BLOB.id],
      mainSchemeCardId: MAIN.id,
      encounterDeck: [card.id, ...copiesOf(FILLER.id, 10)],
      victory: "cardAbility",
      victoryCondition: 2,
      includeIdentitySets: false,
      players: [{ identityCardId: HERO.id, deck: [...DEFAULT_DECK, ...copiesOf(SLAY.id, 3)] }],
    },
    deps,
  );
  if (!result.ok) throw new Error(result.error.message);
  const begun = driveSession(startSession(result.state), deps).session.state;
  const villainId = begun.activeVillainId!;
  const taken = encounterCardInVillainArea(begun, card.id);
  const state: GameState = {
    ...taken.state,
    villainArea: taken.state.villainArea.filter((id) => id !== taken.id),
    instances: {
      ...taken.state.instances,
      [taken.id]: { ...mustInstance(taken.state, taken.id), attachedTo: villainId, controllerId: null },
      [villainId]: { ...mustInstance(taken.state, villainId), attachments: [taken.id] },
    },
  };
  return { state, id: taken.id };
}

describe("#525 item 8: a permanent attachment waits for the next villain (ruling May 10, 2024 (165))", () => {
  it("its villain is defeated with none other in play: it attaches to the next villain as it enters play; replay deep-equal", () => {
    const { state: before, id } = start(WINGS);
    const avalanche = before.activeVillainId!;
    const { state, events, session } = playFree(before, deps, SLAY.id);
    const [blob] = undefeatedVillains(state);
    expect(blob?.cardId).toBe(BLOB.id);
    expect(mustInstance(state, id).attachedTo).toBe(blob!.instanceId);
    expect(mustInstance(state, blob!.instanceId).attachments).toContain(id);
    expect(state.villainArea).not.toContain(id);
    expect(state.removedFromGame).not.toContain(id);
    expect(state.encounterDecks[activeEncounterDeckId(state)]!.discard).not.toContain(id);
    expect(events.filter((e) => e.type === "permanentAttachmentRehosted")).toEqual([
      { type: "permanentAttachmentRehosted", instanceId: id, fromInstanceId: null, hostInstanceId: blob!.instanceId },
    ]);
    expect(mustInstance(state, avalanche).attachments).toEqual([]);
    const replayed = replay(session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(session.state);
  });

  it("control: the same attachment without permanent is discarded with its villain, and the next villain does not get it", () => {
    const { state: before, id } = start(PLAIN_WINGS);
    const { state } = playFree(before, deps, SLAY.id);
    const [blob] = undefeatedVillains(state);
    expect(mustInstance(state, blob!.instanceId).attachments).not.toContain(id);
    expect(state.encounterDecks[activeEncounterDeckId(state)]!.discard).toContain(id);
  });
});

/**
 * Several villains (The Wrecking Crew insert, "Multiple Villains and Encounter Decks"; Four Horsemen): the active
 * villain is defeated while others remain. Its attachments go as its stage is removed, before the active counter
 * passes (`removeDefeatedVillain`), so "attach to the villain" has no target at that moment; the card waits and goes to
 * the new active villain once the counter has moved. Ruling Sep 26, 2024 (#15 note): "attach them to the current
 * active villain". With no side scheme in play every villain ties at 0 threat, and the first player picks.
 */
function multiVillain(count: 2 | 3) {
  const villains = Array.from({ length: count }, (_, i) =>
    stubVillain({ id: `horse-${i + 1}`, name: `Horse ${i + 1}`, stages: [{ hp: flat(10), atk: 0, sch: 0 }] }),
  );
  const multiDeps = depsOf(SLAY_ABILITY);
  const created = createGame(
    {
      seed: 3,
      cards: [...DEFAULT_CARDS, ...villains, MAIN, FILLER, SLAY, WINGS],
      villainCardId: villains[0]!.id,
      villains: villains.map((villain) => ({ villainCardId: villain.id, encounterDeck: [] })),
      sharedEncounterDeck: true,
      mainSchemeCardId: MAIN.id,
      encounterDeck: [WINGS.id, ...copiesOf(FILLER.id, 20)],
      includeIdentitySets: false,
      players: [{ identityCardId: HERO.id, deck: [...DEFAULT_DECK, ...copiesOf(SLAY.id, 3)] }],
    },
    multiDeps,
  );
  if (!created.ok) throw new Error(created.error.message);
  const begun = driveSession(startSession(created.state), multiDeps).session.state;
  const first = begun.villains.find((v) => v.cardId === villains[0]!.id)!.instanceId;
  const taken = encounterCardInVillainArea(begun, WINGS.id);
  const state: GameState = {
    ...taken.state,
    activeVillainId: first,
    villainArea: taken.state.villainArea.filter((id) => id !== taken.id),
    instances: {
      ...taken.state.instances,
      [taken.id]: { ...mustInstance(taken.state, taken.id), attachedTo: first, controllerId: null },
      [first]: { ...mustInstance(taken.state, first), attachments: [taken.id] },
    },
  };
  return { state, deps: multiDeps, first, wings: taken.id };
}

describe("#525 item 8, several villains: the active villain is defeated while others remain (ruling Sep 26, 2024)", () => {
  for (const count of [2, 3] as const) {
    it(`${count} villains: the permanent attachment goes to the new active villain, not out of the game; replay deep-equal`, () => {
      const t = multiVillain(count);
      const { state, session } = playFree(t.state, t.deps, SLAY.id);
      expect(state.villains.find((v) => v.instanceId === t.first)?.defeated).toBe(true);
      expect(state.outcome).toBeNull();
      const active = state.activeVillainId!;
      expect(active).not.toBe(t.first);
      expect(mustInstance(state, t.wings).attachedTo).toBe(active);
      expect(mustInstance(state, active).attachments).toContain(t.wings);
      expect(state.removedFromGame).not.toContain(t.wings);
      expect(state.villainArea).not.toContain(t.wings);
      const replayed = replay(session.log, t.deps);
      if (!replayed.ok) throw new Error(replayed.error.message);
      expect(replayed.state).toEqual(session.state);
    });
  }
});
