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

type WatchBridgeNative = {
  isSupported(): boolean;
  status(): WatchStatus;
  updateState(json: string): void;
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
