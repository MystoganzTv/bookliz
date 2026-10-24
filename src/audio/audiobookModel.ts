/**
 * The shape of an audiobook in Bookliz's own player, and the arithmetic over
 * it: which file a book position falls in, which chapter, where "previous
 * chapter" goes. Pure — the engine and the screens both lean on it.
 *
 * Positions are always seconds into the WHOLE book. A book made of 40 MP3s is
 * one timeline; the file boundary is an implementation detail the listener
 * never sees.
 */
import type { RawChapter } from "./mp4Chapters";

export interface AudioTrack {
  /** File name inside the book's folder — never an absolute path (the app container moves between installs). */
  file: string;
  title: string;
  durationSec: number;
  /**
   * The file was deleted to free space after it was listened to. It keeps its
   * place on the timeline — positions, percentages and logged progress all
   * stay exactly what they were — it just cannot be played any more.
   */
  removed?: boolean;
}

export interface AudioChapter {
  /** Empty when the file has no title for it; the UI says "Chapter N". */
  title: string;
  startSec: number;
  endSec: number;
}

/** A moment the listener wants to come back to. */
export interface AudioBookmark {
  id: string;
  /** Seconds into the whole book. */
  sec: number;
  createdAt: string;
}

export interface Audiobook {
  bookId: string;
  /** Folder name under Documents/audiobooks. */
  folder: string;
  tracks: AudioTrack[];
  chapters: AudioChapter[];
  totalSec: number;
  /** Where the listener is, in seconds into the whole book. */
  positionSec: number;
  speed: number;
  /** Absent on books imported before bookmarks existed. */
  bookmarks?: AudioBookmark[];
  /**
   * Where the listener was before a big jump (another chapter, a long drag,
   * a bookmark) — so an accidental tap never loses their place. Cleared once
   * they have listened a while at the new spot, or gone back.
   */
  returnSec?: number;
  addedAt: string;
  lastPlayedAt?: string;
}

/** iOS caps AVPlayer at 2×. */
export const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
/** Inside this many seconds of a chapter, "previous" goes to the chapter before rather than restarting this one. */
const RESTART_WINDOW_SEC = 3;

export const AUDIO_EXTENSIONS = ["mp3", "m4a", "m4b", "aac", "mp4", "wav", "aif", "aiff", "caf", "flac"] as const;
/** Formats that carry MP4 boxes, and so may carry chapter marks. */
export const MP4_EXTENSIONS = ["m4a", "m4b", "mp4"] as const;
/** DRM-locked formats. Named so the import can say why, instead of "unsupported". */
export const LOCKED_EXTENSIONS = ["aa", "aax", "aaxc"] as const;

export const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
};

export const isAudioFileName = (name: string) => (AUDIO_EXTENSIONS as readonly string[]).includes(extensionOf(name));
export const isLockedFileName = (name: string) => (LOCKED_EXTENSIONS as readonly string[]).includes(extensionOf(name));
export const isMp4FileName = (name: string) => (MP4_EXTENSIONS as readonly string[]).includes(extensionOf(name));

/** "Chapter 2" before "Chapter 10" — file managers sort this way and so do people. */
export function naturalCompare(a: string, b: string): number {
  const split = (s: string) => s.toLowerCase().match(/\d+|\D+/g) ?? [];
  const pa = split(a);
  const pb = split(b);
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === y) continue;
    const nx = /^\d/.test(x);
    const ny = /^\d/.test(y);
    if (nx && ny) {
      const diff = Number(x) - Number(y);
      if (diff) return diff;
      continue;
    }
    return x < y ? -1 : 1;
  }
  return pa.length - pb.length;
}

/** "03 - The Riddle_Game.mp3" → "The Riddle Game". A bare number stays a number. */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  const stripped = base.replace(/^\d{1,4}\s*[-.)]\s*/, "").trim();
  return stripped || base;
}

/**
 * Audio imported but not yet attached to a book — BookPlayer's way in: files
 * first, book later. Same shape as an audiobook's audio, plus a title guessed
 * from the file names to show and to search with.
 */
export interface AudioInboxItem {
  id: string;
  folder: string;
  title: string;
  tracks: AudioTrack[];
  chapters: AudioChapter[];
  totalSec: number;
  addedAt: string;
}

/**
 * A title for a group of files: one file → its name; several → what their
 * names share ("Dune - 01.mp3", "Dune - 02.mp3" → "Dune"), else the first.
 */
