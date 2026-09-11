/**
 * Unit tests for src/utils/isbnUtils.ts
 *
 * Known-valid ISBNs used throughout:
 *  ISBN-10: 0306406152  (classic example, verif: sum=165+? → 0%11=0)
 *  ISBN-13: 9780306406157 (same book)
 *  ISBN-13: 9780451524935 (1984 by Orwell)
 *  ISBN-10 w/ X check: 080442957X (sum=209, 209%11=0 ✓)
 *
 * Invalid ISBN used in rejection tests: "0306406153"
 * (correct prefix, wrong check digit — 1 off from the valid "0306406152").
 *
 * Note: "0000000000" is mathematically a valid ISBN-10 (sum+check=0, 0%11=0)
 * so it does NOT produce null and is NOT used as an "invalid" test case.
 */

import {
  cleanIsbn,
  validateIsbn10,
  validateIsbn13,
  isbn10ToIsbn13,
  isbn13ToIsbn10,
  parseIsbn,
  isValidIsbn,
  formatIsbn13,
} from "../utils/isbnUtils";

// ─── cleanIsbn ────────────────────────────────────────────────────────────────

describe("cleanIsbn", () => {
  it("strips hyphens", () => {
    expect(cleanIsbn("978-0-306-40615-7")).toBe("9780306406157");
  });

  it("strips spaces", () => {
    expect(cleanIsbn("978 0 306 40615 7")).toBe("9780306406157");
  });

  it("strips ISBN: prefix (case-insensitive)", () => {
    expect(cleanIsbn("ISBN: 9780306406157")).toBe("9780306406157");
    expect(cleanIsbn("isbn:9780306406157")).toBe("9780306406157");
  });

  it("uppercases the X check digit", () => {
    expect(cleanIsbn("080442957x")).toBe("080442957X");
  });

  it("leaves a clean string unchanged", () => {
    expect(cleanIsbn("9780306406157")).toBe("9780306406157");
  });
});

// ─── validateIsbn10 ───────────────────────────────────────────────────────────

describe("validateIsbn10", () => {
  it("validates a known valid ISBN-10", () => {
    expect(validateIsbn10("0306406152")).toBe(true);
  });

  it("validates ISBN-10 with X check digit", () => {
    // 080442957X: sum=0+72+0+28+24+10+36+15+14+10=209, 209%11=0 ✓
    expect(validateIsbn10("080442957X")).toBe(true);
  });

  it("accepts hyphenated input", () => {
    expect(validateIsbn10("0-306-40615-2")).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    // 0306406153: one digit off from the valid 0306406152
    expect(validateIsbn10("0306406153")).toBe(false);
  });

  it("rejects too-short input", () => {
    expect(validateIsbn10("030640615")).toBe(false);
  });

  it("rejects ISBN-13 length input", () => {
    expect(validateIsbn10("9780306406157")).toBe(false);
  });

  it("rejects entirely non-numeric input", () => {
    expect(validateIsbn10("ABCDEFGHIJ")).toBe(false);
  });
});

// ─── validateIsbn13 ───────────────────────────────────────────────────────────

describe("validateIsbn13", () => {
  it("validates a known valid ISBN-13", () => {
    expect(validateIsbn13("9780306406157")).toBe(true);
  });

  it("validates 1984 by Orwell", () => {
    expect(validateIsbn13("9780451524935")).toBe(true);
  });

  it("accepts hyphenated input", () => {
    expect(validateIsbn13("978-0-306-40615-7")).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    expect(validateIsbn13("9780306406150")).toBe(false);
  });

  it("rejects 10-digit input", () => {
    expect(validateIsbn13("0306406152")).toBe(false);
  });

  it("rejects 12-digit input", () => {
    expect(validateIsbn13("978030640615")).toBe(false);
  });
});

// ─── isbn10ToIsbn13 ───────────────────────────────────────────────────────────

describe("isbn10ToIsbn13", () => {
  it("converts a valid ISBN-10 to ISBN-13", () => {
    expect(isbn10ToIsbn13("0306406152")).toBe("9780306406157");
  });

  it("converts ISBN-10 with X check digit", () => {
    const result = isbn10ToIsbn13("080442957X");
    expect(result).not.toBeNull();
    expect(validateIsbn13(result!)).toBe(true);
  });

  it("accepts hyphenated ISBN-10 input", () => {
    expect(isbn10ToIsbn13("0-306-40615-2")).toBe("9780306406157");
  });

  it("returns null for ISBN-10 with wrong check digit", () => {
    // 0306406153: wrong check digit — validateIsbn10 returns false
    expect(isbn10ToIsbn13("0306406153")).toBeNull();
  });

  it("returns null for ISBN-13 length input (13 digits)", () => {
    expect(isbn10ToIsbn13("9780306406157")).toBeNull();
  });
});

// ─── isbn13ToIsbn10 ───────────────────────────────────────────────────────────

