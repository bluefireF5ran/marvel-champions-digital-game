/**
 * "How this works": the one-line note Inspect's RULES & STATE panel shows for a card whose wording is easy to misread
 * (guided mode section 3.14, `docs/guided-mode.md`). Each note is a paraphrase of the card's own text and the RRG entry
 * behind it (the glossary entry carries the cite), never a transcription, and reads no hidden information, so it is
 * safe to show for any card a player can see.
 *
 * Keyed by the printed id without its face letter ("34002" covers both Phoenix Force sides). Wave 6 (Mutant Genesis and
 * MojoMania) is the first wave to fill it; wave 7 (NeXt Evolution), wave 8 (Age of Apocalypse) and wave 9 (Agents of S.H.I.E.L.D. and its four hero packs) add their own rows after them.
 */
import type { AnyCard } from "@mc/content";

const NOTES = new Map<string, string>();

function note(ids: readonly string[], text: string): void {
  for (const id of ids) NOTES.set(id, text);
}

const range = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, index) => String(from + index));

// Colossus.
note(["32001"], "Colossus can hold two tough status cards. Each hit discards only one of them.");
note(
  ["32005"],
  "Generates one physical resource for each tough status card on Colossus, so spend it while they are stacked.",
);
note(
  ["32006"],
  "Whenever Colossus loses a tough card, this can spend a steel counter and exhaust to give him a new one.",
);

// Shadowcat.
note(
  ["32030", "32031"],
  "Solid and Phased are her mass form, a form of its own. The card flips after she attacks or defends, and Phase Control flips it once a round, with no hero flip involved.",
);

// Cyclops.
note(["33001"], "Optic Blast costs one resource of any type and can only hit an enemy that has an upgrade attached.");
note(
  ["33004"],
  "You take the first turn of the player phase. Your Temporary upgrades on minions stay in play past the end of the round.",
);
note(
  ["33005", "33006", "33007"],
  "Temporary: discarded at the end of the round unless Field Commander is keeping it on a minion.",
);

// Phoenix.
note(
  ["34002"],
  "Removing the last power counter flips it to UNLEASHED (+2 ATK, -2 THW). Counters bring it back at 4 or more.",
);

// Wolverine.
note(
  ["35002"],
  "The damage is a cost: if a tough card or anything else prevents some of it, you haven't paid and nothing is played.",
);

// Storm.
note(
  ["36001"],
  "Weather Control swaps your Weather in play with one you choose from the facedown Weather deck, then resolves the new Weather's Special.",
);
note(
  ["36002", "36003", "36004", "36005"],
  "Permanent. Its Special only resolves when another ability, like Weather Control, tells you to.",
);

// Gambit.
note(
  ["37001"],
  "Throw de Card removes up to 3 counters but needs at least 1. Thief Extraordinaire's look at the encounter deck is private to you.",
);
note(
  ["37006"],
  "What it gains depends on how many counters Throw de Card removed for this attack, and it still needs that interrupt.",
);

// Rogue.
note(
  ["38001", "38002"],
  "Touched waits off to the side until Skin Contact or Energy Transfer attaches it to another character. Rogue has that character's traits only while it stays there.",
);

// Labeled abilities: a real thwart or defense by your identity.
note(
  ["32188", "32194", "34017"],
  "Labeled (thwart): it counts as a real thwart by you, so patrol or crisis on the main scheme can stop it.",
);
note(
  ["32189"],
  "Counts as a defense and a thwart, so it can't be used while patrol or crisis stops you thwarting the main scheme.",
);

// Mutant Genesis scenarios.
note(
  ["32066"],
  "The first player controls Robert Kelly. He takes the damage of undefended enemy attacks against that player, and you lose if he leaves play.",
);
note(
  ["32141"],
  "Magnet counters collect on the main scheme. At 3, it removes 3 and reveals the next Magnetic card from the encounter deck. They return to the pool when the scheme advances.",
);
note(
  ["32087"],
  "Each time threat here reaches 5 per hero, the first player tucks a deck card under Operation Zero Tolerance and the threat drops by that much.",
);
note(["32100"], "Defeating this gives you a random set-aside Captive ally, put into play under your control.");
note(
  ["32104"],
  "Allies that enemy attacks defeat go facedown under it. At 3 more cards than players, the players lose.",
);
note(
  [...range(32159, 32163), ...range(38029, 38033)],
  "Teamwork: when it engages you and another minion with its trait is in play, it activates against you right away, before its When Revealed.",
);
note(["32164"], "Only the When Defeated abilities resolve. The Acolyte minions stay in play.");
note(range(32176, 32195), "One use: it leaves the game and the campaign pool for good once its effect resolves.");

