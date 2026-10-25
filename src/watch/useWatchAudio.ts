/**
 * Audiobooks on the Apple Watch, for the file manager (Bookliz Pro): which
 * books the watch holds, what is still on its way, send and remove.
 */
import { useCallback, useEffect, useState } from "react";
import {
  deleteBookFromWatch,
  onWatchFiles,
  onWatchStatus,
  sendBookToWatch,
  watchFileTransfers,
  watchLibraryJson,
  watchStatus,
  WatchStatus,
  WatchTransfer,
} from "../../modules/watch-bridge";
import { useAudiobookPlayer } from "../audio/AudiobookPlayerContext";
import { trackUri } from "../audio/audioFiles";
import { useBookliz } from "../data/BooklizContext";
import { buildWatchBookPayload, parseWatchLibrary, WatchHeld } from "./watchFiles";

const transfersByBook = () => new Map(watchFileTransfers().map((row) => [row.bookId, row]));

export function useWatchAudio() {
  const { library } = useAudiobookPlayer();
  const { getBook, getAuthor } = useBookliz();
  const [status, setStatus] = useState<WatchStatus>(() => watchStatus());
  const [held, setHeld] = useState<Map<string, WatchHeld>>(() => parseWatchLibrary(watchLibraryJson()));
  const [transfers, setTransfers] = useState<Map<string, WatchTransfer>>(() => transfersByBook());

  useEffect(() => {
    const statusSub = onWatchStatus(setStatus);
    const filesSub = onWatchFiles((event) => {
      if (event.event === "library") setHeld(parseWatchLibrary(event.books));
      if (event.event === "transferFinished") setTransfers(transfersByBook());
    });
    // Progress of a file on its way is only readable by asking.
    const timer = setInterval(() => setTransfers(transfersByBook()), 2_000);
    return () => {
      statusSub.remove();
      filesSub.remove();
      clearInterval(timer);
    };
  }, []);

  const send = useCallback(
    (bookId: string): number => {
      const audiobook = library[bookId];
      if (!audiobook) return 0;
      const book = getBook(bookId);
      const payload = buildWatchBookPayload(
        audiobook,
        book?.title ?? "",
        book ? getAuthor(book.authorId)?.name ?? "" : "",
        (file) => trackUri(audiobook.folder, file),
      );
      if (!payload) return 0;
      const queued = sendBookToWatch(JSON.stringify(payload));
      setTransfers(transfersByBook());
      return queued;
    },
    [getAuthor, getBook, library],
  );

  const remove = useCallback((bookId: string) => {
    deleteBookFromWatch(bookId);
    setHeld((current) => {
      const next = new Map(current);
      next.delete(bookId);
      return next;
    });
    setTransfers(transfersByBook());
  }, []);

  return { available: status.paired && status.installed, reachable: status.reachable, held, transfers, send, remove };
}
