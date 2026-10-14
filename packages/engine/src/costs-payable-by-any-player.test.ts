/**
 * docs/phase7-wave10-hero-packs.md H3.19 (task HT16): `RuleSpec costsPayableByAnyPlayer`, "While paying costs on
 * attached card, any player may help pay those costs" (Coordinated Effort's shape), with synthetic cards: an upgrade
 * carrying the rule, attached to side schemes and an obligation whose Actions have costs.
 *
 * Sources: RRG 1.8 "Cost" (pp. 13-14): a cost is paid in full or not at all, with what its player controls; "Alliance"
 * (p. 6): "any player may contribute to paying those costs", the same words, and neither text limits costs to
 * resources; "Obligation" (p. 30) and "Attachment" (p. 8) on who may trigger such a card. Owner answer 21B
 * (docs/phase7-wave10.md section 4.0), an interpretation, no ruling names the card: other players may pay resources and
 * any other part their own cards can pay; a part that names the user's own card ("exhaust your hero") stays with the
 * user.
 */

import type { CardId } from "@mc/content";
import { describe, expect, it } from "vitest";
import type { AbilityCost, AbilityDefinition } from "./abilities.js";
import type { Command, CostChoices, CostSelection, Payment } from "./commands.js";
import { applyCommand, replay } from "./engine.js";
import type { GameEvent } from "./events.js";
import type { InstanceId, PlayerId } from "./ids.js";
import { costHelpFor, legalActions, paymentFor, tryPayment, type ActionRef, type LegalAction } from "./legal.js";
import { mustInstance, mustPlayer } from "./query.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility, type StubAbility } from "./testing/abilities.js";
import { runCommands } from "./testing/drive.js";
import {
  stubAlly,
  stubObligation,
  stubResource,
  stubSideScheme,
  stubSupport,
  stubUpgrade,
} from "./testing/fixtures.js";
import { giveCards } from "./testing/scenario.js";
import { encounterCardInVillainArea, gameAtFirstTurn, P1, P2, playerCardIntoPlay } from "./testing/wave3.js";

const def = (definition: AbilityDefinition) => definition;
const draw = { kind: "draw", player: { kind: "controller" }, amount: { kind: "const", value: 1 } } as const;
/** "Action: [cost] → draw 1 card." */
const action = (id: string, cost: AbilityCost): StubAbility =>
  stubAbility(`${id}.action`, def({ trigger: { kind: "action" }, cost, effects: [draw] }));

/** "While paying costs on attached card, any player may help pay those costs." */
const HELP_RULE = stubAbility(
  "help.constant",
  def({
    trigger: { kind: "constant", rules: [{ kind: "costsPayableByAnyPlayer", card: { hostOfSelf: true } }] },
    effects: [],
  }),
);
const HELP = stubUpgrade({ id: "help", cost: 0, abilities: [HELP_RULE.ref] });

/** "Action: Exhaust your identity and spend 2 resources → draw 1 card." (question 21's example cost) */
const BOTH_ACTION = action("both", { exhaustIdentity: true, resources: 2 });
const SPEND_ACTION = action("spend", { resources: 2 });
const DAMAGE_ACTION = action("damage", { damageSelf: 2 });
const DISCARD_ACTION = action("discard", { discardFromHand: { min: 1, max: 1 } });
const DECK_ACTION = action("deck", { discardFromDeck: 2 });
const ALLY_ACTION = action("ally", {
  exhaustCards: { slot: "ally", query: { categories: ["ally"] }, min: 1, max: 1 },
});
const DEAL_ACTION = action("deal", { dealEncounterCards: 1 });

const scheme = (id: string, ability: StubAbility) =>
  stubSideScheme({ id, startingThreat: 3, boostIcons: 0, abilities: [ability.ref] });
const BOTH = scheme("both-scheme", BOTH_ACTION);
const SPEND = scheme("spend-scheme", SPEND_ACTION);
const OTHER = scheme("other-scheme", SPEND_ACTION);
const DAMAGE = scheme("damage-scheme", DAMAGE_ACTION);
const DISCARD = scheme("discard-scheme", DISCARD_ACTION);
const DECK_SCHEME = scheme("deck-scheme", DECK_ACTION);
const ALLY_SCHEME = scheme("ally-scheme", ALLY_ACTION);
const DEAL = scheme("deal-scheme", DEAL_ACTION);
const DEBT = stubObligation({ id: "debt", abilities: [SPEND_ACTION.ref] });

