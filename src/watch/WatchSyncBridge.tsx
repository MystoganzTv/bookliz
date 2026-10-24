/**
 * Mounts the Apple Watch link where it can reach everything it needs: the
 * audiobook engine, the library, the reading timer and navigation (stopping
 * the timer from the wrist opens the "log session" form on the phone).
 *
 * Its own component on purpose: the reading timer ticks every second, and
 * only this null-rendering component should re-render with it — not the
 * whole navigator.
 */
import type { NavigationContainerRefWithCurrent } from "@react-navigation/native";
import { useCallback, useMemo } from "react";
import { useAudiobookPlayer } from "../audio/AudiobookPlayerContext";
import { useBookliz } from "../data/BooklizContext";
import { useReadingTimer } from "../data/ReadingTimerContext";
import { useI18n } from "../i18n/LocalizationContext";
import type { RootStackParamList } from "../navigation/types";
import type { Book } from "../types/models";
import type { WatchCommand } from "../../modules/watch-bridge";
import { useWatchSync } from "./useWatchSync";
import { buildWatchReading } from "./watchState";

type NavRef = NavigationContainerRefWithCurrent<RootStackParamList>;

export function WatchSyncBridge({ navigation }: { navigation: NavRef }) {
  const { engine } = useAudiobookPlayer();
  const { locale } = useI18n();
  const { books, readingSessions, overallStats, userProfile, getBook, getAuthor } = useBookliz();
  const timer = useReadingTimer();

  const authorName = useCallback((book: Book) => getAuthor(book.authorId)?.name ?? "", [getAuthor]);

  // Not keyed on elapsedMs: the watch counts the seconds itself from startedAt.
  const reading = useMemo(
    () =>
      buildWatchReading({
        now: new Date(),
        books,
        sessions: readingSessions,
        streak: overallStats.currentStreak,
        booksThisYear: overallStats.booksReadThisYear,
        yearlyGoal: userProfile.yearlyGoal,
        timer: { bookId: timer.bookId, startedAt: timer.startedAt, isRunning: timer.isRunning },
        authorName,
      }),
    [
      books,
      readingSessions,
      overallStats.currentStreak,
      overallStats.booksReadThisYear,
      userProfile.yearlyGoal,
      timer.bookId,
      timer.startedAt,
      timer.isRunning,
      authorName,
    ]
  );

  const { start, stop, reset, isRunning, bookId: timerBookId, startedAt } = timer;
  const onReadingCommand = useCallback(
    (cmd: WatchCommand) => {
      switch (cmd.command) {
        case "readingStart":
          if (!cmd.bookId || !getBook(cmd.bookId)) return true;
          start(cmd.bookId);
          return true;
        case "readingStop": {
          if (!isRunning || !timerBookId) return true;
          const minutes = stop();
          // Same as the phone's own Stop: the session form, pre-filled. Pages are entered there.
          if (navigation.isReady()) {
            navigation.navigate("AddReadingSession", {
              bookId: timerBookId,
              prefillMinutes: minutes,
              prefillStartedAt: startedAt ?? undefined,
            });
          }
          return true;
        }
        case "readingDiscard":
          reset();
          return true;
        default:
          return false;
      }
    },
    [getBook, isRunning, navigation, reset, start, startedAt, stop, timerBookId]
  );

  useWatchSync(engine, { locale, getBook, authorName, reading, onReadingCommand });
  return null;
}
