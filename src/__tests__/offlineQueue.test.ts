/**
 * Integration tests for src/utils/offlineQueue.ts
 *
 * Uses the official AsyncStorage in-memory mock so tests exercise the real
 * read/write/filter logic without touching disk.
 * expo-network is mocked — tests control connectivity via mockResolvedValue.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-network", () => ({
  getNetworkStateAsync: jest.fn(),
}));

// Import after mocks are registered so the module picks them up.
import {
  clearQueue,
  dequeue,
  enqueue,
  flushQueue,
  getPendingOperations,
  hasPendingOperations,
  isOnline,
  markRetried,
  QueuedOperation,
} from "../utils/offlineQueue";

// ── Helpers ───────────────────────────────────────────────────────────────────

type NetworkState = Awaited<ReturnType<typeof Network.getNetworkStateAsync>>;
const mockGetNetwork = Network.getNetworkStateAsync as jest.MockedFunction<
  typeof Network.getNetworkStateAsync
>;

function setNetworkStatus(connected: boolean, reachable: boolean = connected) {
  mockGetNetwork.mockResolvedValue({
    isConnected: connected,
    isInternetReachable: reachable,
    // NetworkStateType is an enum — cast through unknown to avoid type incompatibility
    type: connected ? "wifi" : "none",
  } as unknown as NetworkState);
}

// The private storage key used internally by offlineQueue.ts
const QUEUE_KEY = "@bookliz/offlineQueue";

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  setNetworkStatus(true); // default: online
});

// ─── enqueue ──────────────────────────────────────────────────────────────────

describe("enqueue", () => {
  it("adds one operation to an empty queue", async () => {
    await enqueue("upsert_book", { id: "b-1", title: "Dune" });
    const ops = await getPendingOperations();
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("upsert_book");
    expect(ops[0].payload).toEqual({ id: "b-1", title: "Dune" });
    expect(ops[0].retries).toBe(0);
  });

  it("id starts with the operation type", async () => {
    await enqueue("delete_session", {});
    const [op] = await getPendingOperations();
    expect(op.id).toMatch(/^delete_session-/);
  });

  it("appends to existing operations preserving order", async () => {
    await enqueue("upsert_book", { id: "b-1" });
    await enqueue("delete_book", { id: "b-2" });
    const ops = await getPendingOperations();
    expect(ops).toHaveLength(2);
    expect(ops[0].type).toBe("upsert_book");
    expect(ops[1].type).toBe("delete_book");
  });

  it("generates unique IDs for every call", async () => {
    await enqueue("upsert_book", { id: "b-1" });
    await enqueue("upsert_book", { id: "b-2" });
    const ops = await getPendingOperations();
    expect(ops[0].id).not.toBe(ops[1].id);
  });

  it("stamps queuedAt within the test's execution window", async () => {
    const before = Date.now();
    await enqueue("upsert_profile", {});
    const after = Date.now();
    const [op] = await getPendingOperations();
    expect(op.queuedAt).toBeGreaterThanOrEqual(before);
    expect(op.queuedAt).toBeLessThanOrEqual(after);
  });

  it("accepts every valid QueuedOperationType", async () => {
    const types = [
      "upsert_book",
      "delete_book",
      "upsert_session",
      "delete_session",
      "upsert_review",
      "delete_review",
      "upsert_profile",
    ] as const;
    for (const type of types) {
      await enqueue(type, {});
    }
    expect(await getPendingOperations()).toHaveLength(types.length);
  });
});

// ─── hasPendingOperations ─────────────────────────────────────────────────────

describe("hasPendingOperations", () => {
  it("returns false on an empty queue", async () => {
    expect(await hasPendingOperations()).toBe(false);
  });

  it("returns true after an operation is enqueued", async () => {
    await enqueue("upsert_book", {});
    expect(await hasPendingOperations()).toBe(true);
  });

  it("returns false once the queue is cleared", async () => {
    await enqueue("upsert_book", {});
    await clearQueue();
    expect(await hasPendingOperations()).toBe(false);
  });
});

// ─── getPendingOperations ─────────────────────────────────────────────────────

describe("getPendingOperations", () => {
  it("returns an empty array when the queue is empty", async () => {
    expect(await getPendingOperations()).toEqual([]);
  });

  it("returns an empty array when the storage key does not exist", async () => {
    // AsyncStorage.clear() removes the key; should not throw
    expect(await getPendingOperations()).toEqual([]);
  });

  it("returns all valid operations", async () => {
    await enqueue("upsert_book", { id: "b-1" });
    await enqueue("upsert_review", { id: "r-1" });
    const ops = await getPendingOperations();
    expect(ops).toHaveLength(2);
  });
});

// ─── dequeue ──────────────────────────────────────────────────────────────────

describe("dequeue", () => {
  it("removes the matching operation by id", async () => {
    await enqueue("upsert_book", { id: "b-1" });
    await enqueue("delete_book", { id: "b-2" });
    const [first] = await getPendingOperations();
    await dequeue(first.id);
    const remaining = await getPendingOperations();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].type).toBe("delete_book");
  });

  it("leaves other operations untouched", async () => {
    await enqueue("upsert_book", { id: "b-1" });
    await enqueue("upsert_session", { id: "s-1" });
    await enqueue("upsert_review", { id: "r-1" });
    const ops = await getPendingOperations();
    await dequeue(ops[1].id); // remove middle
    const remaining = await getPendingOperations();
    expect(remaining).toHaveLength(2);
    expect(remaining.map((o) => o.type)).toEqual(["upsert_book", "upsert_review"]);
  });

  it("is a no-op for an unknown id", async () => {
    await enqueue("upsert_book", {});
    await dequeue("nonexistent-id-xyz");
    expect(await hasPendingOperations()).toBe(true);
  });
});

// ─── markRetried ─────────────────────────────────────────────────────────────

describe("markRetried", () => {
  it("increments retries to 1 and records lastError", async () => {
    await enqueue("upsert_session", { id: "s-1" });
    const [op] = await getPendingOperations();
    await markRetried(op.id, "network timeout");
    const [updated] = await getPendingOperations();
    expect(updated.retries).toBe(1);
    expect(updated.lastError).toBe("network timeout");
  });

  it("accumulates retries on successive calls", async () => {
    await enqueue("upsert_session", {});
    const [op] = await getPendingOperations();
    await markRetried(op.id, "err 1");
    await markRetried(op.id, "err 2");
    await markRetried(op.id, "err 3");
    const [updated] = await getPendingOperations();
    expect(updated.retries).toBe(3);
    expect(updated.lastError).toBe("err 3");
  });

  it("updates only the targeted operation", async () => {
    await enqueue("upsert_book", { id: "b-1" });
    await enqueue("upsert_review", { id: "r-1" });
    const ops = await getPendingOperations();
    await markRetried(ops[0].id, "fail");
    const [first, second] = await getPendingOperations();
    expect(first.retries).toBe(1);
    expect(second.retries).toBe(0);
  });

  it("is a no-op for an unknown id", async () => {
    await enqueue("upsert_book", {});
    await markRetried("nonexistent-id", "error");
    const [op] = await getPendingOperations();
    expect(op.retries).toBe(0);
  });
});

// ─── clearQueue ───────────────────────────────────────────────────────────────

describe("clearQueue", () => {
  it("removes all queued operations", async () => {
    await enqueue("upsert_book", {});
    await enqueue("upsert_review", {});
    await clearQueue();
    expect(await hasPendingOperations()).toBe(false);
  });

  it("is safe to call on an already-empty queue", async () => {
    await expect(clearQueue()).resolves.toBeUndefined();
  });

  it("removes the underlying AsyncStorage key", async () => {
    await enqueue("upsert_book", {});
    await clearQueue();
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    expect(raw).toBeNull();
  });
});

// ─── Auto-eviction ────────────────────────────────────────────────────────────

describe("auto-eviction (readQueue filtering)", () => {
  it("keeps a fresh operation with 0 retries", async () => {
    await enqueue("upsert_book", {});
    expect(await hasPendingOperations()).toBe(true);
  });

  it("evicts an operation after 5 retries (MAX_RETRIES)", async () => {
    await enqueue("upsert_book", {});
    const [op] = await getPendingOperations();
    // 4 retries — still present
    for (let i = 0; i < 4; i++) await markRetried(op.id, "retry");
    expect(await hasPendingOperations()).toBe(true);
    // 5th retry pushes retries to 5 — evicted on next read
    await markRetried(op.id, "retry");
    expect(await hasPendingOperations()).toBe(false);
  });

  it("evicts an operation older than 7 days", async () => {
    const expiredOp: QueuedOperation = {
      id: "upsert_book-old-abc12",
      type: "upsert_book",
      payload: {},
      queuedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
      retries: 0,
    };
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([expiredOp]));
    expect(await hasPendingOperations()).toBe(false);
  });

  it("keeps an operation that is exactly 6 days old", async () => {
    const recentOp: QueuedOperation = {
      id: "upsert_book-recent-xyz99",
      type: "upsert_book",
      payload: {},
      queuedAt: Date.now() - 6 * 24 * 60 * 60 * 1000, // 6 days ago
      retries: 0,
    };
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([recentOp]));
    expect(await hasPendingOperations()).toBe(true);
  });

  it("evicts only expired items and keeps valid ones", async () => {
    const expired: QueuedOperation = {
      id: "upsert_book-old-000",
      type: "upsert_book",
      payload: { title: "Old" },
      queuedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
      retries: 0,
    };
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([expired]));
    // Add a fresh op via the normal API
    await enqueue("upsert_review", { title: "New" });
    const ops = await getPendingOperations();
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("upsert_review");
  });
});

// ─── isOnline ─────────────────────────────────────────────────────────────────

describe("isOnline", () => {
  it("returns true when connected and internet is reachable", async () => {
    setNetworkStatus(true, true);
    expect(await isOnline()).toBe(true);
  });

  it("returns false when not connected", async () => {
    setNetworkStatus(false, false);
    expect(await isOnline()).toBe(false);
  });

  it("returns false when connected but internet is not reachable", async () => {
    setNetworkStatus(true, false);
    expect(await isOnline()).toBe(false);
  });

  it("returns true when connected and reachability is still unknown", async () => {
    // `isInternetReachable` is undefined on several platforms until the OS
    // finishes probing. Treating "unknown" as offline kept the queue stuck.
    mockGetNetwork.mockResolvedValue({ isConnected: true, isInternetReachable: undefined, type: "wifi" } as unknown as NetworkState);
    expect(await isOnline()).toBe(true);
  });

  it("returns false when getNetworkStateAsync throws", async () => {
    mockGetNetwork.mockRejectedValue(new Error("native module unavailable"));
    expect(await isOnline()).toBe(false);
  });
});

// ─── flushQueue ───────────────────────────────────────────────────────────────

describe("flushQueue", () => {
  it("returns {flushed:0, failed:0} when offline, skips executor", async () => {
    setNetworkStatus(false);
    await enqueue("upsert_book", {});
    const executor = jest.fn().mockResolvedValue(true);
    const result = await flushQueue(executor);
    expect(result).toEqual({ flushed: 0, failed: 0 });
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns {flushed:0, failed:0} when queue is empty", async () => {
    const executor = jest.fn().mockResolvedValue(true);
    const result = await flushQueue(executor);
    expect(result).toEqual({ flushed: 0, failed: 0 });
    expect(executor).not.toHaveBeenCalled();
  });

  it("calls executor once per queued operation", async () => {
    await enqueue("upsert_book", { id: "b-1" });
    await enqueue("upsert_session", { id: "s-1" });
    const executor = jest.fn().mockResolvedValue(true);
    await flushQueue(executor);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it("removes successful operations from the queue", async () => {
    await enqueue("upsert_book", {});
    await enqueue("upsert_review", {});
    const result = await flushQueue(async () => true);
    expect(result).toEqual({ flushed: 2, failed: 0 });
    expect(await hasPendingOperations()).toBe(false);
  });

  it("increments retry count when executor returns false", async () => {
    await enqueue("upsert_book", {});
    const result = await flushQueue(async () => false);
    expect(result).toEqual({ flushed: 0, failed: 1 });
    const [op] = await getPendingOperations();
    expect(op.retries).toBe(1);
    expect(op.lastError).toBe("executor returned false");
  });

  it("catches executor exceptions and records the message", async () => {
    await enqueue("upsert_book", {});
    const result = await flushQueue(async () => {
      throw new Error("Supabase unreachable");
    });
    expect(result).toEqual({ flushed: 0, failed: 1 });
    const [op] = await getPendingOperations();
    expect(op.lastError).toBe("Supabase unreachable");
  });

  it("passes the correct operation object to the executor", async () => {
    const payload = { id: "b-42", title: "The Hobbit" };
    await enqueue("upsert_book", payload);
    const received: QueuedOperation[] = [];
    await flushQueue(async (op) => {
      received.push(op);
      return true;
    });
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("upsert_book");
    expect(received[0].payload).toEqual(payload);
  });

  it("handles a mix of successful and failed operations", async () => {
    await enqueue("upsert_book", { id: "b-1" });
    await enqueue("upsert_session", { id: "s-1" });
    await enqueue("upsert_review", { id: "r-1" });
    let calls = 0;
    // First succeeds, next two fail
    const result = await flushQueue(async () => ++calls === 1);
    expect(result.flushed).toBe(1);
    expect(result.failed).toBe(2);
    // Two failed ops still in queue
    expect(await getPendingOperations()).toHaveLength(2);
  });

  it("leaves queue unchanged when all operations fail", async () => {
    await enqueue("upsert_book", {});
    await enqueue("upsert_review", {});
    await flushQueue(async () => false);
    expect(await getPendingOperations()).toHaveLength(2);
  });
});
