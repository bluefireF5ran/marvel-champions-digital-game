/**
 * What the pod's two neutral cards (Loki, God of Lies and Worlds Collide) say about their shared numbers, for Inspect:
 * their hit points and threat are the pod's shared record (`sharedVillain`, `sharedScheme`), not damage and threat on
 * the instance, so the sheet's own damage and threat lines would read 0 for both. Null for every other card.
 *
 * Engine ask: none; both selectors exist. This only words them.
 */
import { sharedScheme, sharedVillain, type GameState, type InstanceId } from "@mc/engine";

export interface NeutralNotes {
  readonly damage: string | null;
  readonly threat: string | null;
}

export function neutralNotes(state: GameState, id: InstanceId): NeutralNotes | null {
  const villain = sharedVillain(state);
  if (villain && villain.instanceId === id) {
    const flip = villain.flipped
      ? "flipped: defeating him wins the game"
      : villain.flipAtRemaining === null
        ? null
        : `flips at ${villain.flipAtRemaining} left`;
    return {
      damage: [`${villain.remaining} of ${villain.hp} hit points left, shared by the whole pod`, flip]
        .filter((part): part is string => part !== null)
        .join(" · "),
      threat: null,
    };
  }
  const scheme = sharedScheme(state);
  if (scheme && scheme.instanceId === id) {
    const loss =
      scheme.status === "schemeCompleted"
        ? "complete: defeat Loki before the player phase ends or the players lose"
        : scheme.status === "lost"
          ? "complete: the players lose"
          : `the players lose at ${scheme.target}`;
    return { damage: null, threat: `${scheme.threat} of ${scheme.target} threat, shared by the whole pod · ${loss}` };
  }
  return null;
}
