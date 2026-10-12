/**
 * docs/phase7-wave10.md §3.17: "uses their ATK to attack and damage" (`attack.usesAtk`, `dealDamage.usesAtk`,
 * `attackUsedAtk()`), in a real Resistance: Captain America game with Cap's Shield 56143 on the leader: "Attached
 * character gains retaliate 1 … Forced Response: After a hero or the Captain America leader uses their ATK to attack
 * and damage attached character, attach Cap's Shield to the attacker." The Shield's two abilities are registered
 * here, written as the leader's module can write them (§3.18's "lose piercing" has its own test).
 *
 * Rulings: December 17, 2025 (2) #3 (a flat "Deal # damage" attack ability does not use ATK; "damage … equal to your
 * ATK" does); January 11, 2026 (1) and (2) (overkill damage from an attack that used ATK triggers it, although
 * Captain America was not the target); January 17, 2026 (3) #2 (a keyword, here retaliate, resolves before a
 * triggered ability). The seat is the Tigra precon: Tigra's ATK is 2, Sharp Claws 56005 gives a basic attack +1 ATK
 * and overkill, Tooth and Claw 56008 is "Hero Action (attack): Deal 4 damage to an enemy. Deal 4 damage to an enemy."
 */

import type { Command, GameState, InstanceId } from "@mc/engine";
import { describe, expect, it, vi } from "vitest";
import {
  P1,
  endTurn,
  identityOf,
  inst,
  moveToHand,
  patchInstance,
  payWith,
  play,
  stackEncounterDeck,
} from "../testing/harness.js";
import { codeOf } from "../wave9/testing.js";
import { WAVE10_DEPS, engageMinion, stagedInPlay } from "../wave10/testing.js";
import { forcedResponse, heroAction, on } from "./abilities.js";
import { attack, attackAnEnemy, dealDamage } from "./effects.js";
import { validateDefinition } from "./validate.js";
import { attackUsedAtk, chosen, query, readsAtkOf, self, statOf, sum, theVillain, yourIdentity } from "./values.js";
import {
  SHIELD_CONSTANT,
  SHIELD_RESPONSE,
  choosing,
  depsWith,
  drive,
  leaderOf,
  shieldGame,
  shieldOf,
  withShieldOn,
  withTough,
} from "./wave10-caps-shield.testing.js";

vi.setConfig({ testTimeout: 120_000 });

const CLAWS = "56005";
const CLAWS_INTERRUPT = "56005.sharp-claws-interrupt";
const TOOTH = "56008";
const TOOTH_ACTION = "56008.tooth-and-claw-action";
const MODOK = "01184"; // Core minion, 8 hit points
const ADVANCE = "01186"; // Standard set: no boost icon, no Boost ability
const DEFEND = "56193"; // Defend Hell's Kitchen, a side scheme of the Hell's Kitchen set
const FEARLESS = "56149"; // Fearless Determination, Captain America's side scheme (amplify icon)

/**
 * Cap's Shield as the Captain America module scripts it ("Attached character gains retaliate 1 …"; "Forced Response:
 * After a hero or the Captain America leader uses their ATK to attack and damage attached character, attach Cap's
 * Shield to the attacker." After the attack, so the attached character's retaliate has answered; the damage is read per
 * character, so overkill onto the attached character counts). The real registry is used, not a copy.
 */
const CONSTANT = WAVE10_DEPS.abilities[SHIELD_CONSTANT]!;
const RESPONSE = WAVE10_DEPS.abilities[SHIELD_RESPONSE]!;
const SHIELD_ABILITIES = { [SHIELD_CONSTANT]: CONSTANT, [SHIELD_RESPONSE]: RESPONSE };
const DEPS = depsWith(SHIELD_ABILITIES);
/** Tooth and Claw rewritten to read ATK: "Hero Action (attack): Deal damage to an enemy equal to your ATK." */
const DEPS_ATK_EVENT = depsWith({
  ...SHIELD_ABILITIES,
  [TOOTH_ACTION]: heroAction({ label: "attack" }, attackAnEnemy(statOf(yourIdentity, "atk"))),
});

