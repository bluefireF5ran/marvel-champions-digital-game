/**
 * A Hypnotic Gaze's Trance side is hidden from every player until the card flips (docs/phase7-wave9.md §3.54; MC55
 * p. 7). Mirrors `packages/cards/src/wave9/tt/enchantress-scenario.test.ts`'s `expectHidden` on the client side: every
 * view the board derives, the log and a card's history, play a real game through the store and name no Trance, no `b`
 * face id and no Trance ability before the flip; after the flip the real card shows.
 */
import {
  applyCommand,
  createGame,
  legalActions,
  otherFaceVisible,
  type GameEvent,
  type GameState,
  type InstanceId,
  type LegalAction,
} from "@mc/engine";
import { describe, expect, test } from "vitest";
import { POOL_DEPS, buildScenario } from "../content/pool.js";
import { DevStateHost } from "../engine/dev-state-host.js";
import { LocalEngineHost } from "../engine/local-host.js";
import { ENCHANTRESS_CONFIG, KISS, startEnchantressGame } from "../store/dev-enchantress-game.js";
import { nextTurn } from "../store/dev-game-steps.js";
import { SessionStore } from "../store/session-store.js";
import { boardModel, characterPanel, attachmentChipText } from "./board-model.js";
import { appendCardHistory, emptyCardHistoryLog } from "./card-history.js";
import { REVERSE_HIDDEN_NOTE, reverseHiddenNote } from "./hidden-reverse.js";
import { inspectModel } from "./inspect-model.js";
import { appendEvents, emptyLog } from "./log-lines.js";

const GAZES = ["55007a", "55008a", "55009a", "55010a", "55011a"] as const;
type Gaze = (typeof GAZES)[number];
const TRANCE_NAME: Readonly<Record<Gaze, string>> = {
  "55007a": "Trance of Envy",
  "55008a": "Trance of Greed",
  "55009a": "Trance of Pride",
  "55010a": "Trance of Sloth",
  "55011a": "Trance of Wrath",
};
const TRANCE_ACTION: Readonly<Record<Gaze, string>> = {
  "55007a": "55007b.trance-of-envy-forced-action",
  "55008a": "55008b.trance-of-greed-forced-action",
  "55009a": "55009b.trance-of-pride-forced-action",
  "55010a": "55010b.trance-of-sloth-forced-action",
  "55011a": "55011b.trance-of-wrath-forced-action",
};
/** The Gaze every unflipped one is drawn as: the first of the five by card id (`standInOf`). */
const STAND_IN: Gaze = "55007a";
/**
 * Everything that would name the Trance under a Gaze that has not flipped: the reverse's id, name and action, and the
 * front's own card id, which differs on each of the five and so names which one it is (every Gaze but the stand-in).
 */
const secretsOf = (gaze: Gaze): string[] => [
  `${gaze.slice(0, -1)}b`,
  TRANCE_NAME[gaze],
  TRANCE_ACTION[gaze],
  ...(gaze === STAND_IN ? [] : [gaze]),
];
const secretsExcept = (flipped: readonly Gaze[]): string[] =>
  GAZES.filter((gaze) => !flipped.includes(gaze)).flatMap(secretsOf);

const mentions = (value: unknown, needles: readonly string[]): string[] => {
  const text = JSON.stringify(value);
  return needles.filter((needle) => text.includes(needle));
};

/** Everything a view derives from the state the client holds, for a seat; the card pool is the catalog, not state. */
function views(game: GameState, store: SessionStore, events: readonly GameEvent[]) {
  const me = game.players[0]!;
  const legal = store.state.legal?.actions ?? null;
  const gaze = game.instances[me.identity.instanceId]!.attachments.find((id) =>
    /^5500[7-9]|^5501[01]/.test(code(game, id)),
  )!;
  const { cardPool: _pool, rng: _rng, ...table } = game;
  const log = appendEvents(emptyLog(), events, game, me.playerId, POOL_DEPS);
  return {
    gaze,
    table,
    board: boardModel(game, me.playerId, POOL_DEPS, legal?.kind === "turn" ? legal : null),
    panel: characterPanel(game, me.identity.instanceId, POOL_DEPS),
    inspect: inspectModel(game, gaze, legal, me.playerId, POOL_DEPS, {
      history: appendCardHistory(emptyCardHistoryLog(), events),
    }),
    log,
  };
}
const code = (game: GameState, id: InstanceId): string => game.instances[id]!.cardId as string;

/** The fixture's events from round 1 on, recorded as the store absorbs them. */
async function playedFixture() {
  const store = new SessionStore(new LocalEngineHost());
  const events: GameEvent[] = [];
  store.subscribe((state) => {
    if (state.lastEvents.length > 0) events.push(...state.lastEvents);
  });
  await startEnchantressGame(store);
  return { store, events };
}

const usable = (store: SessionStore, kind: "useAbility" | "endTurn"): LegalAction | undefined => {
  const actions = store.state.legal?.actions;
  return actions?.kind === "turn" ? actions.legal.find((entry) => entry.action.kind === kind) : undefined;
};

