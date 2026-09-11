/**
 * languageFromIsbnGroup — ISBN registration group → probable language.
 *
 * This heuristic only ORDERS fallback searches (which title variant to try
 * first when neither provider indexes a scanned barcode). It is never shown to
 * the user, so these tests pin three things:
 *
 *  1. THE MAPPING — the group → language table, with the Spanish-language
 *     groups spelled out (Spain, Mexico, Argentina, Chile, Colombia, Peru,
 *     Uruguay, Bolivia…), since Spanish is the app's priority market.
 *  2. THE PARSING — registration groups are VARIABLE LENGTH (1 to 5 digits),
 *     so a fixed-width slice misreads them. Several cases below are chosen
 *     precisely because a naive slice gets them wrong.
 *  3. NO LEAK — the hint must never become a user-visible language label.
 */

// The aggregator module pulls in both providers at import time; mock them so
// this pure-function test never touches the network layer.
jest.mock("../services/googleBooksProvider", () => ({
  fetchByIsbn: jest.fn(),
  fetchWorksByQuery: jest.fn(),
  volumeToWork: jest.fn(),
}));

jest.mock("../services/openLibraryProvider", () => ({
  fetchEditionByIsbn: jest.fn(),
  fetchWork: jest.fn(),
  fetchWorkEditions: jest.fn(),
  fetchWorksByQuery: jest.fn(),
  resolveAuthorNames: jest.fn(),
}));

import * as fs from "fs";
import * as path from "path";
import { languageFromIsbnGroup } from "../services/bookMetadataAggregator";

// ─── 1. The mapping ───────────────────────────────────────────────────────────

describe("languageFromIsbnGroup — Spanish-language registration groups", () => {
  // group length in parentheses — note how many are NOT two digits
  const SPANISH_CASES: Array<[string, string]> = [
    ["9788408281153", "Spain (84, 2 digits)"],
    ["9786075551234", "Mexico (607, 3 digits)"],
    ["9789684123456", "Mexico (968, 3 digits)"],
    ["9789703456789", "Mexico (970, 3 digits)"],
    ["9789504123456", "Argentina (950, 3 digits)"],
    ["9789871234567", "Argentina (987, 3 digits)"],
    ["9789563456789", "Chile (956, 3 digits)"],
    ["9789587654321", "Colombia (958, 3 digits)"],
    ["9789591234567", "Cuba (959, 3 digits)"],
    ["9786123456789", "Peru (612, 3 digits)"],
    ["9789801234567", "Venezuela (980, 3 digits)"],
    ["9789942123456", "Ecuador (9942, 4 digits)"],
    ["9789945123456", "Dominican Republic (9945, 4 digits)"],
    ["9789962123456", "Panama (9962, 4 digits)"],
    ["9789968123456", "Costa Rica (9968, 4 digits)"],
    ["9789972123456", "Peru (9972, 4 digits)"],
    ["9789974123456", "Uruguay (9974, 4 digits)"],
    ["9789978123456", "Ecuador (9978, 4 digits)"],
    ["9789990512345", "Bolivia (99905, 5 digits)"],
    ["9789995412345", "Bolivia (99954, 5 digits)"],
    ["9789992312345", "El Salvador (99923, 5 digits)"],
    ["9789992412345", "Nicaragua (99924, 5 digits)"],
    ["9789992612345", "Honduras (99926, 5 digits)"],
  ];

  test.each(SPANISH_CASES)("%s → Spanish — %s", (isbn) => {
    expect(languageFromIsbnGroup(isbn)).toBe("Spanish");
  });
});

describe("languageFromIsbnGroup — other registration groups", () => {
  const CASES: Array<[string, string, string]> = [
    ["9780441172719", "English", "0 = English-speaking area"],
    ["9781234567897", "English", "1 = English-speaking area"],
    ["9782070360024", "French", "2 = French-speaking area"],
    ["9783453311954", "German", "3 = German-speaking area"],
    ["9784101010014", "Japanese", "4 = Japan"],
    ["9785170123456", "Russian", "5 = Russian Federation"],
    ["9787020123456", "Chinese", "7 = China"],
    ["9788804123456", "Italian", "88 = Italy"],
    ["9788535912345", "Portuguese", "85 = Brazil"],
    ["9789724612345", "Portuguese", "972 = Portugal"],
    ["9789043012345", "Dutch", "90 = Netherlands"],
    ["9789123456789", "Swedish", "91 = Sweden"],
    ["9788270123456", "Norwegian", "82 = Norway"],
    ["9788373456789", "Polish", "83 = Poland"],
    ["9788712345678", "Danish", "87 = Denmark"],
    ["9788901234567", "Korean", "89 = Republic of Korea"],
  ];

  test.each(CASES)("%s → %s (%s)", (isbn, expected) => {
    expect(languageFromIsbnGroup(isbn)).toBe(expected);
  });

  // Multilingual or unassigned groups stay undefined rather than guessing —
  // a wrong hint reorders the fallback search away from the right title.
  const UNKNOWN_CASES: Array<[string, string]> = [
    ["9788123456789", "81 = India (multilingual)"],
    ["9789200000006", "92 = international organisations"],
    ["9789300000004", "93 = India (multilingual)"],
    ["9770000000000", "977 = not a Bookland (978/979) prefix"],
  ];

  test.each(UNKNOWN_CASES)("%s → undefined (%s)", (isbn) => {
    expect(languageFromIsbnGroup(isbn)).toBeUndefined();
  });
});

