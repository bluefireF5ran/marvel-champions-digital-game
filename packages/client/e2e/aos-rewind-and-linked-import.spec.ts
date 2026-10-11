import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { activeScenes, clickText, findText, pressHookStop, settle, trackPageErrors, waitFor } from "./helpers.js";
import {
  assertNoRawText,
  clickStop,
  driveToBoard,
  installWave6Helpers,
  routeStops,
  screens,
  visibleTexts,
  waitForScene,
} from "./wave6-helpers-a.js";
import { findVisibleText, hook, openApp } from "./wave6-helpers-b.js";

/**
 * Two paths of the Agents of S.H.I.E.L.D. work that had no spec.
 *
 * 1. A real lost scenario through Rewind and the retry. A signed run is seeded after scenario 1 (the dev seed
 *    `seedAosRun`), then scenario 2 is opened from its Briefing, set up through the real Setup deal and its evidence
 *    offers, and conceded from the Pause menu. "Continue the campaign" folds the loss and lands on Rewind; Rewind's
 *    "REWIND, NEW SHUFFLE" returns to the same issue's Briefing with the case file unchanged (the evidence is kept) and
 *    the sealed A.I.M. envelope still unnamed.
 * 2. The linked-card note on a MarvelCDB import (owner decision 61B, wave 9 fixtures): a Falcon decklist with Captain
 *    America's Shield (53034, a Linked card) added to `slots` imports without it and says so by name, and the deck's
 *    count is the plain list's. The network reply is served by `page.route`; no live request.
 */

const SHIELD_NOTE =
  "Captain America's Shield has the Linked keyword, so it is not part of a deck: it was left out. The card that names it brings it into the game.";

/** Names of the three cards sealed in the A.I.M. envelope, read from the stored run (the test may; the screens may not). */
const sealedNames = (page: Page, runId: string): Promise<string[]> =>
  page.evaluate(async (id) => {
    const pool = (await import("/src/content/pool.ts")) as { CARDS_BY_ID: Map<string, { name: string }> };
    const service = (
      window as unknown as { __mcCampaign: { service: { storage: { load(id: string): Promise<any> } } } }
    ).__mcCampaign.service;
    const record = await service.storage.load(id);
    const cardIds: string[] = record.hidden.aimEnvelope.cardIds;
    return cardIds.map((card) => pool.CARDS_BY_ID.get(card)?.name ?? card);
  }, runId);

/** The Board's Pause menu, opened with the real MENU button; a press that lands mid-transition is pressed again. */
async function openPause(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 10 && !(await screens(page)).includes("PauseOverlay"); attempt++) {
    await clickText(page, "MENU", { sceneKey: "Board" }).catch(() => undefined);
    await page.waitForTimeout(1200);
  }
  await waitForScene(page, "PauseOverlay");
}

test("a conceded scenario 2 goes through Rewind and back to the same Briefing with the evidence kept", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = trackPageErrors(page);
  await installWave6Helpers(page);
  await page.goto("/?unlock=all");
  await waitForScene(page, "Title");
  const runId = await page.evaluate(async () => {
    const fixtures = (await import("/src/campaign/dev-fixtures.ts")) as {
      seedAosRun(service: unknown, stop: string): Promise<{ id: string }>;
    };
    const service = (window as unknown as { __mcCampaign: { service: unknown } }).__mcCampaign.service;
    return (await fixtures.seedAosRun(service, "afterIssue1")).id;
  });
  await page.evaluate((id) => {
    const game = (window as unknown as { __mcGame: any }).__mcGame;
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
    game.scene.start("CampaignBriefing", { runId: id });
  }, runId);
  await waitForScene(page, "CampaignBriefing");
  await settle(page);
  await expect
    .poll(async () => (await findText(page, "EVIDENCE · 1 GAINED", "CampaignBriefing")).length)
    .toBeGreaterThan(0);
  expect((await findText(page, "BRIEFING · ISSUE #2", "CampaignBriefing")).length).toBeGreaterThan(0);

  // Scenario 2 for real: Setup deal, the evidence offers (first legal option each), the Board.
  await clickStop(page, "open", "CampaignBriefing");
  await driveToBoard(page, { timeoutMs: 120_000 });

  // Concede from the Pause menu: the loss, folded by "Continue the campaign".
  await openPause(page);
  await expect
    .poll(
      async () => {
        const keys = (await routeStops(page, "PauseOverlay"))?.stops.map((stop) => stop.key) ?? [];
        if (!keys.includes("concede-confirm-yes"))
          await clickStop(page, "concede", "PauseOverlay").catch(() => undefined);
        return keys.includes("concede-confirm-yes");
      },
      { timeout: 30_000, intervals: [1000] },
    )
    .toBe(true);
  await clickStop(page, "concede-confirm-yes", "PauseOverlay");
  await waitForScene(page, "GameOver", 30_000);
  await settle(page);
  await clickText(page, "Continue the campaign", { sceneKey: "GameOver" });

  // Rewind: the taunt, what was kept, and the three ways forward; nothing from the sealed envelope.
  await waitForScene(page, "CampaignRewind", 30_000);
  await settle(page);
  expect((await findText(page, "Rewind", "CampaignRewind")).length).toBeGreaterThan(0);
  expect((await findText(page, "Everything from issue #1.", "CampaignRewind")).length).toBeGreaterThan(0);
  const keys = (await routeStops(page, "CampaignRewind"))?.stops.map((stop) => stop.key) ?? [];
  expect(keys).toEqual(expect.arrayContaining(["rewind", "same-hands", "edit-decks", "shelve"]));
  await assertNoRawText(page, "Rewind");
  for (const name of await sealedNames(page, runId)) {
    expect((await findText(page, name, "CampaignRewind")).length, `${name} stays sealed`).toBe(0);
  }

  // Retry: the same issue's Briefing, the case file as it was, Open issue live.
  await clickStop(page, "rewind", "CampaignRewind");
  await waitForScene(page, "CampaignBriefing", 30_000);
  await settle(page);
  expect((await findText(page, "BRIEFING · ISSUE #2", "CampaignBriefing")).length).toBeGreaterThan(0);
  expect((await findText(page, "EVIDENCE · 1 GAINED", "CampaignBriefing")).length).toBeGreaterThan(0);
  expect((await findText(page, "18 of 27 combinations still open", "CampaignBriefing")).length).toBeGreaterThan(0);
  expect((await routeStops(page, "CampaignBriefing"))?.stops.map((stop) => stop.key)).toContain("open");
  for (const name of await sealedNames(page, runId)) {
    expect(
      (await visibleTexts(page)).some((t) => t.text.includes(name)),
      `${name} stays sealed`,
    ).toBe(false);
  }
  expect(errors).toEqual([]);
});

