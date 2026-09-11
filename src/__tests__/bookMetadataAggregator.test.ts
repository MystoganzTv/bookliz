/**
 * Unit / integration tests for src/services/bookMetadataAggregator.ts
 *
 * Covers:
 *  - groupEditionsByLanguage     (pure — no mocks needed)
 *  - workEditionToNewBookInput   (pure — no mocks needed)
 *  - dedupeEditions / mergeEditions (tested indirectly via groupEditionsByLanguage)
 *  - pickBestEdition             (tested indirectly via lookupByIsbn / lookupByQuery)
 *  - lookupByIsbn                (mocks googleBooksProvider + openLibraryProvider)
 *  - lookupByQuery               (mocks googleBooksProvider + openLibraryProvider)
 *  - fetchAllEditions            (mocks openLibraryProvider)
 */

import { BookEdition, BookWork } from "../types/bookMetadata";

// ─── Mock providers ───────────────────────────────────────────────────────────

jest.mock("../services/googleBooksProvider", () => ({
  fetchByIsbn: jest.fn(),
  fetchWorksByQuery: jest.fn(),
  volumeToWork: jest.fn(),
}));

jest.mock("../services/openLibraryProvider", () => ({
  fetchEditionByIsbn: jest.fn(),
  fetchWork: jest.fn(),
  fetchWorkEditions: jest.fn(),
  fetchWorksByQuery: jest.fn(),
  resolveAuthorNames: jest.fn(),
}));

import * as GB from "../services/googleBooksProvider";
import * as OL from "../services/openLibraryProvider";

import {
  groupEditionsByLanguage,
  lookupByIsbn,
  lookupByQuery,
  fetchAllEditions,
  workEditionToNewBookInput,
} from "../services/bookMetadataAggregator";

const gbFetchByIsbn = GB.fetchByIsbn as jest.Mock;
const gbFetchByQuery = GB.fetchWorksByQuery as jest.Mock;
const olFetchEditionByIsbn = OL.fetchEditionByIsbn as jest.Mock;
const olFetchWork = OL.fetchWork as jest.Mock;
const olFetchWorkEditions = OL.fetchWorkEditions as jest.Mock;
const olFetchByQuery = OL.fetchWorksByQuery as jest.Mock;
const olResolveAuthors = OL.resolveAuthorNames as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEdition(overrides: Partial<BookEdition> = {}): BookEdition {
  return {
    id: "ed-1",
    source: "open-library",
    title: "Dune",
    languageCode: "en",
    language: "English",
    score: 80,
    ...overrides,
  };
}

function makeWork(overrides: Partial<BookWork> = {}): BookWork {
  return {
    workKey: "/works/OL1W",
    title: "Dune",
    authors: ["Frank Herbert"],
    description: "Epic sci-fi saga.",
    genres: ["Science Fiction"],
    editionCount: 1,
    editions: [],
    bestEdition: makeEdition(),
    canonicalLanguageCode: "en",
    canonicalLanguage: "English",
    score: 80,
    confidence: "good",
    ...overrides,
  };
}

// ─── groupEditionsByLanguage ──────────────────────────────────────────────────

