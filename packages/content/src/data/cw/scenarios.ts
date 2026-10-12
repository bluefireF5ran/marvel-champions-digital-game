// GENERATED FILE — do not edit by hand.
// Source: MarvelCDB public API https://marvelcdb.com/api/public/cards/cw (fetched 2026-09-13; raw cache: packages/content/raw/marvelcdb/cw.json).
// Hand corrections / curated data: packages/content/scripts/marvelcdb/curation/cw.ts
// Regenerate: pnpm --filter @mc/content ingest -- --pack cw [--offline]

import { cardId, encounterSetId, scenarioId, setCode } from "../../schema/index.js";
import type { Scenario } from "../../schema/index.js";

/** registration-iron-man: MC56 p. 7: "Leader Deck: Iron Man (I), Iron Man (II) ... (III), (IV) for expert mode. Main Scheme Deck: Cut Off Support (1B), Negative Zone Prison (2B). Encounter Deck: Iron Man, Mighty Avengers, The Initiative, Maria Hill, Dangerous Recruits, and Standard encounter sets." Each set can be removed and added to other scenarios of the same side (MC56 p. 4). Survey section 4.; registration-captain-marvel: MC56 p. 7: "Leader Deck: Captain Marvel (I), Captain Marvel (II) ... (III), (IV) for expert mode. Main Scheme Deck: S.H.I.E.L.D. Recruits (1B), Hunting Rebel Heroes (2B). Encounter Deck: Captain Marvel, Cape-Killer, Martial Law, Heroes for Hire, Paladin, and Standard encounter sets." (The page spells the set "Cape-Killer" and, in its footnote, "Cape-Killers"; the set is `cape_killer`, "Cape-Killer".) Survey section 4.; resistance-captain-america: MC56 p. 8: "Leader Deck: Captain America (I), Captain America (II) ... (III), (IV) for expert mode. Main Scheme Deck: Gathering Support (1B), Secret Avengers (2B). Encounter Deck: Captain America, New Avengers, Secret Avengers, Namor, Atlanteans, and Standard encounter sets." (The main scheme 56142b and the modular set `secret_avengers` share a title.) Survey section 4.; resistance-spider-woman: MC56 p. 8: "Leader Deck: Spider-Woman (I), Spider-Woman (II) ... (III), (IV) for expert mode. Main Scheme Deck: Open Rebellion (1B), Neighborhood Protectors (2B). Encounter Deck: Spider-Woman, Spider-Man, Defenders, Hell's Kitchen, Cloak & Dagger, and Standard encounter sets." Survey section 4. */
export const CW_SCENARIOS: readonly Scenario[] = [
  {
    id: scenarioId("registration-iron-man"),
    name: "Registration: Iron Man",
    packCode: setCode("cw"),
    villainCardId: cardId("56059"),
    mainSchemeCardId: cardId("56063a"),
    encounterSetIds: [encounterSetId("iron_man_leader")],
    recommendedModularSetIds: [
      encounterSetId("mighty_avengers"),
      encounterSetId("the_initiative"),
      encounterSetId("maria_hill_modular"),
      encounterSetId("dangerous_recruits"),
    ],
    standardEncounterSetIds: [encounterSetId("standard")],
    expertEncounterSetIds: [encounterSetId("expert")],
    villainStages: { standard: [1, 2], expert: [3, 4] },
    modularSetCount: 4,
    modularSetCountRange: { min: 3, max: 4 },
    side: "registration",
    mainSchemeStages: { recommended: [cardId("56063b"), cardId("56064b")] },
  },
  {
    id: scenarioId("registration-captain-marvel"),
    name: "Registration: Captain Marvel",
    packCode: setCode("cw"),
    villainCardId: cardId("56092"),
    mainSchemeCardId: cardId("56063a"),
    encounterSetIds: [encounterSetId("captain_marvel_leader")],
    recommendedModularSetIds: [
      encounterSetId("cape_killer"),
      encounterSetId("martial_law"),
      encounterSetId("heroes_for_hire"),
      encounterSetId("paladin"),
    ],
    standardEncounterSetIds: [encounterSetId("standard")],
    expertEncounterSetIds: [encounterSetId("expert")],
    villainStages: { standard: [1, 2], expert: [3, 4] },
    modularSetCount: 4,
    modularSetCountRange: { min: 3, max: 4 },
    side: "registration",
    mainSchemeStages: { recommended: [cardId("56096b"), cardId("56097b")] },
  },
  {
    id: scenarioId("resistance-captain-america"),
    name: "Resistance: Captain America",
    packCode: setCode("cw"),
    villainCardId: cardId("56137"),
    mainSchemeCardId: cardId("56141a"),
    encounterSetIds: [encounterSetId("captain_america_leader")],
    recommendedModularSetIds: [
      encounterSetId("new_avengers"),
      encounterSetId("secret_avengers"),
      encounterSetId("namor_modular"),
      encounterSetId("atlanteans"),
    ],
    standardEncounterSetIds: [encounterSetId("standard")],
    expertEncounterSetIds: [encounterSetId("expert")],
    villainStages: { standard: [1, 2], expert: [3, 4] },
    modularSetCount: 4,
    modularSetCountRange: { min: 3, max: 4 },
    side: "resistance",
    mainSchemeStages: { recommended: [cardId("56141b"), cardId("56142b")] },
  },
  {
    id: scenarioId("resistance-spider-woman"),
    name: "Resistance: Spider-Woman",
    packCode: setCode("cw"),
    villainCardId: cardId("56168"),
    mainSchemeCardId: cardId("56141a"),
    encounterSetIds: [encounterSetId("spider_woman_leader")],
    recommendedModularSetIds: [
      encounterSetId("spider_man_modular"),
      encounterSetId("defenders"),
      encounterSetId("hells_kitchen"),
      encounterSetId("cloak_and_dagger_modular"),
    ],
    standardEncounterSetIds: [encounterSetId("standard")],
    expertEncounterSetIds: [encounterSetId("expert")],
    villainStages: { standard: [1, 2], expert: [3, 4] },
    modularSetCount: 4,
    modularSetCountRange: { min: 3, max: 4 },
    side: "resistance",
    mainSchemeStages: { recommended: [cardId("56172b"), cardId("56173b")] },
  },
];
