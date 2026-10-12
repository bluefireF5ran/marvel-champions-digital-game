import { CW_CARDS, cardId, trait, type HeroIdentityCard } from "@mc/content";
import {
  applyCommand,
  cannotEnterPlay as barredFromPlay,
  cardsInPlay,
  characterProfile,
  legalActions,
  type GameEvent,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { validateDefinition } from "../../../dsl/validate.js";
import {
  P1,
  P2,
  firstLegal,
  identityOf,
  inst,
  moveToHand,
  patchInstance,
  payWith,
  play,
  playerOf,
  use,
  type Picker,
} from "../../../testing/harness.js";
import { driveEventsPicking } from "../../../testing/staging.js";
import { WAVE10_DEPS, hulklingGame, hulklingHeroGame } from "../../testing.js";
import { HULKLING_IDENTITY, HULKLING_IDENTITY_SKIPPED } from "./identity.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Hulkling (56029a) and Teddy Altman (56029b), docs/phase7-wave10-box-heroes.md B3.4, B3.9 and B7.2. The printed precon
 * `hulkling-protection` against Core's Rhino. Hero face: ATK 1, THW 1, DEF 1, hand size 5, 13 hit points; alter-ego
 * face: REC 4, hand size 5. The four Shapeshift upgrades are the deck's own: Winged Shape 56032 (+1 THW, +1 ATK, +1
 * DEF), Hulk Shape 56033 (+2 ATK, +1 DEF), Armored Shape 56034, Imitation Shape 56035; Alien Physiology 56036 is a
 * Superpower upgrade, not a shape.
 */
const CHOSEN_SHAPE = "56029a.chosen-shape";
const TEDDY = "56029b.teddy-altman-constant";
const SHAPE_CHANGER = "56029b.shape-changer";
const WINGED = "56032";
const HULK = "56033";
const ARMORED = "56034";
const IMITATION = "56035";
const ALIEN = "56036";
const SHAPES = [WINGED, HULK, ARMORED, IMITATION];

const IDENTITY = CW_CARDS.find((c) => c.id === cardId("56029a")) as HeroIdentityCard;
const codeOf = (s: GameState, id: InstanceId): string => inst(s, id).cardId as string;
const attachedCodes = (s: GameState, player: PlayerId = P1): string[] =>
  inst(s, identityOf(s, player)).attachments.map((i) => codeOf(s, i));
const discardCodes = (s: GameState, player: PlayerId = P1): string[] =>
  playerOf(s, player).discard.map((i) => codeOf(s, i));
const hero = (s: GameState) => characterProfile(s, identityOf(s), WAVE10_DEPS)!;
const resolved = (events: readonly GameEvent[], ability: string) =>
  events.filter((e) => e.type === "abilityResolved" && e.abilityId === ability);
const exhaustedIdentity = (s: GameState): GameState => patchInstance(s, identityOf(s), { exhausted: true });

/** Surgery: `code` (a copy from player 1's deck) attached to `player`'s identity as an upgrade they control. */
function shapeInPlay(state: GameState, code: string, player: PlayerId = P1) {
  const given = moveToHand(state, P1, code);
  const id = given.ids[0]!;
  const host = identityOf(given.state, player);
  const staged: GameState = {
    ...given.state,
    players: given.state.players.map((p) => (p.playerId === P1 ? { ...p, hand: p.hand.filter((i) => i !== id) } : p)),
  };
  const placed = patchInstance(staged, id, { faceup: true, controllerId: player, attachedTo: host });
  return { id, state: patchInstance(placed, host, { attachments: [...inst(placed, host).attachments, id] }) };
}

