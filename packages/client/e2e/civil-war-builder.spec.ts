import { expect, test, type Page } from "@playwright/test";
import { activeScenes, pressHookStop, settle, trackPageErrors, waitFor } from "./helpers.js";
import { openApp } from "./wave6-helpers-b.js";

/**
 * The Civil War scenario builder (docs/phase7-wave10-client.md section 2, task C7). The scenes are reached through the dev
 * jump `?screen=civil-war-builder` (the Civil War shelf and its Customize / Build your own entries are
 * `wave10-civil-war.spec.ts`'s) and driven through `__mcBuilderDebug`: `view()` is the tested view model's `BuilderView`, `act()`
 * sends one action string (what a tap or key sends), `status()` is the status line as drawn. Read back, never recomputed.
 */

interface Tile {
  readonly id: string;
  readonly name: string;
  readonly action: string;
  readonly selected: boolean;
  readonly enabled: boolean;
  readonly recommended: boolean;
  readonly disabledReason?: string;
}
interface Section {
  readonly key: string;
  readonly tiles: readonly Tile[];
  readonly collapsedLine?: string;
}
interface View {
  readonly step: number;
  readonly steps: readonly { title: string; line: string; active: boolean; action: string }[];
  readonly leaderChoices: readonly { scenarioId: string; name: string; selected: boolean }[];
  readonly modular: { chosen: number; counterLine: string; sections: readonly Section[] };
  readonly modeOptions: readonly { id: string; label: string; note: string; enabled: boolean; selected: boolean }[];
  readonly canStart: boolean;
  readonly startProblem: string | null;
  readonly isPreconstructed: boolean;
  readonly difficulty: string;
  readonly difficultyChoices: readonly { id: string; name: string; selected: boolean }[];
  readonly summary: readonly string[];
  readonly focusOrder: readonly string[];
  readonly blind: boolean;
  readonly stageRows: readonly {
    hidden: boolean;
    options: readonly { name: string; action: string; selected: boolean; recommended: boolean }[];
  }[];
  readonly randomPins: readonly { action: string; label: string; on: boolean }[];
}

const view = async (page: Page): Promise<View> =>
  page.evaluate(() => (window as unknown as { __mcBuilderDebug: { view: () => View } }).__mcBuilderDebug.view());
const act = async (page: Page, action: string): Promise<void> => {
  await page.evaluate(
    (a) => (window as unknown as { __mcBuilderDebug: { act: (x: string) => void } }).__mcBuilderDebug.act(a),
    action,
  );
  await settle(page, { quietMs: 120, maxMs: 600 });
};
const debug = async <T>(page: Page, method: string): Promise<T> =>
  page.evaluate(
    (m) => (window as unknown as { __mcBuilderDebug: Record<string, () => unknown> }).__mcBuilderDebug[m]!() as never,
    method,
  );
const status = (page: Page): Promise<string> => debug<string>(page, "status");

async function openBuilder(page: Page, query = ""): Promise<string[]> {
  const errors = trackPageErrors(page);
  await openApp(page, `unlock=all&screen=civil-war-builder${query}`, { landing: "CivilWarBuilder" });
  await waitFor(
    async () => ((await page.evaluate(() => "__mcBuilderDebug" in window)) ? true : null),
    "the builder's debug hook",
    10000,
  );
  await settle(page);
  return errors;
}

const sizes = [
  { name: "phone", viewport: { width: 390, height: 844 } },
  { name: "desktop", viewport: { width: 1440, height: 900 } },
] as const;

