import { CORE_CARDS, CW_CARDS, encounterSetId, trait } from "@mc/content";
import {
  activeEncounterDeckId,
  applyCommand,
  createGame,
  hasKeyword,
  type Command,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { coreScenario } from "../../../core/setup.js";
import { validateDefinition } from "../../../dsl/validate.js";
import {
  P1,
  P2,
  P3,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  mainThreat,
  patchInstance,
  settle,
  stackEncounterDeck,
} from "../../../testing/harness.js";
import { driveEventsPicking, encounterCardInVillainArea, playFromHand } from "../../../testing/staging.js";
import {
  BLACK_CAT,
  BLANK,
  CAPTAIN_MARVEL,
  FILLER_A,
  FILLER_B,
  IRON_MAN,
  SPIDER_MAN,
  attacksBy,
  codeOf,
  heroAttacks,
  heroForm,
  heroThwarts,
  inDiscard,
  inPlayCard,
  piles,
  revealedCodes,
} from "../../../wave9/testing.js";
import { WAVE10_CARDS } from "../../cards.js";
import { WAVE10_DEPS, engageMinion } from "../../testing.js";
import { MODULAR_MARIA_HILL, MODULAR_MARIA_HILL_SKIPPED } from "./maria-hill.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * The Maria Hill modular set (56083 Maria Hill, 56084 Life Model Decoy x2, 56085 Executive Order, 56086 S.H.I.E.L.D.
 * Helicarrier), docs/phase7-wave10.md sections 3.5 and 3.23. The Civil War scenario builder does not exist yet, so
 * the set is tested inside Core's Rhino scenario against Core starter decks, with the set's cards added to the
 * encounter deck by hand. There "the enemy leader" is Rhino (FFG ruling July 9, 2026).
 */
const MARIA = "56083";
const DECOY = "56084";
const ORDER = "56085";
const MIGHTY = "56081"; // The Initiative set: resolves a minion's When Revealed
const HELI = "56086";
const SET = [MARIA, DECOY, ORDER, HELI];
const RHINO = "01094";
const SHOCKER = "01103"; // Core minion, ATK 2, SCH 1
const CROWD_CONTROL = "01108"; // Core side scheme, crisis icon (no hazard: no extra encounter card)
const BLANK_B = "01104"; // Core treachery with no boost icons
const SANDMAN = "01102"; // Core minion
const REFS = [
  "56083.when-revealed",
  "56084.life-model-decoy-constant-2",
  "56084.life-model-decoy-forced-interrupt",
  "56085.when-revealed",
  "56085.boost",
  "56086.when-defeated",
];
const SKIPPED_REF = "56084.life-model-decoy-constant";

type Seat = typeof SPIDER_MAN | typeof CAPTAIN_MARVEL | typeof IRON_MAN;
const dataOf = (code: string) => CW_CARDS.find((c) => (c.id as string) === code)! as unknown as Record<string, unknown>;

/** Rhino's game against the Core decks (hero form) with the set's cards (two Decoys) added to the encounter deck, and one copy of each `extra` Civil War card. */
function game(seats: readonly Seat[] = [SPIDER_MAN], extra: readonly string[] = []): GameState {
  const config = coreScenario("rhino", {
    players: seats,
    seed: 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: [...CORE_CARDS, ...WAVE10_CARDS],
  } as never);
  const copies = CW_CARDS.filter(
    (c) => "encounterSetIds" in c && c.encounterSetIds.includes(encounterSetId("maria_hill_modular")),
  ).flatMap((c) => Array.from({ length: c.quantityInSet }, () => c.id));
  const more = extra.map((code) => CW_CARDS.find((c) => (c.id as string) === code)!.id);
  const created = createGame({ ...config, encounterDeck: [...config.encounterDeck, ...copies, ...more] }, WAVE10_DEPS);
  if (!created.ok) throw new Error(created.error.message);
  const settled = settle(created.state, firstLegal, (s) => s.step.phase === "player", WAVE10_DEPS);
  return heroForm(settled, ...seats.map((_, i) => [P1, P2, P3][i]!));
}
/** Every player ends the turn and the villain phase runs on the stacked deck (top first: Rhino's boost, then the rest). */
function villainPhase(state: GameState, stack: readonly string[]) {
  return driveEventsPicking(
    WAVE10_DEPS,
    stackEncounterDeck(state, ...stack),
    firstLegal,
    ...state.players.map((p) => endTurn(p.playerId)),
  );
}

