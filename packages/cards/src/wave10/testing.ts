import { CORE_CARDS, HERCULES_CARDS, cardId, type AnyCard, type CoreAspect, type HeroIdentityCard } from "@mc/content";
import {
  DECK_MIN_CARDS,
  activeEncounterDeckId,
  cardOfferedToDeck,
  copiesUpToLimit,
  createGame,
  isPermanentCard,
  requiredIdentitySet,
  type EngineDeps,
  type GameSetupConfig,
  type GameState,
  type InstanceId,
  type PlayerSetup,
  type SetupResult,
} from "@mc/engine";
import { coreScenario } from "../core/setup.js";
import { firstLegal, settle, type Picker } from "../testing/harness.js";
import { withForm } from "../testing/staging.js";
import { codeOf } from "../wave9/testing.js";
import { WAVE10_CARDS } from "./cards.js";
import { WAVE10_DEPS } from "./index.js";
import { wave10Scenario, wave10StarterDeckSetup, type Wave10ScenarioOptions } from "./setup.js";

/**
 * Shared helpers for the Civil War tests.
 *
 * Player-side modules (`cw/tigra`, `cw/hulkling`, `cw/aspect-basic`) use `cwGame` and its kin: one of the box's two
 * precons against Core's Rhino, a fully scripted villain, with every script registered so far. Leader, main scheme and
 * modular set modules use `civilWarGame` and its kin at the end of this file: the same precons in a real Civil War
 * scenario built by `wave10Scenario`. A module not yet scripted leaves its cards without abilities; a test that needs one borrows a Core card
 * instead (`swap`), so the deck is no longer the legal precon and the game is created with deck legality unchecked.
 */
export { WAVE10_DEPS };
export { encounterTopCodes, engageMinion, stackedEncounter, stagedInPlay } from "../wave9/falcon/testing.js";

export const TIGRA_DECK = "tigra-aggression";
export const HULKLING_DECK = "hulkling-protection";
export const CORE_SPIDER_MAN = "core-spider-man-justice";

/** A starter deck as a seat, optionally with named cards swapped in for others (the first copy of each; size kept). */
export function cwSeat(starterDeckId: string, swap: Readonly<Record<string, string>> = {}): PlayerSetup {
  const seat = wave10StarterDeckSetup(starterDeckId);
  const remaining = { ...swap };
  const deck = seat.deck.map((id) => {
    const replacement = remaining[id as string];
    if (replacement === undefined) return id;
    delete remaining[id as string];
    return cardId(replacement);
  });
  return { ...seat, deck };
}

export interface CwGameOptions {
  readonly swap?: Readonly<Record<string, string>>;
  readonly seed?: number;
  /** A second seat (the Core Spider-Man starter deck) beside the Civil War hero. */
  readonly twoPlayers?: boolean;
  /** Extra dependencies (a module's own registry on top of the wave's), default `WAVE10_DEPS`. */
  readonly deps?: EngineDeps;
}

/** A game past setup (alter-ego form, full hand) for a Civil War precon against Core's Rhino. */
export function cwGame(starterDeckId: string, opts: CwGameOptions = {}): GameState {
  const seed = opts.seed ?? 1;
  const deps = opts.deps ?? WAVE10_DEPS;
  const base = coreScenario("rhino", {
    players: [{ starterDeckId: CORE_SPIDER_MAN }],
    seed,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: WAVE10_CARDS,
  } as never);
  const second = base.players[0]!;
  const created = createGame(
    {
      ...base,
      requireLegalDecks: false,
      players: opts.twoPlayers ? [cwSeat(starterDeckId, opts.swap), second] : [cwSeat(starterDeckId, opts.swap)],
    },
    deps,
  );
  if (!created.ok) throw new Error(created.error.message);
  return settle(created.state, firstLegal, (s) => s.step.phase === "player", deps);
}

/** The same game with the first seat in hero form. */
export const cwHeroGame = (starterDeckId: string, opts: CwGameOptions = {}): GameState =>
  withForm(cwGame(starterDeckId, opts), { heroForm: 0 });

export const tigraGame = (opts: CwGameOptions = {}): GameState => cwGame(TIGRA_DECK, opts);
export const tigraHeroGame = (opts: CwGameOptions = {}): GameState => cwHeroGame(TIGRA_DECK, opts);
export const hulklingGame = (opts: CwGameOptions = {}): GameState => cwGame(HULKLING_DECK, opts);
export const hulklingHeroGame = (opts: CwGameOptions = {}): GameState => cwHeroGame(HULKLING_DECK, opts);

