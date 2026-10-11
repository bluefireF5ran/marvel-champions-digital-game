/**
 * What placing a secret counter on a Board Member would do, said on the choice that asks (Agents of S.H.I.E.L.D., MC50
 * p. 6): the expert heal, the evidence cards' Setup and Baron Zemo's own offers. A Board Member environment flips to
 * its attachment at 4 secret counters (3 in expert mode), for good, and a third attachment loses the game, so a player
 * choosing where a counter goes has to be able to see which choice does that.
 *
 * **The client works out no rule.** The numbers are `AOS_BOARD_MEMBER_LOG`'s (`@mc/content`), the same constants the
 * cards' state checks read, and what is in play comes from the game state. This module only reads them and words them.
 * The option itself is the engine's: nothing here changes what is offered.
 */
import { AOS_BOARD_MEMBER_LOG } from "@mc/content";
import type { GameState, InstanceId, PendingChoice } from "@mc/engine";

const FRONTS = new Set<string>(AOS_BOARD_MEMBER_LOG.boardMemberIds.map(String));
/** The attachment face of each front (50181a -> 50181b). */
const BACKS = new Set<string>([...FRONTS].map((id) => `${id.slice(0, -1)}b`));

/** The target slots of the prompts that put a secret counter on a Board Member (heal and evidence Setup). */
const SECRET_SLOTS = new Set(["secretOn", "board"]);

export interface BoardMemberSecrets {
  readonly instanceId: InstanceId;
  readonly name: string;
  readonly secrets: number;
  /** One more secret counter flips it. */
  readonly flipsWithOneMore: boolean;
}

export interface BoardSecretsView {
  /** The Board Member environments in play (an attachment has no counters placed on it by these offers). */
  readonly members: readonly BoardMemberSecrets[];
  /** Board Member attachments in play: flipped for good. */
  readonly attachments: number;
  /** The next flip is the one that loses the game. */
  readonly nextFlipLoses: boolean;
}

/** Null in a game with no Board Member in play, which is every scenario of every other box. */
export function boardSecretsOf(state: GameState): BoardSecretsView | null {
  const threshold =
    AOS_BOARD_MEMBER_LOG.flipAtSecrets[state.scenarioRules.difficulty === "expert" ? "expert" : "standard"];
  const members: BoardMemberSecrets[] = [];
  for (const id of state.villainArea) {
    const instance = state.instances[id];
    if (!instance || !FRONTS.has(instance.cardId as string)) continue;
    const secrets = instance.counters[AOS_BOARD_MEMBER_LOG.counter] ?? 0;
    members.push({
      instanceId: id,
      name: state.cardPool[instance.cardId]?.name ?? String(instance.cardId),
      secrets,
      flipsWithOneMore: secrets + 1 >= threshold,
    });
  }
  const attachments = Object.values(state.instances).filter(
    (instance) => BACKS.has(instance.cardId as string) && instance.attachedTo !== null,
  ).length;
  if (members.length === 0 && attachments === 0) return null;
  return { members, attachments, nextFlipLoses: attachments + 1 >= AOS_BOARD_MEMBER_LOG.attachmentsToLose };
}

/** "Chief Medical Officer" -> "Medical Officer": the title word the three share is noise in a short note. */
const shortName = (name: string): string => name.replace(/^Chief\s+/i, "");

/**
 * The note for an option that puts a secret counter on a Board Member of the player's choice, or null when no choice
 * of Board Member flips anything.
 */
export function secretPlacementNote(view: BoardSecretsView): string | null {
  const flipping = view.members.filter((member) => member.flipsWithOneMore);
  if (flipping.length === 0) return null;
  const loses = view.nextFlipLoses ? " That is the third flip: you lose the game." : "";
  if (flipping.length === view.members.length) {
    return `Flips ${flipping.length === 1 ? "that Board Member" : "a Board Member"}.${loses}`;
  }
  return `Flips ${flipping.map((member) => shortName(member.name)).join(" or ")} if you pick it.${loses}`;
}

