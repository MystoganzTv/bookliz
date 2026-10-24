import {
  audioRange,
  defaultSessionFormat,
  latestSession,
  pageRange,
  percentOf,
  progressBase,
  resumeUnits,
  sessionPlace
} from "../sessionProgress";
import type { ReadingSession } from "../../types/models";

let seq = 0;
const session = (over: Partial<ReadingSession>): ReadingSession => ({
  id: `rs-${++seq}`,
  bookId: "b1",
  date: "2026-10-01",
  startPage: 1,
  endPage: 10,
  pagesRead: 10,
  minutesRead: 30,
  location: "",
  mood: "—",
  format: "physical",
  notes: "",
  difficulty: "moderate",
  enjoymentRating: 0,
  pagesPerHour: 20,
  ...over
});

describe("latestSession", () => {
  it("picks the latest date", () => {
    const a = session({ date: "2026-10-01", endPage: 80 });
    const b = session({ date: "2026-10-03", endPage: 40 });
    expect(latestSession([a, b])).toBe(b);
    expect(latestSession([b, a])).toBe(b);
  });

  it("breaks same-day ties by furthest page, not array order", () => {
    const morning = session({ date: "2026-10-05", endPage: 120 });
    const evening = session({ date: "2026-10-05", endPage: 160 });
    expect(latestSession([evening, morning])).toBe(evening);
    expect(latestSession([morning, evening])).toBe(evening);
  });

  it("is undefined with no sessions", () => {
    expect(latestSession([])).toBeUndefined();
  });
});

describe("progressBase", () => {
  it("uses pages when known", () => {
    expect(progressBase(320, "physical")).toBe(320);
    expect(progressBase(320, "audiobook")).toBe(320);
  });
  it("falls back to percent only for audiobooks", () => {
    expect(progressBase(0, "audiobook")).toBe(100);
    expect(progressBase(0, "physical")).toBe(0);
  });
});

describe("resumeUnits", () => {
  it("starts a fresh book at 0 so the first session begins on page 1", () => {
    expect(resumeUnits(0, 300, [])).toBe(0);
    expect(pageRange(0, 30, null, 300)).toEqual({ startPage: 1, endPage: 30, pagesRead: 30 });
  });

  it("uses the exact end page of the last session, not the rounded percent", () => {
    // 503 / 1000 = 50.3 % → stored as 50 %. From the percent alone the next
    // session would start on 501 and count 501-503 twice.
    const last = session({ endPage: 503 });
    expect(resumeUnits(50, 1000, [last])).toBe(503);
  });

  it("trusts the percent when it was changed by hand after the last session", () => {
    const last = session({ endPage: 503 });
    expect(resumeUnits(70, 1000, [last])).toBe(700);
  });

  it("ignores a session end page that does not fit the book", () => {
    const last = session({ endPage: 900 });
    expect(resumeUnits(50, 400, [last])).toBe(200);
  });

  it("is 0 when the book cannot be tracked", () => {
    expect(resumeUnits(40, 0, [])).toBe(0);
  });
});

describe("pageRange", () => {
  it("counts nothing until the reader says where they stopped", () => {
    expect(pageRange(157, null, null, 320)).toEqual({ startPage: 158, endPage: 157, pagesRead: 0 });
    // A typed start page alone must not count "up to where the book was".
    expect(pageRange(157, null, 1, 320).pagesRead).toBe(0);
  });

  it("is inclusive of both ends, like toSessionRecord", () => {
    expect(pageRange(157, 186, null, 320)).toEqual({ startPage: 158, endPage: 186, pagesRead: 29 });
  });

  it("honours a typed start page", () => {
    expect(pageRange(20, 130, 100, 500)).toEqual({ startPage: 100, endPage: 130, pagesRead: 31 });
  });

  it("clamps to the book and never goes negative", () => {
    expect(pageRange(300, 999, null, 320)).toEqual({ startPage: 301, endPage: 320, pagesRead: 20 });
    expect(pageRange(200, 150, null, 320).pagesRead).toBe(0);
  });
});

describe("audioRange", () => {
  it("starts after the exact resume point", () => {
    expect(audioRange(503, 52, 1000)).toEqual({ startPage: 504, endPage: 520, gainedPct: 2 });
  });

  it("reports no gain at the same percent", () => {
    expect(audioRange(503, 50, 1000).gainedPct).toBe(0);
  });

  it("works in percent units when the page count is unknown", () => {
    expect(audioRange(40, 55, 100)).toEqual({ startPage: 41, endPage: 55, gainedPct: 15 });
  });

  it("never ends before it starts", () => {
    const r = audioRange(506, 51, 1000);
    expect(r.endPage).toBeGreaterThanOrEqual(r.startPage);
  });
});

describe("percentOf", () => {
  it("rounds and clamps", () => {
    expect(percentOf(503, 1000)).toBe(50);
    expect(percentOf(2000, 1000)).toBe(100);
    expect(percentOf(10, 0)).toBe(0);
  });
});

describe("defaultSessionFormat", () => {
  it("follows the last session for this book", () => {
    expect(defaultSessionFormat("physical", [session({ format: "audiobook" })])).toBe("audiobook");
  });
  it("falls back to the book's format", () => {
    expect(defaultSessionFormat("kindle", [])).toBe("kindle");
  });
});

describe("sessionPlace", () => {
  it("treats the old sentinel and blanks as no place", () => {
    expect(sessionPlace("—")).toBe("");
    expect(sessionPlace("  ")).toBe("");
    expect(sessionPlace(undefined)).toBe("");
    expect(sessionPlace(" Casa ")).toBe("Casa");
  });
});
