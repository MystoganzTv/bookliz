/**
 * Getting audio files into Bookliz and off the phone again.
 *
 * Imported files are MOVED (not copied twice) from the picker's temporary
 * copy into Documents/audiobooks/<folder>/. Only folder and file names are
 * stored — iOS changes the app container's absolute path between installs and
 * updates, so a saved `file:///…/Documents/…` URI goes stale.
 *
 * The files stay on this device. They are not synced and not uploaded: sync
 * carries the position (as reading sessions), never the audio.
 */
import { createAudioPlayer } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import {
  buildChapters,
  isAudioFileName,
  isLockedFileName,
  isMp4FileName,
  naturalCompare,
  safeFileName,
  titleFromFileName,
  totalDuration,
  type AudioChapter,
  type AudioTrack,
} from "./audiobookModel";
import { readMp4AudioInfo, type RawChapter } from "./mp4Chapters";

const ROOT_NAME = "audiobooks";

export type AudioImportProblem =
  /** Audible's .aa/.aax — DRM. Says so plainly instead of "unsupported". */
  | "locked"
  /** Not an audio format we play. */
  | "unsupported"
  /** Looked like audio but the system player could not open it (often FairPlay-protected). */
  | "unreadable"
  /** Not enough free space to keep it. */
  | "space";

export class AudioImportError extends Error {
  constructor(public readonly problem: AudioImportProblem, public readonly fileName?: string) {
    super(`${problem}${fileName ? `: ${fileName}` : ""}`);
    this.name = "AudioImportError";
  }
}

export interface PickedAudio {
  uri: string;
  name: string;
  size: number;
}

export interface ImportedAudio {
  folder: string;
  tracks: AudioTrack[];
  chapters: AudioChapter[];
  totalSec: number;
}

const root = () => {
  const dir = new Directory(Paths.document, ROOT_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
};

export const trackUri = (folder: string, file: string) => new File(Paths.document, ROOT_NAME, folder, file).uri;

export function audioFileExists(folder: string, file: string): boolean {
  try {
    return new File(Paths.document, ROOT_NAME, folder, file).exists;
  } catch {
    return false;
  }
}

/** The system file picker, several files at once. Null when the reader backs out. */
export async function pickAudioFiles(): Promise<PickedAudio[] | null> {
  // "*/*" rather than "audio/*": iOS does not class every .m4b as audio, and a
  // greyed-out file the reader can see but not pick is worse than a clear
  // "that is not an audiobook file" afterwards.
  const result = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;
  return result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, size: asset.size ?? 0 }));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The length AVPlayer reports once the file is ready. 0 = could not open it. */
async function probeDuration(uri: string, timeoutMs = 20_000): Promise<number> {
  const player = createAudioPlayer({ uri }, { updateInterval: 1000 });
  try {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (player.isLoaded && player.duration > 0) return player.duration;
      await sleep(150);
    }
    return 0;
  } finally {
    player.remove();
  }
}

function mp4Info(file: File): { durationSec: number | null; chapters: RawChapter[] } {
  let handle: ReturnType<File["open"]> | null = null;
  try {
    handle = file.open();
    const opened = handle;
    return readMp4AudioInfo({
      size: file.size,
      read: (offset, length) => {
        opened.offset = offset;
        return opened.readBytes(length);
      },
    });
  } catch {
    return { durationSec: null, chapters: [] };
  } finally {
    try {
      handle?.close();
    } catch {
      // already closed
    }
  }
}

/**
 * Move the picked files into the book's folder, measure them and read their
 * chapter marks. All or nothing: a file that fails leaves no half-imported
 * book behind.
 */
export async function importAudioFiles(
  picked: readonly PickedAudio[],
  onProgress?: (done: number, total: number) => void
): Promise<ImportedAudio> {
  const locked = picked.find((p) => isLockedFileName(p.name));
  if (locked) throw new AudioImportError("locked", locked.name);
  const audio = [...picked].filter((p) => isAudioFileName(p.name)).sort((a, b) => naturalCompare(a.name, b.name));
  if (!audio.length) throw new AudioImportError("unsupported", picked[0]?.name);

  const bytes = audio.reduce((sum, p) => sum + p.size, 0);
  try {
    // The picker's copy already sits on disk, so a move needs no extra room;
    // this catches the case where even that copy left the phone nearly full.
    if (Paths.availableDiskSpace > 0 && Paths.availableDiskSpace < Math.min(bytes, 50 * 1024 * 1024)) {
      throw new AudioImportError("space");
    }
  } catch (error) {
    if (error instanceof AudioImportError) throw error;
  }

  const folderName = `book-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const folder = new Directory(root(), folderName);
  folder.create({ intermediates: true, idempotent: true });

  try {
    const tracks: AudioTrack[] = [];
    const embedded: RawChapter[][] = [];
    for (let i = 0; i < audio.length; i++) {
      const source = audio[i];
      const destination = new File(folder, safeFileName(i, source.name));
      new File(source.uri).move(destination);
      const info = isMp4FileName(source.name) ? mp4Info(destination) : { durationSec: null, chapters: [] };
      const measured = await probeDuration(destination.uri);
      const durationSec = measured > 0 ? measured : 0;
      if (!durationSec) throw new AudioImportError("unreadable", source.name);
      tracks.push({ file: destination.name, title: titleFromFileName(source.name), durationSec });
      embedded.push(info.chapters);
      onProgress?.(i + 1, audio.length);
    }
    return { folder: folderName, tracks, chapters: buildChapters(tracks, embedded), totalSec: totalDuration(tracks) };
  } catch (error) {
    deleteAudioFolder(folderName);
    throw error;
  }
}

export function deleteAudioFolder(folder: string): void {
  try {
    const dir = new Directory(Paths.document, ROOT_NAME, folder);
    if (dir.exists) dir.delete();
  } catch {
    // Nothing left to delete, or the OS already did.
  }
}

/** Folders on disk that no saved audiobook points at — left by a crash mid-import or a cleared library. */
export function strayAudioFolders(known: ReadonlySet<string>): string[] {
  try {
    return root()
      .list()
      .filter((entry): entry is Directory => entry instanceof Directory)
      .map((dir) => dir.name)
      .filter((name) => !known.has(name));
  } catch {
    return [];
  }
}

/** Bytes used by one book's audio. */
export function audioFolderSize(folder: string): number {
  try {
    const dir = new Directory(Paths.document, ROOT_NAME, folder);
    return dir.size ?? 0;
  } catch {
    return 0;
  }
}