/** The note on one Board Member target: its secrets, and what the counter does to it. Null when it is not a candidate. */
export function secretTargetNote(view: BoardSecretsView, instanceId: InstanceId): string | null {
  const member = view.members.find((candidate) => candidate.instanceId === instanceId);
  if (!member) return null;
  const count = `${member.secrets} ${member.secrets === 1 ? "secret" : "secrets"}`;
  if (!member.flipsWithOneMore) return count;
  return view.nextFlipLoses ? `${count} · FLIPS: you lose` : `${count} · FLIPS`;
}

/**
 * What a defeated seat's "Rejoin / Sit this scenario out" answer means (owner decision 66B), in a few words under the
 * label. The question is asked before the scenario is set up, over a table with no villain, schemes or Board Members
 * yet, so the price is only named here and is paid at the box's heal, where the flip notes appear. Null for any other
 * label. A seat that sits out is not counted, so the count the scenario is set for is one lower.
 */
export function rejoinNoteOf(state: GameState, label: string): string | null {
  if (/^sit this scenario out/i.test(label)) {
    const left = Math.max(0, state.startingPlayerCount - 1);
    return `You sit out. The scenario is set for ${left} ${left === 1 ? "player" : "players"}.`;
  }
  if (!/^rejoin/i.test(label)) return null;
  const threat = /\+(\d+) threat/.exec(label);
  if (threat) return `You are counted. The ${threat[1]} threat is placed at the heal.`;
  if (/secret counter/.test(label)) return "You are counted. The counter goes on a Board Member at the heal.";
  return "You are counted.";
}

/** A label of an offer that places a secret counter on a Board Member, from the words every such offer prints. */
const placesSecret = (label: string): boolean =>
  !/^(do not|decline)/i.test(label) && /\bsecret counters?\b/i.test(label);

/** The campaign's own one-card gain, in Baron Zemo's offer: it prints the standalone 2. */
const ZEMO_GAIN = /to gain 2 evidence cards$/;

/**
 * An option's label as the choice sheet shows it. Baron Zemo's offer reads "to gain 2 evidence cards" and gains 1 in a
 * campaign (the card's own text: "1 card instead in campaign mode"), so the label is worded from the game's mode. An
 * offer that places a secret counter gets the flip note under it, when there is one.
 */
export function aosOptionLabelOf(state: GameState | null | undefined, label: string): string {
  if (!state) return label;
  const rejoin = rejoinNoteOf(state, label);
  if (rejoin) return `${label}\n${rejoin}`;
  let shown = label;
  if (state.campaign && ZEMO_GAIN.test(shown)) shown = shown.replace(ZEMO_GAIN, "to gain 1 evidence card");
  if (!placesSecret(shown)) return shown;
  const view = boardSecretsOf(state);
  const note = view ? secretPlacementNote(view) : null;
  return note ? `${shown}\n${note}` : shown;
}

/**
 * The notes under the Board Member cards of a "which Board Member gets the counter" prompt, by option id; empty for any
 * other prompt. Read off the prompt's own slot and its options, which the engine lists.
 */
export function secretTargetNotesOf(state: GameState, choice: PendingChoice): ReadonlyMap<string, string> {
  const notes = new Map<string, string>();
  if (choice.prompt.kind !== "chooseTarget" || !SECRET_SLOTS.has(choice.prompt.slot)) return notes;
  const view = boardSecretsOf(state);
  if (!view) return notes;
  for (const option of choice.options) {
    if (option.ref.kind !== "card") continue;
    const note = secretTargetNote(view, option.ref.instanceId);
    if (note) notes.set(option.optionId, note);
  }
  return notes;
}

/**
 * `text` broken at spaces into lines of at most `maxChars` characters (an existing line break stays), so a long option
 * reads whole instead of being cut to one line with an ellipsis. A word longer than a line gets its own line.
 */
export function wrapOptionLabel(text: string, maxChars: number): string {
  return text
    .split("\n")
    .flatMap((paragraph) => {
      const lines: string[] = [];
      let line = "";
      for (const word of paragraph.split(" ")) {
        if (line !== "" && line.length + 1 + word.length > maxChars) {
          lines.push(line);
          line = word;
        } else {
          line = line === "" ? word : `${line} ${word}`;
        }
      }
      lines.push(line);
      return lines;
    })
    .join("\n");
}
