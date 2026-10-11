/**
 * Rewind's wording follows the log, not the box: a loss that leaves the log as it was keeps each box's own line, and
 * Agents of S.H.I.E.L.D.'s standard scenario 5 defeat (MC50 p. 19: a new envelope, new evidence) says the log changed.
 */
import { describe, expect, test } from "vitest";
import { AOS_CAMPAIGN_DEFINITION } from "@mc/cards";
import { CARDS_BY_ID, POOL_CARDS, POOL_DEPS } from "../content/pool.js";
import { MemoryCampaignStorage } from "../engine/campaign-storage.js";
import { CampaignService } from "../campaign/campaign-service.js";
import { seedAosRun } from "../campaign/dev-fixtures.js";
import { rewindIntroOf, rewindViewOf } from "./campaign-rewind-model.js";

const service = () =>
  new CampaignService({
    storage: new MemoryCampaignStorage(),
    campaignDeps: { pool: Object.fromEntries(POOL_CARDS.map((card) => [card.id as string, card])) },
    engineDeps: POOL_DEPS,
  });
const issueNumberOf = (id: string) => AOS_CAMPAIGN_DEFINITION.graph.nodes.findIndex((node) => node.id === id) + 1;

describe("Rewind after an Agents of S.H.I.E.L.D. defeat", () => {
  test("a standard scenario 5 defeat re-deals the envelope and says the log changed, on either kind of box", async () => {
    const record = await seedAosRun(service(), "lostIssue5");
    const view = rewindViewOf(record, "baron-zemo", issueNumberOf, CARDS_BY_ID, AOS_CAMPAIGN_DEFINITION);
    expect(view.logChanged).toBe(true);
    expect(view.keptSummary).toMatch(/Except what this defeat changed\.$/);
    for (const pageBased of [true, false]) {
      expect(rewindIntroOf(view, pageBased)).toMatch(/^This defeat changes the log/);
      expect(rewindIntroOf(view, pageBased)).not.toMatch(/same log|picks up exactly/i);
    }
  });

  test("a scenario that restores the log exactly keeps both of the existing lines", () => {
    const view = { logChanged: false };
    expect(rewindIntroOf(view, false)).toBe(
      "Same villain, same log as when you opened it. Change decks or aspects first if you want.",
    );
    expect(rewindIntroOf(view, true)).toMatch(/^The page flips back/);
  });
});
