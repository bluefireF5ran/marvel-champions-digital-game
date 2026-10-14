import { CW_CARDS, cardId, trait, type HeroIdentityCard } from "@mc/content";
import { applyCommand, hasKeyword, legalActions, type GameState, type InstanceId, type PlayerId } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { validateDefinition } from "../../../dsl/validate.js";
import {
  P1,
  P2,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  patchInstance,
  playerOf,
  runWith,
  settle,
  stackEncounterDeck,
  use,
  type Picker,
} from "../../../testing/harness.js";
import { driveEventsPicking } from "../../../testing/staging.js";
import { WAVE10_DEPS, engageMinion, tigraGame, tigraHeroGame } from "../../testing.js";
import { TIGRA_IDENTITY, TIGRA_IDENTITY_SKIPPED } from "./identity.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Tigra (56001a) and Greer Nelson (56001b), docs/phase7-wave10-box-heroes.md B3.7, B3.8 and B7.1. The printed precon
 * `tigra-aggression` against Core's Rhino. Hero face: ATK 2, THW 1, DEF 3, hand size 5, 10 hit points; alter-ego face:
 * REC 3, hand size 6. Hunted (56007) is another module's card: here only its presence as an attachment is used, put on
 * a minion by surgery.
 */
const CONSTANT = "56001a.tigra-constant";
const ON_THE_HUNT = "56001a.on-the-hunt";
const UNDERCOVER = "56001b.undercover-work";
const HUNTED = "56007";
const MERCENARY = "01101"; // Core minion with guard
const SHOCKER = "01103"; // Core minion without guard
const ADVANCE = "01186"; // Core treachery: "The villain schemes", two copies

const IDENTITY = CW_CARDS.find((c) => c.id === cardId("56001a")) as HeroIdentityCard;
const codeOf = (s: GameState, id: InstanceId): string => inst(s, id).cardId as string;
const villainOf = (s: GameState): InstanceId => s.activeVillainId!;

/** A copy of Hunted from the first seat's deck attached to `minion`, controlled by `controller` (surgery: no play, no cost). */
function withHunted(state: GameState, minion: InstanceId, controller: PlayerId = P1): GameState {
  const owner = P1;
  const id = playerOf(state, owner).deck.find((i) => codeOf(state, i) === HUNTED)!;
  expect(id, "Hunted in the deck").toBeDefined();
  const moved: GameState = {
    ...state,
    players: state.players.map((p) => (p.playerId === owner ? { ...p, deck: p.deck.filter((i) => i !== id) } : p)),
  };
  const attached = patchInstance(moved, id, { faceup: true, controllerId: controller, attachedTo: minion });
  return patchInstance(attached, minion, { attachments: [...inst(attached, minion).attachments, id] });
}
const guards = (s: GameState, minion: InstanceId): boolean => hasKeyword(s, minion, "guard", WAVE10_DEPS);

const offeredAbilities = (s: GameState, player: PlayerId = P1): string[] => {
  const legal = legalActions(s, player, WAVE10_DEPS);
  if (legal.kind !== "turn") throw new Error(legal.kind);
  return legal.legal.flatMap((a) => (a.action.kind === "useAbility" ? [a.action.abilityId as string] : []));
};
const handCodes = (s: GameState, player: PlayerId = P1): string[] => playerOf(s, player).hand.map((i) => codeOf(s, i));