/** "Resource: Exhaust this card → generate a [wild] resource." */
const GEAR_RESOURCE = stubAbility(
  "gear.resource",
  def({ trigger: { kind: "resource" }, cost: { exhaustSelf: true }, generates: 1, effects: [] }),
);
const GEAR = stubSupport({ id: "gear", cost: 0, abilities: [GEAR_RESOURCE.ref] });
const PLAIN = stubResource({ id: "plain", icons: 1 });
const FRIEND = stubAlly({ id: "friend", cost: 0, atk: 1, thw: 1, hp: 3 });

const ENCOUNTER = [BOTH, SPEND, OTHER, DAMAGE, DISCARD, DECK_SCHEME, ALLY_SCHEME, DEAL, DEBT];
const CARDS = [...ENCOUNTER, HELP, GEAR, PLAIN, FRIEND];
const deps = depsOf(
  HELP_RULE,
  BOTH_ACTION,
  SPEND_ACTION,
  DAMAGE_ACTION,
  DISCARD_ACTION,
  DECK_ACTION,
  ALLY_ACTION,
  DEAL_ACTION,
  GEAR_RESOURCE,
);
const DECK: readonly CardId[] = [HELP, GEAR, PLAIN, FRIEND].flatMap((card) => [card.id, card.id, card.id]);

function start(players: 1 | 2 = 2): GameState {
  return gameAtFirstTurn({ cards: CARDS, deps, players, deck: DECK, encounter: ENCOUNTER.map((card) => card.id) });
}

/** The upgrade in `player`'s play area, attached to `host` (surgery: no play, no attach check). */
function helpOn(state: GameState, host: InstanceId, player: PlayerId = P1): GameState {
  const placed = playerCardIntoPlay(state, HELP.id, player);
  return {
    ...placed.state,
    instances: {
      ...placed.state.instances,
      [placed.id]: { ...mustInstance(placed.state, placed.id), attachedTo: host },
      [host]: {
        ...mustInstance(placed.state, host),
        attachments: [...mustInstance(placed.state, host).attachments, placed.id],
      },
    },
  };
}

/** A scheme in the villain's area, with the upgrade on it unless `bare`. */
function withScheme(
  state: GameState,
  card: CardId,
  bare = false,
): { readonly state: GameState; readonly id: InstanceId } {
  const placed = encounterCardInVillainArea(state, card, 3);
  return { id: placed.id, state: bare ? placed.state : helpOn(placed.state, placed.id) };
}

/** `player`'s hand put on the bottom of their deck (surgery), so they hold nothing to pay with. */
function emptyHand(state: GameState, player: PlayerId): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.playerId === player ? { ...p, hand: [], deck: [...p.deck, ...p.hand] } : p)),
  };
}

const fromHand = (...ids: readonly InstanceId[]): readonly Payment[] => ids.map((id) => ({ fromHand: id }));
const use = (
  card: InstanceId,
  ability: StubAbility,
  payment: readonly Payment[] = [],
  extra: {
    readonly costChoices?: CostChoices;
    readonly costSelection?: CostSelection;
    readonly playerId?: PlayerId;
  } = {},
): Command & { readonly type: "useAbility" } => ({
  type: "useAbility",
  playerId: extra.playerId ?? P1,
  cardInstanceId: card,
  abilityId: ability.ref.id,
  payment,
  ...(extra.costChoices ? { costChoices: extra.costChoices } : {}),
  ...(extra.costSelection ? { costSelection: extra.costSelection } : {}),
});
const refusal = (state: GameState, command: Command) => {
  const result = applyCommand(state, command, deps);
  return result.ok ? null : { code: result.error.code, message: result.error.message };
};
const ref = (card: InstanceId, ability: StubAbility): ActionRef => ({
  kind: "useAbility",
  instanceId: card,
  abilityId: ability.ref.id,
});
function listed(state: GameState, card: InstanceId, ability: StubAbility, player: PlayerId = P1) {
  const actions = legalActions(state, player, deps);
  if (actions.kind !== "turn" && actions.kind !== "notYourTurn") throw new Error(`no actions: ${actions.kind}`);
  const is = (entry: { readonly action: ActionRef }) =>
    entry.action.kind === "useAbility" && entry.action.instanceId === card && entry.action.abilityId === ability.ref.id;
  return { legal: actions.legal.find(is) as LegalAction | undefined, illegal: actions.illegal.find(is) };
}
const handSize = (state: GameState, player: PlayerId) => mustPlayer(state, player).hand.length;
const identityOf = (state: GameState, player: PlayerId) =>
  mustInstance(state, mustPlayer(state, player).identity.instanceId);