for (const size of sizes) {
  test.describe(`Civil War builder at ${size.name} size`, () => {
    test.use({ viewport: size.viewport });

    test("five steps render and the ready-made scenario can start", async ({ page }) => {
      const errors = await openBuilder(page);
      let v = await view(page);
      expect(v.steps.map((s) => s.title)).toEqual(["Side", "Leader", "Main scheme", "Modular sets", "Review and play"]);
      expect(v.step).toBe(5);
      expect(v.isPreconstructed).toBe(true);
      expect(v.canStart).toBe(true);
      for (const n of [1, 2, 3, 4, 5]) {
        await act(page, `civil:step:${n}`);
        v = await view(page);
        expect(v.step).toBe(n);
        expect(v.steps.find((s) => s.active)?.title).toBe(v.steps[n - 1]!.title);
      }
      // Start hands the draft to Take your seats: the scenarios are in the client pool.
      await act(page, "civil:start");
      const handoff = await debug<{ kind: string } | null>(page, "handoff");
      expect(handoff).not.toBeNull();
      expect(handoff!.kind).toBe("seats");
      await waitFor(async () => ((await activeScenes(page)).includes("Seats") ? true : null), "Take your seats", 10000);
      expect(errors).toEqual([]);
    });

    test("the other leader of a side changes the stages and sets; the other side's sets are present and disabled", async ({
      page,
    }) => {
      const errors = await openBuilder(page);
      const before = await view(page);
      const first = before.leaderChoices.find((l) => l.selected)!;
      const second = before.leaderChoices.find((l) => !l.selected)!;
      await act(page, "civil:step:2");
      await act(page, `civil:leader:${second.scenarioId}`);
      const after = await view(page);
      expect(after.leaderChoices.find((l) => l.selected)!.name).toBe(second.name);
      expect(after.leaderChoices.find((l) => l.selected)!.name).not.toBe(first.name);
      // The defaults are that leader's ready-made picks: the recommended stage in each row, the recommended sets chosen.
      for (const row of after.stageRows) {
        expect(row.options.find((o) => o.selected)?.name).toBe(row.options.find((o) => o.recommended)?.name);
      }
      expect(after.isPreconstructed).toBe(true);
      await act(page, "civil:step:4");
      const sets = await view(page);
      const own = sets.modular.sections.find((s) => s.key === "side")!;
      expect(own.tiles.filter((t) => t.recommended).every((t) => t.selected)).toBe(true);
      expect(sets.modular.chosen).toBe(own.tiles.filter((t) => t.recommended).length);

      // The other side's group: one collapsed line, then disabled tiles that say why.
      const other = sets.modular.sections.find((s) => s.key === "otherSide")!;
      expect(other.collapsedLine).toMatch(/sets from the .+ are not used with /);
      await act(page, "civil:other-side");
      const open = (await view(page)).modular.sections.find((s) => s.key === "otherSide")!;
      expect(open.tiles.length).toBeGreaterThan(0);
      for (const tile of open.tiles) {
        expect(tile.enabled, tile.id).toBe(false);
        expect(tile.disabledReason, tile.id).toBeTruthy();
      }
      const chosenBefore = (await view(page)).modular.chosen;
      await act(page, open.tiles[0]!.action);
      expect((await view(page)).modular.chosen).toBe(chosenBefore);
      expect(await status(page)).toBe(open.tiles[0]!.disabledReason);
      expect(errors).toEqual([]);
    });

    test("a fifth set is refused with the status line; fewer than three disables Start", async ({ page }) => {
      const errors = await openBuilder(page);
      await act(page, "civil:step:4");
      let v = await view(page);
      expect(v.modular.chosen).toBe(4);
      const refused = v.modular.sections
        .flatMap((s) => s.tiles)
        .find((t) => !t.selected && !t.enabled && t.disabledReason === "Four is the most (MC56 p. 4)");
      expect(refused, "an unchosen tile refused because four is the most").toBeTruthy();
      await act(page, refused!.action);
      v = await view(page);
      expect(v.modular.chosen).toBe(4);
      expect(await status(page)).toBe("Four is the most (MC56 p. 4)");

      // Deselect down to two: Start is disabled and the line reads the engine's text.
      const chosen = v.modular.sections.flatMap((s) => s.tiles).filter((t) => t.selected);
      await act(page, chosen[0]!.action);
      await act(page, chosen[1]!.action);
      v = await view(page);
      expect(v.modular.chosen).toBe(2);
      expect(v.canStart).toBe(false);
      expect(v.startProblem).toContain("got 2");
      expect(await status(page)).toBe(v.startProblem);
      await act(page, "civil:start");
      expect(await debug<unknown>(page, "handoff")).toBeNull();
      expect(errors).toEqual([]);
    });

    test("choosing Expert puts the leader on stage III and the review on Expert; Standard puts it back", async ({
      page,
    }) => {
      const errors = await openBuilder(page);
      let v = await view(page);
      expect(v.difficultyChoices.map((d) => [d.name, d.selected])).toEqual([
        ["Standard", true],
        ["Expert", false],
      ]);
      expect(v.summary).toContain("Difficulty: Standard");
      expect(v.summary.some((l) => l.endsWith("(stage I)"))).toBe(true);
      await act(page, "civil:difficulty:expert");
      v = await view(page);
      expect(v.difficulty).toBe("expert");
      expect(v.summary).toContain("Difficulty: Expert");
      expect(v.summary.some((l) => l.endsWith("(stage III)"))).toBe(true);
      await act(page, "civil:step:2");
      expect((await view(page)).leaderChoices.length).toBeGreaterThan(0);
      await act(page, "civil:step:5");
      await act(page, "civil:difficulty:standard");
      v = await view(page);
      expect(v.summary).toContain("Difficulty: Standard");
      expect(v.summary.some((l) => l.endsWith("(stage I)"))).toBe(true);
      expect(errors).toEqual([]);
    });

    test("Competitive is present, disabled, says Coming soon, and tapping it changes nothing", async ({ page }) => {
      const errors = await openBuilder(page);
      await act(page, "civil:step:5");
      const before = await view(page);
      const competitive = before.modeOptions.find((m) => m.id === "competitive")!;
      expect(competitive.enabled).toBe(false);
      expect(competitive.note).toBe("Coming soon");
      expect(before.modeOptions.find((m) => m.id === "cooperative")!.selected).toBe(true);
      const draft = await debug<unknown>(page, "draft");
      await act(page, "civil:mode:competitive");
      expect(await debug<unknown>(page, "draft")).toEqual(draft);
      const after = await view(page);
      expect(after.modeOptions.find((m) => m.id === "cooperative")!.selected).toBe(true);
      expect(after.modeOptions.find((m) => m.id === "competitive")!.selected).toBe(false);
      expect(await status(page)).toBe("Competitive mode is coming soon. Play this scenario cooperatively for now.");
      expect(errors).toEqual([]);
    });

    test("a real tap on a leader card picks it; the keyboard walks the focus order", async ({ page }) => {
      const errors = await openBuilder(page, "&entry=build");
      expect((await view(page)).step).toBe(1);
      await act(page, "civil:step:2");
      const v = await view(page);
      const other = v.leaderChoices.find((l) => !l.selected)!;
      await pressHookStop(page, "__mcBuilderDebug", `civil:leader:${other.scenarioId}`);
      await waitFor(
        async () => ((await view(page)).leaderChoices.find((l) => l.selected)?.name === other.name ? true : null),
        "the tapped leader is picked",
        8000,
      );

      // Tab walks the model's focus order (every control once, rail, the step, then the foot).
      const walked: string[] = [];
      const stopKeys = (await debug<{ key: string }[]>(page, "stops")).map((s) => s.key);
      const expected = (await view(page)).focusOrder.filter((key) => stopKeys.includes(key));
      for (let i = 0; i < expected.length; i++) {
        await page.keyboard.press("Tab");
        await settle(page, { quietMs: 60, maxMs: 300 });
        walked.push((await debug<string | null>(page, "focused")) ?? "");
      }
      expect(walked).toEqual(expected);
      // Enter presses what has focus: walk to the first step in the rail and open it.
      expect(expected[0]).toBe("civil:step:1");
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Escape");
      expect(errors).toEqual([]);
    });

    test("Random fills the builder with a scenario you can still edit, and pressing it again changes it", async ({
      page,
    }) => {
      const errors = await openBuilder(page);
      const picksOf = async (): Promise<string> => {
        const v = await view(page);
        return JSON.stringify([
          v.leaderChoices.find((l) => l.selected)!.name,
          v.stageRows.map((r) => r.options.find((o) => o.selected)?.name),
          v.summary.filter((l) => l.startsWith("Modular sets: ")),
        ]);
      };
      const seen = new Set<string>([await picksOf()]);
      let last = await picksOf();
      for (let press = 0; press < 3; press++) {
        await act(page, "civil:random");
        const v = await view(page);
        expect(v.step).toBe(5);
        expect(v.blind).toBe(false);
        expect(v.canStart).toBe(true);
        expect(v.modular.chosen).toBe(4);
        const now = await picksOf();
        expect(now).not.toBe(last);
        seen.add(now);
        last = now;
      }
      expect(seen.size).toBe(4);
      // The result is an ordinary pick: change a stage and it reads Custom.
      await act(page, "civil:step:3");
      const row = (await view(page)).stageRows[0]!;
      const other = row.options.find((o) => !o.selected)!;
      await act(page, other.action);
      expect((await view(page)).stageRows[0]!.options.find((o) => o.selected)!.name).toBe(other.name);
      expect((await view(page)).canStart).toBe(true);
      expect(errors).toEqual([]);
    });

    test("a kept leader and a 3-set roll are honored", async ({ page }) => {
      const errors = await openBuilder(page);
      const leader = (await view(page)).leaderChoices.find((l) => l.selected)!.name;
      await act(page, "civil:lock:leader");
      await act(page, "civil:count:3");
      expect((await view(page)).randomPins.map((p) => [p.label, p.on])).toEqual([
        ["Random may change the side", false],
        ["Random keeps the leader", true],
        ["Random draws 3 sets", true],
      ]);
      for (let press = 0; press < 3; press++) {
        await act(page, "civil:random");
        const v = await view(page);
        expect(v.leaderChoices.find((l) => l.selected)!.name).toBe(leader);
        expect(v.modular.chosen).toBe(3);
        expect(v.canStart).toBe(true);
      }
      expect(errors).toEqual([]);
    });

    test("Random and blind masks stage 2 and the set list; Show reveals them and turns blind off", async ({ page }) => {
      const errors = await openBuilder(page);
      await act(page, "civil:random-blind");
      let v = await view(page);
      expect(v.blind).toBe(true);
      expect(v.canStart).toBe(true);
      expect(v.summary).toContain("Stage 2: hidden");
      expect(v.summary).toContain("Modular sets: 4 hidden");
      expect(v.stageRows[1]!.hidden).toBe(true);
      expect(v.stageRows[1]!.options).toEqual([]);
      expect(v.stageRows[0]!.hidden).toBe(false);
      expect(v.modular.sections).toEqual([]);
      expect(v.focusOrder).toContain("civil:blind:show");
      await pressHookStop(page, "__mcBuilderDebug", "civil:blind:show");
      await waitFor(async () => ((await view(page)).blind ? null : true), "blind is turned off", 8000);
      v = await view(page);
      expect(v.summary.join("|")).not.toContain("hidden");
      expect(v.stageRows[1]!.options.length).toBeGreaterThan(0);
      expect(v.focusOrder).not.toContain("civil:blind:show");
      expect(errors).toEqual([]);
    });
  });
}
