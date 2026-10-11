import { AOS_CARDS, cardId } from "@mc/content";
import {
  createGame,
  type CampaignDefinition,
  type CampaignLog,
  type GameState,
  type InstanceId,
  type PlayerId,
} from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { validateDefinition } from "../../../dsl/validate.js";
import { P1, P2, firstLegal, settle, type Picker } from "../../../testing/harness.js";
import { WAVE9_DEPS } from "../../index.js";
import { WAVE9_CARDS } from "../../cards.js";
import { wave9Scenario } from "../../setup.js";
import { IRON_MAN, SPIDER_MAN, codeOf } from "../../testing.js";
import { BOARD_MEMBER_FRONTS, attachmentFaceOf } from "./executive-board.js";
import {
  EVIDENCE_SETUPS,
  EXECUTIVE_BOARD_EVIDENCE,
  EXECUTIVE_BOARD_EVIDENCE_SKIPPED,
  evidenceSetupOf,
} from "./executive-board-evidence.js";
import { BOARD_DEFINITION, EXPERT, SEATS, STANDARD, buildGame, compose, newLog } from "./testing.js";

vi.setConfig({ testTimeout: 300_000 });

const [MEDICAL, SURVEILLANCE, TACTICAL] = BOARD_MEMBER_FRONTS as [string, string, string];
const SECRET_OFFER = "Add 1 secret counter";
const THREAT_OFFER = "Add 1 threat";

/** A script for the offers of a game: which a player takes, and what they choose when asked. */
interface Plan {
  /** Offers taken by `player` ("secret" for the first sentence, "threat" for the second), in any number. */
  readonly take?: readonly (readonly [PlayerId, "secret" | "threat"])[];
  /** The Board Member environment (its front face) the counter goes on; the first offered otherwise. */
  readonly member?: string;
  /** The title of the card to find in the collection, by player; with none a search finds nothing. */
  readonly find?: Readonly<Partial<Record<PlayerId, string>>>;
}

interface Asked {
  readonly player: PlayerId;
  readonly kind: string;
  readonly labels: readonly string[];
  readonly ids: readonly string[];
}

function planner(state: () => GameState, plan: Plan, asked: Asked[]): Picker {
  return (s) => {
    const choice = s.pendingChoice!;
    const options = choice.options;
    asked.push({
      player: choice.playerId,
      kind: choice.prompt.kind,
      labels: options.map((o) => o.label),
      ids: options.map((o) => o.optionId as string),
    });
    switch (choice.prompt.kind) {
      case "chooseOption": {
        const offer = options.find((o) => o.label.startsWith(SECRET_OFFER) || o.label.startsWith(THREAT_OFFER));
        if (!offer) return firstLegal(s);
        const which = offer.label.startsWith(SECRET_OFFER) ? "secret" : "threat";
        const takes = (plan.take ?? []).some(([player, kind]) => player === choice.playerId && kind === which);
        if (takes) return [offer.optionId];
        return [options.find((o) => o.label.startsWith("Do not"))!.optionId];
      }
      case "searchCollection": {
        const title = plan.find?.[choice.playerId];
        const hit = title ? options.find((o) => o.label === title) : undefined;
        return hit ? [hit.optionId] : [];
      }
      case "chooseTarget": {
        const boards = options.filter((o) => o.ref.kind === "card" && codeOf(s, o.ref.instanceId) === plan.member);
        return boards.length > 0 ? [boards[0]!.optionId] : firstLegal(s);
      }
      case "chooseCards": {
        // The deck search: the cards offered are in the player's own deck.
        const deck = s.players.find((p) => p.playerId === choice.playerId)?.deck ?? [];
        const inDeck = options.length > 0 && options.every((o) => deck.includes(o.optionId as InstanceId));
        return inDeck ? [options[0]!.optionId] : firstLegal(s);
      }
      default:
        void state;
        return firstLegal(s);
    }
  };
}

