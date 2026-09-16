/**
 * The Saga hub may only say "complete" about a saga, never about a shelf.
 * Regression: owning and finishing only book 3 of The Empyrean showed
 * "1/1 finished · 100 % · Saga complete".
 */
import { Book } from "../types/models";
import { buildSagaProgress, cleanSeriesName, findKnownSeries } from "../utils/sagaProgress";

const book = (over: Partial<Book> & { status?: string }): Book => {
  const { status = "want-to-read", ...rest } = over;
  return {
    id: rest.id ?? `b-${Math.random()}`,
    title: "T",
    authorId: "a",
    seriesName: "Some Saga",
    seriesId: "series-some-saga",
    ...rest,
    userStatus: { status, ownership: "owned", wishlist: false, wantToBuy: false, favoriteQuotes: [], notes: "" },
  } as unknown as Book;
};

describe("cleanSeriesName", () => {
  it.each([
    ["Book 3 • The Empyrean", "The Empyrean", 3],
    ["Book 3 · The Empyrean", "The Empyrean", 3],
    ["The Empyrean, #3", "The Empyrean", 3],
    ["The Empyrean #3", "The Empyrean", 3],
    ["The Empyrean (Book 3)", "The Empyrean", 3],
    ["Libro 2 - Empíreo", "Empíreo", 2],
    ["The Empyrean", "The Empyrean", undefined],
  ])("%s → %s", (raw, name, number) => {
    expect(cleanSeriesName(raw)).toEqual({ name, number });
  });

  it("does not eat words that merely end in a number word", () => {
    expect(cleanSeriesName("Facebook 3")).toEqual({ name: "Facebook 3", number: undefined });
  });
});

describe("findKnownSeries", () => {
  it("matches curated series through dirty names and translations", () => {
    expect(findKnownSeries("Book 3 • The Empyrean")?.name).toBe("The Empyrean");
    expect(findKnownSeries("Empíreo")?.name).toBe("The Empyrean");
    expect(findKnownSeries("A saga nobody catalogued")).toBeNull();
  });
});

describe("buildSagaProgress", () => {
  it("book 3 read, books 1-2 not owned → 1/3, not complete, two missing slots", () => {
    const onyx = book({ title: "Alas de ónix", seriesName: "Book 3 • The Empyrean", status: "read" });
    const progress = buildSagaProgress([onyx]);
    expect(progress.name).toBe("The Empyrean");
    expect(progress.total).toBeGreaterThanOrEqual(3);
    expect(progress.finished).toBe(1);
    expect(progress.complete).toBe(false);
    expect(progress.slots.slice(0, 2).map((slot) => slot.kind)).toEqual(["missing", "missing"]);
  });

  it("a number alone proves the earlier books exist, even for uncatalogued sagas", () => {
    const progress = buildSagaProgress([book({ seriesNumber: 4, status: "read" })]);
    expect(progress.total).toBe(4);
    expect(progress.missing).toBe(3);
    expect(progress.complete).toBe(false);
  });

  it("complete only when every known position has a finished book", () => {
    const books = [1, 2, 3].map((n) => book({ id: `b${n}`, seriesName: "The Empyrean", seriesNumber: n, status: "read" }));
    expect(buildSagaProgress(books).complete).toBe(true);
    books[1] = book({ id: "b2", seriesName: "The Empyrean", seriesNumber: 2, status: "reading" });
    expect(buildSagaProgress(books).complete).toBe(false);
  });

  it("unnumbered, uncatalogued books: never complete, but the shelf can be finished", () => {
    const progress = buildSagaProgress([book({ status: "read" }), book({ status: "read" })]);
    expect(progress.lengthKnown).toBe(false);
    expect(progress.total).toBe(2);
    expect(progress.complete).toBe(false);
    expect(progress.shelfFinished).toBe(true);
  });

  it("two copies of the same number count as one position", () => {
    const progress = buildSagaProgress([
      book({ id: "print", seriesNumber: 1, status: "read" }),
      book({ id: "audio", seriesNumber: 1, status: "want-to-read" }),
    ]);
    expect(progress.total).toBe(1);
    expect(progress.finished).toBe(1);
  });
});
