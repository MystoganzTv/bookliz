/**
 * Audiobooks in iCloud (Bookliz Pro): what goes up with the files, and how a
 * folder found in iCloud is matched back to a book.
 *
 * The folder is named after the book id. Books sync between devices through
 * the account with the same id, so the other iPhone finds "its" book; on a
 * device without that book the audio lands in Not assigned under the title
 * the manifest carries.
 */
import type { ICloudFolder } from "../../modules/icloud-audio";
import type { Audiobook } from "./audiobookModel";

export const CLOUD_MANIFEST_VERSION = 1;

export type CloudManifest = {
  v: number;
  bookId: string;
  title: string;
  author: string;
  tracks: { file: string; title: string; durationSec: number }[];
  totalSec: number;
  uploadedAt: string;
};

export function buildCloudManifest(audiobook: Audiobook, title: string, author: string, now = new Date()): CloudManifest {
  return {
    v: CLOUD_MANIFEST_VERSION,
    bookId: audiobook.bookId,
    title,
    author,
    tracks: audiobook.tracks
      .filter((track) => !track.removed)
      .map((track) => ({ file: track.file, title: track.title, durationSec: track.durationSec })),
    totalSec: audiobook.totalSec,
    uploadedAt: now.toISOString(),
  };
}

export function parseCloudManifest(text: string | null): CloudManifest | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<CloudManifest>;
    if (typeof value !== "object" || !value || typeof value.bookId !== "string") return null;
    return {
      v: typeof value.v === "number" ? value.v : CLOUD_MANIFEST_VERSION,
      bookId: value.bookId,
      title: typeof value.title === "string" ? value.title : "",
      author: typeof value.author === "string" ? value.author : "",
      tracks: Array.isArray(value.tracks) ? value.tracks.filter((t) => t && typeof t.file === "string") : [],
      totalSec: typeof value.totalSec === "number" ? value.totalSec : 0,
      uploadedAt: typeof value.uploadedAt === "string" ? value.uploadedAt : "",
    };
  } catch {
    return null;
  }
}

export type CloudEntry = {
  remoteId: string;
  manifest: CloudManifest | null;
  bytes: number;
  files: number;
  uploaded: boolean;
  /** This device already has audio for the book. */
  onThisDevice: boolean;
};

/** Pair what iCloud holds with what this device has. */
export function describeCloud(folders: ICloudFolder[], localBookIds: ReadonlySet<string>): CloudEntry[] {
  return folders
    .map((folder) => {
      const manifest = parseCloudManifest(folder.manifest);
      const bookId = manifest?.bookId ?? folder.remoteId;
      return {
        remoteId: folder.remoteId,
        manifest,
        bytes: folder.bytes,
        files: folder.files,
        uploaded: folder.uploaded,
        onThisDevice: localBookIds.has(bookId),
      };
    })
    .filter((entry) => entry.files > 0)
    .sort((a, b) => (a.manifest?.title ?? a.remoteId).localeCompare(b.manifest?.title ?? b.remoteId));
}
