import { activeEncounterDeckId, type GameEvent, type GameState, type InstanceId } from "@mc/engine";
import { describe, expect, it } from "vitest";
import { conjure, DEPS, intoPlay, rhino } from "../../testing/qa-bench.js";
import { applyOk, firstLegal, identityOf, inst, P1, patchInstance, type Picker } from "../../testing/harness.js";

/**
 * Gamora's Old Rivals attack (22031) against the real card registry. Ruling Oct 26, 2023 (102): "Gamora is not
 * considered 'an enemy' during the attack"; owner decision 2026-11-15 (#525 item 1). Cards that need an enemy attack or
 * "the attacking enemy" ask for an enemy source, so they are not offered / do nothing; "the attacking character"
 * (Electrostatic Armor) still names her.
 */
const COUNTER_PUNCH = "01077";
const COUNTERATTACK = "08030";
const DAREDEVIL = "31014";
const ELECTROSTATIC_ARMOR = "10031";
const GAMORA = "22002";
const OLD_RIVALS = "22031";

/** A Rhino table with the Gamora ally in play and Old Rivals the next encounter card dealt to P1 (Rhino is stunned). */
function table(stunned = true) {
  const base = rhino(3);
  const gamora = intoPlay(base, GAMORA, {}, 2);
  const villain = gamora.state.activeVillainId!;
  // A stunned villain discards the status instead of activating: no attack of his muddies what Old Rivals' answers.
  let state = patchInstance(gamora.state, villain, { statuses: { stunned: stunned ? 1 : 0, confused: 0, tough: 0 } });
  // `rhino` leaves 8 threat on the main scheme: the villain phase's acceleration would complete it.
  state = patchInstance(state, state.mainScheme.instanceId, { threat: 1 });
  const deckId = activeEncounterDeckId(state);
  state = patchInstance(state, state.encounterDecks[deckId]!.deck[0]!, { cardId: OLD_RIVALS as never });
  return { state, gamora: gamora.id, villain };
}

/** `code` as an upgrade attached to P1's hero (staging surgery: no cost, no enter-play). */
function withUpgrade(state: GameState, code: string) {
  const armor = intoPlay(state, code, {}, 3);
  const hero = identityOf(armor.state);
  const attached = patchInstance(patchInstance(armor.state, armor.id, { attachedTo: hero }), hero, {
    attachments: [...inst(armor.state, hero).attachments, armor.id],
  });
  return {
    id: armor.id,
    state: {
      ...attached,
      players: attached.players.map((p) => ({ ...p, playArea: p.playArea.filter((i) => i !== armor.id) })),
    } as GameState,
  };
}

/** Ends P1's turn; `defend` names the defender declared ("decline" for none); `use` the optional abilities taken. */
function reveal(state: GameState, defend: string, use: readonly string[] = []) {
  const offered: string[] = [];
  const pick: Picker = (s) => {
    const choice = s.pendingChoice!;
    offered.push(...choice.options.map((o) => o.optionId as string));
    if (choice.prompt.kind === "declareDefender") {
      const hit = choice.options.find((o) => o.optionId === defend);
      return [hit ? hit.optionId : "decline"];
    }
    const taken = choice.options.find((o) => use.some((u) => (o.optionId as string).includes(u)));
    return taken ? [taken.optionId] : firstLegal(s);
  };
  let current = state;
  const events: GameEvent[] = [];
  const settleOne = () => {
    while (current.pendingChoice && !current.outcome) {
      const choice = current.pendingChoice;
      const r = applyOk(
        current,
        {
          type: "resolveChoice",
          playerId: choice.playerId,
          choiceId: choice.choiceId,
          selectedOptionIds: pick(current),
        },
        DEPS,
      );
      current = r.state;
      events.push(...r.events);
    }
  };
  const r = applyOk(current, { type: "endTurn", playerId: P1 }, DEPS);
  current = r.state;
  events.push(...r.events);
  settleOne();
  return { state: current, events, offered };
}