const hero = (s: GameState) => identityOf(s, P1);
const damage = (s: GameState, id: InstanceId) => inst(s, id).damage;
const basicAttack = (s: GameState, target: InstanceId): Command => ({
  type: "basicAttack",
  playerId: P1,
  attackerInstanceId: hero(s),
  targetInstanceId: target,
});
/** Tooth and Claw in hand and the command playing it (cost 4 with no minion engaged). */
function tooth(state: GameState) {
  const given = moveToHand(state, P1, TOOTH);
  const [id] = given.ids as [InstanceId];
  return { state: given.state, command: play(P1, id, payWith(given.state, P1, 4, [id])) };
}

describe("§3.17 the DSL surface", () => {
  it("`attack` marks an amount that reads the attacker's ATK, and only that", () => {
    expect(attack(statOf(yourIdentity, "atk"), theVillain)).toMatchObject({ kind: "attack", usesAtk: true });
    expect(attack(sum(statOf(yourIdentity, "atk"), 2), theVillain)).toMatchObject({ usesAtk: true });
    expect(attack(4, theVillain)).not.toHaveProperty("usesAtk");
    expect(attack(statOf(yourIdentity, "thw"), theVillain)).not.toHaveProperty("usesAtk");
    // Another character's ATK on your hero's attack is not "their ATK"; it is when that character is the attacker.
    expect(attack(statOf(chosen("ally"), "atk"), theVillain)).not.toHaveProperty("usesAtk");
    expect(attack(statOf(chosen("ally"), "atk"), theVillain, { attacker: chosen("ally") })).toMatchObject({
      usesAtk: true,
    });
    expect(attack(4, theVillain, { usesAtk: true })).toMatchObject({ usesAtk: true });
    expect(attack(statOf(yourIdentity, "atk"), theVillain, { usesAtk: false })).not.toHaveProperty("usesAtk");
  });

  it("`dealDamage` marks an amount that reads your identity's ATK", () => {
    expect(dealDamage(statOf(yourIdentity, "atk"), theVillain)).toMatchObject({ kind: "dealDamage", usesAtk: true });
    expect(dealDamage(2, theVillain)).not.toHaveProperty("usesAtk");
    expect(dealDamage(statOf(self, "atk"), theVillain)).not.toHaveProperty("usesAtk");
    // An instruction kept out of the attack is no attack's damage, so it is not marked.
    expect(dealDamage(statOf(yourIdentity, "atk"), theVillain, { fromAttack: false })).not.toHaveProperty("usesAtk");
    expect(readsAtkOf(sum(1, statOf(yourIdentity, "atk")), yourIdentity)).toBe(true);
    expect(readsAtkOf(3, yourIdentity)).toBe(false);
  });

  it("`attackUsedAtk()` is the predicate, and the Shield's abilities are valid definitions", () => {
    expect(attackUsedAtk()).toEqual({ kind: "attackUsedAtk" });
    for (const definition of [CONSTANT, RESPONSE]) expect(validateDefinition(definition)).toEqual([]);
  });

  it("the validator refuses the predicate away from damage and attacks, and a mark on damage that is no attack's", () => {
    const refused =
      "attackUsedAtk reads the damage or attack an ability answers: only in an interrupt or response on dealDamage, attack, enemyAttack or enemyAttacksEnemy";
    expect(validateDefinition(heroAction({ while: attackUsedAtk() }, dealDamage(1, theVillain)))).toEqual([refused]);
    expect(
      validateDefinition(forcedResponse(on.defeated(query("minion")), { while: attackUsedAtk() }, dealDamage(1, self))),
    ).toEqual([refused]);
    expect(
      validateDefinition(
        forcedResponse(
          on.damage(query("villain"), { fromAttack: true, taken: true }),
          { while: attackUsedAtk() },
          dealDamage(1, self),
        ),
      ),
    ).toEqual([]);
    expect(
      validateDefinition(
        heroAction(dealDamage(statOf(yourIdentity, "atk"), theVillain, { fromAttack: false, usesAtk: true })),
      ),
    ).toEqual(["dealDamage: usesAtk marks an attack's damage; this instruction is fromAttack: false"]);
  });
});

