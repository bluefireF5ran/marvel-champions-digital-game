import { describe, expect, test } from "vitest";
import { activeKeywordTag, inactiveKeywordNote, stripKeepsStats, tagCapacity } from "./keyword-tags.js";

describe("the keyword tag under a tile's art", () => {
  const capacity = tagCapacity(74);

  test("a tag that fits is the full list on one row", () => {
    expect(activeKeywordTag(["guard"], [], capacity)).toBe("guard");
    expect(activeKeywordTag(["guard", "retaliate 1"], [], 40)).toBe("guard · retaliate 1");
  });

  test("a list that does not fit keeps the first tag and counts the rest: never wrapped, never cut mid-word", () => {
    expect(activeKeywordTag(["guard", "handspring"], [], capacity)).toBe("guard +1");
    expect(activeKeywordTag(["guard", "handspring", "retaliate 1"], [], capacity)).toBe("guard +2");
  });

  test("one long tag stays whole: the scene steps the type down, not the word", () => {
    expect(activeKeywordTag(["villainous"], [], 4)).toBe("villainous");
  });

  test("a keyword that is off is left out of the tag and said in words instead", () => {
    expect(activeKeywordTag(["guard", "handspring"], ["guard"], capacity)).toBe("handspring");
    expect(activeKeywordTag(["guard"], ["guard"], capacity)).toBeNull();
    expect(inactiveKeywordNote(["guard"])).toBe("guard off");
    expect(inactiveKeywordNote([])).toBeNull();
    expect(activeKeywordTag([], [], capacity)).toBeNull();
  });

  test("an optional strip is left off when it would squeeze the stat badges, and taken when the tile is tall", () => {
    // A minion tile beside the villain at 1440x900 (~74 x 108 inside the frame) has room for one strip, not two.
    expect(stripKeepsStats(108, 74, 0, 18, 2, true)).toBe(true);
    expect(stripKeepsStats(108, 74, 18, 18, 2, true)).toBe(false);
    // A tall tile takes both.
    expect(stripKeepsStats(160, 74, 18, 18, 2, true)).toBe(true);
    // No stats to protect.
    expect(stripKeepsStats(60, 74, 18, 18, 0, false)).toBe(true);
  });
});
