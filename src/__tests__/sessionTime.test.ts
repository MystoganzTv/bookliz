/**
 * Time-of-day achievements were pinned to 0 because a session had no time.
 * These pin what counts as night, after midnight and morning — and that a
 * session without a time never counts.
 */
import {
  defaultStartTime,
  parseTimeKey,
  parseTypedTime,
  timeKey,
  timeOfDayProgress,
} from "../utils/sessionTime";

const s = (date: string, startTime: string | undefined, minutesRead: number) => ({ date, startTime, minutesRead });

describe("time keys", () => {
  it("formats and wraps", () => {
    expect(timeKey(0)).toBe("00:00");
    expect(timeKey(22 * 60 + 5)).toBe("22:05");
    expect(timeKey(-15)).toBe("23:45");
    expect(timeKey(24 * 60 + 30)).toBe("00:30");
  });

  it("parses only real HH:MM", () => {
    expect(parseTimeKey("22:30")).toBe(1350);
    expect(parseTimeKey("24:00")).toBeNull();
    expect(parseTimeKey("9:30")).toBeNull();
    expect(parseTimeKey(undefined)).toBeNull();
  });

  it.each([
    ["22", 22 * 60],
    ["930", 9 * 60 + 30],
    ["2230", 22 * 60 + 30],
    ["22:30", 22 * 60 + 30],
    ["0005", 5],
  ])("reads typed %s", (typed, minutes) => {
    expect(parseTypedTime(typed)).toBe(minutes);
  });

  it.each(["", "25", "2260", "12345"])("rejects typed %s", (typed) => {
    expect(parseTypedTime(typed)).toBeNull();
  });
});

describe("defaultStartTime", () => {
  const now = new Date(2026, 9, 24, 23, 0);

  it("today: began minutesRead ago", () => {
    expect(defaultStartTime({ date: "2026-10-24", today: "2026-10-24", minutesRead: 45, now })).toBe("22:15");
  });

  it("today, no minutes yet: now", () => {
    expect(defaultStartTime({ date: "2026-10-24", today: "2026-10-24", minutesRead: null, now })).toBe("23:00");
  });

  it("clamps at midnight instead of rolling into yesterday", () => {
    const justAfter = new Date(2026, 9, 25, 0, 20);
    expect(defaultStartTime({ date: "2026-10-25", today: "2026-10-25", minutesRead: 60, now: justAfter })).toBe("00:00");
  });

  it("another day: unknown, never guessed", () => {
    expect(defaultStartTime({ date: "2026-10-23", today: "2026-10-24", minutesRead: 30, now })).toBeUndefined();
  });
});

describe("timeOfDayProgress", () => {
  it("a session without a time counts for nothing", () => {
    expect(timeOfDayProgress([s("2026-10-24", undefined, 600)])).toEqual({
      nightSessions: 0,
      afterMidnightSessions: 0,
      morningSessions: 0,
      lateNights: 0,
    });
  });

  it("22:30 is night, not after midnight", () => {
    const p = timeOfDayProgress([s("2026-10-24", "22:30", 30)]);
    expect(p.nightSessions).toBe(1);
    expect(p.afterMidnightSessions).toBe(0);
    expect(p.lateNights).toBe(1);
  });

  it("a session crossing midnight counts as after midnight", () => {
    const p = timeOfDayProgress([s("2026-10-24", "23:30", 60)]);
    expect(p.afterMidnightSessions).toBe(1);
    expect(p.nightSessions).toBe(1);
  });

  it("21:00 for 30 minutes is not night; for 90 minutes it is", () => {
    expect(timeOfDayProgress([s("2026-10-24", "21:00", 30)]).nightSessions).toBe(0);
    expect(timeOfDayProgress([s("2026-10-24", "21:00", 90)]).nightSessions).toBe(1);
  });

  it("01:00 belongs to the night that began the evening before", () => {
    const p = timeOfDayProgress([s("2026-10-24", "23:00", 30), s("2026-10-25", "01:00", 30)]);
    expect(p.nightSessions).toBe(2);
    expect(p.lateNights).toBe(1);
  });

  it("separate nights are counted separately", () => {
    const p = timeOfDayProgress([s("2026-10-22", "22:30", 20), s("2026-10-23", "23:00", 20), s("2026-10-24", "22:10", 20)]);
    expect(p.lateNights).toBe(3);
  });

  it("morning is 05:00–10:00", () => {
    expect(timeOfDayProgress([s("2026-10-24", "07:00", 30)]).morningSessions).toBe(1);
    expect(timeOfDayProgress([s("2026-10-24", "10:00", 30)]).morningSessions).toBe(0);
    expect(timeOfDayProgress([s("2026-10-24", "04:30", 45)]).morningSessions).toBe(1);
  });
});
