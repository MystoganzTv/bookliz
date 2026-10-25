/**
 * Apple Watch link (iPhone side). Everything is a no-op where the native
 * module is not in the build — web, Expo Go, or a binary from before it.
 */
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export type WatchStatus = { supported: boolean; paired: boolean; installed: boolean; reachable: boolean };

/** What the watch sends. Arguments ride along on the same object. */
export type WatchCommand = {
  command: string;
  index?: number;
  speed?: number;
  minutes?: number;
  kind?: string;
  bookId?: string;
};

type Subscription = { remove(): void };

/** What the watch reports about audiobooks stored on it. */
export type WatchFilesEvent =
  | { event: "transferFinished"; bookId: string; index: number; error?: string }
  | { event: "library"; books: string }
  | { event: "progress"; bookId: string; positionSec: number; at: number };

export type WatchProgress = { bookId: string; positionSec: number; at: number };
export type WatchTransfer = { bookId: string; pending: number; fraction: number };

type WatchBridgeNative = {
  isSupported(): boolean;
  status(): WatchStatus;
  updateState(json: string): void;
  sendBook(json: string): number;
  cancelBook(bookId: string): void;
  fileTransfers(): WatchTransfer[];
  deleteFromWatch(bookId: string): void;
  watchLibrary(): string | null;
  drainWatchProgress(): WatchProgress[];
  addListener(event: "onWatchFiles", listener: (payload: WatchFilesEvent) => void): Subscription;
  addListener(event: "onCommand", listener: (command: WatchCommand) => void): Subscription;
  addListener(event: "onWatchStatus", listener: (status: WatchStatus) => void): Subscription;
};

const native: WatchBridgeNative | null =
  Platform.OS === "ios" ? requireOptionalNativeModule<WatchBridgeNative>("WatchBridge") : null;

export const isWatchBridgeAvailable = native !== null;

const NO_WATCH: WatchStatus = { supported: false, paired: false, installed: false, reachable: false };

export function watchStatus(): WatchStatus {
  try {
    return native?.status() ?? NO_WATCH;
  } catch {
    return NO_WATCH;
  }
}

export function pushWatchState(json: string) {
  try {
    native?.updateState(json);
  } catch {
    // The watch is a mirror; the phone never depends on it.
  }
}

export function onWatchCommand(listener: (command: WatchCommand) => void): Subscription {
  return native ? native.addListener("onCommand", listener) : { remove() {} };
}

export function onWatchStatus(listener: (status: WatchStatus) => void): Subscription {
  return native ? native.addListener("onWatchStatus", listener) : { remove() {} };
}

// ── Audiobooks on the watch (Bookliz Pro) ─────────────────────────────────

/** Queue a book's files for the watch. Returns how many files were queued. */
export function sendBookToWatch(json: string): number {
  try {
    return native?.sendBook(json) ?? 0;
  } catch {
    return 0;
  }
}

export function cancelWatchBook(bookId: string) {
  try {
    native?.cancelBook(bookId);
  } catch {
    // nothing queued
  }
}

export function watchFileTransfers(): WatchTransfer[] {
  try {
    return native?.fileTransfers() ?? [];
  } catch {
    return [];
  }
}

export function deleteBookFromWatch(bookId: string) {
  try {
    native?.deleteFromWatch(bookId);
  } catch {
    // The watch drops it next time it hears from the phone.
  }
}

/** Last list the watch reported (JSON), or null before it has said anything. */
export function watchLibraryJson(): string | null {
  try {
    return native?.watchLibrary() ?? null;
  } catch {
    return null;
  }
}

export function drainWatchProgress(): WatchProgress[] {
  try {
    return native?.drainWatchProgress() ?? [];
  } catch {
    return [];
  }
}

export function onWatchFiles(listener: (payload: WatchFilesEvent) => void): Subscription {
  return native ? native.addListener("onWatchFiles", listener) : { remove() {} };
}
