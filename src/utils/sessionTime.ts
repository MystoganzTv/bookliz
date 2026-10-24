/**
 * Time of day for reading sessions.
 *
 * A session used to carry only its calendar day, so every achievement about
 * *when* you read (night, after midnight, morning) had its progress pinned to
 * 0: shown in the list, impossible to earn. `ReadingSession.startTime` is the
 * local wall-clock time the session began, as "HH:MM".
 *
 * Absent means unknown — every session logged before the field existed, and
 * any past-day session the reader did not give a time to. Unknown never counts
 * towards a time-of-day achievement: a guessed hour would be fabricated data.
 */
import { ReadingSession } from "../types/models";
import { shiftDateKey } from "./dateUtils";

const DAY_MINUTES = 24 * 60;
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Minutes since midnight → "HH:MM". Wraps around the day in both directions. */
export const timeKey = (minutesOfDay: number): string => {
  const m = ((Math.round(minutesOfDay) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
};

/** "HH:MM" → minutes since midnight, or null when absent or malformed. */
export const parseTimeKey = (key?: string | null): number | null => {
  if (!key) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(key);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : null;
};

/** Local wall-clock time of a Date as "HH:MM". */
export const timeKeyOf = (d: Date): string => timeKey(d.getHours() * 60 + d.getMinutes());

/**
 * What a reader types on a number pad → minutes since midnight.
 * "22" → 22:00, "930" → 09:30, "2230" / "22:30" → 22:30. Null when not a real time.
 */
export const parseTypedTime = (text: string): number | null => {
  const digits = text.replace(/\D/g, "");
  if (!digits || digits.length > 4) return null;
  let h: number;
  let m: number;
  if (digits.length <= 2) {
    h = Number(digits);
    m = 0;
  } else if (digits.length === 3) {
    h = Number(digits.slice(0, 1));
    m = Number(digits.slice(1));
  } else {
    h = Number(digits.slice(0, 2));
    m = Number(digits.slice(2));
  }
  return h < 24 && m < 60 ? h * 60 + m : null;
};

/**
 * The start time a new session gets when the reader does not set one.
 *
 * Logging for today: the session just ended, so it began `minutesRead` ago.
 * Clamped at 00:00 rather than rolled into yesterday — the day stays the one
 * the reader chose, and a session that crossed midnight still overlaps it.
 * Logging for any other day: we do not know, so nothing.
 */
export const defaultStartTime = (args: {
  date: string;
  today: string;
  minutesRead: number | null | undefined;
  now: Date;
}): string | undefined => {
  if (args.date !== args.today) return undefined;
  const nowMinutes = args.now.getHours() * 60 + args.now.getMinutes();
  return timeKey(Math.max(0, nowMinutes - Math.max(0, args.minutesRead ?? 0)));
};

/** A daily window in minutes from the session day's midnight; `to` may pass 24:00. */
export type TimeWindow = { from: number; to: number };

export const TIME_WINDOWS = {
  /** 22:00–06:00 — "Night Reading", "Night Owl". */
  night: { from: 22 * 60, to: 30 * 60 },
  /** 00:00–05:00 — "Midnight Reader". */
  afterMidnight: { from: 0, to: 5 * 60 },
  /** 05:00–10:00 — "Morning Reader". */
  morning: { from: 5 * 60, to: 10 * 60 },
} as const satisfies Record<string, TimeWindow>;

/**
 * Day offsets (relative to `session.date`) of every copy of `window` the
 * session overlaps. A session at 01:00 overlaps the night that began the
 * evening before (offset -1); one from 23:30 to 00:30 overlaps tonight's
 * after-midnight window (offset +1).
 */
const overlappingOffsets = (session: Pick<ReadingSession, "startTime" | "minutesRead">, window: TimeWindow): number[] => {
  const start = parseTimeKey(session.startTime);
  if (start === null) return [];
  // A session with no duration still happened at a moment.
  const end = start + Math.max(1, session.minutesRead || 0);
  const offsets: number[] = [];
  for (const k of [-1, 0, 1]) {
    const from = window.from + k * DAY_MINUTES;
    const to = window.to + k * DAY_MINUTES;
    if (start < to && end > from) offsets.push(k);
  }
  return offsets;
};

export const readsDuring = (session: Pick<ReadingSession, "startTime" | "minutesRead">, window: TimeWindow): boolean =>
  overlappingOffsets(session, window).length > 0;

export type TimeOfDayProgress = {
  /** Sessions with any reading between 22:00 and 06:00. */
  nightSessions: number;
  /** Sessions with any reading between 00:00 and 05:00. */
  afterMidnightSessions: number;
  /** Sessions with any reading between 05:00 and 10:00. */
  morningSessions: number;
  /** Distinct nights (keyed by the evening they began) with any reading after 22:00. */
  lateNights: number;
};

export const timeOfDayProgress = (
  sessions: readonly Pick<ReadingSession, "date" | "startTime" | "minutesRead">[]
): TimeOfDayProgress => {
  let nightSessions = 0;
  let afterMidnightSessions = 0;
  let morningSessions = 0;
  const nights = new Set<string>();
  for (const session of sessions) {
    const nightOffsets = overlappingOffsets(session, TIME_WINDOWS.night);
    if (nightOffsets.length) {
      nightSessions += 1;
      nightOffsets.forEach((k) => nights.add(shiftDateKey(session.date, k)));
    }
    if (readsDuring(session, TIME_WINDOWS.afterMidnight)) afterMidnightSessions += 1;
    if (readsDuring(session, TIME_WINDOWS.morning)) morningSessions += 1;
  }
  return { nightSessions, afterMidnightSessions, morningSessions, lateNights: nights.size };
};
