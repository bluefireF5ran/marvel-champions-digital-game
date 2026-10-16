/**
 * Rules audit chunk 04 (Glossary: ATTACK (PLAYER ABILITY TYPE) ... CHOOSE (OPTION)). Audit proofs only: each `it.fails`
 * marks a place the engine or a card script does something the RRG forbids, and flips to a failure when it is fixed.
 *
 * Hogwashed (30004): "Hero Action: Remove 1 toon counter from your identity -> choose to either deal 5 damage to a
 * minion or remove 5 threat from a side scheme." RRG 1.8 "Choose (Option)" (p. 12): "When a player card requires a
 * player to choose an option, they cannot choose an option that cannot be at least partially resolved. This includes
 * options that ... Require one or more targets and there are no valid targets." With a side scheme in play and no
 * minion, only the threat option may be offered. The engine's `chooseOne` offers every option whose `condition` holds
 * (`resolve/effects-frame.ts` `executeChooseOne`), and this script gives its damage option no `when`.
 *
 * Hydra Exo-Soldier (04131): "[star] Boost: Give the villain a tough status card and another boost card." FFG ruling of
 * December 11, 2025, as quoted by Hall of Heroes in the Discord rulings corpus (id 8798-07507; that date is before
 * `marvel-champions-rulings-post-rrg-1-7.md` begins, so the primary page is not in the repo): when a Villainous minion
 * flips it as its boost card, give the villain a tough status card, then check whether the villain already has a boost
 * card; if so give it another, if not give none. The same reasoning is official in Feb 28, 2026 Ruling 6 (Pirate Lackey:
 * "Because the villain is not activating, do not give it a boost card"), pinned in `wave6/mut_gen/qa.test.ts`. The
 * script is `04131.boost = giveTough(theVillain), modifyAttack({ extraBoostCards: 1 })`, which hands the extra card to
 * the activation in progress, here the minion's.
 */
import { cardId } from "@mc/content";
import { activeEncounterDeck, type GameEvent } from "@mc/engine";
import { describe, expect, it } from "vitest";
import {
  firstLegal,
  identityOf,
  inst,
  P1,
  patchInstance,
  runWith,
  stackEncounterDeck,
  toHero,
  type Picker,
} from "../testing/harness.js";
import { driveEventsPicking, encounterCardInVillainArea } from "../testing/staging.js";
import { WAVE6_DEPS } from "../wave6/index.js";
import { withoutDealtCards } from "../wave6/mut_gen/magneto-testing.js";
import { mansionAttackGame } from "../wave6/mut_gen/mansion-attack-testing.js";
import { engageMinion } from "../wave6/mut_gen/project-wideawake-testing.js";
import { spiderHamScenario } from "../wave5/spiderham/support.js";
import { playFromHand, runWave5, startWave5Game } from "../wave5/testing.js";

describe("Hogwashed (30004): RRG 1.8 'Choose (Option)' (p. 12), an option with no valid target cannot be chosen", () => {
  it("with a side scheme but no minion in play, only the 'Remove 5 threat' option is offered", () => {
    const start = runWave5(startWave5Game(spiderHamScenario("rhino", { seed: 1 })), toHero(P1));
    const identity = identityOf(start, P1);
    const withToon = patchInstance(start, identity, { counters: { ...inst(start, identity).counters, toon: 1 } });
    const { state: staged } = encounterCardInVillainArea(withToon, "01107", 8); // Breakin' & Takin', a side scheme.
    const offered: string[][] = [];
    const pick: Picker = (s) => {
      const choice = s.pendingChoice;
      if (choice?.prompt.kind === "chooseOption") offered.push(choice.options.map((o) => o.label ?? ""));
      return firstLegal(s);
    };
    playFromHand(staged, "30004", 1, pick);
    // No minion is in play, so a prompt, if any, must not list the damage option.
    for (const labels of offered) expect(labels).not.toContain("Deal 5 damage to a minion");
    // The prompt is either skipped (one option left) or lists only the threat option; it is never asked with both.
    expect(offered.flat()).not.toContain("Deal 5 damage to a minion");
  });
});

describe("Hydra Exo-Soldier (04131) as a Villainous minion's boost card: FFG ruling December 11, 2025", () => {
  it("the villain has no boost card (its own was spent), so the minion's activation is not given another", () => {
    const base = mansionAttackGame({ villain: "Avalanche", modularSetIds: ["future_past"] });
    const hero = runWith(WAVE6_DEPS, base, toHero(P1));
    // Bastion (32167) is a Villainous minion. Deck: the villain's boost (Advance), Bastion's boost (Exo-Soldier), filler.
    const { state: withBastion, id: bastion } = engageMinion(withoutDealtCards(hero), "32167");
    const stacked = stackEncounterDeck(withBastion, "01186", "01186", "32132", "32136");
    const exo = activeEncounterDeck(stacked).deck[1]!;
    const staged = patchInstance(stacked, exo, { cardId: cardId("04131") });
    const { events, state } = driveEventsPicking(WAVE6_DEPS, staged, firstLegal, { type: "endTurn", playerId: P1 });
    const flipped = events.filter(
      (e): e is Extract<GameEvent, { type: "boostCardFlipped" }> => e.type === "boostCardFlipped",
    );
    const bastionFlips = flipped
      .filter((e) => e.enemyInstanceId === bastion)
      .map((e) => state.instances[e.instanceId]!.cardId);
    expect(inst(state, hero.villains[0]!.instanceId).statuses.tough).toBe(1); // the tough half does happen.
    expect(bastionFlips).toEqual([cardId("04131")]); // actual: Exo-Soldier and then the extra card, 32132.
  });
});