export function inboxTitle(fileNames: readonly string[]): string {
  const titles = fileNames.map(titleFromFileName).filter(Boolean);
  if (!titles.length) return "";
  if (titles.length === 1) return titles[0];
  let prefix = titles[0];
  for (const t of titles.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < t.length && prefix[i].toLowerCase() === t[i].toLowerCase()) i++;
    prefix = prefix.slice(0, i);
  }
  // Cut back to a word boundary and drop trailing separators / numbering ("Dune - Part 0" → "Dune").
  const cleaned = prefix
    .replace(/(?:^|[\s\-–—_.:,(\[]+)(?:part|parte|cap(?:[ií]tulo)?|chapter|ch|disc|disco|cd|track|pista)\.?\s*\d*\s*$/i, "")
    .replace(/\s*\d+\s*$/, "")
    .replace(/[\s\-–—_.:,(\[]+$/, "")
    .trim();
  return cleaned.length >= 3 ? cleaned : titles[0];
}

/** A name safe to write into the app's Documents folder. */
export function safeFileName(index: number, name: string): string {
  const ext = extensionOf(name);
  let base = name.replace(/\.[^.]+$/, "");
  try {
    // Accents off, letters kept: "Capítulo" → "Capitulo".
    base = base.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  } catch {
    // An engine without normalize() just gets underscores for accented letters.
  }
  const stem = base
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 60)
    .replace(/^_|_$/g, "");
  return `${String(index + 1).padStart(3, "0")}-${stem || "track"}${ext ? `.${ext}` : ""}`;
}

export const totalDuration = (tracks: readonly AudioTrack[]) => tracks.reduce((sum, t) => sum + Math.max(0, t.durationSec), 0);

/** Book-position of the first second of each track. */
export function trackStarts(tracks: readonly AudioTrack[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const track of tracks) {
    out.push(at);
    at += Math.max(0, track.durationSec);
  }
  return out;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Which file a book position falls in, and where inside it. The very end maps to the end of the last file. */
export function locate(tracks: readonly AudioTrack[], positionSec: number): { index: number; localSec: number } {
  if (!tracks.length) return { index: 0, localSec: 0 };
  const starts = trackStarts(tracks);
  const total = totalDuration(tracks);
  const pos = clamp(positionSec, 0, total);
  let index = 0;
  for (let i = 0; i < tracks.length; i++) {
    if (starts[i] <= pos && (pos < starts[i] + tracks[i].durationSec || i === tracks.length - 1)) {
      index = i;
      break;
    }
  }
  return { index, localSec: clamp(pos - starts[index], 0, tracks[index].durationSec) };
}

/**
 * Chapters for the whole book. A file with its own chapter marks contributes
 * those (shifted to its place in the book); a file without them is one chapter
 * named after the file. One file with no marks → no chapters at all, since a
 * single "chapter" spanning the book is noise.
 */
export function buildChapters(tracks: readonly AudioTrack[], embedded: readonly (readonly RawChapter[])[]): AudioChapter[] {
  const starts = trackStarts(tracks);
  const raw: RawChapter[] = [];
  tracks.forEach((track, i) => {
    const marks = (embedded[i] ?? []).filter((c) => c.startSec >= 0 && c.startSec < track.durationSec);
    if (marks.length >= 2 || (marks.length === 1 && tracks.length > 1)) {
      for (const mark of marks) raw.push({ title: mark.title, startSec: starts[i] + mark.startSec });
    } else if (tracks.length > 1) {
      raw.push({ title: track.title, startSec: starts[i] });
    }
  });
  return normalizeChapters(raw, totalDuration(tracks));
}

/** Sorted, de-duplicated, gap-free chapters ending at the book's end. */
export function normalizeChapters(raw: readonly RawChapter[], totalSec: number): AudioChapter[] {
  if (totalSec <= 0) return [];
  const sorted = raw
    .filter((c) => Number.isFinite(c.startSec) && c.startSec >= 0 && c.startSec < totalSec)
    .map((c) => ({ title: c.title.trim(), startSec: c.startSec }))
    .sort((a, b) => a.startSec - b.startSec);
  const merged: RawChapter[] = [];
  for (const chapter of sorted) {
    const last = merged[merged.length - 1];
    // Marks under a second apart are the same place written twice.
    if (last && chapter.startSec - last.startSec < 1) {
      if (!last.title && chapter.title) last.title = chapter.title;
      continue;
    }
    merged.push({ ...chapter });
  }
  if (!merged.length) return [];
  merged[0].startSec = 0; // a lead-in before the first mark belongs to the first chapter
  return merged.map((chapter, i) => ({
    title: chapter.title,
    startSec: chapter.startSec,
    endSec: i + 1 < merged.length ? merged[i + 1].startSec : totalSec,
  }));
}

/** Index of the chapter playing at a position, or -1 for a book without chapters. */
export function chapterIndexAt(chapters: readonly AudioChapter[], positionSec: number): number {
  if (!chapters.length) return -1;
  let index = 0;
  // A quarter-second of slack: a seek to a chapter start can land a hair before it.
  for (let i = 0; i < chapters.length; i++) if (chapters[i].startSec <= positionSec + 0.25) index = i;
  return index;
}

/** Where "previous chapter" goes: the start of this one, unless we are at its very start. */
export function previousChapterTarget(chapters: readonly AudioChapter[], positionSec: number): number {
  const index = chapterIndexAt(chapters, positionSec);
  if (index < 0) return 0;
  const current = chapters[index];
  if (positionSec - current.startSec > RESTART_WINDOW_SEC || index === 0) return current.startSec;
  return chapters[index - 1].startSec;
}

/** Where "next chapter" goes, or null at the last one. */
export function nextChapterTarget(chapters: readonly AudioChapter[], positionSec: number): number | null {
  const index = chapterIndexAt(chapters, positionSec);
  if (index < 0 || index + 1 >= chapters.length) return null;
  return chapters[index + 1].startSec;
}

/** Next speed in the cycle, wrapping. Unknown speeds snap to 1×. */
export function nextSpeed(current: number): number {
  const i = PLAYBACK_SPEEDS.findIndex((s) => Math.abs(s - current) < 0.01);
  return i < 0 ? 1 : PLAYBACK_SPEEDS[(i + 1) % PLAYBACK_SPEEDS.length];
}

/** "1:02:03" or "12:03". */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "1.25×", "2×". */
/** "1.2 GB" / "340 MB" — never "0 MB" for a file that exists. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

export const formatSpeed = (speed: number) => `${Number(speed.toFixed(2))}×`;

/**
 * Where a freshly imported book should open: where the reader's logged
 * progress says they are, unless the book is finished (then from the top).
 */
export function initialPosition(totalSec: number, progressPercent: number, finished: boolean): number {
  if (finished || totalSec <= 0) return 0;
  const pct = clamp(progressPercent || 0, 0, 100);
  return pct >= 100 ? 0 : Math.floor((pct / 100) * totalSec);
}

// ─── Deleted (already listened) files ─────────────────────────────────────────

const isRemovedIndex = (tracks: readonly AudioTrack[], index: number) => Boolean(tracks[index]?.removed);

/** Whether the audio at a book position has been deleted. */
export function isRemovedAt(tracks: readonly AudioTrack[], positionSec: number): boolean {
  return tracks.length > 0 && isRemovedIndex(tracks, locate(tracks, positionSec).index);
}

/**
 * The nearest position that can actually play: the position itself, or — when
 * it falls in a deleted file — the start of the next file still on the phone.
 * Null when nothing from there on is left.
 */
export function playablePosition(tracks: readonly AudioTrack[], positionSec: number): number | null {
  if (!tracks.length) return null;
  const { index } = locate(tracks, positionSec);
  if (!isRemovedIndex(tracks, index)) return Math.max(0, positionSec);
  const starts = trackStarts(tracks);
  for (let i = index + 1; i < tracks.length; i++) if (!tracks[i].removed) return starts[i];
  return null;
}

/** First playable second of the book, or null when every file is gone. */
export const firstPlayableSec = (tracks: readonly AudioTrack[]) => playablePosition(tracks, 0);

/** Index of the next file after `index` that is still on the phone, or -1. */
export function nextPlayableTrack(tracks: readonly AudioTrack[], index: number): number {
  for (let i = index + 1; i < tracks.length; i++) if (!tracks[i].removed) return i;
  return -1;
}

/**
 * Files entirely behind the listener that can be deleted. Never the file in
 * progress — only the ones before it. A one-file book (an M4B) never has any:
 * a single file cannot be cut into pieces.
 */
export function listenedTrackIndexes(tracks: readonly AudioTrack[], positionSec: number): number[] {
  if (tracks.length < 2) return [];
  const { index } = locate(tracks, positionSec);
  const out: number[] = [];
  for (let i = 0; i < index; i++) if (!tracks[i].removed) out.push(i);
  return out;
}

// ─── "Back to where you were" ─────────────────────────────────────────────────

/** A move shorter than this is fine-tuning (the ±30 buttons), not a jump. */
export const RETURN_JUMP_SEC = 60;

/**
 * The return point after moving from `fromSec` to `toSec`. A big jump keeps
 * the OLDEST unreturned spot — browsing three chapters must still lead back
 * to where the listener actually was. Arriving back near it clears it.
 */
export function returnPointAfterJump(current: number | undefined, fromSec: number, toSec: number): number | undefined {
  if (current !== undefined && Math.abs(toSec - current) < RETURN_JUMP_SEC) return undefined;
  if (Math.abs(toSec - fromSec) < RETURN_JUMP_SEC) return current;
  return current ?? fromSec;
}
