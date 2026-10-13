import { expect, test, type Page } from "@playwright/test";
import {
  activeScenes,
  clickFocus,
  clickHandCard,
  clickText,
  guideStepId,
  handInstanceFor,
  settle,
  trackPageErrors,
  waitFor,
} from "./helpers.js";
import {
  answerChoice,
  clickBoxPageRow,
  findVisibleText,
  openApp,
  openBoxPage,
  useIdentityAbility,
} from "./wave6-helpers-b.js";

/**
 * The wave 10 Try-it lessons (guided mode §3.14), played from How to play → New in Civil War: Wonder Man's "Ionic
 * Physiology" lesson to its completion panel, and Hercules's "Labor and Gift" lesson through the Labor, the flip and
 * the thwart that needs it. Every lesson's full playthrough is Vitest's job (`guide/mechanic-lessons.test.ts`); this
 * proves the Civil War page launches the lessons and that the board's own controls (the payment bar, the decision
 * sheets, the identity's Inspect action) carry a player through them.
 */

const on = async (page: Page, key: string): Promise<boolean> => (await activeScenes(page)).includes(key);
const stepIs = (page: Page, id: string) => async (): Promise<true | null> =>
  (await guideStepId(page)) === id ? true : null;

async function openLesson(page: Page, lessonId: string, firstStep: string): Promise<void> {
  await openApp(page);
  await clickText(page, "How to play");
  await waitFor(async () => ((await on(page, "HowToPlay")) ? true : null), "How to play opens", 8000);
  await settle(page);
  await openBoxPage(page, "New in Civil War");
  await clickBoxPageRow(page, lessonId);
  await waitFor(async () => ((await on(page, "Board")) ? true : null), "the lesson's Board", 20000);
  await waitFor(stepIs(page, "intro"), "the intro step", 20000);
  await settle(page);
  await clickText(page, "Got it", { sceneKey: "Board" });
  await waitFor(stepIs(page, firstStep), `the ${firstStep} step`, 8000);
}

/** Opens the payment bar for the hand card `code`, taps `payers` (hand card codes) one by one, then presses Pay. */
async function playWith(page: Page, code: string, payers: readonly string[]): Promise<void> {
  await clickHandCard(page, code);
  await settle(page);
  for (const payer of payers) {
    const id = await handInstanceFor(page, payer);
    if (!id) throw new Error(`payer ${payer} is not in hand`);
    await clickFocus(page, `card:${id}`);
    await settle(page);
  }
  await clickFocus(page, "payment:pay");
  await settle(page);
}

test("Wonder Man: Ionic Physiology plays from the Civil War page to its completion panel", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackPageErrors(page);
  await openLesson(page, "wonderMan", "flip");

  await clickFocus(page, "basic:changeForm");
  await waitFor(stepIs(page, "starstruck"), "the Starstruck step", 8000);
  await settle(page);
  await playWith(page, "58005", ["58023"]); // Starstruck, overpaid with Energy
  await answerChoice(page, 0); // the enemy to hit: Rhino
  await waitFor(stepIs(page, "tuck"), "the tuck step", 10000);
  await answerChoice(page, 0); // Ionic Physiology's Response
  await waitFor(stepIs(page, "attack"), "the attack step", 10000);
  await settle(page);

  await clickFocus(page, "basic:attack");
  await settle(page);
  if (await on(page, "ChoiceOverlay")) await answerChoice(page, 0);
  await waitFor(stepIs(page, "result"), "the result step", 15000);
  await settle(page);
  await clickText(page, "Got it", { sceneKey: "Board" });
  await waitFor(
    async () => ((await findVisibleText(page, "Try it complete", "Board")).length > 0 ? true : null),
    "the completion panel",
    8000,
  );
  expect(errors).toEqual([]);
});

test("Hercules: Labor and Gift reveals Embody Pathos on Bomb Scare and reaches the thwart that finishes it", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = trackPageErrors(page);
  await openLesson(page, "hercules", "new-labors");

  await useIdentityAbility(page, "New Labors of Hercules");
  await answerChoice(page, 1); // the side scheme to attach to: Bomb Scare (second in the list)
  await waitFor(stepIs(page, "flip"), "the flip step", 10000);
  await settle(page);
  await clickFocus(page, "basic:changeForm");
  await waitFor(stepIs(page, "finish-labor"), "the finish-labor step", 8000);
  expect(errors).toEqual([]);
});
