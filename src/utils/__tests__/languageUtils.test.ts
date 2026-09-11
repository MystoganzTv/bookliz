/** languageUtils — the normalization the strict language policy depends on. */
import {
  isSameLanguage,
  languageCode,
  languageDisplayName,
  normalizeLanguage,
} from "../languageUtils";

describe("normalizeLanguage", () => {
  it("handles 2-letter codes", () => {
    expect(normalizeLanguage("es")).toEqual({ code: "es", name: "Spanish" });
    expect(normalizeLanguage("EN")).toEqual({ code: "en", name: "English" });
  });
  it("handles 3-letter codes incl. Open Library paths", () => {
    expect(normalizeLanguage("spa")?.code).toBe("es");
    expect(normalizeLanguage("/languages/eng")?.code).toBe("en");
  });
  it("handles display names", () => {
    expect(normalizeLanguage("Spanish")?.code).toBe("es");
    expect(normalizeLanguage("french")?.code).toBe("fr");
  });
  it("returns undefined for unknown input", () => {
    expect(normalizeLanguage("klingon")).toBeUndefined();
    expect(normalizeLanguage("")).toBeUndefined();
    expect(normalizeLanguage(undefined)).toBeUndefined();
  });
  it("never truncates a 3-letter code to a 2-letter prefix (est ≠ es, rum ≠ ru)", () => {
    expect(normalizeLanguage("est")).toEqual({ code: "et", name: "Estonian" });
    expect(normalizeLanguage("rum")).toEqual({ code: "ro", name: "Romanian" });
    expect(normalizeLanguage("/languages/est")?.code).toBe("et");
    // Unknown 3-letter codes are unknown — not a guess from their prefix.
    expect(normalizeLanguage("esx")).toBeUndefined();
    expect(normalizeLanguage("enm")).toBeUndefined();
    expect(normalizeLanguage("/languages/enm")).toBeUndefined();
  });
});

describe("isSameLanguage", () => {
  it("matches across name/code spellings", () => {
    expect(isSameLanguage("Spanish", "es")).toBe(true);
    expect(isSameLanguage("spa", "Spanish")).toBe(true);
    expect(isSameLanguage("English", "en")).toBe(true);
  });
  it("rejects different languages and unknowns", () => {
    expect(isSameLanguage("Spanish", "English")).toBe(false);
    expect(isSameLanguage(undefined, "es")).toBe(false);
  });
});

describe("languageCode / languageDisplayName", () => {
  it("derives codes from any spelling", () => {
    expect(languageCode("Spanish")).toBe("es");
    expect(languageCode("fr")).toBe("fr");
    expect(languageCode("nonsense")).toBeUndefined();
  });
  it("falls back gracefully for display names", () => {
    expect(languageDisplayName("eng")).toBe("English");
    expect(languageDisplayName(undefined)).toBe("Unknown");
  });
});
