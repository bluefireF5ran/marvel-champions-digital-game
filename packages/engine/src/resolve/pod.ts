/**
 * The pod's shared villain and scheme inside one group's game (docs/phase7-wave9.md §3.66): a script's shared event on
 * its way out, and the results of shared events applied here once the resolution in progress has finished (MC55 p. 20:
 * "Each group should pause gameplay activity in their game area, first finishing any actions or abilities that are
 * currently resolving").
 *
 * The record itself changes in one place, the pure reducer (`applySharedEvent`, `pod.ts`). With a local coordinator
 * (Single Group Mode) this engine calls it; with a remote one it only emits, and the results arrive from outside.
 */

import { emit, pushFrames, type Ctx } from "../ctx.js";
import { endGame } from "../effects.js";
import { EngineInvariantError } from "../errors.js";
import type { InstanceId } from "../ids.js";
import {
  applySharedEvent,
  POD_MOMENT,
  podBlocksOf,
  podGroupIds,
  resolveGroup,
  sharedLost,
  type PodState,
  type SharedEvent,
  type SharedPodState,
  type SharedResult,
  type SharedThreatCause,
} from "../pod.js";
import { cardOf, getInstance } from "../query.js";
import type { EffectSpec } from "../spec.js";
import type { TriggerEvent } from "../trigger-events.js";
import { gameAbilityFrames, pushEffects, pushEvent, type Frame } from "./frames.js";
import { heard } from "./triggers.js";

const setPod = (ctx: Ctx, pod: PodState): void => {
  ctx.state = { ...ctx.state, pod };
};

function setShared(ctx: Ctx, pod: PodState, shared: SharedPodState): PodState {
  if (shared === pod.shared) return pod;
  const next = { ...pod, shared };
  setPod(ctx, next);
  emit(ctx, { type: "sharedStateChanged", shared });
  return next;
}

/**
 * `EffectSpec sharedEvent`: a script deals damage to the shared villain or places threat on the shared scheme. Always
 * leaves the command as `sharedEventEmitted`, numbered by this group, which is what a host forwards to the pod's
 * coordinator. A local coordinator applies it here and now, and queues what it brought about for `settlePod`. Nothing
 * happens in a game with no shared record, or for an amount of 0.
 */
export function emitSharedEvent(
  ctx: Ctx,
  kind: "villainDamaged" | "schemeThreatPlaced",
  amount: number,
  cause: SharedThreatCause | undefined,
): void {
  const pod = ctx.state.pod;
  const whole = Math.max(0, Math.floor(amount));
  if (!pod?.shared || whole === 0) return;
  const event: SharedEvent =
    kind === "villainDamaged"
      ? { type: "sharedVillainDamaged", groupId: pod.groupId, amount: whole }
      : { type: "sharedSchemeThreatPlaced", groupId: pod.groupId, amount: whole, cause: cause ?? "schemeCompleted" };
  const seq = pod.outboundSeq + 1;
  const numbered: PodState = { ...pod, outboundSeq: seq };
  setPod(ctx, numbered);
  emit(ctx, { type: "sharedEventEmitted", seq, event });
  if (pod.coordinator !== "local" || !numbered.shared) return;
  const { shared, results } = applySharedEvent(numbered.shared, event);
  const stored = setShared(ctx, numbered, shared);
  if (results.length > 0) setPod(ctx, { ...stored, pendingResults: [...(stored.pendingResults ?? []), ...results] });
}

/** Raises one of the pod's moments for the first player, on the stack only when an ability answers it. */
function raise(ctx: Ctx, name: string, sourceInstanceId: InstanceId | null): void {
  const moment = { name, playerId: ctx.state.firstPlayerId, sourceInstanceId };
  emit(ctx, { type: "momentRaised", ...moment });
  const event: TriggerEvent = { kind: "momentRaised", ...moment };
  if (heard(ctx.state, ctx.deps, event)) pushEvent(ctx, event);
}

/**
 * A final result of the pod: the neutral card's own line ends the game, answering the moment ("If [the shared villain]
 * is defeated, all players in all groups win the game."; "If this stage is completed, the players lose the game."). The
 * shared record is already final by then, so when no ability in the game answers, the engine records the same outcome
 * itself rather than play on: a win as `endGame` records one, a loss against the shared scheme.
 */
function conclude(ctx: Ctx, name: string, sourceInstanceId: InstanceId | null, result: "win" | "loss"): void {
  const moment: TriggerEvent = { kind: "momentRaised", name, playerId: ctx.state.firstPlayerId, sourceInstanceId };
  const answered = heard(ctx.state, ctx.deps, moment);
  raise(ctx, name, sourceInstanceId);
  if (answered) return;
  endGame(
    ctx,
    result === "win"
      ? { result: "win", reason: "villainDefeated" }
      : {
          result: "loss",
          reason: "cardAbility",
          sourceInstanceId: sourceInstanceId ?? ctx.state.mainScheme.instanceId,
        },
  );
}

/**
 * The pod has lost: its shared scheme is complete and no player phase is left to defeat the shared villain in (MC55
 * p. 21).
 */
function loseToSharedScheme(ctx: Ctx, pod: PodState): void {
  if (pod.shared) setShared(ctx, pod, sharedLost(pod.shared));
  conclude(ctx, POD_MOMENT.sharedSchemeCompleted, pod.neutral?.mainSchemeInstanceId ?? null, "loss");
}