describe("Tigra identity registry", () => {
  it("every ability validates, with the printed timing", () => {
    for (const id of [CONSTANT, ON_THE_HUNT, UNDERCOVER])
      expect(validateDefinition(TIGRA_IDENTITY[id]!), id).toEqual([]);
    expect(TIGRA_IDENTITY[CONSTANT]!.trigger).toMatchObject({ kind: "constant" });
    expect(TIGRA_IDENTITY[ON_THE_HUNT]!.trigger).toMatchObject({ kind: "response", forced: false });
    expect(TIGRA_IDENTITY[UNDERCOVER]!.trigger).toMatchObject({ kind: "action", form: "alterEgo" });
    expect(TIGRA_IDENTITY[UNDERCOVER]!.limit).toEqual({ count: 1, period: "round" });
  });

  it("all three printed refs are registered and none is skipped", () => {
    expect(TIGRA_IDENTITY_SKIPPED).toEqual({});
    const printed = [...IDENTITY.hero.abilities, ...IDENTITY.alterEgo.abilities].map((a) => a.id as string);
    expect(printed.sort()).toEqual([CONSTANT, ON_THE_HUNT, UNDERCOVER].sort());
    expect(Object.keys(TIGRA_IDENTITY).sort()).toEqual(printed.sort());
  });

  it("data: hero ATK 2, THW 1, DEF 3, hand size 5, 10 hit points; alter ego REC 3, hand size 6; traits", () => {
    expect(IDENTITY.hp).toBe(10);
    expect(IDENTITY.hero).toMatchObject({ atk: 2, thw: 1, def: 3, handSize: 5 });
    expect(IDENTITY.alterEgo).toMatchObject({ rec: 3, handSize: 6 });
    expect(IDENTITY.hero.traits).toEqual([trait("AVENGER")]);
    expect(IDENTITY.alterEgo.traits).toEqual([trait("POLICE")]);
  });

  it("the game opens in alter-ego form with six cards in hand", () => {
    const s = tigraGame();
    expect(playerOf(s, P1).identity.form).toBe("alterEgo");
    expect(playerOf(s, P1).hand).toHaveLength(6);
  });
});

describe(`${CONSTANT}: each minion with a copy of Hunted attached loses guard`, () => {
  const HUNTED_MINION = "hunted-merc" as InstanceId;
  const PLAIN_MINION = "plain-merc" as InstanceId;
  const table = (extra: (s: GameState) => GameState = (s) => s): GameState => {
    const base = engageMinion(tigraHeroGame({ twoPlayers: true }), MERCENARY, HUNTED_MINION);
    return extra(engageMinion(base, MERCENARY, PLAIN_MINION));
  };

  it("control: both guard minions have guard before any Hunted is attached", () => {
    const s = table();
    expect(guards(s, HUNTED_MINION)).toBe(true);
    expect(guards(s, PLAIN_MINION)).toBe(true);
  });

  it("in hero form the minion with Hunted has no guard; the other minion keeps it", () => {
    const s = table((t) => withHunted(t, HUNTED_MINION));
    expect(guards(s, HUNTED_MINION)).toBe(false);
    expect(guards(s, PLAIN_MINION)).toBe(true);
  });

  it("a copy of Hunted another player controls counts (a copy is defined by title)", () => {
    const s = table((t) => withHunted(t, HUNTED_MINION, P2));
    expect(guards(s, HUNTED_MINION)).toBe(false);
  });

  it("in alter-ego form the same minion has guard again", () => {
    const hero = table((t) => withHunted(t, HUNTED_MINION));
    expect(guards(hero, HUNTED_MINION)).toBe(false);
    const alterEgo = {
      ...hero,
      players: hero.players.map((p) =>
        p.playerId === P1 ? { ...p, identity: { ...p.identity, form: "alterEgo" as const } } : p,
      ),
    } as GameState;
    expect(playerOf(alterEgo, P1).identity.form).toBe("alterEgo");
    expect(guards(alterEgo, HUNTED_MINION)).toBe(true);
  });

  it("a basic attack on the villain is refused behind a guard minion and allowed once Hunted is on it", () => {
    const attack = (s: GameState) =>
      applyCommand(
        s,
        {
          type: "basicAttack",
          playerId: P1,
          attackerInstanceId: identityOf(s, P1),
          targetInstanceId: villainOf(s),
        },
        WAVE10_DEPS,
      );
    const guarded = engageMinion(tigraHeroGame(), MERCENARY, "merc");
    expect(attack(guarded).ok).toBe(false);
    expect(attack(withHunted(guarded, "merc" as InstanceId)).ok).toBe(true);
  });
});