// MojoMania.
note(
  ["39003", "39004"],
  "Each crowd flips at 5 ratings counters per hero and keeps them. At 10 per hero it ends the game.",
);
note(
  ["39015"],
  "SHOW environments that would be discarded go to the bottom of the show deck, which player cards can't touch.",
);
note(
  ["39016"],
  "The only way to reach the show deck: removing the last threat here reveals its top card and puts 3 threat per hero back.",
);
note(["39025"], "Threat on a character moves here when that character flips or leaves play.");
note(
  ["39026"],
  "SPINNING waits for an encounter deck reset. STOPPED acts at the start of villain phase step 3, then flips back.",
);
note(
  ["39030"],
  "Hinder 10 puts the threat on this card, not a scheme. Remove it or it moves to the main scheme when your turn ends.",
);
note(
  ["39035", "39041", "39047", "39053", "39060", "39066"],
  "Revealing a SHOW discards the other SETTING environments. It surges only if it came from the encounter deck.",
);
note(
  ["39065"],
  "Incite 3 puts 3 threat on the main scheme when it is revealed. Peril locks out other players' help while you resolve it.",
);
note(["34031"], "Peril: while you resolve it, other players can't help you or play cards.");
note(
  ["39071"],
  "An ally with an encounter back. Revealed, he joins the player who revealed him, and the card gains surge.",
);

// NeXt Evolution.
note(
  ["40130"],
  "The first player controls her, and her THW and ATK copy that player's hero. In alter-ego form they are 0. If she leaves play, you lose.",
);
note(["40006"], "Only Cable removes threat from it. His allies and other heroes can't.");
note(
  ["40013"],
  "The side scheme returns with its starting threat and hinder, not revealed, then 4 threat moves onto it from the main scheme.",
);
note(["40040"], "One attack of 4 damage plus 1 per resource icon on the discarded card. Domino's wild counts twice.");
note(
  ["40043"],
  "Shuffle it back and it counts no icons for the card that discarded it. Leave it in the discard pile and it counts 3.",
);
note(
  ["40081"],
  "Cards under it are not in play. Each defeated villain goes under it, and with 3 villains under it the players win.",
);
note(["40132"], "He takes no damage while any Creeping Willow is in play, whoever it is engaged with.");
note(
  ["41002"],
  "The Katana side is restricted. Past two restricted cards you discard another one, never a Psi blade, which is permanent.",
);
note(
  ["43006"],
  "A plain Action, so it works in alter-ego or hero form. Divide 4 healing between your identity and Honey Badger.",
);
note(
  ["43021"],
  "The four Specialists are set aside, not in any deck. Each player without a Specialization upgrade picks one.",
);
note(
  ["44032"],
  "While it is in play your allies are exhausted and can't ready. On your turn other players can't resolve player card abilities.",
);
note(
  ["44046"],
  "Alter-ego only. Costs 3 per player. A timer counts your break; End break heals every identity 1 per whole minute.",
);

