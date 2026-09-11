/**
 * metadataResolver — cache policy.
 *
 * Pins the contract:
 *  1. A complete result (with synopsis) is cached for 7 days.
 *  2. A partial result (no synopsis) is cached for only 1 hour.
 *  3. Nothing is cached when any provider job was rate-limited or timed out —
 *     that result is partial by accident and must not be pinned.
 *  4. Cached envelopes carry their own expiry and are ignored once expired.
 */
import { FetchTimeoutError, RateLimitedError } from "../fetchWithTimeout";

jest.mock("../discoverCache", () => ({
  HOURS: 60 * 60 * 1000,
  readCache: jest.fn(),
  writeCache: jest.fn(),
}));

jest.mock("../../services/googleBooksProvider", () => ({
  fetchByKeyword: jest.fn(),
}));

jest.mock("../bookMetadata", () => {
  const actual = jest.requireActual("../bookMetadata");
  return {
    ...actual,
    fetchOpenLibraryRecordsByIsbn: jest.fn(),
    fetchBookMetadataByIsbn: jest.fn(),
    fetchBookMetadataByTitleAuthor: jest.fn(),
    fetchEditionOptionsByWorkKey: jest.fn(),
  };
});

import * as cache from "../discoverCache";
import * as GB from "../../services/googleBooksProvider";
import * as OLMeta from "../bookMetadata";
import { resolveMetadata } from "../metadataResolver";

const readCache = cache.readCache as jest.Mock;
const writeCache = cache.writeCache as jest.Mock;
const fetchByKeyword = GB.fetchByKeyword as jest.Mock;
const fetchOlRecords = OLMeta.fetchOpenLibraryRecordsByIsbn as jest.Mock;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ISBN = "9780441172719";

const gbBook = (overrides: Partial<GB.GenreBookResult> = {}): GB.GenreBookResult => ({
  id: "gb:1",
  title: "Dune",
  authors: ["Frank Herbert"],
  isbn13: ISBN,
  genres: [],
  googleBooksId: "1",
  language: "English",
  ...overrides,
});

const LONG_SYNOPSIS = "Paul Atreides, a brilliant and gifted young man born into a great destiny beyond his understanding.";

beforeEach(() => {
  jest.clearAllMocks();
  readCache.mockResolvedValue(null);
  writeCache.mockResolvedValue(undefined);
  fetchOlRecords.mockResolvedValue({});
});

