import { describe, expect, it } from "vitest";
import type { Correction } from "../curation/types.ts";
import type { RawCard } from "../raw-types.ts";
import type { PackCuration } from "../curation/types.ts";
import { applySetRecodes, applyTypeCorrections } from "./flatten.ts";

const raw = (code: string, type_code: RawCard["type_code"]) => ({ code, type_code }) as RawCard;
const correction = (code: string, cardType: NonNullable<Correction["cardType"]>): Correction => ({
  code,
  cardType,
  reason: "MarvelCDB types a treachery as an attachment",
  evidence: "scan",
});

describe("applyTypeCorrections (Correction.cardType)", () => {
  it("retypes only the corrected record and leaves the rest alone", () => {
    const errors: string[] = [];
    const out = applyTypeCorrections(
      [raw("40154", "attachment"), raw("40158", "treachery")],
      [correction("40154", "treachery")],
      errors,
    );
    expect(out.map((r) => r.type_code)).toEqual(["treachery", "treachery"]);
    expect(errors).toEqual([]);
  });

  it("retypes a linked face too, and returns the input untouched when nothing sets a type", () => {
    const front = { ...raw("1a", "attachment"), linked_card: raw("1b", "attachment") } as RawCard;
    const input = [front];
    expect(
      applyTypeCorrections(input, [correction("1b", "treachery")], []).map((r) => r.linked_card?.type_code),
    ).toEqual(["treachery"]);
    expect(applyTypeCorrections(input, [], [])).toBe(input);
  });

  it("reports a correction that matches MarvelCDB already", () => {
    const errors: string[] = [];
    applyTypeCorrections([raw("40154", "treachery")], [correction("40154", "treachery")], errors);
    expect(errors).toEqual(["40154: type correction to treachery matches MarvelCDB already"]);
  });
});

/** Wave 10 (`cw`): `PackCuration.setRecodes` splits Standard PvP's two printings, filed under one set by MarvelCDB. */
describe("applySetRecodes (PackCuration.setRecodes)", () => {
  const rec = (code: string, set: string, linked?: RawCard): RawCard =>
    ({
      code,
      type_code: "treachery",
      card_set_code: set,
      card_set_name: "Standard PVP",
      ...(linked ? { linked_card: linked } : {}),
    }) as RawCard;
  const curation = (codes: readonly string[]): PackCuration =>
    ({
      setRecodes: [{ codes, setCode: "pvp_a", setName: "Standard PvP (A)", reason: "r", evidence: "e" }],
    }) as unknown as PackCuration;

  it("re-files the named records and their linked faces, and leaves the rest alone", () => {
    const errors: string[] = [];
    const back = rec("2b", "standard_pvp");
    const out = applySetRecodes(
      [rec("1", "standard_pvp"), rec("2a", "standard_pvp", back), rec("3", "standard_pvp")],
      curation(["1", "2a"]),
      errors,
    );
    expect(out.map((r) => [r.code, r.card_set_code, r.card_set_name])).toEqual([
      ["1", "pvp_a", "Standard PvP (A)"],
      ["2a", "pvp_a", "Standard PvP (A)"],
      ["3", "standard_pvp", "Standard PVP"],
    ]);
    expect(out[1]?.linked_card?.card_set_code).toBe("pvp_a");
    expect(errors).toEqual([]);
  });

  it("returns the input untouched without recodes, and reports a missing code or one already in the set", () => {
    const input = [rec("1", "standard_pvp")];
    expect(applySetRecodes(input, {} as PackCuration, [])).toBe(input);
    const errors: string[] = [];
    applySetRecodes([rec("1", "pvp_a")], curation(["1", "9"]), errors);
    expect(errors).toEqual(["set recode of 1: already in set pvp_a", "set recode of 9: no such top-level record"]);
  });
});
