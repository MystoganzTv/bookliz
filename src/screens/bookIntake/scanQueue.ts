/**
 * bookIntake/scanQueue — the state machine behind the continuous barcode scanner.
 *
 * When a barcode resolves to a valid ISBN the camera never closes: the scan is
 * pushed onto this queue and resolves underneath the user. Each entry asks one
 * question ("do you own it?") and the answer may arrive BEFORE the metadata
 * does — that is the whole point: the user never waits for the network.
 *
 * The question expires. A card that waits forever is a card sitting on top of
 * the barcode frame, and the reader scanning a shelf of thirty books cannot
 * stop to answer thirty times. After QUESTION_TIMEOUT_MS the entry answers
 * itself with "undecided" and commits anyway: the book reaches the library
 * carrying the unanswered question, and the Library asks it there. Nothing is
 * ever thrown away for not being answered in time.
 *
 * Deliberate invariants (pinned by __tests__/scanQueue.test.ts):
 *  1. One entry per ISBN — rescanning the same barcode never creates a second.
 *  2. A book is only committed once metadata has resolved AND a shelf was
 *     chosen; a failed lookup can therefore never leave junk in the library.
 *     "undecided" is a choice for this purpose — the timeout answers, it does
 *     not skip the answer.
 *  3. An answer given while resolving is remembered and applied on resolution.
 *     That includes the timeout firing before the metadata lands.
 *  4. Duplicates and failures are terminal-ish states that add nothing.
 *  5. A real answer always beats the timeout: once `choice` is set, timing out
 *     is a no-op.
 *
 * Pure module: no React, no I/O — the screen performs the side effects
 * (network lookup, addBook, deleteBook) and reports back through actions.
 */
import { NewBookInput } from "../../types/models";

/**
 * The single question each entry asks — and the answer the clock gives when
 * the reader does not. "undecided" is the only value the user never taps.
 */
export type ScanShelfChoice = "owned" | "wishlist" | "undecided";

export type ScanEntryStatus =
  /** Metadata lookup in flight. The two buttons are already tappable. */
  | "resolving"
  /** Metadata resolved, waiting for the user's answer. */
  | "ready"
  /** Answer + metadata both present — the screen is committing the book. */
  | "adding"
  /** In the library. Undo available. */
  | "added"
  /** Already in the library before this scan — nothing to add. */
  | "duplicate"
  /** Lookup failed — offers retry / edit manually. */
  | "failed";

export type ScanQueueEntry = {
  /** Stable React key. The ISBN-13 is the natural key: one entry per book. */
  id: string;
  isbn13: string;
  isbn10?: string;
  status: ScanEntryStatus;
  /** Resolved metadata. Undefined while resolving or after a failure. */
  book?: NewBookInput;
  /** The user's answer — may be recorded before `book` exists. */
  choice?: ScanShelfChoice;
  /** Id of the library book created for this entry (status "added"). */
  bookId?: string;
  /** Title of the library book this scan duplicates (status "duplicate"). */
  duplicateTitle?: string;
  /**
   * True when the lookup did not confirm an exact barcode match (the
   * aggregator fell back to a title search). The card warns about it — we
   * never silently present a guess as the scanned book.
   */
  unverified?: boolean;
  /** Epoch ms — entries are kept newest-first. */
  scannedAt: number;
  /**
   * Epoch ms the visible question started counting down from.
   *
   * Set on scan and reset when the metadata lands, so the reader always gets
   * the full window with the book's actual title in front of them rather than
   * spending it staring at an ISBN while the network works.
   */
  askedAt: number;
  /**
   * Epoch ms when the entry reached a state that asks nothing more of the
   * reader ("added", "duplicate"). Those cards are confirmations, and a
   * confirmation that never leaves is just something covering the camera —
   * which is exactly what a stack of them was doing. Undefined means the entry
   * is still a question, and questions do not expire on their own.
   */
  settledAt?: number;
};

export type ScanQueueAction =
  | { type: "scanned"; isbn13: string; isbn10?: string; at: number }
  | { type: "resolved"; isbn13: string; book: NewBookInput; unverified?: boolean; at?: number }
  | { type: "duplicate"; isbn13: string; existingTitle: string; at?: number }
  | { type: "failed"; isbn13: string }
  | { type: "retry"; isbn13: string }
  | { type: "choose"; isbn13: string; choice: ScanShelfChoice }
  | { type: "timedOut"; isbn13: string }
  | { type: "added"; isbn13: string; bookId: string; at?: number }
  | { type: "undone"; isbn13: string }
  | { type: "dismiss"; isbn13: string }
  | { type: "clear" };

/** How many scans stay on screen. Older confirmations fall off the bottom. */
export const MAX_QUEUE_ENTRIES = 12;

/**
 * The only place a commit can start: metadata present AND a shelf chosen.
 * Everything else stays put.
 */
const settle = (entry: ScanQueueEntry): ScanQueueEntry =>
  entry.status === "ready" && entry.book && entry.choice
    ? { ...entry, status: "adding" }
    : entry;

const mapEntry = (
  state: ScanQueueEntry[],
  isbn13: string,
  update: (entry: ScanQueueEntry) => ScanQueueEntry
): ScanQueueEntry[] => {
  let changed = false;
  const next = state.map((entry) => {
    if (entry.isbn13 !== isbn13) return entry;
    const updated = update(entry);
    if (updated !== entry) changed = true;
    return updated;
  });
  return changed ? next : state;
};

