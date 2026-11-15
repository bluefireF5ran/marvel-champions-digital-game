import { describe, expect, test } from "vitest";
import { LocalEngineHost } from "../engine/local-host.js";
import { spectrumTuckReached, startSpectrumTuckGame } from "./dev-spectrum-tuck-game.js";
import { SessionStore } from "./session-store.js";

describe("the Spectrum tuck dev game (#525 item 11)", () => {
  test("stops on her tuck choice, offering the Flock with the hand cards, with the warning note", async () => {
    const store = new SessionStore(new LocalEngineHost());
    await startSpectrumTuckGame(store);
    expect(store.state.error).toBeNull();
    const game = store.state.game!;
    expect(spectrumTuckReached(game)).toBe(true);
    const codes = game.pendingChoice!.options.map((o) =>
      o.ref.kind === "card" ? game.instances[o.ref.instanceId]?.cardId : null,
    );
    expect([...codes].sort()).toEqual(["53006", "53026", "53027"]);
  }, 120_000);
});