/** Whether the pending choice is the enemy team's (a search the villain side answers, RRG 1.8 "Search", p. 39). */
export const isEnemyTeamChoice = (s: GameState): boolean => s.pendingChoice?.authority === "enemyTeam";
/** The pending choice's option for the card with printed code `code`, if it is on offer. */
export const cardOption = (s: GameState, code: string) =>
  s.pendingChoice!.options.find((o) => o.ref.kind === "card" && codeOf(s, o.ref.instanceId) === code);

export const IRON_MAN_SCENARIO = "registration-iron-man";
export const CAPTAIN_MARVEL_SCENARIO = "registration-captain-marvel";
export const CAPTAIN_AMERICA_SCENARIO = "resistance-captain-america";
export const SPIDER_WOMAN_SCENARIO = "resistance-spider-woman";

/**
 * The choices of a Civil War test game: `wave10Scenario`'s own (difficulty, the three or four `modularSetIds`, the
 * `mainSchemeStageIds` pair, `gameMode`), each defaulting to the leader's preconstructed scenario, plus the seats.
 */
export interface CivilWarGameOptions
  extends
    CwGameOptions,
    Pick<
      Wave10ScenarioOptions,
      | "difficulty"
      | "modularSetIds"
      | "mainSchemeStageIds"
      | "difficultySets"
      | "gameMode"
      | "firstPlayerIndex"
      | "stack"
    > {
  /** The first seat's starter deck: `TIGRA_DECK` (default) or `HULKLING_DECK`. */
  readonly starterDeckId?: string;
  /**
   * `civilWarGame` only. Stage 1A's Setup reveals the chosen leader's side scheme (Stark Tower, Self-propelled Glide),
   * so by default it is in play from the start. `"discarded"` puts it back at the bottom of the encounter deck afterwards
   * (`withoutLeaderSideScheme`), for a test that stacks that card on the encounter deck as an ordinary card.
   */
  readonly leaderSideScheme?: "inPlay" | "discarded";
}

/**
 * The `GameSetupConfig` of a Civil War scenario seated with the Tigra or Hulkling precon (and the Core Spider-Man
 * deck as a second seat with `twoPlayers`). A `swap` makes the deck no longer the legal precon, so deck legality is
 * then unchecked.
 */
export function civilWarConfig(scenarioId: string, opts: CivilWarGameOptions = {}): GameSetupConfig {
  const { swap, seed, twoPlayers, deps: _deps, starterDeckId, leaderSideScheme: _side, ...choices } = opts;
  const first = cwSeat(starterDeckId ?? TIGRA_DECK, swap);
  const config = wave10Scenario(scenarioId, {
    ...choices,
    seed: seed ?? 1,
    players: [
      { identityCardId: first.identityCardId, deck: first.deck, ...(first.aspects ? { aspects: first.aspects } : {}) },
      ...(twoPlayers ? [{ starterDeckId: CORE_SPIDER_MAN }] : []),
    ],
  });
  return swap && Object.keys(swap).length > 0 ? { ...config, requireLegalDecks: false } : config;
}

/**
 * A Civil War game as `createGame` returns it: setup's first choice (the mulligan) is pending and no card ability has
 * resolved yet, so the leader's and stage 1A's "Setup" text is still ahead. For a test of what setup does.
 */
export function civilWarSetup(scenarioId: string, opts: CivilWarGameOptions = {}): GameState {
  const created = createGame(civilWarConfig(scenarioId, opts), opts.deps ?? WAVE10_DEPS);
  if (!created.ok) throw new Error(`${created.error.code}: ${created.error.message}`);
  return created.state;
}

/**
 * The side schemes in play put back at the bottom of the encounter deck with no threat, as if stage 1A's Setup had not
 * revealed the leader's side scheme: a later `stackEncounterDeck` finds the card there, and the discard pile is untouched.
 */
export function withoutLeaderSideScheme(state: GameState): GameState {
  const isSideScheme = (id: InstanceId): boolean => state.cardPool[state.instances[id]!.cardId]?.type === "side_scheme";
  const moved = state.villainArea.filter(isSideScheme);
  if (moved.length === 0) return state;
  const deckId = activeEncounterDeckId(state);
  const pile = state.encounterDecks[deckId]!;
  return {
    ...state,
    villainArea: state.villainArea.filter((id) => !moved.includes(id)),
    encounterDecks: { ...state.encounterDecks, [deckId]: { deck: [...pile.deck, ...moved], discard: pile.discard } },
    instances: {
      ...state.instances,
      ...Object.fromEntries(moved.map((id) => [id, { ...state.instances[id]!, threat: 0 }])),
    },
  };
}

/**
 * A Civil War game past setup (the first player's turn, alter-ego form, full hand), every setup choice answered with
 * its first legal option. Pass `pick` to answer them yourself (which Iron Man attachment the Setup reveals, which
 * minion the stage 1 B side's search finds). The leader's side scheme is in play, as the Setup leaves it, unless
 * `leaderSideScheme: "discarded"`.
 */
