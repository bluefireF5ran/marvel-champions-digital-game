/**
 * Agents of S.H.I.E.L.D. from the client's side: the dev seed leaves the log where it says, and the Briefing's case file
 * (`view/campaign-shield-model.ts`) reads it without ever touching the sealed A.I.M. envelope.
 */
import { describe, expect, test } from "vitest";
import { AOS_CAMPAIGN_DEFINITION } from "@mc/cards";
import { cardId } from "@mc/content";
import { CARDS_BY_ID, POOL_CARDS, POOL_DEPS } from "../content/pool.js";
import { MemoryCampaignStorage } from "../engine/campaign-storage.js";
import { CampaignService } from "./campaign-service.js";
import { seedAosRun } from "./dev-fixtures.js";
import { campaignRunModel, deltaWords } from "../view/campaign-run-model.js";
import { shieldBriefingOf } from "../view/campaign-shield-model.js";
import { campaignDossierOverview } from "../view/campaign-dossier-model.js";

const service = () =>
  new CampaignService({
    storage: new MemoryCampaignStorage(),
    campaignDeps: { pool: Object.fromEntries(POOL_CARDS.map((card) => [card.id as string, card])) },
    engineDeps: POOL_DEPS,
  });
const nameOf = (id: string): string => CARDS_BY_ID.get(id)?.name ?? id;

describe("an Agents of S.H.I.E.L.D. run seeded for the client", () => {
  test("after issue 1 the board is recorded, the clean member gained one evidence card, and the case file shows it", async () => {
    const record = await seedAosRun(service(), "afterIssue1");
    expect(record.shared.secrets1?.kind).toBe("cardState");
    expect(record.shared.evidence).toMatchObject({ kind: "cardList" });
    const gained = (record.shared.evidence as { cardIds: readonly string[] }).cardIds;
    expect(gained).toHaveLength(1);

    const brief = shieldBriefingOf(record, AOS_CAMPAIGN_DEFINITION, (id) => nameOf(id as string))!;
    expect(brief.evidence.map((card) => card.cardId as string)).toEqual(gained);
    expect(brief.boardAfter).toBe(1);
    expect(brief.board.map((member) => member.secrets)).toEqual([0, 3, 2]);
    // One evidence card crosses out the 9 combinations that include it.
    expect(brief.rowsTotal).toBe(27);
    expect(brief.rowsOpen).toBe(18);
    expect(brief.seats).toEqual([]);
  });

  test("the case file never reads the sealed A.I.M. envelope: none of its cards is named anywhere in it", async () => {
    const record = await seedAosRun(service(), "afterIssue3");
    const sealed = (record.hidden.aimEnvelope as { cardIds: readonly string[] }).cardIds;
    expect(sealed).toHaveLength(3);
    const brief = shieldBriefingOf(record, AOS_CAMPAIGN_DEFINITION, (id) => nameOf(id as string))!;
    const gained = new Set((record.shared.evidence as { cardIds: readonly string[] }).cardIds);
    const text = JSON.stringify(brief);
    for (const id of sealed) {
      // Only a card the players also hold (never the case: a gain draws from outside the envelope) could appear.
      expect(gained.has(id)).toBe(false);
      expect(text).not.toContain(id);
      expect(text).not.toContain(nameOf(id));
    }
    expect(brief.sealedCount).toBe(3);
  });

  test("an expert campaign shows each seat's hit points, and a member flipped in the log reads as an attachment", async () => {
    const record = await seedAosRun(service(), "afterIssue3", { expertCampaign: true, flipped: true });
    const brief = shieldBriefingOf(record, AOS_CAMPAIGN_DEFINITION, (id) => nameOf(id as string))!;
    expect(brief.seats.map((seat) => seat.heroName)).toEqual(["Maria Hill", "Nick Fury"]);
    expect(brief.seats[0]!.status).toMatch(/hit points?$/);
    expect(brief.seats[0]!.status).not.toBe("Full hit points");
    expect(brief.seats[1]!.sitsOut).toBe(false);
    expect(brief.boardAfter).toBe(3);
    expect(brief.board.find((member) => member.attachment)).toMatchObject({
      cardId: cardId("50183b"),
      secrets: 4,
    });
    expect(brief.flipNote).toContain("3 secrets (expert)");
  });

  test("a carried number is listed only until the scenario that reads it has been played", async () => {
    const record = await seedAosRun(service(), "afterIssue3");
    const keys = (upcoming?: number): string[] =>
      shieldBriefingOf(record, AOS_CAMPAIGN_DEFINITION, (id) => nameOf(id as string), upcoming)!.numbers.map(
        (row) => row.key,
      );
    const all = keys();
    // Before scenario 4: Alert Level (read in #2) and Rescued Captives (read in #3) are spent.
    expect(all).toContain("alert");
    expect(all).toContain("captives");
    expect(keys(2)).toContain("alert");
    expect(keys(3)).not.toContain("alert");
    expect(keys(3)).toContain("captives");
    expect(keys(4)).not.toContain("alert");
    expect(keys(4)).not.toContain("captives");
    expect(keys(5)).toEqual(all.filter((key) => key !== "alert" && key !== "captives"));
  });

  test("remaining hit points read as what is left, never as a signed gain", async () => {
    expect(deltaWords("remainingHp", 6)).toBe("6 HP left");
    expect(deltaWords("units", 3)).toBe("+3 units");
    const record = await seedAosRun(service(), "afterIssue3", { expertCampaign: true });
    const model = campaignRunModel(record, AOS_CAMPAIGN_DEFINITION, undefined, nameOf);
    const lines = model.issues.map((issue) => issue.resultLine ?? "");
    expect(lines.some((line) => line.includes("HP left"))).toBe(true);
    for (const line of lines) expect(line).not.toMatch(/\+\d+ HP/);
  });

  test("a standard campaign's case file has no seats and words the 4-secret flip", async () => {
    const record = await seedAosRun(service(), "afterIssue2");
    const brief = shieldBriefingOf(record, AOS_CAMPAIGN_DEFINITION, (id) => nameOf(id as string))!;
    expect(brief.seats).toEqual([]);
    expect(brief.flipNote).toBe("A Board Member flips at 4 secrets and stays flipped.");
  });

  test("a box without the evidence log has no case file", () => {
    expect(shieldBriefingOf({ shared: {}, seats: [], modes: {} }, { logFields: [] }, (id) => String(id))).toBeNull();
  });

  test("the Dossier's World lists the evidence and the carried numbers, never the sealed envelope or four rows of dashes", async () => {
    const record = await seedAosRun(service(), "afterIssue2");
    const sealed = (record.hidden.aimEnvelope as { cardIds: readonly string[] }).cardIds;
    const overview = campaignDossierOverview(
      record,
      AOS_CAMPAIGN_DEFINITION,
      (id) => nameOf(id),
      (id) => nameOf(id as string),
    );
    const ids = overview.world.map((row) => row.id);
    expect(ids).toContain("evidence");
    expect(ids).toContain("rescuedCaptives");
    expect(ids).not.toContain("aimEnvelope");
    expect(ids.filter((id) => id.startsWith("secrets"))).toEqual([]);
    const text = JSON.stringify(overview);
    for (const id of sealed) {
      expect(text).not.toContain(id);
      expect(text).not.toContain(nameOf(id));
    }
  });
});
