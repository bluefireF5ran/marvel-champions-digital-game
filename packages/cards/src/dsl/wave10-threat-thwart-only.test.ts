/**
 * docs/phase7-wave10-hero-packs.md H3.6 (engine task HT6): `onlyThwartsRemoveThreat(target, thwarter)`, a
 * `threatCannotBeRemoved` rule with a thwart-only exception, with the real Hercules cards in a real two-player game
 * against Core's Rhino (Hercules, then Core's Spider-Man). The scripts are this test's own; the pack's modules are
 * scripted elsewhere.
 *
 * Embody Pathos 59003: "Attached side scheme gains assault. Threat cannot be removed from attached scheme except by
 * Hercules's thwarts." Wisdom of Athena 59011: "Hero Action (thwart): Remove 4 threat from a scheme." Thor 59020 is an
 * ally with THW 3. For Justice! 01060 (Spider-Man's deck): "Hero Action (thwart): Remove 3 threat from a scheme."
 *
 * RRG 1.8 "'Cannot'" (p. 11). RRG 1.8 "Labeled Ability" (p. 26): a "(thwart)"-labeled ability "is considered to be a
 * thwart made by that player's identity". RRG 1.8 "Target" (p. 43): "A target that cannot be thwarted is not a valid
 * target for a thwart-labeled ability." RRG 1.8 "Assault" (p. 8): "When a character makes a basic thwart against a
 * scheme with the assault keyword, that character uses its ATK instead of its THW." So Hercules's basic thwart on the
 * attached scheme removes his ATK, 3, and not his THW, 1: the same card grants both.
 */

