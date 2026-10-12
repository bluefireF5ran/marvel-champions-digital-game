import { describe, expect, test } from "vitest";
import { heroPackGame } from "./hero-pack-fixture.js";

describe("the hero pack fixture", () => {
  test("seats Wonder Man and Hercules with their decks", () => {
    const wm = heroPackGame("wonderMan");
    expect(wm.players[0]!.hand.length).toBeGreaterThan(0);
    const h = heroPackGame("hercules");
    expect(Object.keys(h.players[0]!.separateDecks).sort()).toEqual(["Gift", "Labor"]);
  }, 60_000);
});