/** The first copy of `code` in the encounter deck or discard pile removed from it (by surgery). */
function takeFromEncounter(state: GameState, code: string): { readonly state: GameState; readonly id: InstanceId } {
  const deckId = activeEncounterDeckId(state);
  const pile = state.encounterDecks[deckId]!;
  const id = [...pile.deck, ...pile.discard].find((i) => codeOf(state, i) === code);
  if (!id) throw new Error(`no ${code} in the encounter deck or discard`);
  return {
    id,
    state: {
      ...state,
      encounterDecks: {
        ...state.encounterDecks,
        [deckId]: { deck: pile.deck.filter((i) => i !== id), discard: pile.discard.filter((i) => i !== id) },
      },
    },
  };
}
/** Maria Hill put straight into play engaged with `player` (surgery, no reveal): the set's real card instance. */
function withMaria(state: GameState, player: PlayerId = P1): { readonly state: GameState; readonly id: InstanceId } {
  const taken = takeFromEncounter(state, MARIA);
  const placed: GameState = {
    ...taken.state,
    players: taken.state.players.map((p) =>
      p.playerId === player ? { ...p, playArea: [...p.playArea, taken.id] } : p,
    ),
  };
  return {
    id: taken.id,
    state: patchInstance(placed, taken.id, { faceup: true, engagedWith: player, controllerId: null }),
  };
}
/** A Life Model Decoy attached faceup to `host` (surgery: no reveal). */
function decoyOn(state: GameState, host: InstanceId): { readonly state: GameState; readonly id: InstanceId } {
  const taken = takeFromEncounter(state, DECOY);
  const attached = patchInstance(taken.state, taken.id, { faceup: true, attachedTo: host });
  return {
    id: taken.id,
    state: patchInstance(attached, host, { attachments: [...inst(attached, host).attachments, taken.id] }),
  };
}
const villainOf = (s: GameState): InstanceId => s.activeVillainId!;
const attachedCodes = (s: GameState, host: InstanceId) => inst(s, host).attachments.map((a) => codeOf(s, a));
const hero = (s: GameState, player: PlayerId = P1) => identityOf(s, player);
const copies = (s: GameState, code: string) =>
  Object.keys(s.instances).filter((i) => codeOf(s, i as InstanceId) === code) as InstanceId[];

/** Ends every turn, answering choices with `firstLegal`, until the engine asks for an attachment target. */
function untilAttachmentChoice(state: GameState): GameState {
  let current = stackEncounterDeck(state);
  const commands: Command[] = current.players.map((p) => endTurn(p.playerId));
  const apply = (command: Command): void => {
    const result = applyCommand(current, command, WAVE10_DEPS);
    if (!result.ok) throw new Error(`${command.type}: ${result.error.message}`);
    current = result.state;
  };
  const settleChoices = (): void => {
    for (let guard = 0; guard < 200; guard++) {
      const choice = current.pendingChoice;
      if (!choice || choice.prompt.kind === "chooseAttachmentTarget") return;
      apply({
        type: "resolveChoice",
        playerId: choice.playerId,
        choiceId: choice.choiceId,
        selectedOptionIds: firstLegal(current),
      });
    }
    throw new Error("choices did not settle");
  };
  settleChoices();
  for (const command of commands) {
    if (current.pendingChoice) break;
    apply(command);
    settleChoices();
  }
  return current;
}

