/**
 * How the audiobook player behaves — the reader's choices from Settings >
 * Player controls (BookPlayer's "Player Controls" / "Autoplay" / "Autolock").
 *
 * A tiny module-level store rather than React state: the engine reads it from
 * native callbacks (lock screen, watch, end of a file) where no component is
 * mounted, and screens subscribe with usePlayerPrefs().
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { PLAYBACK_SPEEDS } from "./audiobookModel";

export const SKIP_CHOICES = [10, 15, 30, 45, 60, 90] as const;

export type ProgressScope = "chapter" | "book";
export type TimeDisplay = "remaining" | "total";
export type KeepAwake = "off" | "always" | "charging";

export interface PlayerPrefs {
  skipBackSec: number;
  skipForwardSec: number;
  /** Step back a little on resume, more the longer the pause. */
  smartRewind: boolean;
  /** What the scrubber spans. Chapter: a ten-hour book on one slider moves a minute per pixel. */
  progressScope: ProgressScope;
  /** The right-hand time: what is left, or the full length. */
  timeDisplay: TimeDisplay;
  /** One speed for every book instead of one per book. */
  globalSpeed: boolean;
  /** The speed used when `globalSpeed` is on. */
  speed: number;
  /** At the end of a book, start the next one of the same saga if its audio is here. */
  autoplayNext: boolean;
  /** Keep the screen from locking while the player screen is open. */
  keepAwake: KeepAwake;
}

export const DEFAULT_PLAYER_PREFS: PlayerPrefs = {
  skipBackSec: 30,
  skipForwardSec: 30,
  smartRewind: true,
  progressScope: "chapter",
  timeDisplay: "remaining",
  globalSpeed: false,
  speed: 1,
  autoplayNext: true,
  keepAwake: "off",
};

export const PLAYER_PREFS_KEY = "@bookliz/player-prefs";

const oneOf = <T,>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

/** Anything unreadable falls back field by field — a bad value never resets the rest. */
export function sanitizePlayerPrefs(raw: unknown): PlayerPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof PlayerPrefs, unknown>>;
  const d = DEFAULT_PLAYER_PREFS;
  return {
    skipBackSec: oneOf(r.skipBackSec, SKIP_CHOICES, d.skipBackSec),
    skipForwardSec: oneOf(r.skipForwardSec, SKIP_CHOICES, d.skipForwardSec),
    smartRewind: typeof r.smartRewind === "boolean" ? r.smartRewind : d.smartRewind,
    progressScope: oneOf<ProgressScope>(r.progressScope, ["chapter", "book"], d.progressScope),
    timeDisplay: oneOf<TimeDisplay>(r.timeDisplay, ["remaining", "total"], d.timeDisplay),
    globalSpeed: typeof r.globalSpeed === "boolean" ? r.globalSpeed : d.globalSpeed,
    speed: oneOf<number>(r.speed, PLAYBACK_SPEEDS, d.speed),
    autoplayNext: typeof r.autoplayNext === "boolean" ? r.autoplayNext : d.autoplayNext,
    keepAwake: oneOf<KeepAwake>(r.keepAwake, ["off", "always", "charging"], d.keepAwake),
  };
}

let current: PlayerPrefs = DEFAULT_PLAYER_PREFS;
const listeners = new Set<() => void>();

export const getPlayerPrefs = () => current;

export function subscribePlayerPrefs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function loadPlayerPrefs(): Promise<PlayerPrefs> {
  try {
    const stored = await AsyncStorage.getItem(PLAYER_PREFS_KEY);
    current = sanitizePlayerPrefs(stored ? JSON.parse(stored) : null);
  } catch {
    current = DEFAULT_PLAYER_PREFS;
  }
  listeners.forEach((l) => l());
  return current;
}

export function updatePlayerPrefs(patch: Partial<PlayerPrefs>): PlayerPrefs {
  current = sanitizePlayerPrefs({ ...current, ...patch });
  listeners.forEach((l) => l());
  AsyncStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify(current)).catch(() => {});
  return current;
}

export function usePlayerPrefs(): PlayerPrefs {
  return useSyncExternalStore(subscribePlayerPrefs, getPlayerPrefs);
}

/**
 * Smart rewind: how far to step back when playback resumes after a pause.
 * A quick pause loses nothing; coming back the next day you have lost the
 * thread, so it backs up further. Never more than 30 s.
 */
export function smartRewindSec(pausedMs: number): number {
  if (!Number.isFinite(pausedMs) || pausedMs < 10_000) return 0;
  if (pausedMs < 60_000) return 3;
  if (pausedMs < 10 * 60_000) return 10;
  if (pausedMs < 60 * 60_000) return 20;
  return 30;
}