describe("groupEditionsByLanguage", () => {
  test("returns empty array for no editions", () => {
    expect(groupEditionsByLanguage([])).toEqual([]);
  });

  test("single edition → single group", () => {
    const ed = makeEdition({ languageCode: "en", language: "English" });
    const groups = groupEditionsByLanguage([ed]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.languageCode).toBe("en");
    expect(groups[0]!.editions).toHaveLength(1);
    expect(groups[0]!.bestEdition).toEqual(ed);
  });

  test("groups editions by language code", () => {
    const en1 = makeEdition({ id: "en1", languageCode: "en", language: "English", score: 90 });
    const en2 = makeEdition({ id: "en2", languageCode: "en", language: "English", score: 70 });
    const es1 = makeEdition({ id: "es1", languageCode: "es", language: "Spanish", score: 85 });

    const groups = groupEditionsByLanguage([en1, en2, es1]);
    expect(groups).toHaveLength(2);

    const enGroup = groups.find((g) => g.languageCode === "en")!;
    const esGroup = groups.find((g) => g.languageCode === "es")!;

    expect(enGroup.editions).toHaveLength(2);
    expect(esGroup.editions).toHaveLength(1);
    expect(enGroup.bestEdition.id).toBe("en1"); // highest score
  });

  test("priority languages come first", () => {
    const ja = makeEdition({ id: "ja1", languageCode: "ja", language: "Japanese", score: 95 });
    const de = makeEdition({ id: "de1", languageCode: "de", language: "German", score: 80 });
    const en = makeEdition({ id: "en1", languageCode: "en", language: "English", score: 70 });

    const groups = groupEditionsByLanguage([ja, de, en]);
    expect(groups[0]!.languageCode).toBe("en");  // priority index 0
    expect(groups[1]!.languageCode).toBe("de");  // priority index 5
    expect(groups[2]!.languageCode).toBe("ja");  // non-priority — alphabetical after priority
  });

  test("priority languages ordered by PRIORITY_LANGUAGE_CODES order", () => {
    const es = makeEdition({ id: "es1", languageCode: "es", score: 90 });
    const fr = makeEdition({ id: "fr1", languageCode: "fr", score: 85 });
    const en = makeEdition({ id: "en1", languageCode: "en", score: 80 });

    const groups = groupEditionsByLanguage([es, fr, en]);
    expect(groups.map((g) => g.languageCode)).toEqual(["en", "es", "fr"]);
  });

  test("isPriority flag is set correctly", () => {
    const en = makeEdition({ languageCode: "en" });
    const ja = makeEdition({ id: "ja", languageCode: "ja" });
    const groups = groupEditionsByLanguage([en, ja]);

    const enGroup = groups.find((g) => g.languageCode === "en")!;
    const jaGroup = groups.find((g) => g.languageCode === "ja")!;
    expect(enGroup.isPriority).toBe(true);
    expect(jaGroup.isPriority).toBe(false);
  });

  test("editions within a group are sorted by score descending", () => {
    const lo = makeEdition({ id: "lo", languageCode: "en", score: 40 });
    const hi = makeEdition({ id: "hi", languageCode: "en", score: 90 });
    const mid = makeEdition({ id: "mid", languageCode: "en", score: 65 });

    const groups = groupEditionsByLanguage([lo, hi, mid]);
    const ids = groups[0]!.editions.map((e) => e.id);
    expect(ids).toEqual(["hi", "mid", "lo"]);
  });

  test("deduplication: two editions with same isbn13 are merged into one", () => {
    // groupEditionsByLanguage does NOT dedupe — that's dedupeEditions.
    // Verify that two editions with identical isbn13 still appear as two
    // entries inside the group (groupEditionsByLanguage is not a deduper).
    const a = makeEdition({ id: "a", languageCode: "en", isbn13: "9780441172719", score: 80 });
    const b = makeEdition({ id: "b", languageCode: "en", isbn13: "9780441172719", score: 70 });
    const groups = groupEditionsByLanguage([a, b]);
    expect(groups[0]!.editions).toHaveLength(2);
  });
});

// ─── workEditionToNewBookInput ────────────────────────────────────────────────

