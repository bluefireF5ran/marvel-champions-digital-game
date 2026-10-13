/**
 * Another player paying a part of a cost in the user's place (`RuleSpec costsPayableByAnyPlayer`, "While paying costs
 * on attached card, any player may help pay those costs"; docs/phase7-wave10-hero-packs.md H3.19).
 *
 * A helper's resources and cards need nothing new: the engine lists them as payment sources and cost picks, and the
 * payment bar already says who helped (`payment-model.ts`). What a card cannot carry is a part worded "you" with no
 * card named ("take 2 damage", "discard the top card of your deck"). `legalActions` says who can pay each such part
 * right now (`LegalAction.costHelp`); `example` has the user pay it whenever they can. This module is the pure read of
 * that offer and of the answer: the prompts to ask before the command is built, the `costSelection.paidBy` an answer
 * makes, and the words for the bar. Every judgement stays the engine's: a named helper is checked by `tryPayment` or by
 * the command itself, and `costHelpFor` gives a helper the reason they cannot.
 */
import type { CostSelection, DelegableCostPart, GameState, LegalAction, PlayerId } from "@mc/engine";
import { faceUpName } from "./names.js";

/** What each part asks of whoever pays it, as the prompt's title and as the bar's line. */
const PART_WORDS: Readonly<Record<DelegableCostPart, { readonly ask: string; readonly did: string }>> = {
  damageSelf: { ask: "takes the damage", did: "the damage" },
  indirectDamage: { ask: "takes the indirect damage", did: "the indirect damage" },
  discardFromDeck: { ask: "discards from their deck", did: "the discard from their deck" },
  discardRandomFromHand: { ask: "discards at random from their hand", did: "the random discard from their hand" },
  dealEncounterCards: { ask: "is dealt the encounter card", did: "the encounter card dealt" },
};

export interface CostHelpOption {
  readonly playerId: PlayerId;
  /** "You" for the player using the ability, the hero's name for anyone else. */
  readonly label: string;
}

/** One question to ask before an ability with a shareable part is used: which player pays that part. */
export interface CostHelpPrompt {
  readonly part: DelegableCostPart;
  readonly title: string;
  readonly options: readonly CostHelpOption[];
}

const nameOf = (state: GameState, playerId: PlayerId): string => {
  const seat = state.players.find((player) => player.playerId === playerId);
  return (seat && faceUpName(state, seat.identity.instanceId)) || "Another player";
};

/**
 * The questions this action asks: one per part more than one player can pay, or that only another player can. A part
 * only the user can pay is not asked (there is nothing to choose), and an action with no `costHelp` asks nothing.
 */
export function costHelpPromptsFor(state: GameState, entry: LegalAction): readonly CostHelpPrompt[] {
  const userId = entry.example.playerId;
  return (entry.costHelp ?? [])
    .filter((help) => help.payers.some((payer) => payer !== userId))
    .map((help) => ({
      part: help.part,
      title: `Who ${PART_WORDS[help.part].ask}?`,
      options: help.payers.map((playerId) => ({
        playerId,
        label: playerId === userId ? "You" : nameOf(state, playerId),
      })),
    }));
}

/**
 * `selection` with `payer` paying `part`: named in `paidBy` when they are not the user, removed from it when they
 * are (the user pays whatever is not named). Undefined when nothing is left to say.
 */
export function withCostHelper(
  selection: CostSelection | undefined,
  userId: PlayerId,
  part: DelegableCostPart,
  payer: PlayerId,
): CostSelection | undefined {
  const { paidBy, ...rest } = selection ?? {};
  const { [part]: _replaced, ...others } = paidBy ?? {};
  const next = payer === userId ? others : { ...others, [part]: payer };
  const merged: CostSelection = { ...rest, ...(Object.keys(next).length > 0 ? { paidBy: next } : {}) };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** The other players `selection` hands a part to, in seat order, each with the parts they pay: who must agree. */
export function costHelpersOf(
  state: GameState,
  userId: PlayerId,
  selection: CostSelection | undefined,
): readonly { readonly playerId: PlayerId; readonly parts: readonly DelegableCostPart[] }[] {
  const entries = Object.entries(selection?.paidBy ?? {}) as [DelegableCostPart, PlayerId][];
  return state.players
    .map((player) => player.playerId)
    .filter((playerId) => playerId !== userId)
    .map((playerId) => ({ playerId, parts: entries.filter(([, payer]) => payer === playerId).map(([part]) => part) }))
    .filter((helper) => helper.parts.length > 0);
}

/** "Helped by Spider-Man: the damage", one line per other player `selection` hands a part to. */
export function costHelpLines(
  state: GameState,
  userId: PlayerId,
  selection: CostSelection | undefined,
): readonly string[] {
  return costHelpersOf(state, userId, selection).map(
    (helper) =>
      `Helped by ${nameOf(state, helper.playerId)}: ${helper.parts.map((part) => PART_WORDS[part].did).join(", ")}`,
  );
}