const ofType = <T extends GameEvent["type"]>(events: readonly GameEvent[], type: T) =>
  events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);

describe("H3.19 resources: every player's hand and resource abilities pay", () => {
  it("another player's hand cards pay the whole resource cost; each card goes to its owner's discard pile and the user resolves the ability", () => {
    const placed = withScheme(start(), SPEND.id);
    const theirs = giveCards(placed.state, P2, PLAIN.id, PLAIN.id);
    const before = emptyHand(theirs.state, P1);
    const { state, events } = runCommands(before, deps, use(placed.id, SPEND_ACTION, fromHand(...theirs.ids)));
    expect(mustPlayer(state, P2).discard).toEqual(expect.arrayContaining([...theirs.ids]));
    expect(handSize(state, P2)).toBe(handSize(before, P2) - 2);
    // Only the player using the ability resolves it: P1 draws.
    expect(handSize(state, P1)).toBe(1);
    // The helper's spending is announced as the helper's.
    expect(ofType(events, "cardDiscardedFromHand").map((event) => event.playerId)).toEqual([P2, P2]);
  });

  it("a payment may mix the user's cards with a helper's", () => {
    const placed = withScheme(start(), SPEND.id);
    const mine = giveCards(placed.state, P1, PLAIN.id);
    const theirs = giveCards(mine.state, P2, PLAIN.id);
    const { state } = runCommands(
      theirs.state,
      deps,
      use(placed.id, SPEND_ACTION, fromHand(mine.ids[0]!, theirs.ids[0]!)),
    );
    expect(mustPlayer(state, P1).discard).toContain(mine.ids[0]);
    expect(mustPlayer(state, P2).discard).toContain(theirs.ids[0]);
  });

  it("without the rule another player's card is refused, and a helper's card does not pay a cost on another encounter card", () => {
    const bare = withScheme(start(), SPEND.id, true);
    const theirs = giveCards(bare.state, P2, PLAIN.id, PLAIN.id);
    expect(refusal(theirs.state, use(bare.id, SPEND_ACTION, fromHand(...theirs.ids)))?.code).toBe("card_not_in_zone");

    // The upgrade is on one scheme; the same ability on the other scheme is the user's alone to pay.
    const helped = withScheme(start(), SPEND.id);
    const other = encounterCardInVillainArea(helped.state, OTHER.id, 3);
    const given = giveCards(other.state, P2, PLAIN.id, PLAIN.id);
    expect(refusal(given.state, use(other.id, SPEND_ACTION, fromHand(...given.ids)))?.code).toBe("card_not_in_zone");
    expect(refusal(given.state, use(helped.id, SPEND_ACTION, fromHand(...given.ids)))).toBeNull();
  });

  it("a helper's resource ability pays: the helper exhausts their card and is the one who generated", () => {
    const placed = withScheme(start(), SPEND.id);
    const gear = playerCardIntoPlay(placed.state, GEAR.id, P2);
    const mine = giveCards(gear.state, P1, PLAIN.id);
    const payment: Payment[] = [
      ...fromHand(mine.ids[0]!),
      { ability: { instanceId: gear.id, abilityId: GEAR_RESOURCE.ref.id } },
    ];
    const { state, events } = runCommands(mine.state, deps, use(placed.id, SPEND_ACTION, payment));
    expect(mustInstance(state, gear.id).exhausted).toBe(true);
    expect(ofType(events, "resourcesGenerated")[0]?.playerId).toBe(P2);

    const bare = withScheme(start(), SPEND.id, true);
    const bareGear = playerCardIntoPlay(bare.state, GEAR.id, P2);
    const bareMine = giveCards(bareGear.state, P1, PLAIN.id);
    const refused = refusal(
      bareMine.state,
      use(bare.id, SPEND_ACTION, [
        ...fromHand(bareMine.ids[0]!),
        { ability: { instanceId: bareGear.id, abilityId: GEAR_RESOURCE.ref.id } },
      ]),
    );
    expect(refused?.code).toBe("no_valid_target");
  });

  it("legalActions offers the ability when only the helper can afford it, and the pay prompt lists the helper's cards", () => {
    const placed = withScheme(start(), SPEND.id);
    const theirs = giveCards(emptyHand(placed.state, P2), P2, PLAIN.id, PLAIN.id);
    const state = emptyHand(theirs.state, P1);
    const { legal } = listed(state, placed.id, SPEND_ACTION);
    expect(legal?.needsPayment).toBe(true);
    expect(legal?.example).toMatchObject({ payment: fromHand(...theirs.ids) });

    const query = paymentFor(state, P1, ref(placed.id, SPEND_ACTION), {}, deps);
    expect(query?.sources.map((source) => source.instanceId)).toEqual([...theirs.ids]);
    expect(query?.suggested).toEqual(theirs.ids.map((id) => `hand:${id}`));
    const attempt = tryPayment(state, P1, ref(placed.id, SPEND_ACTION), query?.suggested ?? [], {}, deps);
    expect(attempt.ok).toBe(true);

    // The same board without the upgrade: the user cannot afford it, and the prompt lists nothing of the helper's.
    const bare = withScheme(start(), SPEND.id, true);
    const bareTheirs = giveCards(emptyHand(bare.state, P2), P2, PLAIN.id, PLAIN.id);
    const bareState = emptyHand(bareTheirs.state, P1);
    expect(listed(bareState, bare.id, SPEND_ACTION).illegal?.reason).toBe("insufficient_resources");
    expect(paymentFor(bareState, P1, ref(bare.id, SPEND_ACTION), {}, deps)?.sources).toEqual([]);
  });

  it("an obligation: only its holder triggers it, and another player pays for it (RRG 1.8 'Obligation', p. 30)", () => {
    const placed = encounterCardInVillainArea(start(), DEBT.id);
    // In P1's play area, as a revealed obligation that stays in play is.
    const held: GameState = {
      ...placed.state,
      villainArea: placed.state.villainArea.filter((id) => id !== placed.id),
      players: placed.state.players.map((p) =>
        p.playerId === P1 ? { ...p, playArea: [...p.playArea, placed.id] } : p,
      ),
    };
    const theirs = giveCards(helpOn(held, placed.id), P2, PLAIN.id, PLAIN.id);
    const state = emptyHand(theirs.state, P1);
    const helper = refusal(state, use(placed.id, SPEND_ACTION, fromHand(...theirs.ids), { playerId: P2 }));
    expect(helper?.message).toContain("only the player with that obligation");
    expect(refusal(state, use(placed.id, SPEND_ACTION, fromHand(...theirs.ids)))).toBeNull();
  });
});