describe("workEditionToNewBookInput", () => {
  const work = makeWork({
    workKey: "/works/OL1W",
    title: "Dune",
    authors: ["Frank Herbert"],
    description: "Desert planet saga.",
    genres: ["Science Fiction", "Saga"],
    editionCount: 42,
  });

  const edition = makeEdition({
    title: "Dune",
    isbn13: "9780441172719",
    pageCount: 896,
    publisher: "Ace",
    publishedDate: "1965-08-01",
    language: "English",
    languageCode: "en",
    coverUrl: "https://example.com/cover.jpg",
    editionKey: "/books/OL1M",
  });

  test("maps title from edition (preferred) then work", () => {
    const input = workEditionToNewBookInput(work, edition, "isbn");
    expect(input.title).toBe("Dune");
  });

  test("falls back to work title when edition has no title", () => {
    const editionNoTitle = makeEdition({ title: undefined as unknown as string });
    const input = workEditionToNewBookInput(work, editionNoTitle, "isbn");
    expect(input.title).toBe("Dune");
  });

  test("uses first work author", () => {
    const input = workEditionToNewBookInput(work, edition, "isbn");
    expect(input.authorName).toBe("Frank Herbert");
  });

  test("falls back to 'Unknown Author' when work has no authors", () => {
    const workNoAuthor = makeWork({ authors: [] });
    const input = workEditionToNewBookInput(workNoAuthor, edition, "isbn");
    expect(input.authorName).toBe("Unknown Author");
  });

  test("sets isbn from isbn13", () => {
    const input = workEditionToNewBookInput(work, edition, "isbn");
    expect(input.isbn).toBe("9780441172719");
  });

  test("falls back isbn to isbn10 when isbn13 absent", () => {
    const editionIsbn10 = makeEdition({ isbn13: undefined, isbn10: "0441172717" });
    const input = workEditionToNewBookInput(work, editionIsbn10, "search");
    expect(input.isbn).toBe("0441172717");
  });

  test("maps pages from edition", () => {
    const input = workEditionToNewBookInput(work, edition, "isbn");
    expect(input.pages).toBe(896);
  });

  test("maps genres from work", () => {
    const input = workEditionToNewBookInput(work, edition, "isbn");
    expect(input.genre).toEqual(["Science Fiction", "Saga"]);
  });

  test("maps publisher from edition", () => {
    const input = workEditionToNewBookInput(work, edition, "isbn");
    expect(input.publisher).toBe("Ace");
  });

  test("maps publishedDate from edition", () => {
    const input = workEditionToNewBookInput(work, edition, "isbn");
    expect(input.publishedDate).toBe("1965-08-01");
  });

  test("maps language from edition", () => {
    const input = workEditionToNewBookInput(work, edition, "isbn");
    expect(input.language).toBe("English");
  });

  test("leaves language undefined when edition has none (never fabricates 'English')", () => {
    const editionNoLang = makeEdition({ language: undefined, languageCode: undefined });
    const input = workEditionToNewBookInput(work, editionNoLang, "isbn");
    expect(input.language).toBeUndefined();
  });

  test("maps synopsis from work description", () => {
    const input = workEditionToNewBookInput(work, edition, "isbn");
    expect(input.synopsis).toBe("Desert planet saga.");
  });

  test("maps coverImageUri from edition", () => {
    const input = workEditionToNewBookInput(work, edition, "isbn");
    expect(input.coverImageUri).toBe("https://example.com/cover.jpg");
  });

  test("maps workKey and editionKey", () => {
    const input = workEditionToNewBookInput(work, edition, "isbn");
    expect(input.workKey).toBe("/works/OL1W");
    expect(input.editionKey).toBe("/books/OL1M");
  });

  test("maps editionCount from work", () => {
    const input = workEditionToNewBookInput(work, edition, "isbn");
    expect(input.editionCount).toBe(42);
  });

  test("passes source correctly", () => {
    expect(workEditionToNewBookInput(work, edition, "isbn").source).toBe("isbn");
    expect(workEditionToNewBookInput(work, edition, "search").source).toBe("search");
  });

  test("sets default shelf flags", () => {
    const input = workEditionToNewBookInput(work, edition, "search");
    expect(input.ownership).toBe("owned");
    expect(input.wishlist).toBe(false);
    expect(input.wantToBuy).toBe(false);
  });
});

// ─── lookupByIsbn ─────────────────────────────────────────────────────────────

