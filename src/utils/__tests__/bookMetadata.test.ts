/**
 * bookMetadata — Open Library mapping rules.
 *
 * Pins two owner mandates:
 *
 *  P1-8  A /search.json doc is WORK-level: its ISBN (possibly an ISBN-10 of a
 *        foreign edition), publisher, median page count, language list and
 *        first_publish_year must never be presented as edition data.
 *
 *  P1-11 An ISBN lookup returns the EDITION and the WORK as two separate
 *        records. The work's synopsis and cover must not be blended into the
 *        edition: that made a Spanish edition carry an English description
 *        (discarded whole as a language mismatch, losing publisher/pages/ISBN)
 *        and let the original English cover pass as a language-locked field.
 */
jest.mock("../fetchWithTimeout", () => ({
  fetchWithTimeout: jest.fn(),
  FetchTimeoutError: class FetchTimeoutError extends Error {},
  RateLimitedError: class RateLimitedError extends Error {},
  RATE_LIMIT_COOLDOWN_MS: 60_000,
}));

import { fetchWithTimeout } from "../fetchWithTimeout";
import { fetchOpenLibraryRecordsByIsbn, searchBookMetadata } from "../bookMetadata";

const mockFetch = fetchWithTimeout as jest.Mock;

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const notFound = { ok: false, status: 404, json: async () => ({}) };

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── P1-8 — search docs ───────────────────────────────────────────────────────

describe("searchBookMetadata — work-level docs stay work-level", () => {
  const DOC = {
    key: "/works/OL893415W",
    title: "Dune",
    author_name: ["Frank Herbert"],
    isbn: ["3453311957", "9783453311954"], // ISBN-10 first, German edition
    cover_i: 777,
    first_publish_year: 1965,
    publisher: ["Heyne"],
    number_of_pages_median: 604,
    subject: ["Science Fiction"],
    language: ["ger", "eng"],
    edition_count: 312,
  };

  it("leaves ISBN, publisher, pages, language and date undefined", async () => {
    mockFetch.mockResolvedValue(ok({ numFound: 1, docs: [DOC] }));

    const { results } = await searchBookMetadata("Dune");
    const first = results[0]!;

    expect(first.isbn).toBeUndefined();
    expect(first.publisher).toBeUndefined();
    expect(first.pages).toBeUndefined();
    expect(first.language).toBeUndefined();
    expect(first.publishedDate).toBeUndefined(); // never "1965-01-01"
  });

  it("keeps title, author, genres, cover and workKey", async () => {
    mockFetch.mockResolvedValue(ok({ numFound: 1, docs: [DOC] }));

    const { results } = await searchBookMetadata("Dune");
    const first = results[0]!;

    expect(first.title).toBe("Dune");
    expect(first.authorName).toBe("Frank Herbert");
    expect(first.workKey).toBe("/works/OL893415W");
    expect(first.editionCount).toBe(312);
    expect(first.coverImageUri).toContain("777");
    expect(first.genre?.length).toBeGreaterThan(0);
  });
});

// ─── P1-11 — edition vs work ──────────────────────────────────────────────────

describe("fetchOpenLibraryRecordsByIsbn — edition and work stay separate", () => {
  const ISBN = "9788408281153"; // Alas de sangre (Planeta, Spanish)
  const ENGLISH_SYNOPSIS =
    "Twenty-year-old Violet Sorrengail was supposed to enter the Scribe Quadrant, living a quiet life among books.";

  const routeFetch = () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes(`/isbn/${ISBN}.json`)) {
        return ok({
          key: "/books/OL111M",
          title: "Alas de sangre",
          authors: [{ key: "/authors/OL1A" }],
          works: [{ key: "/works/OL1W" }],
          publishers: ["Planeta"],
          publish_date: "2023",
          number_of_pages: 704,
          isbn_13: [ISBN],
          languages: [{ key: "/languages/spa" }],
          subjects: ["Fantasy"],
          // No description and no covers on the edition record — the common case.
        });
      }
      if (url.includes("/authors/OL1A.json")) return ok({ name: "Rebecca Yarros" });
      if (url.includes("/works/OL1W.json")) {
        return ok({
          key: "/works/OL1W",
          title: "Fourth Wing",
          description: ENGLISH_SYNOPSIS,
          subjects: ["Fantasy"],
          covers: [99999], // the ORIGINAL (English) cover
        });
      }
      return notFound;
    });
  };

  it("never blends the work's synopsis or cover into the edition", async () => {
    routeFetch();

    const { edition } = await fetchOpenLibraryRecordsByIsbn(ISBN);

    expect(edition?.language).toBe("Spanish");
    expect(edition?.synopsis).toBeUndefined();
    expect(edition?.coverImageUri).toBeUndefined();
  });

  it("keeps the edition data Open Library is actually best at", async () => {
    routeFetch();

    const { edition } = await fetchOpenLibraryRecordsByIsbn(ISBN);

    expect(edition?.isbn).toBe(ISBN);
    expect(edition?.publisher).toBe("Planeta");
    expect(edition?.pages).toBe(704);
    expect(edition?.editionKey).toBe("/books/OL111M");
    expect(edition?.workKey).toBe("/works/OL1W");
    expect(edition?.authorName).toBe("Rebecca Yarros");
  });

  it("returns the work's synopsis and cover as a separate record", async () => {
    routeFetch();

    const { work } = await fetchOpenLibraryRecordsByIsbn(ISBN);

    expect(work?.title).toBe("Fourth Wing");
    expect(work?.synopsis).toBe(ENGLISH_SYNOPSIS);
    expect(work?.coverImageUri).toContain("99999");
    // The work record carries no language of its own — the resolver must judge
    // it on evidence, never assume it matches the edition.
    expect(work?.language).toBeUndefined();
  });

  it("returns an empty record when the ISBN is unknown", async () => {
    mockFetch.mockResolvedValue(notFound);
    await expect(fetchOpenLibraryRecordsByIsbn(ISBN)).resolves.toEqual({});
  });
});