describe("H3.19 a part that names the user's own card stays with the user (21B)", () => {
  it("'exhaust your identity and spend 2 resources': the helper pays the resources, the user's identity exhausts, the helper's does not", () => {
    const placed = withScheme(start(), BOTH.id);
    const theirs = giveCards(placed.state, P2, PLAIN.id, PLAIN.id);
    const { state } = runCommands(theirs.state, deps, use(placed.id, BOTH_ACTION, fromHand(...theirs.ids)));
    expect(identityOf(state, P1).exhausted).toBe(true);
    expect(identityOf(state, P2).exhausted).toBe(false);
  });

  it("an exhausted user cannot use it, however ready the helper is, and no command hands the exhaust over", () => {
    const placed = withScheme(start(), BOTH.id);
    const theirs = giveCards(placed.state, P2, PLAIN.id, PLAIN.id);
    const mine = identityOf(theirs.state, P1);
    const tired: GameState = {
      ...theirs.state,
      instances: { ...theirs.state.instances, [mine.instanceId]: { ...mine, exhausted: true } },
    };
    expect(refusal(tired, use(placed.id, BOTH_ACTION, fromHand(...theirs.ids)))?.code).toBe("already_exhausted");
    expect(listed(tired, placed.id, BOTH_ACTION).illegal?.reason).toBe("already_exhausted");
    // A hand-built command naming the part: refused with the reason, whether or not the user is ready.
    const paidBy = { exhaustIdentity: P2 } as unknown as NonNullable<CostSelection["paidBy"]>;
    for (const state of [tired, theirs.state]) {
      const handed = refusal(
        state,
        use(placed.id, BOTH_ACTION, fromHand(...theirs.ids), { costSelection: { paidBy } }),
      );
      expect(handed).toEqual({
        code: "invalid_choice",
        message: "another player cannot pay that part: exhausting your identity is your own cost to pay",
      });
    }
    // The ability has no part another player can take over whole, so the helper is offered none.
    expect(costHelpFor(theirs.state, P1, ref(placed.id, BOTH_ACTION), P2, {}, deps)).toEqual([]);
    expect(listed(theirs.state, placed.id, BOTH_ACTION).legal?.costHelp).toBeUndefined();
  });
});