// Age of Apocalypse (wave 8). Notes on a reading the owner has not confirmed describe what the game does today.
note(
  ["45001"],
  "Damage from an attack discards that many cards from your deck. Resource cards among them go to your hand; the rest stay in the discard pile.",
);
note(
  ["45007"],
  "Bishop readies only if a resource card paid for it. Extra resources beyond the cost did not pay, and a cost of 0 never counts.",
);
note(
  ["45008"],
  "You draw only if a resource card paid for it. Extra resources beyond the cost did not pay, and a cost of 0 never counts.",
);
note(
  ["45030"],
  "In hero form your top card is faceup, and once per phase you may play it for 1 less. Her upgrades read its resource icon, and a wild icon counts as every type.",
);
note(
  ["45032"],
  "Swap a card in your hand with the top card of your deck, as an action or when the villain phase begins.",
);
note(
  ["45038", "45039", "45040"],
  "Reads the top card of your deck when it resolves, so it can change what the card does. A wild icon counts as every type.",
);
note(
  ["46001"],
  '"Freeze!" attaches a set-aside Frostbite when you make a basic attack or defense against an enemy. Frostbite returns when its host activates or leaves play.',
);
note(["46015", "46016"], "Needs an enemy with any upgrade attached. A Frostbite counts.");
note(["46009"], "Choose one: 4 damage and a Frostbite, or 6 damage to an enemy that already has a Frostbite attached.");
note(
  ["47004", "47005", "47006", "47007", "47008", "47009", "47015"],
  "Counts the different resource types that paid, not the cards. Extra resources beyond the cost did not pay. A wild counts as the type you declare.",
);
note(
  ["47023"],
  "Changing to hero form on your turn costs 2 resources of the same type. Playing any Jubilee event removes this card from the game.",
);
note(
  ["47019"],
  "The chosen player makes a basic attack or thwart with a character they control, at +1 THW and +1 ATK. It costs one charge counter.",
);
note(
  ["48006"],
  "When the attached enemy attacks, discard it to make Nightcrawler the defender without exhausting him. That is a basic defense.",
);
note(
  ["48007"],
  "One attack made of two parts: 3 damage to an enemy, then 3 to each enemy with Bamf! attached. Guard is checked for each enemy.",
);
note(
  ["48033"],
  "A minion that schemes is dealt to that player as a facedown encounter card, then passed to the next player if there is one.",
);
note(
  ["49001"],
  "Magnetic Pull discards until a MAGNETIC card, once per round, and adds it to your hand. Armor reads the icons discarded, and Old Grievances counts the cards.",
);
note(
  ["49004"],
  "Reads the icons of the cards Magnetic Pull discarded, the MAGNETIC one too: mental +1 THW, physical +1 ATK, energy +1 DEF, each until the end of the round.",
);
note(["49006"], "Damage you would take goes onto this card instead of you. At 6 or more it is discarded.");
note(
  ["49007"],
  "Hero form only, and not for ELITE minions. The attached minion cannot activate and its text box is blank.",
);
note(
  ["49015"],
  "Every instance of attack damage to the chosen enemy this phase gets +1, so a multi-hit attack adds it each time.",
);
note(
  ["49019"],
  "Adds the ally's matching power: the stat that actually powered your attack or thwart, not the other one.",
);
note(["45059"], "Threat on Gene Pool sets what he has: 3 retaliate 1, 6 also stalwart, 9 also an amplify icon.");
note(
  ["45081", "45082", "45083", "45084"],
  "Cannot be defeated while another villain has at least 1 hit point. The active counter moves right after a villain activates.",
);
note(
  ["45090", "45091"],
  "Counts the villain as having at least 1 hit point. After you attack it, you resolve its Forced Response as if it just attacked you, then this is discarded.",
);
note(
  ["45103"],
  "When Apocalypse would be defeated, he heals instead and this scheme loses threat equal to the numeral in his printed hit points.",
);
note(["45104"], "Threat cannot be removed from this scheme while a Prelate minion is in play.");
note(
  ["45105"],
  "The Tyrant's Throne: threat cannot be removed while a Prelate is in play. Its other side, No Longer Worthy: Apocalypse takes no damage while a Prelate is in play, and defeating him wins.",
);
note(
  ["45118"],
  "His attack resolves the Special on a Setting environment in play. With several in play, the resolving player chooses one.",
);
note(
  ["45127", "45133", "45139"],
  "Several Settings can be in play at once. A Special resolves when Dark Beast attacks you or a card asks for it.",
);
note(
  ["45075"],
  "Permanent. At 3 more counters than players they clear: your nemesis minion activates, or the nemesis set comes in.",
);
note(["45147"], "Adds a power counter each villain phase. At 4, remove them and reveal the next Superpower card.");
note(
  ["45171"],
  "Cannot be discarded. Exhaust it to make a mission attempt, or to reduce the next ally played to the mission by 2.",
);
note(
  ["45176"],
  "A campaign reward. The attached ally gets +1 THW, +1 ATK and +1 hit point, and counts as having a wild resource icon too.",
);
note(
  ["45166", "45167", "45168", "45169", "45170"],
  "A mission: players cannot thwart it. Allies at the mission make attempts, and it cannot be defeated while any minion is there.",
);

