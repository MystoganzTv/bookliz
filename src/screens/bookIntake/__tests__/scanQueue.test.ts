/**
 * scanQueue — the continuous-scanner state machine.
 *
 * Pins the rules that keep the fast path safe:
 *  1. One entry per ISBN (the camera re-reads the same barcode constantly).
 *  2. Nothing is committed until metadata resolved AND a shelf was chosen.
 *  3. An answer given while resolving is remembered and applied on resolution.
 *  4. Failures and duplicates never produce a commit.
 *  5. Undo returns the entry to the question instead of dropping it.
 */
import {
  MAX_QUEUE_ENTRIES,
  ScanQueueEntry,
  entriesAwaitingCommit,
  hasResolvingEntry,
  scanQueueReducer,
} from "../scanQueue";
import { NewBookInput } from "../../../types/models";

const ISBN = "9780756404741";
const OTHER = "9788408281153";

const book = (title: string): NewBookInput => ({
  title,
  authorName: "Patrick Rothfuss",
  source: "isbn",
  format: "physical",
});

const run = (actions: Parameters<typeof scanQueueReducer>[1][], initial: ScanQueueEntry[] = []) =>
  actions.reduce(scanQueueReducer, initial);

const scan = (isbn13 = ISBN, at = 1) => ({ type: "scanned" as const, isbn13, at });

