/**
 * The ebook index between launches. Device-local, like the audio index: the
 * files only exist on this phone. Keys use the `booklio:` prefix (decision
 * 2026-09-12).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Ebook, ReaderTheme } from "./ebookModel";

const LIBRARY_KEY = "booklio:v2:ebooks";
const PREFS_KEY = "booklio:v2:readerPrefs";

export type EbookLibrary = Record<string, Ebook>;

export interface ReaderPrefs {
  theme: ReaderTheme;
  fontSize: number;
  /** Pro: font family for EPUB / TXT. */
  font: "default" | "serif" | "sans" | "dyslexic";
}

export const DEFAULT_READER_PREFS: ReaderPrefs = { theme: "light", fontSize: 18, font: "default" };

/** Throws on a read failure — never answer "empty" and let files be cleaned up blindly. */
export async function loadEbookLibrary(): Promise<EbookLibrary> {
  const raw = await AsyncStorage.getItem(LIBRARY_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as EbookLibrary) : {};
  } catch {
    return {};
  }
}

export async function saveEbookLibrary(library: EbookLibrary): Promise<void> {
  try {
    await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch {
    // Storage full: the reader keeps working from memory.
  }
}

export async function loadReaderPrefs(): Promise<ReaderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_READER_PREFS, ...(JSON.parse(raw) as Partial<ReaderPrefs>) } : DEFAULT_READER_PREFS;
  } catch {
    return DEFAULT_READER_PREFS;
  }
}

export async function saveReaderPrefs(prefs: ReaderPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // keep going from memory
  }
}
