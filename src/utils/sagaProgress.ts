/**
 * sagaProgress — what the Saga hub is allowed to claim.
 *
 * The hub used to count only the books that happened to be in the library:
 * own book 3 of a trilogy, finish it, and the screen said "1/1 finished ·
 * 100 % · Saga complete". Every number on that screen was about the shelf,
 * dressed up as a fact about the saga.
 *
 * The rule pinned here: the saga is at least as long as the highest book
 * number we have evidence for — a book numbered 3 proves books 1 and 2 exist —
 * and, when the curated catalogue knows the series, as long as the catalogue
 * says. A saga is only "complete" when every one of those positions has a book
 * you finished. When nothing is numbered we cannot know the length, so we never
 * say "complete"; we say you have read everything you own from it.
 *
 * Pure, no React.
 */
import { Book } from "../types/models";
import { KNOWN_SERIES, KnownSeries } from "./knownWorks";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const SEP = "[\\s]*[•·:\\-–—|,][\\s]*";
const NUMBER_WORD = "(?:book|libro|tomo|vol\\.?|volume|volumen|livre|band|#)";

/**
 * Series names arrive dirty from catalogues and from typing: "Book 3 • The
 * Empyrean", "The Empyrean, #3", "The Empyrean (Book 3)", "Empyrean 3".
 * Returns the bare name and, when the string carried one, the book number.
 */
export function cleanSeriesName(raw: string | undefined): { name: string; number?: number } {
  let name = (raw ?? "").trim();
  if (!name) return { name: "" };
  let number: number | undefined;

  const leading = new RegExp(`^${NUMBER_WORD}\\s*(\\d{1,3})${SEP}(.+)$`, "i").exec(name);
  if (leading) {
    number = Number(leading[1]);
    name = leading[2].trim();
  }

  const trailing = new RegExp(`^(.+?)(?:\\s*[,(\\[]\\s*|\\s+)${NUMBER_WORD}\\s*(\\d{1,3})\\s*[)\\]]?$`, "i").exec(name);
  if (trailing) {
    number = number ?? Number(trailing[2]);
    name = trailing[1].replace(/[\s,;:·•\-–—]+$/, "").trim();
  }

  return { name: name || (raw ?? "").trim(), number };
}

/** Curated series by name or alias (diacritics and case ignored). */
export function findKnownSeries(seriesName: string | undefined): KnownSeries | null {
  const wanted = normalize(cleanSeriesName(seriesName).name).replace(/^(the|el|la|los|las)\s+/, "");
  if (!wanted) return null;
  return (
    KNOWN_SERIES.find((series) =>
      [series.name, ...series.aliases].some(
        (candidate) => normalize(candidate).replace(/^(the|el|la|los|las)\s+/, "") === wanted
      )
    ) ?? null
  );
}

export type SagaSlot =
  | { kind: "book"; order: number | null; book: Book }
  | { kind: "missing"; order: number; knownTitle?: string };

export type SagaProgress = {
  name: string;
  /** Length of the saga we have evidence for (never smaller than the shelf). */
  total: number;
  /** True when `total` is backed by book numbers or the catalogue. */
  lengthKnown: boolean;
  finished: number;
  owned: number;
  /** Positions with no book in the library. */
  missing: number;
  slots: SagaSlot[];
  /** Every known position has a finished book. Never true when length is unknown. */
  complete: boolean;
  /** Everything on the shelf is read, whatever the saga's length. */
  shelfFinished: boolean;
};

const orderOf = (book: Book): number | null => {
  const value = book.sagaOrder ?? book.seriesNumber ?? cleanSeriesName(book.seriesName).number;
  return typeof value === "number" && value > 0 ? value : null;
};

export function buildSagaProgress(sagaBooks: Book[], fallbackName = ""): SagaProgress {
  const rawName = sagaBooks.find((book) => book.seriesName?.trim())?.seriesName ?? fallbackName;
  const known = findKnownSeries(rawName);
  const name = known?.name || cleanSeriesName(rawName).name || fallbackName;

  const numbered = sagaBooks.map(orderOf).filter((value): value is number => value !== null);
  const maxShelfOrder = numbered.length ? Math.max(...numbered) : 0;
  const knownOrders = (known?.books ?? []).map((book) => book.order).filter((order) => order > 0);
  const maxKnownOrder = knownOrders.length ? Math.max(...knownOrders) : 0;
  const maxOrder = Math.max(maxShelfOrder, maxKnownOrder);
  const lengthKnown = maxOrder > 0;

  const slots: SagaSlot[] = [];
  for (let order = 1; order <= maxOrder; order += 1) {
    const atOrder = sagaBooks.filter((book) => orderOf(book) === order);
    if (atOrder.length) {
      atOrder.forEach((book) => slots.push({ kind: "book", order, book }));
    } else {
      const knownTitle = known?.books.find((book) => book.order === order)?.titles[0];
      slots.push({ kind: "missing", order, knownTitle });
    }
  }
  sagaBooks
    .filter((book) => orderOf(book) === null)
    .forEach((book) => slots.push({ kind: "book", order: null, book }));

  const isRead = (book: Book) => book.userStatus.status === "read";
  const positions = lengthKnown ? maxOrder : 0;
  // A position counts as finished when any copy at that number is read.
  const finishedPositions = lengthKnown
    ? Array.from({ length: maxOrder }, (_, index) => index + 1).filter((order) =>
        sagaBooks.some((book) => orderOf(book) === order && isRead(book))
      ).length
    : 0;
  const unnumberedRead = sagaBooks.filter((book) => orderOf(book) === null && isRead(book)).length;
  const unnumbered = sagaBooks.filter((book) => orderOf(book) === null).length;

  const total = lengthKnown ? positions + unnumbered : sagaBooks.length;
  const finished = lengthKnown ? finishedPositions + unnumberedRead : sagaBooks.filter(isRead).length;
  const missing = slots.filter((slot) => slot.kind === "missing").length;
  const shelfFinished = sagaBooks.length > 0 && sagaBooks.every(isRead);

  return {
    name,
    total,
    lengthKnown,
    finished,
    owned: sagaBooks.filter((book) => book.userStatus.ownership === "owned").length,
    missing,
    slots,
    complete: lengthKnown && missing === 0 && shelfFinished,
    shelfFinished,
  };
}
