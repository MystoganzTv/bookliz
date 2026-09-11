/**
 * openLibraryProvider — /search.json mapping.
 *
 * Pins P1-8: a search doc is WORK-level. Its `isbn`, `publisher`, `language`
 * and `number_of_pages_median` aggregate every edition of the work, and
 * `first_publish_year` is the work's first publication. None of them may be
 * presented as edition data — that built a "chimera edition" (a German
 * edition's ISBN, a wrong language, an invented "-01-01" date) on the path
 * users actually hit while Google Books is in its 429 cooldown.
 */
jest.mock("../utils/fetchWithTimeout", () => ({
  fetchWithTimeout: jest.fn(),
  FetchTimeoutError: class FetchTimeoutError extends Error {},
  RateLimitedError: class RateLimitedError extends Error {},
  RATE_LIMIT_COOLDOWN_MS: 60_000,
}));

import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { fetchWorksByQuery } from "../services/openLibraryProvider";

const mockFetch = fetchWithTimeout as jest.Mock;

const SEARCH_DOC = {
  key: "/works/OL893415W",
  title: "Dune",
  author_name: ["Frank Herbert"],
  // ISBNs of EVERY edition of the work, in no particular order — the first
  // 13-digit one here belongs to a German edition.
  isbn: ["3453311957", "9783453311954", "9780441172719"],
  cover_i: 12345,
  first_publish_year: 1965,
  publisher: ["Heyne", "Ace"],
  number_of_pages_median: 604,
  subject: ["Science Fiction"],
  language: ["ger", "eng", "spa"],
  edition_count: 312,
};

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue(ok({ numFound: 1, docs: [SEARCH_DOC] }));
});

describe("fetchWorksByQuery — search docs are work-level only", () => {
  it("never fills edition-level fields from work-level aggregates", async () => {
    const [result] = await fetchWorksByQuery("Dune");

    expect(result).toBeDefined();
    const { bestEdition } = result!;
    expect(bestEdition.isbn13).toBeUndefined();
    expect(bestEdition.isbn10).toBeUndefined();
    expect(bestEdition.publisher).toBeUndefined();
    expect(bestEdition.pageCount).toBeUndefined();
    expect(bestEdition.language).toBeUndefined();
    expect(bestEdition.languageCode).toBeUndefined();
  });

  it("never invents a publication day/month from first_publish_year", async () => {
    const [result] = await fetchWorksByQuery("Dune");
    expect(result!.bestEdition.publishedDate).toBeUndefined();
    // The year is genuinely known — it is carried in its own field.
    expect(result!.bestEdition.publishedYear).toBe(1965);
  });

  it("keeps the fields that really are work-level", async () => {
    const [result] = await fetchWorksByQuery("Dune");
    const { partialWork, bestEdition } = result!;

    expect(partialWork.title).toBe("Dune");
    expect(partialWork.authors).toEqual(["Frank Herbert"]);
    expect(partialWork.workKey).toBe("/works/OL893415W");
    expect(partialWork.editionCount).toBe(312);
    expect(partialWork.genres.length).toBeGreaterThan(0);
    expect(bestEdition.title).toBe("Dune");
    expect(bestEdition.coverUrl).toContain("12345");
  });

  it("does not pick a canonical language out of the work's language list", async () => {
    const [result] = await fetchWorksByQuery("Dune");
    expect(result!.partialWork.canonicalLanguage).toBeUndefined();
    expect(result!.partialWork.canonicalLanguageCode).toBeUndefined();
  });
});
