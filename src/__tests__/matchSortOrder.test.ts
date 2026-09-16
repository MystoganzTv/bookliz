/**
 * Sorting the search results must actually sort them. Regression: "Newest"
 * read only `publishedDate`, which Open Library rows never carry, so they all
 * sorted as year 0 and kept popularity order under the Google Books rows.
 */
import { compareMatches, matchPublishedYear, titleSortKey } from "../screens/bookIntake/matchLogic";
import { BookMatch } from "../services/bookLookupService";

const m = (id: string, over: Partial<BookMatch>): BookMatch =>
  ({ id, title: id, authors: ["David Baldacci"], genres: [], source: "open-library", coverUrl: "x", ...over }) as BookMatch;

const rows = [
  m("Nash Falls", { publishedDate: "2025-11-11", source: "google-books", ratingsCount: 3 }),
  m("Redemption", { publishedDate: "2019-04-16", source: "google-books", ratingsCount: 1 }),
  m("Wish You Well", { publishedYear: 2000, ratingsCount: 900 }),
  m("The Forgotten", { publishedYear: 2012, ratingsCount: 500 }),
  m("Stone Cold", { publishedYear: 2007, ratingsCount: 400 }),
  m("Total Control", { publishedYear: 1996, ratingsCount: 300 }),
  m("The Escape", { publishedYear: 2014, ratingsCount: 13 }),
];
const tokens = ["david", "baldacci"];
const order = (sort: Parameters<typeof compareMatches>[2]) =>
  [...rows].sort((a, b) => compareMatches(a, b, sort, tokens)).map((row) => row.id);

describe("search result sorting", () => {
  it("reads the year from publishedYear when there is no edition date", () => {
    expect(matchPublishedYear({ publishedYear: 2012 })).toBe(2012);
    expect(matchPublishedYear({ publishedDate: "2023-01-01", publishedYear: 1996 })).toBe(1996);
    expect(matchPublishedYear({})).toBe(0);
  });

  it("newest first across Google Books and Open Library rows", () => {
    expect(order("year_desc")).toEqual([
      "Nash Falls", "Redemption", "The Escape", "The Forgotten", "Stone Cold", "Wish You Well", "Total Control",
    ]);
  });

  it("oldest first", () => {
    expect(order("year_asc")[0]).toBe("Total Control");
    const asc = order("year_asc");
    expect(asc[asc.length - 1]).toBe("Nash Falls");
  });

  it("A–Z ignores leading articles", () => {
    expect(order("title")).toEqual([
      "The Escape", "The Forgotten", "Nash Falls", "Redemption", "Stone Cold", "Total Control", "Wish You Well",
    ]);
    expect(titleSortKey("El nombre del viento")).toBe("nombre del viento");
  });
});
