/**
 * Finding books whose stored language contradicts their ISBN.
 *
 * Until 2026-09-12, `addBook` defaulted an unknown language to "English". Every
 * book added without a detected language — the whole photo flow, and anything
 * a provider answered without one — was stored as English and synced that way.
 * That is not cosmetic: the language lock reads `book.language` to decide which
 * edition's metadata may be applied, so a Spanish book labelled English pulls
 * English title, synopsis and cover on its next refresh.
 *
 * The default is gone, but the rows it already wrote are still there.
 *
 * ── On using the ISBN registration group ────────────────────────────────────
 * `languageFromIsbnGroup` carries an explicit instruction in its own docs: its
 * return value is never assigned to `language` / `languageCode`, never stored,
 * never rendered, and its only legitimate consumers are query ordering and
 * `isSameLanguage(...)` comparisons — because a registration group is a fact
 * about the publisher, not evidence about the text.
 *
 * This module stays inside that rule. It uses the group ONLY in an
 * `isSameLanguage` comparison, to notice a contradiction, and the repair
 * CLEARS the stored language rather than writing the implied one. A group tells
 * us the stored value is doubtful; it does not tell us the right answer, and
 * an English book published in Barcelona is uncommon but real.
 *
 * Clearing is therefore the honest outcome: "" means unknown here exactly as it
 * does for synopsis and publisher, and the next metadata refresh can establish
 * the language from the edition itself.
 *
 * It is also why nothing here runs automatically. Deriving at read time repairs
 * the shelves without touching data (see shelfRules); this cannot, because the
 * value being wrong is the data. So it surfaces a list and waits to be told.
 */

import { languageFromIsbnGroup } from "../services/bookMetadataAggregator";
import { isSameLanguage } from "../utils/languageUtils";

export type LanguageSuspect = {
  bookId: string;
  title: string;
  /** What the book currently claims. */
  storedLanguage: string;
  /** What the ISBN's registration group implies. Reported, never written. */
  impliedLanguage: string;
};

type BookLike = {
  id: string;
  title: string;
  isbn?: string;
  language?: string;
};

/**
 * Books whose ISBN registration group disagrees with their stored language.
 *
 * Only books with a 13-digit ISBN can be checked at all; a book with no ISBN
 * may well be mislabelled too, but there is no evidence either way and
 * guessing is the thing that caused this.
 */
export function findContradictedLanguages(books: readonly BookLike[]): LanguageSuspect[] {
  const suspects: LanguageSuspect[] = [];

  for (const book of books) {
    const stored = book.language?.trim();
    if (!stored) continue; // already unknown — nothing to repair

    const digits = (book.isbn ?? "").replace(/\D/g, "");
    if (digits.length !== 13) continue;

    const implied = languageFromIsbnGroup(digits);
    if (!implied) continue; // group not in the table, or not a 978/979 prefix

    if (isSameLanguage(stored, implied)) continue;

    suspects.push({
      bookId: book.id,
      title: book.title,
      storedLanguage: stored,
      impliedLanguage: implied,
    });
  }

  return suspects;
}
