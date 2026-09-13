/**
 * scanQueue — the continuous-scanner state machine.
 *
 * Pins the rules that keep the fast path safe:
 *  1. One entry per ISBN (the camera re-reads the same barcode constantly).
 *  2. Nothing is committed until metadata resolved AND a shelf was chosen.
 *  3. An answer given while resolving is remembered and applied on resolution.
 *  4. Failures and duplicates never produce a commit.
 *  5. Undo returns the entry to the question instead of dropping it.
 *  6. The question expires into "undecided" and still commits — a scan is
 *     never lost for going unanswered — but a real answer always beats it.
 */
import {
  AUTO_DISMISS_MS,
  AUTO_DISMISS_TIMED_OUT_MS,
  MAX_QUEUE_ENTRIES,
  QUESTION_TIMEOUT_MS,
  ScanQueueEntry,
  entriesAwaitingCommit,
  expiredEntries,
  hasResolvingEntry,
  scanQueueReducer,
  timedOutQuestions,
  unansweredEntries,
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

describe("cards that clear themselves", () => {
  const scanned = (isbn: string) =>
    scanQueueReducer([], { type: "scanned", isbn13: isbn, at: 0 });

  it("does not expire an entry that is still asking a question", () => {
    // The stack on the camera was confirmations, not questions. A question
    // waits as long as it needs to.
    const state = scanned("111");
    expect(expiredEntries(state, 10_000_000)).toEqual([]);
  });

  it("expires a confirmation once its time is up", () => {
    let state = scanned("111");
    state = scanQueueReducer(state, { type: "resolved", isbn13: "111", book: {} as never });
    state = scanQueueReducer(state, { type: "choose", isbn13: "111", choice: "owned" });
    state = scanQueueReducer(state, { type: "added", isbn13: "111", bookId: "b1", at: 1_000 });

    expect(expiredEntries(state, 1_000 + AUTO_DISMISS_MS - 1)).toEqual([]);
    expect(expiredEntries(state, 1_000 + AUTO_DISMISS_MS).map((e) => e.isbn13)).toEqual(["111"]);
  });

  it("expires a duplicate too — it also asks nothing", () => {
    let state = scanned("222");
    state = scanQueueReducer(state, { type: "duplicate", isbn13: "222", existingTitle: "Dune", at: 500 });
    expect(expiredEntries(state, 500 + AUTO_DISMISS_MS).map((e) => e.isbn13)).toEqual(["222"]);
  });

  it("never expires an entry whose caller passed no timestamp", () => {
    let state = scanned("333");
    state = scanQueueReducer(state, { type: "resolved", isbn13: "333", book: {} as never });
    state = scanQueueReducer(state, { type: "choose", isbn13: "333", choice: "owned" });
    state = scanQueueReducer(state, { type: "added", isbn13: "333", bookId: "b3" });
    expect(expiredEntries(state, Number.MAX_SAFE_INTEGER)).toEqual([]);
  });

  it("puts an undone entry back to being a question", () => {
    let state = scanned("444");
    state = scanQueueReducer(state, { type: "resolved", isbn13: "444", book: {} as never });
    state = scanQueueReducer(state, { type: "choose", isbn13: "444", choice: "owned" });
    state = scanQueueReducer(state, { type: "added", isbn13: "444", bookId: "b4", at: 1 });
    state = scanQueueReducer(state, { type: "undone", isbn13: "444" });

    expect(expiredEntries(state, Number.MAX_SAFE_INTEGER)).toEqual([]);
    expect(unansweredEntries(state).map((e) => e.isbn13)).toEqual(["444"]);
  });
});

describe("unansweredEntries", () => {
  it("counts scans still resolving and scans waiting on an answer", () => {
    let state = scanQueueReducer([], { type: "scanned", isbn13: "111", at: 0 });
    state = scanQueueReducer(state, { type: "scanned", isbn13: "222", at: 1 });
    state = scanQueueReducer(state, { type: "resolved", isbn13: "222", book: {} as never });
    expect(unansweredEntries(state).map((e) => e.isbn13).sort()).toEqual(["111", "222"]);
  });

  it("drops one the moment it is answered, even before it commits", () => {
    let state = scanQueueReducer([], { type: "scanned", isbn13: "111", at: 0 });
    state = scanQueueReducer(state, { type: "choose", isbn13: "111", choice: "wishlist" });
    expect(unansweredEntries(state)).toEqual([]);
  });

  it("ignores failures — those ask a different question", () => {
    let state = scanQueueReducer([], { type: "scanned", isbn13: "111", at: 0 });
    state = scanQueueReducer(state, { type: "failed", isbn13: "111" });
    expect(unansweredEntries(state)).toEqual([]);
  });
});

/**
 * The countdown. The camera cannot hold a question open forever — the card is
 * sitting on the barcode frame — so the clock answers "undecided" and the book
 * commits anyway, carrying the question into the library.
 */
describe("the ownership question expires", () => {
  const resolved = (at = 1) =>
    run([
      scan(ISBN, at),
      { type: "resolved", isbn13: ISBN, book: book("The Name of the Wind"), at },
    ]);

  it("does not expire a question that still has time on it", () => {
    const state = resolved(1000);
    expect(timedOutQuestions(state, 1000 + QUESTION_TIMEOUT_MS - 1)).toEqual([]);
  });

  it("expires a question once the window is up", () => {
    const state = resolved(1000);
    expect(timedOutQuestions(state, 1000 + QUESTION_TIMEOUT_MS).map((e) => e.isbn13)).toEqual([ISBN]);
  });

  it("restarts the countdown when the metadata lands, so a slow lookup costs the network, not the reader", () => {
    // Scanned at 0, metadata back at 5000: the reader has seen a title only
    // since 5000 and gets the whole window from there.
    const state = run([
      scan(ISBN, 0),
      { type: "resolved", isbn13: ISBN, book: book("The Name of the Wind"), at: 5000 },
    ]);
    expect(state[0].askedAt).toBe(5000);
    expect(timedOutQuestions(state, QUESTION_TIMEOUT_MS)).toEqual([]);
    expect(timedOutQuestions(state, 5000 + QUESTION_TIMEOUT_MS)).toHaveLength(1);
  });

  it("commits the book as undecided — the scan is not thrown away", () => {
    const state = run([{ type: "timedOut", isbn13: ISBN }], resolved(1000));
    expect(state[0].status).toBe("adding");
    expect(state[0].choice).toBe("undecided");
    expect(entriesAwaitingCommit(state)).toHaveLength(1);
  });

  it("remembers the timeout through a lookup that had not finished yet", () => {
    // The clock can reach an entry whose metadata is still in flight. The
    // answer waits for the book exactly as a tapped one would.
    const state = run([
      scan(ISBN, 0),
      { type: "timedOut", isbn13: ISBN },
      { type: "resolved", isbn13: ISBN, book: book("The Name of the Wind"), at: 9000 },
    ]);
    expect(state[0].status).toBe("adding");
    expect(state[0].choice).toBe("undecided");
  });

  it("never overrules an answer the reader actually gave", () => {
    const state = run(
      [{ type: "choose", isbn13: ISBN, choice: "owned" }, { type: "timedOut", isbn13: ISBN }],
      resolved(1000)
    );
    expect(state[0].choice).toBe("owned");
  });

  it("does not expire a failed lookup — that card has its own buttons and no clock", () => {
    const state = run([scan(ISBN, 0), { type: "failed", isbn13: ISBN }]);
    expect(timedOutQuestions(state, 10 * QUESTION_TIMEOUT_MS)).toEqual([]);
  });

  it("stops counting an entry as unanswered once the clock has spoken", () => {
    const state = run([{ type: "timedOut", isbn13: ISBN }], resolved(1000));
    expect(unansweredEntries(state)).toEqual([]);
  });

  it("clears an undecided confirmation faster than a chosen one", () => {
    const added = run(
      [
        { type: "timedOut", isbn13: ISBN },
        { type: "added", isbn13: ISBN, bookId: "b1", at: 1000 },
      ],
      resolved(1)
    );
    // Gone on the short clock…
    expect(expiredEntries(added, 1000 + AUTO_DISMISS_TIMED_OUT_MS)).toHaveLength(1);
    // …which is genuinely shorter than the one a deliberate answer gets.
    expect(AUTO_DISMISS_TIMED_OUT_MS).toBeLessThan(AUTO_DISMISS_MS);
  });
});
