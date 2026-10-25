/**
 * The ebook library as app state: what is imported, which book each file
 * belongs to, where the reader is in each, and the reader's look.
 *
 * Mirrors the audio side on purpose — files arrive in "Not in a book yet",
 * get given to a book, and from then on the book's page has Read.
 */
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { deleteEbookFiles, importEbookFile, orphanEbookFolders, pickEbookFiles, type PickedEbook } from "./ebookFiles";
import { clampProgress, type Ebook } from "./ebookModel";
import {
  DEFAULT_READER_PREFS,
  loadEbookLibrary,
  loadReaderPrefs,
  saveEbookLibrary,
  saveReaderPrefs,
  type EbookLibrary,
  type ReaderPrefs,
} from "./ebookStore";

export interface EbookImportResult {
  imported: Ebook[];
  failed: { name: string; error: unknown }[];
}

interface EbookContextValue {
  ready: boolean;
  library: EbookLibrary;
  /** Files with no book yet, newest first. */
  inbox: Ebook[];
  ebookForBook: (bookId: string) => Ebook | undefined;
  /** Pick files and import them — for a book, or into "Not in a book yet". */
  pickAndImport: (bookId: string | null) => Promise<EbookImportResult | null>;
  importPicked: (picked: readonly PickedEbook[], bookId: string | null) => EbookImportResult;
  /** Give a file to a book. A book has one ebook: the one it had goes back to the inbox. */
  assign: (ebookId: string, bookId: string) => void;
  /** Back to "Not in a book yet" (the file stays). */
  detach: (ebookId: string) => void;
  rename: (ebookId: string, title: string) => void;
  remove: (ebookId: string) => void;
  savePosition: (ebookId: string, position: Partial<Pick<Ebook, "progress" | "cfi" | "page" | "pages">>) => void;
  prefs: ReaderPrefs;
  setPrefs: (next: Partial<ReaderPrefs>) => void;
}

const EbookContext = createContext<EbookContextValue | null>(null);

const newId = () => `eb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function EbookProvider({ children }: PropsWithChildren) {
  const [library, setLibrary] = useState<EbookLibrary>({});
  const [ready, setReady] = useState(false);
  const [prefs, setPrefsState] = useState<ReaderPrefs>(DEFAULT_READER_PREFS);
  const libraryRef = useRef<EbookLibrary>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stored = await loadEbookLibrary();
        if (!alive) return;
        libraryRef.current = stored;
        setLibrary(stored);
        // Folders left by an interrupted import, never in the index.
        for (const folder of orphanEbookFolders(new Set(Object.values(stored).map((e) => e.folder)))) {
          deleteEbookFiles({ folder });
        }
      } catch {
        // Unreadable index: keep the files, show nothing, try again next launch.
      }
      const storedPrefs = await loadReaderPrefs();
      if (alive) {
        setPrefsState(storedPrefs);
        setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const commit = useCallback((update: (current: EbookLibrary) => EbookLibrary) => {
    const next = update(libraryRef.current);
    libraryRef.current = next;
    setLibrary(next);
    void saveEbookLibrary(next);
  }, []);

  const importPicked = useCallback(
    (picked: readonly PickedEbook[], bookId: string | null): EbookImportResult => {
      const imported: Ebook[] = [];
      const failed: EbookImportResult["failed"] = [];
      for (const file of picked) {
        try {
          // A book gets one ebook: only the first file goes to it, the rest to the inbox.
          const target = bookId && imported.length === 0 ? bookId : null;
          imported.push(importEbookFile(file, newId(), target));
        } catch (error) {
          failed.push({ name: file.name, error });
        }
      }
      if (imported.length) {
        commit((current) => {
          const next = { ...current };
          const owner = imported.find((e) => e.bookId)?.bookId;
          if (owner) {
            for (const existing of Object.values(next)) {
              if (existing.bookId === owner) next[existing.id] = { ...existing, bookId: null };
            }
          }
          for (const ebook of imported) next[ebook.id] = ebook;
          return next;
        });
      }
      return { imported, failed };
    },
    [commit]
  );

  const pickAndImport = useCallback(
    async (bookId: string | null) => {
      const picked = await pickEbookFiles();
      if (!picked) return null;
      return importPicked(picked, bookId);
    },
    [importPicked]
  );

  const assign = useCallback(
    (ebookId: string, bookId: string) =>
      commit((current) => {
        if (!current[ebookId]) return current;
        const next = { ...current };
        for (const existing of Object.values(next)) {
          if (existing.bookId === bookId && existing.id !== ebookId) next[existing.id] = { ...existing, bookId: null };
        }
        next[ebookId] = { ...next[ebookId], bookId };
        return next;
      }),
    [commit]
  );

  const detach = useCallback(
    (ebookId: string) => commit((current) => (current[ebookId] ? { ...current, [ebookId]: { ...current[ebookId], bookId: null } } : current)),
    [commit]
  );

  const rename = useCallback(
    (ebookId: string, title: string) =>
      commit((current) => (current[ebookId] && title.trim() ? { ...current, [ebookId]: { ...current[ebookId], title: title.trim() } } : current)),
    [commit]
  );

  const remove = useCallback(
    (ebookId: string) =>
      commit((current) => {
        const ebook = current[ebookId];
        if (!ebook) return current;
        deleteEbookFiles(ebook);
        const next = { ...current };
        delete next[ebookId];
        return next;
      }),
    [commit]
  );

  const savePosition = useCallback<EbookContextValue["savePosition"]>(
    (ebookId, position) =>
      commit((current) => {
        const ebook = current[ebookId];
        if (!ebook) return current;
        return {
          ...current,
          [ebookId]: {
            ...ebook,
            ...position,
            progress: position.progress === undefined ? ebook.progress : clampProgress(position.progress),
            lastOpenedAt: new Date().toISOString(),
          },
        };
      }),
    [commit]
  );

  const setPrefs = useCallback((next: Partial<ReaderPrefs>) => {
    setPrefsState((current) => {
      const merged = { ...current, ...next };
      void saveReaderPrefs(merged);
      return merged;
    });
  }, []);

  const value = useMemo<EbookContextValue>(() => {
    const all = Object.values(library);
    return {
      ready,
      library,
      inbox: all.filter((e) => !e.bookId).sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
      ebookForBook: (bookId) => all.find((e) => e.bookId === bookId),
      pickAndImport,
      importPicked,
      assign,
      detach,
      rename,
      remove,
      savePosition,
      prefs,
      setPrefs,
    };
  }, [assign, detach, importPicked, library, pickAndImport, prefs, ready, remove, rename, savePosition, setPrefs]);

  return <EbookContext.Provider value={value}>{children}</EbookContext.Provider>;
}

export function useEbooks(): EbookContextValue {
  const context = useContext(EbookContext);
  if (!context) throw new Error("useEbooks must be used inside EbookProvider");
  return context;
}
