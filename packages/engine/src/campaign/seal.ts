/**
 * A campaign log as a player may hold it (docs/phase7-wave9.md §3.75; MC50 p. 5: three evidence cards go into the
 * A.I.M. envelope "**without looking at them**").
 *
 * **Where the sealed cards are.** A sealed `random` draw is written to a `hidden` field as a value marked
 * `LogValue.sealed`. The stored `CampaignLog` holds that value in three places: `hidden` (the log now), every
 * `logBefore.hidden` snapshot taken after the draw (a retry restores one, so it has to hold what the log held), and,
 * for a game that reads it, the composed attempt's `input.log.hidden` (the game's replay baseline). It is in no
 * step trace: the draw's `CampaignChoiceRecord` holds a count, and the write is traced with its contents taken out.
 *
 * **What else gives them away.** The campaign's seed and RNG state: the draw is a pure function of them, which is what
 * makes the log replay to the same sealed cards without writing them down. Whoever holds `seed` or an `rng` state from
 * before the draw can make the draw again. The in-game seeds are values off the same RNG, so they go as well.
 *
 * So the stored log is the authority's copy and is complete: it resumes, retries and replays. `sealCampaignLog` is the
 * copy for anyone else (a second player's client, a wire message, a view model): the sealed values emptied to their
 * sizes, and no seed or RNG state anywhere. It cannot be resumed from, exactly as `sealHiddenPiles`' game state cannot.
 */

import type {
  CampaignAttempt,
  CampaignGameInput,
  CampaignHistoryEntry,
  CampaignLog,
  CampaignLogSnapshot,
} from "../campaign.js";
import { withoutSealedFields } from "./log.js";

/** A retry baseline with its sealed values emptied and no RNG state. */
export type SealedCampaignLogSnapshot = Omit<CampaignLogSnapshot, "rng">;

/** A history entry with its baseline sealed and without the seed its game was dealt from. */
export type SealedCampaignHistoryEntry = Omit<CampaignHistoryEntry, "logBefore" | "seed"> & {
  readonly logBefore: SealedCampaignLogSnapshot;
};

/** A composed attempt with its baseline sealed, and its game input without the seed or the sealed values. */
export type SealedCampaignAttempt = Omit<CampaignAttempt, "logBefore" | "input"> & {
  readonly logBefore: SealedCampaignLogSnapshot;
  readonly input: Omit<CampaignGameInput, "seed">;
};

/** `CampaignLog` with every sealed value emptied to its size and no seed or RNG state. Not a log to resume from. */
export type SealedCampaignLog = Omit<CampaignLog, "seed" | "rng" | "history" | "attempt"> & {
  readonly history: readonly SealedCampaignHistoryEntry[];
  readonly attempt?: SealedCampaignAttempt;
};

const sealSnapshot = (snapshot: CampaignLogSnapshot): SealedCampaignLogSnapshot => {
  const { rng: _rng, ...rest } = snapshot;
  return { ...rest, hidden: withoutSealedFields(snapshot.hidden) };
};

/**
 * The log for a reader who is not its authority: every sealed value keeps its kind and its size and names nothing
 * (`withoutSealedContents`), and the seed, every RNG state and every game seed are left out. Everything a player may
 * know stays as it is: the open fields, the decks, the position, the history's steps and choices.
 */
export function sealCampaignLog(log: CampaignLog): SealedCampaignLog {
  const { seed: _seed, rng: _rng, history, attempt, ...rest } = log;
  const sealedAttempt = (): SealedCampaignAttempt | undefined => {
    if (!attempt) return undefined;
    const { seed: _gameSeed, ...input } = attempt.input;
    return {
      ...attempt,
      logBefore: sealSnapshot(attempt.logBefore),
      input: {
        ...input,
        log: {
          ...input.log,
          ...(input.log.hidden !== undefined ? { hidden: withoutSealedFields(input.log.hidden) } : {}),
        },
      },
    };
  };
  const composed = sealedAttempt();
  return {
    ...rest,
    hidden: withoutSealedFields(log.hidden),
    history: history.map((entry) => {
      const { seed: _gameSeed, ...kept } = entry;
      return { ...kept, logBefore: sealSnapshot(entry.logBefore) };
    }),
    ...(composed ? { attempt: composed } : {}),
  };
}
