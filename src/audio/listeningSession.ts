/**
 * Turning playback into reading sessions — the whole reason Bookliz has its
 * own player.
 *
 * A "listen" opens when audio starts and stays open across short pauses (a
 * question at the door, a podcast ad you skip back over). It closes when the
 * pause runs past RESUME_GAP_MS, when another book starts, or when the player
 * is closed — and only then becomes one ReadingSession.
 *
 * Time counted is wall-clock time with sound coming out, not book time: an
 * hour at 1.5× is an hour of your day (the stats, the streak) and 90 minutes
 * of the book (the progress). Both are true; they are stored in different
 * fields.
 *
 * The open listen is persisted by the engine on every tick, so a phone that
 * kills the app mid-chapter still gets its session on the next launch.
 */
import type { NewReadingSessionInput } from "../types/models";
import { localDateKey } from "../utils/dateUtils";
import { timeKeyOf } from "../utils/sessionTime";

/** A pause shorter than this continues the same session. */
export const RESUME_GAP_MS = 5 * 60_000;
/**
 * Longest stretch a single tick may add. Ticks arrive every ~0.5 s while
 * playing; a bigger hole means JS was not running, and time nobody observed is
 * not counted.
 */
export const MAX_TICK_MS = 15_000;
/** Shorter listens are a tap to check where you were, not a session. */
export const MIN_SESSION_MS = 60_000;
/** This close to the end counts as the end — credits and a publisher's sting are not the book. */
export const END_SLACK_SEC = 30;

export interface PendingListen {
  bookId: string;
  /** Wall-clock ms when sound started. */
  startedAt: number;
  /** Wall-clock ms of the last observation. */
  lastTickAt: number;
  /** Ms of actual playback counted so far. */
  listenedMs: number;
  /** Book position (s) when the listen began. */
  startSec: number;
  /** Book position (s) at the last observation. */
  lastSec: number;
  /** Set while paused; null while playing. */
  pausedAt: number | null;
}

export function startListen(bookId: string, now: number, positionSec: number): PendingListen {
  return { bookId, startedAt: now, lastTickAt: now, listenedMs: 0, startSec: positionSec, lastSec: positionSec, pausedAt: null };
}

/** Playing, observed at `now`. */
export function tickListen(p: PendingListen, now: number, positionSec: number): PendingListen {
  if (p.pausedAt !== null) return resumeListen(p, now, positionSec);
  const gained = Math.min(MAX_TICK_MS, Math.max(0, now - p.lastTickAt));
  return { ...p, lastTickAt: now, listenedMs: p.listenedMs + gained, lastSec: positionSec };
}

/** Sound stopped at `now`. Counts the stretch up to here, then holds. */
export function pauseListen(p: PendingListen, now: number, positionSec: number): PendingListen {
  if (p.pausedAt !== null) return { ...p, lastSec: positionSec };
  const ticked = tickListen(p, now, positionSec);
  return { ...ticked, pausedAt: now };
}

/** Sound back on. The pause itself is not listening time. */
export function resumeListen(p: PendingListen, now: number, positionSec: number): PendingListen {
  return { ...p, pausedAt: null, lastTickAt: now, lastSec: positionSec };
}

/**
 * The listen is over: paused past the gap, or — while supposedly playing —
 * not observed for longer than the gap (the app was killed).
 */
export function isListenOver(p: PendingListen, now: number): boolean {
  const since = p.pausedAt ?? p.lastTickAt;
  return now - since > RESUME_GAP_MS;
}

/** Whether pressing play on `bookId` now continues this listen rather than starting a new one. */
export function continuesListen(p: PendingListen | null, bookId: string, now: number): p is PendingListen {
  return Boolean(p && p.bookId === bookId && !isListenOver(p, now));
}

/**
 * A finished listen as a session, in the units the rest of the app uses for
 * audiobooks: pages when the book has a page count, else 0-100 percent (see
 * data/sessionProgress). Null when it was too short to be a session.
 *
 * Progress never goes backwards inside a session: skipping back to re-hear a
 * paragraph is not "un-reading" it, so the end is never before the start.
 */
export function sessionFromListen(
  p: PendingListen,
  book: { pages: number; totalSec: number }
): NewReadingSessionInput | null {
  if (p.listenedMs < MIN_SESSION_MS || book.totalSec <= 0) return null;
  const base = book.pages > 0 ? book.pages : 100;
  const toUnits = (sec: number) => Math.round(Math.min(1, Math.max(0, sec / book.totalSec)) * base);
  const startUnits = toUnits(p.startSec);
  const endUnits = book.totalSec - p.lastSec <= END_SLACK_SEC ? base : Math.max(startUnits, toUnits(p.lastSec));
  const started = new Date(p.startedAt);
  return {
    bookId: p.bookId,
    date: localDateKey(started),
    startTime: timeKeyOf(started),
    // Same convention as a logged session: start is the first unit of this
    // session. When the listen moved less than one unit, start > end and the
    // session reads zero pages — true, and it still keeps its minutes.
    startPage: Math.min(base, startUnits + 1),
    endPage: endUnits,
    minutesRead: Math.max(1, Math.round(p.listenedMs / 60_000)),
    location: "",
    mood: "—",
    format: "audiobook",
    notes: "",
  };
}