describe("a Hypnotic Gaze whose reverse is hidden", () => {
  test("the client's state holds the stand-in, never the card that is really there", async () => {
    // A real state straight from the engine (the dev host passes it on unsealed): the store seals it.
    const created = createGame(
      buildScenario("enchantress", { seed: 5, players: [{ starterDeckId: "core-spider-man-justice" }] }),
      POOL_DEPS,
    );
    if (!created.ok) throw new Error(created.error.message);
    let state = created.state;
    for (let guard = 0; state.pendingChoice && guard < 20; guard++) {
      const choice = state.pendingChoice;
      const r = applyCommand(
        state,
        {
          type: "resolveChoice",
          playerId: choice.playerId,
          choiceId: choice.choiceId,
          selectedOptionIds: choice.options.slice(0, choice.minSelections).map((o) => o.optionId),
        },
        POOL_DEPS,
      );
      if (!r.ok) throw new Error(r.error.message);
      state = r.state;
    }
    const realGaze = state.players[0]!.identity.instanceId;
    const attachedReal = state.instances[realGaze]!.attachments.map((id) => state.instances[id]!);
    expect(attachedReal.some((i) => i.reverseHidden === true)).toBe(true);

    const store = new SessionStore(new DevStateHost(state, POOL_DEPS));
    await store.start(ENCHANTRESS_CONFIG);
    const game = store.state.game!;
    // Every Gaze in the game, set aside or attached, is named by the one stand-in.
    const gazes = Object.values(game.instances).filter((i) => i.reverseHidden === true);
    expect(gazes.length).toBe(5);
    expect(new Set(gazes.map((i) => i.cardId as string))).toEqual(new Set(["55007a"]));
    const { cardPool: _pool, rng: _rng, ...table } = game;
    expect(mentions(table, secretsExcept([]))).toEqual([]);
  });

  test("before the flip no view names a Trance, a b face or a Trance ability; Inspect says the reverse is hidden", async () => {
    const { store, events } = await playedFixture();
    const game = store.state.game!;
    const v = views(game, store, events);
    expect(otherFaceVisible(game, v.gaze)).toBe(false);
    const secrets = secretsExcept([]);
    for (const [name, value] of Object.entries(v)) expect(mentions(value, secrets), name).toEqual([]);
    // The Gaze reads as itself, with its goal against its counters.
    expect(v.inspect.name).toBe("Hypnotic Gaze");
    expect(v.inspect.reverseNote).toBe(REVERSE_HIDDEN_NOTE);
    expect(v.inspect.counterNote).toBe("2 of 5 charm counters");
    expect(v.inspect.abilities).toEqual([]);
    const chip = v.panel.attachments.find((a) => a.instanceId === v.gaze)!;
    expect(attachmentChipText(chip)).toBe("Hypnotic Gaze · 2/5 charm");
    // Its art is the front's, as the table draws it.
    expect(JSON.stringify(v.inspect.art)).not.toMatch(/55\d{3}b/);
    // The log told that the reverses were hidden, and said nothing of what they are.
    expect(v.log.lines.map((line) => line.text).some((text) => /other side hidden/.test(text))).toBe(true);
  }, 120_000);

  test("asked for its other face, Inspect still reads the front", async () => {
    const { store } = await playedFixture();
    const game = store.state.game!;
    const gaze = views(game, store, []).gaze;
    const asked = inspectModel(game, gaze, null, game.players[0]!.playerId, POOL_DEPS, { face: { kind: "flipSide" } });
    expect(asked.name).toBe("Hypnotic Gaze");
    expect(mentions(asked, secretsExcept([]))).toEqual([]);
    expect(reverseHiddenNote(game, gaze)).toBe(REVERSE_HIDDEN_NOTE);
  }, 120_000);

  test("after the flip the real card shows, and the other four stay hidden", async () => {
    const { store, events } = await playedFixture();
    const me = () => store.state.game!.players[0]!;
    // Round 3: the Kiss is owed; End Turn waits for it. Using it each turn brings the Gaze to its fifth counter.
    let flipped: Gaze | null = null;
    for (let guard = 0; guard < 30 && !flipped; guard++) {
      await nextTurn(store);
      const kiss = usable(store, "useAbility");
      if (kiss) {
        await store.dispatch(kiss.example);
        continue;
      }
      const game = store.state.game!;
      const gaze = views(game, store, []).gaze;
      if (game.instances[gaze]!.flipped) {
        flipped = `${code(game, gaze).slice(0, -1)}a` as Gaze;
        break;
      }
      const end = usable(store, "endTurn");
      if (!end) break;
      await store.dispatch(end.example);
    }
    expect(flipped, "the Gaze flipped").not.toBeNull();
    const game = store.state.game!;
    const v = views(game, store, events);
    expect(otherFaceVisible(game, v.gaze)).toBe(true);
    expect(v.inspect.name).toBe(TRANCE_NAME[flipped!]);
    expect(v.inspect.reverseNote ?? null).toBeNull();
    // Only the flipped Trance is named; the four unflipped Gazes' reverses are still nobody's.
    const hidden = secretsExcept([flipped!]);
    for (const [name, value] of Object.entries(v)) expect(mentions(value, hidden), name).toEqual([]);
    expect(me().identity.instanceId).toBeTruthy();
    expect(JSON.stringify(v.log)).toContain("flipped");
    expect(game.instances[v.gaze]!.reverseHidden).toBeUndefined();
  }, 180_000);

  test("the Kiss's Forced Action is the card the fixture stops on", async () => {
    const { store } = await playedFixture();
    const game = store.state.game!;
    const me = game.players[0]!;
    expect(game.instances[me.identity.instanceId]!.attachments.some((id) => code(game, id) === KISS)).toBe(true);
    expect(legalActions(game, me.playerId, POOL_DEPS).kind).toBe("turn");
  });
});