describe("registry", () => {
  it("registers the six refs, each a valid definition, and skips the one the data cannot state yet", () => {
    expect(Object.keys(MODULAR_MARIA_HILL).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(MODULAR_MARIA_HILL)) expect(validateDefinition(def), id).toEqual([]);
    expect(Object.keys(MODULAR_MARIA_HILL_SKIPPED)).toEqual([SKIPPED_REF]);
    expect(MODULAR_MARIA_HILL_SKIPPED[SKIPPED_REF]).toContain("maxPerHost");
  });

  it("the data names exactly these refs for the four cards", () => {
    const refs = SET.flatMap((code) => ((dataOf(code).abilities ?? []) as { id: string }[]).map((a) => a.id));
    expect(refs.sort()).toEqual([...REFS, SKIPPED_REF].sort());
  });

  it("carries the printed timing of each ability", () => {
    expect(MODULAR_MARIA_HILL["56083.when-revealed"]!.trigger).toMatchObject({ kind: "whenRevealed" });
    expect(MODULAR_MARIA_HILL["56084.life-model-decoy-constant-2"]!.trigger).toMatchObject({ kind: "constant" });
    expect(MODULAR_MARIA_HILL["56084.life-model-decoy-forced-interrupt"]!.trigger).toMatchObject({
      kind: "interrupt",
      forced: true,
    });
    expect(MODULAR_MARIA_HILL["56085.when-revealed"]!.trigger).toMatchObject({ kind: "whenRevealed" });
    expect(MODULAR_MARIA_HILL["56085.boost"]!.trigger).toMatchObject({ kind: "boost" });
    expect(MODULAR_MARIA_HILL["56086.when-defeated"]!.trigger).toMatchObject({ kind: "whenDefeated" });
  });

  it("setup: the encounter deck holds one Maria Hill, two Decoys, one Executive Order and one Helicarrier", () => {
    const s = game();
    expect(SET.map((code) => copies(s, code).length)).toEqual([1, 2, 1, 1]);
  });
});

