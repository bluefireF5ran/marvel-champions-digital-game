/**
 * Inspect lines for wave 8's in-play state that no stat tile or counter shows: a hit point floor a rule sets
 * (`consideredRemainingHp`, §3.10), the resource icons a card is considered to have (`consideredResourceIcon`, §3.42)
 * and what being in a scenario play area such as the mission area means for a card (§3.33, MC45 p. 5). Each answer is
 * the engine's own (`hitPointFloor`, `resourceIconsInPlay`, `scenarioPlayAreaOf`); nothing here restates a rule.
 */

import {
  cardOf,
  currentName,
  getInstance,
  cardsInPlay,
  hitPointFloor,
  resourceIconsInPlay,
  scenarioPlayAreaOf,
  textBoxBlankFor,
  type EngineDeps,
  type GameState,
  type InstanceId,
  type ResourcePool,
  type ResourceType,
} from "@mc/engine";
import { heldByOf, tuckedCardsUnder } from "./board-model.js";

/** "Considered to have at least 1 hit point", or null when no rule sets a floor on this card. */
export function hitPointFloorNote(state: GameState, id: InstanceId, deps: EngineDeps): string | null {
  const floor = hitPointFloor(state, id, deps);
  if (floor === undefined) return null;
  return `Considered to have at least ${floor} hit point${floor === 1 ? "" : "s"}`;
}

const ICON_ORDER: readonly ResourceType[] = ["physical", "mental", "energy", "wild"];

/** A pool as a list of icons, a type once for each icon: `{ wild: 2 }` is `["wild", "wild"]`. */
const iconsOf = (pool: ResourcePool): readonly ResourceType[] =>
  ICON_ORDER.flatMap((type) => Array.from({ length: pool[type] }, () => type));

/**
 * "Resource icons: energy, wild (not printed: wild)": the icons a card in play has now, with the ones a rule gives it
 * set apart from the ones it prints. Null for a card that is not in play and for one with no considered icon: the
 * printed icons are already on the card.
 */
export function resourceIconNote(state: GameState, deps: EngineDeps, id: InstanceId): string | null {
  if (!cardsInPlay(state).includes(id)) return null;
  const { icons, considered } = resourceIconsInPlay(state, deps, id);
  const extra = iconsOf(considered);
  if (extra.length === 0) return null;
  return `Resource icons: ${iconsOf(icons).join(", ")} (not printed: ${extra.join(", ")})`;
}

/**
 * What being in a scenario play area means for this card: no player controls it, a closed area is not reached by
 * abilities that do not name it, and an ally there has a blank text box except for its traits. Empty for a card outside
 * every such area.
 */
export function scenarioAreaNotes(state: GameState, deps: EngineDeps, id: InstanceId): readonly string[] {
  const area = scenarioPlayAreaOf(state, id);
  if (area === null) return [];
  const notes = [`In the ${area} area: in play, but no player controls it`];
  if (state.scenarioPlayAreas?.[area]?.closed) notes.push("Card abilities don't reach it unless they name the area");
  if (cardOf(state, id)?.type === "ally" && textBoxBlankFor(state, id, deps)) {
    notes.push("Its text box is blank, except for traits");
  }
  return notes;
}

/**
 * Where this card sits relative to another, when that is not a play area: the cards tucked under it (a facedown one is
 * only counted, never named), the card it is tucked under, and the card that holds it (a held minion, a captive ally).
 * Empty for a card with none of these.
 */
export function placementNotes(state: GameState, id: InstanceId): readonly string[] {
  const notes: string[] = [];
  const under = tuckedCardsUnder(state, id);
  if (under.length > 0) notes.push(`Under it: ${under.map((card) => card.name).join(", ")}`);
  const host = Object.values(state.instances).find((instance) => instance.tucked.includes(id));
  if (host) {
    const name = currentName(state, host.instanceId) ?? cardOf(state, host.instanceId)?.name ?? "a card";
    notes.push(`Tucked under ${name}: not in play`);
  }
  const held = heldByOf(state, id);
  if (held?.kind === "held") notes.push(`Held by ${held.hostName}: in play, engaged with no player, does not activate`);
  if (held?.kind === "captive") notes.push(`Held by ${held.hostName}: under no player's control`);
  return notes;
}

/**
 * The cards the sheet steps through (◂ ▸) when it is opened on a card with others under it, or on one of those: the
 * host first, then what is tucked under it in order. Empty for a card in neither role.
 */
export function tuckedSiblings(state: GameState, id: InstanceId): readonly InstanceId[] {
  const own = getInstance(state, id)?.tucked ?? [];
  if (own.length > 0) return [id, ...own];
  const host = Object.values(state.instances).find((instance) => instance.tucked.includes(id));
  return host ? [host.instanceId, ...host.tucked] : [];
}
