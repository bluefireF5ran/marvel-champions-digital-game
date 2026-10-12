import { WAVE10_STARTER_DECKS } from "@mc/content";
import { describe, expect, it } from "vitest";
import { wave10StarterDeckSetup } from "./setup.js";

/** The wave 10 starter deck seats at the scaffold; the Civil War scenario builders come with docs/phase7-wave10.md section 8.2 task 3. */
describe("wave10StarterDeckSetup", () => {
  it.each([
    ["tigra-aggression", "56001a"],
    ["hulkling-protection", "56029a"],
  ])("%s expands to its 40 cards under its identity", (id, identity) => {
    const seat = wave10StarterDeckSetup(id);
    expect(seat.identityCardId).toBe(identity);
    const listed = WAVE10_STARTER_DECKS.find((d) => d.id === id)!;
    expect(seat.deck).toHaveLength(listed.cards.reduce((sum, c) => sum + c.quantity, 0));
    expect(seat.deck).toHaveLength(40);
  });

  it("seats a Core starter deck too, and refuses an unknown id", () => {
    expect(wave10StarterDeckSetup("core-spider-man-justice").identityCardId).toBe("01001a");
    expect(() => wave10StarterDeckSetup("nope")).toThrow(/no wave 10 or Core starter deck nope/);
  });
});
