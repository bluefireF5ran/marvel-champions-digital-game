import { expect, test, type Page } from "@playwright/test";
import {
  clickText,
  findText,
  hasText,
  installPageHelpers,
  isSceneUp,
  pressKey,
  settle,
  trackPageErrors,
  waitForText,
} from "./helpers.js";

/**
 * God of Lies (Trickster Takeover), on `?screen=board&fixture=god-of-lies&at=ready` (a real game's first turn with the
 * hero in hero form and the Avatar one hit from falling, `store/dev-god-of-lies-game.ts`):
 *
 * - the neutral area is on the board, apart from the Avatar: Loki, God of Lies with the shared dial and his flip point,
 *   Worlds Collide with its threat and the loss it causes, the two rules cards;
 * - each Synergy environment reads its counters against its limit (0/1 for one player);
 * - Inspect on Worlds Collide words the shared threat, and a rules card opens its own sheet;
 * - defeating the Avatar shatters it: Loki's shared dial moves, a different Avatar is in play, one environment counts 1/1.
 */
type Store = {
  state: {
    game?: {
      pod: { shared: { villainDamage: number } };
      activeVillainId: string;
      instances: Record<string, { cardId: string }>;
    };
  };
  dispatch: (command: unknown) => Promise<unknown>;
  resolveChoice: (ids: string[]) => Promise<unknown>;
};

/** Runs `body` against the fixture's session store (the dev host swap leaves the app's own store stale). */
const withStore = <T>(page: Page, body: string): Promise<T> =>
  page.evaluate(async (source) => {
    const held = (window as unknown as { __mcGodOfLies?: { store: Store } }).__mcGodOfLies;
    return await new Function("store", `return (async () => {${source}})()`)(held!.store);
  }, body) as Promise<T>;

const lokiDamage = (page: Page): Promise<number> =>
  withStore(page, `return store.state.game.pod.shared.villainDamage;`);
const avatarCode = (page: Page): Promise<string> =>
  withStore(page, `const g = store.state.game; return g.instances[g.activeVillainId].cardId;`);

const settleChoices = (page: Page): Promise<void> =>
  withStore(
    page,
    `for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 100)); const l = store.state.legal?.actions; if (l?.kind === "choice") await store.resolveChoice(l.choice.options.slice(0, l.choice.minSelections).map((o) => o.optionId)); else if (l?.kind === "turn" && i > 5) return; }`,
  );

test.describe("God of Lies", () => {
  test("the neutral area, the Synergy counters, Inspect, and the shatter moving Loki's dial", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackPageErrors(page);
    await installPageHelpers(page);
    await page.goto("/?screen=board&fixture=god-of-lies&at=ready");
    await waitForText(page, "neutral area", { sceneKey: "Board", timeoutMs: 90_000 });
    await settle(page);

    // The neutral area apart from the Avatar: Loki's shared dial and flip point, Worlds Collide's threat and loss.
    for (const text of [
      "Loki, God of Lies",
      "Worlds Collide",
      "/20",
      "Flips at 10 left",
      "0 / 2 threat",
      "Lose at 2 threat",
      "Shatter the Illusion",
      "Epic Multiplayer",
    ])
      expect(await hasText(page, text, "Board"), text).toBe(true);
    // The Avatar is a different card in the villain slot, marked with its shatter counters.
    expect(await hasText(page, "2 shatter counters", "Board")).toBe(true);

    // Every Synergy environment shows its counter against the limit, in words as well as a number.
    expect((await findText(page, "0/1", "Board")).length).toBeGreaterThanOrEqual(4);
    expect((await findText(page, "synergy", "Board")).length).toBeGreaterThanOrEqual(4);

    // Inspect on Worlds Collide words the pod's shared threat and what completing it does.
    await clickText(page, "Worlds Collide", {
      sceneKey: "Board",
      until: () => isSceneUp(page, "InspectOverlay"),
    });
    await waitForText(page, "0 of 2 threat", { timeoutMs: 15_000 });
    await waitForText(page, "the players lose at 2", { timeoutMs: 15_000 });
    await pressKey(page, "Escape");
    await settle(page);

    // A rules card opens its own sheet, with its printed text.
    await clickText(page, "Shatter the", {
      sceneKey: "Board",
      until: () => isSceneUp(page, "InspectOverlay"),
    });
    await waitForText(page, "Rules card", { timeoutMs: 15_000 });
    await waitForText(page, "Deal each player 1 facedown encounter card", { timeoutMs: 15_000 });
    await pressKey(page, "Escape");
    await settle(page);

    // The Avatar's last hit point: the attack shatters it and Loki's dial moves by the shatter counters (2, then 5).
    const before = await avatarCode(page);
    expect(await lokiDamage(page)).toBe(0);
    await withStore(
      page,
      `const l = store.state.legal.actions; await store.dispatch(l.legal.find((x) => x.action.kind === "basicAttack").example);`,
    );
    await settleChoices(page);
    await settle(page);
    expect(await lokiDamage(page)).toBe(7);
    expect(await avatarCode(page)).not.toBe(before);
    expect(await hasText(page, "13", "Board")).toBe(true);
    expect(await hasText(page, "1/1", "Board")).toBe(true);
    // The log names the counter the Figment placed (the earlier lines of the shatter have scrolled up).
    expect(await hasText(page, "gets 1 synergy counter", "Board")).toBe(true);
    expect(await hasText(page, "Neutral villain", "Board")).toBe(true);

    expect(errors, errors.join("\n")).toEqual([]);
  });
});
