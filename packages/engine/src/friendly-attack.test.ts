/**
 * docs/phase7-wave4.md §3.26: a friendly character attacks its own player. Synthetic cards shaped like Old Rivals
 * (`nebu` 22031, errata RRG 1.8 p. 67: "When Revealed: Gamora attacks you. If the Gamora hero or ally is in play, she
 * attacks you (resolve her ATK against you without exhausting her). If no attack was made this way, this card gains
 * surge.").
 *
 * Sources: the card's errata'd text; FAQ, RRG 1.8 p. 62 ("Gamora is considered to have attacked, so abilities triggered
 * by her attacking can be resolved"; "allies always take consequential damage after they attack"); RRG 1.8 "Stun"
 * (p. 41); ruling, Jun 25, 2026 (4) #1 (the first sentence is the Gamora minion, the second the hero or ally).
 */

import { describe, expect, it } from "vitest";
import type { EngineDeps } from "./abilities.js";
import type { Command } from "./commands.js";
import { defendPreview } from "./defend-preview.js";
import { replay } from "./engine.js";
import type { InstanceId } from "./ids.js";
import { characterProfile, mustInstance, mustPlayer } from "./query.js";
import { cardsInPlay, resolveRef } from "./select.js";
import type { EffectSpec, TargetRef } from "./spec.js";
import type { GameState } from "./state.js";
import { depsOf, stubAbility } from "./testing/abilities.js";
import { runCommandsPicking } from "./testing/drive.js";
import { stubAlly, stubEvent, stubTreachery } from "./testing/fixtures.js";
import { defaultPick, giveCard, TREACHERY } from "./testing/scenario.js";
import { copiesOf, gameAtFirstTurn, onTopOfEncounterDeck, P1, playerCardIntoPlay, playFree } from "./testing/wave3.js";

const gamora: TargetRef = { kind: "each", query: { categories: ["hero", "ally"], name: "Gamora" } };
const RIVALS_REVEALED = stubAbility("rivals.when-revealed", {
  trigger: { kind: "whenRevealed" },
  effects: [
    { kind: "friendlyCharacterAttacks", attacker: gamora, player: { kind: "controller" }, bind: "rival" },
    {
      kind: "if",
      condition: { kind: "not", of: { kind: "varAtLeast", name: "rival.made", amount: 1 } },
      then: [{ kind: "gainSurge" }],
    },
  ],
});
const RIVALS = stubTreachery({ id: "old-rivals", boostIcons: 0, abilities: [RIVALS_REVEALED.ref] });
const GAMORA = {
  ...stubAlly({ id: "gamora", cost: 3, atk: 3, thw: 1, hp: 5, consequentialAttack: 1 }),
  name: "Gamora",
};