// Agents of S.H.I.E.L.D. and the cycle 9 hero packs (wave 9). The owner's answers of Oct 9 and Oct 10, 2026 fix the
// readings below (docs/phase7-wave9.md section 4.1); the glossary entries carry the cites.
note(
  ["50001"],
  "Include exactly 3 off-aspect S.H.I.E.L.D. supports at their full copy limit, or none. Reassignment moves 1 all-purpose counter between S.H.I.E.L.D. supports once per round.",
);
note(
  ["50034"],
  "Break Cover turns your suit to Assault whenever you attack. The threat you banked in Stealth can be spent on that same attack.",
);
note(
  ["50035"],
  "Stealth: when an enemy would attack Nick himself it schemes instead, and 1 of that threat goes here while this holds 5 or less. Assault spends up to 3 threat for damage.",
);
note(
  ["50024"],
  "Maria Hill and Nick Fury must both be in play, as heroes or allies. The 3 tokens can be counters or threat, in any mix, on supports or suit forms.",
);
note(
  ["50028"],
  "Max 1 per player. It protects any card you control from an encounter card's discard, including cards in your hand or deck.",
);
note(
  ["50051"],
  "A surge deals its card facedown, so this can answer it before it is revealed. Look at every dealt card and the deck top, then swap any.",
);
note(
  ["50064"],
  "When you attack her, she first removes 1 threat from the main scheme. Only then do you discard the top encounter card and resolve its Preparation before the attack.",
);
note(
  ["50070"],
  "Cards without a printed Preparation get this one. It resolves when Black Widow discards that card, and then this attachment is discarded.",
);
note(
  ["50074"],
  "Cards without a printed Preparation get one that damages the attacking character. It resolves when Black Widow discards that card.",
);
note(
  ["50086"],
  "At 0 hit points he resets to 8 (12 on the expert side) and 6 threat leaves the main scheme. He is never defeated, so defeat effects do not see him.",
);
note(
  ["50103"],
  "At 0 hit points he loses 2 lock counters from a Holding Cell and resets to 10 (14 expert). With no Holding Cell in play, you win.",
);
note(
  ["50165", "50166"],
  "At 0 hit points he resets, and 3 secret counters are removed from among the Board Member environments. The first player splits them.",
);
note(
  ["50090"],
  "It gets 1 threat when a character is defeated, unless consequential damage did it. At 4 per player it flips to High, and on High that much threat loses the game.",
);
note(
  ["50105", "50106", "50107", "50108"],
  "The top cell is in play. Removing its last lock counter frees its ally. A freed ally that leaves play goes to the deck bottom, not the discard pile.",
);
note(
  ["50129"],
  "He cannot be defeated until enough Thunderbolt minions are in the victory display. At 0 hit points he stays in play and keeps activating.",
);
note(
  ["50130"],
  "Attacking a Thunderbolt minion engages it with you, even one held by Thunderbolt Backup. Each round's end holds the most damaged Thunderbolt.",
);
note(
  ["50131"],
  "The last set-aside Thunderbolt is revealed, so its When Revealed resolves, then it is held. A held minion is engaged with nobody and does not activate.",
);
note(["50132"], "Only your identity attacking and damaging Citizen V offers the discard. An ally's attack does not.");
note(
  ["50134"],
  "Your identity's attack counts, not an ally's. An enemy attacking you counts even when an ally defends.",
);
note(
  ["50137"],
  "With no Thunderbolt minion in the victory display, the card still surges and is still removed from the game.",
);
note(
  ["50171"],
  "The hero is an Elite minion with SCH equal to its THW, and keeps its traits. If this card leaves play, the hero is removed from the game.",
);
note(
  ["50173"],
  "Attacking, thwarting or defending with an ally costs 1 more resource of any type. Your hero pays nothing extra.",
);
note(
  ["50181", "50182", "50183"],
  "At 4 secret counters (3 in expert mode) it flips to an attachment on the villain, keeping its secrets, and stays one all campaign. All three flipped loses.",
);
note(
  ["50184"],
  "Places 1 secret counter on each Board Member card, flipped ones too. You may spend X resources of the type on the card to prevent X of them.",
);
note(
  range(50185, 50193),
  "Setup only. A different card means one with a title not in your deck, hand, discard pile or play area. Ignore this text during a scenario.",
);
note(
  ["50167"],
  "Stage 1B lets you advance to the accusation. Each wrong guess puts a secret counter on every Board Member, and a wrong accused gets more.",
);
note(
  ["50081"],
  "An ally that would leave play is tucked here instead, with threat equal to its cost. Defeating this scheme puts them all back in play.",
);
note(["50032"], "Only facedown Controlled minions engaged with a player have base 1 SCH, 1 ATK and 1 hit point.");
note(
  ["51001"],
  "Inventor must take an eligible upgrade from your deck if one is there, plays it for 2 less, and shuffles. If none is there, the search fails.",
);
note(
  ["51017"],
  "Removed threat goes onto a non-Elite minion. When its threat reaches its remaining hit points, Redemption attaches and you take control of it.",
);
note(
  ["52001"],
  "Silk holds at most 4 tucked encounter cards, on either side. Silk Sense tucks a card you defeated or resolved, taken from the encounter discard pile.",
);
note(
  ["52031"],
  "A player card that discards it from under your identity deals 2 damage: an effect, a cost, or Silk's 4-card cap.",
);
note(
  ["53001"],
  "The top encounter card is faceup only in your player phase, in hero form. Eagle-Eyed discards the top card after you play an Aerial card.",
);
note(
  ["53002", "53010"],
  "Not offered while the faceup top card has no icons. Stars and boost icons both count, and a facedown top card can still be discarded.",
);
note(
  ["53003", "53004"],
  "The extra discard is not offered when the faceup top card has no icons. Stars and boost icons both count.",
);
note(
  ["53005"],
  "Offered after an attacking enemy is given a boost card, not a scheme's. Swap it with the top card if you like, then draw for the icons on the boost card.",
);
note(
  ["53012"],
  "Counts the icons on the card Eagle-Eyed discarded, even if Serpent Solutions dealt it away. Not offered with 0 icons.",
);
note(
  ["53018"],
  "She keeps her bonuses only while the card that paid for her stays tucked: mental +2 THW, physical +2 ATK, energy +2 hit points, wild all three.",
);
note(["53021"], "Max 1 per player. Any player may spend the tucked resource card as if it were in their hand.");
note(
  ["54014"],
  "One attack with a 3 damage hit for each weapon you exhaust, up to three. It is one attack, so After you attack answers once.",
);
note(
  ["54017", "54023"],
  "Max 1 per player limits what you control. Winter, Widow, Soldier, Spy cannot put a second Aggressive Stance into play while you control one.",
);
note(
  ["54035"],
  "The attached character can attack only this card. At 3 damage here, the extra moves to the character and this is discarded. That is not a defeat.",
);

