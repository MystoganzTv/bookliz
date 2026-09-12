/**
 * The weekly chart is a claim about days the reader can check against their
 * own memory, so the cases worth pinning are the quiet ones: days with no
 * reading, weeks with none at all, and the boundary where a week begins.
 */
import { ReadingSession } from "../../types/models";
import {
  addWeeks,
  isCurrentWeek,
  latestWeekWithReading,
  pagesPerDay,
  startOfWeek,
  weekRangeLabel,
} from "../readingWeek";

const session = (date: string, pagesRead: number): ReadingSession =>
  ({ id: date, bookId: "b1", date, pagesRead, startPage: 0, endPage: pagesRead } as ReadingSession);

// 2026-09-12 is a Saturday; its week starts Monday 2026-09-07.
const SATURDAY = new Date(2026, 8, 12);

describe("startOfWeek", () => {
  it("moves back to Monday", () => {
    expect(startOfWeek(SATURDAY).getDate()).toBe(7);
  });

  it("leaves a Monday where it is", () => {
    const monday = new Date(2026, 8, 7);
    expect(startOfWeek(monday).getTime()).toBe(monday.getTime());
  });

  it("treats Sunday as the end of its week, not the start of the next", () => {
    const sunday = new Date(2026, 8, 13);
    expect(startOfWeek(sunday).getDate()).toBe(7);
  });
});

describe("pagesPerDay", () => {
  it("always returns seven days, including the empty ones", () => {
    const buckets = pagesPerDay([session("2026-09-12", 122)], startOfWeek(SATURDAY));
    expect(buckets).toHaveLength(7);
    expect(buckets.map((b) => b.pages)).toEqual([0, 0, 0, 0, 0, 122, 0]);
  });

  it("adds up several sessions on the same day", () => {
    const buckets = pagesPerDay(
      [session("2026-09-08", 10), session("2026-09-08", 5)],
      startOfWeek(SATURDAY)
    );
    expect(buckets[1].pages).toBe(15);
  });

  it("ignores sessions from other weeks", () => {
    const buckets = pagesPerDay([session("2026-09-01", 99)], startOfWeek(SATURDAY));
    expect(buckets.every((b) => b.pages === 0)).toBe(true);
  });

  it("never lets a negative page count pull a day below zero", () => {
    const buckets = pagesPerDay([session("2026-09-12", -30)], startOfWeek(SATURDAY));
    expect(buckets[5].pages).toBe(0);
  });
});

describe("latestWeekWithReading", () => {
  it("opens on the week of the most recent session", () => {
    const week = latestWeekWithReading(
      [session("2026-08-20", 5), session("2026-09-12", 5)],
      new Date(2020, 0, 1)
    );
    expect(week.getTime()).toBe(startOfWeek(SATURDAY).getTime());
  });

  it("falls back when a book has never been read", () => {
    expect(latestWeekWithReading([], SATURDAY).getTime()).toBe(startOfWeek(SATURDAY).getTime());
  });

  it("ignores a malformed date rather than charting it", () => {
    const week = latestWeekWithReading([session("not-a-date", 5)], SATURDAY);
    expect(week.getTime()).toBe(startOfWeek(SATURDAY).getTime());
  });
});

describe("isCurrentWeek", () => {
  it("stops the reader paging into the future", () => {
    expect(isCurrentWeek(startOfWeek(SATURDAY), SATURDAY)).toBe(true);
    expect(isCurrentWeek(addWeeks(startOfWeek(SATURDAY), -1), SATURDAY)).toBe(false);
  });
});

describe("weekRangeLabel", () => {
  it("names the month on both ends, so day-first locales still read", () => {
    expect(weekRangeLabel(new Date(2026, 8, 7), "en-US")).toBe("Sep 7 – Sep 13, 2026");
  });

  it("says both months when the week straddles two", () => {
    expect(weekRangeLabel(new Date(2026, 8, 28), "en-US")).toBe("Sep 28 – Oct 4, 2026");
  });

  it("carries the year on both ends across New Year", () => {
    expect(weekRangeLabel(new Date(2026, 11, 28), "en-US")).toBe("Dec 28, 2026 – Jan 3, 2027");
  });
});
