import { CORE_CARDS, TT_CARDS, cardId, encounterSetId, type AnyCard } from "@mc/content";
import {
  applyCommand,
  createGame,
  hasKeyword,
  keywordTotal,
  type Command,
  type EngineDeps,
  type GameEvent,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { coreScenario } from "../../core/setup.js";
import { dealDamage, defineAbilities, each, mergeRegistries, query, whenRevealed } from "../../dsl/index.js";
import { validateDefinition } from "../../dsl/validate.js";
import {
  P1,
  P2,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  moveToHand,
  patchInstance,
  playerOf,
  settle,
  stackEncounterDeck,
  use,
  type Picker,
} from "../../testing/harness.js";
import { driveEventsPicking, encounterCardInVillainArea, withForm } from "../../testing/staging.js";
import { engageMinion } from "../../wave6/mut_gen/project-wideawake-testing.js";
import { WAVE8_ABILITIES } from "../../wave8/index.js";
import { wave9Scenario } from "../setup.js";
import {
  BLANK,
  CAPTAIN_MARVEL,
  CHARGE,
  FILLER_A,
  FILLER_B,
  ONE_ICON,
  SPIDER_MAN,
  attacksBy,
  codeOf,
  heroForm,
  inPlayCard,
  types,
  type Seats,
} from "../testing.js";
import { TT_ASPECT_BASIC } from "./aspect-basic.js";
import { TRICKSTER_MAGIC, TRICKSTER_MAGIC_SKIPPED } from "./trickster-magic.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Trickster Magic (55056 to 55062; docs/phase7-wave9.md sections 3.57, 3.70, 3.71 and 8.4 item 64) on the real cards.
 * Rhino (Core, standard) against Core starter decks, the set's cards added to the encounter deck by hand, so the
 * engine sets the four linked allies aside at setup exactly as it does for a scenario that uses the set. Minions are
 * placed with `engageMinion` (surgery) and defeated with a real basic attack at the brink of death; side schemes
 * sit where a reveal would leave them, Love Triangle is revealed for real. A hand-made treachery, "Smite", deals 99
 * damage to every minion When Revealed: the defeat of a minion by an encounter card, with no defeating player.
 */
const ABSORBING = "55056";
const TITANIA = "55057";
const WHIRLWIND = "55058";
const ZZZAX = "55059";
const TANGO = "55060";
const PUPPET = "55061";
const LOVE = "55062";
const ALLIES = ["55063", "55064", "55065", "55066"];
const REFS = [
  "55056.absorbing-man-constant",
  "55056.when-defeated",
  "55057.titania-constant",
  "55057.when-defeated",
  "55058.whirlwind-forced-response",
  "55058.when-defeated",
  "55059.when-revealed",
  "55059.when-defeated",
  "55060.the-trickster-tango-constant",
  "55060.boost",
  "55061.puppet-master-constant",
  "55061.puppet-master-constant-2",
  "55062.love-triangle-constant",
  "55062.love-triangle-constant-2",
  "55062.love-triangle-action",
];
/** Core cards used as stand-ins: allies Black Cat (cost 2), Spider-Woman (3), Hellcat (3); supports; a mental card. */
/** Core side scheme Breakin' & Takin' (hazard icon, no stalwart): a second side scheme. */
const SIDE = "01107";
const BLACK_CAT = "01002";
const SPIDER_WOMAN = "01011";
const HELLCAT = "01020";
const MENTAL_CARD = "01084";

/** A treachery made for this test: When Revealed it deals 99 damage to each minion, an encounter card's own damage. */
const SMITE = "99001";
const SMITE_CARD = {
  ...CORE_CARDS.find((c) => (c.id as string) === BLANK)!,
  id: cardId(SMITE),
  name: "Smite",
  abilities: [{ id: "99001.when-revealed" }],
} as unknown as AnyCard;
const SMITE_REGISTRY = defineAbilities({
  "99001.when-revealed": whenRevealed(dealDamage(99, each(query("minion")))),
});

const DEPS: EngineDeps = {
  abilities: mergeRegistries(WAVE8_ABILITIES, TRICKSTER_MAGIC, TT_ASPECT_BASIC, SMITE_REGISTRY),
};
const POOL: readonly AnyCard[] = [...CORE_CARDS, ...TT_CARDS, SMITE_CARD];
const TT_BY_ID = new Map(TT_CARDS.map((c) => [c.id as string, c as unknown as Record<string, unknown>]));
const dataOf = (code: string) => TT_BY_ID.get(code)!;
const coreCard = (code: string) =>
  CORE_CARDS.find((c) => (c.id as string) === code) as unknown as Record<string, number>;
const SET_COPIES = TT_CARDS.filter(
  (c) => "encounterSetIds" in c && c.encounterSetIds.includes(encounterSetId("trickster_magic")),
);

function setupGame(players: Seats = [SPIDER_MAN], difficulty: "standard" | "expert" = "standard"): GameState {
  const config = coreScenario("rhino", { players, seed: 1, difficulty, modularSetIds: [], cardPool: POOL });
  const copies = SET_COPIES.flatMap((c) => Array.from({ length: c.quantityInSet }, () => c.id));
  const created = createGame({ ...config, encounterDeck: [...config.encounterDeck, ...copies, cardId(SMITE)] }, DEPS);
  if (!created.ok) throw new Error(created.error.message);
  return settle(created.state, firstLegal, (s) => s.step.phase === "player", DEPS);
}

const asideCodes = (s: GameState): string[] => s.encounterSetAside.map((id) => codeOf(s, id));
const victoryCodes = (s: GameState): string[] => s.victoryDisplay.map((id) => codeOf(s, id));
const playAreaCodes = (s: GameState, p: PlayerId): string[] => playerOf(s, p).playArea.map((id) => codeOf(s, id));
const idIn = (s: GameState, p: PlayerId, code: string): InstanceId =>
  playerOf(s, p).playArea.find((id) => codeOf(s, id) === code)!;
const villainOf = (s: GameState): InstanceId => s.villains[0]!.instanceId;
/** Rhino stunned: his villain-phase attack only discards the stun, so the damage a test reads is its minion's. */
const withStunnedVillain = (s: GameState): GameState =>
  patchInstance(s, villainOf(s), { statuses: { ...inst(s, villainOf(s)).statuses, stunned: 1 } });
/** It is `player`'s turn (a two-player game opens on player 1's). */
const asActive = (s: GameState, player: PlayerId): GameState => ({
  ...s,
  step: { ...s.step, activePlayerId: player } as GameState["step"],
});
const heroDamage = (s: GameState, p: PlayerId = P1): number => inst(s, identityOf(s, p)).damage;

/** A copy of `code` put straight into the player's play area (relabels a spare deck card; surgery, no enter-play). */
function intoPlay(state: GameState, code: string, player: PlayerId = P1, spare = 1) {
  const owner = playerOf(state, player);
  const id = owner.deck[owner.deck.length - spare]!;
  const relabeled = patchInstance(state, id, {
    cardId: cardId(code),
    faceup: true,
    controllerId: player,
    exhausted: false,
  });
  return {
    id,
    state: {
      ...relabeled,
      players: relabeled.players.map((p) =>
        p.playerId === player ? { ...p, deck: p.deck.filter((i) => i !== id), playArea: [...p.playArea, id] } : p,
      ),
    },
  };
}
/** The codes in order, each into the player's play area. */
function withInPlay(state: GameState, codes: readonly string[], player: PlayerId = P1): GameState {
  return codes.reduce((s, code, i) => intoPlay(s, code, player, i + 1 + (player === P1 ? 0 : 20)).state, state);
}

/** The villain phase with `stack` on the encounter deck top first (boost cards first, then the cards dealt). */
function villainPhase(state: GameState, stack: readonly string[], pick: Picker = firstLegal) {
  return driveEventsPicking(
    DEPS,
    stackEncounterDeck(state, ...stack),
    pick,
    ...state.players.map((p) => endTurn(p.playerId)),
  );
}
/** Defends with `defender` whenever it is offered, and answers every other prompt as `firstLegal` does. */
const defendingWith =
  (defender: InstanceId): Picker =>
  (s) => {
    const choice = s.pendingChoice!;
    if (choice.prompt.kind !== "declareDefender") return firstLegal(s);
    return choice.options.some((o) => o.optionId === defender) ? [defender] : ["decline"];
  };

/** Engages `code` with a player and defeats it with a basic attack from `attacker`'s hero (a real defeat). */
function defeatedBy(state: GameState, code: string, attacker: PlayerId = P1, engagedWith: PlayerId = attacker) {
  const { state: staged, id } = engageMinion(
    asActive(withForm(state, { heroForm: 0 }, attacker), attacker),
    code,
    engagedWith,
  );
  const hit = patchInstance(staged, id, { damage: 99 });
  return {
    id,
    ...driveEventsPicking(DEPS, hit, firstLegal, {
      type: "basicAttack",
      playerId: attacker,
      attackerInstanceId: identityOf(hit, attacker),
      targetInstanceId: id,
    }),
  };
}
const ownership = (s: GameState, p: PlayerId, code: string) => {
  const ally = inst(s, idIn(s, p, code));
  return [ally.exhausted, ally.controllerId, ally.ownerId];
};

describe("registry", () => {
  it("registers the 15 refs of the seven cards, each a valid definition, and skips none", () => {
    expect(Object.keys(TRICKSTER_MAGIC).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(TRICKSTER_MAGIC)) expect(validateDefinition(def), id).toEqual([]);
    expect(Object.keys(TRICKSTER_MAGIC_SKIPPED)).toEqual([]);
  });

  it("the data names exactly these refs for the seven cards", () => {
    const refs = [ABSORBING, TITANIA, WHIRLWIND, ZZZAX, TANGO, PUPPET, LOVE].flatMap((code) =>
      ((dataOf(code).abilities ?? []) as { id: string }[]).map((a) => a.id),
    );
    expect(refs.sort()).toEqual([...REFS].sort());
  });

  it("the set holds one of each of the seven cards; setup sets the four allies aside once each, owned by nobody, in no deck", () => {
    expect(SET_COPIES.map((c) => [c.id as string, c.quantityInSet]).sort()).toEqual(
      [ABSORBING, TITANIA, WHIRLWIND, ZZZAX, TANGO, PUPPET, LOVE].map((code) => [code, 1]),
    );
    const s = setupGame();
    expect(asideCodes(s).sort()).toEqual([...ALLIES].sort());
    expect(s.encounterSetAside.every((id) => s.instances[id]!.ownerId === null)).toBe(true);
    const p = playerOf(s, P1);
    expect([...p.hand, ...p.deck].some((id) => ALLIES.includes(codeOf(s, id)))).toBe(false);
  });
});

describe("the four minions' data", () => {
  it.each([
    [ABSORBING, 1, 2, 7, 2, ["guard", "victory"]],
    [TITANIA, 3, 1, 8, 3, ["steady", "victory"]],
    [WHIRLWIND, 1, 2, 6, 1, ["quickstrike", "victory"]],
    [ZZZAX, 2, 1, 6, 2, ["retaliate", "victory"]],
  ] as const)(
    "%s: ATK %i, SCH %i, %i hit points, %i boost icons, keywords %j",
    (code, atk, sch, hp, icons, keywords) => {
      const card = dataOf(code) as unknown as {
        type: string;
        atk: number;
        sch: number;
        hp: number;
        boostIcons: number;
        unique: boolean;
        keywords: { name: string; value?: number }[];
      };
      expect([card.type, card.atk, card.sch, card.hp, card.boostIcons, card.unique]).toEqual([
        "minion",
        atk,
        sch,
        hp,
        icons,
        true,
      ]);
      expect(card.keywords.map((k) => k.name)).toEqual(keywords);
      expect(card.keywords.find((k) => k.name === "victory")?.value).toBe(1);
    },
  );
});

describe("Absorbing Man (55056)", () => {
  /** The ATK Absorbing Man attacks with in a villain phase against hero-form player 1 holding `inPlay`. */
  function atkWith(inPlay: readonly string[]) {
    const staged = engageMinion(withInPlay(heroForm(setupGame()), inPlay), ABSORBING, P1);
    const run = villainPhase(staged.state, [BLANK, FILLER_A]);
    return attacksBy(run.state, run.events, ABSORBING)[0]!.baseAtk;
  }

  it("CONSTANT: with no card in play he attacks with his printed 1 ATK", () => {
    expect(atkWith([])).toBe(1);
  });

  it("CONSTANT: +X ATK, X the printed cost of the highest-cost card you control (Aunt May 1, Black Cat 2, Pepper Potts 3, Avengers Mansion 4)", () => {
    expect(atkWith(["01006"])).toBe(2);
    expect(atkWith(["01006", BLACK_CAT])).toBe(3);
    expect(atkWith(["01006", BLACK_CAT, "01033"])).toBe(4);
    expect(atkWith(["01091", "01006"])).toBe(5);
  });

  it("CONSTANT: only the engaged player's cards count (player 2's Avengers Mansion adds nothing against player 1)", () => {
    const base = withInPlay(heroForm(setupGame([SPIDER_MAN, CAPTAIN_MARVEL]), P1, P2), ["01091"], P2);
    const staged = engageMinion(base, ABSORBING, P1);
    const run = villainPhase(staged.state, [BLANK, BLANK, FILLER_A, FILLER_B]);
    expect(attacksBy(run.state, run.events, ABSORBING)[0]!.baseAtk).toBe(1);
  });

  it("WHEN DEFEATED: the defeating player puts the set-aside Absorbing Man ally into play under their control, ready and owned by them; the minion is in the victory display", () => {
    const run = defeatedBy(setupGame(), ABSORBING);
    expect(ownership(run.state, P1, "55063")).toEqual([false, P1, P1]);
    expect(asideCodes(run.state).sort()).toEqual(["55064", "55065", "55066"]);
    expect(victoryCodes(run.state)).toEqual([ABSORBING]);
    expect(inPlayCard(run.state, ABSORBING)).toBeUndefined();
  });
});

describe("Titania (55057)", () => {
  /** Titania (3 ATK, no boost cards for a non-Villainous minion) attacks a hero defended by Black Cat. */
  function attackedBy(code: string) {
    const base = withInPlay(heroForm(setupGame()), [BLACK_CAT]);
    const staged = engageMinion(withStunnedVillain(base), code, P1);
    const defender = idIn(staged.state, P1, BLACK_CAT);
    const run = villainPhase(staged.state, [BLANK, FILLER_A], defendingWith(defender));
    return { run, defender };
  }

  it("CONSTANT: her attacks gain overkill: the defending ally takes damage and what exceeds its hit points hurts the hero", () => {
    const { run, defender } = attackedBy(TITANIA);
    const attack = attacksBy(run.state, run.events, TITANIA).find((a) => a.targetInstanceId === defender);
    expect(attack, "Black Cat defended").toBeDefined();
    expect(attack!.damageDealt).toBe(3);
    expect(heroDamage(run.state)).toBe(3 - coreCard(BLACK_CAT).hp!);
  });

  it("without the rule (Whirlwind's attack against the same defender) the hero takes nothing", () => {
    const { run } = attackedBy(WHIRLWIND);
    expect(heroDamage(run.state)).toBe(0);
  });

  it("WHEN DEFEATED: the Titania ally enters ready under the defeating player's control", () => {
    const run = defeatedBy(setupGame(), TITANIA);
    expect(ownership(run.state, P1, "55064")).toEqual([false, P1, P1]);
    expect(victoryCodes(run.state)).toEqual([TITANIA]);
  });
});

describe("Whirlwind (55058)", () => {
  it("FORCED RESPONSE: after he attacks you, you take 1 indirect damage for each side scheme in play (none: only the attack)", () => {
    const staged = engageMinion(withStunnedVillain(heroForm(setupGame())), WHIRLWIND, P1);
    const run = villainPhase(staged.state, [BLANK, FILLER_A]);
    const hit = attacksBy(run.state, run.events, WHIRLWIND)[0]!;
    expect(hit.damageDealt).toBeGreaterThan(0);
    expect(heroDamage(run.state)).toBe(hit.damageDealt);
  });

  it("FORCED RESPONSE: each side scheme in play is 1 more damage (none, one, two)", () => {
    const base = engageMinion(withStunnedVillain(heroForm(setupGame())), WHIRLWIND, P1).state;
    // Harmless filler for every card dealt, a hazard icon deals more than one.
    const stack = [FILLER_A, FILLER_B, CHARGE, CHARGE];
    const damage = (state: GameState) => heroDamage(villainPhase(state, stack).state);
    const none = damage(base);
    const one = damage(encounterCardInVillainArea(base, PUPPET).state);
    const two = damage(encounterCardInVillainArea(encounterCardInVillainArea(base, PUPPET).state, SIDE).state);
    expect([one - none, two - none]).toEqual([1, 2]);
  });

  it("FORCED RESPONSE: it is the attacked player alone who takes it (two players, Whirlwind engaged with player 2)", () => {
    const base = engageMinion(heroForm(setupGame([SPIDER_MAN, CAPTAIN_MARVEL]), P1, P2), WHIRLWIND, P2).state;
    const stack = [BLANK, BLANK, FILLER_A, FILLER_B];
    const without = villainPhase(base, stack);
    const withTango = villainPhase(encounterCardInVillainArea(base, TANGO).state, stack);
    expect(heroDamage(withTango.state, P2) - heroDamage(without.state, P2)).toBe(1);
    expect(heroDamage(withTango.state, P1)).toBe(heroDamage(without.state, P1));
  });

  it("WHEN DEFEATED: the Whirlwind ally enters ready under the defeating player's control", () => {
    const run = defeatedBy(setupGame(), WHIRLWIND);
    expect(ownership(run.state, P1, "55065")).toEqual([false, P1, P1]);
    expect(victoryCodes(run.state)).toEqual([WHIRLWIND]);
  });
});

describe("Zzzax (55059)", () => {
  type Kind = "energy" | "mental" | "physical";
  const iconsOf = (code: string) => (coreCard(code).resourceIcons ?? {}) as unknown as Record<string, number>;

  /** The player's deck with these cards on top, in order: for each kind, a deck card printing exactly one resource of it. */
  function deckTop(state: GameState, ...kinds: readonly Kind[]): GameState {
    const owner = playerOf(state, P1);
    const ids: InstanceId[] = [];
    for (const kind of kinds) {
      const id = owner.deck.find((i) => {
        const icons = iconsOf(codeOf(state, i));
        return !ids.includes(i) && Object.keys(icons).length === 1 && icons[kind] === 1;
      });
      if (!id) throw new Error(`no further ${kind} card in the deck`);
      ids.push(id);
    }
    return {
      ...state,
      players: state.players.map((p) =>
        p.playerId === P1 ? { ...p, deck: [...ids, ...p.deck.filter((i) => !ids.includes(i))] } : p,
      ),
    };
  }
  const milled = (events: readonly GameEvent[]) =>
    types(events, "cardMoved").filter(
      (e) => e.from.kind === "deck" && e.to.kind === "discard" && "playerId" in e.to && e.to.playerId === P1,
    );

  it("WHEN REVEALED: discards the top 4 cards of your deck and you take 1 indirect damage for each printed energy resource among them", () => {
    const stacked = deckTop(
      withStunnedVillain(heroForm(setupGame())),
      "energy",
      "mental",
      "energy",
      "energy",
      "physical",
    );
    const run = villainPhase(stacked, [ZZZAX]);
    expect(milled(run.events)).toHaveLength(4);
    expect(heroDamage(run.state)).toBe(3);
    expect(inPlayCard(run.state, ZZZAX)).toBeDefined();
  });

  it("WHEN REVEALED: no energy among the 4 is no damage", () => {
    const stacked = deckTop(
      withStunnedVillain(heroForm(setupGame())),
      "mental",
      "physical",
      "mental",
      "physical",
      "energy",
    );
    const run = villainPhase(stacked, [ZZZAX]);
    expect(milled(run.events)).toHaveLength(4);
    expect(heroDamage(run.state)).toBe(0);
  });

  it("retaliate 1 (data): an attack that does not defeat him is hit back", () => {
    const { state, id } = engageMinion(heroForm(setupGame()), ZZZAX, P1);
    const run = driveEventsPicking(DEPS, state, firstLegal, {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: identityOf(state, P1),
      targetInstanceId: id,
    });
    expect(heroDamage(run.state)).toBe(1);
  });

  // The Zzzax ally has no subtitle, so it matches the Zzzax minion under RRG 1.8 "Unique Icon" (pp. 45-46), and the
  // minion is still in play while its When Defeated resolves (p. 48). The engine does not hold the card a linked
  // keyword names against the linked card its own ability brings in (the card's evident purpose; no FFG ruling).
  it("WHEN DEFEATED: the defeating player takes the Zzzax ally, ready and owned, though both are unique and share a title", () => {
    const run = defeatedBy(setupGame(), ZZZAX);
    expect(types(run.events, "uniqueEntryBlocked")).toEqual([]);
    expect(ownership(run.state, P1, "55066")).toEqual([false, P1, P1]);
    expect(asideCodes(run.state).sort()).toEqual(["55063", "55064", "55065"]);
    expect(victoryCodes(run.state)).toEqual([ZZZAX]);
    expect(inPlayCard(run.state, ZZZAX)).toBeUndefined();
  });
});

describe("defeating a linked minion (docs/phase7-wave9.md section 3.57)", () => {
  it("at the ally limit (3 allies) nothing is discarded: the linked ally is a fourth", () => {
    const three = withInPlay(heroForm(setupGame()), [BLACK_CAT, SPIDER_WOMAN, HELLCAT]);
    const run = defeatedBy(three, TITANIA);
    const allies = playAreaCodes(run.state, P1).filter((c) => [BLACK_CAT, SPIDER_WOMAN, HELLCAT, "55064"].includes(c));
    expect(allies.sort()).toEqual([BLACK_CAT, SPIDER_WOMAN, HELLCAT, "55064"].sort());
    expect(playerOf(run.state, P1).discard.map((id) => codeOf(run.state, id))).not.toContain(BLACK_CAT);
    expect(playerOf(run.state, P1).discard).toEqual([]);
  });

  it("two players: player 2 defeating the minion engaged with player 1 takes the ally; player 1 does not", () => {
    const run = defeatedBy(setupGame([SPIDER_MAN, CAPTAIN_MARVEL]), ABSORBING, P2, P1);
    expect(playAreaCodes(run.state, P2)).toContain("55063");
    expect(playAreaCodes(run.state, P1)).not.toContain("55063");
    expect(ownership(run.state, P2, "55063")).toEqual([false, P2, P2]);
  });

  it("the ally defeated later goes to the victory display (Victory 0) beside the minion (Victory 1), never to a discard pile", () => {
    const first = defeatedBy(setupGame(), TITANIA);
    const ally = idIn(first.state, P1, "55064");
    // One hit point left; Rhino's attack, defended by the ally, defeats it.
    const worn = patchInstance(heroForm(first.state), ally, { damage: 4 });
    const run = villainPhase(worn, [BLANK, FILLER_A], defendingWith(ally));
    expect(victoryCodes(run.state).sort()).toEqual([TITANIA, "55064"]);
    expect(playAreaCodes(run.state, P1)).not.toContain("55064");
    expect(asideCodes(run.state)).not.toContain("55064");
    expect(playerOf(run.state, P1).discard.map((id) => codeOf(run.state, id))).not.toContain("55064");
  });

  it("an encounter card's damage defeats the minion with no defeating player: the first player takes the ally (MC55 p. 23)", () => {
    const staged = engageMinion(heroForm(setupGame([SPIDER_MAN, CAPTAIN_MARVEL]), P1, P2), TITANIA, P2);
    const run = villainPhase(staged.state, [BLANK, BLANK, SMITE, FILLER_A]);
    expect(victoryCodes(run.state)).toContain(TITANIA);
    expect(playAreaCodes(run.state, P1)).toContain("55064");
    expect(playAreaCodes(run.state, P2)).not.toContain("55064");
    expect(asideCodes(run.state)).not.toContain("55064");
    expect(ownership(run.state, P1, "55064")).toEqual([false, P1, P1]);
  });

  it("... and when player 2 is the first player, player 2 takes it", () => {
    const base = engageMinion(heroForm(setupGame([SPIDER_MAN, CAPTAIN_MARVEL]), P1, P2), TITANIA, P1);
    const run = villainPhase({ ...base.state, firstPlayerId: P2 }, [BLANK, BLANK, SMITE, FILLER_A]);
    expect(victoryCodes(run.state)).toContain(TITANIA);
    expect(playAreaCodes(run.state, P2)).toContain("55064");
    expect(playAreaCodes(run.state, P1)).not.toContain("55064");
  });
});

describe("The Trickster Tango (55060)", () => {
  it("is data: a side scheme with 4 threat (not per hero), two acceleration icons, 1 boost icon and the star icon", () => {
    const card = dataOf(TANGO) as {
      type: string;
      startingThreat: unknown;
      icons: string[];
      boostIcons: number;
      starIcon: boolean;
    };
    expect([card.type, card.startingThreat, card.icons, card.boostIcons, card.starIcon]).toEqual([
      "side_scheme",
      { base: 4, perPlayer: 0 },
      ["acceleration", "acceleration"],
      1,
      true,
    ]);
  });

  it("CONSTANT: the villain gains stalwart while it is in play, and not otherwise", () => {
    const before = setupGame();
    const { state } = encounterCardInVillainArea(before, TANGO);
    expect(hasKeyword(before, villainOf(before), "stalwart", DEPS)).toBe(false);
    expect(hasKeyword(state, villainOf(state), "stalwart", DEPS)).toBe(true);
  });

  it("BOOST: an attack gains overkill (a 1-icon boost without it leaves the hero untouched behind a defending ally)", () => {
    const damageWith = (boost: string) => {
      const base = withInPlay(heroForm(setupGame()), [BLACK_CAT]);
      const defender = idIn(base, P1, BLACK_CAT);
      const run = villainPhase(base, [boost, FILLER_A], defendingWith(defender));
      return { run, defender };
    };
    const tango = damageWith(TANGO);
    const plain = damageWith(ONE_ICON);
    const attack = (r: { run: { state: GameState; events: readonly GameEvent[] } }) =>
      types(r.run.events, "attackResolved").find(
        (a) => codeOf(r.run.state, a.enemyInstanceId) === codeOf(r.run.state, villainOf(r.run.state)),
      )!;
    expect(attack(tango).boostIcons).toBe(1);
    expect(attack(tango).damageDealt).toBeGreaterThan(coreCard(BLACK_CAT).hp!);
    expect(heroDamage(plain.run.state)).toBe(0);
    expect(heroDamage(tango.run.state)).toBe(attack(tango).damageDealt - coreCard(BLACK_CAT).hp!);
  });

  it("BOOST: a scheme activation gets no overkill and nothing else happens (alter-ego villain phase)", () => {
    const run = villainPhase(setupGame(), [TANGO, FILLER_A]);
    expect(heroDamage(run.state)).toBe(0);
  });
});

describe("Puppet Master (55061)", () => {
  it("is data: a side scheme with 2 threat (not per hero), a hazard icon and 1 boost icon", () => {
    const card = dataOf(PUPPET) as { type: string; startingThreat: unknown; icons: string[]; boostIcons: number };
    expect([card.type, card.startingThreat, card.icons, card.boostIcons]).toEqual([
      "side_scheme",
      { base: 2, perPlayer: 0 },
      ["hazard"],
      1,
    ]);
  });

  it("CONSTANT: in expert mode it gains hinder 1 per hero; in standard mode it does not", () => {
    const seats = [SPIDER_MAN, CAPTAIN_MARVEL] as const;
    const standard = encounterCardInVillainArea(setupGame(seats, "standard"), PUPPET);
    const expert = encounterCardInVillainArea(setupGame(seats, "expert"), PUPPET);
    expect(keywordTotal(standard.state, standard.id, "hinder", DEPS)).toBe(0);
    expect(keywordTotal(expert.state, expert.id, "hinder", DEPS)).toBe(2);
    const solo = encounterCardInVillainArea(setupGame([SPIDER_MAN], "expert"), PUPPET);
    expect(keywordTotal(solo.state, solo.id, "hinder", DEPS)).toBe(1);
  });

  it("CONSTANT: allies cannot thwart this scheme (the hero can; the ally still thwarts another scheme)", () => {
    const base = withInPlay(heroForm(setupGame()), [BLACK_CAT]);
    const cat = idIn(base, P1, BLACK_CAT);
    const { state: placed, id: puppet } = encounterCardInVillainArea(base, PUPPET, 2);
    const state = patchInstance(placed, placed.mainScheme.instanceId, { threat: 3 });
    const thwart = (scheme: InstanceId): Command => ({
      type: "basicThwart",
      playerId: P1,
      thwarterInstanceId: cat,
      schemeInstanceId: scheme,
    });
    expect(applyCommand(state, thwart(puppet), DEPS).ok).toBe(false);
    expect(applyCommand(state, thwart(state.mainScheme.instanceId), DEPS).ok).toBe(true);
    // The hero is no ally.
    const hero = applyCommand(
      state,
      { type: "basicThwart", playerId: P1, thwarterInstanceId: identityOf(state), schemeInstanceId: puppet },
      DEPS,
    );
    expect(hero.ok).toBe(true);
  });

  it("CONSTANT: allies cannot defend against the villain's attacks, but defend against a minion's", () => {
    const base = withInPlay(heroForm(setupGame()), [BLACK_CAT]);
    const cat = idIn(base, P1, BLACK_CAT);
    const offered: string[][] = [];
    const watching: Picker = (s) => {
      if (s.pendingChoice?.prompt.kind === "declareDefender")
        offered.push(s.pendingChoice.options.map((o) => o.optionId));
      return defendingWith(cat)(s);
    };
    const { state } = encounterCardInVillainArea(base, PUPPET, 2);
    const villainOnly = villainPhase(state, [BLANK, FILLER_A], watching);
    expect(offered.flat()).not.toContain(cat);
    expect(attacksBy(villainOnly.state, villainOnly.events, codeOf(state, villainOf(state)))[0]!.targetInstanceId).toBe(
      identityOf(state),
    );
    offered.length = 0;
    const withMinion = engageMinion(state, WHIRLWIND, P1);
    villainPhase(withMinion.state, [BLANK, FILLER_A], watching);
    expect(offered.flat()).toContain(cat);
  });
});

describe("Love Triangle (55062)", () => {
  it("is data: an attachment to an ally you control with 1 boost icon, the Condition trait", () => {
    const card = dataOf(LOVE) as { type: string; attachesTo: unknown; boostIcons: number; traits: string[] };
    expect([card.type, card.attachesTo, card.boostIcons, card.traits]).toEqual([
      "attachment",
      { kind: "qualified", category: "ally", controlledBy: "you" },
      1,
      ["CONDITION"],
    ]);
  });

  /** Revealed to player 1 in a villain phase (alter-ego), with Black Cat in play unless told otherwise. */
  function revealed(allies: readonly string[] = [BLACK_CAT], hero = false) {
    const base = withInPlay(setupGame(), allies);
    const staged = hero ? heroForm(base) : base;
    return villainPhase(staged, [BLANK, LOVE, FILLER_A]);
  }

  it("attaches to an ally you control when revealed", () => {
    const run = revealed();
    const love = inPlayCard(run.state, LOVE);
    expect(love).toBeDefined();
    expect(inst(run.state, love!).attachedTo).toBe(idIn(run.state, P1, BLACK_CAT));
  });

  // DATA ERROR (not fixable here): 55062 prints "Attach to an ally you control" but its data has `attachesTo: { kind:
  // "ally" }`, so it attaches to another player's ally. The host should carry `controlledBy: "you"`. `it.fails` passes
  // while the data is wrong and starts failing the day it is fixed: then make this a plain `it`.
  it("dealt to a player with no ally while another player has one, it is not attached to that player's ally", () => {
    const base = withInPlay(setupGame([SPIDER_MAN, CAPTAIN_MARVEL]), [BLACK_CAT], P2);
    const run = villainPhase(base, [BLANK, BLANK, LOVE, FILLER_A]);
    expect(types(run.events, "encounterCardRevealed").map((e) => codeOf(run.state, e.instanceId))[0]).toBe(LOVE);
    const love = inPlayCard(run.state, LOVE);
    expect(love === undefined || inst(run.state, love).attachedTo === null).toBe(true);
  });

  it("with no ally to attach to it gains surge: it is discarded and the next encounter card is revealed", () => {
    const run = revealed([]);
    expect(inPlayCard(run.state, LOVE)).toBeUndefined();
    const pile = run.state.encounterDecks[Object.keys(run.state.encounterDecks)[0]!]!;
    expect(pile.discard.map((id) => codeOf(run.state, id))).toContain(LOVE);
    expect(types(run.events, "encounterCardRevealed").map((e) => codeOf(run.state, e.instanceId))).toEqual([
      LOVE,
      FILLER_A,
    ]);
  });

  it("CONSTANT: the attached ally cannot attack the villain, but attacks a minion", () => {
    const run = revealed([BLACK_CAT], true);
    const cat = idIn(run.state, P1, BLACK_CAT);
    const ready = patchInstance(run.state, cat, { exhausted: false });
    const attack = (target: InstanceId): Command => ({
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: cat,
      targetInstanceId: target,
    });
    expect(applyCommand(ready, attack(villainOf(ready)), DEPS).ok).toBe(false);
    const minion = engageMinion(ready, WHIRLWIND, P1);
    expect(applyCommand(minion.state, attack(minion.id), DEPS).ok).toBe(true);
  });

  it("CONSTANT: the attached ally cannot defend against the villain's attacks, but defends against a minion's", () => {
    const run = revealed([BLACK_CAT], true);
    const cat = idIn(run.state, P1, BLACK_CAT);
    const offered: string[][] = [];
    const watching: Picker = (s) => {
      if (s.pendingChoice?.prompt.kind === "declareDefender")
        offered.push(s.pendingChoice.options.map((o) => o.optionId));
      return firstLegal(s);
    };
    villainPhase(run.state, [BLANK, FILLER_A], watching);
    expect(offered.flat()).not.toContain(cat);
    offered.length = 0;
    const withMinion = engageMinion(run.state, WHIRLWIND, P1);
    villainPhase(withMinion.state, [BLANK, FILLER_A], watching);
    expect(offered.flat()).toContain(cat);
  });

  it("ALTER-EGO ACTION: exhaust the attached ally and spend a mental resource to discard it", () => {
    const run = revealed();
    const love = inPlayCard(run.state, LOVE)!;
    const cat = idIn(run.state, P1, BLACK_CAT);
    const { state, ids } = moveToHand(run.state, P1, MENTAL_CARD);
    const done = driveEventsPicking(
      DEPS,
      state,
      firstLegal,
      use(P1, love, "55062.love-triangle-action", [{ fromHand: ids[0]! }]),
    );
    expect(inPlayCard(done.state, LOVE)).toBeUndefined();
    expect(inst(done.state, cat).exhausted).toBe(true);
    expect(playerOf(done.state, P1).discard).toContain(ids[0]);
  });

  it("ALTER-EGO ACTION: not offered in hero form, and not with an exhausted ally", () => {
    const run = revealed();
    const love = inPlayCard(run.state, LOVE)!;
    const cat = idIn(run.state, P1, BLACK_CAT);
    const { state, ids } = moveToHand(run.state, P1, MENTAL_CARD);
    const spent = patchInstance(state, cat, { exhausted: true });
    const refused = applyCommand(spent, use(P1, love, "55062.love-triangle-action", [{ fromHand: ids[0]! }]), DEPS);
    expect(refused.ok).toBe(false);
    const hero = applyCommand(
      heroForm(state),
      use(P1, love, "55062.love-triangle-action", [{ fromHand: ids[0]! }]),
      DEPS,
    );
    expect(hero.ok).toBe(false);
  });
});

describe("the set as a modular set of a scripted scenario", () => {
  const SEATS = [{ starterDeckId: "maria-hill-leadership" }, { starterDeckId: "nick-fury-justice" }] as const;
  function build(modularSetIds: readonly string[]): GameState {
    const config = wave9Scenario("black-widow", { players: SEATS, seed: 1, modularSetIds });
    const created = createGame(config, DEPS);
    if (!created.ok) throw new Error(created.error.message);
    return created.state;
  }

  it("adds the four allies to the set-aside area once each, and the set's cards to the encounter deck", () => {
    const s = build(["trickster_magic"]);
    expect(
      asideCodes(s)
        .filter((c) => ALLIES.includes(c))
        .sort(),
    ).toEqual([...ALLIES].sort());
    const deck = Object.values(s.encounterDecks).flatMap((pile) => pile.deck.map((id) => codeOf(s, id)));
    for (const code of [ABSORBING, TITANIA, WHIRLWIND, ZZZAX, TANGO, PUPPET, LOVE]) expect(deck, code).toContain(code);
    for (const code of ALLIES) expect(deck, code).not.toContain(code);
  });

  it("a game without the set has none of them", () => {
    const s = build([]);
    expect(asideCodes(s).filter((c) => ALLIES.includes(c))).toEqual([]);
  });
});