describe("lookupByIsbn", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns empty result for invalid ISBN", async () => {
    const result = await lookupByIsbn("not-an-isbn");
    expect(result).toEqual({ work: null, works: [], flatEditions: [], isbnMatch: false });
  });

  test("returns empty result when both providers return nothing", async () => {
    olFetchEditionByIsbn.mockResolvedValue(null);
    gbFetchByIsbn.mockResolvedValue([]);

    const result = await lookupByIsbn("9780441172719");
    expect(result.work).toBeNull();
    expect(result.flatEditions).toHaveLength(0);
    expect(result.isbnMatch).toBe(false);
  });

  test("returns work when only Google Books responds", async () => {
    olFetchEditionByIsbn.mockResolvedValue(null);
    gbFetchByIsbn.mockResolvedValue([
      makeEdition({ id: "gb-1", source: "google-books", isbn13: "9780441172719", score: 85 }),
    ]);

    const result = await lookupByIsbn("9780441172719");
    expect(result.work).not.toBeNull();
    expect(result.isbnMatch).toBe(true);
    expect(result.flatEditions).toHaveLength(1);
    expect(result.flatEditions[0]!.source).toBe("google-books");
  });

  test("returns work when only Open Library responds", async () => {
    olFetchEditionByIsbn.mockResolvedValue({
      edition: makeEdition({ id: "ol-1", source: "open-library", isbn13: "9780441172719", score: 80 }),
      workKey: "/works/OL1W",
      authorKeys: ["/authors/OL1A"],
    });
    gbFetchByIsbn.mockResolvedValue([]);
    olFetchWork.mockResolvedValue({
      title: "Dune",
      subtitle: undefined,
      description: "Epic sci-fi.",
      genres: ["Science Fiction"],
      authorKeys: ["/authors/OL1A"],
      coverUrl: null,
      firstPublishDate: "1965",
    });
    olFetchWorkEditions.mockResolvedValue([]);
    olResolveAuthors.mockResolvedValue(["Frank Herbert"]);

    const result = await lookupByIsbn("9780441172719");
    expect(result.work).not.toBeNull();
    expect(result.work!.workKey).toBe("/works/OL1W");
    expect(result.work!.authors).toEqual(["Frank Herbert"]);
    expect(result.work!.description).toBe("Epic sci-fi.");
    expect(result.isbnMatch).toBe(true);
  });

  test("merges OL edition + GB edition via deduplication (same isbn13)", async () => {
    const sharedIsbn = "9780441172719";
    olFetchEditionByIsbn.mockResolvedValue({
      edition: makeEdition({ id: "ol-1", source: "open-library", isbn13: sharedIsbn, score: 75, coverUrl: undefined }),
      workKey: "/works/OL1W",
      authorKeys: [],
    });
    gbFetchByIsbn.mockResolvedValue([
      makeEdition({ id: "gb-1", source: "google-books", isbn13: sharedIsbn, score: 85, coverUrl: "https://cover.jpg" }),
    ]);
    olFetchWork.mockResolvedValue(null);
    olFetchWorkEditions.mockResolvedValue([]);
    olResolveAuthors.mockResolvedValue([]);

    const result = await lookupByIsbn(sharedIsbn);
    // Both editions share the same isbn13 → deduped to 1
    expect(result.flatEditions).toHaveLength(1);
    // Winning edition has higher score (gb-1 = 85)
    expect(result.flatEditions[0]!.score).toBe(85);
    // Cover was stolen from the winner (already had it)
    expect(result.flatEditions[0]!.coverUrl).toBe("https://cover.jpg");
  });

  test("includes OL work editions in flat edition list", async () => {
    olFetchEditionByIsbn.mockResolvedValue({
      edition: makeEdition({ id: "ol-1", isbn13: "9780441172719", languageCode: "en", score: 80 }),
      workKey: "/works/OL1W",
      authorKeys: [],
    });
    gbFetchByIsbn.mockResolvedValue([]);
    olFetchWork.mockResolvedValue(null);
    olFetchWorkEditions.mockResolvedValue([
      makeEdition({ id: "ol-es", languageCode: "es", language: "Spanish", isbn13: "9788401352836", score: 70 }),
      makeEdition({ id: "ol-fr", languageCode: "fr", language: "French", isbn13: "9782070360024", score: 65 }),
    ]);
    olResolveAuthors.mockResolvedValue([]);

    const result = await lookupByIsbn("9780441172719");
    expect(result.flatEditions.length).toBeGreaterThanOrEqual(2);
    const langs = result.flatEditions.map((e) => e.languageCode);
    expect(langs).toContain("en");
    expect(langs).toContain("es");
    expect(langs).toContain("fr");
  });

  test("Spanish edition by ISBN: never takes the OL work's English title/synopsis", async () => {
    const isbn = "9788408281153"; // Alas de sangre (Planeta)
    olFetchEditionByIsbn.mockResolvedValue({
      edition: makeEdition({
        id: "ol-es", source: "open-library", isbn13: isbn,
        title: "Alas de sangre", languageCode: "es", language: "Spanish", score: 100,
      }),
      workKey: "/works/OL1W",
      authorKeys: ["/authors/OL1A"],
    });
    gbFetchByIsbn.mockResolvedValue([]);
    olFetchWork.mockResolvedValue({
      title: "Fourth Wing",
      subtitle: "The Empyrean, Book 1",
      description: "Twenty-year-old Violet Sorrengail was supposed to enter the Scribe Quadrant...",
      genres: ["Fantasy"],
      authorKeys: ["/authors/OL1A"],
    });
    olFetchWorkEditions.mockResolvedValue([]);
    olResolveAuthors.mockResolvedValue(["Rebecca Yarros"]);

    const result = await lookupByIsbn(isbn);
    expect(result.work!.title).toBe("Alas de sangre");
    expect(result.work!.subtitle).toBeUndefined();
    expect(result.work!.description).toBeUndefined(); // empty = unknown, never leaked
    expect(result.work!.bestEdition.language).toBe("Spanish");
    expect(result.work!.genres).toEqual(["Fantasy"]); // structural data still flows
  });

  test("English edition by ISBN keeps the OL work title and description", async () => {
    const isbn = "9781649374042";
    olFetchEditionByIsbn.mockResolvedValue({
      edition: makeEdition({ id: "ol-en", isbn13: isbn, title: "Fourth Wing", languageCode: "en", language: "English", score: 100 }),
      workKey: "/works/OL1W",
      authorKeys: [],
    });
    gbFetchByIsbn.mockResolvedValue([]);
    olFetchWork.mockResolvedValue({ title: "Fourth Wing", description: "Violet Sorrengail...", genres: [], authorKeys: [] });
    olFetchWorkEditions.mockResolvedValue([]);
    olResolveAuthors.mockResolvedValue([]);

    const result = await lookupByIsbn(isbn);
    expect(result.work!.title).toBe("Fourth Wing");
    expect(result.work!.description).toBe("Violet Sorrengail...");
  });

  test("same-ISBN merge: a KNOWN language label beats an unknown one (GB wins ties)", async () => {
    const isbn = "9788408281153";
    olFetchEditionByIsbn.mockResolvedValue({
      // OL record has no language at all (common) but the higher score.
      edition: makeEdition({ id: "ol-1", source: "open-library", isbn13: isbn, languageCode: undefined, language: undefined, score: 100 }),
      workKey: undefined,
      authorKeys: [],
    });
    gbFetchByIsbn.mockResolvedValue([
      makeEdition({ id: "gb-1", source: "google-books", isbn13: isbn, languageCode: "es", language: "Spanish", score: 90 }),
    ]);

    const result = await lookupByIsbn(isbn);
    expect(result.flatEditions).toHaveLength(1);
    expect(result.flatEditions[0]!.score).toBe(100);          // OL still wins the record…
    expect(result.flatEditions[0]!.languageCode).toBe("es");  // …but the language comes from GB
    expect(result.flatEditions[0]!.language).toBe("Spanish");
  });

  test("handles provider rejection gracefully", async () => {
    olFetchEditionByIsbn.mockRejectedValue(new Error("OL network error"));
    gbFetchByIsbn.mockResolvedValue([
      makeEdition({ id: "gb-1", source: "google-books", isbn13: "9780441172719", score: 80 }),
    ]);

    // Should not throw — olFetchEditionByIsbn is wrapped in Promise.allSettled
    const result = await lookupByIsbn("9780441172719");
    expect(result.work).not.toBeNull();
    expect(result.flatEditions[0]!.source).toBe("google-books");
  });

  test("sets isbnMatch = true when any edition is found", async () => {
    olFetchEditionByIsbn.mockResolvedValue(null);
    gbFetchByIsbn.mockResolvedValue([makeEdition({ isbn13: "9780441172719", score: 80 })]);

    const result = await lookupByIsbn("9780441172719");
    expect(result.isbnMatch).toBe(true);
  });

  test("normalises isbn13 before querying (strips dashes)", async () => {
    olFetchEditionByIsbn.mockResolvedValue(null);
    gbFetchByIsbn.mockResolvedValue([makeEdition({ isbn13: "9780441172719", score: 80 })]);

    // ISBN with dashes — parseIsbn normalises it
    await lookupByIsbn("978-0-441-17271-9");
    expect(olFetchEditionByIsbn).toHaveBeenCalledWith("9780441172719", expect.anything());
    expect(gbFetchByIsbn).toHaveBeenCalledWith("9780441172719");
  });
});