// Civil War (wave 10): the rulings are the owner's answers in docs/phase7-wave10.md section 4.1 and
// docs/phase7-wave10-box-heroes.md B4.
note(
  ["56084"],
  "Their leader is the enemy leader. The enemy team attaches it to a minion or that leader, one per character. It is discarded when it stops an attack's damage.",
);
note(
  ["56190"],
  "You have no leader, so Iron Fist activates against you instead of attacking your leader. As a boost card, its attack on your leader does nothing.",
);
note(
  ["56196"],
  "Cooperatively you have no leader's main scheme, so it removes no threat. It is still discarded after the leader schemes.",
);
note(
  ["56008"],
  "The two 4 damage sentences are separate, so both may hit the same enemy. It costs 1 less for each minion engaged with you, down to 0.",
);
note(
  ["56007"],
  "A minion with quickstrike attacks you first when it enters play, if you are in hero form. Then Hunted attaches and it is stunned.",
);
note(
  ["56002"],
  "A minion with quickstrike attacks you first when it enters play, if you are in hero form. Then it is stunned and confused.",
);
note(
  ["56038"],
  "You get the tough card after the attack, even if the damage defeated the attacker. If the attack is cancelled, you do not.",
);
note(
  ["56016"],
  "Defeats the minion without dealing damage and ignores only its When Defeated abilities. Victory and other cards' responses still happen.",
);
// Wonder Man and Hercules: only what the glossary and the official rulings fix. The rest are owed (C16b hand-off).
note(
  ["58002"],
  "Your energy events are tucked here after they resolve, up to three. Each adds 1 ATK. Only a basic attack discards them.",
);
note(
  ["59003"],
  "If no side scheme can be found, this Labor card is discarded and goes to the bottom of the Labor deck.",
);

/** Civil War text that names competitive mode, which this game does not offer yet. */
function competitiveModeNote(text: string): string | null {
  if (!/competitive mode/i.test(text)) return null;
  if (/\bOtherwise\b/.test(text))
    return "Competitive mode is not in this game yet, so only the Otherwise part applies.";
  if (/cooperative mode/i.test(text))
    return "Competitive mode is not in this game yet, so only the cooperative part applies.";
  return "Competitive mode is not in this game yet, so the competitive mode part does nothing.";
}

/** The printed id without its face letter: "34002a" and "34002b" are one card. */
export const baseCardId = (id: string): string => id.replace(/[ab]$/, "");

/** The one-line "How this works" note for `card`, or null for the great majority of cards that need none. */
export function howThisWorksFor(card: AnyCard | undefined): string | null {
  if (!card) return null;
  const written = NOTES.get(baseCardId(card.id as string));
  if (written) return written;
  return "text" in card ? competitiveModeNote(card.text.current) : null;
}

/** Every printed id (face letter stripped) that carries a note, for the coverage test. */
export const HOW_THIS_WORKS_IDS: readonly string[] = [...NOTES.keys()];
