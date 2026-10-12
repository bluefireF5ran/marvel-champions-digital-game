import { describe, expect, test } from "vitest";
import type { LegalActions, PendingChoice } from "@mc/engine";
import { highlights } from "./highlights.js";

const choice = (extra: Partial<PendingChoice>): LegalActions =>
  ({
    kind: "choice",
    choice: {
      choiceId: "c1",
      playerId: "p1",
      prompt: { kind: "chooseTarget" },
      minSelections: 1,
      maxSelections: 1,
      options: [],
      frameId: null,
      ordered: false,
      soleDecider: false,
      authority: "player",
      ...extra,
    },
  }) as unknown as LegalActions;

describe("highlights: authority", () => {
  test("an enemy-team choice carries who it is aimed at", () => {
    const open = highlights(
      choice({
        authority: "enemyTeam",
        onBehalfOf: { kind: "enemyTeam", teamId: "t1" as never, facingPlayerId: "p2" as never },
      }),
    ).openChoice;
    expect(open?.authority).toBe("enemyTeam");
    expect(open?.facingPlayerId).toBe("p2");
  });

  test("ordinary and first-player choices are unchanged", () => {
    for (const authority of ["player", "firstPlayerTargets"] as const) {
      const open = highlights(choice({ authority })).openChoice;
      expect(open?.authority).toBe(authority);
      expect(open && "facingPlayerId" in open).toBe(false);
    }
  });
});
