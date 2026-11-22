import type { Book, ReadingSession } from "../../types/models";
import {
  detectMoment,
  FINISHED_GAP_DAYS,
  LibraryTally,
  MIN_GAP_DAYS,
  recordAsk,
  ReviewLedger,
  shouldAsk,
  tallyLibrary,
} from "../reviewPrompt";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-22T18:00:00").getTime();

const tally = (over: Partial<LibraryTally> = {}): LibraryTally => ({
  books: 5,
  finishedReads: 2,
  sessions: 10,
  readThisYear: 2,
  yearlyGoal: 15,
  year: 2026,
  ...over,
});

const book = (status: string, extra: Record<string, unknown> = {}) =>
  ({ id: Math.random().toString(), userStatus: { status, ...extra } }) as unknown as Book;

describe("tallyLibrary", () => {
  it("counts rereads and only this year's finishes", () => {
    const t = tallyLibrary(
      [
        book("read", { readCount: 2, finishDate: "2026-03-01" }),
        book("read", { finishDate: "2025-12-30" }),
        book("reading"),
      ],
      [{} as ReadingSession, {} as ReadingSession],
      15,
      new Date(NOW)
    );
    expect(t).toEqual({ books: 3, finishedReads: 3, sessions: 2, readThisYear: 1, yearlyGoal: 15, year: 2026 });
  });

  it("a 1 January finish belongs to its own year in any time zone", () => {
    const t = tallyLibrary([book("read", { finishDate: "2026-01-01" })], [], 15, new Date(NOW));
    expect(t.readThisYear).toBe(1);
  });
});

describe("detectMoment", () => {
  it("first book: an empty shelf gaining exactly one book", () => {
    expect(detectMoment(tally({ books: 0, finishedReads: 0, readThisYear: 0, sessions: 0 }), tally({ books: 1, finishedReads: 0, readThisYear: 0, sessions: 0 }))).toBe("first-book");
  });

  it("a second book is not a moment", () => {
    expect(detectMoment(tally({ books: 1 }), tally({ books: 2 }))).toBeNull();
  });

  it("a cloud download or import (jump of more than one) never triggers", () => {
    expect(detectMoment(tally({ books: 0, finishedReads: 0 }), tally({ books: 40, finishedReads: 12 }))).toBeNull();
    expect(detectMoment(tally({ sessions: 2 }), tally({ sessions: 9 }))).toBeNull();
    expect(detectMoment(tally({ finishedReads: 2 }), tally({ finishedReads: 5 }))).toBeNull();
  });

  it("finishing a book", () => {
    expect(detectMoment(tally(), tally({ finishedReads: 3, readThisYear: 3 }))).toBe("book-finished");
  });

  it("third session, and only the third", () => {
    expect(detectMoment(tally({ sessions: 2 }), tally({ sessions: 3 }))).toBe("third-session");
    expect(detectMoment(tally({ sessions: 3 }), tally({ sessions: 4 }))).toBeNull();
  });

  it("the goal beats a plain finish when the finish reaches it", () => {
    expect(
      detectMoment(tally({ readThisYear: 14 }), tally({ readThisYear: 15, finishedReads: 3 }))
    ).toBe("goal-reached");
  });

  it("no goal set means no goal moment", () => {
    expect(
      detectMoment(tally({ readThisYear: 0, yearlyGoal: 0 }), tally({ readThisYear: 1, yearlyGoal: 0, finishedReads: 3 }))
    ).toBe("book-finished");
  });

  it("nothing changed, or something was removed", () => {
    expect(detectMoment(tally(), tally())).toBeNull();
    expect(detectMoment(tally({ books: 1 }), tally({ books: 0 }))).toBeNull();
  });
});

describe("shouldAsk / recordAsk", () => {
  const empty: ReviewLedger = { done: [] };

  it("asks the first time", () => {
    expect(shouldAsk("first-book", empty, NOW, 2026)).toBe(true);
  });

  it("one-off moments are spent once", () => {
    const after = recordAsk("first-book", empty, NOW, 2026);
    expect(shouldAsk("first-book", after, NOW + 400 * DAY, 2026)).toBe(false);
    const thirdDone = recordAsk("third-session", empty, NOW, 2026);
    expect(shouldAsk("third-session", thirdDone, NOW + 400 * DAY, 2026)).toBe(false);
  });

  it("the yearly goal can be celebrated again next year", () => {
    const after = recordAsk("goal-reached", empty, NOW, 2026);
    expect(shouldAsk("goal-reached", after, NOW + 400 * DAY, 2026)).toBe(false);
    expect(shouldAsk("goal-reached", after, NOW + 400 * DAY, 2027)).toBe(true);
  });

  it("keeps a minimum gap between any two requests", () => {
    const after = recordAsk("first-book", empty, NOW, 2026);
    expect(shouldAsk("third-session", after, NOW + (MIN_GAP_DAYS - 1) * DAY, 2026)).toBe(false);
    expect(shouldAsk("third-session", after, NOW + MIN_GAP_DAYS * DAY, 2026)).toBe(true);
  });

  it("finished books repeat, but at most once a month", () => {
    const after = recordAsk("book-finished", empty, NOW, 2026);
    expect(after.done).toEqual([]);
    expect(shouldAsk("book-finished", after, NOW + 10 * DAY, 2026)).toBe(false);
    expect(shouldAsk("book-finished", after, NOW + FINISHED_GAP_DAYS * DAY, 2026)).toBe(true);
  });
});
