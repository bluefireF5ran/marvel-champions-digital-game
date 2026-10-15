/**
 * Rules audit chunk 34 (FFG rulings post-RRG 1.6, July 25 - October 10, 2025).
 *
 * Ruling 69.95 (August 22, 2025, Alex): Spectrum (`falcon` 53018, "[mental] - +2 THW. [physical] - +2 ATK. [energy] -
 * +2 hit points. [wild] - All of the above.") tucking Salvage (`gmw` 16033, which produces one [mental] and one
 * [wild]) "would give her both the Mental and Wild resource bonuses, so +4 THW, +2 ATK, and +2 HP". RRG 1.8 is silent;
 * the June 2, 2026 Ruling 2 (2) on Spectrum only says the bonuses last while the card stays tucked.
 *
 * The script (`wave9/falcon/aspect-basic.ts` `tuckedPrints`) gives each bonus once however many icons match, so a
 * [mental] + [wild] card gives +2 THW, not +4.
 */
import { statBonus, type InstanceId } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import { P1, firstLegal, inst, moveToHand, patchInstance, play } from "../testing/harness.js";
import { driveEventsPicking } from "../testing/staging.js";
import { cardId } from "@mc/content";
import { SPECTRUM_GRANTED_RESPONSE } from "../wave9/falcon/aspect-basic.js";
import { ASPECT_DEPS as DEPS, aspectHero } from "../wave9/falcon/aspect-basic.testing.js";

vi.setConfig({ testTimeout: 120_000 });

describe("audit 34: Spectrum tucking a [mental] + [wild] card (ruling Aug 22, 2025, 69.95)", () => {
  it.fails("gets +4 THW, +2 ATK (Mental and Wild both count)", () => {
    const base = aspectHero();
    const given = moveToHand(base, P1, "53018", "53025", "53026", "53002");
    const [spectrum, energy, genius, redwing] = given.ids as [InstanceId, InstanceId, InstanceId, InstanceId];
    // Genius (a [mental] resource card) stands in as a card with Salvage's printed resources [mental] + [wild].
    const salvage = cardId("16033");
    const staged = patchInstance(
      {
        ...given.state,
        players: given.state.players.map((p) =>
          p.playerId === P1 ? { ...p, hand: [spectrum, energy, genius, redwing] } : p,
        ),
      },
      genius,
      { cardId: salvage },
    );
    expect(staged.cardPool[salvage], "Salvage is in the card pool").toBeDefined();
    const pick = (s: Parameters<typeof firstLegal>[0]): readonly string[] => {
      const choice = s.pendingChoice!;
      const offered = choice.options.map((o) => o.optionId as string);
      if (choice.prompt.kind === "chooseTriggers") {
        const hit = offered.find((o) => o.endsWith(SPECTRUM_GRANTED_RESPONSE));
        return hit ? [hit] : [];
      }
      if (choice.prompt.kind === "chooseCards" && offered.includes(genius)) return [genius];
      return firstLegal(s);
    };
    // Salvage 2 (mental + wild) + Energy 2 + Redwing 1 (wild) = 5.
    const out = driveEventsPicking(DEPS, staged, pick, play(P1, spectrum, [genius, energy, redwing]));
    expect(inst(out.state, spectrum).tucked).toEqual([genius]);
    expect(statBonus(out.state, DEPS, spectrum, "thw")).toBe(4);
    expect(statBonus(out.state, DEPS, spectrum, "atk")).toBe(2);
  });
});

/*
 * Ruling 69.94 (August 14, 2025, Alex): "cards are drawn one at a time, so if you draw Shapeshifter Surprise when
 * drawing up to your hand size, you immediately resolve it before finishing drawing cards." RRG 1.8 "Hand Size"
 * (p. 21) agrees that the end-of-phase draw checks the hand size "after each card is drawn".
 *
 * Shapeshifter Surprise (`mut_gen` 32083): "Forced Response: After this card enters your hand, ..." Engine:
 * `drawUpTo` (`engine/src/effects.ts`) loops `drawOne` to the end and the forced response is announced afterwards.
 */
import { type GameEvent as AuditEvent } from "@mc/engine";
import { runWith, toHero } from "../testing/harness.js";
import { engageMinion } from "../wave6/mut_gen/project-wideawake-testing.js";
import { mystiqueGame, onTopOfPlayerDeck } from "../wave6/mut_gen/mystique-testing.js";
import { WAVE6_DEPS } from "../wave6/index.js";

describe("audit 34: Shapeshifter Surprise resolves before the rest of the draw up to hand size (ruling Aug 14, 2025, 69.94)", () => {
  it.fails("its Forced Response resolves before the second card is drawn", () => {
    const hero = runWith(WAVE6_DEPS, mystiqueGame(), toHero(P1));
    const withMystique = engageMinion(hero, "32080", P1);
    const emptied = {
      ...withMystique.state,
      players: withMystique.state.players.map((p) => ({ ...p, hand: [], discard: [...p.discard, ...p.hand] })),
    };
    const staged = onTopOfPlayerDeck(emptied, "32083", P1);
    const result = driveEventsPicking(WAVE6_DEPS, staged.state, firstLegal, { type: "endTurn", playerId: P1 });
    const events: readonly AuditEvent[] = result.events;
    const drawn = events.flatMap((e, i) => (e.type === "cardDrawn" ? [i] : []));
    const resolved = events.findIndex(
      (e) => e.type === "abilityResolved" && e.abilityId === "32083.shapeshifter-surprise-forced-response",
    );
    expect(drawn.length).toBeGreaterThan(1);
    expect(resolved, "the forced response resolved").toBeGreaterThan(-1);
    expect(resolved).toBeLessThan(drawn[1]!);
  });
});

