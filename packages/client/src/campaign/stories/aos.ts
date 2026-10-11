/**
 * Agents of S.H.I.E.L.D. (MC50) told through its own eight lettered rulebook comic pages, the way Age of Apocalypse
 * (`./aoa.ts`) and Mutant Genesis are: the box's official pages are the story, with captions and balloons printed into
 * the art, so the pages are copied byte-for-byte from `art/campaigns/aos/rulebook/page_NNN.jpg` into
 * `art/campaigns/aos/pages/NN-<slug>.jpg` (the folder the comic reader reads) and every `ComicPage` below is
 * `lettered: true`: no beat carries a line of ours, so nothing is lettered over a printed balloon. The `rulebook/`
 * folder stays the source of record (`art/README.md`). Everything else here (blurbs, briefings, taunts, the finale's
 * copy, the plain-words call copy) is original flavor for this app; no rule lives here (see `../story.ts`).
 *
 * **Cast:** Maria Hill (`50001a`) and Nick Fury (`50034a`) ship in this box, so their lines are written for them;
 * every other hero shows the narrator `fallback` instead.
 *
 * **Page to issue mapping** (rulebook page, file, where it plays): p. 8 `01-garza` opens Scenario 1 (Black Widow);
 * p. 10 `02-embassy` opens Scenario 2 (Batroc), its first panel doubling as Black Widow's aftermath; p. 12
 * `03-laboratory` opens Scenario 3 (M.O.D.O.K.), its first panel doubling as Batroc's aftermath; p. 14
 * `04-thunderbolts` opens Scenario 4 (Thunderbolts), its first two panels doubling as M.O.D.O.K.'s aftermath; p. 16
 * `05-custody` is the Thunderbolts' aftermath; p. 17 `06-board` opens Scenario 5 (Baron Zemo); p. 20 `07-locker` is
 * his aftermath; p. 21 `08-diner` is the finale's spread.
 *
 * **Panel rectangles** are measured by eye against each page's own 1800x1800 pixels, one rectangle per printed panel
 * in reading order (tiers top to bottom, left to right); an inset or bled panel is boxed to the panel it belongs to.
 *
 * **Plain-words calls.** The in-game choices this box raises are worded here once (`setupCalls`) so no prompt shows
 * only the rulebook's sentence: the expert heal that costs a secret counter, and each evidence card's Setup. What a
 * secret counter can do to a Board Member (flip it, and a third flip loses the game) is said on the option itself
 * (`view/board-secret-notes.ts`), from the live game.
 */
import type { BriefingNoteCopy } from "../../view/campaign-briefing-model.js";
import type { CampaignStory, ComicPage, SetupCallCopy, StorySpeaker } from "../story.js";

const HILL: StorySpeaker = { kind: "hero", identityId: "50001a", name: "Maria Hill" };
const FURY: StorySpeaker = { kind: "hero", identityId: "50034a", name: "Nick Fury" };

const page = (file: string, panels: readonly { x: number; y: number; w: number; h: number }[]): ComicPage => ({
  file,
  width: 1800,
  height: 1800,
  lettered: true,
  beats: panels.map((panel) => ({ panel, lines: [] })),
});

const PAGES: readonly ComicPage[] = [
  // Sarah Garza's apartment, the Helicarrier, and the car: two panels over three.
  page("01-garza", [
    { x: 48, y: 45, w: 625, h: 850 },
    { x: 695, y: 45, w: 1060, h: 850 },
    { x: 48, y: 912, w: 690, h: 818 },
    { x: 760, y: 912, w: 490, h: 818 },
    { x: 1270, y: 912, w: 485, h: 818 },
  ]),
  // The interrogation, the abduction, Batroc, and the decision to go in.
  page("02-embassy", [
    { x: 42, y: 40, w: 1010, h: 640 },
    { x: 1075, y: 40, w: 680, h: 640 },
    { x: 45, y: 735, w: 895, h: 995 },
    { x: 958, y: 735, w: 797, h: 995 },
  ]),
  // Three establishing panels, then M.O.D.O.K. bursting out.
  page("03-laboratory", [
    { x: 45, y: 45, w: 812, h: 630 },
    { x: 872, y: 45, w: 455, h: 630 },
    { x: 1338, y: 45, w: 420, h: 630 },
    { x: 50, y: 700, w: 1750, h: 1100 },
  ]),
  // The tarmac: two quiet panels, the Thunderbolts' arrival over them, then the standoff.
  page("04-thunderbolts", [
    { x: 58, y: 48, w: 505, h: 780 },
    { x: 582, y: 48, w: 420, h: 780 },
    { x: 620, y: 0, w: 1180, h: 1300 },
    { x: 58, y: 1305, w: 655, h: 415 },
    { x: 722, y: 1305, w: 688, h: 415 },
    { x: 1410, y: 1305, w: 345, h: 415 },
  ]),
  // The Thunderbolts' leader unmasked, and the board's orders.
  page("05-custody", [
    { x: 45, y: 40, w: 1710, h: 990 },
    { x: 48, y: 1048, w: 875, h: 680 },
    { x: 945, y: 1048, w: 810, h: 680 },
  ]),
  // The hearing, the verdict and the cell.
  page("06-board", [
    { x: 42, y: 38, w: 1713, h: 545 },
    { x: 42, y: 610, w: 1713, h: 545 },
    { x: 42, y: 1175, w: 865, h: 555 },
    { x: 805, y: 1195, w: 325, h: 535 },
    { x: 938, y: 1178, w: 817, h: 552 },
  ]),
  // The Helicarrier, one week later: the locker room.
  page("07-locker", [
    { x: 50, y: 45, w: 335, h: 765 },
    { x: 400, y: 45, w: 700, h: 765 },
    { x: 1112, y: 45, w: 643, h: 765 },
    { x: 50, y: 828, w: 865, h: 900 },
    { x: 945, y: 828, w: 810, h: 900 },
  ]),
  // The diner, sometime later.
  page("08-diner", [
    { x: 45, y: 42, w: 1045, h: 545 },
    { x: 1105, y: 42, w: 650, h: 545 },
    { x: 45, y: 612, w: 780, h: 1120 },
    { x: 842, y: 612, w: 490, h: 1120 },
    { x: 1352, y: 612, w: 405, h: 1120 },
  ]),
];