export function scanQueueReducer(
  state: ScanQueueEntry[],
  action: ScanQueueAction
): ScanQueueEntry[] {
  switch (action.type) {
    case "scanned": {
      // Invariant 1 — the same barcode never yields two entries, however fast
      // the camera re-reads it.
      if (state.some((entry) => entry.isbn13 === action.isbn13)) return state;
      const entry: ScanQueueEntry = {
        id: action.isbn13,
        isbn13: action.isbn13,
        isbn10: action.isbn10,
        status: "resolving",
        scannedAt: action.at,
        askedAt: action.at,
      };
      return [entry, ...state].slice(0, MAX_QUEUE_ENTRIES);
    }

    case "resolved":
      return mapEntry(state, action.isbn13, (entry) =>
        entry.status === "resolving"
          ? settle({
              ...entry,
              book: action.book,
              unverified: action.unverified,
              status: "ready",
              // The countdown restarts on the card the reader can actually
              // read. A slow lookup costs the network time, not the reader's.
              askedAt: action.at ?? entry.askedAt,
            })
          : entry
      );

    case "duplicate":
      // Reachable from "resolving" (already in the library when scanned) and
      // from "adding" (the library changed while the user was answering).
      return mapEntry(state, action.isbn13, (entry) =>
        entry.status === "resolving" || entry.status === "adding"
          ? {
              ...entry,
              status: "duplicate",
              duplicateTitle: action.existingTitle,
              bookId: undefined,
              settledAt: action.at,
            }
          : entry
      );

    case "failed":
      return mapEntry(state, action.isbn13, (entry) =>
        entry.status === "resolving" ? { ...entry, status: "failed" } : entry
      );

    case "retry":
      return mapEntry(state, action.isbn13, (entry) =>
        entry.status === "failed" ? { ...entry, status: "resolving" } : entry
      );

    case "choose":
      // An answer is accepted while resolving (remembered for later) and once
      // ready (commits immediately). Never re-answers a settled entry.
      return mapEntry(state, action.isbn13, (entry) =>
        entry.status === "resolving" || entry.status === "ready"
          ? settle({ ...entry, choice: action.choice })
          : entry
      );

    case "timedOut":
      // Invariant 5 — an answer already given wins; the clock only speaks for
      // a reader who said nothing.
      return mapEntry(state, action.isbn13, (entry) =>
        (entry.status === "resolving" || entry.status === "ready") && !entry.choice
          ? settle({ ...entry, choice: "undecided" })
          : entry
      );

    case "added":
      return mapEntry(state, action.isbn13, (entry) =>
        entry.status === "adding"
          ? { ...entry, status: "added", bookId: action.bookId, settledAt: action.at }
          : entry
      );

    case "undone":
      // Back to the question, so the user can answer differently.
      return mapEntry(state, action.isbn13, (entry) =>
        entry.status === "added"
          ? { ...entry, status: "ready", choice: undefined, bookId: undefined, settledAt: undefined }
          : entry
      );

    case "dismiss":
      return state.filter((entry) => entry.isbn13 !== action.isbn13);

    case "clear":
      return state.length ? [] : state;

    default:
      return state;
  }
}

/** Entries the screen still has to commit to the library. */
export const entriesAwaitingCommit = (state: ScanQueueEntry[]): ScanQueueEntry[] =>
  state.filter((entry) => entry.status === "adding" && Boolean(entry.book) && Boolean(entry.choice));

/** True while at least one scan is still resolving. */
export const hasResolvingEntry = (state: ScanQueueEntry[]): boolean =>
  state.some((entry) => entry.status === "resolving");

/** How long a confirmation stays on the camera before it clears itself. */
export const AUTO_DISMISS_MS = 4000;

/**
 * A confirmation for a book nobody answered for gets a shorter goodbye.
 *
 * It still has to appear — a book appearing in the library with no receipt on
 * screen is the app doing something behind the reader's back — but it is the
 * least interesting card on the camera, so it does not get the full four
 * seconds over the barcode frame.
 */
export const AUTO_DISMISS_TIMED_OUT_MS = 1600;

/**
 * How long the ownership question waits for an answer before answering
 * "undecided" itself. Six seconds: long enough to read a title and tap, short
 * enough that a reader working through a shelf is never blocked.
 */
export const QUESTION_TIMEOUT_MS = 6000;

/**
 * Questions whose window has run out.
 *
 * Only entries actually asking something are eligible — "failed" has its own
 * card with its own buttons and no clock, and an entry with a `choice` has
 * been answered, whether by the reader or by an earlier tick.
 */
export function timedOutQuestions(
  state: ScanQueueEntry[],
  now: number,
  ttlMs: number = QUESTION_TIMEOUT_MS
): ScanQueueEntry[] {
  return state.filter(
    (entry) =>
      (entry.status === "resolving" || entry.status === "ready") &&
      !entry.choice &&
      now - entry.askedAt >= ttlMs
  );
}

/**
 * Confirmations old enough to clear themselves.
 *
 * An entry with no `settledAt` never expires: that covers every entry still
 * asking a question, and every entry written by a caller that did not pass a
 * timestamp — in both cases leaving the card alone is the safe answer.
 */
export function expiredEntries(
  state: ScanQueueEntry[],
  now: number,
  ttlMs: number = AUTO_DISMISS_MS,
  timedOutTtlMs: number = AUTO_DISMISS_TIMED_OUT_MS
): ScanQueueEntry[] {
  return state.filter((entry) => {
    if (entry.settledAt === undefined) return false;
    const ttl = entry.choice === "undecided" ? timedOutTtlMs : ttlMs;
    return now - entry.settledAt >= ttl;
  });
}

/**
 * Scans the reader has not answered yet — the ones worth asking about again
 * when they leave the scanner, instead of throwing the scan away.
 */
export function unansweredEntries(state: ScanQueueEntry[]): ScanQueueEntry[] {
  return state.filter(
    (entry) => (entry.status === "ready" || entry.status === "resolving") && !entry.choice
  );
}
