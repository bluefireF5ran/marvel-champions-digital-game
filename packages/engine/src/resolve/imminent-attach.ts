/**
 * An attach still to come, and the "would be attached" interrupt window in front of it (`TriggerEvent cardAttached`
 * with `imminent`; docs/phase7-wave9.md §3.49): "Forced Interrupt: When a non-scenario-specific Tech attachment would
 * be attached to the villain, attach it to [this card] instead."
 *
 * Two ways an attachment reaches a host go through here: its own "attach to" text as it enters play (a reveal's
 * placement step, a card put into play), and another ability's `attach` effect (a boost ability's "attach this card to
 * the villain", a search that attaches). Like every other optional announcement the event goes on the stack only when
 * an interrupt could answer it, so a game with no such ability, or one whose ability does not match this attach, makes
 * the attach at once exactly as before.
 *
 * RRG 1.8 "Attach To" (p. 8): "The 'attach to' phrase is checked for legality when the card would be attached"; the
 * host is chosen before the window opens, and an interrupt that replaces it names the new host itself ("is not
 * resolved if another ability causes that card to attach to a specific game element").
 */

import { type Ctx, moveCard } from "../ctx.js";
import type { InstanceId, PlayerId } from "../ids.js";
import { discardZoneFor, getInstance } from "../query.js";
import { canHaveAttached } from "../rules.js";
import { cardsInPlay } from "../select.js";
import type { TriggerEvent } from "../trigger-events.js";
import { announcesAttaching, attachCardBy } from "./attach.js";
import { enterPlay } from "./enter-play.js";
import { pushEvents } from "./frames.js";
import { hasCandidates, heard } from "./triggers.js";

export type ImminentAttachEvent = Extract<TriggerEvent, { kind: "cardAttached" }>;

/** The event of `id` about to be attached to `host` by `sourceInstanceId`'s ability (null: its own placement). */
export const imminentAttach = (
  id: InstanceId,
  host: InstanceId,
  playerId: PlayerId | null,
  entry: "placement" | "ability",
  sourceInstanceId: InstanceId | null,
): ImminentAttachEvent => ({
  kind: "cardAttached",
  instanceId: id,
  hostInstanceId: host,
  playerId,
  imminent: { entry, sourceInstanceId },
});

/** Whether an interrupt would answer this attach still to come: only then is it announced. */
export const imminentAttachHeard = (ctx: Ctx, event: ImminentAttachEvent): boolean =>
  hasCandidates(ctx.state, ctx.deps, event, "interrupt");

/**
 * The placement of an attachment entering play on the host its own "attach to" text gave it: attached and announced as
 * entering play for `playerId` now, or, when an interrupt hears "would be attached", once that window has resolved
 * (the event is pushed above the caller's frame, so it resolves before the caller's next step).
 */
export function placeAttachment(ctx: Ctx, id: InstanceId, host: InstanceId, playerId: PlayerId): void {
  const event = imminentAttach(id, host, playerId, "placement", null);
  if (imminentAttachHeard(ctx, event)) pushEvents(ctx, [event]);
  else resolveImminentAttach(ctx, event, host);
}

/**
 * An attach whose interrupts have resolved, to `host` (the event's own host, or the one a `replaceAttachHost` named).
 * Returns whether the card is on that host afterwards.
 *
 * A placement: the card goes on the host and enters play. A host that left play during the window, or that can no
 * longer have the card attached, leaves it nowhere legal to go, so it is discarded (RRG 1.8 "Attach To", p. 8). An
 * ability's attach: as the `attach` effect makes it (`attachCardBy`), with the announcements that effect makes.
 */
export function resolveImminentAttach(ctx: Ctx, event: ImminentAttachEvent, host: InstanceId): boolean {
  const id = event.instanceId;
  if (!getInstance(ctx.state, id)) return false;
  if (event.imminent?.entry !== "placement") {
    const attached = attachCardBy(ctx, id, host, event.playerId).filter((announced) =>
      announcesAttaching(announced, (e) => heard(ctx.state, ctx.deps, e)),
    );
    if (attached.length > 0) pushEvents(ctx, attached);
    return getInstance(ctx.state, id)?.attachedTo === host;
  }
  // A card something else already put into play during the window is left where that put it.
  if (cardsInPlay(ctx.state).includes(id)) return false;
  if (!cardsInPlay(ctx.state).includes(host) || !canHaveAttached(ctx.state, ctx.deps, host, id)) {
    moveCard(ctx, id, discardZoneFor(ctx.state, id), "top");
    return false;
  }
  moveCard(ctx, id, { kind: "attachment", hostInstanceId: host });
  enterPlay(ctx, id, event.playerId);
  return true;
}