/** `code` moved to player 1's hand, and the command that plays it paying with `cost` other cards. */
function playing(state: GameState, code: string, cost = 2) {
  const given = moveToHand(state, P1, code);
  const [id] = given.ids as [InstanceId];
  return { id, state: given.state, command: play(P1, id, payWith(given.state, P1, cost, [id])) };
}
const playUpgrade = (state: GameState, code: string, cost = 2, pick: Picker = firstLegal) => {
  const p = playing(state, code, cost);
  return { id: p.id, ...driveEventsPicking(WAVE10_DEPS, p.state, pick, p.command) };
};
const offeredPlays = (s: GameState, id: InstanceId): boolean => {
  const listed = legalActions(s, P1, WAVE10_DEPS);
  if (listed.kind !== "turn") throw new Error(listed.kind);
  return listed.legal.some((a) => a.action.kind === "playCard" && a.action.instanceId === id);
};
const offeredAbilities = (s: GameState): string[] => {
  const listed = legalActions(s, P1, WAVE10_DEPS);
  if (listed.kind !== "turn") throw new Error(listed.kind);
  return listed.legal.flatMap((a) => (a.action.kind === "useAbility" ? [a.action.abilityId as string] : []));
};

describe("Hulkling identity registry", () => {
  it("every ability validates, with the printed timing", () => {
    for (const id of [CHOSEN_SHAPE, TEDDY, SHAPE_CHANGER])
      expect(validateDefinition(HULKLING_IDENTITY[id]!), id).toEqual([]);
    expect(HULKLING_IDENTITY[CHOSEN_SHAPE]!.trigger).toMatchObject({ kind: "response", forced: true });
    expect(HULKLING_IDENTITY[TEDDY]!.trigger).toMatchObject({ kind: "constant" });
    expect(HULKLING_IDENTITY[SHAPE_CHANGER]!.trigger).toMatchObject({ kind: "action", form: "alterEgo" });
    expect(HULKLING_IDENTITY[SHAPE_CHANGER]!.limit).toEqual({ count: 1, period: "round" });
  });

  it("all three printed refs are registered and none is skipped", () => {
    expect(HULKLING_IDENTITY_SKIPPED).toEqual({});
    const printed = [...IDENTITY.hero.abilities, ...IDENTITY.alterEgo.abilities].map((a) => a.id as string);
    expect(printed.sort()).toEqual([CHOSEN_SHAPE, TEDDY, SHAPE_CHANGER].sort());
    expect(Object.keys(HULKLING_IDENTITY).sort()).toEqual(printed.sort());
  });

  it("data: hero ATK 1, THW 1, DEF 1, hand size 5, 13 hit points; alter ego REC 4, hand size 5; traits", () => {
    expect(IDENTITY.hp).toBe(13);
    expect(IDENTITY.hero).toMatchObject({ atk: 1, thw: 1, def: 1, handSize: 5 });
    expect(IDENTITY.alterEgo).toMatchObject({ rec: 4, handSize: 5 });
    expect(IDENTITY.hero.traits).toEqual([trait("AVENGER"), trait("KREE"), trait("SKRULL")]);
    expect(IDENTITY.alterEgo.traits).toEqual([trait("KREE"), trait("SKRULL")]);
  });

  it("the game opens in alter-ego form with five cards in hand and no upgrade in play", () => {
    const s = hulklingGame();
    expect(playerOf(s, P1).identity.form).toBe("alterEgo");
    expect(playerOf(s, P1).hand).toHaveLength(5);
    expect(attachedCodes(s)).toEqual([]);
  });
});

