/**
 * docs/phase7-wave9.md §3.49: an attach still to come (`TriggerEvent cardAttached` with `imminent`),
 * `EffectSpec replaceAttachHost` and `CardInstance.villainAlias`. "Forced Interrupt: When a non-scenario-specific Tech
 * attachment would be attached to the villain, attach it to [this card] instead. Text on that card that refers to
 * 'the villain' refers to [this card] instead.", on a synthetic minion (the Catcher).
 *
 * Sources: RRG 1.8 "Attach To" (p. 8: "checked for legality when the card would be attached"; "not resolved if another
 * ability causes that card to attach to a specific game element"), "'Would'" (p. 48), "Replacement Effect" (p. 37),
 * "Scenario-Specific Card" (p. 39), "Enters Play" (p. 18).
 *
 * Synthetic cards only.
 */

import { encounterSetId, trait, type AttachmentCard } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityDefinition, EngineDeps } from "./abilities.js";
import { replay, type GameSession } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId } from "./ids.js";
import { mustInstance } from "./query.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { stubAttachment, stubEvent, stubMinion, stubTreachery } from "./testing/fixtures.js";
import { MAIN_SCHEME } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, minionEngagedWith, onTopOfEncounterDeck, P1, playFree } from "./testing/wave3.js";

const TECH = trait("TECH");
const self = { kind: "self" } as const;
const you = { kind: "controller" } as const;
const one = { kind: "const", value: 1 } as const;
const theVillain = { kind: "villain" } as const;
const CATCHER_ID = "catcher.interrupt";

const catcherInterrupt = (villainAlias: boolean): AbilityDefinition => ({
  trigger: {
    kind: "interrupt",
    forced: true,
    would: true,
    on: {
      on: "cardAttached",
      sourceIs: { categories: ["attachment"], trait: TECH, scenarioSpecific: false },
      targetIs: { categories: ["villain"] },
    },
  },
  effects: [{ kind: "replaceAttachHost", to: self, ...(villainAlias ? { villainAlias: true as const } : {}) }],
});
const CATCHER_INTERRUPT = stubAbility(CATCHER_ID, catcherInterrupt(true));
/** "When Revealed: Deal 1 damage to the villain." */
const ZAP_REVEALED = stubAbility("gadget.when-revealed", {
  trigger: { kind: "whenRevealed" },
  effects: [{ kind: "dealDamage", target: theVillain, amount: one }],
});
/** "Forced Response: After this card enters play, place 1 mark counter on the attached enemy." */
const MARK_ENTERED = stubAbility("gadget.entered", {
  trigger: { kind: "response", forced: true, on: { on: "cardEntersPlay", selfIs: "target" } },
  effects: [
    {
      kind: "addCounters",
      target: { kind: "each", query: { categories: ["enemy"], hostOfSelf: true } },
      counterType: "mark",
      amount: one,
    },
  ],
});
/** "Reveal the top card of the encounter deck." */
const REVEAL_ACTION = stubAbility("reveal.action", {
  trigger: { kind: "action" },
  effects: [{ kind: "revealEncounterCard", player: you }],
});
/** "Attach the top card of the encounter deck to the villain." */
const PLANT_ACTION = stubAbility("plant.action", {
  trigger: { kind: "action" },
  effects: [
    {
      kind: "chooseCards",
      slot: "top",
      from: { kind: "encounter", zones: ["deck"], top: one },
      chooser: you,
      min: 1,
      max: 1,
    },
    { kind: "attach", card: { kind: "slot", slot: "top" }, to: theVillain },
  ],
});

