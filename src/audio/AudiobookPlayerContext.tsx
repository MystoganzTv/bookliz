/**
 * React's window onto the audiobook engine.
 *
 * Two hooks on purpose: `useAudiobookPlayer()` re-renders when what is loaded
 * or playing changes; `useAudiobookPosition()` re-renders twice a second while
 * sound is coming out. Only the scrubber and the mini-player should use the
 * second — the book detail screen must not redraw at 2 Hz because you are
 * listening.
 */
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useBookliz } from "../data/BooklizContext";
import { applyAudioBackupPreference } from "./audioBackup";
import { AudiobookEngine, type EngineHost, type EngineMainState } from "./audiobookEngine";

const EngineContext = createContext<AudiobookEngine | null>(null);

export function AudiobookPlayerProvider({ children }: PropsWithChildren) {
  const bookliz = useBookliz();
  const host: EngineHost = {
    getBook: bookliz.getBook,
    authorName: (book) => bookliz.getAuthor(book.authorId)?.name ?? "",
    addSession: (input) => {
      bookliz.addReadingSession(input);
    },
    setDurationMinutes: bookliz.updateBookDuration,
  };
  const [engine] = useState(() => new AudiobookEngine(host));
  // Native callbacks fire long after this render; they must reach today's data.
  engine.host = host;

  useEffect(() => {
    void engine.start();
    // Re-applied every launch: cheap, and it also covers a folder created by an
    // older build that never set the flag.
    void applyAudioBackupPreference().catch(() => {});
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") engine.onForeground();
    });
    return () => {
      sub.remove();
      engine.stop();
    };
  }, [engine]);

  // The book being listened to was deleted: stop, and let go of its files.
  const activeBookId = useSyncExternalStore(
    (l) => engine.subscribe("main", l),
    () => engine.getMain().activeBookId
  );
  useEffect(() => {
    if (activeBookId && !bookliz.getBook(activeBookId)) engine.removeAudio(activeBookId);
  }, [activeBookId, bookliz, engine]);

  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}

function useEngine(): AudiobookEngine {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error("useAudiobookPlayer must be used inside AudiobookPlayerProvider");
  return engine;
}

export type AudiobookPlayer = EngineMainState & {
  engine: AudiobookEngine;
};

export function useAudiobookPlayer(): AudiobookPlayer {
  const engine = useEngine();
  const main = useSyncExternalStore((l) => engine.subscribe("main", l), engine.getMain);
  return useMemo(() => ({ ...main, engine }), [main, engine]);
}

/** Seconds into the active book. Ticks while playing — use sparingly. */
export function useAudiobookPosition(): number {
  const engine = useEngine();
  return useSyncExternalStore((l) => engine.subscribe("position", l), engine.getPosition);
}
