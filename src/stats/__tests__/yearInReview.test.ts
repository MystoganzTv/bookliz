import type { Book, ReadingSession } from "../../types/models";
import { buildYearInReview, timeOfDayOf, yearsWithReading } from "../yearInReview";

const book = (id: string, extra: Partial<Book> = {}, status: Partial<Book["userStatus"]> = {}): Book =>
  ({
    id,
    title: `Book ${id}`,
    authorId: `a-${id}`,
    synopsis: "",
    genre: [],
    pages: 300,
    publishedDate: "",
    publisher: "",
    language: "",
    isbn: "",
    format: "paperback",
    coverGradient: ["#000", "#fff"],
    ...extra,
    userStatus: {
      status: "read",
      ownership: "owned",
      wishlist: false,
      wantToBuy: false,
      progressPercent: 100,
      notes: "",
      favoriteQuotes: [],
      ...status,
    },
  }) as Book;

const session = (bookId: string, date: string, minutesRead: number, extra: Partial<ReadingSession> = {}): ReadingSession =>
  ({
    id: `${bookId}-${date}-${minutesRead}`,
    bookId,
    date,
    startPage: 0,
    endPage: 10,
    pagesRead: 10,
    minutesRead,
    location: "",
    mood: "",
    format: "paperback",
    notes: "",
    difficulty: "easy",
    enjoymentRating: 0,
    pagesPerHour: 0,
    ...extra,
  }) as ReadingSession;

describe("buildYearInReview", () => {
  const books = [
    book("1", { genre: ["Fantasy", "Adventure"], pages: 500 }, { finishDate: "2026-02-10", rating: 5 }),
    book("2", { genre: ["Fantasy"], pages: 200, authorId: "a-1" }, { finishDate: "2026-07-01", rating: 3 }),
    book("3", { genre: ["Horror"] }, { finishDate: "2025-12-31", rating: 4 }),
    book("4", {}, { status: "reading" }),
  ];
  const sessions = [
    session("1", "2026-02-08", 30, { startTime: "07:30" }),
    session("1", "2026-02-09", 45, { startTime: "21:10" }),
    session("1", "2026-02-10", 60, { startTime: "21:40" }),
    session("4", "2026-05-03", 20, { format: "audiobook" }),
    session("3", "2025-12-30", 99),
  ];

  const review = buildYearInReview(books, sessions, 2026);

  it("adds up only the sessions of that year", () => {
    expect(review.minutes).toBe(155);
    expect(review.listeningMinutes).toBe(20);
    expect(review.pages).toBe(40);
    expect(review.sessions).toBe(4);
    expect(review.daysRead).toBe(4);
  });

  it("finds the longest run of consecutive days", () => {
    expect(review.longestStreak).toBe(3);
  });

  it("counts books finished in the year, in order", () => {
    expect(review.booksFinished).toBe(2);
    expect(review.pagesFinished).toBe(700);
    expect(review.firstFinished?.bookId).toBe("1");
    expect(review.lastFinished?.bookId).toBe("2");
    expect(review.longestFinished?.bookId).toBe("1");
    expect(review.averageRating).toBe(4);
    expect(review.topRated.map((b) => b.bookId)).toEqual(["1", "2"]);
  });

  it("ranks authors and genres of finished books", () => {
    expect(review.topAuthorIds[0]).toEqual({ label: "a-1", value: 2 });
    expect(review.topGenres[0]).toEqual({ label: "Fantasy", value: 2 });
  });

  it("knows the busiest month, weekday and time of day", () => {
    expect(review.busiestMonth).toBe(1); // February
    expect(review.favoriteTimeOfDay).toBe("evening");
    expect(review.mostTimeWith?.bookId).toBe("1");
    expect(review.monthlyMinutes).toHaveLength(12);
  });

  it("an empty year is all zeros, not invented", () => {
    const empty = buildYearInReview(books, sessions, 2020);
    expect(empty.minutes).toBe(0);
    expect(empty.booksFinished).toBe(0);
    expect(empty.busiestMonth).toBeNull();
    expect(empty.favoriteTimeOfDay).toBeNull();
    expect(empty.averageRating).toBeNull();
    expect(empty.longestStreak).toBe(0);
  });
});

describe("helpers", () => {
  it("buckets the time of day", () => {
    expect(timeOfDayOf("06:00")).toBe("morning");
    expect(timeOfDayOf("13:00")).toBe("afternoon");
    expect(timeOfDayOf("22:59")).toBe("evening");
    expect(timeOfDayOf("23:30")).toBe("night");
    expect(timeOfDayOf(undefined)).toBeNull();
  });

  it("lists years with reading, newest first, always the current one", () => {
    expect(yearsWithReading([], [session("1", "2024-03-01", 5)], 2026)).toEqual([2026, 2024]);
  });
});
