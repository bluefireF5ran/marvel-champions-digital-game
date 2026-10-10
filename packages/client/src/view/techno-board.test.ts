/**
 * Techno (`techno`, Falcon's Thunderbolt set) on the board: Fixer holding several Tech attachments (the tile shows two,
 * names the rest and Inspect lists them all), an attachment sent to Fixer in the villain's place saying so, and
 * Tech-Pac's Hero Action cost, "exhaust any number of characters you control with combined THW greater than the attached
 * enemy's SCH", whose picker keeps Confirm off until the running total beats the number (`InPlayCostPick.combined`).
 * A real Thunderbolts game (solo Captain Marvel, Techno and Extreme Risk set aside) with the cards attached by hand.
 */
import { describe, expect, test } from "vitest";
import {
  cardsInPlay,
  getInstance,
  legalActions,
  type CardInstance,
  type GameState,
  type InstanceId,
  type PlayerId,
  type LegalAction,
} from "@mc/engine";
import { LocalEngineHost } from "../engine/local-host.js";
import { POOL_DEPS } from "../content/pool.js";
import { SessionStore } from "../store/session-store.js";
import { nextTurn } from "../store/dev-game-steps.js";
import { boardModel } from "./board-model.js";
import {
  beginInPlayCostChoice,
  combinedLine,
  inPlayCostChoiceView,
  slotAnswered,
  toggleInPlayPick,
} from "./in-play-cost-choice.js";
import { attachedLinks, placementNotes, tuckedSiblings } from "./inspect-notes.js";
import { inPlayCostPanelOf } from "./pick-panels.js";

const FIXER = "53038";
const JET_PACK = "53039";
const TECH_PAC = "53040";
const TRUNCHEON = "51040";
const MARIA_HILL = "01067";

const seat = (state: GameState): PlayerId => state.players[0]!.playerId;
const codeOf = (state: GameState, id: InstanceId): string => state.instances[id]!.cardId as string;
const idOf = (state: GameState, code: string, inPlay = true): InstanceId => {
  const live = new Set(cardsInPlay(state));
  return Object.values(state.instances).find(
    (instance) => (instance.cardId as string) === code && live.has(instance.instanceId) === inPlay,
  )!.instanceId;
};

/** A solo Captain Marvel game on the player's turn in hero form, with Maria Hill (THW 2) in play beside her. */
async function opened(): Promise<GameState> {
  const store = new SessionStore(new LocalEngineHost());
  await store.start({
    scenarioId: "thunderbolts",
    difficulty: "standard",
    players: [{ starterDeckId: "core-captain-marvel-leadership" }],
    setAsideModularSetIds: ["techno", "extreme_risk"],
    seed: 2,
    stack: { players: { 0: [MARIA_HILL as never] } },
  });
  let turn = await nextTurn(store);
  const maria = turn?.legal.find(
    (entry) => entry.action.kind === "playCard" && codeOf(store.state.game!, entry.action.instanceId) === MARIA_HILL,
  );
  if (maria) {
    await store.dispatch(maria.example);
    turn = await nextTurn(store);
  }
  const flip = turn?.legal.find((entry) => entry.action.kind === "changeForm");
  if (flip) await store.dispatch(flip.example);
  return store.state.game!;
}

/** `state` with a copy of `code` out of wherever it waits attached to `host`, as its own text would have attached it. */
function attach(state: GameState, host: InstanceId, code: string, patch: Partial<CardInstance> = {}) {
  const id = idOf(state, code, false);
  const take = (ids: readonly InstanceId[]) => ids.filter((other) => other !== id);
  const next = {
    ...state,
    encounterDecks: Object.fromEntries(
      Object.entries(state.encounterDecks).map(([key, pile]) => [
        key,
        { ...pile, deck: take(pile.deck), discard: take(pile.discard) },
      ]),
    ),
    instances: {
      ...state.instances,
      [id]: { ...state.instances[id]!, attachedTo: host, faceup: true, ...patch },
      [host]: { ...state.instances[host]!, attachments: [...state.instances[host]!.attachments, id] },
    },
  } as GameState;
  return { state: next, id };
}

