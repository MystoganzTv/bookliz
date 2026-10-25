/**
 * Getting ebook files into Bookliz and off the phone again.
 *
 * Same rules as the audio files: imported files are MOVED from the picker's
 * temporary copy into Documents/ebooks/<folder>/, only folder and file names
 * are stored (the app container moves between installs), and the files stay
 * on this device — sync carries the progress (as reading sessions), never
 * the file.
 */
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import {
  ebookFormatOf,
  isLockedEbookFileName,
  isRarSignature,
  isZipSignature,
  titleFromEbookFileName,
  type Ebook,
} from "./ebookModel";

const ROOT_NAME = "ebooks";

export type EbookImportProblem =
  /** Kindle / Apple Books / Adobe DRM. */
  | "locked"
  /** Not a format the reader opens. */
  | "unsupported"
  /** A .cbr that really is a RAR archive. */
  | "rar"
  /** Could not be read or moved. */
  | "unreadable";

export class EbookImportError extends Error {
  constructor(
    public readonly problem: EbookImportProblem,
    public readonly fileName?: string,
    public readonly detail?: string
  ) {
    super(`${problem}${fileName ? `: ${fileName}` : ""}${detail ? ` (${detail})` : ""}`);
    this.name = "EbookImportError";
  }
}

export interface PickedEbook {
  uri: string;
  name: string;
  size: number;
}

const root = () => {
  const dir = new Directory(Paths.document, ROOT_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
};

export const ebookFile = (ebook: Pick<Ebook, "folder" | "file">) => new File(Paths.document, ROOT_NAME, ebook.folder, ebook.file);
export const ebookUri = (ebook: Pick<Ebook, "folder" | "file">) => ebookFile(ebook).uri;

export function ebookExists(ebook: Pick<Ebook, "folder" | "file">): boolean {
  try {
    return ebookFile(ebook).exists;
  } catch {
    return false;
  }
}

/** The system file picker, several files at once. Null when the reader backs out. */
export async function pickEbookFiles(): Promise<PickedEbook[] | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;
  return result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, size: asset.size ?? 0 }));
}

const errorDetail = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.length > 240 ? `${raw.slice(0, 239)}…` : raw;
};

function firstBytes(file: File, count: number): Uint8Array {
  const handle = file.open();
  try {
    return handle.readBytes(count);
  } finally {
    try {
      handle.close();
    } catch {
      // already closed
    }
  }
}

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "_").slice(-180) || "book";

/** One picked file → its Ebook record, the file moved into Documents/ebooks/<id>/. */
export function importEbookFile(picked: PickedEbook, id: string, bookId: string | null): Ebook {
  if (isLockedEbookFileName(picked.name)) throw new EbookImportError("locked", picked.name);
  const format = ebookFormatOf(picked.name);
  if (!format) throw new EbookImportError("unsupported", picked.name);

  const source = new File(picked.uri);
  if (format === "comic") {
    // .cbr is usually a ZIP in disguise; a real RAR cannot be opened here.
    try {
      const head = firstBytes(source, 8);
      if (isRarSignature(head)) throw new EbookImportError("rar", picked.name);
      if (!isZipSignature(head)) throw new EbookImportError("unsupported", picked.name);
    } catch (error) {
      if (error instanceof EbookImportError) throw error;
      throw new EbookImportError("unreadable", picked.name, errorDetail(error));
    }
  }

  const folder = new Directory(root(), id);
  folder.create({ intermediates: true, idempotent: true });
  const file = safeName(picked.name);
  const destination = new File(folder, file);
  try {
    source.move(destination);
  } catch (moveError) {
    try {
      source.copy(destination);
      try {
        source.delete();
      } catch {
        // the picker copy is the system's to clean up
      }
    } catch (copyError) {
      throw new EbookImportError("unreadable", picked.name, `${errorDetail(moveError)} / ${errorDetail(copyError)}`);
    }
  }

  return {
    id,
    bookId,
    folder: id,
    file,
    format,
    title: titleFromEbookFileName(picked.name),
    bytes: destination.size ?? picked.size ?? 0,
    progress: 0,
    addedAt: new Date().toISOString(),
  };
}

export function deleteEbookFiles(ebook: Pick<Ebook, "folder">) {
  try {
    const dir = new Directory(Paths.document, ROOT_NAME, ebook.folder);
    if (dir.exists) dir.delete();
  } catch {
    // Gone already, or locked: the index entry is removed either way.
  }
}

/** Folders on disk that no record mentions — left by an interrupted import. */
export function orphanEbookFolders(known: ReadonlySet<string>): string[] {
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