/** The log of scenario 2 with these evidence cards earned (and, optionally, `secrets1` recorded). */
function logWith(
  evidence: readonly string[],
  secrets?: Record<string, { counters: number; face?: string }>,
  modes = STANDARD,
  seats = SEATS,
) {
  const first = newLog(BOARD_DEFINITION, modes, 7, seats);
  const cards = Object.fromEntries(
    BOARD_MEMBER_FRONTS.map((front) => [
      front,
      secrets?.[front]
        ? {
            counters: { secret: secrets[front]!.counters },
            ...(secrets[front]!.face ? { face: secrets[front]!.face } : {}),
          }
        : { counters: { secret: 2 } },
    ]),
  );
  // Scenario 1 is "won" without playing it: the log moves to scenario 2 with the evidence and the board as given.
  return {
    ...first,
    position: { ...first.position, nextNodeId: "two", resolved: { one: "completed" as const } },
    shared: {
      ...first.shared,
      evidence: { kind: "cardList" as const, cardIds: evidence.map(cardId) },
      secrets1: { kind: "cardState" as const, cards },
    },
  } as CampaignLog;
}

function play(
  log: CampaignLog,
  plan: Plan = {},
  definition: CampaignDefinition = BOARD_DEFINITION,
): { readonly state: GameState; readonly asked: Asked[]; readonly initial: GameState } {
  const composed = compose(definition, log);
  const built = buildGame(definition, composed);
  const asked: Asked[] = [];
  const state = settle(
    built.state,
    planner(() => built.state, plan, asked),
    (s) => s.step.phase === "player",
    WAVE9_DEPS,
  );
  return { state, asked, initial: built.state };
}

const offersTo = (asked: readonly Asked[], player: PlayerId) =>
  asked.filter(
    (a) =>
      a.player === player &&
      a.kind === "chooseOption" &&
      a.labels.some((l) => l.startsWith(SECRET_OFFER) || l.startsWith(THREAT_OFFER)),
  );

const seat = (state: GameState, player: PlayerId) => state.players.find((p) => p.playerId === player)!;
const titleOf = (state: GameState, id: InstanceId): string => state.cardPool[state.instances[id]!.cardId]!.name;
const kindOf = (state: GameState, id: InstanceId): string => state.cardPool[state.instances[id]!.cardId]!.type;
const aspectOf = (state: GameState, id: InstanceId): string | undefined =>
  (state.cardPool[state.instances[id]!.cardId] as { aspect?: string }).aspect;
const justiceAllies = (state: GameState, ids: readonly InstanceId[]) =>
  ids.filter((id) => kindOf(state, id) === "ally" && aspectOf(state, id) === "justice");
const mainThreat = (state: GameState): number => state.instances[state.mainScheme.instanceId]!.threat;
const secretsOn = (state: GameState, code: string): number => {
  const id = (Object.keys(state.instances) as InstanceId[]).find((i) => codeOf(state, i) === code);
  return id ? (state.instances[id]!.counters["secret"] ?? 0) : -1;
};

describe("the nine evidence cards' Setup abilities (MC50 p. 6; docs/phase7-wave9.md section 3.77)", () => {
  const printed = (id: string) =>
    (AOS_CARDS.find((card) => (card.id as string) === id) as unknown as { text: { current: string } }).text.current;

  it("registers 50185.setup to 50193.setup, each a valid setup ability, and skips none", () => {
    expect(Object.keys(EXECUTIVE_BOARD_EVIDENCE).sort()).toEqual([
      "50185.setup",
      "50186.setup",
      "50187.setup",
      "50188.setup",
      "50189.setup",
      "50190.setup",
      "50191.setup",
      "50192.setup",
      "50193.setup",
    ]);
    for (const [ref, definition] of Object.entries(EXECUTIVE_BOARD_EVIDENCE)) {
      expect(validateDefinition(definition), ref).toEqual([]);
      expect(definition.trigger.kind, ref).toBe("setup");
    }
    expect(EXECUTIVE_BOARD_EVIDENCE_SKIPPED).toEqual({});
  });

  it.each(Object.entries(EVIDENCE_SETUPS))("%s names the aspect and the type its printed text names", (id, named) => {
    const text = printed(id);
    const aspect = named.aspect[0]!.toUpperCase() + named.aspect.slice(1);
    expect(text).toContain(
      `search their collection for a different ${aspect} ${named.type} and shuffle it into their deck`,
    );
    expect(text).toMatch(new RegExp(`search their deck for an? ${aspect} ${named.type} and add it to their hand`));
    // The registry entry resolves the same list the campaign's instruction does.
    expect(EXECUTIVE_BOARD_EVIDENCE[`${id}.setup`]!.effects).toEqual(evidenceSetupOf(id));
  });

  it("covers means (allies), motive (upgrades) and opportunity (supports), each in Protection, Justice, Aggression", () => {
    const named = Object.values(EVIDENCE_SETUPS);
    expect(named.map((n) => n.type)).toEqual([
      ...Array(3).fill("ally"),
      ...Array(3).fill("upgrade"),
      ...Array(3).fill("support"),
    ]);
    expect(named.map((n) => n.aspect)).toEqual([...Array(3).fill(["protection", "justice", "aggression"]).flat()]);
  });
});

