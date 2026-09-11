/** knownWorks — catalog integrity (structural data only, no fabrication). */
import { KNOWN_SERIES, lookupByIsbn } from "../knownWorks";
import { validateIsbn13 } from "../isbnUtils";

describe("KNOWN_SERIES catalog integrity", () => {
  it("never maps one ISBN to two different books", () => {
    const seen = new Map<string, string>();
    for (const series of KNOWN_SERIES) {
      for (const book of series.books) {
        for (const isbn of book.isbns ?? []) {
          const label = `${series.name} #${book.order} (${book.titles[0]})`;
          const prior = seen.get(isbn);
          expect(prior === undefined || prior === label).toBe(true);
          seen.set(isbn, label);
        }
      }
    }
  });

  it("only lists checksum-valid ISBN-13s", () => {
    for (const series of KNOWN_SERIES) {
      for (const book of series.books) {
        for (const isbn of book.isbns ?? []) {
          expect(validateIsbn13(isbn)).toBe(true);
        }
      }
    }
  });

  it("resolves 9780439023528 to Mockingjay, not The Hunger Games", () => {
    const meta = lookupByIsbn("9780439023528");
    expect(meta?.originalTitle).toBe("Mockingjay");
    expect(meta?.seriesOrder).toBe(3);
  });
});
