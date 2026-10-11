/**
 * A title two cards in play share: which one an ability that names it means.
 *
 * RRG 1.8 "Referential Ability" (p. 36): "If an ability refers to a title shared by multiple cards in the game, that
 * ability refers only to the card(s) that match the criteria highest in this list: 1. The card on which the referential
 * ability is printed. 2. Cards associated with the same identity, including: the identity card, identity-specific
 * cards, the identity's obligation cards, the identity's nemesis set, cards belonging to a side deck used by the
 * identity. 3. Player cards (if the ability is on a player card) or encounter cards (if the ability is on an encounter
 * card)." The nemesis set is the identity's by the ruling of June 25, 2026 (4) answer 1.
 *
 * Synthetic cards: an ally, two minions and a villain all titled "Shade", shaped like the Black Widow ally, the Black
 * Widow minion of a modular set and a treachery that says "Black Widow activates against you. If no enemy activated
 * this way, this card gains surge." Here the treachery places 7 threat on the main scheme instead of surging.
 */

import { flat, type AllyCard, type MinionCard } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { mustInstance } from "./query.js";
import { referredToByName, resolveRef } from "./select.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { stubAlly, stubEvent, stubMinion, stubTreachery, stubVillain } from "./testing/fixtures.js";
import { HERO } from "./testing/scenario.js";
import {
  copiesOf,
  gameAtFirstTurn,
  minionEngagedWith,
  onTopOfEncounterDeck,
  P1,
  playerCardIntoPlay,
  playFree,
} from "./testing/wave3.js";

const SHADE = "Shade";
const n = (value: number) => ({ kind: "const", value }) as const;
const you = { kind: "controller" } as const;
const named = { kind: "named", name: SHADE } as const;

const ALLY: AllyCard = { ...stubAlly({ id: "shade-ally", cost: 0, atk: 1, thw: 1, hp: 5 }), name: SHADE };
/** An ally of the hero's own set (its set icon names the identity). */
const OWN_ALLY: AllyCard = {
  ...stubAlly({
    id: "shade-own-ally",
    cost: 0,
    atk: 1,
    thw: 1,
    hp: 5,
    aspect: `hero:${HERO.id}` as AllyCard["aspect"],
  }),
  name: SHADE,
};
const MINION: MinionCard = { ...stubMinion({ id: "shade-minion", atk: 2, sch: 1, hp: 5, boostIcons: 0 }), name: SHADE };
const NEMESIS: MinionCard = {
  ...stubMinion({
    id: "shade-nemesis",
    encounterSetIds: [HERO.nemesisEncounterSetId],
    atk: 2,
    sch: 1,
    hp: 5,
    boostIcons: 0,
  }),
  name: SHADE,
};
/** A minion with the title the first player's identity shows in alter-ego form (the Black Widow minion and hero). */
const NAMESAKE: MinionCard = {
  ...stubMinion({ id: "namesake-minion", atk: 2, sch: 1, hp: 5, boostIcons: 0 }),
  name: HERO.alterEgo.faceName,
};
const SHADE_VILLAIN = stubVillain({ id: "shade-villain", name: SHADE, stages: [{ hp: flat(20), atk: 1, sch: 1 }] });
const BLANK = stubTreachery({ id: "blank", boostIcons: 0 });

/** "Shade activates against you. If no enemy activated this way, place 7 threat on the main scheme." */
const CALL_REVEALED = stubAbility("shade-call.when-revealed", {
  trigger: { kind: "whenRevealed" },
  effects: [
    { kind: "enemyActivation", enemies: named, against: you, bind: "activated", boost: false },
    {
      kind: "if",
      condition: { kind: "not", of: { kind: "varAtLeast", name: "activated.made", amount: 1 } },
      then: [{ kind: "placeThreat", target: { kind: "mainScheme" }, amount: n(7) }],
    },
  ],
});
const CALL = stubTreachery({ id: "shade-call", boostIcons: 0, abilities: [CALL_REVEALED.ref] });
/** A player card's "Deal 1 damage to Shade." */
const STRIKE_ACTION = stubAbility("shade-strike.action", {
  trigger: { kind: "action" },
  effects: [{ kind: "dealDamage", target: named, amount: n(1) }],
});
const STRIKE = stubEvent({ id: "shade-strike", cost: 0, abilities: [STRIKE_ACTION.ref] });
const REVEAL_ACTION = stubAbility("shade-reveal.action", {
  trigger: { kind: "action" },
  effects: [{ kind: "revealEncounterCard", player: you }],
});
const REVEAL = stubEvent({ id: "shade-reveal", cost: 0, abilities: [REVEAL_ACTION.ref] });

