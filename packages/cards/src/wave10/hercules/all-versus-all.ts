import type { AbilityRegistry } from "@mc/engine";
import {
  after,
  anyOfCards,
  atMost,
  attacksGainKeywords,
  cards,
  chosen,
  constant,
  defineAbilities,
  encounterCards,
  encounterSetAside,
  exists,
  find,
  forcedResponse,
  ifThen,
  moveCards,
  not,
  placeThreat,
  query,
  refCount,
  revealCard,
  selectCards,
  self,
  shuffleEncounterDeck,
  theMainScheme,
  valueAtLeast,
  whenDefeated,
  you,
} from "../../dsl/index.js";

const ALL_VERSUS_ALL = query("sideScheme", { name: "All Versus All" });

/**
 * "Find the All Versus All side scheme and reveal it." (Hecate, Roving Mobs). Find searches the encounter discard pile,
 * the encounter deck and the set-aside area (RRG 1.8 "Find", p. 19; the scheme sets itself aside when defeated). The
 * deck is shuffled after the search, also when nothing is found (RRG "Search", p. 39). Already in play it is found
 * where it is and nothing is revealed (docs/phase7-wave10-hero-packs.md section 3.4, wave 9 section 3.63).
 */
const findAndRevealAllVersusAll = () =>
  ifThen(not(exists(ALL_VERSUS_ALL)), [
    selectCards(
      "ava",
      atMost(1, anyOfCards(encounterCards(["discard", "deck"], ALL_VERSUS_ALL), encounterSetAside(ALL_VERSUS_ALL))),
    ),
    ifThen(valueAtLeast(refCount(chosen("ava")), 1), revealCard(chosen("ava"), you)),
    shuffleEncounterDeck(),
  ]);

/**
 * Modular encounter set `all_versus_all` (Hercules pack; docs/phase7-wave10-hero-packs.md H3.4, H7.4, H8.4 line HS16).
 * Hinder 2[per_hero] on All Versus All, Retaliate and Toughness on Kyknos and Victory 0 on Kyknos and Roving Mobs are
 * data keywords.
 *
 * **All Versus All (59041)**: Forced Response: after any character is defeated, 2 threat is placed on it. When
 * Defeated: it is set aside (the set-aside pile Hecate and Roving Mobs find it in), not discarded.
 *
 * **Hecate (59042)**: Forced Response: after she activates, 2 threat on the All Versus All side scheme (nothing when it
 * is not in play). Her When Revealed/Defeated (data refs 59042.when-revealed and 59042.when-defeated) is NOT scripted: see the skipped map.
 *
 * **Kyknos (59043)**: Forced Response: after he activates, 2 threat on All Versus All; otherwise 1 threat on the main
 * scheme (RRG 1.8 "Otherwise", p. 31: the second half only when the first could not be done, here with no All Versus
 * All in play).
 *
 * **Bewitched Officer (59044)**: its own attacks gain piercing and ranged.
 *
 * **Roving Mobs (59045)**: When Defeated: find the All Versus All side scheme and reveal it.
 *
 * Cards (5):
 * - 59041 All Versus All (side_scheme)
 * - 59042 Hecate (minion)
 * - 59043 Kyknos (minion)
 * - 59044 Bewitched Officer (minion)
 * - 59045 Roving Mobs (side_scheme)
 */
export const HERCULES_ALL_VERSUS_ALL: AbilityRegistry = defineAbilities({
  "59041.all-versus-all-forced-response": forcedResponse(after.defeated(query("character")), placeThreat(2, self)),
  "59041.when-defeated": whenDefeated(moveCards(cards(self), "encounterSetAside")),

  "59042.hecate-forced-response": forcedResponse(
    after.enemyActivates("self"),
    ifThen(exists(ALL_VERSUS_ALL), placeThreat(2, find(ALL_VERSUS_ALL))),
  ),

  "59043.kyknos-forced-response": forcedResponse(
    after.enemyActivates("self"),
    ifThen(exists(ALL_VERSUS_ALL), placeThreat(2, find(ALL_VERSUS_ALL)), placeThreat(1, theMainScheme)),
  ),

  "59044.bewitched-officer-constant": constant(
    attacksGainKeywords(["piercing", "ranged"], { attacker: { self: true } }),
  ),

  "59045.when-defeated": whenDefeated(findAndRevealAllVersusAll()),
});

/** Refs of this module's cards deliberately left unscripted, each with its written reason. Delete a line as its ref is scripted. */
export const HERCULES_ALL_VERSUS_ALL_SKIPPED: Readonly<Record<string, string>> = {
  "59042.when-revealed":
    "wave 10 scripting in progress: hercules/all-versus-all - split from 59042.hecate-constant; the body is the same find-and-reveal as Roving Mobs 59045",
  "59042.when-defeated":
    "wave 10 scripting in progress: hercules/all-versus-all - split from 59042.hecate-constant; the body is the same find-and-reveal as Roving Mobs 59045",
};
