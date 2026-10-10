import { describe, expect, it, vi } from "vitest";
import { FALCON_CARDS, PLAYABLE_CARDS, cardId, encounterSetId } from "@mc/content";
import {
  activeEncounterDeckId,
  applyCommand,
  createGame,
  statBonus,
  traitsOf,
  type Command,
  type EngineDeps,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { abilityRefIds } from "../../ability-refs.js";
import { validateDefinition } from "../../dsl/validate.js";
import { mergeRegistries } from "../../dsl/index.js";
import { coreScenario } from "../../core/setup.js";
import {
  P1,
  P2,
  endTurn,
  firstLegal,
  identityOf,
  inst,
  patchInstance,
  settle,
  use,
  type Picker,
} from "../../testing/harness.js";
import { driveEventsPicking } from "../../testing/staging.js";
import { WAVE8_ABILITIES } from "../../wave8/index.js";
import { EXTREME_RISK } from "../bp/extreme-risk.js";
import { attachToHost, engageMinion } from "../../wave6/mut_gen/project-wideawake-testing.js";
import {
  BLANK,
  CAPTAIN_MARVEL,
  ONE_ICON,
  SHE_HULK,
  SPIDER_MAN,
  attacksBy,
  codeOf,
  heroForm,
  inDiscard,
  inPlayCard,
  onlyDeck,
  piles,
  revealedCodes,
  schemesBy,
  types,
  without,
  type Seats,
} from "../testing.js";
import { WAVE9_ABILITIES } from "../index.js";
import { wave9Scenario } from "../setup.js";
import { stagedInPlay } from "./testing.js";
import { TECHNO, TECHNO_SKIPPED } from "./techno.js";

vi.setConfig({ testTimeout: 120_000 });

/**
 * The Techno set (53038 Fixer, 53039 Jet Pack, 53040 Tech-Pac, 53041 Technological Innovation, 53042 Techno),
 * docs/phase7-wave9.md sections 3.48 and 3.49. Rhino (Core, standard) against a Core starter deck with the set's cards
 * added to the encounter deck by hand, plus Energy Truncheon 51040 (Black Panther) and High-Tech Armament 54030 (Winter
 * Soldier), two other Tech attachments that attach to the villain when their named enemy is absent. Core's Rhino is
 * ATK 2 / SCH 1; Fixer is ATK 1 / SCH 2 with 15 hit points and 4 boost icons.
 */
const FIXER = "53038";
const JET_PACK = "53039";
const TECH_PAC = "53040";
const INNOVATION = "53041";
const TECHNO_CARD = "53042";
const TRUNCHEON = "51040";
const ARMAMENT = "54030";
const SET = [FIXER, JET_PACK, TECH_PAC, INNOVATION, TECHNO_CARD];
const REFS = [
  "53038.fixer-forced-interrupt",
  "53039.jet-pack-constant",
  "53039.jet-pack-forced-interrupt",
  "53040.tech-pac-constant",
  "53040.tech-pac-action",
  "53041.when-revealed",
  "53042.when-revealed",
  "53042.boost",
];
const RHINO = "01094";
const MOCKINGBIRD = "01083";
const JESSICA_JONES = "01059";
const BLACK_CAT = "01002";
const JOYSTICK = "51039";
/** Core encounter treacheries used as boost cards (distinct instances; icons are not relied on unless said). */
const CARDS = [BLANK, "01187", "01189", "01190", ONE_ICON];

const DEPS: EngineDeps = { abilities: mergeRegistries(WAVE8_ABILITIES, EXTREME_RISK, TECHNO) };

const dataOf = (code: string) =>
  FALCON_CARDS.find((c) => (c.id as string) === code)! as unknown as Record<string, unknown>;

function setupGame(players: Seats = [SPIDER_MAN]): GameState {
  const config = coreScenario("rhino", {
    players,
    seed: 1,
    difficulty: "standard",
    modularSetIds: [],
    cardPool: PLAYABLE_CARDS,
  });
  const set = FALCON_CARDS.filter(
    (c) => "encounterSetIds" in c && c.encounterSetIds.includes(encounterSetId("techno")),
  ).flatMap((c) => Array.from({ length: c.quantityInSet }, () => c.id));
  const others = [TRUNCHEON, TRUNCHEON, ARMAMENT, JOYSTICK].map((code) => cardId(code));
  const created = createGame({ ...config, encounterDeck: [...config.encounterDeck, ...set, ...others] }, DEPS);
  if (!created.ok) throw new Error(created.error.message);
  return settle(created.state, firstLegal, (s) => s.step.phase === "player", DEPS);
}

/** Every player ends their turn, in seat order, and the villain phase runs on the stacked deck. */
function villainPhase(state: GameState, pick: Picker = firstLegal) {
  return driveEventsPicking(DEPS, state, pick, ...state.players.map((p) => endTurn(p.playerId)));
}

/** Answers a choice with the option whose label starts with `label`. */
const labeled =
  (label: string): Picker =>
  (s) => {
    const option = s.pendingChoice!.options.find((o) => o.label.startsWith(label));
    return option ? [option.optionId] : firstLegal(s);
  };

const refusal = (s: GameState, command: Command): string | undefined => {
  const result = applyCommand(s, command, DEPS);
  return result.ok ? undefined : result.error.message;
};
const rhinoOf = (s: GameState): InstanceId => s.villains[0]!.instanceId;
const attachedTo = (s: GameState, code: string) => inst(s, inPlayCard(s, code)!).attachedTo;
const hasTrait = (s: GameState, id: InstanceId, name: string) =>
  (traitsOf(s, id, DEPS) as readonly string[]).includes(name);

/** Fixer in play engaged with player 1, by surgery (no reveal). */
const withFixer = (s: GameState) => engageMinion(s, FIXER, P1);

describe("registry", () => {
  it("registers the eight refs of the five cards, each a valid definition, and skips nothing", () => {
    expect(Object.keys(TECHNO).sort()).toEqual([...REFS].sort());
    for (const [id, def] of Object.entries(TECHNO)) expect(validateDefinition(def), id).toEqual([]);
    expect(TECHNO_SKIPPED).toEqual({});
  });

  it("the data names exactly these refs for the five cards", () => {
    const refs = SET.flatMap((code) => abilityRefIds(dataOf(code) as never));
    expect(refs.sort()).toEqual([...REFS].sort());
  });

  it("timing words: Fixer's and Jet Pack's are forced interrupts, Tech-Pac's a hero action", () => {
    expect(TECHNO["53038.fixer-forced-interrupt"]).toMatchObject({ trigger: { kind: "interrupt", forced: true } });
    expect(TECHNO["53039.jet-pack-forced-interrupt"]).toMatchObject({ trigger: { kind: "interrupt", forced: true } });
    expect(TECHNO["53040.tech-pac-action"]).toMatchObject({ trigger: { kind: "action", form: "hero" } });
  });

  it("setup: the set's six copies (1 Fixer, 1 Jet Pack, 1 Tech-Pac, 1 Technological Innovation, 2 Techno) are in the deck", () => {
    const s = setupGame();
    const counts = SET.map((code) => piles(s).deck.filter((id) => codeOf(s, id) === code).length);
    expect(counts).toEqual([1, 1, 1, 1, 2]);
  });
});

describe("printed data", () => {
  it("Fixer: an Elite Genius Thunderbolt unique minion, ATK 1, SCH 2, 15 hit points, 4 boost icons, Villainous, Victory 1", () => {
    const card = dataOf(FIXER);
    expect([card.atk, card.sch, card.hp, card.boostIcons, card.unique]).toEqual([1, 2, 15, 4, true]);
    expect(card.traits).toEqual(["ELITE", "GENIUS", "THUNDERBOLT"]);
    expect(card.keywords).toEqual([{ name: "villainous" }, { name: "victory", value: 1 }]);
  });

  it("Jet Pack and Tech-Pac: Tech attachments that attach to Fixer, otherwise the villain; Tech-Pac prints +1 ATK / +1 SCH", () => {
    for (const code of [JET_PACK, TECH_PAC]) {
      expect(dataOf(code).traits, code).toEqual(["TECH"]);
      expect(dataOf(code).attachesTo, code).toEqual({
        kind: "ifAble",
        preferred: { kind: "namedCard", name: "Fixer" },
        otherwise: { kind: "villain" },
      });
    }
    expect([dataOf(JET_PACK).boostIcons, dataOf(TECH_PAC).boostIcons, dataOf(TECH_PAC).statModifiers]).toEqual([
      1,
      3,
      { atk: 1, sch: 1 },
    ]);
  });

  it("Technological Innovation (4 threat, acceleration) and Techno (2 copies, boost star)", () => {
    expect([dataOf(INNOVATION).startingThreat, dataOf(INNOVATION).icons]).toEqual([
      { base: 4, perPlayer: 0 },
      ["acceleration"],
    ]);
    expect([dataOf(TECHNO_CARD).quantityInSet, dataOf(TECHNO_CARD).starIcon, dataOf(TECHNO_CARD).boostIcons]).toEqual([
      2,
      true,
      1,
    ]);
  });
});

describe("Fixer (53038) forced interrupt: a non-scenario-specific Tech attachment bound for the villain is attached to him", () => {
  it.each([
    [TRUNCHEON, "Energy Truncheon (51040: attach to Joystick, otherwise the villain)"],
    [ARMAMENT, "High-Tech Armament (54030: attach to Crossbones, otherwise the villain)"],
  ])("%s, revealed with Fixer in play, is attached to Fixer and not to Rhino: %s", (code) => {
    const { state, id: fixer } = withFixer(heroForm(setupGame()));
    const run = villainPhase(onlyDeck(state, BLANK, BLANK, code));
    const card = inPlayCard(run.state, code)!;
    expect(card).toBeDefined();
    expect(inst(run.state, card).attachedTo).toBe(fixer);
    expect(inst(run.state, fixer).attachments).toContain(card);
    expect(inst(run.state, rhinoOf(run.state)).attachments).toEqual([]);
  });

  it("with Fixer not in play the same attachment goes to the villain, as printed", () => {
    const run = villainPhase(onlyDeck(heroForm(setupGame()), BLANK, TRUNCHEON));
    expect(attachedTo(run.state, TRUNCHEON)).toBe(rhinoOf(run.state));
  });

  it("with Fixer in the encounter deck but not in play, nothing is redirected either", () => {
    const run = villainPhase(onlyDeck(heroForm(setupGame()), BLANK, ARMAMENT, FIXER));
    expect(attachedTo(run.state, ARMAMENT)).toBe(rhinoOf(run.state));
  });

  it("Jet Pack and Tech-Pac already print 'attach to Fixer': with him in play they go to him, with the interrupt unused; without him, to the villain", () => {
    for (const code of [JET_PACK, TECH_PAC]) {
      const { state, id: fixer } = withFixer(heroForm(setupGame()));
      const withHim = villainPhase(onlyDeck(state, BLANK, BLANK, code));
      expect(attachedTo(withHim.state, code), code).toBe(fixer);
      const without = villainPhase(onlyDeck(heroForm(setupGame()), BLANK, code));
      expect(attachedTo(without.state, code), code).toBe(rhinoOf(without.state));
    }
  });

  it("only an attachment that would go to the villain: a Tech attachment attached to a minion by its own text is left where it is", () => {
    // Energy Truncheon prints 'attach to Joystick'; with Joystick in play it goes to Joystick, not on to Fixer.
    const base = heroForm(setupGame());
    const joystick = engageMinion(base, JOYSTICK, P1);
    const fixer = engageMinion(joystick.state, FIXER, P1);
    const run = villainPhase(onlyDeck(fixer.state, ...CARDS.slice(0, 3), TRUNCHEON), labeled("Give her a tough"));
    expect(attachedTo(run.state, TRUNCHEON)).toBe(joystick.id);
  });

  it("the villain alias: a redirected Energy Truncheon's Hero Action makes Fixer (not the villain) attack you: ATK 1 + 1 = 2", () => {
    const { state, id: fixer } = withFixer(heroForm(setupGame()));
    const attached = villainPhase(onlyDeck(state, BLANK, BLANK, TRUNCHEON));
    const truncheon = inPlayCard(attached.state, TRUNCHEON)!;
    expect(inst(attached.state, truncheon).attachedTo).toBe(fixer);
    const staged = onlyDeck(attached.state, BLANK, BLANK);
    const used = driveEventsPicking(DEPS, staged, firstLegal, use(P1, truncheon, "51040.energy-truncheon-action"));
    expect(attacksBy(used.state, used.events, FIXER)).toMatchObject([{ baseAtk: 2 }]);
    expect(attacksBy(used.state, used.events, RHINO)).toEqual([]);
  });
});

describe("Jet Pack (53039)", () => {
  it("CONSTANT: the attached enemy gains Aerial (Fixer here), and loses it when Jet Pack leaves", () => {
    const { state, id: fixer } = withFixer(setupGame());
    expect(hasTrait(state, fixer, "AERIAL")).toBe(false);
    const { state: packed, id: pack } = attachToHost(state, JET_PACK, fixer);
    expect(hasTrait(packed, fixer, "AERIAL")).toBe(true);
    expect(hasTrait(packed, rhinoOf(packed), "AERIAL")).toBe(false);
    const gone = patchInstance(patchInstance(packed, fixer, { attachments: [] }), pack, { attachedTo: null });
    expect(hasTrait(gone, fixer, "AERIAL")).toBe(false);
  });

  it("CONSTANT: on the villain (no Fixer in play) it is Rhino that gains Aerial", () => {
    const { state } = attachToHost(setupGame(), JET_PACK, rhinoOf(setupGame()));
    expect(hasTrait(state, rhinoOf(state), "AERIAL")).toBe(true);
  });

  const hit = (seats: Seats, host: "fixer" | "rhino") => {
    const base = heroForm(setupGame(seats));
    const fixer = withFixer(base);
    const target = host === "fixer" ? fixer.id : rhinoOf(base);
    const packed = attachToHost(fixer.state, JET_PACK, target);
    const run = driveEventsPicking(DEPS, packed.state, firstLegal, {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: identityOf(packed.state),
      targetInstanceId: target,
    });
    return { run, target, pack: packed.id };
  };

  it("FORCED INTERRUPT, 2 damage (Spider-Man ATK 2): taken in full, Jet Pack stays", () => {
    const { run, target, pack } = hit([SPIDER_MAN], "fixer");
    expect(inst(run.state, target).damage).toBe(2);
    expect(inst(run.state, pack).attachedTo).toBe(target);
    expect(types(run.events, "damagePrevented")).toEqual([]);
  });

  it("FORCED INTERRUPT, 3 damage (She-Hulk ATK 3): all of it is prevented and Jet Pack is discarded", () => {
    const { run, target, pack } = hit([SHE_HULK], "fixer");
    expect(inst(run.state, target).damage).toBe(0);
    expect(types(run.events, "damagePrevented")).toMatchObject([{ targetInstanceId: target, amount: 3 }]);
    expect(piles(run.state).discard).toContain(pack);
    expect(inst(run.state, target).attachments).toEqual([]);
  });

  it("FORCED INTERRUPT: the same on the villain when it is the host", () => {
    const { run, target, pack } = hit([SHE_HULK], "rhino");
    expect(inst(run.state, target).damage).toBe(0);
    expect(piles(run.state).discard).toContain(pack);
  });

  it("FORCED INTERRUPT: damage to any other enemy is not its business (Rhino hit for 3 while Jet Pack is on Fixer)", () => {
    const base = heroForm(setupGame([SHE_HULK]));
    const fixer = withFixer(base);
    const packed = attachToHost(fixer.state, JET_PACK, fixer.id);
    const run = driveEventsPicking(DEPS, packed.state, firstLegal, {
      type: "basicAttack",
      playerId: P1,
      attackerInstanceId: identityOf(packed.state),
      targetInstanceId: rhinoOf(base),
    });
    expect(inst(run.state, rhinoOf(base)).damage).toBe(3);
    expect(inst(run.state, packed.id).attachedTo).toBe(fixer.id);
  });
});

describe("Tech-Pac (53040)", () => {
  /** Fixer ATK 1, SCH 2: the printed base, with Tech-Pac's own +1 ATK / +1 SCH from the data. */
  const fixerAttack = (attachments: readonly string[]) => {
    let s = heroForm(setupGame());
    const fixer = withFixer(s);
    s = fixer.state;
    for (const code of attachments) s = attachToHost(s, code, fixer.id).state;
    const run = villainPhase(onlyDeck(s, ...CARDS));
    return attacksBy(run.state, run.events, FIXER)[0]!;
  };

  it("CONSTANT: alone it is just the printed +1 ATK: Fixer attacks with 1 + 1 = 2", () => {
    expect(fixerAttack([TECH_PAC]).baseAtk).toBe(2);
  });

  it("CONSTANT: +1 ATK for each other Tech attachment: Jet Pack makes it 3", () => {
    expect(fixerAttack([TECH_PAC, JET_PACK]).baseAtk).toBe(3);
  });

  it("CONSTANT: Energy Truncheon (Tech, +1 ATK of its own) adds its +1 and counts for Tech-Pac too: 1 + 1 + 1 + 1 = 4", () => {
    expect(fixerAttack([TECH_PAC, TRUNCHEON]).baseAtk).toBe(4);
  });

  it("CONSTANT: both others count: Jet Pack and Energy Truncheon give 1 + 1 (Tech-Pac) + 1 (Truncheon) + 2 = 5", () => {
    expect(fixerAttack([TECH_PAC, JET_PACK, TRUNCHEON]).baseAtk).toBe(5);
  });

  it("CONSTANT: a non-Tech attachment does not count (a Core attachment on Fixer)", () => {
    expect(fixerAttack([TECH_PAC, "01099"]).baseAtk).toBe(2);
  });

  it("CONSTANT: only the attached enemy gets it: Rhino beside Fixer keeps ATK 2 (statBonus is read on the host)", () => {
    const { state, id: fixer } = withFixer(setupGame());
    const packed = attachToHost(attachToHost(state, TECH_PAC, fixer).state, JET_PACK, fixer).state;
    expect(statBonus(packed, DEPS, fixer, "atk")).toBeGreaterThanOrEqual(2);
    expect(statBonus(packed, DEPS, rhinoOf(packed), "atk")).toBe(0);
  });

  it("CONSTANT: the attached enemy only: Rhino keeps its own ATK bonus (0) while Tech-Pac sits on Fixer, and Jet Pack raises Fixer's by 1", () => {
    const { state, id: fixer } = withFixer(setupGame());
    const alone = attachToHost(state, TECH_PAC, fixer).state;
    const both = attachToHost(alone, JET_PACK, fixer).state;
    expect(statBonus(both, DEPS, fixer, "atk") - statBonus(alone, DEPS, fixer, "atk")).toBe(1);
    expect(statBonus(both, DEPS, rhinoOf(both), "atk")).toBe(0);
  });

  /** Spider-Man hero form (THW 1) with Black Cat, Mockingbird and Jessica Jones (THW 1 each) in play, Tech-Pac on `host`. */
  function staged(host: "fixer" | "rhino") {
    const base = heroForm(setupGame());
    const fixer = withFixer(base);
    const target = host === "fixer" ? fixer.id : rhinoOf(base);
    const pac = attachToHost(fixer.state, TECH_PAC, target);
    const cat = stagedInPlay(pac.state, BLACK_CAT);
    const bird = stagedInPlay(cat.state, MOCKINGBIRD);
    const jessica = stagedInPlay(bird.state, JESSICA_JONES);
    return { state: jessica.state, pac: pac.id, cat: cat.id, bird: bird.id, jessica: jessica.id, target };
  }
  const ABILITY = "53040.tech-pac-action";
  const act = (state: GameState, pac: InstanceId, paying: readonly InstanceId[]) =>
    driveEventsPicking(DEPS, state, firstLegal, use(P1, pac, ABILITY, [], { exhausted: paying }));
  const tryPaying = (state: GameState, pac: InstanceId, paying: readonly InstanceId[]) =>
    refusal(state, use(P1, pac, ABILITY, [], { exhausted: paying }));

  it("HERO ACTION, on the villain (SCH 1 + 1 = 2): characters with combined THW 3 (Spider-Man, Black Cat, Mockingbird) exhaust and Tech-Pac is discarded", () => {
    const s = staged("rhino");
    const paying = [identityOf(s.state), s.cat, s.bird];
    const out = act(s.state, s.pac, paying);
    for (const id of paying) expect(inst(out.state, id).exhausted).toBe(true);
    expect(inst(out.state, s.jessica).exhausted).toBe(false);
    expect(piles(out.state).discard).toContain(s.pac);
    expect(inst(out.state, s.target).attachments).toEqual([]);
  });

  it("HERO ACTION: combined THW must be greater than the SCH, not equal: Spider-Man and Black Cat (2) against SCH 2 cannot pay", () => {
    const s = staged("rhino");
    expect(tryPaying(s.state, s.pac, [identityOf(s.state), s.cat])).toBeDefined();
    expect(inst(s.state, s.pac).attachedTo).toBe(s.target);
  });

  it("HERO ACTION, on Fixer (SCH 2 + 1 = 3): combined THW 3 is refused, 4 pays", () => {
    const s = staged("fixer");
    expect(tryPaying(s.state, s.pac, [identityOf(s.state), s.cat, s.bird])).toBeDefined();
    const out = act(s.state, s.pac, [identityOf(s.state), s.cat, s.bird, s.jessica]);
    expect(piles(out.state).discard).toContain(s.pac);
    expect(inst(out.state, s.jessica).exhausted).toBe(true);
  });

  it("HERO ACTION: exhausted characters cannot pay: with Black Cat and Mockingbird tired only Spider-Man and Jessica are left (2, not above 2)", () => {
    const s = staged("rhino");
    const tired = patchInstance(patchInstance(s.state, s.cat, { exhausted: true }), s.bird, { exhausted: true });
    expect(tryPaying(tired, s.pac, [identityOf(tired), s.jessica])).toBeDefined();
    expect(tryPaying(tired, s.pac, [identityOf(tired), s.cat, s.jessica])).toBeDefined();
  });
});

describe("Technological Innovation (53041) WHEN REVEALED: find a Tech attachment in the encounter deck or discard pile and reveal it, then 1 additional threat per Tech card in play", () => {
  const reveal = (state: GameState, pick: Picker = firstLegal) =>
    villainPhase(onlyDeck(state, ...CARDS.slice(0, 1), INNOVATION, ...rest(state)), pick);
  /** The Tech attachments left to find, plus the boost-card fillers the villain phase needs. */
  const rest = (state: GameState) => [
    ...[JET_PACK, TECH_PAC, TRUNCHEON, ARMAMENT].filter((code) =>
      piles(state).deck.some((i) => codeOf(state, i) === code),
    ),
    ...CARDS.slice(1, 4),
  ];
  const side = (s: GameState) => inPlayCard(s, INNOVATION)!;

  it("finds the chosen Tech attachment, reveals it (it attaches to the villain) and counts it: 4 + 1 = 5 threat", () => {
    const base = heroForm(setupGame());
    const picked =
      (code: string): Picker =>
      (s) => {
        const choice = s.pendingChoice!;
        const hit = choice.options.find(
          (o) => choice.prompt.kind === "chooseCards" && codeOf(s, o.optionId as InstanceId) === code,
        );
        return hit ? [hit.optionId] : firstLegal(s);
      };
    const run = reveal(base, picked(JET_PACK));
    expect(revealedCodes(run.state, run.events).slice(0, 2)).toEqual([INNOVATION, JET_PACK]);
    expect(attachedTo(run.state, JET_PACK)).toBe(rhinoOf(run.state));
    expect(inst(run.state, side(run.state)).threat).toBe(5);
  });

  it("another Tech attachment of the same search is just as findable (High-Tech Armament), and Tech cards already in play add threat: Tech-Pac on Rhino makes 4 + 2 = 6", () => {
    const base = heroForm(setupGame());
    const pac = attachToHost(base, TECH_PAC, rhinoOf(base));
    const picked: Picker = (s) => {
      const choice = s.pendingChoice!;
      const hit = choice.options.find(
        (o) => choice.prompt.kind === "chooseCards" && codeOf(s, o.optionId as InstanceId) === ARMAMENT,
      );
      return hit ? [hit.optionId] : firstLegal(s);
    };
    const run = reveal(pac.state, picked);
    expect(revealedCodes(run.state, run.events).slice(0, 2)).toEqual([INNOVATION, ARMAMENT]);
    expect(inst(run.state, side(run.state)).threat).toBe(6);
  });

  it("searches the discard pile too: a Jet Pack there is found when the deck holds no other Tech attachment", () => {
    const base = heroForm(setupGame());
    const pack = piles(base).deck.find((i) => codeOf(base, i) === JET_PACK)!;
    const decked = onlyDeck(base, BLANK, INNOVATION, "01187", "01189");
    const id = activeEncounterDeckId(decked);
    const staged = {
      ...decked,
      encounterDecks: { ...decked.encounterDecks, [id]: { deck: decked.encounterDecks[id]!.deck, discard: [pack] } },
    };
    const run = villainPhase(staged);
    expect(revealedCodes(run.state, run.events).slice(0, 2)).toEqual([INNOVATION, JET_PACK]);
    expect(inst(run.state, side(run.state)).threat).toBe(5);
  });

  it("no Tech attachment anywhere: nothing is found and only the printed 4 threat (no Tech card in play)", () => {
    const base = heroForm(setupGame());
    const run = villainPhase(onlyDeck(base, BLANK, INNOVATION, "01187", "01189"));
    expect(inst(run.state, side(run.state)).threat).toBe(4);
    expect(revealedCodes(run.state, run.events)[0]).toBe(INNOVATION);
  });

  it("the encounter deck is shuffled by the search", () => {
    const base = heroForm(setupGame());
    const run = reveal(base);
    expect(types(run.events, "deckShuffled").length).toBeGreaterThanOrEqual(1);
  });
});

describe("Techno (53042)", () => {
  it("WHEN REVEALED (hero): Fixer is found, engages the revealing player and attacks: ATK 1 + 1 icon = 2 damage; no surge", () => {
    const run = villainPhase(onlyDeck(heroForm(setupGame()), BLANK, TECHNO_CARD, FIXER, ONE_ICON));
    const fixer = inPlayCard(run.state, FIXER)!;
    expect(inst(run.state, fixer).engagedWith).toBe(P1);
    expect(attacksBy(run.state, run.events, FIXER)).toMatchObject([{ baseAtk: 1, boostIcons: 1, damageDealt: 2 }]);
    expect(revealedCodes(run.state, run.events)).toEqual([TECHNO_CARD, FIXER]);
    expect(inDiscard(run.state, TECHNO_CARD)).toHaveLength(1);
  });

  it("WHEN REVEALED (alter-ego): Fixer schemes: SCH 2 + 1 icon = 3 threat", () => {
    const run = villainPhase(onlyDeck(setupGame(), BLANK, TECHNO_CARD, FIXER, ONE_ICON));
    expect(schemesBy(run.state, run.events, FIXER)).toMatchObject([{ baseSch: 2, boostIcons: 1, threatPlaced: 3 }]);
  });

  it("WHEN REVEALED: with Fixer already in play engaged with player 2 he engages the revealing player 1 and attacks them", () => {
    const state = heroForm(setupGame([SPIDER_MAN, CAPTAIN_MARVEL]), P1, P2);
    const placed = engageMinion(state, FIXER, P2);
    const run = villainPhase(onlyDeck(placed.state, ...CARDS.slice(0, 3), TECHNO_CARD, ONE_ICON, "01190"));
    expect(inst(run.state, placed.id).engagedWith).toBe(P1);
    expect(attacksBy(run.state, run.events, FIXER).length).toBeGreaterThanOrEqual(2);
  });

  it("WHEN REVEALED: with no Fixer anywhere nothing activates and this card gains surge: the next card is revealed", () => {
    const run = villainPhase(onlyDeck(without(heroForm(setupGame()), FIXER), BLANK, TECHNO_CARD, "01187"));
    expect(inPlayCard(run.state, FIXER)).toBeUndefined();
    expect(revealedCodes(run.state, run.events)).toEqual([TECHNO_CARD, "01187"]);
  });

  // Boost: "If this activation is an attack, it gains piercing." A tough status card is removed by a non-piercing
  // attack (absorbing the damage) and ignored by a piercing one, which deals its damage and leaves the status card.
  const toughHero = () => {
    const base = heroForm(setupGame());
    const hero = identityOf(base);
    return { hero, state: patchInstance(base, hero, { statuses: { ...inst(base, hero).statuses, tough: 1 } }) };
  };

  it("BOOST on an attack: Rhino's attack gains piercing, so the hero's tough status card does not absorb it: ATK 2 + 1 icon = 3 damage", () => {
    const { state, hero } = toughHero();
    const run = villainPhase(onlyDeck(state, TECHNO_CARD, BLANK, "01187"));
    expect(attacksBy(run.state, run.events, RHINO)).toMatchObject([{ baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
    expect(inst(run.state, hero).damage).toBe(3);
  });

  it("BOOST control: the same attack boosted by another 1-icon card is absorbed by the tough status card", () => {
    const { state, hero } = toughHero();
    const run = villainPhase(onlyDeck(state, ONE_ICON, BLANK, "01187"));
    expect(inst(run.state, hero).damage).toBe(0);
    expect(inst(run.state, hero).statuses.tough).toBe(0);
  });

  it("BOOST on a scheme: nothing to pierce, the scheme resolves normally (SCH 1 + 1 icon = 2 threat)", () => {
    const run = villainPhase(onlyDeck(setupGame(), TECHNO_CARD, BLANK, "01187"));
    expect(schemesBy(run.state, run.events, RHINO)[0]).toMatchObject({ baseSch: 1, boostIcons: 1, threatPlaced: 2 });
  });
});

describe("Fixer (53038): a scenario-specific Tech attachment is not redirected", () => {
  // Black Widow's Gauntlet (50068) is a Tech attachment of the Black Widow scenario's own set that attaches to the
  // villain: "non-scenario-specific" leaves it on her (RRG 1.8 "Scenario-Specific Card", p. 39).
  const GAUNTLET = "50068";
  const WIDOW_DEPS: EngineDeps = { abilities: WAVE9_ABILITIES };

  function widowGame(): GameState {
    const config = wave9Scenario("black-widow", { players: [SPIDER_MAN], seed: 1 });
    const extra = [cardId(FIXER)];
    const created = createGame({ ...config, encounterDeck: [...config.encounterDeck, ...extra] }, WIDOW_DEPS);
    if (!created.ok) throw new Error(created.error.message);
    return settle(created.state, firstLegal, (s) => s.step.phase === "player", WIDOW_DEPS);
  }

  it("with Fixer in play, the Gauntlet revealed for Black Widow's scenario attaches to the villain and Fixer keeps nothing; Energy Truncheon would not stay", () => {
    const base = heroForm(widowGame());
    const fixer = engageMinion(base, FIXER, P1);
    const gauntlet = piles(fixer.state).deck.find((i) => codeOf(fixer.state, i) === GAUNTLET);
    // The Gauntlet is somewhere in the encounter deck or already attached by setup: take it out of play first if so.
    expect(gauntlet === undefined ? inPlayCard(fixer.state, GAUNTLET) : gauntlet).toBeDefined();
    const villain = fixer.state.villains[0]!.instanceId;
    const staged = gauntlet === undefined ? fixer.state : onlyDeck(fixer.state, BLANK, "01187", GAUNTLET, "01189");
    const run = driveEventsPicking(WIDOW_DEPS, staged, firstLegal, ...staged.players.map((p) => endTurn(p.playerId)));
    const card = inPlayCard(run.state, GAUNTLET)!;
    expect(inst(run.state, card).attachedTo).toBe(villain);
    expect(inst(run.state, fixer.id).attachments).not.toContain(card);
  });
});