describe("H3.19 a part another player's own cards can pay (21B)", () => {
  it("'take 2 damage': a helper named in paidBy takes it, the user takes none, and the log says who paid", () => {
    const placed = withScheme(start(), DAMAGE.id);
    const command = use(placed.id, DAMAGE_ACTION, [], { costSelection: { paidBy: { damageSelf: P2 } } });
    const { state, events, session } = runCommands(placed.state, deps, command);
    expect(identityOf(state, P2).damage).toBe(2);
    expect(identityOf(state, P1).damage).toBe(0);
    expect(handSize(state, P1)).toBe(handSize(placed.state, P1) + 1);
    expect(ofType(events, "costPartPaidBy")).toEqual([
      { type: "costPartPaidBy", playerId: P1, helperId: P2, sourceInstanceId: placed.id, part: "damageSelf" },
    ]);
    const replayed = replay(session.log, deps);
    expect(replayed.ok ? replayed.state : null).toEqual(state);
  });

  it("with nobody named, or the user named, the user takes the damage and nothing is logged as help", () => {
    const placed = withScheme(start(), DAMAGE.id);
    for (const costSelection of [undefined, { paidBy: { damageSelf: P1 } }]) {
      const command = use(placed.id, DAMAGE_ACTION, [], costSelection ? { costSelection } : {});
      const { state, events } = runCommands(placed.state, deps, command);
      expect(identityOf(state, P1).damage).toBe(2);
      expect(identityOf(state, P2).damage).toBe(0);
      expect(ofType(events, "costPartPaidBy")).toEqual([]);
    }
  });

  it("without the rule a helper cannot be named, and a part the cost does not hold cannot be handed over", () => {
    const bare = withScheme(start(), DAMAGE.id, true);
    const named = use(bare.id, DAMAGE_ACTION, [], { costSelection: { paidBy: { damageSelf: P2 } } });
    expect(refusal(bare.state, named)).toEqual({
      code: "no_valid_target",
      message: "only the player using this ability can pay its costs",
    });
    const placed = withScheme(start(), DAMAGE.id);
    const absent = use(placed.id, DAMAGE_ACTION, [], { costSelection: { paidBy: { discardFromDeck: P2 } } });
    expect(refusal(placed.state, absent)?.code).toBe("invalid_choice");
  });

  it("a helper who could not take all of the damage cannot pay it (RRG 1.8 'Cost', p. 14; FAQ 'Focused Rage (#27)')", () => {
    const placed = withScheme(start(), DAMAGE.id);
    const theirs = identityOf(placed.state, P2);
    const tough: GameState = {
      ...placed.state,
      instances: {
        ...placed.state.instances,
        [theirs.instanceId]: { ...theirs, statuses: { ...theirs.statuses, tough: 1 } },
      },
    };
    const command = use(placed.id, DAMAGE_ACTION, [], { costSelection: { paidBy: { damageSelf: P2 } } });
    expect(refusal(tough, command)).toEqual({
      code: "insufficient_resources",
      message: "the helping player's identity cannot take all 2 damage this cost needs",
    });
    // The helper's side of "why can't I": the same reason, asked for them; the user can still pay it themself.
    expect(costHelpFor(tough, P1, ref(placed.id, DAMAGE_ACTION), P2, {}, deps)).toEqual([
      {
        part: "damageSelf",
        ok: false,
        reason: "insufficient_resources",
        message: "the helping player's identity cannot take all 2 damage this cost needs",
      },
    ]);
    expect(costHelpFor(placed.state, P1, ref(placed.id, DAMAGE_ACTION), P2, {}, deps)).toEqual([
      { part: "damageSelf", ok: true },
    ]);
    expect(listed(tough, placed.id, DAMAGE_ACTION).legal?.costHelp).toEqual([{ part: "damageSelf", payers: [P1] }]);
  });

  it("legalActions lists who can pay the part, and names a helper in the example only when the user cannot pay", () => {
    const placed = withScheme(start(), DAMAGE.id);
    const both = listed(placed.state, placed.id, DAMAGE_ACTION).legal;
    expect(both?.costHelp).toEqual([{ part: "damageSelf", payers: [P1, P2] }]);
    expect(both?.example).toEqual(use(placed.id, DAMAGE_ACTION));

    // The user holds a tough status card, so they cannot pay "take 2 damage"; the helper can.
    const mine = identityOf(placed.state, P1);
    const tough: GameState = {
      ...placed.state,
      instances: {
        ...placed.state.instances,
        [mine.instanceId]: { ...mine, statuses: { ...mine.statuses, tough: 1 } },
      },
    };
    const helped = listed(tough, placed.id, DAMAGE_ACTION).legal;
    expect(helped?.costHelp).toEqual([{ part: "damageSelf", payers: [P2] }]);
    expect(helped?.example).toEqual(
      use(placed.id, DAMAGE_ACTION, [], { costSelection: { paidBy: { damageSelf: P2 } } }),
    );
    expect(applyCommand(tough, helped!.example, deps).ok).toBe(true);

    // Without the upgrade the same board is the user's "why can't I", worded for the user.
    const bare = withScheme(start(), DAMAGE.id, true);
    const bareMine = identityOf(bare.state, P1);
    const bareTough: GameState = {
      ...bare.state,
      instances: {
        ...bare.state.instances,
        [bareMine.instanceId]: { ...bareMine, statuses: { ...bareMine.statuses, tough: 1 } },
      },
    };
    expect(listed(bareTough, bare.id, DAMAGE_ACTION).illegal).toMatchObject({
      reason: "insufficient_resources",
      message: "your identity cannot take all 2 damage this cost needs",
    });
    expect(listed(bare.state, bare.id, DAMAGE_ACTION).legal?.costHelp).toBeUndefined();
  });

  it("'discard a card from your hand': a helper's hand card pays, and is offered when the user's hand is empty", () => {
    const placed = withScheme(start(), DISCARD.id);
    const theirs = giveCards(placed.state, P2, PLAIN.id);
    const state = emptyHand(theirs.state, P1);
    const command = use(placed.id, DISCARD_ACTION, [], { costChoices: { discard: [theirs.ids[0]!] } });
    const done = runCommands(state, deps, command);
    expect(mustPlayer(done.state, P2).discard).toContain(theirs.ids[0]);
    expect(ofType(done.events, "cardDiscardedFromHand")[0]?.playerId).toBe(P2);

    // The engine's own example picks a helper's card only once the user has none.
    const example = listed(state, placed.id, DISCARD_ACTION).legal?.example;
    expect(example?.type === "useAbility" ? example.costChoices?.discard : null).toHaveLength(1);
    expect(mustPlayer(state, P2).hand).toContain(
      example?.type === "useAbility" ? example.costChoices?.discard?.[0] : undefined,
    );
    const own = listed(theirs.state, placed.id, DISCARD_ACTION).legal?.example;
    expect(mustPlayer(theirs.state, P1).hand).toContain(
      own?.type === "useAbility" ? own.costChoices?.discard?.[0] : undefined,
    );

    const bare = withScheme(start(), DISCARD.id, true);
    const bareTheirs = giveCards(bare.state, P2, PLAIN.id);
    const refused = refusal(
      emptyHand(bareTheirs.state, P1),
      use(bare.id, DISCARD_ACTION, [], { costChoices: { discard: [bareTheirs.ids[0]!] } }),
    );
    expect(refused?.code).toBe("card_not_in_zone");
    expect(listed(emptyHand(bareTheirs.state, P1), bare.id, DISCARD_ACTION).legal).toBeUndefined();
  });

  it("'exhaust an ally': a helper's ally pays; without the rule it does not", () => {
    const placed = withScheme(start(), ALLY_SCHEME.id);
    const friend = playerCardIntoPlay(placed.state, FRIEND.id, P2);
    const command = use(placed.id, ALLY_ACTION, [], { costChoices: { ally: [friend.id] } });
    expect(mustInstance(runCommands(friend.state, deps, command).state, friend.id).exhausted).toBe(true);
    expect(listed(friend.state, placed.id, ALLY_ACTION).legal).toBeDefined();

    const bare = withScheme(start(), ALLY_SCHEME.id, true);
    const bareFriend = playerCardIntoPlay(bare.state, FRIEND.id, P2);
    const refused = use(bare.id, ALLY_ACTION, [], { costChoices: { ally: [bareFriend.id] } });
    expect(refusal(bareFriend.state, refused)?.code).toBe("no_valid_target");
  });

  it("'discard the top 2 cards of your deck' and 'deal yourself an encounter card': the helper named pays from their own", () => {
    const deck = withScheme(start(), DECK_SCHEME.id);
    const top = mustPlayer(deck.state, P2).deck.slice(0, 2);
    const discarded = runCommands(
      deck.state,
      deps,
      use(deck.id, DECK_ACTION, [], { costSelection: { paidBy: { discardFromDeck: P2 } } }),
    );
    expect(mustPlayer(discarded.state, P2).discard).toEqual(expect.arrayContaining([...top]));
    expect(mustPlayer(discarded.state, P1).discard).toEqual(mustPlayer(deck.state, P1).discard);

    const deal = withScheme(start(), DEAL.id);
    const dealt = runCommands(
      deal.state,
      deps,
      use(deal.id, DEAL_ACTION, [], { costSelection: { paidBy: { dealEncounterCards: P2 } } }),
    );
    expect(mustPlayer(dealt.state, P2).dealtEncounter).toHaveLength(
      mustPlayer(deal.state, P2).dealtEncounter.length + 1,
    );
    expect(mustPlayer(dealt.state, P1).dealtEncounter).toEqual(mustPlayer(deal.state, P1).dealtEncounter);
    expect(ofType(dealt.events, "costPartPaidBy")[0]?.part).toBe("dealEncounterCards");
  });

  it("an eliminated or unknown player cannot be named", () => {
    const placed = withScheme(start(), DAMAGE.id);
    const out: GameState = {
      ...placed.state,
      players: placed.state.players.map((p) => (p.playerId === P2 ? { ...p, eliminated: true } : p)),
    };
    const command = use(placed.id, DAMAGE_ACTION, [], { costSelection: { paidBy: { damageSelf: P2 } } });
    expect(refusal(out, command)?.code).toBe("unknown_player");
  });
});

