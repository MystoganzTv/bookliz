/**
 * bookIntake/scanQueue — the state machine behind the continuous barcode scanner.
 *
 * When a barcode resolves to a valid ISBN the camera never closes: the scan is
 * pushed onto this queue and resolves underneath the user. Each entry asks one
 * question ("do you own it?") and the answer may arrive BEFORE the metadata
 * does — that is the whole point: the user never waits for the network.
 *
 * Deliberate invariants (pinned by __tests__/scanQueue.test.ts):
 *  1. One entry per ISBN — rescanning the same barcode never creates a second.
 *  2. A book is only committed once metadata has resolved AND a shelf was
 *     chosen; a failed lookup can therefore never leave junk in the library.
 *  3. An answer given while resolving is remembered and applied on resolution.
 *  4. Duplicates and failures are terminal-ish states that add nothing.
 *
 * Pure module: no React, no I/O — the screen performs the side effects
 * (network lookup, addBook, deleteBook) and reports back through actions.
 */
import { NewBookInput } from "../../types/models";

/** The single question each entry asks. */
export type ScanShelfChoice = "owned" | "wishlist";

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
};

export type ScanQueueAction =
  | { type: "scanned"; isbn13: string; isbn10?: string; at: number }
  | { type: "resolved"; isbn13: string; book: NewBookInput; unverified?: boolean }
  | { type: "duplicate"; isbn13: string; existingTitle: string }
  | { type: "failed"; isbn13: string }
  | { type: "retry"; isbn13: string }
  | { type: "choose"; isbn13: string; choice: ScanShelfChoice }
  | { type: "added"; isbn13: string; bookId: string }
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

    case "added":
      return mapEntry(state, action.isbn13, (entry) =>
        entry.status === "adding"
          ? { ...entry, status: "added", bookId: action.bookId }
          : entry
      );

    case "undone":
      // Back to the question, so the user can answer differently.
      return mapEntry(state, action.isbn13, (entry) =>
        entry.status === "added"
          ? { ...entry, status: "ready", choice: undefined, bookId: undefined }
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
