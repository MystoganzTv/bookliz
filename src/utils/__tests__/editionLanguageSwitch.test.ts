/**
 * editionLanguageSwitch — pins the FULL edition/language switch contract:
 *
 *   1. The Spanish edition search finds candidates (GB direct, OL-workKey
 *      fallback, translated-title re-query) and NEVER returns another
 *      language's edition.
 *   2. When nothing is found, the result is an explicit empty list — the
 *      caller shows a clear failure and the book is NOT edited. No silent
 *      English fallback, no fake Spanish edition.
 *   3. A successful switch carries language + languageCode together.
 *   4. ReadingIdentity reflects the new language after the switch.
 */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("../../services/googleBooksProvider", () => ({
  fetchByKeyword: jest.fn(),
}));
jest.mock("../bookMetadata", () => ({
  fetchBookMetadataByIsbn: jest.fn(async () => undefined),
  fetchBookMetadataByTitleAuthor: jest.fn(async () => undefined),
  fetchOpenLibraryRecordsByTitleAuthor: jest.fn(async () => ({})),
  fetchEditionOptionsByWorkKey: jest.fn(async () => []),
  normalizeIsbn: (v?: string) => (v ?? "").replace(/\D/g, ""),
}));

import { findEditionsInLanguage } from "../metadataResolver";
import { buildEditionSwitchPatch } from "../editionSwitch";
import { computeReadingIdentity } from "../readingIdentity";
import { fetchByKeyword, GenreBookResult } from "../../services/googleBooksProvider";
import {
  fetchBookMetadataByTitleAuthor,
  fetchEditionOptionsByWorkKey,
} from "../bookMetadata";
import { Author, Book } from "../../types/models";

const mockFetchByKeyword = fetchByKeyword as jest.Mock;
const mockOlEditions = fetchEditionOptionsByWorkKey as jest.Mock;
const mockOlWorkLookup = fetchBookMetadataByTitleAuthor as jest.Mock;

const gb = (over: Partial<GenreBookResult> & { id: string; title: string; language: string }): GenreBookResult =>
  ({
    authors: ["Pierce Brown"], genres: ["Science Fiction"], googleBooksId: over.id,
    ...over,
  } as GenreBookResult);

const ES_EDITION = gb({
  id: "gb-es", title: "Amanecer rojo", language: "Spanish",
  isbn13: "9788490566372", coverUrl: "https://covers/es.jpg",
  publisher: "RBA", publishedYear: 2015,
  description: "Darrow es un Rojo, un miembro de la casta más baja de la sociedad del futuro, y está dispuesto a todo…",
});
const EN_EDITION = gb({
  id: "gb-en", title: "Red Rising", language: "English",
  isbn13: "9781444759006", coverUrl: "https://covers/en.jpg",
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchByKeyword.mockResolvedValue({ books: [], totalItems: 0 });
  mockOlEditions.mockResolvedValue([]);
  mockOlWorkLookup.mockResolvedValue(undefined);
  jest.spyOn(console, "log").mockImplementation(() => {}); // silence [EDITION_SWITCH_SEARCH]
});
afterEach(() => {
  (console.log as jest.Mock).mockRestore?.();
});

describe("Spanish edition search — found and offered", () => {
  it("returns the Spanish edition when Google Books has it", async () => {
    mockFetchByKeyword.mockResolvedValue({ books: [EN_EDITION, ES_EDITION], totalItems: 2 });

    const out = await findEditionsInLanguage("Red Rising", "Pierce Brown", "Spanish");

    expect(out.map((b) => b.id)).toContain("gb-es");
    // and ONLY Spanish — the English edition is never offered
    expect(out.every((b) => b.language === "Spanish")).toBe(true);
  });

  it("passes langRestrict=es to every Google Books query", async () => {
    await findEditionsInLanguage("Red Rising", "Pierce Brown", "Spanish");
    for (const call of mockFetchByKeyword.mock.calls) {
      expect(call[3]).toBe("es"); // langRestrict param
    }
  });
});

