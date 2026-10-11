import { describe, expect, test } from "vitest";
import type { GameState, InstanceId, PendingChoice } from "@mc/engine";
import {
  aosOptionLabelOf,
  boardSecretsOf,
  secretPlacementNote,
  secretTargetNote,
  secretTargetNotesOf,
  wrapOptionLabel,
} from "./board-secret-notes.js";

/** Only the slices of a state this module reads. */
function stateOf(opts: {
  readonly expert?: boolean;
  readonly secrets: readonly number[];
  readonly attachments?: number;
  readonly campaign?: boolean;
}): GameState {
  const fronts = ["50181a", "50182a", "50183a"];
  const backs = ["50181b", "50182b", "50183b"];
  const instances: Record<string, unknown> = {};
  const cardPool: Record<string, unknown> = {};
  const names = ["Chief Medical Officer", "Chief Surveillance Officer", "Chief Tactical Officer"];
  fronts.forEach((id, index) => {
    cardPool[id] = { name: names[index] };
  });
  const villainArea: string[] = [];
  opts.secrets.forEach((secrets, index) => {
    instances[`m${index}`] = { cardId: fronts[index], counters: secrets ? { secret: secrets } : {}, attachedTo: null };
    villainArea.push(`m${index}`);
  });
  for (let index = 0; index < (opts.attachments ?? 0); index++)
    instances[`a${index}`] = { cardId: backs[index], counters: { secret: 4 }, attachedTo: "villain" };
  return {
    villainArea,
    instances,
    cardPool,
    scenarioRules: opts.expert ? { difficulty: "expert" } : {},
    ...(opts.campaign ? { campaign: {} } : {}),
  } as unknown as GameState;
}

describe("what a secret counter would do to a Board Member", () => {
  test("standard flips at 4 and expert at 3: only the member one short of it flips", () => {
    expect(boardSecretsOf(stateOf({ secrets: [3, 2, 0] }))!.members.map((m) => m.flipsWithOneMore)).toEqual([
      true,
      false,
      false,
    ]);
    expect(
      boardSecretsOf(stateOf({ expert: true, secrets: [3, 2, 0] }))!.members.map((m) => m.flipsWithOneMore),
    ).toEqual([true, true, false]);
  });

  test("a game with no Board Member has nothing to say", () => {
    expect(boardSecretsOf(stateOf({ secrets: [] }))).toBeNull();
    expect(aosOptionLabelOf(stateOf({ secrets: [] }), "Heal REC · +1 secret counter")).toBe(
      "Heal REC · +1 secret counter",
    );
  });

  test("the offer names the flip when some choices flip and says so plainly when every choice does", () => {
    expect(secretPlacementNote(boardSecretsOf(stateOf({ secrets: [3, 1, 0] }))!)).toBe(
      "Flips Medical Officer if you pick it.",
    );
    expect(secretPlacementNote(boardSecretsOf(stateOf({ secrets: [3, 3, 3] }))!)).toBe("Flips a Board Member.");
    expect(secretPlacementNote(boardSecretsOf(stateOf({ secrets: [1, 1, 0] }))!)).toBeNull();
  });

  test("the third flip warns that it loses the game", () => {
    const view = boardSecretsOf(stateOf({ secrets: [3], attachments: 2 }))!;
    expect(view.nextFlipLoses).toBe(true);
    expect(secretPlacementNote(view)).toBe("Flips that Board Member. That is the third flip: you lose the game.");
    expect(secretTargetNote(view, "m0" as InstanceId)).toBe("3 secrets · FLIPS: you lose");
    // Two attachments with a safe pick: no warning.
    expect(secretPlacementNote(boardSecretsOf(stateOf({ secrets: [0], attachments: 2 }))!)).toBeNull();
  });

  test("the option label carries the note under it, only on an offer that places a secret counter", () => {
    const state = stateOf({ secrets: [3, 0, 0] });
    expect(aosOptionLabelOf(state, "Heal REC · +1 secret counter")).toBe(
      "Heal REC · +1 secret counter\nFlips Medical Officer if you pick it.",
    );
    expect(aosOptionLabelOf(state, "Decline")).toBe("Decline");
    // The decline of an offer that places a counter places none, so it carries no warning.
    expect(aosOptionLabelOf(state, "Do not add a secret counter")).toBe("Do not add a secret counter");
    expect(aosOptionLabelOf(state, "Add 1 threat to the main scheme")).toBe("Add 1 threat to the main scheme");
  });

  test("Zemo's offer says 1 evidence card in a campaign and keeps the printed 2 outside one", () => {
    const label = "Place 2 secret counters on a Board Member environment with none to gain 2 evidence cards";
    expect(aosOptionLabelOf(stateOf({ secrets: [0, 0, 0], campaign: true }), label)).toBe(
      "Place 2 secret counters on a Board Member environment with none to gain 1 evidence card",
    );
    expect(aosOptionLabelOf(stateOf({ secrets: [0, 0, 0] }), label)).toBe(label);
  });

  test("the target step notes each Board Member card, and only on the secret prompts", () => {
    const state = stateOf({ secrets: [3, 1, 0] });
    const choice = (slot: string): PendingChoice =>
      ({
        prompt: { kind: "chooseTarget", slot },
        options: [0, 1, 2].map((index) => ({ optionId: `o${index}`, ref: { kind: "card", instanceId: `m${index}` } })),
      }) as unknown as PendingChoice;
    expect([...secretTargetNotesOf(state, choice("secretOn"))]).toEqual([
      ["o0", "3 secrets · FLIPS"],
      ["o1", "1 secret"],
      ["o2", "0 secrets"],
    ]);
    expect(secretTargetNotesOf(state, choice("elsewhere")).size).toBe(0);
  });

  test("a long option wraps at spaces, keeps its own line breaks and never cuts a word", () => {
    expect(wrapOptionLabel("one two three four", 9)).toBe("one two\nthree\nfour");
    expect(wrapOptionLabel("short\nFlips a Board Member.", 40)).toBe("short\nFlips a Board Member.");
    expect(wrapOptionLabel("extraordinarily long", 5)).toBe("extraordinarily\nlong");
  });
});
