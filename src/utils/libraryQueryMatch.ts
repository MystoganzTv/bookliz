/**
 * Rank the reader's own books against a rough query — usually a title guessed
 * from audio or ebook file names ("Dune Messiah Part 01").
 *
 * This is NOT the catalog search: that lives in the Book Intelligence Engine
 * (services/bookMetadataAggregator `lookupByQuery`) and is what every "find a
 * book" flow uses. This only answers "is it already on my shelf?", which the
 * catalog cannot know — a book typed in by hand may not exist there at all.
 */

export type LibraryQueryRow = {
  id: string;
  title: string;
  author: string;
  seriesName?: string;
  format?: string;
  hasAudio?: boolean;
};

export type RankedLibraryRow<T extends LibraryQueryRow> = T & { hits: number };

export const normalizeForLibraryQuery = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Query words worth matching on: one-letter crumbs ("y", "a", "1") say nothing. */
export const libraryQueryWords = (query: string) =>
  normalizeForLibraryQuery(query).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);

/**
 * Rows whose title / author / series contain at least `minShare` of the query
 * words (0 = any one word), best first. Ties: books still without audio first,
 * audiobook-format copies before the rest, then title.
 */
export function rankLibraryRows<T extends LibraryQueryRow>(
  rows: readonly T[],
  query: string,
  { minShare = 0 }: { minShare?: number } = {}
): RankedLibraryRow<T>[] {
  const words = libraryQueryWords(query);
  const needed = words.length ? Math.max(1, Math.ceil(words.length * minShare)) : 0;
  const rank = (row: T) => (row.hasAudio ? 2 : row.format === "audiobook" ? 0 : 1);
  return rows
    .map((row) => {
      const hay = normalizeForLibraryQuery(`${row.title} ${row.author} ${row.seriesName ?? ""}`);
      return { ...row, hits: words.filter((w) => hay.includes(w)).length };
    })
    .filter((row) => row.hits >= needed)
    .sort((a, b) => b.hits - a.hits || rank(a) - rank(b) || a.title.localeCompare(b.title));
}
