/**
 * Rules QA, wave 10 part 3: the player side of Civil War (Tigra 56001a to 56028, Hulkling 56029a to 56058, and the
 * Aggression, Protection and basic cards 56010 to 56022 and 56041 to 56053). Each test cites the printed card, MC56,
 * the RRG 1.8 or an FFG ruling. `it.fails` records a bug found (the test states the printed behavior and fails today;
 * flip it to `it` when the script is fixed); a plain `it` pins behavior the audit confirmed, or settles one of the
 * brief's known items. Findings and the full audit: docs/phase7-wave10-qa-players.md.
 */
import { PLAYABLE_CARDS, cardId } from "@mc/content";
import {
  activeEncounterDeckId,
  applyCommand,
  cardsInPlay,
  createGame,
  legalActions,
  type Command,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { coreScenario } from "../core/setup.js";
import { buildCrossHeroDeck } from "../testing/cross-hero.js";
import {
  P1,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  moveToHand,
  patchInstance,
  play,
  playerOf,
  settle,
  stackEncounterDeck,
  type Picker,
} from "../testing/harness.js";
import { driveEventsPicking, stackSetAsideBehindBoost, withForm } from "../testing/staging.js";
import { codeOf } from "../wave9/testing.js";
import {
  WAVE10_DEPS as DEPS,
  engageMinion,
  hulklingGame,
  hulklingHeroGame,
  stagedInPlay,
  tigraGame,
  tigraHeroGame,
} from "./testing.js";

vi.setConfig({ testTimeout: 180_000 });

const ADVANCE = "01186"; // a Core treachery with no boost icon and no boost ability

/** What a prompt picker saw and what it was told to do. */
interface Plan {
  /** Optional triggers to take (the id ends with one of these); every other optional trigger is declined. */
  readonly take?: readonly string[];
  /** Declare the hero the defender when asked (otherwise "no defense"). */
  readonly defend?: boolean;
  /** Every chooseTriggers window's offered ids, in order. */
  readonly windows?: string[][];
  /** Every chooseOption prompt's labels, in order. */
  readonly options?: string[][];
  /** A chooseOption label to pick (the first label starting with it). */
  readonly option?: string;
  /** A card code to pick on card prompts. */
  readonly card?: string;
  /** The smallest number of cards each card-choice prompt demanded. */
  readonly mins?: number[];
  /** Cards that must not pay for a card. */
  readonly keep?: readonly string[];
  /** Only take triggers of attacks by the enemy with this code. */
  readonly against?: string;
  /** Every prompt: kind and option labels. */
  readonly prompts?: string[];
}
const planner =
  (plan: Plan): Picker =>
  (s) => {
    const choice = s.pendingChoice!;
    const offered = choice.options.map((o) => o.optionId as string);
    plan.prompts?.push(`${choice.prompt.kind}: ${choice.options.map((o) => o.label).join(" | ")}`);
    switch (choice.prompt.kind) {
      case "chooseTriggers": {
        plan.windows?.push(offered);
        const ev = choice.prompt.event as { enemyInstanceId?: InstanceId };
        if (plan.against && ev.enemyInstanceId && codeOf(s, ev.enemyInstanceId) !== plan.against) return [];
        const hit = offered.find((o) => plan.take?.some((t) => o.endsWith(t)));
        return hit ? [hit] : [];
      }
      case "payForCard": {
        // The first card that is not one the test still needs (an energy card for Excelsior).
        const spare = choice.options.find(
          (o) => !(plan.keep ?? []).includes(codeOf(s, o.optionId.replace("hand:", "") as InstanceId)),
        );
        return [(spare ?? choice.options[0]!).optionId];
      }
      case "declareDefender":
        return plan.defend && offered.includes(identityOf(s) as string) ? [identityOf(s) as string] : ["decline"];
      case "chooseOption": {
        plan.options?.push(choice.options.map((o) => o.label));
        const hit = plan.option ? choice.options.find((o) => o.label.startsWith(plan.option!)) : undefined;
        return hit ? [hit.optionId] : firstLegal(s);
      }
      default: {
        if (choice.prompt.kind === "chooseCards") plan.mins?.push(choice.minSelections);
        const hit = plan.card
          ? choice.options.find((o) => o.ref.kind === "card" && codeOf(s, o.ref.instanceId) === plan.card)
          : undefined;
        return hit ? [hit.optionId] : firstLegal(s);
      }
    }
  };
const drive = (s: GameState, plan: Plan, ...commands: readonly Command[]) =>
  driveEventsPicking(DEPS, s, planner(plan), ...commands);
const ofType = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const offeredIn = (windows: readonly (readonly string[])[], ref: string): boolean =>
  windows.some((w) => w.some((o) => o.endsWith(ref)));
/** The top cards of the encounter deck relabelled as these cards (test surgery; the deck of the Core Rhino game holds none of a Civil War set). */
const topCardsAre = (s: GameState, ...codes: string[]): GameState =>
  codes.reduce((cur, code, n) => patchInstance(cur, encounterPile(s).deck[n]!, { cardId: cardId(code) }), s);
const encounterPile = (s: GameState) => s.encounterDecks[activeEncounterDeckId(s)]!;

// ---------------------------------------------------------------------------------------------------------------
// Known item 1: Cuts Both Ways against Core Black Panther's printed Retaliate 1
// ---------------------------------------------------------------------------------------------------------------
describe("56050 Cuts Both Ways: exact retaliate damage with a hero that prints Retaliate 1", () => {
  /** Core Black Panther (hero side prints "Retaliate 1") with Cuts Both Ways in hand, facing Rhino's one attack. */
  function pantherGame(): GameState {
    const config = coreScenario("rhino", {
      players: [buildCrossHeroDeck(PLAYABLE_CARDS, "core-black-panther-protection", "56050")],
      seed: 1,
      difficulty: "standard",
      modularSetIds: [],
      cardPool: PLAYABLE_CARDS,
    } as never);
    const created = createGame(config, DEPS);
    if (!created.ok) throw new Error(created.error.message);
    const opened = settle(created.state, firstLegal, (s) => s.step.phase === "player", DEPS);
    const given = moveToHand(withForm(opened, { heroForm: 0 }), P1, "56050");
    return stackEncounterDeck(given.state, ADVANCE, ADVANCE);
  }
  const rhinoDamage = (s: GameState) => inst(s, s.activeVillainId!).damage;

  it("control: Rhino attacks Black Panther, who defends: only the printed Retaliate 1 hits back (1 damage)", () => {
    const run = drive(pantherGame(), { defend: true }, endTurn());
    expect(rhinoDamage(run.state)).toBe(1);
  });

  it("with Cuts Both Ways played in the attack the retaliate values add (RRG 'Keywords' p. 25: 1 + 1 = Retaliate 2): Rhino takes exactly 2", () => {
    const windows: string[][] = [];
    const run = drive(pantherGame(), { defend: true, take: ["56050.cuts-both-ways-interrupt"], windows }, endTurn());
    expect(offeredIn(windows, "56050.cuts-both-ways-interrupt")).toBe(true);
    expect(ofType(run.events, "cardPlayed").map((e) => e.cardId as string)).toEqual(["56050"]);
    expect(rhinoDamage(run.state)).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Known item 2: Cat-Like Reflexes in alter-ego form
// ---------------------------------------------------------------------------------------------------------------
describe("56006 Cat-Like Reflexes is a Hero Interrupt: it is not taken in alter-ego form", () => {
  const U_S_AGENT = "56075"; // minion, "When Revealed: Deal 1 damage to your identity."
  const REF = "56006.cat-like-reflexes-interrupt";

  it("an enemy cannot attack an alter ego with any printed card of the pool, so the damage comes from a When Revealed (U.S. Agent, 1 damage to your identity): Greer Nelson takes it all and the interrupt is never offered", () => {
    // RRG 'Attack (Enemy Activation)' p. 8: abilities "can instead cause an enemy to attack a player's alter-ego", but
    // no printed card does (a pool search for "attacks your alter-ego" finds none): a Hero Interrupt cannot be tested on
    // an attack, only on the identity taking damage by another means, which "any amount of damage" also covers.
    const worn = stagedInPlay(tigraGame(), "56006", { attach: true });
    const windows: string[][] = [];
    const run = drive(topCardsAre(worn.state, ADVANCE, U_S_AGENT), { take: [REF], windows }, endTurn());
    expect(playerOf(run.state, P1).identity.form).toBe("alterEgo");
    expect(offeredIn(windows, REF)).toBe(false);
    expect(inst(run.state, identityOf(run.state)).damage).toBe(1);
    expect(inst(run.state, worn.id).attachedTo).toBe(identityOf(run.state));
  });

  it("control: the same reveal in hero form offers it (a Hero Interrupt is live there)", () => {
    const worn = stagedInPlay(tigraHeroGame(), "56006", { attach: true });
    const windows: string[][] = [];
    const run = drive(topCardsAre(worn.state, ADVANCE, U_S_AGENT), { take: [REF], windows, defend: true }, endTurn());
    expect(offeredIn(windows, REF)).toBe(true);
    expect(playerOf(run.state, P1).discard).toContain(worn.id);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Known item 3: the exhaust option of the obligations when the identity is already exhausted
// ---------------------------------------------------------------------------------------------------------------
describe("56054 Complicated Lineage and 56023 In Too Deep: 'Exhaust <alter ego> -> remove this card' when the identity is already exhausted", () => {
  /**
   * Hero form; the villain attacks first and the hero defends, so the hero is exhausted when the obligation is revealed
   * (the identity keeps its state through a flip, RRG 'Form, Change Form' p. 21). The prompts are recorded.
   */
  function obligationAfterDefending(game: GameState, obligation: string) {
    const prompts: string[] = [];
    const run = drive(
      stackEncounterDeck(game, ADVANCE, obligation),
      { defend: true, prompts, option: "Flip" },
      endTurn(),
    );
    const card = Object.values(run.state.instances).find((i) => (i.cardId as string) === obligation)!.instanceId;
    return { ...run, prompts, card };
  }
  const afterFlipPrompts = (prompts: readonly string[]): string[] => {
    const flip = prompts.findIndex((p) => p.startsWith("chooseOption: Flip"));
    expect(flip, "the flip was asked").toBeGreaterThan(-1);
    return prompts.slice(flip + 1);
  };

  it("56054 Complicated Lineage: with Teddy Altman exhausted the cost 'exhaust Teddy Altman' cannot be paid, so only the second option is left: no choice is asked, the Shapeshift upgrades are discarded and the card is discarded, not removed from the game (RRG 'Cost' p. 13)", () => {
    const worn = stagedInPlay(hulklingHeroGame(), "56032", { attach: true });
    const r = obligationAfterDefending(worn.state, "56054");
    expect(inst(r.state, identityOf(r.state)).exhausted).toBe(true);
    expect(playerOf(r.state, P1).identity.form).toBe("alterEgo");
    expect(afterFlipPrompts(r.prompts).filter((p) => p.startsWith("chooseOption"))).toEqual([]);
    expect(r.state.removedFromGame).not.toContain(r.card);
    expect(playerOf(r.state, P1).discard).toContain(worn.id);
  });

  it("56023 In Too Deep: with Greer Nelson exhausted, only the second option is left: no choice is asked and the card is not removed from the game", () => {
    const r = obligationAfterDefending(tigraHeroGame(), "56023");
    expect(inst(r.state, identityOf(r.state)).exhausted).toBe(true);
    expect(afterFlipPrompts(r.prompts).filter((p) => p.startsWith("chooseOption"))).toEqual([]);
    expect(r.state.removedFromGame).not.toContain(r.card);
  });

  it("control: with the identity ready (nothing defended) both options are asked, so the missing choice above is the exhausted identity", () => {
    const prompts: string[] = [];
    const game = stackEncounterDeck(hulklingGame(), ADVANCE, "56054");
    drive(game, { prompts }, endTurn());
    expect(prompts.filter((p) => p.startsWith("chooseOption: Exhaust Teddy"))).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Known item 4: a hostless Hunted
// ---------------------------------------------------------------------------------------------------------------
describe("56007 Hunted: the found minion leaves play before Hunted can attach to it", () => {
  /**
   * Hero form, Cuts Both Ways swapped into the deck for a Feline Senses. The encounter deck's top card becomes a Vulture
   * (Core 01167: quickstrike, ATK 3, 4 hit points) with 3 damage on it. Hunted puts him into play engaged; his quickstrike
   * attack comes first (owner 18 = A), Tigra defends and plays Cuts Both Ways, whose Retaliate 1 deals the fourth point
   * of damage: the Vulture is defeated before Hunted is attached.
   */
  function staged() {
    const base = tigraHeroGame({ swap: { "56009": "56050" } });
    const vulture = encounterPile(base).deck[0]!;
    const hurt = patchInstance(patchInstance(base, vulture, { cardId: cardId("01167") }), vulture, { damage: 3 });
    const given = moveToHand(moveToHand(hurt, P1, "56050").state, P1, "56007");
    return { state: given.state, vulture, hunted: given.ids[0]! };
  }

  it("Hunted is discarded, never attached and never in play (spec 'Attach To'; RRG p. 8 reads as 'remains in its prior state or game area'): pinned", () => {
    const { state, vulture, hunted } = staged();
    const run = drive(
      state,
      { defend: true, take: ["56050.cuts-both-ways-interrupt"] },
      play(P1, hunted, [], { costChoices: { hunted: [vulture] } }),
    );
    expect(ofType(run.events, "characterDefeated").map((e) => e.instanceId)).toEqual([vulture]);
    expect(inst(run.state, hunted).attachedTo).toBeNull();
    expect(cardsInPlay(run.state)).not.toContain(hunted);
    expect(playerOf(run.state, P1).discard).toContain(hunted);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Known item 5: Fantastic Powers and the encounter deck's shuffle
// ---------------------------------------------------------------------------------------------------------------
describe("56057 Fantastic Powers: when is the encounter deck shuffled? (RRG 'Search' p. 39, 'Find' p. 19)", () => {
  /** Fantastic Powers revealed in a real villain phase (hero form); Super Skrull is wherever `where` says. */
  function reveal(where: "setAside" | "deck" | "discard" | "removed") {
    let s = hulklingHeroGame();
    const skrull = playerOf(s, P1).setAside.find((i) => codeOf(s, i) === "56055")!;
    const pile = encounterPile(s);
    const key = activeEncounterDeckId(s);
    if (where !== "setAside") {
      s = {
        ...s,
        players: s.players.map((p) => ({ ...p, setAside: p.setAside.filter((i) => i !== skrull) })),
        removedFromGame: where === "removed" ? [...s.removedFromGame, skrull] : s.removedFromGame,
        encounterDecks: {
          ...s.encounterDecks,
          [key]: {
            deck: where === "deck" ? [...pile.deck.slice(0, 10), skrull, ...pile.deck.slice(10)] : pile.deck,
            discard: where === "discard" ? [skrull, ...pile.discard] : pile.discard,
          },
        },
      };
    }
    const staged = stackSetAsideBehindBoost(s, "56057");
    const run = drive(staged, {}, endTurn());
    const shuffles = ofType(run.events, "deckShuffled").filter(
      (e) => (e.zone as unknown as { kind?: string }).kind === "encounterDeck",
    );
    return { run, shuffles: shuffles.length, skrull };
  }

  it("Super Skrull in the encounter deck: the find looks through the deck, which is shuffled once", () => {
    const r = reveal("deck");
    expect(r.shuffles).toBe(1);
    expect(inst(r.run.state, r.skrull).attachments).toHaveLength(1);
  });

  it("Super Skrull set aside or in the discard pile (a place everyone knows): the deck is not looked through, so there is nothing to shuffle (RRG 'Find' p. 19: 'should not unnecessarily search game areas')", () => {
    expect(reveal("setAside").shuffles).toBe(0);
    expect(reveal("discard").shuffles).toBe(0);
  });

  it("Super Skrull removed from the game: the find has to look through every area, the encounter deck included, so the deck is shuffled (RRG 'Search' p. 39: any portion searched, shuffle the entire deck)", () => {
    const r = reveal("removed");
    expect(inst(r.run.state, r.skrull).attachments).toHaveLength(0);
    expect(r.shuffles).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Probes: card-against-card and card-against-rule interactions the module tests do not stage
// ---------------------------------------------------------------------------------------------------------------
describe("56045 Excelsior: 'After your hero defends against an enemy attack' with the precon's defense-labeled events (MC56 p. 18; RRG 'Defend, Defense' pp. 14-15)", () => {
  const EXCELSIOR = "56045.excelsior-response";
  /** Hulkling in hero form with Excelsior attached and `code` in hand, facing Rhino's one attack (no defender declared). */
  function attacked(code: string, ref: string) {
    const worn = stagedInPlay(hulklingHeroGame(), "56045", { attach: true });
    const given = moveToHand(worn.state, P1, code, "56037");
    const windows: string[][] = [];
    const run = drive(
      stackEncounterDeck(given.state, ADVANCE, ADVANCE),
      { take: [ref], windows, keep: ["56037"] },
      endTurn(),
    );
    return { windows, run };
  }
  it("control: 'I Can Do This All Day' declares the hero the defender, so Excelsior is offered", () => {
    const r = attacked("56047", "56047.i-can-do-this-all-day-interrupt");
    expect(ofType(r.run.events, "cardPlayed").map((e) => e.cardId as string)).toContain("56047");
    expect(offeredIn(r.windows, EXCELSIOR)).toBe(true);
  });
  it("Cuts Both Ways (a defense-labeled ability, played with no defender declared): 'that player's identity becomes the defender and is considered to have defended', so Excelsior is offered 'to finish him off' (MC56 p. 18)", () => {
    const r = attacked("56050", "56050.cuts-both-ways-interrupt");
    expect(ofType(r.run.events, "cardPlayed").map((e) => e.cardId as string)).toContain("56050");
    expect(offeredIn(r.windows, EXCELSIOR)).toBe(true);
  });
  it("Armored Defense (also defense-labeled): Excelsior is offered after it as well", () => {
    const r = attacked("56038", "56038.armored-defense-interrupt");
    expect(ofType(r.run.events, "cardPlayed").map((e) => e.cardId as string)).toContain("56038");
    expect(offeredIn(r.windows, EXCELSIOR)).toBe(true);
  });
});

describe("56047 'I Can Do This All Day': 'declare your hero as the defender without exhausting them' (RRG 'Defend, Defense' p. 15: it 'can be used on an exhausted hero')", () => {
  it("the hero has already defended Rhino's attack and is exhausted; Venom (ATK 3) attacks next: the event declares the exhausted hero, whose DEF 1 cuts the attack to 2", () => {
    const given = moveToHand(engageMinion(hulklingHeroGame(), "56087", "venom"), P1, "56047");
    const windows: string[][] = [];
    const run = drive(
      stackEncounterDeck(given.state, ADVANCE),
      { defend: true, take: ["56047.i-can-do-this-all-day-interrupt"], against: "56087", windows },
      endTurn(),
    );
    const hero = identityOf(run.state);
    const venomAttack = ofType(run.events, "attackResolved").filter(
      (e) => codeOf(run.state, e.enemyInstanceId) === "56087",
    );
    expect(offeredIn(windows, "56047.i-can-do-this-all-day-interrupt")).toBe(true);
    expect(venomAttack).toMatchObject([{ baseAtk: 3, defenseReduction: 1, damageDealt: 2 }]);
    expect(inst(run.state, hero).exhausted).toBe(true);
  });
});

describe("56039 Impersonation and the form change it offers (RRG 'Form, Change Form' p. 21)", () => {
  /** Hulkling in hero form, the main scheme at exactly 4 threat, Impersonation in hand and Hidden Base in play. */
  function impersonation() {
    const base = stagedInPlay(hulklingHeroGame(), "56043", { counters: { stronghold: 3 } });
    const threatened = patchInstance(base.state, base.state.mainScheme.instanceId, { threat: 4 });
    const given = moveToHand(threatened, P1, "56039");
    const [card] = given.ids as [InstanceId];
    const windows: string[][] = [];
    const run = drive(
      given.state,
      { option: "Change to alter-ego", windows, take: ["56043.hidden-base-response"] },
      play(P1, card, playerOfHand(given.state, card, 2)),
    );
    return { run, windows, hidden: base.id };
  }
  const playerOfHand = (s: GameState, except: InstanceId, n: number): InstanceId[] =>
    playerOf(s, P1)
      .hand.filter((i) => i !== except)
      .slice(0, n);

  it("removing the last threat and changing to alter-ego form is 'after you change form': Hidden Base (Alter-Ego Response) is offered", () => {
    const r = impersonation();
    expect(playerOf(r.run.state, P1).identity.form).toBe("alterEgo");
    expect(offeredIn(r.windows, "56043.hidden-base-response")).toBe(true);
    expect(inst(r.run.state, identityOf(r.run.state)).statuses.tough).toBe(1);
  });
  it("a form change caused by a card ability 'does not count against the one voluntary form change': Teddy may still change back this turn", () => {
    const r = impersonation();
    expect(playerOf(r.run.state, P1).identity.form).toBe("alterEgo");
    const back = applyCommand(r.run.state, { type: "changeForm", playerId: P1 }, DEPS);
    expect(back.ok).toBe(true);
  });
});

describe("56012 Air Cover: 'search your deck and discard pile for a Tactic upgrade that can be attached to that minion and add it to your hand'", () => {
  it("a search that finds a card adds it (RRG 'Search' p. 39), as every other search in the box does (min 1): the card choice must not let the player take nothing while Suppressing Fire is there", () => {
    const covered = stagedInPlay(tigraHeroGame(), "56012", { counters: { fuel: 2 } });
    const mins: number[] = [];
    const run = drive(
      stackEncounterDeck(covered.state, ADVANCE, "01103"),
      { take: ["56012.air-cover-response"], mins },
      endTurn(),
    );
    // The response was taken and a Suppressing Fire (three copies in the deck) was a candidate.
    expect(inst(run.state, covered.id).counters.fuel).toBe(1);
    expect(mins).toEqual([1]);
  });
});

/** Core Spider-Man (Justice) against Rhino, past setup. */
function coreScenarioGame(): GameState {
  const config = coreScenario("rhino", { players: [{ starterDeckId: "core-spider-man-justice" }], seed: 1 } as never);
  const created = createGame(config, DEPS);
  if (!created.ok) throw new Error(created.error.message);
  return settle(created.state, firstLegal, (s) => s.step.phase === "player", DEPS);
}

describe("targets that need threat: 'Remove N threat from a scheme' cannot be initiated while no scheme has threat (RRG 'Target' p. 42: an ability that requires a target needs at least one valid target; a target is valid if any part of the ability can affect it)", () => {
  /** What `legalActions` says of `code` (in hand) with every scheme at 0 threat, then with 1 threat on the main scheme. */
  function offeredWith(game: () => GameState, code: string, ability?: string) {
    const quiet = patchInstance(game(), game().mainScheme.instanceId, { threat: 0 });
    const given = moveToHand(quiet, P1, code);
    const [id] = given.ids as [InstanceId];
    const isIt = (a: { action: { kind: string; instanceId?: InstanceId; abilityId?: string } }) =>
      ability
        ? a.action.kind === "useAbility" && a.action.abilityId === ability
        : a.action.kind === "playCard" && a.action.instanceId === id;
    const flat = (s: GameState) => {
      const actions = legalActions(s, P1, DEPS);
      return actions.kind === "turn" ? actions.legal.some(isIt) : false;
    };
    const threatened = patchInstance(given.state, given.state.mainScheme.instanceId, { threat: 1 });
    return { empty: flat(given.state), withThreat: flat(threatened) };
  }
  it.fails("Core 'For Justice!' 01060 (the same printed shape, Hero Action (thwart): Remove 3 threat from a scheme) shows the engine-wide cause: not playable with no threat anywhere", () => {
    const core = () => withForm(coreScenarioGame(), { heroForm: 0 });
    const r = offeredWith(core, "01060");
    expect(r.withThreat).toBe(true);
    expect(r.empty).toBe(false);
  });
  it.fails("56009 Feline Senses (Hero Action, thwart): not playable with no threat anywhere, playable with 1", () => {
    const r = offeredWith(() => tigraHeroGame(), "56009");
    expect(r.withThreat).toBe(true);
    expect(r.empty).toBe(false);
  });
  it.fails("56039 Impersonation (Hero Action, thwart): not playable with no threat anywhere, playable with 1", () => {
    const r = offeredWith(() => hulklingHeroGame(), "56039");
    expect(r.withThreat).toBe(true);
    expect(r.empty).toBe(false);
  });
  it.fails("56003 Precinct HQ (Alter-Ego Action, remove threat from a scheme): not usable with no threat anywhere, usable with 1", () => {
    const hq = stagedInPlay(tigraGame(), "56003");
    const usable = (s: GameState) => {
      const actions = legalActions(s, P1, DEPS);
      return (
        actions.kind === "turn" &&
        actions.legal.some(
          (a) => a.action.kind === "useAbility" && (a.action.abilityId as string) === "56003.precinct-hq-action",
        )
      );
    };
    const quiet = patchInstance(hq.state, hq.state.mainScheme.instanceId, { threat: 0 });
    expect(usable(patchInstance(quiet, quiet.mainScheme.instanceId, { threat: 1 }))).toBe(true);
    expect(usable(quiet)).toBe(false);
  });
});

describe("the ten reprints that alias another card's script print the same rules text as their source", () => {
  const PAIRS: readonly (readonly [string, string])[] = [
    ["56011", "04040"], // Spider-Girl
    ["56014", "46014"], // Suppressing Fire
    ["56015", "19030"], // "Bring It!"
    ["56018", "21046"], // Audacity
    ["56042", "09012"], // Brother Voodoo
    ["56044", "09019"], // The Night Nurse
    ["56048", "42016"], // Taunt
    ["56049", "05015"], // Tackle
    ["56051", "21064"], // Preservation
    ["56053", "12033"], // Assess the Situation
  ];
  const text = (code: string): string => {
    const c = PLAYABLE_CARDS.find((x) => (x.id as string) === code) as unknown as { text?: { current: string } };
    return (c.text?.current ?? "").replace(/s+/g, " ").trim();
  };
  for (const [reprint, source] of PAIRS)
    it(`${reprint} prints ${source}'s text`, () => {
      expect(text(reprint)).not.toBe("");
      expect(text(reprint)).toBe(text(source));
    });
});

describe("status cards against the box's damage responses (RRG 'Status Cards' p. 41, 'Tough' p. 44)", () => {
  const withTough = (g: GameState): GameState =>
    patchInstance(g, identityOf(g), { statuses: { ...inst(g, identityOf(g)).statuses, tough: 1 } });

  it("56006 Cat-Like Reflexes with a tough status card: 'status card abilities have timing priority over all conflicting triggered abilities', so the tough card takes the damage first and the optional interrupt is never offered (this also answers the Mark V Armor question of the registration audit, F3, the other way)", () => {
    const worn = stagedInPlay(withTough(tigraHeroGame()), "56006", { attach: true });
    const windows: string[][] = [];
    const run = drive(
      stackEncounterDeck(worn.state, ADVANCE, ADVANCE),
      { take: ["56006.cat-like-reflexes-interrupt"], windows },
      endTurn(),
    );
    expect(offeredIn(windows, "56006.cat-like-reflexes-interrupt")).toBe(false);
    expect(inst(run.state, identityOf(run.state)).statuses.tough).toBe(0);
    expect(inst(run.state, identityOf(run.state)).damage).toBe(0);
    expect(inst(run.state, worn.id).attachedTo).toBe(identityOf(run.state));
  });

  it("a tough card is not spent when the defender's DEF reduces the attack to 0 (RRG 'Tough' p. 44): Hulkling with Armored Shape (DEF 3) defends Rhino's ATK 2 and keeps his tough card", () => {
    const worn = stagedInPlay(withTough(hulklingHeroGame()), "56034", { attach: true });
    const run = drive(stackEncounterDeck(worn.state, ADVANCE, ADVANCE), { defend: true }, endTurn());
    expect(inst(run.state, identityOf(run.state)).statuses.tough).toBe(1);
    expect(inst(run.state, identityOf(run.state)).damage).toBe(0);
  });
});

describe("56035 Imitation Shape against 56055 Super Skrull (RRG 'Interrupt' p. 25: interrupts that use the word 'would' resolve before the triggering condition initiates)", () => {
  function skrullAgainstImitation() {
    const worn = stagedInPlay(hulklingHeroGame(), "56035", { attach: true });
    let s = worn.state;
    const skrull = playerOf(s, P1).setAside.find((i) => codeOf(s, i) === "56055")!;
    s = {
      ...s,
      players: s.players.map((p) =>
        p.playerId === P1
          ? { ...p, setAside: p.setAside.filter((i) => i !== skrull), playArea: [...p.playArea, skrull] }
          : p,
      ),
    };
    s = patchInstance(s, skrull, { faceup: true, controllerId: null, engagedWith: P1 });
    const run = drive(stackEncounterDeck(s, ADVANCE), {}, endTurn());
    return { run, skrull };
  }
  it("Super Skrull's activation: Imitation Shape ('When an enemy would attack you, it schemes instead') replaces the attack before it initiates, so Super Skrull schemes and his 'When Super Skrull attacks you' Forced Interrupt never triggers", () => {
    const { run, skrull } = skrullAgainstImitation();
    expect(ofType(run.events, "schemeResolved").map((e) => e.enemyInstanceId)).toContain(skrull);
    expect(ofType(run.events, "attackResolved").map((e) => e.enemyInstanceId)).not.toContain(skrull);
    expect(ofType(run.events, "cardDiscardedFromDeck")).toHaveLength(0);
  });
});
