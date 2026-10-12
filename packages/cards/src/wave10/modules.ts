import type { AbilityRegistry } from "@mc/engine";
import { TIGRA_IDENTITY, TIGRA_IDENTITY_SKIPPED } from "./cw/tigra/identity.js";
import { TIGRA_EVENTS, TIGRA_EVENTS_SKIPPED } from "./cw/tigra/events.js";
import {
  TIGRA_SUPPORT_UPGRADES_ALLIES,
  TIGRA_SUPPORT_UPGRADES_ALLIES_SKIPPED,
} from "./cw/tigra/support-upgrades-allies.js";
import { TIGRA_OBLIGATION_NEMESIS, TIGRA_OBLIGATION_NEMESIS_SKIPPED } from "./cw/tigra/obligation-nemesis.js";
import { HULKLING_IDENTITY, HULKLING_IDENTITY_SKIPPED } from "./cw/hulkling/identity.js";
import { HULKLING_EVENTS, HULKLING_EVENTS_SKIPPED } from "./cw/hulkling/events.js";
import {
  HULKLING_SUPPORT_UPGRADES_ALLIES,
  HULKLING_SUPPORT_UPGRADES_ALLIES_SKIPPED,
} from "./cw/hulkling/support-upgrades-allies.js";
import { HULKLING_OBLIGATION_NEMESIS, HULKLING_OBLIGATION_NEMESIS_SKIPPED } from "./cw/hulkling/obligation-nemesis.js";
import { ASPECT_BASIC_AGGRESSION, ASPECT_BASIC_AGGRESSION_SKIPPED } from "./cw/aspect-basic/aggression.js";
import { ASPECT_BASIC_PROTECTION, ASPECT_BASIC_PROTECTION_SKIPPED } from "./cw/aspect-basic/protection.js";
import { ASPECT_BASIC_BASIC, ASPECT_BASIC_BASIC_SKIPPED } from "./cw/aspect-basic/basic.js";
import { MAIN_SCHEMES_REGISTRATION, MAIN_SCHEMES_REGISTRATION_SKIPPED } from "./cw/main-schemes/registration.js";
import { MAIN_SCHEMES_RESISTANCE, MAIN_SCHEMES_RESISTANCE_SKIPPED } from "./cw/main-schemes/resistance.js";
import { LEADERS_IRON_MAN, LEADERS_IRON_MAN_SKIPPED } from "./cw/leaders/iron-man.js";
import { LEADERS_CAPTAIN_MARVEL, LEADERS_CAPTAIN_MARVEL_SKIPPED } from "./cw/leaders/captain-marvel.js";
import { LEADERS_CAPTAIN_AMERICA, LEADERS_CAPTAIN_AMERICA_SKIPPED } from "./cw/leaders/captain-america.js";
import { LEADERS_SPIDER_WOMAN, LEADERS_SPIDER_WOMAN_SKIPPED } from "./cw/leaders/spider-woman.js";
import { MODULAR_MIGHTY_AVENGERS, MODULAR_MIGHTY_AVENGERS_SKIPPED } from "./cw/modular/mighty-avengers.js";
import { MODULAR_THE_INITIATIVE, MODULAR_THE_INITIATIVE_SKIPPED } from "./cw/modular/the-initiative.js";
import { MODULAR_MARIA_HILL, MODULAR_MARIA_HILL_SKIPPED } from "./cw/modular/maria-hill.js";
import { MODULAR_DANGEROUS_RECRUITS, MODULAR_DANGEROUS_RECRUITS_SKIPPED } from "./cw/modular/dangerous-recruits.js";
import { MODULAR_CAPE_KILLER, MODULAR_CAPE_KILLER_SKIPPED } from "./cw/modular/cape-killer.js";
import { MODULAR_MARTIAL_LAW, MODULAR_MARTIAL_LAW_SKIPPED } from "./cw/modular/martial-law.js";
import { MODULAR_HEROES_FOR_HIRE, MODULAR_HEROES_FOR_HIRE_SKIPPED } from "./cw/modular/heroes-for-hire.js";
import { MODULAR_PALADIN, MODULAR_PALADIN_SKIPPED } from "./cw/modular/paladin.js";
import { MODULAR_NEW_AVENGERS, MODULAR_NEW_AVENGERS_SKIPPED } from "./cw/modular/new-avengers.js";
import { MODULAR_SECRET_AVENGERS, MODULAR_SECRET_AVENGERS_SKIPPED } from "./cw/modular/secret-avengers.js";
import { MODULAR_NAMOR, MODULAR_NAMOR_SKIPPED } from "./cw/modular/namor.js";
import { MODULAR_ATLANTEANS, MODULAR_ATLANTEANS_SKIPPED } from "./cw/modular/atlanteans.js";
import { MODULAR_SPIDER_MAN, MODULAR_SPIDER_MAN_SKIPPED } from "./cw/modular/spider-man.js";
import { MODULAR_DEFENDERS, MODULAR_DEFENDERS_SKIPPED } from "./cw/modular/defenders.js";
import { MODULAR_HELLS_KITCHEN, MODULAR_HELLS_KITCHEN_SKIPPED } from "./cw/modular/hells-kitchen.js";
import { MODULAR_CLOAK_AND_DAGGER, MODULAR_CLOAK_AND_DAGGER_SKIPPED } from "./cw/modular/cloak-and-dagger.js";
import { COMPETITIVE_STANDARD_PVP, COMPETITIVE_STANDARD_PVP_SKIPPED } from "./cw/competitive/standard-pvp.js";
import { COMPETITIVE_LEADER_CARDS, COMPETITIVE_LEADER_CARDS_SKIPPED } from "./cw/competitive/leader-cards.js";