describe(`${CHOSEN_SHAPE}: Forced Response: after a Shapeshift upgrade enters play under your control, discard each other one and ready Hulkling`, () => {
  it("with Hulk Shape in play and Hulkling exhausted, playing Winged Shape discards Hulk Shape and readies him", () => {
    const hulk = shapeInPlay(hulklingHeroGame(), HULK);
    const start = exhaustedIdentity(hulk.state);
    expect(hero(start)).toMatchObject({ atk: 3, thw: 1, def: 2 });
    const run = playUpgrade(start, WINGED);
    expect(attachedCodes(run.state)).toEqual([WINGED]);
    expect(playerOf(run.state, P1).discard).toContain(hulk.id);
    expect(cardsInPlay(run.state)).not.toContain(hulk.id);
    expect(inst(run.state, identityOf(run.state)).exhausted).toBe(false);
    expect(resolved(run.events, CHOSEN_SHAPE)).toHaveLength(1);
    // Winged Shape alone: +1 THW, +1 ATK, +1 DEF.
    expect(hero(run.state)).toMatchObject({ atk: 2, thw: 2, def: 2 });
  });

  it("the shape that entered stays and the one before it goes (Armored Shape over Imitation Shape)", () => {
    const first = shapeInPlay(hulklingHeroGame(), IMITATION);
    const run = playUpgrade(first.state, ARMORED);
    expect(attachedCodes(run.state)).toEqual([ARMORED]);
    expect(discardCodes(run.state).filter((c) => c === IMITATION)).toHaveLength(1);
  });

  it("with no other shape, it still readies exhausted Hulkling, and discards nothing", () => {
    const start = exhaustedIdentity(hulklingHeroGame());
    expect(inst(start, identityOf(start)).exhausted).toBe(true);
    const p = playing(start, WINGED);
    const paid = p.command.type === "playCard" ? p.command.payment.length : -1;
    expect(paid).toBe(2);
    const run = driveEventsPicking(WAVE10_DEPS, p.state, firstLegal, p.command);
    expect(attachedCodes(run.state)).toEqual([WINGED]);
    expect(inst(run.state, identityOf(run.state)).exhausted).toBe(false);
    // Only the two cards that paid for Winged Shape are in the discard pile.
    expect(playerOf(run.state, P1).discard).toHaveLength(playerOf(p.state, P1).discard.length + 2);
    expect(resolved(run.events, CHOSEN_SHAPE)).toHaveLength(1);
  });

  it("two shapes already in play (by surgery) are both discarded by a third", () => {
    const one = shapeInPlay(hulklingHeroGame(), HULK);
    const two = shapeInPlay(one.state, IMITATION);
    expect(attachedCodes(two.state)).toEqual([HULK, IMITATION]);
    const run = playUpgrade(two.state, WINGED);
    expect(attachedCodes(run.state)).toEqual([WINGED]);
    expect(discardCodes(run.state)).toEqual(expect.arrayContaining([HULK, IMITATION]));
  });

  it("an upgrade that is not a Shapeshift upgrade does not trigger it and is not discarded by it", () => {
    // Alien Physiology (cost 3, Superpower) entering: an exhausted Hulkling stays exhausted.
    const alone = playUpgrade(exhaustedIdentity(hulklingHeroGame()), ALIEN, 3);
    expect(attachedCodes(alone.state)).toEqual([ALIEN]);
    expect(inst(alone.state, identityOf(alone.state)).exhausted).toBe(true);
    expect(resolved(alone.events, CHOSEN_SHAPE)).toHaveLength(0);
    // And a shape entering beside it leaves it in play while readying him.
    const run = playUpgrade(alone.state, WINGED);
    expect(attachedCodes(run.state).sort()).toEqual([ALIEN, WINGED].sort());
    expect(inst(run.state, identityOf(run.state)).exhausted).toBe(false);
  });

  it("it is not heard in alter-ego form: Teddy plays a shape with none in play, and exhausted Teddy stays exhausted", () => {
    const run = playUpgrade(exhaustedIdentity(hulklingGame()), WINGED);
    expect(attachedCodes(run.state)).toEqual([WINGED]);
    expect(inst(run.state, identityOf(run.state)).exhausted).toBe(true);
    expect(resolved(run.events, CHOSEN_SHAPE)).toHaveLength(0);
  });

  it("only upgrades you control are discarded: a shape on the other player's hero stays", () => {
    const theirs = shapeInPlay(hulklingHeroGame({ twoPlayers: true }), HULK, P2);
    expect(inst(theirs.state, theirs.id).controllerId).toBe(P2);
    const run = playUpgrade(theirs.state, WINGED);
    expect(attachedCodes(run.state, P1)).toEqual([WINGED]);
    expect(attachedCodes(run.state, P2)).toEqual([HULK]);
    expect(cardsInPlay(run.state)).toContain(theirs.id);
  });
});