describe("Cap's Shield (56143) on Captain America, attacked by Tigra (ATK 2)", () => {
  it("a basic attack: 2 damage, retaliate 1 hits Tigra, and the Shield moves to her", () => {
    const state = shieldGame(DEPS);
    const leader = leaderOf(state);
    const { state: after } = drive(DEPS, state, basicAttack(state, leader));
    expect(damage(after, leader)).toBe(damage(state, leader) + 2);
    expect(damage(after, hero(after))).toBe(1);
    expect(inst(after, shieldOf(after)).attachedTo).toBe(hero(after));
    expect(inst(after, leader).attachments).not.toContain(shieldOf(after));
    expect(inst(after, hero(after)).attachments).toContain(shieldOf(after));
  });

  it("Tooth and Claw, a flat 4 and 4: 8 damage, one retaliate, and the Shield stays", () => {
    const base = shieldGame(DEPS);
    const leader = leaderOf(base);
    const { state, command } = tooth(base);
    const { state: after } = drive(DEPS, state, command, choosing({ targets: [leader] }));
    expect(damage(after, leader)).toBe(damage(base, leader) + 8);
    expect(damage(after, hero(after))).toBe(1);
    expect(inst(after, shieldOf(after)).attachedTo).toBe(leader);
  });

  it("an attack event dealing damage equal to your ATK: 2 damage and the Shield moves", () => {
    const base = shieldGame(DEPS_ATK_EVENT);
    const leader = leaderOf(base);
    const { state, command } = tooth(base);
    const { state: after } = drive(DEPS_ATK_EVENT, state, command, choosing({ targets: [leader] }));
    expect(damage(after, leader)).toBe(damage(base, leader) + 2);
    expect(damage(after, hero(after))).toBe(1);
    expect(inst(after, shieldOf(after)).attachedTo).toBe(hero(after));
  });

  it("overkill: Sharp Claws' 3 ATK defeats a minion with 1 hit point left, 2 reaches Captain America, the Shield moves", () => {
    const claws = stagedInPlay(shieldGame(DEPS), CLAWS, { attach: true });
    const state = patchInstance(engageMinion(claws.state, MODOK, "target"), "target" as InstanceId, { damage: 7 });
    const leader = leaderOf(state);
    const pick = choosing({ accept: [CLAWS_INTERRUPT], label: /overkill/i });
    const { state: after } = drive(DEPS, state, basicAttack(state, "target" as InstanceId), pick);
    expect(inst(after, "target" as InstanceId).engagedWith ?? null).toBeNull();
    expect(damage(after, leader)).toBe(damage(state, leader) + 2);
    // Captain America was not attacked, so his retaliate does not answer (RRG 1.8 "Overkill", p. 31).
    expect(damage(after, hero(after))).toBe(0);
    expect(inst(after, shieldOf(after)).attachedTo).toBe(hero(after));
  });

  it("a tough status card absorbs the basic attack: no damage, no move; he still retaliates", () => {
    const base = shieldGame(DEPS);
    const leader = leaderOf(base);
    const state = withTough(base, leader, 1);
    const { state: after } = drive(DEPS, state, basicAttack(state, leader));
    expect(damage(after, leader)).toBe(damage(state, leader));
    expect(inst(after, leader).statuses.tough).toBe(0);
    expect(damage(after, hero(after))).toBe(1);
    expect(inst(after, shieldOf(after)).attachedTo).toBe(leader);
  });
});

describe("Cap's Shield (56143) on Tigra, attacked by Captain America", () => {
  it("his attack damages her: her retaliate 1 hits him, then the Shield returns to him", () => {
    const base = shieldGame(DEPS, { modularSetIds: ["new_avengers", "defenders", "hells_kitchen"] });
    const leader = leaderOf(base);
    // The villain phase on a stacked deck: a boost card with no icon and no ability, then a side scheme dealt.
    const state = stackEncounterDeck(withShieldOn(base, hero(base)), ADVANCE, DEFEND);
    const { state: after, events } = drive(DEPS, state, endTurn(P1));
    const attacks = events.filter((e) => e.type === "attackResolved" && e.enemyInstanceId === leader);
    // Fearless Determination 56149, the leader's side scheme, is in play from setup: its amplify icon adds a boost icon.
    expect(state.villainArea.map((id) => codeOf(state, id))).toContain(FEARLESS);
    expect(attacks).toMatchObject([{ targetInstanceId: hero(state), baseAtk: 2, boostIcons: 1, damageDealt: 3 }]);
    expect(damage(after, hero(after))).toBe(3);
    expect(damage(after, leader)).toBe(damage(state, leader) + 1);
    expect(inst(after, shieldOf(after)).attachedTo).toBe(leader);
  });
});
