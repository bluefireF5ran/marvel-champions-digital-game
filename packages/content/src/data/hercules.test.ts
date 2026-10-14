import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateCard, validateStarterDeck } from "../schema/index.js";
import type { AnyCard, AttachmentCard, HeroIdentityCard, ObligationCard } from "../schema/index.js";
import { HERCULES_CARDS } from "./hercules/cards.js";
import { HERCULES_ENCOUNTER_SETS } from "./hercules/encounterSets.js";
import { HERCULES_CYCLE, HERCULES_PACK } from "./hercules/packs.js";
import { HERCULES_PROVENANCE } from "./hercules/provenance.js";
import { HERCULES_STARTER_DECKS } from "./hercules/starterDecks.js";

/**
 * Hercules (`hercules`, cycle 10, Civil War): counts, the Labor and Gift separate decks, Ancient Rivalry's Team-Up,
 * and each curation correction with its citation (`scripts/marvelcdb/curation/hercules.ts`). Sources: the Hercules
 * insert, RRG 1.8 p. 65 (FAQ "Labor Cards"), docs/phase7-wave10-hero-packs.md H1 and docs/phase7-wave10-scan-check.md.
 */
interface RawRecord {
  readonly code: string;
  readonly quantity: number;
}
const raw = JSON.parse(readFileSync(new URL("../../raw/marvelcdb/hercules.json", import.meta.url), "utf8")) as {
  cards: readonly RawRecord[];
};

const byId = new Map(HERCULES_CARDS.map((c) => [c.id as string, c]));
const get = <T extends AnyCard>(id: string): T => {
  const card = byId.get(id);
  if (!card) throw new Error(`no card ${id}`);
  return card as T;
};
const setOf = (card: AnyCard): readonly string[] =>
  "encounterSetIds" in card ? (card.encounterSetIds as readonly string[]) : [];
const typeCounts = (cards: readonly AnyCard[]) => {
  const counts: Record<string, number> = {};
  for (const c of cards) counts[c.type] = (counts[c.type] ?? 0) + 1;
  return counts;
};
const copies = (cards: readonly AnyCard[]) => cards.reduce((n, c) => n + c.quantityInSet, 0);
const text = (card: AnyCard) => (card as { text: { printed: string; current: string } }).text;
const notes = (id: string) => HERCULES_PROVENANCE.find((p) => p.cardId === id)!.corrections.join(" | ");
const aspectOf = (card: AnyCard) => (card as { aspect?: string }).aspect;
const keywordNames = (card: AnyCard) =>
  (card as unknown as { keywords: { name: string }[] }).keywords.map((k) => k.name);