describe(`${TEDDY}: you cannot have more than 1 Shapeshift upgrade in play (January 11, 2026 - Ruling 1)`, () => {
  it("with Hulk Shape in play, Winged Shape is not offered and the refusal names Teddy Altman", () => {
    const hulk = shapeInPlay(hulklingGame(), HULK);
    const p = playing(hulk.state, WINGED);
    expect(offeredPlays(p.state, p.id)).toBe(false);
    const tried = applyCommand(p.state, p.command, WAVE10_DEPS);
    expect(tried.ok).toBe(false);
    if (tried.ok) return;
    expect(tried.error.message).toBe("Teddy Altman: Winged Shape cannot enter play");
  });

  it("it does not discard down: the first shape stays when the second is refused", () => {
    const hulk = shapeInPlay(hulklingGame(), HULK);
    const p = playing(hulk.state, WINGED);
    expect(applyCommand(p.state, p.command, WAVE10_DEPS).ok).toBe(false);
    expect(attachedCodes(p.state)).toEqual([HULK]);
    expect(discardCodes(p.state)).not.toContain(HULK);
  });

  it("with no shape in play, a shape is offered and enters play, and then the next one is refused", () => {
    const p = playing(hulklingGame(), WINGED);
    expect(offeredPlays(p.state, p.id)).toBe(true);
    const run = driveEventsPicking(WAVE10_DEPS, p.state, firstLegal, p.command);
    expect(attachedCodes(run.state)).toEqual([WINGED]);
    const next = playing(run.state, ARMORED);
    expect(offeredPlays(next.state, next.id)).toBe(false);
  });

  it("in hero form the face is down: a second shape is played and Chosen Shape discards the first", () => {
    const hulk = shapeInPlay(hulklingHeroGame(), HULK);
    const p = playing(hulk.state, WINGED);
    expect(offeredPlays(p.state, p.id)).toBe(true);
    const run = driveEventsPicking(WAVE10_DEPS, p.state, firstLegal, p.command);
    expect(attachedCodes(run.state)).toEqual([WINGED]);
  });

  it("flipping to hero form with one shape in play changes nothing", () => {
    const hulk = shapeInPlay(hulklingGame(), HULK);
    const run = driveEventsPicking(WAVE10_DEPS, hulk.state, firstLegal, { type: "changeForm", playerId: P1 });
    expect(playerOf(run.state, P1).identity.form).toBe("hero");
    expect(attachedCodes(run.state)).toEqual([HULK]);
  });

  it("only Teddy's player is stopped: with a shape in play in a two-player game, the rule names seat 1 alone", () => {
    const hulk = shapeInPlay(hulklingGame({ twoPlayers: true }), HULK);
    const winged = playing(hulk.state, WINGED);
    expect(offeredPlays(winged.state, winged.id)).toBe(false);
    expect(barredFromPlay(winged.state, WAVE10_DEPS, winged.id, P1)).toBe(true);
    expect(barredFromPlay(winged.state, WAVE10_DEPS, winged.id, P2)).toBe(false);
  });
});

