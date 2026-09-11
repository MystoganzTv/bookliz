/** isbnUtils — checksum math and parsing. Real ISBNs, no mocks. */
import {
  cleanIsbn,
  isbn10ToIsbn13,
  isbn13ToIsbn10,
  isValidIsbn,
  parseIsbn,
  validateIsbn10,
  validateIsbn13,
} from "../isbnUtils";

describe("cleanIsbn", () => {
  it("strips separators and noise", () => {
    expect(cleanIsbn("978-0-7564-0474-1")).toBe("9780756404741");
    expect(cleanIsbn(" 0 7564 0474 X ")).toBe("0756404 74X".replace(/\s/g, "").toUpperCase().replace(/[^0-9X]/g, "") || cleanIsbn("075640474X"));
  });
});

describe("validateIsbn13 / validateIsbn10", () => {
  it("accepts real ISBNs", () => {
    expect(validateIsbn13("9780756404741")).toBe(true); // The Name of the Wind
    expect(validateIsbn13("9780441172719")).toBe(true); // Dune
    expect(validateIsbn10("0756404746")).toBe(true);
  });
  it("rejects bad checksums and lengths", () => {
    expect(validateIsbn13("9780756404742")).toBe(false);
    expect(validateIsbn13("978075640474")).toBe(false);
    expect(validateIsbn10("0756404745")).toBe(false);
  });
});

describe("isbn10 ↔ isbn13 conversion", () => {
  it("round-trips", () => {
    const thirteen = isbn10ToIsbn13("0756404746");
    expect(thirteen).toBe("9780756404741");
    expect(isbn13ToIsbn10("9780756404741")).toBe("0756404746");
  });
  it("returns null for invalid input", () => {
    expect(isbn10ToIsbn13("not-an-isbn")).toBeNull();
  });
});

describe("parseIsbn", () => {
  it("parses 13-digit input", () => {
    const parsed = parseIsbn("978-0-7564-0474-1");
    expect(parsed?.isbn13).toBe("9780756404741");
  });
  it("parses 10-digit input and derives the 13", () => {
    const parsed = parseIsbn("0756404746");
    expect(parsed?.isbn13).toBe("9780756404741");
  });
  it("rejects garbage", () => {
    expect(parseIsbn("hello world")).toBeNull();
    expect(parseIsbn("12345")).toBeNull();
  });
  it("rejects non-book EAN/UPC codes even with a valid checksum", () => {
    // Coca-Cola UPC-A: valid EAN checksum, not a book.
    expect(parseIsbn("036000291452")).toBeNull();
    expect(parseIsbn("0036000291452")).toBeNull();
    // Valid EAN-13 outside the 978/979 Bookland range.
    expect(parseIsbn("4006381333931")).toBeNull();
    expect(isValidIsbn("036000291452")).toBe(false);
  });
  it("still accepts 978 and 979 ISBN-13s", () => {
    expect(parseIsbn("9780439023528")?.isbn13).toBe("9780439023528"); // Mockingjay
    expect(parseIsbn("9791032311424")?.isbn13).toBe("9791032311424"); // 979, no ISBN-10
    expect(parseIsbn("9791032311424")?.isbn10).toBeUndefined();
  });
});

describe("isValidIsbn", () => {
  it("matches parseIsbn behavior", () => {
    expect(isValidIsbn("9780441172719")).toBe(true);
    expect(isValidIsbn("12345")).toBe(false);
  });
});