describe("languageFromIsbnGroup — the 979 prefix has its own group table", () => {
  it("979-8 (United States) is a ONE-digit group → English", () => {
    // A slice(3, 5) would read "81" here and return nothing.
    expect(languageFromIsbnGroup("9798123456789")).toBe("English");
  });

  it("979-10 = France, 979-11 = Korea, 979-12 = Italy", () => {
    expect(languageFromIsbnGroup("9791023456789")).toBe("French");
    expect(languageFromIsbnGroup("9791123456789")).toBe("Korean");
    expect(languageFromIsbnGroup("9791223456789")).toBe("Italian");
  });

  it("does NOT claim 979-13 is a Spanish/Mexican group — it is unassigned", () => {
    expect(languageFromIsbnGroup("9791323456789")).toBeUndefined();
  });

  it("does not borrow the 978 table for 979 ISBNs", () => {
    // 978-84 is Spain; 979-84 is not an assigned group.
    expect(languageFromIsbnGroup("9798412345678")).toBe("English"); // 979-8, not 979-84
    expect(languageFromIsbnGroup("9799412345678")).toBeUndefined(); // 979-9… unassigned
  });
});

// ─── 2. Variable-length parsing ───────────────────────────────────────────────

describe("languageFromIsbnGroup — variable-length group parsing", () => {
  /**
   * Registration groups are 1–5 digits. These cases are exactly the ones a
   * fixed-width slice gets wrong, so they pin the longest-match behaviour.
   */
  it("reads a 3-digit group a 2-digit slice would miss (978-607, Mexico)", () => {
    const isbn = "9786075551234";
    expect(isbn.slice(3, 5)).toBe("60"); // what a fixed 2-digit slice sees: nothing
    expect(languageFromIsbnGroup(isbn)).toBe("Spanish");
  });

  it("reads a 2-digit group a 3-digit slice would miss (978-84, Spain)", () => {
    const isbn = "9788408281153";
    expect(isbn.slice(3, 6)).toBe("840"); // fixed 3-digit slice: not a group
    expect(languageFromIsbnGroup(isbn)).toBe("Spanish");
  });

  it("reads a 4-digit group (978-9974, Uruguay) that shorter slices misread", () => {
    const isbn = "9789974123456";
    expect(isbn.slice(3, 5)).toBe("99");
    expect(isbn.slice(3, 6)).toBe("997");
    expect(languageFromIsbnGroup(isbn)).toBe("Spanish");
  });

  it("reads a 5-digit group (978-99954, Bolivia)", () => {
    expect(languageFromIsbnGroup("9789995412345")).toBe("Spanish");
  });

  it("never mistakes 978-9… for a longer 978-9xx group (or the reverse)", () => {
    // There is no single-digit "9" group: 978-91 is Sweden, 978-950 is
    // Argentina, 978-9974 is Uruguay. A shortest-match-first table that
    // contained "9" would collapse all three into one language.
    expect(languageFromIsbnGroup("9789123456789")).toBe("Swedish");   // 91
    expect(languageFromIsbnGroup("9789504123456")).toBe("Spanish");   // 950
    expect(languageFromIsbnGroup("9789974123456")).toBe("Spanish");   // 9974
    expect(languageFromIsbnGroup("9789043012345")).toBe("Dutch");     // 90
  });

  it("never mistakes 978-65 (Brazil) for a 3-digit 6xx group", () => {
    expect(languageFromIsbnGroup("9786550123456")).toBe("Portuguese"); // 65
    expect(languageFromIsbnGroup("9786055123456")).toBe("Turkish");    // 605
    expect(languageFromIsbnGroup("9786075551234")).toBe("Spanish");    // 607
  });

  it("tolerates hyphenated / spaced input and rejects non-ISBN input", () => {
    expect(languageFromIsbnGroup("978-84-08-28115-3")).toBe("Spanish");
    expect(languageFromIsbnGroup("979-10-234-5678-9")).toBe("French");
    expect(languageFromIsbnGroup("978")).toBeUndefined();
    expect(languageFromIsbnGroup("")).toBeUndefined();
  });
});

// ─── 3. The hint must never become a label ────────────────────────────────────

describe("languageFromIsbnGroup — hint only, never a user-visible label", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "services", "bookMetadataAggregator.ts"),
    "utf8"
  );

  it("is only consumed for search ordering and language comparisons", () => {
    // Every call site must assign into a local hint variable, never into a
    // metadata field that reaches the UI.
    const callSites = source.match(/(?:const\s+)?[\w.]+\s*=\s*languageFromIsbnGroup\(/g) ?? [];
    expect(callSites.length).toBeGreaterThan(0);
    for (const site of callSites) {
      expect(site).toMatch(/^const\s+impliedLanguage\s*=\s*languageFromIsbnGroup\($/);
    }
  });

  it("is never written to a language field of a work or edition", () => {
    // e.g. `language: impliedLanguage`, `canonicalLanguage = impliedLanguage`
    expect(source).not.toMatch(
      /\b(language|languageCode|canonicalLanguage|canonicalLanguageCode)\s*[:=]\s*impliedLanguage\b/
    );
  });
});
