import { Author, Book, Recommendation, ReadingSession } from "../types/models";

type RecommendationReason = Recommendation["reason"];

export function buildGlobalRecommendations(
  books: Book[],
  sessions: ReadingSession[],
  authors: Author[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  recommendations.push(...buildContinueSagaRecommendations(books));
  recommendations.push(...buildSameAuthorRecommendations(books, authors));
  recommendations.push(...buildBecauseYouLikedRecommendations(books));
  recommendations.push(...buildUpcomingRecommendations(books));

  return dedupeRecommendations(recommendations).sort((a, b) => b.confidence - a.confidence);
}

export function buildBookSpecificRecommendations(
  targetBook: Book,
  books: Book[],
  sessions: ReadingSession[],
  authors: Author[],
  limit = 4
): Recommendation[] {
  const targetSeriesNum = targetBook.seriesNumber ?? targetBook.sagaOrder;

  const discoverable = books.filter((book) => {
    if (!isDiscoverable(book) || book.id === targetBook.id) return false;
    // Exclude books at the same or earlier position in the same series
    if (targetBook.seriesId && book.seriesId === targetBook.seriesId && targetSeriesNum != null) {
      const bookNum = book.seriesNumber ?? book.sagaOrder;
      if (bookNum != null && bookNum <= targetSeriesNum) return false;
    }
    // Exclude likely different-language editions of the same work (same author + similar title)
    if (book.authorId === targetBook.authorId && titlesAreProbablySameWork(book.title, targetBook.title)) return false;
    return true;
  });
  const recommendations: Recommendation[] = [];

  // Priority: next book(s) in the same series
  if (targetBook.seriesId) {
    discoverable
      .filter((book) => book.seriesId === targetBook.seriesId)
      .sort(bySeriesOrder)
      .slice(0, 2)
      .forEach((book, index) => {
        const bookNum = book.seriesNumber ?? book.sagaOrder;
        const numStr = bookNum != null ? ` #${bookNum}` : "";
        recommendations.push(
          makeRecommendation(
            `continue-saga-${targetBook.id}-${book.id}`,
            book.id,
            "continue-saga",
            97 - index * 3,
            `Next in ${targetBook.seriesName ?? "the series"}${numStr}. Keep the story going.`
          )
        );
      });
  }

  // Same author — excluding books already captured as series continuations
  discoverable
    .filter((book) => book.authorId === targetBook.authorId && book.seriesId !== targetBook.seriesId)
    .slice(0, 2)
    .forEach((book, index) => {
      const authorName = authors.find((author) => author.id === targetBook.authorId)?.name ?? "this author";
      recommendations.push(
        makeRecommendation(
          `same-author-${targetBook.id}-${book.id}`,
          book.id,
          "same-author",
          88 - index * 5,
          `You already have a connection with ${authorName}. ${book.title} is the next logical shelf move.`
        )
      );
    });

  discoverable
    .filter((book) => sharesGenre(book, targetBook))
    .sort((a, b) => sharedGenreCount(b, targetBook) - sharedGenreCount(a, targetBook))
    .slice(0, 3)
    .forEach((book, index) => {
      const shared = getSharedGenres(book, targetBook).slice(0, 2).join(" + ");
      recommendations.push(
        makeRecommendation(
          `same-genre-${targetBook.id}-${book.id}`,
          book.id,
          "same-genre",
          84 - index * 4,
          shared
            ? `Shared shelf DNA: ${shared}.`
            : `This sits close to the same lane as ${targetBook.title}.`
        )
      );
    });


  return dedupeRecommendations(recommendations)
    .filter((recommendation) => recommendation.bookId !== targetBook.id)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

function buildContinueSagaRecommendations(books: Book[]) {
  const recommendations: Recommendation[] = [];
  const seriesIds = Array.from(new Set(books.map((book) => book.seriesId).filter(Boolean))) as string[];

  seriesIds.forEach((seriesId) => {
    const seriesBooks = books
      .filter((book) => book.seriesId === seriesId)
      .sort(bySeriesOrder);

    const engaged = seriesBooks.filter((book) => book.userStatus.status === "read" || book.userStatus.status === "reading");
    if (!engaged.length) return;

    const current = engaged.sort(bySeriesOrder).at(-1);
    if (!current) return;

    const nextBook = seriesBooks.find((book) => (book.seriesNumber ?? 0) > (current.seriesNumber ?? 0) && isDiscoverable(book));
    if (!nextBook) return;

    const confidence = current.userStatus.status === "reading" ? 98 : 92;
    const note = current.userStatus.status === "reading"
      ? `You are in ${current.seriesName} right now. ${nextBook.title} is the natural next stop.`
      : `You already made progress in ${current.seriesName}. ${nextBook.title} keeps the arc intact.`;

    recommendations.push(
      makeRecommendation(`continue-saga-${nextBook.id}`, nextBook.id, "continue-saga", confidence, note)
    );
  });

  return recommendations;
}

function buildSameAuthorRecommendations(books: Book[], authors: Author[]) {
  const recommendations: Recommendation[] = [];
  const lovedAuthors = Array.from(
    new Set(
      books
        .filter((book) => (book.userStatus.rating ?? 0) >= 4 || book.userStatus.status === "read")
        .map((book) => book.authorId)
    )
  );

  lovedAuthors.forEach((authorId) => {
    const unreadByAuthor = books.filter((book) => book.authorId === authorId && isDiscoverable(book));
    const anchor = books
      .filter((book) => book.authorId === authorId && (book.userStatus.rating ?? 0) >= 4)
      .sort((a, b) => (b.userStatus.rating ?? 0) - (a.userStatus.rating ?? 0))[0];

    unreadByAuthor.slice(0, 1).forEach((book) => {
      const authorName = authors.find((author) => author.id === authorId)?.name ?? "this author";
      recommendations.push(
        makeRecommendation(
          `same-author-${book.id}`,
          book.id,
          "same-author",
          anchor ? 88 : 80,
          anchor
            ? `Because ${anchor.title} worked for you, ${authorName} is worth following deeper.`
            : `You already collect ${authorName}; this one fits your shelf.`
        )
      );
    });
  });

  return recommendations;
}

function buildBecauseYouLikedRecommendations(books: Book[]) {
  const recommendations: Recommendation[] = [];
  const lovedBooks = books
    .filter((book) => book.userStatus.status === "read" && (book.userStatus.rating ?? 0) >= 4)
    .sort((a, b) => (b.userStatus.rating ?? 0) - (a.userStatus.rating ?? 0))
    .slice(0, 4);

  lovedBooks.forEach((anchor) => {
    const candidate = books
      .filter((book) => isDiscoverable(book) && book.id !== anchor.id && sharesGenre(book, anchor))
      .sort((a, b) => sharedGenreCount(b, anchor) - sharedGenreCount(a, anchor))[0];

    if (!candidate) return;

    recommendations.push(
      makeRecommendation(
        `because-liked-${anchor.id}-${candidate.id}`,
        candidate.id,
        "because-you-liked",
        86,
        `Because you liked ${anchor.title}, ${candidate.title} matches the same shelf mood.`
      )
    );
  });

  return recommendations;
}

function buildUpcomingRecommendations(books: Book[]) {
  const today = new Date().toISOString().slice(0, 10);

  return books
    .filter((book) => isDiscoverable(book) && (book.userStatus.status === "upcoming-release" || Boolean(book.upcomingReleaseDate)))
    .sort((a, b) => (a.upcomingReleaseDate ?? a.publishedDate).localeCompare(b.upcomingReleaseDate ?? b.publishedDate))
    .slice(0, 2)
    .map((book, index) => {
      const releaseDate = book.upcomingReleaseDate ?? book.publishedDate;
      const releaseCopy = releaseDate >= today ? `releases on ${releaseDate}` : `was tracked for ${releaseDate}`;
      return makeRecommendation(
        `upcoming-${book.id}`,
        book.id,
        "upcoming-release",
        82 - index * 3,
        `${book.title} ${releaseCopy} and already sits on your radar.`
      );
    });
}

function dedupeRecommendations(recommendations: Recommendation[]) {
  const map = new Map<string, Recommendation>();

  recommendations.forEach((recommendation) => {
    const existing = map.get(recommendation.bookId);
    if (!existing || recommendation.confidence > existing.confidence) {
      map.set(recommendation.bookId, recommendation);
    }
  });

  return Array.from(map.values());
}

function makeRecommendation(
  id: string,
  bookId: string,
  reason: RecommendationReason,
  confidence: number,
  note: string
): Recommendation {
  return { id, bookId, reason, confidence, note };
}

function isDiscoverable(book: Book) {
  return book.userStatus.status !== "read" && book.userStatus.status !== "reading";
}

function bySeriesOrder(a: Book, b: Book) {
  return (a.seriesNumber ?? a.sagaOrder ?? 999) - (b.seriesNumber ?? b.sagaOrder ?? 999);
}

// Genres too broad to mean anything for similarity — "Fiction" matches half
// the library and produces nonsense "Same genre" recommendations.
const GENERIC_GENRES = new Set([
  "fiction", "nonfiction", "non-fiction", "general", "uncategorized",
  "books", "literature", "adult", "juvenile fiction",
]);

const specificGenres = (book: Book) =>
  book.genre.filter((genre) => !GENERIC_GENRES.has(genre.trim().toLowerCase()));

function sharesGenre(a: Book, b: Book) {
  // Only specific genres count — "Fiction"/"General" overlap is noise.
  const bSpecific = specificGenres(b);
  return specificGenres(a).some((genre) => bSpecific.includes(genre));
}

function sharedGenreCount(a: Book, b: Book) {
  return getSharedGenres(a, b).length;
}

function getSharedGenres(a: Book, b: Book) {
  const bSpecific = specificGenres(b);
  return specificGenres(a).filter((genre) => bSpecific.includes(genre));
}

function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Returns true if two titles are likely the same work (e.g., different-language editions).
// Compares significant words (>3 chars) — needs ≥2 matches AND ≥60% overlap.
function titlesAreProbablySameWork(a: string, b: string): boolean {
  const na = normalizeTitle(a).split(" ").filter((w) => w.length > 3);
  const nb = normalizeTitle(b).split(" ").filter((w) => w.length > 3);
  if (!na.length || !nb.length) return false;
  const shorter = na.length <= nb.length ? na : nb;
  const longerSet = new Set(na.length > nb.length ? na : nb);
  const matches = shorter.filter((word) => longerSet.has(word)).length;
  return matches >= 2 && matches / shorter.length >= 0.6;
}

function getTopCount(values: string[]) {
  const counts = values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
}
