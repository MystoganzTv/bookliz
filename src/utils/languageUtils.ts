/**
 * Language utilities for the Bookliz Book Intelligence Engine.
 *
 * Handles ISO 639-1 (2-letter) ↔ ISO 639-2 (3-letter) mapping, display names,
 * language code normalization, and translation detection.
 *
 * Priority languages (fully supported in UI): en, es, fr, pt, it, de, nl
 */

// ─── Maps ─────────────────────────────────────────────────────────────────────

/** ISO 639-1 → display name */
export const LANG_CODE_TO_NAME: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ru: "Russian",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
  ar: "Arabic",
  sv: "Swedish",
  pl: "Polish",
  tr: "Turkish",
  ca: "Catalan",
  da: "Danish",
  fi: "Finnish",
  no: "Norwegian",
  he: "Hebrew",
  hu: "Hungarian",
  cs: "Czech",
  ro: "Romanian",
  sk: "Slovak",
  uk: "Ukrainian",
  hr: "Croatian",
  bg: "Bulgarian",
  lt: "Lithuanian",
  lv: "Latvian",
  et: "Estonian",
  sl: "Slovenian",
  sr: "Serbian",
  id: "Indonesian",
  ms: "Malay",
  vi: "Vietnamese",
  th: "Thai",
};

/** ISO 639-2 (3-letter) → ISO 639-1 (2-letter) */
export const LANG3_TO_LANG2: Record<string, string> = {
  eng: "en",
  spa: "es",
  fre: "fr",
  fra: "fr",
  ger: "de",
  deu: "de",
  ita: "it",
  por: "pt",
  nld: "nl",
  dut: "nl",
  rus: "ru",
  jpn: "ja",
  chi: "zh",
  zho: "zh",
  kor: "ko",
  ara: "ar",
  swe: "sv",
  pol: "pl",
  tur: "tr",
  cat: "ca",
  dan: "da",
  fin: "fi",
  nor: "no",
  heb: "he",
  hun: "hu",
  ces: "cs",
  cze: "cs",
  ron: "ro",
  rum: "ro",
  slk: "sk",
  ukr: "uk",
  hrv: "hr",
  bul: "bg",
  lit: "lt",
  lav: "lv",
  est: "et",
  slv: "sl",
  srp: "sr",
  ind: "id",
  may: "ms",
  vie: "vi",
  tha: "th",
};

/** Display name → ISO 639-1 (2-letter) — for legacy string-based lookups */
const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(LANG_CODE_TO_NAME).map(([code, name]) => [name.toLowerCase(), code])
);

// ─── Priority languages ────────────────────────────────────────────────────────

/** Languages with full i18n + edition detection support in Bookliz */
export const PRIORITY_LANGUAGE_CODES = ["en", "es", "fr", "pt", "it", "de", "nl"] as const;
export type PriorityLanguageCode = (typeof PRIORITY_LANGUAGE_CODES)[number];

export const PRIORITY_LANGUAGE_NAMES = PRIORITY_LANGUAGE_CODES.map(
  (code) => LANG_CODE_TO_NAME[code]!
);

// ─── Normalization ─────────────────────────────────────────────────────────────

/**
 * Normalize any language identifier (ISO 639-1, ISO 639-2, or display name)
 * to a canonical { code, name } pair.
 *
 * Returns undefined for unknown inputs.
 */
export function normalizeLanguage(
  raw?: string
): { code: string; name: string } | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();

  // 2-letter ISO 639-1 code — ONLY for exactly-2-char input. Never take a
  // 2-letter prefix of a 3-letter code: "est" (Estonian) is not "es", and
  // "rum" (Romanian) is not "ru". Unknown 3-letter codes → undefined.
  if (trimmed.length === 2) {
    const lower2 = trimmed.toLowerCase();
    return LANG_CODE_TO_NAME[lower2]
      ? { code: lower2, name: LANG_CODE_TO_NAME[lower2]! }
      : undefined;
  }

  // 3-letter code (e.g. "eng", "/languages/eng" from Open Library)
  const code3 = trimmed.split("/").pop()?.toLowerCase() ?? "";
  if (code3.length === 3) {
    const code2 = LANG3_TO_LANG2[code3];
    if (code2) {
      return { code: code2, name: LANG_CODE_TO_NAME[code2] ?? code3 };
    }
    // Known-length code but not in our map: unknown, never a guess.
    if (trimmed.length === 3) return undefined;
  }

  // Display name (e.g. "English", "Spanish")
  const byName = NAME_TO_CODE[trimmed.toLowerCase()];
  if (byName) {
    return { code: byName, name: LANG_CODE_TO_NAME[byName] ?? trimmed };
  }

  return undefined;
}

/**
 * Get the display name for a language code (2-letter or 3-letter).
 * Falls back to the input string if unknown.
 */
export function languageDisplayName(raw?: string): string {
  if (!raw) return "Unknown";
  return normalizeLanguage(raw)?.name ?? raw;
}

/**
 * Get the ISO 639-1 code for a language (from code or display name).
 * Returns undefined if unrecognized.
 */
export function languageCode(raw?: string): string | undefined {
  if (!raw) return undefined;
  return normalizeLanguage(raw)?.code;
}

/**
 * Returns true if the two language strings refer to the same language,
 * regardless of whether they are codes, 3-letter codes, or display names.
 */
export function isSameLanguage(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const ca = normalizeLanguage(a)?.code;
  const cb = normalizeLanguage(b)?.code;
  return Boolean(ca && cb && ca === cb);
}

/**
 * Returns true if the language is one of the 7 priority languages.
 */
export function isPriorityLanguage(raw?: string): boolean {
  const code = languageCode(raw);
  if (!code) return false;
  return (PRIORITY_LANGUAGE_CODES as readonly string[]).includes(code);
}

// ─── Flag emoji ────────────────────────────────────────────────────────────────

/** Map ISO 639-1 language code → representative flag emoji */
const LANG_TO_FLAG: Record<string, string> = {
  en: "🇬🇧",
  es: "🇪🇸",
  fr: "🇫🇷",
  de: "🇩🇪",
  it: "🇮🇹",
  pt: "🇧🇷",
  nl: "🇳🇱",
  ru: "🇷🇺",
  ja: "🇯🇵",
  zh: "🇨🇳",
  ko: "🇰🇷",
  ar: "🇸🇦",
  sv: "🇸🇪",
  pl: "🇵🇱",
  tr: "🇹🇷",
  ca: "🏴",
  da: "🇩🇰",
  fi: "🇫🇮",
  no: "🇳🇴",
  he: "🇮🇱",
  hu: "🇭🇺",
  cs: "🇨🇿",
  ro: "🇷🇴",
  sk: "🇸🇰",
  uk: "🇺🇦",
  hr: "🇭🇷",
  bg: "🇧🇬",
};

/** Get flag emoji for a language code or display name. Falls back to 🌐. */
export function languageFlag(raw?: string): string {
  const code = languageCode(raw);
  if (!code) return "🌐";
  return LANG_TO_FLAG[code] ?? "🌐";
}
