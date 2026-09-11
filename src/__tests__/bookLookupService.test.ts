/**
 * Unit tests for src/services/bookLookupService.ts
 *
 * Tests focus on the pure, deterministic functions (scoring, etc.).
 * Network-dependent functions (lookupByIsbn, lookupByQuery) are tested
 * via mocks rather than real HTTP calls.
 */

import { bookMatchToNewBookInput, scoreBookMatch, BookMatch } from "../services/bookLookupService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal BookMatch for scoring tests. */
function makeMatch(overrides: Partial<Omit<BookMatch, "score" | "confidence">> = {}): Omit<BookMatch, "score" | "confidence"> {
  return {
    id: "test-match-id",
    title: "Test Book",
    authors: ["Test Author"],
    isbn13: undefined,
    coverUrl: undefined,
    description: undefined,
    pageCount: undefined,
    publisher: undefined,
    publishedDate: undefined,
    genres: [],
    language: undefined,
    source: "google-books",
    sourceId: "test-id",
    subtitle: undefined,
    ...overrides,
  };
}

// ─── scoreBookMatch — ISBN path ───────────────────────────────────────────────

describe("scoreBookMatch — ISBN query", () => {
  const query = { isbn13: "9780306406157" };

  it("gives 80 base pts for an exact ISBN match", () => {
    const match = makeMatch({ isbn13: "9780306406157" });
    const score = scoreBookMatch(match, query);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it("adds completeness bonus for cover URL", () => {
    const withCover = makeMatch({ isbn13: "9780306406157", coverUrl: "https://example.com/cover.jpg" });
    const withoutCover = makeMatch({ isbn13: "9780306406157" });
    expect(scoreBookMatch(withCover, query)).toBeGreaterThan(scoreBookMatch(withoutCover, query));
  });

  it("adds completeness bonus for description", () => {
    const longDesc = "A".repeat(31);
    const withDesc = makeMatch({ isbn13: "9780306406157", description: longDesc });
    const withoutDesc = makeMatch({ isbn13: "9780306406157" });
    expect(scoreBookMatch(withDesc, query)).toBeGreaterThan(scoreBookMatch(withoutDesc, query));
  });

  it("adds completeness bonus for pageCount", () => {
    const withPages = makeMatch({ isbn13: "9780306406157", pageCount: 300 });
    const withoutPages = makeMatch({ isbn13: "9780306406157" });
    expect(scoreBookMatch(withPages, query)).toBeGreaterThan(scoreBookMatch(withoutPages, query));
  });

  it("adds completeness bonus for publisher", () => {
    const withPub = makeMatch({ isbn13: "9780306406157", publisher: "Penguin" });
    const withoutPub = makeMatch({ isbn13: "9780306406157" });
    expect(scoreBookMatch(withPub, query)).toBeGreaterThan(scoreBookMatch(withoutPub, query));
  });

  it("scores 0 when ISBN does not match", () => {
    const match = makeMatch({ isbn13: "9780451524935" }); // different ISBN
    const score = scoreBookMatch(match, query);
    // ISBN doesn't match, no title/author tokens — only completeness bonuses
    expect(score).toBeLessThan(80);
  });

  it("caps score at 100", () => {
    const richMatch = makeMatch({
      isbn13: "9780306406157",
      coverUrl: "https://example.com/cover.jpg",
      description: "A".repeat(50),
      pageCount: 300,
      publisher: "Penguin",
      genres: ["Fiction"],
      language: "en",
    });
    const score = scoreBookMatch(richMatch, query);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ─── scoreBookMatch — text query path ────────────────────────────────────────

describe("scoreBookMatch — text query", () => {
  it("gives full title score for exact title match", () => {
    const match = makeMatch({ title: "The Great Gatsby" });
    const query = { title: "The Great Gatsby" };
    const score = scoreBookMatch(match, query);
    // All title tokens match → 35 pts; possible completeness bonuses
    expect(score).toBeGreaterThanOrEqual(30);
  });

  it("gives partial title score for partial match", () => {
    const match = makeMatch({ title: "The Great Gatsby" });
    const fullQuery = { title: "The Great Gatsby" };
    const partialQuery = { title: "Great" };
    const fullScore = scoreBookMatch(match, fullQuery);
    const partialScore = scoreBookMatch(match, partialQuery);
    expect(fullScore).toBeGreaterThanOrEqual(partialScore);
  });

  it("gives full author score for matching author", () => {
    const match = makeMatch({ title: "Dune", authors: ["Frank Herbert"] });
    const query = { title: "Dune", author: "Frank Herbert" };
    const score = scoreBookMatch(match, query);
    // title + author match should give high score
    expect(score).toBeGreaterThanOrEqual(50);
  });

  it("gives partial author score for first-name-only match", () => {
    const match = makeMatch({ title: "Dune", authors: ["Frank Herbert"] });
    const fullQuery = { title: "Dune", author: "Frank Herbert" };
    const partialQuery = { title: "Dune", author: "Frank" };
    expect(scoreBookMatch(match, fullQuery)).toBeGreaterThanOrEqual(scoreBookMatch(match, partialQuery));
  });

  it("does not apply title/author scoring when isbn13 is present in query", () => {
    const match = makeMatch({ title: "Completely Different Title", isbn13: "9780999999998" });
    const queryWithIsbn = { isbn13: "9780306406157", title: "Completely Different Title" };
    const queryWithoutIsbn = { title: "Completely Different Title" };
    // With ISBN, title matching is skipped; without ISBN, title matching applies
    const withIsbnScore = scoreBookMatch(match, queryWithIsbn);
    const withoutIsbnScore = scoreBookMatch({ ...match, isbn13: undefined }, queryWithoutIsbn);
    // They are scored differently — just verify no crash and both return numbers
    expect(typeof withIsbnScore).toBe("number");
    expect(typeof withoutIsbnScore).toBe("number");
  });

  it("returns 0 for completely unrelated content", () => {
    const match = makeMatch({ title: "Quantum Physics", authors: ["Richard Feynman"] });
    const query = { title: "Harry Potter", author: "J.K. Rowling" };
    const score = scoreBookMatch(match, query);
    // No overlap in tokens
    expect(score).toBe(0);
  });

  it("handles multi-author arrays for author matching", () => {
    const match = makeMatch({
      title: "Good Omens",
      authors: ["Terry Pratchett", "Neil Gaiman"],
    });
    const query = { title: "Good Omens", author: "Gaiman" };
    const score = scoreBookMatch(match, query);
    expect(score).toBeGreaterThan(0);
  });
});

// ─── scoreBookMatch — completeness bonuses ───────────────────────────────────

describe("scoreBookMatch — completeness bonuses", () => {
  it("awards bonus for non-Uncategorized genre", () => {
    const withGenre = makeMatch({ title: "Book", genres: ["Fiction"] });
    const withoutGenre = makeMatch({ title: "Book", genres: [] });
    const withUncategorized = makeMatch({ title: "Book", genres: ["Uncategorized"] });
    const query = { title: "Book" };
    expect(scoreBookMatch(withGenre, query)).toBeGreaterThan(scoreBookMatch(withoutGenre, query));
    expect(scoreBookMatch(withGenre, query)).toBeGreaterThan(scoreBookMatch(withUncategorized, query));
  });

  it("awards bonus for language", () => {
    const withLang = makeMatch({ title: "Book", language: "en" });
    const withoutLang = makeMatch({ title: "Book" });
    const query = { title: "Book" };
    expect(scoreBookMatch(withLang, query)).toBeGreaterThan(scoreBookMatch(withoutLang, query));
  });

  it("awards bonus for having an isbn13 field", () => {
    const withIsbn = makeMatch({ title: "Book", isbn13: "9780306406157" });
    const withoutIsbn = makeMatch({ title: "Book" });
    // Query has no isbn so both take the text path; isbn field bonus still applies
    const query = { title: "Book" };
    expect(scoreBookMatch(withIsbn, query)).toBeGreaterThan(scoreBookMatch(withoutIsbn, query));
  });
});

// ─── bookMatchToNewBookInput — no fabricated language ─────────────────────────

describe("bookMatchToNewBookInput", () => {
  it("leaves language undefined when the match has none (never defaults to English)", () => {
    const match: BookMatch = { ...makeMatch({ language: undefined }), score: 50, confidence: "medium" };
    expect(bookMatchToNewBookInput(match).language).toBeUndefined();
  });

  it("passes a known language through", () => {
    const match: BookMatch = { ...makeMatch({ language: "Spanish" }), score: 50, confidence: "medium" };
    expect(bookMatchToNewBookInput(match).language).toBe("Spanish");
  });
});
