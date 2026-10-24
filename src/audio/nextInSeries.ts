/**
 * Autoplay at the end of a book: the next book of the same saga, if its audio
 * is on this phone. Pure.
 *
 * "Same saga" = same seriesId, or — for books without one — the same series
 * name ignoring case and accents. "Next" = the smallest order above the
 * current one, by sagaOrder (reading order) when both books have it, else
 * seriesNumber. A book with no order never autoplays anything: guessing the
 * next book of a saga is worse than stopping.
 */
import type { Book } from "../types/models";

const norm = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const sameSaga = (a: Book, b: Book) => {
  if (a.seriesId && b.seriesId) return a.seriesId === b.seriesId;
  return Boolean(a.seriesName && b.seriesName && norm(a.seriesName) === norm(b.seriesName));
};

const orderOf = (book: Book, useSagaOrder: boolean) => (useSagaOrder ? book.sagaOrder : book.seriesNumber);

export function nextInSeries(current: Book, books: readonly Book[], hasAudio: (bookId: string) => boolean): Book | null {
  const siblings = books.filter((b) => b.id !== current.id && sameSaga(current, b) && hasAudio(b.id));
  if (!siblings.length) return null;
  for (const useSagaOrder of [true, false]) {
    const mine = orderOf(current, useSagaOrder);
    if (typeof mine !== "number") continue;
    const next = siblings
      .filter((b) => {
        const order = orderOf(b, useSagaOrder);
        return typeof order === "number" && order > mine;
      })
      .sort((a, b) => (orderOf(a, useSagaOrder) as number) - (orderOf(b, useSagaOrder) as number))[0];
    if (next) return next;
  }
  return null;
}