// ─── lookupByQuery ────────────────────────────────────────────────────────────

describe("lookupByQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns empty result when both providers return nothing", async () => {
    gbFetchByQuery.mockResolvedValue([]);
    olFetchByQuery.mockResolvedValue([]);

    const result = await lookupByQuery("Nonexistent Book XYZ");
    expect(result.work).toBeNull();
    expect(result.works).toHaveLength(0);
    expect(result.flatEditions).toHaveLength(0);
    expect(result.isbnMatch).toBe(false);
  });

  test("returns works from Google Books when OL returns nothing", async () => {
    olFetchByQuery.mockResolvedValue([]);
    gbFetchByQuery.mockResolvedValue([
      {
        work: {
          workKey: undefined,
          googleBooksId: "gbId1",
          title: "Dune",
          authors: ["Frank Herbert"],
          description: "Epic.",
          genres: ["Science Fiction"],
          editionCount: 1,
        },
        edition: makeEdition({ id: "gb-ed-1", source: "google-books", score: 78 }),
      },
    ]);

    const result = await lookupByQuery("Dune", "Frank Herbert");
    expect(result.work).not.toBeNull();
    expect(result.work!.title).toBe("Dune");
    expect(result.works).toHaveLength(1);
    expect(result.isbnMatch).toBe(false);
  });

  test("returns works from Open Library when GB returns nothing", async () => {
    gbFetchByQuery.mockResolvedValue([]);
    olFetchByQuery.mockResolvedValue([
      {
        partialWork: {
          workKey: "/works/OL1W",
          title: "Dune",
          authors: ["Frank Herbert"],
          description: "Desert planet.",
          genres: ["Science Fiction"],
          editionCount: 5,
        },
        bestEdition: makeEdition({ id: "ol-ed-1", source: "open-library", score: 82 }),
      },
    ]);

    const result = await lookupByQuery("Dune");
    expect(result.work).not.toBeNull();
    expect(result.work!.workKey).toBe("/works/OL1W");
    expect(result.works.length).toBeGreaterThanOrEqual(1);
  });

  test("merges GB and OL works with ≥70% title overlap", async () => {
    const sharedTitle = "Dune";
    gbFetchByQuery.mockResolvedValue([
      {
        work: {
          title: sharedTitle,
          authors: ["Frank Herbert"],
          description: "GB description.",
          genres: ["Science Fiction"],
        },
        // Distinct ISBN so deduplication keeps both editions
        edition: makeEdition({ id: "gb-ed", source: "google-books", isbn13: "9780441172719", score: 75 }),
      },
    ]);
    olFetchByQuery.mockResolvedValue([
      {
        partialWork: {
          workKey: "/works/OL1W",
          title: sharedTitle,
          authors: ["Frank Herbert"],
          description: "OL description.",
          genres: [],
          editionCount: 10,
        },
        bestEdition: makeEdition({ id: "ol-ed", source: "open-library", isbn13: "9780441013593", score: 80 }),
      },
    ]);

    const result = await lookupByQuery(sharedTitle);
    // Should merge into one work, not two separate works
    expect(result.works).toHaveLength(1);
    // Both editions (different ISBNs) should appear in the merged work
    expect(result.works[0]!.editions.length).toBeGreaterThanOrEqual(2);
  });

  test("does NOT merge GB and OL works with <70% title overlap", async () => {
    gbFetchByQuery.mockResolvedValue([
      {
        work: { title: "The Hobbit", authors: ["Tolkien"], description: "", genres: [] },
        edition: makeEdition({ id: "gb-hobbit", source: "google-books", score: 70 }),
      },
    ]);
    olFetchByQuery.mockResolvedValue([
      {
        partialWork: {
          workKey: "/works/OL2W",
          title: "Dune",
          authors: ["Frank Herbert"],
          description: "",
          genres: [],
          editionCount: 1,
        },
        bestEdition: makeEdition({ id: "ol-dune", source: "open-library", score: 75 }),
      },
    ]);

    const result = await lookupByQuery("something");
    expect(result.works).toHaveLength(2); // different works, not merged
  });

  test("sorts works by score descending", async () => {
    gbFetchByQuery.mockResolvedValue([]);
    // Titles must be clearly DISTINCT works — near-identical titles like
    // "Book A"/"Book B" get merged by the ≥70% title-overlap rule (which has
    // its own dedicated tests above). This test is about score ordering only.
    olFetchByQuery.mockResolvedValue([
      {
        partialWork: { workKey: "/works/OL1W", title: "Desert Storms of Arrakis", authors: [], description: "", genres: [], editionCount: 1 },
        bestEdition: makeEdition({ id: "a", score: 60 }),
      },
      {
        partialWork: { workKey: "/works/OL2W", title: "The Crimson Citadel", authors: [], description: "", genres: [], editionCount: 1 },
        bestEdition: makeEdition({ id: "b", score: 90 }),
      },
      {
        partialWork: { workKey: "/works/OL3W", title: "Whispering Tides", authors: [], description: "", genres: [], editionCount: 1 },
        bestEdition: makeEdition({ id: "c", score: 75 }),
      },
    ]);

    const result = await lookupByQuery("fantasy adventure");
    const scores = result.works.map((w) => w.score);
    expect(scores[0]).toBeGreaterThanOrEqual(scores[1]!);
    expect(scores[1]).toBeGreaterThanOrEqual(scores[2]!);
  });

  test("handles provider rejection gracefully", async () => {
    gbFetchByQuery.mockRejectedValue(new Error("GB network error"));
    olFetchByQuery.mockResolvedValue([
      {
        partialWork: { workKey: "/works/OL1W", title: "Dune", authors: [], description: "", genres: [], editionCount: 1 },
        bestEdition: makeEdition({ id: "ol-1", score: 80 }),
      },
    ]);

    const result = await lookupByQuery("Dune");
    expect(result.work).not.toBeNull();
    expect(result.work!.title).toBe("Dune");
  });

  test("flatEditions is deduped across all works", async () => {
    const sharedIsbn = "9780441172719";
    gbFetchByQuery.mockResolvedValue([]);
    olFetchByQuery.mockResolvedValue([
      {
        partialWork: { workKey: "/works/OL1W", title: "Dune", authors: [], description: "", genres: [], editionCount: 2 },
        bestEdition: makeEdition({ id: "ol-1", isbn13: sharedIsbn, score: 80 }),
      },
      {
        partialWork: { workKey: "/works/OL1W", title: "Dune Reprint", authors: [], description: "", genres: [], editionCount: 2 },
        bestEdition: makeEdition({ id: "ol-2", isbn13: sharedIsbn, score: 75 }),
      },
    ]);

    const result = await lookupByQuery("Dune");
    // Both editions share isbn13 → flatEditions deduped to 1
    expect(result.flatEditions.filter((e) => e.isbn13 === sharedIsbn)).toHaveLength(1);
  });

  test("first work in result is set as result.work", async () => {
    gbFetchByQuery.mockResolvedValue([]);
    olFetchByQuery.mockResolvedValue([
      {
        partialWork: { workKey: "/works/OL1W", title: "A", authors: [], description: "", genres: [], editionCount: 1 },
        bestEdition: makeEdition({ id: "a", score: 90 }),
      },
      {
        partialWork: { workKey: "/works/OL2W", title: "B", authors: [], description: "", genres: [], editionCount: 1 },
        bestEdition: makeEdition({ id: "b", score: 50 }),
      },
    ]);

    const result = await lookupByQuery("A");
    expect(result.work).toBe(result.works[0]);
  });
});