describe("Maria Hill (56083)", () => {
  it("is data: an Elite S.H.I.E.L.D. unique minion, ATK 2, SCH 2, 4 hit points, 2 boost icons, Retaliate 2", () => {
    const card = dataOf(MARIA);
    expect([card.type, card.atk, card.sch, card.hp, card.boostIcons, card.unique]).toEqual([
      "minion",
      2,
      2,
      4,
      2,
      true,
    ]);
    expect(card.traits).toEqual([trait("ELITE"), trait("S.H.I.E.L.D.")]);
    expect(card.keywords).toEqual([{ name: "retaliate", value: 2 }]);
  });

  it("WHEN REVEALED: a Life Model Decoy from the encounter deck is attached to her, and the other stays in the deck", () => {
    const run = villainPhase(game(), [BLANK, MARIA, FILLER_A]);
    const maria = inPlayCard(run.state, MARIA)!;
    expect(inst(run.state, maria).engagedWith).toBe(P1);
    expect(attachedCodes(run.state, maria)).toEqual([DECOY]);
    const attached = inst(run.state, maria).attachments[0]!;
    expect(inst(run.state, attached)).toMatchObject({ attachedTo: maria, faceup: true });
    const others = copies(run.state, DECOY).filter((i) => i !== attached);
    expect(others).toHaveLength(1);
    expect(piles(run.state).deck).toContain(others[0]);
    expect(inPlayCard(run.state, DECOY)).toBe(attached);
  });

  it("WHEN REVEALED: with both Decoys in the discard pile, one is found there and the other stays", () => {
    const start = game();
    const pile = piles(start);
    const decoys = pile.deck.filter((i) => codeOf(start, i) === DECOY);
    const moved: GameState = {
      ...start,
      encounterDecks: {
        ...start.encounterDecks,
        [activeEncounterDeckId(start)]: {
          deck: pile.deck.filter((i) => !decoys.includes(i)),
          discard: [...decoys, ...pile.discard],
        },
      },
    };
    const run = villainPhase(moved, [BLANK, MARIA, FILLER_A]);
    const maria = inPlayCard(run.state, MARIA)!;
    expect(attachedCodes(run.state, maria)).toEqual([DECOY]);
    expect(inDiscard(run.state, DECOY)).toHaveLength(1);
    expect(piles(run.state).deck.filter((i) => codeOf(run.state, i) === DECOY)).toHaveLength(0);
  });

  it("WHEN REVEALED: with no Life Model Decoy left anywhere she enters play alone", () => {
    const start = game();
    const pile = piles(start);
    const stripped: GameState = {
      ...start,
      encounterDecks: {
        ...start.encounterDecks,
        [activeEncounterDeckId(start)]: {
          deck: pile.deck.filter((i) => codeOf(start, i) !== DECOY),
          discard: pile.discard.filter((i) => codeOf(start, i) !== DECOY),
        },
      },
    };
    const run = villainPhase(stripped, [BLANK, MARIA, FILLER_A]);
    const maria = inPlayCard(run.state, MARIA)!;
    expect(inst(run.state, maria).engagedWith).toBe(P1);
    expect(attachedCodes(run.state, maria)).toEqual([]);
  });

  it("WHEN REVEALED in a 3-player game: the third player reveals her, nobody is asked, and the Decoy goes on her", () => {
    // Rhino's three boosts, then the deal: P1 a filler, P2 a filler, P3 Maria Hill.
    const start = game([SPIDER_MAN, CAPTAIN_MARVEL, IRON_MAN]);
    const run = villainPhase(start, [BLANK, BLANK, BLANK_B, FILLER_A, FILLER_B, MARIA]);
    const maria = inPlayCard(run.state, MARIA)!;
    expect(inst(run.state, maria).engagedWith).toBe(P3);
    expect(attachedCodes(run.state, maria)).toEqual([DECOY]);
    expect(run.state.pendingChoice).toBeNull();
  });

  it("WHEN REVEALED again (Mighty Avengers resolves it): a Maria Hill who holds a Decoy takes no second one (limit 1 per character)", () => {
    const placed = withMaria(game([SPIDER_MAN], [MIGHTY]));
    const decoy = decoyOn(placed.state, placed.id);
    const run = villainPhase(decoy.state, [BLANK, MIGHTY, FILLER_A]);
    expect(attachedCodes(run.state, placed.id)).toEqual([DECOY]);
    expect(inst(run.state, placed.id).attachments).toEqual([decoy.id]);
    expect(copies(run.state, DECOY).filter((i) => piles(run.state).deck.includes(i))).toHaveLength(1);
    // Maria's ability was the one resolved, so Mighty Avengers did not surge.
    expect(revealedCodes(run.state, run.events)).toEqual([MIGHTY]);
  });

  it("WHEN REVEALED again (Mighty Avengers resolves it): a Maria Hill without a Decoy gets one", () => {
    const placed = withMaria(game([SPIDER_MAN], [MIGHTY]));
    const run = villainPhase(placed.state, [BLANK, MIGHTY, FILLER_A]);
    expect(attachedCodes(run.state, placed.id)).toEqual([DECOY]);
    expect(revealedCodes(run.state, run.events)).toEqual([MIGHTY]);
  });

  it("RETALIATE 2: a hero's attack on her hurts the hero for 2 (the Decoy is still on her)", () => {
    const placed = withMaria(game());
    const run = heroAttacks(WAVE10_DEPS, placed.state, placed.id);
    expect(inst(run.state, hero(run.state)).damage).toBe(2);
  });
});

