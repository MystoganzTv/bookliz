/**
 * ISBN validation, normalization, and conversion utilities.
 *
 * Handles ISBN-10 and ISBN-13, including:
 *  - Stripping spaces, hyphens, and "ISBN:" prefixes from raw scanner output
 *  - Check-digit validation for both formats
 *  - Bidirectional conversion between ISBN-10 and ISBN-13
 */

/** Remove spaces, hyphens, and any leading "ISBN:" prefix from raw input. */
export function cleanIsbn(raw: string): string {
  return raw.replace(/^isbn:?\s*/i, "").replace(/[\s\-]/g, "").toUpperCase();
}

/** Validate an ISBN-10 using the standard mod-11 check-digit algorithm. */
export function validateIsbn10(isbn: string): boolean {
  const clean = cleanIsbn(isbn);
  if (!/^\d{9}[\dX]$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * parseInt(clean[i]!, 10);
  }
  const last = clean[9]!;
  const check = last === "X" ? 10 : parseInt(last, 10);
  return (sum + check) % 11 === 0;
}

/** Validate an ISBN-13 using the standard EAN-13 check-digit algorithm. */
export function validateIsbn13(isbn: string): boolean {
  const clean = cleanIsbn(isbn);
  if (!/^\d{13}$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(clean[i]!, 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(clean[12]!, 10);
}

/**
 * Convert a valid ISBN-10 to its ISBN-13 equivalent (978-prefix).
 * Returns null if the input is not a valid ISBN-10.
 */
export function isbn10ToIsbn13(isbn10: string): string | null {
  const clean = cleanIsbn(isbn10);
  if (!validateIsbn10(clean)) return null;
  const base = "978" + clean.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(base[i]!, 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return base + check;
}

/**
 * Convert an ISBN-13 to ISBN-10 (only works for 978-prefixed ISBNs).
 * Returns null if conversion is not possible.
 */
export function isbn13ToIsbn10(isbn13: string): string | null {
  const clean = cleanIsbn(isbn13);
  if (!validateIsbn13(clean) || !clean.startsWith("978")) return null;
  const base = clean.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * parseInt(base[i]!, 10);
  }
  const remainder = (11 - (sum % 11)) % 11;
  const checkChar = remainder === 10 ? "X" : String(remainder);
  return base + checkChar;
}

export interface ParsedIsbn {
  isbn13: string;
  isbn10?: string;
  /** The raw cleaned input that was parsed */
  raw: string;
}

/**
 * Parse a raw ISBN string (from scanner or user input) into normalized form.
 *
 * Accepts ISBN-10 or ISBN-13 with or without hyphens/spaces.
 * Returns null if the string is not a recognizable, valid ISBN.
 */
export function parseIsbn(raw: string): ParsedIsbn | null {
  const clean = cleanIsbn(raw);

  // A 13-digit code is an ISBN only inside the "Bookland" EAN range (978/979).
  // Any other EAN-13/UPC with a valid checksum (groceries, toys…) is NOT a book
  // and must never be looked up as one.
  if (clean.length === 13 && isBooklandPrefix(clean) && validateIsbn13(clean)) {
    const isbn10 = isbn13ToIsbn10(clean) ?? undefined;
    return { isbn13: clean, isbn10, raw: clean };
  }

  if (clean.length === 10 && validateIsbn10(clean)) {
    const isbn13 = isbn10ToIsbn13(clean);
    if (!isbn13) return null;
    return { isbn13, isbn10: clean, raw: clean };
  }

  // 12-digit UPC-A from a scanner: zero-padding to EAN-13 yields a "0…" code,
  // which can never carry the 978/979 Bookland prefix — so it is never an ISBN.
  // The same Bookland requirement applies here; kept explicit for clarity.
  if (clean.length === 12) {
    const candidate = "0" + clean;
    if (isBooklandPrefix(candidate) && validateIsbn13(candidate)) {
      const isbn10 = isbn13ToIsbn10(candidate) ?? undefined;
      return { isbn13: candidate, isbn10, raw: clean };
    }
  }

  return null;
}

/** True when a 13-digit code sits in the ISBN ("Bookland") EAN range. */
function isBooklandPrefix(isbn13: string): boolean {
  return isbn13.startsWith("978") || isbn13.startsWith("979");
}

/** Quick check — is this a valid ISBN-10 or ISBN-13? */
export function isValidIsbn(raw: string): boolean {
  return parseIsbn(raw) !== null;
}

/** Format an ISBN-13 with hyphens in the common display style (978-X-XXX-XXXXX-X). */
export function formatIsbn13(isbn13: string): string {
  const c = cleanIsbn(isbn13);
  if (c.length !== 13) return isbn13;
  // Simple grouping: 978-X-XXX-XXXXX-X is publisher/author dependent.
  // Use a safe 3-1-4-4-1 display format.
  return `${c.slice(0, 3)}-${c[3]}-${c.slice(4, 7)}-${c.slice(7, 12)}-${c[12]}`;
}
