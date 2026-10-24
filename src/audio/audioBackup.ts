/**
 * Whether imported audiobooks travel in the iPhone's iCloud backup.
 *
 * Default: they do NOT. Files in Documents/ are backed up unless told
 * otherwise, and audiobooks are big — twenty of them is ~10 GB. On the free
 * 5 GB iCloud plan that does not just bloat the backup, it makes the whole
 * device backup fail, photos and messages included. The reader can opt in.
 *
 * What is lost by default: after restoring onto a new iPhone the audio files
 * are not there and have to be imported again. Listening already turned into
 * reading sessions stays (it lives with the library, and syncs).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setExcludedFromBackup } from "../../modules/file-backup";
import { audioRootUri } from "./audioFiles";

export const AUDIO_BACKUP_KEY = "@bookliz/audio-in-backup";

export async function loadIncludeAudioInBackup(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(AUDIO_BACKUP_KEY)) === "true";
  } catch {
    return false;
  }
}

/** Applies the stored choice to the audiobooks folder. Run on every launch. */
export async function applyAudioBackupPreference(): Promise<boolean | null> {
  const include = await loadIncludeAudioInBackup();
  return setExcludedFromBackup(audioRootUri(), !include);
}

/** Saves and applies. Returns what the native call returned (null = not in this build). */
export async function setIncludeAudioInBackup(include: boolean): Promise<boolean | null> {
  try {
    await AsyncStorage.setItem(AUDIO_BACKUP_KEY, include ? "true" : "false");
  } catch {
    // Applied anyway; next launch re-applies whatever was stored.
  }
  return setExcludedFromBackup(audioRootUri(), !include);
}