import {
  applyCommand,
  createGame,
  hasKeyword,
  type AbilityDefinition,
  type Command,
  type EngineDeps,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import {
  attachCard,
  chosen,
  constant,
  findCard,
  gainsKeyword,
  heroAction,
  onlyThwartsRemoveThreat,
  placeThreat,
  query,
  self,
  thwartAScheme,
  validateDefinition,
  whenRevealed,
} from "./index.js";
import { coreScenario } from "../core/setup.js";
import {
  P1,
  P2,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  moveToHand,
  patchInstance,
  payWith,
  play,
  settle,
  type Picker,
} from "../testing/harness.js";
import { withForm } from "../testing/staging.js";
import { CORE_SPIDER_MAN, HERCULES_DECK, HERO_PACK_CARDS, heroPackConfig, stagedInPlay } from "../wave10/testing.js";
import {
  DEFEAT_THE_HYDRA,
  EMBODY_PATHOS,
  LABOR_SCRIPTS,
  PROTECT_HUMANITY,
  depsWith,
  drive,
  newLabors,
  ofType,
  theCard,
  withLaborOrder,
} from "./wave10-labor.testing.js";

vi.setConfig({ testTimeout: 120_000 });

const OLYMPIC_FEUD = "59038";
const WISDOM_OF_ATHENA = "59011";
const THOR = "59020";
const FOR_JUSTICE = "01060";

const ATTACHED_SCHEME = query("sideScheme", { hostOfSelf: true });
const SCRIPTS: Readonly<Record<string, AbilityDefinition>> = {
  ...LABOR_SCRIPTS,
  "59003.when-revealed": whenRevealed(
    findCard(query("sideScheme", { controller: "encounter" }), "reveal", {
      choose: true,
      outOfPlay: true,
      bind: "scheme",
      perPlayerAs: 1,
    }),
    attachCard(self, chosen("scheme")),
    placeThreat(6, chosen("scheme")),
  ),
  // The card's own constant text, as its module will write it.
  "59003.embody-pathos-constant": constant(
    gainsKeyword({ name: "assault" }, ATTACHED_SCHEME),
    onlyThwartsRemoveThreat(ATTACHED_SCHEME, query("identity", { name: "Hercules" })),
  ),
  "59011.wisdom-of-athena-action": heroAction({ label: "thwart" }, thwartAScheme(4)),
};
const DEPS: EngineDeps = depsWith(SCRIPTS);

const picking =
  (id: InstanceId): Picker =>
  (state) =>
    state.pendingChoice?.options.some((o) => o.optionId === id) ? [id] : firstLegal(state);

interface Table {
  readonly state: GameState;
  /** Olympic Feud, with Embody Pathos attached and 8 threat. */
  readonly scheme: InstanceId;
}
/** Hercules (hero form) and Spider-Man against Rhino; Embody Pathos is on Olympic Feud, which holds 8 threat. */
function table(): Table {
  const config = heroPackConfig(HERCULES_DECK);
  const second = coreScenario("rhino", {
    players: [{ starterDeckId: CORE_SPIDER_MAN }],
    seed: 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: HERO_PACK_CARDS,
  } as never).players[0]!;
  const created = createGame({ ...config, players: [...config.players, second] }, DEPS);
  if (!created.ok) throw new Error(`${created.error.code}: ${created.error.message}`);
  const opened = settle(created.state, firstLegal, (s) => s.step.phase === "player", DEPS);
  const start = withLaborOrder(opened, EMBODY_PATHOS, PROTECT_HUMANITY, DEFEAT_THE_HYDRA);
  const scheme = theCard(start, OLYMPIC_FEUD);
  const revealed = drive(start, newLabors(start), picking(scheme), DEPS).state;
  expect(inst(revealed, scheme).attachments).toEqual([theCard(revealed, EMBODY_PATHOS)]);
  return { state: withForm(patchInstance(revealed, scheme, { threat: 8 }), { heroForm: 0 }), scheme };
}
const threat = (state: GameState, id: InstanceId): number => inst(state, id).threat;
const basicThwart = (state: GameState, thwarter: InstanceId, scheme: InstanceId): Command => ({
  type: "basicThwart",
  playerId: P1,
  thwarterInstanceId: thwarter,
  schemeInstanceId: scheme,
});
const blocked = (events: readonly GameEvent[], scheme: InstanceId) =>
  ofType(events, "threatRemovalBlocked").filter((e) => e.schemeInstanceId === scheme);
const offeredCards = (state: GameState): InstanceId[] =>
  (state.pendingChoice?.options ?? []).flatMap((o) => (o.ref.kind === "card" ? [o.ref.instanceId] : []));

describe("H3.6 Embody Pathos: threat cannot be removed from attached scheme except by Hercules's thwarts (real cards)", () => {
  it("the script is a valid definition, and the attached scheme has assault", () => {
    expect(validateDefinition(SCRIPTS["59003.embody-pathos-constant"]!)).toEqual([]);
    const { state, scheme } = table();
    expect(hasKeyword(state, scheme, "assault", DEPS)).toBe(true);
    expect(threat(state, scheme)).toBe(8);
  });

  it("Hercules's basic thwart removes threat: with assault he uses ATK 3, so 8 leaves 5 (not THW 1 and 7)", () => {
    const { state, scheme } = table();
    const after = drive(state, basicThwart(state, identityOf(state, P1), scheme), firstLegal, DEPS);
    expect(threat(after.state, scheme)).toBe(5);
    expect(blocked(after.events, scheme)).toEqual([]);
  });

  it("Wisdom of Athena, his '(thwart)' event, may choose the scheme and removes 4: 8 leaves 4", () => {
    const { state, scheme } = table();
    const given = moveToHand(state, P1, WISDOM_OF_ATHENA);
    const card = given.ids[0]!;
    const command = play(P1, card, payWith(given.state, P1, 3, [card]));
    const asked = applyCommand(given.state, command, DEPS);
    if (!asked.ok) throw new Error(`${asked.error.code}: ${asked.error.message}`);
    expect(offeredCards(asked.state)).toContain(scheme);
    const after = drive(given.state, command, picking(scheme), DEPS);
    expect(threat(after.state, scheme)).toBe(4);
    expect(blocked(after.events, scheme)).toEqual([]);
  });

  it("Thor, his ally (THW 3): the scheme is not a legal target of Thor's basic thwart, and 8 stays 8", () => {
    const start = table();
    const thor = stagedInPlay(start.state, THOR);
    const refused = applyCommand(thor.state, basicThwart(thor.state, thor.id, start.scheme), DEPS);
    expect(refused).toMatchObject({
      ok: false,
      error: { code: "no_valid_target", message: "this character cannot remove threat from that scheme" },
    });
    expect(inst(thor.state, thor.id).exhausted).toBe(false);
    expect(threat(thor.state, start.scheme)).toBe(8);
    // Thor may still thwart the main scheme: 5 leaves 2.
    const main = thor.state.mainScheme.instanceId;
    const withThreat = patchInstance(thor.state, main, { threat: 5 });
    const after = drive(withThreat, basicThwart(withThreat, thor.id, main), firstLegal, DEPS).state;
    expect(threat(after, main)).toBe(2);
    expect(threat(after, start.scheme)).toBe(8);
  });

  it("another player's thwart event (Spider-Man's For Justice!) is refused that target", () => {
    const start = table();
    const turn = withForm(drive(start.state, endTurn(P1), firstLegal, DEPS).state, { heroForm: 0 }, P2);
    expect(turn.step).toMatchObject({ phase: "player" });
    const given = moveToHand(turn, P2, FOR_JUSTICE);
    const card = given.ids[0]!;
    const command = play(P2, card, payWith(given.state, P2, 2, [card]));
    const asked = applyCommand(given.state, command, DEPS);
    if (!asked.ok) throw new Error(`${asked.error.code}: ${asked.error.message}`);
    const offered = offeredCards(asked.state);
    expect(offered).toContain(given.state.mainScheme.instanceId);
    expect(offered).not.toContain(start.scheme);
    const after = drive(given.state, command, firstLegal, DEPS).state;
    expect(threat(after, start.scheme)).toBe(8);
  });

  it("the rule goes with the attachment: once Hercules's thwarts defeat the scheme, Embody Pathos is in the victory display", () => {
    const { state, scheme } = table();
    const low = patchInstance(state, scheme, { threat: 3 });
    const after = drive(low, basicThwart(low, identityOf(low, P1), scheme), firstLegal, DEPS).state;
    expect(after.villainArea).not.toContain(scheme);
    expect(after.victoryDisplay).toContain(theCard(after, EMBODY_PATHOS));
  });
});