const beats = (file: string, count: number, from = 0) =>
  Array.from({ length: count }, (_, index) => ({ page: file, beatIndex: from + index }));

/**
 * MC50 p. 6 (expert): a hero pays a secret counter on a Board Member to heal damage equal to their REC; a hero
 * defeated last scenario pays the same to rejoin, or sits this scenario out. The counter can flip a Board Member
 * (the option says when).
 */
const HEAL: SetupCallCopy = {
  name: "Expert heal",
  explain:
    "Expert campaign: put 1 secret counter on a Board Member to heal your hero by REC. A hero defeated last scenario pays it to rejoin, or sits this scenario out.",
};
const EVIDENCE: SetupCallCopy = {
  name: "Evidence setup",
  explain:
    "Each evidence card you hold gives each hero two offers: put a secret counter on a Board Member to search your collection, or put 1 threat on the main scheme to search your deck.",
};

/** The nine evidence cards (50185 to 50193): each one's Setup is an instruction of scenarios 2 to 5. */
const EVIDENCE_CARD_IDS = ["50185", "50186", "50187", "50188", "50189", "50190", "50191", "50192", "50193"];
const SCENARIOS_WITH_SETUPS = [2, 3, 4, 5];

/**
 * The Briefing's "Handled for you" list, written once per issue (`IssueStory.briefingNotes`): what the campaign's own
 * Setup instructions do for the table, in the box's words. The generic rows would read the log's raw fields
 * ("Remaining Secret Counters by Scenario, #1: 3"), which says nothing a player can use. The numbers themselves
 * (evidence, secrets, Alert Level, hit points) are on the case file beside it.
 */
const note = (status: "done" | "later", title: string, detail: string, citation: string): BriefingNoteCopy => ({
  status,
  title,
  detail,
  citation,
});
const BOARD_BACK = (page: string) =>
  note(
    "done",
    "Executive Board restored",
    "Each Board Member comes back with the secrets and the face the log recorded. A member that flipped is still an attachment.",
    page,
  );
const EVIDENCE_SETUPS = (page: string) =>
  note(
    "done",
    "Evidence setups",
    "After mulligans, each evidence card you hold offers each hero its Setup: a secret counter for a collection search, or 1 threat for a deck search.",
    page,
  );
const EXPERT = (page: string) =>
  note(
    "done",
    "Expert campaign",
    "Each hero starts at the hit points the log recorded. A hero can put a secret counter on a Board Member to heal by REC, and a defeated hero pays that to rejoin or sits this scenario out.",
    page,
  );
const RECORDED = (page: string, extra: string) =>
  note(
    "later",
    "Recorded at the end",
    `The Board Members' secrets and faces go in the log. ${extra}A Board Member with no secrets left earns an evidence card.`,
    page,
  );

