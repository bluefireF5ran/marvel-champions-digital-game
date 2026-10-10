/**
 * The Baron Zemo evidence flow against a real game: gain evidence at the end of the player phase, advance to stage 2A,
 * make the accusation, and see the sealed view hold the "aim" pile closed until then. The state is the dev fixture's
 * (`dev-zemo-game.ts`), played on the engine's own commands and prompts.
 */
import { AOS_EVIDENCE_COMBINATIONS } from "@mc/content";
import { evidenceRowId, type PendingChoice } from "@mc/engine";
import { describe, expect, test } from "vitest";
import { CARDS_BY_ID, POOL_DEPS } from "../content/pool.js";
import { DevStateHost } from "../engine/dev-state-host.js";
import { LocalEngineHost } from "../engine/local-host.js";
import { accuseSheetOf, evidenceBoardOf, evidenceInputOf } from "../view/evidence-model.js";
import { nextTurn } from "./dev-game-steps.js";
import { zemoFixtureState } from "./dev-zemo-game.js";
import { SessionStore } from "./session-store.js";

const lookup = (id: string) => CARDS_BY_ID.get(id);

async function zemoStore(): Promise<SessionStore> {
  const { config, state } = await zemoFixtureState(new SessionStore(new LocalEngineHost()));
  const store = new SessionStore(new DevStateHost(state, POOL_DEPS));
  await store.start(config);
  return store;
}

/** Answers the open choice with the first option whose label has `text`, or the minimum when none is named. */
async function answer(store: SessionStore, text?: string): Promise<PendingChoice> {
  const choice = store.state.game!.pendingChoice as PendingChoice;
  const picked = text
    ? choice.options.filter((option) => option.label.includes(text)).slice(0, 1)
    : choice.options.slice(0, choice.minSelections);
  expect(picked.length).toBeGreaterThanOrEqual(choice.minSelections);
  await store.resolveChoice(picked.map((option) => option.optionId));
  return choice;
}

async function endTurn(store: SessionStore): Promise<void> {
  const turn = await nextTurn(store);
  await store.dispatch(turn!.legal.find((entry) => entry.action.kind === "endTurn")!.example);
}

describe("Baron Zemo: evidence and the accusation, end to end", () => {
  test("gaining evidence, the sealed view, and the accusation answered by the default picker", async () => {
    const store = await zemoStore();
    const before = evidenceInputOf(store.state.game!)!;
    // The input the screens read has no pile contents, only sizes, whatever the full state holds.
    expect(Object.keys(before)).not.toContain("hiddenPiles");
    expect(before.hiddenPileSizes).toEqual({ aim: 3, shield: 6 });
    expect(evidenceBoardOf(before, AOS_EVIDENCE_COMBINATIONS, lookup).grid.openCount).toBe(27);

    // Round 1: the Response gains two cards for two counters on the bare Tactical environment.
    await endTurn(store);
    for (let step = 0; step < 12 && store.state.game!.pendingChoice; step++) {
      const choice = store.state.game!.pendingChoice!;
      if (choice.prompt.kind === "chooseTriggers") await store.resolveChoice([choice.options[0]!.optionId]);
      else if (choice.options.some((option) => option.label.startsWith("Place 2 secret")))
        await answer(store, "Place 2 secret");
      else if (choice.options.some((option) => option.label === "Do not advance"))
        await answer(store, "Do not advance");
      else await answer(store);
    }
    const gained = evidenceInputOf(store.state.game!)!;
    const board = evidenceBoardOf(gained, AOS_EVIDENCE_COMBINATIONS, lookup);
    expect(gained.hiddenPileSizes).toEqual({ aim: 3, shield: 4 });
    expect(board.gained).toHaveLength(2);
    expect(board.grid.openCount).toBeLessThan(27);
    expect(board.piles.find((pile) => pile.pile === "aim")).toMatchObject({ hiddenCount: 3, faceup: [] });
    expect(board.answer).toBeNull();

    // Round 2: advance to stage 2A; the accuse prompt carries every open row as an option.
    await nextTurn(store);
    await endTurn(store);
    for (let step = 0; step < 12 && store.state.game!.pendingChoice?.prompt.kind !== "accuse"; step++) {
      const choice = store.state.game!.pendingChoice;
      if (!choice) break;
      if (choice.prompt.kind === "chooseTriggers") {
        await store.resolveChoice([choice.options[0]!.optionId]);
        continue;
      }
      await answer(
        store,
        choice.options.some((option) => option.label.startsWith("Advance to stage 2A"))
          ? "Advance to stage 2A"
          : undefined,
      );
    }
    const prompt = store.state.game!.pendingChoice as PendingChoice;
    expect(prompt.prompt.kind).toBe("accuse");
    const sheet = accuseSheetOf(prompt, [], lookup)!;
    expect(sheet.openCount).toBe(prompt.options.length);
    expect(sheet.grid.openCount).toBe(prompt.options.length);
    // Nothing of the "aim" pile is in what the sheet draws: its cards are all still unflagged as faceup.
    const aim = store.state.game!.hiddenPiles!.aim!;
    for (const block of sheet.grid.blocks) {
      for (const card of [block.means, ...block.motives, ...block.opportunities]) {
        if (aim.includes(card.cardId)) expect(card.faceup).toBe(false);
      }
    }

    // The default picker (`nextTurn`'s minimum answer) takes the first open row: the dev and test drivers need no more.
    const first = prompt.options[0]!.optionId;
    await nextTurn(store);
    const made = store.state.game!;
    expect(made.accusation?.accused && evidenceRowId(made.accusation.accused)).toBe(first);
    expect(made.accusation?.mole).toBeDefined();
    const after = evidenceBoardOf(evidenceInputOf(made)!, AOS_EVIDENCE_COMBINATIONS, lookup);
    expect(after.solved).toBe(true);
    expect(after.answer?.moleLine).toBeTruthy();
    expect(after.piles.find((pile) => pile.pile === "aim")).toMatchObject({ hiddenCount: 0 });
  }, 120_000);
});