describe("resolveMetadata cache TTL", () => {
  it("caches a complete result (with synopsis) for 7 days", async () => {
    fetchByKeyword.mockResolvedValue({ books: [gbBook({ description: LONG_SYNOPSIS })], totalItems: 1 });
    const before = Date.now();

    const result = await resolveMetadata({ isbn: ISBN });

    expect(result?.synopsis).toBe(LONG_SYNOPSIS);
    expect(writeCache).toHaveBeenCalledTimes(1);
    const [key, envelope] = writeCache.mock.calls[0]!;
    expect(String(key)).toMatch(/^meta3-/); // new prefix: old envelopes are ignored
    expect(envelope.data.title).toBe("Dune");
    expect(envelope.expiresAt).toBeGreaterThanOrEqual(before + 7 * DAY);
    expect(envelope.expiresAt).toBeLessThanOrEqual(Date.now() + 7 * DAY);
  });

  it("caches a partial result (no synopsis) for only 1 hour", async () => {
    fetchByKeyword.mockResolvedValue({ books: [gbBook({ description: undefined })], totalItems: 1 });
    const before = Date.now();

    const result = await resolveMetadata({ isbn: ISBN });

    expect(result?.title).toBe("Dune");
    expect(result?.synopsis).toBeUndefined();
    expect(writeCache).toHaveBeenCalledTimes(1);
    const envelope = writeCache.mock.calls[0]![1];
    expect(envelope.expiresAt).toBeGreaterThanOrEqual(before + HOUR);
    expect(envelope.expiresAt).toBeLessThan(before + 2 * HOUR);
  });

  it("does NOT cache when Google Books was rate-limited (result still returned)", async () => {
    fetchByKeyword.mockRejectedValue(new RateLimitedError("www.googleapis.com", 60_000));
    fetchOlRecords.mockResolvedValue({
      edition: { title: "Dune", authorName: "Frank Herbert", isbn: ISBN, synopsis: LONG_SYNOPSIS },
    });

    const result = await resolveMetadata({ isbn: ISBN });

    expect(result?.title).toBe("Dune");
    expect(writeCache).not.toHaveBeenCalled();
  });

  it("does NOT cache when a provider timed out", async () => {
    fetchByKeyword.mockResolvedValue({ books: [gbBook({ description: LONG_SYNOPSIS })], totalItems: 1 });
    fetchOlRecords.mockRejectedValue(new FetchTimeoutError("https://openlibrary.org/isbn/x.json", 10_000));

    const result = await resolveMetadata({ isbn: ISBN });

    expect(result?.title).toBe("Dune");
    expect(writeCache).not.toHaveBeenCalled();
  });

  it("asks providers to surface transient failures instead of swallowing them", async () => {
    fetchByKeyword.mockResolvedValue({ books: [gbBook()], totalItems: 1 });
    await resolveMetadata({ isbn: ISBN });
    // 6th positional arg of fetchByKeyword = rethrowTransient
    expect(fetchByKeyword.mock.calls[0]![5]).toBe(true);
    expect(fetchOlRecords).toHaveBeenCalledWith(ISBN, { rethrowTransient: true });
  });

  it("returns a fresh cached envelope without hitting the network", async () => {
    readCache.mockResolvedValue({ data: { title: "Dune (cached)" }, expiresAt: Date.now() + HOUR });

    const result = await resolveMetadata({ isbn: ISBN });

    expect(result?.title).toBe("Dune (cached)");
    expect(fetchByKeyword).not.toHaveBeenCalled();
  });

  it("ignores an expired cached envelope and refetches", async () => {
    readCache.mockResolvedValue({ data: { title: "Dune (stale)" }, expiresAt: Date.now() - 1 });
    fetchByKeyword.mockResolvedValue({ books: [gbBook({ title: "Dune (fresh)" })], totalItems: 1 });

    const result = await resolveMetadata({ isbn: ISBN });

    expect(result?.title).toBe("Dune (fresh)");
    expect(fetchByKeyword).toHaveBeenCalled();
  });

  it("ignores legacy envelopes that carry no expiry", async () => {
    readCache.mockResolvedValue({ title: "Dune (legacy shape)" });
    fetchByKeyword.mockResolvedValue({ books: [gbBook({ title: "Dune (fresh)" })], totalItems: 1 });

    const result = await resolveMetadata({ isbn: ISBN });
    expect(result?.title).toBe("Dune (fresh)");
  });
});

// ─── P1-11 — the OL work is its own candidate ─────────────────────────────────

describe("resolveMetadata — Open Library edition vs work", () => {
  const ES_ISBN = "9788408281153";
  const ENGLISH_SYNOPSIS =
    "Twenty-year-old Violet Sorrengail was supposed to enter the Scribe Quadrant, living a quiet life among books and history.";

  const spanishEdition = {
    title: "Alas de sangre",
    authorName: "Rebecca Yarros",
    isbn: ES_ISBN,
    publisher: "Planeta",
    pages: 704,
    language: "Spanish",
    editionKey: "/books/OL111M",
    workKey: "/works/OL1W",
  };
  const englishWork = {
    title: "Fourth Wing",
    synopsis: ENGLISH_SYNOPSIS,
    coverImageUri: "https://covers.openlibrary.org/b/id/99999-L.jpg",
    workKey: "/works/OL1W",
  };

  beforeEach(() => {
    fetchByKeyword.mockResolvedValue({ books: [], totalItems: 0 });
    fetchOlRecords.mockResolvedValue({ edition: spanishEdition, work: englishWork });
  });

  it("keeps the Spanish edition's publisher/pages/ISBN instead of discarding the whole record", async () => {
    const result = await resolveMetadata({ isbn: ES_ISBN, language: "Spanish" });

    expect(result?.title).toBe("Alas de sangre");
    expect(result?.publisher).toBe("Planeta");
    expect(result?.pages).toBe(704);
    expect(result?.isbn).toBe(ES_ISBN);
    expect(result?.editionKey).toBe("/books/OL111M");
  });

  it("never lets the English work's synopsis or cover into a Spanish book", async () => {
    const result = await resolveMetadata({ isbn: ES_ISBN, language: "Spanish" });

    expect(result?.synopsis).toBeUndefined();
    expect(result?.coverImageUri).toBeUndefined();
    // Structural data may still flow from the work.
    expect(result?.workKey).toBe("/works/OL1W");
  });

  it("still uses the work record when no language lock is active", async () => {
    const result = await resolveMetadata({ isbn: ES_ISBN });

    expect(result?.synopsis).toBe(ENGLISH_SYNOPSIS);
    expect(result?.coverImageUri).toContain("99999");
  });
});