describe("Wiretap (50186) earned, two players, standard mode", () => {
  const log = () => logWith(["50186"]);

  it("offers each player both, in order: the counter to each player, then the threat to each", () => {
    const { asked } = play(log());
    const offers = asked.filter(
      (a) =>
        a.kind === "chooseOption" && a.labels.some((l) => l.startsWith(SECRET_OFFER) || l.startsWith(THREAT_OFFER)),
    );
    expect(offers.map((o) => [o.player, o.labels[0]!.startsWith(SECRET_OFFER) ? "secret" : "threat"])).toEqual([
      [P1, "secret"],
      [P2, "secret"],
      [P1, "threat"],
      [P2, "threat"],
    ]);
  });

  it("player 1 pays both: a Board Member gains 1 secret counter, a different Justice ally joins the deck, the threat is placed, an ally is fetched", () => {
    const declined = play(log());
    const before = declined.state;
    const owned = new Set(
      [...seat(before, P1).deck, ...seat(before, P1).hand, ...seat(before, P1).discard].map((id) =>
        titleOf(before, id),
      ),
    );
    const { state, asked } = play(log(), {
      take: [
        [P1, "secret"],
        [P1, "threat"],
      ],
      member: SURVEILLANCE,
      find: {},
    });
    // The collection search offers Justice allies only, none whose title P1 already has.
    const search = asked.find((a) => a.kind === "searchCollection" && a.player === P1)!;
    expect(search.labels.length).toBeGreaterThan(0);
    expect(search.labels.filter((label) => owned.has(label))).toEqual([]);
    expect(secretsOn(state, SURVEILLANCE)).toBe(secretsOn(before, SURVEILLANCE) + 1);
    expect(secretsOn(state, MEDICAL)).toBe(secretsOn(before, MEDICAL));
    expect(mainThreat(state)).toBe(mainThreat(before) + 1);
  });

  it("player 1 finds the ally: it is in the deck, then fetched to the hand by the second offer (seven cards in hand)", () => {
    const base = play(log());
    const probe = play(log(), { take: [[P1, "secret"]], member: SURVEILLANCE });
    const title = probe.asked.find((a) => a.kind === "searchCollection" && a.player === P1)!.labels[0]!;
    const { state, asked } = play(log(), {
      take: [
        [P1, "secret"],
        [P1, "threat"],
      ],
      member: SURVEILLANCE,
      find: { [P1]: title },
    });
    const inDeckOrHand = [...seat(state, P1).deck, ...seat(state, P1).hand].map((id) => titleOf(state, id));
    expect(inDeckOrHand).toContain(title);
    // The second offer fetched a Justice ally from the deck: the hand is one card larger than in the game that declined.
    const fetch = asked.find(
      (a) =>
        a.kind === "chooseCards" &&
        a.player === P1 &&
        a.ids.length > 0 &&
        a.ids.every(
          (id) =>
            state.instances[id as InstanceId] !== undefined && justiceAllies(state, [id as InstanceId]).length === 1,
        ),
    );
    expect(fetch).toBeDefined();
    expect(seat(state, P1).hand).toHaveLength(seat(base.state, P1).hand.length + 1);
    expect(justiceAllies(state, seat(state, P1).hand).length).toBe(
      justiceAllies(base.state, seat(base.state, P1).hand).length + 1,
    );
  });

  it("player 2 declines both: nothing changes for them or the table", () => {
    const base = play(log());
    const { state } = play(log(), { take: [[P1, "secret"]], member: SURVEILLANCE });
    expect(seat(state, P2).hand.map((id) => titleOf(state, id))).toEqual(
      seat(base.state, P2).hand.map((id) => titleOf(base.state, id)),
    );
    expect(seat(state, P2).deck).toHaveLength(seat(base.state, P2).deck.length);
    expect(mainThreat(state)).toBe(mainThreat(base.state));
  });

  it("declined by both: the board, the threat and both decks are what they were without the card", () => {
    const withCard = play(log());
    const without = play(logWith([]));
    expect(BOARD_MEMBER_FRONTS.map((f) => secretsOn(withCard.state, f))).toEqual(
      BOARD_MEMBER_FRONTS.map((f) => secretsOn(without.state, f)),
    );
    expect(mainThreat(withCard.state)).toBe(mainThreat(without.state));
    for (const p of [P1, P2]) expect(seat(withCard.state, p).deck).toHaveLength(seat(without.state, p).deck.length);
  });
});

