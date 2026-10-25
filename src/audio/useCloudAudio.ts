/**
 * iCloud audiobooks for the file manager: what is up there, what is moving,
 * and the three actions (save, download, remove from iCloud).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  downloadFolder,
  iCloudStatus,
  ICloudStatus,
  isICloudAudioAvailable,
  listICloudFolders,
  onTransferProgress,
  removeICloudFolder,
  uploadFolder,
} from "../../modules/icloud-audio";
import { useBookliz } from "../data/BooklizContext";
import { useAudiobookPlayer } from "./AudiobookPlayerContext";
import { audioFolderUri } from "./audioFiles";
import { buildCloudManifest, CloudEntry, describeCloud } from "./cloudAudio";

export type CloudTransfer = { direction: "upload" | "download"; done: number; total: number };

export function useCloudAudio(enabled: boolean) {
  const { getBook, getAuthor } = useBookliz();
  const player = useAudiobookPlayer();
  const { engine, library } = player;
  const [status, setStatus] = useState<ICloudStatus>({ signedIn: false, available: false });
  const [folders, setFolders] = useState<Awaited<ReturnType<typeof listICloudFolders>>>([]);
  const [transfers, setTransfers] = useState<Record<string, CloudTransfer>>({});
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled || !isICloudAudioAvailable) return;
    setLoading(true);
    try {
      const next = await iCloudStatus();
      if (!mounted.current) return;
      setStatus(next);
      setFolders(next.available ? await listICloudFolders() : []);
    } catch {
      // Leave the last listing; the next refresh tries again.
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const progress = onTransferProgress((p) =>
      setTransfers((current) => (current[p.remoteId] ? { ...current, [p.remoteId]: { direction: p.direction, done: p.done, total: p.total } } : current)),
    );
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    // iCloud uploads in the background: re-list every so often while the screen is open.
    const timer = setInterval(() => void refresh(), 15_000);
    return () => {
      mounted.current = false;
      progress.remove();
      appState.remove();
      clearInterval(timer);
    };
  }, [refresh]);

  const entries: CloudEntry[] = useMemo(
    () => describeCloud(folders, new Set(Object.keys(library))),
    [folders, library],
  );

  const inCloud = useMemo(() => {
    const ids = new Map<string, CloudEntry>();
    for (const entry of entries) ids.set(entry.manifest?.bookId ?? entry.remoteId, entry);
    return ids;
  }, [entries]);

  const track = (id: string, transfer: CloudTransfer | null) =>
    setTransfers((current) => {
      const next = { ...current };
      if (transfer) next[id] = transfer;
      else delete next[id];
      return next;
    });

  const upload = useCallback(
    async (bookId: string) => {
      const audiobook = library[bookId];
      if (!audiobook) return;
      const book = getBook(bookId);
      const manifest = buildCloudManifest(audiobook, book?.title ?? "", book ? getAuthor(book.authorId)?.name ?? "" : "");
      track(bookId, { direction: "upload", done: 0, total: audiobook.tracks.length });
      try {
        await uploadFolder(audioFolderUri(audiobook.folder), bookId, JSON.stringify(manifest));
      } finally {
        track(bookId, null);
        void refresh();
      }
    },
    [getAuthor, getBook, library, refresh],
  );

  const download = useCallback(
    async (entry: CloudEntry): Promise<"book" | "inbox"> => {
      track(entry.remoteId, { direction: "download", done: 0, total: entry.files });
      try {
        const uris = await downloadFolder(entry.remoteId);
        return await engine.importDownloaded(uris, entry.manifest?.bookId ?? null, entry.manifest?.title);
      } finally {
        track(entry.remoteId, null);
        void refresh();
      }
    },
    [engine, refresh],
  );

  const remove = useCallback(
    async (entry: CloudEntry) => {
      await removeICloudFolder(entry.remoteId);
      await refresh();
    },
    [refresh],
  );

  return { supported: isICloudAudioAvailable, status, entries, inCloud, transfers, loading, refresh, upload, download, remove };
}