/*
 * Ruling 69.105 (September 15, 2025, Alex): "When an encounter card ability has a player choose between multiple
 * options, they must choose the option they can fully resolve; if there isn't one, they must choose what they can
 * most fully resolve (see 'Choose (Option)' in the rules reference). If Nebula is in Alter-Ego and ready with 1
 * Technique upgrade when she reveals Inferiority Complex, she must exhaust her Alter-Ego ... It would be the same if
 * she had no Technique upgrades." RRG 1.8 p. 12 "Choose (Option)" (printed text read from the PDF) says only that an
 * encounter card's choice cannot take "an option that requires one or more targets if there are no valid targets";
 * it does not contradict the ruling, which adds the "fully resolve" duty. So the ruling stands.
 *
 * The shared `obligation()` shape (`core/obligations.ts`) is a plain `chooseOne`, and the existing test
 * `wave4/nebu/nebula-obligation-nemesis.test.ts` › "with no technique upgrades to discard, the card gains surge
 * instead" picks the second option for a ready alter-ego with no Technique upgrades.
 */
import { activeEncounterDeckId } from "@mc/engine";
import { applyCommand } from "@mc/engine";
import { endTurn } from "../testing/harness.js";
import { WAVE4_DEPS } from "../wave4/index.js";
import { startWave4Game } from "../wave4/testing.js";
import { nebulaScenario } from "../wave4/nebu/support.js";

describe("audit 34: Inferiority Complex offers only the option Nebula can fully resolve (ruling Sep 15, 2025, 69.105)", () => {
  it("a ready alter-ego with no Technique upgrades is not offered the discard option", () => {
    const state = startWave4Game(nebulaScenario("rhino", { seed: 3 }));
    const deckId = activeEncounterDeckId(state);
    const pile = state.encounterDecks[deckId]!;
    const id = pile.deck.find((i) => state.instances[i]?.cardId === "22027")!;
    const filler = pile.deck.find((i) => state.instances[i]?.cardId === "01186" && i !== id);
    const rest = pile.deck.filter((i) => i !== id && i !== filler);
    const staged = {
      ...state,
      encounterDecks: { ...state.encounterDecks, [deckId]: { ...pile, deck: [filler!, id, ...rest] } },
    };
    let current = runWith(WAVE4_DEPS, staged, endTurn());
    const offered: string[] = [];
    for (let guard = 0; guard < 20 && current.pendingChoice; guard++) {
      const choice = current.pendingChoice;
      offered.push(...choice.options.map((o) => o.label));
      const r = applyCommand(
        current,
        {
          type: "resolveChoice",
          playerId: choice.playerId,
          choiceId: choice.choiceId,
          selectedOptionIds: [choice.options[0]!.optionId],
        },
        WAVE4_DEPS,
      );
      if (!r.ok) throw new Error(r.error.message);
      current = r.state;
    }
    // The one resolvable option (exhaust) is taken without a prompt; the discard option is never offered.
    expect(offered.some((l) => l.startsWith("Choose and discard"))).toBe(false);
    const [obligation] = Object.keys(current.instances).filter((i) => current.instances[i]?.cardId === "22027");
    expect(current.removedFromGame).toContain(obligation);
  });
});

/*
 * Ruling 69.98 (August 22, 2025, Alex), question 2: "Can I use the resource ability of a support or upgrade card to
 * pay for the cost of Spectrum (leadership ally) and tuck this card under Spectrum? Yes, you can use a resource
 * ability to pay for Spectrum and then tuck that card under her." RRG 1.8 is silent on this.
 *
 * The engine's `paid.cards` slot (`cardsThatPaid`, `engine/src/actions.ts`) lists only cards discarded from a hand,
 * and the script's own docblock says "never a resource a 'Resource' ability generated", so a card in play whose
 * resource ability paid (here Falcon's Flock, an Aerial support that pays [energy] for Spectrum) is not offered.
 */
import { FALCON_DEPS, falconHeroGame, stagedInPlay } from "../wave9/falcon/testing.js";
import { resourceAbility } from "../testing/harness.js";

describe("audit 34: Spectrum may tuck the support whose resource ability paid for her (ruling Aug 22, 2025, 69.98)", () => {
  it.fails("Falcon's Flock, used to pay for Spectrum, is among the cards offered to tuck", () => {
    const base = falconHeroGame();
    const flock = stagedInPlay(base, "53006", { counters: { bird: 5 } });
    const given = moveToHand(flock.state, P1, "53018", "53026", "53027");
    const [spectrum, genius, strength] = given.ids as [InstanceId, InstanceId, InstanceId];
    const offeredOptions: string[] = [];
    const pick = (s: Parameters<typeof firstLegal>[0]): readonly string[] => {
      const choice = s.pendingChoice!;
      const offered = choice.options.map((o) => o.optionId as string);
      if (choice.prompt.kind === "chooseTriggers") {
        const hit = offered.find((o) => o.endsWith(SPECTRUM_GRANTED_RESPONSE));
        return hit ? [hit] : [];
      }
      if (choice.prompt.kind === "chooseCards") offeredOptions.push(...offered);
      return firstLegal(s);
    };
    // Flock [energy] 1 + Genius 2 + Strength 2 = 5.
    driveEventsPicking(
      FALCON_DEPS,
      given.state,
      pick,
      play(P1, spectrum, [genius, strength], {
        abilities: [resourceAbility(flock.id, "53006.falcons-flock-resource")],
      }),
    );
    expect(offeredOptions, "a tuck prompt was shown").not.toEqual([]);
    expect(offeredOptions).toContain(flock.id);
  });
});