describe("hercules: the pack", () => {
  it("is in cycle 10, Civil War, released February 20, 2026", () => {
    expect(HERCULES_CYCLE).toEqual({ id: "cycle10", name: "Civil War", order: 10 });
    expect(HERCULES_PACK.releaseDate).toBe("2026-02-20");
    expect(HERCULES_PACK.cycleId as string).toBe("cycle10");
  });

  it("is 45 cards (59 copies), counted by type", () => {
    expect(HERCULES_CARDS).toHaveLength(45);
    expect(copies(HERCULES_CARDS)).toBe(59);
    expect(typeCounts(HERCULES_CARDS)).toEqual({
      hero_identity: 1,
      attachment: 3,
      obligation: 2,
      upgrade: 9,
      ally: 5,
      event: 6,
      support: 5,
      player_side_scheme: 2,
      resource: 3,
      minion: 5,
      side_scheme: 3,
      treachery: 1,
    });
  });

  it("every card is Hercules's own, passes validateCard() and carries cycle10", () => {
    for (const c of HERCULES_CARDS) {
      expect(c.setCode as string, c.id as string).toBe("hercules");
      expect(c.cycleId as string, c.id as string).toBe("cycle10");
      expect(validateCard(c).errors, c.id as string).toEqual([]);
    }
  });

  it("covers every raw record in provenance, and the copies equal the raw quantities", () => {
    const covered = new Set(HERCULES_PROVENANCE.flatMap((p) => p.marvelcdbCodes));
    for (const r of raw.cards) expect(covered.has(r.code), r.code).toBe(true);
    expect(copies(HERCULES_CARDS)).toBe(raw.cards.reduce((n, r) => n + r.quantity, 0));
  });

  it("splits by owner: 18 hero-kit copies, 13 Leadership, 13 Basic, 5 nemesis, 5 All Versus All", () => {
    expect(copies(HERCULES_CARDS.filter((c) => aspectOf(c) === "hero:59001a"))).toBe(18);
    expect(copies(HERCULES_CARDS.filter((c) => aspectOf(c) === "leadership"))).toBe(13);
    expect(copies(HERCULES_CARDS.filter((c) => aspectOf(c) === "basic"))).toBe(13);
    expect(copies(HERCULES_CARDS.filter((c) => setOf(c).includes("hercules_nemesis")))).toBe(5);
    expect(copies(HERCULES_CARDS.filter((c) => setOf(c).includes("all_versus_all")))).toBe(5);
  });

  it("has two encounter sets: the nemesis set on Hercules and the modular All Versus All, and no Labor set", () => {
    expect(HERCULES_ENCOUNTER_SETS.map((s) => s.id as string)).toEqual(["all_versus_all", "hercules_nemesis"]);
    expect(HERCULES_ENCOUNTER_SETS.find((s) => (s.id as string) === "hercules_nemesis")?.nemesisOfIdentityId).toBe(
      "59001a",
    );
    expect(HERCULES_CARDS.filter((c) => setOf(c).includes("hercules_nemesis")).map((c) => c.id as string)).toEqual([
      "59036",
      "59037",
      "59038",
      "59039",
      "59040",
    ]);
    expect(HERCULES_CARDS.filter((c) => setOf(c).includes("all_versus_all")).map((c) => c.id as string)).toEqual([
      "59041",
      "59042",
      "59043",
      "59044",
      "59045",
    ]);
  });

  it("has one starter deck, Hercules / Leadership: 40 cards (15 hero, 13 Leadership, 12 basic), the printed list, legal", () => {
    expect(
      HERCULES_STARTER_DECKS.map((d) => [d.id as string, d.packCode as string, d.identityCardId as string]),
    ).toEqual([["hercules-leadership", "hercules", "59001a"]]);
    const deck = HERCULES_STARTER_DECKS[0]!;
    expect(deck.aspects).toEqual(["leadership"]);
    expect(deck.provenance.verified).toBe(true);
    expect(validateStarterDeck(deck).errors).toEqual([]);
    expect(deck.cards.reduce((n, e) => n + e.quantity, 0)).toBe(40);
    const split = { hero: 0, aspect: 0, basic: 0 };
    for (const e of deck.cards) {
      const card = get(e.cardId as string);
      expect(e.quantity, e.cardId as string).toBeLessThanOrEqual(card.quantityInSet);
      const a = aspectOf(card);
      split[a === "basic" ? "basic" : a?.startsWith("hero") ? "hero" : "aspect"] += e.quantity;
    }
    expect(split).toEqual({ hero: 15, aspect: 13, basic: 12 });
    // The Labor and Gift decks (59002-59007), the obligation and the nemesis set are not in the 40.
    const ids = new Set(deck.cards.map((e) => e.cardId as string));
    for (const code of ["59002", "59003", "59004", "59005", "59006", "59007", "59035", "59036", "59040"])
      expect(ids.has(code), code).toBe(false);
  });
});