export const AOS_STORY: CampaignStory = {
  campaignId: "aos",
  tagline: "A story in five issues",
  blurb:
    "A S.H.I.E.L.D. specialist has vanished, and one of the three people who run the agency is working for A.I.M. Five scenarios, a hidden set of evidence, and a mole to name.",
  rosterBanner:
    "Each hero stays for all five scenarios. The Board Members' secrets, and the evidence you gain, ride with the whole table.",
  setupCalls: {
    ...Object.fromEntries(SCENARIOS_WITH_SETUPS.map((n) => [`mc50.s${n}.setup.heal`, HEAL])),
    ...Object.fromEntries(
      SCENARIOS_WITH_SETUPS.flatMap((n) =>
        EVIDENCE_CARD_IDS.map((id) => [`mc50.s${n}.setup.evidence.${id}`, EVIDENCE]),
      ),
    ),
  },
  castIdentityIds: ["50001a", "50034a"],
  pages: PAGES,
  issues: [
    {
      nodeId: "black-widow",
      title: "The Missing Specialist",
      villain: "Black Widow",
      blurb: "A computer specialist is gone and an empty cocoon is all that is left. Someone on the Board knows why.",
      recap: "Black Widow is down, and the Board's first secrets are out in the open.",
      teaser: "Find the missing specialist, and keep an eye on the Board.",
      opener: [],
      comicBeats: beats("01-garza", 5),
      stageLines: { 2: "Black Widow has stopped holding anything back." },
      briefingNotes: [
        note(
          "done",
          "Evidence prepared",
          "One card of each kind is sealed in the A.I.M. envelope without being shown. The other six wait in the S.H.I.E.L.D. envelope.",
          "MC50 p. 5",
        ),
        note(
          "done",
          "Executive Board",
          "Each Board Member starts with 2 secret counters, and the three A.I.M. Interference cards join the encounter deck.",
          "MC50 p. 9",
        ),
        RECORDED("MC50 p. 9", "The minions and side schemes in play are written down too. "),
      ],
      briefing: {
        speaker: FURY,
        text: "A specialist is missing and the Board is hiding something. We start with the specialist.",
        fallback: "A specialist is missing and the Board is hiding something. The heroes start with the specialist.",
      },
      aftermath: {
        speaker: HILL,
        text: "She will not talk. The people she worked with will.",
        fallback: "The Widow will not talk, but the people she worked with will.",
      },
      aftermathBeats: beats("02-embassy", 1),
      aftermathArt: { kind: "villain" },
      rewindTaunt: "You are not the first S.H.I.E.L.D. agents I have outlasted.",
    },
    {
      nodeId: "batroc",
      title: "The Embassy",
      villain: "Batroc",
      blurb: "Abducted Inhumans are being smuggled out through the A.I.M. embassy, and a mercenary guards the door.",
      recap: "Batroc has leapt his last, and the trail leads out to sea.",
      teaser: "Officially, nobody is going in. Unofficially, the heroes are already on the way.",
      opener: [],
      comicBeats: beats("02-embassy", 4),
      stageLines: { 2: "Batroc stops playing the gentleman." },
      briefingNotes: [
        BOARD_BACK("MC50 p. 11"),
        note(
          "done",
          "Alert Level",
          "It starts with threat equal to the minions and side schemes recorded after scenario 1.",
          "MC50 p. 11",
        ),
        EVIDENCE_SETUPS("MC50 p. 11"),
        EXPERT("MC50 p. 11"),
        RECORDED("MC50 p. 11", "The Rescued Captives in play are written down too. "),
      ],
      briefing: {
        speaker: HILL,
        text: "The Board will not sign off on this. If we fail, the blowback lands on us.",
        fallback: "The Board will not sign off on this. If the heroes fail, the blowback lands on them.",
      },
      aftermath: {
        speaker: FURY,
        text: "The embassy talks. It says the Inhumans went underwater.",
        fallback: "The embassy talks. The Inhumans were taken somewhere underwater.",
      },
      aftermathBeats: beats("03-laboratory", 1),
      aftermathArt: { kind: "villain" },
      rewindTaunt: "A leap, a kick, and you are on the floor. Again?",
    },
    {
      nodeId: "modok",
      title: "The Laboratory",
      villain: "M.O.D.O.K.",
      blurb: "Below the waves, A.I.M.'s scientists have the missing specialist, and M.O.D.O.K. does not like visitors.",
      recap: "M.O.D.O.K. is down and the specialist is out of the cell.",
      teaser: "Dive in quietly. Nothing about that place stays quiet.",
      opener: [],
      comicBeats: beats("03-laboratory", 4),
      stageLines: { 2: "M.O.D.O.K. has no intention of letting this work be interrupted." },
      briefingNotes: [
        BOARD_BACK("MC50 p. 13"),
        note(
          "done",
          "Holding Cell locks",
          "Extra locks go on the top Holding Cell card: 3 per hero, less 1 per hero for each Rescued Captive recorded.",
          "MC50 p. 13",
        ),
        EVIDENCE_SETUPS("MC50 p. 13"),
        EXPERT("MC50 p. 13"),
        RECORDED("MC50 p. 13", "The Adaptoid environments in play are marked too. "),
      ],
      briefing: {
        speaker: FURY,
        text: "If A.I.M. has a mole on the Board, one wrong call and they know we are coming.",
        fallback: "If A.I.M. has a mole on the Board, one wrong call and they know the heroes are coming.",
      },
      aftermath: {
        speaker: HILL,
        text: "Garza is safe. Now we find out who sold her out.",
        fallback: "Garza is safe. Now the heroes find out who sold her out.",
      },
      aftermathBeats: beats("04-thunderbolts", 2),
      aftermathArt: { kind: "villain" },
      rewindTaunt: "My work cannot be interrupted. Not by you, not by anyone.",
    },
    {
      nodeId: "thunderbolts",
      title: "On Whose Authority",
      villain: "Thunderbolts",
      blurb: "The heroes get a warm welcome home: warrants, and a team that says it acts for the Board.",
      recap: "The Thunderbolts' leader is out of his mask, and the Board's orders are out of the bag.",
      teaser: "Eight hours home, and the arrest team is already waiting.",
      opener: [],
      comicBeats: beats("04-thunderbolts", 6),
      stageLines: { 2: "Citizen V has stopped pretending this is a rescue." },
      briefingNotes: [
        BOARD_BACK("MC50 p. 15"),
        EVIDENCE_SETUPS("MC50 p. 15"),
        EXPERT("MC50 p. 15"),
        RECORDED("MC50 p. 15", "Any Thunderbolt minions in play are written down too. "),
      ],
      briefing: {
        speaker: HILL,
        text: "They say the Board sent them. Either the Board is lying, or one of the Board is.",
        fallback: "They say the Board sent them. Either the Board is lying, or one of its members is.",
      },
      aftermath: {
        speaker: FURY,
        text: "He was masked the whole time. Now we know his name.",
        fallback: "He was masked the whole time. Now the heroes know his name.",
      },
      aftermathBeats: beats("05-custody", 3),
      aftermathArt: { kind: "villain" },
      rewindTaunt: "The Board gives the orders. You are the ones who have to follow them.",
    },
    {
      nodeId: "baron-zemo",
      title: "The Accusation",
      villain: "Baron Zemo",
      blurb: "The heroes stand in front of the Board with the evidence they have, and one name to say out loud.",
      recap: "Zemo is beaten, the mole is named, and the heroes are cleared.",
      teaser: "Gather what is left of the evidence. Then name the mole.",
      opener: [],
      comicBeats: beats("06-board", 5),
      stageLines: { 2: "Zemo tears off the last of the pretense." },
      briefingNotes: [
        BOARD_BACK("MC50 p. 19"),
        note(
          "done",
          "Adaptoids return",
          "Each Adaptoid environment marked in the log comes into play, and each Adaptoid minion joins the encounter deck.",
          "MC50 p. 19",
        ),
        note(
          "done",
          "Thunderbolts return",
          "The surviving Thunderbolts and their encounter sets, except Jolt's, are shuffled into the encounter deck.",
          "MC50 p. 19",
        ),
        note(
          "done",
          "Envelopes set aside",
          "The A.I.M. and S.H.I.E.L.D. envelopes are kept for the accusation. Gaining evidence in this scenario is Zemo's own offer.",
          "MC50 p. 19",
        ),
        EVIDENCE_SETUPS("MC50 p. 19"),
        EXPERT("MC50 p. 19"),
      ],
      briefing: {
        speaker: FURY,
        text: "We are out of time. We name the mole with what we have, and we had better be right.",
        fallback:
          "The heroes are out of time. They will name the mole with what they have, and they had better be right.",
      },
      aftermath: {
        speaker: HILL,
        text: "It is over. It will not feel like it for a while.",
        fallback: "It is over. It will not feel like it for a while.",
      },
      aftermathBeats: beats("07-locker", 5),
      aftermathArt: { kind: "villain" },
      rewindTaunt: "A mistake in front of the Board, and the next trial is yours.",
    },
  ],
  campaignLost: {
    headline: "Convicted.",
    line: "The heroes were arrested by S.H.I.E.L.D. and convicted of the crimes they were accused of. This run of the campaign is over.",
  },
  finale: {
    caption: "Sometime later, a diner at the edge of nowhere.",
    headline: "Clear skies.",
    sfx: "BEEP!",
    villainLine: "I will be back, and the Board will not see me coming...",
    heroLines: ["The mole is named. Now, a storm on the horizon.", "We are cleared. For now."],
    page: "08-diner",
    comicBeats: beats("08-diner", 5),
    stats: [{ kind: "rewinds", label: "Rewinds" }],
    crewLines: [
      {
        speaker: FURY,
        text: "The mole is named. Now, a storm on the horizon.",
        fallback: "The mole is named. Now, a storm on the horizon.",
      },
      { speaker: HILL, text: "We are cleared. For now.", fallback: "We are cleared. For now." },
    ],
  },
};
