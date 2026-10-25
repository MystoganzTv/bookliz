/**
 * Audiobooks in iCloud Drive (Bookliz Pro). Everything resolves to "not
 * available" where the native module is not in the build.
 */
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export type ICloudStatus = { signedIn: boolean; available: boolean };

export type ICloudFolder = {
  remoteId: string;
  /** manifest.json as text; null while it is still on its way down. */
  manifest: string | null;
  files: number;
  bytes: number;
  downloaded: boolean;
  uploaded: boolean;
};

export type TransferProgress = { remoteId: string; direction: "upload" | "download"; done: number; total: number };

type Subscription = { remove(): void };

type ICloudAudioNative = {
  status(): Promise<ICloudStatus>;
  upload(localFolder: string, remoteId: string, manifestJson: string): Promise<{ files: number; bytes: number }>;
  list(): Promise<ICloudFolder[]>;
  download(remoteId: string, timeoutSec: number): Promise<string[]>;
  remove(remoteId: string): Promise<boolean>;
  addListener(event: "onTransferProgress", listener: (progress: TransferProgress) => void): Subscription;
};

const native: ICloudAudioNative | null =
  Platform.OS === "ios" ? requireOptionalNativeModule<ICloudAudioNative>("ICloudAudio") : null;

export const isICloudAudioAvailable = native !== null;

const OFF: ICloudStatus = { signedIn: false, available: false };

export async function iCloudStatus(): Promise<ICloudStatus> {
  if (!native) return OFF;
  try {
    return await native.status();
  } catch {
    return OFF;
  }
}

export async function uploadFolder(localFolder: string, remoteId: string, manifestJson: string) {
  if (!native) throw new Error("iCloud is not available in this build");
  return native.upload(localFolder, remoteId, manifestJson);
}

export async function listICloudFolders(): Promise<ICloudFolder[]> {
  if (!native) return [];
  return native.list();
}

export async function downloadFolder(remoteId: string, timeoutSec = 1800): Promise<string[]> {
  if (!native) throw new Error("iCloud is not available in this build");
  return native.download(remoteId, timeoutSec);
}

export async function removeICloudFolder(remoteId: string): Promise<boolean> {
  if (!native) return false;
  return native.remove(remoteId);
}

export function onTransferProgress(listener: (progress: TransferProgress) => void): Subscription {
  return native ? native.addListener("onTransferProgress", listener) : { remove() {} };
}
