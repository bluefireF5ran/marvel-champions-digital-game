/**
 * docs/phase7-wave9.md §3.54: `EffectSpec attach.hideReverse`, `CardInstance.reverseHidden`, `otherFaceVisible`, and
 * what a view may read of a double-sided card whose other face no player may look at.
 *
 * Synthetic cards shaped like the Hypnotic Gaze attachments of Trickster Takeover: five cards with one front ("Your
 * identity gains the Defiant trait. If there are 5 or more charm counters here, remove each charm counter from here
 * and flip this card.") and five different other faces, one dealt at random to each identity by a Setup ability
 * "(players cannot look at the reverse sides)". MC55 p. 7: "Players cannot look at the 'Trance' side of any
 * Enchantment attachment until it flips through Hypnotic Gaze's ability. … When the 'Trance' side is revealed this way,
 * trigger its 'When Revealed' ability as normal." RRG 1.8 "Flip" (p. 20).
 */

import { trait, type AttachmentCard } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { Command } from "./commands.js";
import { applyCommand } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { preview } from "./preview.js";
import { cardOf, mustInstance, mustPlayer } from "./query.js";
import { traitsOf as currentTraits } from "./select.js";
import type { EffectSpec } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommandsPicking } from "./testing/drive.js";
import { stubAttachment, stubEvent, stubTreachery } from "./testing/fixtures.js";
import { defaultPick, giveCard } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, P1, P2 } from "./testing/wave3.js";
import { otherFaceVisible, sealHiddenInformation, sealHiddenReverses } from "./visibility.js";

const self = { kind: "self" } as const;
const you = { kind: "controller" } as const;
const n = (value: number) => ({ kind: "const", value }) as const;
const P3 = "p3" as PlayerId;
const charmHere = { kind: "counters", of: self, counterType: "charm" } as const;
const hostIdentity = { categories: ["identity"], hostOfSelf: true } as const;

const TRANCES = ["envy", "greed", "pride", "sloth", "wrath"] as const;
/**
 * An ability's id carries its card's id, as the ids of printed abilities do ("55008a.hypnotic-gaze-constant-2"): each
 * of the five fronts has its own two, alike in everything but the id.
 */
/** "Your identity gains the Defiant trait." */
const GAZE_TRAITS = TRANCES.map((name) =>
  stubAbility(`gaze-${name}.trait`, {
    trigger: { kind: "constant", traitGrants: [{ trait: trait("DEFIANT"), target: hostIdentity }] },
    effects: [],
  }),
);
/** "If there are 5 or more charm counters here, remove each charm counter from here and flip this card." */
const GAZE_FLIPS = TRANCES.map((name) =>
  stubAbility(`gaze-${name}.flip`, {
    trigger: { kind: "stateCheck", when: { kind: "compare", left: charmHere, op: "atLeast", right: n(5) } },
    effects: [
      { kind: "removeCounters", target: self, counterType: "charm" },
      { kind: "flipCard", target: self, reveal: true },
    ],
  }),
);
/** "Your identity gains the Enthralled trait." */
const TRANCE_TRAITS = TRANCES.map((name) =>
  stubAbility(`trance-${name}.trait`, {
    trigger: { kind: "constant", traitGrants: [{ trait: trait("ENTHRALLED"), target: hostIdentity }] },
    effects: [],
  }),
);
/** "When Revealed: Take N damage." (a different N on each Trance, so the test can tell whose resolved) */
const REVEALED = TRANCES.map((name, index) =>
  stubAbility(`trance-${name}.revealed`, {
    trigger: { kind: "whenRevealed" },
    effects: [{ kind: "dealDamage", target: { kind: "identityOf", player: you }, amount: n(index + 1) }],
  }),
);
const GAZES: readonly AttachmentCard[] = TRANCES.map((name, index) => ({
  ...stubAttachment({ id: `gaze-${name}`, name: "gaze", abilities: [GAZE_TRAITS[index]!.ref, GAZE_FLIPS[index]!.ref] }),
  flipSide: {
    name: `trance of ${name}`,
    traits: [],
    keywords: [],
    text: { printed: `trance of ${name}`, current: `trance of ${name}` },
    abilities: [TRANCE_TRAITS[index]!.ref, REVEALED[index]!.ref],
  },
}));
const GAZE_IDS = GAZES.map((card) => card.id as string);
const TRANCE_NAMES = TRANCES.map((name) => `trance of ${name}`);

