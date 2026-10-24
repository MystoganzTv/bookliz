/**
 * Where the player keeps its state between launches. Device-local on purpose:
 * the audio files themselves only exist on this phone, so an index of them
 * has no business on another one. What other devices need — how far you got,
 * how long you listened — travels as ordinary reading sessions.
 *
 * Keys use the `booklio:` prefix like every other key (decision 2026-09-12).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Audiobook } from "./audiobookModel";
import type { PendingListen } from "./listeningSession";

const LIBRARY_KEY = "booklio:v2:audiobooks";
const PENDING_KEY = "booklio:v2:audioPendingListen";
const ACTIVE_KEY = "booklio:v2:audioActiveBook";

export type AudioLibrary = Record<string, Audiobook>;

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    if (value === null || value === undefined) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the player keeps working from memory.
  }
}

/**
 * Throws when storage cannot be read, instead of answering "empty": the
 * engine deletes audio folders the index does not mention, and a transient
 * read error must never look like "nothing is imported".
 */
export async function loadAudioLibrary(): Promise<AudioLibrary> {
  const raw = await AsyncStorage.getItem(LIBRARY_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as AudioLibrary;
  } catch {
    return {};
  }
}
export const saveAudioLibrary = (library: AudioLibrary) => writeJson(LIBRARY_KEY, library);

export const loadPendingListen = () => readJson<PendingListen>(PENDING_KEY);
export const savePendingListen = (pending: PendingListen | null) => writeJson(PENDING_KEY, pending);

export const loadActiveAudioBook = () => readJson<string>(ACTIVE_KEY);
export const saveActiveAudioBook = (bookId: string | null) => writeJson(ACTIVE_KEY, bookId);