describe("a different card, a search that finds nothing, and the cost stays paid", () => {
  it("leaves out a title the player owns, a reprint of it included, and offers it to a player who does not", () => {
    // Agent Coulson is printed twice (two card ids, one title). Player 1's deck gets one of them.
    const coulsons = WAVE9_CARDS.filter((card) => card.type === "ally" && card.name === "Agent Coulson");
    expect(coulsons.length).toBeGreaterThan(1);
    const seats = SEATS.map((s, i) =>
      i === 0 ? { ...s, deck: { ...s.deck, cards: [...s.deck.cards, { cardId: coulsons[0]!.id, quantity: 1 }] } } : s,
    );
    const { state, asked } = play(logWith(["50186"], undefined, STANDARD, seats), {
      take: [
        [P1, "secret"],
        [P2, "secret"],
      ],
    });
    expect(
      [...seat(state, P1).deck, ...seat(state, P1).hand, ...seat(state, P1).discard].some(
        (id) => titleOf(state, id) === "Agent Coulson",
      ),
    ).toBe(true);
    const search1 = asked.find((a) => a.kind === "searchCollection" && a.player === P1)!;
    const search2 = asked.find((a) => a.kind === "searchCollection" && a.player === P2)!;
    expect(search1.labels).not.toContain("Agent Coulson");
    expect(search2.labels).toContain("Agent Coulson");
  });

  it("offers only cards of the card's aspect and type (allies, upgrades, supports) for the matching evidence", () => {
    for (const [evidence, type, aspect] of [
      ["50186", "ally", "justice"],
      ["50189", "upgrade", "justice"],
      ["50192", "support", "justice"],
      ["50187", "ally", "aggression"],
      ["50185", "ally", "protection"],
    ] as const) {
      const { state, asked } = play(logWith([evidence]), { take: [[P1, "secret"]] });
      const search = asked.find((a) => a.kind === "searchCollection" && a.player === P1)!;
      expect(search.ids.length, evidence).toBeGreaterThan(0);
      for (const id of search.ids) {
        const card = state.cardPool[cardId(id)] as { type: string; aspect?: string };
        expect([card.type, card.aspect], `${evidence}: ${id}`).toEqual([type, aspect]);
      }
    }
  });

  it("places the threat and finds nothing when no card of the kind is in the deck", () => {
    // Captain Marvel's deck holds no Justice ally; player 2 pays the threat and nothing else is asked or moved.
    const base = play(logWith(["50186"]));
    const { state, asked } = play(logWith(["50186"]), { take: [[P2, "threat"]] });
    expect(justiceAllies(base.state, seat(base.state, P2).deck)).toEqual([]);
    expect(mainThreat(state)).toBe(mainThreat(base.state) + 1);
    // Nobody was asked to choose a card from the deck: there was none to find.
    expect(
      asked.some(
        (a) =>
          a.kind === "chooseCards" &&
          a.player === P2 &&
          a.ids.every((id) => seat(state, P2).deck.includes(id as InstanceId)),
      ),
    ).toBe(false);
    expect(seat(state, P2).hand).toHaveLength(seat(base.state, P2).hand.length);
  });

  it("offers six to a player for three evidence cards, and asks the pairs in the order the cards are listed", () => {
    const { asked } = play(logWith(["50185", "50186", "50187"]));
    expect(offersTo(asked, P1)).toHaveLength(6);
    expect(offersTo(asked, P2)).toHaveLength(6);
  });
});