describe("no silent English — over-filtering is the FEATURE, fallbacks are the fix", () => {
  it("English-only results yield an EMPTY list, never English candidates", async () => {
    mockFetchByKeyword.mockResolvedValue({ books: [EN_EDITION], totalItems: 1 });

    const out = await findEditionsInLanguage("Red Rising", "Pierce Brown", "Spanish");

    expect(out).toEqual([]); // caller shows "No Spanish edition found" — book untouched
  });

  it("nothing anywhere → empty list (no fabricated edition)", async () => {
    const out = await findEditionsInLanguage("Red Rising", "Pierce Brown", "Spanish", {
      workKey: "/works/OL17081100W",
    });
    expect(out).toEqual([]);
  });
});

describe("Open Library fallbacks when Google Books finds nothing", () => {
  const OL_ES = {
    id: "/books/OL99M", editionKey: "/books/OL99M", title: "Amanecer rojo",
    label: "Spanish · 2015 · RBA", isbn: "9788490566372", language: "Spanish",
    publisher: "RBA", publishedDate: "2015", pages: 439,
    coverImageUri: "https://covers.openlibrary.org/b/id/1-L.jpg", patch: {},
  };
  const OL_EN = { ...OL_ES, id: "/books/OL1M", editionKey: "/books/OL1M", title: "Red Rising", language: "English" };

  it("uses the work's OL editions (filtered to Spanish) via workKey", async () => {
    mockOlEditions.mockResolvedValue([OL_EN, OL_ES]);

    const out = await findEditionsInLanguage("Red Rising", "Pierce Brown", "Spanish", {
      workKey: "/works/OL17081100W",
    });

    expect(mockOlEditions).toHaveBeenCalledWith("/works/OL17081100W", 40);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Amanecer rojo");
    expect(out[0].language).toBe("Spanish");
    expect(out[0].isbn13).toBe("9788490566372");
  });

  it("resolves the workKey via OL search when the book has none", async () => {
    mockOlWorkLookup.mockResolvedValue({ title: "Red Rising", workKey: "/works/OL17081100W" });
    mockOlEditions.mockResolvedValue([OL_ES]);

    const out = await findEditionsInLanguage("Red Rising", "Pierce Brown", "Spanish");

    expect(mockOlWorkLookup).toHaveBeenCalled();
    expect(out.map((b) => b.title)).toContain("Amanecer rojo");
  });

  it("re-queries Google Books with the translated title OL discovered (richer record wins)", async () => {
    mockOlEditions.mockResolvedValue([OL_ES]);
    // First wave (original title) finds nothing; the re-query with the
    // OL-discovered Spanish title hits the rich GB record.
    mockFetchByKeyword.mockImplementation(async (query: string) =>
      query.includes("Amanecer rojo")
        ? { books: [ES_EDITION], totalItems: 1 }
        : { books: [], totalItems: 0 }
    );

    const out = await findEditionsInLanguage("Red Rising", "Pierce Brown", "Spanish", {
      workKey: "/works/OL17081100W",
    });

    // GB record (with synopsis) ranks above the bare OL edition
    expect(out[0].id).toBe("gb-es");
    expect((out[0].description ?? "").length).toBeGreaterThan(40);
  });
});