describe("Life Model Decoy (56084)", () => {
  it("is data: a Tech attachment with 1 boost icon, two copies, attaching to a minion or the enemy leader", () => {
    const card = dataOf(DECOY);
    expect([card.type, card.boostIcons, card.quantityInSet, card.traits]).toEqual([
      "attachment",
      1,
      2,
      [trait("TECH")],
    ]);
    expect(card.attachesTo).toEqual({ kind: "anyOf", hosts: [{ kind: "minion" }, { kind: "leader", of: "enemy" }] });
  });

  it("question 13 = A, REVEALED with no minion in play: it attaches to the enemy leader, which is Rhino", () => {
    const run = villainPhase(game(), [BLANK, DECOY, FILLER_A]);
    expect(attachedCodes(run.state, villainOf(run.state))).toEqual([DECOY]);
    expect(run.state.pendingChoice).toBeNull();
  });

  it("question 13 = A, REVEALED with a minion in play: the first player picks between the minion and Rhino", () => {
    // Three players; P2 reveals the Decoy, and a Shocker is engaged with P3. The first player (P1) is asked.
    const start = engageMinion(game([SPIDER_MAN, CAPTAIN_MARVEL, IRON_MAN]), SHOCKER, "shocker", P3);
    const asked = untilAttachmentChoice(stackEncounterDeck(start, BLANK, BLANK, BLANK_B, FILLER_A, DECOY, FILLER_B));
    const choice = asked.pendingChoice!;
    expect(choice.prompt.kind).toBe("chooseAttachmentTarget");
    expect(choice.playerId).toBe(P1);
    expect(asked.firstPlayerId).toBe(P1);
    expect(choice.options.map((o) => o.optionId).sort()).toEqual([villainOf(asked), "shocker"].sort());
    // The revealing player (P2) and the third player may not answer for the first player.
    for (const other of [P2, P3]) {
      const refused = applyCommand(
        asked,
        { type: "resolveChoice", playerId: other, choiceId: choice.choiceId, selectedOptionIds: ["shocker"] },
        WAVE10_DEPS,
      );
      expect(refused.ok).toBe(false);
    }
    const answered = driveEventsPicking(WAVE10_DEPS, asked, () => ["shocker"]);
    expect(attachedCodes(answered.state, "shocker" as InstanceId)).toEqual([DECOY]);
    expect(attachedCodes(answered.state, villainOf(answered.state))).not.toContain(DECOY);
  });

  it("the choice can equally be the enemy leader", () => {
    const start = engageMinion(game(), SHOCKER, "shocker");
    const asked = untilAttachmentChoice(stackEncounterDeck(start, BLANK, DECOY, FILLER_B));
    expect(asked.pendingChoice!.options.map((o) => o.optionId).sort()).toEqual([villainOf(asked), "shocker"].sort());
    const answered = driveEventsPicking(WAVE10_DEPS, asked, () => [villainOf(asked)]);
    expect(attachedCodes(answered.state, villainOf(answered.state))).toEqual([DECOY]);
    expect(attachedCodes(answered.state, "shocker" as InstanceId)).toEqual([]);
  });

  it("CONSTANT: the attached enemy gains stalwart; another enemy and the same enemy without it do not", () => {
    const withShocker = engageMinion(engageMinion(game(), SHOCKER, "shocker"), SANDMAN, "sandman");
    const shocker = "shocker" as InstanceId;
    expect(hasKeyword(withShocker, shocker, "stalwart", WAVE10_DEPS)).toBe(false);
    const { state } = decoyOn(withShocker, shocker);
    expect(hasKeyword(state, shocker, "stalwart", WAVE10_DEPS)).toBe(true);
    expect(hasKeyword(state, "sandman" as InstanceId, "stalwart", WAVE10_DEPS)).toBe(false);
    expect(hasKeyword(state, villainOf(state), "stalwart", WAVE10_DEPS)).toBe(false);
    const onVillain = decoyOn(withShocker, villainOf(withShocker)).state;
    expect(hasKeyword(onVillain, villainOf(onVillain), "stalwart", WAVE10_DEPS)).toBe(true);
    expect(hasKeyword(onVillain, shocker, "stalwart", WAVE10_DEPS)).toBe(false);
  });

  it("FORCED INTERRUPT: the first attack on the attached minion is prevented and the Decoy is discarded; the next lands", () => {
    const withShocker = engageMinion(game(), SHOCKER, "shocker");
    const shocker = "shocker" as InstanceId;
    const { state, id } = decoyOn(withShocker, shocker);
    const first = heroAttacks(WAVE10_DEPS, state, shocker);
    expect(inst(first.state, shocker).damage).toBe(0);
    expect(inPlayCard(first.state, DECOY)).toBeUndefined();
    expect(inDiscard(first.state, DECOY)).toEqual([id]);
    expect(inst(first.state, shocker).attachments).toEqual([]);
    const ready = patchInstance(first.state, hero(first.state), { exhausted: false });
    const second = heroAttacks(WAVE10_DEPS, ready, shocker);
    expect(inst(second.state, shocker).damage).toBe(2);
  });

  it("FORCED INTERRUPT: on the enemy leader it prevents the attack's damage too (control: Rhino takes 2 without it)", () => {
    const start = game();
    const control = heroAttacks(WAVE10_DEPS, start, villainOf(start));
    expect(inst(control.state, villainOf(control.state)).damage).toBe(2);
    const { state, id } = decoyOn(start, villainOf(start));
    const run = heroAttacks(WAVE10_DEPS, state, villainOf(state));
    expect(inst(run.state, villainOf(run.state)).damage).toBe(0);
    expect(inDiscard(run.state, DECOY)).toEqual([id]);
  });

  it("FORCED INTERRUPT: an attack on another minion neither uses nor discards the Decoy", () => {
    const two = engageMinion(engageMinion(game(), SHOCKER, "shocker"), SANDMAN, "sandman");
    const { state } = decoyOn(two, "shocker" as InstanceId);
    const run = heroAttacks(WAVE10_DEPS, state, "sandman" as InstanceId);
    expect(inst(run.state, "sandman" as InstanceId).damage).toBe(2);
    expect(attachedCodes(run.state, "shocker" as InstanceId)).toEqual([DECOY]);
  });

  it("BOOST: 1 icon on the activating enemy's attack (Rhino ATK 2 + 1)", () => {
    const run = villainPhase(game(), [DECOY, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
  });
});

describe("Executive Order (56085)", () => {
  it("is data: a treachery with no boost icon and a star icon", () => {
    const card = dataOf(ORDER);
    expect([card.type, card.boostIcons, card.starIcon, card.keywords]).toEqual(["treachery", 0, true, []]);
  });

  it("WHEN REVEALED without Maria Hill: 2 threat on the main scheme and on each side scheme, and no surge", () => {
    const { state: withScheme } = encounterCardInVillainArea(game(), CROWD_CONTROL, 4);
    const control = villainPhase(withScheme, [BLANK, FILLER_B]);
    const run = villainPhase(withScheme, [BLANK, ORDER, FILLER_A]);
    expect(inst(run.state, inPlayCard(run.state, CROWD_CONTROL)!).threat).toBe(6);
    expect(mainThreat(run.state) - mainThreat(control.state)).toBe(2);
    expect(inDiscard(run.state, ORDER)).toHaveLength(1);
    // No surge: the card under it is not revealed (P1 reveals one card, the Order).
    expect(revealedCodes(run.state, run.events)).toEqual([ORDER]);
  });

  it("WHEN REVEALED with Maria Hill in play: the same threat, and it gains surge (the next card is revealed too)", () => {
    const placed = withMaria(game());
    const { state } = encounterCardInVillainArea(placed.state, CROWD_CONTROL, 4);
    // Rhino's boost (Maria is not Villainous, so she is dealt none), the Order, then the surge card.
    const control = villainPhase(state, [BLANK, FILLER_B]);
    const run = villainPhase(state, [BLANK, ORDER, FILLER_A]);
    expect(inst(run.state, inPlayCard(run.state, CROWD_CONTROL)!).threat).toBe(6);
    expect(mainThreat(run.state) - mainThreat(control.state)).toBe(2);
    expect(revealedCodes(run.state, run.events)).toEqual([ORDER, FILLER_A]);
  });

  it("BOOST without Maria Hill: no icons at all (Rhino ATK 2)", () => {
    const run = villainPhase(game(), [ORDER, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 0, damageDealt: 2 }]);
  });

  it("BOOST with Maria Hill in play: the card gains 3 icons (Rhino ATK 2 + 3)", () => {
    const placed = withMaria(game());
    const run = villainPhase(placed.state, [ORDER, BLANK, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 3, damageDealt: 5 }]);
  });
});