export function civilWarGame(scenarioId: string, opts: CivilWarGameOptions = {}, pick: Picker = firstLegal): GameState {
  const deps = opts.deps ?? WAVE10_DEPS;
  const played = settle(civilWarSetup(scenarioId, opts), pick, (s) => s.step.phase === "player", deps);
  return opts.leaderSideScheme === "discarded" ? withoutLeaderSideScheme(played) : played;
}

/** The same game with the first seat in hero form. */
export const civilWarHeroGame = (
  scenarioId: string,
  opts: CivilWarGameOptions = {},
  pick: Picker = firstLegal,
): GameState => withForm(civilWarGame(scenarioId, opts, pick), { heroForm: 0 });

/**
 * Hero pack seats (docs/phase7-wave10-hero-packs.md H8.4): Wonder Man (`wonder_man`) and Hercules (`hercules`) have no
 * starter deck (no source for the printed lists), so a test seats a deck built here from the pack's own cards.
 *
 * `heroPackSeat` is the deck builder: the identity's required set (`requiredIdentitySet`), then the pack's own cards of
 * the chosen aspect and of the basic aspect (by id), then Core cards of those two aspects (by id), each taking as many
 * copies as `copiesUpToLimit` allows (the rules' own limit: unique, deck limit, three per title), until the deck holds
 * 40 cards. Cards the chosen aspects do not offer (`cardOfferedToDeck`) are never taken, and the identity's off-aspect
 * deckbuilding rule is not used, so Wonder Man's off-aspect energy events (engine task HT12) are not relied on.
 *
 * - **Wonder Man** (`WONDER_MAN_DECK`): Justice. His set (58002 to 58011), then the pack's Justice cards 58012 to
 *   58016, 58018 and 58021, its basic cards 58022 to 58024 and 58034, then Core Justice and basic fill. Grim Reaper's
 *   set (58025 to 58029) is his obligation and nemesis, which setup deals in.
 * - **Hercules** (`HERCULES_DECK`): Leadership. His set without the Gift and Labor cards (59008 to 59017), the pack's
 *   Leadership cards 59018 to 59024, its basic cards 59025 to 59034, then Core Leadership and basic fill. The Gift and
 *   Labor decks (`separateDecks`: 59002 to 59007) are built by setup, not here.
 */
export const WONDER_MAN_DECK = "wonder-man-justice";
export const HERCULES_DECK = "hercules-leadership";

/** Core, the Civil War box, Wonder Man and Hercules: the pool a Wonder Man or Hercules test game is created from. */
export const HERO_PACK_CARDS: readonly AnyCard[] = [...WAVE10_CARDS, ...HERCULES_CARDS];

const HERO_PACKS: Readonly<Record<string, { identityId: string; aspect: CoreAspect }>> = {
  [WONDER_MAN_DECK]: { identityId: "58001a", aspect: "justice" },
  [HERCULES_DECK]: { identityId: "59001a", aspect: "leadership" },
};

/** A 40-card hand-built deck for `WONDER_MAN_DECK` or `HERCULES_DECK`, as a seat (see the block above). */
export function heroPackSeat(deckId: string): PlayerSetup {
  const spec = HERO_PACKS[deckId];
  if (!spec) throw new Error(`no hero pack deck ${deckId}`);
  const identity = HERO_PACK_CARDS.find((c) => c.id === cardId(spec.identityId)) as HeroIdentityCard | undefined;
  if (!identity) throw new Error(`no identity ${spec.identityId}`);
  const entries = requiredIdentitySet(identity, HERO_PACK_CARDS).map((e) => ({ ...e }));
  // The deck size counts neither the identity nor permanent cards (the legality message says so).
  const counted = (id: unknown): boolean => !isPermanentCard(byCode.get(id as string)!);
  const byCode = new Map(HERO_PACK_CARDS.map((c) => [c.id as string, c]));
  let total = entries.reduce((n, e) => n + (counted(e.cardId) ? e.quantity : 0), 0);
  const byId = (a: AnyCard, b: AnyCard): number => (a.id as string).localeCompare(b.id as string);
  const offered = (card: AnyCard): boolean =>
    card.type !== "hero_identity" &&
    !("aspect" in card && String(card.aspect).startsWith("hero:")) &&
    cardOfferedToDeck(card, identity, [spec.aspect]).offered;
  const own = HERO_PACK_CARDS.filter((c) => c.setCode === identity.setCode && offered(c)).sort(byId);
  const core = CORE_CARDS.filter(offered).sort(byId);
  for (const card of [...own, ...core]) {
    if (total >= DECK_MIN_CARDS) break;
    const taken = copiesUpToLimit(entries, card.id as string, identity, HERO_PACK_CARDS);
    const copies = counted(card.id) ? Math.min(taken, DECK_MIN_CARDS - total) : Math.min(taken, 1);
    if (copies > 0) {
      entries.push({ cardId: card.id, quantity: copies });
      if (counted(card.id)) total += copies;
    }
  }
  return {
    identityCardId: identity.id,
    aspects: [spec.aspect],
    deck: entries.flatMap((e) => Array.from({ length: e.quantity }, () => e.cardId)),
  };
}

