/**
 * Audiobooks stored on the Apple Watch (Bookliz Pro): what the phone sends
 * with the files, and how it reads the watch's report of what it holds.
 */
import type { Audiobook } from "../audio/audiobookModel";

export type WatchBookPayload = {
  bookId: string;
  title: string;
  author: string;
  totalSec: number;
  positionSec: number;
  /** Seconds of the whole book before the first track sent (listened tracks deleted). The watch adds it back when it reports. */
  offsetSec: number;
  speed: number;
  chapters: { title: string; startSec: number }[];
  /** `uri` is the phone's local file; the native side strips it before it goes to the watch. */
  tracks: { file: string; title: string; durationSec: number; uri: string }[];
};

/**
 * Tracks deleted after listening cannot be sent, so the timeline the watch
 * gets starts at the first track still on disk — positions and chapters are
 * shifted to match, and what was already heard simply is not there.
 */
export function buildWatchBookPayload(
  audiobook: Audiobook,
  title: string,
  author: string,
  uriOf: (file: string) => string,
): WatchBookPayload | null {
  let offset = 0;
  let firstKept = -1;
  audiobook.tracks.forEach((track, i) => {
    if (firstKept === -1 && !track.removed) firstKept = i;
    if (firstKept === -1) offset += track.durationSec;
  });
  if (firstKept === -1) return null;
  const kept = audiobook.tracks.slice(firstKept).filter((track) => !track.removed);
  const totalSec = kept.reduce((sum, track) => sum + track.durationSec, 0);
  return {
    bookId: audiobook.bookId,
    title,
    author,
    totalSec,
    positionSec: Math.max(0, Math.min(audiobook.positionSec - offset, totalSec)),
    offsetSec: offset,
    speed: audiobook.speed,
    chapters: audiobook.chapters
      .filter((chapter) => chapter.endSec > offset)
      .map((chapter) => ({ title: chapter.title, startSec: Math.max(0, chapter.startSec - offset) })),
    tracks: kept.map((track) => ({ file: track.file, title: track.title, durationSec: track.durationSec, uri: uriOf(track.file) })),
  };
}

export type WatchHeld = { bookId: string; complete: boolean; received: number; total: number; positionSec: number; updatedAt: number };

export function parseWatchLibrary(json: string | null | undefined): Map<string, WatchHeld> {
  const out = new Map<string, WatchHeld>();
  if (!json) return out;
  try {
    const rows = JSON.parse(json);
    if (!Array.isArray(rows)) return out;
    for (const row of rows) {
      if (!row || typeof row.bookId !== "string") continue;
      out.set(row.bookId, {
        bookId: row.bookId,
        complete: Boolean(row.complete),
        received: Number(row.received) || 0,
        total: Number(row.total) || 0,
        positionSec: Number(row.positionSec) || 0,
        updatedAt: Number(row.updatedAt) || 0,
      });
    }
  } catch {
    // An unreadable report is the same as no report.
  }
  return out;
}