const FALCON_LIST = fileURLToPath(
  new URL("../../cards/src/wave9/fixtures/decklists/falcon-leadership.json", import.meta.url),
);

interface DeckRow {
  readonly name: string;
  readonly source: string;
  readonly status: string;
  readonly legal: boolean;
  readonly cardCount: number;
}
const imported = async (page: Page): Promise<DeckRow[]> =>
  ((await hook<DeckRow[]>(page, "__mcDecksDebug", "decks")) ?? []).filter((d) => d.source === "imported");
const statusLine = (page: Page) => hook<{ text: string; tone: string }>(page, "__mcDecksDebug", "status");

async function importWith(page: Page, body: string): Promise<void> {
  await page.unroute("**/api/marvelcdb-import/decklist/51319");
  await page.route("**/api/marvelcdb-import/decklist/51319", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body }),
  );
  const keys = async (): Promise<string[]> =>
    ((await hook<{ key: string }[]>(page, "__mcDecksDebug", "stops")) ?? []).map((s) => s.key);
  if (!(await keys()).includes("marvelcdb-field")) {
    await pressHookStop(page, "__mcDecksDebug", "ie-marvelcdb-toggle");
    await settle(page);
  }
  await pressHookStop(page, "__mcDecksDebug", "marvelcdb-field");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("https://marvelcdb.com/decklist/view/51319");
  await settle(page);
  const before = (await imported(page)).length;
  await pressHookStop(page, "__mcDecksDebug", "marvelcdb-import");
  await waitFor(async () => ((await imported(page)).length > before ? true : null), "the deck is imported", 15000);
  await settle(page);
}

test("a Falcon decklist with a Linked card in its slots imports without it and names it", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackPageErrors(page);
  await openApp(page, "unlock=all");
  await clickText(page, "Decks");
  await waitFor(async () => ((await activeScenes(page)).includes("Decks") ? true : null), "Decks opens", 8000);
  await settle(page);

  const list = JSON.parse(readFileSync(FALCON_LIST, "utf8")) as { slots: Record<string, number> };
  const plainTotal = Object.values(list.slots).reduce((sum, n) => sum + n, 0);

  // The plain list: legal, no note.
  await importWith(page, JSON.stringify(list));
  expect((await statusLine(page))?.tone).toBe("success");
  expect((await statusLine(page))?.text).not.toContain("Linked");
  const [plain] = await imported(page);
  expect(plain).toMatchObject({ status: "Legal", legal: true, cardCount: plainTotal });

  // The same list with Captain America's Shield (53034) in slots: imported without it, and the note names it.
  await importWith(page, JSON.stringify({ ...list, slots: { ...list.slots, "53034": 1 } }));
  const status = await statusLine(page);
  expect(status?.tone).toBe("success");
  expect(status?.text).toContain(SHIELD_NOTE);
  expect(await findVisibleText(page, "Captain America's Shield", "Decks"), "the note is on screen").not.toHaveLength(0);
  const withShield = (await imported(page)).find((d) => d.name !== plain!.name);
  expect(withShield, "the second import is its own deck").toBeDefined();
  expect(withShield).toMatchObject({ status: "Legal", legal: true });
  expect(withShield!.cardCount, "the Shield is not counted").toBe(plainTotal);
  expect(errors).toEqual([]);
});