const tech = (card: AttachmentCard, sets: readonly string[] = []): AttachmentCard => ({
  ...card,
  traits: [TECH],
  encounterSetIds: sets.map((id) => encounterSetId(id)),
});
const toVillain = { kind: "villain" } as const;
const GADGET = tech(
  stubAttachment({ id: "gadget", attachesTo: toVillain, abilities: [ZAP_REVEALED.ref, MARK_ENTERED.ref] }),
);
/** "Attach to Nobody. Otherwise, attach to the villain." */
const BACKUP = tech(
  stubAttachment({
    id: "backup",
    attachesTo: { kind: "ifAble", preferred: { kind: "namedCard", name: "nobody" }, otherwise: toVillain },
  }),
);
/** "Attach to Catcher. Otherwise, attach to the villain.": its own text names the Catcher first. */
const HOMING = tech(
  stubAttachment({
    id: "homing",
    attachesTo: { kind: "ifAble", preferred: { kind: "namedCard", name: "catcher" }, otherwise: toVillain },
  }),
);
/** No Tech trait. */
const TRINKET = stubAttachment({ id: "trinket", attachesTo: toVillain });
/** A Tech attachment of the scenario's own set. */
const HOUSE_TECH = tech(stubAttachment({ id: "house-tech", attachesTo: toVillain }), ["house"]);
/** A Tech attachment with no "attach to" text: only an ability attaches it. */
const LOOSE = tech(stubAttachment({ id: "loose", abilities: [MARK_ENTERED.ref] }));
const CATCHER = stubMinion({ id: "catcher", atk: 1, sch: 1, hp: 9, abilities: [CATCHER_INTERRUPT.ref] });
const REVEAL = stubEvent({ id: "reveal", cost: 0, abilities: [REVEAL_ACTION.ref] });
const PLANT = stubEvent({ id: "plant", cost: 0, abilities: [PLANT_ACTION.ref] });
const FILLER = stubTreachery({ id: "filler", boostIcons: 0 });
const HOUSE_SCHEME = { ...MAIN_SCHEME, encounterSetIds: [encounterSetId("house")] };

const QUIET = [ZAP_REVEALED, MARK_ENTERED, REVEAL_ACTION, PLANT_ACTION];
const deps: EngineDeps = depsOf(CATCHER_INTERRUPT, ...QUIET);
/** The same cards with no ability that hears an attach. */
const quietDeps: EngineDeps = depsOf(...QUIET);
/** A Catcher whose interrupt does not change what "the villain" means on the card. */
const plainDeps: EngineDeps = depsOf(stubAbility(CATCHER_ID, catcherInterrupt(false)), ...QUIET);

interface Table {
  readonly state: GameState;
  readonly catcher: InstanceId | null;
  readonly villain: InstanceId;
}

function table(options: { readonly catcher?: boolean; readonly with?: EngineDeps } = {}): Table {
  const start = gameAtFirstTurn({
    cards: [GADGET, BACKUP, HOMING, TRINKET, HOUSE_TECH, LOOSE, CATCHER, REVEAL, PLANT, FILLER],
    deps: options.with ?? deps,
    mainScheme: HOUSE_SCHEME,
    deck: [REVEAL.id, PLANT.id],
    encounter: [
      GADGET.id,
      BACKUP.id,
      HOMING.id,
      TRINKET.id,
      HOUSE_TECH.id,
      LOOSE.id,
      CATCHER.id,
      ...copiesOf(FILLER.id, 20),
    ],
  });
  const catcher = options.catcher === false ? null : minionEngagedWith(start, CATCHER.id);
  const state = catcher?.state ?? start;
  return { state, catcher: catcher?.id ?? null, villain: state.activeVillainId! };
}

const inPlayCopy = (state: GameState, cardId: string): InstanceId => {
  const found = Object.values(state.instances).find((i) => i.cardId === cardId && i.attachedTo !== null);
  if (!found) throw new Error(`${cardId} is attached to nothing`);
  return found.instanceId;
};
const hostOf = (state: GameState, cardId: string) => mustInstance(state, inPlayCopy(state, cardId)).attachedTo;
const attachEvents = (events: readonly GameEvent[], phase: "initiated" | "resolved" | "cancelled") =>
  events.flatMap((e) =>
    e.type === "triggerEvent" && e.phase === phase && e.event.kind === "cardAttached" && e.event.imminent
      ? [e.event]
      : [],
  );