const deps: EngineDeps = depsOf(CALL_REVEALED, STRIKE_ACTION, REVEAL_ACTION);

function start(options: { villain?: typeof SHADE_VILLAIN } = {}): GameState {
  return gameAtFirstTurn({
    cards: [ALLY, OWN_ALLY, MINION, NEMESIS, NAMESAKE, BLANK, CALL, STRIKE, REVEAL],
    deps,
    ...(options.villain ? { villain: options.villain } : {}),
    encounter: [MINION.id, NAMESAKE.id, CALL.id, ...copiesOf(BLANK.id, 12)],
    deck: [ALLY.id, OWN_ALLY.id, STRIKE.id, REVEAL.id],
  });
}

/** The set-aside nemesis minion engaged with the first player (surgery). */
function nemesisEngaged(state: GameState): { readonly state: GameState; readonly id: InstanceId } {
  const id = (Object.keys(state.instances) as InstanceId[]).find((i) => state.instances[i]?.cardId === NEMESIS.id);
  if (!id) throw new Error("the nemesis minion is not in the game");
  return {
    id,
    state: {
      ...state,
      encounterSetAside: state.encounterSetAside.filter((i) => i !== id),
      players: state.players.map((p) => (p.playerId === P1 ? { ...p, playArea: [...p.playArea, id] } : p)),
      instances: {
        ...state.instances,
        [id]: { ...mustInstance(state, id), engagedWith: P1, controllerId: null, faceup: true },
      },
    },
  };
}

const threat = (state: GameState) => mustInstance(state, state.mainScheme.instanceId).threat;
const activationsBy = (events: readonly GameEvent[], id: InstanceId) =>
  events.filter(
    (e) =>
      e.type === "triggerEvent" &&
      e.phase === "initiated" &&
      (e.event.kind === "enemyAttack" || e.event.kind === "enemyScheme") &&
      e.event.enemyInstanceId === id,
  ).length;
const refOf = (state: GameState, source: InstanceId | null) =>
  resolveRef(state, named, { selfInstanceId: source, controllerId: P1, bindings: {}, vars: {}, event: null });

describe("an encounter card names a title an ally and a minion share", () => {
  const staged = () => {
    // The ally enters play first, so it comes first in play order.
    const ally = playerCardIntoPlay(start(), ALLY.id);
    const minion = minionEngagedWith(ally.state, MINION.id);
    return { state: onTopOfEncounterDeck(minion.state, CALL.id), ally: ally.id, minion: minion.id };
  };

  it("'Shade activates against you' activates the minion, so the 'if no enemy activated' part does not apply", () => {
    const { state, minion } = staged();
    const { state: after, events } = playFree(state, deps, REVEAL.id);
    expect(activationsBy(events, minion)).toBe(1);
    // In alter-ego form the activation is a scheme: the minion's SCH (1), and not the 7 of "no enemy activated".
    expect(threat(after)).toBe(threat(state) + 1);
  });

  it("with only the ally in play, no enemy activates and the 'if no enemy activated' part applies", () => {
    const ally = playerCardIntoPlay(start(), ALLY.id);
    const state = onTopOfEncounterDeck(ally.state, CALL.id);
    const { state: after } = playFree(state, deps, REVEAL.id);
    expect(threat(after)).toBe(threat(state) + 7);
  });

  it("a player card's 'deal 1 damage to Shade' means the ally, the player card of that title", () => {
    const { state, ally, minion } = staged();
    const { state: after } = playFree(state, deps, STRIKE.id);
    expect(mustInstance(after, ally).damage).toBe(1);
    expect(mustInstance(after, minion).damage).toBe(0);
  });
});