/** One wave 10 scripting module: its group key in `CARD_GROUPS`, its registry and its skipped refs with reasons. */
export interface Wave10Module {
  readonly group: string;
  readonly registry: AbilityRegistry;
  readonly skipped: Readonly<Record<string, string>>;
  /** Registry entries listed on no card: an ability a rule grants, or a quoted one a card gives itself. */
  readonly registryOnly?: readonly string[];
}

/**
 * Every wave 10 module, scripted or not. The files exist from the scaffold (an empty registry and every ref skipped),
 * so a module agent edits only its own module file and its test: it fills the registry and deletes its `_SKIPPED` lines.
 * Only a module that registers an ability on no card (`registryOnly`) edits its line here.
 */
export const WAVE10_MODULES: readonly Wave10Module[] = [
  { group: "cw/tigra/identity", registry: TIGRA_IDENTITY, skipped: TIGRA_IDENTITY_SKIPPED },
  { group: "cw/tigra/events", registry: TIGRA_EVENTS, skipped: TIGRA_EVENTS_SKIPPED },
  {
    group: "cw/tigra/support-upgrades-allies",
    registry: TIGRA_SUPPORT_UPGRADES_ALLIES,
    skipped: TIGRA_SUPPORT_UPGRADES_ALLIES_SKIPPED,
  },
  {
    group: "cw/tigra/obligation-nemesis",
    registry: TIGRA_OBLIGATION_NEMESIS,
    skipped: TIGRA_OBLIGATION_NEMESIS_SKIPPED,
  },
  { group: "cw/hulkling/identity", registry: HULKLING_IDENTITY, skipped: HULKLING_IDENTITY_SKIPPED },
  { group: "cw/hulkling/events", registry: HULKLING_EVENTS, skipped: HULKLING_EVENTS_SKIPPED },
  {
    group: "cw/hulkling/support-upgrades-allies",
    registry: HULKLING_SUPPORT_UPGRADES_ALLIES,
    skipped: HULKLING_SUPPORT_UPGRADES_ALLIES_SKIPPED,
  },
  {
    group: "cw/hulkling/obligation-nemesis",
    registry: HULKLING_OBLIGATION_NEMESIS,
    skipped: HULKLING_OBLIGATION_NEMESIS_SKIPPED,
  },
  { group: "cw/aspect-basic/aggression", registry: ASPECT_BASIC_AGGRESSION, skipped: ASPECT_BASIC_AGGRESSION_SKIPPED },
  { group: "cw/aspect-basic/protection", registry: ASPECT_BASIC_PROTECTION, skipped: ASPECT_BASIC_PROTECTION_SKIPPED },
  { group: "cw/aspect-basic/basic", registry: ASPECT_BASIC_BASIC, skipped: ASPECT_BASIC_BASIC_SKIPPED },
  {
    group: "cw/main-schemes/registration",
    registry: MAIN_SCHEMES_REGISTRATION,
    skipped: MAIN_SCHEMES_REGISTRATION_SKIPPED,
  },
  { group: "cw/main-schemes/resistance", registry: MAIN_SCHEMES_RESISTANCE, skipped: MAIN_SCHEMES_RESISTANCE_SKIPPED },
  { group: "cw/leaders/iron-man", registry: LEADERS_IRON_MAN, skipped: LEADERS_IRON_MAN_SKIPPED },
  { group: "cw/leaders/captain-marvel", registry: LEADERS_CAPTAIN_MARVEL, skipped: LEADERS_CAPTAIN_MARVEL_SKIPPED },
  { group: "cw/leaders/captain-america", registry: LEADERS_CAPTAIN_AMERICA, skipped: LEADERS_CAPTAIN_AMERICA_SKIPPED },
  { group: "cw/leaders/spider-woman", registry: LEADERS_SPIDER_WOMAN, skipped: LEADERS_SPIDER_WOMAN_SKIPPED },
  { group: "cw/modular/mighty-avengers", registry: MODULAR_MIGHTY_AVENGERS, skipped: MODULAR_MIGHTY_AVENGERS_SKIPPED },
  { group: "cw/modular/the-initiative", registry: MODULAR_THE_INITIATIVE, skipped: MODULAR_THE_INITIATIVE_SKIPPED },
  { group: "cw/modular/maria-hill", registry: MODULAR_MARIA_HILL, skipped: MODULAR_MARIA_HILL_SKIPPED },
  {
    group: "cw/modular/dangerous-recruits",
    registry: MODULAR_DANGEROUS_RECRUITS,
    skipped: MODULAR_DANGEROUS_RECRUITS_SKIPPED,
  },
  { group: "cw/modular/cape-killer", registry: MODULAR_CAPE_KILLER, skipped: MODULAR_CAPE_KILLER_SKIPPED },
  { group: "cw/modular/martial-law", registry: MODULAR_MARTIAL_LAW, skipped: MODULAR_MARTIAL_LAW_SKIPPED },
  { group: "cw/modular/heroes-for-hire", registry: MODULAR_HEROES_FOR_HIRE, skipped: MODULAR_HEROES_FOR_HIRE_SKIPPED },
  { group: "cw/modular/paladin", registry: MODULAR_PALADIN, skipped: MODULAR_PALADIN_SKIPPED },
  { group: "cw/modular/new-avengers", registry: MODULAR_NEW_AVENGERS, skipped: MODULAR_NEW_AVENGERS_SKIPPED },
  { group: "cw/modular/secret-avengers", registry: MODULAR_SECRET_AVENGERS, skipped: MODULAR_SECRET_AVENGERS_SKIPPED },
  { group: "cw/modular/namor", registry: MODULAR_NAMOR, skipped: MODULAR_NAMOR_SKIPPED },
  { group: "cw/modular/atlanteans", registry: MODULAR_ATLANTEANS, skipped: MODULAR_ATLANTEANS_SKIPPED },
  { group: "cw/modular/spider-man", registry: MODULAR_SPIDER_MAN, skipped: MODULAR_SPIDER_MAN_SKIPPED },
  { group: "cw/modular/defenders", registry: MODULAR_DEFENDERS, skipped: MODULAR_DEFENDERS_SKIPPED },
  { group: "cw/modular/hells-kitchen", registry: MODULAR_HELLS_KITCHEN, skipped: MODULAR_HELLS_KITCHEN_SKIPPED },
  {
    group: "cw/modular/cloak-and-dagger",
    registry: MODULAR_CLOAK_AND_DAGGER,
    skipped: MODULAR_CLOAK_AND_DAGGER_SKIPPED,
  },
  {
    group: "cw/competitive/standard-pvp",
    registry: COMPETITIVE_STANDARD_PVP,
    skipped: COMPETITIVE_STANDARD_PVP_SKIPPED,
  },
  {
    group: "cw/competitive/leader-cards",
    registry: COMPETITIVE_LEADER_CARDS,
    skipped: COMPETITIVE_LEADER_CARDS_SKIPPED,
  },
];
