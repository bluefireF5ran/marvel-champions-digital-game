import { trait } from "@mc/content";
import type { AbilityRegistry } from "@mc/engine";
import {
  YOUR_IDENTITY,
  atEndOfAttack,
  attachCard,
  attackInProgress,
  attacksGainKeywords,
  chooseTarget,
  chosen,
  constant,
  coveredByEngineRule,
  defineAbilities,
  draw,
  exists,
  findCard,
  forcedInterrupt,
  gainsKeyword,
  gainsTrait,
  gets,
  heal,
  ifThen,
  on,
  onlyThwartsRemoveThreat,
  placeThreat,
  query,
  removeCountersFrom,
  response,
  retargetAttack,
  self,
  takesDamageOnlyFromAttacks,
  whenRevealed,
  you,
} from "../../../dsl/index.js";

const ELITE = trait("ELITE");
const HERCULES = query("identity", { name: "Hercules" });
const ATTACHED_MINION = query("minion", { hostOfSelf: true });
const ATTACHED_SCHEME = query("sideScheme", { hostOfSelf: true });
const YOUR_ALLIES = query("ally", { controller: "you" });

/** "Response: After this card enters play, draw 4 cards." (the three Gift cards) */
const drawFour = () => response(on.entersPlay("self"), draw(4));

/**
 * Wave 10 scripting module `hercules/hercules/gift-labor` (docs/phase7-wave10-hero-packs.md H3.2 to H3.8, H8.4 line
 * HS10).
 *
 * Cards (6):
 * - 59002 Defeat the Hydra (attachment)
 * - 59003 Embody Pathos (attachment)
 * - 59004 Protect Humanity (obligation)
 * - 59005 Nemean Lion Skin (upgrade)
 * - 59006 Shield of Perseus (upgrade)
 * - 59007 Sword of Peleus (upgrade)
 *
 * The Labor cards are encounter cards the Hercules player owns and the scenario controls (the pack insert, the only
 * source of the Labor and Gift rules: docs/phase7-wave10-sources.md section 3). Victory 0, Uses (3 labor counters) and
 * where each card goes when it leaves play are data and engine rules: to the victory display when its minion or scheme
 * is defeated or its last labor counter is removed (RRG 1.8 "Victory X", p. 46), otherwise to the bottom of the Labor
 * deck. A Labor card with no valid target (question 3 = B, RRG 1.8 FAQ p. 65; March 6, 2026 - Ruling 3 (2): Lernean
 * Hydra dealt facedown as a boost card cannot be found) never attaches, so it is discarded (logged as discarded) and
 * ends on the bottom of the Labor deck, with no Gift earned.
 *
 * **59002.defeat-the-hydra-constant**: "Attached minion gets +6 hit points and gains the Elite trait. Attached minion
 * cannot take damage except from Hercules's attacks." Damage that is not from an attack is blocked too (wave 6 section
 * 4.1 Q17): only an attack by the Hercules identity (basic, or an attack event or upgrade of his) hurts it.
 * **59002.when-revealed**: "Find a non-Elite minion with at least 6 printed hit points. Reveal it, heal all damage from
 * it, and attach this card to it." The find reaches every area but facedown encounter cards in play, so Hercules's
 * set-aside Lernean Hydra is always a candidate; a minion already in play is engaged by the Hercules player, keeps its
 * attachments and tokens and loses its damage (RRG 1.8 "Find", p. 19).
 *
 * **59003.embody-pathos-constant**: "Attached side scheme gains assault. Threat cannot be removed from attached scheme
 * except by Hercules's thwarts." Assault (RRG 1.8 p. 8) makes a basic thwart against the scheme use ATK, so Hercules's
 * basic thwart removes his ATK 3, not his THW 1 (the spec's H3.6 figure of 7 left from 8 threat is wrong: it is 5).
 * An unlabeled removal, another player's thwart, an ally's thwart and an encounter card's removal are all barred.
 * **59003.when-revealed**: "Find an encounter side scheme that is not in play and reveal it, treating each per-player
 * icon on it as 1, and attach this card to it. Place 6 additional threat on it." Owner's answer to question 19 = A: the
 * reading covers only the reveal (starting threat, hinder, the scheme's When Revealed); a later ability of the scheme
 * reads the real per-player count. A set-aside side scheme is a candidate (June 2, 2026 - Ruling 2 (3)).
 *
 * **59004.obligation**: that it is dealt to the revealing player's play area and stays there is the engine's rule for
 * an obligation (RRG 1.8 "Reveal", p. 38); it has no text of its own. **59004.when-revealed**: "Find Amadeus Cho and
 * put him into play", under Hercules's control; the decks searched are shuffled.
 * **59004.protect-humanity-forced-interrupt**: "When the villain would attack Hercules, choose 1 of your allies. The
 * villain attacks that ally instead. After that attack resolves, if Hercules defended, remove 1 labor counter from
 * here." February 20, 2026 - Ruling 3: with no ally in play nothing is redirected and no counter is removed, however
 * Hercules defends; "that attack" is the attack redirected against the ally. The last counter removed puts the card
 * in the victory display (Uses plus Victory 0, RRG 1.8 "Victory X", p. 46).
 *
 * **59005 to 59007**: Permanent, and Restricted on the Sword, are data keywords. Each Gift's constant is a bonus to the
 * Hercules identity in either form; each Response draws 4 cards when the card enters play (put into play by Atonement,
 * not played). **59007** gives his basic attacks piercing; an attack event of his does not gain it.
 */