const event = (id: string, effects: readonly EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
/** "Attach a random gaze to each identity (players cannot look at the reverse sides)." */
const DEAL = event("deal", [
  {
    kind: "forEachPlayer",
    players: { kind: "each" },
    effects: [
      {
        kind: "selectCards",
        slot: "gaze",
        cards: { kind: "encounterSetAside", filter: { name: "gaze" }, random: n(1) },
      },
      {
        kind: "attach",
        card: { kind: "slot", slot: "gaze" },
        to: { kind: "identityOf", player: { kind: "scoped" } },
        hideReverse: true,
      },
    ],
  },
]);
/** "Action: Place N charm counters on each gaze attached to an identity." */
const charm = (id: string, amount: number) =>
  event(id, [
    {
      kind: "addCounters",
      target: { kind: "each", query: { name: "gaze", categories: ["attachment"] } },
      counterType: "charm",
      amount: n(amount),
    },
  ]);
const CHARM_4 = charm("charm4", 4);
const CHARM_1 = charm("charm1", 1);
const FILLER = stubTreachery({ id: "filler", boostIcons: 0 });
const deps = depsOf(
  ...GAZE_TRAITS,
  ...GAZE_FLIPS,
  ...TRANCE_TRAITS,
  ...REVEALED,
  DEAL.ability,
  CHARM_4.ability,
  CHARM_1.ability,
);

/** A game at the first turn with the five gazes set aside (surgery: out of the encounter deck). */
function table(players: 1 | 3 = 3, seed = 21): GameState {
  const start = gameAtFirstTurn({
    cards: [...GAZES, FILLER, DEAL.card, CHARM_4.card, CHARM_1.card],
    deps,
    players,
    seed,
    deck: [DEAL.card.id, CHARM_4.card.id, CHARM_1.card.id, CHARM_1.card.id],
    encounter: [...GAZES.map((card) => card.id), ...copiesOf(FILLER.id, 20)],
  });
  const deckId = Object.keys(start.encounterDecks)[0] as keyof typeof start.encounterDecks;
  const piles = start.encounterDecks[deckId]!;
  const gazes = piles.deck.filter((id) => GAZE_IDS.includes(start.instances[id]!.cardId));
  // In card order, as a setup that sets a set's cards aside leaves them.
  gazes.sort((a, b) => start.instances[a]!.cardId.localeCompare(start.instances[b]!.cardId));
  return {
    ...start,
    encounterDecks: {
      ...start.encounterDecks,
      [deckId]: { ...piles, deck: piles.deck.filter((id) => !gazes.includes(id)) },
    },
    encounterSetAside: [...start.encounterSetAside, ...gazes],
  };
}

function play(state: GameState, card: { card: { id: string } } = DEAL, pick = defaultPick) {
  const given = giveCard(state, P1, card.card.id as never);
  const command: Command = {
    type: "playCard",
    playerId: P1,
    cardInstanceId: given.id,
    payment: [],
    attachToInstanceId: null,
  };
  return { ...runCommandsPicking(given.state, deps, pick, command), command, before: given.state };
}

const identityOf = (state: GameState, player: PlayerId) => mustPlayer(state, player).identity.instanceId;
const gazeOn = (state: GameState, player: PlayerId): InstanceId => {
  const [id] = mustInstance(state, identityOf(state, player)).attachments;
  if (!id) throw new Error(`${player} has no gaze`);
  return id;
};
const gazeInstances = (state: GameState): readonly InstanceId[] =>
  Object.values(state.instances)
    .filter((instance) => GAZE_IDS.includes(instance.cardId))
    .map((instance) => instance.instanceId);
const mentions = (value: unknown, needles: readonly string[]): readonly string[] => {
  const text = JSON.stringify(value);
  return needles.filter((needle) => text.includes(`"${needle}"`));
};
/**
 * Every string that would say which card a hidden one is, for the cards not in `flipped`: its other face's name and the
 * prefix of that face's ability ids ("trance-greed.revealed"), and the front's own card id, which is also the prefix
 * of the front's ability ids ("gaze-greed.flip"); the stand-in's front id says nothing and is left out.
 */
const secretsExcept = (flipped: readonly string[]): readonly string[] =>
  TRANCES.filter((name) => !flipped.includes(`gaze-${name}`)).flatMap((name) => [
    `trance of ${name}`,
    `trance-${name}`,
    ...(`gaze-${name}` === GAZE_IDS[0] ? [] : [`gaze-${name}`]),
  ]);
/** The needles found anywhere in the JSON of `value`: in a value, a key or part of a longer string. */
const occurrences = (value: unknown, needles: readonly string[]): readonly string[] => {
  const text = JSON.stringify(value);
  return needles.filter((needle) => text.includes(needle));
};
/** A state as a client holds it, without the printed catalog and the RNG state (neither is sent as state). */
const tableOf = (state: GameState): unknown => {
  const { cardPool: _pool, rng: _rng, ...sealed } = sealHiddenInformation(state);
  return sealed;
};
const types = (events: readonly GameEvent[]) => events.map((e) => e.type);

describe("§3.54 a double-sided card attached with its other face hidden (attach.hideReverse)", () => {
  it("three players: three different cards attached, two left set aside, all five hidden; the same seed replays", () => {
    const dealt = play(table());
    const attached = [P1, P2, P3].map((player) => gazeOn(dealt.state, player));
    expect(new Set(attached.map((id) => mustInstance(dealt.state, id).cardId)).size).toBe(3);
    const aside = dealt.state.encounterSetAside.filter((id) => GAZE_IDS.includes(mustInstance(dealt.state, id).cardId));
    expect(aside.length).toBe(2);
    const all = gazeInstances(dealt.state);
    expect(all.length).toBe(5);
    for (const id of all) {
      expect(mustInstance(dealt.state, id).reverseHidden).toBe(true);
      expect(otherFaceVisible(dealt.state, id)).toBe(false);
    }
    // The front is in play and open: its trait is granted, and it is faceup.
    expect(mustInstance(dealt.state, attached[0]!).faceup).toBe(true);
    expect(currentTraits(dealt.state, identityOf(dealt.state, P2), deps)).toContain("DEFIANT");
    // One hide for the whole look-alike group, at the first deal.
    expect(dealt.events.filter((e) => e.type === "reversesHidden")).toEqual([
      { type: "reversesHidden", instanceIds: expect.arrayContaining([...all]) },
    ]);
    expect(play(table()).state).toEqual(dealt.state);
  });

  it("which card an instance is does not follow from its instance id: other seeds deal other cards to the same instances", () => {
    const byInstance = (seed: number): string => {
      const state = play(table(3, seed)).state;
      return gazeInstances(state)
        .map((id) => `${id}=${mustInstance(state, id).cardId}`)
        .sort()
        .join(",");
    };
    const outcomes = new Set([21, 22, 23, 24, 25, 26].map(byInstance));
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it("nothing a client is given names a hidden other face: the sealed state, the events, the open choice", () => {
    const dealt = play(table());
    // The engine's own state knows, as an authority must.
    expect(mentions(dealt.state.instances, GAZE_IDS).length).toBe(5);
    const { cardPool: _pool, rng: _rng, ...sealed } = sealHiddenInformation(dealt.state);
    // Every hidden card is named by one stand-in, the first card with that front; no other face's name is anywhere.
    expect(mentions(sealed, GAZE_IDS)).toEqual([GAZE_IDS[0]]);
    expect(mentions(sealed, TRANCE_NAMES)).toEqual([]);
    for (const id of gazeInstances(dealt.state)) {
      expect(sealed.instances[id]!.cardId).toBe(GAZE_IDS[0]);
      expect(otherFaceVisible(sealed, id)).toBe(false);
    }
    // Everything else about a sealed card is as it is.
    const mine = gazeOn(dealt.state, P1);
    expect({ ...sealed.instances[mine], cardId: null }).toEqual({ ...mustInstance(dealt.state, mine), cardId: null });
    // The log of the deal names instances, and the stand-in where an event names a card.
    expect(mentions(dealt.events, [...GAZE_IDS, ...TRANCE_NAMES])).toEqual([GAZE_IDS[0]]);
    expect(dealt.events.filter((e) => e.type === "cardMoved" && e.to.kind === "attachment").length).toBe(3);
    // A later command's events and prompts do not either, while the cards stay as they are.
    const charmed = play(dealt.state, CHARM_4);
    expect(mentions(charmed.events, [...GAZE_IDS.slice(1), ...TRANCE_NAMES])).toEqual([]);
    for (const id of gazeInstances(charmed.state)) expect(otherFaceVisible(charmed.state, id)).toBe(false);
    // A state with no hidden reverse is returned as it is.
    const plain = table();
    expect(sealHiddenReverses(plain)).toBe(plain);
  });

  it("no string of the sealed state names a hidden card: not its id, its abilities' ids or its other face's", () => {
    const dealt = play(table());
    const charmed = play(dealt.state, CHARM_4);
    // The authority's bookkeeping is keyed by ability id, and a printed ability's id is its card's own.
    const checked = Object.keys(charmed.state.stateChecks);
    expect(checked.length).toBe(3);
    expect(occurrences(checked, secretsExcept([])).length).toBeGreaterThan(0);
    for (const state of [dealt.state, charmed.state]) {
      expect(occurrences(tableOf(state), secretsExcept([]))).toEqual([]);
    }
    // The memo of each state check is kept, under the stand-in's ability: the sealed state agrees with itself.
    const sealed = sealHiddenInformation(charmed.state);
    expect(Object.keys(sealed.stateChecks).sort()).toEqual(
      [P1, P2, P3].map((player) => `${gazeOn(charmed.state, player)}:${GAZE_IDS[0]}.flip`).sort(),
    );
    expect(Object.values(sealed.stateChecks)).toEqual(Object.values(charmed.state.stateChecks));
    // A use count and a frame on the stack are sealed the same way, wherever a hidden card's ability is named.
    const mine = gazeOn(charmed.state, P1);
    const real = mustInstance(charmed.state, mine).cardId as string;
    const marked = {
      ...charmed.state,
      abilityUses: { ...charmed.state.abilityUses, [`${mine}:${real}.flip`]: 1 },
      stack: [{ sourceInstanceId: mine, abilityId: `${real}.flip`, cardId: real }] as never,
    };
    const again = sealHiddenInformation(marked);
    expect(again.abilityUses[`${mine}:${GAZE_IDS[0]}.flip`]).toBe(1);
    expect(again.stack).toEqual([{ sourceInstanceId: mine, abilityId: `${GAZE_IDS[0]}.flip`, cardId: GAZE_IDS[0] }]);
    expect(occurrences(tableOf(marked), secretsExcept([]))).toEqual([]);
    // Sealing a sealed state changes nothing, and what names no hidden card is shared, not copied.
    expect(sealHiddenReverses(sealed)).toBe(sealed);
    expect(sealed.players).toBe(charmed.state.players);
    expect(sealed.cardPool).toBe(charmed.state.cardPool);
  });

  it("after the flip the sealed state names the flipped card and its other face, and no card still hidden", () => {
    const dealt = play(table(1));
    const flipped = play(play(dealt.state, CHARM_4).state, CHARM_1);
    const mine = gazeOn(flipped.state, P1);
    const real = mustInstance(flipped.state, mine).cardId as string;
    expect(mustInstance(flipped.state, mine).flipped).toBe(true);
    const sealed = tableOf(flipped.state);
    // The four set aside are hidden still: only the flipped card's names are in the state.
    expect(occurrences(sealed, secretsExcept([real]))).toEqual([]);
    expect(occurrences(sealed, [real])).toEqual([real]);
    expect(sealHiddenInformation(flipped.state).instances[mine]!.cardId).toBe(real);
    // The same search fails on the state the authority keeps, so it is a search that can fail.
    const { cardPool: _pool, rng: _rng, ...open } = flipped.state;
    expect(occurrences(open, secretsExcept([real])).length).toBeGreaterThan(0);
  });

  it("at 4 charm counters it takes 1: no counters, the other face up, its When Revealed resolved by its player", () => {
    const dealt = play(table());
    const charmed = play(dealt.state, CHARM_4);
    const flippedAll = play(charmed.state, CHARM_1);
    for (const player of [P1, P2, P3]) {
      const id = gazeOn(flippedAll.state, player);
      const instance = mustInstance(flippedAll.state, id);
      expect(instance.counters.charm ?? 0).toBe(0);
      expect(instance.flipped).toBe(true);
      expect(instance.reverseHidden).toBeUndefined();
      expect(otherFaceVisible(flippedAll.state, id)).toBe(true);
      // "You" of the When Revealed is the player it is attached to: that identity took the Trance's own damage.
      const trance = GAZE_IDS.indexOf(instance.cardId);
      expect(mustInstance(flippedAll.state, identityOf(flippedAll.state, player)).damage).toBe(trance + 1);
      const traits = currentTraits(flippedAll.state, identityOf(flippedAll.state, player), deps);
      expect(traits).toContain("ENTHRALLED");
      expect(traits).not.toContain("DEFIANT");
      // Flipped, it is sealed no more: a client reads the card it is.
      expect(sealHiddenInformation(flippedAll.state).instances[id]!.cardId).toBe(instance.cardId);
    }
    // The two set aside are still hidden.
    const aside = flippedAll.state.encounterSetAside.filter((id) => mustInstance(flippedAll.state, id).reverseHidden);
    expect(aside.length).toBe(2);
  });

  it("a preview stops at the flip instead of showing the other face, and runs to the end when nothing flips", () => {
    const dealt = play(table(3));
    const charmed = play(dealt.state, CHARM_4);
    const last = play(charmed.state, CHARM_1);
    const flipping = preview(last.before, last.command, deps);
    expect(flipping.stop.kind).toBe("hiddenInformation");
    expect(types(flipping.events)).not.toContain("cardFlipped");
    expect(mentions(flipping.events, [...GAZE_IDS.slice(1), ...TRANCE_NAMES])).toEqual([]);
    expect(flipping.outcome).toBeNull();
    // Four counters flip nothing: the whole outcome is shown.
    const harmless = preview(charmed.before, charmed.command, deps);
    expect(harmless.stop.kind).toBe("complete");
    expect(types(harmless.events)).toContain("counterAdded");
  });

  it("a second deal attaches another of the hidden cards: the group is hidden and shuffled once", () => {
    const dealt = play(table(1));
    expect(gazeInstances(dealt.state).filter((id) => mustInstance(dealt.state, id).attachedTo !== null).length).toBe(1);
    const cardIds = gazeInstances(dealt.state).map((id) => mustInstance(dealt.state, id).cardId);
    // Dealing again attaches a second card; the group was hidden at the first deal and is not shuffled again.
    const again = play(dealt.state, DEAL);
    expect(again.events.filter((e) => e.type === "reversesHidden")).toEqual([]);
    expect(gazeInstances(again.state).map((id) => mustInstance(again.state, id).cardId)).toEqual(cardIds);
    expect(cardOf(again.state, gazeOn(again.state, P1))?.name).toBe("gaze");
    expect(applyCommand(again.state, { type: "endTurn", playerId: P1 }, deps).ok).toBe(true);
  });
});