describe("evidence-based verdicts in the edition search (provider labels lie)", () => {
  const ES_DESCRIPTION =
    "Darrow es un Rojo, un miembro de la casta más baja en la sociedad del futuro. " +
    "Trabaja en las minas de Marte para que las generaciones que vienen puedan vivir en la superficie.";
  const EN_DESCRIPTION =
    "Darrow is a Red, a member of the lowest caste in the color-coded society of the future. " +
    "He works the mines of Mars so that future generations can live on the surface of the planet.";

  it("Spanish → English switch returns only English candidates", async () => {
    mockFetchByKeyword.mockResolvedValue({
      books: [ES_EDITION, gb({ id: "gb-en2", title: "Red Rising", language: "English", description: EN_DESCRIPTION })],
      totalItems: 2,
    });
    const out = await findEditionsInLanguage("Amanecer rojo", "Pierce Brown", "English");
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("gb-en2");
  });

  it("missing provider language + Spanish description → accepted (rescued by text)", async () => {
    const noLabel = gb({ id: "gb-nolang", title: "Amanecer rojo", language: undefined as unknown as string, description: ES_DESCRIPTION });
    mockFetchByKeyword.mockResolvedValue({ books: [noLabel], totalItems: 1 });

    const out = await findEditionsInLanguage("Red Rising", "Pierce Brown", "Spanish");
    expect(out.map((b) => b.id)).toContain("gb-nolang");
    expect(out[0].language).toBe("Spanish"); // stamped with OUR verdict
  });

  it("missing provider language + no text evidence → excluded (unknown is not proof)", async () => {
    const bare = gb({ id: "gb-bare", title: "Amanecer rojo", language: undefined as unknown as string });
    mockFetchByKeyword.mockResolvedValue({ books: [bare], totalItems: 1 });

    const out = await findEditionsInLanguage("Red Rising", "Pierce Brown", "Spanish");
    expect(out).toEqual([]);
  });

  it("INCORRECT provider label: labeled 'Spanish' but English text → excluded (both-ways protection)", async () => {
    const liar = gb({ id: "gb-liar", title: "Red Rising", language: "Spanish", description: EN_DESCRIPTION });
    mockFetchByKeyword.mockResolvedValue({ books: [liar], totalItems: 1 });

    const out = await findEditionsInLanguage("Red Rising", "Pierce Brown", "Spanish");
    expect(out).toEqual([]);
  });

  it("LEGITIMATE translation with mismatched label: 'en' label + Spanish text → rescued as Spanish", async () => {
    const mislabeled = gb({ id: "gb-mislabel", title: "Amanecer rojo", language: "English", description: ES_DESCRIPTION, isbn13: "9788490566372" });
    mockFetchByKeyword.mockResolvedValue({ books: [mislabeled], totalItems: 1 });

    const out = await findEditionsInLanguage("Red Rising", "Pierce Brown", "Spanish");
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("gb-mislabel");
    // The lying label is stamped over with the language we vouched for, so
    // the patch/save path persists Spanish — not the bogus "English".
    expect(out[0].language).toBe("Spanish");
    expect(buildEditionSwitchPatch(out[0], "Spanish").languageCode).toBe("es");
  });
});

describe("language switch persistence — language and languageCode travel together", () => {
  it("languageCode changes to 'es' after a successful Spanish switch", () => {
    const patch = buildEditionSwitchPatch(ES_EDITION, "Spanish");
    expect(patch.language).toBe("Spanish");
    expect(patch.languageCode).toBe("es");
  });

  it("…and back to 'en' for an English switch", () => {
    const patch = buildEditionSwitchPatch(EN_EDITION, "English");
    expect(patch.languageCode).toBe("en");
  });

  it("unknown language → languageCode undefined (never a stale code)", () => {
    const patch = buildEditionSwitchPatch(gb({ id: "x", title: "X", language: "Klingon" }), "Klingon");
    expect(patch.languageCode).toBeUndefined();
  });
});

describe("ReadingIdentity reflects the switch", () => {
  const NOW = new Date("2026-06-11T12:00:00Z").getTime();
  const author: Author = { id: "a1", name: "Pierce Brown", bio: "", favoriteGenres: [] } as Author;
  const baseBook = (language: string): Book =>
    ({
      id: "b1", title: "Red Rising", authorId: "a1", synopsis: "", genre: ["Science Fiction"],
      pages: 400, publishedDate: "", publisher: "", language, isbn: "", format: "paperback",
      coverGradient: ["#000", "#111"],
      userStatus: {
        status: "reading", ownership: "owned", wishlist: false, wantToBuy: false,
        readCount: 0, progressPercent: 40, notes: "", favoriteQuotes: [],
      },
    } as Book);

  it("after applying the Spanish patch, identity languages show Spanish — not English", () => {
    const before = computeReadingIdentity(
      { books: [baseBook("English")], authors: [author], readingSessions: [], reviews: [] }, NOW
    );
    expect(before.languages).toEqual([{ language: "English", share: 1 }]);

    const patch = buildEditionSwitchPatch(ES_EDITION, "Spanish");
    const switched: Book = { ...baseBook("English"), language: patch.language, languageCode: patch.languageCode };

    const after = computeReadingIdentity(
      { books: [switched], authors: [author], readingSessions: [], reviews: [] }, NOW
    );
    expect(after.languages).toEqual([{ language: "Spanish", share: 1 }]);
  });
});
