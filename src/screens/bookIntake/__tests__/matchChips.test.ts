/**
 * The chips on a search result are the app's most repeated claim about an
 * edition: three little facts, on every row, at a glance. So the rule they are
 * tested against is not "do they render" but "do they stay quiet when the
 * catalogue said nothing".
 */
import { BookMatch } from "../../../services/bookLookupService";
import { formatPublished, matchChips } from "../matchLogic";

const t = (key: string) => key;

const match = (over: Partial<BookMatch>): BookMatch =>
  ({ id: "1", title: "Circe", authors: ["Madeline Miller"], genres: [], source: "google-books", ...over }) as BookMatch;

describe("matchChips", () => {
  it("shows nothing at all for a result with no edition facts", () => {
    expect(matchChips(match({}), t)).toEqual([]);
  });

  it("shows the binding when a source stated one", () => {
    const chips = matchChips(match({ format: "hardcover" }), t);
    expect(chips.map((c) => c.label)).toEqual(["editBook.fmtHardcover"]);
  });

  it("says nothing about the binding when it is 'other'", () => {
    // "Other" is our parser shrugging, not a fact about the book.
    expect(matchChips(match({ format: "other" }), t)).toEqual([]);
  });

  it("shows the language only when the catalogue labelled it", () => {
    expect(matchChips(match({ language: "es" }), t).map((c) => c.label)).toEqual(["Spanish"]);
    expect(matchChips(match({ language: undefined }), t)).toEqual([]);
  });

  it("keeps the three chips in a stable order", () => {
    const chips = matchChips(match({ format: "paperback", language: "en", publishedDate: "2020-04-14" }), t, "en-US");
    expect(chips.map((c) => c.key)).toEqual(["format", "language", "published"]);
  });
});

describe("formatPublished", () => {
  it("shows a bare year as a year, not as January 1st", () => {
    expect(formatPublished("2018")).toBe("2018");
  });

  it("keeps a year-and-month at year-and-month", () => {
    expect(formatPublished("2018-04", "en-US")).toBe("Apr 2018");
  });

  it("shows a full date when the source had one", () => {
    expect(formatPublished("2020-04-14", "en-US")).toBe("Apr 14, 2020");
  });

  it("answers nothing for junk rather than guessing", () => {
    expect(formatPublished("someday")).toBeUndefined();
    expect(formatPublished(undefined)).toBeUndefined();
  });
});