export const HERCULES_GIFT_LABOR: AbilityRegistry = defineAbilities({
  "59002.defeat-the-hydra-constant": constant(
    gets("hp", 6, ATTACHED_MINION),
    gainsTrait(ELITE, ATTACHED_MINION),
    takesDamageOnlyFromAttacks(ATTACHED_MINION, { attacker: HERCULES }),
  ),
  "59002.when-revealed": whenRevealed(
    findCard(query("minion", { withoutTrait: ELITE, not: { maxPrintedHp: 5 } }), "reveal", {
      choose: true,
      bind: "minion",
    }),
    heal(99, chosen("minion")),
    attachCard(self, chosen("minion")),
  ),

  "59003.embody-pathos-constant": constant(
    gainsKeyword({ name: "assault" }, ATTACHED_SCHEME),
    onlyThwartsRemoveThreat(ATTACHED_SCHEME, HERCULES),
  ),
  "59003.when-revealed": whenRevealed(
    findCard(query("sideScheme", { controller: "encounter" }), "reveal", {
      choose: true,
      outOfPlay: true,
      bind: "scheme",
      perPlayerAs: 1,
    }),
    attachCard(self, chosen("scheme")),
    placeThreat(6, chosen("scheme")),
  ),

  "59004.obligation": coveredByEngineRule(),
  "59004.when-revealed": whenRevealed(findCard({ name: "Amadeus Cho" }, "play", { owner: you })),
  "59004.protect-humanity-forced-interrupt": forcedInterrupt(
    on.villainAttacks({ againstYou: true }),
    ifThen(exists(YOUR_ALLIES), [
      chooseTarget("ally", YOUR_ALLIES),
      retargetAttack(chosen("ally")),
      atEndOfAttack(ifThen(attackInProgress({ defender: HERCULES }), removeCountersFrom(self, "labor", 1))),
    ]),
  ),

  "59005.nemean-lion-skin-constant": constant(
    gets("hp", 2, YOUR_IDENTITY),
    gainsKeyword({ name: "steady" }, YOUR_IDENTITY),
  ),
  "59005.nemean-lion-skin-response": drawFour(),

  "59006.shield-of-perseus-constant": constant(
    gets("hp", 1, YOUR_IDENTITY),
    gainsKeyword({ name: "retaliate", value: 1 }, YOUR_IDENTITY),
  ),
  "59006.shield-of-perseus-response": drawFour(),

  "59007.sword-of-peleus-constant": constant(
    gets("hp", 1, YOUR_IDENTITY),
    attacksGainKeywords(["piercing"], { attacker: YOUR_IDENTITY, basicOnly: true }),
  ),
  "59007.sword-of-peleus-response": drawFour(),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. None. */
export const HERCULES_GIFT_LABOR_SKIPPED: Readonly<Record<string, string>> = {};
