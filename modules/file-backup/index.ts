/**
 * Device-backup exclusion. Every call is a no-op returning `null` where the
 * native module is not in the build (web, Expo Go, a binary from before it
 * existed) — callers treat `null` as "unknown", never as "excluded".
 */
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

type FileBackupNative = {
  setExcludedFromBackup(uri: string, excluded: boolean): boolean;
  isExcludedFromBackup(uri: string): boolean | null;
};

const native: FileBackupNative | null =
  Platform.OS === "ios" ? requireOptionalNativeModule<FileBackupNative>("FileBackup") : null;

export const isFileBackupAvailable = native !== null;

/** `true` once applied, `false` if iOS refused, `null` when unavailable here. */
export function setExcludedFromBackup(uri: string, excluded: boolean): boolean | null {
  if (!native) return null;
  try {
    return native.setExcludedFromBackup(uri, excluded);
  } catch {
    return false;
  }
}

export function isExcludedFromBackup(uri: string): boolean | null {
  if (!native) return null;
  try {
    return native.isExcludedFromBackup(uri);
  } catch {
    return null;
  }
}
