import { describe, expect, it } from "vitest";
import {
  validateCard,
  validateScenario,
  validateScenarioEncounterSets,
  validateScenarioMainSchemeStages,
} from "../schema/index.js";
import { CORE_ENCOUNTER_SETS } from "./core/index.js";
import {
  CAMPAIGNS,
  CORE_CARDS,
  CW_CARDS,
  CW_SCENARIOS,
  CW_STARTER_DECKS,
  PLAYABLE_CARDS,
  WAVE9_CARDS,
  WAVE10_CARDS,
  WAVE10_ENCOUNTER_SETS,
  WAVE10_SCENARIOS,
  WAVE10_STARTER_DECKS,
} from "./index.js";

/**
 * Wave 10 (cycle 10, docs/phase7-wave10.md): pool wiring. `cw` (Civil War, MC56) is the only pack in so far;
 * `hercules` and `wonder_man` (the cycle's hero packs) join later, and `wonder_man` is still in the data-only pool.
 * What the pack contains is `cw.test.ts`.
 */
describe("wave 10 data: pool wiring", () => {
  it("WAVE10_CARDS is Core plus cw, with no duplicate ids", () => {
    expect(WAVE10_CARDS).toHaveLength(CORE_CARDS.length + CW_CARDS.length);
    expect(WAVE10_CARDS.slice(0, CORE_CARDS.length)).toEqual(CORE_CARDS);
    expect(new Set(WAVE10_CARDS.map((c) => c.id)).size).toBe(WAVE10_CARDS.length);
  });

  it("PLAYABLE_CARDS carries every cw card exactly once, after the wave 9 cards", () => {
    const ids = PLAYABLE_CARDS.map((c) => c.id as string);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CW_CARDS)
      expect(
        ids.filter((id) => id === (c.id as string)),
        c.id as string,
      ).toHaveLength(1);
    const wave9Last = ids.lastIndexOf(WAVE9_CARDS[WAVE9_CARDS.length - 1]!.id as string);
    expect(ids.indexOf(CW_CARDS[0]!.id as string)).toBeGreaterThan(wave9Last);
    expect(ids.slice(ids.length - CW_CARDS.length)).toEqual(CW_CARDS.map((c) => c.id as string));
  });

  it("every wave 10 card passes validateCard()", () => {
    const failures = WAVE10_CARDS.map((c) => ({ id: c.id, errors: validateCard(c).errors })).filter(
      (f) => f.errors.length > 0,
    );
    expect(failures).toEqual([]);
  });

  it("every cw card id is its MarvelCDB code (no clash with another pack's id)", () => {
    const others = new Set(WAVE9_CARDS.map((c) => c.id as string));
    for (const c of CW_CARDS) expect(others.has(c.id as string), c.id as string).toBe(false);
  });
});

describe("wave 10 data: encounter sets, scenarios and starter decks", () => {
  it("26 encounter sets, unique, and every card's sets exist", () => {
    expect(WAVE10_ENCOUNTER_SETS).toHaveLength(26);
    const known = new Set(WAVE10_ENCOUNTER_SETS.map((s) => s.id as string));
    expect(known.size).toBe(26);
    for (const c of CW_CARDS)
      for (const id of (c as { encounterSetIds?: readonly unknown[] }).encounterSetIds ?? [])
        expect(known.has(id as string), `${c.id}: ${String(id)}`).toBe(true);
  });

  it("four scenarios, one per leader, each valid with its sets and main scheme stages resolving", () => {
    expect(WAVE10_SCENARIOS).toEqual(CW_SCENARIOS);
    expect(WAVE10_SCENARIOS.map((s) => s.id as string)).toEqual([
      "registration-iron-man",
      "registration-captain-marvel",
      "resistance-captain-america",
      "resistance-spider-woman",
    ]);
    const sets = [...CORE_ENCOUNTER_SETS, ...WAVE10_ENCOUNTER_SETS];
    for (const s of WAVE10_SCENARIOS) {
      expect(validateScenario(s).errors, s.id as string).toEqual([]);
      expect(validateScenarioEncounterSets(s, sets).errors, s.id as string).toEqual([]);
      expect(validateScenarioMainSchemeStages(s, WAVE10_CARDS, sets).errors, s.id as string).toEqual([]);
    }
  });

  it("two starter decks (Tigra and Hulkling)", () => {
    expect(WAVE10_STARTER_DECKS).toEqual(CW_STARTER_DECKS);
    expect(WAVE10_STARTER_DECKS.map((d) => d.id as string)).toEqual(["tigra-aggression", "hulkling-protection"]);
  });

  it("Civil War has no campaign (MC56 p. 3)", () => {
    expect(CAMPAIGNS.some((c) => (c.packCode as string) === "cw")).toBe(false);
  });
});