describe("scanQueueReducer", () => {
  it("creates one resolving entry per scan, newest first", () => {
    const state = run([scan(ISBN, 1), scan(OTHER, 2)]);
    expect(state.map((e) => e.isbn13)).toEqual([OTHER, ISBN]);
    expect(state.every((e) => e.status === "resolving")).toBe(true);
    expect(hasResolvingEntry(state)).toBe(true);
  });

  it("never creates a second entry for the same barcode", () => {
    const state = run([scan(ISBN, 1), scan(ISBN, 2), scan(ISBN, 3)]);
    expect(state).toHaveLength(1);
    expect(state[0].scannedAt).toBe(1);
  });

  it("caps the visible stack and drops the oldest", () => {
    const actions = Array.from({ length: MAX_QUEUE_ENTRIES + 3 }, (_, i) =>
      scan(`978000000${String(i).padStart(4, "0")}`, i)
    );
    const state = run(actions);
    expect(state).toHaveLength(MAX_QUEUE_ENTRIES);
    // The newest scan is on top, the first three scans fell off.
    expect(state[0].scannedAt).toBe(MAX_QUEUE_ENTRIES + 2);
  });

  it("waits for an answer once metadata resolves", () => {
    const state = run([scan(), { type: "resolved", isbn13: ISBN, book: book("The Name of the Wind") }]);
    expect(state[0].status).toBe("ready");
    expect(state[0].book?.title).toBe("The Name of the Wind");
    expect(entriesAwaitingCommit(state)).toHaveLength(0);
  });

  it("commits as soon as a ready entry is answered", () => {
    const state = run([
      scan(),
      { type: "resolved", isbn13: ISBN, book: book("The Name of the Wind") },
      { type: "choose", isbn13: ISBN, choice: "owned" },
    ]);
    expect(state[0].status).toBe("adding");
    expect(entriesAwaitingCommit(state)).toHaveLength(1);
  });

  it("remembers an answer given before metadata arrives", () => {
    const answered = run([scan(), { type: "choose", isbn13: ISBN, choice: "wishlist" }]);
    // Still resolving — the user never waits, but nothing is added yet either.
    expect(answered[0].status).toBe("resolving");
    expect(answered[0].choice).toBe("wishlist");
    expect(entriesAwaitingCommit(answered)).toHaveLength(0);

    const resolved = scanQueueReducer(answered, {
      type: "resolved",
      isbn13: ISBN,
      book: book("Alas de sangre"),
    });
    expect(resolved[0].status).toBe("adding");
    expect(resolved[0].choice).toBe("wishlist");
  });

  it("never commits a failed lookup, even when already answered", () => {
    const state = run([
      scan(),
      { type: "choose", isbn13: ISBN, choice: "owned" },
      { type: "failed", isbn13: ISBN },
    ]);
    expect(state[0].status).toBe("failed");
    expect(state[0].book).toBeUndefined();
    expect(entriesAwaitingCommit(state)).toHaveLength(0);
  });

  it("retries a failed entry back into resolving, keeping the answer", () => {
    const state = run([
      scan(),
      { type: "choose", isbn13: ISBN, choice: "owned" },
      { type: "failed", isbn13: ISBN },
      { type: "retry", isbn13: ISBN },
    ]);
    expect(state[0].status).toBe("resolving");
    expect(state[0].choice).toBe("owned");
  });

  it("adds nothing for a duplicate, whenever it is detected", () => {
    const onScan = run([scan(), { type: "duplicate", isbn13: ISBN, existingTitle: "Kingkiller" }]);
    expect(onScan[0].status).toBe("duplicate");
    expect(onScan[0].duplicateTitle).toBe("Kingkiller");
    expect(entriesAwaitingCommit(onScan)).toHaveLength(0);

    // The library can also change between resolution and the answer.
    const lateDuplicate = run([
      scan(),
      { type: "resolved", isbn13: ISBN, book: book("The Name of the Wind") },
      { type: "choose", isbn13: ISBN, choice: "owned" },
      { type: "duplicate", isbn13: ISBN, existingTitle: "The Name of the Wind" },
    ]);
    expect(lateDuplicate[0].status).toBe("duplicate");
    expect(entriesAwaitingCommit(lateDuplicate)).toHaveLength(0);
  });

  it("marks an entry added and then undoes it back to the question", () => {
    const added = run([
      scan(),
      { type: "resolved", isbn13: ISBN, book: book("The Name of the Wind") },
      { type: "choose", isbn13: ISBN, choice: "owned" },
      { type: "added", isbn13: ISBN, bookId: "b-1" },
    ]);
    expect(added[0]).toMatchObject({ status: "added", bookId: "b-1" });
    expect(entriesAwaitingCommit(added)).toHaveLength(0);

    const undone = scanQueueReducer(added, { type: "undone", isbn13: ISBN });
    expect(undone[0].status).toBe("ready");
    expect(undone[0].choice).toBeUndefined();
    expect(undone[0].bookId).toBeUndefined();
    // Undo must not re-trigger a commit on its own.
    expect(entriesAwaitingCommit(undone)).toHaveLength(0);
  });

  it("ignores answers on entries that are already settled", () => {
    const added = run([
      scan(),
      { type: "resolved", isbn13: ISBN, book: book("The Name of the Wind") },
      { type: "choose", isbn13: ISBN, choice: "owned" },
      { type: "added", isbn13: ISBN, bookId: "b-1" },
      { type: "choose", isbn13: ISBN, choice: "wishlist" },
    ]);
    expect(added[0].status).toBe("added");
    expect(added[0].choice).toBe("owned");
  });

  it("carries the unverified flag through resolution", () => {
    const state = run([
      scan(),
      { type: "resolved", isbn13: ISBN, book: book("Guessed title"), unverified: true },
    ]);
    expect(state[0].unverified).toBe(true);
  });

  it("dismisses and clears", () => {
    const state = run([scan(ISBN, 1), scan(OTHER, 2), { type: "dismiss", isbn13: OTHER }]);
    expect(state.map((e) => e.isbn13)).toEqual([ISBN]);
    expect(scanQueueReducer(state, { type: "clear" })).toEqual([]);
  });

  it("returns the same reference when nothing changes", () => {
    const state = run([scan()]);
    expect(scanQueueReducer(state, { type: "added", isbn13: ISBN, bookId: "b-1" })).toBe(state);
    expect(scanQueueReducer(state, { type: "clear" })).not.toBe(state);
    expect(scanQueueReducer([], { type: "clear" })).toEqual([]);
  });
});