describe("the counter as a cost (MC50 p. 6; section 3.26)", () => {
  it("flips a member at 3 to its attachment before the search, keeping its counters (4 on the attachment)", () => {
    const log = logWith(["50186"], {
      [MEDICAL]: { counters: 3 },
      [SURVEILLANCE]: { counters: 0 },
      [TACTICAL]: { counters: 0 },
    });
    const { state, asked } = play(log, { take: [[P1, "secret"]], member: MEDICAL });
    const aid = (Object.keys(state.instances) as InstanceId[]).find(
      (id) => codeOf(state, id) === attachmentFaceOf(MEDICAL),
    )!;
    expect(state.instances[aid]!.counters["secret"]).toBe(4);
    expect(state.instances[aid]!.attachedTo).toBe(state.villains[0]!.instanceId);
    // The search was still made.
    expect(asked.some((a) => a.kind === "searchCollection" && a.player === P1)).toBe(true);
  });

  it("flips a member at 2 in an expert campaign by the same payment", () => {
    const log = logWith(
      ["50186"],
      { [MEDICAL]: { counters: 2 }, [SURVEILLANCE]: { counters: 0 }, [TACTICAL]: { counters: 0 } },
      EXPERT,
    );
    const { state } = play(log, { take: [[P1, "secret"]], member: MEDICAL });
    expect(
      (Object.keys(state.instances) as InstanceId[]).some((id) => codeOf(state, id) === attachmentFaceOf(MEDICAL)),
    ).toBe(true);
  });

  it("offers no counter when no Board Member environment is in play (three attachments: the game is lost in setup)", () => {
    const log = logWith(["50186"], {
      [MEDICAL]: { counters: 0, face: attachmentFaceOf(MEDICAL) },
      [SURVEILLANCE]: { counters: 0, face: attachmentFaceOf(SURVEILLANCE) },
      [TACTICAL]: { counters: 0, face: attachmentFaceOf(TACTICAL) },
    });
    const { state, asked } = play(log);
    expect(state.outcome?.result).toBe("loss");
    expect(asked.some((a) => a.labels.some((l) => l.startsWith(SECRET_OFFER)))).toBe(false);
  });

  it("a payment that makes the third attachment loses the game before the first turn", () => {
    // Two attachments and one environment: the counter is still offered (an environment is in play).
    const log = logWith(["50186"], {
      [MEDICAL]: { counters: 1, face: attachmentFaceOf(MEDICAL) },
      [SURVEILLANCE]: { counters: 1, face: attachmentFaceOf(SURVEILLANCE) },
      [TACTICAL]: { counters: 3 },
    });
    const { state } = play(log, { take: [[P1, "secret"]], member: TACTICAL });
    // The fourth counter flips the third: three attachments, and the players lose before the first turn.
    expect(state.outcome?.result).toBe("loss");
  });
});

describe("outside a campaign nothing is offered", () => {
  it("a standalone Baron Zemo game with the evidence in its hidden piles never asks an evidence offer", () => {
    const config = wave9Scenario("baron-zemo", { players: [SPIDER_MAN, IRON_MAN], seed: 3 });
    const created = createGame(config, WAVE9_DEPS);
    if (!created.ok) throw new Error(created.error.message);
    const asked: Asked[] = [];
    const state = settle(
      created.state,
      planner(
        () => created.state,
        {
          take: [
            [P1, "secret"],
            [P1, "threat"],
          ],
        },
        asked,
      ),
      (s) => s.step.phase === "player",
      WAVE9_DEPS,
    );
    expect(asked.some((a) => a.labels.some((l) => l.startsWith(SECRET_OFFER) || l.startsWith(THREAT_OFFER)))).toBe(
      false,
    );
    expect(Object.keys(state.hiddenPiles ?? {}).sort()).toEqual(["aim", "shield"]);
  });
});