describe("isbn13ToIsbn10", () => {
  it("converts a 978-prefixed ISBN-13 to ISBN-10", () => {
    expect(isbn13ToIsbn10("9780306406157")).toBe("0306406152");
  });

  it("returns null for 979-prefixed ISBN-13 (no ISBN-10 equivalent)", () => {
    // 979 prefix cannot be converted to ISBN-10 (the code checks for "978" prefix)
    // Build a structurally valid-looking 979 ISBN for the test:
    // 9791032311424 is a real 979 ISBN
    expect(isbn13ToIsbn10("9791032311424")).toBeNull();
  });

  it("returns null for an invalid ISBN-13", () => {
    expect(isbn13ToIsbn10("9780306406150")).toBeNull(); // bad check digit
  });

  it("round-trips ISBN-10 → ISBN-13 → ISBN-10", () => {
    const original = "0306406152";
    const as13 = isbn10ToIsbn13(original);
    expect(as13).not.toBeNull();
    const backTo10 = isbn13ToIsbn10(as13!);
    expect(backTo10).toBe(original);
  });
});

// ─── parseIsbn ────────────────────────────────────────────────────────────────

describe("parseIsbn", () => {
  it("parses a clean ISBN-13", () => {
    const result = parseIsbn("9780306406157");
    expect(result).not.toBeNull();
    expect(result!.isbn13).toBe("9780306406157");
    expect(result!.isbn10).toBe("0306406152");
  });

  it("parses a hyphenated ISBN-13", () => {
    const result = parseIsbn("978-0-306-40615-7");
    expect(result!.isbn13).toBe("9780306406157");
  });

  it("parses a clean ISBN-10 and provides isbn13", () => {
    const result = parseIsbn("0306406152");
    expect(result!.isbn13).toBe("9780306406157");
    expect(result!.isbn10).toBe("0306406152");
  });

  it("parses ISBN-10 with X check digit", () => {
    const result = parseIsbn("080442957X");
    expect(result).not.toBeNull();
    expect(result!.isbn10).toBe("080442957X");
    expect(validateIsbn13(result!.isbn13)).toBe(true);
  });

  it("parses ISBN: prefixed string", () => {
    const result = parseIsbn("ISBN: 9780306406157");
    expect(result!.isbn13).toBe("9780306406157");
  });

  it("returns null for garbage input", () => {
    expect(parseIsbn("not-an-isbn")).toBeNull();
  });

  it("returns null for ISBN with wrong check digit", () => {
    // 0306406153: wrong last digit, won't pass validateIsbn10
    expect(parseIsbn("0306406153")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseIsbn("")).toBeNull();
  });

  it("rejects 12-digit UPC-A input (zero-padded EAN can never be Bookland 978/979)", () => {
    const upc12 = "780306406157"; // dropping leading "9" from 9780306406157
    expect(parseIsbn(upc12)).toBeNull();
    // A real product UPC with a valid checksum is not a book either.
    expect(parseIsbn("036000291452")).toBeNull();
  });

  it("rejects a checksum-valid EAN-13 outside the 978/979 range", () => {
    expect(validateIsbn13("4006381333931")).toBe(true); // checksum math is fine…
    expect(parseIsbn("4006381333931")).toBeNull();      // …but it is not an ISBN
    expect(isValidIsbn("4006381333931")).toBe(false);
  });

  it("accepts 979-prefixed ISBN-13 (no ISBN-10 equivalent)", () => {
    const result = parseIsbn("9791032311424");
    expect(result?.isbn13).toBe("9791032311424");
    expect(result?.isbn10).toBeUndefined();
  });
});

// ─── isValidIsbn ──────────────────────────────────────────────────────────────

describe("isValidIsbn", () => {
  it("returns true for valid ISBN-13", () => {
    expect(isValidIsbn("9780306406157")).toBe(true);
  });

  it("returns true for valid ISBN-10", () => {
    expect(isValidIsbn("0306406152")).toBe(true);
  });

  it("returns false for wrong-check-digit ISBN", () => {
    expect(isValidIsbn("0306406153")).toBe(false);
  });

  it("returns false for too-short input", () => {
    expect(isValidIsbn("12345")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidIsbn("")).toBe(false);
  });

  it("returns false for non-numeric text", () => {
    expect(isValidIsbn("hello world")).toBe(false);
  });
});

// ─── formatIsbn13 ─────────────────────────────────────────────────────────────

describe("formatIsbn13", () => {
  it("formats a 13-digit ISBN with hyphens", () => {
    expect(formatIsbn13("9780306406157")).toBe("978-0-306-40615-7");
  });

  it("returns original if not 13 digits", () => {
    expect(formatIsbn13("short")).toBe("short");
  });

  it("strips hyphens from already-hyphenated input before formatting", () => {
    const formatted = formatIsbn13("978-0-306-40615-7");
    expect(formatted).toBe("978-0-306-40615-7");
  });
});
