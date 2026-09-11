/**
 * Booklio offline queue — stores failed Supabase sync operations and replays
 * them when network connectivity returns.
 *
 * Architecture:
 *  - Local data (AsyncStorage) always writes first — the app is offline-first.
 *  - Supabase sync is opportunistic; failures get queued here.
 *  - The queue is replayed automatically when the app comes to the foreground
 *    (AppState "active") or when the caller explicitly calls `flushQueue`.
 *
 * Storage key: @bookliz/offlineQueue
 * Schema: QueuedOperation[]
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";

export const OFFLINE_QUEUE_KEY = "@bookliz/offlineQueue";
const QUEUE_KEY = OFFLINE_QUEUE_KEY;
export const MAX_RETRIES = 5;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Types ────────────────────────────────────────────────────────────────────

export type QueuedOperationType =
  | "upsert_book"
  | "delete_book"
  | "upsert_session"
  | "delete_session"
  | "upsert_review"
  | "delete_review"
  | "upsert_profile";

export type QueuedOperation = {
  id: string;
  type: QueuedOperationType;
  /** Serialised payload — the Supabase row / partial row */
  payload: Record<string, unknown>;
  queuedAt: number; // Date.now()
  retries: number;
  lastError?: string;
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function readQueue(): Promise<QueuedOperation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedOperation[];
    // Evict items older than MAX_AGE_MS or past MAX_RETRIES
    return parsed.filter(
      (op) =>
        op.retries < MAX_RETRIES &&
        Date.now() - op.queuedAt < MAX_AGE_MS
    );
  } catch {
    return [];
  }
}

async function writeQueue(ops: QueuedOperation[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Add a failed operation to the queue. */
export async function enqueue(
  type: QueuedOperationType,
  payload: Record<string, unknown>
): Promise<void> {
  const ops = await readQueue();
  const op: QueuedOperation = {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    payload,
    queuedAt: Date.now(),
    retries: 0,
  };
  ops.push(op);
  await writeQueue(ops);
}

/** Returns true if there are pending operations in the queue. */
export async function hasPendingOperations(): Promise<boolean> {
  const ops = await readQueue();
  return ops.length > 0;
}

/** Returns the current queue (filtered for validity). */
export async function getPendingOperations(): Promise<QueuedOperation[]> {
  return readQueue();
}

/** Remove a single operation by id (after successful replay). */
export async function dequeue(id: string): Promise<void> {
  const ops = await readQueue();
  await writeQueue(ops.filter((op) => op.id !== id));
}

/** Increment retry count on an operation (after a failed replay attempt). */
export async function markRetried(id: string, error: string): Promise<void> {
  const ops = await readQueue();
  await writeQueue(
    ops.map((op) =>
      op.id === id
        ? { ...op, retries: op.retries + 1, lastError: error }
        : op
    )
  );
}

/** Clear all queued operations (e.g., on sign-out or reset). */
export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

// ─── Network check ────────────────────────────────────────────────────────────

/** Returns true if the device currently has internet access. */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    // `isInternetReachable` is `undefined` on several platforms while the OS is
    // still probing; treating that as offline meant the queue never flushed.
    return state.isConnected === true && state.isInternetReachable !== false;
  } catch {
    return false;
  }
}

// ─── Flush helper ─────────────────────────────────────────────────────────────

/**
 * Replay queued operations.
 *
 * Pass an `executor` function that knows how to handle each operation type.
 * The executor should return true on success, false on failure.
 * Successful operations are removed from the queue; failed ones have their
 * retry count incremented.
 *
 * Example usage (in BooklioRepository):
 * ```ts
 * await flushQueue(async (op) => {
 *   if (op.type === "upsert_book") {
 *     const { error } = await supabase.from("books").upsert(op.payload);
 *     return !error;
 *   }
 *   return false;
 * });
 * ```
 */
export async function flushQueue(
  executor: (op: QueuedOperation) => Promise<boolean>
): Promise<{ flushed: number; failed: number }> {
  const online = await isOnline();
  if (!online) return { flushed: 0, failed: 0 };

  const ops = await readQueue();
  if (ops.length === 0) return { flushed: 0, failed: 0 };

  let flushed = 0;
  let failed = 0;

  for (const op of ops) {
    try {
      const success = await executor(op);
      if (success) {
        await dequeue(op.id);
        flushed++;
      } else {
        await markRetried(op.id, "executor returned false");
        failed++;
      }
    } catch (err) {
      await markRetried(op.id, err instanceof Error ? err.message : String(err));
      failed++;
    }
  }

  return { flushed, failed };
}
