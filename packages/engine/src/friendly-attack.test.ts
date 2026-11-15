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
import { replay } from "./engine.js";
import type { InstanceId } from "./ids.js";
import { characterProfile, mustInstance, mustPlayer } from "./query.js";
import { resolveRef } from "./select.js";
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
const deps: EngineDeps = depsOf(RIVALS_REVEALED, REVEAL.ability, STUN_GAMORA.ability, PUNISH_ABILITY);

function start(withGamora: boolean): { state: GameState; gamora: InstanceId | null } {
  const base = gameAtFirstTurn({
    cards: [RIVALS, GAMORA, REVEAL.card, STUN_GAMORA.card, PUNISH],
    deps,
    encounter: [RIVALS.id, ...copiesOf(TREACHERY.id, 10)],
    deck: [GAMORA.id, REVEAL.card.id, STUN_GAMORA.card.id, REVEAL.card.id, PUNISH.id],
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
  /** Plays Reveal, answering the defend prompt with `defender` ("decline" for none); records every prompt seen. */
  function reveal(state: GameState, defender: string) {
    const prompts: { kind: string; options: readonly string[]; attackingEnemy: readonly InstanceId[] }[] = [];
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
        return choice.prompt.kind === "declareDefender" ? [defender] : defaultPick(s);
      },
      play,
    );
    const replayed = replay(result.session.log, deps);
    if (!replayed.ok) throw new Error(replayed.error.message);
    expect(replayed.state).toEqual(result.session.state);
    return { ...result, prompts };
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
});