describe(`${ON_THE_HUNT}: Response: after the player phase begins, draw 1 card for each minion engaged with you (max 3)`, () => {
  /** Every engaged minion and the villain stunned, harmless cards stacked: the villain phase changes nothing else. */
  const quiet = (state: GameState, minions: number, player: PlayerId = P1): GameState => {
    let s = state;
    for (let n = 0; n < minions; n++) s = engageMinion(s, SHOCKER, `shocker-${player}-${n}`, player);
    for (const id of Object.keys(s.instances) as InstanceId[]) {
      if (s.instances[id]!.engagedWith === player || id === villainOf(s))
        s = patchInstance(s, id, { statuses: { ...inst(s, id).statuses, stunned: 1 } });
    }
    return stackEncounterDeck(s, ADVANCE, ADVANCE);
  };
  const picker =
    (take: boolean, offered: PlayerId[] = []): Picker =>
    (s) => {
      const choice = s.pendingChoice!;
      if (choice.prompt.kind !== "chooseTriggers") return firstLegal(s);
      const mine = choice.options.find((o) => o.optionId.includes(ON_THE_HUNT));
      if (mine) offered.push(choice.playerId);
      return mine && take ? [mine.optionId] : [];
    };
  const nextPlayerPhase = (state: GameState, pick: Picker): GameState =>
    settle(
      state.players.reduce((s, p) => runWith(WAVE10_DEPS, s, endTurn(p.playerId)), state),
      pick,
      undefined,
      WAVE10_DEPS,
    );

  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 3],
    [6, 3],
  ])("with %i engaged minion(s) she draws %i", (minions, drawn) => {
    const staged = quiet(tigraHeroGame(), minions);
    const declined = nextPlayerPhase(staged, picker(false));
    const taken = nextPlayerPhase(staged, picker(true));
    expect(playerOf(declined, P1).hand).toHaveLength(5);
    expect(playerOf(taken, P1).hand).toHaveLength(5 + drawn);
    expect(playerOf(taken, P1).deck).toHaveLength(playerOf(declined, P1).deck.length - drawn);
    expect(taken.step.phase).toBe("player");
  });

  it("is not offered with no minion engaged", () => {
    const offered: PlayerId[] = [];
    nextPlayerPhase(quiet(tigraHeroGame(), 0), picker(true, offered));
    expect(offered).toEqual([]);
    const control: PlayerId[] = [];
    nextPlayerPhase(quiet(tigraHeroGame(), 1), picker(true, control));
    expect(control).toEqual([P1]);
  });

  it("is not live as Greer Nelson (alter-ego form)", () => {
    const alterEgo = quiet(tigraGame(), 3);
    expect(playerOf(alterEgo, P1).identity.form).toBe("alterEgo");
    const offered: PlayerId[] = [];
    const after = nextPlayerPhase(alterEgo, picker(true, offered));
    expect(offered).toEqual([]);
    expect(playerOf(after, P1).hand).toHaveLength(6);
    expect(playerOf(nextPlayerPhase(quiet(tigraHeroGame(), 3), picker(true)), P1).hand).toHaveLength(8);
  });

  it("in a two-player game it answers once, for Tigra's seat, counting only the minions engaged with her", () => {
    const staged = quiet(quiet(tigraHeroGame({ twoPlayers: true }), 2, P1), 3, P2);
    const offered: PlayerId[] = [];
    const after = nextPlayerPhase(staged, picker(true, offered));
    expect(offered).toEqual([P1]);
    expect(playerOf(after, P1).hand).toHaveLength(5 + 2);
    expect(playerOf(after, P2).hand).toHaveLength(playerOf(nextPlayerPhase(staged, picker(false)), P2).hand.length);
  });
});

