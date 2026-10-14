import { describe, expect, test } from "vitest";
import { POOL_CARDS, CARDS_BY_ID } from "../content/pool.js";
import { HOW_THIS_WORKS_IDS, baseCardId, howThisWorksFor } from "./how-this-works.js";
import { cardInspectModel } from "./inspect-model.js";

describe("how this works notes", () => {
  test("every note belongs to a card in the pool", () => {
    const poolBases = new Set(POOL_CARDS.map((card) => baseCardId(card.id as string)));
    // The Labor deck's cards (59002 to 59004) are separate-deck cards, which POOL_CARDS does not hold yet.
    for (const id of HOW_THIS_WORKS_IDS.filter((i) => i !== "59003"))
      expect(poolBases.has(id), `${id} is not a pool card`).toBe(true);
  });

  test("every note is one short paraphrase, without dashes or British spellings", () => {
    for (const card of POOL_CARDS) {
      const text = howThisWorksFor(card);
      if (!text) continue;
      expect(text.length, `${card.id} note is too long`).toBeLessThanOrEqual(190);
      expect(text, `${card.id} note is not a sentence`).toMatch(/[.]$/);
      expect(text, `${card.id} uses a dash`).not.toMatch(/[–—]/);
      expect(text).not.toMatch(/colour|behaviour/i);
    }
  });

  test("a face letter never hides a note", () => {
    expect(baseCardId("34002a")).toBe("34002");
    expect(baseCardId("34002b")).toBe("34002");
    expect(baseCardId("32066")).toBe("32066");
    expect(howThisWorksFor(CARDS_BY_ID.get("34002a"))).toMatch(/UNLEASHED/);
  });

  test("the notes name the cards the mechanics are on", () => {
    const named = (id: string) => CARDS_BY_ID.get(id)?.name;
    expect(named("32005")).toBe("Titanium Muscles");
    expect(named("35002")).toBe("Wolverine's Claws");
    expect(named("39030")).toBe("Paparazzi");
    expect(named("39071")).toBe("Longshot");
    expect(named("32189")).toBe("Determined Defense");
    expect(named("37001a")).toBe("Gambit");
    expect(named("38002")).toBe("Touched");
    expect(named("40130")).toBe("Hope Summers");
    expect(named("44046")).toBe("Break Time");
    expect(named("44032")).toBe("The Merc with the Mouth");
    expect(named("40132")).toBe("Black Tom Cassidy");
    expect(named("40043")).toBe("Jackpot!");
    expect(named("45007")).toBe("Concussive Blast");
    expect(named("45032")).toBe("Limbo");
    expect(named("46016")).toBe("Take That!");
    expect(named("47023")).toBe("Grounded");
    expect(named("48006")).toBe("Bamf!");
    expect(named("49007")).toBe("Wrapped in Metal");
    expect(named("49019")).toBe('"You Got This!"');
    expect(named("45171a")).toBe("Mission Team");
  });

  test("the wave 8 hero and scenario cards carry notes that name the mechanic", () => {
    const note = (id: string) => howThisWorksFor(CARDS_BY_ID.get(id));
    expect(note("45001a")).toMatch(/Resource cards/);
    expect(note("46001a")).toMatch(/Frostbite/);
    expect(note("47007a")).toMatch(/different resource types/);
    expect(note("48006")).toMatch(/basic defense/);
    expect(note("49001a")).toMatch(/MAGNETIC/);
    expect(note("45081a")).toMatch(/another villain/);
    expect(note("45170a")).toMatch(/cannot thwart/);
  });

  test("the wave 9 notes sit on the cards the mechanics are on, and say what the owner decided", () => {
    const byId = new Map(POOL_CARDS.map((card) => [card.id as string, card]));
    const named = (id: string) => byId.get(id)?.name;
    expect(named("50028")).toBe("Front Organization");
    expect(named("50051")).toBe("Intelligence");
    expect(named("50171")).toBe("Reluctant Foe");
    expect(named("50173")).toBe("Divided Loyalties");
    expect(named("53003")).toBe("Bird of Prey");
    expect(named("53004")).toBe("Bird's-Eye View");
    expect(named("54014")).toBe("Firepower");
    expect(named("54017")).toBe("Aggressive Stance");
    expect(named("52031")).toBe("Hunting the Spider-Bride");
    const note = (id: string) => howThisWorksFor(byId.get(id));
    expect(note("50181a")).toMatch(/keeping its secrets, and stays one all campaign/); // Q1 and Q11, A
    expect(note("50181b")).toBe(note("50181a"));
    expect(note("50028")).toMatch(/hand or deck/); // Q20, B
    expect(note("54014")).toMatch(/one attack/i); // Q21, B
    expect(note("54017")).toMatch(/limits what you control/); // Q37, A
    expect(note("50051")).toMatch(/dealt facedown|deals its card facedown/); // Q19, B
    expect(note("53003")).toMatch(/not offered/); // Q6, A
    expect(note("50034a")).toMatch(/same attack/); // Q17, A
    expect(note("50132")).toMatch(/identity/);
    expect(note("50134")).toMatch(/identity/);
  });

  test("the wave 10 notes sit on the cards the mechanics are on, and say what the owner decided", () => {
    const byId = new Map(POOL_CARDS.map((card) => [card.id as string, card]));
    const named = (id: string) => byId.get(id)?.name;
    expect(named("56084")).toBe("Life Model Decoy");
    expect(named("56196")).toBe("Darkforce");
    expect(named("56190")).toBe("Iron Fist");
    expect(named("56008")).toBe("Tooth and Claw");
    expect(named("56007")).toBe("Hunted");
    expect(named("56002")).toBe("Moon Knight");
    expect(named("56038")).toBe("Armored Defense");
    expect(named("56016")).toBe("Coup de Grâce");
    expect(named("58002")).toBe("Ionic Physiology");
    const note = (id: string) => howThisWorksFor(byId.get(id));
    expect(note("56084")).toBe(
      "Their leader is the enemy leader. The enemy team attaches it to a minion or that leader, one per character. It is discarded when it stops an attack's damage.",
    ); // question 13, A
    expect(note("56196")).toMatch(/removes no threat.*still discarded/); // question 11, A
    expect(note("56190")).toMatch(/activates against you/);
    expect(note("56008")).toMatch(/both may hit the same enemy/); // Q16, A
    expect(note("56007")).toMatch(/attacks you first.*Then Hunted attaches and it is stunned/); // Q18, A
    expect(note("56002")).toMatch(/attacks you first.*stunned and confused/); // Q18, A
    expect(note("56038")).toMatch(/even if the damage defeated the attacker.*cancelled/);
    expect(note("56016")).toMatch(/only its When Defeated abilities/);
    expect(note("58002")).toMatch(/up to three/);
    expect(HOW_THIS_WORKS_IDS).toContain("59003"); // Embody Pathos: FAQ p. 65, owed a pool card to show on
    expect(howThisWorksFor({ id: "59003" } as never)).toMatch(/bottom of the Labor deck/);
  });

  test("a card that names competitive mode says it does not apply yet, from its own text", () => {
    const byId = new Map(POOL_CARDS.map((card) => [card.id as string, card]));
    const note = (id: string) => howThisWorksFor(byId.get(id));
    const otherwise = "Competitive mode is not in this game yet, so only the Otherwise part applies.";
    expect(note("56080")).toBe(otherwise); // Drafted
    expect(byId.get("56080")?.name).toBe("Drafted");
    const names = [...byId.values()].filter(
      (card) => "text" in card && /competitive mode/i.test(card.text.current) && !/Contents:/.test(card.text.current),
    );
    expect(names.length).toBeGreaterThan(2);
    for (const card of names) expect(howThisWorksFor(card), card.id as string).toMatch(/^Competitive mode is not in/);
  });

  test("a card with no tricky wording has no note, and no card means no note", () => {
    expect(howThisWorksFor(CARDS_BY_ID.get("01001a"))).toBeNull();
    expect(howThisWorksFor(undefined)).toBeNull();
  });

  test("Inspect's no-game sheet carries the note", () => {
    const wheel = CARDS_BY_ID.get("39026a");
    expect(wheel).toBeDefined();
    const model = cardInspectModel(wheel, "front" as never);
    expect(model.howItWorks).toMatch(/SPINNING/);
  });
});