describe("H3.19 solo and scope", () => {
  it("with one player the rule changes nothing: the same legal action, no help offered", () => {
    const helped = withScheme(start(1), DAMAGE.id);
    const bare = withScheme(start(1), DAMAGE.id, true);
    const withRule = listed(helped.state, helped.id, DAMAGE_ACTION).legal;
    expect(withRule?.costHelp).toBeUndefined();
    expect(withRule?.example).toEqual(use(helped.id, DAMAGE_ACTION));
    expect(listed(bare.state, bare.id, DAMAGE_ACTION).legal?.example).toEqual(use(bare.id, DAMAGE_ACTION));
    const { state } = runCommands(helped.state, deps, use(helped.id, DAMAGE_ACTION));
    expect(identityOf(state, P1).damage).toBe(2);
  });

  it("the rule is off once its card is no longer attached to that card", () => {
    const placed = withScheme(start(), SPEND.id);
    const other = encounterCardInVillainArea(placed.state, OTHER.id, 3);
    const theirs = giveCards(other.state, P2, PLAIN.id, PLAIN.id);
    const upgrade = mustInstance(theirs.state, placed.id).attachments[0]!;
    // Moved to the other scheme (surgery): the first scheme's cost is the user's alone again.
    const moved: GameState = {
      ...theirs.state,
      instances: {
        ...theirs.state.instances,
        [upgrade]: { ...mustInstance(theirs.state, upgrade), attachedTo: other.id },
        [placed.id]: { ...mustInstance(theirs.state, placed.id), attachments: [] },
        [other.id]: { ...mustInstance(theirs.state, other.id), attachments: [upgrade] },
      },
    };
    expect(refusal(moved, use(placed.id, SPEND_ACTION, fromHand(...theirs.ids)))?.code).toBe("card_not_in_zone");
    expect(refusal(moved, use(other.id, SPEND_ACTION, fromHand(...theirs.ids)))).toBeNull();
  });
});