describe("hercules: the Labor and Gift separate decks (spec H1.1)", () => {
  const identity = get<HeroIdentityCard>("59001a");

  it("the identity lists two decks, each facedown, with no discard pile, staying empty", () => {
    expect(identity.separateDecks).toEqual([
      {
        name: "Labor",
        cards: [
          { cardId: "59002", quantity: 1 },
          { cardId: "59003", quantity: 1 },
          { cardId: "59004", quantity: 1 },
        ],
        topCardFaceup: false,
        discardPile: "none",
        whenEmpty: "stayEmpty",
        cardFamily: "encounter",
      },
      {
        name: "Gift",
        cards: [
          { cardId: "59005", quantity: 1 },
          { cardId: "59006", quantity: 1 },
          { cardId: "59007", quantity: 1 },
        ],
        topCardFaceup: false,
        discardPile: "none",
        whenEmpty: "stayEmpty",
        cardFamily: "player",
      },
    ]);
  });

  it("the Labor cards are encounter cards of no encounter set, tagged separateDeck Labor, trait Labor, Victory 0", () => {
    for (const id of ["59002", "59003", "59004"]) {
      const card = get<AttachmentCard | ObligationCard>(id);
      expect(card.separateDeck, id).toBe("Labor");
      expect(card.encounterSetIds, id).toEqual([]);
      expect(card.traits as readonly string[], id).toEqual(["LABOR"]);
      expect(card.keywords, id).toContainEqual({ name: "victory", value: 0 });
      expect(card.quantityInSet, id).toBe(1);
    }
    expect(get("59002").type).toBe("attachment");
    expect(get("59003").type).toBe("attachment");
    expect(get("59004").type).toBe("obligation");
  });

  it("59004 Protect Humanity uses 3 labor counters and is not Hercules's obligation (59035 is)", () => {
    expect(get<ObligationCard>("59004").keywords).toContainEqual({ name: "uses", count: 3, counterType: "labor" });
    expect(identity.obligationCardId as string).toBe("59035");
    expect(identity.nemesisEncounterSetId as string).toBe("hercules_nemesis");
    // Exactly the three Labor cards carry separateDeck "Labor"; the obligation 59035 is in no encounter set.
    expect(HERCULES_CARDS.filter((c) => (c as { separateDeck?: string }).separateDeck === "Labor")).toHaveLength(3);
    expect(setOf(get("59035"))).toEqual([]);
  });

  it("59002 and 59003 print no Attach to line: no attachesTo, their own When Revealed attaches them", () => {
    for (const id of ["59002", "59003"]) {
      expect(get<AttachmentCard>(id).attachesTo, id).toBeUndefined();
      expect(text(get(id)).printed, id).not.toMatch(/^Attach to/m);
      expect(notes(id), id).toContain('RRG 1.8 "Reveal" (p. 38)');
      expect(notes(id), id).toContain("Never applied to text");
    }
  });

  it("the Gift cards are Permanent player upgrades: dash cost, deckLimit 0, separateDeck Gift, hero aspect", () => {
    for (const id of ["59005", "59006", "59007"]) {
      const card = get(id) as AnyCard & { specialCost?: string; deckLimit: number; separateDeck?: string };
      expect(card.type, id).toBe("upgrade");
      expect(card.specialCost, id).toBe("dash");
      expect(card.deckLimit, id).toBe(0);
      expect(card.separateDeck, id).toBe("Gift");
      expect(aspectOf(card), id).toBe("hero:59001a");
      expect((card as unknown as { traits: string[] }).traits, id).toContain("GIFT");
      expect(keywordNames(card)[0], id).toBe("permanent");
    }
    expect(keywordNames(get("59007"))).toEqual(["permanent", "restricted"]);
  });
});

describe("hercules: Ancient Rivalry 59026 is a Team-Up (Hercules and Thor), Max 1 per deck", () => {
  it("carries the teamUp keyword and deckLimit 1 while two copies are printed", () => {
    const rivalry = get("59026") as AnyCard & { keywords: unknown[]; deckLimit: number };
    expect(rivalry.keywords).toContainEqual({ name: "teamUp", names: ["Hercules", "Thor"] });
    expect(rivalry.deckLimit).toBe(1);
    expect(rivalry.quantityInSet).toBe(2);
    expect(aspectOf(rivalry)).toBe("basic");
  });
});

describe("hercules: curation corrections (each cites its evidence in scripts/marvelcdb/curation/hercules.ts)", () => {
  it("59021 Teamwork: the colon the cache dropped is back, cited to 06032's scan", () => {
    const teamwork = get("59021");
    expect(text(teamwork).printed).toContain("Hero Interrupt: When you use your basic thwart power");
    expect(text(teamwork).current).toBe(text(teamwork).printed);
    expect(JSON.stringify(text(teamwork))).not.toContain("Hero Interrupt When");
    expect(notes("59021")).toContain("Scan 06032.png");
  });

  it("59042 Hecate: 'When Revealed/Defeated' is one printed ability with two timings, so it has a ref for each and the text is unchanged", () => {
    const hecate = get("59042");
    const ids = ((hecate as unknown as { abilities: { id: string }[] }).abilities ?? []).map((a) => a.id);
    expect(ids).toEqual(["59042.when-revealed", "59042.when-defeated", "59042.hecate-forced-response"]);
    expect(text(hecate).printed).toContain(
      "When Revealed/Defeated: Find the All Versus All side scheme and reveal it.",
    );
    expect(text(hecate).current).toBe(text(hecate).printed);
  });

  it("no Hercules card has errata", () => {
    expect(HERCULES_CARDS.filter((c) => c.errata !== undefined)).toEqual([]);
  });

  it("the only dash costs are the three Gift upgrades", () => {
    expect(
      HERCULES_CARDS.filter((c) => (c as { specialCost?: string }).specialCost === "dash").map((c) => c.id as string),
    ).toEqual(["59005", "59006", "59007"]);
  });
});