const offeredAbility = (offered: readonly string[], code: string) => offered.some((o) => o.includes(code));
const attackedBy = (events: readonly GameEvent[], gamora: InstanceId) =>
  events.some((e) => e.type === "damageDealt" && e.sourceInstanceId === gamora);

describe("Old Rivals: cards that need an enemy attack or 'the attacking enemy' (ruling Oct 26, 2023 (102))", () => {
  it("control: Gamora attacks you and the hero is damaged by her", () => {
    const t = table();
    const { events } = reveal(t.state, "decline");
    expect(attackedBy(events, t.gamora)).toBe(true);
  });

  it("control: Counterattack (08030) is offered after Rhino's own attack damages you", () => {
    // Not stunned, so Rhino activates first and attacks; the hero takes his damage and Counterattack answers it.
    const t = table(false);
    const armed = withUpgrade(t.state, COUNTERATTACK);
    const { offered } = reveal(armed.state, "decline");
    expect(offeredAbility(offered, `${COUNTERATTACK}.`)).toBe(true);
  });

  it("Counterattack (08030) is not offered after you take damage from her attack", () => {
    const t = table();
    const armed = withUpgrade(t.state, COUNTERATTACK);
    const { events, offered } = reveal(armed.state, "decline");
    expect(attackedBy(events, t.gamora)).toBe(true);
    expect(offeredAbility(offered, `${COUNTERATTACK}.`)).toBe(false);
  });

  it("control: Counter-Punch (01077) is offered after your hero defends Rhino's attack", () => {
    const t = table(false);
    const given = conjure(t.state, COUNTER_PUNCH);
    const { offered } = reveal(given.state, identityOf(given.state));
    expect(offeredAbility(offered, `${COUNTER_PUNCH}.`)).toBe(true);
  });

  it("Counter-Punch (01077) is not offered after your hero defends her attack", () => {
    const t = table();
    const given = conjure(t.state, COUNTER_PUNCH);
    const hero = identityOf(given.state);
    const { offered, state } = reveal(given.state, hero);
    expect(inst(state, hero).exhausted).toBe(true); // the hero did defend
    expect(offeredAbility(offered, `${COUNTER_PUNCH}.`)).toBe(false);
  });

  it("Daredevil (31014) defending her attack moves no damage and deals none to her", () => {
    const t = table();
    const placed = intoPlay(t.state, DAREDEVIL, {}, 3);
    const { state, events } = reveal(placed.state, placed.id);
    expect(inst(state, placed.id).exhausted).toBe(true); // he did defend
    expect(events.some((e) => e.type === "damageHealed" && e.targetInstanceId === placed.id)).toBe(false);
    expect(events.some((e) => e.type === "damageDealt" && e.sourceInstanceId === placed.id)).toBe(false);
  });

  it("Electrostatic Armor (10031), 'the attacking character', still deals 1 damage to her", () => {
    const t = table();
    const armor = withUpgrade(t.state, ELECTROSTATIC_ARMOR);
    const hero = identityOf(armor.state);
    const staged = armor.state;
    const { state, events } = reveal(staged, hero, [`${ELECTROSTATIC_ARMOR}.`]);
    expect(inst(state, hero).exhausted).toBe(true);
    // 1 more than the same defense without the armor.
    const control = reveal(t.state, hero);
    expect(inst(state, t.gamora).damage).toBe(inst(control.state, t.gamora).damage + 1);
    expect(events.some((e) => e.type === "damageDealt" && e.targetInstanceId === t.gamora)).toBe(true);
  });

  it("is deterministic: the same staged table reaches the same state", () => {
    const t = table();
    const r = reveal(t.state, "decline");
    expect(r.state.pendingChoice).toBeNull();
    expect(reveal(t.state, "decline").state).toEqual(r.state);
  });
});
