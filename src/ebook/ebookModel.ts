/**
 * Ebooks in Bookliz's own reader — the shape, and the pure arithmetic over it.
 *
 * Four formats, one record. Where the reader is gets stored the way each
 * format can say it: an EPUB as a CFI (epub.js), a PDF or comic as a page
 * number, a TXT as a scroll fraction. Every format also stores `progress`
 * (0…1), which is what the rest of the app looks at.
 *
 * Only DRM-free files: Kindle (AZW/KFX) and Apple Books purchases are locked
 * and no third-party app can open them. They are named so the import can say
 * why, instead of "unsupported".
 */

export type EbookFormat = "epub" | "pdf" | "comic" | "txt";

export type ReaderTheme = "light" | "sepia" | "dark";

export interface Ebook {
  id: string;
  /** null = imported but not given to a book yet ("Not in a book yet"). */
  bookId: string | null;
  /** Folder under Documents/ebooks — never an absolute path (the app container moves between installs). */
  folder: string;
  /** File name inside the folder. */
  file: string;
  format: EbookFormat;
  /** Shown while the file has no book: the file name, cleaned up. */
  title: string;
  bytes: number;
  /** 0…1 — how far through the whole file. */
  progress: number;
  /** EPUB only: epub.js CFI of the first visible character. */
  cfi?: string;
  /** PDF / comic: current page, 1-based. */
  page?: number;
  /** PDF / comic: page count, once the reader has opened it. */
  pages?: number;
  addedAt: string;
  lastOpenedAt?: string;
}

export const EBOOK_EXTENSIONS: Record<string, EbookFormat> = {
  epub: "epub",
  pdf: "pdf",
  cbz: "comic",
  cbr: "comic",
  txt: "txt",
};

/** DRM-locked ebook formats — named so the import can say why. */
export const LOCKED_EBOOK_EXTENSIONS = ["azw", "azw3", "azw4", "kfx", "mobi", "prc", "ibooks", "acsm"] as const;

export const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
};

export const ebookFormatOf = (name: string): EbookFormat | null => EBOOK_EXTENSIONS[extensionOf(name)] ?? null;
export const isEbookFileName = (name: string) => ebookFormatOf(name) !== null;
export const isLockedEbookFileName = (name: string) =>
  (LOCKED_EBOOK_EXTENSIONS as readonly string[]).includes(extensionOf(name));

/** "the_martian-andy_weir.epub" → "the martian - andy weir". */
export function titleFromEbookFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return base.replace(/[_]+/g, " ").replace(/\s+-\s+|-(?=\S)/g, " - ").replace(/\s{2,}/g, " ").trim() || name;
}

export const clampProgress = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** Progress from a page position: being ON the last page is the end of the book. */
export function progressOfPage(page: number, pages: number): number {
  if (!(pages > 0)) return 0;
  if (pages === 1) return page >= 1 ? 1 : 0;
  return clampProgress((page - 1) / (pages - 1));
}

/** The ZIP local-file signature — how a .cbr that is really a .cbz is told from a RAR. */
export const isZipSignature = (bytes: ArrayLike<number>): boolean =>
  bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05) && (bytes[3] === 0x04 || bytes[3] === 0x06);

/** "Rar!" — a real RAR comic, which this reader cannot open. */
export const isRarSignature = (bytes: ArrayLike<number>): boolean =>
  bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21;

/** Comic pages inside an archive, in reading order: images only, no macOS junk, natural sort. */
export function comicPageNames(entries: readonly string[]): string[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return entries
    .filter((name) => !name.endsWith("/"))
    .filter((name) => !name.startsWith("__MACOSX/") && !/(^|\/)\./.test(name))
    .filter((name) => /\.(jpe?g|png|webp|gif)$/i.test(name))
    .sort((a, b) => collator.compare(a, b));
}

export const READER_THEMES: Record<ReaderTheme, { bg: string; text: string; muted: string }> = {
  light: { bg: "#FFFFFF", text: "#1B1B1F", muted: "#6B6B73" },
  sepia: { bg: "#F4ECD8", text: "#3B2F22", muted: "#7A6A55" },
  dark: { bg: "#121212", text: "#E6E1D8", muted: "#8E8A84" },
};

export const FONT_SIZES = [14, 16, 18, 20, 23, 26, 30] as const;
