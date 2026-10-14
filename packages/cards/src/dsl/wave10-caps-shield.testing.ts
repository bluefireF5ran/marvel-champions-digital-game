/**
 * Staging shared by the three DSL tests of Cap's Shield's engine pieces (docs/phase7-wave10.md §3.17, §3.18, §3.19):
 * a real Resistance: Captain America game (`resistance-captain-america`, the Tigra precon in the first seat) with
 * Cap's Shield 56143 attached where the test wants it. The Captain America leader module is scripted elsewhere; each
 * test registers the Shield abilities it exercises on top of `WAVE10_DEPS`.
 */

import {
  replay,
  sessionApply,
  startSession,
  type AbilityDefinition,
  type Command,
  type EngineDeps,
  type GameEvent,
  type GameState,
  type InstanceId,
} from "@mc/engine";
import { firstLegal, inst, patchInstance, type Picker } from "../testing/harness.js";
import { codeOf } from "../wave9/testing.js";
import {
  CAPTAIN_AMERICA_SCENARIO,
  WAVE10_DEPS,
  civilWarHeroGame,
  type CivilWarGameOptions,
} from "../wave10/testing.js";

export const SHIELD = "56143";
export const SHIELD_CONSTANT = "56143.caps-shield-constant";
export const SHIELD_RESPONSE = "56143.caps-shield-forced-response";

/** `WAVE10_DEPS` with these abilities registered over whatever the registry holds for their ids. */
export const depsWith = (abilities: Readonly<Record<string, AbilityDefinition>>): EngineDeps => ({
  ...WAVE10_DEPS,
  abilities: { ...WAVE10_DEPS.abilities, ...abilities },
});

export const leaderOf = (state: GameState): InstanceId => state.activeVillainId!;

/** The game's one Cap's Shield, wherever it is. */
export function shieldOf(state: GameState): InstanceId {
  const id = (Object.keys(state.instances) as InstanceId[]).find((key) => codeOf(state, key) === SHIELD);
  if (!id) throw new Error("no Cap's Shield in this game");
  return id;
}

/** Surgery: Cap's Shield taken from wherever it is and attached faceup to `host`. Nothing is announced. */
export function withShieldOn(state: GameState, host: InstanceId): GameState {
  const shield = shieldOf(state);
  const without = (ids: readonly InstanceId[]) => ids.filter((id) => id !== shield);
  const from = inst(state, shield).attachedTo;
  const cleared: GameState = {
    ...state,
    villainArea: without(state.villainArea),
    encounterSetAside: without(state.encounterSetAside),
    encounterDecks: Object.fromEntries(
      Object.entries(state.encounterDecks).map(([deckId, pile]) => [
        deckId,
        { ...pile, deck: without(pile.deck), discard: without(pile.discard) },
      ]),
    ),
    players: state.players.map((p) => ({ ...p, playArea: without(p.playArea) })),
  };
  const detached = from
    ? patchInstance(cleared, from, { attachments: without(inst(cleared, from).attachments) })
    : cleared;
  const attached = patchInstance(detached, shield, { faceup: true, attachedTo: host, controllerId: null });
  return patchInstance(attached, host, { attachments: [...without(inst(attached, host).attachments), shield] });
}

export const withTough = (state: GameState, id: InstanceId, tough: number): GameState =>
  patchInstance(state, id, { statuses: { ...inst(state, id).statuses, tough } });

/**
 * A Resistance: Captain America game past setup, the first seat in hero form, Cap's Shield on Captain America and no
 * tough status card on him (the tests give him one when they mean to).
 */
export function shieldGame(deps: EngineDeps, opts: CivilWarGameOptions = {}): GameState {
  const start = civilWarHeroGame(CAPTAIN_AMERICA_SCENARIO, { ...opts, deps });
  return withTough(withShieldOn(start, leaderOf(start)), leaderOf(start), 0);
}

/** Applies `command`, answering each choice with `pick`; the log replays to the same state. */
export function drive(deps: EngineDeps, state: GameState, command: Command, pick: Picker = firstLegal) {
  let session = startSession(state);
  const events: GameEvent[] = [];
  const first = sessionApply(session, command, deps);
  if (!first.ok) throw new Error(`${command.type} rejected: ${first.error.code}: ${first.error.message}`);
  session = first.session;
  events.push(...first.events);
  for (let guard = 0; session.state.pendingChoice && !session.state.outcome; guard++) {
    if (guard > 200) throw new Error(`choices did not settle (${session.state.pendingChoice.prompt.kind})`);
    const choice = session.state.pendingChoice;
    const next = sessionApply(
      session,
      {
        type: "resolveChoice",
        playerId: choice.playerId,
        choiceId: choice.choiceId,
        selectedOptionIds: pick(session.state),
      },
      deps,
    );
    if (!next.ok) throw new Error(`resolveChoice rejected: ${next.error.code}: ${next.error.message}`);
    session = next.session;
    events.push(...next.events);
  }
  const replayed = replay(session.log, deps);
  if (!replayed.ok) throw new Error(replayed.error.message);
  if (JSON.stringify(replayed.state) !== JSON.stringify(session.state)) throw new Error("the log does not replay");
  return { state: session.state, events };
}

/**
 * Picks the option whose id ends with an accepted ability, else the option labelled `label`, else a card option that
 * is one of `targets`; anything else as `firstLegal`.
 */
export const choosing =
  (opts: { accept?: readonly string[]; label?: RegExp; targets?: readonly InstanceId[] } = {}): Picker =>
  (state) => {
    const choice = state.pendingChoice;
    if (!choice) return [];
    const accepted = choice.options.find((o) => (opts.accept ?? []).some((a) => o.optionId.endsWith(`:${a}`)));
    if (accepted) return [accepted.optionId];
    const labelled = opts.label ? choice.options.find((o) => opts.label!.test(o.label)) : undefined;
    if (labelled) return [labelled.optionId];
    const wanted = choice.options.find((o) => o.ref.kind === "card" && (opts.targets ?? []).includes(o.ref.instanceId));
    return wanted ? [wanted.optionId] : firstLegal(state);
  };