export interface HeroPackGameOptions {
  readonly seed?: number;
  /** Extra dependencies (a module's own registry on top of the wave's), default `WAVE10_DEPS`. */
  readonly deps?: EngineDeps;
}

/** The setup config of a hero pack deck against Core's Rhino, the way `cwGame` seats a Civil War precon. */
export function heroPackConfig(deckId: string, opts: HeroPackGameOptions = {}): GameSetupConfig {
  const base = coreScenario("rhino", {
    players: [{ starterDeckId: CORE_SPIDER_MAN }],
    seed: opts.seed ?? 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: HERO_PACK_CARDS,
  } as never);
  return { ...base, players: [heroPackSeat(deckId)] };
}

type HeroPackCivilWarOptions = Omit<CivilWarGameOptions, "swap" | "twoPlayers" | "starterDeckId">;

/**
 * The same deck in a Civil War scenario (`wave10Scenario`, so `civilWarGame`'s choices apply: difficulty, the modular
 * sets, the main scheme stages). The scenario builder reads the playable pool, so the config's card pool is widened to
 * include Hercules' cards.
 */
export function heroPackCivilWarConfig(
  deckId: string,
  scenarioId: string,
  opts: HeroPackCivilWarOptions = {},
): GameSetupConfig {
  const { deps: _deps, seed, ...choices } = opts;
  const config = wave10Scenario(scenarioId, { ...choices, seed: seed ?? 1, players: [heroPackSeat(deckId)] });
  return { ...config, cards: HERO_PACK_CARDS };
}

function opened(created: SetupResult, deps: EngineDeps, pick: Picker = firstLegal): GameState {
  if (!created.ok) throw new Error(`${created.error.code}: ${created.error.message}`);
  return settle(created.state, pick, (s) => s.step.phase === "player", deps);
}

/** A Wonder Man game past setup (alter-ego form, full hand) against Core's Rhino. */
export const wonderManGame = (opts: HeroPackGameOptions = {}): GameState => {
  const deps = opts.deps ?? WAVE10_DEPS;
  return opened(createGame(heroPackConfig(WONDER_MAN_DECK, opts), deps), deps);
};

/** The same game with the first seat in hero form. */
export const wonderManHeroGame = (opts: HeroPackGameOptions = {}): GameState =>
  withForm(wonderManGame(opts), { heroForm: 0 });

/** A Wonder Man game past setup in a Civil War scenario (`IRON_MAN_SCENARIO`, ...), through `civilWarGame`'s choices. */
export const wonderManCivilWarGame = (
  scenarioId: string,
  opts: HeroPackCivilWarOptions = {},
  pick: Picker = firstLegal,
): GameState => {
  const deps = opts.deps ?? WAVE10_DEPS;
  return opened(createGame(heroPackCivilWarConfig(WONDER_MAN_DECK, scenarioId, opts), deps), deps, pick);
};

/**
 * A Hercules game past setup against Core's Rhino. It lacks his Gift and Labor decks until engine task HT1: setup
 * refuses an identity whose `separateDecks` it cannot build (`unbuildableSeparateDeck`; the Labor deck is
 * encounter-backed), so this throws that refusal today. `createGame(heroPackConfig(HERCULES_DECK), WAVE10_DEPS)`
 * returns it as a value.
 */
export const herculesGame = (opts: HeroPackGameOptions = {}): GameState => {
  const deps = opts.deps ?? WAVE10_DEPS;
  return opened(createGame(heroPackConfig(HERCULES_DECK, opts), deps), deps);
};

/** The same game with the first seat in hero form (blocked on HT1 like `herculesGame`). */
export const herculesHeroGame = (opts: HeroPackGameOptions = {}): GameState =>
  withForm(herculesGame(opts), { heroForm: 0 });

/** A Hercules game past setup in a Civil War scenario (blocked on HT1 like `herculesGame`). */
export const herculesCivilWarGame = (
  scenarioId: string,
  opts: HeroPackCivilWarOptions = {},
  pick: Picker = firstLegal,
): GameState => {
  const deps = opts.deps ?? WAVE10_DEPS;
  return opened(createGame(heroPackCivilWarConfig(HERCULES_DECK, scenarioId, opts), deps), deps, pick);
};