describe("the priority list, criterion by criterion", () => {
  it("1: a card that names its own title means itself", () => {
    const ally = playerCardIntoPlay(start(), ALLY.id);
    const minion = minionEngagedWith(ally.state, MINION.id);
    expect(referredToByName(minion.state, SHADE, ally.id)).toEqual([ally.id]);
    expect(referredToByName(minion.state, SHADE, minion.id)).toEqual([minion.id]);
  });

  it("2: a card of an identity's set means the card of that identity's set, across the player and encounter sides", () => {
    const own = playerCardIntoPlay(start(), OWN_ALLY.id);
    const minion = minionEngagedWith(own.state, MINION.id);
    const nemesis = nemesisEngaged(minion.state);
    const state = nemesis.state;
    // In play, the nemesis minion that names "Shade" means itself (criterion 1).
    expect(referredToByName(state, SHADE, nemesis.id)).toEqual([nemesis.id]);
    // Out of play, it means the hero's own ally, not the other minion, an encounter card like itself.
    const outOfPlay: GameState = {
      ...state,
      players: state.players.map((p) => ({ ...p, playArea: p.playArea.filter((i) => i !== nemesis.id) })),
    };
    expect(referredToByName(outOfPlay, SHADE, nemesis.id)).toEqual([own.id]);
    // A treachery of no identity's set names "Shade": the two minions, encounter cards like itself.
    const treachery = (Object.keys(state.instances) as InstanceId[]).find(
      (i) => state.instances[i]?.cardId === CALL.id,
    )!;
    expect(referredToByName(state, SHADE, treachery)).toEqual([minion.id, nemesis.id]);
  });

  it("2: the hero's ally names the title and the nemesis minion of that hero is the only other card of it", () => {
    const basic = playerCardIntoPlay(start(), ALLY.id);
    const nemesis = nemesisEngaged(basic.state);
    const own = (Object.keys(nemesis.state.instances) as InstanceId[]).find(
      (i) => nemesis.state.instances[i]?.cardId === OWN_ALLY.id,
    )!;
    // The hero's own ally is not in play; its ability names the nemesis minion, not the basic ally beside it.
    expect(referredToByName(nemesis.state, SHADE, own)).toEqual([nemesis.id]);
  });

  it("3: two encounter cards of the title tie for an encounter card; 'named' takes the first in play order", () => {
    const base = start({ villain: SHADE_VILLAIN });
    const minion = minionEngagedWith(base, MINION.id);
    const treachery = (Object.keys(base.instances) as InstanceId[]).find((i) => base.instances[i]?.cardId === CALL.id)!;
    const villain = minion.state.activeVillainId;
    expect(referredToByName(minion.state, SHADE, treachery)).toEqual([villain, minion.id]);
    expect(refOf(minion.state, treachery)).toEqual([villain]);
  });

  it("3: an identity is a player card: an encounter card that names its title means the minion of that title", () => {
    const minion = minionEngagedWith(start(), NAMESAKE.id);
    const state = minion.state;
    const identity = state.players[0]!.identity.instanceId;
    const treachery = (Object.keys(state.instances) as InstanceId[]).find(
      (i) => state.instances[i]?.cardId === CALL.id,
    )!;
    expect(referredToByName(state, NAMESAKE.name, null)).toEqual([identity, minion.id]);
    expect(referredToByName(state, NAMESAKE.name, treachery)).toEqual([minion.id]);
    const ally = playerCardIntoPlay(state, ALLY.id);
    expect(referredToByName(ally.state, NAMESAKE.name, ally.id)).toEqual([identity]);
  });

  it("a title only the other side has is still found, and no source card finds every card of the title", () => {
    const ally = playerCardIntoPlay(start(), ALLY.id);
    const treachery = (Object.keys(ally.state.instances) as InstanceId[]).find(
      (i) => ally.state.instances[i]?.cardId === CALL.id,
    )!;
    expect(referredToByName(ally.state, SHADE, treachery)).toEqual([ally.id]);
    const minion = minionEngagedWith(ally.state, MINION.id);
    expect(referredToByName(minion.state, SHADE, null)).toEqual([ally.id, minion.id]);
  });
});