/**
 * Applies one result of a shared event in this group's game. The one handler for a result this engine's own reducer
 * produced (a local coordinator) and for one a pod coordinator sends (docs/phase7-wave9.md §3.68), so the two paths
 * cannot drift. Called only with nothing resolving.
 *
 * - `sharedVillainFlipped`: this group's copy of the neutral villain turns over and its new face is revealed: that
 *   face's When Revealed resolves for the first player (MC55 p. 20, p. 23), then `POD_MOMENT.sharedVillainFlipped`.
 * - `sharedVillainDefeated`: `POD_MOMENT.sharedVillainDefeated`, answered by the villain's own line.
 * - `sharedSchemeCompleted`: nothing when the shared villain has been defeated since. In the player phase the phase is
 *   played to its end (`PodState.finalPlayerPhase`; MC55 p. 21, docs/phase7-wave9.md §4.1 Q9 = A). Otherwise, under a
 *   local coordinator, no player phase is running anywhere and the pod has lost. Under a remote one this group waits
 *   for the coordinator's verdict.
 */
export function applyInbound(ctx: Ctx, result: SharedResult): void {
  const pod = ctx.state.pod;
  if (!pod) return;
  emit(ctx, { type: "sharedResultApplied", result });
  const neutral = pod.neutral;
  switch (result) {
    case "sharedVillainFlipped": {
      const id = neutral?.villainInstanceId;
      const instance = id === undefined ? undefined : getInstance(ctx.state, id);
      if (id !== undefined && instance && !instance.flipped) {
        ctx.state = { ...ctx.state, instances: { ...ctx.state.instances, [id]: { ...instance, flipped: true } } };
        emit(ctx, { type: "cardFlipped", instanceId: id, flipped: true });
      }
      // Raised first, so it is answered after the new face's When Revealed has resolved.
      raise(ctx, POD_MOMENT.sharedVillainFlipped, id ?? null);
      if (id !== undefined && instance)
        pushFrames(ctx, gameAbilityFrames(ctx, id, ["whenRevealed"], null, undefined, ctx.state.firstPlayerId));
      return;
    }
    case "sharedVillainDefeated":
      conclude(ctx, POD_MOMENT.sharedVillainDefeated, neutral?.villainInstanceId ?? null, "win");
      return;
    case "sharedSchemeCompleted":
      if (pod.shared?.status === "won") return;
      if (ctx.state.step.phase === "player") setPod(ctx, { ...pod, finalPlayerPhase: true });
      else if (pod.coordinator === "local") loseToSharedScheme(ctx, pod);
      return;
  }
}

/**
 * The pod's business at a quiet point (nothing on the stack, no choice open): the oldest waiting result of a shared
 * event is applied; and a player phase that was played out after the shared scheme's completion has ended, so under a
 * local coordinator the pod has lost unless the shared villain was defeated in it. Returns whether anything was done.
 * A game with no pod record returns at once.
 */
export function settlePod(ctx: Ctx): boolean {
  const pod = ctx.state.pod;
  if (!pod) return false;
  const [next, ...rest] = pod.pendingResults ?? [];
  if (next !== undefined) {
    const { pendingResults: _taken, ...kept } = pod;
    setPod(ctx, rest.length > 0 ? { ...kept, pendingResults: rest } : kept);
    applyInbound(ctx, next);
    return true;
  }
  if (pod.finalPlayerPhase && ctx.state.step.phase !== "player") {
    const { finalPlayerPhase: _over, ...kept } = pod;
    setPod(ctx, kept);
    if (kept.coordinator === "local" && kept.shared?.status === "schemeCompleted") loseToSharedScheme(ctx, kept);
    return true;
  }
  return false;
}

/**
 * `EffectSpec inGroup` (docs/phase7-wave9.md §3.67): the block resolves in each group it names. For this group, as a
 * frame of its own with this group's first player as "you" and nothing of the ability around it (no slot, var or
 * event), which is exactly what another group would be sent. For another group, nothing resolves here and the block is
 * requested of the pod's coordinator by its place in the ability.
 */
export function resolveInGroup(
  ctx: Ctx,
  frame: Frame<"effects">,
  effect: Extract<EffectSpec, { kind: "inGroup" }>,
): void {
  const own = ctx.state.pod?.groupId ?? podGroupIds(ctx.state)[0];
  const named =
    effect.group === "eachInPod" ? podGroupIds(ctx.state) : [resolveGroup(ctx.state, effect.group, frame.vars)];
  for (const group of named) {
    if (group === undefined) continue;
    if (group === own) {
      pushEffects(ctx, {
        effects: effect.effects,
        selfInstanceId: frame.selfInstanceId,
        abilityId: frame.abilityId,
        instruction: frame.instruction,
        controllerId: ctx.state.firstPlayerId,
      });
      continue;
    }
    const sourceCardId = frame.selfInstanceId === null ? undefined : cardOf(ctx.state, frame.selfInstanceId)?.id;
    const definition = frame.abilityId === undefined ? undefined : ctx.deps.abilities[frame.abilityId];
    // Found by content, not identity: a frame restored from a save holds a copy of the registry's effect.
    const wanted = JSON.stringify(effect);
    const block = definition ? podBlocksOf(definition.effects).findIndex((b) => JSON.stringify(b) === wanted) : -1;
    if (sourceCardId === undefined || frame.abilityId === undefined || block < 0)
      throw new EngineInvariantError("an inGroup block for another group must be part of a card's ability");
    emit(ctx, {
      type: "podEffectRequested",
      toGroupId: group,
      sourceCardId,
      abilityId: frame.abilityId,
      block: block + 1,
    });
  }
}