describe(`${SHAPE_CHANGER}: Action: search your deck and discard pile for a Shapeshift upgrade and add it to your hand (once per round)`, () => {
  const shapesIn = (s: GameState, zone: "hand" | "deck" | "discard"): InstanceId[] =>
    playerOf(s, P1)[zone].filter((i) => SHAPES.includes(codeOf(s, i)));
  const choosing =
    (wanted: InstanceId): Picker =>
    (s) => {
      const option = s.pendingChoice!.options.find((o) => o.ref.kind === "card" && o.ref.instanceId === wanted);
      return option ? [option.optionId] : firstLegal(s);
    };
  const fetch = (s: GameState, pick: Picker = firstLegal) =>
    driveEventsPicking(WAVE10_DEPS, s, pick, use(P1, identityOf(s, P1), SHAPE_CHANGER, []));
  /** Every shape out of the hand into the deck, so the search has a known pool. */
  const shapesInDeckOnly = (s: GameState): GameState => ({
    ...s,
    players: s.players.map((p) => {
      if (p.playerId !== P1) return p;
      const isShape = (i: InstanceId) => SHAPES.includes(codeOf(s, i));
      return { ...p, hand: p.hand.filter((i) => !isShape(i)), deck: [...p.deck, ...p.hand.filter(isShape)] };
    }),
  });

  it("is offered in alter-ego form only", () => {
    expect(offeredAbilities(hulklingGame())).toContain(SHAPE_CHANGER);
    expect(offeredAbilities(hulklingHeroGame())).not.toContain(SHAPE_CHANGER);
  });

  it("adds the shape the player picks from the deck to the hand and shuffles the deck", () => {
    const s = shapesInDeckOnly(hulklingGame());
    const pool = shapesIn(s, "deck");
    expect(pool).toHaveLength(4);
    const wanted = pool[2]!;
    const run = fetch(s, choosing(wanted));
    expect(shapesIn(run.state, "hand")).toEqual([wanted]);
    expect(shapesIn(run.state, "deck")).toHaveLength(3);
    expect(playerOf(run.state, P1).hand).toHaveLength(playerOf(s, P1).hand.length + 1);
    expect(playerOf(run.state, P1).deck).toHaveLength(playerOf(s, P1).deck.length - 1);
    expect(run.events.filter((e) => e.type === "deckShuffled")).toHaveLength(1);
  });

  it("finds a shape in the discard pile when the deck holds none", () => {
    const s = shapesInDeckOnly(hulklingGame());
    const all = shapesIn(s, "deck");
    const inDiscard: GameState = {
      ...s,
      players: s.players.map((p) =>
        p.playerId === P1 ? { ...p, deck: p.deck.filter((i) => !all.includes(i)), discard: [...p.discard, ...all] } : p,
      ),
    };
    const run = fetch(inDiscard, choosing(all[1]!));
    expect(shapesIn(run.state, "hand")).toEqual([all[1]]);
    expect(shapesIn(run.state, "discard")).toHaveLength(3);
  });

  it("is limited to once per round", () => {
    const first = fetch(shapesInDeckOnly(hulklingGame()));
    expect(first.state.abilityUses[`${identityOf(first.state, P1)}:${SHAPE_CHANGER}`]).toBe(1);
    expect(offeredAbilities(first.state)).not.toContain(SHAPE_CHANGER);
    const again = applyCommand(first.state, use(P1, identityOf(first.state, P1), SHAPE_CHANGER, []), WAVE10_DEPS);
    expect(again.ok).toBe(false);
  });

  it("with no shape left anywhere it adds nothing, and the deck is still shuffled", () => {
    const s = hulklingGame();
    const strip = (ids: readonly InstanceId[]) => ids.filter((i) => !SHAPES.includes(codeOf(s, i)));
    const empty: GameState = {
      ...s,
      players: s.players.map((p) =>
        p.playerId === P1 ? { ...p, deck: strip(p.deck), hand: strip(p.hand), discard: strip(p.discard) } : p,
      ),
    };
    const run = fetch(empty);
    expect(playerOf(run.state, P1).hand).toEqual(playerOf(empty, P1).hand);
    expect(run.events.filter((e) => e.type === "deckShuffled")).toHaveLength(1);
  });

  it("a second player's seat is untouched", () => {
    const s = shapesInDeckOnly(hulklingGame({ twoPlayers: true }));
    const run = fetch(s);
    expect(playerOf(run.state, P2).hand).toEqual(playerOf(s, P2).hand);
    expect(playerOf(run.state, P2).deck).toEqual(playerOf(s, P2).deck);
  });
});