const catcherResolved = (events: readonly GameEvent[]) =>
  events.filter((e) => e.type === "abilityResolved" && e.abilityId === CATCHER_ID).length;
const movesToAttach = (events: readonly GameEvent[]) =>
  events.flatMap((e) => (e.type === "cardMoved" && e.to.kind === "attachment" ? [e.to.hostInstanceId] : []));
function expectReplays(session: GameSession, using = deps) {
  const replayed = replay(session.log, using);
  if (!replayed.ok) throw new Error(replayed.error.message);
  expect(replayed.state).toEqual(session.state);
}
const reveal = (t: Table, cardId: string, using = deps) =>
  playFree(onTopOfEncounterDeck(t.state, cardId as never), using, REVEAL.id);

describe("§3.49 an attachment bound for the villain is attached to another enemy instead", () => {
  it("a revealed Tech attachment: on the Catcher in one move, entering play there; the villain attach is cancelled", () => {
    const t = table();
    const { state, events, session } = reveal(t, GADGET.id);
    expect(hostOf(state, GADGET.id)).toBe(t.catcher);
    expect(mustInstance(state, t.villain).attachments).toEqual([]);
    const [heard] = attachEvents(events, "initiated");
    expect(heard).toMatchObject({
      hostInstanceId: t.villain,
      playerId: P1,
      imminent: { entry: "placement", sourceInstanceId: null },
    });
    expect(attachEvents(events, "cancelled")).toHaveLength(1);
    expect(attachEvents(events, "resolved")).toHaveLength(0);
    // One move, straight onto the Catcher: the card is never on the villain.
    expect(movesToAttach(events)).toEqual([t.catcher]);
    expect(catcherResolved(events)).toBe(1);
    // It entered play on the Catcher: "after this card enters play" reads the Catcher as the attached enemy.
    expect(mustInstance(state, t.catcher!).counters.mark).toBe(1);
    expectReplays(session);
  });

  it("'the villain' in that card's text is the Catcher: its When Revealed deals its 1 damage to the Catcher", () => {
    const t = table();
    const { state } = reveal(t, GADGET.id);
    expect(mustInstance(state, inPlayCopy(state, GADGET.id)).villainAlias).toBe(t.catcher);
    expect(mustInstance(state, t.catcher!).damage).toBe(1);
    expect(mustInstance(state, t.villain).damage).toBe(0);
  });

  it("without villainAlias the card is on the Catcher and 'the villain' is still the villain", () => {
    const t = table({ with: plainDeps });
    const { state, session } = reveal(t, GADGET.id, plainDeps);
    expect(hostOf(state, GADGET.id)).toBe(t.catcher);
    expect(mustInstance(state, inPlayCopy(state, GADGET.id)).villainAlias).toBeUndefined();
    expect(mustInstance(state, t.catcher!).damage).toBe(0);
    expect(mustInstance(state, t.villain).damage).toBe(1);
    expectReplays(session, plainDeps);
  });

  it("'attach to X, otherwise the villain' with X out of play is bound for the villain: on the Catcher", () => {
    const t = table();
    const { state, events } = reveal(t, BACKUP.id);
    expect(hostOf(state, BACKUP.id)).toBe(t.catcher);
    expect(catcherResolved(events)).toBe(1);
  });

  it("a card whose own text names the Catcher first is never bound for the villain: no window opens", () => {
    const t = table();
    const { state, events } = reveal(t, HOMING.id);
    expect(hostOf(state, HOMING.id)).toBe(t.catcher);
    expect(attachEvents(events, "initiated")).toHaveLength(0);
    expect(catcherResolved(events)).toBe(0);
    expect(mustInstance(state, inPlayCopy(state, HOMING.id)).villainAlias).toBeUndefined();
  });

  it("an attachment without the trait, and the scenario's own Tech attachment, go on the villain", () => {
    for (const card of [TRINKET, HOUSE_TECH]) {
      const t = table();
      const { state, events, session } = reveal(t, card.id);
      expect(hostOf(state, card.id), card.id).toBe(t.villain);
      expect(attachEvents(events, "initiated"), card.id).toHaveLength(0);
      expect(catcherResolved(events), card.id).toBe(0);
      expectReplays(session);
    }
  });

  it("an ability's 'attach it to the villain' is heard too: the card lands on the Catcher and enters play there", () => {
    const t = table();
    const { state, events, session } = playFree(onTopOfEncounterDeck(t.state, LOOSE.id), deps, PLANT.id);
    expect(hostOf(state, LOOSE.id)).toBe(t.catcher);
    const [heard] = attachEvents(events, "initiated");
    expect(heard).toMatchObject({ hostInstanceId: t.villain, imminent: { entry: "ability" } });
    expect(mustInstance(state, heard!.imminent!.sourceInstanceId!).cardId).toBe(PLANT.id);
    expect(movesToAttach(events)).toEqual([t.catcher]);
    expect(mustInstance(state, t.catcher!).counters.mark).toBe(1);
    expect(mustInstance(state, inPlayCopy(state, LOOSE.id)).villainAlias).toBe(t.catcher);
    expectReplays(session);
  });

  it("with the Catcher out of play, and in a game with no such ability, the attach is made at once on the villain", () => {
    const away = table({ catcher: false });
    const first = reveal(away, GADGET.id);
    expect(hostOf(first.state, GADGET.id)).toBe(away.villain);
    expect(attachEvents(first.events, "initiated")).toHaveLength(0);
    expect(mustInstance(first.state, away.villain).damage).toBe(1);

    const quiet = table({ with: quietDeps });
    const second = reveal(quiet, GADGET.id, quietDeps);
    expect(hostOf(second.state, GADGET.id)).toBe(quiet.villain);
    expect(attachEvents(second.events, "initiated")).toHaveLength(0);
    const planted = playFree(onTopOfEncounterDeck(quiet.state, LOOSE.id), quietDeps, PLANT.id);
    expect(hostOf(planted.state, LOOSE.id)).toBe(quiet.villain);
    expect(mustInstance(planted.state, quiet.villain).counters.mark).toBe(1);
    expectReplays(second.session, quietDeps);
  });

  it("the alias ends when the card leaves the Catcher: revealed again with the Catcher gone, it is the villain's", () => {
    const t = table();
    const first = reveal(t, GADGET.id);
    const gadget = inPlayCopy(first.state, GADGET.id);
    // Surgery: the Catcher and its attachment leave play (the attachment back on top of the encounter deck).
    const deckId = Object.keys(first.state.encounterDecks)[0]!;
    const piles = first.state.encounterDecks[deckId as keyof typeof first.state.encounterDecks]!;
    const { villainAlias: _alias, ...rest } = mustInstance(first.state, gadget);
    const cleared: GameState = {
      ...first.state,
      players: first.state.players.map((p) => ({ ...p, playArea: p.playArea.filter((id) => id !== t.catcher) })),
      encounterDecks: { ...first.state.encounterDecks, [deckId]: { ...piles, deck: [gadget, ...piles.deck] } },
      instances: {
        ...first.state.instances,
        [gadget]: { ...rest, attachedTo: null },
        [t.catcher!]: { ...mustInstance(first.state, t.catcher!), attachments: [], engagedWith: null },
      },
    };
    const again = playFree(cleared, deps, REVEAL.id);
    expect(mustInstance(again.state, gadget).attachedTo).toBe(t.villain);
    expect(mustInstance(again.state, gadget).villainAlias).toBeUndefined();
    expect(mustInstance(again.state, t.villain).damage).toBe(1);
  });
});