describe("Fixer with several Tech attachments", () => {
  test("Inspect lists every one as a link, and steps between them", async () => {
    const game = await opened();
    const fixer = idOf(game, FIXER);
    const jet = attach(game, fixer, JET_PACK);
    const pac = attach(jet.state, fixer, TECH_PAC);
    // The Truncheon prints "attach to the villain": Fixer's interrupt sends it to him, and "the villain" in its text is him.
    const truncheon = attach(pac.state, fixer, TRUNCHEON, { villainAlias: fixer });
    const state = truncheon.state;

    const tile = boardModel(state, seat(state), POOL_DEPS).minions.find((minion) => minion.instanceId === fixer)!;
    expect(tile.attachments.map((chip) => chip.name)).toEqual(["Jet Pack", "Tech-Pac", "Energy Truncheon"]);

    expect(attachedLinks(state, fixer)?.attachments.map((link) => link.name)).toEqual([
      "Jet Pack",
      "Tech-Pac",
      "Energy Truncheon",
    ]);
    // A link on each opens it, and an attachment links back to Fixer.
    expect(attachedLinks(state, pac.id)?.host).toEqual({ instanceId: fixer, name: "Fixer" });
    expect(tuckedSiblings(state, fixer)).toEqual([fixer, jet.id, pac.id, truncheon.id]);
    // From any of them the sheet steps back to Fixer, and on to the others.
    expect(tuckedSiblings(state, pac.id)).toEqual([fixer, jet.id, pac.id, truncheon.id]);
  }, 120_000);

  test('an attachment sent to Fixer in the villain\'s place says it is on him and that its "the villain" means him', async () => {
    const game = await opened();
    const fixer = idOf(game, FIXER);
    const sent = attach(game, fixer, TRUNCHEON, { villainAlias: fixer });
    expect(getInstance(sent.state, sent.id)?.villainAlias).toBe(fixer);
    expect(attachedLinks(sent.state, sent.id)?.host?.name).toBe("Fixer");
    expect(placementNotes(sent.state, sent.id)).toEqual([
      'Sent to Fixer instead of the villain: "the villain" in its text means Fixer',
    ]);
    // One printed to attach to Fixer says only where it is: the link, no note.
    const printed = attach(game, fixer, JET_PACK);
    expect(attachedLinks(printed.state, printed.id)?.host?.name).toBe("Fixer");
    expect(placementNotes(printed.state, printed.id)).toEqual([]);
  }, 120_000);
});

describe("Tech-Pac's cost: a combined THW greater than the attached enemy's SCH", () => {
  async function pickerOn(): Promise<{ state: GameState; entry: LegalAction; hero: InstanceId; maria: InstanceId }> {
    const game = await opened();
    const fixer = idOf(game, FIXER);
    const { state, id } = attach(game, fixer, TECH_PAC);
    const actions = legalActions(state, seat(state), POOL_DEPS);
    if (actions.kind !== "turn") throw new Error(actions.kind);
    const entry = actions.legal.find((e) => e.action.kind === "useAbility" && e.action.instanceId === id);
    if (!entry) throw new Error("Tech-Pac's Hero Action is not offered");
    return { state, entry, hero: state.players[0]!.identity.instanceId, maria: idOf(state, MARIA_HILL) };
  }

  test("Confirm waits until the picks together beat the number, and the picker shows the running total against it", async () => {
    const { state, entry, hero, maria } = await pickerOn();
    const choice = beginInPlayCostChoice(state, POOL_DEPS, entry)!;
    expect(choice).not.toBeNull();
    const slot = choice.slots[0]!;
    // Fixer's SCH 2, +1 from Tech-Pac's own "+1 SCH" box: the engine's number, read as it reads it.
    expect(slot.combined).toEqual({ stat: "thw", moreThan: 3 });

    const none = inPlayCostChoiceView(state, POOL_DEPS, choice);
    expect(none.canConfirm).toBe(false);
    expect(none.combined).toEqual({ stat: "THW", total: 0, moreThan: 3, met: false });

    // Captain Marvel alone: THW 2 does not beat 3.
    const short = inPlayCostChoiceView(state, POOL_DEPS, toggleInPlayPick(choice, hero));
    expect(short.combined).toMatchObject({ total: 2, met: false });
    expect(short.canConfirm).toBe(false);
    expect(slotAnswered(toggleInPlayPick(choice, hero), state, POOL_DEPS)).toBe(false);
    expect(short.preview).toBe("Combined THW 2, need more than 3");
    expect(short.reason).toBe("Need a combined THW of more than 3");

    // With Maria Hill: 4 beats 3.
    const both = toggleInPlayPick(toggleInPlayPick(choice, hero), maria);
    const enough = inPlayCostChoiceView(state, POOL_DEPS, both);
    expect(enough.combined).toMatchObject({ total: 4, met: true });
    expect(enough.canConfirm).toBe(true);
    expect(enough.reason).toBeNull();
    expect(enough.preview).toBe("Combined THW 4, more than 3");
    expect(slotAnswered(both, state, POOL_DEPS)).toBe(true);

    // The panel carries the same line to the footer.
    expect(inPlayCostPanelOf(state, POOL_DEPS, enough).multi?.preview).toBe("Combined THW 4, more than 3");
    expect(combinedLine({ stat: "THW", total: 3, moreThan: 3 })).toBe("Combined THW 3, need more than 3");
  }, 120_000);
});