const event = (id: string, effects: readonly EffectSpec[]) => {
  const ability = stubAbility(`${id}.action`, { trigger: { kind: "action" }, effects });
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
const REVEAL = event("reveal", [{ kind: "revealEncounterCard", player: { kind: "controller" } }]);
const STUN_GAMORA = event("stun-gamora", [{ kind: "giveStatus", target: gamora, status: "stunned" }]);
/** "Hero Interrupt (defense): When an enemy attacks you, deal 2 damage to the attacking enemy." */
const PUNISH_ABILITY = stubAbility("punish.interrupt", {
  trigger: { kind: "interrupt", forced: false, on: { on: "enemyAttack", playerIs: "controller" } },
  label: ["defense"],
  effects: [{ kind: "dealDamage", target: { kind: "attackingEnemy" }, amount: { kind: "const", value: 2 } }],
});
const PUNISH = stubEvent({ id: "punish", cost: 0, abilities: [PUNISH_ABILITY.ref] });
const YOUR_HERO = { categories: ["identity"], controller: "you" } as const;
const ENEMY = { categories: ["enemy"] } as const;
/** A response or interrupt event in hand, its ability id `<id>.ability`. */
const triggered = (id: string, definition: Parameters<typeof stubAbility>[1]) => {
  const ability = stubAbility(`${id}.ability`, definition);
  return { card: stubEvent({ id, cost: 0, abilities: [ability.ref] }), ability };
};
/** Indomitable's shape (01082): "Response: After your hero defends, … ready your hero." */
const INDOMITABLE = triggered("indomitable", {
  trigger: { kind: "response", forced: false, on: { on: "defended", targetIs: YOUR_HERO } },
  effects: [{ kind: "ready", target: { kind: "identityOf", player: { kind: "controller" } } }],
});
/**
 * Counter-Punch's shape (01077): "Response (attack): After your hero defends against an enemy attack, deal damage to
 * that enemy": the defense's source must be an enemy.
 */
const COUNTER = triggered("counter", {
  trigger: { kind: "response", forced: false, on: { on: "defended", targetIs: YOUR_HERO, sourceIs: ENEMY } },
  label: ["attack"],
  effects: [{ kind: "dealDamage", target: { kind: "eventSource" }, amount: { kind: "const", value: 3 } }],
});
/** Riposte's rider (48018), as a response: "After your hero defends, deal 2 damage to the attacking enemy." */
const RIPOSTE = triggered("riposte", {
  trigger: { kind: "response", forced: false, on: { on: "defended", targetIs: YOUR_HERO } },
  effects: [
    { kind: "dealDamage", target: { kind: "eventSource", filter: ENEMY }, amount: { kind: "const", value: 2 } },
  ],
});
/**
 * Backflip's shape (01003): "Interrupt (defense): When you would take any amount of damage from an attack, prevent all
 * of that damage."
 */
const BACKFLIP = triggered("backflip", {
  trigger: { kind: "interrupt", forced: false, on: { on: "dealDamage", targetIs: YOUR_HERO, fromAttack: true } },
  label: ["defense"],
  effects: [{ kind: "preventDamage" }],
});
/** Psionic Redirect's shape (41006): "When you would take any amount of damage from an enemy attack, prevent 2 …". */
const REDIRECT = triggered("redirect", {
  trigger: {
    kind: "interrupt",
    forced: false,
    on: { on: "dealDamage", targetIs: YOUR_HERO, fromAttack: true, sourceIs: ENEMY },
  },
  label: ["defense"],
  effects: [{ kind: "preventDamage", amount: { kind: "const", value: 2 } }],
});
/**
 * "Interrupt: When Gamora attacks, …" (FAQ "Old Rivals (#31)", RRG 1.8 p. 62: abilities triggered by her attacking
 * resolve).
 */
const WHEN_SHE_ATTACKS = triggered("she-attacks", {
  trigger: { kind: "interrupt", forced: false, on: { on: "attack", sourceIs: { name: "Gamora" } } },
  effects: [{ kind: "giveStatus", target: { kind: "identityOf", player: { kind: "controller" } }, status: "tough" }],
});
const RESPONDERS = [INDOMITABLE, COUNTER, RIPOSTE, BACKFLIP, REDIRECT, WHEN_SHE_ATTACKS];
const deps: EngineDeps = depsOf(
  RIVALS_REVEALED,
  REVEAL.ability,
  STUN_GAMORA.ability,
  PUNISH_ABILITY,
  ...RESPONDERS.map((r) => r.ability),
);

function start(withGamora: boolean): { state: GameState; gamora: InstanceId | null } {
  const base = gameAtFirstTurn({
    cards: [RIVALS, GAMORA, REVEAL.card, STUN_GAMORA.card, PUNISH, ...RESPONDERS.map((r) => r.card)],
    deps,
    encounter: [RIVALS.id, ...copiesOf(TREACHERY.id, 10)],
    deck: [
      GAMORA.id,
      REVEAL.card.id,
      STUN_GAMORA.card.id,
      REVEAL.card.id,
      PUNISH.id,
      ...RESPONDERS.map((r) => r.card.id),
    ],
  });
  if (!withGamora) return { state: onTopOfEncounterDeck(base, RIVALS.id), gamora: null };
  const placed = playerCardIntoPlay(base, GAMORA.id);
  return { state: onTopOfEncounterDeck(placed.state, RIVALS.id), gamora: placed.id };
}
const identityDamage = (state: GameState): number =>
  mustInstance(state, mustPlayer(state, P1).identity.instanceId).damage;
const surged = (events: readonly { readonly type: string }[]): boolean =>
  events.some((e) => e.type === "surgeTriggered");

describe("§3.26 a friendly character attacks its own player", () => {
  it("the ally's ATK is dealt to you as her attack, she is not exhausted, takes consequential damage, and no surge", () => {
    const { state, gamora } = start(true);
    const { state: after, events, session } = playFree(state, deps, REVEAL.card.id);
    expect(identityDamage(after)).toBe(3);
    expect(mustInstance(after, gamora!).exhausted).toBe(false);
    expect(mustInstance(after, gamora!).damage).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({ sourceInstanceId: gamora, amount: 3 }));
    expect(surged(events)).toBe(false);
    const replayed = replay(session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(session.state);
  });

  it("with no Gamora in play, no attack is made and the card gains surge", () => {
    const { events, state } = playFree(start(false).state, deps, REVEAL.card.id);
    expect(identityDamage(state)).toBe(0);
    expect(surged(events)).toBe(true);
  });

  it("a stunned Gamora discards the stun instead; no attack is made, so the card surges", () => {
    const { state, gamora } = start(true);
    const stunned = playFree(state, deps, STUN_GAMORA.card.id).state;
    const { state: after, events } = playFree(stunned, deps, REVEAL.card.id);
    expect(mustInstance(after, gamora!).statuses.stunned).toBe(0);
    expect(identityDamage(after)).toBe(0);
    expect(surged(events)).toBe(true);
  });
});

/**
 * FFG ruling, Oct 26, 2023 (post-RRG 1.5 #102, Old Rivals): "Yes, players can defend against the attack from Old
 * Rivals. ... the rules do not restrict an attacking character and a defending character from being the same
 * character. However, ... Gamora is not considered 'an enemy' during the attack since she is not a minion or villain,
 * so she's not a valid target for abilities that target enemies." Owner decision 2026-11-15 (#525 item 1), replacing
 * wave 4 §3.26's "no defense step": the declare-defender step is offered; still no boost and no exhausting of Gamora.
 */
describe("defending against Old Rivals (ruling 102, Oct 26, 2023; owner decision 2026-11-15)", () => {
  /** The table in hero form (a hero may defend), Old Rivals on top of the encounter deck. */
  function heroTable(): { state: GameState; gamora: InstanceId; hero: InstanceId } {
    const { state, gamora } = start(true);
    const hero = mustPlayer(state, P1).identity.instanceId;
    return {
      state: {
        ...state,
        players: state.players.map((p) => ({ ...p, identity: { ...p.identity, form: "hero" as const } })),
      },
      gamora: gamora!,
      hero,
    };
  }
  /**
   * Plays Reveal, answering the defend prompt with `defender` ("decline" for none) and any other prompt with the first
   * option naming one of `use` (else the default); records every prompt seen.
   */
  function reveal(state: GameState, defender: string, use: readonly string[] = []) {
    const prompts: { kind: string; options: readonly string[]; attackingEnemy: readonly InstanceId[] }[] = [];
    let preview: ReturnType<typeof defendPreview> = null;
    const given = giveCard(state, P1, REVEAL.card.id);
    const play: Command = {
      type: "playCard",
      playerId: P1,
      cardInstanceId: given.id,
      payment: [],
      attachToInstanceId: null,
    };
    const result = runCommandsPicking(
      given.state,
      deps,
      (s) => {
        const choice = s.pendingChoice!;
        prompts.push({
          kind: choice.prompt.kind,
          options: choice.options.map((o) => o.optionId),
          attackingEnemy: resolveRef(
            s,
            { kind: "attackingEnemy" },
            { selfInstanceId: null, controllerId: P1, event: null, bindings: {}, deps },
          ),
        });
        if (choice.prompt.kind === "declareDefender") {
          preview ??= defendPreview(s, deps);
          return [defender];
        }
        const wanted = choice.options.find((o) => use.some((needle) => o.optionId.includes(needle)));
        return wanted ? [wanted.optionId] : defaultPick(s);
      },
      play,
    );
    const replayed = replay(result.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(result.session.state);
    return { ...result, prompts, preview: preview as ReturnType<typeof defendPreview> };
  }

  it("the attacked player is offered a defender declaration before Gamora's ATK is dealt", () => {
    const { state, gamora, hero } = heroTable();
    const { prompts, state: after } = reveal(state, "decline");
    const defend = prompts.find((p) => p.kind === "declareDefender");
    // The hero, and Gamora herself ("the rules do not restrict an attacking character and a defending character from
    // being the same character").
    expect(defend?.options).toEqual(["decline", hero, gamora]);
    // Declined: her 3 ATK to the identity, as before; she is not exhausted.
    expect(identityDamage(after)).toBe(3);
    expect(mustInstance(after, gamora).exhausted).toBe(false);
  });

  it("Gamora defends her own attack: she is exhausted and takes her ATK, then her consequential damage", () => {
    const { state, gamora, hero } = heroTable();
    const { state: after } = reveal(state, gamora);
    expect(mustInstance(after, hero).damage).toBe(0);
    expect(mustInstance(after, gamora).exhausted).toBe(true);
    expect(mustInstance(after, gamora).damage).toBe(3 + 1);
  });

  it("the hero defends: exhausted, and its DEF comes off Gamora's ATK", () => {
    const { state, gamora, hero } = heroTable();
    const def = characterProfile(state, hero, deps)!.def;
    const { state: after } = reveal(state, hero);
    expect(mustInstance(after, hero).exhausted).toBe(true);
    expect(mustInstance(after, hero).damage).toBe(Math.max(0, 3 - def));
    expect(mustInstance(after, gamora).damage).toBe(1);
  });

  it("Gamora is not 'an enemy': 'the attacking enemy' names nothing and an enemy-attack defense is never offered", () => {
    const { state, gamora } = heroTable();
    const withPunish = giveCard(state, P1, PUNISH.id).state;
    const { prompts, state: after } = reveal(withPunish, "decline");
    expect(prompts.find((p) => p.kind === "declareDefender")?.attackingEnemy).toEqual([]);
    expect(prompts.some((p) => p.options.some((o) => o.includes("punish.interrupt")))).toBe(false);
    // Only her consequential damage.
    expect(mustInstance(after, gamora).damage).toBe(1);
  });

  const offered = (prompts: readonly { options: readonly string[] }[], id: string): boolean =>
    prompts.some((p) => p.options.some((o) => o.includes(`${id}.ability`)));
  const inHand = (state: GameState, ...ids: string[]): GameState =>
    ids.reduce((s, id) => giveCard(s, P1, id).state, state);

  // Rules expert, 2026-11-15, on ruling 102: a defense against her attack is a real defense, so "after your hero
  // defends" answers it; one "against an enemy attack" does not, as she is no enemy.
  it("the hero defends: 'after your hero defends' answers it, 'against an enemy attack' does not", () => {
    const { state, gamora, hero } = heroTable();
    const {
      prompts,
      state: after,
      events,
    } = reveal(inHand(state, INDOMITABLE.card.id, COUNTER.card.id), hero, ["indomitable"]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "triggerEvent",
        event: expect.objectContaining({ kind: "defended", defenderInstanceId: hero, enemyInstanceId: gamora }),
      }),
    );
    expect(offered(prompts, "indomitable")).toBe(true);
    expect(offered(prompts, "counter")).toBe(false);
    // Indomitable readied the hero the defense exhausted; Counter-Punch dealt Gamora nothing.
    expect(mustInstance(after, hero).exhausted).toBe(false);
    expect(mustInstance(after, gamora).damage).toBe(1);
  });

  it("'the attacking enemy' of a defense names nothing: Gamora is no enemy (ruling 102)", () => {
    const { state, gamora, hero } = heroTable();
    const { prompts, state: after } = reveal(inHand(state, RIPOSTE.card.id), hero, ["riposte"]);
    expect(offered(prompts, "riposte")).toBe(true);
    expect(mustInstance(after, gamora).damage).toBe(1);
  });

  it("a '(defense)' damage prevention answers her attack and makes the hero the defender, an enemy one does not", () => {
    const { state, gamora, hero } = heroTable();
    const {
      prompts,
      state: after,
      events,
    } = reveal(inHand(state, BACKFLIP.card.id, REDIRECT.card.id, INDOMITABLE.card.id), "decline", ["backflip"]);
    expect(offered(prompts, "backflip")).toBe(true);
    expect(offered(prompts, "redirect")).toBe(false);
    expect(identityDamage(after)).toBe(0);
    // RRG 1.8 "Defend, Defense" (p. 15): the "(defense)" ability made the hero the defender, though no basic defense.
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "triggerEvent",
        event: expect.objectContaining({
          kind: "defended",
          defenderInstanceId: hero,
          enemyInstanceId: gamora,
          basic: false,
        }),
      }),
    );
    expect(offered(prompts, "indomitable")).toBe(true);
    expect(mustInstance(after, hero).exhausted).toBe(false);
  });

  // Engine reading (rules expert, 2026-11-15; no source on a non-enemy attack's order): by analogy with RRG 1.8 "Attack
  // (Enemy Activation)" p. 8 and FAQ Spider-Man (#1A) p. 57, "when attacks" interrupts resolve before the Declare
  // Defender step.
  it("a 'when Gamora attacks' interrupt resolves before the defender is asked for", () => {
    const { state, hero } = heroTable();
    const { prompts, state: after } = reveal(inHand(state, WHEN_SHE_ATTACKS.card.id), hero, ["she-attacks"]);
    const interrupt = prompts.findIndex((p) => p.options.some((o) => o.includes("she-attacks.ability")));
    const defend = prompts.findIndex((p) => p.kind === "declareDefender");
    expect(interrupt).toBeGreaterThanOrEqual(0);
    expect(defend).toBeGreaterThan(interrupt);
    // The tough status card it gave was on the hero before the hero defended, and took the attack's damage.
    expect(mustInstance(after, hero).statuses.tough).toBe(0);
    expect(mustInstance(after, hero).damage).toBe(0);
  });

  describe("the defend preview (code review of 130b50f4e)", () => {
    const band = (preview: ReturnType<typeof defendPreview>, optionId: string) => {
      const option = preview?.find((o) => o.optionId === optionId);
      expect(option?.bands).toHaveLength(1);
      return { option: option!, band: option!.bands[0]! };
    };

    it("declining: her ATK to the identity, no defense, no boost", () => {
      const { state } = heroTable();
      const { preview } = reveal(state, "decline");
      const { option, band: outcome } = band(preview, "decline");
      expect(option.defenderInstanceId).toBeNull();
      expect(option.boost.max).toBe(0);
      expect(outcome.damageTaken).toBe(3);
      expect(identityDamage(reveal(state, "decline").state)).toBe(outcome.damageTaken);
    });

    it("the hero: its DEF comes off her ATK, and the preview matches the engine", () => {
      const { state, hero } = heroTable();
      const { preview, state: after } = reveal(state, hero);
      const { option, band: outcome } = band(preview, hero);
      expect(option.defenseReduction).toBe(characterProfile(state, hero, deps)!.def);
      expect(outcome.damageTaken).toBe(mustInstance(after, hero).damage);
    });

    it("Gamora defending herself also takes her consequential damage: the preview says she is defeated", () => {
      const { state, gamora } = heroTable();
      // 1 damage already: her 3 ATK leaves her at 4 of 5, her consequential 1 defeats her (FAQ "Old Rivals (#31)",
      // RRG 1.8 p. 62: "allies always take consequential damage after they attack").
      const hurt: GameState = {
        ...state,
        instances: { ...state.instances, [gamora]: { ...mustInstance(state, gamora), damage: 1 } },
      };
      const { preview, state: after } = reveal(hurt, gamora);
      const { option, band: outcome } = band(preview, gamora);
      expect(option.defenseReduction).toBe(0);
      expect(outcome.damageTaken).toBe(3 + 1);
      expect(outcome.defeated).toBe(true);
      expect(cardsInPlay(after)).not.toContain(gamora);
    });
  });
});
