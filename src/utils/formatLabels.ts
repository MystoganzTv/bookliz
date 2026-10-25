import { ReadingFormat } from "../types/models";

/**
 * i18n key for a book format — render with t(formatLabelKey(format)).
 * The detail screen used to print the raw value ("Audiobook") in every
 * language; the labels already existed for the edit screen.
 */
const FORMAT_KEYS: Partial<Record<ReadingFormat, string>> = {
  paperback: "editBook.fmtPaperback",
  hardcover: "editBook.fmtHardcover",
  "mass-market-paperback": "editBook.fmtMassMarket",
  "spiral-bound": "editBook.fmtSpiral",
  "leather-bound": "editBook.fmtLeather",
  ebook: "editBook.fmtEbook",
  kindle: "editBook.fmtEbook",
  audiobook: "editBook.fmtAudiobook",
  "comic-book": "editBook.fmtComic",
  "graphic-novel": "editBook.fmtGraphicNovel",
  manga: "editBook.fmtManga",
  magazine: "editBook.fmtMagazine",
};

export function formatLabel(format: string, t: (key: string) => string): string {
  const key = FORMAT_KEYS[format as ReadingFormat];
  if (key) return t(key);
  return format.charAt(0).toUpperCase() + format.slice(1).replace(/-/g, " ");
}