describe("S.H.I.E.L.D. Helicarrier (56086)", () => {
  it("is data: a side scheme with 3 threat (none per player), a hazard icon, 2 boost icons and Hinder 1 per hero", () => {
    const card = dataOf(HELI);
    expect([card.type, card.startingThreat, card.icons, card.boostIcons, card.keywords]).toEqual([
      "side_scheme",
      { base: 3, perPlayer: 0 },
      ["hazard"],
      2,
      [{ name: "hinder", value: 0, perPlayer: 1 }],
    ]);
  });

  it("REVEALED it enters play with 3 threat plus 1 for Hinder (one hero)", () => {
    const run = villainPhase(game(), [BLANK, HELI, FILLER_A]);
    expect(inst(run.state, inPlayCard(run.state, HELI)!).threat).toBe(4);
  });

  /** A two-player game with a Shocker engaged with each player, an ally of P1's in play, and 1 threat on the scheme. */
  function arena(threat = 1) {
    const withAlly = playFromHand(WAVE10_DEPS, game([SPIDER_MAN, CAPTAIN_MARVEL]), BLACK_CAT, 2);
    const minions = engageMinion(engageMinion(withAlly.state, SHOCKER, "m1", P1), SANDMAN, "m2", P2);
    const { state, id } = encounterCardInVillainArea(minions, HELI, threat);
    expect(withAlly.state.players[0]!.playArea).toContain(withAlly.id);
    return { state, scheme: id, ally: withAlly.id };
  }

  it("WHEN DEFEATED by P1: 1 damage to P1's hero, P1's ally and the minion engaged with P1; nothing of P2's", () => {
    const { state, scheme, ally } = arena();
    expect(inst(state, ally).damage).toBe(0);
    const run = heroThwarts(WAVE10_DEPS, state, scheme, { player: P1 });
    expect(inPlayCard(run.state, HELI)).toBeUndefined();
    expect(inDiscard(run.state, HELI)).toHaveLength(1);
    expect(inst(run.state, hero(run.state, P1)).damage).toBe(1);
    expect(inst(run.state, ally).damage).toBe(1);
    expect(inst(run.state, "m1" as InstanceId).damage).toBe(1);
    expect(inst(run.state, hero(run.state, P2)).damage).toBe(0);
    expect(inst(run.state, "m2" as InstanceId).damage).toBe(0);
    expect(inst(run.state, villainOf(run.state)).damage).toBe(0);
  });

  it("WHEN DEFEATED by P2: it is P2's hero and P2's minion that are hurt, and P1's side is untouched", () => {
    const arrived = arena();
    const { scheme, ally } = arrived;
    // P1 ends the turn, so it is P2's turn to thwart.
    const state = driveEventsPicking(WAVE10_DEPS, arrived.state, firstLegal, endTurn(P1)).state;
    expect(state.step).toMatchObject({ phase: "player", activePlayerId: P2 });
    const run = heroThwarts(WAVE10_DEPS, state, scheme, { player: P2 });
    expect(inst(run.state, hero(run.state, P2)).damage).toBe(1);
    expect(inst(run.state, "m2" as InstanceId).damage).toBe(1);
    expect(inst(run.state, hero(run.state, P1)).damage).toBe(0);
    expect(inst(run.state, ally).damage).toBe(0);
    expect(inst(run.state, "m1" as InstanceId).damage).toBe(0);
  });

  it("WHEN DEFEATED: a thwart that leaves threat on it deals no damage", () => {
    const { state, scheme, ally } = arena(2);
    const run = heroThwarts(WAVE10_DEPS, state, scheme, { player: P1 });
    expect(inst(run.state, scheme).threat).toBe(1);
    expect(inPlayCard(run.state, HELI)).toBe(scheme);
    expect(inst(run.state, hero(run.state, P1)).damage).toBe(0);
    expect(inst(run.state, ally).damage).toBe(0);
    expect(inst(run.state, "m1" as InstanceId).damage).toBe(0);
  });

  it("BOOST: 2 icons on the activating enemy's attack (Rhino ATK 2 + 2)", () => {
    const run = villainPhase(game(), [HELI, FILLER_A]);
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 2, damageDealt: 4 }]);
  });
});