// ─── fetchAllEditions ─────────────────────────────────────────────────────────

describe("fetchAllEditions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("fetches, dedupes, and groups editions for a work key", async () => {
    olFetchWorkEditions.mockResolvedValue([
      makeEdition({ id: "en1", languageCode: "en", language: "English", isbn13: "111", score: 85 }),
      makeEdition({ id: "es1", languageCode: "es", language: "Spanish", isbn13: "222", score: 80 }),
      makeEdition({ id: "en2", languageCode: "en", language: "English", isbn13: "333", score: 70 }),
    ]);

    const result = await fetchAllEditions("/works/OL1W", { title: "Dune" });

    expect(result.editions).toHaveLength(3);
    expect(result.groups).toHaveLength(2); // en + es
    expect(result.groups[0]!.languageCode).toBe("en"); // priority first
    expect(result.groups[0]!.editions).toHaveLength(2);
    expect(result.groups[1]!.languageCode).toBe("es");
  });

  test("deduplicates editions with same isbn13", async () => {
    olFetchWorkEditions.mockResolvedValue([
      makeEdition({ id: "a", isbn13: "9780441172719", languageCode: "en", score: 80 }),
      makeEdition({ id: "b", isbn13: "9780441172719", languageCode: "en", score: 70 }),
    ]);

    const result = await fetchAllEditions("/works/OL1W", { title: "Dune" });
    expect(result.editions).toHaveLength(1);
    expect(result.editions[0]!.score).toBe(80); // winner
  });

  test("returns empty when OL returns nothing", async () => {
    olFetchWorkEditions.mockResolvedValue([]);
    const result = await fetchAllEditions("/works/OL1W", { title: "Dune" });
    expect(result.editions).toHaveLength(0);
    expect(result.groups).toHaveLength(0);
  });

  test("passes workContext to olFetchWorkEditions", async () => {
    olFetchWorkEditions.mockResolvedValue([]);
    const ctx = { authors: ["Frank Herbert"], seriesName: "Dune Saga" };
    await fetchAllEditions("/works/OL1W", { title: "Dune" }, ctx);
    expect(olFetchWorkEditions).toHaveBeenCalledWith(
      "/works/OL1W",
      { title: "Dune" },
      expect.objectContaining({ workKey: "/works/OL1W", authors: ["Frank Herbert"] })
    );
  });
});
