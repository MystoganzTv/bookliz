/**
 * Unit tests for src/utils/languageUtils.ts
 *
 * Covers:
 *  - normalizeLanguage: ISO 639-1, ISO 639-2, Open Library "/languages/..." format,
 *    display names, case insensitivity, leading/trailing whitespace, unknown inputs
 *  - languageDisplayName
 *  - languageCode
 *  - isSameLanguage
 *  - isPriorityLanguage
 *  - languageFlag
 *  - PRIORITY_LANGUAGE_CODES / PRIORITY_LANGUAGE_NAMES exports
 */

import {
  normalizeLanguage,
  languageDisplayName,
  languageCode,
  isSameLanguage,
  isPriorityLanguage,
  languageFlag,
  PRIORITY_LANGUAGE_CODES,
  PRIORITY_LANGUAGE_NAMES,
  LANG_CODE_TO_NAME,
  LANG3_TO_LANG2,
} from "../utils/languageUtils";

// ─── normalizeLanguage ────────────────────────────────────────────────────────

describe("normalizeLanguage", () => {
  // ── ISO 639-1 (2-letter) ──────────────────────────────────────────────────
  test("recognises lowercase 2-letter code", () => {
    expect(normalizeLanguage("en")).toEqual({ code: "en", name: "English" });
  });

  test("recognises uppercase 2-letter code", () => {
    expect(normalizeLanguage("ES")).toEqual({ code: "es", name: "Spanish" });
  });

  test("recognises mixed-case 2-letter code", () => {
    expect(normalizeLanguage("Fr")).toEqual({ code: "fr", name: "French" });
  });

  test("handles 2-letter code with surrounding whitespace", () => {
    expect(normalizeLanguage("  de  ")).toEqual({ code: "de", name: "German" });
  });

  test("maps all 7 priority language codes correctly", () => {
    const expected: Record<string, string> = {
      en: "English",
      es: "Spanish",
      fr: "French",
      pt: "Portuguese",
      it: "Italian",
      de: "German",
      nl: "Dutch",
    };
    for (const [code, name] of Object.entries(expected)) {
      expect(normalizeLanguage(code)).toEqual({ code, name });
    }
  });

  // ── ISO 639-2 (3-letter) ──────────────────────────────────────────────────
  test("recognises 3-letter code eng", () => {
    expect(normalizeLanguage("eng")).toEqual({ code: "en", name: "English" });
  });

  test("recognises 3-letter code spa", () => {
    expect(normalizeLanguage("spa")).toEqual({ code: "es", name: "Spanish" });
  });

  test("recognises 3-letter code fre (bibliographic variant)", () => {
    expect(normalizeLanguage("fre")).toEqual({ code: "fr", name: "French" });
  });

  test("recognises 3-letter code fra (terminology variant)", () => {
    expect(normalizeLanguage("fra")).toEqual({ code: "fr", name: "French" });
  });

  test("recognises 3-letter code ger", () => {
    expect(normalizeLanguage("ger")).toEqual({ code: "de", name: "German" });
  });

  test("recognises 3-letter code deu (ISO 639-2/T)", () => {
    expect(normalizeLanguage("deu")).toEqual({ code: "de", name: "German" });
  });

  test("recognises 3-letter code por", () => {
    expect(normalizeLanguage("por")).toEqual({ code: "pt", name: "Portuguese" });
  });

  test("recognises 3-letter code jpn", () => {
    expect(normalizeLanguage("jpn")).toEqual({ code: "ja", name: "Japanese" });
  });

  test("recognises 3-letter code zho", () => {
    expect(normalizeLanguage("zho")).toEqual({ code: "zh", name: "Chinese" });
  });

  test("recognises 3-letter code chi", () => {
    expect(normalizeLanguage("chi")).toEqual({ code: "zh", name: "Chinese" });
  });

  test("recognises 3-letter code uppercase ENG via the 3-letter map", () => {
    // "ENG" → lowercased "eng" → LANG3_TO_LANG2 → "en". The 2-letter branch
    // only fires for exactly-2-char input (never a prefix of a 3-letter code).
    expect(normalizeLanguage("ENG")).toEqual({ code: "en", name: "English" });
  });

  test("does not mistake 3-letter codes for their 2-letter prefix", () => {
    expect(normalizeLanguage("est")).toEqual({ code: "et", name: "Estonian" });
    expect(normalizeLanguage("rum")).toEqual({ code: "ro", name: "Romanian" });
    expect(normalizeLanguage("esx")).toBeUndefined();
  });

  // ── Open Library "/languages/xxx" format ─────────────────────────────────
  test("parses Open Library /languages/eng format", () => {
    expect(normalizeLanguage("/languages/eng")).toEqual({ code: "en", name: "English" });
  });

  test("parses Open Library /languages/spa format", () => {
    expect(normalizeLanguage("/languages/spa")).toEqual({ code: "es", name: "Spanish" });
  });

  test("parses Open Library /languages/fre format", () => {
    expect(normalizeLanguage("/languages/fre")).toEqual({ code: "fr", name: "French" });
  });

  test("parses Open Library /languages/jpn format", () => {
    expect(normalizeLanguage("/languages/jpn")).toEqual({ code: "ja", name: "Japanese" });
  });

  test("parses Open Library /languages/por format", () => {
    expect(normalizeLanguage("/languages/por")).toEqual({ code: "pt", name: "Portuguese" });
  });

  // ── Display names ─────────────────────────────────────────────────────────
  test("recognises English display name", () => {
    expect(normalizeLanguage("English")).toEqual({ code: "en", name: "English" });
  });

  test("recognises Spanish display name", () => {
    expect(normalizeLanguage("Spanish")).toEqual({ code: "es", name: "Spanish" });
  });

  test("recognises lowercase display name", () => {
    expect(normalizeLanguage("french")).toEqual({ code: "fr", name: "French" });
  });

  test("recognises mixed-case display name", () => {
    expect(normalizeLanguage("GERMAN")).toEqual({ code: "de", name: "German" });
  });

  test("recognises Japanese display name", () => {
    expect(normalizeLanguage("Japanese")).toEqual({ code: "ja", name: "Japanese" });
  });

  test("recognises Russian display name", () => {
    expect(normalizeLanguage("Russian")).toEqual({ code: "ru", name: "Russian" });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────
  test("returns undefined for undefined input", () => {
    expect(normalizeLanguage(undefined)).toBeUndefined();
  });

  test("returns undefined for empty string", () => {
    expect(normalizeLanguage("")).toBeUndefined();
  });

  test("returns undefined for whitespace-only string", () => {
    expect(normalizeLanguage("   ")).toBeUndefined();
  });

  test("returns undefined for completely unknown code", () => {
    expect(normalizeLanguage("xx")).toBeUndefined();
  });

  test("returns undefined for unknown 3-letter code", () => {
    expect(normalizeLanguage("xyz")).toBeUndefined();
  });

  test("returns undefined for unknown display name", () => {
    expect(normalizeLanguage("Klingon")).toBeUndefined();
  });

  test("returns undefined for numeric string", () => {
    expect(normalizeLanguage("123")).toBeUndefined();
  });
});

// ─── languageDisplayName ──────────────────────────────────────────────────────

describe("languageDisplayName", () => {
  test("returns display name for 2-letter code", () => {
    expect(languageDisplayName("en")).toBe("English");
    expect(languageDisplayName("es")).toBe("Spanish");
    expect(languageDisplayName("ja")).toBe("Japanese");
  });

  test("returns display name for 3-letter code", () => {
    expect(languageDisplayName("eng")).toBe("English");
    expect(languageDisplayName("spa")).toBe("Spanish");
  });

  test("returns display name for OL format", () => {
    expect(languageDisplayName("/languages/fra")).toBe("French");
  });

  test("returns input as-is for unknown codes", () => {
    expect(languageDisplayName("klingon")).toBe("klingon");
  });

  test("returns 'Unknown' for undefined", () => {
    expect(languageDisplayName(undefined)).toBe("Unknown");
  });

  test("returns 'Unknown' for empty string", () => {
    expect(languageDisplayName("")).toBe("Unknown");
  });
});

// ─── languageCode ─────────────────────────────────────────────────────────────

describe("languageCode", () => {
  test("returns ISO 639-1 code for 2-letter input", () => {
    expect(languageCode("en")).toBe("en");
    expect(languageCode("de")).toBe("de");
  });

  test("returns ISO 639-1 code for 3-letter input", () => {
    expect(languageCode("eng")).toBe("en");
    expect(languageCode("deu")).toBe("de");
  });

  test("returns ISO 639-1 code for display name", () => {
    expect(languageCode("English")).toBe("en");
    expect(languageCode("Portuguese")).toBe("pt");
  });

  test("returns ISO 639-1 code for OL format", () => {
    expect(languageCode("/languages/spa")).toBe("es");
  });

  test("returns undefined for unknown input", () => {
    expect(languageCode("Martian")).toBeUndefined();
  });

  test("returns undefined for undefined", () => {
    expect(languageCode(undefined)).toBeUndefined();
  });
});

// ─── isSameLanguage ───────────────────────────────────────────────────────────

describe("isSameLanguage", () => {
  test("matches 2-letter codes", () => {
    expect(isSameLanguage("en", "en")).toBe(true);
  });

  test("matches 2-letter code vs display name", () => {
    expect(isSameLanguage("en", "English")).toBe(true);
    expect(isSameLanguage("es", "Spanish")).toBe(true);
  });

  test("matches 2-letter code vs 3-letter code", () => {
    expect(isSameLanguage("en", "eng")).toBe(true);
    expect(isSameLanguage("de", "ger")).toBe(true);
    expect(isSameLanguage("de", "deu")).toBe(true);
  });

  test("matches OL format vs display name", () => {
    expect(isSameLanguage("/languages/fra", "French")).toBe(true);
    expect(isSameLanguage("/languages/por", "Portuguese")).toBe(true);
  });

  test("returns false for different languages", () => {
    expect(isSameLanguage("en", "es")).toBe(false);
    expect(isSameLanguage("English", "Spanish")).toBe(false);
  });

  test("returns false when either side is undefined", () => {
    expect(isSameLanguage(undefined, "en")).toBe(false);
    expect(isSameLanguage("en", undefined)).toBe(false);
    expect(isSameLanguage(undefined, undefined)).toBe(false);
  });

  test("returns false for unknown language strings", () => {
    expect(isSameLanguage("Klingon", "en")).toBe(false);
    expect(isSameLanguage("en", "Martian")).toBe(false);
  });
});

// ─── isPriorityLanguage ───────────────────────────────────────────────────────

describe("isPriorityLanguage", () => {
  test("returns true for all 7 priority 2-letter codes", () => {
    for (const code of PRIORITY_LANGUAGE_CODES) {
      expect(isPriorityLanguage(code)).toBe(true);
    }
  });

  test("returns true for priority language display names", () => {
    expect(isPriorityLanguage("English")).toBe(true);
    expect(isPriorityLanguage("Spanish")).toBe(true);
    expect(isPriorityLanguage("French")).toBe(true);
    expect(isPriorityLanguage("Portuguese")).toBe(true);
    expect(isPriorityLanguage("Italian")).toBe(true);
    expect(isPriorityLanguage("German")).toBe(true);
    expect(isPriorityLanguage("Dutch")).toBe(true);
  });

  test("returns true for priority language 3-letter codes", () => {
    expect(isPriorityLanguage("eng")).toBe(true);
    expect(isPriorityLanguage("spa")).toBe(true);
    expect(isPriorityLanguage("por")).toBe(true);
  });

  test("returns true for OL format priority languages", () => {
    expect(isPriorityLanguage("/languages/ita")).toBe(true);
  });

  test("returns false for non-priority languages", () => {
    expect(isPriorityLanguage("ja")).toBe(false);
    expect(isPriorityLanguage("ru")).toBe(false);
    expect(isPriorityLanguage("ko")).toBe(false);
    expect(isPriorityLanguage("Japanese")).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(isPriorityLanguage(undefined)).toBe(false);
  });

  test("returns false for unknown language", () => {
    expect(isPriorityLanguage("Klingon")).toBe(false);
  });
});

// ─── languageFlag ─────────────────────────────────────────────────────────────

describe("languageFlag", () => {
  test("returns correct flag for 2-letter codes", () => {
    expect(languageFlag("en")).toBe("🇬🇧");
    expect(languageFlag("es")).toBe("🇪🇸");
    expect(languageFlag("fr")).toBe("🇫🇷");
    expect(languageFlag("de")).toBe("🇩🇪");
    expect(languageFlag("it")).toBe("🇮🇹");
    expect(languageFlag("pt")).toBe("🇧🇷");
    expect(languageFlag("nl")).toBe("🇳🇱");
    expect(languageFlag("ja")).toBe("🇯🇵");
    expect(languageFlag("ru")).toBe("🇷🇺");
    expect(languageFlag("zh")).toBe("🇨🇳");
    expect(languageFlag("ko")).toBe("🇰🇷");
  });

  test("returns flag for display name", () => {
    expect(languageFlag("English")).toBe("🇬🇧");
    expect(languageFlag("Spanish")).toBe("🇪🇸");
    expect(languageFlag("Japanese")).toBe("🇯🇵");
  });

  test("returns flag for 3-letter code", () => {
    expect(languageFlag("eng")).toBe("🇬🇧");
    expect(languageFlag("spa")).toBe("🇪🇸");
    expect(languageFlag("fra")).toBe("🇫🇷");
  });

  test("returns flag for OL format", () => {
    expect(languageFlag("/languages/deu")).toBe("🇩🇪");
    expect(languageFlag("/languages/ita")).toBe("🇮🇹");
  });

  test("returns globe emoji for unknown language", () => {
    expect(languageFlag("Klingon")).toBe("🌐");
    expect(languageFlag("xyz")).toBe("🌐");
  });

  test("returns globe emoji for undefined", () => {
    expect(languageFlag(undefined)).toBe("🌐");
  });

  test("returns globe emoji for empty string", () => {
    expect(languageFlag("")).toBe("🌐");
  });

  test("returns globe emoji for known language without mapped flag (e.g. Vietnamese)", () => {
    // "vi" exists in LANG_CODE_TO_NAME but not in LANG_TO_FLAG
    expect(languageFlag("vi")).toBe("🌐");
    expect(languageFlag("Vietnamese")).toBe("🌐");
  });
});

// ─── Exports sanity checks ────────────────────────────────────────────────────

describe("PRIORITY_LANGUAGE_CODES / PRIORITY_LANGUAGE_NAMES", () => {
  test("has exactly 7 priority codes", () => {
    expect(PRIORITY_LANGUAGE_CODES).toHaveLength(7);
  });

  test("priority codes are all valid ISO 639-1", () => {
    for (const code of PRIORITY_LANGUAGE_CODES) {
      expect(LANG_CODE_TO_NAME[code]).toBeDefined();
    }
  });

  test("PRIORITY_LANGUAGE_NAMES matches PRIORITY_LANGUAGE_CODES", () => {
    expect(PRIORITY_LANGUAGE_NAMES).toHaveLength(PRIORITY_LANGUAGE_CODES.length);
    for (let i = 0; i < PRIORITY_LANGUAGE_CODES.length; i++) {
      expect(PRIORITY_LANGUAGE_NAMES[i]).toBe(LANG_CODE_TO_NAME[PRIORITY_LANGUAGE_CODES[i]!]);
    }
  });

  test("LANG3_TO_LANG2 maps all entries to known LANG_CODE_TO_NAME codes", () => {
    for (const [, code2] of Object.entries(LANG3_TO_LANG2)) {
      expect(LANG_CODE_TO_NAME[code2]).toBeDefined();
    }
  });
});