describe(`${UNDERCOVER}: Action: search your deck and discard pile for a copy of Hunted, add it to your hand (once per round)`, () => {
  const undercover = (s: GameState, pick: Picker = firstLegal) =>
    driveEventsPicking(WAVE10_DEPS, s, pick, use(P1, identityOf(s, P1), UNDERCOVER, []));
  const huntedIn = (s: GameState, zone: "hand" | "deck" | "discard"): number =>
    playerOf(s, P1)[zone].filter((i) => codeOf(s, i) === HUNTED).length;

  it("is offered in alter-ego form only", () => {
    expect(offeredAbilities(tigraGame())).toContain(UNDERCOVER);
    expect(offeredAbilities(tigraHeroGame())).not.toContain(UNDERCOVER);
  });

  it("adds a Hunted from the deck to the hand and shuffles the deck", () => {
    const s = tigraGame();
    const before = { hand: huntedIn(s, "hand"), deck: huntedIn(s, "deck"), deckSize: playerOf(s, P1).deck.length };
    expect(before.hand + before.deck).toBe(3);
    expect(before.deck).toBeGreaterThan(0);
    const run = undercover(s);
    expect(huntedIn(run.state, "hand")).toBe(before.hand + 1);
    expect(huntedIn(run.state, "deck")).toBe(before.deck - 1);
    expect(playerOf(run.state, P1).hand).toHaveLength(playerOf(s, P1).hand.length + 1);
    expect(playerOf(run.state, P1).deck).toHaveLength(before.deckSize - 1);
    expect(run.events.filter((e) => e.type === "deckShuffled")).toHaveLength(1);
  });

  it("finds a Hunted in the discard pile when neither the deck nor the hand holds one", () => {
    const s = tigraGame();
    const copies = [...playerOf(s, P1).deck, ...playerOf(s, P1).hand].filter((i) => codeOf(s, i) === HUNTED);
    expect(copies).toHaveLength(3);
    const inDiscard: GameState = {
      ...s,
      players: s.players.map((p) =>
        p.playerId === P1
          ? {
              ...p,
              deck: p.deck.filter((i) => !copies.includes(i)),
              hand: p.hand.filter((i) => !copies.includes(i)),
              discard: [...p.discard, ...copies],
            }
          : p,
      ),
    };
    expect(huntedIn(inDiscard, "deck") + huntedIn(inDiscard, "hand")).toBe(0);
    const run = undercover(inDiscard);
    expect(huntedIn(run.state, "hand")).toBe(1);
    expect(huntedIn(run.state, "discard")).toBe(2);
  });

  it("is limited to once per round", () => {
    const first = undercover(tigraGame());
    expect(first.state.abilityUses[`${identityOf(first.state, P1)}:${UNDERCOVER}`]).toBe(1);
    expect(offeredAbilities(first.state)).not.toContain(UNDERCOVER);
    const again = applyCommand(first.state, use(P1, identityOf(first.state, P1), UNDERCOVER, []), WAVE10_DEPS);
    expect(again.ok).toBe(false);
  });

  it("with no copy of Hunted left anywhere it adds nothing, and the deck is still shuffled", () => {
    const s = tigraGame();
    const strip = (ids: readonly InstanceId[]) => ids.filter((i) => codeOf(s, i) !== HUNTED);
    const empty: GameState = {
      ...s,
      players: s.players.map((p) =>
        p.playerId === P1 ? { ...p, deck: strip(p.deck), hand: strip(p.hand), discard: strip(p.discard) } : p,
      ),
    };
    const run = undercover(empty);
    expect(handCodes(run.state)).toEqual(handCodes(empty));
    expect(run.events.filter((e) => e.type === "deckShuffled")).toHaveLength(1);
  });

  it("a second player's seat is untouched", () => {
    const s = tigraGame({ twoPlayers: true });
    const run = undercover(s);
    expect(playerOf(run.state, P2).hand).toEqual(playerOf(s, P2).hand);
    expect(playerOf(run.state, P2).deck).toEqual(playerOf(s, P2).deck);
  });
});
